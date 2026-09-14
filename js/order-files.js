// v7.59: файлы заказа (фото, PDF, документы) — хранятся в Supabase Storage зашифрованными
// (AES-256-GCM, Web Crypto API) отдельным паролем от заказчика — НЕ паролем входа на сайт.
//
// Почему так: пользователь явно попросил защиту, которая держит даже при взломе/утечке самой
// базы/хранилища — значит, недостаточно просто спрятать файл за приватным bucket'ом (это защищает
// только от "случайно попало в интернет", но не от "кто-то добрался до Supabase напрямую"). Пароль
// нигде не хранится — ни в открытом, ни в хешированном виде, которого хватило бы для расшифровки.
// Вместо этого ключ шифрования каждый раз заново вычисляется из пароля (PBKDF2 → AES-GCM key),
// а в базе лежит только соль и маленький "проверочный" зашифрованный текст (чтобы отличить неверный
// пароль от повреждённых данных, не имея возможности восстановить сам пароль или ключ из них).
//
// ВАЖНО и без права на ошибку: если этот пароль забыт — все файлы, зашифрованные им, теряются
// НАВСЕГДА. Восстановить нечем: ни в коде, ни в базе нет ничего, что позволило бы расшифровать без
// пароля — иначе защита была бы бессмысленной. Пользователь предупреждён явно перед тем, как это
// вообще стали делать (см. переписку/changelog v7.59).
(function(){
  const VAULT_MAGIC='MOLM-VAULT-OK-v1';
  const VAULT_SYNC_ARTICLE='__FURNICORE_VAULT__';
  const ORDER_FILES_BUCKET='order-files';
  const ORDER_FILE_MAX_SIZE=25*1024*1024; // 25 МБ — разумный предел для шифрования/загрузки в браузере

  let vaultSyncRowId='';
  let vaultConfig=null; // {salt,verifyIv,verifyCipher} — только соль и проверочный блок, не пароль и не ключ
  let vaultKey=null; // CryptoKey, только в памяти этой вкладки — исчезает при перезагрузке страницы
  let vaultResolve=null;

  function isVaultSyncRow(row){return String(row?.article||'')===VAULT_SYNC_ARTICLE}
  function applyVaultSyncRow(row){vaultConfig=row?.attributes?.vault||null;vaultSyncRowId=row?.id||vaultSyncRowId}
  window.isVaultSyncRow=isVaultSyncRow;
  window.applyVaultSyncRow=applyVaultSyncRow;

  async function saveVaultConfig(config){
    if(typeof canWriteSupabase==='function'&&!canWriteSupabase()){toast(t('vaultLocalModeError'));return false}
    try{
      const payload={article:VAULT_SYNC_ARTICLE,name:'MOLM Vault Sync',category:'__system__',subcategory:'vault',quantity:0,unit:'',min_quantity:0,attributes:{vault:config,updatedAt:new Date().toISOString()}};
      if(vaultSyncRowId){
        const {error}=await supabaseClient.from('materials').update(payload).eq('id',vaultSyncRowId);
        if(error)throw error;
      }else{
        const {data:rows,error}=await supabaseClient.from('materials').insert(payload).select('id').limit(1);
        if(error)throw error;
        vaultSyncRowId=rows?.[0]?.id||'';
      }
      vaultConfig=config;
      return true;
    }catch(e){console.error('saveVaultConfig failed',e);return false}
  }

  // ---- Web Crypto helpers ----
  function bufFromB64(b64){const bin=atob(b64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return arr.buffer}
  function b64FromBuf(buf){let bin='';new Uint8Array(buf).forEach(b=>bin+=String.fromCharCode(b));return btoa(bin)}
  async function deriveVaultKey(password,saltBytes){
    const enc=new TextEncoder();
    const baseKey=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt:saltBytes,iterations:150000,hash:'SHA-256'},baseKey,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function vaultSetupWithPassword(password){
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const key=await deriveVaultKey(password,salt);
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const cipherBuf=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(VAULT_MAGIC));
    const ok=await saveVaultConfig({salt:b64FromBuf(salt),verifyIv:b64FromBuf(iv),verifyCipher:b64FromBuf(cipherBuf)});
    if(ok)vaultKey=key;
    return ok;
  }
  async function vaultUnlockWithPassword(password){
    if(!vaultConfig)return false;
    try{
      const salt=new Uint8Array(bufFromB64(vaultConfig.salt));
      const key=await deriveVaultKey(password,salt);
      const iv=new Uint8Array(bufFromB64(vaultConfig.verifyIv));
      const plainBuf=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,bufFromB64(vaultConfig.verifyCipher));
      if(new TextDecoder().decode(plainBuf)!==VAULT_MAGIC)return false;
      vaultKey=key;
      return true;
    }catch(e){return false} // неверный пароль → AES-GCM не расшифрует (тег не сойдётся) → сюда же
  }
  async function vaultEncryptBytes(key,arrayBuffer){
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const cipherBuf=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,arrayBuffer);
    return {ivB64:b64FromBuf(iv),cipherBuf};
  }
  async function vaultDecryptBytes(key,ivB64,arrayBuffer){
    const iv=new Uint8Array(bufFromB64(ivB64));
    return crypto.subtle.decrypt({name:'AES-GCM',iv},key,arrayBuffer);
  }

  // ---- UI: запрос/создание пароля хранилища ----
  function requireVaultKey(){
    if(vaultKey)return Promise.resolve(vaultKey);
    return new Promise(resolve=>{
      vaultResolve=resolve;
      if(!vaultConfig)openVaultSetupModal();else openVaultUnlockModal();
    });
  }
  function finishVaultPrompt(key){closeModal();const resolve=vaultResolve;vaultResolve=null;if(resolve)resolve(key)}
  window.cancelVaultPrompt=function(){finishVaultPrompt(null)};

  function openVaultSetupModal(){
    const body=`<div class="vault-modal">
      <p class="danger-text">${escapeHtml(t('vaultSetupWarning'))}</p>
      <div class="field"><label>${escapeHtml(t('vaultNewPasswordLabel'))}</label><input id="vaultPass1" type="password" class="input" autocomplete="new-password"></div>
      <div class="field"><label>${escapeHtml(t('vaultConfirmPasswordLabel'))}</label><input id="vaultPass2" type="password" class="input" autocomplete="new-password"></div>
      <div class="auth-error" id="vaultSetupError"></div>
    </div>`;
    openModal(t('vaultSetupTitle'),body,`<button class="btn" type="button" onclick="cancelVaultPrompt()">${escapeHtml(t('cancel'))}</button><button class="btn primary" type="button" onclick="confirmVaultSetup()">${escapeHtml(t('vaultCreateBtn'))}</button>`);
  }
  window.confirmVaultSetup=async function(){
    const p1=document.getElementById('vaultPass1')?.value||'';
    const p2=document.getElementById('vaultPass2')?.value||'';
    const err=document.getElementById('vaultSetupError');
    if(p1.length<8){if(err)err.textContent=t('vaultPasswordTooShort');return}
    if(p1!==p2){if(err)err.textContent=t('vaultPasswordMismatch');return}
    const btn=document.querySelector('.modal-foot .btn.primary');if(btn)btn.disabled=true;
    const ok=await vaultSetupWithPassword(p1);
    if(btn)btn.disabled=false;
    if(!ok){if(err)err.textContent=t('vaultSaveError');return}
    finishVaultPrompt(vaultKey);
  };
  function openVaultUnlockModal(){
    const body=`<div class="vault-modal"><p class="muted">${escapeHtml(t('vaultUnlockHint'))}</p><input id="vaultUnlockPass" type="password" class="input" autocomplete="current-password" placeholder="${escapeHtml(t('vaultPasswordPlaceholder'))}"><div class="auth-error" id="vaultUnlockError"></div></div>`;
    openModal(t('vaultUnlockTitle'),body,`<button class="btn" type="button" onclick="cancelVaultPrompt()">${escapeHtml(t('cancel'))}</button><button class="btn primary" type="button" onclick="confirmVaultUnlock()">${escapeHtml(t('vaultUnlockBtn'))}</button>`);
    setTimeout(()=>{
      const input=document.getElementById('vaultUnlockPass');
      input?.focus();
      input?.addEventListener('keydown',e=>{if(e.key==='Enter')confirmVaultUnlock()});
    },0);
  }
  window.confirmVaultUnlock=async function(){
    const pass=document.getElementById('vaultUnlockPass')?.value||'';
    const err=document.getElementById('vaultUnlockError');
    const btn=document.querySelector('.modal-foot .btn.primary');if(btn)btn.disabled=true;
    const ok=await vaultUnlockWithPassword(pass);
    if(btn)btn.disabled=false;
    if(!ok){if(err)err.textContent=t('vaultWrongPassword');document.getElementById('vaultUnlockPass')?.select();return}
    finishVaultPrompt(vaultKey);
  };

  // ---- UI: список файлов заказа ----
  function fileSizeText(bytes){
    const n=Number(bytes||0);
    if(n<1024)return `${n} B`;
    if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`;
    return `${(n/1024/1024).toFixed(1)} MB`;
  }
  function orderFileIcon(mime){
    const m=String(mime||'');
    if(m.startsWith('image/'))return '🖼️';
    if(m==='application/pdf')return '📄';
    if(m.includes('word')||m.includes('document'))return '📝';
    if(m.includes('sheet')||m.includes('excel'))return '📊';
    return '📎';
  }
  function orderFilesListHtml(o){
    const files=Array.isArray(o?.files)?o.files:[];
    if(!files.length)return `<div class="order-files-empty muted">${escapeHtml(t('orderFilesEmpty'))}</div>`;
    return `<div class="order-file-list">${files.map(f=>`<div class="order-file-row" data-file-id="${escapeHtml(f.id)}">
      <span class="order-file-icon">${orderFileIcon(f.mimeType)}</span>
      <span class="order-file-info"><b>${escapeHtml(f.name)}</b><small>${escapeHtml(fileSizeText(f.size))} · ${escapeHtml(f.uploadedBy||'—')}</small></span>
      <button class="btn small" type="button" onclick="openOrderFile('${escapeHtml(o.id)}','${escapeHtml(f.id)}')">${escapeHtml(t('orderFilesOpenBtn'))}</button>
      <button class="btn small danger" type="button" onclick="deleteOrderFile('${escapeHtml(o.id)}','${escapeHtml(f.id)}')">×</button>
    </div>`).join('')}</div>`;
  }
  function orderFilesSectionHtml(o){
    if(!o?.id)return `<section class="order-files-box"><h4>📎 ${escapeHtml(t('orderFilesTitle'))}</h4><p class="muted">${escapeHtml(t('orderFilesSaveFirst'))}</p></section>`;
    return `<section class="order-files-box">
      <h4>🔒 ${escapeHtml(t('orderFilesTitle'))}</h4>
      <p class="muted small">${escapeHtml(t('orderFilesHint'))}</p>
      <div id="orderFilesList">${orderFilesListHtml(o)}</div>
      <label class="btn small">${escapeHtml(t('orderFilesUploadBtn'))}<input id="orderFileInput" type="file" multiple style="display:none" onchange="handleOrderFileUpload(event,'${escapeHtml(o.id)}')"></label>
    </section>`;
  }
  window.orderFilesSectionHtml=orderFilesSectionHtml;
  function refreshOrderFilesUi(orderId){
    const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));
    const list=document.getElementById('orderFilesList');
    if(list&&o)list.innerHTML=orderFilesListHtml(o);
  }

  window.handleOrderFileUpload=async function(event,orderId){
    const input=event.target;
    const files=Array.from(input.files||[]);
    input.value='';
    if(!files.length)return;
    const key=await requireVaultKey();
    if(!key)return;
    const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));
    if(!o)return;
    if(!Array.isArray(o.files))o.files=[];
    let uploadedAny=false;
    for(const file of files){
      if(file.size>ORDER_FILE_MAX_SIZE){toast(`${file.name}: ${t('orderFileTooBig')}`);continue}
      try{
        toast(`${t('orderFilesUploading')}: ${file.name}`);
        const buf=await file.arrayBuffer();
        const {ivB64,cipherBuf}=await vaultEncryptBytes(key,buf);
        const fileId=(typeof uid==='function'?uid():String(Date.now()+Math.random()));
        const safeName=(typeof cleanStoragePart==='function'?cleanStoragePart(file.name):String(file.name||'file').replace(/[^a-zA-Z0-9._-]+/g,'_'));
        const path=`orders/${orderId}/${fileId}_${safeName}.enc`;
        const {error}=await supabaseClient.storage.from(ORDER_FILES_BUCKET).upload(path,new Blob([cipherBuf]),{cacheControl:'3600',upsert:false,contentType:'application/octet-stream'});
        if(error)throw error;
        o.files.push({id:fileId,name:file.name,mimeType:file.type||'application/octet-stream',size:file.size,path,iv:ivB64,uploadedBy:(currentUser?.email||''),uploadedAt:new Date().toISOString()});
        uploadedAny=true;
      }catch(e){console.error('order file upload failed',e);toast(`${t('orderFileUploadError')}: ${file.name}`);}
    }
    if(uploadedAny){
      save();
      if(typeof auditAdd==='function')auditAdd('order_file_added','order',o.id,o.number,`${t('orderFilesUploaded')}: ${files.map(f=>f.name).join(', ')}`);
      toast(t('orderFilesUploaded'));
    }
    refreshOrderFilesUi(orderId);
  };

  window.openOrderFile=async function(orderId,fileId){
    const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));
    const f=o?.files?.find(x=>String(x.id)===String(fileId));
    if(!f)return;
    const key=await requireVaultKey();
    if(!key)return;
    try{
      const {data:blob,error}=await supabaseClient.storage.from(ORDER_FILES_BUCKET).download(f.path);
      if(error)throw error;
      const cipherBuf=await blob.arrayBuffer();
      const plainBuf=await vaultDecryptBytes(key,f.iv,cipherBuf);
      const outBlob=new Blob([plainBuf],{type:f.mimeType||'application/octet-stream'});
      const url=URL.createObjectURL(outBlob);
      if(String(f.mimeType||'').startsWith('image/')||f.mimeType==='application/pdf'){
        window.open(url,'_blank');
      }else{
        const a=document.createElement('a');
        a.href=url;a.download=f.name;document.body.appendChild(a);a.click();a.remove();
      }
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(e){
      console.error('order file open failed',e);
      toast(t('orderFileOpenError'));
    }
  };

  window.deleteOrderFile=async function(orderId,fileId){
    const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));
    const f=o?.files?.find(x=>String(x.id)===String(fileId));
    if(!o||!f)return;
    if(!confirm(t('orderFileDeleteConfirm').replace('{name}',f.name)))return;
    try{ await supabaseClient.storage.from(ORDER_FILES_BUCKET).remove([f.path]); }catch(e){console.warn('order file storage remove failed',e)}
    o.files=(o.files||[]).filter(x=>String(x.id)!==String(fileId));
    save();
    if(typeof auditAdd==='function')auditAdd('order_file_deleted','order',o.id,o.number,`${t('orderFileDeleted')}: ${f.name}`);
    refreshOrderFilesUi(orderId);
    toast(t('orderFileDeleted'));
  };
})();
