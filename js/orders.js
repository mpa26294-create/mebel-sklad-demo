function orderStatusClass(st){return {'Новый':'new','Готов к работе':'ready','Готов к производству':'ready','Не хватает материалов':'needbuy','Нужно заказать':'needbuy','Материалы заказаны':'orderedmat','В производстве':'production','В работе':'production','Ожидает материалы':'wait','Готов':'done','Отменён':'cancel'}[st]||'new'}
function orderTimeText(min){min=Math.max(0,Math.round(Number(min||0)));const h=Math.floor(min/60),m=min%60;return h?`${h} ч ${String(m).padStart(2,'0')} мин`:`${m} мин`}
function nextOrderNumber(excludeId=''){let max=0;(data.orders||[]).forEach(o=>{if(String(o.id)===String(excludeId))return;const m=String(o.number||'').match(/^Z-(\d{4})$/);if(m)max=Math.max(max,Number(m[1]));});return `Z-${String(max+1).padStart(4,'0')}`}
function orderMaterials(o){return Array.isArray(o.materials)?o.materials:[]}
const DEFAULT_ORDER_STEPS=[
  {name:'Раскрой материалов',minutes:0},
  {name:'Швейный цех',minutes:0},
  {name:'Столярный цех',minutes:0},
  {name:'Поклейка поролона',minutes:0},
  {name:'Тапицерские работы',minutes:0},
  {name:'Сборка',minutes:0},
  {name:'Упаковка',minutes:0}
];
function orderSteps(o){return Array.isArray(o.steps)?o.steps:DEFAULT_ORDER_STEPS.map(s=>({...s}))}
function calcOrderMinutes(o){const perOne=orderSteps(o).reduce((s,x)=>s+Number(x.minutes||0),0);return perOne*orderProductQty(o||{})}
function orderProductQty(o){const n=Number(o?.productQty||o?.qty||1);return Number.isFinite(n)&&n>0?Math.max(1,Math.trunc(n)):1}
function orderItemPerUnitQty(i,o){const oq=orderProductQty(o);const n=Number(i?.perUnitQty);if(Number.isFinite(n)&&n>0)return n;return Number(i?.qty||0)/oq}
function calcOrderItemTotalQty(perUnit, productQty, unit){return stockNumForUnit(Number(perUnit||0)*orderProductQty({productQty}),unit||'м²')}
function orderDeadlineClass(o){const d=o?.dueDate||'';if(!d)return '';const todayStr=today();if(d<todayStr && !['Готов','Отменён'].includes(calcOrderAutoStatus(o)))return 'overdue';if(d===todayStr)return 'today';return ''}
function formatDeadline(o){return o?.dueDate||'—'}
function materialReservedOutsideOrder(matId,excludeOrderId=''){return (data.orders||[]).filter(o=>String(o.id)!==String(excludeOrderId)&&!['Готов','Отменён'].includes(o.status)).flatMap(orderMaterials).filter(i=>String(i.materialId)===String(matId)).reduce((s,i)=>s+Number(i.qty||0),0)}
function orderItemAvailability(item,excludeOrderId=''){const m=data.materials.find(x=>String(x.id)===String(item.materialId));if(!m)return {ok:false,missing:Number(item.qty||0),available:0,stock:0,unit:item.unit||'',mat:null};const stock=stockNumForUnit(m.quantity,m.unit);const reservedOther=materialReservedOutsideOrder(m.id,excludeOrderId);const available=Math.max(0,stock-reservedOther);const need=Number(item.qty||0);return {ok:available>=need,missing:Math.max(0,need-available),available,stock,unit:m.unit,mat:m}}
function orderHasMaterialProblem(o){return orderMaterials(o).some(i=>!orderItemAvailability(i,o.id).ok)}

