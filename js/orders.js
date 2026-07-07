function orderStatusClass(st){return {'Новый':'new','Готов к работе':'ready','Готов к производству':'ready','Не хватает материалов':'needbuy','Нужно заказать':'needbuy','Материалы заказаны':'orderedmat','В производстве':'production','В работе':'production','Ожидает материалы':'wait','Готов':'done','Завершён':'done',completed:'done','Отменён':'cancel',cancelled:'cancel'}[st]||'new'}
function orderIsCompleted(status){return ['completed','Готов','Завершён'].includes(String(status||''))}
function orderIsCancelled(status){return ['cancelled','Отменён'].includes(String(status||''))}
function orderIsTerminal(status){return orderIsCompleted(status)||orderIsCancelled(status)}
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
function orderDeadlineClass(o){const d=o?.dueDate||'';if(!d)return '';const todayStr=today();if(d<todayStr && !orderIsTerminal(o?.status)&&!['Завершён','Отменён'].includes(calcOrderAutoStatus(o)))return 'overdue';if(d===todayStr)return 'today';return ''}
function formatDeadline(o){return o?.dueDate||'—'}
function materialReservedOutsideOrder(matId,excludeOrderId=''){return (data.orders||[]).filter(o=>String(o.id)!==String(excludeOrderId)&&!orderIsTerminal(o.status)).flatMap(orderMaterials).filter(i=>String(i.materialId)===String(matId)).reduce((s,i)=>s+Number(i.qty||0),0)}
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
  if(orderIsCompleted(o.status))return 'Завершён';
  if(orderIsCancelled(o.status))return 'Отменён';
  if(['В производстве','В работе'].includes(o.status)) return o.status==='В производстве'?'В работе':o.status;
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
  if(orderIsCompleted(o.status))return 100;
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
  const matPct=calcOrderMaterialPercent(o), overall=calcOrderOverallPercent(o), prod=orderIsCompleted(o.status)?100:(o.status==='В производстве'?45:0);
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
function syncMaterialReservations(){const totals={};(data.orders||[]).forEach(o=>{if(orderIsTerminal(o.status))return;orderMaterials(o).forEach(i=>{if(i.materialId)totals[i.materialId]=(totals[i.materialId]||0)+Number(i.qty||0)})});(data.materials||[]).forEach(m=>{m.attributes=m.attributes||{};m.attributes.reservedQty=stockNumForUnit(totals[m.id]||0,m.unit)})}

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

