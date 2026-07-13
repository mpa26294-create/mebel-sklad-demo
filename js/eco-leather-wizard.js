// v6.34 — Apple flows for Fabric, Eco Leather and Leather.
(function(){
  const VERSION_LABEL='v6.46 — Changelog and Foam Editor Fix';
  let installed=false;
  let materialState='stock';

  const num=id=>{
    const raw=String(document.getElementById(id)?.value??'').replace(',','.');
    if(raw==='')return 0;
    const value=Number(raw);
    return Number.isFinite(value)&&value>=0?value:null;
  };
  const esc=value=>typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??'');

  function applyVersion(){
    document.querySelectorAll('.product-footer b,.version-badge').forEach(el=>el.textContent=VERSION_LABEL);
  }

  function ensureStyles(){
    if(document.getElementById('appleMaterialFlowStyles'))return;
    const style=document.createElement('style');
    style.id='appleMaterialFlowStyles';
    style.textContent=`
      .eco-apple-flow .wizard-steps{display:none!important}
      .eco-apple-flow .wizard-card{padding:18px!important}
      .eco-flow-heading{margin:0 0 14px;font-size:16px;font-weight:800}
      .eco-state-wrap{margin-top:16px;padding-top:16px;border-top:1px solid var(--line,#e5e7eb)}
      .eco-state-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 14px}
      .eco-state-card{min-height:76px;border:1px solid var(--line,#e5e7eb);background:#fff;border-radius:16px;padding:13px 14px;text-align:left;cursor:pointer;transition:.18s ease}
      .eco-state-card b{display:block;font-size:14px;margin-bottom:4px}.eco-state-card span{display:block;font-size:12px;color:#6b7280;line-height:1.35}
      .eco-state-card.active{background:#111217;color:#fff;border-color:#111217;box-shadow:0 10px 24px rgba(17,18,23,.14)}.eco-state-card.active span{color:#d1d5db}
      .eco-state-fields{margin-top:4px}.eco-apple-flow .fabric-color-picker{max-height:112px;overflow:auto}
      .eco-roll-preview{grid-column:1/-1;padding:12px 14px;border-radius:12px;background:#ecfdf3;color:#287047;font-size:13px;font-weight:700}
      @media(max-width:760px){.eco-state-cards{grid-template-columns:1fr}.eco-state-card{min-height:64px}}
    `;
    document.head.appendChild(style);
  }

  function cardsHtml(isLeather=false){
    const orderedText=isLeather?'Кожа заказана, но ещё не поступила.':'Рулоны заказаны, но ещё не пришли.';
    const stockText=isLeather?'Кожа уже находится на складе.':'Рулоны уже находятся на складе.';
    return `<div class="eco-state-cards">
      <button class="eco-state-card" type="button" data-apple-state="card" onclick="setAppleMaterialState('card')"><b>Только карточка</b><span>Создать материал без остатка.</span></button>
      <button class="eco-state-card" type="button" data-apple-state="ordered" onclick="setAppleMaterialState('ordered')"><b>Заказано</b><span>${orderedText}</span></button>
      <button class="eco-state-card" type="button" data-apple-state="stock" onclick="setAppleMaterialState('stock')"><b>На складе</b><span>${stockText}</span></button>
    </div>`;
  }

  function syncStateUi(){
    document.querySelectorAll('[data-apple-state]').forEach(card=>card.classList.toggle('active',card.dataset.appleState===materialState));
    const hidden=document.getElementById('materialCreateState');
    if(hidden)hidden.value=materialState;
    document.querySelectorAll('[data-state-fields="ordered"]').forEach(el=>el.style.setProperty('display',materialState==='ordered'?'grid':'none','important'));
    document.querySelectorAll('[data-state-fields="stock"]').forEach(el=>el.style.setProperty('display',materialState==='stock'?'grid':'none','important'));
    updateRollPreview();
  }
  window.setAppleMaterialState=function(state){materialState=['card','ordered','stock'].includes(state)?state:'stock';syncStateUi()};
  window.setRollMaterialState=window.setAppleMaterialState;
  window.setEcoLeatherState=window.setAppleMaterialState;

  function updateRollPreview(){
    if(document.getElementById('fabricCategory')?.value==='Кожа')return;
    const prefix=materialState==='ordered'?'fabricOrdered':'fabricStock';
    const width=num(prefix+'RollWidth')||0;
    const length=num(prefix+'RollLength')||0;
    const count=num(materialState==='ordered'?'ecoOrderedRollCount':'ecoStockRollCount')||0;
    const box=document.getElementById(materialState==='ordered'?'ecoOrderedRollPreview':'ecoStockRollPreview');
    if(!box)return;
    const one=width*length,total=one*count;
    box.textContent=width>0&&length>0?`Площадь 1 рулона: ${one.toFixed(2)} м² · рулонов: ${count} · всего: ${total.toFixed(2)} м²`:'Укажите ширину и длину рулона — площадь рассчитается автоматически.';
  }
  window.updateEcoRollPreview=updateRollPreview;

  function replaceWithRollCount(host,state,attrs,found){
    const qtyInput=host?.querySelector(state==='ordered'?'#fabricOrderedQty':'#fabricQty');
    const field=qtyInput?.closest('.field');
    if(!field)return;
    const saved=state==='ordered'?Number(attrs.orderedRollCount||attrs.orderedQty||0):Number(attrs.rollCount||found?.quantity||0);
    field.innerHTML=`<label>Количество рулонов</label><input id="${state==='ordered'?'ecoOrderedRollCount':'ecoStockRollCount'}" class="input" type="number" min="0" step="1" inputmode="numeric" value="${Number.isFinite(saved)?saved:0}" oninput="updateEcoRollPreview()">`;
    const preview=document.createElement('div');
    preview.id=state==='ordered'?'ecoOrderedRollPreview':'ecoStockRollPreview';preview.className='eco-roll-preview';host.appendChild(preview);
    host.querySelectorAll('input[id$="RollWidth"],input[id$="RollLength"]').forEach(input=>input.addEventListener('input',updateRollPreview));
  }

  function replaceLeatherFields(host,state,attrs,found){
    if(!host)return;
    host.innerHTML=state==='ordered'?`
      <div class="field"><label>Площадь заказана, м²</label><input id="leatherOrderedArea" class="input" type="number" min="0" step="0.01" value="${esc(attrs.orderedQty||0)}"></div>
      <div class="field"><label>Ожидаемая дата поступления</label><input id="fabricExpectedDate" class="input" type="date" value="${esc(attrs.expectedReceiptDate||'')}"></div>
      <div class="field full"><label>№ закупки / поставщик / комментарий</label><input id="fabricPurchaseNote" class="input" value="${esc(attrs.purchaseNote||attrs.order||'')}" placeholder="PO-102 · Supplier · комментарий"></div>`:`
      <div class="field"><label>Площадь на складе, м²</label><input id="leatherStockArea" class="input" type="number" min="0" step="0.01" value="${esc(found?.quantity||0)}"></div>
      <div class="field"><label>Мин. остаток, м²</label><input id="leatherMinArea" class="input" type="number" min="0" step="0.01" value="${esc(found?.minQuantity||0)}"></div>
      <div class="field"><label>Место хранения</label><input id="fabricStorageLocation" class="input" value="${esc(attrs.storageLocation||'')}" placeholder="Стеллаж / зона"></div>
      <div class="field"><label>Цена закупки, за м²</label><input id="fabricPurchasePrice" class="input" type="number" min="0" step="0.01" value="${esc(attrs.purchasePrice||'')}"></div>
      <div class="field"><label>Дата поступления</label><input id="fabricReceiptDate" class="input" type="date" value="${esc(attrs.receiptDate||'')}"></div>`;
  }

  function todayIfEmpty(id){const input=document.getElementById(id);if(input&&!input.value)input.value=new Date().toISOString().slice(0,10)}

  function patchModal(id){
    const category=document.getElementById('fabricCategory')?.value;
    if(!['Экокожа','Ткань','Кожа'].includes(category))return;
    const wizard=document.querySelector('.material-wizard');if(!wizard)return;
    const found=id?(data.materials||[]).find(x=>String(x.id)===String(id)):null;
    const attrs=found?.attributes||{},isLeather=category==='Кожа';
    wizard.classList.add('eco-apple-flow');
    const step1=wizard.querySelector('.material-wizard-step[data-step="1"]');
    const step2=wizard.querySelector('.material-wizard-step[data-step="2"]');
    const step3=wizard.querySelector('.material-wizard-step[data-step="3"]');
    const mainGrid=step1?.querySelector('.fabric-form-grid');if(!step1||!step3||!mainGrid)return;
    const colorField=document.getElementById('fabricColor')?.closest('.field');if(colorField)mainGrid.appendChild(colorField);
    const oldState=document.getElementById('materialCreateState')?.value;
    materialState=['card','ordered','stock'].includes(oldState)?oldState:'stock';if(!id&&!oldState)materialState='stock';
    const orderedFields=step3.querySelector('[data-state-fields="ordered"]');
    const stockFields=step3.querySelector('[data-state-fields="stock"]');
    if(isLeather){replaceLeatherFields(orderedFields,'ordered',attrs,found);replaceLeatherFields(stockFields,'stock',attrs,found)}
    else{replaceWithRollCount(orderedFields,'ordered',attrs,found);replaceWithRollCount(stockFields,'stock',attrs,found)}
    const wrap=document.createElement('div');wrap.className='eco-state-wrap';
    wrap.innerHTML=`<h4 class="eco-flow-heading">Состояние материала</h4>${cardsHtml(isLeather)}<input type="hidden" id="materialCreateState" value="${materialState}"><div class="eco-state-fields" id="ecoStateFields"></div>`;
    const host=wrap.querySelector('#ecoStateFields');if(orderedFields)host.appendChild(orderedFields);if(stockFields)host.appendChild(stockFields);step1.appendChild(wrap);
    step2?.remove();step3.remove();wizard.querySelector('.wizard-steps')?.remove();step1.classList.remove('hidden');
    step1.querySelector('h4').textContent=isLeather?'Данные кожи':(category==='Ткань'?'Данные ткани':'Данные экокожи');wizard.dataset.step='1';
    ['fabricComposition','fabricDensity'].forEach(fieldId=>document.getElementById(fieldId)?.closest('.field')?.remove());
    const footer=document.getElementById('modalFoot');
    if(footer)footer.innerHTML=`<button class="btn primary" type="button" onclick="${isLeather?'saveLeatherV634':'saveRollMaterialV634'}('${id||''}')">${typeof t==='function'?t('save'):'Сохранить'}</button>`;
    const back=document.getElementById('modalBackBtn');if(back)back.onclick=()=>{if(id){closeModal();return}closeModal();setTimeout(()=>typeof openAddCategoryModal==='function'&&openAddCategoryModal(),0)};
    todayIfEmpty('fabricReceiptDate');todayIfEmpty('fabricExpectedDate');syncStateUi();
  }

  window.saveRollMaterialV634=async function(id=''){
    if(!requireAuth())return;
    const found=id?(data.materials||[]).find(x=>String(x.id)===String(id)):null,old=found?.attributes||{};
    const category=document.getElementById('fabricCategory')?.value||found?.category||'Ткань';
    const sku=(document.getElementById('fabricSku')?.value||'').trim()||nextSku(category,'',id||'');if(typeof warnFabricDuplicate==='function'&&warnFabricDuplicate())return;
    const name=(document.getElementById('fabricName')?.value||'').trim()||category,state=document.getElementById('materialCreateState')?.value||materialState;
    const width=state==='ordered'?num('fabricOrderedRollWidth'):(state==='stock'?num('fabricStockRollWidth'):Number(old.rollWidth||0));
    const length=state==='ordered'?num('fabricOrderedRollLength'):(state==='stock'?num('fabricStockRollLength'):Number(old.rollLength||0));
    const count=state==='ordered'?num('ecoOrderedRollCount'):(state==='stock'?num('ecoStockRollCount'):0),price=state==='stock'?num('fabricPurchasePrice'):0;
    if([width,length,count,price].some(v=>v===null)||!Number.isInteger(count)){toast('Значения не могут быть отрицательными. Количество рулонов должно быть целым числом.');return}
    const area=Number(((width||0)*(length||0)).toFixed(2)),totalArea=Number((area*(count||0)).toFixed(2));
    const attrs={...old,materialType:category,collection:(document.getElementById('fabricCollection')?.value||'').trim(),manufacturer:(document.getElementById('fabricManufacturer')?.value||'').trim(),color:(document.getElementById('fabricColor')?.value||old.color||'').trim(),rollWidth:width||'',rollWidthMm:width?Math.round(width*1000):'',rollLength:length||'',rollCount:state==='stock'?count:0,orderedRollCount:state==='ordered'?count:0,area:area||'',totalArea,storageLocation:state==='stock'?(document.getElementById('fabricStorageLocation')?.value||'').trim():null,receiptDate:state==='stock'?(document.getElementById('fabricReceiptDate')?.value||null):null,purchasePrice:state==='stock'?price:null,expectedReceiptDate:state==='ordered'?(document.getElementById('fabricExpectedDate')?.value||null):null,purchaseNote:state==='ordered'?(document.getElementById('fabricPurchaseNote')?.value||'').trim()||null:null,purchaseStatus:state==='ordered'?'ordered':(state==='stock'?'instock':'noorder'),orderedQty:state==='ordered'?count:0,status:state,reservedQty:Number(old.reservedQty||0)};
    const obj={id:id||null,sku,name,category,subcategory:category,attributes:attrs,unit:'рулон',quantity:state==='stock'?count:0,minQuantity:Number(found?.minQuantity||0),lastUpdated:today()};
    const ok=id?await updateMaterialInSupabase(obj):await insertMaterialToSupabase(obj);if(!ok)return;if(id){closeModal();await loadMaterialsFromSupabase();renderAll();toast(t('savedMaterial'));return}await finishMaterialSaveAndReturn(obj.sku,obj.category);
  };

  window.saveLeatherV634=async function(id=''){
    if(!requireAuth())return;
    const found=id?(data.materials||[]).find(x=>String(x.id)===String(id)):null,old=found?.attributes||{};
    const sku=(document.getElementById('fabricSku')?.value||'').trim()||nextSku('Кожа','',id||'');if(typeof warnFabricDuplicate==='function'&&warnFabricDuplicate())return;
    const name=(document.getElementById('fabricName')?.value||'').trim()||'Кожа',state=document.getElementById('materialCreateState')?.value||materialState;
    const qty=state==='stock'?num('leatherStockArea'):0,min=state==='stock'?num('leatherMinArea'):0,ordered=state==='ordered'?num('leatherOrderedArea'):0,price=state==='stock'?num('fabricPurchasePrice'):0;
    if([qty,min,ordered,price].some(v=>v===null)){toast('Площадь, минимальный остаток и цена не могут быть отрицательными.');return}
    const attrs={...old,materialType:'Кожа',collection:(document.getElementById('fabricCollection')?.value||'').trim(),manufacturer:(document.getElementById('fabricManufacturer')?.value||'').trim(),color:(document.getElementById('fabricColor')?.value||old.color||'').trim(),storageLocation:state==='stock'?(document.getElementById('fabricStorageLocation')?.value||'').trim():null,receiptDate:state==='stock'?(document.getElementById('fabricReceiptDate')?.value||null):null,purchasePrice:state==='stock'?price:null,expectedReceiptDate:state==='ordered'?(document.getElementById('fabricExpectedDate')?.value||null):null,purchaseNote:state==='ordered'?(document.getElementById('fabricPurchaseNote')?.value||'').trim()||null:null,purchaseStatus:state==='ordered'?'ordered':(state==='stock'?'instock':'noorder'),orderedQty:ordered,status:state,reservedQty:Number(old.reservedQty||0),rollWidth:null,rollLength:null,rollCount:null};
    const obj={id:id||null,sku,name,category:'Кожа',subcategory:'Кожа',attributes:attrs,unit:'м²',quantity:qty,minQuantity:min,lastUpdated:today()};
    const ok=id?await updateMaterialInSupabase(obj):await insertMaterialToSupabase(obj);if(!ok)return;if(id){closeModal();await loadMaterialsFromSupabase();renderAll();toast(t('savedMaterial'));return}await finishMaterialSaveAndReturn(obj.sku,obj.category);
  };

  function install(){
    if(installed)return true;if(typeof window.openFabricModal!=='function')return false;installed=true;ensureStyles();applyVersion();
    const original=window.openFabricModal;window.__originalFabricModalV634=original;
    window.openFabricModal=function(id=null,category='Ткань'){
      const resolved=id?(data.materials||[]).find(x=>String(x.id)===String(id))?.category:category;
      if(!['Экокожа','Ткань','Кожа'].includes(resolved))return original(id,category);
      const modal=document.querySelector('#modalBackdrop .modal');if(modal)modal.style.visibility='hidden';
      let result;try{result=original(id,category);patchModal(id)}finally{if(modal)modal.style.visibility=''}return result;
    };return true;
  }
  function boot(){applyVersion();if(install())return;let tries=0;const timer=setInterval(()=>{tries+=1;if(install()||tries>100)clearInterval(timer)},20)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
