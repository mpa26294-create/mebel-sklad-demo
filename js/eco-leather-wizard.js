// v6.33 — Apple-style roll flow for Fabric and Eco Leather without UI flash.
(function(){
  const VERSION_LABEL='v6.33 - No Flash UI';
  let installed=false;
  let rollState='stock';

  const numberValue=id=>{
    const raw=String(document.getElementById(id)?.value??'').replace(',','.');
    if(raw==='')return 0;
    const value=Number(raw);
    return Number.isFinite(value)&&value>=0?value:null;
  };

  function applyVersion(){
    document.querySelectorAll('.product-footer b,.version-badge').forEach(el=>el.textContent=VERSION_LABEL);
  }

  function ensureStyles(){
    if(document.getElementById('ecoLeatherFlowStyles'))return;
    const style=document.createElement('style');
    style.id='ecoLeatherFlowStyles';
    style.textContent=`
      .eco-apple-flow .wizard-steps{display:none!important}
      .eco-apple-flow .wizard-card{padding:18px!important}
      .eco-apple-flow .eco-flow-heading{margin:0 0 14px;font-size:16px;font-weight:800}
      .eco-apple-flow .eco-state-wrap{margin-top:16px;padding-top:16px;border-top:1px solid var(--border,#e5e7eb)}
      .eco-apple-flow .eco-state-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 14px}
      .eco-apple-flow .eco-state-card{min-height:76px;border:1px solid var(--border,#e5e7eb);background:#fff;border-radius:16px;padding:13px 14px;text-align:left;cursor:pointer;transition:.18s ease}
      .eco-apple-flow .eco-state-card b{display:block;font-size:14px;margin-bottom:4px}
      .eco-apple-flow .eco-state-card span{display:block;font-size:12px;color:#6b7280;line-height:1.35}
      .eco-apple-flow .eco-state-card.active{background:#111217;color:#fff;border-color:#111217;box-shadow:0 10px 24px rgba(17,18,23,.14)}
      .eco-apple-flow .eco-state-card.active span{color:#d1d5db}
      .eco-apple-flow .eco-state-fields{margin-top:4px}
      .eco-apple-flow .fabric-color-picker{max-height:112px;overflow:auto}
      .eco-roll-preview{grid-column:1/-1;padding:12px 14px;border-radius:12px;background:#ecfdf3;color:#287047;font-size:13px;font-weight:700}
      @media(max-width:760px){.eco-apple-flow .eco-state-cards{grid-template-columns:1fr}.eco-apple-flow .eco-state-card{min-height:64px}}
    `;
    document.head.appendChild(style);
  }

  function stateCardsHtml(){
    return `<div class="eco-state-cards">
      <button class="eco-state-card" type="button" data-eco-state="card" onclick="setRollMaterialState('card')"><b>Только карточка</b><span>Создать материал без остатка.</span></button>
      <button class="eco-state-card" type="button" data-eco-state="ordered" onclick="setRollMaterialState('ordered')"><b>Заказано</b><span>Рулоны заказаны, но ещё не пришли.</span></button>
      <button class="eco-state-card" type="button" data-eco-state="stock" onclick="setRollMaterialState('stock')"><b>На складе</b><span>Рулоны уже находятся на складе.</span></button>
    </div>`;
  }

  function updateRollPreview(){
    const prefix=rollState==='ordered'?'fabricOrdered':'fabricStock';
    const width=numberValue(prefix+'RollWidth')||0;
    const length=numberValue(prefix+'RollLength')||0;
    const count=numberValue(rollState==='ordered'?'ecoOrderedRollCount':'ecoStockRollCount')||0;
    const box=document.getElementById(rollState==='ordered'?'ecoOrderedRollPreview':'ecoStockRollPreview');
    if(!box)return;
    const one=width*length;
    const total=one*count;
    box.textContent=width>0&&length>0
      ? `Площадь 1 рулона: ${one.toFixed(2)} м² · рулонов: ${count} · всего: ${total.toFixed(2)} м²`
      : 'Укажите ширину и длину рулона — площадь рассчитается автоматически.';
  }
  window.updateEcoRollPreview=updateRollPreview;

  function syncStateUi(){
    document.querySelectorAll('[data-eco-state]').forEach(card=>card.classList.toggle('active',card.dataset.ecoState===rollState));
    const hidden=document.getElementById('materialCreateState');
    if(hidden)hidden.value=rollState;
    document.querySelectorAll('[data-state-fields="ordered"]').forEach(el=>el.style.setProperty('display',rollState==='ordered'?'grid':'none','important'));
    document.querySelectorAll('[data-state-fields="stock"]').forEach(el=>el.style.setProperty('display',rollState==='stock'?'grid':'none','important'));
    updateRollPreview();
  }

  window.setRollMaterialState=function(state){
    rollState=['card','ordered','stock'].includes(state)?state:'stock';
    syncStateUi();
  };
  window.setEcoLeatherState=window.setRollMaterialState;

  function replaceQuantityWithRollCount(host,state,attrs,found){
    if(!host)return;
    const qtyInput=host.querySelector(state==='ordered'?'#fabricOrderedQty':'#fabricQty');
    const field=qtyInput?.closest('.field');
    if(!field)return;
    const savedCount=state==='ordered'
      ? Number(attrs.orderedRollCount||attrs.orderedQty||0)
      : Number(attrs.rollCount||found?.quantity||0);
    field.innerHTML=`<label>Количество рулонов</label><input id="${state==='ordered'?'ecoOrderedRollCount':'ecoStockRollCount'}" class="input" type="number" min="0" step="1" inputmode="numeric" value="${Number.isFinite(savedCount)?savedCount:0}" oninput="updateEcoRollPreview()">`;
    const preview=document.createElement('div');
    preview.id=state==='ordered'?'ecoOrderedRollPreview':'ecoStockRollPreview';
    preview.className='eco-roll-preview';
    host.appendChild(preview);
    host.querySelectorAll('input[id$="RollWidth"],input[id$="RollLength"]').forEach(input=>input.addEventListener('input',updateRollPreview));
  }

  function setTodayIfEmpty(id){
    const input=document.getElementById(id);
    if(input&&!input.value)input.value=new Date().toISOString().slice(0,10);
  }

  function patchRollMaterialModal(id){
    const category=document.getElementById('fabricCategory')?.value;
    if(!['Экокожа','Ткань'].includes(category))return;
    const wizard=document.querySelector('.material-wizard');
    if(!wizard)return;
    const found=id?(data.materials||[]).find(x=>String(x.id)===String(id)):null;
    const attrs=found?.attributes||{};
    wizard.classList.add('eco-apple-flow');

    const step1=wizard.querySelector('.material-wizard-step[data-step="1"]');
    const step2=wizard.querySelector('.material-wizard-step[data-step="2"]');
    const step3=wizard.querySelector('.material-wizard-step[data-step="3"]');
    const mainGrid=step1?.querySelector('.fabric-form-grid');
    if(!step1||!step3||!mainGrid)return;

    const colorField=document.getElementById('fabricColor')?.closest('.field');
    if(colorField)mainGrid.appendChild(colorField);

    const oldState=document.getElementById('materialCreateState')?.value;
    rollState=['card','ordered','stock'].includes(oldState)?oldState:'stock';
    if(!id&&!oldState)rollState='stock';

    const orderedFields=step3.querySelector('[data-state-fields="ordered"]');
    const stockFields=step3.querySelector('[data-state-fields="stock"]');
    replaceQuantityWithRollCount(orderedFields,'ordered',attrs,found);
    replaceQuantityWithRollCount(stockFields,'stock',attrs,found);

    const stateWrap=document.createElement('div');
    stateWrap.className='eco-state-wrap';
    stateWrap.innerHTML=`<h4 class="eco-flow-heading">Состояние материала</h4>${stateCardsHtml()}<input type="hidden" id="materialCreateState" value="${rollState}"><div class="eco-state-fields" id="ecoStateFields"></div>`;
    const fieldsHost=stateWrap.querySelector('#ecoStateFields');
    if(orderedFields)fieldsHost.appendChild(orderedFields);
    if(stockFields)fieldsHost.appendChild(stockFields);
    step1.appendChild(stateWrap);

    step2?.remove();
    step3.remove();
    wizard.querySelector('.wizard-steps')?.remove();
    step1.classList.remove('hidden');
    step1.querySelector('h4').textContent=category==='Ткань'?'Данные ткани':'Данные экокожи';
    wizard.dataset.step='1';

    const footer=document.getElementById('modalFoot');
    if(footer)footer.innerHTML=`<button class="btn primary" type="button" onclick="saveRollMaterialV633('${id||''}')">${typeof t==='function'?t('save'):'Сохранить'}</button>`;
    const modalBack=document.getElementById('modalBackBtn');
    if(modalBack)modalBack.onclick=()=>{
      if(id){closeModal();return;}
      closeModal();
      setTimeout(()=>typeof openAddCategoryModal==='function'&&openAddCategoryModal(),0);
    };

    ['fabricComposition','fabricDensity'].forEach(fieldId=>document.getElementById(fieldId)?.closest('.field')?.remove());
    setTodayIfEmpty('fabricReceiptDate');
    setTodayIfEmpty('fabricExpectedDate');
    syncStateUi();
  }

  window.saveRollMaterialV633=async function(id=''){
    if(!requireAuth())return;
    const found=id?(data.materials||[]).find(x=>String(x.id)===String(id)):null;
    const oldAttrs=found?.attributes||{};
    const category=document.getElementById('fabricCategory')?.value||found?.category||'Ткань';
    const sku=(document.getElementById('fabricSku')?.value||'').trim()||nextSku(category,'',id||'');
    if(typeof warnFabricDuplicate==='function'&&warnFabricDuplicate())return;
    const name=(document.getElementById('fabricName')?.value||'').trim()||category;
    const state=document.getElementById('materialCreateState')?.value||rollState;
    const width=state==='ordered'?numberValue('fabricOrderedRollWidth'):(state==='stock'?numberValue('fabricStockRollWidth'):Number(oldAttrs.rollWidth||0));
    const length=state==='ordered'?numberValue('fabricOrderedRollLength'):(state==='stock'?numberValue('fabricStockRollLength'):Number(oldAttrs.rollLength||0));
    const count=state==='ordered'?numberValue('ecoOrderedRollCount'):(state==='stock'?numberValue('ecoStockRollCount'):0);
    const price=state==='stock'?numberValue('fabricPurchasePrice'):0;
    if([width,length,count,price].some(v=>v===null)||!Number.isInteger(count)){
      toast('Значения не могут быть отрицательными. Количество рулонов должно быть целым числом.');
      return;
    }
    const oneArea=Number(((width||0)*(length||0)).toFixed(2));
    const totalArea=Number((oneArea*(count||0)).toFixed(2));
    const color=(document.getElementById('fabricColor')?.value||oldAttrs.color||'').trim();
    const attrs={
      ...oldAttrs,
      materialType:category,
      collection:(document.getElementById('fabricCollection')?.value||'').trim(),
      manufacturer:(document.getElementById('fabricManufacturer')?.value||'').trim(),
      color,
      rollWidth:width||'',rollWidthMm:width?Math.round(width*1000):'',rollLength:length||'',
      rollCount:state==='stock'?count:0,orderedRollCount:state==='ordered'?count:0,
      area:oneArea||'',totalArea,
      storageLocation:state==='stock'?(document.getElementById('fabricStorageLocation')?.value||'').trim():null,
      receiptDate:state==='stock'?(document.getElementById('fabricReceiptDate')?.value||null):null,
      purchasePrice:state==='stock'?price:null,
      expectedReceiptDate:state==='ordered'?(document.getElementById('fabricExpectedDate')?.value||null):null,
      purchaseNote:state==='ordered'?(document.getElementById('fabricPurchaseNote')?.value||'').trim()||null:null,
      purchaseStatus:state==='ordered'?'ordered':(state==='stock'?'instock':'noorder'),
      orderedQty:state==='ordered'?count:0,
      status:state,
      reservedQty:Number(oldAttrs.reservedQty||0)
    };
    const obj={id:id||null,sku,name,category,subcategory:category,attributes:attrs,unit:'рулон',quantity:state==='stock'?count:0,minQuantity:Number(found?.minQuantity||0),lastUpdated:today()};
    const ok=id?await updateMaterialInSupabase(obj):await insertMaterialToSupabase(obj);
    if(!ok)return;
    if(id){closeModal();await loadMaterialsFromSupabase();renderAll();toast(t('savedMaterial'));return;}
    await finishMaterialSaveAndReturn(obj.sku,obj.category);
  };
  window.saveEcoLeatherV631=window.saveRollMaterialV633;

  function install(){
    if(installed)return true;
    if(typeof window.openFabricModal!=='function')return false;
    installed=true;
    ensureStyles();
    applyVersion();
    const original=window.openFabricModal;
    window.__originalFabricModalV633=original;
    window.openFabricModal=function(id=null,category='Ткань'){
      const resolved=id?(data.materials||[]).find(x=>String(x.id)===String(id))?.category:category;
      if(!['Экокожа','Ткань'].includes(resolved))return original(id,category);
      const modal=document.querySelector('#modalBackdrop .modal');
      if(modal)modal.style.visibility='hidden';
      let result;
      try{
        result=original(id,category);
        patchRollMaterialModal(id);
      }finally{
        if(modal)modal.style.visibility='';
      }
      return result;
    };
    return true;
  }

  function boot(){
    applyVersion();
    if(install())return;
    let tries=0;
    const timer=setInterval(()=>{tries+=1;if(install()||tries>100)clearInterval(timer)},20);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
