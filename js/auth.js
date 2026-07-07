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