function renderOrderStats(){const orders=data.orders||[],total=orders.length,ready=orders.filter(o=>calcOrderAutoStatus(o)==='Готов к работе').length,missing=orders.filter(o=>calcOrderAutoStatus(o)==='Не хватает материалов').length,ordered=orders.filter(o=>calcOrderAutoStatus(o)==='Материалы заказаны').length,pct=v=>total?Math.round(v/total*100):0,notes=currentLang==='ru'?['всего',`${pct(ready)}% от всех заказов`,`${pct(missing)}% требуют закупки`,`${pct(ordered)}% в пути`]:currentLang==='en'?['total',`${pct(ready)}% of all orders`,`${pct(missing)}% require purchase`,`${pct(ordered)}% in transit`]:['kopā',`${pct(ready)}% no visiem pasūtījumiem`,`${pct(missing)}% jāiepērk`,`${pct(ordered)}% ceļā`],stats=[['orders',u42('totalOrders'),total,notes[0]],['ready',u42('readyToWork'),ready,notes[1]],['missing',u42('missingMaterials'),missing,notes[2]],['ordered',u42('orderedMoving'),ordered,notes[3]]],box=document.getElementById('orderStats');if(box)box.innerHTML=stats.map(([icon,label,value,note])=>`<div class="order-stat-card"><span class="order-stat-icon ${icon}">${icon==='orders'?'▤':icon==='ready'?'✓':icon==='missing'?'△':'▱'}</span><div class="order-stat-copy"><small class="order-stat-label">${label}</small><b class="order-stat-value">${value}</b><em class="order-stat-note">${note}</em></div></div>`).join('')}
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
function orderProductionPercentForCard(o){if(typeof calcProductionPercent==='function')return Math.max(0,Math.min(100,calcProductionPercent(o)));if(orderIsCompleted(o.status))return 100;if(['В работе','В производстве'].includes(o.status))return 45;return 0}
function orderMaterialsDetailHtml(o){const items=orderMaterials(o);if(!items.length)return `<div class="order-material-empty">${currentLang==='ru'?'Материалы не указаны':currentLang==='en'?'Materials not specified':'Materiāli nav norādīti'}</div>`;const reserveLabel=currentLang==='ru'?'Резерв':currentLang==='en'?'Reserved':'Rezervēts',actionLabel=currentLang==='ru'?'Действие':currentLang==='en'?'Action':'Darbība',writtenOff=currentLang==='ru'?'Списано':currentLang==='en'?'Written off':'Norakstīts';return `<div class="order-materials-clean"><div class="order-materials-clean-head"><b>${u42('materials')}</b><span>${items.length}</span></div><div class="order-materials-scroll"><table class="order-material-detail-table"><thead><tr><th>${u42('material')}</th><th>${u42('need')}</th><th>${u42('stock')}</th><th>${reserveLabel}</th><th>${u42('available')}</th><th>${u42('status')}</th><th>${actionLabel}</th></tr></thead><tbody>${items.map(i=>{const st=orderMaterialLineState(i,o.id),m=st.av.mat,unit=st.av.unit||i.unit||'',deleted=!m;let cls=deleted?'material-chip-written':st.kind==='ok'?'material-chip-ok':st.kind==='blue'?'material-chip-blue':st.kind==='warn'?'material-chip-warn':'material-chip-bad',statusTitle=deleted?writtenOff:st.label;if(!deleted&&st.av.missing>0){if(st.purchaseStatus==='ordered'){statusTitle=u42('ordered');cls='material-chip-blue'}else{statusTitle=st.kind==='bad'?(currentLang==='ru'?'Не хватает':currentLang==='en'?'Missing':'Trūkst'):u42('needOrder');cls=st.kind==='bad'?'material-chip-bad':'material-chip-warn'}}const action=deleted?'—':`<button class="btn small material-action-btn" type="button" onclick="openOrderMaterialPurchase('${o.id}','${i.materialId}')">${u42('details')}</button>`;return `<tr class="${deleted?'deleted-material-row':''}"><td><button type="button" class="order-material-link" ${deleted?'disabled':`onclick="openOrderMaterialPurchase('${o.id}','${i.materialId}')"`}>${escapeHtml(m?materialTitle(m):u42('deletedMaterial'))}</button>${m?`<div class="sub">${escapeHtml(m.sku||'')}</div>`:''}</td><td>${escapeHtml(qtyWithUnit(i.qty,unit))}<div class="sub">${u42('perOne')}: ${escapeHtml(qtyWithUnit(orderItemPerUnitQty(i,o),unit))}</div></td><td>${deleted?'—':escapeHtml(qtyWithUnit(st.av.stock,unit))}</td><td>${deleted?'—':escapeHtml(qtyWithUnit(reservedQty(m),unit))}</td><td>${deleted?'—':escapeHtml(qtyWithUnit(st.av.available,unit))}</td><td><span class="${cls}">${escapeHtml(statusTitle)}</span></td><td>${action}</td></tr>`}).join('')}</tbody></table></div></div>`}
function orderExpandedCardHtml(o){const matPct=calcOrderMaterialPercent(o),prod=orderProductionPercentForCard(o),overall=calcOrderOverallPercent(o),prodLbl=currentLang==='ru'?'Производство':currentLang==='en'?'Production':'Ražošana',overallLbl=currentLang==='ru'?'Общий прогресс':currentLang==='en'?'Overall progress':'Kopējais progress';return `<div class="order-card-expanded"><div class="order-progress-grid"><div class="order-progress-card materials"><span class="order-progress-icon">▱</span><div><small>${u42('materials')}</small><b>${matPct}%</b><div class="order-bar"><span style="width:${matPct}%"></span></div></div></div><div class="order-progress-card production"><span class="order-progress-icon">⚒</span><div><small>${prodLbl}</small><b>${prod}%</b><div class="order-bar"><span style="width:${prod}%"></span></div></div></div><div class="order-progress-card overall"><span class="order-progress-icon">↗</span><div><small>${overallLbl}</small><b>${overall}%</b><div class="order-bar"><span style="width:${overall}%"></span></div></div></div></div>${orderMaterialsDetailHtml(o)}</div>`}
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
  const prodTitle=techReady?u42('production'):(currentLang==='ru'?'Сначала заполните технологию':currentLang==='en'?'Complete the technology first':'Vispirms aizpildiet tehnoloģiju');
  const prodClass=techReady?'production-btn':'production-btn disabled';
  return `<div class="order-row-action-buttons"><button class="btn open-btn" type="button" onclick="openOrderView('${id}')">${u42('open')}</button><button class="btn ${prodClass}" type="button" title="${prodTitle}" onclick="${prodClick}">🛠 <span>${u42('production')}</span></button>${orderActionMenu(id)}</div>`;
}
function renderOrders(){renderOrderStats();renderOrderClientFilter();const box=document.getElementById('ordersTable')||document.getElementById('ordersGrid');if(!box)return;const rows=filteredOrders();if(!rows.length){box.innerHTML=`<div class="empty"><b>${u42('noOrders')}</b>${u42('noOrdersHint')}</div>`;return}box.innerHTML=`<div class="order-card-list">${rows.map(o=>{const min=calcOrderMinutes(o),auto=calcOrderAutoStatus(o),expanded=expandedOrders.has(o.id),matPct=calcOrderMaterialPercent(o),prodPct=orderProductionPercentForCard(o),overall=calcOrderOverallPercent(o),oq=orderProductQty(o),deadlineClass=orderDeadlineClass({...o,status:auto}),comment=o.comment||'',prodLabel=currentLang==='ru'?'производство':currentLang==='en'?'production':'ražošana',overallLabel=currentLang==='ru'?'общий':currentLang==='en'?'overall':'kopā';return `<article class="order-erp-card ${expanded?'expanded':''}" data-order-id="${escapeHtml(o.id)}"><div class="order-card-summary"><button class="order-expand-btn" type="button" onclick="toggleOrderExpand(event,'${o.id}')" aria-label="${expanded?'Collapse':'Expand'}">${expanded?'▼':'▶'}</button><div class="order-card-number"><span>${currentLang==='ru'?'Заказ':currentLang==='en'?'Order':'Pasūtījums'}</span><b>${escapeHtml(o.number)}</b></div><div class="order-card-client"><b>${escapeHtml(o.client||'—')}</b><span class="order-qty-pill">${u42('items')}: <strong>${oq}</strong></span><p>${escapeHtml(comment||'—')}</p></div><div class="order-card-kv"><small>${u42('time')}</small><b>${min} ${u42('minutes').toLowerCase()}</b><span>${orderTimeText(min)}</span></div><div class="order-card-kv"><small>${u42('deadline')}</small><b class="order-deadline ${deadlineClass}">${escapeHtml(formatDeadline(o))}</b><span>${u42('created')} ${escapeHtml(o.date||'—')}</span></div><div class="order-card-state">${orderStatusCellHtml(o,auto)}<div class="order-card-mini-progress"><span>${u42('materialPct')} ${matPct}%</span><i><b style="width:${matPct}%"></b></i><small>${prodLabel} ${prodPct}% · ${overallLabel} ${overall}%</small></div></div><div class="order-card-actions">${orderRowActions(o.id)}</div></div>${expanded?orderExpandedCardHtml(o):''}</article>`}).join('')}</div>`}