function orderItemPurchaseStatus(item){
  const v=item?.purchaseStatus||'';
  return ['need','ordered','none'].includes(v)?v:'';
}
function orderItemPurchaseQty(item,missing=0){
  const q=Number(item?.purchaseQty||0);
  return q>0?q:Math.max(0,Number(missing||0));
}
function orderPurchaseLabel(value){
  return ({need:'Нужно заказать',ordered:'Заказано',none:'Не нужно'})[value]||'Нужно заказать';
}
function orderMaterialLineState(item,excludeOrderId=''){
  const av=orderItemAvailability(item,excludeOrderId);
  const m=av.mat;
  if(!m) return {kind:'bad',label:'Материал удалён',av,purchaseStatus:'need',purchaseQty:Number(item?.purchaseQty||av.missing||0)};
  if(av.ok) return {kind:'ok',label:'Есть на складе',av,purchaseStatus:'none',purchaseQty:0};
  const status=orderItemPurchaseStatus(item)||'need';
  const qty=orderItemPurchaseQty(item,av.missing);
  if(status==='ordered') return {kind:'blue',label:'Заказано у поставщика',av,purchaseStatus:status,purchaseQty:qty};
  if(status==='none') return {kind:'bad',label:'Нужно заказать',av,purchaseStatus:'need',purchaseQty:Math.max(0,av.missing)};
  return {kind:'bad',label:'Нужно заказать',av,purchaseStatus:'need',purchaseQty:qty};
}
function calcOrderAutoStatus(o){
  if(['Готов','Отменён','В производстве','В работе'].includes(o.status)) return o.status==='В производстве'?'В работе':o.status;
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
    const need=Math.max(0,Number(i.qty||0));
    totalNeed += need;
    covered += Math.min(need, Math.max(0,Number(av.available||0)));
  });
  if(totalNeed<=0)return 0;
  return Math.max(0,Math.min(100,Math.round(covered/totalNeed*100)));
}
function calcOrderOverallPercent(o){
  if(o.status==='Готов')return 100;
  if(['В производстве','В работе'].includes(o.status))return Math.max(45,calcOrderMaterialPercent(o));
  const st=calcOrderAutoStatus(o);
  if(st==='Готов к работе')return 35;
  if(st==='Материалы заказаны')return 20;
  if(st==='Не хватает материалов')return Math.max(5,Math.min(25,Math.round(calcOrderMaterialPercent(o)*0.25)));
  return 5;
}

