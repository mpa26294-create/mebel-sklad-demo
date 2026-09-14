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
  let vaultResolve=null;
  // v7.60: по просьбе пользователя ключ шифрования НИГДЕ не кэшируется между открытиями файлов —
  // пароль запрашивается каждый раз заново (раньше он держался в памяти до перезагрузки вкладки).
  // Также: черновик нового (ещё не сохранённого) заказа — файлы можно прикреплять до первого
  // "Сохранить" (см. startOrderFileDraft/consumePendingOrderFiles, используются в js/orders.js).
  let orderDraftId='';
  let pendingOrderFiles=[];
  function startOrderFileDraft(){orderDraftId=(typeof uid==='function'?uid():String(Date.now()));pendingOrderFiles=[];return orderDraftId}
  function consumePendingOrderFiles(matchId){
    if(matchId&&matchId===orderDraftId){const files=pendingOrderFiles;orderDraftId='';pendingOrderFiles=[];return files}
    return [];
  }
  window.startOrderFileDraft=startOrderFileDraft;
  window.consumePendingOrderFiles=consumePendingOrderFiles;

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
  // v7.63: вынесено из vaultSetupWithPassword — считает новую пару "ключ+конфиг" из пароля, но
  // НИЧЕГО не сохраняет и не трогает текущий активный пароль. Нужно для смены пароля (см. ниже):
  // сначала все файлы перешифровываются новым ключом, и только когда это гарантированно удалось,
  // новый конфиг сохраняется как активный — так старый пароль/файлы не ломаются при сбое на полпути.
  async function vaultDeriveNewConfig(password){
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const key=await deriveVaultKey(password,salt);
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const cipherBuf=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(VAULT_MAGIC));
    return {key,config:{salt:b64FromBuf(salt),verifyIv:b64FromBuf(iv),verifyCipher:b64FromBuf(cipherBuf)}};
  }
  async function vaultSetupWithPassword(password){
    const {key,config}=await vaultDeriveNewConfig(password);
    const ok=await saveVaultConfig(config);
    return ok?key:null;
  }
  async function vaultUnlockWithPassword(password){
    if(!vaultConfig)return null;
    try{
      const salt=new Uint8Array(bufFromB64(vaultConfig.salt));
      const key=await deriveVaultKey(password,salt);
      const iv=new Uint8Array(bufFromB64(vaultConfig.verifyIv));
      const plainBuf=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,bufFromB64(vaultConfig.verifyCipher));
      if(new TextDecoder().decode(plainBuf)!==VAULT_MAGIC)return null;
      return key;
    }catch(e){return null} // неверный пароль → AES-GCM не расшифрует (тег не сойдётся) → сюда же
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

  // ---- UI: запрос/создание пароля хранилища (без кэширования — см. комментарий выше) ----
  // v7.62: пароль хранилища задаёт ТОЛЬКО администратор (NOTIFICATION_ADMIN_EMAIL, см. js/orders.js),
  // а не тот, кто первым откроет/загрузит зашифрованный файл — по просьбе пользователя: пароль
  // должен выдавать он сам, а не создаваться случайно кем-то из сотрудников. Если пароль ещё не
  // задан и это не админ — показываем сообщение "обратитесь к администратору" вместо формы создания.
  function requireVaultKey(){
    return new Promise(resolve=>{
      vaultResolve=resolve;
      if(!vaultConfig){
        const isAdmin=typeof isNotificationAdmin==='function'&&isNotificationAdmin();
        if(isAdmin)openVaultSetupModal();else openVaultNotConfiguredModal();
      }else openVaultUnlockModal();
    });
  }
  // v7.60-fix: окно пароля почти всегда открывается ПОВЕРХ уже открытой формы заказа — у сайта
  // один общий modalBackdrop, а не стек отдельных окон, так что обычный openModal()/closeModal()
  // здесь стирал бы форму заказа под собой. pushModalState() перед показом запоминает её, а
  // goBackModal() (вместо closeModal()) возвращает как было — вместе с уже введёнными в форме
  // значениями (см. pushModalState() в index.html — он сохраняет их тоже).
  function finishVaultPrompt(key){
    if(typeof goBackModal==='function')goBackModal();else closeModal();
    const resolve=vaultResolve;vaultResolve=null;if(resolve)resolve(key)
  }
  window.cancelVaultPrompt=function(){finishVaultPrompt(null)};

  function openVaultSetupModal(){
    if(typeof pushModalState==='function')pushModalState();
    const body=`<div class="vault-modal">
      <p class="danger-text">${escapeHtml(t('vaultSetupWarning'))}</p>
      <div class="field"><label>${escapeHtml(t('vaultNewPasswordLabel'))}</label><input id="vaultPass1" type="password" class="input" autocomplete="new-password"></div>
      <div class="field"><label>${escapeHtml(t('vaultConfirmPasswordLabel'))}</label><input id="vaultPass2" type="password" class="input" autocomplete="new-password"></div>
      <div class="auth-error" id="vaultSetupError"></div>
    </div>`;
    openModal(t('vaultSetupTitle'),body,`<button class="btn" type="button" onclick="cancelVaultPrompt()">${escapeHtml(t('cancel'))}</button><button class="btn primary" type="button" onclick="confirmVaultSetup()">${escapeHtml(t('vaultCreateBtn'))}</button>`);
  }
  function openVaultNotConfiguredModal(){
    if(typeof pushModalState==='function')pushModalState();
    const body=`<div class="vault-modal"><p class="muted">${escapeHtml(t('vaultNotConfiguredMsg'))}</p></div>`;
    openModal(t('vaultNotConfiguredTitle'),body,`<button class="btn primary" type="button" onclick="cancelVaultPrompt()">${escapeHtml(t('gotIt'))}</button>`);
  }
  window.confirmVaultSetup=async function(){
    const p1=document.getElementById('vaultPass1')?.value||'';
    const p2=document.getElementById('vaultPass2')?.value||'';
    const err=document.getElementById('vaultSetupError');
    if(p1.length<8){if(err)err.textContent=t('vaultPasswordTooShort');return}
    if(p1!==p2){if(err)err.textContent=t('vaultPasswordMismatch');return}
    const btn=document.querySelector('.modal-foot .btn.primary');if(btn)btn.disabled=true;
    const key=await vaultSetupWithPassword(p1);
    if(btn)btn.disabled=false;
    if(!key){if(err)err.textContent=t('vaultSaveError');return}
    finishVaultPrompt(key);
  };
  function openVaultUnlockModal(){
    if(typeof pushModalState==='function')pushModalState();
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
    const key=await vaultUnlockWithPassword(pass);
    if(btn)btn.disabled=false;
    if(!key){if(err)err.textContent=t('vaultWrongPassword');document.getElementById('vaultUnlockPass')?.select();return}
    finishVaultPrompt(key);
  };

  // ---- Настройки: смена пароля хранилища (только администратор) ----
  // v7.63: пользователь спросил, как сменить пароль, который был создан первым — раньше это было
  // никак не сделать. Своя смена пароля НЕ похожа на обычный сброс: все уже зашифрованные файлы
  // понимают только старый ключ, так что просто взять и сохранить новый пароль означало бы навсегда
  // потерять доступ к ним. Вместо этого performVaultPasswordChange() сначала расшифровывает все
  // файлы старым паролем, потом зашифровывает их заново новым и только после того, как ВСЕ файлы
  // успешно переписаны, сохраняет новый пароль как активный — старый пароль и все файлы остаются
  // рабочими в точности до этого последнего шага, что бы ни случилось раньше (обрыв связи и т.п.).
  let vaultChangeOldKey=null;
  window.openVaultChangeModal=function(){
    if(typeof pushModalState==='function')pushModalState();
    const body=`<div class="vault-modal"><p class="muted">${escapeHtml(t('vaultChangeCurrentHint'))}</p><input id="vaultChangeOldPass" type="password" class="input" autocomplete="current-password" placeholder="${escapeHtml(t('vaultPasswordPlaceholder'))}"><div class="auth-error" id="vaultChangeError1"></div></div>`;
    openModal(t('vaultChangeTitle'),body,`<button class="btn" type="button" onclick="goBackModal()">${escapeHtml(t('cancel'))}</button><button class="btn primary" type="button" onclick="confirmVaultChangeStep1()">${escapeHtml(t('vaultUnlockBtn'))}</button>`);
  };
  window.confirmVaultChangeStep1=async function(){
    const pass=document.getElementById('vaultChangeOldPass')?.value||'';
    const err=document.getElementById('vaultChangeError1');
    const btn=document.querySelector('.modal-foot .btn.primary');if(btn)btn.disabled=true;
    const oldKey=await vaultUnlockWithPassword(pass);
    if(btn)btn.disabled=false;
    if(!oldKey){if(err)err.textContent=t('vaultWrongPassword');return}
    vaultChangeOldKey=oldKey;
    openVaultChangeStep2Modal();
  };
  function openVaultChangeStep2Modal(){
    const body=`<div class="vault-modal">
      <p class="danger-text">${escapeHtml(t('vaultSetupWarning'))}</p>
      <div class="field"><label>${escapeHtml(t('vaultNewPasswordLabel'))}</label><input id="vaultChangeNew1" type="password" class="input" autocomplete="new-password"></div>
      <div class="field"><label>${escapeHtml(t('vaultConfirmPasswordLabel'))}</label><input id="vaultChangeNew2" type="password" class="input" autocomplete="new-password"></div>
      <div class="auth-error" id="vaultChangeError2"></div>
    </div>`;
    openModal(t('vaultChangeTitle'),body,`<button class="btn" type="button" onclick="goBackModal()">${escapeHtml(t('cancel'))}</button><button class="btn primary" type="button" onclick="confirmVaultChangeStep2()">${escapeHtml(t('vaultChangeBtn'))}</button>`);
  }
  window.confirmVaultChangeStep2=async function(){
    const p1=document.getElementById('vaultChangeNew1')?.value||'';
    const p2=document.getElementById('vaultChangeNew2')?.value||'';
    const err=document.getElementById('vaultChangeError2');
    const oldKey=vaultChangeOldKey;
    if(!oldKey){if(err)err.textContent=t('vaultSaveError');return}
    if(p1.length<8){if(err)err.textContent=t('vaultPasswordTooShort');return}
    if(p1!==p2){if(err)err.textContent=t('vaultPasswordMismatch');return}
    const btn=document.querySelector('.modal-foot .btn.primary');if(btn)btn.disabled=true;
    toast(t('vaultChangeInProgress'));
    const result=await performVaultPasswordChange(oldKey,p1);
    if(btn)btn.disabled=false;
    vaultChangeOldKey=null;
    if(!result.ok){
      const msg=(result.reason==='decryptFailed'||result.reason==='uploadFailed')?`${t('vaultChangeFileError')}: ${result.fileName||''}`:t('vaultSaveError');
      if(err)err.textContent=msg;
      return;
    }
    if(typeof goBackModal==='function')goBackModal();else closeModal();
    toast(t('vaultChangeDone'));
    if(typeof renderVaultPasswordPanel==='function')renderVaultPasswordPanel();
  };
  // Собирает все зашифрованные файлы всех заказов, расшифровывает старым ключом, зашифровывает
  // новым и загружает под НОВЫМИ путями (старые не трогает и не удаляет, пока всё не подтверждено
  // успешным) — так частичный сбой посреди процесса не оставляет файлы в "ни туда ни сюда" виде.
  async function performVaultPasswordChange(oldKey,newPassword){
    const targets=[];
    (data.orders||[]).forEach(o=>{(Array.isArray(o.files)?o.files:[]).forEach(f=>{if(isFileEncrypted(f))targets.push({o,f})})});
    const decrypted=[];
    for(const {o,f} of targets){
      try{
        const {data:blob,error}=await supabaseClient.storage.from(ORDER_FILES_BUCKET).download(f.path);
        if(error)throw error;
        const cipherBuf=await blob.arrayBuffer();
        const plainBuf=await vaultDecryptBytes(oldKey,f.iv,cipherBuf);
        decrypted.push({o,f,plainBuf});
      }catch(e){console.error('vault password change: decrypt failed',f.path,e);return {ok:false,reason:'decryptFailed',fileName:f.name}}
    }
    const {key:newKey,config:newConfig}=await vaultDeriveNewConfig(newPassword);
    const uploaded=[];
    for(const {o,f,plainBuf} of decrypted){
      try{
        const {ivB64,cipherBuf}=await vaultEncryptBytes(newKey,plainBuf);
        const newPath=`orders/${o.id}/${f.id}_${Date.now()}_${Math.random().toString(36).slice(2,8)}.enc`;
        const {error}=await supabaseClient.storage.from(ORDER_FILES_BUCKET).upload(newPath,new Blob([cipherBuf]),{cacheControl:'3600',upsert:false,contentType:'application/octet-stream'});
        if(error)throw error;
        uploaded.push({f,newPath,ivB64,oldPath:f.path});
      }catch(e){console.error('vault password change: re-upload failed',f.path,e);return {ok:false,reason:'uploadFailed',fileName:f.name}}
    }
    // Точка невозврата: конфиг сохраняется ПЕРВЫМ, до правки записей файлов — если тут вдруг
    // оборвётся связь, старые файлы по старым путям/iv останутся нетронутыми и их можно будет
    // перешифровать заново тем же путём, а не потерять half-migrated состояние.
    const savedCfg=await saveVaultConfig(newConfig);
    if(!savedCfg)return {ok:false,reason:'saveConfigFailed'};
    uploaded.forEach(({f,newPath,ivB64})=>{f.path=newPath;f.iv=ivB64});
    save();
    if(typeof persistOrdersToSupabase==='function'){
      try{await persistOrdersToSupabase()}catch(e){console.warn('vault password change: orders sync after rotate failed',e)}
    }
    uploaded.forEach(({oldPath})=>{supabaseClient.storage.from(ORDER_FILES_BUCKET).remove([oldPath]).catch(()=>{})});
    if(typeof auditAdd==='function')auditAdd('vault_password_changed','system','','',t('vaultChangeAuditMsg').replace('{count}',String(uploaded.length)));
    return {ok:true,count:uploaded.length};
  }

  // ---- Настройки: панель "Пароль для файлов заказов" (видна только администратору) ----
  function renderVaultPasswordPanel(){
    const panel=document.getElementById('vaultPasswordPanel');
    if(!panel)return;
    if(typeof isNotificationAdmin!=='function'||!isNotificationAdmin()){panel.style.display='none';panel.innerHTML='';return}
    panel.style.display='';
    const isSet=!!vaultConfig;
    panel.innerHTML=`<h3 style="margin:0 0 8px;display:flex;align-items:center;gap:10px;font-size:18px;font-weight:600;letter-spacing:-.02em;color:#111">🔒 <span>${escapeHtml(t('vaultPanelTitle'))}</span></h3>
      <p class="muted" style="margin:0 0 16px;font-size:13px;line-height:1.45;color:#6b7280">${escapeHtml(isSet?t('vaultPanelHintSet'):t('vaultPanelHintNotSet'))}</p>
      <div class="actions"><button class="btn primary" type="button" onclick="${isSet?'openVaultChangeModal()':'openVaultSetupModal()'}">${escapeHtml(isSet?t('vaultChangeBtn'):t('vaultCreateBtn'))}</button></div>`;
  }
  window.renderVaultPasswordPanel=renderVaultPasswordPanel;
  window.openVaultSetupModal=openVaultSetupModal;

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
  // v7.60: files либо у реального заказа (o.files), либо, для ещё не сохранённого — во временном
  // pendingOrderFiles (id совпадает с orderDraftId). filesFor() — единая точка получения списка для
  // рендера, без разницы, сохранён заказ уже или нет.
  function filesFor(id,o){
    if(o)return Array.isArray(o.files)?o.files:[];
    if(id&&id===orderDraftId)return pendingOrderFiles;
    return [];
  }
  // v7.61: шифрование файла теперь необязательно (галочка при загрузке) — старые записи без поля
  // encrypted считаются зашифрованными (они и были зашифрованы, поле просто ещё не существовало).
  function isFileEncrypted(f){return f?.encrypted!==false}
  function orderFilesListHtml(id,o){
    const files=filesFor(id,o);
    if(!files.length)return `<div class="order-files-empty muted">${escapeHtml(t('orderFilesEmpty'))}</div>`;
    return `<div class="order-file-list">${files.map(f=>{
      const enc=isFileEncrypted(f);
      return `<div class="order-file-row" data-file-id="${escapeHtml(f.id)}">
      <span class="order-file-icon">${orderFileIcon(f.mimeType)}${enc?'🔒':''}</span>
      <span class="order-file-info"><b>${escapeHtml(f.name)}</b><small>${escapeHtml(fileSizeText(f.size))} · ${escapeHtml(f.uploadedBy||'—')}${enc?'':` · ${escapeHtml(t('orderFileNotEncryptedBadge'))}`}</small></span>
      <button class="btn small" type="button" onclick="openOrderFile('${escapeHtml(id)}','${escapeHtml(f.id)}')">${escapeHtml(t('orderFilesOpenBtn'))}</button>
      <button class="btn small danger" type="button" onclick="deleteOrderFile('${escapeHtml(id)}','${escapeHtml(f.id)}')">×</button>
    </div>`;}).join('')}</div>`;
  }
  // targetId нужен для ещё не сохранённого заказа (o тогда null, но черновик уже имеет id — см.
  // startOrderFileDraft() в js/orders.js/openOrderModal). Для сохранённого заказа targetId===o.id.
  // v7.62: canUpload — загружать файлы можно только из формы добавления/редактирования заказа;
  // в карточке просмотра заказа (showOrderInfoModal) секция теперь только показывает список файлов
  // (открыть/скачать), без поля загрузки — по просьбе пользователя, чтобы не путать "посмотреть" и
  // "изменить заказ".
  function orderFilesSectionHtml(o,targetId,canUpload){
    if(canUpload===undefined)canUpload=true;
    const id=o?.id||targetId||'';
    if(!id)return `<section class="order-files-box"><h4>📎 ${escapeHtml(t('orderFilesTitle'))}</h4><p class="muted">${escapeHtml(t('orderFilesSaveFirst'))}</p></section>`;
    return `<section class="order-files-box">
      <h4>🔒 ${escapeHtml(t('orderFilesTitle'))}</h4>
      <p class="muted small">${escapeHtml(t('orderFilesHint'))}</p>
      <div id="orderFilesList">${orderFilesListHtml(id,o)}</div>
      ${canUpload?`<div class="order-file-upload-row">
        <label class="btn small">${escapeHtml(t('orderFilesUploadBtn'))}<input id="orderFileInput" type="file" multiple style="display:none" onchange="handleOrderFileUpload(event,'${escapeHtml(id)}')"></label>
        <label class="order-file-encrypt-toggle"><input id="orderFileEncryptChk" type="checkbox" checked> ${escapeHtml(t('orderFileEncryptLabel'))}</label>
      </div>`:`<p class="muted small">${escapeHtml(t('orderFilesEditToAdd'))}</p>`}
    </section>`;
  }
  window.orderFilesSectionHtml=orderFilesSectionHtml;
  function refreshOrderFilesUi(orderId){
    const o=(data.orders||[]).find(x=>String(x.id)===String(orderId))||null;
    const list=document.getElementById('orderFilesList');
    if(list)list.innerHTML=orderFilesListHtml(orderId,o);
  }

  window.handleOrderFileUpload=async function(event,orderId){
    const input=event.target;
    const files=Array.from(input.files||[]);
    // v7.61: галочка "Шифровать" читается один раз на всю пачку файлов из этой загрузки —
    // не постаили галочку → файл кладётся в приватный bucket как есть, без AES-слоя, и открывается
    // без пароля; постаили (по умолчанию так) → как раньше, полное шифрование общим паролем хранилища.
    const wantEncrypt=document.getElementById('orderFileEncryptChk')?.checked!==false;
    input.value='';
    if(!files.length)return;
    let key=null;
    if(wantEncrypt){
      key=await requireVaultKey();
      if(!key)return;
    }
    // v7.60: заказ мог ещё не быть сохранён — тогда o===null и файлы копятся в pendingOrderFiles
    // (orderId в этом случае — id черновика, см. startOrderFileDraft()); как только заказ реально
    // сохранят, saveManagerOrder() заберёт их через consumePendingOrderFiles().
    const o=(data.orders||[]).find(x=>String(x.id)===String(orderId))||null;
    const targetArr=o?(Array.isArray(o.files)?o.files:(o.files=[])):(orderId===orderDraftId?pendingOrderFiles:null);
    if(!targetArr)return; // ни реального заказа, ни активного черновика с этим id — форма уже закрыта/устарела
    let uploadedAny=false;
    for(const file of files){
      if(file.size>ORDER_FILE_MAX_SIZE){toast(`${file.name}: ${t('orderFileTooBig')}`);continue}
      try{
        toast(`${t('orderFilesUploading')}: ${file.name}`);
        const buf=await file.arrayBuffer();
        let ivB64='',uploadBuf=buf;
        if(wantEncrypt){
          const enc=await vaultEncryptBytes(key,buf);
          ivB64=enc.ivB64;uploadBuf=enc.cipherBuf;
        }
        const fileId=(typeof uid==='function'?uid():String(Date.now()+Math.random()));
        const safeName=(typeof cleanStoragePart==='function'?cleanStoragePart(file.name):String(file.name||'file').replace(/[^a-zA-Z0-9._-]+/g,'_'));
        const path=`orders/${orderId}/${fileId}_${safeName}${wantEncrypt?'.enc':''}`;
        const {error}=await supabaseClient.storage.from(ORDER_FILES_BUCKET).upload(path,new Blob([uploadBuf]),{cacheControl:'3600',upsert:false,contentType:wantEncrypt?'application/octet-stream':(file.type||'application/octet-stream')});
        if(error)throw error;
        targetArr.push({id:fileId,name:file.name,mimeType:file.type||'application/octet-stream',size:file.size,path,iv:ivB64,encrypted:wantEncrypt,uploadedBy:(currentUser?.email||''),uploadedAt:new Date().toISOString()});
        uploadedAny=true;
      }catch(e){console.error('order file upload failed',e);toast(`${t('orderFileUploadError')}: ${file.name}`);}
    }
    if(uploadedAny){
      if(o){
        save();
        if(typeof auditAdd==='function')auditAdd('order_file_added','order',o.id,o.number,`${t('orderFilesUploaded')}: ${files.map(f=>f.name).join(', ')}`);
      }
      toast(t('orderFilesUploaded'));
    }
    refreshOrderFilesUi(orderId);
  };

  // v7.60: пароль спрашивается заново при КАЖДОМ открытии (никакого кэша ключа между файлами — по
  // просьбе пользователя), и результат всегда СКАЧИВАЕТСЯ файлом, а не открывается предпросмотром
  // в новой вкладке (раньше картинки/PDF открывались inline — теперь для всех типов одинаково).
  window.openOrderFile=async function(orderId,fileId){
    const o=(data.orders||[]).find(x=>String(x.id)===String(orderId))||null;
    const f=filesFor(orderId,o).find(x=>String(x.id)===String(fileId));
    if(!f)return;
    // v7.61: незашифрованные файлы скачиваются сразу, без запроса пароля хранилища.
    const enc=isFileEncrypted(f);
    let key=null;
    if(enc){
      key=await requireVaultKey();
      if(!key)return;
    }
    try{
      const {data:blob,error}=await supabaseClient.storage.from(ORDER_FILES_BUCKET).download(f.path);
      if(error)throw error;
      const cipherBuf=await blob.arrayBuffer();
      const plainBuf=enc?await vaultDecryptBytes(key,f.iv,cipherBuf):cipherBuf;
      const outBlob=new Blob([plainBuf],{type:f.mimeType||'application/octet-stream'});
      const url=URL.createObjectURL(outBlob);
      const a=document.createElement('a');
      a.href=url;a.download=f.name;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(e){
      console.error('order file open failed',e);
      toast(t('orderFileOpenError'));
    }
  };

  window.deleteOrderFile=async function(orderId,fileId){
    const o=(data.orders||[]).find(x=>String(x.id)===String(orderId))||null;
    const arr=filesFor(orderId,o);
    const f=arr.find(x=>String(x.id)===String(fileId));
    if(!f)return;
    if(!confirm(t('orderFileDeleteConfirm').replace('{name}',f.name)))return;
    try{ await supabaseClient.storage.from(ORDER_FILES_BUCKET).remove([f.path]); }catch(e){console.warn('order file storage remove failed',e)}
    if(o){
      o.files=(o.files||[]).filter(x=>String(x.id)!==String(fileId));
      save();
      if(typeof auditAdd==='function')auditAdd('order_file_deleted','order',o.id,o.number,`${t('orderFileDeleted')}: ${f.name}`);
    }else if(orderId===orderDraftId){
      pendingOrderFiles=pendingOrderFiles.filter(x=>String(x.id)!==String(fileId));
    }
    refreshOrderFilesUi(orderId);
    toast(t('orderFileDeleted'));
  };
})();
