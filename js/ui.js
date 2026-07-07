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

function renderNav(){
  document.getElementById('mainNav').onclick=e=>{
    const b=e.target.closest('button');
    if(!b || b.classList.contains('disabled')) return;
    document.querySelectorAll('#mainNav button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
    document.getElementById(b.dataset.section).classList.add('active');
    closeMobileSidebar();
  };
}

function goBackModal(){
  const previous=modalStack.pop();
  if(previous)restoreModalState(previous);
  else closeModal();
}

function closeModal(){
  document.getElementById('modalBackdrop').classList.remove('show');
  unlockBodyScrollForModal();
  document.querySelector('#modalBackdrop .modal')?.classList.remove('wide','purchase-wide','detail-modal','attention-swipe-modal','purchase-compact');
  modalStack=[];
  updateModalBackButton();
  unlockPageFromModal();
}

function openModal(title,body,foot){
  closeMobileSidebar();
  document.getElementById('modalTitle').textContent=title;
  document.getElementById('modalBody').innerHTML=body;
  document.getElementById('modalFoot').innerHTML=foot;
  document.getElementById('modalBackdrop').classList.add('show');
  lockPageForModal();
  document.querySelector('#modalBackdrop .modal')?.classList.remove('wide','purchase-wide','detail-modal','attention-swipe-modal','purchase-compact');
  updateModalBackButton();
}

function setCleanModalClass(cls){
  const modal=document.querySelector('#modalBackdrop .modal');
  if(!modal)return;
  modal.classList.remove('wide','purchase-wide','detail-modal','attention-swipe-modal','purchase-compact','order-clean-modal','order-material-clean-modal','add-clean-modal','form-clean-modal');
  if(cls) cls.split(' ').forEach(c=>c&&modal.classList.add(c));
}