function orderMaterialsDetailHtml(o){
  const items=orderMaterials(o);
  if(!items.length)return '<div class="muted">Материалы не указаны</div>';
  return `<table class="order-material-detail-table"><thead><tr><th>Материал</th><th>Нужно</th><th>На складе</th><th>Резерв</th><th>Доступно</th><th>Состояние</th></tr></thead><tbody>${items.map(i=>{const st=orderMaterialLineState(i,o.id);const m=st.av.mat;const unit=st.av.unit||i.unit||'';let cls=st.kind==='ok'?'material-chip-ok':st.kind==='blue'?'material-chip-blue':st.kind==='warn'?'material-chip-warn':'material-chip-bad';let statusTitle=st.label;let statusSub='';if(st.av.missing>0){if(st.purchaseStatus==='ordered'){statusTitle=`Заказано ${qtyWithUnit(st.purchaseQty||st.av.missing,unit)}`;statusSub=i.purchaseNo?`№ ${i.purchaseNo}`:'у поставщика';cls='material-chip-blue';}else if(st.purchaseStatus==='none'){statusTitle='Не заказано';statusSub=`не хватает ${qtyWithUnit(st.av.missing,unit)}`;cls='material-chip-bad';}else{statusTitle=`Нужно заказать ${qtyWithUnit(st.purchaseQty||st.av.missing,unit)}`;statusSub='';cls='material-chip-warn';}}return `<tr><td><button type="button" class="link-btn" style="text-align:left;font-weight:600;padding:0;margin:0;text-decoration:none;color:#111" onclick="openOrderMaterialPurchase('${o.id}','${i.materialId}')">${escapeHtml(m?materialTitle(m):'Удалённый материал')}</button>${m?`<div class="sub">${escapeHtml(m.sku||'')}</div>`:''}</td><td>${escapeHtml(qtyWithUnit(i.qty,unit))}<div class="sub">на 1 шт: <strong>${escapeHtml(qtyWithUnit(orderItemPerUnitQty(i,o),unit))}</strong></div></td><td>${escapeHtml(qtyWithUnit(st.av.stock,unit))}</td><td>${escapeHtml(qtyWithUnit(m?reservedQty(m):0,unit))}</td><td>${escapeHtml(qtyWithUnit(st.av.available,unit))}</td><td><button type="button" class="order-status-compact" onclick="openOrderMaterialPurchase('${o.id}','${i.materialId}')"><span class="${cls}">${escapeHtml(statusTitle)}</span>${statusSub?`<div class="sub">${escapeHtml(statusSub)}</div>`:''}</button></td></tr>`}).join('')}</tbody></table>`;
}
function orderExpandedRow(o){
  const matPct=calcOrderMaterialPercent(o), overall=calcOrderOverallPercent(o), prod=o.status==='Готов'?100:(o.status==='В производстве'?45:0);
  return `<tr class="order-detail-row"><td colspan="6"><div class="order-detail-box"><div class="order-progress-grid"><div class="order-progress-card"><small>Материалы</small><b>${matPct}%</b><div class="order-bar"><span style="width:${matPct}%"></span></div></div><div class="order-progress-card"><small>Производство</small><b>${prod}%</b><div class="order-bar"><span style="width:${prod}%"></span></div></div><div class="order-progress-card"><small>Общий прогресс</small><b>${overall}%</b><div class="order-bar"><span style="width:${overall}%"></span></div></div></div>${orderMaterialsDetailHtml(o)}</div></td></tr>`;
}
function orderMissingItems(o){
  return orderMaterials(o).map(i=>({item:i,state:orderMaterialLineState(i,o.id)})).filter(x=>!x.state.av.ok);
}
function orderMissingRow(o){
  const missing=orderMissingItems(o);
  if(!missing.length)return '';
  const total=missing.reduce((s,x)=>s+Number(x.state.av.missing||0),0);
  return `<tr class="order-missing-row"><td colspan="6"><div class="order-missing-panel"><div class="order-missing-head"><b>Не хватает материалов</b><span>${missing.length} поз. · к заказу</span></div><div class="order-missing-list">${missing.map(({item,state})=>{const m=state.av.mat;const unit=state.av.unit||item.unit||'';const pCls=state.purchaseStatus==='ordered'?'ordered':state.purchaseStatus==='none'?'none':'need';return `<button type="button" class="order-missing-item" onclick="openOrderMaterialPurchase('${o.id}','${item.materialId}')"><div><div class="mi-title">${escapeHtml(m?materialTitle(m):'Удалённый материал')}</div><div class="mi-sub">${escapeHtml(m?.sku||'')} · нажмите, чтобы оформить закупку</div></div><div><small>Нужно</small><strong>${escapeHtml(qtyWithUnit(item.qty,unit))}</strong></div><div><small>Доступно</small><strong>${escapeHtml(qtyWithUnit(state.av.available,unit))}</strong></div><div class="mi-bad"><small>Заказать</small><strong>${escapeHtml(qtyWithUnit(state.av.missing,unit))}</strong></div><div><span class="purchase-pill ${pCls}">${escapeHtml(orderPurchaseLabel(state.purchaseStatus))}</span></div></button>`}).join('')}</div></div></td></tr>`;
}
function toggleOrderMissing(e,id){
  e.stopPropagation();
  if(missingExpandedOrders.has(id))missingExpandedOrders.delete(id);else missingExpandedOrders.add(id);
  renderOrders();
}

