function isLoggedIn(){return!!currentUser}
function requireAuth(){if(!isLoggedIn()){toast(t('loginRequired'));return false}return true}
function setAuthLocked(locked){document.body.classList.toggle('auth-locked',!!locked)}
function renderAuthBox(){
  const sideBox=document.getElementById('authBox');
  const panel=document.getElementById('authPanel');
  if(currentUser){
    const email=currentUser.email||'user';
    if(sideBox)sideBox.innerHTML=`<div class="user"><div class="avatar">${email.slice(0,1).toUpperCase()}</div><div><b>${email}</b><span>${t('accessOk')}</span></div></div><button class="btn small" style="margin-top:10px;width:100%" onclick="logoutUser()">${t('logout')}</button>${sideLangButtons()}`;
    if(panel)panel.innerHTML='';
    return;
  }
  if(sideBox)sideBox.innerHTML=`<div class="auth-title">${t('login')}</div><div class="auth-line">${t('loginHint')}</div>${sideLangButtons()}`;
  if(panel){
    panel.innerHTML=`${langButtons()}<div class="logo">M</div><h2>${t('loginTitle')}</h2><p>${t('loginDesc')}</p><input class="input" id="loginEmail" type="email" placeholder="${t('email')}" autocomplete="email"><input class="input" id="loginPassword" type="password" placeholder="${t('password')}" autocomplete="current-password"><button class="btn primary" onclick="loginUser()">${t('loginButton')}</button><div class="auth-helper"><button class="link-btn" type="button" onclick="showResetPassword()">${t('forgotPassword')}</button></div><div class="auth-error" id="authError"></div><div class="auth-success" id="authSuccess"></div><div class="auth-line">${t('noSignup')}</div>`;
    const email=document.getElementById('loginEmail');
    const pass=document.getElementById('loginPassword');
    if(email)email.onkeydown=e=>{if(e.key==='Enter')pass?.focus()};
    if(pass)pass.onkeydown=e=>{if(e.key==='Enter')loginUser()};
  }
  applyI18n();
}
function showResetPassword(){
  const panel=document.getElementById('authPanel');
  if(!panel)return;
  const existing=document.getElementById('loginEmail')?.value?.trim()||'';
  panel.innerHTML=`${langButtons()}<div class="logo">M</div><h2>${t('resetPassword')}</h2><p>${t('resetDesc')}</p><input class="input" id="resetEmail" type="email" placeholder="${t('email')}" value="${existing}" autocomplete="email"><button class="btn primary" onclick="sendPasswordReset()">${t('sendReset')}</button><div class="auth-error" id="authError"></div><div class="auth-success" id="authSuccess"></div><div class="auth-helper"><button class="link-btn" type="button" onclick="renderAuthBox()">${t('backToLogin')}</button></div>`;
  const email=document.getElementById('resetEmail');
  if(email)email.onkeydown=e=>{if(e.key==='Enter')sendPasswordReset()};
}
async function sendPasswordReset(){
  const email=document.getElementById('resetEmail')?.value?.trim();
  const errBox=document.getElementById('authError');
  const okBox=document.getElementById('authSuccess');
  if(!email){if(errBox)errBox.textContent=t('fillEmailPass');return}
  const{error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:window.location.href.split('#')[0]});
  if(error){if(errBox)errBox.textContent=error.message;console.error(error);return}
  if(errBox)errBox.textContent='';
  if(okBox)okBox.textContent=t('resetSent');
}
function showUpdatePassword(){
  const panel=document.getElementById('authPanel');
  if(panel)panel.innerHTML=`${langButtons()}<div class="logo">M</div><h2>${t('resetPassword')}</h2><p>${t('newPassword')}</p><input class="input" id="newPassword" type="password" placeholder="${t('newPassword')}" autocomplete="new-password"><button class="btn primary" onclick="updatePasswordAfterRecovery()">${t('updatePassword')}</button><div class="auth-error" id="authError"></div><div class="auth-success" id="authSuccess"></div>`;
}
async function updatePasswordAfterRecovery(){
  const password=document.getElementById('newPassword')?.value||'';
  const errBox=document.getElementById('authError');
  const okBox=document.getElementById('authSuccess');
  if(!password||password.length<6){if(errBox)errBox.textContent=t('newPassword');return}
  const{error}=await supabaseClient.auth.updateUser({password});
  if(error){if(errBox)errBox.textContent=error.message;console.error(error);return}
  if(okBox)okBox.textContent=t('passwordUpdated');
  setTimeout(()=>logoutUser(),1200);
}
supabaseClient.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){
    currentUser=session?.user||null;
    setAuthLocked(true);
    showUpdatePassword();
  }
});
async function loginUser(){
  const email=document.getElementById('loginEmail')?.value?.trim();
  const password=document.getElementById('loginPassword')?.value||'';
  const errBox=document.getElementById('authError');
  if(!email||!password){if(errBox)errBox.textContent=t('fillEmailPass');return}
  const{data:authData,error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error){if(errBox)errBox.textContent=t('wrongLogin');console.error(error);return}
  currentUser=authData?.user||null;
  setAuthLocked(false);
  renderAuthBox();
  await startAppAfterLogin();
  toast(t('loggedIn'));
}
async function logoutUser(){
  await supabaseClient.auth.signOut();
  currentUser=null;
  if(materialsSubscription){await supabaseClient.removeChannel(materialsSubscription);materialsSubscription=null}
  data.materials=[];
  setAuthLocked(true);
  renderAuthBox();
  toast(t('loggedOut'));
}
function showLoginRequired(){
  const box=document.getElementById('stockTable');
  if(box)box.innerHTML=`<div class="login-lock"><b>${t('loginTitle')}</b>${t('loginDesc')}</div>`;
}
async function checkSession(){
  const{data:{session}}=await supabaseClient.auth.getSession();
  currentUser=session?.user||null;
  renderAuthBox();
  if(currentUser){setAuthLocked(false);await startAppAfterLogin()}else setAuthLocked(true);
}

