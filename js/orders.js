function orderStatusClass(st){return {'Новый':'new','Готов к работе':'ready','Готов к производству':'ready','Не хватает материалов':'needbuy','Нужно заказать':'needbuy','Материалы заказаны':'orderedmat','В производстве':'production','В работе':'production','Ожидает материалы':'wait','Готов':'done','Завершён':'done',completed:'done','Отменён':'cancel',cancelled:'cancel'}[st]||'new'}
function orderIsCompleted(status){return ['completed','Готов','Завершён'].includes(String(status||''))}
function orderIsCancelled(status){return ['cancelled','Отменён'].includes(String(status||''))}
function orderIsTerminal(status){return orderIsCompleted(status)||orderIsCancelled(status)}
function orderTimeText(min){min=Math.max(0,Math.round(Number(min||0)));const h=Math.floor(min/60),m=min%60;return h?`${h} ч ${String(m).padStart(2,'0')} мин`:`${m} мин`}
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
const orderWorkflowSelection=new Map();
const ORDER_WORKFLOW_STEPS=['orderStageCreation','orderStageTechnology','orderStageProduction','orderStageCompletion'];
function orderCompletionData(o){if(!o.completion||typeof o.completion!=='object')o.completion={checklist:{},comments:[]};if(!o.completion.checklist||typeof o.completion.checklist!=='object')o.completion.checklist={};if(!Array.isArray(o.completion.comments))o.completion.comments=[];return o.completion}
function orderCompletionClosed(o){return !!(o&&orderCompletionData(o).closedAt)||String(o?.status||'')==='Завершён'||String(o?.status||'')==='completed'}
function orderWorkflowStage(id){
  const key=String(id);if(orderWorkflowSelection.has(key))return Math.max(0,Math.min(3,Number(orderWorkflowSelection.get(key)||0)));
  const o=(data.orders||[]).find(x=>String(x.id)===key),status=String(o?.status||'');
  if(orderIsCompleted(status)||status==='Готов')return 3;if(['В производстве','В работе'].includes(status))return 2;return 0;
}
function orderWorkflowStepperHtml(o,context='card'){
  const active=orderWorkflowStage(o.id),closed=orderCompletionClosed(o);
  return `<div class="order-workflow-stepper" role="tablist" aria-label="${escapeHtml(t('orderWorkflow'))}">${ORDER_WORKFLOW_STEPS.map((key,index)=>{const complete=closed||index<active,activeCls=!closed&&index===active;return `<button type="button" role="tab" aria-selected="${activeCls}" class="order-workflow-step ${activeCls?'active':complete?'complete':'future'}" onclick="selectOrderWorkflowStage(event,'${o.id}',${index},'${context}')"><span class="order-workflow-marker">${complete?'✓':index+1}</span><span class="order-workflow-label">${escapeHtml(t(key))}</span></button>`}).join('')}</div>`;
}
function orderCreationDataHtml(o,{includeOperational=false}={}){
  const auto=calcOrderAutoStatus(o),oq=orderProductQty(o);
  const basics=`<section class="order-workflow-panel" role="tabpanel"><h4>${escapeHtml(t('orderBasicData'))}</h4><div class="order-basic-grid"><div><small>${escapeHtml(t('orderNumberLabel'))}</small><b>${escapeHtml(o.number||'—')}</b></div><div><small>${escapeHtml(u42('orderClient'))}</small><b>${escapeHtml(o.client||'—')}</b></div><div><small>${escapeHtml(t('orderProductCount'))}</small><b>${oq}</b></div><div><small>${escapeHtml(t('orderDueDate'))}</small><b class="order-deadline ${orderDeadlineClass({...o,status:auto})}">${escapeHtml(formatDeadline(o))}</b></div><div><small>${escapeHtml(t('orderCreatedDate'))}</small><b>${escapeHtml(o.date||'—')}</b></div><div><small>${escapeHtml(t('orderCurrentStatus'))}</small>${orderStatusCellHtml(o,auto)}</div><div class="full"><small>${escapeHtml(t('orderComment'))}</small><b>${escapeHtml(o.comment||'—')}</b></div></div></section>`;
  if(!includeOperational)return basics;
  const matPct=calcOrderMaterialPercent(o),prod=orderProductionPercentForCard(o),overall=calcOrderOverallPercent(o),prodLbl=t('orderStageProduction'),overallLbl=currentLang==='ru'?'Общий прогресс':currentLang==='en'?'Overall progress':'Kopējais progress';
  return basics+`<div class="order-operational-data"><div class="order-progress-grid"><div class="order-progress-card materials"><span class="order-progress-icon">▱</span><div><small>${u42('materials')}</small><b>${matPct}%</b><div class="order-bar"><span style="width:${matPct}%"></span></div></div></div><div class="order-progress-card production"><span class="order-progress-icon">⚒</span><div><small>${escapeHtml(prodLbl)}</small><b>${prod}%</b><div class="order-bar"><span style="width:${prod}%"></span></div></div></div><div class="order-progress-card overall"><span class="order-progress-icon">↗</span><div><small>${escapeHtml(overallLbl)}</small><b>${overall}%</b><div class="order-bar"><span style="width:${overall}%"></span></div></div></div></div>${orderMaterialsDetailHtml(o)}</div>`;
}
function orderTechnologyOperationsHtml(o){
  const qty=orderProductQty(o),steps=orderSteps(o);
  return `<section class="order-tech-card"><div class="order-tech-head"><div><h4>${escapeHtml(t('techOperations'))}</h4><p>${escapeHtml(t('techOperationsHint'))}</p></div><button class="btn small" type="button" onclick="addTechnologyOperation('${o.id}')">＋ ${escapeHtml(t('addOperation'))}</button></div><div class="order-tech-table-scroll"><table class="order-tech-table"><thead><tr><th>${escapeHtml(t('operationStage'))}</th><th>${escapeHtml(t('timePerItem'))}</th><th>${escapeHtml(t('orderProductCount'))}</th><th>${escapeHtml(t('totalTime'))}</th><th>${escapeHtml(t('responsibleOptional'))}</th><th></th></tr></thead><tbody>${steps.map((s,index)=>`<tr><td><input class="input" value="${escapeHtml(s.name||'')}" onchange="updateTechnologyOperation('${o.id}',${index},'name',this.value)"></td><td><div class="order-tech-time"><input class="input" type="number" min="0" step="1" value="${Number(s.minutes||0)}" onchange="updateTechnologyOperation('${o.id}',${index},'minutes',this.value)"><span>${escapeHtml(t('minutesShort'))}</span></div></td><td><b>${qty}</b></td><td><b>${Number(s.minutes||0)*qty} ${escapeHtml(t('minutesShort'))}</b></td><td><input class="input" value="${escapeHtml(s.responsible||'')}" placeholder="${escapeHtml(t('notSpecified'))}" onchange="updateTechnologyOperation('${o.id}',${index},'responsible',this.value)"></td><td><button class="iconbtn order-tech-remove" type="button" aria-label="${escapeHtml(t('deleteOperation'))}" onclick="removeTechnologyOperation('${o.id}',${index})">×</button></td></tr>`).join('')}</tbody></table></div></section>`;
}
function orderTechnologyMaterialsHtml(o){
  const items=orderMaterials(o);
  return `<section class="order-tech-card"><div class="order-tech-head"><div><h4>${escapeHtml(t('technologyMaterials'))}</h4><p>${escapeHtml(t('materialsReserveHint'))}</p></div><button class="btn small" type="button" onclick="openTechnologyMaterials('${o.id}')">＋ ${escapeHtml(t('addMaterialToOrder'))}</button></div>${items.length?`<div class="order-tech-table-scroll"><table class="order-tech-table order-tech-materials"><thead><tr><th>${escapeHtml(t('material'))}</th><th>${escapeHtml(t('need'))}</th><th>${escapeHtml(t('stock'))}</th><th>${escapeHtml(t('reserved'))}</th><th>${escapeHtml(t('toOrder'))}</th><th>${escapeHtml(t('status'))}</th><th></th></tr></thead><tbody>${items.map((i,index)=>{const st=orderMaterialLineState(i,o.id),m=st.av.mat,unit=st.av.unit||i.unit||'',missing=Math.max(0,Number(st.av.missing||0)),statusClass=missing>0?'material-chip-bad':'material-chip-ok';return `<tr><td><b>${escapeHtml(m?materialTitle(m):t('deletedMaterial'))}</b><small>${escapeHtml(m?.sku||'')}</small></td><td>${escapeHtml(qtyWithUnit(i.qty,unit))}</td><td>${escapeHtml(qtyWithUnit(st.av.stock,unit))}</td><td>${escapeHtml(qtyWithUnit(Math.min(Number(i.qty||0),Number(st.av.available||0)),unit))}</td><td><b class="${missing>0?'danger-text':''}">${escapeHtml(qtyWithUnit(missing,unit))}</b></td><td><button type="button" class="${statusClass}" onclick="openOrderMaterialPurchase('${o.id}','${i.materialId}')">${escapeHtml(missing>0?t('needToPurchase'):t('reservedDone'))}</button></td><td><button class="iconbtn order-tech-remove" type="button" aria-label="${escapeHtml(t('removeMaterial'))}" onclick="removeTechnologyMaterial('${o.id}',${index})">×</button></td></tr>`}).join('')}</tbody></table></div>`:`<div class="order-tech-empty">${escapeHtml(t('noTechnologyMaterials'))}</div>`}</section>`;
}
function orderTechnologySummaryHtml(o){
  const steps=orderSteps(o),items=orderMaterials(o),missing=orderMissingItems(o),total=calcOrderMinutes(o);
  const missingList=missing.length?`<ul>${missing.map(({item,state})=>{const m=state.av.mat,unit=state.av.unit||item.unit||'';return `<li><b>${escapeHtml(m?materialTitle(m):t('deletedMaterial'))}</b><span>— ${escapeHtml(qtyWithUnit(state.av.missing,unit))}</span></li>`}).join('')}</ul>`:`<div class="order-tech-ok">✓ ${escapeHtml(t('nothingToOrder'))}</div>`;
  return `<div class="order-tech-bottom"><section class="order-tech-card order-purchase-summary"><h4>${escapeHtml(t('whatToOrder'))}</h4>${missingList}</section><section class="order-tech-card"><h4>${escapeHtml(t('technologyTotals'))}</h4><div class="order-tech-totals"><div><small>${escapeHtml(t('totalOperations'))}</small><b>${steps.length}</b></div><div><small>${escapeHtml(t('totalTime'))}</small><b>${total} ${escapeHtml(t('minutesShort'))}</b></div><div><small>${escapeHtml(t('materialsCount'))}</small><b>${items.length}</b></div><div><small>${escapeHtml(t('missingMaterialsCount'))}</small><b class="${missing.length?'danger-text':''}">${missing.length}</b></div></div></section></div>`;
}
function orderTechnologyHtml(o){return `<div class="order-technology-screen">${orderTechnologyOperationsHtml(o)}${orderTechnologyMaterialsHtml(o)}${orderTechnologySummaryHtml(o)}<button class="btn primary order-to-production" type="button" onclick="transferOrderToProduction('${o.id}')">${escapeHtml(t('transferToProduction'))} →</button></div>`}
const PRODUCTION_STATUS_META={
  not_started:{label:'prodStatusNotStarted',tone:'idle'},
  running:{label:'prodStatusRunning',tone:'running'},
  paused:{label:'prodStatusPaused',tone:'paused'},
  done:{label:'prodStatusDone',tone:'done'},
  cancelled:{label:'prodStatusCancelled',tone:'cancelled'}
};
function productionActorName(){try{if(typeof profileUserName==='function')return profileUserName();if(typeof actorName==='function')return actorName();}catch(e){}return t('unknownUser')}
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
    return Object.assign({id:old.id||uid(),stepIndex:index,stepName:step.name||t('operationStage'),status,startedAt:'',pausedAt:'',finishedAt:'',pauseMinutes:0,actualMinutes:0,responsible:step.responsible||'',comment:'',comments:[],collapsed:false},old,{stepIndex:index,stepName:step.name||old.stepName||t('operationStage'),responsible:old.responsible||step.responsible||''});
  });
  return o.production;
}
function productionOps(o){return ensureWorkflowProduction(o).operations}
function productionOp(o,index){return productionOps(o)[Number(index)]}
function productionPlanMinutesForStep(o,index){const step=orderSteps(o)[Number(index)]||{};return Math.max(0,Math.round(Number(step.minutes||0)*orderProductQty(o)))}
function productionActualMinutes(op){if(!op)return 0;if(op.status==='running')return Math.max(Number(op.actualMinutes||0),productionMinutesBetween(op.startedAt)-Number(op.pauseMinutes||0));return Math.max(0,Math.round(Number(op.actualMinutes||0)))}
function productionOpPercent(o,op){if(!op)return 0;if(op.status==='done')return 100;if(op.status==='cancelled')return 0;const plan=productionPlanMinutesForStep(o,op.stepIndex);const actual=productionActualMinutes(op);if(op.status==='running'||op.status==='paused')return plan>0?Math.max(5,Math.min(95,Math.round(actual/plan*100))):25;return 0}
function calcWorkflowProductionPercent(o){const ops=productionOps(o).filter(op=>op.status!=='cancelled');if(!ops.length)return 0;return Math.max(0,Math.min(100,Math.round(ops.reduce((s,op)=>s+productionOpPercent(o,op),0)/ops.length)))}
function productionDoneCount(o){return productionOps(o).filter(op=>op.status==='done').length}
function productionRunningCount(o){return productionOps(o).filter(op=>op.status==='running'||op.status==='paused').length}
function productionCurrentOp(o){return productionOps(o).find(op=>op.status==='running')||productionOps(o).find(op=>op.status==='paused')||productionOps(o).find(op=>op.status==='not_started')||null}
function productionLeftMinutes(o){return productionOps(o).reduce((sum,op)=>op.status==='done'||op.status==='cancelled'?sum:sum+Math.max(0,productionPlanMinutesForStep(o,op.stepIndex)-productionActualMinutes(op)),0)}
function productionEtaText(o){const min=productionLeftMinutes(o);if(!min)return t('prodQueueDone');const d=new Date(Date.now()+min*60000);return d.toLocaleString(currentLang==='ru'?'ru-RU':currentLang==='lv'?'lv-LV':'en-GB',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
function productionStatusLabel(status){return t(PRODUCTION_STATUS_META[status]?.label||'prodStatusNotStarted')}
function productionStatusClass(status){return PRODUCTION_STATUS_META[status]?.tone||'idle'}
function workshopIcon(name){const n=String(name||'').toLowerCase();if(n.includes('стол')||n.includes('wood')||n.includes('gald'))return '🪚';if(n.includes('швей')||n.includes('sew')||n.includes('šū'))return '🧵';if(n.includes('пок')||n.includes('glue')||n.includes('līm'))return '🧴';if(n.includes('тап')||n.includes('uphol'))return '🛋';if(n.includes('упак')||n.includes('pack'))return '📦';return '📦'}
function productionQueueForWorkshop(stepName){
  const rows=(data.orders||[]).flatMap(order=>orderSteps(order).map((step,index)=>({order,step,index}))).filter(row=>String(row.step.name||'').trim()===String(stepName||'').trim()&&!orderIsTerminal(row.order.status));
  rows.sort((a,b)=>String(a.order.dueDate||a.order.date||'').localeCompare(String(b.order.dueDate||b.order.date||'')));
  return rows;
}
function productionQueueState(orderId,stepIndex){
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return {position:0,total:0,label:t('prodQueueWaiting')};
  const step=orderSteps(o)[Number(stepIndex)]||{},queue=productionQueueForWorkshop(step.name),idx=queue.findIndex(row=>String(row.order.id)===String(orderId));
  const op=productionOp(o,stepIndex),label=op?.status==='running'?t('prodQueueNow'):idx===0?t('prodQueueNext'):idx>0?t('prodQueueWaiting'):t('prodQueueWaiting');
  return {position:idx>=0?idx+1:0,total:queue.length,label};
}
function workshopAnalytics(stepName){
  const queue=productionQueueForWorkshop(stepName),todayStr=today();
  const active=queue.filter(row=>['В работе','В производстве'].includes(String(row.order.status||''))).length;
  const overdue=queue.filter(row=>row.order.dueDate&&row.order.dueDate<todayStr).length;
  const plan=queue.reduce((s,row)=>s+productionPlanMinutesForStep(row.order,row.index),0);
  const actual=queue.reduce((s,row)=>s+productionActualMinutes(productionOp(row.order,row.index)),0);
  const load=Math.max(0,Math.min(100,Math.round((active/(queue.length||1))*100 + Math.min(40,plan/240))));
  const warnings=[];
  if(load>=80)warnings.push(`${t('prodWarnOverloaded')} ${stepName}`);
  if(overdue>0)warnings.push(`${stepName} ${t('prodWarnDelayed')} +${orderTimeText(Math.max(60,actual-plan))}`);
  if(plan>0&&actual>plan*1.35)warnings.push(`${stepName} ${t('prodWarnPlanExceeded')}`);
  return {queue,active,overdue,plan,actual,load,warnings};
}
function productionWarnings(o){
  const names=[...new Set(orderSteps(o).map(s=>s.name).filter(Boolean))],list=[];
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
function productionMaterialsControlHtml(o){
  const items=orderMaterials(o);
  if(!items.length)return `<section class="production-workflow-card"><h4>${escapeHtml(t('productionMaterialsControl'))}</h4><div class="order-tech-empty">${escapeHtml(t('noTechnologyMaterials'))}</div></section>`;
  return `<section class="production-workflow-card"><h4>${escapeHtml(t('productionMaterialsControl'))}</h4><div class="production-material-list">${items.map(i=>{const st=orderMaterialLineState(i,o.id),unit=st.av.unit||i.unit||'',used=Math.min(Number(i.qty||0),calcWorkflowProductionPercent(o)/100*Number(i.qty||0)),left=Math.max(0,Number(i.qty||0)-used),m=st.av.mat;return `<div class="${st.av.ok?'':'warn'}"><b>${escapeHtml(m?materialTitle(m):t('deletedMaterial'))}</b><span>${escapeHtml(t('need'))}: ${escapeHtml(qtyWithUnit(i.qty,unit))}</span><span>${escapeHtml(t('prodUsed'))}: ${escapeHtml(qtyWithUnit(used,unit))}</span><span>${escapeHtml(t('prodLeft'))}: ${escapeHtml(qtyWithUnit(left,unit))}</span>${st.av.ok?'':`<em>${escapeHtml(t('needToPurchase'))}</em>`}</div>`}).join('')}</div></section>`;
}
function productionSummaryHtml(o){
  const ops=productionOps(o),done=productionDoneCount(o),running=productionRunningCount(o),current=productionCurrentOp(o);
  return `<section class="production-workflow-card production-summary"><h4>${escapeHtml(t('productionSummary'))}</h4><div><span>${escapeHtml(t('totalOperations'))}</span><b>${ops.length}</b></div><div><span>${escapeHtml(t('prodDone'))}</span><b>${done}</b></div><div><span>${escapeHtml(t('prodInProgress'))}</span><b>${running}</b></div><div><span>${escapeHtml(t('prodCurrentOperation'))}</span><b>${escapeHtml(current?.stepName||'—')}</b></div></section>`;
}
function workshopPanelHtml(orderId,stepIndex){
  const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return '';
  const step=orderSteps(o)[Number(stepIndex)]||{},state=workshopAnalytics(step.name),queue=state.queue,current=queue.find(row=>productionOp(row.order,row.index)?.status==='running')||queue[0],next=queue.find(row=>String(row.order.id)!==String(current?.order.id))||queue[1],third=queue.find(row=>String(row.order.id)!==String(current?.order.id)&&String(row.order.id)!==String(next?.order.id));
  return `<div class="workshop-panel" id="workshopPanel_${o.id}_${stepIndex}"><div class="workshop-panel-head"><div><small>${escapeHtml(t('workshopPanel'))}</small><h4>${workshopIcon(step.name)} ${escapeHtml(step.name||t('operationStage'))}</h4></div><button class="iconbtn" type="button" onclick="closeWorkshopPanel('${o.id}',${stepIndex})">×</button></div><div class="workshop-grid"><div><small>${escapeHtml(t('prodInProgress'))}</small><b>${escapeHtml(current?.order.number||'—')}</b></div><div><small>${escapeHtml(t('prodNext'))}</small><b>${escapeHtml(next?.order.number||'—')}</b></div><div><small>${escapeHtml(t('prodThen'))}</small><b>${escapeHtml(third?.order.number||'—')}</b></div><div><small>${escapeHtml(t('prodLoad'))}</small><b>${state.load}%</b></div><div><small>${escapeHtml(t('activeOrders'))}</small><b>${state.active}</b></div><div><small>${escapeHtml(t('overdue'))}</small><b class="${state.overdue?'danger-text':''}">${state.overdue}</b></div></div><div class="workshop-queue"><span>${escapeHtml(t('queue'))}</span><b>${queue.length}</b><em>${escapeHtml(t('prodEta'))}: ${escapeHtml(productionEtaText(o))}</em></div>${state.warnings.length?`<div class="production-warnings">${state.warnings.map(w=>`<span>⚠ ${escapeHtml(w)}</span>`).join('')}</div>`:''}</div>`;
}
function toggleWorkshopPanel(orderId,stepIndex){document.querySelectorAll('.workshop-panel').forEach(el=>el.remove());const card=document.getElementById(`productionOp_${orderId}_${stepIndex}`);if(card)card.insertAdjacentHTML('afterend',workshopPanelHtml(orderId,stepIndex))}
function closeWorkshopPanel(orderId,stepIndex){document.getElementById(`workshopPanel_${orderId}_${stepIndex}`)?.remove()}
function productionOperationCardHtml(o,op){
  const plan=productionPlanMinutesForStep(o,op.stepIndex),actual=productionActualMinutes(op),diff=actual-plan,pct=productionOpPercent(o,op),state=productionQueueState(o.id,op.stepIndex),status=productionStatusClass(op.status),compact=op.status==='done'&&op.collapsed!==false,comments=Array.isArray(op.comments)?op.comments:[];
  return `<article class="production-operation-card ${status} ${compact?'compact':''}" id="productionOp_${o.id}_${op.stepIndex}"><div class="production-op-strip"></div><div class="production-op-main"><div class="production-op-heading"><div><h4>${workshopIcon(op.stepName)} ${escapeHtml(op.stepName)}</h4><span>${escapeHtml(t('queue'))}: ${state.position?`${state.position} ${t('of')} ${state.total}`:state.label}</span></div><span class="production-status-pill ${status}">${escapeHtml(productionStatusLabel(op.status))}</span></div><div class="production-op-progress"><i><b style="width:${pct}%"></b></i><strong>${pct}%</strong></div><div class="production-op-kpis"><div><small>${escapeHtml(t('responsibleOptional'))}</small><b>${escapeHtml(op.responsible||productionActorName()||t('notSpecified'))}</b></div><div><small>${escapeHtml(t('plan'))}</small><b>${plan} ${escapeHtml(t('minutesShort'))}</b></div><div><small>${escapeHtml(t('fact'))}</small><b>${actual} ${escapeHtml(t('minutesShort'))}</b></div><div><small>${escapeHtml(t('difference'))}</small><b class="${diff>0?'danger-text':'ok-text'}">${diff>0?'+':''}${diff} ${escapeHtml(t('minutesShort'))}</b></div></div>${diff>0?`<div class="production-delay">⚠ +${escapeHtml(orderTimeText(diff))}</div>`:''}${compact?`<button class="btn small" type="button" onclick="toggleProductionOperationCompact('${o.id}',${op.stepIndex})">${escapeHtml(t('expand'))}</button>`:`<div class="production-comment-box"><textarea class="input" id="prodComment_${o.id}_${op.stepIndex}" placeholder="${escapeHtml(t('prodCommentPlaceholder'))}">${escapeHtml(op.comment||'')}</textarea><button class="btn small" type="button" onclick="saveProductionComment('${o.id}',${op.stepIndex})">${escapeHtml(t('save'))}</button></div><div class="production-comments">${comments.slice(0,3).map(c=>`<div><b>${escapeHtml(c.by||'—')}</b><span>${escapeHtml(productionDateTimeText(c.at))}</span><p>${escapeHtml(c.text||'')}</p></div>`).join('')}</div>`}</div><div class="production-op-actions"><button class="btn small" type="button" onclick="toggleWorkshopPanel('${o.id}',${op.stepIndex})">🏭 ${escapeHtml(t('openWorkshop'))}</button><button class="btn small primary" type="button" onclick="startProductionOperation('${o.id}',${op.stepIndex})" ${op.status==='running'||op.status==='done'?'disabled':''}>▶ ${escapeHtml(t('prodStart'))}</button><button class="btn small" type="button" onclick="pauseProductionOperation('${o.id}',${op.stepIndex})" ${op.status!=='running'?'disabled':''}>⏸ ${escapeHtml(t('prodPause'))}</button><button class="btn small" type="button" onclick="completeProductionOperation('${o.id}',${op.stepIndex})" ${op.status==='done'||op.status==='cancelled'?'disabled':''}>✔ ${escapeHtml(t('prodComplete'))}</button></div></article>`;
}
function productionKpiHtml(o){
  const qty=orderProductQty(o),matCount=orderMaterials(o).length,plan=calcOrderMinutes(o),actual=productionOps(o).reduce((s,op)=>s+productionActualMinutes(op),0),pct=calcWorkflowProductionPercent(o),missing=orderMissingItems(o).length;
  const cards=[['📦',t('orderProductCount'),qty],['🧱',t('materialsCount'),matCount],['⏱',t('plannedTime'),`${plan} ${t('minutesShort')}`],['⏱',t('actualTime'),`${actual} ${t('minutesShort')}`],['📈',t('readiness'),`${pct}%`],['⚠',t('missingMaterialsCount'),missing]];
  return `<div class="production-kpi-grid">${cards.map(([icon,label,value])=>`<div class="production-kpi"><span>${icon}</span><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></div>`).join('')}</div>`;
}
function orderProductionWorkflowHtml(o){
  ensureWorkflowProduction(o);
  const pct=calcWorkflowProductionPercent(o),done=productionDoneCount(o),ops=productionOps(o),current=productionCurrentOp(o),warnings=productionWarnings(o),left=ops.length-done;
  return `<div class="production-workflow-screen">${productionKpiHtml(o)}${warnings.length?`<div class="production-warnings">${warnings.map(w=>`<span>⚠ ${escapeHtml(w)}</span>`).join('')}</div>`:''}<section class="production-workflow-card production-main-progress"><div><h4>${escapeHtml(t('productionProgress'))}</h4><b>${pct}%</b></div><div class="production-big-bar"><span style="width:${pct}%"></span></div><div class="production-progress-meta"><span>${escapeHtml(t('prodDone'))}: <b>${done}</b></span><span>${escapeHtml(t('prodLeft'))}: <b>${left}</b></span><span>${escapeHtml(t('prodCurrentOperation'))}: <b>${escapeHtml(current?.stepName||'—')}</b></span></div></section><div class="production-layout"><div class="production-operations-list">${ops.map(op=>productionOperationCardHtml(o,op)).join('')||`<div class="production-empty">${escapeHtml(t('noProductionOperations'))}</div>`}${ops.length&&done===ops.length?`<button class="btn primary transfer-completion-btn" type="button" onclick="transferOrderToCompletion('${o.id}')">${escapeHtml(t('transferToCompletion'))} →</button>`:''}</div><aside class="production-aside">${productionTimelineHtml(o)}${productionSummaryHtml(o)}${productionMaterialsControlHtml(o)}</aside></div></div>`;
}
async function persistProductionWorkflow(o,message,type='production_update',meta={}){
  o.updatedAt=productionNow();o.updatedBy=productionActorName();
  save();try{if(typeof auditAdd==='function')auditAdd(type,'order',o.id,o.number,message,meta)}catch(e){}
  try{syncMaterialReservations();await persistReservationMaterials()}catch(e){}
  refreshOrderWorkflow(o.id);
}
async function startProductionOperation(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op||op.status==='done')return;const now=productionNow();if(!op.startedAt)op.startedAt=now;if(op.status==='paused'&&op.pausedAt)op.pauseMinutes=Number(op.pauseMinutes||0)+productionMinutesBetween(op.pausedAt,now);op.pausedAt='';op.status='running';o.status='В работе';await persistProductionWorkflow(o,`${t('historyProductionOperationStarted')}: ${op.stepName}`,'production_operation_started',{step:op.stepName})}
async function pauseProductionOperation(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op||op.status!=='running')return;op.status='paused';op.pausedAt=productionNow();await persistProductionWorkflow(o,`${t('historyProductionPaused')}: ${op.stepName}`,'production_operation_paused',{step:op.stepName})}
async function completeProductionOperation(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op||op.status==='done')return;const now=productionNow();if(!op.startedAt)op.startedAt=now;if(op.status==='paused'&&op.pausedAt)op.pauseMinutes=Number(op.pauseMinutes||0)+productionMinutesBetween(op.pausedAt,now);op.status='done';op.finishedAt=now;op.actualMinutes=productionMinutesBetween(op.startedAt,now)-Number(op.pauseMinutes||0);op.collapsed=true;const prod=ensureWorkflowProduction(o);if(!prod.logs.some(l=>Number(l.stepIndex)===Number(index)&&String(l.source)==='workflow-complete'))prod.logs.unshift({id:uid(),stepIndex:Number(index),stepName:op.stepName,qty:orderProductQty(o),at:now,source:'workflow-complete'});if(productionDoneCount(o)===productionOps(o).length)o.status='Готов';await persistProductionWorkflow(o,`${t('historyProductionOperationCompleted')}: ${op.stepName}`,'production_operation_completed',{step:op.stepName,actualMinutes:op.actualMinutes})}
async function saveProductionComment(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op)return;const text=document.getElementById(`prodComment_${orderId}_${index}`)?.value.trim()||'';op.comment=text;if(text){if(!Array.isArray(op.comments))op.comments=[];op.comments.unshift({id:uid(),by:productionActorName(),at:productionNow(),text});}await persistProductionWorkflow(o,`${t('historyProductionComment')}: ${op.stepName}`,'production_comment',{step:op.stepName,comment:text})}
function toggleProductionOperationCompact(orderId,index){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;const op=productionOp(o,index);if(!op)return;op.collapsed=!op.collapsed;save();refreshOrderWorkflow(orderId)}
async function transferOrderToCompletion(orderId){const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));if(!o)return;if(productionDoneCount(o)!==productionOps(o).length){toast(t('productionNotFinished'));return}orderWorkflowSelection.set(String(orderId),3);o.status='Готов';await persistProductionWorkflow(o,t('historyTransferredCompletion'),'production_to_completion',{})}
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
}
function technologyAuditOnce(o){if(!o||!hasOrderTechnology(o.steps))return;const rows=typeof auditFor==='function'?auditFor('order',o.id):[];if(!rows.some(r=>r.type==='technology_filled'))auditAdd('technology_filled','order',o.id,o.number,t('historyTechnologyFilled'))}
async function persistTechnologyOrder(o){save();try{syncMaterialReservations();await persistReservationMaterials()}catch(e){console.error('Technology reservation sync failed',e)}refreshOrderWorkflow(o.id)}
async function addTechnologyOperation(id){const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;o.steps=orderSteps(o).map(s=>({...s}));o.steps.push({name:t('newOperation'),minutes:0,responsible:''});auditAdd('technology_operation_added','order',o.id,o.number,t('historyOperationAdded'));await persistTechnologyOrder(o)}
async function removeTechnologyOperation(id,index){const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;const steps=orderSteps(o).map(s=>({...s})),removed=steps[index];if(!removed)return;steps.splice(index,1);o.steps=steps;auditAdd('technology_operation_removed','order',o.id,o.number,`${t('historyOperationRemoved')}: ${removed.name||t('operationStage')}`);await persistTechnologyOrder(o)}
async function updateTechnologyOperation(id,index,field,value){const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;o.steps=orderSteps(o).map(s=>({...s}));const step=o.steps[index];if(!step)return;const before=step[field];step[field]=field==='minutes'?Math.max(0,Math.round(Number(value||0))):String(value||'').trim();if(String(before)===String(step[field]))return;if(field==='minutes')auditAdd('technology_time_changed','order',o.id,o.number,`${t('historyTimeChanged')}: ${step.name||t('operationStage')} · ${before||0} → ${step.minutes} ${t('minutesShort')}`);else auditAdd('technology_operation_changed','order',o.id,o.number,`${t('historyOperationChanged')}: ${step.name||t('operationStage')}`);technologyAuditOnce(o);await persistTechnologyOrder(o)}
function openTechnologyMaterials(id){openOrderModal(id);setTimeout(()=>document.getElementById('orderMaterialsBox')?.scrollIntoView({behavior:'smooth',block:'start'}),80)}
async function removeTechnologyMaterial(id,index){const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;const removed=orderMaterials(o)[index];if(!removed)return;const m=(data.materials||[]).find(x=>String(x.id)===String(removed.materialId));o.materials=orderMaterials(o).filter((_,i)=>i!==index);auditAdd('technology_material_removed','order',o.id,o.number,`${t('historyMaterialRemoved')}: ${m?materialTitle(m):removed.materialId}`);await persistTechnologyOrder(o)}
async function transferOrderToProduction(id){const o=(data.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;if(!hasOrderTechnology(o.steps)){toast(t('technologyRequired'));return}technologyAuditOnce(o);const from=o.status;if(typeof setOrderStatusPersisted==='function'){if(!await setOrderStatusPersisted(id,'В производстве')){if(String(o.status)!=='В производстве')return}}else{o.status='В производстве';save()}orderWorkflowSelection.set(String(id),2);auditAdd('technology_to_production','order',o.id,o.number,t('historyTransferredProduction'),{from,to:'В производстве'});refreshOrderStatusUI(id,false);toast(t('transferredProduction'))}
function selectOrderWorkflowStage(event,id,index,context='card'){
  event?.stopPropagation();orderWorkflowSelection.set(String(id),index);
  if(context==='modal'){
    const o=(data.orders||[]).find(x=>String(x.id)===String(id)),root=document.getElementById('orderWorkflowModal');
    if(o&&root)root.innerHTML=orderWorkflowStepperHtml(o,'modal')+orderWorkflowContentHtml(o,true);
  }else renderOrders();
}
function orderExpandedCardHtml(o){return `<div class="order-card-expanded">${orderWorkflowStepperHtml(o,'card')}${orderWorkflowContentHtml(o,true)}</div>`}
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
  const body=`<div class="order-form-stage"><span>1</span><div><small>${escapeHtml(t('orderStageOne'))}</small><b>${escapeHtml(t('orderStageCreation'))}</b></div></div><div class="form-grid">
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