function toggleOrderExpand(e,id){e.stopPropagation(); if(expandedOrders.has(id))expandedOrders.delete(id);else expandedOrders.add(id); renderOrders();}
function orderMaterialSummary(o){const items=orderMaterials(o);if(!items.length)return '<span class="muted">Материалы не указаны</span>';return items.slice(0,2).map(i=>{const m=data.materials.find(x=>String(x.id)===String(i.materialId));const av=orderItemAvailability(i,o.id);return `<b>${escapeHtml(m?materialTitle(m):'Удалённый материал')}</b> — ${escapeHtml(qtyWithUnit(i.qty,av.unit||i.unit))}${av.ok?'':' · не хватает '+escapeHtml(qtyWithUnit(av.missing,av.unit||i.unit))}`}).join('<br>')+(items.length>2?`<br><span class="muted">+ ещё ${items.length-2}</span>`:'')}
function syncMaterialReservations(){const totals={};(data.orders||[]).forEach(o=>{if(['Готов','Отменён'].includes(o.status))return;orderMaterials(o).forEach(i=>{if(i.materialId)totals[i.materialId]=(totals[i.materialId]||0)+Number(i.qty||0)})});(data.materials||[]).forEach(m=>{m.attributes=m.attributes||{};m.attributes.reservedQty=stockNumForUnit(totals[m.id]||0,m.unit)})}

function filteredOrders(){const q=(document.getElementById('orderSearchInput')?.value||'').toLowerCase().trim();const st=document.getElementById('orderStatusFilter')?.value||'';const client=document.getElementById('orderClientFilter')?.value||'';const date=document.getElementById('orderDateFilter')?.value||'';const prob=document.getElementById('orderProblemFilter')?.value||'';return (data.orders||[]).filter(o=>{const mats=orderMaterials(o).map(i=>data.materials.find(m=>String(m.id)===String(i.materialId))).filter(Boolean).map(materialTitle).join(' ');const hay=(o.number+' '+o.client+' '+mats).toLowerCase();const hasProb=orderHasMaterialProblem(o);return (!q||hay.includes(q))&&(!st||calcOrderAutoStatus(o)===st)&&(!client||o.client===client)&&(!date||o.date===date)&&(!prob||(prob==='problem'?hasProb:!hasProb))}).sort((a,b)=>String(a.dueDate||a.date||'').localeCompare(String(b.dueDate||b.date||'')))}
function renderOrderStats(){const orders=data.orders||[];const stats=[['Всего заказов',orders.length],['Готовы к работе',orders.filter(o=>calcOrderAutoStatus(o)==='Готов к работе').length],['Не хватает материалов',orders.filter(o=>calcOrderAutoStatus(o)==='Не хватает материалов').length],['Заказано/едет',orders.filter(o=>calcOrderAutoStatus(o)==='Материалы заказаны').length]];const box=document.getElementById('orderStats');if(box)box.innerHTML=stats.map(([l,v])=>`<div class="stat"><div><span>${l}</span><b>${v}</b></div></div>`).join('')}
function renderOrderClientFilter(){const el=document.getElementById('orderClientFilter');if(!el)return;const current=el.value;const clients=[...new Set((data.orders||[]).map(o=>o.client).filter(Boolean))].sort();el.innerHTML='<option value="">Все заказчики</option>'+clients.map(c=>`<option ${c===current?'selected':''}>${escapeHtml(c)}</option>`).join('')}
function orderActionMenu(id){return `<div class="action-menu" id="orderMenu_${id}"><button class="action-menu-btn" type="button" onclick="toggleOrderMenu(event,'${id}')">⋯</button><div class="action-menu-list"><button type="button" onclick="openOrderView('${id}')">Открыть</button><button type="button" onclick="openOrderModal('${id}')">Редактировать</button><button type="button" onclick="startOrderWork('${id}')">В работу</button><button type="button" onclick="completeOrder('${id}')">Завершить</button><button type="button" onclick="cancelOrder('${id}')">Отменить</button><button type="button" class="danger" onclick="deleteOrder('${id}')">Удалить</button></div></div>`}
function closeOrderMenus(){document.querySelectorAll('.action-menu.open').forEach(x=>x.classList.remove('open'))}
function toggleOrderMenu(e,id){e.stopPropagation();const el=document.getElementById('orderMenu_'+id);const was=el?.classList.contains('open');closeOrderMenus();if(el&&!was)el.classList.add('open')}

