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

/* v6.24: foam pieces without dimensions + fabric-style stock state */
(function(){
  const VERSION_LABEL='v6.24 - Foam Pieces Stock';
  let foamCreateState='card';

  function applyVersionLabel(){
    document.querySelectorAll('.product-footer b,.version-badge').forEach(el=>el.textContent=VERSION_LABEL);
  }

  function foamStateCard(state,title,description){
    return `<button class="material-state-card ${foamCreateState===state?'active':''}" type="button" data-foam-state="${state}" onclick="setFoamCreateState('${state}')"><b>${title}</b><span>${description}</span></button>`;
  }

  function foamStockFieldsHtml(found,attrs,unit){
    const qty=typeof inputQtyValue==='function'?inputQtyValue(stockNumForUnit(found?.quantity||0,unit),unit):(found?.quantity||0);
    const min=typeof inputQtyValue==='function'?inputQtyValue(stockNumForUnit(found?.minQuantity||0,unit),unit):(found?.minQuantity||0);
    const ordered=typeof inputQtyValue==='function'?inputQtyValue(stockNumForUnit(attrs.orderedQty||0,unit),unit):(attrs.orderedQty||0);
    return `<input id="foamPurchaseStatus" type="hidden" value="${foamCreateState==='ordered'?'ordered':(foamCreateState==='stock'?'instock':'noorder')}">
      <div class="material-state-cards">
        ${foamStateCard('card','Только создать карточку','Материал появится в базе без остатка.')}
        ${foamStateCard('ordered','Заказано','Материал заказан, но ещё не пришёл.')}
        ${foamStateCard('stock','На складе','Материал уже физически находится на складе.')}
      </div>
      <div class="form-grid state-fields ${foamCreateState==='ordered'?'':'hidden'}" data-foam-fields="ordered">
        <div class="field"><label>Заказано, ${unitLabel(unit)}</label><input id="foamOrdered" type="number" step="${stockStep(unit)}" min="0" class="input" value="${ordered}" inputmode="decimal"></div>
        <div class="field"><label>${t('supplier')}</label><input id="foamSupplier" class="input" value="${attrs.supplier||''}" placeholder="${t('supplierPlaceholder')}"></div>
        <div class="field full"><label>${t('order')}</label><input id="foamOrder" class="input" value="${attrs.order||''}" placeholder="${t('orderPlaceholder')}"></div>
      </div>
      <div class="form-grid state-fields ${foamCreateState==='stock'?'':'hidden'}" data-foam-fields="stock">
        <div class="field"><label>На складе, ${unitLabel(unit)}</label><input id="foamQty" type="number" step="${stockStep(unit)}" min="0" class="input" value="${qty}" inputmode="decimal"></div>
        <div class="field"><label>${t('minQuantity')}</label><input id="foamMin" type="number" step="${stockStep(unit)}" min="0" class="input" value="${min}" inputmode="decimal"></div>
      </div>
      <input id="foamReserved" type="hidden" value="${attrs.reservedQty||0}">`;
  }

  window.setFoamCreateState=function(state){
    foamCreateState=['card','ordered','stock'].includes(state)?state:'card';
    document.querySelectorAll('[data-foam-state]').forEach(card=>card.classList.toggle('active',card.dataset.foamState===foamCreateState));
    document.querySelectorAll('[data-foam-fields]').forEach(box=>box.classList.toggle('hidden',box.dataset.foamFields!==foamCreateState));
    const status=document.getElementById('foamPurchaseStatus');
    if(status)status.value=foamCreateState==='ordered'?'ordered':(foamCreateState==='stock'?'instock':'noorder');
  };

  function patchFoamWizard(id){
    const wizard=document.querySelector('.material-wizard');
    const kind=document.getElementById('foamKind')?.value||'detail';
    if(!wizard||!document.getElementById('foamSku'))return;
    const found=id?data.materials.find(x=>String(x.id)===String(id)):null;
    const attrs=found?.attributes||{};
    const unit=kind==='sheet'?'м²':'шт';
    foamCreateState=attrs.purchaseStatus==='ordered'?'ordered':((Number(found?.quantity||0)>0)?'stock':'card');

    const step2=wizard.querySelector('.material-wizard-step[data-step="2"]');
    if(step2){
      step2.querySelectorAll('#foamWidth,#foamLength,#foamHeight').forEach(input=>input.closest('.field')?.classList.toggle('hidden',kind==='detail'));
      const heading=step2.querySelector('h4');
      if(heading)heading.textContent=kind==='detail'?'Количество деталей':'Параметры листа';
    }

    const step3=wizard.querySelector('.material-wizard-step[data-step="3"]');
    const grid=step3?.querySelector('.form-grid');
    if(grid){
      const pdfField=grid.querySelector('.field.full')?.outerHTML||'';
      grid.innerHTML=`<div class="field full">${foamStockFieldsHtml(found,attrs,unit)}</div>${pdfField}`;
    }
    syncFoamKindInputs();
    setFoamCreateState(foamCreateState);
  }

  window.addEventListener('load',()=>{
    applyVersionLabel();
    const originalOpenFoamModal=window.openFoamModal;
    if(typeof originalOpenFoamModal==='function'){
      window.openFoamModal=function(id=null){
        const result=originalOpenFoamModal(id);
        setTimeout(()=>patchFoamWizard(id),0);
        return result;
      };
    }
    const originalSyncFoamKindInputs=window.syncFoamKindInputs;
    if(typeof originalSyncFoamKindInputs==='function'){
      window.syncFoamKindInputs=function(){
        const result=originalSyncFoamKindInputs();
        const kind=document.getElementById('foamKind')?.value||'detail';
        document.querySelectorAll('#foamWidth,#foamLength,#foamHeight').forEach(input=>input.closest('.field')?.classList.toggle('hidden',kind==='detail'));
        const heading=document.querySelector('.material-wizard-step[data-step="2"] h4');
        if(heading)heading.textContent=kind==='detail'?'Количество деталей':'Параметры листа';
        return result;
      };
    }
  });
  document.addEventListener('DOMContentLoaded',applyVersionLabel);
})();