function openOrderModal(id=''){
  if(!requireAuth())return;
  window.currentOrderEditId=id||'';
  const o=id?data.orders.find(x=>String(x.id)===String(id)):null;
  const number=o?.number||nextOrderNumber();
  const steps=orderSteps(o||{});
  const mats=orderMaterials(o||{});
  const body=`<div class="form-grid">
    <div class="field"><label>№ заказа</label><input id="orderNumber" class="input" value="${escapeHtml(number)}" ${o?'':'disabled'}><label class="manual-number"><input id="manualOrderNumber" type="checkbox" ${o?'checked':''} onchange="toggleManualOrderNumber()"> Ввести номер вручную</label><div class="hint">Автонумерация создаёт Z-0001, Z-0002 и дальше.</div></div>
    <div class="field"><label>Заказчик</label><input id="orderClient" class="input" value="${escapeHtml(o?.client||'')}" placeholder="Имя или компания"></div>
    <div class="field"><label>Количество изделий</label><input id="orderProductQty" type="number" min="1" step="1" class="input" value="${orderProductQty(o||{})}" oninput="refreshOrderMaterialRows();updateOrderTimeTotal()"><div class="hint">Например: один заказ = 100 диванов.</div></div>
    <div class="field"><label>Закончить до</label><input id="orderDueDate" type="date" class="input" value="${escapeHtml(o?.dueDate||'')}"><div class="hint">Плановая дата сдачи заказа.</div></div>
    <div class="field"><label>Дата создания</label><input id="orderDate" type="date" class="input" value="${escapeHtml(o?.date||today())}"></div>
    <div class="field full"><label>Комментарий</label><textarea id="orderComment" placeholder="Комментарий технолога, особенности заказа...">${escapeHtml(o?.comment||'')}</textarea></div>
  </div>
  <div class="order-form-section"><div class="order-section-head"><h4>Технология <span class="order-time-total" id="orderTimeTotal">0 мин</span></h4><button class="btn small" onclick="addOrderStep()">＋ Добавить этап</button></div><div id="orderStepsBox">${steps.map(s=>orderStepRow(s)).join('')}</div></div>
  <div class="order-form-section"><div class="order-section-head"><h4>Материалы <button class="info-btn" type="button" onclick="showOrderReserveInfo(event)">i</button></h4><div class="actions"><button class="btn small" onclick="addOrderMaterialRow()">＋ Добавить материал</button><button class="btn small" onclick="openAddCategoryModal(true)">＋ Добавить новый материал на склад</button></div></div><div id="orderMaterialsBox">${mats.map(i=>orderMaterialRow(i,id)).join('')}</div><div class="hint">На складе не уменьшается сразу. Доступно = На складе − резерв других заказов. Резерв этого заказа пересчитывается после сохранения.</div></div>`;
  const foot=`<button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveOrder('${id||''}')">Сохранить</button>`;
  openModal(id?'Редактировать заказ':'Добавить заказ',body,foot);
  document.querySelector('#modalBackdrop .modal')?.classList.add('wide');
  updateOrderTimeTotal();refreshOrderMaterialRows();
}
function toggleManualOrderNumber(){const cb=document.getElementById('manualOrderNumber'),inp=document.getElementById('orderNumber');if(!inp||!cb)return;inp.disabled=!cb.checked;if(!cb.checked)inp.value=nextOrderNumber()}
function orderStepRow(s={name:'',minutes:0}){return `<div class="order-row order-step-row"><div class="field"><label>Этап</label><input class="input step-name" value="${escapeHtml(s.name||'')}"></div><div class="field"><label>Минуты</label><input class="input step-min" type="number" min="0" step="1" value="${Number(s.minutes||0)}" oninput="updateOrderTimeTotal()"></div><button class="btn small danger" onclick="this.closest('.order-step-row').remove();updateOrderTimeTotal()">×</button></div>`}
function addOrderStep(){document.getElementById('orderStepsBox').insertAdjacentHTML('beforeend',orderStepRow({name:'Новый этап',minutes:0}));updateOrderTimeTotal()}
function updateOrderTimeTotal(){const total=[...document.querySelectorAll('.step-min')].reduce((s,i)=>s+Number(i.value||0),0);const el=document.getElementById('orderTimeTotal');if(el)el.textContent=`${total} мин · ${orderTimeText(total)}`}
function materialOptions(category='',selected=''){return (data.materials||[]).filter(m=>!category||m.category===category).map(m=>`<option value="${m.id}" ${String(m.id)===String(selected)?'selected':''}>${escapeHtml(m.sku||'')} — ${escapeHtml(materialTitle(m))}</option>`).join('')}
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
    <div class="field"><label>Категория</label><select class="select om-cat" onchange="refreshOneOrderMaterialRow(this)">${ORDER_MATERIAL_CATS.map(c=>`<option value="${c}" ${cat===c?'selected':''}>${c}</option>`).join('')}</select></div>
    <div class="field"><label>Материал</label><select class="select om-material" onchange="refreshOrderMaterialRows()">${materialOptions(cat,i.materialId)}</select></div>
    <div class="field"><label>На 1 изделие</label><input class="input om-per-unit" type="number" min="0" step="0.01" value="${Number(perUnit||0)}" oninput="refreshOrderMaterialRows()"><div class="hint">расход на 1 изделие</div></div>
    <div class="field"><label>Всего нужно</label><div class="readonly-pill om-total-qty">0</div></div>
    <div class="field"><label>Ед.</label><div class="readonly-pill om-unit">${escapeHtml(unit||'—')}</div></div>
    <button class="btn small danger order-line-remove" type="button" onclick="this.closest('.order-material-row').remove();refreshOrderMaterialRows()">×</button>
    <div class="material-check om-check">Выберите материал</div>
  </div>`
}
function addOrderMaterialRow(){document.getElementById('orderMaterialsBox').insertAdjacentHTML('beforeend',orderMaterialRow());refreshOrderMaterialRows()}
function refreshOneOrderMaterialRow(sel){const row=sel.closest('.order-material-row');const matSel=row.querySelector('.om-material');matSel.innerHTML=materialOptions(sel.value,'');refreshOrderMaterialRows()}
function rebuildOrderMaterialOptions(){document.querySelectorAll('.order-material-row').forEach(row=>{const cat=row.querySelector('.om-cat')?.value||'';const sel=row.querySelector('.om-material');if(!sel)return;const selected=sel.value;sel.innerHTML=materialOptions(cat,selected);});}
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
    if(!m){check.className='material-check warn om-check';check.innerHTML='Материал не выбран';return}
    const av=orderItemAvailability({materialId:id,qty:totalQty},window.currentOrderEditId||'');
    const effective={materialId:id,qty:totalQty,perUnitQty:perUnit,unit:m.unit,purchaseStatus:'none',purchaseQty:0};
    const st=orderMaterialLineState(effective,window.currentOrderEditId||'');
    check.className='material-check om-check '+(st.kind==='ok'?'ok':st.kind==='blue'?'warn':st.kind==='warn'?'warn':'bad');
    if(st.kind==='ok'){
      check.innerHTML=`<div><b>Материалы доступны</b></div><div class="muted">На складе ${qtyWithUnit(av.stock,m.unit)} · доступно ${qtyWithUnit(av.available,m.unit)} · нужно ${qtyWithUnit(totalQty,m.unit)}</div>`
    }else if(st.kind==='blue'){
      check.innerHTML=`<div><b>Материал заказан</b></div><div class="muted">Нужно ${qtyWithUnit(totalQty,m.unit)} · доступно ${qtyWithUnit(av.available,m.unit)} · заказано ${qtyWithUnit(st.purchaseQty,m.unit)}</div>`
    }else if(st.kind==='warn'){
      check.innerHTML=`<div><b>Не заказано</b></div><div class="muted">Нужно ${qtyWithUnit(totalQty,m.unit)} · доступно ${qtyWithUnit(av.available,m.unit)} · нехватка ${qtyWithUnit(av.missing,m.unit)}</div>`
    }else{
      check.innerHTML=`<div><b>Не хватает материала</b></div><div class="muted">Нужно ${qtyWithUnit(totalQty,m.unit)} · доступно ${qtyWithUnit(av.available,m.unit)} · заказать ${qtyWithUnit(st.purchaseQty,m.unit)}</div>`
    }
  })
}
async function saveOrder(id=''){
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
function openOrderView(id){
  const o=data.orders.find(x=>String(x.id)===String(id));
  if(!o)return;
  const min=calcOrderMinutes(o);
  const oq=orderProductQty(o);
  const mats=orderMaterials(o).map(i=>{
    const st=orderMaterialLineState(i,o.id);
    const av=st.av;
    const unit=av.unit||i.unit;
    const per=orderItemPerUnitQty(i,o);
    const m=av.mat;
    let cls=st.kind==='ok'?'ok-text':st.kind==='blue'?'material-chip-blue':'danger-text';
    let statusText=st.label;
    if(av.missing>0){
      if(st.purchaseStatus==='ordered') statusText=`Заказано ${qtyWithUnit(st.purchaseQty||av.missing,unit)}`;
      else statusText=`Нужно заказать ${qtyWithUnit(st.purchaseQty||av.missing,unit)}`;
    }
    const actions=`<div class="order-purchase-actions"><button class="btn" type="button" onclick="openOrderMaterialPurchase('${o.id}','${i.materialId}')">Подробно</button></div>`;
    const p=av.missing>0?`<br><small class="muted">Закупка: ${orderPurchaseLabel(st.purchaseStatus)} ${qtyWithUnit(st.purchaseQty || av.missing,unit)}${i.purchaseNo?' · '+escapeHtml(i.purchaseNo):''}</small>`:'';
    return `<div class="line-item"><span>${escapeHtml(m?materialTitle(m):'Удалённый материал')}<br><small class="muted">На 1 изделие ${escapeHtml(qtyWithUnit(per,unit))} · всего нужно ${escapeHtml(qtyWithUnit(i.qty,unit))}<br>доступно ${escapeHtml(qtyWithUnit(av.available,unit))}</small>${p}${actions}</span><b class="${cls}">${escapeHtml(statusText)}${av.missing>0?' · не хватает '+escapeHtml(qtyWithUnit(av.missing,unit)):''}</b></div>`;
  }).join('')||'<span class="muted">Материалы не указаны</span>';
  const steps=orderSteps(o).map(s=>`<div class="line-item"><span>${escapeHtml(s.name)}</span><b>${Number(s.minutes||0)} мин</b></div>`).join('');
  const auto=calcOrderAutoStatus(o);
  const body=`<div class="order-view-grid"><div class="order-view-card"><small>Заказчик</small><b>${escapeHtml(o.client||'—')}</b></div><div class="order-view-card"><small>Количество изделий</small><b>${oq}</b></div><div class="order-view-card"><small>Общее время</small><b>${min} мин · ${orderTimeText(min)}</b></div><div class="order-view-card"><small>Срок сдачи</small><b class="order-deadline ${orderDeadlineClass({...o,status:auto})}">${escapeHtml(formatDeadline(o))}</b></div><div class="order-view-card"><small>Дата создания</small><b>${escapeHtml(o.date||'—')}</b></div><div class="order-view-card full"><small>Технология</small>${steps}</div><div class="order-view-card full"><small>Материалы</small>${mats}</div><div class="order-view-card full"><small>Комментарий</small>${escapeHtml(o.comment||'—')}</div></div>`;
  openModal(o.number,body,`<button class="btn danger" onclick="deleteOrder('${o.id}')">Удалить заказ</button><span style="flex:1"></span><button class="btn" onclick="openOrderModal('${o.id}')">Редактировать</button><button class="btn primary" onclick="closeModal()">Закрыть</button>`);
}

function openOrderModal(id=''){
  if(!requireAuth())return;
  window.currentOrderEditId=id||'';
  const o=id?data.orders.find(x=>String(x.id)===String(id)):null;
  const number=o?.number||nextOrderNumber();
  const steps=orderSteps(o||{});
  const mats=orderMaterials(o||{});
  const body=`<div class="form-grid">
    <div class="field"><label>${u42('orderNo')}</label><input id="orderNumber" class="input" value="${escapeHtml(number)}" ${o?'':'disabled'}><label class="manual-number"><input id="manualOrderNumber" type="checkbox" ${o?'checked':''} onchange="toggleManualOrderNumber()"> ${u42('manualNo')}</label><div class="hint">${u42('autoNo')}</div></div>
    <div class="field"><label>${u42('client')}</label><input id="orderClient" class="input" value="${escapeHtml(o?.client||'')}" placeholder="${u42('clientPh')}"></div>
    <div class="field"><label>${u42('productQty')}</label><input id="orderProductQty" type="number" min="1" step="1" class="input" value="${orderProductQty(o||{})}" oninput="refreshOrderMaterialRows();updateOrderTimeTotal()"><div class="hint">${u42('productHint')}</div></div>
    <div class="field"><label>${u42('due')}</label><input id="orderDueDate" type="date" class="input" value="${escapeHtml(o?.dueDate||'')}"><div class="hint">${u42('dueHint')}</div></div>
    <div class="field"><label>${u42('createdDate')}</label><input id="orderDate" type="date" class="input" value="${escapeHtml(o?.date||today())}"></div>
    <div class="field full"><label>${u42('comment')}</label><textarea id="orderComment" placeholder="${u42('commentPh')}">${escapeHtml(o?.comment||'')}</textarea></div>
  </div>
  <div class="order-form-section"><div class="order-section-head"><h4>${u42('technology')} <span class="order-time-total" id="orderTimeTotal">0 ${u42('minutes').toLowerCase()}</span></h4><button class="btn small" onclick="addOrderStep()">${u42('addStep')}</button></div><div id="orderStepsBox">${steps.map(s=>orderStepRow(s)).join('')}</div></div>
  <div class="order-form-section"><div class="order-section-head"><h4>${u42('materials')} <button class="info-btn" type="button" onclick="showOrderReserveInfo(event)">i</button></h4><div class="actions"><button class="btn small" onclick="addOrderMaterialRow()">${u42('addMaterial')}</button><button class="btn small" onclick="openAddCategoryModal(true)">${u42('addNewStock')}</button></div></div><div id="orderMaterialsBox">${mats.map(i=>orderMaterialRow(i,id)).join('')}</div><div class="hint">${u42('reserveHint')}</div></div>`;
  const foot=`<button class="btn" onclick="closeModal()">${u42('cancel')}</button><button class="btn primary" onclick="saveOrder('${id||''}')">${u42('save')}</button>`;
  openModal(id?u42('editOrder'):u42('addOrder'),body,foot);
  document.querySelector('#modalBackdrop .modal')?.classList.add('wide');
  updateOrderTimeTotal();refreshOrderMaterialRows();
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
async function saveOrder(id=''){
  const steps=[...document.querySelectorAll('.order-step-row')].map(r=>({name:r.querySelector('.step-name').value.trim()||u42('stage'),minutes:Math.max(0,Math.round(Number(r.querySelector('.step-min').value||0)))}));
  const productQty=orderProductQty({productQty:document.getElementById('orderProductQty')?.value||1});
  const materials=[...document.querySelectorAll('.order-material-row')].map(r=>{const mat=data.materials.find(m=>String(m.id)===String(r.querySelector('.om-material')?.value));if(!mat)return null;const perUnitQty=stockNumForUnit(r.querySelector('.om-per-unit')?.value||0,mat.unit||'м²');const qty=stockNumForUnit(perUnitQty*productQty,mat.unit||'м²');return {category:r.querySelector('.om-cat')?.value||mat.category||'',materialId:mat.id||'',perUnitQty,qty,unit:mat.unit||'',purchaseStatus:'none',purchaseQty:0,purchaseNo:''}}).filter(i=>i&&i.materialId&&i.qty>0);
  const prev=id?data.orders.find(o=>String(o.id)===String(id)):null;
  let status=(prev&&(orderIsTerminal(prev.status)||['В производстве','В работе'].includes(prev.status)))?prev.status:'Новый';
  const draft={id:id||uid(),number:document.getElementById('orderNumber').value.trim()||nextOrderNumber(id),client:document.getElementById('orderClient').value.trim(),productQty,dueDate:document.getElementById('orderDueDate')?.value||'',comment:document.getElementById('orderComment').value.trim(),date:document.getElementById('orderDate').value||today(),status,steps,materials};
  draft.status=calcOrderAutoStatus(draft);
  if(id)data.orders=data.orders.map(o=>String(o.id)===String(id)?draft:o);else data.orders.push(draft);
  save(); await persistReservationMaterials(); closeModal(); await loadMaterialsFromSupabase(); renderAll(); toast(u42('orderSaved'));
}

function openOrderView(id){
  const o=data.orders.find(x=>String(x.id)===String(id)); if(!o)return;
  const min=calcOrderMinutes(o); const oq=orderProductQty(o);
  const mats=orderMaterials(o).map(i=>{const st=orderMaterialLineState(i,o.id);const av=st.av;const unit=av.unit||i.unit;const per=orderItemPerUnitQty(i,o);const m=av.mat;let cls=st.kind==='ok'?'ok-text':st.kind==='blue'?'material-chip-blue':'danger-text';let statusText=st.label;if(av.missing>0){statusText=st.purchaseStatus==='ordered'?`${u42('ordered')} ${qtyWithUnit(st.purchaseQty||av.missing,unit)}`:`${u42('needOrder')} ${qtyWithUnit(st.purchaseQty||av.missing,unit)}`;}const actions=`<div class="order-purchase-actions"><button class="btn" type="button" onclick="openOrderMaterialPurchase('${o.id}','${i.materialId}')">${u42('details')}</button></div>`;const p=av.missing>0?`<br><small class="muted">${u42('procurement')}: ${orderPurchaseLabel(st.purchaseStatus)} ${qtyWithUnit(st.purchaseQty || av.missing,unit)}${i.purchaseNo?' · '+escapeHtml(i.purchaseNo):''}</small>`:'';const miss=av.missing>0?` · ${u42('missing').toLowerCase()} ${escapeHtml(qtyWithUnit(av.missing,unit))}`:'';return `<div class="line-item"><span>${escapeHtml(m?materialTitle(m):u42('deletedMaterial'))}<br><small class="muted">${u42('perOne')} ${escapeHtml(qtyWithUnit(per,unit))} · ${u42('totalNeedSmall')} ${escapeHtml(qtyWithUnit(i.qty,unit))}<br>${u42('available')} ${escapeHtml(qtyWithUnit(av.available,unit))}</small>${p}${actions}</span><b class="${cls}">${escapeHtml(statusText)}${miss}</b></div>`}).join('')||`<span class="muted">${currentLang==='ru'?'Материалы не указаны':currentLang==='en'?'Materials not specified':'Materiāli nav norādīti'}</span>`;
  const steps=orderSteps(o).map(s=>`<div class="line-item"><span>${escapeHtml(s.name)}</span><b>${Number(s.minutes||0)} ${u42('minutes').toLowerCase()}</b></div>`).join('');
  const auto=calcOrderAutoStatus(o);
  const body=`<div class="order-view-grid"><div class="order-view-card"><small>${u42('orderClient')}</small><b>${escapeHtml(o.client||'—')}</b></div><div class="order-view-card"><small>${u42('productQtyShort')}</small><b>${oq}</b></div><div class="order-view-card"><small>${u42('totalTime')}</small><b>${min} ${u42('minutes').toLowerCase()} · ${orderTimeText(min)}</b></div><div class="order-view-card"><small>${u42('deadlineFull')}</small><b class="order-deadline ${orderDeadlineClass({...o,status:auto})}">${escapeHtml(formatDeadline(o))}</b></div><div class="order-view-card"><small>${u42('createdDate')}</small><b>${escapeHtml(o.date||'—')}</b></div><div class="order-view-card full"><small>${u42('steps')}</small>${steps}</div><div class="order-view-card full"><small>${u42('materials')}</small>${mats}</div><div class="order-view-card full"><small>${u42('comment')}</small>${escapeHtml(o.comment||'—')}</div></div>`;
  openModal(o.number,body,`<button class="btn" onclick="openOrderModal('${o.id}')">${u42('edit')}</button><button class="btn primary" onclick="closeModal()">${u42('close')}</button>`);
}

function openOrderView(id){
  const o=data.orders.find(x=>String(x.id)===String(id)); if(!o)return;
  const min=calcOrderMinutes(o); const oq=orderProductQty(o);
  const auto=calcOrderAutoStatus(o);
  const steps=orderSteps(o).map(s=>`<div class="line-item"><span>${escapeHtml(s.name)}</span><b>${Number(s.minutes||0)} ${u42('minutes').toLowerCase()}</b></div>`).join('');
  const mats=orderMaterials(o).map(i=>{
    const st=orderMaterialLineState(i,o.id);const av=st.av;const unit=av.unit||i.unit;const per=orderItemPerUnitQty(i,o);const m=av.mat;
    let cls=st.kind==='ok'?'ok-text':st.kind==='blue'?'material-chip-blue':'danger-text';
    let statusText=st.label;
    if(av.missing>0){statusText=st.purchaseStatus==='ordered'?`${u42('ordered')} ${qtyWithUnit(st.purchaseQty||av.missing,unit)}`:`${u42('needOrder')} ${qtyWithUnit(st.purchaseQty||av.missing,unit)}`;}
    const p=av.missing>0?`<br><small class="muted">${u42('procurement')}: ${orderPurchaseLabel(st.purchaseStatus)} ${qtyWithUnit(st.purchaseQty || av.missing,unit)}${i.purchaseNo?' · '+escapeHtml(i.purchaseNo):''}</small>`:'';
    const miss=av.missing>0?` · ${u42('missing').toLowerCase()} ${escapeHtml(qtyWithUnit(av.missing,unit))}`:'';
    return `<div class="line-item"><span>${escapeHtml(m?materialTitle(m):u42('deletedMaterial'))}<br><small class="muted">${u42('perOne')} ${escapeHtml(qtyWithUnit(per,unit))} · ${u42('totalNeedSmall')} ${escapeHtml(qtyWithUnit(i.qty,unit))}<br>${u42('available')} ${escapeHtml(qtyWithUnit(av.available,unit))}</small>${p}<div class="order-purchase-actions"><button class="btn" type="button" onclick="openOrderMaterialPurchase('${o.id}','${i.materialId}')">${u42('details')}</button></div></span><b class="${cls}">${escapeHtml(statusText)}${miss}</b></div>`;
  }).join('')||`<span class="muted">${currentLang==='ru'?'Материалы не указаны':currentLang==='en'?'Materials not specified':'Materiāli nav norādīti'}</span>`;
  const body=`<div class="order-view-grid"><div class="order-view-card"><small>${u42('orderClient')}</small><b>${escapeHtml(o.client||'—')}</b></div><div class="order-view-card"><small>${u42('productQtyShort')}</small><b>${oq}</b></div><div class="order-view-card"><small>${u42('totalTime')}</small><b>${min} ${u42('minutes').toLowerCase()} · ${orderTimeText(min)}</b></div><div class="order-view-card"><small>${u42('deadlineFull')}</small><b class="order-deadline ${orderDeadlineClass({...o,status:auto})}">${escapeHtml(formatDeadline(o))}</b></div><div class="order-view-card"><small>${u42('createdDate')}</small><b>${escapeHtml(o.date||'—')}</b></div><div class="order-view-card full"><small>${u42('steps')}</small>${steps}</div><div class="order-view-card full"><small>${u42('materials')}</small>${mats}</div><div class="order-view-card full"><small>${u42('comment')}</small>${escapeHtml(o.comment||'—')}</div></div>`;
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
