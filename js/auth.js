function isLoggedIn(){ return !!currentUser; }
function requireAuth(){ if(!isLoggedIn()){ toast(t('loginRequired')); return false; } return true; }
function setAuthLocked(locked){ document.body.classList.toggle('auth-locked', !!locked); }
function renderAuthBox(){
  const sideBox=document.getElementById('authBox');
  const panel=document.getElementById('authPanel');
  if(currentUser){
    const email=currentUser.email || 'user';
    if(sideBox){
      sideBox.innerHTML=`<div class="user"><div class="avatar">${email.slice(0,1).toUpperCase()}</div><div><b>${email}</b><span>${t('accessOk')}</span></div></div><button class="btn small" style="margin-top:10px;width:100%" onclick="logoutUser()">${t('logout')}</button>${sideLangButtons()}`;
    }
    if(panel) panel.innerHTML='';
    return;
  }
  if(sideBox){
    sideBox.innerHTML=`<div class="auth-title">${t('login')}</div><div class="auth-line">${t('loginHint')}</div>${sideLangButtons()}`;
  }
  if(panel){
    panel.innerHTML=`${langButtons()}<div class="logo">M</div><h2>${t('loginTitle')}</h2><p>${t('loginDesc')}</p><input class="input" id="loginEmail" type="email" placeholder="${t('email')}" autocomplete="email"><input class="input" id="loginPassword" type="password" placeholder="${t('password')}" autocomplete="current-password"><button class="btn primary" onclick="loginUser()">${t('loginButton')}</button><div class="auth-helper"><button class="link-btn" type="button" onclick="showResetPassword()">${t('forgotPassword')}</button></div><div class="auth-error" id="authError"></div><div class="auth-success" id="authSuccess"></div><div class="auth-line">${t('noSignup')}</div>`;
    const email=document.getElementById('loginEmail');
    const pass=document.getElementById('loginPassword');
    if(email) email.onkeydown=e=>{if(e.key==='Enter') pass?.focus()};
    if(pass) pass.onkeydown=e=>{if(e.key==='Enter') loginUser()};
  }
  applyI18n();
}
function showResetPassword(){
  const panel=document.getElementById('authPanel');
  if(!panel) return;
  const existing=document.getElementById('loginEmail')?.value?.trim() || '';
  panel.innerHTML=`${langButtons()}<div class="logo">M</div><h2>${t('resetPassword')}</h2><p>${t('resetDesc')}</p><input class="input" id="resetEmail" type="email" placeholder="${t('email')}" value="${existing}" autocomplete="email"><button class="btn primary" onclick="sendPasswordReset()">${t('sendReset')}</button><div class="auth-error" id="authError"></div><div class="auth-success" id="authSuccess"></div><div class="auth-helper"><button class="link-btn" type="button" onclick="renderAuthBox()">${t('backToLogin')}</button></div>`;
  const email=document.getElementById('resetEmail');
  if(email) email.onkeydown=e=>{if(e.key==='Enter') sendPasswordReset()};
}
async function sendPasswordReset(){
  const email=document.getElementById('resetEmail')?.value?.trim();
  const errBox=document.getElementById('authError');
  const okBox=document.getElementById('authSuccess');
  if(!email){ if(errBox) errBox.textContent=t('fillEmailPass'); return; }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.href.split('#')[0] });
  if(error){ if(errBox) errBox.textContent=error.message; console.error(error); return; }
  if(errBox) errBox.textContent='';
  if(okBox) okBox.textContent=t('resetSent');
}
function showUpdatePassword(){
  const panel=document.getElementById('authPanel');
  if(!panel) return;
  panel.innerHTML=`${langButtons()}<div class="logo">M</div><h2>${t('resetPassword')}</h2><p>${t('newPassword')}</p><input class="input" id="newPassword" type="password" placeholder="${t('newPassword')}" autocomplete="new-password"><button class="btn primary" onclick="updatePasswordAfterRecovery()">${t('updatePassword')}</button><div class="auth-error" id="authError"></div><div class="auth-success" id="authSuccess"></div>`;
}
async function updatePasswordAfterRecovery(){
  const password=document.getElementById('newPassword')?.value || '';
  const errBox=document.getElementById('authError');
  const okBox=document.getElementById('authSuccess');
  if(!password || password.length < 6){ if(errBox) errBox.textContent=t('newPassword'); return; }
  const { error } = await supabaseClient.auth.updateUser({ password });
  if(error){ if(errBox) errBox.textContent=error.message; console.error(error); return; }
  if(okBox) okBox.textContent=t('passwordUpdated');
  setTimeout(()=>logoutUser(),1200);
}
supabaseClient.auth.onAuthStateChange((event, session)=>{
  if(event==='PASSWORD_RECOVERY'){
    currentUser=session?.user || null;
    setAuthLocked(true);
    showUpdatePassword();
  }
});
async function loginUser(){
  const email=document.getElementById('loginEmail')?.value?.trim();
  const password=document.getElementById('loginPassword')?.value || '';
  const errBox=document.getElementById('authError');
  if(!email || !password){ if(errBox) errBox.textContent=t('fillEmailPass'); return; }
  const {data:authData,error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error){ if(errBox) errBox.textContent=t('wrongLogin'); console.error(error); return; }
  currentUser=authData?.user || null;
  setAuthLocked(false);
  renderAuthBox();
  await startAppAfterLogin();
  toast(t('loggedIn'));
}
async function logoutUser(){
  await supabaseClient.auth.signOut();
  currentUser=null;
  if(materialsSubscription){ await supabaseClient.removeChannel(materialsSubscription); materialsSubscription=null; }
  data.materials=[];
  setAuthLocked(true);
  renderAuthBox();
  toast(t('loggedOut'));
}
function showLoginRequired(){
  const box=document.getElementById('stockTable');
  if(box) box.innerHTML=`<div class="login-lock"><b>${t('loginTitle')}</b>${t('loginDesc')}</div>`;
}
async function checkSession(){
  const {data:{session}}=await supabaseClient.auth.getSession();
  currentUser=session?.user || null;
  renderAuthBox();
  if(currentUser){ setAuthLocked(false); await startAppAfterLogin(); } else { setAuthLocked(true); }
}

