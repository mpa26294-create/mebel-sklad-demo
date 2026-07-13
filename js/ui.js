// FurniCore UI helpers
function toggleMobileSidebar() {
  document.body.classList.toggle("sidebar-open");
}

function closeMobileSidebar() {
  document.body.classList.remove("sidebar-open");
}

window.addEventListener("resize", () => {
  if (window.innerWidth > 920) closeMobileSidebar();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && document.body.classList.contains("sidebar-open")) closeMobileSidebar();
});

function setVersion() {
  const av = document.getElementById("appVersionBadge");
  if (av && typeof VERSION !== "undefined") {
    av.textContent = VERSION;
  } else if (av && typeof APP_VERSION !== "undefined") {
    av.textContent = APP_VERSION;
  }
}

function toast(t){const el=document.getElementById('toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800)}

function placeChangelogNavLast(){
  const nav=document.getElementById('mainNav');
  const changelog=nav?.querySelector('[data-section="changelog"]');
  if(nav&&changelog&&changelog!==nav.lastElementChild)nav.appendChild(changelog);
}

function renderNav(){
  placeChangelogNavLast();
  document.getElementById('mainNav').onclick=e=>{
    const b=e.target.closest('button');
    if(!b || b.classList.contains('disabled')) return;
    document.querySelectorAll('#mainNav button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
    document.getElementById(b.dataset.section).classList.add('active');
    if(b.dataset.section==='settings'&&typeof lockTelegramSettings==='function')lockTelegramSettings();
    closeMobileSidebar();
  };
}

function hardenSearchAutofill(){
  const ids=['topSearchInput','searchInput','categorySearchInput','orderSearchInput','supplierFilter','orderFilter','quickSku'];
  ids.forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.classList.add('no-autofill');
    el.setAttribute('autocomplete','new-password');
    el.setAttribute('aria-autocomplete','none');
    el.setAttribute('autocorrect','off');
    el.setAttribute('spellcheck','false');
    el.setAttribute('data-lpignore','true');
    el.setAttribute('data-form-type','other');
    if(!el.getAttribute('name'))el.setAttribute('name','furnicore_'+id);
  });
}

function clearChromeEmailAutofill(){
  const email=String(window.currentUser?.email||'').trim().toLowerCase();
  if(!email)return;
  ['topSearchInput','searchInput','categorySearchInput','orderSearchInput'].forEach(id=>{
    const el=document.getElementById(id);
    if(el&&String(el.value||'').trim().toLowerCase()===email){
      el.value='';
      if(id==='topSearchInput'||id==='categorySearchInput'){
        const main=document.getElementById('searchInput');
        if(main&&String(main.value||'').trim().toLowerCase()===email)main.value='';
      }
    }
  });
}

function protectSearchInputsFromAutofill(){
  hardenSearchAutofill();
  clearChromeEmailAutofill();
  clearTimeout(window.__searchAutofillGuardTimer);
  clearTimeout(window.__searchAutofillGuardLateTimer);
  window.__searchAutofillGuardTimer=setTimeout(clearChromeEmailAutofill,250);
  window.__searchAutofillGuardLateTimer=setTimeout(clearChromeEmailAutofill,1000);
}

document.addEventListener('DOMContentLoaded',()=>setTimeout(protectSearchInputsFromAutofill,0));
document.addEventListener('focusin',e=>{
  if(e.target&&e.target.matches&&e.target.matches('.no-autofill'))setTimeout(clearChromeEmailAutofill,0);
});

function goBackModal(){
  const previous=modalStack.pop();
  if(previous)restoreModalState(previous);
  else closeModal();
}

function closeModal(){
  document.getElementById('modalBackdrop').classList.remove('show');
  unlockBodyScrollForModal();
  document.querySelector('#modalBackdrop .modal')?.classList.remove('wide','purchase-wide','detail-modal','attention-swipe-modal','purchase-compact','production-order-modal','modal-expanded');
  modalStack=[];
  const back=document.getElementById('modalBackBtn');
  if(back)back.onclick=goBackModal;
  updateModalBackButton();
  unlockPageFromModal();
}

function openModal(title,body,foot){
  closeMobileSidebar();
  const back=document.getElementById('modalBackBtn');
  if(back)back.onclick=goBackModal;
  document.getElementById('modalTitle').textContent=title;
  document.getElementById('modalBody').innerHTML=body;
  document.getElementById('modalFoot').innerHTML=foot;
  if(typeof modalStack!=='undefined'&&modalStack.length){
    document.querySelectorAll('#modalFoot button,#modalFoot .btn').forEach(button=>{
      const label=String(button.textContent||'').trim().replace(/^[←‹]\s*/,'').toLowerCase();
      if(['назад','back','atpakaļ'].includes(label)&&!button.classList.contains('primary'))button.remove();
    });
  }
  document.getElementById('modalBackdrop').classList.add('show');
  lockPageForModal();
  document.querySelector('#modalBackdrop .modal')?.classList.remove('wide','purchase-wide','detail-modal','attention-swipe-modal','purchase-compact','production-order-modal','modal-expanded');
  const expandBtn=document.querySelector('.modal-expand-btn');
  if(expandBtn){expandBtn.title='Увеличить окно';expandBtn.setAttribute('aria-label','Увеличить окно')}
  updateModalBackButton();
}

function setCleanModalClass(cls){
  const modal=document.querySelector('#modalBackdrop .modal');
  if(!modal)return;
  modal.classList.remove('wide','purchase-wide','detail-modal','attention-swipe-modal','purchase-compact','production-order-modal','modal-expanded','order-clean-modal','order-material-clean-modal','add-clean-modal','form-clean-modal');
  if(cls) cls.split(' ').forEach(c=>c&&modal.classList.add(c));
}
function toggleModalSize(){
  const modal=document.querySelector('#modalBackdrop .modal');
  if(!modal)return;
  modal.classList.toggle('modal-expanded');
  const btn=document.querySelector('.modal-expand-btn');
  if(btn){const label=modal.classList.contains('modal-expanded')?'Уменьшить окно':'Увеличить окно';btn.title=label;btn.setAttribute('aria-label',label)}
}
