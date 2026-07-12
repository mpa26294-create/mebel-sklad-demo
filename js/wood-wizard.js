// v6.35 — Apple Wood Flow: piece and sheet storage.
(function(){
  const VERSION_LABEL='v6.35 - Apple Wood Flow';
  let installed=false;
  let woodState='stock';
  let woodMode='piece';

  const esc=v=>typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'');
  const readNum=id=>{
    const raw=String(document.getElementById(id)?.value??'').replace(',','.');
    if(raw==='')return 0;
    const n=Number(raw);
    return Number.isFinite(n)&&n>=0?n:null;
  };
  const todayValue=()=>typeof today==='function'?today():new Date().toISOString().slice(0,10);

  function applyVersion(){
    document.querySelectorAll('.product-footer b,.version-badge').forEach(el=>el.textContent=VERSION_LABEL);
  }

  function ensureStyles(){
    if(document.getElementById('woodAppleFlowStyles'))return;
    const style=document.createElement('style');
    style.id='woodAppleFlowStyles';
    style.textContent=`
      .wood-choice-wrap{padding:10px 0 4px;text-align:center}
      .wood-choice-wrap h3{margin:0 0 8px;font-size:24px}
      .wood-choice-wrap p{margin:0 0 22px}
      .wood-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .wood-choice-card{display:flex;align-items:center;gap:14px;min-height:112px;padding:18px;border:1px solid var(--line,#e5e7eb);border-radius:18px;background:#fff;text-align:left;cursor:pointer}
      .wood-choice-card:hover{border-color:#cfd5df;box-shadow:0 10px 26px rgba(16,24,40,.08)}
      .wood-choice-icon{width:48px;height:48px;border-radius:14px;background:#f3f4f6;display:grid;place-items:center;font-size:24px}
      .wood-choice-card b{display:block;font-size:16px;margin-bottom:4px}.wood-choice-card span{font-size:12px;color:#6b7280;line-height:1.4}
      .wood-flow .wizard-card{padding:18px!important}
      .wood-flow .wood-state-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 14px}
      .wood-flow .wood-state-card{min-height:76px;border:1px solid var(--line,#e5e7eb);background:#fff;border-radius:16px;padding:13px 14px;text-align:left;cursor:pointer}
      .wood-flow .wood-state-card b{display:block;font-size:14px;margin-bottom:4px}.wood-flow .wood-state-card span{display:block;font-size:12px;color:#6b7280;line-height:1.35}
      .wood-flow .wood-state-card.active{background:#111217;color:#fff;border-color:#111217;box-shadow:0 10px 24px rgba(17,18,23,.14)}
      .wood-flow .wood-state-card.active span{color:#d1d5db}
      .wood-calc-preview{grid-column:1/-1;padding:12px 14px;border-radius:12px;background:#ecfdf3;color:#287047;font-size:13px;font-weight:700}
      .wood-section{margin-top:16px;padding-top:16px;border-top:1px solid var(--line,#e5e7eb)}
      @media(max-width:760px){.wood-choice-grid,.wood-flow .wood-state-cards{grid-template-columns:1fr}}
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

  function updatePreview(){
    const width=readNum('woodWidth')||0;
    const length=readNum('woodLength')||0;
    const thickness=readNum('woodThickness')||0;
    const count=woodState==='ordered'?(readNum('woodOrderedCount')||0):(readNum('woodStockCount')||0);
    const box=document.getElementById('woodCalcPreview');
    if(!box)return;
    if(!(width>0&&length>0&&thickness>0)){
      box.textContent='Укажите размеры — расчёт появится автоматически.';
      return;
    }
    const area=(width/1000)*(length/1000);
    const volume=area*(thickness/1000);
    box.textContent=woodMode==='sheet'
      ? `Площадь 1 листа: ${area.toFixed(3)} м² · листов: ${count} · всего: ${(area*count).toFixed(3)} м²`
      : `Объём 1 штуки: ${volume.toFixed(5)} м³ · штук: ${count} · всего: ${(volume*count).toFixed(4)} м³`;
  }
  window.updateWoodPreview=updatePreview;

  function syncState(){
    document.querySelectorAll('[data-wood-state]').forEach(card=>card.classList.toggle('active',card.dataset.woodState===woodState));
    const hidden=document.getElementById('woodCreateState');if(hidden)hidden.value=woodState;
    const ordered=document.getElementById('woodOrderedFields');if(ordered)ordered.style.display=woodState==='ordered'?'grid':'none';
    const stock=document.getElementById('woodStockFields');if(stock)stock.style.display=woodState==='stock'?'grid':'none';
    updatePreview();
  }
  window.setWoodCreateState=function(state){woodState=['card','ordered','stock'].includes(state)?state:'stock';syncState();};

  function openChoice(){
    const body=`<div class="wood-choice-wrap"><h3>Как хранится материал?</h3><p class="muted">Выберите вариант. Остальные поля настроятся автоматически.</p><div class="wood-choice-grid">
      <button class="wood-choice-card" type="button" onclick="chooseWoodStorage('piece')"><div class="wood-choice-icon">▤</div><div><b>Поштучно</b><span>Доска, брус, рейка, мебельный щит</span></div></button>
      <button class="wood-choice-card" type="button" onclick="chooseWoodStorage('sheet')"><div class="wood-choice-icon">▦</div><div><b>Листами</b><span>Фанера, МДФ, ДСП, ДВП, OSB</span></div></button>
    </div></div>`;
    openModal('Добавить древесный материал',body,`<button class="btn" onclick="closeModal()">${typeof t==='function'?t('cancel'):'Отмена'}</button>`);
  }

  window.chooseWoodStorage=function(mode){woodMode=mode==='sheet'?'sheet':'piece';openWoodFlow(null,woodMode);};

  function openWoodFlow(id=null,forcedMode=''){
    if(!requireAuth())return;
    const found=id?(data.materials||[]).find(x=>String(x.id)===String(id)):null;
    const a=found?.attributes||{};
    woodMode=forcedMode||a.storageMode||(['Фанера','МДФ','ДСП','ДВП','OSB','Мебельный щит'].includes(found?.subcategory)?'sheet':'piece');
    woodState=a.status||(a.purchaseStatus==='ordered'?'ordered':(Number(found?.quantity||0)>0||a.storageLocation?'stock':'card'));
    if(!id&&!a.status)woodState='stock';
    const countLabel=woodMode==='sheet'?'листов':'шт';
    const priceLabel=woodMode==='sheet'?'Цена закупки, за лист':'Цена закупки, за штуку';
    const date=a.arrivalDate||a.receiptDate||a.expectedReceiptDate||todayValue();
    const body=`<div class="wood-flow material-wizard" data-material-id="${id||''}"><section class="wizard-card"><h4>${woodMode==='sheet'?'Данные листового материала':'Данные пиломатериала'}</h4><div class="fabric-form-grid">
      <div class="field"><label>Название</label><input id="woodName" class="input" value="${esc(found?.name||'')}" placeholder="Например: Брус сосна 50×100×3000"></div>
      <div class="field"><label>Артикул</label><input id="woodSku" class="input" value="${esc(found?.sku||nextSku('Древесина','',id||''))}"></div>
      <div class="field"><label>${woodMode==='sheet'?'Тип материала':'Порода древесины'}</label><input id="woodSpecies" class="input" value="${esc(a.woodSpecies||a.woodType||a.materialType||found?.subcategory||'')}" placeholder="${woodMode==='sheet'?'Фанера, МДФ, OSB':'Дуб, бук, сосна'}"></div>
      <div class="field"><label>Производитель / поставщик</label><input id="woodSupplier" class="input" value="${esc(a.supplier||a.manufacturer||'')}"></div>
      <div class="field"><label>Толщина, мм</label><input id="woodThickness" class="input" type="number" min="0" step="1" value="${esc(a.thickness||'')}" oninput="updateWoodPreview()"></div>
      <div class="field"><label>Ширина, мм</label><input id="woodWidth" class="input" type="number" min="0" step="1" value="${esc(a.width||'')}" oninput="updateWoodPreview()"></div>
      <div class="field"><label>Длина, мм</label><input id="woodLength" class="input" type="number" min="0" step="1" value="${esc(a.length_mm||a.length||'')}" oninput="updateWoodPreview()"></div>
      <div class="field"><label>Сорт, необязательно</label><input id="woodGrade" class="input" value="${esc(a.grade||'')}"></div>
    </div><div class="wood-section"><h4>Состояние материала</h4>${stateCards()}<input id="woodCreateState" type="hidden" value="${woodState}">
      <div class="fabric-form-grid" id="woodOrderedFields" style="display:none">
        <div class="field"><label>Заказано, ${countLabel}</label><input id="woodOrderedCount" class="input" type="number" min="0" step="1" value="${esc(a.orderedCount||a.orderedQty||0)}" oninput="updateWoodPreview()"></div>
        <div class="field"><label>Ожидаемая дата поступления</label><input id="woodExpectedDate" class="input" type="date" value="${esc(date)}"></div>
        <div class="field full"><label>№ закупки / поставщик / комментарий</label><input id="woodPurchaseNote" class="input" value="${esc(a.purchaseOrderInfo||a.purchaseNote||a.order||'')}" placeholder="PO-102 · Supplier · комментарий"></div>
      </div>
      <div class="fabric-form-grid" id="woodStockFields" style="display:none">
        <div class="field"><label>На складе, ${countLabel}</label><input id="woodStockCount" class="input" type="number" min="0" step="1" value="${esc(a.stockCount??found?.quantity??0)}" oninput="updateWoodPreview()"></div>
        <div class="field"><label>Мин. остаток, ${countLabel}</label><input id="woodMinCount" class="input" type="number" min="0" step="1" value="${esc(a.minStockCount??found?.minQuantity??0)}"></div>
        <div class="field"><label>Место хранения</label><input id="woodStorageLocation" class="input" value="${esc(a.storageLocation||'')}" placeholder="Стеллаж / зона"></div>
        <div class="field"><label>${priceLabel}</label><input id="woodPurchasePrice" class="input" type="number" min="0" step="0.01" value="${esc(a.purchasePrice||'')}"></div>
        <div class="field"><label>Дата поступления</label><input id="woodReceiptDate" class="input" type="date" value="${esc(date)}"></div>
      </div>
      <div class="wood-calc-preview" id="woodCalcPreview"></div>
    </div></section></div>`;
    openModal(id?'Редактировать древесину':'Добавить древесный материал',body,`<button class="btn primary" type="button" onclick="saveWoodV635('${id||''}')">${typeof t==='function'?t('save'):'Сохранить'}</button>`);
    const back=document.getElementById('modalBackBtn');if(back)back.onclick=()=>{if(id){closeModal();return;}openChoice();};
    syncState();
  }

  window.saveWoodV635=async function(id=''){
    if(!requireAuth())return;
    const found=id?(data.materials||[]).find(x=>String(x.id)===String(id)):null;
    const old=found?.attributes||{};
    const width=readNum('woodWidth'),length=readNum('woodLength'),thickness=readNum('woodThickness');
    const state=document.getElementById('woodCreateState')?.value||woodState;
    const stock=state==='stock'?readNum('woodStockCount'):0;
    const min=state==='stock'?readNum('woodMinCount'):0;
    const ordered=state==='ordered'?readNum('woodOrderedCount'):0;
    const price=state==='stock'?readNum('woodPurchasePrice'):0;
    if([width,length,thickness,stock,min,ordered,price].some(v=>v===null)||![stock,min,ordered].every(Number.isInteger)){
      toast('Размеры и цена не могут быть отрицательными. Количество должно быть целым числом.');return;
    }
    const area=Number((((width||0)/1000)*((length||0)/1000)).toFixed(4));
    const volume=Number((area*((thickness||0)/1000)).toFixed(6));
    const count=state==='ordered'?ordered:stock;
    const species=(document.getElementById('woodSpecies')?.value||'').trim();
    const type=woodMode==='sheet'?(species||'Листовой материал'):'Пиломатериал';
    const sku=(document.getElementById('woodSku')?.value||'').trim()||nextSku('Древесина','',id||'');
    const name=(document.getElementById('woodName')?.value||'').trim()||[type,species,width&&thickness&&length?`${thickness}×${width}×${length}`:''].filter(Boolean).join(' ');
    const attrs={...old,storageMode:woodMode,status:state,materialType:type,woodSpecies:species,woodType:species,supplier:(document.getElementById('woodSupplier')?.value||'').trim(),manufacturer:(document.getElementById('woodSupplier')?.value||'').trim(),thickness,width,length,length_mm:length,grade:(document.getElementById('woodGrade')?.value||'').trim(),stockCount:state==='stock'?stock:0,minStockCount:state==='stock'?min:0,orderedCount:state==='ordered'?ordered:0,areaPerItem:area,volumePerItem:volume,totalArea:woodMode==='sheet'?Number((area*count).toFixed(4)):null,totalVolume:Number((volume*count).toFixed(5)),storageLocation:state==='stock'?(document.getElementById('woodStorageLocation')?.value||'').trim()||null:null,purchasePrice:state==='stock'?price:null,receiptDate:state==='stock'?(document.getElementById('woodReceiptDate')?.value||null):null,expectedReceiptDate:state==='ordered'?(document.getElementById('woodExpectedDate')?.value||null):null,purchaseOrderInfo:state==='ordered'?(document.getElementById('woodPurchaseNote')?.value||'').trim()||null:null,purchaseNote:state==='ordered'?(document.getElementById('woodPurchaseNote')?.value||'').trim()||null:null,purchaseStatus:state==='ordered'?'ordered':(state==='stock'?'instock':'noorder'),orderedQty:state==='ordered'?ordered:0,reservedQty:Number(old.reservedQty||0)};
    const unit=woodMode==='sheet'?'лист':'шт';
    const obj={id:id||null,sku,name,category:'Древесина',subcategory:type,attributes:attrs,unit,quantity:state==='stock'?stock:0,minQuantity:state==='stock'?min:0,lastUpdated:todayValue()};
    const ok=id?await updateMaterialInSupabase(obj):await insertMaterialToSupabase(obj);if(!ok)return;
    if(id){closeModal();await loadMaterialsFromSupabase();renderAll();toast(t('savedMaterial'));return;}
    await finishMaterialSaveAndReturn(obj.sku,obj.category);
  };

  function install(){
    if(installed)return true;
    if(typeof window.openWoodModal!=='function')return false;
    installed=true;ensureStyles();applyVersion();
    window.__originalWoodModalV635=window.openWoodModal;
    window.openWoodModal=function(id=null){if(id)return openWoodFlow(id);openChoice();};
    window.saveWoodMaterial=window.saveWoodV635;
    return true;
  }
  function boot(){applyVersion();if(install())return;let tries=0;const timer=setInterval(()=>{tries+=1;if(install()||tries>100)clearInterval(timer)},20)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();