function orderStatusCellHtml(o,auto){
  if(auto==='Не хватает материалов'){
    return `<button type="button" class="status ${orderStatusClass(auto)} status-action" onclick="toggleOrderMissing(event,'${o.id}')">${escapeHtml(auto)} ${missingExpandedOrders.has(o.id)?'⌃':'⌄'}</button>`;
  }
  if(['В работе','В производстве'].includes(auto) || ['В работе','В производстве'].includes(o.status)){
    return `<button type="button" class="status ${orderStatusClass(auto)} status-action" onclick="event.stopPropagation();openOrderProduction('${o.id}')">${escapeHtml(auto)}</button>`;
  }
  return `<span class="status ${orderStatusClass(auto)}">${escapeHtml(auto)}</span>`;
}
function renderOrders(){renderOrderStats();renderOrderClientFilter();const box=document.getElementById('ordersTable')||document.getElementById('ordersGrid');if(!box)return;const rows=filteredOrders();if(!rows.length){box.innerHTML='<div class="empty"><b>Заказов пока нет</b>Создайте заказ и зарезервируйте материалы со склада.</div>';return}box.innerHTML=`<div class="order-table-wrap"><table class="order-table"><thead><tr><th>№</th><th>Заказчик</th><th>Время</th><th>Статус</th><th>Срок</th><th></th></tr></thead><tbody>${rows.map(o=>{const min=calcOrderMinutes(o);const auto=calcOrderAutoStatus(o);const expanded=expandedOrders.has(o.id);const matPct=calcOrderMaterialPercent(o);const oq=orderProductQty(o);const compact=orderMaterials(o).slice(0,3).map(i=>{const m=data.materials.find(x=>String(x.id)===String(i.materialId));return m?`${m.sku||''} ${formatQty(i.qty,m.unit)}${unitLabel(m.unit)}`:''}).filter(Boolean).join(' · ');const deadlineClass=orderDeadlineClass({...o,status:auto});const main=`<tr ondblclick="openOrderView('${o.id}')"><td><button class="order-expand-btn" type="button" onclick="toggleOrderExpand(event,'${o.id}')">${expanded?'⌃':'⌄'}</button><span class="stock-sku">${escapeHtml(o.number)}</span></td><td class="order-client-cell"><div class="name">${escapeHtml(o.client||'—')}</div><div class="order-qty-pill">изделий: <b>${oq}</b></div>${compact?`<div class="order-compact-materials">${escapeHtml(compact)}${orderMaterials(o).length>3?' · …':''}</div>`:''}${o.comment?`<div class="sub">${escapeHtml(o.comment)}</div>`:''}</td><td class="order-time-cell"><b>${min} мин</b><br><span class="muted">${orderTimeText(min)}</span></td><td>${orderStatusCellHtml(o,auto)}<div class="sub">материалы ${matPct}%</div></td><td><span class="order-deadline ${deadlineClass}">${escapeHtml(formatDeadline(o))}</span><div class="sub">создан ${escapeHtml(o.date||'—')}</div></td><td>${orderActionMenu(o.id)}</td></tr>`;return main+(missingExpandedOrders.has(o.id)?orderMissingRow({...o,status:auto}):'')+(expanded?orderExpandedRow({...o,status:auto}):'')}).join('')}</tbody></table></div>`}

function clearOrderFilters(){['orderSearchInput','orderDateFilter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});['orderStatusFilter','orderClientFilter','orderProblemFilter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});renderOrders()}

