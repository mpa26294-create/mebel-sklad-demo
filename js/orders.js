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
function orderDeadlineClass(o){const d=o?.dueDate||'';if(!d)return '';const todayStr=today();if(d<todayStr && !orderIsTerminal(o?.status)&&!['Завершён','Отменён'].includes(calcOrderAutoStatus(o)))return 'overdue';if(d===todayStr)return 'today';return ''}
function formatDeadline(o){return o?.dueDate||'—'}
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

function filteredOrders(){const q=(document.getElementById('orderSearchInput')?.value||'').toLowerCase().trim();const st=document.getElementById('orderStatusFilter')?.value||'';const client=document.getElementById('orderClientFilter')?.value||'';const date=document.getElementById('orderDateFilter')?.value||'';const prob=document.getElementById('orderProblemFilter')?.value||'';return (data.orders||[]).filter(o=>{const mats=orderMaterials(o).map(i=>data.materials.find(m=>String(m.id)===String(i.materialId))).filter(Boolean).map(materialTitle).join(' ');const hay=(o.number+' '+o.client+' '+mats).toLowerCase();const hasProb=orderHasMaterialProblem(o);return (!q||hay.includes(q))&&(!st||calcOrderAutoStatus(o)===st)&&(!client||o.client===client)&&(!date||o.date===date)&&(!prob||(prob==='problem'?hasProb:!hasProb))}).sort((a,b)=>String(a.dueDate||a.date||'').localeCompare(String(b.dueDate||b.date||'')))}
function closeOrderMenus(){document.querySelectorAll('.action-menu.open').forEach(x=>{x.classList.remove('open');const list=x.querySelector('.action-menu-list');if(list)list.removeAttribute('style')})}
function toggleOrderMenu(e,id){e.stopPropagation();const el=document.getElementById('orderMenu_'+id),button=el?.querySelector('.action-menu-btn'),list=el?.querySelector('.action-menu-list'),was=el?.classList.contains('open');closeOrderMenus();if(!el||!button||!list||was)return;el.classList.add('open');const rect=button.getBoundingClientRect(),width=Math.max(190,list.scrollWidth||190),height=list.scrollHeight||190,gap=6,left=Math.max(8,Math.min(window.innerWidth-width-8,rect.right-width)),openUp=window.innerHeight-rect.bottom<height+gap&&rect.top>height+gap;list.style.position='fixed';list.style.left=`${left}px`;list.style.right='auto';list.style.top=`${Math.max(8,openUp?rect.top-height-gap:Math.min(window.innerHeight-height-8,rect.bottom+gap))}px`;list.style.bottom='auto';list.style.zIndex='10000'}



function renderOrderStats(){const orders=data.orders||[],total=orders.length,ready=orders.filter(o=>calcOrderAutoStatus(o)==='Готов к работе').length,missing=orders.filter(o=>calcOrderAutoStatus(o)==='Не хватает материалов').length,ordered=orders.filter(o=>calcOrderAutoStatus(o)==='Материалы заказаны').length,pct=v=>total?Math.round(v/total*100):0,notes=currentLang==='ru'?['всего',`${pct(ready)}% от всех заказов`,`${pct(missing)}% требуют закупки`,`${pct(ordered)}% в пути`]:currentLang==='en'?['total',`${pct(ready)}% of all orders`,`${pct(missing)}% require purchase`,`${pct(ordered)}% in transit`]:['kopā',`${pct(ready)}% no visiem pasūtījumiem`,`${pct(missing)}% jāiepērk`,`${pct(ordered)}% ceļā`],stats=[['orders',u42('totalOrders'),total,notes[0]],['ready',u42('readyToWork'),ready,notes[1]],['missing',u42('missingMaterials'),missing,notes[2]],['ordered',u42('orderedMoving'),ordered,notes[3]]],box=document.getElementById('orderStats');if(box)box.innerHTML=stats.map(([icon,label,value,note])=>`<div class="order-stat-card"><span class="order-stat-icon ${icon}">${icon==='orders'?'▤':icon==='ready'?'✓':icon==='missing'?'△':'▱'}</span><div class="order-stat-copy"><small class="order-stat-label">${label}</small><b class="order-stat-value">${value}</b><em class="order-stat-note">${note}</em></div></div>`).join('')}
function renderOrderClientFilter(){const el=document.getElementById('orderClientFilter');if(!el)return;const current=el.value;const clients=[...new Set((data.orders||[]).map(o=>o.client).filter(Boolean))].sort();el.innerHTML=`<option value="">${u42('allClients')}</option>`+clients.map(c=>`<option value="${escapeHtml(c)}" ${c===current?'selected':''}>${escapeHtml(c)}</option>`).join('')}

function clearOrderFilters(){['orderSearchInput','orderDateFilter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});['orderStatusFilter','orderClientFilter','orderProblemFilter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});renderOrders()}

