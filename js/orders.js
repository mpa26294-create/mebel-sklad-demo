function orderStatusClass(st){return {'Новый':'new','Ожидает технолога':'wait','Технология в работе':'production','Готов к работе':'ready','Готов к производству':'ready','Не хватает материалов':'needbuy','Нужно заказать':'needbuy','Материалы заказаны':'orderedmat','В производстве':'production','В работе':'production','Ожидает материалы':'wait','Готов':'done','Завершён':'done',completed:'done','Отменён':'cancel',cancelled:'cancel'}[st]||'new'}
function orderIsCompleted(status){return ['completed','Готов','Завершён'].includes(String(status||''))}
function orderIsCancelled(status){return ['cancelled','Отменён'].includes(String(status||''))}
function orderIsTerminal(status){return orderIsCompleted(status)||orderIsCancelled(status)}
function nextOrderNumber(excludeId=''){let max=0;(data.orders||[]).forEach(o=>{if(String(o.id)===String(excludeId))return;const m=String(o.number||'').match(/^Z-(\d{4})$/);if(m)max=Math.max(max,Number(m[1]));});return `Z-${String(max+1).padStart(4,'0')}`}
function orderMaterials(o){return Array.isArray(o.materials)?o.materials:[]}
const DEFAULT_ORDER_STEPS=[
  {name:'Столярка',minutes:0},
  {name:'Швейный цех',minutes:0},
  {name:'Поклейка',minutes:0},
  {name:'Тапицерка',minutes:0},
  {name:'Сборка',minutes:0},
  {name:'Упаковка',minutes:0}
];
function orderSteps(o){return Array.isArray(o.steps)?o.steps:DEFAULT_ORDER_STEPS.map(s=>({...s}))}
function calcOrderMinutes(o){const perOne=orderSteps(o).reduce((s,x)=>s+Number(x.minutes||0),0);return perOne*orderProductQty(o||{})}
function orderProductQty(o){const n=Number(o?.productQty||o?.qty||1);return Number.isFinite(n)&&n>0?Math.max(1,Math.trunc(n)):1}
function orderItemPerUnitQty(i,o){const oq=orderProductQty(o);const n=Number(i?.perUnitQty);if(Number.isFinite(n)&&n>0)return n;return Number(i?.qty||0)/oq}
function calcOrderItemTotalQty(perUnit, productQty, unit){return stockNumForUnit(Number(perUnit||0)*orderProductQty({productQty}),unit||'м²')}
function orderDefaultUnitForCategory(category){return ({'Ткань':'пог. м','Экокожа':'пог. м','Кожа':'м²','Поролон':'м²','Древесина':'м³','Фанера':'лист','МДФ':'лист','ДСП':'лист','Крепёж':'шт','Фурнитура':'шт'})[category]||'шт'}
function orderUnitOptions(category='',selected=''){
  const base=(category==='Ткань'||category==='Экокожа')?['пог. м','м²']:['пог. м','м','м²','м³','шт','лист','рулон'];
  const units=[orderDefaultUnitForCategory(category),...base].filter((v,i,a)=>v&&a.indexOf(v)===i);
  return units.map(u=>`<option value="${escapeHtml(u)}" ${u===selected?'selected':''}>${escapeHtml(unitLabel(u))}</option>`).join('')
}
// v8.13: заказ можно разбить на несколько ОТПРАВОК — order.shipments=[{id,date,qty}] (дата + сколько штук к этой дате).
// Сумма может быть меньше количества заказа (остаток пока не назначен). Срок для цеха — ближайшая отправка, которая
// ещё не «закрыта» выполненным количеством этого цеха (накопительно: 20 к 25.09, ещё 40 к 14.10 → пока цех сделал 25,
// ближайшая — вторая, и к ней нужно ещё 35). Если отправок нет — как раньше, order.dueDate. order.dueDate при
// сохранении заказа = самая ранняя отправка (для старого кода/списков).
function orderShipments(o){
  const arr=Array.isArray(o?.shipments)?o.shipments:[];
  return arr.map(x=>({id:x?.id||'',date:String(x?.date||'').slice(0,10),qty:Math.max(0,Math.trunc(Number(x?.qty)||0))}))
    .filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&x.qty>0)
    .sort((a,b)=>a.date.localeCompare(b.date));
}
// «Готово к отправке» на уровне заказа — сколько прошло ПОСЛЕДНИЙ этап (без создания production у заказа).
function orderProducedQty(o){
  const steps=orderSteps(o),ops=Array.isArray(o?.production?.operations)?o.production.operations:[];
  if(!steps.length)return 0;
  const last=ops.find(op=>Number(op.stepIndex)===steps.length-1);
  return last?productionCompletedQty(o,last):0;
}
function orderDueInfo(o,op){
  const ships=orderShipments(o);
  if(!ships.length){
    const d=String(o?.dueDate||'').slice(0,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d)?{date:d,shipQty:0,need:0,cum:0,index:0,count:0}:null;
  }
  const done=op?productionCompletedQty(o,op):orderProducedQty(o);
  let cum=0;
  for(let i=0;i<ships.length;i++){
    cum+=ships[i].qty;
    if(cum>done)return {date:ships[i].date,shipQty:ships[i].qty,cum,need:cum-done,index:i+1,count:ships.length};
  }
  return null; // все назначенные отправки уже покрыты выполненным количеством
}
function orderDueDate(o,op){const i=orderDueInfo(o,op);return i?i.date:''}
function rowDueDate(row){return orderDueDate(row.order,productionOp(row.order,row.index))}
function orderDueSortKey(o){return orderDueDate(o)||String(o?.dueDate||'')||String(o?.date||'')}
function orderShipmentsText(o){return orderShipments(o).map(x=>`${x.date} — ${x.qty} ${t('unitPieces')}`).join('; ')}
function orderDeadlineClass(o,op){const d=orderDueDate(o,op)||'';if(!d)return '';const todayStr=today();if(d<todayStr && !orderIsTerminal(o?.status)&&!['Завершён','Отменён'].includes(calcOrderAutoStatus(o)))return 'overdue';if(d===todayStr)return 'today';return ''}
function formatDeadline(o,op){
  const i=orderDueInfo(o,op);
  if(i)return i.count>1?`${i.date} (${i.index}/${i.count})`:i.date;
  const ships=orderShipments(o);
  return ships.length?ships[ships.length-1].date:'—';
}
function materialReservedOutsideOrder(matId,excludeOrderId='',targetUnit=''){
  const m=data.materials.find(x=>String(x.id)===String(matId));
  return (data.orders||[])
    .filter(o=>String(o.id)!==String(excludeOrderId)&&!orderIsTerminal(o.status))
    .flatMap(orderMaterials)
    .filter(i=>String(i.materialId)===String(matId))
    .reduce((s,i)=>{const remaining=typeof orderItemRemainingReserveQty==='function'?orderItemRemainingReserveQty(i,m):Number(i.qty||0);return s+convertMaterialQty(Number(remaining||0),i.unit||m?.unit||targetUnit,targetUnit||i.unit||m?.unit||'',m)},0);
}
function orderItemAvailability(item,excludeOrderId=''){
  const m=data.materials.find(x=>String(x.id)===String(item.materialId));
  if(!m)return {ok:false,missing:Number(item.qty||0),available:0,stock:0,unit:item.unit||'',mat:null};
  const unit=item.unit||orderUnitForMaterial(m,item.category)||m.unit;
  const stock=convertMaterialQty(m.quantity,m.unit,unit,m);
  const reservedOther=materialReservedOutsideOrder(m.id,excludeOrderId,unit);
  const available=Math.max(0,stock-reservedOther);
  const need=typeof orderItemRemainingReserveQty==='function'?orderItemRemainingReserveQty(item,m):Number(item.qty||0);
  return {ok:available>=need,missing:Math.max(0,need-available),available,stock,unit,mat:m}
}
function orderHasMaterialProblem(o){return orderMaterials(o).some(i=>!orderItemAvailability(i,o.id).ok)}

function orderItemPurchaseStatus(item){
  const v=item?.purchaseStatus||'';
  return ['need','ordered','none'].includes(v)?v:'';
}
function orderItemPurchaseQty(item,missing=0){
  const q=Number(item?.purchaseQty||0);
  return q>0?q:Math.max(0,Number(missing||0));
}
function calcOrderAutoStatus(o){
  if(orderIsCompleted(o.status))return 'Завершён';
  if(orderIsCancelled(o.status))return 'Отменён';
  if(['Ожидает технолога','Технология в работе'].includes(o.status))return o.status;
  if(['В производстве','В работе'].includes(o.status)) return o.status;
  const items=orderMaterials(o);
  if(!items.length) return 'Новый';
  const states=items.map(i=>orderMaterialLineState(i,o.id));
  if(states.every(x=>x.kind==='ok')) return 'Готов к работе';
  const missingStates=states.filter(x=>!x.av.ok);
  if(missingStates.length && missingStates.every(x=>x.kind==='blue')) return 'Материалы заказаны';
  if(missingStates.length) return 'Не хватает материалов';
  return 'Новый';
}
function calcOrderMaterialPercent(o){
  const items=orderMaterials(o); if(!items.length)return 0;
  let totalNeed=0, covered=0;
  items.forEach(i=>{
    const av=orderItemAvailability(i,o.id);
    const m=(data.materials||[]).find(x=>String(x.id)===String(i.materialId));
    const need=Math.max(0,typeof orderItemRemainingReserveQty==='function'?orderItemRemainingReserveQty(i,m):Number(i.qty||0));
    totalNeed += need;
    covered += Math.min(need, Math.max(0,Number(av.available||0)));
  });
  if(totalNeed<=0)return 0;
  return Math.max(0,Math.min(100,Math.round(covered/totalNeed*100)));
}
function calcOrderOverallPercent(o){
  if(orderIsCompleted(o.status))return 100;
  if(['В производстве','В работе'].includes(o.status))return Math.max(45,calcOrderMaterialPercent(o));
  const st=calcOrderAutoStatus(o);
  if(st==='Готов к работе')return 35;
  if(st==='Материалы заказаны')return 20;
  if(st==='Не хватает материалов')return Math.max(5,Math.min(25,Math.round(calcOrderMaterialPercent(o)*0.25)));
  return 5;
}

function orderExpandedRow(o){
  const matPct=calcOrderMaterialPercent(o), overall=calcOrderOverallPercent(o), prod=orderIsCompleted(o.status)?100:(o.status==='В производстве'?45:0);
  return `<tr class="order-detail-row"><td colspan="6"><div class="order-detail-box"><div class="order-progress-grid"><div class="order-progress-card"><small>Материалы</small><b>${matPct}%</b><div class="order-bar"><span style="width:${matPct}%"></span></div></div><div class="order-progress-card"><small>Производство</small><b>${prod}%</b><div class="order-bar"><span style="width:${prod}%"></span></div></div><div class="order-progress-card"><small>Общий прогресс</small><b>${overall}%</b><div class="order-bar"><span style="width:${overall}%"></span></div></div></div>${orderMaterialsDetailHtml(o)}</div></td></tr>`;
}
function orderMissingItems(o){
  return orderMaterials(o).map(i=>({item:i,state:orderMaterialLineState(i,o.id)})).filter(x=>!x.state.av.ok);
}
function toggleOrderMissing(e,id){
  e.stopPropagation();
  if(missingExpandedOrders.has(id))missingExpandedOrders.delete(id);else missingExpandedOrders.add(id);
  renderOrders();
}

function toggleOrderExpand(e,id){e.stopPropagation(); if(expandedOrders.has(id))expandedOrders.delete(id);else expandedOrders.add(id); renderOrders();}
function orderMaterialSummary(o){const items=orderMaterials(o);if(!items.length)return '<span class="muted">Материалы не указаны</span>';return items.slice(0,2).map(i=>{const m=data.materials.find(x=>String(x.id)===String(i.materialId));const av=orderItemAvailability(i,o.id);return `<b>${escapeHtml(m?materialTitle(m):'Удалённый материал')}</b> — ${escapeHtml(qtyWithUnit(i.qty,av.unit||i.unit))}${av.ok?'':' · не хватает '+escapeHtml(qtyWithUnit(av.missing,av.unit||i.unit))}`}).join('<br>')+(items.length>2?`<br><span class="muted">+ ещё ${items.length-2}</span>`:'')}
function syncMaterialReservations(){const totals={};(data.orders||[]).forEach(o=>{if(orderIsTerminal(o.status))return;normalizeOrderConsumptionFields(o);orderMaterials(o).forEach(i=>{const m=(data.materials||[]).find(x=>String(x.id)===String(i.materialId));if(i.materialId)totals[i.materialId]=(totals[i.materialId]||0)+convertMaterialQty(orderItemRemainingReserveQty(i,m),i.unit||m?.unit||'',m?.unit||i.unit||'',m)})});(data.materials||[]).forEach(m=>{m.attributes=m.attributes||{};m.attributes.reservedQty=stockNumForUnit(totals[m.id]||0,m.unit)})}

// v7.81: пользователь спросил, почему заказ с бОльшим номером (Z-0009) стоит в списке выше заказов
// с меньшим номером (Z-0004, Z-0008) — сортировка всегда была по сроку сдачи (сначала срочные), а
// не по номеру, что при разных сроках выглядит нелогично. Вместо того чтобы просто сменить порядок
// по умолчанию, добавлен выбор — пользователь сам решает, как ему удобнее смотреть список.
function orderSortCompare(a,b,mode){
  const byDeadline=()=>String(orderDueSortKey(a)).localeCompare(String(orderDueSortKey(b)));
  const byNumber=()=>String(a.number||'').localeCompare(String(b.number||''),undefined,{numeric:true,sensitivity:'base'});
  const byCreated=()=>String(a.date||'').localeCompare(String(b.date||''));
  switch(mode){
    case 'numberAsc':return byNumber()||byDeadline();
    case 'numberDesc':return -byNumber()||byDeadline();
    case 'createdDesc':return -byCreated()||byNumber();
    case 'deadline':
    default:return byDeadline()||byNumber();
  }
}
function filteredOrders(){const q=(document.getElementById('orderSearchInput')?.value||'').toLowerCase().trim();const st=document.getElementById('orderStatusFilter')?.value||'';const client=document.getElementById('orderClientFilter')?.value||'';const date=document.getElementById('orderDateFilter')?.value||'';const prob=document.getElementById('orderProblemFilter')?.value||'';const sortMode=document.getElementById('orderSortFilter')?.value||'deadline';return (data.orders||[]).filter(o=>{const mats=orderMaterials(o).map(i=>data.materials.find(m=>String(m.id)===String(i.materialId))).filter(Boolean).map(materialTitle).join(' ');const hay=(o.number+' '+o.client+' '+mats).toLowerCase();const hasProb=orderHasMaterialProblem(o);return (!q||hay.includes(q))&&(!st||calcOrderAutoStatus(o)===st)&&(!client||o.client===client)&&(!date||o.date===date)&&(!prob||(prob==='problem'?hasProb:!hasProb))}).sort((a,b)=>orderSortCompare(a,b,sortMode))}
function closeOrderMenus(){document.querySelectorAll('.action-menu.open').forEach(x=>{x.classList.remove('open');const list=x.querySelector('.action-menu-list');if(list)list.removeAttribute('style')})}
function toggleOrderMenu(e,id){e.stopPropagation();const el=document.getElementById('orderMenu_'+id),button=el?.querySelector('.action-menu-btn'),list=el?.querySelector('.action-menu-list'),was=el?.classList.contains('open');closeOrderMenus();if(!el||!button||!list||was)return;el.classList.add('open');const rect=button.getBoundingClientRect(),width=Math.max(190,list.scrollWidth||190),height=list.scrollHeight||190,gap=6,left=Math.max(8,Math.min(window.innerWidth-width-8,rect.right-width)),openUp=window.innerHeight-rect.bottom<height+gap&&rect.top>height+gap;list.style.position='fixed';list.style.left=`${left}px`;list.style.right='auto';list.style.top=`${Math.max(8,openUp?rect.top-height-gap:Math.min(window.innerHeight-height-8,rect.bottom+gap))}px`;list.style.bottom='auto';list.style.zIndex='10000'}



function renderOrderStats(){const orders=data.orders||[],total=orders.length,ready=orders.filter(o=>calcOrderAutoStatus(o)==='Готов к работе').length,missing=orders.filter(o=>calcOrderAutoStatus(o)==='Не хватает материалов').length,ordered=orders.filter(o=>calcOrderAutoStatus(o)==='Материалы заказаны').length,pct=v=>total?Math.round(v/total*100):0,notes=currentLang==='ru'?['всего',`${pct(ready)}% от всех заказов`,`${pct(missing)}% требуют закупки`,`${pct(ordered)}% в пути`]:currentLang==='en'?['total',`${pct(ready)}% of all orders`,`${pct(missing)}% require purchase`,`${pct(ordered)}% in transit`]:['kopā',`${pct(ready)}% no visiem pasūtījumiem`,`${pct(missing)}% jāiepērk`,`${pct(ordered)}% ceļā`],stats=[['orders',u42('totalOrders'),total,notes[0]],['ready',u42('readyToWork'),ready,notes[1]],['missing',u42('missingMaterials'),missing,notes[2]],['ordered',u42('orderedMoving'),ordered,notes[3]]],box=document.getElementById('orderStats');if(box)box.innerHTML=stats.map(([icon,label,value,note])=>`<div class="order-stat-card"><span class="order-stat-icon ${icon}">${icon==='orders'?'▤':icon==='ready'?'✓':icon==='missing'?'△':'▱'}</span><div class="order-stat-copy"><small class="order-stat-label">${label}</small><b class="order-stat-value">${value}</b><em class="order-stat-note">${note}</em></div></div>`).join('')}
function renderOrderClientFilter(){const el=document.getElementById('orderClientFilter');if(!el)return;const current=el.value;const clients=[...new Set((data.orders||[]).map(o=>o.client).filter(Boolean))].sort();el.innerHTML=`<option value="">${u42('allClients')}</option>`+clients.map(c=>`<option value="${escapeHtml(c)}" ${c===current?'selected':''}>${escapeHtml(c)}</option>`).join('')}

function clearOrderFilters(){['orderSearchInput','orderDateFilter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});['orderStatusFilter','orderClientFilter','orderProblemFilter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});renderOrders()}

function orderTimeText(min){min=Math.max(0,Math.round(Number(min||0)));const h=Math.floor(min/60),m=min%60;const hm={ru:['ч','мин'],en:['h','min'],lv:['st','min']}[currentLang]||['ч','мин'];return h?`${h} ${hm[0]} ${String(m).padStart(2,'0')} ${hm[1]}`:`${m} ${hm[1]}`}
// v7.76: по просьбе пользователя — везде на сайте, где показывалось сырое число минут (55100 мин),
// теперь часы+минуты через уже существующую orderTimeText(). Для "Разницы" (план/факт), которая может
// быть и отрицательной (опережение) и положительной (отставание), нужен отдельный вариант — сама
// orderTimeText() обрезает отрицательные значения до 0, что для "Разницы" потеряло бы знак минуса.
function orderTimeTextSigned(min){const n=Math.round(Number(min||0));if(n>0)return `+${orderTimeText(n)}`;if(n<0)return `-${orderTimeText(-n)}`;return orderTimeText(0)}
function orderPurchaseLabel(value){return ({need:u42('needOrder'),ordered:u42('ordered'),none:u42('notNeeded')})[value]||u42('needOrder')}
function orderMaterialLineState(item,excludeOrderId=''){
  const av=orderItemAvailability(item,excludeOrderId);
  const m=av.mat;
  if(!m) return {kind:'bad',label:currentLang==='ru'?'Материал удалён':currentLang==='en'?'Material deleted':'Materiāls dzēsts',av,purchaseStatus:'need',purchaseQty:Number(item?.purchaseQty||av.missing||0)};
  if(av.ok) return {kind:'ok',label:currentLang==='ru'?'Есть на складе':currentLang==='en'?'In stock':'Ir noliktavā',av,purchaseStatus:'none',purchaseQty:0};
  const status=orderItemPurchaseStatus(item)||'need';
  const qty=orderItemPurchaseQty(item,av.missing);
  if(status==='ordered') return {kind:'blue',label:currentLang==='ru'?'Заказано у поставщика':currentLang==='en'?'Ordered from supplier':'Pasūtīts piegādātājam',av,purchaseStatus:status,purchaseQty:qty};
  return {kind:'bad',label:u42('needOrder'),av,purchaseStatus:'need',purchaseQty:Math.max(0,qty||av.missing)};
}
function orderProductionPercentForCard(o){if(o.production&&typeof calcWorkflowProductionPercent==='function')return calcWorkflowProductionPercent(o);if(typeof calcProductionPercent==='function')return Math.max(0,Math.min(100,calcProductionPercent(o)));if(orderIsCompleted(o.status))return 100;if(['В работе','В производстве'].includes(o.status))return 45;return 0}
function orderMaterialsDetailHtml(o){const items=orderMaterials(o);if(!items.length)return `<div class="order-material-empty">${currentLang==='ru'?'Материалы не указаны':currentLang==='en'?'Materials not specified':'Materiāli nav norādīti'}</div>`;const reserveLabel=currentLang==='ru'?'Резерв':currentLang==='en'?'Reserved':'Rezervēts',actionLabel=currentLang==='ru'?'Действие':currentLang==='en'?'Action':'Darbība',writtenOff=currentLang==='ru'?'Списано':currentLang==='en'?'Written off':'Norakstīts';return `<div class="order-materials-clean"><div class="order-materials-clean-head"><b>${u42('materials')}</b><span>${items.length}</span></div><div class="order-materials-scroll"><table class="order-material-detail-table"><thead><tr><th>${u42('material')}</th><th>${u42('need')}</th><th>${u42('stock')}</th><th>${reserveLabel}</th><th>${u42('available')}</th><th>${u42('status')}</th><th>${actionLabel}</th></tr></thead><tbody>${items.map(i=>{const st=orderMaterialLineState(i,o.id),m=st.av.mat,unit=st.av.unit||i.unit||'',deleted=!m;let cls=deleted?'material-chip-written':st.kind==='ok'?'material-chip-ok':st.kind==='blue'?'material-chip-blue':st.kind==='warn'?'material-chip-warn':'material-chip-bad',statusTitle=deleted?writtenOff:st.label;if(!deleted&&st.av.missing>0){if(st.purchaseStatus==='ordered'){statusTitle=u42('ordered');cls='material-chip-blue'}else{statusTitle=st.kind==='bad'?(currentLang==='ru'?'Не хватает':currentLang==='en'?'Missing':'Trūkst'):u42('needOrder');cls=st.kind==='bad'?'material-chip-bad':'material-chip-warn'}}const action=deleted?'—':`<button class="btn small material-action-btn" type="button" onclick="openOrderMaterialPurchase('${o.id}','${i.materialId}')">${u42('details')}</button>`;return `<tr class="${deleted?'deleted-material-row':''}"><td><button type="button" class="order-material-link" ${deleted?'disabled':`onclick="openOrderMaterialPurchase('${o.id}','${i.materialId}')"`}>${escapeHtml(m?materialTitle(m):u42('deletedMaterial'))}</button>${m?`<div class="sub">${escapeHtml(m.sku||'')}</div>`:''}</td><td>${escapeHtml(qtyWithUnit(i.qty,unit))}<div class="sub">${u42('perOne')}: ${escapeHtml(qtyWithUnit(orderItemPerUnitQty(i,o),unit))}</div></td><td>${deleted?'—':escapeHtml(qtyWithUnit(st.av.stock,unit))}</td><td>${deleted?'—':escapeHtml(qtyWithUnit(reservedQty(m),unit))}</td><td>${deleted?'—':escapeHtml(qtyWithUnit(st.av.available,unit))}</td><td><span class="${cls}">${escapeHtml(statusTitle)}</span></td><td>${action}</td></tr>`}).join('')}</tbody></table></div></div>`}
const orderWorkflowSelection=new Map();
const ORDER_WORKFLOW_STEPS=['orderStageCreation','orderStageTechnology','orderStageProduction','orderStageCompletion'];
function orderCompletionData(o){if(!o.completion||typeof o.completion!=='object')o.completion={checklist:{},comments:[]};if(!o.completion.checklist||typeof o.completion.checklist!=='object')o.completion.checklist={};if(!Array.isArray(o.completion.comments))o.completion.comments=[];return o.completion}
function orderCompletionClosed(o){return !!(o&&orderCompletionData(o).closedAt)||String(o?.status||'')==='Завершён'||String(o?.status||'')==='completed'}
function orderWorkflowStage(id){
  const key=String(id);if(orderWorkflowSelection.has(key))return Math.max(0,Math.min(3,Number(orderWorkflowSelection.get(key)||0)));
  const o=(data.orders||[]).find(x=>String(x.id)===key),status=String(o?.status||'');
  if(orderIsCompleted(status)||status==='Готов')return 3;if(['В производстве','В работе'].includes(status))return 2;if(['Ожидает технолога','Технология в работе'].includes(status))return 1;return 0;
}
function orderResponsibilityHtml(o){
  return '';
}
function orderWorkflowStepperHtml(o,context='card'){
  const active=orderWorkflowStage(o.id),closed=orderCompletionClosed(o);
  return `<div class="order-workflow-stepper" role="tablist" aria-label="${escapeHtml(t('orderWorkflow'))}">${ORDER_WORKFLOW_STEPS.map((key,index)=>{const complete=closed||index<active,activeCls=!closed&&index===active;return `<button type="button" role="tab" aria-selected="${activeCls}" class="order-workflow-step ${activeCls?'active':complete?'complete':'future'}" onclick="selectOrderWorkflowStage(event,'${o.id}',${index},'${context}')"><span class="order-workflow-marker">${complete?'✓':index+1}</span><span class="order-workflow-label">${escapeHtml(t(key))}</span></button>`}).join('')}</div>`;
}
function orderCreationDataHtml(o,{includeOperational=false}={}){
  const auto=calcOrderAutoStatus(o),oq=orderProductQty(o);
  const basics=`<section class="order-workflow-panel" role="tabpanel"><h4>${escapeHtml(t('orderBasicData'))}</h4><div class="order-basic-grid"><div><small>${escapeHtml(t('orderNumberLabel'))}</small><b>${escapeHtml(o.number||'—')}</b></div><div><small>${escapeHtml(u42('orderClient'))}</small><b>${escapeHtml(o.client||'—')}</b></div><div><small>${escapeHtml(t('orderProductCount'))}</small><b>${oq}</b></div><div><small>${escapeHtml(t('orderDueDate'))}</small><b class="order-deadline ${orderDeadlineClass({...o,status:auto})}">${escapeHtml(formatDeadline(o))}</b></div>${orderShipments(o).length?`<div class="full">${orderShipmentsInfoHtml(o)}</div>`:''}<div><small>${escapeHtml(t('orderCreatedDate'))}</small><b>${escapeHtml(o.date||'—')}</b></div><div><small>${escapeHtml(t('orderCurrentStatus'))}</small>${orderStatusCellHtml(o,auto)}</div><div class="full"><small>${escapeHtml(t('orderComment'))}</small><b>${escapeHtml(o.comment||'—')}</b></div></div></section>`;
  if(!includeOperational)return basics;
  const matPct=calcOrderMaterialPercent(o),prod=orderProductionPercentForCard(o),prodLbl=t('orderStageProduction');
  return basics+orderResponsibilityHtml(o)+`<div class="order-operational-data"><div class="order-detail-progress"><div><span>${escapeHtml(u42('materials'))}</span><b>${matPct}%</b><i><em style="width:${matPct}%"></em></i></div><div><span>${escapeHtml(prodLbl)}</span><b>${prod}%</b><i><em style="width:${prod}%"></em></i></div></div>${orderMaterialsDetailHtml(o)}</div>`;
}
function orderTechnologySummaryHtml(o){
  const steps=orderSteps(o),items=orderMaterials(o),missing=orderMissingItems(o),total=calcOrderMinutes(o);
  const missingList=!items.length?`<div class="order-tech-unknown">${escapeHtml(t('materialsNotSpecifiedYet'))}</div>`:missing.length?`<ul>${missing.map(({item,state})=>{const m=state.av.mat,unit=state.av.unit||item.unit||'',ordered=orderItemPurchaseStatus(item)==='ordered';return `<li><b>${escapeHtml(m?materialTitle(m):t('deletedMaterialWord'))}</b><span class="${ordered?'ordered-text':''}">— ${escapeHtml(ordered?`${t('ordered')}: ${qtyWithUnit(orderItemPurchaseQty(item,state.av.missing),unit)}`:qtyWithUnit(state.av.missing,unit))}</span></li>`}).join('')}</ul>`:`<div class="order-tech-ok">✓ ${escapeHtml(t('nothingToOrder'))}</div>`;
  return `<div class="order-tech-bottom"><section class="order-tech-card order-purchase-summary"><h4>${escapeHtml(t('whatToOrder'))}</h4>${missingList}</section><section class="order-tech-card"><h4>${escapeHtml(t('technologyTotals'))}</h4><div class="order-tech-totals"><div><small>${escapeHtml(t('totalOperations'))}</small><b>${steps.length}</b></div><div><small>${escapeHtml(t('totalTime'))}</small><b>${escapeHtml(orderTimeText(total))}</b></div><div><small>${escapeHtml(t('materialsCount'))}</small><b>${items.length}</b></div><div><small>${escapeHtml(t('missingMaterialsCount'))}</small><b class="${missing.length?'danger-text':''}">${missing.length}</b></div></div></section></div>`;
}
function technologyMaterialStatus(o,item){const per=orderItemPerUnitQty(item,o),state=orderMaterialLineState(item,o.id),need=Number(item.qty||0),available=Number(state.av.available||0),reserved=Number(state.av.mat?reservedQty(state.av.mat):0),ordered=orderItemPurchaseQty(item,state.av.missing);if(per<=0||need<=0)return {tone:'idle',label:t('materialUsageNotSpecified'),state};if(orderItemPurchaseStatus(item)==='ordered')return {tone:'blue',label:`${t('ordered')}: ${qtyWithUnit(ordered,state.av.unit||item.unit)}`,state};if(available<=0)return {tone:'bad',label:t('needToPurchase'),state};if(available<need)return {tone:'warn',label:t('partiallyAvailable'),state};if(reserved>=need)return {tone:'ok',label:t('reservedDone'),state};return {tone:'ok',label:t('materialsAvailableStatus'),state}}
function technologyMaterialRowHtml(o,item,index){const m=(data.materials||[]).find(x=>String(x.id)===String(item.materialId)),category=item.category||m?.category||'Поролон',unit=((m?.unit==='рулон'&&(category==='Ткань'||category==='Экокожа'))?orderUnitForMaterial(m,category):(item.unit||orderUnitForMaterial(m,category))),workshop=materialWorkshopForItem(item,m),per=orderItemPerUnitQty({...item,unit},o),total=calcOrderItemTotalQty(per,orderProductQty(o),unit),effective={...item,qty:total,perUnitQty:per,unit,workshop},status=technologyMaterialStatus(o,effective),shortage=Math.max(0,Number(status.state.av.missing||0)),showOrder=per>0&&(shortage>0||orderItemPurchaseStatus(item)==='ordered'),orderQty=orderItemPurchaseQty(item,shortage);return `<div class="technology-material-row"><div class="field"><label>${escapeHtml(u42('category'))}</label><select class="select" onchange="updateTechnologyMaterial('${o.id}',${index},'category',this.value)">${ORDER_MATERIAL_CATS.map(cat=>`<option value="${cat}" ${cat===category?'selected':''}>${escapeHtml(categoryLabel(cat))}</option>`).join('')}</select></div><div class="field"><label>${escapeHtml(u42('material'))}</label><select class="select" onchange="updateTechnologyMaterial('${o.id}',${index},'materialId',this.value)">${materialOptions(category,item.materialId)}</select></div><div class="field"><label>Цех</label><select class="select" onchange="updateTechnologyMaterial('${o.id}',${index},'workshop',this.value)">${materialWorkshopOptions(o,workshop)}</select></div><div class="field"><label>${escapeHtml(u42('perOne'))}</label><input class="input" type="number" min="0" step="0.01" value="${Number(per||0)}" onchange="updateTechnologyMaterial('${o.id}',${index},'perUnitQty',this.value)"></div><div class="field"><label>${escapeHtml(u42('totalNeed'))}</label><div class="readonly-pill">${escapeHtml(qtyWithUnit(total,unit))}</div></div><div class="field"><label>${escapeHtml(u42('unit'))}</label><select class="select" onchange="updateTechnologyMaterial('${o.id}',${index},'unit',this.value)">${orderUnitOptions(category,unit)}</select></div><button class="iconbtn order-tech-remove" type="button" aria-label="${escapeHtml(t('removeMaterial'))}" onclick="removeTechnologyMaterial('${o.id}',${index})">×</button><div class="technology-material-status ${status.tone}"><span>${escapeHtml(status.label)} · ${escapeHtml(workshop||'цех не указан')}</span>${showOrder?`<div class="technology-order-controls"><label>${escapeHtml(t('orderedQuantity'))}</label><input class="input" id="technologyOrderQty_${o.id}_${index}" type="number" min="0.01" step="0.01" value="${Number(orderQty||0)}"><button class="btn small" type="button" onclick="markTechnologyMaterialOrdered('${o.id}',${index})">${escapeHtml(t('markAsOrdered'))}</button></div>`:''}</div></div>`}
function orderTechnologyMaterialsHtml(o){const items=orderMaterials(o),buttons=`<div class="actions order-tech-actions"><button class="btn primary order-tech-cta" type="button" onclick="openTechnologyMaterials('${o.id}')">＋ ${escapeHtml(t('addMaterialFromStock'))}</button><button class="btn order-tech-cta secondary" type="button" onclick="openTechnologyNewMaterial('${o.id}')">＋ ${escapeHtml(t('addNewMaterialToStock'))}</button></div>`;return `<section class="order-tech-card"><div class="order-tech-head"><div><h4>${escapeHtml(t('technologyMaterials'))}</h4><p>${escapeHtml(t('materialsReserveHint'))}</p></div>${buttons}</div><div class="technology-material-list">${items.map((item,index)=>technologyMaterialRowHtml(o,item,index)).join('')||`<div class="order-tech-empty order-tech-empty-action"><b>${escapeHtml(t('technologyMaterials'))}</b><span>${escapeHtml(t('noTechnologyMaterials'))}</span></div>`}</div></section>`}
// v7.22: раздел «Технология» в заказе больше не показывает операции вообще (даже read-only) —
// операции живут только в разделе «Технологии». Здесь остаётся только выбор/применение технологии
// (technologyApplyBarHtml) + список материалов заказа (резерв/закупка, как и раньше — решение
// пользователя). Кнопки «Сохранить как технологию»/«Обновить технологию» тоже убраны: теперь
// технологию создают и редактируют только централизованно, в разделе «Технологии».
// v7.28: черновик «создать технологию прямо в заказе» — тумблер «Сохранить как шаблон» и название
// шаблона живут только в памяти (per-orderId), не на самом заказе, и сохраняются по onchange сразу
// (не только по клику финальной кнопки) — иначе, как и в баге v7.26 с названием технологии, ввод
// потерялся бы при любой правке операции (каждая правка перерисовывает #orderWorkflowModal целиком).
const orderTechDraft={};
function getOrderTechDraft(o){
  const d=orderTechDraft[o.id]||{};
  return {saveAsTemplate:d.saveAsTemplate!==false,templateName:typeof d.templateName==='string'?d.templateName:(o.product||o.number||'')};
}
function updateOrderTechDraftToggle(orderId,checked){orderTechDraft[orderId]={...(orderTechDraft[orderId]||{}),saveAsTemplate:!!checked}}
function updateOrderTechDraftName(orderId,value){orderTechDraft[orderId]={...(orderTechDraft[orderId]||{}),templateName:String(value||'')}}
const ORDER_TECH_WORKSHOP_PRESETS=['Столярка','Швейный цех','Поклейка','Тапицерка','Сборка','Упаковка'];
// v7.28: редактор операций технологии — вернулся в заказ (был убран в v7.22, но мутаторы
// addTechnologyOperation/updateTechnologyOperation/removeTechnologyOperation/
// applyTechnologyOperationTemplate всё это время оставались рабочими, просто без своей разметки).
// Показывается, пока к заказу не привязана готовая технология (o.technologyId пусто) — по решению
// пользователя, всегда в этом случае, независимо от того, есть ли уже введённые операции.
function orderTechnologyOperationsEditableHtml(o){
  const steps=orderSteps(o);
  const addBtn=`<button class="btn primary order-tech-cta" type="button" onclick="addTechnologyOperation('${o.id}')">＋ ${escapeHtml(t('addOperation'))}</button>`;
  return `<section class="order-tech-card"><div class="order-tech-head"><div><h4>${escapeHtml(t('techOperations'))}</h4><p>${escapeHtml(t('techOperationsHint'))}</p></div>${addBtn}</div>${steps.length?`<div class="order-tech-table-scroll"><table class="order-tech-table"><thead><tr><th>${escapeHtml(t('operationStage'))}</th><th>${escapeHtml(t('timePerItem'))}</th><th>${escapeHtml(t('responsibleOptional'))}</th><th></th></tr></thead><tbody>${steps.map((s,index)=>`<tr><td><div class="technology-stage-picker"><select class="select" aria-label="${escapeHtml(t('operationTemplate'))}" onchange="applyTechnologyOperationTemplate('${o.id}',${index},this.value)"><option value="">${escapeHtml(t('chooseOperationTemplate'))}</option>${ORDER_TECH_WORKSHOP_PRESETS.map(name=>`<option value="${escapeHtml(name)}" ${s.name===name?'selected':''}>${escapeHtml(typeof workshopLabel==='function'?workshopLabel(name):name)}</option>`).join('')}</select><input class="input" value="${escapeHtml(s.name||'')}" placeholder="${escapeHtml(t('customOperationName'))}" onchange="updateTechnologyOperation('${o.id}',${index},'name',this.value)"></div></td><td><div class="order-tech-time"><input class="input" type="number" min="0" step="1" value="${Number(s.minutes||0)}" ${Array.isArray(s.operations)&&s.operations.length?`readonly title="${escapeHtml(t('stageOpsTimeAuto'))}"`:''} onchange="updateTechnologyOperation('${o.id}',${index},'minutes',this.value)"><span>${escapeHtml(t('minutesShort'))}</span></div></td><td><input class="input" value="${escapeHtml(s.responsible||'')}" placeholder="${escapeHtml(t('notSpecified'))}" onchange="updateTechnologyOperation('${o.id}',${index},'responsible',this.value)"></td><td><button class="iconbtn order-tech-remove" type="button" aria-label="${escapeHtml(t('deleteOperation'))}" onclick="removeTechnologyOperation('${o.id}',${index})">×</button></td></tr>${typeof stageOpsRowHtml==='function'?stageOpsRowHtml('order',o,s,index):''}`).join('')}</tbody></table></div>`:`<div class="order-tech-empty order-tech-empty-action"><b>${escapeHtml(t('techOperations'))}</b><span>${escapeHtml(t('techOperationsHint'))}</span></div>`}</section>`;
}
function orderTechTemplateToggleHtml(o){
  const draft=getOrderTechDraft(o);
  return `<section class="order-tech-card order-tech-template-card">
    <div class="order-tech-template-row">
      <label class="order-tech-template-toggle"><input type="checkbox" ${draft.saveAsTemplate?'checked':''} onchange="updateOrderTechDraftToggle('${o.id}',this.checked)"><span><b>${escapeHtml(t('orderTechSaveAsTemplateLabel'))}</b><small>${escapeHtml(t('orderTechSaveAsTemplateHint'))}</small></span></label>
      ${draft.saveAsTemplate?`<input class="input order-tech-template-name" value="${escapeHtml(draft.templateName)}" placeholder="${escapeHtml(t('technologyNamePlaceholder'))}" onchange="updateOrderTechDraftName('${o.id}',this.value)">`:''}
    </div>
  </section>`;
}
// v7.28: если тумблер включён и у заказа ещё нет привязанной технологии, при сохранении/переводе
// в производство создаётся отдельная технология-шаблон (снимок steps/materials заказа) и заказ
// связывается с ней — так же, как раньше делало «Сохранить как технологию» до v7.22, только теперь
// это одно действие с тумблером, а не отдельный диалог.
async function maybeSaveOrderTechnologyAsTemplate(o){
  if(!o||o.technologyId)return;
  const steps=orderSteps(o);
  if(!steps.length)return;
  const draft=getOrderTechDraft(o);
  if(!draft.saveAsTemplate)return;
  const name=String(draft.templateName||o.product||o.number||'').trim();
  if(!name)return;
  const tc={
    name,
    product:o.product||'',
    sourceOrderNumber:o.number||'',
    steps:typeof technologyStepsSnapshot==='function'?technologyStepsSnapshot(o):steps.map(s=>({name:s.name||'',minutes:Number(s.minutes||0),responsible:s.responsible||''})),
    materials:typeof technologyMaterialsSnapshot==='function'?technologyMaterialsSnapshot(o):[],
    createdBy:(typeof profileDisplayName==='function'?profileDisplayName():'')
  };
  const ok=typeof insertTechnologyToSupabase==='function'&&await insertTechnologyToSupabase(tc);
  if(!ok)return;
  tc.createdAt=new Date().toISOString();tc.updatedAt=tc.createdAt;
  data.technologies=[tc,...(data.technologies||[])];
  o.technologyId=tc.id;o.technologyName=tc.name;o.technologyAppliedAt=tc.createdAt;
  if(typeof auditAdd==='function')auditAdd('technology_saved_as_template','order',o.id,o.number,`${tRu('historyTechnologyApplied')}: ${tc.name}`);
  if(typeof renderTechnologies==='function')renderTechnologies();
}
function orderTechnologyHtml(o){
  const inProduction=['В производстве','В работе','Готов'].includes(String(o.status||''));
  const action=inProduction?`<button class="btn primary order-to-production" type="button" onclick="saveProductionTechnologyEdit('${o.id}')">${escapeHtml(currentLang==='ru'?'Редактировать технологию':currentLang==='en'?'Edit technology':'Rediģēt tehnoloģiju')}</button>`:`<button class="btn primary order-to-production" type="button" onclick="transferOrderToProduction('${o.id}')">${escapeHtml(t('transferToProduction'))} →</button>`;
  const applyBar=typeof technologyApplyBarHtml==='function'?technologyApplyBarHtml(o):'';
  const createSection=!o.technologyId?`${orderTechnologyOperationsEditableHtml(o)}${orderTechTemplateToggleHtml(o)}`:'';
  return `<div class="order-technology-screen">${applyBar}${createSection}${orderTechnologyMaterialsHtml(o)}${orderTechnologySummaryHtml(o)}<div class="order-tech-footer-actions"><button class="btn order-save-technology" type="button" onclick="saveTechnologyForLater('${o.id}')">${escapeHtml(t('saveAndContinueLater'))}</button>${action}</div></div>`;
}
// v7.17→v7.22: старая read-only таблица операций технологии в заказе. С v7.22 больше не
// вызывается из orderTechnologyHtml (операции показываются только в разделе «Технологии»),
// оставлена нетронутой как неиспользуемый код — низкий риск, ничего не подключено к ней.
function orderTechnologyOperationsHtml(o){const qty=orderProductQty(o),steps=orderSteps(o);return `<section class="order-tech-card"><div class="order-tech-head"><div><h4>${escapeHtml(t('techOperations'))}</h4><p>${escapeHtml(t('techOperationsReadonlyHint'))}</p></div></div>${steps.length?`<div class="order-tech-table-scroll"><table class="order-tech-table"><thead><tr><th>${escapeHtml(t('operationStage'))}</th><th>${escapeHtml(t('timePerItem'))}</th><th>${escapeHtml(t('orderProductCount'))}</th><th>${escapeHtml(t('totalTime'))}</th><th>${escapeHtml(t('responsibleOptional'))}</th></tr></thead><tbody>${steps.map(s=>`<tr><td><b>${escapeHtml(typeof workshopLabel==='function'?workshopLabel(s.name||''):(s.name||''))}</b></td><td>${Number(s.minutes||0)} ${escapeHtml(t('minutesShort'))}</td><td>${qty}</td><td><b>${escapeHtml(orderTimeText(Number(s.minutes||0)*qty))}</b></td><td>${escapeHtml(s.responsible||'—')}</td></tr>`).join('')}</tbody></table></div>`:`<div class="order-tech-empty order-tech-empty-action"><b>${escapeHtml(t('techOperations'))}</b><span>${escapeHtml(t('techOperationsEmptyApplyHint'))}</span></div>`}</section>`}
function applyTechnologyOperationTemplate(id,index,value){if(value)updateTechnologyOperation(id,index,'name',value)}
function materialDefaultWorkshop(category='',m=null){
  const cat=category||m?.category||'';
  if(cat==='Древесина')return 'Столярка';
  if(cat==='Ткань'||cat==='Экокожа'||cat==='Кожа')return 'Швейный цех';
  if(cat==='Поролон')return 'Поклейка';
  if(cat==='Фурнитура'||cat==='Крепёж')return 'Сборка';
  return '';
}
function orderWorkshopNames(o){
  const names=orderSteps(o).map(s=>String(s.name||'').trim()).filter(Boolean);
  return [...new Set([...names,'Столярка','Швейный цех','Поклейка','Тапицерка','Сборка','Упаковка'])];
}
function materialWorkshopForItem(item,m=null){
  return String(item?.workshop||materialDefaultWorkshop(item?.category,m)||'').trim();
}
function materialWorkshopOptions(o,selected=''){
  const current=String(selected||'').trim();
  const names=orderWorkshopNames(o);
  if(current&&!names.includes(current))names.unshift(current);
  return [`<option value="">${escapeHtml(t('auto'))}</option>`,...names.map(name=>`<option value="${escapeHtml(name)}" ${name===current?'selected':''}>${escapeHtml(workshopLabel(name))}</option>`)].join('');
}
function operationMaterials(o,op){
  const target=String(op?.stepName||'').trim();
  if(!target)return [];
  return orderMaterials(o).filter(item=>{
    const m=(data.materials||[]).find(x=>String(x.id)===String(item.materialId));
    return materialWorkshopForItem(item,m)===target;
  });
}
function orderItemConsumedQty(item){return Math.max(0,Number(item?.consumedQty||0))}
function orderItemConsumedForQty(item){return Math.max(0,Math.trunc(Number(item?.consumedForQty||0)))}
function orderItemConsumptionStatus(item,o){
  const total=orderProductQty(o),done=orderItemConsumedForQty(item);
  if(done<=0||orderItemConsumedQty(item)<=0)return 'не списано';
  return done>=total?'полностью':'частично';
}
function orderItemRemainingReserveQty(item,m=null){
  const unit=item?.unit||m?.unit||'';
  return Math.max(0,stockNumForUnit(Number(item?.qty||0)-orderItemConsumedQty(item),unit));
}
function normalizeOrderConsumptionFields(o){
  orderMaterials(o).forEach(item=>{
    item.consumedForQty=orderItemConsumedForQty(item);
    item.consumedQty=stockNumForUnit(orderItemConsumedQty(item),item.unit||'');
    item.consumptionStatus=orderItemConsumptionStatus(item,o);
  });
}
function operationConsumptionStats(o,op){
  const assigned=operationMaterials(o,op).filter(item=>Number(orderItemPerUnitQty(item,o))>0);
  const total=orderProductQty(o);
  if(!assigned.length)return {assigned,total,sets:total,last:null};
  const sets=Math.min(total,...assigned.map(orderItemConsumedForQty));
  const logs=(ensureWorkflowProduction(o).consumptionLogs||[]).filter(l=>!l.undone&&Number(l.stepIndex)===Number(op.stepIndex));
  return {assigned,total,sets,last:logs[0]||null};
}
function productionConsumptionPlan(o,op,qty){
  const current=productionCompletedQty(o,op),targetFor=Math.min(orderProductQty(o),current+qty),items=operationMaterials(o,op),rows=[],shortages=[];
  items.forEach(item=>{
    const m=(data.materials||[]).find(x=>String(x.id)===String(item.materialId));
    const unit=item.unit||orderUnitForMaterial(m,item.category)||m?.unit||'';
    const per=orderItemPerUnitQty(item,o);
    const alreadyFor=orderItemConsumedForQty(item);
    const deltaProducts=Math.max(0,targetFor-alreadyFor);
    const need=stockNumForUnit(deltaProducts*per,unit);
    if(!m||per<=0||deltaProducts<=0||need<=0)return;
    const stockBefore=convertMaterialQty(Number(m.quantity||0),m.unit||unit,unit,m);
    const stockAfter=stockNumForUnit(stockBefore-need,unit);
    const convertedNeed=convertMaterialQty(need,unit,m.unit||unit,m);
    const materialStockBefore=stockNumForUnit(Number(m.quantity||0),m.unit||unit);
    const materialStockAfter=stockNumForUnit(materialStockBefore-convertedNeed,m.unit||unit);
    const row={item,lineIndex:orderMaterials(o).indexOf(item),m,unit,per,qty:need,deltaProducts,targetFor,stockBefore,stockAfter,materialUnit:m.unit||unit,materialQty:convertedNeed,materialStockBefore,materialStockAfter};
    rows.push(row);
    if(stockBefore+0.0001<need)shortages.push(row);
  });
  return {ok:!shortages.length,qty,current,targetFor,rows,shortages};
}
function consumptionRowsText(rows){
  return rows.map(r=>`• ${materialTitle(r.m)} — ${qtyWithUnit(r.qty,r.unit)}`).join('\n')||'Материалы для списания не найдены';
}
function productionConsumptionPreviewHtml(plan){
  if(plan.shortages.length){
    const r=plan.shortages[0],missing=Math.max(0,stockNumForUnit(r.qty-r.stockBefore,r.unit));
    return `<div class="consumption-confirm danger"><h4>Недостаточно материала.</h4><div class="consumption-shortage"><b>${escapeHtml(materialTitle(r.m))}</b><div><span>Требуется:</span><strong>${escapeHtml(qtyWithUnit(r.qty,r.unit))}</strong></div><div><span>Доступно:</span><strong>${escapeHtml(qtyWithUnit(r.stockBefore,r.unit))}</strong></div><div><span>Не хватает:</span><strong>${escapeHtml(qtyWithUnit(missing,r.unit))}</strong></div></div></div>`;
  }
  const list=plan.rows.length?plan.rows.map(r=>`<li><span>${escapeHtml(materialTitle(r.m))}</span><b>${escapeHtml(qtyWithUnit(r.qty,r.unit))}</b></li>`).join(''):'<li><span>Для этой операции материалы не привязаны</span><b>0</b></li>';
  return `<div class="consumption-confirm"><h4>Будет отмечено выполненными: ${plan.qty} изделий</h4><p>Будут списаны материалы:</p><ul>${list}</ul></div>`;
}
function addProductionConsumptionAudit(o,op,log){
  const lines=(log.materials||[]).map(r=>`${r.materialTitle} — ${qtyWithUnit(r.qty,r.unit)}`);
  const text=`${productionActorName()}\nЗаказ ${o.number}\nОперация ${op.stepName}\nВыполнено: ${log.qty} изделий\nАвтоматически списано:\n${lines.map(x=>'• '+x).join('\n')}`;
  try{if(typeof auditAdd==='function')auditAdd('production_material_consumed','order',o.id,o.number,text,{orderId:o.id,orderNumber:o.number,step:op.stepName,qty:log.qty,materials:log.materials});}catch(e){}
  (log.materials||[]).forEach(r=>{
    try{if(typeof auditAdd==='function')auditAdd('production_material_consumed','material',r.materialId,r.materialTitle,`Заказ: ${o.number}. Операция: ${op.stepName}. Расход на изделие: ${qtyWithUnit(r.per,r.unit)}. Выполнено изделий: ${log.qty}. Списано: ${qtyWithUnit(r.qty,r.unit)}. Остаток до: ${qtyWithUnit(r.stockBefore,r.materialUnit)}. Остаток после: ${qtyWithUnit(r.stockAfter,r.materialUnit)}.`,{orderId:o.id,orderNumber:o.number,step:op.stepName,per:r.per,qty:r.qty,unit:r.unit,doneQty:log.qty,stockBefore:r.stockBefore,stockAfter:r.stockAfter});}catch(e){}
  });
}
function productionMeta(o){if(!o.production||typeof o.production!=='object')o.production={logs:[]};if(!Array.isArray(o.production.logs))o.production.logs=[];if(!Array.isArray(o.production.operations))o.production.operations=[];if(!Array.isArray(o.production.workSessions))o.production.workSessions=[];return o.production}
function applyProductionConsumptionPlan(o,op,plan,sessionId){
  normalizeOrderConsumptionFields(o);
  const log={id:uid(),sessionId,stepIndex:Number(op.stepIndex),stepName:op.stepName,qty:plan.qty,at:productionNow(),by:productionActorName(),materials:[]};
  plan.rows.forEach(r=>{
    {const __q0=Number(r.m.quantity||0);r.m.quantity=stockNumForUnit(Math.max(0,r.materialStockAfter),r.materialUnit);noteStockDelta(r.m,Number(r.m.quantity)-__q0)} // v8.22: в базу уйдёт изменение, а не готовое число
    r.m.lastUpdated=today();
    r.m.attributes=r.m.attributes||{};
    r.m.attributes.stockChangedBy=productionActorName();
    r.m.attributes.stockChangedByEmail=currentUser?.email||'';
    r.m.attributes.stockChangedAt=log.at;
    r.item.consumedForQty=Math.max(orderItemConsumedForQty(r.item),r.targetFor);
    r.item.consumedQty=stockNumForUnit(orderItemConsumedQty(r.item)+r.qty,r.unit);
    r.item.consumptionStatus=orderItemConsumptionStatus(r.item,o);
    if(!Array.isArray(r.item.consumptionLogs))r.item.consumptionLogs=[];
    r.item.consumptionLogs.unshift({id:log.id,at:log.at,stepName:op.stepName,qty:r.qty,unit:r.unit,forQty:r.deltaProducts,by:log.by});
    log.materials.push({materialId:r.m.id,lineIndex:r.lineIndex,materialTitle:materialTitle(r.m),sku:r.m.sku||'',qty:r.qty,unit:r.unit,per:r.per,forQty:r.deltaProducts,materialQty:r.materialQty,materialUnit:r.materialUnit,stockBefore:r.materialStockBefore,stockAfter:r.materialStockAfter});
  });
  const prod=productionMeta(o);
  if(!Array.isArray(prod.consumptionLogs))prod.consumptionLogs=[];
  prod.consumptionLogs.unshift(log);
  op.lastConsumption={qty:plan.qty,at:log.at,materials:log.materials.length};
  addProductionConsumptionAudit(o,op,log);
  return log;
}
function lastActiveConsumptionLog(o,stepIndex){
  const logs=ensureWorkflowProduction(o).consumptionLogs||[];
  return logs.find(l=>!l.undone&&Number(l.stepIndex)===Number(stepIndex))||null;
}
const PRODUCTION_STATUS_META={
  not_started:{label:'prodStatusNotStarted',tone:'idle'},
  running:{label:'prodStatusRunning',tone:'running'},
  paused:{label:'prodStatusPaused',tone:'paused'},
  done:{label:'prodStatusDone',tone:'done'},
  cancelled:{label:'prodStatusCancelled',tone:'cancelled'}
};
function productionActorName(){try{if(typeof profileDisplayName==='function')return profileDisplayName();if(typeof actorName==='function')return actorName();}catch(e){}return t('unknownUser')}
function productionNow(){return new Date().toISOString()}
function productionDateValue(iso){const d=new Date(iso||'');return Number.isNaN(d.getTime())?0:d.getTime()}
function productionMinutesBetween(start,end){const a=productionDateValue(start),b=productionDateValue(end||productionNow());return a&&b?Math.max(0,Math.round((b-a)/60000)):0}

// ================== v7.84: рабочее время цехов — учёт по сменам ==================
// Раньше "фактическое время" операции считалось как "сейчас минус самый первый запуск, минус сумма
// пауз" (см. старую productionActualMinutes ниже) — если сотрудник забывал нажать паузу вечером,
// время натекало всю ночь, потому что статус заказа/операции и реальное отработанное время были
// одной и той же цифрой. Пользователь явно попросил их разделить: статус может жить сколько угодно
// (заказ днями остаётся "В работе"), а время считается только по реальным рабочим сессиям.
//
// Настройки смены — общие на все цеха (первый этап; per-workshop переопределения зарезервированы в
// shiftSettings().perWorkshop на будущее, но экрана для них пока нет). Хранится в data.settings —
// как и notificationRules() рядом — то есть, как и они, это НАСТРОЙКА ЭТОГО БРАУЗЕРА, а не общая
// для всех устройств строка синхронизации (см. ORDER_SYNC_ARTICLE/ACCESS_SYNC_ARTICLE в index.html).
// v8.18: ИЗМЕНЕНО — график теперь общий, см. currentSharedShiftSchedule()/applySharedShiftSchedule() ниже.
// Рабочие сессии (кто когда реально работал) — часть данных ЗАКАЗА и потому синхронизируются со всеми
// устройствами как обычно; не синхронизируется только сама настройка "с какого до какого часа смена".
const DEFAULT_SHIFT_SCHEDULE={workDays:[1,2,3,4,5],startTime:'08:00',endTime:'17:00',timezone:'Europe/Riga',autoEndAtShiftEnd:true,allowOvertime:true};
// v8.18: график смены теперь ОБЩИЙ: владелец сохраняет его в служебную строку доступа (index.html:
// saveWorkerAccessList → attributes.shiftSchedule), остальные устройства получают его при загрузке и через realtime
// (applyAccessSyncRow → applySharedShiftSchedule). Локальная копия в data.settings остаётся кэшем.
function currentSharedShiftSchedule(){
  const d=shiftSettings().default;
  return {workDays:[...d.workDays],startTime:d.startTime,endTime:d.endTime,timezone:d.timezone,autoEndAtShiftEnd:!!d.autoEndAtShiftEnd,allowOvertime:!!d.allowOvertime};
}
function applySharedShiftSchedule(src){
  const d=shiftSettings().default,before=JSON.stringify(currentSharedShiftSchedule());
  if(Array.isArray(src.workDays)&&src.workDays.length)d.workDays=src.workDays.map(Number).filter(v=>v>=0&&v<=6);
  if(/^([01]\d|2[0-3]):[0-5]\d$/.test(src.startTime||''))d.startTime=src.startTime;
  if(/^([01]\d|2[0-3]):[0-5]\d$/.test(src.endTime||''))d.endTime=src.endTime;
  if(src.timezone){try{new Intl.DateTimeFormat('en-US',{timeZone:src.timezone});d.timezone=src.timezone}catch(e){}}
  if(src.autoEndAtShiftEnd!=null)d.autoEndAtShiftEnd=!!src.autoEndAtShiftEnd;
  if(src.allowOvertime!=null)d.allowOvertime=!!src.allowOvertime;
  shiftSettings();
  if(JSON.stringify(currentSharedShiftSchedule())!==before&&typeof renderShiftSchedulePanel==='function'&&document.getElementById('shiftSchedulePanel')){renderShiftSchedulePanel();}
}
// Сервер ещё не знает про график (первый заход после обновления): если владелец раньше настраивал его на этом
// устройстве — один раз отправляем, чтобы у остальных стал такой же.
let shiftSchedulePushedOnce=false;
function pushLocalShiftScheduleOnce(){
  if(shiftSchedulePushedOnce||typeof isNotificationAdmin!=='function'||!isNotificationAdmin())return;
  const cur=currentSharedShiftSchedule();
  if(JSON.stringify(cur)===JSON.stringify(DEFAULT_SHIFT_SCHEDULE))return;
  shiftSchedulePushedOnce=true;
  if(typeof saveWorkerAccessList==='function')saveWorkerAccessList(workerAccessList,{silent:true});
}
function shiftSettings(){
  if(!data.settings||typeof data.settings!=='object')data.settings={};
  if(!data.settings.shiftSchedule||typeof data.settings.shiftSchedule!=='object')data.settings.shiftSchedule={};
  const s=data.settings.shiftSchedule;
  if(!s.default||typeof s.default!=='object')s.default={};
  const d=s.default;
  if(!Array.isArray(d.workDays)||!d.workDays.length)d.workDays=[...DEFAULT_SHIFT_SCHEDULE.workDays];
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.startTime||''))d.startTime=DEFAULT_SHIFT_SCHEDULE.startTime;
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.endTime||''))d.endTime=DEFAULT_SHIFT_SCHEDULE.endTime;
  if(!d.timezone)d.timezone=DEFAULT_SHIFT_SCHEDULE.timezone;
  if(d.autoEndAtShiftEnd==null)d.autoEndAtShiftEnd=true;
  if(d.allowOvertime==null)d.allowOvertime=true;
  if(!s.perWorkshop||typeof s.perWorkshop!=='object')s.perWorkshop={};
  return s;
}
// workshopName зарезервирован под будущий персональный график цеха — пока всегда возвращает общий.
function shiftScheduleFor(workshopName){
  const s=shiftSettings(),override=s.perWorkshop[workshopName];
  return override&&typeof override==='object'?{...s.default,...override}:s.default;
}
// Перевод "часы:минуты в конкретном часовом поясе, в конкретный день" в реальный момент времени
// (epoch ms) — без библиотек, через Intl.DateTimeFormat: смотрим, как один и тот же (угаданный)
// момент читается в целевой зоне, и подправляем разницу. Работает и на переходах летнее/зимнее время,
// потому что использует встроенную в браузер базу IANA, а не фиксированное смещение.
function zonedWallTimeToInstant(y,mo,d,h,mi,tz){
  const guess=Date.UTC(y,mo-1,d,h,mi,0);
  const fmt=new Intl.DateTimeFormat('en-US',{timeZone:tz,hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const parts=Object.fromEntries(fmt.formatToParts(new Date(guess)).map(p=>[p.type,p.value]));
  const readAsUtc=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),parts.hour==='24'?0:Number(parts.hour),Number(parts.minute),Number(parts.second));
  return guess+(guess-readAsUtc);
}
function tzNowParts(tz){
  const fmt=new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false});
  const parts=Object.fromEntries(fmt.formatToParts(new Date()).map(p=>[p.type,p.value]));
  const weekdayMap={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  return {y:Number(parts.year),mo:Number(parts.month),d:Number(parts.day),weekday:weekdayMap[parts.weekday],hour:parts.hour==='24'?0:Number(parts.hour),minute:Number(parts.minute)};
}
// Границы СЕГОДНЯШНЕЙ смены в реальном времени (epoch ms) по графику; null, если сегодня по графику
// не рабочий день (в первой версии — просто "не входит в workDays", без праздников/переносов).
function todayShiftWindow(schedule){
  const tz=schedule.timezone||DEFAULT_SHIFT_SCHEDULE.timezone,now=tzNowParts(tz);
  if(!(schedule.workDays||DEFAULT_SHIFT_SCHEDULE.workDays).includes(now.weekday))return null;
  const [sh,sm]=(schedule.startTime||DEFAULT_SHIFT_SCHEDULE.startTime).split(':').map(Number);
  const [eh,em]=(schedule.endTime||DEFAULT_SHIFT_SCHEDULE.endTime).split(':').map(Number);
  return {startMs:zonedWallTimeToInstant(now.y,now.mo,now.d,sh,sm,tz),endMs:zonedWallTimeToInstant(now.y,now.mo,now.d,eh,em,tz)};
}
// v8.11: календарный день (ГГГГ-ММ-ДД) момента в часовом поясе смены и окно смены ДЛЯ ЭТОГО дня (не только для
// сегодняшнего) — нужны, чтобы сессия, оставшаяся открытой с прошлых дней, закрывалась концом смены того дня,
// когда началась, а не «сейчас» (иначе в её время засчитывались часы/сутки, когда никто не работал).
function tzDayKeyOf(ms,tz){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function shiftWindowForInstant(schedule,ms){
  const tz=schedule.timezone||DEFAULT_SHIFT_SCHEDULE.timezone,workDays=schedule.workDays||DEFAULT_SHIFT_SCHEDULE.workDays;
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
  const y=Number(p.year),mo=Number(p.month),d=Number(p.day);
  const weekday={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[new Intl.DateTimeFormat('en-US',{timeZone:tz,weekday:'short'}).format(new Date(zonedWallTimeToInstant(y,mo,d,12,0,tz)))];
  if(!workDays.includes(weekday))return null;
  const [sh,sm]=(schedule.startTime||DEFAULT_SHIFT_SCHEDULE.startTime).split(':').map(Number);
  const [eh,em]=(schedule.endTime||DEFAULT_SHIFT_SCHEDULE.endTime).split(':').map(Number);
  return {startMs:zonedWallTimeToInstant(y,mo,d,sh,sm,tz),endMs:zonedWallTimeToInstant(y,mo,d,eh,em,tz)};
}
// v7.87: во сколько начинается СЛЕДУЮЩАЯ по графику смена после указанного момента (epoch ms) — нужно,
// чтобы сверхурочная сессия не переспрашивалась и не останавливалась повторно каждые 30 секунд весь
// вечер, а держалась до начала следующей смены (например, до 8 утра следующего рабочего дня), и только
// тогда останавливалась автоматически. Перебираем календарные дни в часовом поясе смены (до 8 дней
// вперёд — достаточно с запасом даже при графике "только одна рабочая суббота в месяц" и т.п.).
function nextShiftStartMs(schedule,afterMs){
  const tz=schedule.timezone||DEFAULT_SHIFT_SCHEDULE.timezone;
  const workDays=schedule.workDays||DEFAULT_SHIFT_SCHEDULE.workDays;
  const [sh,sm]=(schedule.startTime||DEFAULT_SHIFT_SCHEDULE.startTime).split(':').map(Number);
  const weekdayMap={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  const wdFmt=new Intl.DateTimeFormat('en-US',{timeZone:tz,weekday:'short'});
  const dateFmt=new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'});
  let parts=Object.fromEntries(dateFmt.formatToParts(new Date(afterMs)).map(p=>[p.type,p.value]));
  let y=Number(parts.year),mo=Number(parts.month),d=Number(parts.day);
  for(let i=0;i<8;i++){
    const noonInstant=zonedWallTimeToInstant(y,mo,d,12,0,tz);
    const weekday=weekdayMap[wdFmt.format(new Date(noonInstant))];
    if(workDays.includes(weekday)){
      const startMs=zonedWallTimeToInstant(y,mo,d,sh,sm,tz);
      if(startMs>afterMs)return startMs;
    }
    parts=Object.fromEntries(dateFmt.formatToParts(new Date(noonInstant+24*3600*1000)).map(p=>[p.type,p.value]));
    y=Number(parts.year);mo=Number(parts.month);d=Number(parts.day);
  }
  return afterMs+24*3600*1000; // защита от неверного графика (например, ни одного рабочего дня) — не зависаем
}

// ---- Рабочие сессии (отдельная сущность, добавляется к производственным данным заказа) ----
// Каждая сессия: {id, orderId, workshop, stepIndex, userEmail, startedAt, endedAt, stopReason, overtime}.
// stopReason: manual_pause | end_of_shift | switch_order | order_completed | material_shortage | overtime_end.
// v8.09: НЕСКОЛЬКО человек на одной операции. Раньше на операцию приходилась одна открытая сессия «на всех»
// (startWorkSession выходил, если открытая уже была), а отметка выпуска ставила операцию на паузу для всех.
// Теперь у каждого человека своя открытая сессия; операция «в работе», пока открыта хотя бы одна.
function sessionUserKey(email){return String(email||'').trim().toLowerCase()}
function openWorkSessions(o,stepIndex){return (productionMeta(o).workSessions||[]).filter(s=>Number(s.stepIndex)===Number(stepIndex)&&!s.endedAt)}
// email не задан — любая открытая сессия операции (как раньше); задан — сессия этого человека.
function currentWorkSession(o,stepIndex,email){
  const list=openWorkSessions(o,stepIndex);
  if(email===undefined)return list[0]||null;
  return list.find(s=>sessionUserKey(s.userEmail)===sessionUserKey(email))||null;
}
function myWorkSession(o,stepIndex){return currentWorkSession(o,stepIndex,currentUser?.email||'')}
function closeWorkSession(session,stopReason,endedAt){
  session.endedAt=endedAt||productionNow();
  // Сессия, которая шла сверхурочно, закрывается как overtime_end, а не обычной причиной — иначе из
  // истории потерялось бы, что это было именно окончание переработки, а не обычная пауза/смена.
  session.stopReason=(session.overtime&&(stopReason==='manual_pause'||stopReason==='end_of_shift'))?'overtime_end':stopReason;
  return session;
}
// Статус операции — производное от сессий: «в работе», пока открыта хотя бы одна; закрылась последняя —
// «на паузе». Вызывается после любого закрытия/открытия сессии.
function syncOpRunningState(o,op,when){
  if(!op||op.status==='done'||op.status==='cancelled')return;
  if(openWorkSessions(o,op.stepIndex).length){op.status='running';op.pausedAt='';}
  else if(op.status==='running'){op.status='paused';op.pausedAt=when||productionNow();op.currentSessionStartedAt='';op.currentSessionPauseMinutes=0;}
}
// После слияния заказа с чужой версией (index.html → union рабочих сессий) статус мог разойтись с сессиями.
function reconcileOrderRunningStates(o){
  productionOps(o).forEach(op=>{
    if(op.status==='paused'||op.status==='not_started'){
      if(openWorkSessions(o,op.stepIndex).length){op.status='running';op.pausedAt='';}
    }
  });
}
function findOpenWorkSessionForUser(email){
  if(!email)return null;
  for(const o of (data.orders||[])){
    const s=(productionMeta(o).workSessions||[]).find(s=>!s.endedAt&&String(s.userEmail||'').toLowerCase()===String(email).toLowerCase());
    if(s)return {order:o,session:s};
  }
  return null;
}
function startWorkSession(o,op){
  if(myWorkSession(o,op.stepIndex))return; // МОЯ сессия на эту операцию уже открыта (чужие не мешают — работать можно вместе)
  productionMeta(o).workSessions.unshift({id:uid(),orderId:o.id,workshop:op.stepName,stepIndex:op.stepIndex,userEmail:currentUser?.email||'',userName:productionActorName(),startedAt:productionNow(),endedAt:'',stopReason:'',overtime:false});
}
// По умолчанию закрывает МОЮ сессию; options.all — все открытые сессии операции (заказ выполнен/завершён).
function endWorkSession(o,stepIndex,stopReason,options={}){
  const list=options.all?openWorkSessions(o,stepIndex):[myWorkSession(o,stepIndex)].filter(Boolean);
  list.forEach(session=>closeWorkSession(session,stopReason,options.endedAt));
  return list[0]||null;
}
function workSessionMinutes(session,capMs){
  const start=productionDateValue(session.startedAt);
  const end=session.endedAt?productionDateValue(session.endedAt):(capMs||Date.now());
  return start&&end?Math.max(0,Math.round((end-start)/60000)):0;
}
// Операция была запущена ДО того, как в проекте появились рабочие сессии (или сессия потерялась
// иначе) — восстанавливаем её начало по имеющимся полям, чтобы не терять контроль над временем.
function ensureRunningOpHasWorkSession(o,op){
  if(op.status!=='running'||currentWorkSession(o,op.stepIndex))return;
  const startedAt=op.currentSessionStartedAt||op.startedAt||productionNow();
  productionMeta(o).workSessions.unshift({id:uid(),orderId:o.id,workshop:op.stepName,stepIndex:op.stepIndex,userEmail:currentUser?.email||'',userName:productionActorName(),startedAt,endedAt:'',stopReason:'',overtime:false});
}
// Сегодняшние рабочие сессии конкретной операции заказа — источник "Сегодня отработано" в блоке
// смены на активной карточке заказа (см. workshopShiftInfoHtml). Смены по графику не переходят через
// полночь (ночные смены — вне первой версии, см. настройки смены), поэтому сессии всегда начинаются
// и заканчиваются в один календарный день — достаточно сравнить дату старта.
function opWorkSessionsToday(o,stepIndex){
  const todayStr=today();
  return (productionMeta(o).workSessions||[]).filter(s=>Number(s.stepIndex)===Number(stepIndex)&&String(s.startedAt||'').slice(0,10)===todayStr);
}
function opWorkedMinutesToday(o,stepIndex){return opWorkSessionsToday(o,stepIndex).reduce((sum,s)=>sum+workSessionMinutes(s),0)}
// v7.84: ленивая проверка автостопа — сайт статический (без бэкенда/крона), поэтому "автоматически
// в конце смены" здесь означает "при первом же обращении к данным после конца смены", а не ровно
// в 17:00:00. Вызывается при каждом рендере "Цехов" и по интервалу, пока экран открыт (см. ниже) —
// это единственный способ достичь близкого к реальному времени результата без сервера. Собственную,
// ДРУГУЮ сессию (не текущего пользователя) автостоп всегда просто останавливает — спросить "работать
// сверхурочно?" можно только у того, кто сейчас физически за экраном.
// v7.87: раньше, once сотрудник соглашался на сверхурочную работу (session.overtime=true), на СЛЕДУЮЩЕЙ
// же проверке (через 30 сек) условие "спросить" (!session.overtime) переставало выполняться — и код
// молча проваливался в код ОСТАНОВКИ сессии, которая была написана для случая "не спросили/отказались".
// Сверхурочная сессия останавливалась почти сразу после того, как её только что разрешили. Теперь пока
// session.overtime===true, сессия НЕ переспрашивается и не останавливается, пока не наступит начало
// СЛЕДУЮЩЕЙ смены по графику (например, 8:00 следующего рабочего дня) — вот тогда уже автостоп.
function applyShiftAutoStops(){
  if(!(typeof currentUser!=='undefined'&&currentUser))return [];
  const touched=[];
  (data.orders||[]).forEach(o=>{
    productionOps(o).forEach(op=>{
      if(op.status!=='running')return;
      ensureRunningOpHasWorkSession(o,op);
      const schedule=shiftScheduleFor(op.stepName);
      if(!schedule.autoEndAtShiftEnd)return;
      // v8.09: у операции может быть несколько открытых сессий (разные люди) — каждая проверяется отдельно.
      let stopped=false,stoppedAt='',overtimeOn=false;
      const tz=schedule.timezone||DEFAULT_SHIFT_SCHEDULE.timezone;
      openWorkSessions(o,op.stepIndex).forEach(session=>{
        const startMs=productionDateValue(session.startedAt)||Date.now();
        if(session.overtime){
          // v8.11: «до начала следующей смены» считаем от НАЧАЛА сессии. Раньше — от текущего момента, то есть
          // всегда «в будущем»: условие ниже никогда не выполнялось, и сверхурочная сессия не закрывалась вовсе.
          const nextStart=nextShiftStartMs(schedule,startMs);
          if(Date.now()<nextStart)return; // сверхурочная сессия ещё идёт — не трогаем и не переспрашиваем
          const endedAt=new Date(nextStart).toISOString();
          closeWorkSession(session,'overtime_end',endedAt);
          stopped=true;stoppedAt=endedAt;
          return;
        }
        // v8.11: сессия осталась открытой с ПРОШЛОГО дня (никто не нажал «Пауза»/«Завершить смену», а экран потом
        // долго не открывали). Закрываем её концом смены ТОГО дня, когда она началась (если начали уже после конца
        // смены или в нерабочий день — сразу, 0 минут), а не «сейчас»: иначе в неё засчитывались сутки, когда
        // никто не работал (например, 33 часа у одного человека).
        if(tzDayKeyOf(startMs,tz)!==tzDayKeyOf(Date.now(),tz)){
          const w0=shiftWindowForInstant(schedule,startMs);
          const endMs=Math.min(Date.now(),w0?Math.max(w0.endMs,startMs):startMs);
          const endedAt=new Date(endMs).toISOString();
          closeWorkSession(session,'end_of_shift',endedAt);
          stopped=true;stoppedAt=endedAt;
          return;
        }
        const win=todayShiftWindow(schedule),isOverdue=win?Date.now()>win.endMs:true; // сегодня выходной — тоже пора остановить
        if(!isOverdue)return;
        const isOwn=String(session.userEmail||'').toLowerCase()===String(currentUser.email||'').toLowerCase();
        if(isOwn&&schedule.allowOvertime){
          const confirmText=win?String(t('shiftOvertimeConfirm')).replace('{time}',schedule.endTime):t('shiftOvertimeConfirmNonWorkDay');
          const ok=confirm(confirmText);
          if(ok){session.overtime=true;overtimeOn=true;return}
        }
        const endedAt=win?new Date(win.endMs).toISOString():productionNow();
        closeWorkSession(session,'end_of_shift',endedAt);
        stopped=true;stoppedAt=endedAt;
      });
      if(stopped){syncOpRunningState(o,op,stoppedAt);touched.push({o,op,kind:'stopped'})}
      if(overtimeOn)touched.push({o,op,kind:'overtime'});
    });
  });
  return touched;
}
// Сохраняет результат applyShiftAutoStops() — отдельно от самой проверки, чтобы её можно было
// безопасно звать из синхронного рендера (см. renderWorkshops), не блокируя его сетевым запросом.
function persistShiftAutoStops(touched){
  if(!touched||!touched.length)return;
  save();
  touched.filter(x=>x.kind==='stopped').forEach(({o,op})=>{if(typeof auditAdd==='function')auditAdd('production_operation_shift_ended','order',o.id,o.number,`${t('shiftAutoEndedAudit')}: ${workshopLabel(op.stepName)}`,{step:op.stepName})});
  Promise.resolve().then(()=>{if(typeof persistOrdersToSupabase==='function')return persistOrdersToSupabase()}).catch(()=>{});
}
function ensureWorkflowProduction(o){
  if(!o.production||typeof o.production!=='object')o.production={logs:[]};
  if(!Array.isArray(o.production.logs))o.production.logs=[];
  if(!Array.isArray(o.production.operations))o.production.operations=[];
  const existing=new Map(o.production.operations.map(op=>[Number(op.stepIndex),op]));
  o.production.operations=orderSteps(o).map((step,index)=>{
    const old=existing.get(index)||{};
    const status=PRODUCTION_STATUS_META[old.status]?old.status:(old.finishedAt?'done':old.startedAt?'running':'not_started');
    const completedQty=old.completedQty==null&&status==='done'?orderProductQty(o):Math.max(0,Math.trunc(Number(old.completedQty||0)));
    return Object.assign({id:old.id||uid(),stepIndex:index,stepName:step.name||t('operationStage'),status,startedAt:'',pausedAt:'',finishedAt:'',pauseMinutes:0,actualMinutes:0,completedQty:0,responsible:step.responsible||'',comment:'',comments:[],sessions:[],currentSessionStartedAt:'',currentSessionPauseMinutes:0,collapsed:false},old,{stepIndex:index,stepName:step.name||old.stepName||t('operationStage'),responsible:old.responsible||step.responsible||'',completedQty,sessions:Array.isArray(old.sessions)?old.sessions:[]});
  });
  return o.production;
}
function productionOps(o){return ensureWorkflowProduction(o).operations.filter(op=>{const st=orderSteps(o)[op.stepIndex];return Number(st?.minutes||0)>0||(Array.isArray(st?.operations)&&st.operations.length>0)})}
function productionOp(o,index){return ensureWorkflowProduction(o).operations.find(op=>Number(op.stepIndex)===Number(index))}
function productionPlanMinutesForStep(o,index){const step=orderSteps(o)[Number(index)]||{};return Math.max(0,Math.round(Number(step.minutes||0)*orderProductQty(o)))}
// v7.84: раньше, пока операция "running", факт считался как "сейчас минус самый первый запуск,
// минус накопленные паузы" — если сотрудник забывал нажать паузу, время натекало сколько угодно
// (в т.ч. всю ночь). Теперь, если у операции уже есть рабочие сессии (см. o.production.workSessions),
// факт — это их сумма: каждая закрытая сессия даёт свою длительность как есть, а открытая (сейчас
// идёт работа) считается только до текущего момента — но к моменту, когда это читается, applyShiftAutoStops()
// уже должен был закрыть любую сессию, просроченную по концу смены, так что "открытых" сессий,
// тянущихся много часов сверх графика, в норме быть не должно. Второй параметр (o) опционален только
// для мест, где заказ временно недоступен — там остаётся старое поведение как запасной вариант.
function productionActualMinutes(op,o){
  if(!op)return 0;
  if(!o)return op.status==='running'?Math.max(Number(op.actualMinutes||0),productionMinutesBetween(op.startedAt)-Number(op.pauseMinutes||0)):Math.max(0,Math.round(Number(op.actualMinutes||0)));
  const sessions=(productionMeta(o).workSessions||[]).filter(s=>Number(s.stepIndex)===Number(op.stepIndex));
  if(!sessions.length)return op.status==='running'?Math.max(Number(op.actualMinutes||0),productionMinutesBetween(op.startedAt)-Number(op.pauseMinutes||0)):Math.max(0,Math.round(Number(op.actualMinutes||0)));
  return sessions.reduce((sum,s)=>sum+workSessionMinutes(s),0);
}
function productionCompletedQty(o,op){if(!op)return 0;const total=orderProductQty(o);if(op.status==='done'&&op.completedQty==null)return total;return Math.max(0,Math.min(total,Math.trunc(Number(op.completedQty||0))))}
function productionOpPercent(o,op){if(!op||op.status==='cancelled')return 0;return Math.round(productionCompletedQty(o,op)/orderProductQty(o)*100)}
function calcWorkflowProductionPercent(o){const ops=productionOps(o).filter(op=>op.status!=='cancelled');if(!ops.length)return 0;const total=orderProductQty(o)*ops.length,done=ops.reduce((sum,op)=>sum+productionCompletedQty(o,op),0);return Math.max(0,Math.min(100,Math.round(done/total*100)))}
function productionDoneCount(o){return productionOps(o).filter(op=>op.status==='done').length}
function productionRunningCount(o){return productionOps(o).filter(op=>op.status==='running'||op.status==='paused').length}
function productionCurrentOp(o){return productionOps(o).find(op=>op.status==='running')||productionOps(o).find(op=>op.status==='paused')||productionOps(o).find(op=>op.status==='not_started')||null}
function productionLeftMinutes(o){return productionOps(o).reduce((sum,op)=>op.status==='done'||op.status==='cancelled'?sum:sum+Math.max(0,productionPlanMinutesForStep(o,op.stepIndex)-productionActualMinutes(op,o)),0)}
function productionEtaText(o){const min=productionLeftMinutes(o);if(!min)return t('prodQueueDone');const d=new Date(Date.now()+min*60000);return d.toLocaleString(currentLang==='ru'?'ru-RU':currentLang==='lv'?'lv-LV':'en-GB',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
function productionStatusLabel(status){return t(PRODUCTION_STATUS_META[status]?.label||'prodStatusNotStarted')}
function productionStatusClass(status){return PRODUCTION_STATUS_META[status]?.tone||'idle'}
function workshopIcon(name){const n=String(name||'').toLowerCase();if(n.includes('стол')||n.includes('wood')||n.includes('gald'))return '🪚';if(n.includes('швей')||n.includes('sew')||n.includes('šū'))return '🧵';if(n.includes('пок')||n.includes('glue')||n.includes('līm'))return '🧴';if(n.includes('тап')||n.includes('uphol'))return '🛋';if(n.includes('упак')||n.includes('pack'))return '📦';return '📦'}
// v6.86: завершённые/отменённые операции больше не считаются частью очереди цеха — иначе
// уже сделанная на 100% работа продолжала засчитываться в "Очередь"/"В работе"/"Загрузка" и
// могла ложно показывать цех "перегруженным", хотя по факту в нём не осталось работы.
function productionQueueForWorkshop(stepName){
  const rows=(data.orders||[]).flatMap(order=>orderSteps(order).map((step,index)=>({order,step,index}))).filter(row=>{
    if(Number(row.step.minutes||0)<=0)return false;
    if(String(row.step.name||'').trim()!==String(stepName||'').trim())return false;
    if(orderIsTerminal(row.order.status))return false;
    const op=productionOp(row.order,row.index);
    if(op&&(op.status==='done'||op.status==='cancelled'))return false;
    return true;
  });
  rows.sort((a,b)=>String(rowDueDate(a)||a.order.date||'').localeCompare(String(rowDueDate(b)||b.order.date||'')));
  return rows;
}
function productionQueueState(orderId,stepIndex){
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return {position:0,total:0,label:t('prodQueueWaiting')};
  const step=orderSteps(o)[Number(stepIndex)]||{},queue=productionQueueForWorkshop(step.name),idx=queue.findIndex(row=>String(row.order.id)===String(orderId));
  const op=productionOp(o,stepIndex);
  if(op&&(op.status==='done'||op.status==='cancelled'))return {position:0,total:queue.length,label:productionStatusLabel(op.status)};
  const label=op?.status==='running'?t('prodQueueNow'):idx===0?t('prodQueueNext'):idx>0?t('prodQueueWaiting'):t('prodQueueWaiting');
  return {position:idx>=0?idx+1:0,total:queue.length,label};
}
const WORKSHOP_WEEKLY_CAPACITY_MINUTES=5*8*60; // 5 рабочих дней по 8 часов = 2400 мин/нед на цех
const WORKDAY_MINUTES=8*60;
function productionRemainingMinutesForStep(o,index){
  const step=orderSteps(o)[Number(index)]||{},op=productionOp(o,index);
  const remainingQty=Math.max(0,orderProductQty(o)-productionCompletedQty(o,op));
  return Math.max(0,Math.round(Number(step.minutes||0)*remainingQty));
}
// Проекция даты готовности с учётом рабочих дней Пн–Пт по 8 часов (выходные пропускаются).
function projectedCompletionDate(minutesNeeded){
  const d=new Date();d.setHours(0,0,0,0);
  let remaining=Math.max(0,Math.round(minutesNeeded));
  if(remaining===0)return d.toISOString().slice(0,10);
  for(let guard=0;guard<3650;guard++){
    const day=d.getDay();
    if(day!==0&&day!==6){
      remaining-=WORKDAY_MINUTES;
      if(remaining<=0)return d.toISOString().slice(0,10);
    }
    d.setDate(d.getDate()+1);
  }
  return d.toISOString().slice(0,10);
}
// Прогноз готовности каждого заказа в очереди цеха, с учётом всех заказов, стоящих перед ним
// (цех — один поток, поэтому заказ не может начаться, пока не закончены более ранние по очереди).
function workshopQueueEtaMap(queue){
  const map=new Map();
  let cumulative=0;
  (queue||[]).forEach(row=>{
    cumulative+=productionRemainingMinutesForStep(row.order,row.index);
    map.set(`${row.order.id}_${row.index}`,projectedCompletionDate(cumulative));
  });
  return map;
}
function workshopAnalytics(stepName){
  const queue=productionQueueForWorkshop(stepName),todayStr=today();
  // v7.03: "active" раньше считался по статусу ЗАКАЗА ('В работе'/'В производстве') — то есть заказ,
  // который в целом уже в производстве, но до ЭТОГО конкретного цеха очередь ещё не дошла, тоже
  // засчитывался как "в работе" здесь. Из-за этого колонка "В работе" могла показывать, например, 1,
  // хотя статус-бейдж того же цеха честно говорил "Ожидает" (реально запущенных операций не было).
  // Теперь active = количество операций, которые ДЕЙСТВИТЕЛЬНО запущены (running) именно на этом цехе —
  // то же самое, что использует бейдж статуса (workshopStatusBadgeHtml/workshopOpStatusCounts).
  const active=workshopOpStatusCounts(queue).running;
  const overdue=queue.filter(row=>{const d=rowDueDate(row);return d&&d<todayStr}).length;
  const etaMap=workshopQueueEtaMap(queue);
  const atRisk=queue.filter(row=>{
    const due=rowDueDate(row);
    if(!due||due<todayStr)return false; // уже просрочен — считается отдельно
    const eta=etaMap.get(`${row.order.id}_${row.index}`);
    return !!eta&&eta>due;
  }).length;
  const plan=queue.reduce((s,row)=>s+productionPlanMinutesForStep(row.order,row.index),0);
  const actual=queue.reduce((s,row)=>s+productionActualMinutes(productionOp(row.order,row.index),row.order),0);
  const remainingQty=queue.reduce((s,row)=>{const op=productionOp(row.order,row.index);return s+Math.max(0,orderProductQty(row.order)-productionCompletedQty(row.order,op))},0);
  const load=Math.max(0,Math.round(plan/WORKSHOP_WEEKLY_CAPACITY_MINUTES*100));
  const warnings=[];
  if(load>=100)warnings.push(`${t('prodWarnOverloaded')} ${stepName}`);
  if(overdue>0)warnings.push(`${stepName} ${t('prodWarnDelayed')} +${orderTimeText(Math.max(60,actual-plan))}`);
  if(plan>0&&actual>plan*1.35)warnings.push(`${stepName} ${t('prodWarnPlanExceeded')}`);
  if(atRisk>0)warnings.push(`${stepName}: ${t('workshopRiskWarningPrefix')} ${atRisk} ${atRisk===1?t('orderWordOne'):t('orderWordMany')}`);
  return {queue,active,overdue,plan,actual,load,remainingQty,atRisk,etaMap,warnings};
}

// ===== Раздел "Цеха": та же производственная информация, что и в заказе, но сгруппированная
// по цеху, а не по заказу — рабочему цеха не нужно открывать заказы по одному, чтобы увидеть
// свою очередь. Переиспользует productionOperationCardHtml/workshopAnalytics без дублирования логики.
let selectedWorkshopName='';
function allWorkshopNames(){
  const names=[];
  DEFAULT_ORDER_STEPS.forEach(s=>{if(s.name&&!names.includes(s.name))names.push(s.name)});
  (data.orders||[]).forEach(o=>orderSteps(o).forEach(s=>{if(s.name&&!names.includes(s.name))names.push(s.name)}));
  // v7.42: в рабочем режиме (см. index.html applyWorkerModeForCurrentUser) обзор цехов, «сейчас
  // выполняется» и т.п. должны показывать только цеха, назначенные этому сотруднику в Настройках —
  // единая точка фильтрации, а не отдельная правка каждого места, где используется этот список.
  if(typeof document!=='undefined'&&document.body&&document.body.classList.contains('worker-mode')){
    const allowed=window.WORKER_WORKSHOPS||[];
    return names.filter(n=>allowed.includes(n));
  }
  return names;
}
function jsStrArg(v){return String(v||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}
function workshopOpStatusCounts(queue){
  let running=0,paused=0;
  (queue||[]).forEach(row=>{
    const op=productionOp(row.order,row.index);
    if(op?.status==='running')running++;
    else if(op?.status==='paused')paused++;
  });
  return {running,paused};
}
function workshopStatusBadgeHtml(queue){
  const {running,paused}=workshopOpStatusCounts(queue);
  if(running>0)return `<span class="production-status-pill running">${escapeHtml(t('prodStatusRunning'))}</span>`;
  if(paused>0)return `<span class="production-status-pill paused">${escapeHtml(t('prodStatusPaused'))}</span>`;
  // v7.02: пустая очередь (queue.length===0) — это не то же самое, что "Ожидает" (задачи есть, но
  // ещё не начаты). Раньше оба случая показывали один и тот же текст "Ожидает", из-за чего цех без
  // единой задачи выглядел так, будто что-то реально ждёт своей очереди.
  if(!queue||!queue.length)return `<span class="production-status-pill">${escapeHtml(t('prodStatusIdle'))}</span>`;
  return `<span class="production-status-pill">${escapeHtml(t('prodQueueWaiting'))}</span>`;
}
function productionStartedAtText(iso){
  if(!iso)return '—';
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))return '—';
  if(d.toISOString().slice(0,10)===today())return d.toLocaleTimeString(currentLang==='ru'?'ru-RU':currentLang==='lv'?'lv-LV':'en-GB',{hour:'2-digit',minute:'2-digit'});
  return productionDateTimeText(iso);
}
const PRODUCTION_INFO_KEYS={
  queue:['queue','infoQueueText'],
  active:['prodInProgress','infoActiveText'],
  plannedTime:['plannedTime','infoPlannedTimeText'],
  actualTime:['actualTime','infoActualTimeText'],
  overdue:['overdue','infoOverdueText'],
  load:['loadTitleFull','infoLoadText'],
  done:['prodDone','infoDoneText'],
  plan:['planMinTitle','infoPlanText'],
  fact:['factMinTitle','infoFactText'],
  diff:['difference','infoDiffText'],
  materials:['materialsTitle','infoMaterialsText'],
  sessions:['sessionsByShiftTitle','infoSessionsText']
};
function showProductionInfo(key){
  const keys=PRODUCTION_INFO_KEYS[key];
  if(!keys)return;
  openModal(escapeHtml(t(keys[0])),`<div class="stat-info-text">${escapeHtml(t(keys[1]))}</div>`,`<button class="btn primary" type="button" onclick="closeModal()">${escapeHtml(t('gotIt'))}</button>`);
}
function infoBtn(key){return `<button type="button" class="stat-info-btn" onclick="event.stopPropagation();showProductionInfo('${key}')" aria-label="${escapeHtml(t('explanation'))}" title="${escapeHtml(t('explanation'))}">i</button>`}
function currentlyActiveOperations(){
  const rows=[];
  allWorkshopNames().forEach(name=>{
    productionQueueForWorkshop(name).forEach(row=>{
      const op=productionOp(row.order,row.index);
      if(op&&(op.status==='running'||op.status==='paused'))rows.push({order:row.order,op,workshopName:name});
    });
  });
  rows.sort((a,b)=>{
    const rank=r=>r.op.status==='running'?0:1;
    const d=rank(a)-rank(b);
    return d||String(rowDueDate(a)||a.order.date||'').localeCompare(String(rowDueDate(b)||b.order.date||''));
  });
  return rows;
}
// v7.89: главный обзор "Цеха" переработан — старый экран называл любой заказ "в работе" по статусу
// ЗАКАЗА и показывал загрузку в процентах, доходящих до 1000-2500%, что никому ничего не говорило.
// Принцип нового обзора: заказ и рабочая сессия — разные вещи. Ничего не помечается "в работе", если
// у него нет реально запущенной сессии (op.status==='running'); "остановлено" не путается с "ждёт
// материал"; проценты загрузки заменены на прогноз в днях по фактическому графику смены. Экран
// конкретного цеха (workshopDetailHtml и всё вокруг) не тронут — использует ту же workshopAnalytics
// и те же рабочие сессии, что были и раньше.
function refreshActiveElapsedTimers(){
  const workshopsSection=document.getElementById('workshops');
  if(!workshopsSection||!workshopsSection.classList.contains('active'))return;
  // И обзор, и детальный экран цеха теперь целиком зависят от "живых" данных (активные сессии,
  // отработано сегодня, до конца смены) — проще перерисовать целиком (renderWorkshops() сама делает
  // ленивую проверку автостопа в начале), чем адресно обновлять отдельные числа.
  if(typeof renderWorkshops==='function')renderWorkshops();
}
if(typeof window!=='undefined')setInterval(()=>{if(typeof refreshActiveElapsedTimers==='function')refreshActiveElapsedTimers()},30000);

let workshopsOverviewPeriod='today'; // 'today' | '7days' | 'all'
function setWorkshopsOverviewPeriod(period){workshopsOverviewPeriod=period;renderWorkshops()}
function timeStrToMinutes(hhmm){const [h,m]=String(hhmm||'0:0').split(':').map(Number);return (Number(h)||0)*60+(Number(m)||0)}
// Нижняя граница периода (включительно) в формате YYYY-MM-DD; пустая строка — без ограничения ('all').
function workshopsPeriodSinceDate(period){
  if(period==='7days'){const d=new Date();d.setDate(d.getDate()-6);return d.toISOString().slice(0,10)}
  if(period==='all')return '';
  return today();
}
// Выпуск за период — сумма реально списанных количеств (те же consumptionLogs, что и раньше в
// todayCompletedUnitsCount), плюс число РАЗНЫХ операций (заказ+этап), по которым он был.
function periodOutputStats(period){
  const since=workshopsPeriodSinceDate(period);
  let qty=0;const ops=new Set();
  (data.orders||[]).forEach(o=>{
    (ensureWorkflowProduction(o).consumptionLogs||[]).forEach(l=>{
      if(l.undone)return;
      const d=String(l.at||'').slice(0,10);
      if(since&&d<since)return;
      qty+=Number(l.qty||0);
      ops.add(`${o.id}_${l.stepIndex}`);
    });
  });
  return {qty,opsCount:ops.size};
}
function workshopsPeriodToggleHtml(){
  const items=[['today',t('periodToday')],['7days',t('period7Days')],['all',t('periodAll')]];
  const dateStr=new Date().toLocaleDateString(currentLang==='ru'?'ru-RU':currentLang==='lv'?'lv-LV':'en-GB',{day:'numeric',month:'long'});
  const periodLabel=workshopsOverviewPeriod==='today'?String(t('periodTodayLabel')).replace('{date}',dateStr):workshopsOverviewPeriod==='7days'?t('period7DaysLabel'):t('periodAllLabel');
  return `<div class="workshops-period-row">
    <div class="workshops-period-toggle">${items.map(([key,label])=>`<button type="button" class="workshops-period-btn${workshopsOverviewPeriod===key?' active':''}" onclick="setWorkshopsOverviewPeriod('${key}')">${escapeHtml(label)}</button>`).join('')}</div>
    <span class="workshops-period-label">${escapeHtml(t('periodLabelPrefix'))} ${escapeHtml(periodLabel)}</span>
  </div>`;
}
// Реально запущенные сейчас сессии (across все цеха) — не "заказы в работе", а именно сессии.
function activeSessionsInfo(){
  const rows=currentlyActiveOperations().filter(r=>r.op.status==='running');
  if(rows.length)return {count:rows.length,note:''};
  const schedule=shiftScheduleFor('');
  const win=todayShiftWindow(schedule);
  let note;
  if(!schedule.autoEndAtShiftEnd)note=t('activeSessionsNoneGeneric');
  else if(!win)note=t('activeSessionsNonWorkDayNote');
  else if(Date.now()>win.endMs)note=String(t('activeSessionsShiftEndedNote')).replace('{time}',schedule.endTime);
  else note=t('activeSessionsNoneGeneric');
  return {count:0,note};
}
// Все строки очереди (по всем цехам), у которых операция сейчас "на паузе" — то есть была рабочая
// сессия, и она сейчас не идёт (закрыта вручную, по концу смены, или из-за нехватки материала).
// Именно эти строки показываются в правой колонке "Требуют продолжения" — не путать с "заказ вообще
// в статусе В работе, но по нему сегодня никто ничего не делал".
function workshopsPausedRows(){
  const rows=[];
  allWorkshopNames().forEach(name=>{
    productionQueueForWorkshop(name).forEach(row=>{
      const op=productionOp(row.order,row.index);
      if(op&&op.status==='paused')rows.push({...row,workshopName:name,op});
    });
  });
  return rows;
}
// Материал реально ограничивает эту строку (не просто "риск", а "нельзя сделать больше ни одного").
function workshopsRowIsMaterialBlocked(row){
  const limiting=workshopLimitingMaterial(row.order,row.op||productionOp(row.order,row.index));
  return limiting&&limiting.enough<=0?limiting:null;
}
function workshopsTopStatsHtml(){
  const period=workshopsOverviewPeriod;
  const output=periodOutputStats(period);
  const outputLabel=period==='today'?t('outputTodayLabel'):period==='7days'?t('output7DaysLabel'):t('outputAllLabel');
  const active=activeSessionsInfo();
  const pausedRows=workshopsPausedRows();
  const materialBlockedCount=pausedRows.filter(workshopsRowIsMaterialBlocked).length;
  const manualPauseCount=pausedRows.length-materialBlockedCount;
  let decisions=0;
  allWorkshopNames().forEach(name=>{
    const queue=productionQueueForWorkshop(name);
    const etaMap=workshopQueueEtaMap(queue);
    const current=queue.find(r=>productionOp(r.order,r.index)?.status==='running')||queue.find(r=>productionOp(r.order,r.index)?.status==='paused')||queue[0]||null;
    if((!queue.length)||(current&&workshopRowRisk(current,etaMap)))decisions++;
  });
  return `<div class="workshops-top-stats">
    <div class="workshops-top-stat"><small>${escapeHtml(outputLabel)}</small><b>${output.qty} ${escapeHtml(t('unitPieces'))}</b><span>${escapeHtml(String(t('byOperationsCountSuffix')).replace('{n}',output.opsCount))}</span></div>
    <div class="workshops-top-stat"><small>${escapeHtml(t('activeSessionsLabel'))}</small><b>${active.count}</b><span>${escapeHtml(active.note)}</span></div>
    <div class="workshops-top-stat"><small>${escapeHtml(t('onPauseLabel'))}</small><b>${pausedRows.length} ${escapeHtml(pausedRows.length===1?t('orderWordOne'):t('orderWordMany'))}</b><span>${manualPauseCount>0?escapeHtml(String(t('pendingContinueNote')).replace('{n}',manualPauseCount)):''}</span></div>
    <div class="workshops-top-stat"><small>${escapeHtml(t('needsDecisionLabel'))}</small><b>${decisions} ${escapeHtml(decisions===1?t('workshopWordOne'):t('workshopWordMany'))}</b><span>${escapeHtml(t('needsDecisionHint'))}</span></div>
  </div>`;
}
// Единственный самый срочный алерт — не список повторяющихся предупреждений по каждому цеху, а
// ОДНА проблема, которая реально блокирует работу прямо сейчас (материала не хватит даже на 1 ед.).
// Среди нескольких таких проблем выбирается заказ с ближайшим сроком сдачи.
function workshopsMostUrgentIssue(){
  let best=null;
  allWorkshopNames().forEach(name=>{
    productionQueueForWorkshop(name).forEach(row=>{
      const op=productionOp(row.order,row.index);
      if(!op||op.status==='done'||op.status==='cancelled')return;
      const limiting=workshopLimitingMaterial(row.order,op);
      if(!limiting||limiting.enough>0)return;
      if(!best||String(rowDueDate(row)||'9999')<String(rowDueDate(best.row)||'9999'))best={row,op,limiting,workshopName:name};
    });
  });
  return best;
}
function workshopsMainAlertHtml(){
  const issue=workshopsMostUrgentIssue();
  if(!issue)return '';
  const {row,op,limiting,workshopName}=issue,o=row.order,m=limiting.state.av.mat,matName=m?materialTitle(m):t('deletedMaterialWord');
  const title=String(t('workshopMainAlertTitle')).replace('{workshop}',workshopLabel(workshopName)).replace('{material}',matName).replace('{order}',o.number||'—');
  const body=String(t('workshopMainAlertBody')).replace('{enough}',limiting.enough).replace('{total}',limiting.total);
  const sessionNote=op.status==='paused'?` ${escapeHtml(t('workshopMainAlertSessionClosed'))}`:'';
  const action=m?`<button class="btn primary" type="button" onclick="openProductionMaterialPurchase('${o.id}','${limiting.item.materialId}')">${escapeHtml(t('openPurchaseBtn'))}</button>`:'';
  return `<div class="workshop-main-alert">
    <span class="workshop-main-alert-icon">!</span>
    <div class="workshop-main-alert-body"><b>${escapeHtml(title)}</b><p>${escapeHtml(body)}${sessionNote}</p></div>
    ${action}
  </div>`;
}
// Одна строка на цех: статус учитывает ТОЛЬКО реальное состояние сессии (running/paused), а не
// статус заказа — заказ может числиться "в производстве" сколько угодно дней подряд.
function workshopMasterRowHtml(name){
  const queue=productionQueueForWorkshop(name),etaMap=workshopQueueEtaMap(queue);
  const runningRow=queue.find(row=>productionOp(row.order,row.index)?.status==='running');
  const pausedRow=queue.find(row=>productionOp(row.order,row.index)?.status==='paused');
  const current=runningRow||pausedRow||queue[0]||null;
  const risk=current?workshopRowRisk(current,etaMap):null;
  const materialBlocked=!!(risk&&risk.text===t('workshopRiskNoMaterial'));
  let statusText,pillCls;
  if(runningRow){statusText=t('prodStatusRunning');pillCls='running';}
  else if(pausedRow){statusText=t('workshopShiftClosedTag');pillCls='paused';}
  else if(!queue.length){statusText=t('workshopFreeTag');pillCls='free';}
  else if(materialBlocked){statusText=t('workshopRiskNoMaterial');pillCls='danger';}
  else{statusText=t('prodQueueWaiting');pillCls='';}
  const lineText=current?`${escapeHtml(current.order.number||'—')} · ${escapeHtml(current.order.client||'—')}`:escapeHtml(t('workshopFreeLine'));
  let subText='';
  if(!queue.length)subText=t('workshopCanPlanText');
  else if(materialBlocked)subText=t('workshopContinueAfterPurchase');
  else if(risk)subText=risk.text;
  else if(current&&!runningRow&&!pausedRow){
    const curOp=productionCurrentOp(current.order);
    if(curOp&&Number(curOp.stepIndex)<Number(current.index))subText=`${t('nextOrderPrefix')} ${current.order.number} ${t('afterWorkshopWord')} ${workshopLabel(curOp.stepName)}`;
  }
  return `<button type="button" class="workshop-master-row" onclick="openWorkshopDetail('${jsStrArg(name)}')">
    <span class="workshop-master-row-icon">${workshopIcon(name)}</span>
    <span class="workshop-master-row-main"><b>${escapeHtml(workshopLabel(name))}</b><small>${lineText}</small></span>
    <span class="production-status-pill ${pillCls}">${escapeHtml(statusText)}</span>
    <span class="workshop-master-row-queue">${queue.length} ${escapeHtml(t('inQueueShort'))}</span>
    <span class="workshop-master-row-note ${pillCls==='danger'?'danger-text':''}">${escapeHtml(subText)}</span>
    <span class="workshop-list-row-arrow">›</span>
  </button>`;
}
function workshopsMasterListHtml(names){
  if(!names.length)return `<div class="workshop-empty">${escapeHtml(t('noWorkshopsYet'))}</div>`;
  return `<div class="panel workshops-master-panel">
    <div class="workshops-master-head"><h3>${escapeHtml(t('workshopStateTitle'))}</h3><small>${escapeHtml(t('workshopStateHint'))}</small></div>
    <div class="workshops-master-list">${names.map(workshopMasterRowHtml).join('')}</div>
  </div>`;
}
// Правая колонка: карточка на каждую строку "на паузе" — явно объясняет, заказ это без сессии сегодня
// или сессия, которую реально приостановили и можно продолжить.
function workshopContinuationCardHtml(row){
  const o=row.order,op=row.op,workshopName=row.workshopName;
  const limiting=workshopsRowIsMaterialBlocked(row);
  const workedToday=opWorkedMinutesToday(o,op.stepIndex);
  let bodyText,tagHtml='',actionHtml;
  if(limiting){
    bodyText=t('continuationOrderNoSessionText');
    tagHtml=`<span class="continuation-tag danger">${escapeHtml(t('workshopRiskNoMaterial'))}</span>`;
    const m=limiting.state.av.mat;
    actionHtml=m?`<button class="btn small primary" type="button" onclick="openProductionMaterialPurchase('${o.id}','${limiting.item.materialId}')">${escapeHtml(t('openPurchaseBtn'))}</button>`:`<button class="btn small" type="button" onclick="openWorkshopDetail('${jsStrArg(workshopName)}')">${escapeHtml(t('openBtn'))}</button>`;
  }else if(workedToday>0){
    // "0 минут сегодня" не показываем как будто это ошибка/активность — только реально отработанное.
    bodyText=String(t('continuationManualPauseText')).replace('{time}',op.pausedAt?productionStartedAtText(op.pausedAt):'—').replace('{minutes}',workedToday);
    actionHtml=`<button class="btn small" type="button" onclick="openWorkshopDetail('${jsStrArg(workshopName)}')">${escapeHtml(t('openBtn'))}</button>`;
  }else{
    bodyText=t('continuationOrderNoSessionText');
    actionHtml=`<button class="btn small" type="button" onclick="openWorkshopDetail('${jsStrArg(workshopName)}')">${escapeHtml(t('openBtn'))}</button>`;
  }
  return `<div class="continuation-card">
    <div class="continuation-card-head"><b>${escapeHtml(workshopLabel(workshopName))} · ${escapeHtml(o.number||'—')}</b>${tagHtml}</div>
    <p class="continuation-card-text">${escapeHtml(bodyText)}</p>
    <div class="continuation-card-actions">${actionHtml}</div>
  </div>`;
}
function workshopsContinuationPanelHtml(){
  const rows=workshopsPausedRows();
  const body=rows.length?rows.map(workshopContinuationCardHtml).join(''):`<div class="workshop-empty">${escapeHtml(t('noContinuationNeeded'))}</div>`;
  return `<div class="panel continuation-panel">
    <div class="continuation-panel-head"><h3>${escapeHtml(t('continuationTitle'))}</h3><small>${escapeHtml(t('continuationSubtitle'))}</small></div>
    <div class="continuation-list">${body}</div>
  </div>`;
}
// Компактный список из максимум 5 конкретных действий: материалы к заказу, риск срока, свободный цех.
function workshopsUpcomingDecisionsHtml(){
  const items=[];
  const seenMaterials=new Set();
  allWorkshopNames().forEach(name=>{
    productionQueueForWorkshop(name).forEach(row=>{
      const op=productionOp(row.order,row.index);
      if(!op||op.status==='done'||op.status==='cancelled')return;
      const limiting=workshopLimitingMaterial(row.order,op);
      if(!limiting)return;
      if(seenMaterials.has(limiting.item.materialId))return;
      seenMaterials.add(limiting.item.materialId);
      const m=limiting.state.av.mat;
      items.push({cls:'danger',text:`${t('orderMaterialPrefix')} ${m?materialTitle(m):t('deletedMaterialWord')}`,sub:`${t('shortageForLabel')} ${row.order.number} · ${workshopLabel(name)}`,actionLabel:t('toOrderBtn'),action:m?`openProductionMaterialPurchase('${row.order.id}','${limiting.item.materialId}')`:`openWorkshopDetail('${jsStrArg(name)}')`});
    });
  });
  allWorkshopNames().forEach(name=>{
    const queue=productionQueueForWorkshop(name),etaMap=workshopQueueEtaMap(queue);
    queue.forEach(row=>{
      const risk=workshopRowRisk(row,etaMap);
      if(risk&&risk.text===t('workshopRiskDeadline'))items.push({cls:'warn',text:`${t('checkOrderPrefix')} ${row.order.number}`,sub:`${row.order.client||''} · ${risk.text}`,actionLabel:t('openBtn'),action:`goToOrderFromMaterial(event,'${row.order.id}')`});
    });
  });
  allWorkshopNames().forEach(name=>{
    if(!productionQueueForWorkshop(name).length)items.push({cls:'',text:`${t('assignWorkPrefix')} ${workshopLabel(name)}`,sub:t('workshopFreeLine'),actionLabel:t('planBtn'),action:`switchSection('orders')`});
  });
  const top=items.slice(0,5);
  const body=top.length?top.map(it=>`<div class="upcoming-decision-row"><span class="upcoming-decision-dot ${it.cls}"></span><div class="upcoming-decision-text"><b>${escapeHtml(it.text)}</b><small>${escapeHtml(it.sub)}</small></div><button class="btn small" type="button" onclick="${it.action}">${escapeHtml(it.actionLabel)}</button></div>`).join(''):`<div class="workshop-empty">${escapeHtml(t('noDecisionsNeeded'))}</div>`;
  return `<div class="panel upcoming-decisions-panel">
    <div class="continuation-panel-head"><h3>${escapeHtml(t('upcomingDecisionsTitle'))}</h3><small>${escapeHtml(t('upcomingDecisionsHint'))}</small></div>
    <div class="upcoming-decisions-list">${body}</div>
  </div>`;
}
// Прогноз очереди на 7 дней по фактическому графику смены (а не проценты загрузки 1000%+, которые
// никому ничего не говорили). Фонд считается из реальных настроек: (конец-начало)×число рабочих дней.
function workshopsBacklogForecastHtml(names){
  if(!names.length)return '';
  const rows=names.map(name=>{
    const stat=workshopAnalytics(name); // те же план/очередь, что и раньше — без изменений
    const schedule=shiftScheduleFor(name);
    const dailyMinutes=Math.max(0,timeStrToMinutes(schedule.endTime)-timeStrToMinutes(schedule.startTime));
    const weeklyCapacity=dailyMinutes*(schedule.workDays||DEFAULT_SHIFT_SCHEDULE.workDays).length;
    let text,cls;
    if(!stat.queue.length){text=t('workshopFreeTag');cls='';}
    else if(!weeklyCapacity){text=`${stat.queue.length} ${t('inQueueShort')} · ${orderTimeText(stat.plan)} · ${t('noForecastDataText')}`;cls='';}
    else{
      const overrunMinutes=Math.max(0,stat.plan-weeklyCapacity);
      if(overrunMinutes>0){
        const overDays=overrunMinutes/dailyMinutes;
        const daysText=overDays.toFixed(1).replace('.',currentLang==='en'?'.':',');
        text=`+${daysText} ${t('daysOverCapacitySuffix')}`;cls='danger';
      }else{
        const ratio=stat.plan/weeklyCapacity;
        if(ratio>=0.85){text=t('nearlyFullText');cls='warn';}
        else{text=t('freeCapacityText');cls='';}
      }
    }
    return {name,text,cls};
  });
  return `<div class="panel workshops-backlog-panel">
    <div class="workshops-backlog-head"><h3>${escapeHtml(t('backlog7DaysTitle'))}</h3><small>${escapeHtml(t('backlog7DaysHint'))}</small></div>
    <div class="workshops-backlog-list">${rows.map(r=>`<button type="button" class="workshops-backlog-row ${r.cls}" onclick="openWorkshopDetail('${jsStrArg(r.name)}')"><span class="workshops-backlog-icon">${workshopIcon(r.name)}</span><span class="workshops-backlog-name">${escapeHtml(workshopLabel(r.name))}</span><span class="workshops-backlog-note">${escapeHtml(r.text)}</span></button>`).join('')}</div>
  </div>`;
}
function workshopsOverviewHtml(){
  const names=allWorkshopNames();
  if(!names.length)return `<div class="workshop-empty">${escapeHtml(t('noWorkshopsYet'))}</div>`;
  return `${workshopsPeriodToggleHtml()}${workshopsTopStatsHtml()}${workshopsMainAlertHtml()}
    <div class="workshops-overview-layout">
      <div class="workshops-overview-main">${workshopsMasterListHtml(names)}</div>
      <div class="workshops-overview-side">${workshopsContinuationPanelHtml()}${workshopsUpcomingDecisionsHtml()}</div>
    </div>
    ${workshopsBacklogForecastHtml(names)}`;
}
function openWorkshopDetail(name){selectedWorkshopName=name;renderWorkshops()}
function closeWorkshopDetail(){selectedWorkshopName='';renderWorkshops()}
const expandedWorkshopOps=new Set();
function toggleWorkshopQueueItem(orderId,stepIndex){
  const key=`${orderId}_${stepIndex}`;
  if(expandedWorkshopOps.has(key))expandedWorkshopOps.delete(key);else expandedWorkshopOps.add(key);
  renderWorkshops();
}
function workshopQueueItemHtml(row,etaMap){
  const o=row.order,op=productionOp(o,row.index);
  if(!op)return '';
  const key=`${o.id}_${op.stepIndex}`,expanded=expandedWorkshopOps.has(key);
  const pct=productionOpPercent(o,op),status=productionStatusClass(op.status);
  const coverage=productionMaterialCoverage(o,operationMaterials(o,op),productionCompletedQty(o,op));
  const dClass=orderDeadlineClass(o,op);
  const dueNote=dClass==='overdue'?`<span class="workshop-row-danger">· ${escapeHtml(t('overdue')).toLowerCase()}</span>`:dClass==='today'?`<span class="workshop-row-today">· ${escapeHtml(t('dueTodayNote'))}</span>`:'';
  const matNote=!coverage.ok?`<span class="workshop-row-danger">· ⚠ ${escapeHtml(t('missingMaterialsCount')).toLowerCase()}</span>`:'';
  const eta=etaMap?etaMap.get(`${o.id}_${row.index}`):null;
  const rowDue=orderDueDate(o,op),riskNote=(dClass!=='overdue'&&eta&&rowDue&&eta>rowDue)?`<span class="workshop-row-danger">· ⚠ ${escapeHtml(t('workshopRiskShort'))} (${escapeHtml(t('etaApprox'))} ${escapeHtml(eta)})</span>`:'';
  // v8.02: срок «через N дн.» и время по норме технолога на остаток — то же, что видит рабочий на своём экране.
  const dueInfo=simpleDueInfo(o,op),normInfo=simpleNormInfo(o,op);
  const teamInfo=opTeamInfo(o,op),teamNote=teamInfo.active.length?`<span>· ● ${escapeHtml(teamInfo.active.map(u=>u.name).join(', '))}</span>`:'';
  const countNote=(dueInfo&&!dClass)?`<span>· ${escapeHtml(dueInfo.text)}</span>`:'';
  const normNote=(normInfo.perUnit>0&&normInfo.remaining>0)?`<span>· ${escapeHtml(t('simpleNormShort').replace('{time}',orderTimeText(normInfo.remainingMin)))}</span>`:'';
  return `<div class="workshop-queue-item">
    <button type="button" class="workshop-queue-row ${status}" onclick="toggleWorkshopQueueItem('${o.id}',${op.stepIndex})">
      <span class="workshop-row-dot ${status}"></span>
      <span class="workshop-row-info">
        <b>${escapeHtml(o.number||'—')}</b>${o.client?`<em> · ${escapeHtml(o.client)}</em>`:''}
        <small>${escapeHtml(formatDeadline(o,op))} ${countNote} ${dueNote} ${normNote} ${teamNote} ${riskNote} ${matNote}</small>
      </span>
      <span class="workshop-row-progress"><i><b style="width:${pct}%"></b></i></span>
      <span class="production-status-pill ${status}">${escapeHtml(productionStatusLabel(op.status))}</span>
      <span class="workshop-row-chevron">${expanded?'⌄':'›'}</span>
    </button>
    ${expanded?`<div class="workshop-queue-expanded">
      <button type="button" class="workshop-queue-order-link" onclick="goToOrderFromMaterial(event,'${o.id}')">${escapeHtml(t('openOrderCard'))} ↗</button>
      ${productionOperationCardHtml(o,op)}
    </div>`:''}
  </div>`;
}
// v7.77: раздел "Цеха" переработан в рабочее место мастера (по ТЗ пользователя) — раньше детальный
// экран цеха показывал сразу всё: большую сводку с "Загрузка 2296%" (непонятно сотруднику), плановое/
// фактическое время, полную очередь с развёрнутыми карточками операций (списания, комментарии,
// история смен) и повторяющиеся предупреждения по материалам — на то, чтобы понять "что делать
// сейчас", уходило слишком много времени. Новый экран отвечает на 4 вопроса сразу: что делаю сейчас,
// сколько сделано/осталось, что мешает, что дальше. Все данные — те же существующие функции
// (workshopAnalytics/productionOp/productionMaterialCoverage/finalizeProductionQuantity и т.д.),
// новых источников данных не добавлено. Старый подробный вид (полная карточка операции: план/факт,
// история смен, комментарии, ручное списание) никуда не делся — он доступен по ссылке "Открыть
// полную очередь" (см. openWorkshopFullQueue()) и остаётся рабочим как раньше.

// v7.82: раньше "в работе" считалась ровно ОДНА строка очереди — мастер не мог явно приостановить
// текущий заказ и начать другой без захода в полную карточку заказа, и тем более не мог держать
// в работе два заказа одновременно (например, пока один ждёт материал). Данные это уже поддерживали
// (у каждой операции своей независимый статус running/paused — см. startProductionOperation/
// pauseProductionOperation), не хватало только интерфейса. Теперь "в работе" — это ВСЕ строки со
// статусом running или paused (сколько бы их ни было), и на экране цеха под каждую рисуется своя
// карточка с кнопкой паузы/продолжения и своей "Записать выпуск". Если ничего ещё не запущено —
// по-прежнему показывается первая по очереди, чтобы было с чего начать.
function workshopActiveRows(stat){
  const active=stat.queue.filter(row=>{const s=productionOp(row.order,row.index)?.status;return s==='running'||s==='paused'});
  if(active.length)return active;
  return stat.queue[0]?[stat.queue[0]]:[];
}
// Сохранено для мест, которым нужна ровно одна "главная" строка (сводка смены и т.п.).
function workshopCurrentRow(stat){return workshopActiveRows(stat)[0]||null}
// Все отметки выпуска ИМЕННО этого цеха за сегодня (across все заказы) — источник для "Сделано за
// смену" и "Темп". Использует уже существующий productionMeta(o).logs, ничего нового не считает.
function workshopLogsToday(name){
  const todayStr=today(),target=String(name||'').trim(),rows=[];
  (data.orders||[]).forEach(o=>{
    (productionMeta(o).logs||[]).forEach(l=>{
      if(String(l.stepName||'').trim()===target&&String(l.at||'').slice(0,10)===todayStr)rows.push(l);
    });
  });
  rows.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
  return rows;
}
function workshopDoneToday(name){return workshopLogsToday(name).reduce((s,l)=>s+Number(l.qty||0),0)}
// Темп по факту потраченного времени за сегодня (а не по разнице часов между первой и последней
// отметкой — так пауза/обед не занижает результат). Возвращает null, если данных ещё мало (нечего
// делить) — тогда карточка честно показывает "—" вместо выдуманного числа.
function workshopRateToday(name){
  const logs=workshopLogsToday(name);
  const qty=logs.reduce((s,l)=>s+Number(l.qty||0),0),minutes=logs.reduce((s,l)=>s+Number(l.minutes||0),0);
  if(qty<=0||minutes<1)return null;
  return Math.max(1,Math.round(qty/(minutes/60)));
}
// Что мешает работе прямо сейчас/по этой строке очереди — один короткий текстовый статус, а не
// набор повторяющихся предупреждений. Порядок важен: просрочка важнее риска, риск важнее нехватки.
function workshopRowRisk(row,etaMap){
  const o=row.order,op=productionOp(o,row.index);
  // v7.77: по ТЗ пользователя риски показываются РОВНО тремя текстами ("риск срока" / "нет материала"
  // / "ожидание закупки") — уже просроченный заказ и заказ, который рискует не успеть к сроку,
  // технически разные условия, но текст один и тот же ("риск срока"), различается только цвет
  // (просрочка — красный/danger, риск — оранжевый/warn).
  if(orderDeadlineClass(o,op)==='overdue')return {cls:'danger',text:t('workshopRiskDeadline')};
  const eta=etaMap?etaMap.get(`${o.id}_${row.index}`):null;
  const rowDue=orderDueDate(o,op);
  if(eta&&rowDue&&eta>rowDue)return {cls:'warn',text:t('workshopRiskDeadline')};
  if(op){
    const coverage=productionMaterialCoverage(o,operationMaterials(o,op),productionCompletedQty(o,op));
    if(!coverage.ok){
      const waiting=coverage.missing.some(({item})=>orderItemPurchaseStatus(item)==='ordered');
      return waiting?{cls:'warn',text:t('workshopRiskWaitingPurchase')}:{cls:'danger',text:t('workshopRiskNoMaterial')};
    }
  }
  return null;
}
// Какой ИМЕННО материал ограничивает выполнение текущей операции и на сколько комплектов ещё хватит —
// не список повторяющихся предупреждений, а один понятный ответ. Переиспользует orderMaterialEnoughQty
// (уже существует, используется в productionMaterialCoverage) для каждой позиции по отдельности, чтобы
// найти именно ту, что ограничивает раньше других.
function workshopLimitingMaterial(o,op){
  if(!o||!op)return null;
  const assigned=operationMaterials(o,op).filter(item=>Number(item.qty||0)>0);
  if(!assigned.length)return null;
  const total=Math.max(0,orderProductQty(o)-productionCompletedQty(o,op));
  if(total<=0)return null;
  let limiting=null,minEnough=Infinity;
  assigned.forEach(item=>{
    const state=orderMaterialLineState(item,o.id),enough=orderMaterialEnoughQty(o,item,state);
    if(enough<minEnough){minEnough=enough;limiting={item,state};}
  });
  if(!limiting||minEnough>=total)return null;
  return {...limiting,enough:minEnough,total};
}
function workshopMaterialAlertHtml(o,op){
  const limiting=workshopLimitingMaterial(o,op);
  if(!limiting)return `<div class="workshop-material-alert ok"><span class="workshop-material-alert-icon">✓</span><span>${escapeHtml(t('workshopMaterialsOkText'))}</span></div>`;
  const {item,state,enough,total}=limiting,m=state.av.mat,name=m?materialTitle(m):t('deletedMaterialWord');
  const text=t('workshopMaterialLimitText').replace('{material}',name).replace('{enough}',enough).replace('{total}',total);
  const action=m?`<button class="btn primary" type="button" onclick="openProductionMaterialPurchase('${o.id}','${item.materialId}')">${escapeHtml(t('openPurchaseBtn'))}</button>`:'';
  return `<div class="workshop-material-alert warn"><span class="workshop-material-alert-icon">⚠</span><span>${escapeHtml(text)}</span>${action}</div>`;
}
function workshopShiftSummaryHtml(name,stat,activeRows){
  const o=activeRows[0]?activeRows[0].order:null,extra=Math.max(0,activeRows.length-1);
  const doneToday=workshopDoneToday(name),lastMark=workshopLogsToday(name)[0]||null,rate=workshopRateToday(name);
  const problemCount=stat.queue.filter(row=>!!workshopRowRisk(row,stat.etaMap)).length;
  const currentBlock=o?`<b>${escapeHtml(o.number||'—')}${extra?` <span class="workshop-current-extra">+${extra}</span>`:''}</b><small>${escapeHtml(o.client||'—')} · ${escapeHtml(t('orderDueDate'))} ${escapeHtml(formatDeadline(o))}</small>`:`<b>—</b><small>${escapeHtml(t('workshopNoCurrentOrder'))}</small>`;
  return `<div class="workshop-shift-summary">
    <div class="workshop-shift-card"><small>${escapeHtml(t('workshopCurrentOrderLabel'))}</small>${currentBlock}</div>
    <div class="workshop-shift-card"><small>${escapeHtml(t('workshopDoneShiftLabel'))}</small><b>${doneToday} ${escapeHtml(t('unitPieces'))}</b><small class="workshop-shift-sub">${lastMark?`${escapeHtml(t('workshopLastMarkLabel'))} ${lastMark.qty} ${escapeHtml(t('unitPieces'))}`:'—'}</small></div>
    <div class="workshop-shift-card"><small>${escapeHtml(t('workshopRateLabel'))}</small><b>${rate?`${rate} ${escapeHtml(t('unitsPerHourShort'))}`:'—'}</b><small class="workshop-shift-sub">${escapeHtml(t('workshopRateHint'))}</small></div>
    <div class="workshop-shift-card"><small>${escapeHtml(t('queue'))}</small><b>${stat.queue.length} ${escapeHtml(stat.queue.length===1?t('orderWordOne'):t('orderWordMany'))}</b><small class="workshop-shift-sub ${problemCount>0?'danger-text':''}">${problemCount>0?`${problemCount} ${escapeHtml(t('workshopNeedAttention'))}`:escapeHtml(t('workshopAllOk'))}</small></div>
  </div>`;
}
// v7.84: компактный блок учёта рабочего времени по смене — на активной карточке заказа. Показывает
// часы смены, СКОЛЬКО РЕАЛЬНО ОТРАБОТАНО СЕГОДНЯ по этой операции (сумма рабочих сессий, а не
// "сейчас минус старт заказа") и сколько осталось до конца смены, плюс явные "Пауза" и "Завершить
// смену" (обе кнопки видны и в шапке карточки — toggleProductionOperation — здесь они продублированы
// рядом со временем, как в макете пользователя, для наглядности).
function workshopShiftInfoHtml(o,op){
  const schedule=shiftScheduleFor(op.stepName);
  const win=todayShiftWindow(schedule);
  const workedToday=opWorkedMinutesToday(o,op.stepIndex);
  const session=myWorkSession(o,op.stepIndex)||currentWorkSession(o,op.stepIndex);
  const overtime=!!(session&&session.overtime);
  // v7.85: пользователь попросил показывать не только "сколько отработано", но и конкретное время —
  // во сколько сотрудник начал и во сколько закончил (или ещё работает). workSessions хранится
  // новыми-в-начале (unshift), поэтому самая ранняя сегодняшняя сессия — последний элемент массива,
  // а самая свежая (в т.ч. текущая открытая, если есть) — первый.
  const sessionsToday=opWorkSessionsToday(o,op.stepIndex);
  const firstSession=sessionsToday[sessionsToday.length-1]||null;
  const lastSession=sessionsToday[0]||null;
  const startedAtText=firstSession?productionStartedAtText(firstSession.startedAt):'—';
  const endedAtText=lastSession?(lastSession.endedAt?productionStartedAtText(lastSession.endedAt):t('shiftStillGoingText')):'—';
  let statusLabel,statusValue;
  if(overtime){statusLabel=t('shiftStatusLabel');statusValue=t('shiftOvertimeLabel');}
  else if(win&&win.endMs>Date.now()){statusLabel=t('shiftUntilEndLabel');statusValue=orderTimeText(Math.max(0,Math.round((win.endMs-Date.now())/60000)));}
  else if(win){statusLabel=t('shiftStatusLabel');statusValue=t('shiftOverText');}
  else{statusLabel=t('shiftStatusLabel');statusValue=t('shiftNotWorkDayText');}
  const canAct=!!myWorkSession(o,op.stepIndex);
  return `<div class="workshop-shift-info">
    <div class="workshop-shift-info-row"><span>${escapeHtml(t('shiftHoursLabel'))}</span><b>${escapeHtml(schedule.startTime)}–${escapeHtml(schedule.endTime)}</b></div>
    <div class="workshop-shift-info-row"><span>${escapeHtml(t('shiftWorkedTodayLabel'))}</span><b>${escapeHtml(orderTimeText(workedToday))}</b></div>
    <div class="workshop-shift-info-row"><span>${escapeHtml(t('shiftStartedAtLabel'))}</span><b>${escapeHtml(startedAtText)}</b></div>
    <div class="workshop-shift-info-row"><span>${escapeHtml(t('shiftEndedAtLabel'))}</span><b>${escapeHtml(endedAtText)}</b></div>
    <div class="workshop-shift-info-row ${overtime?'overtime':''}"><span>${escapeHtml(statusLabel)}</span><b>${escapeHtml(statusValue)}</b></div>
    <div class="workshop-shift-actions">
      <button class="btn small" type="button" ${canAct?'':'disabled'} onclick="toggleProductionOperation('${o.id}',${op.stepIndex})">⏸ ${escapeHtml(t('prodPause'))}</button>
      <button class="btn small" type="button" ${canAct?'':'disabled'} onclick="endShiftManually('${o.id}',${op.stepIndex})">${escapeHtml(t('endShiftBtn'))}</button>
    </div>
    ${schedule.autoEndAtShiftEnd?`<div class="workshop-shift-auto-note">${escapeHtml(String(t('shiftAutoEndNote')).replace('{time}',schedule.endTime))}</div>`:''}
  </div>`;
}
// «Завершить смену» — сотрудник сам говорит "на сегодня всё" ДО конца рабочего дня по графику;
// по смыслу это то же самое, что и автостоп в конце смены (та же причина end_of_shift), просто
// инициировано человеком, а не обнаружено при следующем заходе на экран.
async function endShiftManually(orderId,index){
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;
  const op=productionOp(o,index);if(!op||op.status!=='running'||!myWorkSession(o,index))return;
  endWorkSession(o,index,'end_of_shift');
  syncOpRunningState(o,op,productionNow());
  await persistProductionWorkflow(o,`${tRu('historyProductionPaused')}: ${op.stepName} — ${t('endShiftBtn')}`,'production_operation_paused',{step:op.stepName});
}
// v7.92: раньше отметка показывала только количество/время/кто — по просьбе пользователя теперь
// видно ещё и КОГДА закончил (начало → конец смены записи, не только момент отметки), и можно
// исправить, если сотрудник ошибся — с сохранением следа правки. Вместо productionMeta(o).logs
// (которые вперемешку содержат и сами записи, и отдельные строки-коррекции) переиспользует
// op.sessions/productionSessionRowHtml — тот же источник и тот же компонент строки, что уже
// показывает это (с кнопкой "Редактировать" и историей правок) в полной карточке операции заказа
// (см. productionSessionHistoryHtml) — просто отфильтрованный по сегодняшнему дню, без дублирования
// логики редактирования/списания.
// v8.00: "Отметки" — теперь с переключателем «Сегодня / За всё время»: за всё время — список по дням
// (день + итог за день), с той же кнопкой «Редактировать» у каждой строки, в т.ч. за прошлые дни.
// Один общий компонент: и мастер в карточке цеха, и рабочий на экране задачи. Правка любой смены —
// та же openFixQuantityModal(), она работает по id списания, а не «только последнюю».
let workshopMarksScope='today'; // 'today' | 'all'
function setWorkshopMarksScope(scope){workshopMarksScope=scope==='all'?'all':'today';renderWorkshops()}
function uiDateLocale(){return {ru:'ru-RU',en:'en-GB',lv:'lv-LV'}[currentLang]||'ru-RU'}
function marksDayLabel(dayKey){
  if(dayKey===today())return t('marksScopeToday');
  const y=new Date();y.setDate(y.getDate()-1);
  if(dayKey===y.toISOString().slice(0,10))return t('marksYesterday');
  const d=new Date(dayKey+'T12:00:00Z');
  if(isNaN(d))return dayKey||'—';
  return d.toLocaleDateString(uiDateLocale(),{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
}
function workshopMarksHtml(o,op){
  if(typeof hasSubOps==='function'&&hasSubOps(o,op.stepIndex))return subMarksListHtml(o,op)+workshopKitMarksHtml(o,op);
  return workshopClassicMarksHtml(o,op);
}
function workshopKitMarksHtml(o,op){
  const kits=(Array.isArray(op.sessions)?op.sessions:[]).filter(s=>s&&!s.undone&&Number(s.qty)>0);
  if(!kits.length)return '';
  return `<details class="subops-kits"><summary>${escapeHtml(t('subOpKitsHistory'))}</summary>${workshopClassicMarksHtml(o,op)}</details>`;
}
function workshopClassicMarksHtml(o,op){
  const scope=workshopMarksScope==='all'?'all':'today',todayStr=today();
  const dayOf=s=>String(s.startedAt||'').slice(0,10);
  const allSessions=(Array.isArray(op.sessions)?op.sessions:[]).slice().sort((a,b)=>String(b.startedAt||'').localeCompare(String(a.startedAt||'')));
  const list=scope==='all'?allSessions:allSessions.filter(s=>dayOf(s)===todayStr);
  const sum=arr=>arr.filter(s=>!s.undone).reduce((n,s)=>n+Number(s.qty||0),0);
  const logs=productionMeta(o).consumptionLogs||[];
  const tabs=`<div class="marks-scope" role="tablist"><button type="button" role="tab" aria-selected="${scope==='today'}" class="${scope==='today'?'active':''}" onclick="setWorkshopMarksScope('today')">${escapeHtml(t('marksScopeToday'))}</button><button type="button" role="tab" aria-selected="${scope==='all'}" class="${scope==='all'?'active':''}" onclick="setWorkshopMarksScope('all')">${escapeHtml(t('marksScopeAll'))}</button></div>`;
  const head=`<div class="workshop-marks-today-head"><span>${escapeHtml(t('workshopMarksTitle'))}</span><span class="marks-total">${escapeHtml(t('marksTotalLabel'))}: ${sum(list)} ${escapeHtml(t('unitPieces'))}</span></div>${tabs}`;
  if(!list.length)return `<div class="workshop-marks-today">${head}<div class="workshop-marks-empty">${escapeHtml(t('workshopNoMarksYet'))}</div></div>`;
  let body;
  if(scope==='today'){
    body=`<div class="production-session-list workshop-marks-today-list">${list.map(s=>productionSessionRowHtml(o,op,s,logs)).join('')}</div>`;
  }else{
    const groups=[];
    list.forEach(s=>{const k=dayOf(s);const g=groups[groups.length-1];if(g&&g.day===k)g.rows.push(s);else groups.push({day:k,rows:[s]})});
    body=groups.map(g=>`<div class="marks-day-group"><div class="marks-day-head"><b>${escapeHtml(marksDayLabel(g.day))}</b><span>${sum(g.rows)} ${escapeHtml(t('unitPieces'))}</span></div><div class="production-session-list workshop-marks-today-list">${g.rows.map(s=>productionSessionRowHtml(o,op,s,logs)).join('')}</div></div>`).join('');
  }
  return `<div class="workshop-marks-today">${head}${body}</div>`;
}
function workshopCurrentCardHtml(row){
  if(!row)return `<div class="workshop-current-card empty"><div class="workshop-empty">${escapeHtml(t('prodQueueDone'))}</div></div>`;
  const o=row.order,op=productionOp(o,row.index);
  if(!op)return '';
  const completed=productionCompletedQty(o,op),total=orderProductQty(o),pct=productionOpPercent(o,op),remaining=Math.max(0,total-completed);
  const status=productionStatusClass(op.status);
  const allSteps=orderSteps(o),activeSteps=allSteps.filter(s=>Number(s.minutes||0)>0);
  const curIdx=activeSteps.findIndex(s=>s===allSteps[op.stepIndex]);
  const nextStep=curIdx>=0?activeSteps[curIdx+1]:null;
  const posText=`${t('operationWord')} ${curIdx+1} ${t('of')} ${activeSteps.length}${nextStep?` · ${t('nextStageLabel')}: ${escapeHtml(workshopLabel(nextStep.name))}`:''}`;
  const canRecord=op.status!=='done'&&op.status!=='cancelled'&&remaining>0;
  const chips=[1,5,10,20].map(n=>`<button class="btn workshop-qty-chip" type="button" ${!canRecord||n>remaining?'disabled':''} onclick="recordWorkshopQuickQty('${o.id}',${op.stepIndex},${n})">+${n}</button>`).join('');
  // v7.82: явная пауза/продолжение прямо на карточке — раньше единственным действием было "Записать
  // выпуск", а чтобы поставить заказ на паузу (не записывая выпуск) и переключиться на другой, нужно
  // было заходить в полную карточку заказа. toggleProductionOperation уже существует (используется в
  // рабочем режиме) — сам решает start/pause по текущему статусу.
  const canToggle=op.status==='running'||op.status==='paused'||op.status==='not_started';
  const iWork=!!myWorkSession(o,op.stepIndex),othersWork=openWorkSessions(o,op.stepIndex).length>0&&!iWork;
  const toggleLabel=iWork?t('prodPause'):othersWork?t('simpleJoinBtn'):(op.status==='paused')?t('prodContinue'):t('prodStart'); // v8.17: если уже работают другие — «Присоединиться»
  const toggleIcon=iWork?'⏸':'▶';
  const toggleBtn=canToggle?`<button class="btn workshop-toggle-btn" type="button" onclick="toggleProductionOperation('${o.id}',${op.stepIndex})">${toggleIcon} ${escapeHtml(toggleLabel)}</button>`:'';
  return `<div class="workshop-current-card">
    <div class="workshop-current-head">
      <div><small>${escapeHtml(t('workshopNowWorkingLabel'))}</small><h3>${escapeHtml(o.number||'—')}</h3><p>${escapeHtml(o.client||'—')} · ${total} ${escapeHtml(t('unitPieces'))} · ${escapeHtml(t('orderDueDate'))}: ${escapeHtml(formatDeadline(o))}</p></div>
      <div class="workshop-current-head-actions"><span class="production-status-pill ${status}">${escapeHtml(productionStatusLabel(op.status))}</span>${toggleBtn}</div>
    </div>
    <div class="workshop-current-op"><b>${workshopIcon(op.stepName)} ${escapeHtml(workshopLabel(op.stepName))}</b><span>${escapeHtml(posText)}</span></div>
    ${workshopMaterialAlertHtml(o,op)}
    ${teamNowHtml(o,op)}
    <div class="workshop-current-progress">
      <div class="workshop-current-progress-num"><b>${completed}</b><span> / ${total}</span></div>
      <div class="production-op-progress"><i><b style="width:${pct}%"></b></i><strong>${pct}%</strong></div>
      <span class="workshop-current-remaining">${remaining} ${escapeHtml(t('unitPieces'))} ${escapeHtml(t('remainingWord'))}</span>
    </div>
    ${typeof subOpsPanelHtml==='function'?subOpsPanelHtml(o,op):''}
    ${simpleTaskInfoHtml(o,op,false)}
    ${workshopShiftInfoHtml(o,op)}
    <div class="workshop-record-actions">
      <button class="btn primary workshop-record-btn" type="button" ${canRecord?'':'disabled'} onclick="completeProductionOperation('${o.id}',${op.stepIndex})">✔ ${escapeHtml(t('recordOutputBtn'))}</button>
      <div class="workshop-qty-chips">${chips}<button class="btn workshop-qty-chip" type="button" ${canRecord?'':'disabled'} onclick="completeProductionOperation('${o.id}',${op.stepIndex})">${escapeHtml(t('otherQtyBtn'))}</button></div>
    </div>
    ${workshopMarksHtml(o,op)}
    <button type="button" class="workshop-more-link" onclick="goToOrderFromMaterial(event,'${o.id}')">${escapeHtml(t('openOrderCard'))} ↗</button>
  </div>`;
}
// v7.82: строка очереди сама по себе была одной большой кнопкой (переход в карточку заказа) — чтобы
// добавить кнопку "▶ Начать" (переключиться на этот заказ, не уходя с экрана цеха), вложенную кнопку
// в кнопку вставить нельзя, поэтому строка теперь div с двумя отдельными кнопками внутри: переход в
// карточку (как и раньше) и, для ещё не активных заказов, старт.
function workshopQueueMiniRowHtml(row,isCurrent,etaMap){
  const o=row.order,op=productionOp(o,row.index),risk=isCurrent?null:workshopRowRisk(row,etaMap);
  const remaining=op?Math.max(0,orderProductQty(o)-productionCompletedQty(o,op)):orderProductQty(o);
  const paused=isCurrent&&op?.status==='paused';
  const tagCls=isCurrent?(paused?'paused':'current'):risk?risk.cls:'';
  const tagText=isCurrent?(paused?t('prodStatusPaused'):t('workshopNowTag')):risk?risk.text:(op&&op.status!=='not_started'?productionStatusLabel(op.status):t('workshopNotStartedTag'));
  const dueInfo=simpleDueInfo(o,op),queueDueHtml=dueInfo?`${escapeHtml(formatDeadline(o,op))} · <span class="sw-due ${dueInfo.cls}">${escapeHtml(dueInfo.text)}</span>`:escapeHtml(formatDeadline(o,op));
  const startLbl=(op&&openWorkSessions(o,op.stepIndex).length>0&&!myWorkSession(o,op.stepIndex))?t('simpleJoinBtn'):t('prodStart');
  const startBtn=!isCurrent?`<button type="button" class="btn small workshop-queue-mini-start" aria-label="${escapeHtml(startLbl)}" title="${escapeHtml(startLbl)}" onclick="event.stopPropagation();startProductionOperation('${o.id}',${row.index})">▶</button>`:'';
  return `<div class="workshop-queue-mini-row ${isCurrent?'current':''}">
    <button type="button" class="workshop-queue-mini-info-btn" onclick="goToOrderFromMaterial(event,'${o.id}')">
      <span class="workshop-queue-mini-dot ${tagCls||'ok'}"></span>
      <span class="workshop-queue-mini-info"><b>${escapeHtml(o.number||'—')}</b><small>${escapeHtml(o.client||'—')} · ${isCurrent?`${remaining} ${escapeHtml(t('unitPieces'))} ${escapeHtml(t('remainingWord'))}`:queueDueHtml}</small></span>
      <span class="workshop-queue-mini-tag ${tagCls}">${escapeHtml(tagText)}</span>
    </button>
    ${startBtn}
  </div>`;
}
function workshopQueueSidebarHtml(name,stat,activeRows){
  const isActive=row=>activeRows.some(a=>String(a.order.id)===String(row.order.id)&&a.index===row.index);
  const others=stat.queue.filter(row=>!isActive(row));
  const rows=[...activeRows.map(row=>workshopQueueMiniRowHtml(row,true,stat.etaMap)),...others.slice(0,6).map(row=>workshopQueueMiniRowHtml(row,false,stat.etaMap))].join('');
  return `<div class="workshop-queue-panel">
    <div class="workshop-queue-panel-head"><h4>${escapeHtml(t('workshopQueueTitlePrefix'))} ${escapeHtml(workshopLabel(name))}</h4><small>${escapeHtml(t('workshopQueueSortHint'))}</small></div>
    <div class="workshop-queue-mini-list">${rows||`<div class="workshop-empty">${escapeHtml(t('prodQueueDone'))}</div>`}</div>
    <button type="button" class="workshop-more-link" onclick="openWorkshopFullQueue('${jsStrArg(name)}')">${escapeHtml(t('openFullQueueBtn'))} →</button>
  </div>`;
}
// v7.83: пользователь справедливо спросил "материалы КАКОГО заказа", когда в работе одновременно два
// заказа — раньше заголовок был общий ("Материалы текущего заказа"), а показывался всегда только
// первый по дедлайну активный заказ, даже если реально сейчас крутится другой. Теперь: 1) заголовок
// явно называет заказ, если активных заказов больше одного; 2) при нескольких активных показывается
// СВОЙ блок материалов под каждый, а не только под один "главный".
function workshopCurrentMaterialsHtml(o,op,label){
  if(!o||!op)return '';
  const assigned=operationMaterials(o,op).filter(item=>Number(item.qty||0)>0);
  const seen=new Set(),rows=[];
  assigned.forEach(item=>{
    const state=orderMaterialLineState(item,o.id);
    if(Number(state.av.missing||0)<=0)return;
    const key=state.av.mat?.id||item.materialId;
    if(seen.has(key))return;
    seen.add(key);rows.push({item,state});
  });
  const body=rows.length?rows.slice(0,4).map(({item,state})=>{
    const m=state.av.mat,unit=state.av.unit||item.unit||'',ordered=orderItemPurchaseStatus(item)==='ordered';
    const statusText=ordered?t('ordered'):`${t('workshopMissingLabel')} ${qtyWithUnit(state.av.missing,unit)} · ${t('needToPurchase')}`;
    return `<button type="button" class="workshop-current-material-row" onclick="openProductionMaterialPurchase('${o.id}','${item.materialId}')"><b>${escapeHtml(m?materialTitle(m):t('deletedMaterialWord'))}</b><span class="${ordered?'ok-text':'danger-text'}">${escapeHtml(statusText)}</span></button>`;
  }).join(''):`<div class="workshop-material-alert ok small"><span class="workshop-material-alert-icon">✓</span><span>${escapeHtml(t('workshopMaterialsOkText'))}</span></div>`;
  const titleLabel=label?` <span class="workshop-current-materials-label">· ${escapeHtml(label)}</span>`:'';
  return `<div class="workshop-current-materials"><h4>${escapeHtml(t('workshopCurrentOrderMaterialsTitle'))}${titleLabel}</h4>${body}<button type="button" class="workshop-more-link" onclick="openProductionMaterialsControlModal('${o.id}')">${escapeHtml(t('showAllOrderMaterialsBtn'))} →</button></div>`;
}
function openProductionMaterialsControlModal(orderId){
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;
  if(typeof pushModalState==='function')pushModalState();
  openModal(t('productionMaterialsControl'),productionMaterialsControlHtml(o),`<button class="btn" type="button" onclick="goBackModal()">${escapeHtml(t('closeBtn'))}</button>`);
}
function openWorkshopFullQueue(name){
  const stat=workshopAnalytics(name);
  const cards=stat.queue.map(row=>workshopQueueItemHtml(row,stat.etaMap)).join('')||`<div class="workshop-empty">${escapeHtml(t('prodQueueDone'))}</div>`;
  if(typeof pushModalState==='function')pushModalState();
  openModal(`${t('workshopQueueTitlePrefix')} ${workshopLabel(name)}`,`<div class="workshop-queue-list">${cards}</div>`,`<button class="btn" type="button" onclick="goBackModal()">${escapeHtml(t('closeBtn'))}</button>`);
}
// Быстрая отметка выпуска (+1/+5/+10/+20) — тот же самый finalizeProductionQuantity(), что и обычное
// "Завершить"/подтверждение количества, просто без промежуточного окна ради "макс. 2 клика". Нехватка
// материалов по-прежнему обрабатывается штатно: finalizeProductionQuantity сама откроет окно с тем,
// чего не хватает, вместо того чтобы списать по факту.
async function recordWorkshopQuickQty(orderId,index,qty){
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;
  const op=productionOp(o,index);if(!op||op.status==='done')return;
  const remaining=orderProductQty(o)-productionCompletedQty(o,op);
  if(remaining<=0)return;
  await finalizeProductionQuantity(orderId,index,Math.max(1,Math.min(Number(qty)||1,remaining)));
}
function workshopDetailHtml(name){
  const stat=workshopAnalytics(name),activeRows=workshopActiveRows(stat);
  // v7.82: если в работе больше одного заказа — карточки складываются в столбик (см. .workshop-current-list
  // в css/style.css), каждая с собственной паузой/продолжением и своей "Записать выпуск".
  const currentCards=activeRows.length?activeRows.map(row=>workshopCurrentCardHtml(row)).join(''):workshopCurrentCardHtml(null);
  // v7.83: свой блок материалов под КАЖДЫЙ активный заказ, а не только под первый по дедлайну —
  // иначе при двух заказах в работе было не разобрать, к какому именно относится список материалов.
  // Заголовок называет заказ по номеру, только если активных заказов больше одного (иначе и так
  // очевидно, о каком заказе речь).
  const materialsHtml=activeRows.map(row=>{
    const op=productionOp(row.order,row.index);
    return op?workshopCurrentMaterialsHtml(row.order,op,activeRows.length>1?row.order.number:''):'';
  }).join('');
  return `<div class="workshop-detail-head">
      <button type="button" class="workshop-back-link" onclick="closeWorkshopDetail()">${escapeHtml(t('backToWorkshops'))}</button>
      <span class="workshop-detail-sep"></span>
      <h3>${workshopIcon(name)} ${escapeHtml(workshopLabel(name))}</h3>
      ${workshopStatusBadgeHtml(stat.queue)}
    </div>
    ${workshopShiftSummaryHtml(name,stat,activeRows)}
    <div class="workshop-work-layout">
      <div class="workshop-work-main"><div class="workshop-current-list">${currentCards}</div></div>
      <div class="workshop-work-side">
        ${workshopQueueSidebarHtml(name,stat,activeRows)}
        ${materialsHtml}
      </div>
    </div>`;
}
// v7.90: рабочий режим переработан по утверждённому макету — вместо одного плоского списка карточек
// со всем сразу (v7.43/44) теперь два экрана: A) "Очередь задач" (список) и B) "Активная задача"
// (IDLE/ACTIVE/DONE), под сценарий "начал → закончил" в 2-3 нажатия. Один и тот же источник данных
// на всех размерах экрана (workerAssignedTaskRows/productionOp — уже существовали) — раскладка
// (полноэкранный переход на телефоне vs список+панель на планшете/десктопе) переключается только
// CSS-медиазапросом по классу .has-selected, без дублирования логики под каждый брейкпоинт.
// Выбранная задача — в query-параметре ?task=orderId_stepIndex: одновременно и "текущий экран" на
// телефоне (кнопка "назад" браузера= popstate = вернуться к списку), и выбор строки на
// планшете/десктопе, и прямая ссылка на конкретную задачу.
function simpleTaskKey(orderId,index){return `${orderId}_${index}`}
function getSimpleSelectedTaskKey(){try{return new URLSearchParams(location.search).get('task')||''}catch(e){return ''}}
function setSimpleSelectedTaskKey(key){
  try{
    const url=new URL(location.href);
    if(key)url.searchParams.set('task',key);else url.searchParams.delete('task');
    history.pushState({},'',url);
  }catch(e){}
}
// Разрешаем открыть только задачу из цехов, назначенных этому сотруднику — даже если параметр в URL
// подделан или устарел (задача уже переехала в другой цех/готова).
function findSimpleTaskByKey(key){
  if(!key)return null;
  const sep=key.lastIndexOf('_');if(sep<0)return null;
  const orderId=key.slice(0,sep),index=Number(key.slice(sep+1));
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return null;
  const op=productionOp(o,index);if(!op)return null;
  if(!(window.WORKER_WORKSHOPS||[]).includes(op.stepName))return null;
  return {order:o,op,index};
}
function openSimpleTask(orderId,index){simpleShowDoneConfirmFor='';setSimpleSelectedTaskKey(simpleTaskKey(orderId,index));renderWorkshops()}
function closeSimpleTask(){simpleShowDoneConfirmFor='';setSimpleSelectedTaskKey('');renderWorkshops()}
if(typeof window!=='undefined')window.addEventListener('popstate',()=>{if(document.body.classList.contains('worker-mode')&&typeof renderWorkshops==='function')renderWorkshops()});
// Признак "показать подтверждение DONE" — состояние ЭКРАНА, не данные заказа: нажатие "Готово"
// показывает зелёный экран даже когда работа лишь поставлена на паузу (сделано меньше плана), а не
// только когда план выполнен полностью и операция сама перешла в статус done.
let simpleShowDoneConfirmFor='';
async function simpleStartTask(orderId,index){await startProductionOperation(orderId,index)}
async function simplePauseTask(orderId,index){await pauseProductionOperation(orderId,index)}
async function simpleFinishForNow(orderId,index){
  simpleShowDoneConfirmFor=simpleTaskKey(orderId,index);
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;
  const op=productionOp(o,index);
  if(op&&myWorkSession(o,index))await pauseProductionOperation(orderId,index);
  else if(typeof renderWorkshops==='function')renderWorkshops();
}
// +1/+10/+50 — то же самое немедленное списание через finalizeProductionQuantity(), что и быстрые
// чипы в полном виде "Цехов" (v7.82) — не отдельный "черновой" счётчик: ничего не теряется, если
// страницу закрыть между нажатиями, и не нужно новое поле в данных заказа.
async function simpleQuickAdd(orderId,index,qty){
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;
  const op=productionOp(o,index);if(!op||op.status==='done')return;
  const remaining=orderProductQty(o)-productionCompletedQty(o,op);
  if(remaining<=0)return;
  await finalizeProductionQuantity(orderId,index,Math.max(1,Math.min(qty,remaining)));
}
// v8.00: своё число — рабочий вписывает количество сам (для партий не +5/+10/+20). В отличие от
// чипов не «обрезается» молча до остатка: явно введённое больше остатка — ошибка, а не тихая правка.
async function simpleQuickAddCustom(orderId,index){
  const input=document.querySelector('.simple-custom-input');
  const qty=Number(input?.value);
  if(!input||input.value===''||!Number.isInteger(qty)||qty<1){toast(t('prodInvalidQty'));input?.focus();return}
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;
  const op=productionOp(o,index);if(!op||op.status==='done')return;
  const remaining=orderProductQty(o)-productionCompletedQty(o,op);
  if(qty>remaining){toast(`${t('prodInvalidQty')}: 1–${remaining}`);input.focus();input.select();return}
  input.value='';
  await finalizeProductionQuantity(orderId,index,qty);
}
// "−1" — реальная отмена последней (ещё не отменённой) единицы выпуска: тот же performQuantityDecrease,
// что и админская "Исправить последнее" (см. openFixQuantityModal), просто без модального окна.
async function simpleQuickRemove(orderId,index){
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;
  const log=lastActiveConsumptionLog(o,index);
  if(!log){toast(t('noWriteOffsToUndo'));return}
  await performQuantityDecrease(orderId,index,log.id,Math.max(0,Number(log.qty||0)-1));
}
function workerAssignedTaskRows(){
  const names=window.WORKER_WORKSHOPS||[],rows=[];
  names.forEach(name=>workshopAnalytics(name).queue.forEach(row=>rows.push({...row,workshopName:name})));
  rows.sort((a,b)=>String(rowDueDate(a)||a.order.date||'').localeCompare(String(rowDueDate(b)||b.order.date||'')));
  return rows;
}
// v7.98: экран A) по макету (iPhone/iPad): шапка цеха → переключатель цехов (если допуск к
// нескольким) → метка «В очереди» → карточки задач. Данные — те же настоящие, что и раньше
// (workshopAnalytics(name).queue), ничего нового в схеме заказов не добавлено.
let simpleActiveWorkshop='';
function simpleCurrentWorkshop(){
  const names=window.WORKER_WORKSHOPS||[];
  if(!names.length)return '';
  if(!names.includes(simpleActiveWorkshop))simpleActiveWorkshop=names[0];
  return simpleActiveWorkshop;
}
function setSimpleWorkshopByIndex(i){
  const name=(window.WORKER_WORKSHOPS||[])[Number(i)];
  if(!name)return;
  simpleActiveWorkshop=name;
  renderWorkshops();
}
function simpleTasksCountText(n){
  const m10=n%10,m100=n%100;
  const key=(m10===1&&m100!==11)?'simpleTaskWord1':(m10>=2&&m10<=4&&(m100<12||m100>14))?'simpleTaskWord2':'simpleTaskWord5';
  return `${n} ${t(key)}`;
}
function simpleMonogramHtml(name,cls=''){
  const letter=String(workshopLabel(name)||'').trim().charAt(0).toUpperCase()||'•';
  return `<span class="sw-chip ${cls}" aria-hidden="true">${escapeHtml(letter)}</span>`;
}
function simpleStatusPillHtml(op,limiting){
  if(limiting)return `<span class="sw-pill blocked">${escapeHtml(t('simpleNoMaterialBadge'))}</span>`;
  if(op.status==='running')return `<span class="sw-pill running">${escapeHtml(t('prodStatusRunning'))}</span>`;
  if(op.status==='paused')return `<span class="sw-pill paused">${escapeHtml(t('simplePausedBadge'))}</span>`;
  return `<span class="sw-pill idle">${escapeHtml(t('simpleNotStartedBadge'))}</span>`;
}
// Кнопка на карточке (только телефон — на планшете/десктопе её скрывает CSS, там задача открывается
// в правой панели): «Начать»/«Продолжить» сразу запускает работу и открывает экран задачи.
async function simpleStartAndOpen(orderId,index){
  simpleShowDoneConfirmFor='';
  setSimpleSelectedTaskKey(simpleTaskKey(orderId,index));
  renderWorkshops();
  await startProductionOperation(orderId,index);
}
function simpleTaskCardHtml(row){
  const o=row.order,op=productionOp(o,row.index);
  if(!op)return '';
  const total=orderProductQty(o),completed=productionCompletedQty(o,op),pct=productionOpPercent(o,op);
  const limiting=workshopLimitingMaterial(o,op),blocked=!!(limiting&&limiting.enough<=0);
  const selected=simpleTaskKey(o.id,op.stepIndex)===getSimpleSelectedTaskKey();
  const title=[o.client,o.product].filter(Boolean).map(escapeHtml).join(' · ')||'—';
  // Кнопка зависит от состояния: «Начать» (не начато) и «Продолжить» (пауза) меняют состояние работы
  // и открывают задачу; у задачи, которая уже «В работе», запускать нечего — кнопка просто открывает её
  // экран (вторичный стиль). Раньше у running-задачи тоже стояло «Продолжить» и повторно вызывало
  // startProductionOperation() на уже идущей операции.
  // v8.09: «Открыть» — только тому, кто сам работает над этой операцией. Если работают другие — человек
  // тоже жмёт «Начать» и присоединяется (у каждого своя сессия); «Продолжить» — когда никто не работает.
  const isRunning=!!myWorkSession(o,op.stepIndex),othersWork=openWorkSessions(o,op.stepIndex).length>0&&!isRunning,isPaused=op.status==='paused'&&!othersWork;
  const actionHtml=blocked
    ?`<div class="sw-action disabled">${escapeHtml(t('simpleWaitingMaterialBtn'))}</div>`
    :isRunning
      ?`<button type="button" class="sw-action secondary" onclick="event.stopPropagation();openSimpleTask('${o.id}',${op.stepIndex})">${escapeHtml(t('simpleOpenBtn'))}</button>`
      :`<button type="button" class="sw-action" onclick="event.stopPropagation();simpleStartAndOpen('${o.id}',${op.stepIndex})">${escapeHtml(othersWork?t('simpleJoinBtn'):isPaused?t('prodContinue'):t('simpleStartBtn'))}</button>`;
  const open=blocked?'':` role="button" tabindex="0" onclick="openSimpleTask('${o.id}',${op.stepIndex})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openSimpleTask('${o.id}',${op.stepIndex})}"`;
  const due=simpleDueInfo(o,op);
  const dueHtml=`<span class="sw-due ${due?due.cls:''}">${due?`${escapeHtml(t('simpleDuePrefix'))} ${escapeHtml(due.shortDate)} · ${escapeHtml(due.text)}`:''}</span>`;
  const warnHtml=(limiting&&!blocked)?`<div class="sw-card-warn">${escapeHtml(t('simpleCardEnough').replace('{n}',Math.floor(limiting.enough)).replace('{m}',limiting.total))}</div>`:'';
  return `<div class="sw-card ${selected?'selected':''} ${blocked?'blocked':''}"${open}>
    <div class="sw-card-top"><span class="sw-code">${escapeHtml(o.number||'—')}</span>${simpleStatusPillHtml(op,blocked)}</div>
    <div class="sw-card-title">${title}</div>
    <div class="sw-bar"><b style="width:${pct}%"></b></div>
    <div class="sw-card-meta">${dueHtml}<span class="sw-card-count">${completed} / ${total}</span></div>
    ${teamLineHtml(o,op)}
    ${warnHtml}
    ${actionHtml}
  </div>`;
}
function simpleTaskListHtml(){
  const names=window.WORKER_WORKSHOPS||[];
  if(!names.length)return `<div class="workshop-empty">${escapeHtml(t('simpleNoWorkshopAssigned'))}</div>`;
  const current=simpleCurrentWorkshop();
  // Что сейчас в работе — сверху, затем задачи на паузе, затем остальные (внутри группы — по сроку).
  const stateRank=r=>{const op=productionOp(r.order,r.index);if(!op)return 3;if(myWorkSession(r.order,op.stepIndex))return 0;return op.status==='running'?1:op.status==='paused'?2:3};
  const rows=workerAssignedTaskRows().filter(r=>r.workshopName===current).map((r,i)=>({r,i,k:stateRank(r)})).sort((a,b)=>a.k-b.k||a.i-b.i).map(x=>x.r);
  const access=names.map(n=>workshopLabel(n)).join(', ');
  const head=`<div class="sw-head">${simpleMonogramHtml(current)}<div><b>${escapeHtml(workshopLabel(current))}</b><small>${escapeHtml(simpleTasksCountText(rows.length))} · ${escapeHtml(t('simpleAccessLabel'))}: ${escapeHtml(access)}</small></div></div>`;
  const tabs=names.length>1
    ?`<div class="sw-tabs" role="tablist">${names.map((n,i)=>`<button type="button" role="tab" aria-selected="${n===current}" class="sw-tab ${n===current?'active':''}" onclick="setSimpleWorkshopByIndex(${i})">${escapeHtml(workshopLabel(n))}</button>`).join('')}</div>`
    :'';
  const body=rows.length?rows.map(simpleTaskCardHtml).join(''):`<div class="workshop-empty">${escapeHtml(t('simpleNoTasks'))}</div>`;
  return `${head}${tabs}<div class="sw-section-label">${escapeHtml(t('simpleQueueLabel'))}</div><div class="simple-task-list">${body}</div>`;
}
// v8.02: этот же блок показывается и в полной версии (карточка «Сейчас в работе» у мастера, очередь цеха).
// v8.01: «Задание» для рабочего — срок, норма технолога на изделие и материалы. Всё из уже существующих
// данных заказа: dueDate, steps[].minutes (минуты НА ОДНО изделие), материалы цеха (operationMaterials) и
// расчёт productionConsumptionPlan() на остаток — новых полей в заказе нет.
function simpleNum(n){return String(Number(Number(n).toFixed(1))).replace('.',currentLang==='en'?'.':',')}
function simpleDueInfo(o,op){
  const di=orderDueInfo(o,op),d=di?di.date:'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return null;
  const [y,m,dd]=d.split('-').map(Number),[ty,tm,td]=today().split('-').map(Number);
  const days=Math.round((Date.UTC(y,m-1,dd)-Date.UTC(ty,tm-1,td))/86400000);
  const dateText=new Date(Date.UTC(y,m-1,dd,12)).toLocaleDateString(uiDateLocale(),Object.assign({day:'numeric',month:'long',timeZone:'UTC'},y!==ty?{year:'numeric'}:{}));
  let text,cls='';
  if(days<0){text=t('simpleDueOverdue').replace('{n}',-days);cls='overdue'}
  else if(days===0){text=t('simpleDueToday');cls='soon'}
  else if(days===1){text=t('simpleDueTomorrow');cls='soon'}
  else{text=t('simpleDueIn').replace('{n}',days);cls=days<=3?'soon':''}
  // v8.13: при нескольких отправках — «к этой дате ещё N шт · отправка 2 из 3» (N — сколько к этой дате не хватает)
  const extra=(di.count>1||di.shipQty>0)?t('shipDueExtra').replace('{n}',di.need).replace('{i}',di.index).replace('{m}',di.count):'';
  return {days,dateText,shortDate:`${d.slice(8,10)}.${d.slice(5,7)}`,text,cls,extra};
}
function simpleNormInfo(o,op){
  const perUnit=Math.max(0,Number((orderSteps(o)[Number(op.stepIndex)]||{}).minutes||0));
  const total=orderProductQty(o),remaining=Math.max(0,total-productionCompletedQty(o,op));
  // Фактический темп — только по отметкам, где записано и время, и количество (запись «без учёта времени»
  // и отменённые смены в среднее не идут).
  const sess=(Array.isArray(op.sessions)?op.sessions:[]).filter(x=>!x.undone&&Number(x.qty)>0&&Number(x.minutes)>0);
  const sq=sess.reduce((n,x)=>n+Number(x.qty),0),sm=sess.reduce((n,x)=>n+Number(x.minutes),0);
  const pace=sq>0?sm/sq:0;
  return {perUnit,remaining,remainingMin:Math.round(perUnit*remaining),pace,diff:perUnit>0&&pace>0?(pace-perUnit)/perUnit:null};
}
function simpleMaterialsInfo(o,op){
  const assigned=operationMaterials(o,op).filter(i=>Number(i.qty||0)>0);
  const remaining=Math.max(0,orderProductQty(o)-productionCompletedQty(o,op));
  if(!assigned.length)return {kind:'none',rows:[],short:false};
  if(remaining<=0)return {kind:'consumed',rows:[],short:false};
  const plan=productionConsumptionPlan(o,op,remaining);
  if(!plan.rows.length)return {kind:'consumed',rows:[],short:false};
  const rows=plan.rows.map((r,i)=>{
    const missing=Math.max(0,stockNumForUnit(r.qty-r.stockBefore,r.unit));
    return {i,name:materialTitle(r.m),need:qtyWithUnit(r.qty,r.unit),missing:missing>0?qtyWithUnit(missing,r.unit):''};
  });
  // Сначала то, чего не хватает — при свёрнутом длинном списке первым делом видны проблемные позиции.
  rows.sort((a,b)=>(a.missing?0:1)-(b.missing?0:1)||a.i-b.i);
  return {kind:'rows',rows,short:plan.shortages.length>0,shortCount:rows.filter(r=>r.missing).length};
}
// v8.09: кто сейчас работает над операцией и сколько кто отработал. Источник — рабочие сессии (workSessions:
// у каждой человек и время) и отметки выпуска (op.sessions: кто и сколько записал).
function timeHM(iso){const d=new Date(iso);return isNaN(d)?'—':d.toLocaleTimeString(uiDateLocale(),{hour:'2-digit',minute:'2-digit'})}
function opTeamInfo(o,op){
  const sessions=(productionMeta(o).workSessions||[]).filter(s=>Number(s.stepIndex)===Number(op.stepIndex));
  const marks=(op.sessions||[]).filter(m=>!m.undone);
  const myKey=sessionUserKey(currentUser?.email);
  const names=new Map(); // email → отображаемое имя (сессия помнит имя на момент старта; отметка — на момент записи)
  marks.forEach(m=>{const k=sessionUserKey(m.byEmail);if(k&&m.by)names.set(k,m.by)});
  sessions.forEach(x=>{const k=sessionUserKey(x.userEmail);if(k&&x.userName)names.set(k,x.userName)});
  if(myKey)names.set(myKey,productionActorName());
  const users=new Map();
  const userFor=(key,fallbackName)=>{
    let u=users.get(key);
    if(!u){u={key,name:names.get(key)||fallbackName||(key.includes('@')?key.split('@')[0]:'—'),minutes:0,activeSince:'',qty:0,me:!!myKey&&key===myKey};users.set(key,u)}
    return u;
  };
  sessions.forEach(x=>{const u=userFor(sessionUserKey(x.userEmail)||('n:'+(x.userName||'?')),x.userName);u.minutes+=workSessionMinutes(x);if(!x.endedAt)u.activeSince=x.startedAt});
  marks.forEach(m=>{
    let key=sessionUserKey(m.byEmail);
    if(!key){const f=[...users.values()].find(u=>u.name===m.by);key=f?f.key:('n:'+(m.by||'?'))}
    userFor(key,m.by).qty+=Number(m.qty||0);
  });
  const all=[...users.values()].sort((a,b)=>b.minutes-a.minutes);
  return {active:all.filter(u=>u.activeSince).sort((a,b)=>String(a.activeSince).localeCompare(String(b.activeSince))),all,totalMinutes:all.reduce((n,u)=>n+u.minutes,0)};
}
function teamUserLabel(u){return u.me?`${u.name} (${t('simpleYouLabel')})`:u.name}
// «Сейчас работают» — крупно, до кнопки «Начать»: чтобы было видно, что над заказом уже кто-то работает,
// и можно присоединиться, нажав «Начать».
function teamNowHtml(o,op){
  const info=opTeamInfo(o,op);
  if(!info.active.length)return '';
  const canStop=typeof userCan==='function'&&userCan('production.fixAny');
  const chips=info.active.map(u=>`<span class="sw-now-chip ${u.me?'me':''}"><i class="sw-live"></i><b>${escapeHtml(teamUserLabel(u))}</b><small>${escapeHtml(t('simpleSinceTime').replace('{time}',timeHM(u.activeSince)))}</small>${(canStop&&!u.me)?`<button type="button" class="sw-now-stop" data-key="${escapeHtml(u.key)}" title="${escapeHtml(t('simpleStopUserBtn'))}" onclick="event.stopPropagation();stopOtherWorkSession('${o.id}',${op.stepIndex},this.dataset.key)">■ ${escapeHtml(t('simpleStopUserBtn'))}</button>`:''}</span>`).join('');
  return `<div class="sw-now"><div class="sw-now-title">${escapeHtml(t('simpleNowWorking'))}</div><div class="sw-now-list">${chips}</div></div>`;
}
// Короткая строка для карточки в очереди: «Вы, Anna +1».
function teamLineHtml(o,op){
  const info=opTeamInfo(o,op);
  if(!info.active.length)return '';
  const shown=info.active.slice(0,3).map(u=>u.me?t('simpleYouLabel').replace(/^./,c=>c.toUpperCase()):u.name),more=info.active.length-shown.length;
  return `<div class="sw-card-team"><i class="sw-live"></i>${escapeHtml(t('simpleWorkingNames').replace('{names}',shown.join(', ')+(more>0?` +${more}`:'')))}</div>`;
}
// «Кто сколько работал» — время (сумма сессий) и выпуск по каждому человеку.
function teamTimeCardHtml(o,op){
  const info=opTeamInfo(o,op);
  let body;
  if(!info.all.length)body=`<span class="sw-mat-empty">${escapeHtml(t('simpleTeamNoData'))}</span>`;
  else{
    body=`<ul class="sw-mat-list sw-team-list">${info.all.map(u=>`<li><span class="name">${u.activeSince?'<i class="sw-live"></i>':''}${escapeHtml(teamUserLabel(u))}</span><span class="qty">${escapeHtml(orderTimeText(u.minutes))}${u.qty?` · ${u.qty} ${escapeHtml(t('unitPieces'))}`:''}</span></li>`).join('')}</ul>`
      +(info.all.length>1?`<div class="sw-team-total"><span>${escapeHtml(t('simpleTeamTotal'))}</span><b>${escapeHtml(orderTimeText(info.totalMinutes))}</b></div>`:'');
  }
  return `<div class="sw-info-card wide"><small>${escapeHtml(t('simpleTeamTitle'))}</small>${body}</div>`;
}
function simpleInfoChipsHtml(o,op){
  const due=simpleDueInfo(o,op),mat=simpleMaterialsInfo(o,op);
  const dueChip=due?`<span class="sw-mini ${due.cls}">${escapeHtml(t('simpleDuePrefix'))} ${escapeHtml(due.shortDate)} · ${escapeHtml(due.text)}</span>`:'';
  const matChip=mat.kind==='rows'
    ?`<span class="sw-mini ${mat.short?'overdue':'ok'}">${escapeHtml(t(mat.short?'simpleMatChipShort':'simpleMatChipOk'))}</span>`
    :'';
  return dueChip+matChip;
}
const SIMPLE_MATS_LIMIT=3;
const simpleMatsExpanded=new Set(); // ключи "orderId_stepIndex" раскрытых списков материалов
function toggleSimpleMats(key){if(simpleMatsExpanded.has(key))simpleMatsExpanded.delete(key);else simpleMatsExpanded.add(key);renderWorkshops()}
function simpleInfoBodyHtml(o,op){
  const due=simpleDueInfo(o,op),norm=simpleNormInfo(o,op),mat=simpleMaterialsInfo(o,op);
  const dueCard=`<div class="sw-info-card ${due?due.cls:''}"><small>${escapeHtml(t('simpleDueLabel'))}</small>${due?`<b>${escapeHtml(due.dateText)}</b><span>${escapeHtml(due.text)}</span>${due.extra?`<span class="sw-ship-extra">${escapeHtml(due.extra)}</span>`:''}`:`<b>—</b><span>${escapeHtml(t('simpleDueNotSet'))}</span>`}</div>`;
  let normSub='';
  if(norm.perUnit>0){
    normSub=`<span>${escapeHtml(t('simpleNormLeft'))}: ${escapeHtml(orderTimeText(norm.remainingMin))}</span>`;
    if(norm.pace>0){
      const tag=norm.diff<=-0.05?['ok',t('simplePaceFaster')]:norm.diff>=0.05?['soon',t('simplePaceSlower')]:['',t('simplePaceOnNorm')];
      normSub+=`<span class="sw-pace ${tag[0]}">${escapeHtml(t('simpleNormFact'))}: ${escapeHtml(simpleNum(norm.pace))} ${escapeHtml(t('simpleMinPerPc'))} · ${escapeHtml(tag[1])}</span>`;
    }
  }
  const normCard=`<div class="sw-info-card"><small>${escapeHtml(t('simpleNormLabel'))}</small>${norm.perUnit>0?`<b>${escapeHtml(simpleNum(norm.perUnit))} ${escapeHtml(t('simpleMinPerPc'))}</b>${normSub}`:`<b>—</b><span>${escapeHtml(t('simpleNormNotSet'))}</span>`}</div>`;
  let matBody;
  let matSummary='';
  if(mat.kind==='rows'){
    // Длинный список (у реального заказа бывает 10+ позиций) не растягиваем на весь экран: показываем
    // первые SIMPLE_MATS_LIMIT (сначала проблемные), остальное — по кнопке «Показать все».
    const matKey=`${o.id}_${op.stepIndex}`,collapsible=mat.rows.length>SIMPLE_MATS_LIMIT+1,expanded=simpleMatsExpanded.has(matKey);
    const shown=collapsible&&!expanded?mat.rows.slice(0,SIMPLE_MATS_LIMIT):mat.rows;
    if(collapsible&&mat.shortCount>0)matSummary=`<span class="sw-mat-summary">${escapeHtml(t('simpleMatShortCount').replace('{k}',mat.shortCount).replace('{n}',mat.rows.length))}</span>`;
    matBody=`<ul class="sw-mat-list">${shown.map(r=>`<li><span class="name">${escapeHtml(r.name)}</span><span class="qty">${escapeHtml(r.need)}</span>${r.missing?`<span class="short">${escapeHtml(t('simpleMatMissing').replace('{qty}',r.missing))}</span>`:''}</li>`).join('')}</ul>`
      +(collapsible?`<button type="button" class="sw-mat-more" aria-expanded="${expanded}" onclick="toggleSimpleMats('${matKey}')">${escapeHtml(expanded?t('simpleMatCollapse'):t('simpleMatShowAll').replace('{n}',mat.rows.length))}<span class="sw-info-chevron ${expanded?'open':''}" aria-hidden="true">⌄</span></button>`:'');
  }else{
    matBody=`<span class="sw-mat-empty">${escapeHtml(t(mat.kind==='none'?'simpleMatNone':'simpleMatConsumed'))}</span>`;
  }
  const remainingQty=Math.max(0,orderProductQty(o)-productionCompletedQty(o,op));
  const matCard=`<div class="sw-info-card wide ${mat.short?'overdue':''}"><small>${escapeHtml(t('simpleMatLabel').replace('{n}',remainingQty))}</small>${matSummary}${matBody}</div>`;
  // v8.29: операции этапа (например, «поклейка боковин — 12 мин/шт»), если технолог разбил этап на операции
  const stepDef=(orderSteps(o)[Number(op.stepIndex)])||{},stageOps=Array.isArray(stepDef.operations)?stepDef.operations:[];
  const opsCard=stageOps.length?`<div class="sw-info-card wide"><small>${escapeHtml(t('stageOps'))}</small><ul class="sw-ops">${stageOps.map(x=>`<li><span class="name">${escapeHtml(x.name||'')}</span><span class="qty">${escapeHtml(simpleNum(Number(x.minutes||0)))} ${escapeHtml(t('simpleMinPerPc'))}</span></li>`).join('')}</ul></div>`:'';
  return `<div class="sw-info-grid">${dueCard}${normCard}</div>${opsCard}${matCard}${teamTimeCardHtml(o,op)}`;
}
// IDLE — блок раскрыт (решение «начинать ли» принимается, глядя на него); ACTIVE — свёрнут в одну строку
// с двумя чипами (срок, материалы) и раскрывается по нажатию — экран счётчика остаётся коротким.
let simpleInfoOpen=false;
function toggleSimpleInfo(){simpleInfoOpen=!simpleInfoOpen;renderWorkshops()}
function simpleTaskInfoHtml(o,op,collapsible){
  if(!collapsible)return `<section class="sw-info"><div class="sw-info-title">${escapeHtml(t('simpleInfoTitle'))}</div>${simpleInfoBodyHtml(o,op)}</section>`;
  return `<section class="sw-info"><button type="button" class="sw-info-toggle" aria-expanded="${simpleInfoOpen}" onclick="toggleSimpleInfo()"><span class="sw-info-toggle-title">${escapeHtml(t('simpleInfoTitle'))}</span><span class="sw-info-chips">${simpleInfoChipsHtml(o,op)}</span><span class="sw-info-chevron ${simpleInfoOpen?'open':''}" aria-hidden="true">⌄</span></button>${simpleInfoOpen?simpleInfoBodyHtml(o,op):''}</section>`;
}
// v7.95: и IDLE, и DONE раньше открывались без единой кнопки "назад" наверху (у DONE была только
// скромная текстовая ссылка внизу, у IDLE — вообще никакой) — на телефоне, тем более в режиме PWA
// "на весь экран" без адресной строки браузера, это тупик: попал в задачу — назад пути нет, кроме
// физической кнопки "назад" телефона, которая не отображается ни как элемент интерфейса, ни всегда
// работает надёжно из истории браузера. Общий верхний бар с кнопкой "назад" — на всех трёх экранах
// (IDLE/ACTIVE/DONE), единообразно; на планшете/десктопе он скрыт (см. css) — там список задач
// слева виден постоянно, отдельная кнопка "назад" там не нужна.
function simpleDetailBackBarHtml(task){
  const {op}=task;
  return `<div class="simple-detail-head">
    <button type="button" class="simple-back-btn" onclick="closeSimpleTask()" aria-label="${escapeHtml(t('simpleBackToListLink'))}">‹</button>
    <span class="simple-detail-head-label">${escapeHtml(workshopLabel(op.stepName))}</span>
  </div>`;
}
// Экран B, состояние IDLE — та же карточка и для "ещё не начато", и для "на паузе" (только подпись
// кнопки меняется на "Продолжить") — startProductionOperation() сам решает start/resume.
function simpleTaskDetailIdleHtml(task){
  const {order:o,op}=task,total=orderProductQty(o),completed=productionCompletedQty(o,op);
  const othersWorking=openWorkSessions(o,op.stepIndex).length>0;
  const btnLabel=othersWorking?t('simpleJoinBtn'):op.status==='paused'?t('prodContinue'):t('simpleStartWorkBtn'); // v8.17: работают другие — «Присоединиться»
  return `<div class="simple-detail-idle">
    ${simpleDetailBackBarHtml(task)}
    <div class="simple-detail-icon">${workshopIcon(op.stepName)}</div>
    <h2>${escapeHtml(workshopLabel(op.stepName))}</h2>
    <p>${escapeHtml(o.number||'—')}</p>
    <span class="simple-badge idle">${escapeHtml(String(t('simpleDoneOfLabel')).replace('{completed}',completed).replace('{total}',total))}</span>
    ${teamNowHtml(o,op)}
    ${simpleTaskInfoHtml(o,op,false)}
    <button type="button" class="simple-btn-main" onclick="simpleStartTask('${o.id}',${op.stepIndex})">${escapeHtml(btnLabel)}</button>
  </div>`;
}
// v7.92: сотрудник видит сегодняшние отметки и может сам исправить, если ошибся при вводе количества
// (кнопка "Редактировать" у каждой строки) — тот же workshopMarksHtml/productionSessionRowHtml,
// что и в полной карточке цеха для мастера, без отдельной логики специально для рабочего режима.
function simpleTaskDetailActiveHtml(task){
  const {order:o,op}=task,total=orderProductQty(o),completed=productionCompletedQty(o,op),pct=productionOpPercent(o,op),remaining=Math.max(0,total-completed);
  return `<div class="simple-detail-active">
    <div class="simple-detail-active-head">
      <button type="button" class="simple-back-btn" onclick="closeSimpleTask()" aria-label="${escapeHtml(t('simpleBackToListLink'))}">‹</button>
      <span class="simple-detail-active-label">${escapeHtml(o.number||'—')} · ${escapeHtml(workshopLabel(op.stepName))}</span>
      <button type="button" class="simple-pause-btn" aria-label="${escapeHtml(t('prodPause'))}" title="${escapeHtml(t('prodPause'))}" onclick="simplePauseTask('${o.id}',${op.stepIndex})">⏸</button>
    </div>
    ${typeof subOpsPanelHtml==='function'?subOpsPanelHtml(o,op):''}
    <div class="simple-counter-row">
      ${typeof hasSubOps==='function'&&hasSubOps(o,op.stepIndex)?'<span class="simple-round-spacer"></span>':`<button type="button" class="simple-round-btn" aria-label="−1" onclick="simpleQuickRemove('${o.id}',${op.stepIndex})">−1</button>`}
      <div class="simple-counter"><b>${completed}</b><span>${escapeHtml(String(t('simpleOfTargetSuffix')).replace('{total}',total))}</span></div>
      <button type="button" class="simple-round-btn" aria-label="+1" ${remaining<1?'disabled':''} onclick="simpleQuickAdd('${o.id}',${op.stepIndex},1)">+1</button>
    </div>
    <div class="simple-task-progress wide"><i><b style="width:${pct}%"></b></i></div>
    ${teamNowHtml(o,op)}
    ${simpleTaskInfoHtml(o,op,true)}
    <div class="simple-batch-row">
      ${[5,10,20].map(n=>`<button type="button" class="simple-batch-chip" ${remaining<1?'disabled':''} onclick="simpleQuickAdd('${o.id}',${op.stepIndex},${n})">+${n}</button>`).join('')}
    </div>
    <div class="simple-custom-row">
      <input class="simple-custom-input" type="number" inputmode="numeric" min="1" max="${remaining}" step="1" placeholder="${escapeHtml(t('simpleCustomPlaceholder'))}" aria-label="${escapeHtml(t('simpleCustomPlaceholder'))}" data-key="${simpleTaskKey(o.id,op.stepIndex)}" ${remaining<1?'disabled':''} onkeydown="if(event.key==='Enter'){event.preventDefault();simpleQuickAddCustom('${o.id}',${op.stepIndex})}">
      <button type="button" class="simple-custom-btn" ${remaining<1?'disabled':''} onclick="simpleQuickAddCustom('${o.id}',${op.stepIndex})">${escapeHtml(t('simpleCustomAddBtn'))}</button>
    </div>
    <button type="button" class="simple-btn-main" onclick="simpleFinishForNow('${o.id}',${op.stepIndex})">${escapeHtml(t('simpleDoneBtn'))}</button>
    ${workshopMarksHtml(o,op)}
  </div>`;
}
function simpleTaskDetailDoneHtml(task){
  const {order:o,op}=task,completed=productionCompletedQty(o,op);
  return `<div class="simple-detail-done">
    ${simpleDetailBackBarHtml(task)}
    <div class="simple-done-icon">✓</div>
    <b>${escapeHtml(String(t('simpleDeliveredLabel')).replace('{qty}',completed))}</b>
    <p>${escapeHtml(t('simpleDataSavedText'))}</p>
    <button type="button" class="simple-back-link" onclick="closeSimpleTask()">${escapeHtml(t('simpleBackToListLink'))}</button>
    ${workshopMarksHtml(o,op)}
  </div>`;
}
function simpleTaskDetailHtml(){
  const key=getSimpleSelectedTaskKey(),task=findSimpleTaskByKey(key);
  if(!task)return `<div class="simple-detail-placeholder"><span class="sw-ph-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 6h12"/><path d="M8 12h12"/><path d="M8 18h12"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/></svg></span>${escapeHtml(t('simpleChooseTaskHint'))}</div>`;
  const {order,op}=task;
  if(op.status==='done'||simpleShowDoneConfirmFor===key)return simpleTaskDetailDoneHtml(task);
  if(myWorkSession(order,op.stepIndex))return simpleTaskDetailActiveHtml(task); // экран счётчика — только тому, кто сам работает
  if(op.status==='running'&&!openWorkSessions(order,op.stepIndex).length&&!currentWorkSession(order,op.stepIndex))return simpleTaskDetailActiveHtml(task); // запуск без сессий (старые данные)
  return simpleTaskDetailIdleHtml(task);
}
function workerWorkshopTasksHtml(){
  const selectedTask=findSimpleTaskByKey(getSimpleSelectedTaskKey());
  if(selectedTask)simpleActiveWorkshop=selectedTask.op.stepName;
  const hasSelected=!!selectedTask;
  return `<div class="simple-workshop-wrap ${hasSelected?'has-selected':''}">
    <div class="simple-task-list-pane">${simpleTaskListHtml()}</div>
    <div class="simple-task-detail-pane">${simpleTaskDetailHtml()}</div>
  </div>`;
}
function renderWorkshops(){
  const el=document.getElementById('workshopsContent');
  if(!el)return;
  // v7.84: ленивая проверка автостопа по концу смены — при каждом заходе на "Цеха" (плюс по
  // интервалу, пока экран открыт, см. refreshActiveElapsedTimers), а не только тут, чтобы просроченная
  // с вечера сессия не висела "в работе", пока кто-то не откроет этот экран снова.
  if(typeof applyShiftAutoStops==='function'){
    const touched=applyShiftAutoStops();
    if(touched.length&&typeof persistShiftAutoStops==='function')persistShiftAutoStops(touched);
  }
  const desc=document.getElementById('workshopsTopbarDesc');
  if(document.body.classList.contains('worker-mode')){
    // Экран перерисовывается целиком (по таймеру раз в 30 с и после любой записи) — не даём этому стереть
    // число, которое рабочий сейчас вписывает в поле «Своё число».
    const prevInput=el.querySelector('.simple-custom-input');
    const prev=prevInput&&prevInput.value!==''?{key:prevInput.dataset.key,value:prevInput.value,focus:document.activeElement===prevInput}:null;
    el.innerHTML=workerWorkshopTasksHtml();
    if(prev){const ni=el.querySelector('.simple-custom-input');if(ni&&ni.dataset.key===prev.key){ni.value=prev.value;if(prev.focus)ni.focus()}}
    if(desc)desc.textContent='Ваши задачи по цеху';
    return;
  }
  el.innerHTML=selectedWorkshopName?workshopDetailHtml(selectedWorkshopName):workshopsOverviewHtml();
  // v7.77: у детального экрана цеха теперь свой подзаголовок ("рабочее место мастера") — раньше
  // здесь просто повторялось название цеха ещё раз, хотя оно уже видно в хлебной крошке.
  if(desc)desc.textContent=selectedWorkshopName?t('workshopMasterSubtitle'):t('workshopQueueAllDesc');
}
function productionWarnings(o){
  const names=[...new Set(orderSteps(o).filter(s=>Number(s.minutes||0)>0).map(s=>s.name).filter(Boolean))],list=[];
  names.forEach(name=>list.push(...workshopAnalytics(name).warnings));
  productionOps(o).forEach(op=>{const plan=productionPlanMinutesForStep(o,op.stepIndex),actual=productionActualMinutes(op,o);if(op.status==='running'&&actual>plan&&plan>0)list.push(`${op.stepName} ${t('prodWarnDelayed')} +${orderTimeText(actual-plan)}`);if(op.status==='running'&&productionMinutesBetween(op.startedAt)>1440)list.push(`${op.stepName} ${t('prodWarnDayOpen')}`)});
  return [...new Set(list)].slice(0,4);
}
function productionTimelineHtml(o){
  const rows=[];
  rows.push({tone:'done',text:t('timelineOrderCreated')});
  if(hasOrderTechnology(o.steps))rows.push({tone:'done',text:t('timelineTechnologyDone')});
  if(productionOps(o).some(op=>op.startedAt))rows.push({tone:'running',text:t('timelineProductionStarted')});
  productionOps(o).forEach(op=>{if(op.status==='done')rows.push({tone:'done',text:`${op.stepName} ${t('timelineOperationDone')}`});else if(op.status==='running')rows.push({tone:'running',text:`${op.stepName} ${t('timelineOperationStarted')}`});else if(op.status==='paused')rows.push({tone:'paused',text:`${op.stepName} ${t('prodStatusPaused')}`})});
  if(orderWorkflowStage(o.id)>=3)rows.push({tone:'complete',text:t('timelineTransferredCompletion')});
  const auditRows=typeof auditFor==='function'?auditFor('order',o.id).filter(r=>String(r.type||'').includes('production')).slice(0,4):[];
  return `<section class="production-workflow-card production-timeline"><h4>${escapeHtml(t('productionTimeline'))}</h4><div class="production-timeline-list">${rows.map(r=>`<div class="${r.tone}"><i></i><span>${escapeHtml(r.text)}</span></div>`).join('')}${auditRows.map(r=>`<div class="history"><i></i><span>${escapeHtml(r.text||'')}</span><small>${escapeHtml(typeof auditTime==='function'?auditTime(r.at):'')}</small></div>`).join('')}</div></section>`;
}
function openProductionMaterialPurchase(orderId,materialId){if(typeof pushModalState==='function')pushModalState();openOrderMaterialPurchase(orderId,materialId)}
function openProductionMaterialDetails(materialId){if(typeof pushModalState==='function')pushModalState();openMaterialDetails(materialId)}
function productionMaterialLinkHtml(m,item){
  if(!m)return `<b>${escapeHtml(t('deletedMaterialWord'))}</b>`;
  return `<button class="production-material-link" type="button" onclick="openProductionMaterialDetails('${item.materialId}')"><b>${escapeHtml(materialTitle(m))}</b>${m.sku?`<small>${escapeHtml(m.sku)}</small>`:''}</button>`;
}
function productionMaterialsControlHtml(o){const items=orderMaterials(o);if(!items.length)return `<section class="production-workflow-card"><h4>${escapeHtml(t('productionMaterialsControl'))}</h4><div class="order-tech-empty">${escapeHtml(t('noTechnologyMaterials'))}</div></section>`;return `<section class="production-workflow-card production-material-control"><h4>${escapeHtml(t('productionMaterialsControl'))}</h4><div class="production-material-table-wrap"><table class="production-material-table"><thead><tr><th>${escapeHtml(t('material'))}</th><th>Операция</th><th>На изделие</th><th>Требуется</th><th>Уже списано</th><th>Осталось списать</th><th>Остаток склада</th><th>${escapeHtml(t('status'))}</th></tr></thead><tbody>${items.map(i=>{const st=orderMaterialLineState(i,o.id),m=st.av.mat,unit=st.av.unit||i.unit||'',per=orderItemPerUnitQty(i,o),used=orderItemConsumedQty(i),left=Math.max(0,stockNumForUnit(Number(i.qty||0)-used,unit)),stock=m?convertMaterialQty(Number(m.quantity||0),m.unit||unit,unit,m):0,ordered=orderItemPurchaseStatus(i)==='ordered',status=left<=0?'✓ полностью списано':st.av.ok?'✓ '+t('availableStatus'):ordered?`${t('ordered')}: ${qtyWithUnit(orderItemPurchaseQty(i,st.av.missing),unit)}`:'⚠ '+t('needToPurchase'),cls=left<=0||st.av.ok?'ok':ordered?'ordered':'warn',cell=st.av.ok||left<=0?`<span class="production-material-status ${cls}">${escapeHtml(status)}</span>`:`<button class="production-material-status ${cls} action" type="button" onclick="openProductionMaterialPurchase('${o.id}','${i.materialId}')">${escapeHtml(status)}</button>`;return `<tr><td>${productionMaterialLinkHtml(m,i)}</td><td>${escapeHtml(materialWorkshopForItem(i,m)||'—')}</td><td>${escapeHtml(qtyWithUnit(per,unit))}</td><td>${escapeHtml(qtyWithUnit(i.qty,unit))}</td><td>${escapeHtml(qtyWithUnit(used,unit))}</td><td>${escapeHtml(qtyWithUnit(left,unit))}</td><td>${escapeHtml(qtyWithUnit(stock,unit))}</td><td>${cell}</td></tr>`}).join('')}</tbody></table></div></section>`}
function productionSummaryHtml(o){
  const ops=productionOps(o),done=productionDoneCount(o),running=productionRunningCount(o),current=productionCurrentOp(o);
  return `<section class="production-workflow-card production-summary"><h4>${escapeHtml(t('productionSummary'))}</h4><div><span>${escapeHtml(t('totalOperations'))}</span><b>${ops.length}</b></div><div><span>${escapeHtml(t('prodDone'))}</span><b>${done}</b></div><div><span>${escapeHtml(t('prodInProgress'))}</span><b>${running}</b></div></section>`;
}
function orderMaterialEnoughQty(o,item,state){
  const per=orderItemPerUnitQty(item,o),total=orderProductQty(o);
  if(per<=0)return total;
  return Math.max(0,Math.min(total,Math.floor(Number(state.av.available||0)/per)));
}
function productionMaterialCoverage(o,itemsOverride=null,alreadyDone=0){
  const items=(itemsOverride||orderMaterials(o)).filter(item=>Number(item.qty||0)>0);
  const fullTotal=orderProductQty(o);
  const total=Math.max(0,fullTotal-Math.max(0,Math.trunc(Number(alreadyDone||0))));
  if(!items.length)return {ok:true,enough:total,missing:[]};
  const rows=items.map(item=>({item,state:orderMaterialLineState(item,o.id)}));
  const enough=Math.min(total,...rows.map(row=>orderMaterialEnoughQty(o,row.item,row.state)));
  return {ok:enough>=total,enough,missing:rows.filter(row=>orderMaterialEnoughQty(o,row.item,row.state)<total)};
}
function orderHasProductionMaterialWarning(o){
  return ['В производстве','В работе'].includes(String(o?.status||''))&&productionMaterialCoverage(o).missing.length>0;
}
function orderProductionMaterialWarningHtml(o){
  return orderHasProductionMaterialWarning(o)?`<span class="order-material-alert" title="${escapeHtml(t('missingMaterialsWarningTitle'))}">⚠</span>`:'';
}
function productionOperationMaterialStatusHtml(o,op){
  const assigned=operationMaterials(o,op);
  if(!assigned.length)return `<div class="production-op-materials idle"><strong>${escapeHtml(t('materialsNotAssignedToWorkshop'))}</strong></div>`;
  const alreadyDone=productionCompletedQty(o,op);
  const coverage=productionMaterialCoverage(o,assigned,alreadyDone),total=Math.max(0,orderProductQty(o)-alreadyDone);
  const consumption=operationConsumptionStats(o,op);
  const label=currentLang==='ru'?'Материалы':currentLang==='en'?'Materials':'Materiāli';
  const enoughLabel=currentLang==='ru'?'хватит на':currentLang==='en'?'enough for':'pietiek';
  const allLabel=currentLang==='ru'?'хватает на весь заказ':currentLang==='en'?'enough for full order':'pietiek visam pasūtījumam';
  const missingLabel=currentLang==='ru'?'не хватает':currentLang==='en'?'missing':'trūkst';
  const needLabel=currentLang==='ru'?'нужно':currentLang==='en'?'need':'nepieciešams';
  const availableLabel=currentLang==='ru'?'в наличии':currentLang==='en'?'in stock':'noliktavā';
  const rowOkLabel=currentLang==='ru'?'✓ хватает':currentLang==='en'?'✓ enough':'✓ pietiek';
  const title=coverage.ok?`${label}: ${allLabel}`:`${label}: ${enoughLabel} ${coverage.enough} / ${total}`;
  const sourceRows=coverage.ok?assigned.map(item=>({item,state:orderMaterialLineState(item,o.id)})):coverage.missing;
  const list=sourceRows.slice(0,4).map(({item,state})=>{
    const m=state.av.mat,unit=state.av.unit||item.unit||'',missingQty=Number(state.av.missing||0),rowOk=missingQty<=0;
    const statusText=rowOk?rowOkLabel:`⚠ ${missingLabel} ${escapeHtml(qtyWithUnit(missingQty,unit))}`;
    const detailText=`${needLabel} ${escapeHtml(qtyWithUnit(item.qty,unit))} · ${availableLabel} ${escapeHtml(qtyWithUnit(state.av.available,unit))}`;
    return `<button type="button" class="${rowOk?'material-row-ok':'material-row-warn'}" onclick="openProductionMaterialDetails('${item.materialId}')"><b>${escapeHtml(m?materialTitle(m):t('deletedMaterialWord'))}</b><span>${statusText} · ${detailText}</span></button>`;
  }).join('');
  const last=consumption.last?`<small>${escapeHtml(t('lastWriteOffLabel'))}: ${escapeHtml(consumption.last.qty)} ${escapeHtml(t('unitsGenitive'))} · ${escapeHtml(productionDateTimeText(consumption.last.at))}</small>`:`<small>${escapeHtml(t('lastWriteOffLabel'))}: —</small>`;
  return `<div class="production-op-materials ${coverage.ok?'ok':'warn'}"><strong>${coverage.ok?'✓':'⚠'} ${escapeHtml(title)}${infoBtn('materials')}</strong><em>${escapeHtml(t('materialsWrittenOffLabel'))}: ${escapeHtml(consumption.sets)} / ${escapeHtml(total)} ${escapeHtml(t('setsWord'))}</em>${last}${list?`<div>${list}</div>`:''}</div>`;
}
// v7.92: вынесено из productionSessionHistoryHtml() без изменения поведения — один и тот же рендер
// строки смены (количество, начало → конец, длительность, кто, кнопка «Редактировать», след правки/
// отмены) теперь переиспользуется и в полной карточке операции заказа, и в компактном списке
// «Отметки за сегодня» на экране цеха (см. workshopMarksHtml) — вместо повторения этой же
// разметки/логики редактирования во второй раз.
// v8.00: у смены хранится полная история правок (edits: [{from,to,by,at}]) — не только последняя.
// Старые смены (правились до этой версии) имели только originalQty/editedBy/editedAt — из них
// восстанавливается одна запись, чтобы прежние правки не пропали из списка.
function sessionEditsList(s){
  if(Array.isArray(s.edits)&&s.edits.length)return s.edits.slice();
  return s.editedBy?[{from:s.originalQty,to:s.qty,by:s.editedBy,at:s.editedAt}]:[];
}
// Подряд идущие правки одного человека (например, несколько нажатий «−1») в списке схлопываются в одну
// строку «было → стало» — в данных они остаются отдельными.
function sessionEditTraceHtml(s){
  const merged=[];
  sessionEditsList(s).forEach(e=>{
    const last=merged[merged.length-1];
    if(last&&last.by===e.by&&Number(last.to)===Number(e.from))merged[merged.length-1]={...last,to:e.to,at:e.at};
    else merged.push({...e});
  });
  const lines=merged.map(e=>`<div class="session-edit-trace">${escapeHtml(t('sessionEditedTrace'))}: ${escapeHtml(e.from??'')}→${escapeHtml(e.to??'')} · ${escapeHtml(e.by||'—')} · ${escapeHtml(productionDateTimeText(e.at))}</div>`);
  if(s.undone)lines.push(`<div class="session-edit-trace danger">${escapeHtml(t('sessionCancelledTrace'))}: ${escapeHtml(s.undoneBy||'—')} · ${escapeHtml(productionDateTimeText(s.undoneAt))}</div>`);
  return lines.join('');
}
// v8.04–8.06: кто может править отметку выпуска. С правом «production.fixAny» (мастер, владелец) — любую; с правом
// «production.mark» (рабочий) — только СВОЮ и только за
// сегодня (владелец определяется по byEmail смены; у старых смен без byEmail — по имени); остальные роли
// править не могут. Проверяется и в интерфейсе (кнопка «Редактировать»), и в самих функциях правки.
function canEditMark(o,op,consumptionId){
  const can=typeof userCan==='function'?userCan:()=>true;
  if(can('production.fixAny'))return true;
  if(!can('production.mark'))return false;
  const s=(op?.sessions||[]).find(x=>String(x.consumptionId)===String(consumptionId));
  if(!s)return false;
  const me=String(currentUser?.email||'').toLowerCase();
  const mine=s.byEmail?String(s.byEmail).toLowerCase()===me:(!!s.by&&s.by===productionActorName());
  return mine&&String(s.startedAt||'').slice(0,10)===today();
}
function productionSessionRowHtml(o,op,s,consumptionLogs){
  const log=s.consumptionId?(consumptionLogs||[]).find(l=>String(l.id)===String(s.consumptionId)):null;
  const canEdit=!!(log&&!log.undone)&&canEditMark(o,op,log.id);
  const editBtn=canEdit?`<button class="btn small ghost session-edit-btn" type="button" onclick="openFixQuantityModal('${o.id}',${op.stepIndex},'${log.id}')">${escapeHtml(t('editBtn'))}</button>`:'';
  return `<div class="${s.undone?'session-undone':''}"><span><b>${escapeHtml(s.qty||0)} ${escapeHtml(t('unitPieces'))}</b><small>${escapeHtml(productionDateTimeText(s.startedAt))} → ${escapeHtml(productionDateTimeText(s.endedAt))}</small>${sessionEditTraceHtml(s)}</span><strong>${escapeHtml(orderTimeText(s.minutes||0))}</strong><em>${escapeHtml(s.by||'—')}</em>${editBtn}</div>`;
}
function productionSessionHistoryHtml(o,op){
  const sessions=Array.isArray(op.sessions)?op.sessions:[];
  if(!sessions.length)return '';
  // v7.53: у каждой смены — своя кнопка «Редактировать» (не только у последней) и след правки/
  // отмены (кто и когда), если смену меняли — см. performQuantityDecrease/Increase().
  const logs=productionMeta(o).consumptionLogs||[];
  return `<div class="production-session-list"><h5>${escapeHtml(t('sessionsByShiftTitle'))}${infoBtn('sessions')}</h5>${sessions.slice(0,4).map(s=>productionSessionRowHtml(o,op,s,logs)).join('')}</div>`;
}
function productionOperationCardHtml(o,op){
  const plan=productionPlanMinutesForStep(o,op.stepIndex),actual=productionActualMinutes(op,o),diff=actual-plan,pct=productionOpPercent(o,op),completed=productionCompletedQty(o,op),total=orderProductQty(o),state=productionQueueState(o.id,op.stepIndex),status=productionStatusClass(op.status),compact=op.status==='done'&&op.collapsed!==false,comments=Array.isArray(op.comments)?op.comments:[],toggleLabel=op.status==='running'?t('prodPause'):op.status==='paused'?t('prodContinue'):t('prodStart'),toggleIcon=op.status==='running'?'⏸':'▶';
  const canUndo=!!lastActiveConsumptionLog(o,op.stepIndex);
  return `<article class="production-operation-card ${status} ${compact?'compact':''}" id="productionOp_${o.id}_${op.stepIndex}"><div class="production-op-strip"></div><div class="production-op-main"><div class="production-op-heading"><div><h4>${workshopIcon(op.stepName)} ${escapeHtml(workshopLabel(op.stepName))}</h4><span>${escapeHtml(t('queue'))}: ${state.position?`${state.position} ${t('of')} ${state.total}`:state.label}</span></div><span class="production-status-pill ${status}">${escapeHtml(productionStatusLabel(op.status))}</span></div><div class="production-quantity-progress"><small>${escapeHtml(t('prodDone'))}${infoBtn('done')}</small><b>${completed} / ${total}</b></div><div class="production-op-progress"><i><b style="width:${pct}%"></b></i><strong>${pct}%</strong></div><div class="production-op-kpis"><div><span class="op-kpi-icon plan">📅</span><span><small>${escapeHtml(t('plan'))}${infoBtn('plan')}</small><b>${escapeHtml(orderTimeText(plan))}</b></span></div><div><span class="op-kpi-icon fact">▶</span><span><small>${escapeHtml(t('fact'))}${infoBtn('fact')}</small><b>${escapeHtml(orderTimeText(actual))}</b></span></div><div><span class="op-kpi-icon diff">📊</span><span><small>${escapeHtml(t('difference'))}${infoBtn('diff')}</small><b class="${diff>0?'danger-text':'ok-text'}">${escapeHtml(orderTimeTextSigned(diff))}</b></span></div></div>${typeof subOpsPanelHtml==='function'?subOpsPanelHtml(o,op):''}${productionOperationMaterialStatusHtml(o,op)}${productionSessionHistoryHtml(o,op)}${diff>0?`<div class="production-delay">⚠ +${escapeHtml(orderTimeText(diff))}</div>`:''}${compact?`<button class="btn small" type="button" onclick="toggleProductionOperationCompact('${o.id}',${op.stepIndex})">${escapeHtml(t('expand'))}</button>`:`<div class="production-comment-box"><textarea class="input" id="prodComment_${o.id}_${op.stepIndex}" placeholder="${escapeHtml(t('prodCommentPlaceholder'))}">${escapeHtml(op.comment||'')}</textarea><button class="btn small" type="button" onclick="saveProductionComment('${o.id}',${op.stepIndex})">${escapeHtml(t('save'))}</button></div><div class="production-comments">${comments.slice(0,3).map(c=>`<div><b>${escapeHtml(c.by||'—')}</b><span>${escapeHtml(productionDateTimeText(c.at))}</span><p>${escapeHtml(c.text||'')}</p></div>`).join('')}</div>`}</div><div class="production-op-actions"><button class="btn small" type="button" onclick="closeWorkshopDetail()">${escapeHtml(t('backToAllWorkshops'))}</button><button class="btn small primary" type="button" onclick="toggleProductionOperation('${o.id}',${op.stepIndex})" ${op.status==='done'||op.status==='cancelled'?'disabled':''}>${toggleIcon} ${escapeHtml(toggleLabel)}</button><button class="btn small" type="button" onclick="completeProductionOperation('${o.id}',${op.stepIndex})" ${op.status==='cancelled'?'disabled':''}>✔ ${escapeHtml(t('prodComplete'))}</button><button class="btn small" type="button" onclick="undoLastProductionConsumption('${o.id}',${op.stepIndex})" ${canUndo?'':'disabled'}>${escapeHtml(t('undoWriteOff'))}</button></div></article>`;
}
function productionKpiHtml(o){
  const qty=orderProductQty(o),matCount=orderMaterials(o).length,plan=calcOrderMinutes(o),actual=productionOps(o).reduce((s,op)=>s+productionActualMinutes(op,o),0),pct=calcWorkflowProductionPercent(o),missing=orderMissingItems(o).length;
  const cards=[['📦',t('orderProductCount'),qty],['🧱',t('materialsCount'),matCount],['⏱',t('plannedTime'),orderTimeText(plan)],['⏱',t('actualTime'),orderTimeText(actual)],['📈',t('readiness'),`${pct}%`],['⚠',t('missingMaterialsCount'),missing]];
  return `<div class="production-kpi-grid">${cards.map(([icon,label,value])=>`<div class="production-kpi"><span>${icon}</span><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></div>`).join('')}</div>`;
}
function openWorkshopFromOrder(stepName){
  if(typeof closeModal==='function')closeModal();
  if(typeof switchSection==='function')switchSection('workshops');
  setTimeout(()=>openWorkshopDetail(stepName),0);
}
function productionOperationCompactRowHtml(o,op){
  const pct=productionOpPercent(o,op),status=productionStatusClass(op.status),completed=productionCompletedQty(o,op),total=orderProductQty(o),coverage=productionMaterialCoverage(o,operationMaterials(o,op),completed);
  return `<button type="button" class="production-op-compact ${status}" onclick="openWorkshopFromOrder('${jsStrArg(op.stepName)}')">
    <span class="production-op-compact-icon">${workshopIcon(op.stepName)}</span>
    <span class="production-op-compact-name"><b>${escapeHtml(workshopLabel(op.stepName))}</b><small>${escapeHtml(t('queue'))}: ${escapeHtml(productionQueueState(o.id,op.stepIndex).label)}</small></span>
    <span class="production-status-pill ${status}">${escapeHtml(productionStatusLabel(op.status))}</span>
    <span class="production-op-compact-progress"><i><b style="width:${pct}%"></b></i></span>
    <span class="production-op-compact-qty">${completed} / ${total}</span>
    ${!coverage.ok?`<span class="production-op-compact-warn" title="${escapeHtml(t('missingMaterialsWarningTitle'))}">⚠</span>`:''}
    <span class="production-op-compact-go">${escapeHtml(t('openWorkshop'))} →</span>
  </button>`;
}
function orderProductionWorkflowHtml(o){
  ensureWorkflowProduction(o);
  const pct=calcWorkflowProductionPercent(o),done=productionDoneCount(o),ops=productionOps(o),current=productionCurrentOp(o),warnings=productionWarnings(o),left=ops.length-done;
  return `<div class="production-workflow-screen">${productionKpiHtml(o)}${warnings.length?`<div class="production-warnings">${warnings.map(w=>`<span>⚠ ${escapeHtml(w)}</span>`).join('')}</div>`:''}<section class="production-workflow-card production-main-progress"><div><h4>${escapeHtml(t('productionProgress'))}</h4><b>${pct}%</b></div><div class="production-big-bar"><span style="width:${pct}%"></span></div><div class="production-progress-meta"><span>${escapeHtml(t('prodDone'))}: <b>${done}</b></span><span>${escapeHtml(t('prodLeft'))}: <b>${left}</b></span></div></section><div class="production-layout"><div class="production-operations-list production-operations-compact"><div class="production-compact-hint">${escapeHtml(t('manageOpsInWorkshopsHint'))}</div>${ops.map(op=>productionOperationCompactRowHtml(o,op)).join('')||`<div class="production-empty">${escapeHtml(t('noProductionOperations'))}</div>`}${ops.length&&done===ops.length?`<button class="btn primary transfer-completion-btn" type="button" onclick="transferOrderToCompletion('${o.id}')">${escapeHtml(t('transferToCompletion'))} →</button>`:''}</div><aside class="production-aside">${productionTimelineHtml(o)}${productionSummaryHtml(o)}${productionMaterialsControlHtml(o)}</aside></div></div>`;
}
async function persistProductionWorkflow(o,message,type='production_update',meta={}){
  o.updatedAt=productionNow();o.updatedBy=productionActorName();
  save();try{if(typeof auditAdd==='function')auditAdd(type,'order',o.id,o.number,message,meta)}catch(e){}
  // v7.78: та же гонка, что и при создании/удалении заказа (см. saveManagerOrder/deleteOrder) —
  // раньше запись прогресса производства уходила на сервер только фоново (debounce внутри save()),
  // а эта функция вызывается на КАЖДУЮ отметку выпуска (в т.ч. новыми кнопками +1/+5/+10/+20 в
  // "Цехах") — чем чаще сохранения, тем больше шанс, что перезагрузка/другая вкладка успеет
  // прочитать заказы раньше, чем долетит только что записанный прогресс, и он потеряется. Явно
  // ждём здесь, прежде чем переходить к (более медленному) обновлению остатков материалов.
  try{await persistOrdersToSupabase()}catch(e){}
  try{syncMaterialReservations();await persistReservationMaterials()}catch(e){}
  refreshOrderWorkflow(o.id);
}
async function startProductionOperation(orderId,index,opts={}){
  let o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;
  const op=productionOp(o,index);if(!op||op.status==='done')return;
  // v8.34: этап разбит на операции — сначала спрашиваем, что именно будут делать (см. js/suboperations.js)
  if(!opts.skipSubChoice&&typeof needSubOpChoice==='function'&&needSubOpChoice(o,index)){openSubOpChooseModal(orderId,index);return}
  const now=productionNow();
  // v7.84: один сотрудник физически не может одновременно вести две операции — если у него уже
  // открыта рабочая сессия на ДРУГОМ заказе/операции, сначала закрываем её как switch_order (чужие
  // сессии не трогаем: другой мастер/цех может законно работать параллельно, см. v7.82 — "работать
  // сразу с двумя").
  const myEmail=currentUser?.email||'',openElsewhere=findOpenWorkSessionForUser(myEmail);
  if(openElsewhere&&!(String(openElsewhere.order.id)===String(o.id)&&Number(openElsewhere.session.stepIndex)===Number(index))){
    const otherOp=productionOp(openElsewhere.order,openElsewhere.session.stepIndex);
    if(otherOp){
      endWorkSession(openElsewhere.order,otherOp.stepIndex,'switch_order');
      syncOpRunningState(openElsewhere.order,otherOp,now); // на той операции могут продолжать работать другие
      await persistProductionWorkflow(openElsewhere.order,`${tRu('historyProductionPaused')}: ${otherOp.stepName}`,'production_operation_paused',{step:otherOp.stepName});
    }
  }
  // v7.94: пока ждали persistProductionWorkflow() выше (закрытие сессии на другом заказе), могло
  // прилететь realtime-обновление заказов и заменить объекты в data.orders на новые (см.
  // mergeIncomingOrderRow в index.html) — старая ссылка `o` рисковала остаться "осиротевшей"
  // (больше не частью data.orders), и все мутации ниже применялись бы к ней вникуда, теряясь
  // молча. Перечитываем `o` из АКТУАЛЬНОГО data.orders, прежде чем продолжать.
  o=(data.orders||[]).find(x=>String(x.id)===String(orderId))||o;
  // productionOp() перестраивает весь operations-массив заказа при каждом вызове (см.
  // ensureWorkflowProduction) — если строкой выше только что переключали операцию ЭТОГО ЖЕ заказа
  // (другой stepIndex), старая ссылка `op` осталась бы от предыдущей версии массива и её мутации
  // ниже потерялись бы при следующей перестройке. Перечитываем на всякий случай.
  const freshOp=productionOp(o,index);if(!freshOp||freshOp.status==='done')return;
  if(myWorkSession(o,index))return; // я уже работаю над этой операцией
  if(!freshOp.startedAt)freshOp.startedAt=now;
  // v8.09: если над операцией уже работают другие — просто присоединяемся (своя сессия), состояние
  // операции не трогаем; возобновление с паузы / первый старт — как и раньше.
  if(!openWorkSessions(o,index).length){
    if(freshOp.status==='paused'&&freshOp.pausedAt){const paused=productionMinutesBetween(freshOp.pausedAt,now);freshOp.pauseMinutes=Number(freshOp.pauseMinutes||0)+paused;if(freshOp.currentSessionStartedAt)freshOp.currentSessionPauseMinutes=Number(freshOp.currentSessionPauseMinutes||0)+paused;}
    if(!freshOp.currentSessionStartedAt){freshOp.currentSessionStartedAt=now;freshOp.currentSessionPauseMinutes=0;}
  }
  freshOp.pausedAt='';freshOp.status='running';o.status='В работе';
  startWorkSession(o,freshOp);
  await persistProductionWorkflow(o,`${tRu('historyProductionOperationStarted')}: ${freshOp.stepName}`,'production_operation_started',{step:freshOp.stepName});
}
// v8.18: мастер (право «Править чужие отметки») может остановить чужую рабочую сессию — например, если человек
// забыл нажать «Пауза». Время сессии считается до текущего момента; причина — stopped_by_master.
async function stopOtherWorkSession(orderId,index,userKey){
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;
  const op=productionOp(o,index);if(!op)return;
  const session=openWorkSessions(o,index).find(x=>sessionUserKey(x.userEmail)===userKey);
  if(!session)return;
  const name=session.userName||String(session.userEmail||'').split('@')[0];
  if(!confirm(t('simpleStopUserConfirm').replace('{name}',name)))return;
  closeWorkSession(session,'stopped_by_master');
  session.stoppedBy=productionActorName();
  syncOpRunningState(o,op,productionNow());
  await persistProductionWorkflow(o,`${tRu('historyProductionPaused')}: ${op.stepName} — ${name}`,'production_operation_paused',{step:op.stepName,stoppedUser:name});
}
async function pauseProductionOperation(orderId,index){
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;
  const op=productionOp(o,index);if(!op||op.status!=='running'||!myWorkSession(o,index))return;
  endWorkSession(o,index,'manual_pause');
  syncOpRunningState(o,op,productionNow()); // «на паузе» — только если больше никто не работает
  await persistProductionWorkflow(o,`${tRu('historyProductionPaused')}: ${op.stepName}`,'production_operation_paused',{step:op.stepName});
}
async function toggleProductionOperation(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(op&&myWorkSession(o,index))return pauseProductionOperation(orderId,index);return startProductionOperation(orderId,index)}
function completeProductionOperation(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op||op.status==='done')return;if(typeof hasSubOps==='function'&&hasSubOps(o,index))return openSubOpMarkModal(orderId,index);const remaining=orderProductQty(o)-productionCompletedQty(o,op);openModal(t('prodComplete'),`<div class="production-quantity-modal"><p>${escapeHtml(t('prodEnterCompletedQty'))}</p><input class="input" id="productionCompletedQty" type="number" min="1" max="${remaining}" step="1" value="${remaining}"><small>${escapeHtml(t('prodRemainingQty'))}: ${remaining}</small><div class="hint">${escapeHtml(t('partialCompleteHintPrefix'))} ${remaining} ${escapeHtml(t('unitsGenitive'))}.</div></div>`,`<button class="btn" type="button" onclick="closeModal()">${escapeHtml(t('cancel'))}</button><button class="btn primary" type="button" onclick="confirmProductionQuantity('${o.id}',${op.stepIndex})">${escapeHtml(t('confirm'))}</button>`);setTimeout(()=>document.getElementById('productionCompletedQty')?.select(),0)}
function confirmProductionQuantity(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op||op.status==='done')return;const input=document.getElementById('productionCompletedQty'),remaining=orderProductQty(o)-productionCompletedQty(o,op),qty=Math.trunc(Number(input?.value||0));if(!Number.isFinite(qty)||qty<1||qty>remaining){toast(t('prodInvalidQty'));return}const plan=productionConsumptionPlan(o,op,qty);const foot=plan.ok?`<button class="btn" type="button" onclick="closeModal()">${escapeHtml(t('cancel'))}</button><button class="btn primary" type="button" onclick="finalizeProductionQuantity('${o.id}',${op.stepIndex},${qty})">${escapeHtml(t('confirm'))}</button>`:`<button class="btn primary" type="button" onclick="completeProductionOperation('${o.id}',${op.stepIndex})">${escapeHtml(t('changeQuantity'))}</button>`;openModal(t('confirmWriteOffTitle'),productionConsumptionPreviewHtml(plan),foot)}
// v7.86: "Рабочая сессия не начата" — вместо того чтобы молча писать выпуск без учёта времени (или
// молча создавать мгновенную нулевую сессию), явно спрашиваем сотрудника, как поступить. Показывается
// из finalizeProductionQuantity(), когда операция не в статусе "running" (значит, открытой рабочей
// сессии нет) — то есть одинаково и для главной кнопки "Записать выпуск", и для чипов +1/+5/+10/+20,
// и в рабочем режиме — это единая точка входа для записи выпуска.
function openWorkSessionMissingModal(orderId,index,qty){
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;
  const op=productionOp(o,index);if(!op)return;
  const body=`<p>${escapeHtml(t('sessionMissingText'))}</p>`;
  // Порядок кнопок — как в макете пользователя (записать без времени → начать смену → отмена),
  // а не обычный для сайта "отмена слева, основное действие справа" — здесь это осознанное решение.
  const foot=`<button class="btn primary" type="button" onclick="recordWithoutSession('${o.id}',${index},${qty})">${escapeHtml(t('recordWithoutTimeBtn'))}</button><button class="btn" type="button" onclick="startSessionThenRecord('${o.id}',${index},${qty})">${escapeHtml(t('startShiftBtn'))}</button><button class="btn" type="button" onclick="closeModal()">${escapeHtml(t('cancel'))}</button>`;
  openModal(t('sessionMissingTitle'),body,foot);
}
async function recordWithoutSession(orderId,index,qty){
  closeModal();
  await finalizeProductionQuantity(orderId,index,qty,{skipSessionPrompt:true});
}
async function startSessionThenRecord(orderId,index,qty){
  closeModal();
  await startProductionOperation(orderId,index,{skipSubChoice:true});
  await finalizeProductionQuantity(orderId,index,qty,{skipSessionPrompt:true});
}
async function finalizeProductionQuantity(orderId,index,qty,options={}){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op||op.status==='done')return;if(!options.kit&&typeof hasSubOps==='function'&&hasSubOps(o,index))return recordSubOpMark(orderId,index,qty,options);const remaining=orderProductQty(o)-productionCompletedQty(o,op);qty=Math.trunc(Number(qty||0));if(!Number.isFinite(qty)||qty<1||qty>remaining){toast(t('prodInvalidQty'));return}
// v7.86: запись выпуска без активной рабочей сессии (никто не нажимал "Начать смену") раньше молча
// проходила и портила статистику времени (0-минутные/фиктивные сессии). Теперь сначала явно
// спрашиваем — записать без учёта времени или сначала начать смену — а не решаем это за сотрудника.
// options.skipSessionPrompt=true — это уже ответ пользователя (см. openWorkSessionMissingModal ниже),
// повторный вопрос не нужен.
if(!options.skipSessionPrompt&&!myWorkSession(o,index)){openWorkSessionMissingModal(orderId,index,qty);return}
const plan=productionConsumptionPlan(o,op,qty);if(!plan.ok){openModal(t('insufficientMaterialTitle'),productionConsumptionPreviewHtml(plan),`<button class="btn primary" type="button" onclick="completeProductionOperation('${o.id}',${op.stepIndex})">${escapeHtml(t('changeQuantity'))}</button>`);return}const now=productionNow();if(!op.startedAt)op.startedAt=now;
// v8.09: время отметки — от старта МОЕЙ сессии или от моей предыдущей отметки (что позже): работа продолжается,
// пока я сам не нажму «Пауза»/«Готово». Запись «без учёта времени» (сессии нет) — 0 минут.
const mine=myWorkSession(o,index),sinceIso=mine?((mine.lastMarkAt&&mine.lastMarkAt>mine.startedAt)?mine.lastMarkAt:mine.startedAt):now;const sessionStartedAt=sinceIso,sessionMinutes=mine?Math.max(0,productionMinutesBetween(sinceIso,now)):0,sessionId=uid();if(mine)mine.lastMarkAt=now;if(!Array.isArray(op.sessions))op.sessions=[];op.sessions.unshift({id:sessionId,startedAt:sessionStartedAt,endedAt:now,minutes:sessionMinutes,qty,by:productionActorName(),byEmail:currentUser?.email||'',...(options.kit?{kit:true}:{})});const log=applyProductionConsumptionPlan(o,op,plan,sessionId);op.sessions[0].consumptionId=log.id;op.completedQty=productionCompletedQty(o,op)+qty;op.actualMinutes=Math.max(0,Number(op.actualMinutes||0)+sessionMinutes);const fullyDone=op.completedQty>=orderProductQty(o);
// v7.84: запись выпуска — тоже точка, где активная рабочая сессия (см. workSessions) заканчивается:
// либо операция полностью выполнена (order_completed), либо это осознанная пауза после того, как
// часть партии записали (ближе всего по смыслу к manual_pause — отдельной причины "записан частичный
// выпуск" в списке нет, а это тоже добровольное действие сотрудника, а не что-то автоматическое).
// v8.09: отметка выпуска больше НЕ останавливает работу (раньше — пауза для всех): сессия закрывается только
// когда операция выполнена целиком (у всех), иначе человек продолжает работать до своей «Паузы»/«Готово».
if(fullyDone){endWorkSession(o,index,'order_completed',{endedAt:now,all:true});op.status='done';op.pausedAt='';op.finishedAt=now;op.currentSessionStartedAt='';op.currentSessionPauseMinutes=0;}
else{op.finishedAt='';if(openWorkSessions(o,index).length){op.status='running';op.pausedAt='';}else{op.status='paused';op.pausedAt=now;op.currentSessionStartedAt='';op.currentSessionPauseMinutes=0;}}
op.collapsed=fullyDone;productionMeta(o).logs.unshift({id:uid(),stepIndex:Number(index),stepName:op.stepName,qty,minutes:sessionMinutes,at:now,by:productionActorName(),source:fullyDone?'workflow-complete':'workflow-partial',consumptionId:log.id});if(fullyDone&&productionDoneCount(o)===productionOps(o).length)o.status='Готов';closeModal();const message=`${op.stepName}: ${tRu('completedMsgDone')} ${qty} ${tRu('unitsGenitive')}, ${tRu('materialsAutoWrittenOff')} (${log.materials.length} ${tRu('positionsWord')})`;await persistProductionWorkflow(o,message,fullyDone?'production_operation_completed':'production_operation_partial',{step:op.stepName,qty,minutes:sessionMinutes,completedQty:op.completedQty,totalQty:orderProductQty(o),fullyDone,consumptionId:log.id,materials:log.materials})}
// v7.51: раньше подтверждение отмены списания шло через системное window.confirm() — единственное
// место во всём сайте, где так сделано (везде рядом используется своё модальное окно). В части
// мобильных/встроенных браузеров confirm() может не показываться и молча возвращать «отмена» —
// нажатие тогда выглядит так, будто вообще ничего не произошло. Функция общая для админской кнопки
// «Исправить списание» (полный вид цеха) и рабочей «Исправить последнее» (упрощённый режим) —
// правим один раз, работает в обоих местах.
// v7.52: вместо жёсткого «всё или ничего» — можно указать, сколько было выполнено НА САМОМ ДЕЛЕ.
// v7.53: по просьбе пользователя — (1) можно не только уменьшать, но и увеличивать (спишутся
// дополнительные материалы, если хватает на складе; 0 по-прежнему равносильно полной отмене);
// (2) исправить можно не только последнюю смену, а любую из списка «Выполнено по сменам» — у
// каждой своя кнопка «Редактировать» (см. productionSessionHistoryHtml()); (3) у смены остаётся
// след правки — кто и когда исправил/отменил, виден прямо в списке смен.
function resolveConsumptionLog(o,stepIndex,consumptionId){
  const logs=productionMeta(o).consumptionLogs||[];
  if(consumptionId)return logs.find(l=>String(l.id)===String(consumptionId)&&!l.undone)||null;
  return logs.find(l=>!l.undone&&Number(l.stepIndex)===Number(stepIndex))||null;
}
function undoLastProductionConsumption(orderId,index){openFixQuantityModal(orderId,index,'')}
function openFixQuantityModal(orderId,index,consumptionId=''){
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;
  const op=productionOp(o,index);if(!op)return;
  const log=resolveConsumptionLog(o,index,consumptionId);
  if(!log){toast(t('noWriteOffsToUndo'));return}
  if(!canEditMark(o,op,log.id)){toast(t('roleNotYourMark'));return}
  const oldQty=Number(log.qty||0),maxPossible=Math.max(oldQty,orderProductQty(o)-productionCompletedQty(o,op)+oldQty);
  const body=`<div class="production-quantity-modal"><p>${escapeHtml(t('fixLastQtyHint'))}: <b>${oldQty} ${escapeHtml(t('unitsGenitive'))}</b> · ${escapeHtml(t('operationWord'))} ${escapeHtml(op.stepName)}</p><div class="field"><label>${escapeHtml(t('fixLastQtyLabel'))}</label><input class="input" id="fixQtyInput" type="number" min="0" max="${maxPossible}" step="1" value="${oldQty}" inputmode="numeric"></div><small class="hint">${escapeHtml(t('fixLastQtyNote'))}</small></div>`;
  openModal(t('fixLastQtyTitle'),body,`<button class="btn" type="button" onclick="closeModal()">${escapeHtml(t('cancel'))}</button><button class="btn primary" type="button" onclick="applyFixQuantity('${orderId}',${index},'${log.id}')">${escapeHtml(t('save'))}</button>`);
  setTimeout(()=>document.getElementById('fixQtyInput')?.select(),0);
}
async function applyFixQuantity(orderId,index,consumptionId){
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;
  const op=productionOp(o,index);if(!op)return;
  const log=resolveConsumptionLog(o,index,consumptionId);
  if(!log){toast(t('noWriteOffsToUndo'));return}
  if(!canEditMark(o,op,log.id)){toast(t('roleNotYourMark'));return}
  const oldQty=Number(log.qty||0),maxPossible=Math.max(oldQty,orderProductQty(o)-productionCompletedQty(o,op)+oldQty);
  const input=document.getElementById('fixQtyInput');
  const newQty=Math.trunc(Number(input?.value));
  if(!Number.isFinite(newQty)||newQty<0||newQty>maxPossible){toast(t('prodInvalidQty'));return}
  if(newQty===oldQty){closeModal();return}
  if(newQty<oldQty){closeModal();await performQuantityDecrease(orderId,index,consumptionId,newQty);return}
  const delta=newQty-oldQty,plan=productionConsumptionPlan(o,op,delta);
  if(!plan.ok){openModal(t('insufficientMaterialTitle'),productionConsumptionPreviewHtml(plan),`<button class="btn primary" type="button" onclick="openFixQuantityModal('${orderId}',${index},'${consumptionId}')">${escapeHtml(t('changeQuantity'))}</button>`);return}
  closeModal();
  await performQuantityIncrease(orderId,index,consumptionId,newQty,plan);
}
async function performQuantityDecrease(orderId,index,consumptionId,newQty){
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;
  const op=productionOp(o,index);if(!op)return;
  const log=resolveConsumptionLog(o,index,consumptionId);if(!log)return;
  if(!canEditMark(o,op,log.id)){toast(t('roleNotYourMark'));return}
  const oldQty=Number(log.qty||0),delta=oldQty-newQty;
  if(delta<=0)return;
  const cancelled=newQty<=0,ratio=delta/oldQty,now=productionNow(),who=productionActorName(),returnedRows=[];
  (log.materials||[]).forEach(row=>{
    const returnQty=cancelled?Number(row.qty||0):Number((Number(row.qty||0)*ratio).toFixed(6));
    const m=(data.materials||[]).find(x=>String(x.id)===String(row.materialId));
    const items=orderMaterials(o);
    const item=items[Number(row.lineIndex)]&&String(items[Number(row.lineIndex)].materialId)===String(row.materialId)?items[Number(row.lineIndex)]:items.find(i=>String(i.materialId)===String(row.materialId)&&materialWorkshopForItem(i,m)===String(log.stepName||''));
    if(m){const unit=m.unit||row.materialUnit||row.unit;const __q0=Number(m.quantity||0);m.quantity=stockNumForUnit(Number(m.quantity||0)+convertMaterialQty(returnQty,row.unit,unit,m),unit);noteStockDelta(m,Number(m.quantity)-__q0);m.lastUpdated=today();m.attributes=m.attributes||{};m.attributes.stockChangedBy=who;m.attributes.stockChangedByEmail=currentUser?.email||'';m.attributes.stockChangedAt=now;}
    if(item){item.consumedQty=stockNumForUnit(Math.max(0,orderItemConsumedQty(item)-returnQty),item.unit||row.unit);item.consumedForQty=Math.max(0,orderItemConsumedForQty(item)-delta);item.consumptionStatus=orderItemConsumptionStatus(item,o);if(cancelled&&Array.isArray(item.consumptionLogs))item.consumptionLogs=item.consumptionLogs.map(x=>String(x.id)===String(log.id)?{...x,undone:true,undoneAt:now,undoneBy:who}:x);}
    row.qty=Number((Number(row.qty||0)-returnQty).toFixed(6));
    returnedRows.push({...row,qty:returnQty});
  });
  if(cancelled){
    log.undone=true;log.undoneAt=now;log.undoneBy=who;
    op.actualMinutes=Math.max(0,Number(op.actualMinutes||0)-Number((op.sessions||[]).find(s=>String(s.consumptionId)===String(log.id))?.minutes||0));
  }else log.qty=newQty;
  op.completedQty=Math.max(0,productionCompletedQty(o,op)-delta);
  // v7.53: правку/отмену прошлой смены не считаем «остановкой» текущей работы — если сейчас
  // реально идёт (running) или на паузе новая сессия, её статус не трогаем, меняем только когда
  // операция была полностью завершена (done) и перестала быть такой, или когда выполненных не
  // осталось совсем.
  if(op.status==='done'&&op.completedQty<orderProductQty(o)){op.status='paused';op.finishedAt='';op.collapsed=false;if(o.status==='Готов')o.status='В работе';}
  if(op.completedQty<=0)op.status='not_started';
  op.sessions=(op.sessions||[]).map(s=>String(s.consumptionId)===String(log.id)?(cancelled?{...s,undone:true,undoneBy:who,undoneAt:now,edits:sessionEditsList(s)}:{...s,qty:newQty,originalQty:s.originalQty??s.qty,editedBy:who,editedAt:now,edits:[...sessionEditsList(s),{from:oldQty,to:newQty,by:who,at:now}]}):s);
  const key=cancelled?'production_material_undo':'production_material_fix',label=cancelled?tRu('undoneLastWriteOff'):tRu('fixedLastWriteOff');
  productionMeta(o).logs.unshift({id:uid(),stepIndex:Number(index),stepName:op.stepName,qty:-delta,minutes:0,at:now,by:who,source:cancelled?'consumption-undo':'consumption-fix',consumptionId:log.id});
  try{if(typeof auditAdd==='function')auditAdd(key,'order',o.id,o.number,`${label}: ${op.stepName}, ${oldQty} → ${newQty} ${tRu('unitsGenitive')} (${who})`,{orderId:o.id,orderNumber:o.number,step:op.stepName,oldQty,newQty,by:who});}catch(e){}
  returnedRows.forEach(row=>{try{if(typeof auditAdd==='function')auditAdd(key,'material',row.materialId,row.materialTitle,`${tRu(cancelled?'writeOffCancelledForOrder':'writeOffCorrectedForOrder')} ${o.number}: ${op.stepName}, ${tRu('returnedWord')} ${qtyWithUnit(row.qty,row.unit)} (${who})`,{orderId:o.id,orderNumber:o.number,step:op.stepName,qty:row.qty,unit:row.unit,by:who});}catch(e){}});
  await persistProductionWorkflow(o,`${label}: ${op.stepName}, ${oldQty} → ${newQty} ${tRu('unitsGenitive')} (${who})`,key,{step:op.stepName,oldQty,newQty,consumptionId:log.id,by:who});
  toast(t(cancelled?'undoneLastWriteOff':'fixedLastWriteOff'));
}
async function performQuantityIncrease(orderId,index,consumptionId,newQty,plan){
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;
  const op=productionOp(o,index);if(!op)return;
  const log=resolveConsumptionLog(o,index,consumptionId);if(!log)return;
  if(!canEditMark(o,op,log.id)){toast(t('roleNotYourMark'));return}
  const oldQty=Number(log.qty||0),now=productionNow(),who=productionActorName();
  if(!Array.isArray(log.materials))log.materials=[];
  plan.rows.forEach(r=>{
    {const __q0=Number(r.m.quantity||0);r.m.quantity=stockNumForUnit(Math.max(0,r.materialStockAfter),r.materialUnit);noteStockDelta(r.m,Number(r.m.quantity)-__q0)} // v8.22: в базу уйдёт изменение, а не готовое число
    r.m.lastUpdated=today();r.m.attributes=r.m.attributes||{};r.m.attributes.stockChangedBy=who;r.m.attributes.stockChangedByEmail=currentUser?.email||'';r.m.attributes.stockChangedAt=now;
    r.item.consumedForQty=Math.max(orderItemConsumedForQty(r.item),r.targetFor);
    r.item.consumedQty=stockNumForUnit(orderItemConsumedQty(r.item)+r.qty,r.unit);
    r.item.consumptionStatus=orderItemConsumptionStatus(r.item,o);
    if(!Array.isArray(r.item.consumptionLogs))r.item.consumptionLogs=[];
    r.item.consumptionLogs.unshift({id:log.id,at:now,stepName:op.stepName,qty:r.qty,unit:r.unit,forQty:r.deltaProducts,by:who});
    const existing=log.materials.find(x=>String(x.materialId)===String(r.m.id)&&Number(x.lineIndex)===Number(r.lineIndex));
    if(existing){existing.qty=Number((Number(existing.qty||0)+r.qty).toFixed(6));existing.materialQty=Number((Number(existing.materialQty||0)+r.materialQty).toFixed(6));existing.stockAfter=r.materialStockAfter;}
    else log.materials.push({materialId:r.m.id,lineIndex:r.lineIndex,materialTitle:materialTitle(r.m),sku:r.m.sku||'',qty:r.qty,unit:r.unit,per:r.per,forQty:r.deltaProducts,materialQty:r.materialQty,materialUnit:r.materialUnit,stockBefore:r.materialStockBefore,stockAfter:r.materialStockAfter});
  });
  log.qty=newQty;
  op.completedQty=productionCompletedQty(o,op)+(newQty-oldQty);
  const fullyDone=op.completedQty>=orderProductQty(o);
  if(fullyDone){op.status='done';op.pausedAt='';op.finishedAt=now;op.collapsed=true;if(productionDoneCount(o)===productionOps(o).length)o.status='Готов';}
  else if(op.status==='not_started')op.status='paused';
  op.sessions=(op.sessions||[]).map(s=>String(s.consumptionId)===String(log.id)?{...s,qty:newQty,originalQty:s.originalQty??oldQty,editedBy:who,editedAt:now,edits:[...sessionEditsList(s),{from:oldQty,to:newQty,by:who,at:now}]}:s);
  try{if(typeof auditAdd==='function')auditAdd('production_material_fix','order',o.id,o.number,`${tRu('fixedLastWriteOff')}: ${op.stepName}, ${oldQty} → ${newQty} ${tRu('unitsGenitive')} (${who})`,{orderId:o.id,orderNumber:o.number,step:op.stepName,oldQty,newQty,by:who});}catch(e){}
  plan.rows.forEach(r=>{try{if(typeof auditAdd==='function')auditAdd('production_material_fix','material',r.m.id,materialTitle(r.m),`${tRu('writeOffCorrectedForOrder')} ${o.number}: ${op.stepName}, дополнительно списано ${qtyWithUnit(r.qty,r.unit)} (${who})`,{orderId:o.id,orderNumber:o.number,step:op.stepName,qty:r.qty,unit:r.unit,by:who});}catch(e){}});
  await persistProductionWorkflow(o,`${tRu('fixedLastWriteOff')}: ${op.stepName}, ${oldQty} → ${newQty} ${tRu('unitsGenitive')} (${who})`,'production_material_fix',{step:op.stepName,oldQty,newQty,consumptionId:log.id,by:who});
  toast(t('fixedLastWriteOff'));
}
async function saveProductionComment(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op)return;const text=document.getElementById(`prodComment_${orderId}_${index}`)?.value.trim()||'';op.comment=text;if(text){if(!Array.isArray(op.comments))op.comments=[];op.comments.unshift({id:uid(),by:productionActorName(),at:productionNow(),text});}await persistProductionWorkflow(o,`${tRu('historyProductionComment')}: ${op.stepName}`,'production_comment',{step:op.stepName,comment:text})}
function toggleProductionOperationCompact(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op)return;op.collapsed=!op.collapsed;save();refreshOrderWorkflow(orderId)}
async function transferOrderToCompletion(orderId){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;if(productionDoneCount(o)!==productionOps(o).length){toast(t('productionNotFinished'));return}orderWorkflowSelection.set(String(orderId),3);o.status='Готов';await persistProductionWorkflow(o,tRu('historyTransferredCompletion'),'production_to_completion',{})}
const COMPLETION_CHECKS=['master','technologist','quality','warehouse','client'];
const COMPLETION_DELAY_REASONS=['no_material','equipment','client_wait','rework','other'];
function completionActualMinutes(o){return productionOps(o).reduce((s,op)=>s+productionActualMinutes(op,o),0)}
function completionDiffMinutes(o){return completionActualMinutes(o)-calcOrderMinutes(o)}
function completionChecklistLabel(key){return t({master:'completionCheckMaster',technologist:'completionCheckTechnologist',quality:'completionCheckQuality',warehouse:'completionCheckWarehouse',client:'completionCheckClient'}[key]||key)}
function completionReasonLabel(key){return t({no_material:'delayNoMaterial',equipment:'delayEquipment',client_wait:'delayClientWait',rework:'delayRework',other:'delayOther'}[key]||'delayOther')}
function completionTimelineRows(o){
  const rows=[];
  rows.push({tone:'done',text:t('timelineOrderCreated')});
  if(hasOrderTechnology(o.steps))rows.push({tone:'done',text:t('timelineTechnologyDone')});
  if(productionOps(o).some(op=>op.startedAt))rows.push({tone:'done',text:t('timelineProductionStarted')});
  if(productionDoneCount(o)===productionOps(o).length&&productionOps(o).length)rows.push({tone:'done',text:t('timelineProductionFinished')});
  const c=orderCompletionData(o),labels={master:'timelineMasterChecked',technologist:'timelineTechnologistChecked',quality:'timelineQualityChecked',warehouse:'timelineWarehouseSent',client:'timelineClientSent'};
  COMPLETION_CHECKS.forEach(key=>{if(c.checklist[key])rows.push({tone:'done',text:t(labels[key])})});
  if(c.closedAt)rows.push({tone:'complete',text:t('timelineOrderClosed')});
  const auditRows=typeof auditFor==='function'?auditFor('order',o.id).filter(r=>String(r.type||'').includes('completion')).slice(0,5):[];
  return {rows,auditRows};
}
function completionTimelineHtml(o){
  const {rows,auditRows}=completionTimelineRows(o);
  return `<section class="completion-card completion-timeline"><h4>${escapeHtml(t('productionTimeline'))}</h4><div class="production-timeline-list">${rows.map(r=>`<div class="${r.tone}"><i></i><span>${escapeHtml(r.text)}</span></div>`).join('')}${auditRows.map(r=>`<div class="history"><i></i><span>${escapeHtml(r.text||'')}</span><small>${escapeHtml(typeof auditTime==='function'?auditTime(r.at):'')}</small></div>`).join('')}</div></section>`;
}
function completionKpiHtml(o){
  const plan=calcOrderMinutes(o),actual=completionActualMinutes(o),diff=actual-plan,ops=productionOps(o),done=productionDoneCount(o),materials=orderMaterials(o).length;
  const cards=[['📦',t('orderProductCount'),orderProductQty(o)],['🧱',t('materialsUsed'),materials],['⏱',t('plannedTime'),orderTimeText(plan)],['⏱',t('actualTime'),orderTimeText(actual)],['↕',t('difference'),orderTimeTextSigned(diff)],['✔',t('completedOperations'),`${done} / ${ops.length}`]];
  return `<div class="completion-kpi-grid">${cards.map(([icon,label,value])=>`<div class="completion-kpi"><span>${icon}</span><small>${escapeHtml(label)}</small><b class="${label===t('difference')&&diff>0?'danger-text':''}">${escapeHtml(value)}</b></div>`).join('')}</div>`;
}
function completionChecklistHtml(o){
  const c=orderCompletionData(o),closed=orderCompletionClosed(o);
  return `<section class="completion-card"><div class="completion-card-head"><h4>${escapeHtml(t('finalChecklist'))}</h4><span>${COMPLETION_CHECKS.filter(k=>c.checklist[k]).length} / ${COMPLETION_CHECKS.length}</span></div><div class="completion-checklist">${COMPLETION_CHECKS.map(key=>{const item=c.checklist[key]||null;return `<label class="${item?'checked':''}"><input type="checkbox" ${item?'checked':''} ${closed?'disabled':''} onchange="toggleCompletionCheck('${o.id}','${key}',this.checked)"><span>${escapeHtml(completionChecklistLabel(key))}</span>${item?`<small>${escapeHtml(item.by||'—')} · ${escapeHtml(productionDateTimeText(item.at))}</small>`:''}</label>`}).join('')}</div></section>`;
}
function completionCommentHtml(o){
  const c=orderCompletionData(o),closed=orderCompletionClosed(o);
  return `<section class="completion-card"><h4>${escapeHtml(t('finalComment'))}</h4><div class="completion-comment-box"><textarea class="input" id="completionComment_${o.id}" ${closed?'disabled':''} placeholder="${escapeHtml(t('finalCommentPlaceholder'))}">${escapeHtml(c.comment||'')}</textarea><button class="btn small" type="button" onclick="saveCompletionComment('${o.id}')" ${closed?'disabled':''}>${escapeHtml(t('save'))}</button></div><div class="completion-comments">${c.comments.slice(0,4).map(row=>`<div><b>${escapeHtml(row.by||'—')}</b><span>${escapeHtml(productionDateTimeText(row.at))}</span><p>${escapeHtml(row.text||'')}</p></div>`).join('')||`<em>${escapeHtml(t('noFinalComments'))}</em>`}</div></section>`;
}
function completionDelayReasonHtml(o){
  const diff=completionDiffMinutes(o),c=orderCompletionData(o),closed=orderCompletionClosed(o);
  if(diff<=0)return '';
  return `<section class="completion-card delay"><h4>${escapeHtml(t('delayReason'))}</h4><p>${escapeHtml(t('delayReasonHint'))}: <b>+${escapeHtml(orderTimeText(diff))}</b></p><select class="select" id="completionDelay_${o.id}" onchange="saveCompletionDelayReason('${o.id}',this.value)" ${closed?'disabled':''}><option value="">${escapeHtml(t('notSpecified'))}</option>${COMPLETION_DELAY_REASONS.map(key=>`<option value="${key}" ${c.delayReason===key?'selected':''}>${escapeHtml(completionReasonLabel(key))}</option>`).join('')}</select></section>`;
}
function completionAnalyticsHtml(o){
  const ops=productionOps(o),longest=ops.slice().sort((a,b)=>productionActualMinutes(b,o)-productionActualMinutes(a,o))[0],diff=completionDiffMinutes(o),c=orderCompletionData(o),result=orderCompletionClosed(o)?t('resultClosed'):productionDoneCount(o)===ops.length?t('resultReadyToClose'):t('resultInProgress');
  return `<section class="completion-card completion-analytics"><h4>${escapeHtml(t('completionAnalytics'))}</h4><div><span>${escapeHtml(t('longestStage'))}</span><b>${escapeHtml(longest?.stepName||'—')}</b></div><div><span>${escapeHtml(t('delayWhere'))}</span><b>${escapeHtml(diff>0?(c.delayReason?completionReasonLabel(c.delayReason):t('notSpecified')):t('noDelay'))}</b></div><div><span>${escapeHtml(t('timeEconomyOverrun'))}</span><b class="${diff>0?'danger-text':'ok-text'}">${escapeHtml(orderTimeTextSigned(diff))}</b></div><div><span>${escapeHtml(t('overallResult'))}</span><b>${escapeHtml(result)}</b></div></section>`;
}
function completionPassportHtml(o){
  const plan=calcOrderMinutes(o),actual=completionActualMinutes(o),diff=actual-plan,c=orderCompletionData(o),ops=productionOps(o),timeline=completionTimelineRows(o).rows;
  const tech=orderSteps(o).map(s=>`<div><span>${escapeHtml(s.name||'—')}</span><b>${Number(s.minutes||0)} ${escapeHtml(t('minutesShort'))}</b></div>`).join('');
  const mats=orderMaterials(o).map(i=>{const st=orderMaterialLineState(i,o.id),m=st.av.mat,unit=st.av.unit||i.unit||'';return `<div><span>${escapeHtml(m?materialTitle(m):t('deletedMaterialWord'))}</span><b>${escapeHtml(qtyWithUnit(i.qty,unit))}</b></div>`}).join('')||`<em>${escapeHtml(t('noTechnologyMaterials'))}</em>`;
  const people=[...new Set(ops.map(op=>op.responsible).concat([o.meta?.createdBy,o.meta?.technologyBy,o.updatedBy]).filter(Boolean))].join(', ')||'—';
  return `<div class="passport-modal"><section><h4>${escapeHtml(t('passportBasic'))}</h4><div class="passport-grid"><div><small>${escapeHtml(t('orderNumberLabel'))}</small><b>${escapeHtml(o.number||'—')}</b></div><div><small>${escapeHtml(u42('orderClient'))}</small><b>${escapeHtml(o.client||'—')}</b></div><div><small>${escapeHtml(t('orderProductCount'))}</small><b>${orderProductQty(o)}</b></div><div><small>${escapeHtml(t('orderCurrentStatus'))}</small><b>${escapeHtml(calcOrderAutoStatus(o))}</b></div></div></section><section><h4>${escapeHtml(t('passportTechnology'))}</h4><div class="passport-lines">${tech}</div></section><section><h4>${escapeHtml(t('passportMaterials'))}</h4><div class="passport-lines">${mats}</div></section><section><h4>${escapeHtml(t('passportExecutors'))}</h4><p>${escapeHtml(people)}</p></section><section><h4>${escapeHtml(t('passportPlanFact'))}</h4><div class="passport-grid"><div><small>${escapeHtml(t('plannedTime'))}</small><b>${escapeHtml(orderTimeText(plan))}</b></div><div><small>${escapeHtml(t('actualTime'))}</small><b>${escapeHtml(orderTimeText(actual))}</b></div><div><small>${escapeHtml(t('difference'))}</small><b class="${diff>0?'danger-text':'ok-text'}">${escapeHtml(orderTimeTextSigned(diff))}</b></div></div></section><section><h4>${escapeHtml(t('finalComment'))}</h4><p>${escapeHtml(c.comment||'—')}</p></section><section><h4>${escapeHtml(t('productionTimeline'))}</h4><div class="passport-timeline">${timeline.map(r=>`<div><i></i><span>${escapeHtml(r.text)}</span></div>`).join('')}</div></section></div>`;
}
function openOrderPassport(orderId){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;openModal(`${t('orderPassport')} · ${o.number||''}`,completionPassportHtml(o),`<button class="btn primary" onclick="closeModal()">${u42('close')}</button>`);setCleanModalClass('order-clean-modal passport-order-modal')}
function orderCompletionHtml(o){
  orderCompletionData(o);const closed=orderCompletionClosed(o),done=productionDoneCount(o),ops=productionOps(o).length;
  return `<div class="completion-screen ${closed?'closed':''}">${completionKpiHtml(o)}${closed?`<div class="completion-locked">✓ ${escapeHtml(t('orderClosedReadOnly'))}</div>`:''}<div class="completion-layout"><div class="completion-main">${completionChecklistHtml(o)}${completionCommentHtml(o)}${completionDelayReasonHtml(o)}<div class="completion-actions"><button class="btn" type="button" onclick="openOrderPassport('${o.id}')">${escapeHtml(t('orderPassport'))}</button><button class="btn primary" type="button" onclick="closeCompletedOrder('${o.id}')" ${closed||done!==ops?'disabled':''}>${escapeHtml(t('closeOrder'))}</button></div></div><aside class="completion-side">${completionTimelineHtml(o)}${completionAnalyticsHtml(o)}</aside></div></div>`;
}
async function persistCompletion(o,message,type='completion_update',meta={}){
  o.updatedAt=productionNow();o.updatedBy=productionActorName();save();try{if(typeof auditAdd==='function')auditAdd(type,'order',o.id,o.number,message,meta)}catch(e){}
  try{syncMaterialReservations();await persistReservationMaterials()}catch(e){}
  refreshOrderWorkflow(o.id);if(typeof renderOrders==='function')renderOrders();
}
async function toggleCompletionCheck(orderId,key,checked){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o||orderCompletionClosed(o))return;const c=orderCompletionData(o);if(checked)c.checklist[key]={at:productionNow(),by:productionActorName()};else delete c.checklist[key];await persistCompletion(o,completionChecklistLabel(key),`completion_${key}`,{checked})}
async function saveCompletionComment(orderId){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o||orderCompletionClosed(o))return;const c=orderCompletionData(o),text=document.getElementById(`completionComment_${orderId}`)?.value.trim()||'';c.comment=text;if(text)c.comments.unshift({id:uid(),at:productionNow(),by:productionActorName(),text});await persistCompletion(o,t('historyFinalComment'),'completion_comment',{comment:text})}
async function saveCompletionDelayReason(orderId,value){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o||orderCompletionClosed(o))return;const c=orderCompletionData(o);c.delayReason=value;await persistCompletion(o,`${t('delayReason')}: ${value?completionReasonLabel(value):t('notSpecified')}`,'completion_delay',{reason:value})}
async function closeCompletedOrder(orderId){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;if(productionDoneCount(o)!==productionOps(o).length){toast(t('productionNotFinished'));return}const c=orderCompletionData(o);c.closedAt=productionNow();c.closedBy=productionActorName();o.status='Завершён';orderWorkflowSelection.delete(String(orderId));await persistCompletion(o,t('timelineOrderClosed'),'completion_closed',{status:'Завершён'});toast(t('orderClosed'))}
function orderWorkflowContentHtml(o,includeOperational=false){const stage=orderWorkflowStage(o.id);if(stage===0)return orderCreationDataHtml(o,{includeOperational});if(stage===1)return orderTechnologyHtml(o);if(stage===2)return orderProductionWorkflowHtml(o);return orderCompletionHtml(o)}
function refreshOrderWorkflow(id){
  const o=(data.orders||[]).find(x=>String(x.id)===String(id)),root=document.getElementById('orderWorkflowModal');if(!o)return;
  if(root)root.innerHTML=orderWorkflowStepperHtml(o,'modal')+orderWorkflowContentHtml(o,true);else renderOrders();
  // Если открыт раздел "Цеха" — обновляем и его, т.к. карточки операций там управляются теми же действиями.
  const workshopsSection=document.getElementById('workshops');
  if(workshopsSection&&workshopsSection.classList.contains('active')&&typeof renderWorkshops==='function')renderWorkshops();
}
function technologyAuditOnce(o){if(!o||!hasOrderTechnology(o.steps))return;const rows=typeof auditFor==='function'?auditFor('order',o.id):[];if(!rows.some(r=>r.type==='technology_filled'))auditAdd('technology_filled','order',o.id,o.number,tRu('historyTechnologyFilled'))}
async function persistTechnologyOrder(o){save();try{syncMaterialReservations();await persistReservationMaterials()}catch(e){console.error('Technology reservation sync failed',e)}refreshOrderWorkflow(o.id)}
function markTechnologyStarted(o){if(String(o?.status)==='Ожидает технолога'){o.status='Технология в работе';auditAdd('technology_started','order',o.id,o.number,tRu('historyTechnologyStarted'))}}
async function saveTechnologyForLater(id){const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;markTechnologyStarted(o);await maybeSaveOrderTechnologyAsTemplate(o);auditAdd('technology_saved_later','order',o.id,o.number,tRu('historyTechnologySavedLater'));await persistTechnologyOrder(o);closeModal();renderOrders();toast(t('technologySavedLater'))}
async function addTechnologyOperation(id){const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;markTechnologyStarted(o);o.steps=orderSteps(o).map(s=>({...s}));o.steps.push({name:t('newOperation'),minutes:0,responsible:''});auditAdd('technology_operation_added','order',o.id,o.number,tRu('historyOperationAdded'));await persistTechnologyOrder(o)}
async function removeTechnologyOperation(id,index){const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;const steps=orderSteps(o).map(s=>({...s})),removed=steps[index];if(!removed)return;markTechnologyStarted(o);steps.splice(index,1);o.steps=steps;auditAdd('technology_operation_removed','order',o.id,o.number,`${tRu('historyOperationRemoved')}: ${removed.name||tRu('operationStage')}`);await persistTechnologyOrder(o)}
async function updateTechnologyOperation(id,index,field,value){const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;o.steps=orderSteps(o).map(s=>({...s}));const step=o.steps[index];if(!step)return;const before=step[field];step[field]=field==='minutes'?Math.max(0,Math.round(Number(value||0))):String(value||'').trim();if(String(before)===String(step[field]))return;markTechnologyStarted(o);if(field==='minutes')auditAdd('technology_time_changed','order',o.id,o.number,`${tRu('historyTimeChanged')}: ${step.name||tRu('operationStage')} · ${before||0} → ${step.minutes} ${tRu('minutesShort')}`);else auditAdd('technology_operation_changed','order',o.id,o.number,`${tRu('historyOperationChanged')}: ${step.name||tRu('operationStage')}`);technologyAuditOnce(o);await persistTechnologyOrder(o)}
function technologyStockCategories(){return [...new Set((data.materials||[]).map(m=>String(m.category||'').trim()).filter(Boolean))].sort((a,b)=>String(categoryLabel(a)||a).localeCompare(String(categoryLabel(b)||b),currentLang==='lv'?'lv':currentLang==='en'?'en':'ru'))}
function technologyStockMaterialOptions(category='',selected=''){return (data.materials||[]).filter(m=>!category||String(m.category||'')===String(category)).sort((a,b)=>String(materialTitle(a)||'').localeCompare(String(materialTitle(b)||''),currentLang==='lv'?'lv':currentLang==='en'?'en':'ru')).map(m=>`<option value="${m.id}" ${String(m.id)===String(selected)?'selected':''}>${escapeHtml(m.sku||'')} — ${escapeHtml(materialTitle(m))}</option>`).join('')}
function updateTechnologyStockMaterials(category){const select=document.getElementById('technologyStockMaterial');if(!select)return;const options=technologyStockMaterialOptions(category);select.innerHTML=`<option value="">${escapeHtml(t('selectMaterialFromStock'))}</option>${options}`;select.disabled=!options;toggleTechnologyMaterialAdd('')}
function openTechnologyMaterials(id){const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;pushModalState();const categories=technologyStockCategories();const categoryOptions=categories.map(cat=>`<option value="${escapeHtml(cat)}">${escapeHtml(categoryLabel(cat)||cat)}</option>`).join('');const hasMaterials=(data.materials||[]).length>0;const body=hasMaterials?`<div class="form-grid technology-stock-picker"><div class="field"><label>${escapeHtml(currentLang==='ru'?'Категория':currentLang==='en'?'Category':'Kategorija')}</label><select class="select" id="technologyStockCategory" onchange="updateTechnologyStockMaterials(this.value)"><option value="">${escapeHtml(currentLang==='ru'?'Все категории':currentLang==='en'?'All categories':'Visas kategorijas')}</option>${categoryOptions}</select></div><div class="field"><label>${escapeHtml(t('material'))}</label><select class="select" id="technologyStockMaterial" onchange="toggleTechnologyMaterialAdd(this.value)"><option value="">${escapeHtml(t('selectMaterialFromStock'))}</option>${technologyStockMaterialOptions('')}</select></div></div>`:`<div class="order-tech-empty">${escapeHtml(t('noWarehouseMaterials'))}</div>`;openModal(t('addMaterialFromStock'),body,`<button class="btn primary" id="technologyMaterialAddBtn" type="button" onclick="addTechnologyMaterialFromStock('${o.id}')" disabled>${escapeHtml(t('add'))}</button>`)}
function toggleTechnologyMaterialAdd(value){const button=document.getElementById('technologyMaterialAddBtn');if(button)button.disabled=!value}
async function addTechnologyMaterialFromStock(id){const o=(data.orders||[]).find(x=>String(x.id)===String(id)),materialId=document.getElementById('technologyStockMaterial')?.value,m=(data.materials||[]).find(x=>String(x.id)===String(materialId));if(!o||!m)return;if(orderMaterials(o).some(item=>String(item.materialId)===String(m.id))){toast(t('materialAlreadyInOrder'));return}const unit=orderUnitForMaterial(m,m.category||''),workshop=materialDefaultWorkshop(m.category||'',m);o.materials=[...orderMaterials(o),{category:m.category||'',materialId:m.id,workshop,perUnitQty:0,qty:0,unit,purchaseStatus:'none',purchaseQty:0,purchaseNo:''}];markTechnologyStarted(o);auditAdd('technology_material_added','order',o.id,o.number,`${tRu('historyMaterialAddedFromStock')}: ${materialTitle(m)} · ${workshop||'цех авто'}`);await persistTechnologyOrder(o);orderWorkflowSelection.set(String(o.id),1);goBackModal();refreshOrderWorkflow(o.id)}
function openTechnologyNewMaterial(id){window.pendingTechnologyMaterialOrderId=String(id);pushModalState();openAddCategoryModal(false)}
async function attachCreatedTechnologyMaterial(orderId,material){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o||!material)return false;if(!orderMaterials(o).some(item=>String(item.materialId)===String(material.id))){const workshop=materialDefaultWorkshop(material.category||'',material);o.materials=[...orderMaterials(o),{category:material.category||'',materialId:material.id,workshop,perUnitQty:0,qty:0,unit:orderUnitForMaterial(material,material.category||''),purchaseStatus:'none',purchaseQty:0,purchaseNo:''}];}markTechnologyStarted(o);auditAdd('technology_material_created','order',o.id,o.number,`${tRu('historyNewMaterialAdded')}: ${materialTitle(material)}`);await persistTechnologyOrder(o);orderWorkflowSelection.set(String(o.id),1);if(typeof modalStack!=='undefined')modalStack=[];openOrderProduction(o.id);return true}
async function updateTechnologyMaterial(id,index,field,value){const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;const items=orderMaterials(o).map(item=>({...item})),item=items[index];if(!item)return;markTechnologyStarted(o);if(field==='category'){item.category=String(value||'');const first=(data.materials||[]).find(m=>m.category===item.category);item.materialId=first?.id||'';item.unit=orderUnitForMaterial(first,item.category);item.workshop=materialDefaultWorkshop(item.category,first)}else if(field==='materialId'){const m=(data.materials||[]).find(x=>String(x.id)===String(value));item.materialId=value;item.category=m?.category||item.category;item.unit=orderUnitForMaterial(m,item.category);item.workshop=materialDefaultWorkshop(item.category,m)}else if(field==='workshop')item.workshop=String(value||'').trim();else if(field==='unit')item.unit=String(value||orderDefaultUnitForCategory(item.category));else if(field==='perUnitQty')item.perUnitQty=Math.max(0,Number(value||0));const currentMaterial=(data.materials||[]).find(x=>String(x.id)===String(item.materialId));if(!item.workshop)item.workshop=materialDefaultWorkshop(item.category,currentMaterial);if(currentMaterial?.unit==='рулон'&&(item.category==='Ткань'||item.category==='Экокожа')&&item.unit==='рулон')item.unit=orderUnitForMaterial(currentMaterial,item.category);item.qty=calcOrderItemTotalQty(item.perUnitQty,orderProductQty(o),item.unit);o.materials=items;auditAdd('technology_material_changed','order',o.id,o.number,`${tRu('historyTechnologyMaterialChanged')}: ${field}`);await persistTechnologyOrder(o)}
async function markTechnologyMaterialOrdered(id,index){const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;const items=orderMaterials(o).map(item=>({...item})),item=items[index],input=document.getElementById(`technologyOrderQty_${id}_${index}`),qty=Math.max(0,Number(input?.value||0));if(!item||qty<=0){toast(t('enterOrderedQuantity'));return}item.purchaseStatus='ordered';item.purchaseQty=qty;o.materials=items;auditAdd('purchase','order',o.id,o.number,`${tRu('historyMaterialMarkedOrdered')}: ${qtyWithUnit(qty,item.unit||'')}`,{materialId:item.materialId,purchaseQty:qty});await persistTechnologyOrder(o);toast(t('materialMarkedOrdered'))}
async function removeTechnologyMaterial(id,index){const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;const removed=orderMaterials(o)[index];if(!removed)return;const m=(data.materials||[]).find(x=>String(x.id)===String(removed.materialId));o.materials=orderMaterials(o).filter((_,i)=>i!==index);auditAdd('technology_material_removed','order',o.id,o.number,`${tRu('historyMaterialRemoved')}: ${m?materialTitle(m):removed.materialId}`);await persistTechnologyOrder(o)}
async function transferOrderToProduction(id){const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;if(!hasOrderTechnology(o.steps)){toast(t('technologyRequired'));return}await maybeSaveOrderTechnologyAsTemplate(o);technologyAuditOnce(o);const from=o.status;if(typeof setOrderStatusPersisted==='function'){if(!await setOrderStatusPersisted(id,'В производстве')){if(String(o.status)!=='В производстве')return}}else{o.status='В производстве';save()}o.status='В производстве';save();orderWorkflowSelection.set(String(id),2);auditAdd('technology_to_production','order',o.id,o.number,tRu('historyTransferredProduction'),{from,to:'В производстве'});const root=document.getElementById('orderWorkflowModal');if(root){root.innerHTML=orderWorkflowStepperHtml(o,'modal')+orderWorkflowContentHtml(o,true);setCleanModalClass('order-clean-modal');renderOrders()}else refreshOrderStatusUI(id,false);toast(t('transferredProduction'))}
async function saveProductionTechnologyEdit(id){const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;technologyAuditOnce(o);
  // v6.86: журнал истории раньше записывался на языке, который был активен в момент действия
  // (currentLang), из-за чего в истории одного заказа могли соседствовать записи на разных
  // языках. Текст, который остаётся в истории навсегда, теперь всегда пишется по-русски —
  // это не меняет то, как переводится сам интерфейс во время просмотра.
  auditAdd('technology_edit_production','order',o.id,o.number,'Технология отредактирована после передачи в производство');
  orderWorkflowSelection.set(String(id),2);save();const root=document.getElementById('orderWorkflowModal');if(root)root.innerHTML=orderWorkflowStepperHtml(o,'modal')+orderWorkflowContentHtml(o,true);else renderOrders();toast(currentLang==='ru'?'Технология обновлена':currentLang==='en'?'Technology updated':'Tehnoloģija atjaunināta')}
function selectOrderWorkflowStage(event,id,index,context='card'){
  event?.stopPropagation();orderWorkflowSelection.set(String(id),index);
  if(context==='modal'){
    const o=(data.orders||[]).find(x=>String(x.id)===String(id)),root=document.getElementById('orderWorkflowModal');
    if(o&&root)root.innerHTML=orderWorkflowStepperHtml(o,'modal')+orderWorkflowContentHtml(o,true);
  }else renderOrders();
}
function orderExpandedCardHtml(o){return `<div class="order-card-expanded">${orderWorkflowStepperHtml(o,'card')}${orderWorkflowContentHtml(o,true)}${typeof orderInfoHistoryHtml==='function'?orderInfoHistoryHtml(o):''}</div>`}
function orderMissingRow(o){const missing=orderMissingItems(o);if(!missing.length)return '';const pos=currentLang==='ru'?'поз. · к заказу':currentLang==='en'?'items · to order':'poz. · jāpasūta';const click=currentLang==='ru'?'нажмите, чтобы оформить закупку':currentLang==='en'?'click to create purchase':'klikšķiniet, lai noformētu iepirkumu';return `<tr class="order-missing-row"><td colspan="6"><div class="order-missing-panel"><div class="order-missing-head"><b>${u42('missingMaterials')}</b><span>${missing.length} ${pos}</span></div><div class="order-missing-list">${missing.map(({item,state})=>{const m=state.av.mat;const unit=state.av.unit||item.unit||'';const pCls=state.purchaseStatus==='ordered'?'ordered':state.purchaseStatus==='none'?'none':'need';return `<button type="button" class="order-missing-item" onclick="openOrderMaterialPurchase('${o.id}','${item.materialId}')"><div><div class="mi-title">${escapeHtml(m?materialTitle(m):u42('deletedMaterial'))}</div><div class="mi-sub">${escapeHtml(m?.sku||'')} · ${click}</div></div><div><small>${u42('need')}</small><strong>${escapeHtml(qtyWithUnit(item.qty,unit))}</strong></div><div><small>${u42('available')}</small><strong>${escapeHtml(qtyWithUnit(state.av.available,unit))}</strong></div><div class="mi-bad"><small>${u42('toOrder')}</small><strong>${escapeHtml(qtyWithUnit(state.av.missing,unit))}</strong></div><div><span class="purchase-pill ${pCls}">${escapeHtml(orderPurchaseLabel(state.purchaseStatus))}</span></div></button>`}).join('')}</div></div></td></tr>`}

function orderStatusCellHtml(o,auto){
  const displayAuto=auto==='В работе'?'В производстве':auto;
  const text=displayAuto==='Ожидает технолога'?t('statusWaitingTechnologist'):displayAuto==='Технология в работе'?t('statusTechnologyInProgress'):(typeof orderStatusText42==='function'?orderStatusText42(displayAuto):displayAuto);
  if(auto==='Не хватает материалов'){
    return `<button type="button" class="status ${orderStatusClass(auto)} status-action" onclick="toggleOrderMissing(event,'${o.id}')">${escapeHtml(text)} ${missingExpandedOrders.has(o.id)?'⌃':'⌄'}</button>`;
  }
  return `<span class="status ${orderStatusClass(auto)}">${escapeHtml(text)}</span>`;
}
function orderResponsibleCompactHtml(o){
  return '';
}
function orderAdditionalMinutesForCard(o){
  try{
    if(typeof productionOps!=='function'||typeof productionActualMinutes!=='function')return 0;
    const actual=productionOps(o).reduce((sum,op)=>sum+productionActualMinutes(op,o),0);
    return Math.max(0,Math.round(actual-calcOrderMinutes(o)));
  }catch(e){return 0}
}
function orderActionMenu(id){
  const openProduction=currentLang==='ru'?'Открыть производство':currentLang==='en'?'Open production':'Atvērt ražošanu';
  return `<div class="action-menu" id="orderMenu_${id}"><button class="action-menu-btn" type="button" aria-label="${escapeHtml(u42('actions')||'Actions')}" onclick="toggleOrderMenu(event,'${id}')">⋯</button><div class="action-menu-list"><button type="button" onclick="openOrderProduction('${id}')">${escapeHtml(openProduction)}</button><button type="button" onclick="openOrderModal('${id}')">${typeof u42==='function'?u42('edit'):'Редактировать'}</button><button type="button" onclick="completeOrder('${id}')">${typeof u42==='function'?u42('completeOrderAction'):'Завершить заказ'}</button><button type="button" onclick="cancelOrder('${id}')">${typeof u42==='function'?u42('cancelOrderAction'):'Отменить заказ'}</button><button type="button" class="danger" onclick="deleteOrder('${id}')">${typeof u42==='function'?u42('delete'):'Удалить'}</button></div></div>`;
}
function orderRowActions(id){
  return `<div class="order-row-action-buttons"><button class="btn open-btn" type="button" onclick="openOrderView('${id}')">${u42('open')}</button>${orderActionMenu(id)}</div>`;
}
function orderMiniProgressHtml(matPct,prodPct){
  return `<div class="order-card-mini-progress"><div><span>${escapeHtml(u42('materials'))}</span><b>${matPct}%</b></div><i><b style="width:${matPct}%"></b></i><div><span>${escapeHtml(t('orderStageProduction'))}</span><b>${prodPct}%</b></div><i><b style="width:${prodPct}%"></b></i></div>`;
}
function renderOrders(){renderOrderStats();renderOrderClientFilter();const box=document.getElementById('ordersTable')||document.getElementById('ordersGrid');if(!box)return;const rows=filteredOrders();if(!rows.length){box.innerHTML=`<div class="empty"><b>${u42('noOrders')}</b>${u42('noOrdersHint')}</div>`;return}box.innerHTML=`<div class="order-card-list">${rows.map(o=>{const min=calcOrderMinutes(o),extra=orderAdditionalMinutesForCard(o),auto=calcOrderAutoStatus(o),expanded=expandedOrders.has(o.id),matPct=calcOrderMaterialPercent(o),prodPct=orderProductionPercentForCard(o),oq=orderProductQty(o),deadlineClass=orderDeadlineClass({...o,status:auto});return `<article class="order-erp-card ${expanded?'expanded':''}" data-order-id="${escapeHtml(o.id)}"><div class="order-card-summary"><button class="order-expand-btn" type="button" onclick="toggleOrderExpand(event,'${o.id}')" aria-label="${expanded?'Collapse':'Expand'}">${expanded?'▼':'▶'}</button><div class="order-card-number"><b>${escapeHtml(o.number)}${orderProductionMaterialWarningHtml(o)}</b>${o.product?`<em class="order-card-product" title="${escapeHtml(o.product)}">${escapeHtml(o.product)}</em>`:''}<small>${escapeHtml(u42('clientPrefix'))}: ${escapeHtml(o.client||'—')}</small></div><div class="order-card-qty"><b>${oq} ${escapeHtml(u42('items'))}</b></div><div class="order-card-kv order-card-deadline"><small>${u42('deadline')}</small><b class="order-deadline ${deadlineClass}">${escapeHtml(formatDeadline(o))}</b></div><div class="order-card-kv order-card-time"><small>${u42('totalTime')}</small><b>${escapeHtml(orderTimeText(min))}</b>${extra>0?`<span>+${escapeHtml(orderTimeText(extra))}</span>`:''}</div><div class="order-card-state">${orderStatusCellHtml(o,auto)}${orderResponsibleCompactHtml(o)}${orderMiniProgressHtml(matPct,prodPct)}</div><div class="order-card-actions">${orderRowActions(o.id)}</div></div>${expanded?orderExpandedCardHtml(o):''}</article>`}).join('')}</div>`}


function toggleManualOrderNumber(){const cb=document.getElementById('manualOrderNumber'),inp=document.getElementById('orderNumber');if(!inp||!cb)return;inp.disabled=!cb.checked;if(!cb.checked)inp.value=nextOrderNumber()}
function materialOptions(category='',selected=''){return (data.materials||[]).filter(m=>!category||m.category===category).map(m=>`<option value="${m.id}" ${String(m.id)===String(selected)?'selected':''}>${escapeHtml(m.sku||'')} — ${escapeHtml(materialTitle(m))}</option>`).join('')}
function addOrderMaterialRow(){document.getElementById('orderMaterialsBox').insertAdjacentHTML('beforeend',orderMaterialRow());refreshOrderMaterialRows()}
function refreshOneOrderMaterialRow(sel){const row=sel.closest('.order-material-row');const matSel=row.querySelector('.om-material');matSel.innerHTML=materialOptions(sel.value,'');refreshOrderMaterialRows()}
function rebuildOrderMaterialOptions(){document.querySelectorAll('.order-material-row').forEach(row=>{const cat=row.querySelector('.om-cat')?.value||'';const sel=row.querySelector('.om-material');if(!sel)return;const selected=sel.value;sel.innerHTML=materialOptions(cat,selected);});}
async function saveOrderLegacy(id=''){
  const steps=[...document.querySelectorAll('.order-step-row')].map(r=>({name:r.querySelector('.step-name').value.trim()||'Этап',minutes:Math.max(0,Math.round(Number(r.querySelector('.step-min').value||0)))}));
  const productQty=orderProductQty({productQty:document.getElementById('orderProductQty')?.value||1});
  const materials=[...document.querySelectorAll('.order-material-row')].map(r=>{const mat=data.materials.find(m=>String(m.id)===String(r.querySelector('.om-material')?.value));if(!mat)return null;const perUnitQty=stockNumForUnit(r.querySelector('.om-per-unit')?.value||0,mat.unit||'м²');const qty=stockNumForUnit(perUnitQty*productQty,mat.unit||'м²');return {category:r.querySelector('.om-cat')?.value||mat.category||'',materialId:mat.id||'',perUnitQty,qty,unit:mat.unit||'',purchaseStatus:'none',purchaseQty:0,purchaseNo:''}}).filter(i=>i&&i.materialId&&i.qty>0);
  const prev=id?data.orders.find(o=>String(o.id)===String(id)):null;
  let status=(prev&&(orderIsTerminal(prev.status)||['В производстве','В работе'].includes(prev.status)))?prev.status:'Новый';
  const draft={id:id||uid(),number:document.getElementById('orderNumber').value.trim()||nextOrderNumber(id),client:document.getElementById('orderClient').value.trim(),productQty,dueDate:document.getElementById('orderDueDate')?.value||'',comment:document.getElementById('orderComment').value.trim(),date:document.getElementById('orderDate').value||today(),status,steps,materials};
  draft.status=calcOrderAutoStatus(draft);
  if(id)data.orders=data.orders.map(o=>String(o.id)===String(id)?draft:o);else data.orders.push(draft);
  save(); await persistReservationMaterials(); closeModal(); await loadMaterialsFromSupabase(); renderAll(); toast('Заказ сохранён');
}

function openOrderModal(id=''){
  if(!requireAuth())return;
  window.currentOrderEditId=id||'';
  const o=id?data.orders.find(x=>String(x.id)===String(id)):null;
  const number=o?.number||nextOrderNumber();
  const notification=o?.notification||{enabled:true,method:'internal'};
  // v7.60: по просьбе пользователя файлы можно прикреплять сразу при СОЗДАНИИ заказа, не дожидаясь
  // первого "Сохранить" — для этого ещё до сохранения генерируем id черновика (см.
  // startOrderFileDraft() в js/order-files.js), под ним же и загружаются файлы; при нажатии
  // "Сохранить" saveManagerOrder() ниже использует этот же id для нового заказа и подхватывает
  // уже загруженные файлы через consumePendingOrderFiles().
  const draftId=(!id&&typeof startOrderFileDraft==='function')?startOrderFileDraft():'';
  const filesTargetId=id||draftId||'';
  const body=`<div class="form-grid order-manager-form">
    <div class="field"><label>${escapeHtml(t('orderNumberLabel'))}</label><input id="orderNumber" class="input" value="${escapeHtml(number)}"></div>
    <div class="field"><label>${escapeHtml(t('orderCustomer'))}</label><input id="orderClient" class="input" value="${escapeHtml(o?.client||'')}" placeholder="${escapeHtml(t('orderCustomerPlaceholder'))}"></div>
    <div class="field"><label>${escapeHtml(t('orderProduct'))}</label><input id="orderProduct" class="input" value="${escapeHtml(o?.product||'')}" placeholder="${escapeHtml(t('orderProductPlaceholder'))}"></div>
    <div class="field"><label>${escapeHtml(t('orderProductCount'))}</label><input id="orderProductQty" type="number" min="1" step="1" class="input" value="${orderProductQty(o||{})}" oninput="updateOrderShipSummary()"></div>
    <div class="field" id="orderDueDateField" ${orderShipments(o||{}).length?'hidden':''}><label>${escapeHtml(t('orderDueDate'))}</label><input id="orderDueDate" type="date" class="input" value="${escapeHtml(o?.dueDate||'')}"></div>
    <div class="field"><label>${escapeHtml(t('orderPriority'))}</label><select id="orderPriority" class="select"><option value="low" ${o?.priority==='low'?'selected':''}>${escapeHtml(t('priorityLow'))}</option><option value="normal" ${!o?.priority||o?.priority==='normal'?'selected':''}>${escapeHtml(t('priorityNormal'))}</option><option value="high" ${o?.priority==='high'?'selected':''}>${escapeHtml(t('priorityHigh'))}</option><option value="urgent" ${o?.priority==='urgent'?'selected':''}>${escapeHtml(t('priorityUrgent'))}</option></select></div>
    ${orderShipmentsEditorHtml(o)}
    <div class="field full"><label>${escapeHtml(t('orderComment'))}</label><textarea id="orderComment" placeholder="${escapeHtml(t('orderCommentPlaceholder'))}">${escapeHtml(o?.comment||'')}</textarea></div>
  </div>
  <section class="order-notification-box"><h4>${escapeHtml(t('notificationTitle'))}</h4><label class="order-notification-toggle"><input id="notifyTechnologist" type="checkbox" ${notification.enabled!==false?'checked':''}> <span>${escapeHtml(t('notifyTechnologist'))}</span></label><div class="order-notification-methods"><small>${escapeHtml(t('notificationMethod'))}</small>${['internal','telegram','email','whatsapp'].map(method=>`<label><input type="radio" name="notificationMethod" value="${method}" ${notification.method===method?'checked':''}> <span>${escapeHtml(t(`notificationMethod_${method}`))}</span><em>${escapeHtml(t(`notificationMode_${method}`))}</em></label>`).join('')}</div></section>
  ${typeof orderFilesSectionHtml==='function'?orderFilesSectionHtml(o,filesTargetId):''}`;
  const foot=`<button class="btn" onclick="closeModal()">${u42('cancel')}</button><button class="btn primary" onclick="saveOrder('${id||draftId||''}')">${u42('save')}</button>`;
  openModal(id?u42('editOrder'):u42('addOrder'),body,foot);
  updateOrderShipSummary();
}
// v8.13: редактор отправок в форме заказа. Флажок «Разделить на несколько отправок» скрывает одиночную дату срока и
// показывает строки [дата][шт.][×]; под ними — «Распределено X из N · осталось M».
function orderShipRowHtml(x={}){
  return `<div class="ship-row"><span class="ship-n"></span><input type="date" class="input ship-date" value="${escapeHtml(x.date||'')}"><input type="number" min="1" step="1" class="input ship-qty" value="${x.qty?Number(x.qty):''}" placeholder="${escapeHtml(t('shipQtyPlaceholder'))}" oninput="updateOrderShipSummary()"><span class="ship-unit">${escapeHtml(t('unitPieces'))}</span><button type="button" class="btn small danger ship-del" aria-label="${escapeHtml(t('delete')||'×')}" onclick="removeOrderShipmentRow(this)">×</button></div>`;
}
function orderShipmentsEditorHtml(o){
  const ships=orderShipments(o||{});
  return `<div class="field full order-shipments-field">
    <label class="order-ship-toggle"><input id="orderShipToggle" type="checkbox" ${ships.length?'checked':''} onchange="toggleOrderShipments()"> <span>${escapeHtml(t('shipSplitToggle'))}</span></label>
    <div id="orderShipmentsBox" ${ships.length?'':'hidden'}>
      <div id="orderShipRows">${ships.map(orderShipRowHtml).join('')}</div>
      <button type="button" class="btn small" onclick="addOrderShipmentRow()">+ ${escapeHtml(t('shipAdd'))}</button>
      <div id="orderShipSummary" class="ship-summary"></div>
    </div>
  </div>`;
}
function orderShipFormQty(){return orderProductQty({productQty:document.getElementById('orderProductQty')?.value||1})}
function orderShipFormRows(){
  return [...document.querySelectorAll('#orderShipRows .ship-row')].map(r=>({
    date:r.querySelector('.ship-date')?.value||'',
    qty:Math.max(0,Math.trunc(Number(r.querySelector('.ship-qty')?.value||0)))
  }));
}
function updateOrderShipSummary(){
  const box=document.getElementById('orderShipSummary');if(!box)return;
  document.querySelectorAll('#orderShipRows .ship-row .ship-n').forEach((el,i)=>{el.textContent=i+1});
  const total=orderShipFormQty(),sum=orderShipFormRows().reduce((n,r)=>n+r.qty,0),left=total-sum;
  box.classList.toggle('over',left<0);
  box.textContent=left<0?t('shipOver').replace('{n}',-left):t('shipSummary').replace('{a}',sum).replace('{b}',total).replace('{c}',left);
}
function toggleOrderShipments(){
  const on=!!document.getElementById('orderShipToggle')?.checked;
  const boxEl=document.getElementById('orderShipmentsBox'),dueField=document.getElementById('orderDueDateField'),rows=document.getElementById('orderShipRows');
  if(boxEl)boxEl.hidden=!on;
  if(dueField)dueField.hidden=on;
  if(on&&rows&&!rows.children.length){
    // первая строка — из уже введённого срока и всего количества; дальше пользователь правит цифры и добавляет строки
    rows.insertAdjacentHTML('beforeend',orderShipRowHtml({date:document.getElementById('orderDueDate')?.value||'',qty:orderShipFormQty()}));
  }
  updateOrderShipSummary();
}
function addOrderShipmentRow(){
  const rows=document.getElementById('orderShipRows');if(!rows)return;
  const left=orderShipFormQty()-orderShipFormRows().reduce((n,r)=>n+r.qty,0);
  rows.insertAdjacentHTML('beforeend',orderShipRowHtml({date:'',qty:left>0?left:0}));
  updateOrderShipSummary();
  rows.lastElementChild?.querySelector('.ship-date')?.focus();
}
function removeOrderShipmentRow(btn){btn.closest('.ship-row')?.remove();updateOrderShipSummary()}
// Отправки из формы для сохранения: {list,error}. Полностью пустые строки пропускаются; включённый режим без единой
// заполненной строки = «без отправок» (сработает обычная дата срока).
function collectOrderShipmentsForSave(productQty){
  if(!document.getElementById('orderShipToggle')?.checked)return {list:[],error:''};
  const raw=orderShipFormRows().filter(r=>r.date||r.qty);
  for(const r of raw){
    if(!r.date)return {list:[],error:t('shipErrDate')};
    if(!(r.qty>0))return {list:[],error:t('shipErrQty')};
  }
  const sum=raw.reduce((n,r)=>n+r.qty,0);
  if(sum>productQty)return {list:[],error:t('shipOver').replace('{n}',sum-productQty)};
  const list=raw.map(r=>({id:uid(),date:r.date,qty:r.qty})).sort((a,b)=>a.date.localeCompare(b.date));
  return {list,error:''};
}
function orderStepRow(s={name:'',minutes:0}){return `<div class="order-row order-step-row"><div class="field"><label>${u42('stage')}</label><input class="input step-name" value="${escapeHtml(s.name||'')}"></div><div class="field"><label>${u42('minutes')}</label><input class="input step-min" type="number" min="0" step="1" value="${Number(s.minutes||0)}" oninput="updateOrderTimeTotal()"></div><button class="btn small danger" onclick="this.closest('.order-step-row').remove();updateOrderTimeTotal()">×</button></div>`}
function addOrderStep(){document.getElementById('orderStepsBox').insertAdjacentHTML('beforeend',orderStepRow({name:u42('newStage'),minutes:0}));updateOrderTimeTotal()}
function updateOrderTimeTotal(){const perOne=[...document.querySelectorAll('.step-min')].reduce((s,i)=>s+Number(i.value||0),0);const qty=orderProductQty({productQty:document.getElementById('orderProductQty')?.value||1});const total=perOne*qty;const el=document.getElementById('orderTimeTotal');if(el)el.textContent=`${total} ${u42('minutes').toLowerCase()} · ${orderTimeText(total)}`}
function orderMaterialRow(i={},excludeOrderId=''){
  const cat=i.category||'Поролон';
  const mat=data.materials.find(m=>String(m.id)===String(i.materialId));
  const unit=mat?.unit||i.unit||'';
  const ps=orderItemPurchaseStatus(i)||'need';
  const pq=Number(i.purchaseQty||0);
  const pno=i.purchaseNo||'';
  const oq=orderProductQty({productQty:document.getElementById('orderProductQty')?.value||1});
  const perUnit=Number(i.perUnitQty||((Number(i.qty||0)>0&&oq>0)?Number(i.qty||0)/oq:0));
  return `<div class="order-material-row">
    <div class="field"><label>${u42('category')}</label><select class="select om-cat" onchange="refreshOneOrderMaterialRow(this)">${ORDER_MATERIAL_CATS.map(c=>`<option value="${c}" ${cat===c?'selected':''}>${categoryLabel(c)}</option>`).join('')}</select></div>
    <div class="field"><label>${u42('material')}</label><select class="select om-material" onchange="refreshOrderMaterialRows()">${materialOptions(cat,i.materialId)}</select></div>
    <div class="field"><label>${u42('perOne')}</label><input class="input om-per-unit" type="number" min="0" step="0.01" value="${Number(perUnit||0)}" oninput="refreshOrderMaterialRows()"><div class="hint">${u42('perOneHint')}</div></div>
    <div class="field"><label>${u42('totalNeed')}</label><div class="readonly-pill om-total-qty">0</div></div>
    <div class="field"><label>${u42('unit')}</label><div class="readonly-pill om-unit">${escapeHtml(unit||'—')}</div></div>
    <button class="btn small danger order-line-remove" type="button" onclick="this.closest('.order-material-row').remove();refreshOrderMaterialRows()">×</button>
    <div class="material-check om-check">${u42('selectMaterial')}</div>
  </div>`
}
function refreshOrderMaterialRows(){
  const orderQty=orderProductQty({productQty:document.getElementById('orderProductQty')?.value||1});
  document.querySelectorAll('.order-material-row').forEach(row=>{
    const id=row.querySelector('.om-material')?.value;
    const perUnit=Number(row.querySelector('.om-per-unit')?.value||0);
    const m=data.materials.find(x=>String(x.id)===String(id));
    const totalQty=m?stockNumForUnit(perUnit*orderQty,m.unit||'м²'):0;
    const unit=row.querySelector('.om-unit');
    const totalEl=row.querySelector('.om-total-qty');
    const check=row.querySelector('.om-check');
    if(unit)unit.textContent=m?.unit||'—';
    if(totalEl)totalEl.textContent=m?qtyWithUnit(totalQty,m.unit):'—';
    if(!check)return;
    if(!m){check.className='material-check warn om-check';check.innerHTML=u42('selectMaterial');return}
    const av=orderItemAvailability({materialId:id,qty:totalQty},window.currentOrderEditId||'');
    const effective={materialId:id,qty:totalQty,perUnitQty:perUnit,unit:m.unit,purchaseStatus:'none',purchaseQty:0};
    const st=orderMaterialLineState(effective,window.currentOrderEditId||'');
    check.className='material-check om-check '+(st.kind==='ok'?'ok':st.kind==='blue'?'warn':st.kind==='warn'?'warn':'bad');
    if(st.kind==='ok') check.innerHTML=`<div><b>${u42('availableMat')}</b></div><div class="muted">${u42('stock')} ${qtyWithUnit(av.stock,m.unit)} · ${u42('available')} ${qtyWithUnit(av.available,m.unit)} · ${u42('need')} ${qtyWithUnit(totalQty,m.unit)}</div>`;
    else if(st.kind==='blue') check.innerHTML=`<div><b>${u42('materialOrdered')}</b></div><div class="muted">${u42('need')} ${qtyWithUnit(totalQty,m.unit)} · ${u42('available')} ${qtyWithUnit(av.available,m.unit)} · ${u42('ordered').toLowerCase()} ${qtyWithUnit(st.purchaseQty,m.unit)}</div>`;
    else if(st.kind==='warn') check.innerHTML=`<div><b>${u42('notOrdered')}</b></div><div class="muted">${u42('need')} ${qtyWithUnit(totalQty,m.unit)} · ${u42('available')} ${qtyWithUnit(av.available,m.unit)} · ${u42('missing').toLowerCase()} ${qtyWithUnit(av.missing,m.unit)}</div>`;
    else check.innerHTML=`<div><b>${u42('missingMaterial')}</b></div><div class="muted">${u42('need')} ${qtyWithUnit(totalQty,m.unit)} · ${u42('available')} ${qtyWithUnit(av.available,m.unit)} · ${u42('toOrder')} ${qtyWithUnit(st.purchaseQty,m.unit)}</div>`;
  })
}
function orderNotificationUrl(orderId){const url=new URL(window.location.href);url.searchParams.set('order',orderId);url.hash='';return url.toString()}
function orderPriorityLabel(value){return t({low:'priorityLow',normal:'priorityNormal',high:'priorityHigh',urgent:'priorityUrgent'}[value]||'priorityNormal')}
function orderNotificationText(o){return `${t('notificationOrderHeading')}\n${t('orderNumberLabel')}: ${o.number}\n${t('orderCustomer')}: ${o.client||'—'}\n${t('orderProduct')}: ${o.product||'—'}\n${t('orderProductCount')}: ${orderProductQty(o)}\n${t('orderDueDate')}: ${o.dueDate||'—'}\n${t('orderPriority')}: ${orderPriorityLabel(o.priority)}\n${t('orderComment')}: ${o.comment||'—'}\n${t('notificationOrderLink')}: ${orderNotificationUrl(o.id)}`}
const TELEGRAM_SETTINGS_PIN='198826';
let telegramSettingsUnlocked=false;
let telegramSettingsSnapshot=null;
function telegramSettings(){return data.settings?.notifications||{}}
function telegramMasked(value){return value?'************':''}
function telegramPinModal(title,message){
  return new Promise(resolve=>{
    const body=`<div class="pin-modal"><p>${escapeHtml(message||t('telegramPinDefaultMessage'))}</p><input class="input" id="telegramPinInput" type="password" inputmode="numeric" autocomplete="one-time-code" placeholder="PIN"><div class="auth-error" id="telegramPinError"></div></div>`;
    const foot=`<button class="btn" type="button" onclick="window.__telegramPinResolve(false);closeModal()">${t('cancel')}</button><button class="btn primary" type="button" onclick="checkTelegramPinModal()">${t('telegramEnterPinBtn')}</button>`;
    window.__telegramPinResolve=resolve;
    openModal(title||t('telegramPinDefaultTitle'),body,foot);
    setTimeout(()=>document.getElementById('telegramPinInput')?.focus(),0);
  });
}
window.checkTelegramPinModal=function(){
  const input=document.getElementById('telegramPinInput');
  const err=document.getElementById('telegramPinError');
  if(String(input?.value||'')===TELEGRAM_SETTINGS_PIN){
    const resolve=window.__telegramPinResolve;
    window.__telegramPinResolve=null;
    closeModal();
    if(typeof resolve==='function')resolve(true);
    return;
  }
  if(err)err.textContent=t('telegramWrongPinError');
  input?.select();
};
async function requireTelegramPin(reason){
  const ok=await telegramPinModal(t('telegramPinDefaultTitle'),reason||t('telegramPinDefaultMessage'));
  if(!ok)toast(t('telegramAccessDeniedToast'));
  return !!ok;
}
function lockTelegramSettings(){
  telegramSettingsUnlocked=false;
  telegramSettingsSnapshot=null;
  renderNotificationSettings();
}
async function unlockTelegramSettings(){
  if(!await requireTelegramPin(t('telegramPinUnlockReason')))return;
  telegramSettingsUnlocked=true;
  renderNotificationSettings();
}
function secureFieldHtml(id,label,value){
  const has=!!String(value||'');
  return `<div class="field secret-field"><label>${escapeHtml(label)}</label><div class="secret-input-row"><input class="input" id="${id}" type="password" autocomplete="off" value="${escapeHtml(String(value||''))}" placeholder="${has?'************':'—'}" oninput="markTelegramSettingsDirty()"><button class="btn small" type="button" onclick="showTelegramSecret('${id}')">${t('telegramShowBtn')}</button><button class="btn small" type="button" onclick="copyTelegramSecret('${id}')">${t('telegramCopyBtn')}</button></div><small>${has?telegramMasked(value):t('telegramValueNotSet')}</small></div>`;
}
function renderNotificationSettings(){
  const panel=document.querySelector('.notification-settings-panel');
  if(!panel)return;
  if(!telegramSettingsUnlocked){
    panel.innerHTML=`<div class="telegram-lock-card"><div><h3 id="notificationSettingsTitle">${t('telegramIntegrationTitle')}</h3><p class="muted" id="notificationSettingsHint">${t('telegramLockedHint')}</p></div><button class="btn primary" type="button" onclick="unlockTelegramSettings()">${t('telegramEnterPinBtn')}</button></div>`;
    return;
  }
  const settings=telegramSettings();
  telegramSettingsSnapshot={telegramBotToken:String(settings.telegramBotToken||''),telegramChatId:String(settings.telegramChatId||'')};
  panel.innerHTML=`<h3 id="notificationSettingsTitle">${t('telegramIntegrationTitle')}</h3><p class="muted" id="notificationSettingsHint">${t('telegramUnlockedHint')}</p><div class="form-grid secure-settings-grid">${secureFieldHtml('telegramBotToken',t('telegramTokenLabel'),settings.telegramBotToken)}${secureFieldHtml('telegramChatId',t('telegramChatIdLabel'),settings.telegramChatId)}</div><div class="secure-settings-actions"><span id="telegramSettingsDirty" class="secure-dirty-note"></span><button class="btn" type="button" onclick="lockTelegramSettings()">${t('telegramCloseAccessBtn')}</button><button class="btn primary" id="saveNotificationSettingsBtn" type="button" onclick="saveNotificationSettings()">${t('save')}</button></div>`;
}
function markTelegramSettingsDirty(){const note=document.getElementById('telegramSettingsDirty');if(note)note.textContent=t('telegramUnsavedChanges');}
async function showTelegramSecret(id){
  if(!telegramSettingsUnlocked)return unlockTelegramSettings();
  if(!await requireTelegramPin(t('telegramPinShowReason')))return;
  const input=document.getElementById(id);
  if(input)input.type=input.type==='password'?'text':'password';
}
async function copyTelegramSecret(id){
  if(!telegramSettingsUnlocked)return unlockTelegramSettings();
  const input=document.getElementById(id);
  if(!input)return;
  try{await navigator.clipboard.writeText(input.value||'');toast(t('telegramCopiedToast'))}catch(e){input.select();document.execCommand('copy');toast(t('telegramCopiedToast'))}
}
function telegramSettingsDiff(prev,next){
  const out=[];
  if(String(prev?.telegramBotToken||'')!==String(next?.telegramBotToken||''))out.push(['telegramBotToken','Администратор изменил Telegram Bot Token.']);
  if(String(prev?.telegramChatId||'')!==String(next?.telegramChatId||''))out.push(['telegramChatId','Администратор изменил Telegram Chat ID.']);
  return out;
}
function saveNotificationSettings(){
  if(!telegramSettingsUnlocked){toast(t('telegramEnterPinBtn'));return;}
  if(!data.settings||typeof data.settings!=='object')data.settings={};
  const prev=telegramSettingsSnapshot||telegramSettings();
  const next={telegramBotToken:document.getElementById('telegramBotToken')?.value.trim()||'',telegramChatId:document.getElementById('telegramChatId')?.value.trim()||''};
  const diffs=telegramSettingsDiff(prev,next);
  if(diffs.length&&!confirm(t('telegramSaveConfirm')))return;
  data.settings.notifications={...(data.settings.notifications||{}),...next};
  diffs.forEach(([field,text])=>{if(typeof auditAdd==='function')auditAdd('telegram_settings_changed','settings','telegram','Telegram',text,{field,secret:true})});
  save();
  telegramSettingsSnapshot={...next};
  renderNotificationSettings();
  toast(t('notificationSettingsSaved'));
}

// ===== v7.04: движок правил уведомлений =====
// Админ (единственный аккаунт с этим email) настраивает, какие типы уведомлений включены и кто их
// получает (список email через запятую). Доступ определяется реальным логином через Supabase Auth,
// а не PIN-кодом — так как у каждого сотрудника свой отдельный аккаунт.
const NOTIFICATION_ADMIN_EMAIL='mpa26294@gmail.com';
function isNotificationAdmin(){return !!(typeof currentUser!=='undefined'&&currentUser&&String(currentUser.email||'').trim().toLowerCase()===NOTIFICATION_ADMIN_EMAIL)}
const NOTIFICATION_RULE_META={
  orderOverdueRisk:{titleKey:'ruleOrderOverdueTitle',descKey:'ruleOrderOverdueDesc'},
  lowStock:{titleKey:'ruleLowStockTitle',descKey:'ruleLowStockDesc'},
  workshopPausedTooLong:{titleKey:'ruleWorkshopPausedTitle',descKey:'ruleWorkshopPausedDesc',hasThreshold:true},
  orderCompleted:{titleKey:'ruleOrderCompletedTitle',descKey:'ruleOrderCompletedDesc'}
};
function notificationRules(){
  if(!data.settings||typeof data.settings!=='object')data.settings={};
  if(!data.settings.notificationRules||typeof data.settings.notificationRules!=='object')data.settings.notificationRules={};
  const rules=data.settings.notificationRules;
  Object.keys(NOTIFICATION_RULE_META).forEach(key=>{
    if(!rules[key]||typeof rules[key]!=='object')rules[key]={enabled:false,recipients:[]};
    if(!Array.isArray(rules[key].recipients))rules[key].recipients=[];
  });
  if(!Number.isFinite(rules.workshopPausedTooLong.thresholdHours)||rules.workshopPausedTooLong.thresholdHours<=0)rules.workshopPausedTooLong.thresholdHours=2;
  return rules;
}
function notificationRuleEnabled(key){return !!notificationRules()[key]?.enabled}
function notificationRuleRecipients(key){return notificationRules()[key]?.recipients||[]}
function parseEmailList(str){return Array.from(new Set(String(str||'').split(/[,;\n]/).map(s=>s.trim().toLowerCase()).filter(s=>s&&s.includes('@'))))}
// Дедуп: одно и то же условие (тип+сущность) не создаёт новое уведомление чаще, чем раз в throttleHours -
// иначе цех "на паузе" или заказ "просрочен" заспамили бы уведомлениями на каждой проверке.
function shouldPushRuleNotification(type,entityId,throttleHours=24){
  const cutoff=new Date(Date.now()-throttleHours*3600*1000).toISOString();
  return !(data.notifications||[]).some(n=>n.type===type&&String(n.entityId||'')===String(entityId)&&String(n.createdAt||'')>cutoff);
}
function pushRuleNotification(type,entityId,title,message,extra={}){
  if(!Array.isArray(data.notifications))data.notifications=[];
  data.notifications.unshift({id:uid(),type,channel:'internal',entityId:String(entityId||''),recipients:notificationRuleRecipients(type),title,message,createdAt:productionNow(),read:false,...extra});
}
function checkOrderOverdueRiskNotifications(){
  if(!notificationRuleEnabled('orderOverdueRisk'))return;
  (data.orders||[]).forEach(o=>{
    if(typeof orderIsTerminal==='function'&&orderIsTerminal(o.status))return;
    let reason='';
    if(orderDeadlineClass(o)==='overdue')reason='overdue';
    if(!reason&&(o.dueDate||orderShipments(o).length)){
      const steps=orderSteps(o);
      for(let i=0;i<steps.length;i++){
        const step=steps[i];if(!step?.name||Number(step.minutes||0)<=0)continue;
        const op=productionOp(o,i);if(op&&(op.status==='done'||op.status==='cancelled'))continue;
        const opDue=orderDueDate(o,op);if(!opDue)continue;
        const queue=productionQueueForWorkshop(step.name);
        const eta=workshopQueueEtaMap(queue).get(`${o.id}_${i}`);
        if(eta&&eta>opDue){reason='risk';break}
      }
    }
    if(!reason)return;
    if(!shouldPushRuleNotification('orderOverdueRisk',o.id))return;
    const title=reason==='overdue'?t('notifOrderOverdueTitle'):t('notifOrderRiskTitle');
    pushRuleNotification('orderOverdueRisk',o.id,title,`${title}: ${o.number}${orderDueDate(o)?` (${t('orderDueDate')}: ${orderDueDate(o)})`:''}`,{orderId:o.id});
  });
}
function checkLowStockNotifications(){
  if(!notificationRuleEnabled('lowStock'))return;
  (data.materials||[]).forEach(m=>{
    const st=typeof statusOf==='function'?statusOf(m):null;
    if(!st||(st[0]!=='low'&&st[0]!=='out'))return;
    if(!shouldPushRuleNotification('lowStock',m.id))return;
    const title=st[0]==='out'?t('notifNoStockTitle'):t('notifLowStockTitle');
    pushRuleNotification('lowStock',m.id,title,`${title}: ${m.name||'—'}`,{materialId:m.id});
  });
}
function checkWorkshopPausedNotifications(){
  if(!notificationRuleEnabled('workshopPausedTooLong'))return;
  const thresholdMin=Math.round((notificationRules().workshopPausedTooLong.thresholdHours||2)*60);
  (data.orders||[]).forEach(o=>{
    productionOps(o).forEach(op=>{
      if(op.status!=='paused'||!op.pausedAt)return;
      if(productionMinutesBetween(op.pausedAt)<thresholdMin)return;
      const entityId=`${o.id}_${op.stepIndex}`;
      if(!shouldPushRuleNotification('workshopPausedTooLong',entityId))return;
      const title=t('notifWorkshopPausedTitle');
      pushRuleNotification('workshopPausedTooLong',entityId,title,`${title}: ${typeof workshopLabel==='function'?workshopLabel(op.stepName):op.stepName} · ${o.number}`,{orderId:o.id});
    });
  });
}
// Завершение заказа - это разовое событие (не постоянное состояние), поэтому вызывается напрямую из
// completeOrder(), а не сканером по интервалу; троттлинг тут короткий, только на случай двойного клика.
function notifyOrderCompletedRule(o){
  if(!o||!notificationRuleEnabled('orderCompleted'))return;
  if(!shouldPushRuleNotification('orderCompleted',o.id,0.05))return;
  const title=t('notifOrderCompletedTitle');
  pushRuleNotification('orderCompleted',o.id,title,`${title}: ${o.number}`,{orderId:o.id});
}
function runNotificationRuleChecks(){
  const before=(data.notifications||[]).length;
  try{
    checkOrderOverdueRiskNotifications();
    checkLowStockNotifications();
    checkWorkshopPausedNotifications();
  }catch(e){console.error('runNotificationRuleChecks failed',e)}
  if((data.notifications||[]).length>before){
    if(typeof save==='function')save();
    if(typeof renderTopbarProfile==='function')renderTopbarProfile();
  }
}
let lastNotificationRuleCheckAt=0;
function maybeRunNotificationRuleChecks(){
  if(!(typeof currentUser!=='undefined'&&currentUser))return;
  const nowMs=Date.now();
  if(nowMs-lastNotificationRuleCheckAt<4*60*1000)return;
  lastNotificationRuleCheckAt=nowMs;
  runNotificationRuleChecks();
}
if(typeof window!=='undefined')setInterval(()=>{if(typeof maybeRunNotificationRuleChecks==='function')maybeRunNotificationRuleChecks()},5*60*1000);
function notificationRuleCardHtml(key){
  const meta=NOTIFICATION_RULE_META[key],rule=notificationRules()[key];
  const thresholdField=meta.hasThreshold?`<div class="field"><label>${escapeHtml(t('ruleThresholdHoursLabel'))}</label><input class="input" type="number" min="1" step="1" id="ruleThreshold_${key}" value="${Number(rule.thresholdHours||2)}"></div>`:'';
  return `<div class="notif-rule-card">
    <label class="notif-rule-head"><input type="checkbox" id="ruleEnabled_${key}" ${rule.enabled?'checked':''}><div><b>${escapeHtml(t(meta.titleKey))}</b><small>${escapeHtml(t(meta.descKey))}</small></div></label>
    <div class="field"><label>${escapeHtml(t('ruleRecipientsLabel'))}</label><textarea class="input" id="ruleRecipients_${key}" rows="2" placeholder="${escapeHtml(t('ruleRecipientsPlaceholder'))}">${escapeHtml((rule.recipients||[]).join(', '))}</textarea></div>
    ${thresholdField}
  </div>`;
}
function renderNotificationRulesPanel(){
  const panel=document.getElementById('notificationRulesPanel');
  if(!panel)return;
  if(!isNotificationAdmin()){panel.style.display='none';panel.innerHTML='';return}
  panel.style.display='';
  const keys=Object.keys(NOTIFICATION_RULE_META);
  panel.innerHTML=`<h3 id="notificationRulesTitleEl">${escapeHtml(t('notificationRulesTitle'))}</h3><p class="muted">${escapeHtml(t('notificationRulesHint'))}</p><div class="notif-rules-list">${keys.map(notificationRuleCardHtml).join('')}</div><div class="actions" style="margin-top:16px"><button class="btn primary" type="button" onclick="saveNotificationRules()">${escapeHtml(t('save'))}</button></div>`;
}
function saveNotificationRules(){
  if(!isNotificationAdmin())return;
  const rules=notificationRules();
  Object.keys(NOTIFICATION_RULE_META).forEach(key=>{
    const enabledEl=document.getElementById(`ruleEnabled_${key}`);
    const recipientsEl=document.getElementById(`ruleRecipients_${key}`);
    rules[key].enabled=!!enabledEl?.checked;
    rules[key].recipients=parseEmailList(recipientsEl?.value);
    if(NOTIFICATION_RULE_META[key].hasThreshold){
      const thEl=document.getElementById(`ruleThreshold_${key}`);
      const v=Number(thEl?.value);
      rules[key].thresholdHours=Number.isFinite(v)&&v>0?v:2;
    }
  });
  save();
  toast(t('notificationRulesSaved'));
  if(typeof auditAdd==='function')auditAdd('notification_rules_changed','settings','notification_rules',t('notificationRulesTitle'),tRu('historyNotificationRulesChanged'));
  renderNotificationRulesPanel();
}

// v7.84: панель настроек смены — тот же паттерн, что и notificationRulesPanel/workerAccessPanel
// (видна только администратору, заполняется здесь, сохраняется по кнопке). Как и notificationRules,
// это настройка ЭТОГО БРАУЗЕРА (data.settings, только localStorage) — сами рабочие сессии при этом
// синхронизируются как обычные данные заказа (см. shiftSettings() выше).
function shiftWeekdayLabel(v){
  const labels={ru:['Вс','Пн','Вт','Ср','Чт','Пт','Сб'],en:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],lv:['Sv','Pr','Ot','Tr','Ce','Pk','Se']};
  return (labels[currentLang]||labels.ru)[v]||'';
}
function shiftScheduleFieldsHtml(){
  const s=shiftSettings(),d=s.default;
  const days=[1,2,3,4,5,6,0].map(v=>`<label class="shift-day-chip"><input type="checkbox" id="shiftDay_${v}" ${d.workDays.includes(v)?'checked':''}><span>${escapeHtml(shiftWeekdayLabel(v))}</span></label>`).join('');
  return `<div class="field full"><label>${escapeHtml(t('shiftWorkDaysLabel'))}</label><div class="shift-days-row">${days}</div></div>
    <div class="form-grid">
      <div class="field"><label>${escapeHtml(t('shiftStartTimeLabel'))}</label><input class="input" type="time" id="shiftStartTime" value="${escapeHtml(d.startTime)}"></div>
      <div class="field"><label>${escapeHtml(t('shiftEndTimeLabel'))}</label><input class="input" type="time" id="shiftEndTime" value="${escapeHtml(d.endTime)}"></div>
      <div class="field"><label>${escapeHtml(t('shiftTimezoneLabel'))}</label><input class="input" id="shiftTimezone" value="${escapeHtml(d.timezone)}" placeholder="Europe/Riga"></div>
    </div>
    <label class="shift-toggle-row"><input type="checkbox" id="shiftAutoEnd" ${d.autoEndAtShiftEnd?'checked':''}> <span>${escapeHtml(t('shiftAutoEndToggleLabel'))}</span></label>
    <label class="shift-toggle-row"><input type="checkbox" id="shiftAllowOvertime" ${d.allowOvertime?'checked':''}> <span>${escapeHtml(t('shiftAllowOvertimeToggleLabel'))}</span></label>`;
}
function renderShiftSchedulePanel(){
  const panel=document.getElementById('shiftSchedulePanel');
  if(!panel)return;
  if(!isNotificationAdmin()){panel.style.display='none';panel.innerHTML='';return}
  panel.style.display='';
  panel.innerHTML=`<h3 id="shiftScheduleTitleEl">${escapeHtml(t('shiftScheduleTitle'))}</h3><p class="muted">${escapeHtml(t('shiftScheduleHint'))}</p>${shiftScheduleFieldsHtml()}<div class="actions" style="margin-top:16px"><button class="btn primary" type="button" onclick="saveShiftScheduleSettings()">${escapeHtml(t('save'))}</button></div>`;
}
function saveShiftScheduleSettings(){
  if(!isNotificationAdmin())return;
  const s=shiftSettings(),d=s.default;
  const days=[0,1,2,3,4,5,6].filter(v=>document.getElementById(`shiftDay_${v}`)?.checked);
  d.workDays=days.length?days:[...DEFAULT_SHIFT_SCHEDULE.workDays];
  const start=document.getElementById('shiftStartTime')?.value||d.startTime,end=document.getElementById('shiftEndTime')?.value||d.endTime;
  d.startTime=/^([01]\d|2[0-3]):[0-5]\d$/.test(start)?start:DEFAULT_SHIFT_SCHEDULE.startTime;
  d.endTime=/^([01]\d|2[0-3]):[0-5]\d$/.test(end)?end:DEFAULT_SHIFT_SCHEDULE.endTime;
  const tzInput=String(document.getElementById('shiftTimezone')?.value||'').trim();
  try{new Intl.DateTimeFormat('en-US',{timeZone:tzInput||d.timezone});d.timezone=tzInput||DEFAULT_SHIFT_SCHEDULE.timezone;}
  catch(e){toast(t('shiftInvalidTimezone'));return}
  d.autoEndAtShiftEnd=!!document.getElementById('shiftAutoEnd')?.checked;
  d.allowOvertime=!!document.getElementById('shiftAllowOvertime')?.checked;
  save();
  if(typeof saveWorkerAccessList==='function')saveWorkerAccessList(workerAccessList,{silent:true}); // v8.18: общий график — на сервер
  toast(t('shiftScheduleSaved'));
  if(typeof auditAdd==='function')auditAdd('shift_schedule_changed','settings','shift_schedule',t('shiftScheduleTitle'),t('shiftScheduleSaved'));
  renderShiftSchedulePanel();
  if(typeof renderWorkshops==='function')renderWorkshops();
}

async function sendOrderNotification(o,method){
  const text=orderNotificationText(o),subject=`${t('notificationOrderHeading')} ${o.number}`;
  if(method==='internal')return true;
  if(method==='telegram'){
    const settings=data.settings?.notifications||{},token=String(settings.telegramBotToken||'').trim(),chatId=String(settings.telegramChatId||'').trim();
    if(!token||!chatId){toast(t('telegramNotConfigured'));return false}
    try{const response=await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true})});if(!response.ok)throw new Error(`HTTP ${response.status}`);toast(t('telegramNotificationSent'));return true}catch(e){console.error('Telegram notification failed',e);toast(t('telegramNotificationFailed'));return false}
  }
  if(method==='email'){window.location.href=`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;return true}
  if(method==='whatsapp'){window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank','noopener');return true}
  return false;
}
// v8.13: список отправок в карточке заказа: дата, сколько, ✓ если уже произведено (накопительно) и остаток без даты.
function orderShipmentsInfoHtml(o){
  const ships=orderShipments(o);
  if(!ships.length)return '';
  const done=orderProducedQty(o),total=orderProductQty(o);
  let cum=0;
  const rows=ships.map((x,i)=>{
    cum+=x.qty;
    const ok=done>=cum;
    return `<li class="${ok?'done':''}"><span class="ship-i">${i+1}</span><b>${escapeHtml(x.date)}</b><span>${x.qty} ${escapeHtml(t('unitPieces'))}</span><em>${ok?'✓ '+escapeHtml(t('shipDone')):''}</em></li>`;
  }).join('');
  const rest=total-cum;
  return `<div class="order-ship-info"><small>${escapeHtml(t('shipTitle'))}</small><ul>${rows}${rest>0?`<li class="rest"><span class="ship-i">·</span><b>${escapeHtml(t('shipUnscheduled'))}</b><span>${rest} ${escapeHtml(t('unitPieces'))}</span><em></em></li>`:''}</ul></div>`;
}
async function saveManagerOrder(id=''){
  const productQty=orderProductQty({productQty:document.getElementById('orderProductQty')?.value||1});
  const shipCheck=collectOrderShipmentsForSave(productQty);
  if(shipCheck.error){toast(shipCheck.error);return}
  const prev=id?data.orders.find(o=>String(o.id)===String(id)):null;
  const isNew=!prev,notifyEnabled=!!document.getElementById('notifyTechnologist')?.checked,method=document.querySelector('input[name="notificationMethod"]:checked')?.value||'internal',now=productionNow();
  const notification={enabled:notifyEnabled,method,recipientRole:'technologist',state:notifyEnabled&&method==='internal'?'sent':'prepared',createdAt:now};
  // v7.60: у нового заказа files приходят из pending-списка, накопленного файлами, которые
  // загрузили ДО этого "Сохранить" (см. openOrderModal/consumePendingOrderFiles в js/order-files.js);
  // у существующего заказа files уже корректно приходят через spread {...prev} выше.
  const draftFiles=prev?(prev.files||[]):(typeof consumePendingOrderFiles==='function'?consumePendingOrderFiles(id):[]);
  let draft={...(prev||{}),id:id||uid(),number:document.getElementById('orderNumber').value.trim()||nextOrderNumber(id),client:document.getElementById('orderClient').value.trim(),product:document.getElementById('orderProduct').value.trim(),productQty,shipments:shipCheck.list,dueDate:shipCheck.list.length?shipCheck.list[0].date:(document.getElementById('orderDueDate')?.value||''),priority:document.getElementById('orderPriority')?.value||'normal',comment:document.getElementById('orderComment').value.trim(),date:prev?.date||today(),status:isNew?'Ожидает технолога':prev.status,steps:prev?.steps||[],materials:prev?.materials||[],notification,files:draftFiles};
  if(typeof setOrderMetaForSave==='function')draft=setOrderMetaForSave(draft,prev);
  // v7.80: КРИТИЧЕСКИЙ ФИКС — новые заказы молча пропадали (не появлялись в списке, хотя запись в
  // Истории "Заказ передан технологу" создавалась). Причина: openOrderModal() для НОВОГО заказа
  // передаёт сюда не пустую строку, а draftId — временный id из startOrderFileDraft()
  // (js/order-files.js), нужный, чтобы можно было прикреплять файлы ДО первого "Сохранить" (см.
  // consumePendingOrderFiles выше и путь файла orders/${orderId}/... в js/order-files.js — поэтому
  // draftId сознательно становится постоянным id заказа через `id||uid()` выше, чтобы пути к уже
  // загруженным файлам не разъезжались). Проблема была в строке ниже: она проверяла "id непустой" и
  // из-за этого принимала НОВЫЙ заказ с непустым draftId за РЕДАКТИРОВАНИЕ существующего — пыталась
  // найти-и-заменить в data.orders заказ с таким id (никогда не существовавший, это id черновика
  // файлов, а не заказа), .map() ничего не находил и не менял, а push() не вызывался вовсе — заказ
  // терялся навсегда. Правильный признак "это правда существующий заказ" — наличие prev, а не сам
  // факт, что id непустой.
  if(prev)data.orders=data.orders.map(o=>String(o.id)===String(id)?draft:o);else data.orders.push(draft);
  if(isNew){
    if(!Array.isArray(data.notifications))data.notifications=[];
    if(notifyEnabled&&method==='internal')data.notifications.unshift({id:uid(),type:'order_assigned',channel:'internal',recipientRole:'technologist',orderId:draft.id,orderNumber:draft.number,title:t('notificationNewOrderTitle'),message:`${t('notificationNewOrderMessage')} ${draft.number}`,createdAt:now,read:false});
    if(typeof auditAdd==='function')auditAdd('order_to_technologist','order',draft.id,draft.number,tRu('historyOrderSentTechnologist'),{status:draft.status,notificationMethod:method,notified:notifyEnabled});
  }
  // v7.69: НЕ loadMaterialsFromSupabase() (без skipOrders) — она заново перечитывает синхронизированную
  // строку заказов и подменяет ей data.orders (см. applyOrderSyncRow). persistReservationMaterials()
  // ниже последовательно обновляет КАЖДЫЙ материал отдельным запросом — при заметном количестве
  // материалов это занимает дольше, чем 350мс debounce у save()/scheduleOrdersSync(), так что фоновая
  // отправка заказов на сервер иногда успевает завершиться (сбросив "грязный" флаг) ДО того, как эта
  // функция дойдёт до loadMaterialsFromSupabase() — и без skipOrders она в этот момент перечитывала бы
  // заказы с сервера и рисковала откатить только что сохранённые изменения. С skipOrders:true эта
  // функция обновляет только материалы (что и нужно — освобождённый/занятый резерв), не трогая заказы.
  save();
  // v7.78: раньше отправка заказа на сервер шла только фоново (debounce 350мс внутри save()/
  // scheduleOrdersSync()) — если между сохранением здесь и срабатыванием этого таймера кто-то ещё
  // (перезагрузка этой же страницы, другое устройство/вкладка) успевал прочитать и заново записать
  // заказы, свежесозданный заказ ещё не долетевший до Supabase навсегда пропадал — при этом запись
  // в Истории всё равно появлялась, так как аудит синхронизируется отдельным, независимым каналом.
  // Явное ожидание persistOrdersToSupabase() здесь закрывает это окно гонки: заказ гарантированно
  // долетает до сервера (или пользователь увидит "Ошибка синхронизации... Повторяем", как и раньше)
  // ДО того, как форма закроется и можно будет уйти со страницы/перезагрузить её.
  await persistOrdersToSupabase();
  await persistReservationMaterials();closeModal();await loadMaterialsFromSupabase({skipOrders:true});renderAll();toast(u42('orderSaved'));if(isNew&&notifyEnabled){const notificationResult=await sendOrderNotification(draft,method);draft.notification.state=notificationResult?'sent':'failed';save()}
}
async function saveOrder(id=''){return saveManagerOrder(id)}


function orderNextResponsibleText(o){if(['Ожидает технолога','Технология в работе'].includes(String(o.status)))return t('technologistRole');if(['В производстве','В работе'].includes(String(o.status)))return t('productionRole');if(['Готов','Готов к работе'].includes(String(o.status)))return t('completionRole');return '—'}
function orderHistoryRowsHtml(o){
  const rows=typeof auditFor==='function'?auditFor('order',o.id).slice(0,20):[];
  if(!rows.length)return `<p>${escapeHtml(t('orderHistoryEmpty'))}</p>`;
  return rows.map(row=>{
    const raw=typeof auditDisplayTextV572==='function'?auditDisplayTextV572(row):(row.text||row.action||'—');
    const text=typeof auditLocalizedText==='function'?auditLocalizedText(raw,row):raw;
    return `<div><span><b>${escapeHtml(text||'—')}</b><small>${escapeHtml(row.user||row.by||'')}</small></span><time>${escapeHtml(typeof auditTime==='function'?auditTime(row.at):productionDateTimeText(row.at))}</time></div>`;
  }).join('');
}
function orderInfoHistoryHtml(o){return `<section class="order-info-history"><h4>${escapeHtml(t('orderHistoryTitle'))}</h4>${orderHistoryRowsHtml(o)}</section>`}
function openOrderTechnologyFromInfo(id){
  const o=(data.orders||[]).find(x=>String(x.id)===String(id));
  if(!o){toast('Заказ не найден');return;}
  orderWorkflowSelection.set(String(id),1);
  const body=`<div id="orderWorkflowModal">${orderWorkflowStepperHtml(o,'modal')}${orderWorkflowContentHtml(o,true)}</div>`;
  openModal(o.number||t('orderStageTechnology'),body,`<button class="btn" type="button" onclick="showOrderInfoModal('${o.id}')">${escapeHtml(u42('back')||'Назад')}</button><button class="btn" type="button" onclick="openOrderModal('${o.id}')">${escapeHtml(u42('edit'))}</button>`);
  setCleanModalClass('order-clean-modal');
}

function showOrderInfoModal(id){
  const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;
  // v6.94: this modal already shows the order's history block, so collapse any inline-expanded
  // row for the same order first — otherwise the same history entries would be visible twice
  // at once (inline in the list and here in the modal).
  if(typeof expandedOrders!=='undefined'&&expandedOrders.has(id)){expandedOrders.delete(id);if(typeof renderOrders==='function')renderOrders();}
  const status=calcOrderAutoStatus(o),fields=[[t('orderNumberLabel'),o.number||'—'],[t('orderCustomer'),o.client||'—'],[t('orderProduct'),o.product||'—'],[t('orderProductCount'),orderProductQty(o)],[t('orderDueDate'),orderShipments(o).length?formatDeadline(o):(o.dueDate||'—')],[t('orderCreatedDate'),o.date||'—'],[t('orderPriority'),orderPriorityLabel(o.priority)],[t('orderCurrentStatus'),status]];
  // v7.72: по просьбе пользователя — в карточке просмотра заказа теперь видно и материалы (те же
  // строки "нужно/на складе/резерв/доступно/статус", что и в развёрнутой строке списка заказов и во
  // вкладке "Технология"), а не только номер/заказчик/сроки. orderMaterialsDetailHtml() уже
  // существовала и переиспользуется как есть — стили для неё вне #orders продублированы в css/style.css
  // под .order-clean-modal.
  const body=`<div class="order-info-view"><div class="order-info-grid">${fields.map(([label,value])=>`<div><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></div>`).join('')}<div class="full"><small>${escapeHtml(t('orderComment'))}</small><b>${escapeHtml(o.comment||'—')}</b></div></div>${orderShipmentsInfoHtml(o)}${orderMaterialsDetailHtml(o)}${typeof orderFilesSectionHtml==='function'?orderFilesSectionHtml(o,'',false):''}${orderInfoHistoryHtml(o)}${typeof cancelReviewPending==='function'&&cancelReviewPending(o)&&typeof cancelReviewHtml==='function'?cancelReviewHtml(o):''}</div>`;
  const technologyLabel=currentLang==='en'?'Technology':currentLang==='lv'?'Tehnoloģija':'Технология';
  openModal(o.number||t('orderStageCreation'),body,`<button class="btn" type="button" onclick="openOrderModal('${o.id}')">${escapeHtml(u42('edit'))}</button><button class="btn primary" type="button" onclick="openOrderTechnologyFromInfo('${o.id}')">${escapeHtml(technologyLabel)}</button><button class="btn" type="button" onclick="closeModal()">${escapeHtml(u42('close'))}</button>`);setCleanModalClass('order-clean-modal order-info-modal');
}

function openOrderView(id){
  const o=data.orders.find(x=>String(x.id)===String(id)); if(!o)return;
  const body=`<div id="orderWorkflowModal">${orderWorkflowStepperHtml(o,'modal')}${orderWorkflowContentHtml(o,true)}</div>`;
  openModal(o.number,body,`<button class="btn danger" style="margin-right:auto" onclick="deleteOrder('${o.id}')">Удалить заказ</button><button class="btn primary" onclick="openOrderModal('${o.id}')">${u42('edit')}</button>`);
  setCleanModalClass('order-clean-modal');
}

const __openOrderModalV557=openOrderModal;
openOrderModal=function(id=''){ __openOrderModalV557(id); setCleanModalClass('form-clean-modal'); };

function orderStatusStoredLocally(id,status){
  try{
    const saved=JSON.parse(localStorage.getItem(storeKey)||'{}');
    return (saved.orders||[]).some(o=>String(o.id)===String(id)&&String(o.status)===String(status));
  }catch(e){return false}
}
function refreshOrderStatusUI(id,reopen=false){
  renderAll();
  if(typeof renderOrders==='function')renderOrders();
  if(typeof renderOrderStats==='function')renderOrderStats();
  if(reopen&&typeof openOrderView==='function')openOrderView(id);
}
async function setOrderStatusPersisted(id,status){
  const o=(data.orders||[]).find(x=>String(x.id)===String(id));
  if(!o){toast('Заказ не найден');return false}
  if(String(o.status)===status)return false;
  const previous={status:o.status,completedAt:o.completedAt,cancelledAt:o.cancelledAt,updatedAt:o.updatedAt,updatedBy:o.updatedBy,cancelReview:o.cancelReview};
  const now=new Date().toISOString();
  o.status=status;o.updatedAt=now;o.updatedBy=profileUserName();
  if(status==='completed'){o.completedAt=now;delete o.cancelledAt;o.cancelReview=null}
  if(status==='cancelled'){o.cancelledAt=now;delete o.completedAt}
  if(typeof ensureMeta==='function'){const meta=ensureMeta(o);meta.updatedAt=now;meta.updatedBy=actorName()}
  save();
  if(!orderStatusStoredLocally(id,status)){
    Object.assign(o,previous);save();toast('Не удалось сохранить статус заказа');return false;
  }
  try{syncMaterialReservations();await persistReservationMaterials()}
  catch(e){console.error('Order status reservation sync failed',e)}
  return true;
}
function installOrderStatusHandlers(){
  window.completeOrder=async function(id){
    const o=(data.orders||[]).find(x=>String(x.id)===String(id));
    if(!o){toast('Заказ не найден');return}
    if(orderIsCompleted(o.status)){toast('Заказ уже завершён');return}
    if(cancelReviewPending(o)){toast('Сначала завершите пересчёт замороженных материалов');return}
    const from=o.status;
    const reopen=document.getElementById('modalBackdrop')?.classList.contains('show')&&document.getElementById('modalTitle')?.textContent===String(o.number||'');
    if(!await setOrderStatusPersisted(id,'completed'))return;
    auditAdd('order_status','order',o.id,o.number,'Заказ завершён',{from,to:'completed'});
    closeOrderMenuAfterAction(id);refreshOrderStatusUI(id,reopen);toast('Заказ завершён');
  };
  window.cancelOrder=async function(id){
    const o=(data.orders||[]).find(x=>String(x.id)===String(id));
    if(!o){toast('Заказ не найден');return}
    if(orderIsCancelled(o.status)){toast('Заказ уже отменён');return}
    const from=o.status;const previousCancelReview=o.cancelReview;
    const productionStarted=orderProductionStarted(o);
    const message=productionStarted?'Заказ уже был в работе. Отменить и заморозить материалы до пересчёта?':'Отменить заказ? Резерв будет освобождён, так как производство не начиналось.';
    closeOrderMenuAfterAction(id);if(!confirm(message))return;
    if(productionStarted)ensureCancelReview(o);else o.cancelReview=null;
    if(!await setOrderStatusPersisted(id,'cancelled')){o.cancelReview=previousCancelReview;save();return}
    auditAdd(productionStarted?'order_cancel_freeze':'order_status','order',o.id,o.number,productionStarted?'Заказ отменён. Материалы заморожены до пересчёта':'Заказ отменён. Резерв освобождён',{from,to:'cancelled'});
    refreshOrderStatusUI(id,productionStarted);toast(productionStarted?'Заказ отменён, материалы заморожены':'Заказ отменён, резерв освобождён');
  };
}