function renderOrderStats(){const orders=data.orders||[];const stats=[[u42('totalOrders'),orders.length],[u42('readyToWork'),orders.filter(o=>calcOrderAutoStatus(o)==='Готов к работе').length],[u42('missingMaterials'),orders.filter(o=>calcOrderAutoStatus(o)==='Не хватает материалов').length],[u42('orderedMoving'),orders.filter(o=>calcOrderAutoStatus(o)==='Материалы заказаны').length]];const box=document.getElementById('orderStats');if(box)box.innerHTML=stats.map(([l,v])=>`<div class="stat"><div><span>${l}</span><b>${v}</b></div></div>`).join('')}
function renderOrderClientFilter(){const el=document.getElementById('orderClientFilter');if(!el)return;const current=el.value;const clients=[...new Set((data.orders||[]).map(o=>o.client).filter(Boolean))].sort();el.innerHTML=`<option value="">${u42('allClients')}</option>`+clients.map(c=>`<option value="${escapeHtml(c)}" ${c===current?'selected':''}>${escapeHtml(c)}</option>`).join('')}
function orderActionMenu(id){return `<div class="action-menu" id="orderMenu_${id}"><button class="action-menu-btn" type="button" onclick="toggleOrderMenu(event,'${id}')">⋯</button><div class="action-menu-list"><button type="button" onclick="openOrderView('${id}')">${u42('open')}</button><button type="button" onclick="openOrderModal('${id}')">${u42('edit')}</button><button type="button" onclick="startOrderWork('${id}')">${u42('toWork')}</button><button type="button" onclick="completeOrder('${id}')">${u42('complete')}</button><button type="button" onclick="cancelOrder('${id}')">${u42('cancelOrder')}</button><button type="button" class="danger" onclick="deleteOrder('${id}')">${u42('delete')}</button></div></div>`}
function renderOrders(){renderOrderStats();renderOrderClientFilter();const box=document.getElementById('ordersTable')||document.getElementById('ordersGrid');if(!box)return;const rows=filteredOrders();if(!rows.length){box.innerHTML=`<div class="empty"><b>${u42('noOrders')}</b>${u42('noOrdersHint')}</div>`;return}box.innerHTML=`<div class="order-table-wrap"><table class="order-table"><thead><tr><th>№</th><th>${u42('orderClient')}</th><th>${u42('time')}</th><th>${u42('status')}</th><th>${u42('deadline')}</th><th></th></tr></thead><tbody>${rows.map(o=>{const min=calcOrderMinutes(o);const auto=calcOrderAutoStatus(o);const expanded=expandedOrders.has(o.id);const matPct=calcOrderMaterialPercent(o);const oq=orderProductQty(o);const compact=orderMaterials(o).slice(0,3).map(i=>{const m=data.materials.find(x=>String(x.id)===String(i.materialId));return m?`${m.sku||''} ${formatQty(i.qty,m.unit)}${unitLabel(m.unit)}`:''}).filter(Boolean).join(' · ');const deadlineClass=orderDeadlineClass({...o,status:auto});const autoText=orderStatusText42(auto);const main=`<tr ondblclick="openOrderView('${o.id}')"><td><button class="order-expand-btn" type="button" onclick="toggleOrderExpand(event,'${o.id}')">${expanded?'⌃':'⌄'}</button><span class="stock-sku">${escapeHtml(o.number)}</span></td><td class="order-client-cell"><div class="name">${escapeHtml(o.client||'—')}</div><div class="order-qty-pill">${u42('items')}: <b>${oq}</b></div>${compact?`<div class="order-compact-materials">${escapeHtml(compact)}${orderMaterials(o).length>3?' · …':''}</div>`:''}${o.comment?`<div class="sub">${escapeHtml(o.comment)}</div>`:''}</td><td class="order-time-cell"><b>${min} ${u42('minutes').toLowerCase()}</b><br><span class="muted">${orderTimeText(min)}</span></td><td>${auto==='Не хватает материалов'?`<button type="button" class="status ${orderStatusClass(auto)} status-action" onclick="toggleOrderMissing(event,'${o.id}')">${escapeHtml(autoText)} ${missingExpandedOrders.has(o.id)?'⌃':'⌄'}</button>`:`<span class="status ${orderStatusClass(auto)}">${escapeHtml(autoText)}</span>`}<div class="sub">${u42('materialPct')} ${matPct}%</div></td><td><span class="order-deadline ${deadlineClass}">${escapeHtml(formatDeadline(o))}</span><div class="sub">${u42('created')} ${escapeHtml(o.date||'—')}</div></td><td>${orderActionMenu(o.id)}</td></tr>`;return main+(missingExpandedOrders.has(o.id)?orderMissingRow({...o,status:auto}):'')+(expanded?orderExpandedRow({...o,status:auto}):'')}).join('')}</tbody></table></div>`}

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
function orderMaterialsDetailHtml(o){
  const items=orderMaterials(o);
  if(!items.length)return `<div class="muted">${currentLang==='ru'?'Материалы не указаны':currentLang==='en'?'Materials not specified':'Materiāli nav norādīti'}</div>`;
  return `<table class="order-material-detail-table"><thead><tr><th>${u42('material')}</th><th>${u42('need')}</th><th>${u42('stock')}</th><th>${currentLang==='ru'?'Резерв':currentLang==='en'?'Reserved':'Rezervēts'}</th><th>${u42('available')}</th><th>${u42('status')}</th></tr></thead><tbody>${items.map(i=>{const st=orderMaterialLineState(i,o.id);const m=st.av.mat;const unit=st.av.unit||i.unit||'';let cls=st.kind==='ok'?'material-chip-ok':st.kind==='blue'?'material-chip-blue':st.kind==='warn'?'material-chip-warn':'material-chip-bad';let statusTitle=st.label;let statusSub='';if(st.av.missing>0){if(st.purchaseStatus==='ordered'){statusTitle=`${u42('ordered')} ${qtyWithUnit(st.purchaseQty||st.av.missing,unit)}`;statusSub=i.purchaseNo?`№ ${i.purchaseNo}`:(currentLang==='ru'?'у поставщика':currentLang==='en'?'from supplier':'pie piegādātāja');cls='material-chip-blue';}else{statusTitle=`${u42('needOrder')} ${qtyWithUnit(st.purchaseQty||st.av.missing,unit)}`;cls='material-chip-warn';}}return `<tr><td><button type="button" class="link-btn" style="text-align:left;font-weight:600;padding:0;margin:0;text-decoration:none;color:#111" onclick="openOrderMaterialPurchase('${o.id}','${i.materialId}')">${escapeHtml(m?materialTitle(m):u42('deletedMaterial'))}</button>${m?`<div class="sub">${escapeHtml(m.sku||'')}</div>`:''}</td><td>${escapeHtml(qtyWithUnit(i.qty,unit))}<div class="sub">${u42('perOne')}: <strong>${escapeHtml(qtyWithUnit(orderItemPerUnitQty(i,o),unit))}</strong></div></td><td>${escapeHtml(qtyWithUnit(st.av.stock,unit))}</td><td>${escapeHtml(qtyWithUnit(m?reservedQty(m):0,unit))}</td><td>${escapeHtml(qtyWithUnit(st.av.available,unit))}</td><td><button type="button" class="order-status-compact" onclick="openOrderMaterialPurchase('${o.id}','${i.materialId}')"><span class="${cls}">${escapeHtml(statusTitle)}</span>${statusSub?`<div class="sub">${escapeHtml(statusSub)}</div>`:''}</button></td></tr>`}).join('')}</tbody></table>`;
}
function orderExpandedRow(o){const matPct=calcOrderMaterialPercent(o),overall=calcOrderOverallPercent(o),prod=o.status==='Готов'?100:(o.status==='В производстве'?45:0);const prodLbl=currentLang==='ru'?'Производство':currentLang==='en'?'Production':'Ražošana';const overallLbl=currentLang==='ru'?'Общий прогресс':currentLang==='en'?'Overall progress':'Kopējais progress';return `<tr class="order-detail-row"><td colspan="6"><div class="order-detail-box"><div class="order-progress-grid"><div class="order-progress-card"><small>${u42('materials')}</small><b>${matPct}%</b><div class="order-bar"><span style="width:${matPct}%"></span></div></div><div class="order-progress-card"><small>${prodLbl}</small><b>${prod}%</b><div class="order-bar"><span style="width:${prod}%"></span></div></div><div class="order-progress-card"><small>${overallLbl}</small><b>${overall}%</b><div class="order-bar"><span style="width:${overall}%"></span></div></div></div>${orderMaterialsDetailHtml(o)}</div></td></tr>`}
function orderMissingRow(o){const missing=orderMissingItems(o);if(!missing.length)return '';const pos=currentLang==='ru'?'поз. · к заказу':currentLang==='en'?'items · to order':'poz. · jāpasūta';const click=currentLang==='ru'?'нажмите, чтобы оформить закупку':currentLang==='en'?'click to create purchase':'klikšķiniet, lai noformētu iepirkumu';return `<tr class="order-missing-row"><td colspan="6"><div class="order-missing-panel"><div class="order-missing-head"><b>${u42('missingMaterials')}</b><span>${missing.length} ${pos}</span></div><div class="order-missing-list">${missing.map(({item,state})=>{const m=state.av.mat;const unit=state.av.unit||item.unit||'';const pCls=state.purchaseStatus==='ordered'?'ordered':state.purchaseStatus==='none'?'none':'need';return `<button type="button" class="order-missing-item" onclick="openOrderMaterialPurchase('${o.id}','${item.materialId}')"><div><div class="mi-title">${escapeHtml(m?materialTitle(m):u42('deletedMaterial'))}</div><div class="mi-sub">${escapeHtml(m?.sku||'')} · ${click}</div></div><div><small>${u42('need')}</small><strong>${escapeHtml(qtyWithUnit(item.qty,unit))}</strong></div><div><small>${u42('available')}</small><strong>${escapeHtml(qtyWithUnit(state.av.available,unit))}</strong></div><div class="mi-bad"><small>${u42('toOrder')}</small><strong>${escapeHtml(qtyWithUnit(state.av.missing,unit))}</strong></div><div><span class="purchase-pill ${pCls}">${escapeHtml(orderPurchaseLabel(state.purchaseStatus))}</span></div></button>`}).join('')}</div></div></td></tr>`}