/* v6.28: one-screen Apple foam flow */
(function(){
  const VERSION_LABEL='v6.28 - Apple Foam Flow';
  let foamState='stock';

  const esc=v=>typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null};
  const formatOf=()=>document.getElementById('foamKind')?.value==='sheet'?'sheet':'part';
  const unitFor=format=>format==='sheet'?'sheet':'part';
  const qtyLabel=format=>format==='sheet'?'листов':'шт';
  const stateFrom=(found,attrs)=>attrs.status||(attrs.purchaseStatus==='ordered'?'ordered':(Number(found?.quantity||0)>0||attrs.storageLocation?'stock':'card'));

  function applyVersion(){document.querySelectorAll('.product-footer b,.version-badge').forEach(el=>el.textContent=VERSION_LABEL)}

  function openFormatChoice(){
    const body=`<div style="padding:12px 0 6px;text-align:center"><h3 style="margin:0 0 8px;font-size:24px">Как хранится поролон?</h3><p class="muted" style="margin:0 0 22px">Выберите один вариант. Остальное настроится автоматически.</p><div class="category-picker" style="grid-template-columns:repeat(2,minmax(0,1fr))"><button class="category-card" type="button" onclick="chooseFoamFormat('sheet')"><div class="cat-ico">▱</div><div><b>Листы</b><span>Учёт целыми листами</span></div><span style="margin-left:auto;font-size:25px;color:#8b92a0">›</span></button><button class="category-card" type="button" onclick="chooseFoamFormat('part')"><div class="cat-ico">◇</div><div><b>Детали</b><span>Учёт отдельными штуками</span></div><span style="margin-left:auto;font-size:25px;color:#8b92a0">›</span></button></div></div>`;
    openModal(t('addFoamTitle'),body,`<button class="btn" onclick="closeModal()">${t('cancel')}</button>`);
  }

  window.chooseFoamFormat=function(format){
    const original=window.__foamOriginalOpen;
    if(typeof original!=='function')return;
    original(null);
    setTimeout(()=>patchFoamForm(null,format==='sheet'?'sheet':'part'),0);
  };

  function stateCards(){
    return `<div class="material-state-cards"><button class="material-state-card" type="button" data-foam-state="card" onclick="setFoamCreateState('card')"><b>Только карточка</b><span>Создать без остатка.</span></button><button class="material-state-card" type="button" data-foam-state="ordered" onclick="setFoamCreateState('ordered')"><b>Заказано</b><span>Материал ещё не пришёл.</span></button><button class="material-state-card" type="button" data-foam-state="stock" onclick="setFoamCreateState('stock')"><b>На складе</b><span>Материал уже на складе.</span></button></div>`;
  }

  function statusBlock(found,attrs){
    const format=formatOf();
    const label=qtyLabel(format);
    const stock=attrs.stockQty??found?.quantity??0;
    const min=attrs.minStockQty??found?.minQuantity??0;
    const ordered=attrs.orderedQty??0;
    const date=attrs.arrivalDate||attrs.receiptDate||attrs.expectedReceiptDate||(typeof today==='function'?today():new Date().toISOString().slice(0,10));
    return `<div class="field full" id="foamStateSection"><h4 style="margin:0 0 12px">Состояние материала</h4>${stateCards()}<input id="foamStatus" type="hidden" value="${foamState}"><input id="foamPurchaseStatus" type="hidden" value="${foamState==='ordered'?'ordered':(foamState==='stock'?'instock':'noorder')}"><div class="form-grid hidden" id="foamOrderedFields"><div class="field"><label id="foamOrderedQtyLabel">Заказано, ${label}</label><input id="foamOrderedQty" type="number" min="0" step="1" class="input" value="${esc(ordered)}"></div><div class="field"><label>Ожидаемая дата поступления</label><input id="foamExpectedDate" type="date" class="input" value="${esc(date)}"></div><div class="field full"><label>№ закупки / поставщик / комментарий</label><input id="foamPurchaseOrderInfo" class="input" value="${esc(attrs.purchaseOrderInfo||attrs.purchaseNote||attrs.order||'')}" placeholder="PO-102 · Supplier · комментарий"></div></div><div class="form-grid hidden" id="foamStockFields"><div class="field"><label id="foamQtyLabel">На складе, ${label}</label><input id="foamQty" type="number" min="0" step="1" class="input" value="${esc(stock)}"></div><div class="field"><label id="foamMinLabel">Мин. остаток, ${label}</label><input id="foamMin" type="number" min="0" step="1" class="input" value="${esc(min)}"></div><div class="field"><label>Место хранения</label><input id="foamStorageLocation" class="input" value="${esc(attrs.storageLocation||'')}" placeholder="Стеллаж / зона"></div><div class="field"><label id="foamPriceLabel">Цена закупки, ${format==='sheet'?'за лист':'за деталь'}</label><input id="foamPurchasePrice" type="number" min="0" step="0.01" class="input" value="${esc(attrs.purchasePrice||'')}"></div><div class="field"><label>Дата поступления</label><input id="foamArrivalDate" type="date" class="input" value="${esc(date)}"></div></div><input id="foamReserved" type="hidden" value="${esc(attrs.reservedQty||0)}"></div>`;
  }

  function updateStatusUi(){
    document.querySelectorAll('[data-foam-state]').forEach(card=>card.classList.toggle('active',card.dataset.foamState===foamState));
    document.getElementById('foamOrderedFields')?.classList.toggle('hidden',foamState!=='ordered');
    document.getElementById('foamStockFields')?.classList.toggle('hidden',foamState!=='stock');
    const status=document.getElementById('foamStatus');
    if(status)status.value=foamState;
    const purchase=document.getElementById('foamPurchaseStatus');
    if(purchase)purchase.value=foamState==='ordered'?'ordered':(foamState==='stock'?'instock':'noorder');
  }
  window.setFoamCreateState=function(state){foamState=['card','ordered','stock'].includes(state)?state:'stock';updateStatusUi()};

  function patchFoamForm(id,forcedFormat=''){
    const wizard=document.querySelector('.material-wizard');
    if(!wizard||!document.getElementById('foamSku'))return;
    const found=id?data.materials.find(x=>String(x.id)===String(id)):null;
    const attrs=found?.attributes||{};
    const format=forcedFormat||attrs.format||(attrs.foamKind==='sheet'?'sheet':'part');
    const kind=document.getElementById('foamKind');
    if(kind){kind.value=format;const field=kind.closest('.field');if(field)field.style.display='none'}
    const unit=document.getElementById('foamUnit');
    if(unit)unit.value=unitFor(format);

    foamState=stateFrom(found,attrs);
    if(!id&&!attrs.status)foamState='stock';

    const step1=wizard.querySelector('.material-wizard-step[data-step="1"]');
    const step2=wizard.querySelector('.material-wizard-step[data-step="2"]');
    const step3=wizard.querySelector('.material-wizard-step[data-step="3"]');
    const mainGrid=step1?.querySelector('.form-grid');
    if(!step1||!mainGrid||!step3)return;

    if(format==='sheet'){
      ['foamWidth','foamLength','foamHeight'].forEach(fieldId=>{
        const el=document.getElementById(fieldId);
        const node=el?.closest('.field');
        if(node)mainGrid.appendChild(node);
      });
      const w=document.getElementById('foamWidth')?.closest('.field')?.querySelector('label');
      const l=document.getElementById('foamLength')?.closest('.field')?.querySelector('label');
      const h=document.getElementById('foamHeight')?.closest('.field')?.querySelector('label');
      if(w)w.textContent='Ширина листа, мм';
      if(l)l.textContent='Длина листа, мм';
      if(h)h.textContent='Толщина, мм';
    }else{
      ['foamWidth','foamLength','foamHeight'].forEach(fieldId=>document.getElementById(fieldId)?.closest('.field')?.remove());
    }

    document.getElementById('foamSheetCount')?.closest('.field')?.remove();
    document.getElementById('foamDetailCount')?.closest('.field')?.remove();
    document.getElementById('foamCalcPreview')?.remove();
    document.getElementById('foamTags')?.closest('.field')?.remove();

    const pdfField=step3.querySelector('#foamPdf')?.closest('.field');
    mainGrid.insertAdjacentHTML('afterend',statusBlock(found,attrs));
    if(pdfField)step1.appendChild(pdfField);

    step2?.remove();
    step3.remove();
    wizard.querySelector('.wizard-steps')?.remove();
    step1.querySelector('h4').textContent=format==='sheet'?'Данные листа':'Данные детали';
    step1.classList.remove('hidden');
    wizard.dataset.step='1';

    const footer=document.getElementById('modalFoot');
    if(footer)footer.innerHTML=`<button class="btn primary" id="materialWizardSave" type="button" onclick="saveFoamMaterial('${id||''}')">${t('save')}</button>`;
    const modalBack=document.getElementById('modalBackBtn');
    if(modalBack)modalBack.onclick=()=>{if(id)closeModal();else openFormatChoice()};
    updateStatusUi();
  }

  function readNonNegative(id,integer=false){
    const el=document.getElementById(id);
    if(!el)return 0;
    if(el.value==='')return 0;
    const value=num(el.value);
    if(value===null||value<0||(integer&&!Number.isInteger(value)))return null;
    return value;
  }

  async function saveFoamV628(id=''){
    if(!requireAuth())return;
    let sku=(document.getElementById('foamSku')?.value||'').trim();
    if(!sku||sku==='DET.'){toast(t('enterSkuMsg'));return}
    if(!sku.startsWith('DET.'))sku='DET.'+sku;
    const format=formatOf();
    const status=document.getElementById('foamStatus')?.value||foamState;
    const width=format==='sheet'?readNonNegative('foamWidth'):undefined;
    const length=format==='sheet'?readNonNegative('foamLength'):undefined;
    const thickness=format==='sheet'?readNonNegative('foamHeight'):undefined;
    const stockQty=status==='stock'?readNonNegative('foamQty',true):0;
    const orderedQty=status==='ordered'?readNonNegative('foamOrderedQty',true):0;
    const minStockQty=status==='stock'?readNonNegative('foamMin',true):0;
    const purchasePrice=status==='stock'?readNonNegative('foamPurchasePrice'):undefined;
    if([width,length,thickness,stockQty,orderedQty,minStockQty,purchasePrice].some(v=>v===null)){
      toast('Значения не могут быть отрицательными. Количество должно быть целым числом.');
      return;
    }
    const oldMaterial=id?data.materials.find(x=>String(x.id)===String(id)):null;
    const oldAttrs=oldMaterial?.attributes||{};
    const pdfData=await uploadFoamPdfToSupabase(sku,oldAttrs);
    if(!pdfData)return;
    const grade=(document.getElementById('foamGrade')?.value||'').trim();
    const storageLocation=status==='stock'?(document.getElementById('foamStorageLocation')?.value||'').trim()||null:null;
    const arrivalDate=status==='stock'?(document.getElementById('foamArrivalDate')?.value||null):(status==='ordered'?(document.getElementById('foamExpectedDate')?.value||null):null);
    const purchaseOrderInfo=status==='ordered'?(document.getElementById('foamPurchaseOrderInfo')?.value||'').trim()||null:null;
    const unit=unitFor(format);
    const attrs={
      ...oldAttrs,format,status,width_mm:format==='sheet'?width:null,length_mm:format==='sheet'?length:null,thickness_mm:format==='sheet'?thickness:null,
      stockQty,minStockQty,stockSheets:format==='sheet'?stockQty:null,stockParts:format==='part'?stockQty:null,
      storageLocation,purchasePrice:status==='stock'?purchasePrice:null,arrivalDate,purchaseOrderInfo,
      pdfUrl:pdfData.pdfUrl||oldAttrs.pdfUrl||null,pdfName:pdfData.pdfName||oldAttrs.pdfName||'',pdfPath:pdfData.pdfPath||oldAttrs.pdfPath||'',
      grade,foamKind:format==='sheet'?'sheet':'detail',
      width:format==='sheet'?String(width):'',length:format==='sheet'?String(length):'',height:format==='sheet'?String(thickness):'',thickness:format==='sheet'?String(thickness):'',
      purchaseStatus:status==='ordered'?'ordered':(status==='stock'?'instock':'noorder'),
      orderedQty,reservedQty:Number(oldAttrs.reservedQty||0),supplier:null,order:purchaseOrderInfo
    };
    const obj={id:id||null,sku,name:[categoryLabel('Поролон'),grade].filter(Boolean).join(' · '),category:'Поролон',subcategory:'',attributes:attrs,unit,quantity:status==='stock'?stockQty:0,minQuantity:minStockQty,lastUpdated:today()};
    const ok=id?await updateMaterialInSupabase(obj):await insertMaterialToSupabase(obj);
    if(!ok)return;
    if(id){closeModal();await loadMaterialsFromSupabase();renderAll();toast(t('savedMaterial'));return}
    await finishMaterialSaveAndReturn(sku,'Поролон');
  }

  window.addEventListener('load',()=>{
    applyVersion();
    const original=window.openFoamModal;
    if(typeof original==='function'){
      window.__foamOriginalOpen=original;
      window.openFoamModal=function(id=null){
        if(id){const result=original(id);setTimeout(()=>patchFoamForm(id),0);return result}
        openFormatChoice();
      };
    }
    window.saveFoamMaterial=saveFoamV628;
  });
  document.addEventListener('DOMContentLoaded',applyVersion);
})();