function orderTimeText(min){min=Math.max(0,Math.round(Number(min||0)));const h=Math.floor(min/60),m=min%60;const hm={ru:['ч','мин'],en:['h','min'],lv:['st','min']}[currentLang]||['ч','мин'];return h?`${h} ${hm[0]} ${String(m).padStart(2,'0')} ${hm[1]}`:`${m} ${hm[1]}`}
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
  const basics=`<section class="order-workflow-panel" role="tabpanel"><h4>${escapeHtml(t('orderBasicData'))}</h4><div class="order-basic-grid"><div><small>${escapeHtml(t('orderNumberLabel'))}</small><b>${escapeHtml(o.number||'—')}</b></div><div><small>${escapeHtml(u42('orderClient'))}</small><b>${escapeHtml(o.client||'—')}</b></div><div><small>${escapeHtml(t('orderProductCount'))}</small><b>${oq}</b></div><div><small>${escapeHtml(t('orderDueDate'))}</small><b class="order-deadline ${orderDeadlineClass({...o,status:auto})}">${escapeHtml(formatDeadline(o))}</b></div><div><small>${escapeHtml(t('orderCreatedDate'))}</small><b>${escapeHtml(o.date||'—')}</b></div><div><small>${escapeHtml(t('orderCurrentStatus'))}</small>${orderStatusCellHtml(o,auto)}</div><div class="full"><small>${escapeHtml(t('orderComment'))}</small><b>${escapeHtml(o.comment||'—')}</b></div></div></section>`;
  if(!includeOperational)return basics;
  const matPct=calcOrderMaterialPercent(o),prod=orderProductionPercentForCard(o),prodLbl=t('orderStageProduction');
  return basics+orderResponsibilityHtml(o)+`<div class="order-operational-data"><div class="order-detail-progress"><div><span>${escapeHtml(u42('materials'))}</span><b>${matPct}%</b><i><em style="width:${matPct}%"></em></i></div><div><span>${escapeHtml(prodLbl)}</span><b>${prod}%</b><i><em style="width:${prod}%"></em></i></div></div>${orderMaterialsDetailHtml(o)}</div>`;
}
function orderTechnologySummaryHtml(o){
  const steps=orderSteps(o),items=orderMaterials(o),missing=orderMissingItems(o),total=calcOrderMinutes(o);
  const missingList=!items.length?`<div class="order-tech-unknown">${escapeHtml(t('materialsNotSpecifiedYet'))}</div>`:missing.length?`<ul>${missing.map(({item,state})=>{const m=state.av.mat,unit=state.av.unit||item.unit||'',ordered=orderItemPurchaseStatus(item)==='ordered';return `<li><b>${escapeHtml(m?materialTitle(m):t('deletedMaterial'))}</b><span class="${ordered?'ordered-text':''}">— ${escapeHtml(ordered?`${t('ordered')}: ${qtyWithUnit(orderItemPurchaseQty(item,state.av.missing),unit)}`:qtyWithUnit(state.av.missing,unit))}</span></li>`}).join('')}</ul>`:`<div class="order-tech-ok">✓ ${escapeHtml(t('nothingToOrder'))}</div>`;
  return `<div class="order-tech-bottom"><section class="order-tech-card order-purchase-summary"><h4>${escapeHtml(t('whatToOrder'))}</h4>${missingList}</section><section class="order-tech-card"><h4>${escapeHtml(t('technologyTotals'))}</h4><div class="order-tech-totals"><div><small>${escapeHtml(t('totalOperations'))}</small><b>${steps.length}</b></div><div><small>${escapeHtml(t('totalTime'))}</small><b>${total} ${escapeHtml(t('minutesShort'))}</b></div><div><small>${escapeHtml(t('materialsCount'))}</small><b>${items.length}</b></div><div><small>${escapeHtml(t('missingMaterialsCount'))}</small><b class="${missing.length?'danger-text':''}">${missing.length}</b></div></div></section></div>`;
}
function technologyMaterialStatus(o,item){const per=orderItemPerUnitQty(item,o),state=orderMaterialLineState(item,o.id),need=Number(item.qty||0),available=Number(state.av.available||0),reserved=Number(state.av.mat?reservedQty(state.av.mat):0),ordered=orderItemPurchaseQty(item,state.av.missing);if(per<=0||need<=0)return {tone:'idle',label:t('materialUsageNotSpecified'),state};if(orderItemPurchaseStatus(item)==='ordered')return {tone:'blue',label:`${t('ordered')}: ${qtyWithUnit(ordered,state.av.unit||item.unit)}`,state};if(available<=0)return {tone:'bad',label:t('needToPurchase'),state};if(available<need)return {tone:'warn',label:t('partiallyAvailable'),state};if(reserved>=need)return {tone:'ok',label:t('reservedDone'),state};return {tone:'ok',label:t('materialsAvailableStatus'),state}}
function technologyMaterialRowHtml(o,item,index){const m=(data.materials||[]).find(x=>String(x.id)===String(item.materialId)),category=item.category||m?.category||'Поролон',unit=((m?.unit==='рулон'&&(category==='Ткань'||category==='Экокожа'))?orderUnitForMaterial(m,category):(item.unit||orderUnitForMaterial(m,category))),workshop=materialWorkshopForItem(item,m),per=orderItemPerUnitQty({...item,unit},o),total=calcOrderItemTotalQty(per,orderProductQty(o),unit),effective={...item,qty:total,perUnitQty:per,unit,workshop},status=technologyMaterialStatus(o,effective),shortage=Math.max(0,Number(status.state.av.missing||0)),showOrder=per>0&&(shortage>0||orderItemPurchaseStatus(item)==='ordered'),orderQty=orderItemPurchaseQty(item,shortage);return `<div class="technology-material-row"><div class="field"><label>${escapeHtml(u42('category'))}</label><select class="select" onchange="updateTechnologyMaterial('${o.id}',${index},'category',this.value)">${ORDER_MATERIAL_CATS.map(cat=>`<option value="${cat}" ${cat===category?'selected':''}>${escapeHtml(categoryLabel(cat))}</option>`).join('')}</select></div><div class="field"><label>${escapeHtml(u42('material'))}</label><select class="select" onchange="updateTechnologyMaterial('${o.id}',${index},'materialId',this.value)">${materialOptions(category,item.materialId)}</select></div><div class="field"><label>Цех</label><select class="select" onchange="updateTechnologyMaterial('${o.id}',${index},'workshop',this.value)">${materialWorkshopOptions(o,workshop)}</select></div><div class="field"><label>${escapeHtml(u42('perOne'))}</label><input class="input" type="number" min="0" step="0.01" value="${Number(per||0)}" onchange="updateTechnologyMaterial('${o.id}',${index},'perUnitQty',this.value)"></div><div class="field"><label>${escapeHtml(u42('totalNeed'))}</label><div class="readonly-pill">${escapeHtml(qtyWithUnit(total,unit))}</div></div><div class="field"><label>${escapeHtml(u42('unit'))}</label><select class="select" onchange="updateTechnologyMaterial('${o.id}',${index},'unit',this.value)">${orderUnitOptions(category,unit)}</select></div><button class="iconbtn order-tech-remove" type="button" aria-label="${escapeHtml(t('removeMaterial'))}" onclick="removeTechnologyMaterial('${o.id}',${index})">×</button><div class="technology-material-status ${status.tone}"><span>${escapeHtml(status.label)} · ${escapeHtml(workshop||'цех не указан')}</span>${showOrder?`<div class="technology-order-controls"><label>${escapeHtml(t('orderedQuantity'))}</label><input class="input" id="technologyOrderQty_${o.id}_${index}" type="number" min="0.01" step="0.01" value="${Number(orderQty||0)}"><button class="btn small" type="button" onclick="markTechnologyMaterialOrdered('${o.id}',${index})">${escapeHtml(t('markAsOrdered'))}</button></div>`:''}</div></div>`}
function orderTechnologyMaterialsHtml(o){const items=orderMaterials(o),buttons=`<div class="actions order-tech-actions"><button class="btn primary order-tech-cta" type="button" onclick="openTechnologyMaterials('${o.id}')">＋ ${escapeHtml(t('addMaterialFromStock'))}</button><button class="btn order-tech-cta secondary" type="button" onclick="openTechnologyNewMaterial('${o.id}')">＋ ${escapeHtml(t('addNewMaterialToStock'))}</button></div>`;return `<section class="order-tech-card"><div class="order-tech-head"><div><h4>${escapeHtml(t('technologyMaterials'))}</h4><p>${escapeHtml(t('materialsReserveHint'))}</p></div>${buttons}</div><div class="technology-material-list">${items.map((item,index)=>technologyMaterialRowHtml(o,item,index)).join('')||`<div class="order-tech-empty order-tech-empty-action"><b>${escapeHtml(t('technologyMaterials'))}</b><span>${escapeHtml(t('noTechnologyMaterials'))}</span></div>`}</div></section>`}
function orderTechnologyHtml(o){const inProduction=['В производстве','В работе','Готов'].includes(String(o.status||''));const action=inProduction?`<button class="btn primary order-to-production" type="button" onclick="saveProductionTechnologyEdit('${o.id}')">${escapeHtml(currentLang==='ru'?'Редактировать технологию':currentLang==='en'?'Edit technology':'Rediģēt tehnoloģiju')}</button>`:`<button class="btn primary order-to-production" type="button" onclick="transferOrderToProduction('${o.id}')">${escapeHtml(t('transferToProduction'))} →</button>`;return `<div class="order-technology-screen">${orderTechnologyOperationsHtml(o)}${orderTechnologyMaterialsHtml(o)}${orderTechnologySummaryHtml(o)}<div class="order-tech-footer-actions"><button class="btn order-save-technology" type="button" onclick="saveTechnologyForLater('${o.id}')">${escapeHtml(t('saveAndContinueLater'))}</button>${action}</div></div>`}
function orderTechnologyOperationsHtml(o){const qty=orderProductQty(o),steps=orderSteps(o),presets=['Столярка','Швейный цех','Поклейка','Тапицерка','Сборка','Упаковка'],addBtn=`<button class="btn primary order-tech-cta" type="button" onclick="addTechnologyOperation('${o.id}')">＋ ${escapeHtml(t('addOperation'))}</button>`;return `<section class="order-tech-card"><div class="order-tech-head"><div><h4>${escapeHtml(t('techOperations'))}</h4><p>${escapeHtml(t('techOperationsHint'))}</p></div>${addBtn}</div>${steps.length?`<div class="order-tech-table-scroll"><table class="order-tech-table"><thead><tr><th>${escapeHtml(t('operationStage'))}</th><th>${escapeHtml(t('timePerItem'))}</th><th>${escapeHtml(t('orderProductCount'))}</th><th>${escapeHtml(t('totalTime'))}</th><th>${escapeHtml(t('responsibleOptional'))}</th><th></th></tr></thead><tbody>${steps.map((s,index)=>`<tr><td><div class="technology-stage-picker"><select class="select" aria-label="${escapeHtml(t('operationTemplate'))}" onchange="applyTechnologyOperationTemplate('${o.id}',${index},this.value)"><option value="">${escapeHtml(t('chooseOperationTemplate'))}</option>${presets.map(name=>`<option value="${escapeHtml(name)}" ${s.name===name?'selected':''}>${escapeHtml(workshopLabel(name))}</option>`).join('')}</select><input class="input" value="${escapeHtml(s.name||'')}" placeholder="${escapeHtml(t('customOperationName'))}" onchange="updateTechnologyOperation('${o.id}',${index},'name',this.value)"></div></td><td><div class="order-tech-time"><input class="input" type="number" min="0" step="1" value="${Number(s.minutes||0)}" onchange="updateTechnologyOperation('${o.id}',${index},'minutes',this.value)"><span>${escapeHtml(t('minutesShort'))}</span></div></td><td><b>${qty}</b></td><td><b>${Number(s.minutes||0)*qty} ${escapeHtml(t('minutesShort'))}</b></td><td><input class="input" value="${escapeHtml(s.responsible||'')}" placeholder="${escapeHtml(t('notSpecified'))}" onchange="updateTechnologyOperation('${o.id}',${index},'responsible',this.value)"></td><td><button class="iconbtn order-tech-remove" type="button" aria-label="${escapeHtml(t('deleteOperation'))}" onclick="removeTechnologyOperation('${o.id}',${index})">×</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="order-tech-empty order-tech-empty-action"><b>${escapeHtml(t('techOperations'))}</b><span>${escapeHtml(t('techOperationsHint'))}</span></div>`}</section>`}
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
function productionMeta(o){if(!o.production||typeof o.production!=='object')o.production={logs:[]};if(!Array.isArray(o.production.logs))o.production.logs=[];if(!Array.isArray(o.production.operations))o.production.operations=[];return o.production}
function applyProductionConsumptionPlan(o,op,plan,sessionId){
  normalizeOrderConsumptionFields(o);
  const log={id:uid(),sessionId,stepIndex:Number(op.stepIndex),stepName:op.stepName,qty:plan.qty,at:productionNow(),by:productionActorName(),materials:[]};
  plan.rows.forEach(r=>{
    r.m.quantity=stockNumForUnit(Math.max(0,r.materialStockAfter),r.materialUnit);
    r.m.lastUpdated=today();
    r.m.attributes=r.m.attributes||{};
    r.m.attributes.stockChangedBy=productionActorName();
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
function productionOps(o){return ensureWorkflowProduction(o).operations.filter(op=>Number(orderSteps(o)[op.stepIndex]?.minutes||0)>0)}
function productionOp(o,index){return ensureWorkflowProduction(o).operations.find(op=>Number(op.stepIndex)===Number(index))}
function productionPlanMinutesForStep(o,index){const step=orderSteps(o)[Number(index)]||{};return Math.max(0,Math.round(Number(step.minutes||0)*orderProductQty(o)))}
function productionActualMinutes(op){if(!op)return 0;if(op.status==='running')return Math.max(Number(op.actualMinutes||0),productionMinutesBetween(op.startedAt)-Number(op.pauseMinutes||0));return Math.max(0,Math.round(Number(op.actualMinutes||0)))}
function productionCompletedQty(o,op){if(!op)return 0;const total=orderProductQty(o);if(op.status==='done'&&op.completedQty==null)return total;return Math.max(0,Math.min(total,Math.trunc(Number(op.completedQty||0))))}
function productionOpPercent(o,op){if(!op||op.status==='cancelled')return 0;return Math.round(productionCompletedQty(o,op)/orderProductQty(o)*100)}
function calcWorkflowProductionPercent(o){const ops=productionOps(o).filter(op=>op.status!=='cancelled');if(!ops.length)return 0;const total=orderProductQty(o)*ops.length,done=ops.reduce((sum,op)=>sum+productionCompletedQty(o,op),0);return Math.max(0,Math.min(100,Math.round(done/total*100)))}
function productionDoneCount(o){return productionOps(o).filter(op=>op.status==='done').length}
function productionRunningCount(o){return productionOps(o).filter(op=>op.status==='running'||op.status==='paused').length}
function productionCurrentOp(o){return productionOps(o).find(op=>op.status==='running')||productionOps(o).find(op=>op.status==='paused')||productionOps(o).find(op=>op.status==='not_started')||null}
function productionLeftMinutes(o){return productionOps(o).reduce((sum,op)=>op.status==='done'||op.status==='cancelled'?sum:sum+Math.max(0,productionPlanMinutesForStep(o,op.stepIndex)-productionActualMinutes(op)),0)}
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
  rows.sort((a,b)=>String(a.order.dueDate||a.order.date||'').localeCompare(String(b.order.dueDate||b.order.date||'')));
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
  const active=queue.filter(row=>['В работе','В производстве'].includes(String(row.order.status||''))).length;
  const overdue=queue.filter(row=>row.order.dueDate&&row.order.dueDate<todayStr).length;
  const etaMap=workshopQueueEtaMap(queue);
  const atRisk=queue.filter(row=>{
    if(!row.order.dueDate||row.order.dueDate<todayStr)return false; // уже просрочен — считается отдельно
    const eta=etaMap.get(`${row.order.id}_${row.index}`);
    return !!eta&&eta>row.order.dueDate;
  }).length;
  const plan=queue.reduce((s,row)=>s+productionPlanMinutesForStep(row.order,row.index),0);
  const actual=queue.reduce((s,row)=>s+productionActualMinutes(productionOp(row.order,row.index)),0);
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
let workshopsStatusFilter='all';
function allWorkshopNames(){
  const names=[];
  DEFAULT_ORDER_STEPS.forEach(s=>{if(s.name&&!names.includes(s.name))names.push(s.name)});
  (data.orders||[]).forEach(o=>orderSteps(o).forEach(s=>{if(s.name&&!names.includes(s.name))names.push(s.name)}));
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
function workshopsStatBarHtml(stat){
  return `<div class="workshops-stat-bar">
    <div><span>📋</span><div><small>${escapeHtml(t('queue'))}${infoBtn('queue')}</small><b>${stat.queue}</b></div></div>
    <div><span>▶</span><div><small>${escapeHtml(t('prodInProgress'))}${infoBtn('active')}</small><b>${stat.active}</b></div></div>
    <div><span>⏱</span><div><small>${escapeHtml(t('plannedTime'))}${infoBtn('plannedTime')}</small><b>${stat.plan} ${escapeHtml(t('minutesShort'))}</b></div></div>
    <div><span>⏱</span><div><small>${escapeHtml(t('actualTime'))}${infoBtn('actualTime')}</small><b>${stat.actual} ${escapeHtml(t('minutesShort'))}</b></div></div>
    <div><span>⚠</span><div><small>${escapeHtml(t('overdue'))}${infoBtn('overdue')}</small><b class="${stat.overdue?'danger-text':''}">${stat.overdue}</b></div></div>
    <div><span>📈</span><div><small>${escapeHtml(t('prodLoad'))}${infoBtn('load')}</small><b>${stat.load}%</b></div></div>
  </div>`;
}
function workshopsSummaryBarHtml(names){
  const stats=names.map(n=>workshopAnalytics(n));
  const queue=stats.reduce((s,x)=>s+x.queue.length,0);
  const active=stats.reduce((s,x)=>s+x.active,0);
  const plan=stats.reduce((s,x)=>s+x.plan,0);
  const actual=stats.reduce((s,x)=>s+x.actual,0);
  const overdue=stats.reduce((s,x)=>s+x.overdue,0);
  const load=stats.length?Math.round(stats.reduce((s,x)=>s+x.load,0)/stats.length):0;
  return workshopsStatBarHtml({queue,active,plan,actual,overdue,load});
}
function workshopOverviewRowHtml(name){
  const stat=workshopAnalytics(name);
  const overdue=stat.overdue>0;
  const overCapacity=!overdue&&stat.load>=100;
  const atRisk=!overdue&&!overCapacity&&stat.atRisk>0;
  const nearCapacity=!overdue&&!overCapacity&&!atRisk&&stat.load>=80;
  const cls=overdue||overCapacity?'danger':atRisk||nearCapacity?'warn':'';
  const note=overdue?`⚠ ${stat.overdue} ${escapeHtml(t('overdue')).toLowerCase()}`:overCapacity?`⚠ ${escapeHtml(t('prodWarnOverloaded'))} (${stat.load}%)`:atRisk?`⚠ ${escapeHtml(t('workshopRiskShort'))} — ${stat.atRisk}`:nearCapacity?`⚠ ${stat.load}% ${escapeHtml(t('prodLoad')).toLowerCase()}`:'';
  return `<button type="button" class="workshop-list-row ${cls}" onclick="openWorkshopDetail('${jsStrArg(name)}')">
    <span class="workshop-list-row-icon">${workshopIcon(name)}</span>
    <span class="workshop-list-row-name"><b>${escapeHtml(workshopLabel(name))}</b></span>
    <span class="workshop-list-row-badge">${workshopStatusBadgeHtml(stat.queue)}</span>
    <span class="workshop-list-row-stat">${stat.queue.length}</span>
    <span class="workshop-list-row-stat">${stat.active}</span>
    <span class="workshop-list-row-note">${note}</span>
    <span class="workshop-list-row-arrow">›</span>
  </button>`;
}
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
    return d||String(a.order.dueDate||a.order.date||'').localeCompare(String(b.order.dueDate||b.order.date||''));
  });
  return rows;
}
function todayCompletedUnitsCount(){
  const todayStr=today();
  let sum=0;
  (data.orders||[]).forEach(o=>{
    const logs=ensureWorkflowProduction(o).consumptionLogs||[];
    logs.forEach(l=>{if(!l.undone&&String(l.at||'').slice(0,10)===todayStr)sum+=Number(l.qty||0)});
  });
  return sum;
}
function activeElapsedElId(orderId,stepIndex){return `activeElapsed_${orderId}_${stepIndex}`}
function workshopsActiveNowHtml(){
  const rows=currentlyActiveOperations();
  const doneToday=todayCompletedUnitsCount();
  const list=rows.length?rows.map(r=>{
    const total=orderProductQty(r.order),completed=productionCompletedQty(r.order,r.op),pct=productionOpPercent(r.order,r.op);
    const running=r.op.status==='running';
    return `<button type="button" class="workshops-active-row ${running?'running':'paused'}" onclick="openWorkshopDetail('${jsStrArg(r.workshopName)}')">
      <span class="workshops-active-icon">${workshopIcon(r.workshopName)}</span>
      <span class="workshops-active-name"><b>${escapeHtml(workshopLabel(r.workshopName))}</b><small>${escapeHtml(r.order.number||'—')}${r.order.client?` · ${escapeHtml(r.order.client)}`:''}</small></span>
      <span class="workshops-active-status"><span class="workshops-active-dot ${running?'running':'paused'}"></span>${running?escapeHtml(t('prodStatusRunning')):escapeHtml(t('prodStatusPaused'))}</span>
      <span class="workshops-active-time"><small>${escapeHtml(t('startedAtPrefix'))} ${escapeHtml(productionStartedAtText(r.op.startedAt))}</small><b id="${activeElapsedElId(r.order.id,r.op.stepIndex)}">${escapeHtml(orderTimeText(productionActualMinutes(r.op)))}</b></span>
      <span class="workshops-active-progress"><i><b style="width:${pct}%"></b></i></span>
      <span class="workshops-active-qty">${completed} / ${total}</span>
    </button>`;
  }).join(''):`<div class="workshop-empty">${escapeHtml(t('nothingActiveNow'))}</div>`;
  return `<div class="workshops-active-panel">
    <div class="workshops-active-head"><h4>⏱ ${escapeHtml(t('activeNowHeading'))}</h4><span class="workshops-active-today">${escapeHtml(t('doneTodayLabel'))}: <b>${doneToday} ${escapeHtml(t('unitPieces'))}</b></span></div>
    <div class="workshops-active-list">${list}</div>
  </div>`;
}
function refreshActiveElapsedTimers(){
  const workshopsSection=document.getElementById('workshops');
  if(!workshopsSection||!workshopsSection.classList.contains('active')||selectedWorkshopName)return;
  currentlyActiveOperations().forEach(r=>{
    if(r.op.status!=='running')return;
    const el=document.getElementById(activeElapsedElId(r.order.id,r.op.stepIndex));
    if(el)el.textContent=orderTimeText(productionActualMinutes(r.op));
  });
}
if(typeof window!=='undefined')setInterval(()=>{if(typeof refreshActiveElapsedTimers==='function')refreshActiveElapsedTimers()},30000);
function workshopMatchesStatusFilter(name,filter){
  if(!filter||filter==='all')return true;
  const stat=workshopAnalytics(name);
  if(filter==='overdue')return stat.overdue>0;
  if(filter==='atrisk')return stat.atRisk>0;
  const {running,paused}=workshopOpStatusCounts(stat.queue);
  if(filter==='running')return running>0;
  if(filter==='paused')return paused>0;
  if(filter==='idle')return running===0&&paused===0;
  return true;
}
function setWorkshopsStatusFilter(key){workshopsStatusFilter=key;renderWorkshops()}
function workshopsFilterChipsHtml(){
  const items=[['all',t('all')],['running',t('prodStatusRunning')],['paused',t('prodStatusPaused')],['idle',t('prodQueueWaiting')],['overdue',t('overdue')],['atrisk',t('filterAtRisk')]];
  return `<div class="quick-filter-row" id="workshopsFilterRow">${items.map(([key,label])=>`<button type="button" class="filter-chip${workshopsStatusFilter===key?' active':''}" data-filter="${key}" onclick="setWorkshopsStatusFilter('${key}')">${escapeHtml(label)}</button>`).join('')}</div>`;
}
function workshopLoadRowHtml(name){
  const stat=workshopAnalytics(name);
  const overCapacity=stat.load>=100,nearCapacity=!overCapacity&&stat.load>=80;
  const cls=overCapacity?'danger':nearCapacity?'warn':'';
  return `<button type="button" class="workshops-load-row ${cls}" onclick="openWorkshopDetail('${jsStrArg(name)}')">
    <span class="workshops-load-icon">${workshopIcon(name)}</span>
    <span class="workshops-load-name">${escapeHtml(workshopLabel(name))}</span>
    <span class="workshops-load-bar"><i style="width:${Math.min(100,stat.load)}%"></i></span>
    <span class="workshops-load-pct">${stat.load}%</span>
    <span class="workshops-load-qty">${stat.remainingQty} ${escapeHtml(t('unitPieces'))}</span>
  </button>`;
}
function workshopsLoadPanelHtml(names){
  if(!names.length)return '';
  const sorted=[...names].sort((a,b)=>workshopAnalytics(b).load-workshopAnalytics(a).load);
  return `<div class="workshops-load-panel">
    <div class="workshops-load-head"><h4>${escapeHtml(t('loadByWorkshopTitle'))}</h4><span class="workshops-load-hint">${escapeHtml(t('loadCapacityHintPrefix'))} ${Math.round(WORKSHOP_WEEKLY_CAPACITY_MINUTES/60)} ${escapeHtml(t('loadCapacityHintSuffix'))}</span></div>
    <div class="workshops-load-list">${sorted.map(workshopLoadRowHtml).join('')}</div>
  </div>`;
}
function workshopsOverviewHtml(){
  const names=allWorkshopNames();
  if(!names.length)return `<div class="workshop-empty">${escapeHtml(t('noWorkshopsYet'))}</div>`;
  const filtered=names.filter(n=>workshopMatchesStatusFilter(n,workshopsStatusFilter));
  const list=filtered.length?filtered.map(workshopOverviewRowHtml).join(''):`<div class="workshop-empty">${escapeHtml(t('noWorkshopsForFilter'))}</div>`;
  return `${workshopsSummaryBarHtml(names)}${workshopsFilterChipsHtml()}<div class="workshops-list-head"><span></span><span>${escapeHtml(t('workshopColumnHeader'))}</span><span></span><span>${escapeHtml(t('queue'))}</span><span>${escapeHtml(t('prodInProgress'))}</span><span></span><span></span></div><div class="workshops-list">${list}</div>${workshopsLoadPanelHtml(names)}${workshopsActiveNowHtml()}`;
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
  const dClass=orderDeadlineClass(o);
  const dueNote=dClass==='overdue'?`<span class="workshop-row-danger">· ${escapeHtml(t('overdue')).toLowerCase()}</span>`:dClass==='today'?`<span class="workshop-row-today">· ${escapeHtml(t('dueTodayNote'))}</span>`:'';
  const matNote=!coverage.ok?`<span class="workshop-row-danger">· ⚠ ${escapeHtml(t('missingMaterialsCount')).toLowerCase()}</span>`:'';
  const eta=etaMap?etaMap.get(`${o.id}_${row.index}`):null;
  const riskNote=(dClass!=='overdue'&&eta&&o.dueDate&&eta>o.dueDate)?`<span class="workshop-row-danger">· ⚠ ${escapeHtml(t('workshopRiskShort'))} (${escapeHtml(t('etaApprox'))} ${escapeHtml(eta)})</span>`:'';
  return `<div class="workshop-queue-item">
    <button type="button" class="workshop-queue-row ${status}" onclick="toggleWorkshopQueueItem('${o.id}',${op.stepIndex})">
      <span class="workshop-row-dot ${status}"></span>
      <span class="workshop-row-info">
        <b>${escapeHtml(o.number||'—')}</b>${o.client?`<em> · ${escapeHtml(o.client)}</em>`:''}
        <small>${escapeHtml(formatDeadline(o))} ${dueNote} ${riskNote} ${matNote}</small>
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
function workshopDetailHtml(name){
  const stat=workshopAnalytics(name);
  const cards=stat.queue.map(row=>workshopQueueItemHtml(row,stat.etaMap)).join('');
  return `<div class="workshop-detail-head">
      <button type="button" class="workshop-back-link" onclick="closeWorkshopDetail()">${escapeHtml(t('backToWorkshops'))}</button>
      <span class="workshop-detail-sep"></span>
      <h3>${workshopIcon(name)} ${escapeHtml(workshopLabel(name))}</h3>
      ${workshopStatusBadgeHtml(stat.queue)}
    </div>
    ${workshopsStatBarHtml({queue:stat.queue.length,active:stat.active,plan:stat.plan,actual:stat.actual,overdue:stat.overdue,load:stat.load})}
    ${stat.warnings.length?`<div class="production-warnings">${stat.warnings.map(w=>`<span>⚠ ${escapeHtml(w)}</span>`).join('')}</div>`:''}
    <div class="workshop-queue-list">${cards||`<div class="workshop-empty">${escapeHtml(t('prodQueueDone'))}</div>`}</div>`;
}
function renderWorkshops(){
  const el=document.getElementById('workshopsContent');
  if(!el)return;
  el.innerHTML=selectedWorkshopName?workshopDetailHtml(selectedWorkshopName):workshopsOverviewHtml();
  const desc=document.getElementById('workshopsTopbarDesc');
  if(desc)desc.textContent=selectedWorkshopName?`${t('workshopQueueForNamePrefix')} «${selectedWorkshopName}»`:t('workshopQueueAllDesc');
}
function productionWarnings(o){
  const names=[...new Set(orderSteps(o).filter(s=>Number(s.minutes||0)>0).map(s=>s.name).filter(Boolean))],list=[];
  names.forEach(name=>list.push(...workshopAnalytics(name).warnings));
  productionOps(o).forEach(op=>{const plan=productionPlanMinutesForStep(o,op.stepIndex),actual=productionActualMinutes(op);if(op.status==='running'&&actual>plan&&plan>0)list.push(`${op.stepName} ${t('prodWarnDelayed')} +${orderTimeText(actual-plan)}`);if(op.status==='running'&&productionMinutesBetween(op.startedAt)>1440)list.push(`${op.stepName} ${t('prodWarnDayOpen')}`)});
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
  if(!m)return `<b>${escapeHtml(t('deletedMaterial'))}</b>`;
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
    return `<button type="button" class="${rowOk?'material-row-ok':'material-row-warn'}" onclick="openProductionMaterialDetails('${item.materialId}')"><b>${escapeHtml(m?materialTitle(m):t('deletedMaterial'))}</b><span>${statusText} · ${detailText}</span></button>`;
  }).join('');
  const last=consumption.last?`<small>${escapeHtml(t('lastWriteOffLabel'))}: ${escapeHtml(consumption.last.qty)} ${escapeHtml(t('unitsGenitive'))} · ${escapeHtml(productionDateTimeText(consumption.last.at))}</small>`:`<small>${escapeHtml(t('lastWriteOffLabel'))}: —</small>`;
  return `<div class="production-op-materials ${coverage.ok?'ok':'warn'}"><strong>${coverage.ok?'✓':'⚠'} ${escapeHtml(title)}${infoBtn('materials')}</strong><em>${escapeHtml(t('materialsWrittenOffLabel'))}: ${escapeHtml(consumption.sets)} / ${escapeHtml(total)} ${escapeHtml(t('setsWord'))}</em>${last}${list?`<div>${list}</div>`:''}</div>`;
}
function productionSessionHistoryHtml(op){
  const sessions=Array.isArray(op.sessions)?op.sessions:[];
  if(!sessions.length)return '';
  return `<div class="production-session-list"><h5>${escapeHtml(t('sessionsByShiftTitle'))}${infoBtn('sessions')}</h5>${sessions.slice(0,4).map(s=>`<div><span><b>${escapeHtml(s.qty||0)} ${escapeHtml(t('unitPieces'))}</b><small>${escapeHtml(productionDateTimeText(s.startedAt))} → ${escapeHtml(productionDateTimeText(s.endedAt))}</small></span><strong>${escapeHtml(s.minutes||0)} ${escapeHtml(t('minutesShort'))}</strong><em>${escapeHtml(s.by||'—')}</em></div>`).join('')}</div>`;
}
function productionOperationCardHtml(o,op){
  const plan=productionPlanMinutesForStep(o,op.stepIndex),actual=productionActualMinutes(op),diff=actual-plan,pct=productionOpPercent(o,op),completed=productionCompletedQty(o,op),total=orderProductQty(o),state=productionQueueState(o.id,op.stepIndex),status=productionStatusClass(op.status),compact=op.status==='done'&&op.collapsed!==false,comments=Array.isArray(op.comments)?op.comments:[],toggleLabel=op.status==='running'?t('prodPause'):op.status==='paused'?t('prodContinue'):t('prodStart'),toggleIcon=op.status==='running'?'⏸':'▶';
  const canUndo=!!lastActiveConsumptionLog(o,op.stepIndex);
  return `<article class="production-operation-card ${status} ${compact?'compact':''}" id="productionOp_${o.id}_${op.stepIndex}"><div class="production-op-strip"></div><div class="production-op-main"><div class="production-op-heading"><div><h4>${workshopIcon(op.stepName)} ${escapeHtml(workshopLabel(op.stepName))}</h4><span>${escapeHtml(t('queue'))}: ${state.position?`${state.position} ${t('of')} ${state.total}`:state.label}</span></div><span class="production-status-pill ${status}">${escapeHtml(productionStatusLabel(op.status))}</span></div><div class="production-quantity-progress"><small>${escapeHtml(t('prodDone'))}${infoBtn('done')}</small><b>${completed} / ${total}</b></div><div class="production-op-progress"><i><b style="width:${pct}%"></b></i><strong>${pct}%</strong></div><div class="production-op-kpis"><div><span class="op-kpi-icon plan">📅</span><span><small>${escapeHtml(t('plan'))}${infoBtn('plan')}</small><b>${plan} ${escapeHtml(t('minutesShort'))}</b></span></div><div><span class="op-kpi-icon fact">▶</span><span><small>${escapeHtml(t('fact'))}${infoBtn('fact')}</small><b>${actual} ${escapeHtml(t('minutesShort'))}</b></span></div><div><span class="op-kpi-icon diff">📊</span><span><small>${escapeHtml(t('difference'))}${infoBtn('diff')}</small><b class="${diff>0?'danger-text':'ok-text'}">${diff>0?'+':''}${diff} ${escapeHtml(t('minutesShort'))}</b></span></div></div>${productionOperationMaterialStatusHtml(o,op)}${productionSessionHistoryHtml(op)}${diff>0?`<div class="production-delay">⚠ +${escapeHtml(orderTimeText(diff))}</div>`:''}${compact?`<button class="btn small" type="button" onclick="toggleProductionOperationCompact('${o.id}',${op.stepIndex})">${escapeHtml(t('expand'))}</button>`:`<div class="production-comment-box"><textarea class="input" id="prodComment_${o.id}_${op.stepIndex}" placeholder="${escapeHtml(t('prodCommentPlaceholder'))}">${escapeHtml(op.comment||'')}</textarea><button class="btn small" type="button" onclick="saveProductionComment('${o.id}',${op.stepIndex})">${escapeHtml(t('save'))}</button></div><div class="production-comments">${comments.slice(0,3).map(c=>`<div><b>${escapeHtml(c.by||'—')}</b><span>${escapeHtml(productionDateTimeText(c.at))}</span><p>${escapeHtml(c.text||'')}</p></div>`).join('')}</div>`}</div><div class="production-op-actions"><button class="btn small" type="button" onclick="closeWorkshopDetail()">${escapeHtml(t('backToAllWorkshops'))}</button><button class="btn small primary" type="button" onclick="toggleProductionOperation('${o.id}',${op.stepIndex})" ${op.status==='done'||op.status==='cancelled'?'disabled':''}>${toggleIcon} ${escapeHtml(toggleLabel)}</button><button class="btn small" type="button" onclick="completeProductionOperation('${o.id}',${op.stepIndex})" ${op.status==='cancelled'?'disabled':''}>✔ ${escapeHtml(t('prodComplete'))}</button><button class="btn small" type="button" onclick="undoLastProductionConsumption('${o.id}',${op.stepIndex})" ${canUndo?'':'disabled'}>${escapeHtml(t('undoWriteOff'))}</button></div></article>`;
}
function productionKpiHtml(o){
  const qty=orderProductQty(o),matCount=orderMaterials(o).length,plan=calcOrderMinutes(o),actual=productionOps(o).reduce((s,op)=>s+productionActualMinutes(op),0),pct=calcWorkflowProductionPercent(o),missing=orderMissingItems(o).length;
  const cards=[['📦',t('orderProductCount'),qty],['🧱',t('materialsCount'),matCount],['⏱',t('plannedTime'),`${plan} ${t('minutesShort')}`],['⏱',t('actualTime'),`${actual} ${t('minutesShort')}`],['📈',t('readiness'),`${pct}%`],['⚠',t('missingMaterialsCount'),missing]];
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
  try{syncMaterialReservations();await persistReservationMaterials()}catch(e){}
  refreshOrderWorkflow(o.id);
}
async function startProductionOperation(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op||op.status==='done')return;const now=productionNow();if(!op.startedAt)op.startedAt=now;if(op.status==='paused'&&op.pausedAt){const paused=productionMinutesBetween(op.pausedAt,now);op.pauseMinutes=Number(op.pauseMinutes||0)+paused;if(op.currentSessionStartedAt)op.currentSessionPauseMinutes=Number(op.currentSessionPauseMinutes||0)+paused;}if(!op.currentSessionStartedAt){op.currentSessionStartedAt=now;op.currentSessionPauseMinutes=0;}op.pausedAt='';op.status='running';o.status='В работе';await persistProductionWorkflow(o,`${tRu('historyProductionOperationStarted')}: ${op.stepName}`,'production_operation_started',{step:op.stepName})}
async function pauseProductionOperation(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op||op.status!=='running')return;op.status='paused';op.pausedAt=productionNow();await persistProductionWorkflow(o,`${tRu('historyProductionPaused')}: ${op.stepName}`,'production_operation_paused',{step:op.stepName})}
async function toggleProductionOperation(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(op?.status==='running')return pauseProductionOperation(orderId,index);return startProductionOperation(orderId,index)}
function completeProductionOperation(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op||op.status==='done')return;const remaining=orderProductQty(o)-productionCompletedQty(o,op);openModal(t('prodComplete'),`<div class="production-quantity-modal"><p>${escapeHtml(t('prodEnterCompletedQty'))}</p><input class="input" id="productionCompletedQty" type="number" min="1" max="${remaining}" step="1" value="${remaining}"><small>${escapeHtml(t('prodRemainingQty'))}: ${remaining}</small><div class="hint">${escapeHtml(t('partialCompleteHintPrefix'))} ${remaining} ${escapeHtml(t('unitsGenitive'))}.</div></div>`,`<button class="btn" type="button" onclick="closeModal()">${escapeHtml(t('cancel'))}</button><button class="btn primary" type="button" onclick="confirmProductionQuantity('${o.id}',${op.stepIndex})">${escapeHtml(t('confirm'))}</button>`);setTimeout(()=>document.getElementById('productionCompletedQty')?.select(),0)}
function confirmProductionQuantity(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op||op.status==='done')return;const input=document.getElementById('productionCompletedQty'),remaining=orderProductQty(o)-productionCompletedQty(o,op),qty=Math.trunc(Number(input?.value||0));if(!Number.isFinite(qty)||qty<1||qty>remaining){toast(t('prodInvalidQty'));return}const plan=productionConsumptionPlan(o,op,qty);const foot=plan.ok?`<button class="btn" type="button" onclick="closeModal()">${escapeHtml(t('cancel'))}</button><button class="btn primary" type="button" onclick="finalizeProductionQuantity('${o.id}',${op.stepIndex},${qty})">${escapeHtml(t('confirm'))}</button>`:`<button class="btn primary" type="button" onclick="completeProductionOperation('${o.id}',${op.stepIndex})">${escapeHtml(t('changeQuantity'))}</button>`;openModal(t('confirmWriteOffTitle'),productionConsumptionPreviewHtml(plan),foot)}
async function finalizeProductionQuantity(orderId,index,qty){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op||op.status==='done')return;const remaining=orderProductQty(o)-productionCompletedQty(o,op);qty=Math.trunc(Number(qty||0));if(!Number.isFinite(qty)||qty<1||qty>remaining){toast(t('prodInvalidQty'));return}const plan=productionConsumptionPlan(o,op,qty);if(!plan.ok){openModal(t('insufficientMaterialTitle'),productionConsumptionPreviewHtml(plan),`<button class="btn primary" type="button" onclick="completeProductionOperation('${o.id}',${op.stepIndex})">${escapeHtml(t('changeQuantity'))}</button>`);return}const now=productionNow();if(!op.startedAt)op.startedAt=now;if(!op.currentSessionStartedAt)op.currentSessionStartedAt=now;if(op.status==='paused'&&op.pausedAt){const paused=productionMinutesBetween(op.pausedAt,now);op.pauseMinutes=Number(op.pauseMinutes||0)+paused;op.currentSessionPauseMinutes=Number(op.currentSessionPauseMinutes||0)+paused;}const sessionStartedAt=op.currentSessionStartedAt,sessionMinutes=Math.max(0,productionMinutesBetween(sessionStartedAt,now)-Number(op.currentSessionPauseMinutes||0)),sessionId=uid();if(!Array.isArray(op.sessions))op.sessions=[];op.sessions.unshift({id:sessionId,startedAt:sessionStartedAt,endedAt:now,minutes:sessionMinutes,qty,by:productionActorName()});const log=applyProductionConsumptionPlan(o,op,plan,sessionId);op.sessions[0].consumptionId=log.id;op.completedQty=productionCompletedQty(o,op)+qty;op.actualMinutes=Math.max(0,Number(op.actualMinutes||0)+sessionMinutes);const fullyDone=op.completedQty>=orderProductQty(o);op.status=fullyDone?'done':'paused';op.pausedAt=fullyDone?'':now;op.finishedAt=fullyDone?now:'';op.currentSessionStartedAt='';op.currentSessionPauseMinutes=0;op.collapsed=fullyDone;productionMeta(o).logs.unshift({id:uid(),stepIndex:Number(index),stepName:op.stepName,qty,minutes:sessionMinutes,at:now,by:productionActorName(),source:fullyDone?'workflow-complete':'workflow-partial',consumptionId:log.id});if(fullyDone&&productionDoneCount(o)===productionOps(o).length)o.status='Готов';closeModal();const message=`${op.stepName}: ${tRu('completedMsgDone')} ${qty} ${tRu('unitsGenitive')}, ${tRu('materialsAutoWrittenOff')} (${log.materials.length} ${tRu('positionsWord')})`;await persistProductionWorkflow(o,message,fullyDone?'production_operation_completed':'production_operation_partial',{step:op.stepName,qty,minutes:sessionMinutes,completedQty:op.completedQty,totalQty:orderProductQty(o),fullyDone,consumptionId:log.id,materials:log.materials})}
async function undoLastProductionConsumption(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op)return;const log=lastActiveConsumptionLog(o,index);if(!log){toast(t('noWriteOffsToUndo'));return}if(!confirm(`${t('confirmUndoWriteOffPrefix')}: ${log.qty} ${t('unitsGenitive')}, ${t('operationWord')} ${op.stepName}?`))return;const now=productionNow();(log.materials||[]).forEach(row=>{const m=(data.materials||[]).find(x=>String(x.id)===String(row.materialId));const items=orderMaterials(o);const item=items[Number(row.lineIndex)]&&String(items[Number(row.lineIndex)].materialId)===String(row.materialId)?items[Number(row.lineIndex)]:items.find(i=>String(i.materialId)===String(row.materialId)&&materialWorkshopForItem(i,m)===String(log.stepName||''));if(m){const unit=m.unit||row.materialUnit||row.unit;m.quantity=stockNumForUnit(Number(m.quantity||0)+convertMaterialQty(Number(row.qty||0),row.unit,unit,m),unit);m.lastUpdated=today();m.attributes=m.attributes||{};m.attributes.stockChangedBy=productionActorName();m.attributes.stockChangedAt=now;}if(item){item.consumedQty=stockNumForUnit(Math.max(0,orderItemConsumedQty(item)-Number(row.qty||0)),item.unit||row.unit);item.consumedForQty=Math.max(0,orderItemConsumedForQty(item)-Number(row.forQty||log.qty||0));item.consumptionStatus=orderItemConsumptionStatus(item,o);if(Array.isArray(item.consumptionLogs))item.consumptionLogs=item.consumptionLogs.map(x=>String(x.id)===String(log.id)?{...x,undone:true,undoneAt:now,undoneBy:productionActorName()}:x);}});log.undone=true;log.undoneAt=now;log.undoneBy=productionActorName();op.completedQty=Math.max(0,productionCompletedQty(o,op)-Number(log.qty||0));op.actualMinutes=Math.max(0,Number(op.actualMinutes||0)-Number((op.sessions||[]).find(s=>String(s.consumptionId)===String(log.id))?.minutes||0));op.sessions=(op.sessions||[]).map(s=>String(s.consumptionId)===String(log.id)?{...s,undone:true,undoneAt:now}:s);productionMeta(o).logs.unshift({id:uid(),stepIndex:Number(index),stepName:op.stepName,qty:-Number(log.qty||0),minutes:0,at:now,by:productionActorName(),source:'consumption-undo',consumptionId:log.id});op.status=op.completedQty>0?'paused':'not_started';op.finishedAt='';op.collapsed=false;if(o.status==='Готов')o.status='В работе';try{if(typeof auditAdd==='function')auditAdd('production_material_undo','order',o.id,o.number,`${tRu('undoneLastWriteOff')}: ${op.stepName}, ${log.qty} ${tRu('unitsGenitive')}`,{orderId:o.id,orderNumber:o.number,step:op.stepName,qty:log.qty,materials:log.materials});}catch(e){}(log.materials||[]).forEach(row=>{try{if(typeof auditAdd==='function')auditAdd('production_material_undo','material',row.materialId,row.materialTitle,`${tRu('writeOffCancelledForOrder')} ${o.number}: ${op.stepName}, ${tRu('returnedWord')} ${qtyWithUnit(row.qty,row.unit)}`,{orderId:o.id,orderNumber:o.number,step:op.stepName,qty:row.qty,unit:row.unit});}catch(e){}});await persistProductionWorkflow(o,`${tRu('materialsWriteOffUndone')}: ${op.stepName}, ${log.qty} ${tRu('unitsGenitive')}`,'production_material_undo',{step:op.stepName,qty:log.qty,consumptionId:log.id});toast(t('undoneLastWriteOff'))}
async function saveProductionComment(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op)return;const text=document.getElementById(`prodComment_${orderId}_${index}`)?.value.trim()||'';op.comment=text;if(text){if(!Array.isArray(op.comments))op.comments=[];op.comments.unshift({id:uid(),by:productionActorName(),at:productionNow(),text});}await persistProductionWorkflow(o,`${tRu('historyProductionComment')}: ${op.stepName}`,'production_comment',{step:op.stepName,comment:text})}
function toggleProductionOperationCompact(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op)return;op.collapsed=!op.collapsed;save();refreshOrderWorkflow(orderId)}
async function transferOrderToCompletion(orderId){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;if(productionDoneCount(o)!==productionOps(o).length){toast(t('productionNotFinished'));return}orderWorkflowSelection.set(String(orderId),3);o.status='Готов';await persistProductionWorkflow(o,tRu('historyTransferredCompletion'),'production_to_completion',{})}
const COMPLETION_CHECKS=['master','technologist','quality','warehouse','client'];
const COMPLETION_DELAY_REASONS=['no_material','equipment','client_wait','rework','other'];
function completionActualMinutes(o){return productionOps(o).reduce((s,op)=>s+productionActualMinutes(op),0)}
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
  const cards=[['📦',t('orderProductCount'),orderProductQty(o)],['🧱',t('materialsUsed'),materials],['⏱',t('plannedTime'),`${plan} ${t('minutesShort')}`],['⏱',t('actualTime'),`${actual} ${t('minutesShort')}`],['↕',t('difference'),`${diff>0?'+':''}${diff} ${t('minutesShort')}`],['✔',t('completedOperations'),`${done} / ${ops.length}`]];
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
  const ops=productionOps(o),longest=ops.slice().sort((a,b)=>productionActualMinutes(b)-productionActualMinutes(a))[0],diff=completionDiffMinutes(o),c=orderCompletionData(o),result=orderCompletionClosed(o)?t('resultClosed'):productionDoneCount(o)===ops.length?t('resultReadyToClose'):t('resultInProgress');
  return `<section class="completion-card completion-analytics"><h4>${escapeHtml(t('completionAnalytics'))}</h4><div><span>${escapeHtml(t('longestStage'))}</span><b>${escapeHtml(longest?.stepName||'—')}</b></div><div><span>${escapeHtml(t('delayWhere'))}</span><b>${escapeHtml(diff>0?(c.delayReason?completionReasonLabel(c.delayReason):t('notSpecified')):t('noDelay'))}</b></div><div><span>${escapeHtml(t('timeEconomyOverrun'))}</span><b class="${diff>0?'danger-text':'ok-text'}">${diff>0?'+':''}${diff} ${escapeHtml(t('minutesShort'))}</b></div><div><span>${escapeHtml(t('overallResult'))}</span><b>${escapeHtml(result)}</b></div></section>`;
}
function completionPassportHtml(o){
  const plan=calcOrderMinutes(o),actual=completionActualMinutes(o),diff=actual-plan,c=orderCompletionData(o),ops=productionOps(o),timeline=completionTimelineRows(o).rows;
  const tech=orderSteps(o).map(s=>`<div><span>${escapeHtml(s.name||'—')}</span><b>${Number(s.minutes||0)} ${escapeHtml(t('minutesShort'))}</b></div>`).join('');
  const mats=orderMaterials(o).map(i=>{const st=orderMaterialLineState(i,o.id),m=st.av.mat,unit=st.av.unit||i.unit||'';return `<div><span>${escapeHtml(m?materialTitle(m):t('deletedMaterial'))}</span><b>${escapeHtml(qtyWithUnit(i.qty,unit))}</b></div>`}).join('')||`<em>${escapeHtml(t('noTechnologyMaterials'))}</em>`;
  const people=[...new Set(ops.map(op=>op.responsible).concat([o.meta?.createdBy,o.meta?.technologyBy,o.updatedBy]).filter(Boolean))].join(', ')||'—';
  return `<div class="passport-modal"><section><h4>${escapeHtml(t('passportBasic'))}</h4><div class="passport-grid"><div><small>${escapeHtml(t('orderNumberLabel'))}</small><b>${escapeHtml(o.number||'—')}</b></div><div><small>${escapeHtml(u42('orderClient'))}</small><b>${escapeHtml(o.client||'—')}</b></div><div><small>${escapeHtml(t('orderProductCount'))}</small><b>${orderProductQty(o)}</b></div><div><small>${escapeHtml(t('orderCurrentStatus'))}</small><b>${escapeHtml(calcOrderAutoStatus(o))}</b></div></div></section><section><h4>${escapeHtml(t('passportTechnology'))}</h4><div class="passport-lines">${tech}</div></section><section><h4>${escapeHtml(t('passportMaterials'))}</h4><div class="passport-lines">${mats}</div></section><section><h4>${escapeHtml(t('passportExecutors'))}</h4><p>${escapeHtml(people)}</p></section><section><h4>${escapeHtml(t('passportPlanFact'))}</h4><div class="passport-grid"><div><small>${escapeHtml(t('plannedTime'))}</small><b>${plan} ${escapeHtml(t('minutesShort'))}</b></div><div><small>${escapeHtml(t('actualTime'))}</small><b>${actual} ${escapeHtml(t('minutesShort'))}</b></div><div><small>${escapeHtml(t('difference'))}</small><b class="${diff>0?'danger-text':'ok-text'}">${diff>0?'+':''}${diff} ${escapeHtml(t('minutesShort'))}</b></div></div></section><section><h4>${escapeHtml(t('finalComment'))}</h4><p>${escapeHtml(c.comment||'—')}</p></section><section><h4>${escapeHtml(t('productionTimeline'))}</h4><div class="passport-timeline">${timeline.map(r=>`<div><i></i><span>${escapeHtml(r.text)}</span></div>`).join('')}</div></section></div>`;
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
async function saveTechnologyForLater(id){const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;markTechnologyStarted(o);auditAdd('technology_saved_later','order',o.id,o.number,tRu('historyTechnologySavedLater'));await persistTechnologyOrder(o);closeModal();renderOrders();toast(t('technologySavedLater'))}
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
async function transferOrderToProduction(id){const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;if(!hasOrderTechnology(o.steps)){toast(t('technologyRequired'));return}technologyAuditOnce(o);const from=o.status;if(typeof setOrderStatusPersisted==='function'){if(!await setOrderStatusPersisted(id,'В производстве')){if(String(o.status)!=='В производстве')return}}else{o.status='В производстве';save()}o.status='В производстве';save();orderWorkflowSelection.set(String(id),2);auditAdd('technology_to_production','order',o.id,o.number,tRu('historyTransferredProduction'),{from,to:'В производстве'});const root=document.getElementById('orderWorkflowModal');if(root){root.innerHTML=orderWorkflowStepperHtml(o,'modal')+orderWorkflowContentHtml(o,true);setCleanModalClass('order-clean-modal');renderOrders()}else refreshOrderStatusUI(id,false);toast(t('transferredProduction'))}
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
    const actual=productionOps(o).reduce((sum,op)=>sum+productionActualMinutes(op),0);
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
function renderOrders(){renderOrderStats();renderOrderClientFilter();const box=document.getElementById('ordersTable')||document.getElementById('ordersGrid');if(!box)return;const rows=filteredOrders();if(!rows.length){box.innerHTML=`<div class="empty"><b>${u42('noOrders')}</b>${u42('noOrdersHint')}</div>`;return}box.innerHTML=`<div class="order-card-list">${rows.map(o=>{const min=calcOrderMinutes(o),extra=orderAdditionalMinutesForCard(o),auto=calcOrderAutoStatus(o),expanded=expandedOrders.has(o.id),matPct=calcOrderMaterialPercent(o),prodPct=orderProductionPercentForCard(o),oq=orderProductQty(o),deadlineClass=orderDeadlineClass({...o,status:auto});return `<article class="order-erp-card ${expanded?'expanded':''}" data-order-id="${escapeHtml(o.id)}"><div class="order-card-summary"><button class="order-expand-btn" type="button" onclick="toggleOrderExpand(event,'${o.id}')" aria-label="${expanded?'Collapse':'Expand'}">${expanded?'▼':'▶'}</button><div class="order-card-number"><b>${escapeHtml(o.number)}${orderProductionMaterialWarningHtml(o)}</b><small>${escapeHtml(u42('clientPrefix'))}: ${escapeHtml(o.client||'—')}</small></div><div class="order-card-qty"><b>${oq} ${escapeHtml(u42('items'))}</b></div><div class="order-card-kv order-card-deadline"><small>${u42('deadline')}</small><b class="order-deadline ${deadlineClass}">${escapeHtml(formatDeadline(o))}</b></div><div class="order-card-kv order-card-time"><small>${u42('totalTime')}</small><b>${min} ${escapeHtml(t('minutesShort'))}</b>${extra>0?`<span>+${extra} ${escapeHtml(t('minutesShort'))}</span>`:''}</div><div class="order-card-state">${orderStatusCellHtml(o,auto)}${orderResponsibleCompactHtml(o)}${orderMiniProgressHtml(matPct,prodPct)}</div><div class="order-card-actions">${orderRowActions(o.id)}</div></div>${expanded?orderExpandedCardHtml(o):''}</article>`}).join('')}</div>`}


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
  const body=`<div class="form-grid order-manager-form">
    <div class="field"><label>${escapeHtml(t('orderNumberLabel'))}</label><input id="orderNumber" class="input" value="${escapeHtml(number)}"></div>
    <div class="field"><label>${escapeHtml(t('orderCustomer'))}</label><input id="orderClient" class="input" value="${escapeHtml(o?.client||'')}" placeholder="${escapeHtml(t('orderCustomerPlaceholder'))}"></div>
    <div class="field"><label>${escapeHtml(t('orderProduct'))}</label><input id="orderProduct" class="input" value="${escapeHtml(o?.product||'')}" placeholder="${escapeHtml(t('orderProductPlaceholder'))}"></div>
    <div class="field"><label>${escapeHtml(t('orderProductCount'))}</label><input id="orderProductQty" type="number" min="1" step="1" class="input" value="${orderProductQty(o||{})}"></div>
    <div class="field"><label>${escapeHtml(t('orderDueDate'))}</label><input id="orderDueDate" type="date" class="input" value="${escapeHtml(o?.dueDate||'')}"></div>
    <div class="field"><label>${escapeHtml(t('orderPriority'))}</label><select id="orderPriority" class="select"><option value="low" ${o?.priority==='low'?'selected':''}>${escapeHtml(t('priorityLow'))}</option><option value="normal" ${!o?.priority||o?.priority==='normal'?'selected':''}>${escapeHtml(t('priorityNormal'))}</option><option value="high" ${o?.priority==='high'?'selected':''}>${escapeHtml(t('priorityHigh'))}</option><option value="urgent" ${o?.priority==='urgent'?'selected':''}>${escapeHtml(t('priorityUrgent'))}</option></select></div>
    <div class="field full"><label>${escapeHtml(t('orderComment'))}</label><textarea id="orderComment" placeholder="${escapeHtml(t('orderCommentPlaceholder'))}">${escapeHtml(o?.comment||'')}</textarea></div>
  </div>
  <section class="order-notification-box"><h4>${escapeHtml(t('notificationTitle'))}</h4><label class="order-notification-toggle"><input id="notifyTechnologist" type="checkbox" ${notification.enabled!==false?'checked':''}> <span>${escapeHtml(t('notifyTechnologist'))}</span></label><div class="order-notification-methods"><small>${escapeHtml(t('notificationMethod'))}</small>${['internal','telegram','email','whatsapp'].map(method=>`<label><input type="radio" name="notificationMethod" value="${method}" ${notification.method===method?'checked':''}> <span>${escapeHtml(t(`notificationMethod_${method}`))}</span><em>${escapeHtml(t(`notificationMode_${method}`))}</em></label>`).join('')}</div></section>`;
  const foot=`<button class="btn" onclick="closeModal()">${u42('cancel')}</button><button class="btn primary" onclick="saveOrder('${id||''}')">${u42('save')}</button>`;
  openModal(id?u42('editOrder'):u42('addOrder'),body,foot);
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
async function saveManagerOrder(id=''){
  const productQty=orderProductQty({productQty:document.getElementById('orderProductQty')?.value||1});
  const prev=id?data.orders.find(o=>String(o.id)===String(id)):null;
  const isNew=!prev,notifyEnabled=!!document.getElementById('notifyTechnologist')?.checked,method=document.querySelector('input[name="notificationMethod"]:checked')?.value||'internal',now=productionNow();
  const notification={enabled:notifyEnabled,method,recipientRole:'technologist',state:notifyEnabled&&method==='internal'?'sent':'prepared',createdAt:now};
  let draft={...(prev||{}),id:id||uid(),number:document.getElementById('orderNumber').value.trim()||nextOrderNumber(id),client:document.getElementById('orderClient').value.trim(),product:document.getElementById('orderProduct').value.trim(),productQty,dueDate:document.getElementById('orderDueDate')?.value||'',priority:document.getElementById('orderPriority')?.value||'normal',comment:document.getElementById('orderComment').value.trim(),date:prev?.date||today(),status:isNew?'Ожидает технолога':prev.status,steps:prev?.steps||[],materials:prev?.materials||[],notification};
  if(typeof setOrderMetaForSave==='function')draft=setOrderMetaForSave(draft,prev);
  if(id)data.orders=data.orders.map(o=>String(o.id)===String(id)?draft:o);else data.orders.push(draft);
  if(isNew){
    if(!Array.isArray(data.notifications))data.notifications=[];
    if(notifyEnabled&&method==='internal')data.notifications.unshift({id:uid(),type:'order_assigned',channel:'internal',recipientRole:'technologist',orderId:draft.id,orderNumber:draft.number,title:t('notificationNewOrderTitle'),message:`${t('notificationNewOrderMessage')} ${draft.number}`,createdAt:now,read:false});
    if(typeof auditAdd==='function')auditAdd('order_to_technologist','order',draft.id,draft.number,tRu('historyOrderSentTechnologist'),{status:draft.status,notificationMethod:method,notified:notifyEnabled});
  }
  save();await persistReservationMaterials();closeModal();await loadMaterialsFromSupabase();renderAll();toast(u42('orderSaved'));if(isNew&&notifyEnabled){const notificationResult=await sendOrderNotification(draft,method);draft.notification.state=notificationResult?'sent':'failed';save()}
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
  const status=calcOrderAutoStatus(o),fields=[[t('orderNumberLabel'),o.number||'—'],[t('orderCustomer'),o.client||'—'],[t('orderProduct'),o.product||'—'],[t('orderProductCount'),orderProductQty(o)],[t('orderDueDate'),o.dueDate||'—'],[t('orderCreatedDate'),o.date||'—'],[t('orderPriority'),orderPriorityLabel(o.priority)],[t('orderCurrentStatus'),status]];
  const body=`<div class="order-info-view"><div class="order-info-grid">${fields.map(([label,value])=>`<div><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></div>`).join('')}<div class="full"><small>${escapeHtml(t('orderComment'))}</small><b>${escapeHtml(o.comment||'—')}</b></div></div>${orderInfoHistoryHtml(o)}${typeof cancelReviewPending==='function'&&cancelReviewPending(o)&&typeof cancelReviewHtml==='function'?cancelReviewHtml(o):''}</div>`;
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
