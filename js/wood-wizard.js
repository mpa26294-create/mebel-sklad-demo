// v6.37 — Unified Wood Flow: one-screen wood form with type and unit selection.
(function(){
  const VERSION_LABEL='v6.37 - Unified Wood Flow';
  const LUMBER_TYPES=['Доска','Брус','Рейка'];
  const SHEET_TYPES=['Мебельный щит','Фанера','MDF','HDF','ДСП','OSB'];
  const ALL_TYPES=[...LUMBER_TYPES,...SHEET_TYPES,'Другое'];
  let installed=false;
  let woodState='stock';

  const esc=v=>typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'');
  const todayValue=()=>typeof today==='function'?today():new Date().toISOString().slice(0,10);
  const readNum=id=>{
    const raw=String(document.getElementById(id)?.value??'').replace(',','.').trim();
    if(raw==='')return 0;
    const n=Number(raw);
    return Number.isFinite(n)&&n>=0?n:null;
  };
  const typeOf=()=>document.getElementById('woodMaterialType')?.value||'Доска';
  const isSheetType=type=>SHEET_TYPES.includes(type);
  const isLumberType=type=>LUMBER_TYPES.includes(type);
  const unitMode=()=>isSheetType(typeOf())?'sheet':(document.getElementById('woodUnitType')?.value||'piece');

  function applyVersion(){
    document.querySelectorAll('.product-footer b,.version-badge').forEach(el=>el.textContent=VERSION_LABEL);
  }

  function ensureStyles(){
    if(document.getElementById('woodUnifiedFlowStyles'))return;
    const style=document.createElement('style');
    style.id='woodUnifiedFlowStyles';
    style.textContent=`
      .wood-unified .wood-state-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 14px}
      .wood-unified .wood-state-card{min-height:76px;border:1px solid var(--line,#e5e7eb);background:#fff;border-radius:16px;padding:13px 14px;text-align:left;cursor:pointer}
      .wood-unified .wood-state-card b{display:block;font-size:14px;margin-bottom:4px}.wood-unified .wood-state-card span{display:block;font-size:12px;color:#6b7280;line-height:1.35}
      .wood-unified .wood-state-card.active{background:#111217;color:#fff;border-color:#111217;box-shadow:0 10px 24px rgba(17,18,23,.14)}
      .wood-unified .wood-state-card.active span{color:#d1d5db}
      .wood-unit-switch{display:flex;gap:8px;padding:4px;border:1px solid var(--line,#e5e7eb);border-radius:12px;background:#f8f9fb}
      .wood-unit-switch button{flex:1;min-height:38px;border-radius:9px;background:transparent;color:#5f6672;font-weight:650}
      .wood-unit-switch button.active{background:#fff;color:#111;box-shadow:0 1px 4px rgba(16,24,40,.10)}
      .wood-calc-preview{grid-column:1/-1;padding:12px 14px;border-radius:12px;background:#ecfdf3;color:#287047;font-size:13px;font-weight:700}
      .wood-section{margin-top:16px;padding-top:16px;border-top:1px solid var(--line,#e5e7eb)}
      @media(max-width:760px){.wood-unified .wood-state-cards{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function stateCards(){
    return `<div class="wood-state-cards">
      <button class="wood-state-card" type="button" data-wood-state="card" onclick="setWoodCreateState('card')"><b>Только карточка</b><span>Создать материал без остатка.</span></button>
      <button class="wood-state-card" type="button" data-wood-state="ordered" onclick="setWoodCreateState('ordered')"><b>Заказано</b><span>Материал заказан, но ещё не поступил.</span></button>
      <button class="wood-state-card" type="button" data-wood-state="stock" onclick="setWoodCreateState('stock')"><b>На складе</b><span>Материал уже находится на складе.</span></button>
    </div>`;
  }

  function typeOptions(current){
    return ALL_TYPES.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(v)}</option>`).join('');
  }

  function setUnitMode(mode){
    const select=document.getElementById('woodUnitType');
    if(select)select.value=mode==='m3'?'m3':'piece';
    syncWoodTypeUi();
  }
  window.setWoodUnitMode=setUnitMode;

  function syncWoodTypeUi(){
    const type=typeOf();
    const sheet=isSheetType(type);
    const lumber=isLumberType(type);
    const other=type==='Другое';
    const custom=document.getElementById('woodCustomTypeField');
    if(custom)custom.style.display=other?'block':'none';
    const speciesLabel=document.getElementById('woodSpeciesLabel');
    if(speciesLabel)speciesLabel.textContent=sheet?'Порода / декор':'Порода древесины';
    const dimsTitle=document.getElementById('woodDimensionsTitle');
    if(dimsTitle)dimsTitle.textContent=sheet?'Размеры листа':'Размеры';
    const widthLabel=document.getElementById('woodWidthLabel');
    const lengthLabel=document.getElementById('woodLengthLabel');
    if(widthLabel)widthLabel.textContent=sheet?'Ширина листа, мм':'Ширина, мм';
    if(lengthLabel)lengthLabel.textContent=sheet?'Длина листа, мм':'Длина, мм';
    const unitField=document.getElementById('woodUnitField');
    if(unitField)unitField.style.display=lumber?'block':'none';
    document.querySelectorAll('[data-wood-unit-button]').forEach(btn=>btn.classList.toggle('active',btn.dataset.woodUnitButton===unitMode()));
    syncWoodState();
    updateWoodPreview();
  }
  window.syncWoodTypeUi=syncWoodTypeUi;

  function quantityLabel(prefix){
    const mode=unitMode();
    if(mode==='sheet')return `${prefix}, листов`;
    if(mode==='m3')return `${prefix}, м³`;
    return `${prefix}, шт`;
  }

  function quantityStep(){return unitMode()==='m3'?'0.001':'1';}

  function syncWoodState(){
    document.querySelectorAll('[data-wood-state]').forEach(card=>card.classList.toggle('active',card.dataset.woodState===woodState));
    const hidden=document.getElementById('woodCreateState');if(hidden)hidden.value=woodState;
    const ordered=document.getElementById('woodOrderedFields');if(ordered)ordered.style.display=woodState==='ordered'?'grid':'none';
    const stock=document.getElementById('woodStockFields');if(stock)stock.style.display=woodState==='stock'?'grid':'none';
    const orderedLabel=document.getElementById('woodOrderedLabel');if(orderedLabel)orderedLabel.textContent=quantityLabel('Заказано');
    const stockLabel=document.getElementById('woodStockLabel');if(stockLabel)stockLabel.textContent=quantityLabel('На складе');
    const minLabel=document.getElementById('woodMinLabel');if(minLabel)minLabel.textContent=quantityLabel('Мин. остаток');
    ['woodOrderedCount','woodStockCount','woodMinCount'].forEach(id=>{const el=document.getElementById(id);if(el)el.step=quantityStep();});
    const priceLabel=document.getElementById('woodPriceLabel');
    if(priceLabel)priceLabel.textContent=unitMode()==='sheet'?'Цена закупки, за лист':unitMode()==='m3'?'Цена закупки, за м³':'Цена закупки, за штуку';
    updateWoodPreview();
  }
  window.setWoodCreateState=function(state){woodState=['card','ordered','stock'].includes(state)?state:'stock';syncWoodState();};

  function updateWoodPreview(){
    const width=readNum('woodWidth')||0;
    const length=readNum('woodLength')||0;
    const thickness=readNum('woodThickness')||0;
    const qty=woodState==='ordered'?(readNum('woodOrderedCount')||0):(readNum('woodStockCount')||0);
    const box=document.getElementById('woodCalcPreview');
    if(!box)return;
    if(!(width>0&&length>0&&thickness>0)){
      box.textContent='Укажите размеры — расчёт появится автоматически.';
      return;
    }
    const area=(width/1000)*(length/1000);
    const pieceVolume=area*(thickness/1000);
    const mode=unitMode();
    if(mode==='sheet'){
      box.textContent=`Площадь 1 листа: ${area.toFixed(3)} м² · листов: ${Math.trunc(qty)} · общая площадь: ${(area*qty).toFixed(3)} м² · объём: ${(pieceVolume*qty).toFixed(4)} м³`;
    }else if(mode==='m3'){
      const approx=pieceVolume>0?Math.floor(qty/pieceVolume):0;
      box.textContent=`Объём 1 штуки: ${pieceVolume.toFixed(5)} м³ · введено: ${qty.toFixed(3)} м³ · примерно: ${approx} шт`;
    }else{
      box.textContent=`Объём 1 штуки: ${pieceVolume.toFixed(5)} м³ · штук: ${Math.trunc(qty)} · общий объём: ${(pieceVolume*qty).toFixed(4)} м³`;
    }
  }
  window.updateWoodPreview=updateWoodPreview;

  function openWoodFlow(id=null){
    if(!requireAuth())return;
    const found=id?(data.materials||[]).find(x=>String(x.id)===String(id)):null;
    const a=found?.attributes||{};
    let currentType=a.materialType||found?.subcategory||'Доска';
    if(!ALL_TYPES.includes(currentType))currentType='Другое';
    woodState=a.status||(a.purchaseStatus==='ordered'?'ordered':(Number(found?.quantity||0)>0||a.storageLocation?'stock':'card'));
    if(!id&&!a.status)woodState='stock';
    const currentUnit=isSheetType(currentType)?'sheet':(a.unitType||((found?.unit==='м³')?'m3':'piece'));
    const date=a.arrivalDate||a.receiptDate||a.expectedReceiptDate||todayValue();
    const body=`<div class="wood-unified material-wizard" data-material-id="${id||''}"><section class="wizard-card"><h4>Данные древесины</h4><div class="fabric-form-grid">
      <div class="field"><label>Название</label><input id="woodName" class="input" value="${esc(found?.name||'')}" placeholder="Например: Брус сосна 50×100×3000"></div>
      <div class="field"><label>Тип материала</label><select id="woodMaterialType" class="select" onchange="syncWoodTypeUi()">${typeOptions(currentType)}</select></div>
      <div class="field" id="woodCustomTypeField" style="display:none"><label>Укажите тип</label><input id="woodCustomType" class="input" value="${esc(a.customMaterialType||'')}"></div>
      <div class="field"><label>Артикул</label><input id="woodSku" class="input" value="${esc(found?.sku||nextSku('Древесина','',id||''))}"></div>
      <div class="field"><label id="woodSpeciesLabel">Порода древесины</label><input id="woodSpecies" class="input" value="${esc(a.woodSpecies||a.woodType||'')}" placeholder="Дуб, бук, сосна"></div>
      <div class="field"><label>Производитель / поставщик</label><input id="woodSupplier" class="input" value="${esc(a.supplier||a.manufacturer||'')}"></div>
      <div class="field full"><h4 id="woodDimensionsTitle" style="margin:4px 0 0">Размеры</h4></div>
      <div class="field"><label>Толщина, мм</label><input id="woodThickness" class="input" type="number" min="0" step="1" value="${esc(a.thickness||'')}" oninput="updateWoodPreview()"></div>
      <div class="field"><label id="woodWidthLabel">Ширина, мм</label><input id="woodWidth" class="input" type="number" min="0" step="1" value="${esc(a.width||'')}" oninput="updateWoodPreview()"></div>
      <div class="field"><label id="woodLengthLabel">Длина, мм</label><input id="woodLength" class="input" type="number" min="0" step="1" value="${esc(a.length_mm||a.length||'')}" oninput="updateWoodPreview()"></div>
      <div class="field"><label>Сорт, необязательно</label><input id="woodGrade" class="input" value="${esc(a.grade||'')}"></div>
      <div class="field" id="woodUnitField"><label>Единица учёта</label><input id="woodUnitType" type="hidden" value="${esc(currentUnit)}"><div class="wood-unit-switch"><button type="button" data-wood-unit-button="piece" onclick="setWoodUnitMode('piece')">Шт.</button><button type="button" data-wood-unit-button="m3" onclick="setWoodUnitMode('m3')">м³</button></div></div>
    </div><div class="wood-section"><h4>Состояние материала</h4>${stateCards()}<input id="woodCreateState" type="hidden" value="${woodState}">
      <div class="fabric-form-grid" id="woodOrderedFields" style="display:none">
        <div class="field"><label id="woodOrderedLabel">Заказано</label><input id="woodOrderedCount" class="input" type="number" min="0" step="1" value="${esc(a.orderedCount??a.orderedQty??0)}" oninput="updateWoodPreview()"></div>
        <div class="field"><label>Ожидаемая дата поступления</label><input id="woodExpectedDate" class="input" type="date" value="${esc(date)}"></div>
        <div class="field full"><label>№ закупки / поставщик / комментарий</label><input id="woodPurchaseNote" class="input" value="${esc(a.purchaseOrderInfo||a.purchaseNote||a.order||'')}" placeholder="PO-102 · Supplier · комментарий"></div>
      </div>
      <div class="fabric-form-grid" id="woodStockFields" style="display:none">
        <div class="field"><label id="woodStockLabel">На складе</label><input id="woodStockCount" class="input" type="number" min="0" step="1" value="${esc(a.stockCount??found?.quantity??0)}" oninput="updateWoodPreview()"></div>
        <div class="field"><label id="woodMinLabel">Мин. остаток</label><input id="woodMinCount" class="input" type="number" min="0" step="1" value="${esc(a.minStockCount??found?.minQuantity??0)}"></div>
        <div class="field"><label>Место хранения</label><input id="woodStorageLocation" class="input" value="${esc(a.storageLocation||'')}" placeholder="Стеллаж / зона"></div>
        <div class="field"><label id="woodPriceLabel">Цена закупки</label><input id="woodPurchasePrice" class="input" type="number" min="0" step="0.01" value="${esc(a.purchasePrice||'')}"></div>
        <div class="field"><label>Дата поступления</label><input id="woodReceiptDate" class="input" type="date" value="${esc(date)}"></div>
      </div>
      <div class="wood-calc-preview" id="woodCalcPreview"></div>
    </div></section></div>`;
    openModal(id?'Редактировать древесину':'Добавить древесину',body,`<button class="btn primary" type="button" onclick="saveWoodV637('${id||''}')">${typeof t==='function'?t('save'):'Сохранить'}</button>`);
    const back=document.getElementById('modalBackBtn');if(back)back.onclick=()=>{if(id){closeModal();return;}openAddCategoryModal();};
    syncWoodTypeUi();
  }

  window.saveWoodV637=async function(id=''){
    if(!requireAuth())return;
    const found=id?(data.materials||[]).find(x=>String(x.id)===String(id)):null;
    const old=found?.attributes||{};
    const width=readNum('woodWidth'),length=readNum('woodLength'),thickness=readNum('woodThickness');
    const state=document.getElementById('woodCreateState')?.value||woodState;
    const mode=unitMode();
    const stock=state==='stock'?readNum('woodStockCount'):0;
    const min=state==='stock'?readNum('woodMinCount'):0;
    const ordered=state==='ordered'?readNum('woodOrderedCount'):0;
    const price=state==='stock'?readNum('woodPurchasePrice'):0;
    if([width,length,thickness,stock,min,ordered,price].some(v=>v===null)){toast('Значения не могут быть отрицательными.');return;}
    if(mode!=='m3'&&![stock,min,ordered].every(Number.isInteger)){toast('Количество должно быть целым числом.');return;}
    if(!(width>0&&length>0&&thickness>0)){toast('Укажите толщину, ширину и длину.');return;}
    const selectedType=typeOf();
    const custom=(document.getElementById('woodCustomType')?.value||'').trim();
    const materialType=selectedType==='Другое'?(custom||'Другое'):selectedType;
    const area=Number((((width||0)/1000)*((length||0)/1000)).toFixed(6));
    const pieceVolume=Number((area*((thickness||0)/1000)).toFixed(8));
    const count=state==='ordered'?ordered:stock;
    const totalArea=mode==='sheet'?Number((area*count).toFixed(6)):null;
    const totalVolume=mode==='m3'?Number(count.toFixed(6)):Number((pieceVolume*count).toFixed(6));
    const approxPieces=mode==='m3'&&pieceVolume>0?Math.floor(count/pieceVolume):null;
    const species=(document.getElementById('woodSpecies')?.value||'').trim();
    const sku=(document.getElementById('woodSku')?.value||'').trim()||nextSku('Древесина','',id||'');
    const name=(document.getElementById('woodName')?.value||'').trim()||[materialType,species,`${thickness}×${width}×${length}`].filter(Boolean).join(' ');
    const attrs={...old,status:state,materialType,customMaterialType:selectedType==='Другое'?custom:null,unitType:mode,woodSpecies:species,woodType:species,supplier:(document.getElementById('woodSupplier')?.value||'').trim(),manufacturer:(document.getElementById('woodSupplier')?.value||'').trim(),thickness,width,length,length_mm:length,grade:(document.getElementById('woodGrade')?.value||'').trim(),stockCount:state==='stock'?stock:0,minStockCount:state==='stock'?min:0,orderedCount:state==='ordered'?ordered:0,pieceVolume,totalVolume,sheetArea:mode==='sheet'?area:null,totalArea,approxPieces,storageLocation:state==='stock'?(document.getElementById('woodStorageLocation')?.value||'').trim()||null:null,purchasePrice:state==='stock'?price:null,receiptDate:state==='stock'?(document.getElementById('woodReceiptDate')?.value||null):null,expectedReceiptDate:state==='ordered'?(document.getElementById('woodExpectedDate')?.value||null):null,purchaseOrderInfo:state==='ordered'?(document.getElementById('woodPurchaseNote')?.value||'').trim()||null:null,purchaseNote:state==='ordered'?(document.getElementById('woodPurchaseNote')?.value||'').trim()||null:null,purchaseStatus:state==='ordered'?'ordered':(state==='stock'?'instock':'noorder'),orderedQty:state==='ordered'?ordered:0,reservedQty:Number(old.reservedQty||0)};
    const unit=mode==='sheet'?'лист':mode==='m3'?'м³':'шт';
    const obj={id:id||null,sku,name,category:'Древесина',subcategory:materialType,attributes:attrs,unit,quantity:state==='stock'?stock:0,minQuantity:state==='stock'?min:0,lastUpdated:todayValue()};
    const ok=id?await updateMaterialInSupabase(obj):await insertMaterialToSupabase(obj);if(!ok)return;
    if(id){closeModal();await loadMaterialsFromSupabase();renderAll();toast(t('savedMaterial'));return;}
    await finishMaterialSaveAndReturn(obj.sku,obj.category);
  };

  function install(){
    if(installed)return true;
    if(typeof window.openWoodModal!=='function')return false;
    installed=true;ensureStyles();applyVersion();
    window.__originalWoodModalV637=window.openWoodModal;
    window.openWoodModal=function(id=null){return openWoodFlow(id);};
    window.saveWoodMaterial=window.saveWoodV637;
    return true;
  }
  function boot(){applyVersion();if(install())return;let tries=0;const timer=setInterval(()=>{tries+=1;if(install()||tries>100)clearInterval(timer)},20)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();