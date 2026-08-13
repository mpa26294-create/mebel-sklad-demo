// MOLM UI helpers
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

function switchSection(sectionId){
  if(!sectionId)return false;
  const section=document.getElementById(sectionId);
  if(!section)return false;
  document.querySelectorAll('#mainNav button').forEach(x=>x.classList.toggle('active',x.dataset.section===sectionId));
  document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===sectionId));
  if(sectionId==='settings'&&typeof lockTelegramSettings==='function')lockTelegramSettings();
  if(sectionId==='settings'&&typeof loadProfileSettingsForm==='function')loadProfileSettingsForm();
  if(sectionId==='orders'&&typeof renderOrders==='function')renderOrders();
  if(sectionId==='workshops'&&typeof renderWorkshops==='function')renderWorkshops();
  if(sectionId==='history'&&typeof renderSiteHistory==='function')renderSiteHistory();
  if(sectionId==='changelog'&&typeof renderChangelog==='function')renderChangelog();
  if(sectionId==='activity'&&typeof renderActivity==='function')renderActivity();
  if(sectionId==='technologies'&&typeof renderTechnologies==='function'){
    renderTechnologies();
    if(typeof loadTechnologiesFromSupabase==='function')loadTechnologiesFromSupabase().then(()=>renderTechnologies());
  }
  closeMobileSidebar();
  return true;
}

function renderNav(){
  placeChangelogNavLast();
  document.getElementById('mainNav').onclick=e=>{
    const b=e.target.closest('button[data-section]');
    if(!b || b.classList.contains('disabled')) return;
    switchSection(b.dataset.section);
  };
}

document.addEventListener('click',event=>{
  const b=event.target.closest('#mainNav button[data-section]');
  if(!b||b.classList.contains('disabled'))return;
  switchSection(b.dataset.section);
},true);

function hardenSearchAutofill(){
  const ids=['searchInput','orderSearchInput','supplierFilter','orderFilter','quickSku'];
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
  // v7.10: currentUser — это верхнеуровневая переменная (let), а не свойство window,
  // поэтому "window.currentUser" тут всегда undefined и эта защита ни разу не срабатывала
  // с самого начала — именно поэтому автозаполнение email браузером всё же просачивалось
  // в поле поиска и незаметно фильтровало список материалов до пустоты/нескольких строк.
  const email=String((typeof currentUser!=='undefined'&&currentUser?.email)||'').trim().toLowerCase();
  if(!email)return;
  ['searchInput','orderSearchInput'].forEach(id=>{
    const el=document.getElementById(id);
    if(el&&String(el.value||'').trim().toLowerCase()===email){
      el.value='';
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
  if(typeof stopBarcodeScanner==='function')stopBarcodeScanner(); // v7.07: не оставлять камеру включённой при закрытии модалки
  if(typeof clearChromeEmailAutofill==='function')clearChromeEmailAutofill(); // v7.10: карточка материала могла спровоцировать автозаполнение поиска email'ом
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
  if(typeof stopBarcodeScanner==='function')stopBarcodeScanner(); // v7.07: остановить камеру, если модалка заменяется другой (напр. после найденного скана)
  closeMobileSidebar();
  const backdrop=document.getElementById('modalBackdrop');
  if(backdrop){
    backdrop.style.display='';
    backdrop.style.pointerEvents='';
    backdrop.style.visibility='';
  }
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
  backdrop?.classList.add('show');
  lockPageForModal();
  document.querySelector('#modalBackdrop .modal')?.classList.remove('wide','purchase-wide','detail-modal','attention-swipe-modal','purchase-compact','production-order-modal','modal-expanded');
  const expandBtn=document.querySelector('.modal-expand-btn');
  if(expandBtn){const lbl=typeof t==='function'?t('expandWindowLabel'):'Увеличить окно';expandBtn.title=lbl;expandBtn.setAttribute('aria-label',lbl)}
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
  if(btn){const label=modal.classList.contains('modal-expanded')?(typeof t==='function'?t('shrinkWindowLabel'):'Уменьшить окно'):(typeof t==='function'?t('expandWindowLabel'):'Увеличить окно');btn.title=label;btn.setAttribute('aria-label',label)}
}