/* v6.25: complete foam format and stock-state wizard */
(function(){
  const VERSION_LABEL='v6.25 - Foam Format & Stock';
  let foamState='stock';

  const esc=v=>typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null};
  const formatOf=()=>document.getElementById('foamKind')?.value==='sheet'?'sheet':'part';
  const formatUnit=format=>format==='sheet'?'sheet':'part';
  const formatLabel=format=>format==='sheet'?'листов':'шт';
  const stateFromMaterial=(found,attrs)=>attrs.status||((attrs.purchaseStatus==='ordered')?'ordered':((Number(found?.quantity||0)>0||attrs.storageLocation)?'stock':'card'));

  function applyVersionLabel(){
    document.querySelectorAll('.product-footer b,.version-badge').forEach(el=>el.textContent=VERSION_LABEL);
  }

  function stateCardsHtml(){
    return `<div class="material-state-cards">
      <button class="material-state-card" type="button" data-foam-state="card" onclick="setFoamCreateState('card')"><b>Только создать карточку</b><span>Материал появится в базе без остатка.</span></button>
      <button class="material-state-card" type="button" data-foam-state="ordered" onclick="setFoamCreateState('ordered')"><b>Заказано</b><span>Материал заказан, но ещё не пришёл.</span></button>
      <button class="material-state-card" type="button" data-foam-state="stock" onclick="setFoamCreateState('stock')"><b>На складе</b><span>Материал уже физически находится на складе.</span></button>
    </div>`;
  }

  function stockFieldsHtml(found,attrs){
    const format=formatOf();
    const label=formatLabel(format);
    const qty=attrs.stockQty??found?.quantity??0;
    const min=attrs.minStockQty??found?.minQuantity??0;
    const dateValue=attrs.arrivalDate||attrs.receiptDate||attrs.expectedReceiptDate||(typeof today==='function'?today():new Date().toISOString().slice(0,10));
    return `${stateCardsHtml()}
      <input id="foamStatus" type="hidden" value="${foamState}">
      <input id="foamPurchaseStatus" type="hidden" value="${foamState==='ordered'?'ordered':(foamState==='stock'?'instock':'noorder')}">
      <div class="form-grid state-fields" id="foamStateFields">
        <div class="field"><label id="foamQtyLabel">На складе, ${label}</label><input id="foamQty" type="number" step="1" min="0" class="input" value="${esc(qty)}" inputmode="numeric"></div>
        <div class="field"><label id="foamMinLabel">Мин. остаток, ${label}</label><input id="foamMin" type="number" step="1" min="0" class="input" value="${esc(min)}" inputmode="numeric"></div>
        <div class="field"><label>Место хранения</label><input id="foamStorageLocation" class="input" value="${esc(attrs.storageLocation||'')}" placeholder="Стеллаж / зона"></div>
        <div class="field"><label id="foamPurchasePriceLabel">Цена закупки, ${format==='sheet'?'за лист':'за деталь'}</label><input id="foamPurchasePrice" type="number" step="0.01" min="0" class="input" value="${esc(attrs.purchasePrice||'')}"></div>
        <div class="field"><label id="foamArrivalDateLabel">Дата поступления</label><input id="foamArrivalDate" type="date" class="input" value="${esc(dateValue)}"></div>
        <div class="field full hidden" id="foamPurchaseOrderField"><label>№ закупки / поставщик / комментарий</label><input id="foamPurchaseOrderInfo" class="input" value="${esc(attrs.purchaseOrderInfo||attrs.purchaseNote||attrs.order||'')}" placeholder="PO-102 · Supplier · комментарий"></div>
      </div>
      <input id="foamReserved" type="hidden" value="${esc(attrs.reservedQty||0)}">
      <input id="foamOrdered" type="hidden" value="${esc(attrs.orderedQty||0)}">`;
  }

  function syncFoamWizardUi(){
    const format=formatOf();
    const label=formatLabel(format);
    const step2=document.querySelector('.material-wizard-step[data-step="2"]');
    if(step2){
      const heading=step2.querySelector('h4');
      if(heading)heading.textContent=format==='sheet'?'Размеры листа':'Размеры детали';
      const widthLabel=document.getElementById('foamWidth')?.closest('.field')?.querySelector('label');
      const lengthLabel=document.getElementById('foamLength')?.closest('.field')?.querySelector('label');
      const heightLabel=document.getElementById('foamHeight')?.closest('.field')?.querySelector('label');
      if(widthLabel)widthLabel.textContent=format==='sheet'?'Ширина листа, мм':'Ширина детали, мм';
      if(lengthLabel)lengthLabel.textContent=format==='sheet'?'Длина листа, мм':'Длина детали, мм';
      if(heightLabel)heightLabel.textContent='Толщина, мм';
      document.getElementById('foamSheetCount')?.closest('.field')?.remove();
      document.getElementById('foamDetailCount')?.closest('.field')?.remove();
      document.getElementById('foamCalcPreview')?.remove();
    }
    const qtyLabel=document.getElementById('foamQtyLabel');
    const minLabel=document.getElementById('foamMinLabel');
    const priceLabel=document.getElementById('foamPurchasePriceLabel');
    if(qtyLabel)qtyLabel.textContent=`На складе, ${label}`;
    if(minLabel)minLabel.textContent=`Мин. остаток, ${label}`;
    if(priceLabel)priceLabel.textContent=`Цена закупки, ${format==='sheet'?'за лист':'за деталь'}`;
    const unit=document.getElementById('foamUnit');
    if(unit)unit.value=formatUnit(format);
  }

  window.setFoamCreateState=function(state){
    foamState=['card','ordered','stock'].includes(state)?state:'stock';
    document.querySelectorAll('[data-foam-state]').forEach(card=>card.classList.toggle('active',card.dataset.foamState===foamState));
    const fields=document.getElementById('foamStateFields');
    if(fields)fields.classList.toggle('hidden',foamState==='card');
    const orderField=document.getElementById('foamPurchaseOrderField');
    if(orderField)orderField.classList.toggle('hidden',foamState!=='ordered');
    const dateLabel=document.getElementById('foamArrivalDateLabel');
    if(dateLabel)dateLabel.textContent=foamState==='ordered'?'Ожидаемая дата поступления':'Дата поступления';
    const status=document.getElementById('foamStatus');
    if(status)status.value=foamState;
    const purchaseStatus=document.getElementById('foamPurchaseStatus');
    if(purchaseStatus)purchaseStatus.value=foamState==='ordered'?'ordered':(foamState==='stock'?'instock':'noorder');
  };

  function patchFoamWizard(id){
    const wizard=document.querySelector('.material-wizard');
    if(!wizard||!document.getElementById('foamSku'))return;
    const found=id?data.materials.find(x=>String(x.id)===String(id)):null;
    const attrs=found?.attributes||{};
    const select=document.getElementById('foamKind');
    if(select){
      [...select.options].forEach(option=>{
        if(option.value==='detail')option.value='part';
        if(option.value==='part')option.textContent='Детали · учёт шт';
        if(option.value==='sheet')option.textContent='Листы · учёт листов';
      });
      select.value=(attrs.format||attrs.foamKind)==='sheet'?'sheet':'part';
      select.onchange=()=>syncFoamWizardUi();
    }
    foamState=stateFromMaterial(found,attrs);
    if(!id&&!attrs.status)foamState='stock';
    const step3=wizard.querySelector('.material-wizard-step[data-step="3"]');
    const grid=step3?.querySelector('.form-grid');
    if(grid){
      const pdfField=grid.querySelector('#foamPdf')?.closest('.field')?.outerHTML||'';
      grid.innerHTML=`<div class="field full"><h4 style="margin:0 0 12px">Состояние материала</h4>${stockFieldsHtml(found,attrs)}</div>${pdfField}`;
    }
    syncFoamWizardUi();
    setFoamCreateState(foamState);
  }

  function readNonNegative(id,integer=false){
    const raw=document.getElementById(id)?.value??'';
    if(raw==='')return 0;
    const value=num(raw);
    if(value===null||value<0||integer&&!Number.isInteger(value))return null;
    return value;
  }

  async function saveFoamV625(id=''){
    if(!requireAuth())return;
    let sku=(document.getElementById('foamSku')?.value||'').trim();
    if(!sku||sku==='DET.'){toast(t('enterSkuMsg'));return;}
    if(!sku.startsWith('DET.'))sku='DET.'+sku;
    const format=formatOf();
    const status=document.getElementById('foamStatus')?.value||foamState;
    const width=readNonNegative('foamWidth');
    const length=readNonNegative('foamLength');
    const thickness=readNonNegative('foamHeight');
    const stockQty=status==='card'?0:readNonNegative('foamQty',true);
    const minStockQty=status==='card'?0:readNonNegative('foamMin',true);
    const purchasePrice=status==='card'?null:readNonNegative('foamPurchasePrice');
    if([width,length,thickness,stockQty,minStockQty,purchasePrice].some(v=>v===null)){
      toast('Размеры, остаток и цена не могут быть отрицательными. Остаток должен быть целым числом.');
      return;
    }
    const oldMaterial=id?data.materials.find(x=>String(x.id)===String(id)):null;
    const oldAttrs=oldMaterial?.attributes||{};
    const pdfData=await uploadFoamPdfToSupabase(sku,oldAttrs);
    if(!pdfData)return;
    const grade=(document.getElementById('foamGrade')?.value||'').trim();
    const storageLocation=status==='card'?null:(document.getElementById('foamStorageLocation')?.value||'').trim()||null;
    const arrivalDate=status==='card'?null:(document.getElementById('foamArrivalDate')?.value||null);
    const purchaseOrderInfo=status==='ordered'?(document.getElementById('foamPurchaseOrderInfo')?.value||'').trim()||null:null;
    const unit=formatUnit(format);
    const attrs={
      ...oldAttrs,
      format,status,width_mm:width,length_mm:length,thickness_mm:thickness,
      stockQty,minStockQty,
      stockSheets:format==='sheet'?stockQty:null,
      stockParts:format==='part'?stockQty:null,
      storageLocation,purchasePrice:status==='card'?null:purchasePrice,arrivalDate,purchaseOrderInfo,
      pdfUrl:pdfData.pdfUrl||oldAttrs.pdfUrl||null,
      pdfName:pdfData.pdfName||oldAttrs.pdfName||'',pdfPath:pdfData.pdfPath||oldAttrs.pdfPath||'',
      grade,tags:(document.getElementById('foamTags')?.value||'').trim(),
      foamKind:format==='sheet'?'sheet':'detail',
      width:String(width),length:String(length),height:String(thickness),thickness:String(thickness),
      purchaseStatus:status==='ordered'?'ordered':(status==='stock'?'instock':'noorder'),
      orderedQty:status==='ordered'?stockQty:0,reservedQty:Number(oldAttrs.reservedQty||0),
      supplier:null,order:purchaseOrderInfo
    };
    const obj={
      id:id||null,sku,
      name:[categoryLabel('Поролон'),grade].filter(Boolean).join(' · '),
      category:'Поролон',subcategory:'',attributes:attrs,unit,
      quantity:status==='stock'?stockQty:0,
      minQuantity:minStockQty,lastUpdated:today()
    };
    const ok=id?await updateMaterialInSupabase(obj):await insertMaterialToSupabase(obj);
    if(!ok)return;
    if(id){closeModal();await loadMaterialsFromSupabase();renderAll();toast(t('savedMaterial'));return;}
    await finishMaterialSaveAndReturn(sku,'Поролон');
  }

  window.addEventListener('load',()=>{
    applyVersionLabel();
    const originalOpen=window.openFoamModal;
    if(typeof originalOpen==='function'){
      window.openFoamModal=function(id=null){
        const result=originalOpen(id);
        setTimeout(()=>patchFoamWizard(id),0);
        return result;
      };
    }
    const originalSync=window.syncFoamKindInputs;
    if(typeof originalSync==='function'){
      window.syncFoamKindInputs=function(){const result=originalSync();syncFoamWizardUi();return result;};
    }
    window.saveFoamMaterial=saveFoamV625;
  });
  document.addEventListener('DOMContentLoaded',applyVersionLabel);
})();