function orderStatusCellHtml(o,auto){
  if(auto==='Не хватает материалов'){
    return `<button type="button" class="status ${orderStatusClass(auto)} status-action" onclick="toggleOrderMissing(event,'${o.id}')">${escapeHtml(orderStatusText42 ? orderStatusText42(auto) : auto)} ${missingExpandedOrders.has(o.id)?'⌃':'⌄'}</button>`;
  }
  const text = (typeof orderStatusText42==='function') ? orderStatusText42(auto) : auto;
  return `<span class="status ${orderStatusClass(auto)}">${escapeHtml(text)}</span>`;
}
function orderActionMenu(id){
  return `<div class="action-menu" id="orderMenu_${id}"><button class="action-menu-btn" type="button" onclick="toggleOrderMenu(event,'${id}')">⋯</button><div class="action-menu-list"><button type="button" onclick="openOrderModal('${id}')">${typeof u42==='function'?u42('edit'):'Редактировать'}</button><button type="button" onclick="startOrderWork('${id}')">${typeof u42==='function'?u42('toWork'):'В работу'}</button><button type="button" onclick="completeOrder('${id}')">${typeof u42==='function'?u42('complete'):'Завершить'}</button><button type="button" onclick="cancelOrder('${id}')">${typeof u42==='function'?u42('cancelOrder'):'Отменить'}</button><button type="button" class="danger" onclick="deleteOrder('${id}')">${typeof u42==='function'?u42('delete'):'Удалить'}</button></div></div>`;
}
function orderRowActions(id){
  const o=(data.orders||[]).find(x=>String(x.id)===String(id));
  const techReady=hasOrderTechnology(o&&o.steps);
  const prodClick=techReady?`openOrderProduction('${id}')`:`toast('Сначала заполните технологию: укажите минуты хотя бы в одном этапе')`;
  const prodTitle=techReady?'Открыть производство':'Сначала заполните технологию';
  const prodClass=techReady?'production-btn':'production-btn disabled';
  return `<div class="order-row-action-buttons"><button class="btn open-btn" type="button" onclick="openOrderView('${id}')">Открыть</button><button class="btn ${prodClass}" type="button" title="${prodTitle}" onclick="${prodClick}">🛠 <span>Производство</span></button>${orderActionMenu(id)}</div>`;
}
function renderOrders(){
