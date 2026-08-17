// v6.40 — Unified Wood Group Picker: choose lumber or sheet materials before opening the form.
(function(){
  const LUMBER_TYPES=['Доска','Брус','Рейка','Мебельный щит'];
  const SHEET_TYPES=['Фанера','MDF','HDF','ДСП','ДВП','OSB'];
  // v7.30: «Детали» — третья группа (готовые раскроенные заготовки). Материал детали намеренно
  // выбирается из тех же названий, что и у листовых/пиломатериалов (Фанера, Мебельный щит и т.д.) —
  // плюс «Массив дерева» для «просто дерево». Из-за этого пересечения ниже группа материала больше
  // не выводится из одного только названия типа (см. isSheetType/isLumberType) — она либо передаётся
  // явно при открытии формы, либо (для уже сохранённых материалов) читается из attributes.materialKind.
  const PART_TYPES=['Фанера','MDF','HDF','ДСП','ДВП','OSB','Мебельный щит','Массив дерева'];
  const ALL_TYPES=[...new Set([...LUMBER_TYPES,...SHEET_TYPES,...PART_TYPES,'Другое'])];
  let installed=false;
  let woodState='stock';
  let woodGroup='lumber';

  const esc=v=>typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'');
  const todayValue=()=>typeof today==='function'?today():new Date().toISOString().slice(0,10);
  const readNum=id=>{
    const raw=String(document.getElementById(id)?.value??'').replace(',','.').trim();
    if(raw==='')return 0;
    const n=Number(raw);
    return Number.isFinite(n)&&n>=0?n:null;
  };
  const typeOf=()=>document.getElementById('woodMaterialType')?.value||'Доска';
  const isSheetType=type=>SHEET_TYPES.includes(type)||type==='Другое';
  const isLumberType=type=>LUMBER_TYPES.includes(type);
  const isPartType=type=>PART_TYPES.includes(type)||type==='Другое';
  // v7.29: у листовых материалов (Фанера/MDF/HDF/ДСП/ДВП/OSB/Другое) единица учёта раньше была
  // жёстко зашита как «листы» (переключатель шт/м³ вообще скрывался). Теперь для них тоже есть
  // выбор — «Шт.» (листов) или «м²» (площадь), по аналогии с шт/м³ у пиломатериалов.
  // v7.30: раньше эта функция сама решала «листовой ли это тип» по названию типа (isSheetType) —
  // это ломалось для «Деталей», у которых те же названия типов (Фанера и т.д.) означают материал
  // детали, а не сам лист. Теперь единица учёта всегда определяется по woodGroup (известной группе
  // текущей открытой формы), а не заново по названию типа.
  const unitMode=()=>{
    if(woodGroup==='part')return 'piece';
    const raw=document.getElementById('woodUnitType')?.value||'piece';
    if(woodGroup==='sheet')return raw==='m2'?'m2':'piece';
    return raw==='m3'?'m3':'piece';
  };

  function applyVersion(){
    if(typeof applyBuildVersion==='function')applyBuildVersion();
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
      .wood-unit-switch button{flex:1;min-height:38px;border-radius:9px;background:transparent;color:#5f6672;font-weight:650;border:none;cursor:pointer}
      .wood-unit-switch button.active{background:#fff;color:#111;box-shadow:0 1px 4px rgba(16,24,40,.10)}
      .wood-calc-preview{grid-column:1/-1;padding:12px 14px;border-radius:12px;background:#ecfdf3;color:#287047;font-size:13px;font-weight:700}
      .wood-section{margin-top:16px;padding-top:16px;border-top:1px solid var(--line,#e5e7eb)}
      .wood-type-groups{display:flex;flex-direction:column;gap:0;border:1px solid var(--line,#e5e7eb);border-radius:14px;overflow:hidden;background:#fff}
      .wood-type-group{padding:12px 14px 14px}
      .wood-type-group+.wood-type-group{border-top:1px solid var(--line,#e5e7eb);background:#fafbfc}
      .wood-type-group-label{font-size:11px;text-transform:uppercase;letter-spacing:.055em;color:#7c8491;font-weight:650;margin-bottom:10px}
      .wood-type-chips{display:flex;flex-wrap:wrap;gap:8px}
      .wood-type-chip{min-height:36px;padding:0 14px;border:1px solid var(--line,#e5e7eb);border-radius:10px;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s,border-color .15s,color .15s}
      .wood-type-chip:hover{background:#f8f9fb;border-color:#d1d5db}
      .wood-type-chip.active{background:#111217;color:#fff;border-color:#111217;box-shadow:0 4px 12px rgba(17,18,23,.12)}
      .modal.wood-group-select{width:min(880px,96vw)!important}
      .modal.wood-group-select .modal-body{padding:28px 26px 30px!important}
      .modal.wood-group-select .modal-foot{display:none!important}
      .wood-group-picker{padding:4px 0 2px}
      .wood-group-intro{text-align:center;margin-bottom:22px}
      .wood-group-intro h4{margin:0 0 7px;font-size:24px;font-weight:700;letter-spacing:-.035em;color:#111}
      .wood-group-intro p{margin:0;color:#737b88;font-size:13px}
      .wood-group-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
      .wood-group-card{width:100%;min-height:80px;border:1px solid var(--line,#e5e7eb);border-radius:15px;padding:14px 16px;display:grid;grid-template-columns:38px 1fr 20px;align-items:center;gap:12px;text-align:left;background:#fff;transition:background .16s ease,border-color .16s ease,transform .16s ease}
      .wood-group-card:hover{background:#fafafa;border-color:#d5dae2;transform:translateY(-1px)}
      .wood-group-card.lumber,.wood-group-card.sheet,.wood-group-card.part{background:#fff;border-color:var(--line,#e5e7eb)}
      .wood-group-icon{width:38px;height:38px;border:1px solid #e8ebf0;border-radius:11px;background:#fbfcfd;display:grid;place-items:center;color:#5f6672}
      .wood-group-icon svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
      .wood-group-copy b{display:block;font-size:15px;font-weight:650;letter-spacing:-.02em;color:#17181b;margin-bottom:3px}
      .wood-group-copy span{display:block;color:#737b88;font-size:12px;line-height:1.35}
      .wood-group-arrow{font-size:24px;color:#7b8390;font-weight:300;text-align:right}
      .wood-group-note{display:none}
      @media(max-width:760px){.wood-unified .wood-state-cards{grid-template-columns:1fr}.wood-group-list{grid-template-columns:1fr}.wood-group-card{min-height:76px}.modal.wood-group-select .modal-body{padding:22px 16px 24px!important}}
    `;
    document.head.appendChild(style);
  }

  const tt=(k,f)=>typeof t==='function'?t(k):f;
  function stateCards(){
    return `<div class="wood-state-cards">
      <button class="wood-state-card" type="button" data-wood-state="card" onclick="setWoodCreateState('card')"><b>${tt('woodOnlyCardTitle','Только карточка')}</b><span>${tt('woodOnlyCardHint','Создать материал без остатка.')}</span></button>
      <button class="wood-state-card" type="button" data-wood-state="ordered" onclick="setWoodCreateState('ordered')"><b>${tt('woodOrderedTitle','Заказано')}</b><span>${tt('woodOrderedHint','Материал заказан, но ещё не поступил.')}</span></button>
      <button class="wood-state-card" type="button" data-wood-state="stock" onclick="setWoodCreateState('stock')"><b>${tt('woodInStockTitle','На складе')}</b><span>${tt('woodInStockHint','Материал уже находится на складе.')}</span></button>
    </div>`;
  }

  function typeGroup(label, types, current){
    const chips=types.map(v=>`<button type="button" class="wood-type-chip${v===current?' active':''}" data-wood-type="${esc(v)}" onclick="setWoodMaterialType('${esc(v)}')">${esc(typeof woodTypeLabel==='function'?woodTypeLabel(v):v)}</button>`).join('');
    return `<div class="wood-type-group"><div class="wood-type-group-label">${esc(label)}</div><div class="wood-type-chips">${chips}</div></div>`;
  }

  function typePicker(current, group=woodGroup){
    const types=group==='sheet'?[...SHEET_TYPES,'Другое']:group==='part'?[...PART_TYPES,'Другое']:LUMBER_TYPES;
    const label=group==='sheet'?tt('woodSheetTypeLabel','Тип листового материала'):group==='part'?tt('woodPartTypeLabel','Материал детали'):tt('woodLumberTypeLabel','Тип пиломатериала');
    return `<div class="wood-type-groups">${typeGroup(label,types,current)}</div>`;
  }

  function groupIcon(group){
    const svg=group==='sheet'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="1.5"/><path d="M8 7h8M8 10h8M8 13h8M8 16h8"/></svg>'
      : group==='part'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="9" height="9" rx="1.3"/><rect x="15" y="13" width="6" height="6" rx="1.1"/><path d="M13 8.5h4M8.5 13v4" stroke-dasharray="1.6 1.8"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14v4H5zM7 10h10v4H7zM5 14h14v4H5z"/></svg>';
    return `<span class="wood-group-icon">${svg}</span>`;
  }

  function openWoodGroupPicker(){
    if(!requireAuth())return;
    const body=`<div class="wood-group-picker">
      <div class="wood-group-intro"><h4>${tt('woodPickerQuestion','Какой материал хотите добавить?')}</h4><p>${tt('woodPickerHint','Выберите один вариант. Остальные поля настроятся автоматически.')}</p></div>
      <div class="wood-group-list">
        <button class="wood-group-card lumber" type="button" onclick="openWoodGroupForm('lumber')">${groupIcon('lumber')}<span class="wood-group-copy"><b>${tt('woodLumberGroupTitle','Пиломатериалы')}</b><span>${tt('woodLumberGroupDesc','Доска, брус, рейка, мебельный щит')}</span></span><span class="wood-group-arrow">›</span></button>
        <button class="wood-group-card sheet" type="button" onclick="openWoodGroupForm('sheet')">${groupIcon('sheet')}<span class="wood-group-copy"><b>${tt('woodSheetGroupTitle','Листовые материалы')}</b><span>${tt('woodSheetGroupDesc','Фанера, MDF, HDF, ДСП, ДВП, OSB')}</span></span><span class="wood-group-arrow">›</span></button>
        <button class="wood-group-card part" type="button" onclick="openWoodGroupForm('part')">${groupIcon('part')}<span class="wood-group-copy"><b>${tt('woodPartGroupTitle','Детали')}</b><span>${tt('woodPartGroupDesc','Готовые заготовки: фанера, щит, массив и т.д.')}</span></span><span class="wood-group-arrow">›</span></button>
      </div>
    </div>`;
    openModal(tt('addWoodTitle','Добавить древесину'),body,'');
    const modal=document.querySelector('#modalBackdrop .modal');
    modal?.classList.add('wood-group-select');
    const back=document.getElementById('modalBackBtn');
    if(back)back.onclick=()=>{if(typeof goBackModal==='function')goBackModal();else openAddCategoryModal();};
  }
  window.openWoodGroupPicker=openWoodGroupPicker;
  window.openWoodGroupForm=function(group){
    woodGroup=group==='sheet'?'sheet':group==='part'?'part':'lumber';
    openWoodFlow(null,woodGroup);
  };

  function setWoodMaterialType(type){
    const hidden=document.getElementById('woodMaterialType');
    if(hidden)hidden.value=type;
    syncWoodTypeUi();
  }
  window.setWoodMaterialType=setWoodMaterialType;

  function setUnitMode(mode){
    const select=document.getElementById('woodUnitType');
    if(select)select.value=(mode==='m3'||mode==='m2')?mode:'piece';
    syncWoodTypeUi();
  }
  window.setWoodUnitMode=setUnitMode;

  function syncWoodTypeUi(){
    const type=typeOf();
    const isSheet=woodGroup==='sheet';
    const isPart=woodGroup==='part';
    const other=type==='Другое';
    document.querySelectorAll('[data-wood-type]').forEach(btn=>btn.classList.toggle('active',btn.dataset.woodType===type));
    const custom=document.getElementById('woodCustomTypeField');
    if(custom)custom.style.display=other?'block':'none';
    const speciesLabel=document.getElementById('woodSpeciesLabel');
    if(speciesLabel)speciesLabel.textContent=(isSheet||isPart)?tt('woodSpeciesDecorLabel','Порода / декор'):tt('woodSpeciesLabel','Порода древесины');
    const dimsTitle=document.getElementById('woodDimensionsTitle');
    if(dimsTitle)dimsTitle.textContent=isPart?tt('woodPartDimensionsTitle','Размеры детали'):isSheet?tt('woodSheetDimensionsTitle','Размеры листа'):tt('woodDimensionsTitle','Размеры');
    const widthLabel=document.getElementById('woodWidthLabel');
    const lengthLabel=document.getElementById('woodLengthLabel');
    if(widthLabel)widthLabel.textContent=isPart?tt('woodPartWidthLabel','Ширина детали, мм'):isSheet?tt('woodSheetWidthLabel','Ширина листа, мм'):tt('woodWidthLabel','Ширина, мм');
    if(lengthLabel)lengthLabel.textContent=isPart?tt('woodPartLengthLabel','Длина детали, мм'):isSheet?tt('woodSheetLengthLabel','Длина листа, мм'):tt('woodLengthLabel','Длина, мм');
    const unitField=document.getElementById('woodUnitField');
    // v7.29: раньше поле «Единица учёта» скрывалось для листовых материалов (учёт был жёстко
    // «в листах»). Теперь выбор доступен и для них (шт/м²), так что поле всегда видно.
    // v7.30: у «Деталей» выбора нет вообще — единица всегда «шт.», поле скрыто целиком (в отличие
    // от листовых, где выбор реален).
    if(unitField)unitField.style.display=isPart?'none':'block';
    const select=document.getElementById('woodUnitType');
    if(select&&!select.value)select.value='piece';
    document.querySelectorAll('[data-wood-unit-button]').forEach(btn=>btn.classList.toggle('active',btn.dataset.woodUnitButton===unitMode()));
    syncWoodState();
    updateWoodPreview();
  }
  window.syncWoodTypeUi=syncWoodTypeUi;

  function quantityLabel(prefix){
    const mode=unitMode();
    if(mode==='m2')return `${prefix}, м²`;
    if(mode==='m3')return `${prefix}, м³`;
    if(woodGroup==='sheet')return `${prefix}, ${tt('sheetsUnitSuffix','листов')}`;
    return `${prefix}, ${tt('pcsUnitSuffix','шт')}`;
  }

  function quantityStep(){const m=unitMode();return (m==='m3'||m==='m2')?'0.001':'1';}

  function syncWoodState(){
    document.querySelectorAll('[data-wood-state]').forEach(card=>card.classList.toggle('active',card.dataset.woodState===woodState));
    const hidden=document.getElementById('woodCreateState');if(hidden)hidden.value=woodState;
    const ordered=document.getElementById('woodOrderedFields');if(ordered)ordered.style.display=woodState==='ordered'?'grid':'none';
    const stock=document.getElementById('woodStockFields');if(stock)stock.style.display=woodState==='stock'?'grid':'none';
    const orderedLabel=document.getElementById('woodOrderedLabel');if(orderedLabel)orderedLabel.textContent=quantityLabel(tt('woodOrderedTitle','Заказано'));
    const stockLabel=document.getElementById('woodStockLabel');if(stockLabel)stockLabel.textContent=quantityLabel(tt('woodInStockTitle','На складе'));
    const minLabel=document.getElementById('woodMinLabel');if(minLabel)minLabel.textContent=quantityLabel(tt('minQuantity','Мин. остаток'));
    ['woodOrderedCount','woodStockCount','woodMinCount'].forEach(id=>{const el=document.getElementById(id);if(el)el.step=quantityStep();});
    const priceLabel=document.getElementById('woodPriceLabel');
    if(priceLabel){
      const mode=unitMode();
      priceLabel.textContent=mode==='m2'?tt('priceForM2','Цена закупки, за м²'):mode==='m3'?tt('priceForM3','Цена закупки, за м³'):woodGroup==='sheet'?tt('priceForSheet','Цена закупки, за лист'):tt('priceForPiece','Цена закупки, за штуку');
    }
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
      box.textContent=tt('woodSpecifySizesHint','Укажите размеры — расчёт появится автоматически.');
      return;
    }
    const area=(width/1000)*(length/1000);
    const pieceVolume=area*(thickness/1000);
    const mode=unitMode();
    if(mode==='piece'&&woodGroup==='sheet'){
      box.textContent=`${tt('woodPreviewSheet','Площадь 1 листа')}: ${area.toFixed(3)} м² · ${tt('woodPreviewSheetsCount','листов')}: ${Math.trunc(qty)} · ${tt('woodPreviewTotalArea','общая площадь')}: ${(area*qty).toFixed(3)} м²`;
    }else if(mode==='m2'){
      const approx=area>0?Math.floor(qty/area):0;
      box.textContent=`${tt('woodPreviewSheet','Площадь 1 листа')}: ${area.toFixed(3)} м² · ${tt('woodPreviewEntered','введено')}: ${qty.toFixed(3)} м² · ${tt('woodPreviewApprox','примерно')}: ${approx} ${tt('sheetsUnitSuffix','листов')}`;
    }else if(mode==='m3'){
      const approx=pieceVolume>0?Math.floor(qty/pieceVolume):0;
      box.textContent=`${tt('woodPreviewOnePiece','Объём 1 штуки')}: ${pieceVolume.toFixed(5)} м³ · ${tt('woodPreviewEntered','введено')}: ${qty.toFixed(3)} м³ · ${tt('woodPreviewApprox','примерно')}: ${approx} ${tt('pcsUnitSuffix','шт')}`;
    }else{
      box.textContent=`${tt('woodPreviewOnePiece','Объём 1 штуки')}: ${pieceVolume.toFixed(5)} м³ · ${tt('woodPreviewPiecesCount','штук')}: ${Math.trunc(qty)} · ${tt('woodPreviewTotalVolume','общий объём')}: ${(pieceVolume*qty).toFixed(4)} м³`;
    }
  }
  window.updateWoodPreview=updateWoodPreview;

  function openWoodFlow(id=null, group=null){
    if(!requireAuth())return;
    const found=id?(data.materials||[]).find(x=>String(x.id)===String(id)):null;
    const a=found?.attributes||{};
    // v7.30: у «Деталей» материал (тип) намеренно совпадает по названию с листовыми/пиломатериалами
    // (Фанера, Мебельный щит и т.д.) — по названию типа больше нельзя однозначно определить группу.
    // Группа теперь в первую очередь читается из attributes.materialKind (пишется при сохранении,
    // см. saveWoodV639); у материалов, сохранённых до v7.30 (когда «Деталей» не было), этого поля
    // нет — для них группа по-прежнему определяется старой эвристикой по названию типа, где
    // пересечений быть не может.
    const explicitKind=(a.materialKind==='part'||a.materialKind==='sheet'||a.materialKind==='lumber')?a.materialKind:null;
    let currentType=a.materialType||found?.subcategory||(group==='sheet'?'Фанера':group==='part'?'Фанера':'Доска');
    if(!ALL_TYPES.includes(currentType))currentType='Другое';
    woodGroup=explicitKind||group||(isSheetType(currentType)?'sheet':'lumber');
    if(woodGroup==='sheet'&&!isSheetType(currentType))currentType='Фанера';
    if(woodGroup==='part'&&!isPartType(currentType))currentType='Фанера';
    if(woodGroup==='lumber'&&!isLumberType(currentType))currentType='Доска';
    woodState=a.status||(a.purchaseStatus==='ordered'?'ordered':(Number(found?.quantity||0)>0||a.storageLocation?'stock':'card'));
    if(!id&&!a.status)woodState='stock';
    // v7.08: при редактировании существующего материала единица учёта (шт/м³) должна браться из
    // настоящего поля material.unit (источник истины — из него же строится карточка материала),
    // а не из закешированного attributes.unitType — оно может разойтись с unit (например, если
    // остаток менялся не через этот визард) и тогда переключатель показывал не то, что реально сохранено.
    // v7.29: у листовых материалов раньше единица учёта была жёстко 'sheet' (одно значение на все
    // случаи, переключатель скрывался). Теперь считываем реальный выбор так же, как у пиломатериалов —
    // из found.unit/attributes.unitType — но допустимые значения разные для групп: piece/m2 у листовых,
    // piece/m3 у пиломатериалов. Значение, оставшееся от старой (некорректной) записи из другой группы
    // (например legacy unit='м³' у Фанеры), сбрасывается на 'piece', а не переносится как есть.
    // v7.30: у «Деталей» выбора нет вообще — всегда 'piece'.
    let currentUnit;
    if(woodGroup==='part'){
      currentUnit='piece';
    }else if(isSheetType(currentType)){
      currentUnit=found?(found.unit==='м²'?'m2':(a.unitType==='m2'?'m2':'piece')):(a.unitType==='m2'?'m2':'piece');
    }else{
      currentUnit=found?(found.unit==='м³'?'m3':(a.unitType==='m3'?'m3':'piece')):(a.unitType==='m3'?'m3':'piece');
    }
    const date=a.arrivalDate||a.receiptDate||a.expectedReceiptDate||todayValue();
    const body=`<div class="wood-unified material-wizard" data-material-id="${id||''}"><section class="wizard-card"><h4>${tt('woodDataTitle','Данные древесины')}</h4><div class="fabric-form-grid">
      <div class="field"><label>${tt('name','Название')}</label><input id="woodName" class="input" value="${esc(found?.name||'')}" placeholder="${tt('woodNamePlaceholder','Например: Брус сосна 50×100×3000')}"></div>
      <div class="field full"><label>${tt('materialTypeLabel2','Тип материала')}</label><input id="woodMaterialType" type="hidden" value="${esc(currentType)}">${typePicker(currentType,woodGroup)}</div>
      <div class="field" id="woodCustomTypeField" style="display:none"><label>${tt('specifyTypeLabel','Укажите тип')}</label><input id="woodCustomType" class="input" value="${esc(a.customMaterialType||'')}"></div>
      <div class="field"><label>${tt('sku','Артикул')}</label><input id="woodSku" class="input" value="${esc(found?.sku||nextSku('Древесина','',id||''))}"></div>
      <div class="field"><label id="woodSpeciesLabel">${tt('woodSpeciesLabel','Порода древесины')}</label><input id="woodSpecies" class="input" value="${esc(a.woodSpecies||a.woodType||'')}" placeholder="${tt('woodSpeciesPlaceholder','Дуб, бук, сосна')}"></div>
      <div class="field"><label>${tt('manufacturerSupplierLabel','Производитель / поставщик')}</label><input id="woodSupplier" class="input" value="${esc(a.supplier||a.manufacturer||'')}"></div>
      <div class="field full"><h4 id="woodDimensionsTitle" style="margin:4px 0 0">${tt('woodDimensionsTitle','Размеры')}</h4></div>
      <div class="field"><label>${tt('thicknessMmLabel','Толщина, мм')}</label><input id="woodThickness" class="input" type="number" min="0" step="1" value="${esc(a.thickness||'')}" oninput="updateWoodPreview()"></div>
      <div class="field"><label id="woodWidthLabel">${tt('woodWidthLabel','Ширина, мм')}</label><input id="woodWidth" class="input" type="number" min="0" step="1" value="${esc(a.width||'')}" oninput="updateWoodPreview()"></div>
      <div class="field"><label id="woodLengthLabel">${tt('woodLengthLabel','Длина, мм')}</label><input id="woodLength" class="input" type="number" min="0" step="1" value="${esc(a.length_mm||a.length||'')}" oninput="updateWoodPreview()"></div>
      <div class="field"><label>${tt('gradeOptionalLabel','Сорт, необязательно')}</label><input id="woodGrade" class="input" value="${esc(a.grade||'')}"></div>
      <div class="field" id="woodUnitField"><label>${tt('unitOfMeasureLabel2','Единица учёта')}</label><input id="woodUnitType" type="hidden" value="${esc(currentUnit)}"><div class="wood-unit-switch"><button type="button" data-wood-unit-button="piece" onclick="setWoodUnitMode('piece')">${tt('pcsShortLabel','Шт.')}</button>${woodGroup==='sheet'?`<button type="button" data-wood-unit-button="m2" onclick="setWoodUnitMode('m2')">м²</button>`:woodGroup==='lumber'?`<button type="button" data-wood-unit-button="m3" onclick="setWoodUnitMode('m3')">м³</button>`:''}</div></div>
      <div class="field full"><div class="wood-form-note ${woodGroup}">${woodGroup==='sheet'?tt('woodSheetNoteText','Для листовых материалов доступен учёт в штуках (листах) или квадратных метрах.'):woodGroup==='part'?tt('woodPartNoteText','Готовая деталь — количество всегда в штуках, размер и материал указываются для справки.'):tt('woodLumberNoteText','Для пиломатериалов доступен учёт в штуках или кубических метрах.')}</div></div>
    </div><div class="wood-section"><h4>${tt('materialStateTitle2','Состояние материала')}</h4>${stateCards()}<input id="woodCreateState" type="hidden" value="${woodState}">
      <div class="fabric-form-grid" id="woodOrderedFields" style="display:none">
        <div class="field"><label id="woodOrderedLabel">${tt('woodOrderedTitle','Заказано')}</label><input id="woodOrderedCount" class="input" type="number" min="0" step="1" value="${esc(a.orderedCount??a.orderedQty??0)}" oninput="updateWoodPreview()"></div>
        <div class="field"><label>${tt('expectedReceiptDateLabel','Ожидаемая дата поступления')}</label><input id="woodExpectedDate" class="input" type="date" value="${esc(date)}"></div>
        <div class="field full"><label>${tt('purchaseNoteLabel','№ закупки / поставщик / комментарий')}</label><input id="woodPurchaseNote" class="input" value="${esc(a.purchaseOrderInfo||a.purchaseNote||a.order||'')}" placeholder="${tt('purchaseNotePlaceholder','PO-102 · Поставщик · комментарий')}"></div>
      </div>
      <div class="fabric-form-grid" id="woodStockFields" style="display:none">
        <div class="field"><label id="woodStockLabel">${tt('woodInStockTitle','На складе')}</label><input id="woodStockCount" class="input" type="number" min="0" step="1" value="${esc(a.stockCount??found?.quantity??0)}" oninput="updateWoodPreview()"></div>
        <div class="field"><label id="woodMinLabel">${tt('minQuantity','Мин. остаток')}</label><input id="woodMinCount" class="input" type="number" min="0" step="1" value="${esc(a.minStockCount??found?.minQuantity??0)}"></div>
        <div class="field"><label>${tt('storageLocation','Место хранения')}</label><input id="woodStorageLocation" class="input" value="${esc(a.storageLocation||'')}" placeholder="${tt('shelfZonePlaceholder','Стеллаж / зона')}"></div>
        <div class="field"><label id="woodPriceLabel">${tt('purchasePrice','Цена закупки')}</label><input id="woodPurchasePrice" class="input" type="number" min="0" step="0.01" value="${esc(a.purchasePrice||'')}"></div>
        <div class="field"><label>${tt('receiptDate','Дата поступления')}</label><input id="woodReceiptDate" class="input" type="date" value="${esc(date)}"></div>
      </div>
      <div class="wood-calc-preview" id="woodCalcPreview"></div>
    </div></section></div>`;
    const formTitle=id?tt('editWoodTitle','Редактировать древесину'):(woodGroup==='sheet'?tt('addSheetMaterialTitle','Добавить листовой материал'):woodGroup==='part'?tt('addPartMaterialTitle','Добавить деталь'):tt('addLumberMaterialTitle','Добавить пиломатериал'));
    openModal(formTitle,body,`<button class="btn primary" type="button" onclick="saveWoodV639('${id||''}')">${typeof t==='function'?t('save'):'Сохранить'}</button>`);
    document.querySelector('#modalBackdrop .modal')?.classList.remove('wood-group-select');
    const back=document.getElementById('modalBackBtn');if(back)back.onclick=()=>{if(id){closeModal();return;}openWoodGroupPicker();};
    syncWoodTypeUi();
  }

  window.saveWoodV639=async function(id=''){
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
    if([width,length,thickness,stock,min,ordered,price].some(v=>v===null)){toast(tt('valuesCannotBeNegative','Значения не могут быть отрицательными.'));return;}
    if(mode!=='m3'&&mode!=='m2'&&![stock,min,ordered].every(Number.isInteger)){toast(tt('quantityMustBeInteger','Количество должно быть целым числом.'));return;}
    if(!(width>0&&length>0&&thickness>0)){toast(tt('specifyDimensionsHint','Укажите толщину, ширину и длину.'));return;}
    const selectedType=typeOf();
    const custom=(document.getElementById('woodCustomType')?.value||'').trim();
    const materialType=selectedType==='Другое'?(custom||'Другое'):selectedType;
    const area=Number((((width||0)/1000)*((length||0)/1000)).toFixed(6));
    const pieceVolume=Number((area*((thickness||0)/1000)).toFixed(8));
    const count=state==='ordered'?ordered:stock;
    // v7.29: 'm2' — количество вводится сразу как общая площадь в м² (как у 'm3' — сразу общий объём),
    // а не как число листов, поэтому площадь/объём/примерное число листов считаются иначе, чем в 'piece'.
    const totalArea=mode==='m2'?Number(count.toFixed(6)):(woodGroup==='sheet'?Number((area*count).toFixed(6)):null);
    const totalVolume=mode==='m3'?Number(count.toFixed(6)):(mode==='m2'?Number((count*((thickness||0)/1000)).toFixed(6)):Number((pieceVolume*count).toFixed(6)));
    const approxPieces=mode==='m3'&&pieceVolume>0?Math.floor(count/pieceVolume):(mode==='m2'&&area>0?Math.floor(count/area):null);
    const species=(document.getElementById('woodSpecies')?.value||'').trim();
    const sku=(document.getElementById('woodSku')?.value||'').trim()||nextSku('Древесина','',id||'');
    const name=(document.getElementById('woodName')?.value||'').trim()||[materialType,species,`${thickness}×${width}×${length}`].filter(Boolean).join(' ');
    // v7.30: materialKind фиксирует реальную группу (lumber/sheet/part), т.к. у «Деталей» название
    // типа (materialType) само по себе больше не может однозначно определить группу — см. openWoodFlow.
    const attrs={...old,status:state,materialType,materialKind:woodGroup,customMaterialType:selectedType==='Другое'?custom:null,unitType:mode,woodSpecies:species,woodType:species,supplier:(document.getElementById('woodSupplier')?.value||'').trim(),manufacturer:(document.getElementById('woodSupplier')?.value||'').trim(),thickness,width,length,length_mm:length,grade:(document.getElementById('woodGrade')?.value||'').trim(),stockCount:state==='stock'?stock:0,minStockCount:state==='stock'?min:0,orderedCount:state==='ordered'?ordered:0,pieceVolume,totalVolume,sheetArea:woodGroup==='sheet'?area:null,totalArea,approxPieces,storageLocation:state==='stock'?(document.getElementById('woodStorageLocation')?.value||'').trim()||null:null,purchasePrice:state==='stock'?price:null,receiptDate:state==='stock'?(document.getElementById('woodReceiptDate')?.value||null):null,expectedReceiptDate:state==='ordered'?(document.getElementById('woodExpectedDate')?.value||null):null,purchaseOrderInfo:state==='ordered'?(document.getElementById('woodPurchaseNote')?.value||'').trim()||null:null,purchaseNote:state==='ordered'?(document.getElementById('woodPurchaseNote')?.value||'').trim()||null:null,purchaseStatus:state==='ordered'?'ordered':(state==='stock'?'instock':'noorder'),orderedQty:state==='ordered'?ordered:0,reservedQty:Number(old.reservedQty||0)};
    const unit=mode==='m2'?'м²':mode==='m3'?'м³':(woodGroup==='sheet'?'лист':'шт');
    const obj={id:id||null,sku,name,category:'Древесина',subcategory:materialType,attributes:attrs,unit,quantity:state==='stock'?stock:0,minQuantity:state==='stock'?min:0,lastUpdated:todayValue()};
    const ok=id?await updateMaterialInSupabase(obj):await insertMaterialToSupabase(obj);if(!ok)return;
    if(id){closeModal();await loadMaterialsFromSupabase();renderAll();toast(t('savedMaterial'));return;}
    await finishMaterialSaveAndReturn(obj.sku,obj.category);
  };

  function install(){
    if(installed)return true;
    if(typeof window.openWoodModal!=='function')return false;
    installed=true;ensureStyles();applyVersion();
    window.__originalWoodModalV639=window.openWoodModal;
    window.openWoodModal=function(id=null){return id?openWoodFlow(id):openWoodGroupPicker();};
    window.saveWoodMaterial=window.saveWoodV639;
    return true;
  }
  function boot(){applyVersion();if(install())return;let tries=0;const timer=setInterval(()=>{tries+=1;if(install()||tries>100)clearInterval(timer)},20)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
