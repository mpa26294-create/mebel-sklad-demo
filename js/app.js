// FurniCore app entry file.
// Основной код пока остаётся в index.html; сюда постепенно переносим модули.

const FURNICORE_BUILD_VERSION = "v6.30 - Eco Leather Flow";

function applyBuildVersion() {
  const badge = document.getElementById("appVersionBadge");
  if (badge) badge.textContent = FURNICORE_BUILD_VERSION;
  document.querySelectorAll('.product-footer b,.version-badge').forEach(el=>el.textContent=FURNICORE_BUILD_VERSION);
}

applyBuildVersion();
console.log("app.js loaded", FURNICORE_BUILD_VERSION);

window.addEventListener('load',()=>{
  applyBuildVersion();
  if(typeof window.openFabricModal!=='function' || window.__ecoLeatherFlowInstalled)return;
  window.__ecoLeatherFlowInstalled=true;
  const originalOpenFabricModal=window.openFabricModal;

  function patchEcoLeatherModal(id){
    const category=document.getElementById('fabricCategory')?.value;
    if(category!=='Экокожа')return;
    const wizard=document.querySelector('.material-wizard');
    if(!wizard)return;

    const step1=wizard.querySelector('.material-wizard-step[data-step="1"]');
    const step2=wizard.querySelector('.material-wizard-step[data-step="2"]');
    const step3=wizard.querySelector('.material-wizard-step[data-step="3"]');
    const mainGrid=step1?.querySelector('.fabric-form-grid');
    if(!step1||!step3||!mainGrid)return;

    const colorField=document.getElementById('fabricColor')?.closest('.field');
    if(colorField)mainGrid.appendChild(colorField);

    const stateHeading=step3.querySelector('h4');
    if(stateHeading)stateHeading.textContent='Состояние материала';
    step1.appendChild(step3);

    step2?.remove();
    wizard.querySelector('.wizard-steps')?.remove();
    step1.classList.remove('hidden');
    step3.classList.remove('hidden');
    step3.style.marginTop='16px';
    step3.style.paddingTop='16px';
    step3.style.borderTop='1px solid var(--line,#e5e7eb)';
    step1.querySelector('h4').textContent='Данные экокожи';
    wizard.dataset.step='1';

    ['fabricComposition','fabricDensity'].forEach(fieldId=>document.getElementById(fieldId)?.closest('.field')?.remove());

    const todayValue=new Date().toISOString().slice(0,10);
    const receipt=document.getElementById('fabricReceiptDate');
    const expected=document.getElementById('fabricExpectedDate');
    if(receipt&&!receipt.value)receipt.value=todayValue;
    if(expected&&!expected.value)expected.value=todayValue;

    const footer=document.getElementById('modalFoot');
    if(footer)footer.innerHTML=`<button class="btn primary" type="button" onclick="saveFabricMaterial('${id||''}')">${typeof t==='function'?t('save'):'Сохранить'}</button>`;

    const modalBack=document.getElementById('modalBackBtn');
    if(modalBack)modalBack.onclick=()=>closeModal();

    const current=document.getElementById('materialCreateState')?.value||'stock';
    if(typeof window.selectMaterialCreateState==='function')window.selectMaterialCreateState(current);
    if(typeof window.updateFabricAreaPreview==='function')window.updateFabricAreaPreview();

    document.querySelectorAll('.material-state-card').forEach(card=>{
      card.style.minHeight='76px';
      card.style.padding='13px 14px';
    });
  }

  window.openFabricModal=function(id=null,category='Ткань'){
    const result=originalOpenFabricModal(id,category);
    const resolved=id?(data.materials||[]).find(x=>String(x.id)===String(id))?.category:category;
    if(resolved==='Экокожа')setTimeout(()=>patchEcoLeatherModal(id),0);
    return result;
  };
});
