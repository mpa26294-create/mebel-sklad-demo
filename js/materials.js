function stockNum(v){const n=Number(String(v??0).replace(',','.'));return Number.isFinite(n)?Number(n.toFixed(3)):0}
function stockNumForUnit(v,unit){const n=stockNum(v);return typeof discreteStockUnit==='function'&&discreteStockUnit(unit)?Math.trunc(n):n}
function stockStep(unit){return typeof discreteStockUnit==='function'&&discreteStockUnit(unit)?'1':'0.01'}
function stockDefaultValue(unit){return stockStep(unit)}
function normalizeStockValue(value,unit,allowZero=true){const raw=String(value??'0').replace(',','.');const n=Number(raw);if(!Number.isFinite(n) || (allowZero?n<0:n<=0))return null;if(typeof discreteStockUnit==='function'&&discreteStockUnit(unit)){if(!Number.isInteger(n))return null;return n;}return Number(n.toFixed(3));}
function reservedQty(m){
  if(m && typeof materialReservedOutsideOrder==='function')return Math.max(0,stockNumForUnit(materialReservedOutsideOrder(m.id,'',m.unit||''),m.unit));
  return Math.max(0,stockNumForUnit((m.attributes||{}).reservedQty,m.unit));
}
function orderedManualQty(m){return Math.max(0,stockNumForUnit((m.attributes||{}).orderedQty,m.unit))}
function orderedQty(m){return Math.max(0,stockNumForUnit(orderedManualQty(m)+orderedByOrdersQty(m),m.unit))}
function availableQty(m){const u=m.unit;return Math.max(0,stockNumForUnit(stockNumForUnit(m.quantity,u)-reservedQty(m),u))}

function materialOrderedOrders(matId){
  return (data.orders||[])
    .filter(o=>!['Готов','Отменён'].includes(o.status))
    .flatMap(o=>orderMaterials(o).filter(i=>String(i.materialId)===String(matId) && orderItemPurchaseStatus(i)==='ordered' && Number(orderItemPurchaseQty(i,0)||0)>0).map(i=>({order:o,item:i})));
}
function orderedByOrdersQty(m){
  return Math.max(0,stockNumForUnit(materialOrderedOrders(m.id).reduce((s,r)=>s+convertMaterialQty(Number(orderItemPurchaseQty(r.item,0)||0),r.item.unit||m.unit,m.unit,m),0),m.unit));
}
function materialReservationOrders(matId){
  return (data.orders||[])
    .filter(o=>!['Готов','Отменён'].includes(o.status))
    .flatMap(o=>orderMaterials(o).filter(i=>String(i.materialId)===String(matId)).map(i=>({order:o,item:i})));
}
function materialOrderReservedQty(item,m){
  if(typeof orderItemRemainingReserveQty==='function')return orderItemRemainingReserveQty(item,m);
  return Number(item?.qty||0);
}
function isLinearFabricStock(m){
  return (m?.category==='Ткань'||m?.category==='Экокожа') && m?.unit==='рулон';
}
function isLinearFabricMaterial(m){
  return (m?.category==='Ткань'||m?.category==='Экокожа') && (isLinearFabricStock(m)||isLinearUnit(m?.unit));
}
function materialDisplayUnit(m){
  return isLinearFabricStock(m)?'пог. м':(m?.unit||'шт');
}
function materialLinearStockQty(m){
  const a=m?.attributes||{};
  const saved=Number(String(a.linearBalanceMeters||0).replace(',','.'));
  if(Number.isFinite(saved)&&saved>0)return stockNumForUnit(saved,'пог. м');
  return convertMaterialQty(Number(m?.quantity||0),m?.unit||'','пог. м',m);
}
function materialDisplayQty(q,m,fromUnit){
  if(!isLinearFabricStock(m))return stockNumForUnit(q,fromUnit||m?.unit||'шт');
  const unit=fromUnit||m?.unit||'';
  if(unit===m?.unit && Number(q||0)===Number(m?.quantity||0))return materialLinearStockQty(m);
  return stockNumForUnit(convertMaterialQty(Number(q||0),unit,'пог. м',m),'пог. м');
}
function materialDisplayQtyWithUnit(q,m,fromUnit){
  const unit=materialDisplayUnit(m);
  return qtyWithUnit(materialDisplayQty(q,m,fromUnit),unit);
}
function materialDisplayStats(m){
  if(!isLinearFabricStock(m)){
    const unit=m.unit||'шт';
    const stock=stockNumForUnit(m.quantity,unit);
    const reserved=reservedQty(m);
    const ordered=orderedQty(m);
    return {unit,stock,reserved,ordered,available:availableQty(m),need:stockNeededToOrderQty(m)};
  }
  const unit='пог. м';
  const stock=materialLinearStockQty(m);
  const reserved=stockNumForUnit(materialReservationOrders(m.id).reduce((s,r)=>s+convertMaterialQty(materialOrderReservedQty(r.item,m),r.item.unit||unit,unit,m),0),unit);
  const manual=convertMaterialQty(orderedManualQty(m),m.unit||unit,unit,m);
  const orderedFromOrders=materialOrderedOrders(m.id).reduce((s,r)=>s+convertMaterialQty(Number(orderItemPurchaseQty(r.item,0)||0),r.item.unit||unit,unit,m),0);
  const ordered=stockNumForUnit(manual+orderedFromOrders,unit);
  return {unit,stock,reserved,ordered,available:Math.max(0,stockNumForUnit(stock-reserved,unit)),need:Math.max(0,stockNumForUnit(reserved-stock-ordered,unit))};
}
function materialAreaHint(m,meters){
  const a=m?.attributes||{};
  const width=Number(a.rollWidth||0)||((Number(a.rollWidthMm||0)>0)?Number(a.rollWidthMm)/1000:0);
  const length=Number(meters||0);
  if(!isLinearFabricMaterial(m)||!(width>0&&length>0))return '';
  return `${Number((width*length).toFixed(2))} м²`;
}
function reservationOrdersHtml(m){
  const rows=materialReservationOrders(m.id);
  if(!rows.length)return `<div class="reserve-orders muted">${t('noReservationsForOrders')}</div>`;
  const unit=materialDisplayUnit(m);
  return `<div class="reserve-orders">${rows.map(r=>{const qty=convertMaterialQty(materialOrderReservedQty(r.item,m),r.item.unit||unit,unit,m);return `<button class="reserve-order-link" type="button" onclick="goToOrderFromMaterial(event,'${r.order.id}')"><span><b>${escapeHtml(r.order.number||'—')}</b>${r.order.client?` · ${escapeHtml(r.order.client)}`:''}<br><small>${t('reserveLabel')}: ${escapeHtml(qtyWithUnit(qty,unit))}</small></span><span class="go">›</span></button>`}).join('')}</div>`;
}

function detailItem(label,value,full=false){return `<div class="detail-card ${full?'full':''}"><div class="detail-label">${escapeHtml(label)}</div><div class="detail-value">${value?escapeHtml(value):'—'}</div></div>`}
function reservedForOrdersPanel(m){
  const rows=materialReservationOrders(m.id);
  const total=reservedQty(m);
  if(total<=0) return '';
  if(!rows.length){
    return `<div class="reserved-orders-box"><div class="reserved-orders-title">${t('reserveLabel')}</div><div class="reserve-orders muted">${escapeHtml(qtyWithUnit(total,m.unit||'шт'))} · ${t('notLinkedToOrder')}</div></div>`;
  }
  return `<div class="reserved-orders-box"><div class="reserved-orders-title">${t('reservedForOrderTitle')}</div>${reservationOrdersHtml(m)}</div>`;
}
function manualPurchaseOrderAllocations(m){
  const list=(m.attributes&&Array.isArray(m.attributes.manualPurchaseOrders))?m.attributes.manualPurchaseOrders:[];
  return list
    .map(x=>({orderId:String(x.orderId||''),qty:stockNumForUnit(x.qty||0,m.unit||'шт')}))
    .filter(x=>x.orderId&&x.qty>0);
}
function orderedOrdersHtml(m){
  const rows=materialOrderedOrders(m.id);
  const manual=orderedManualQty(m);
  if(!rows.length && manual<=0)return `<div class="reserve-orders muted">${t('noSupplierOrders')}</div>`;

  const allocations=manualPurchaseOrderAllocations(m);
  const allocatedTotal=stockNumForUnit(allocations.reduce((s,x)=>s+Number(x.qty||0),0),m.unit||'шт');
  const unit=materialDisplayUnit(m);
  let manualHtml='';
  if(manual>0 && allocations.length){
    manualHtml=allocations.map(a=>{
      const order=(data.orders||[]).find(o=>String(o.id)===String(a.orderId));
      const title=order?`${escapeHtml(order.number||'—')}${order.client?' · '+escapeHtml(order.client):''}`:t('selectedOrderFallback');
      return `<button class="reserve-order-link" type="button" onclick="goToOrderFromMaterial(event,'${a.orderId}')"><span><b>${title}</b><br><small>${t('orderedFromSupplier')}: ${escapeHtml(qtyWithUnit(convertMaterialQty(a.qty,m.unit||unit,unit,m),unit))}</small></span><span class="go">›</span></button>`;
    }).join('');
    const rest=stockNumForUnit(manual-allocatedTotal,m.unit||'шт');
    if(rest>0){
      manualHtml+=`<div class="reserve-order-link" style="cursor:default"><span><b>${t('manualPurchaseTitle')}</b><br><small>${t('notLinkedShort')}: ${escapeHtml(qtyWithUnit(convertMaterialQty(rest,m.unit||unit,unit,m),unit))}</small></span></div>`;
    }
  }else if(manual>0){
    manualHtml=`<div class="reserve-order-link" style="cursor:default"><span><b>${t('manualPurchaseTitle')}</b><br><small>${t('ordered')}: ${escapeHtml(qtyWithUnit(convertMaterialQty(manual,m.unit||unit,unit,m),unit))}</small></span></div>`;
  }

  const rowsHtml=rows.map(r=>{const qty=convertMaterialQty(Number(orderItemPurchaseQty(r.item,0)||0),r.item.unit||unit,unit,m);return `<button class="reserve-order-link" type="button" onclick="goToOrderFromMaterial(event,'${r.order.id}')"><span><b>${escapeHtml(r.order.number||'—')}</b>${r.order.client?` · ${escapeHtml(r.order.client)}`:''}<br><small>${t('ordered')}: ${escapeHtml(qtyWithUnit(qty,unit))}${r.item.purchaseNo?' · '+escapeHtml(r.item.purchaseNo):''}</small></span><span class="go">›</span></button>`}).join('');
  return `<div class="reserve-orders">${manualHtml}${rowsHtml}</div>`;
}
function reservationOrdersShort(m){
  const rows=materialReservationOrders(m.id);
  if(!rows.length)return '';
  return `${t('reserveLabel')} ${qtyWithUnit(reservedQty(m),m.unit)}`;
}

// New function for order usage cards
function materialOrderUsageCards(m){
  const rows=materialReservationOrders(m.id);
  if(!rows.length)return `<div class="order-usage-empty">${t('materialNotUsedInActiveOrders')}</div>`;

  const unit=materialDisplayUnit(m);
  return rows.map(r=>{
    const order=r.order;
    const item=r.item;
    // "Осталось нужно" — это то, что реально ОСТАЛОСЬ списать по заказу (уже произведённое не в счёт),
    // поэтому "Не хватает" считается от той же базы и не расходится с ней.
    const av=typeof orderItemAvailability==='function'?orderItemAvailability(item,order.id):null;
    const avUnit=av?.unit||item.unit||unit;
    const totalRaw=Number(item.qty||0);
    const takenRaw=typeof orderItemConsumedQty==='function'?orderItemConsumedQty(item):0;
    const neededRaw=typeof orderItemRemainingReserveQty==='function'?orderItemRemainingReserveQty(item,m):Math.max(0,totalRaw-takenRaw);
    const orderedRaw=Number(orderItemPurchaseQty(item,0)||0);
    const shortageRaw=Math.max(0,Number(av?.missing||0)-orderedRaw);
    const total=convertMaterialQty(totalRaw,item.unit||unit,unit,m);
    const taken=convertMaterialQty(takenRaw,item.unit||unit,unit,m);
    const needed=convertMaterialQty(neededRaw,avUnit,unit,m);
    const ordered=convertMaterialQty(orderedRaw,item.unit||unit,unit,m);
    const shortage=convertMaterialQty(shortageRaw,avUnit,unit,m);

    return `<div class="order-usage-card">
      <div class="order-usage-header">
        <div class="order-usage-number">${escapeHtml(order.number||'—')}</div>
        <div class="order-usage-client">${escapeHtml(order.client||'—')}</div>
      </div>
      <div class="order-usage-stats order-usage-stats-5">
        <div class="order-usage-stat">
          <span class="order-usage-label">${t('totalNeededLabel')}</span>
          <span class="order-usage-value">${escapeHtml(qtyWithUnit(total,unit))}</span>
        </div>
        <div class="order-usage-stat">
          <span class="order-usage-label">${t('alreadyTakenLabel')}</span>
          <span class="order-usage-value">${escapeHtml(qtyWithUnit(taken,unit))}</span>
        </div>
        <div class="order-usage-stat">
          <span class="order-usage-label">${t('stillNeededLabel')}</span>
          <span class="order-usage-value">${escapeHtml(qtyWithUnit(needed,unit))}</span>
        </div>
        <div class="order-usage-stat">
          <span class="order-usage-label">${t('ordered')}</span>
          <span class="order-usage-value">${escapeHtml(qtyWithUnit(ordered,unit))}</span>
        </div>
        <div class="order-usage-stat ${shortage>0?'danger':''}">
          <span class="order-usage-label">${t('notEnoughLabel')}</span>
          <span class="order-usage-value">${escapeHtml(qtyWithUnit(shortage,unit))}</span>
        </div>
      </div>
      <div class="order-usage-footer">
        <span class="order-usage-status">${escapeHtml(order.status||'—')}</span>
        <button class="btn small primary" onclick="goToOrderFromMaterial(event,'${order.id}')">${t('openOrderBtn')}</button>
      </div>
    </div>`;
  }).join('');
}

// New function for supplier delivery cards
function materialSupplierDeliveries(m){
  const a=m.attributes||{};
  const manual=(a.manualPurchaseOrders||[]);
  const rows=materialOrderedOrders(m.id);

  if(!rows.length && manual.length===0)return `<div class="supplier-deliveries-empty">${t('noActiveDeliveries')}</div>`;

  const unit=m.unit||'шт';
  const deliveries=[];

  // Add manual purchase orders
  manual.forEach(po=>{
    const order=(data.orders||[]).find(o=>String(o.id)===String(po.orderId));
    deliveries.push({
      type:'manual',
      orderId:po.orderId,
      orderNumber:order?.number||'—',
      orderClient:order?.client||'—',
      qty:Number(po.qty||0),
      supplier:a.supplier||'—',
      orderDate:a.purchaseDate||'—',
      expectedDate:a.expectedReceiptDate||'—',
      status:'ordered'
    });
  });

  // Add order-based purchases
  rows.forEach(r=>{
    const order=r.order;
    const item=r.item;
    deliveries.push({
      type:'order',
      orderId:order.id,
      orderNumber:order.number||'—',
      orderClient:order.client||'—',
      qty:convertMaterialQty(Number(orderItemPurchaseQty(item,0)||0),item.unit||unit,unit,m),
      supplier:item.purchaseSupplier||'—',
      orderDate:item.purchaseDate||'—',
      expectedDate:item.expectedDate||'—',
      status:'ordered'
    });
  });

  if(deliveries.length===0)return `<div class="supplier-deliveries-empty">${t('noActiveDeliveries')}</div>`;

  return deliveries.map(d=>`
    <div class="supplier-delivery-card">
      <div class="delivery-header">
        <div class="delivery-order">${escapeHtml(d.orderNumber)}</div>
        <div class="delivery-qty">${escapeHtml(qtyWithUnit(d.qty,unit))}</div>
      </div>
      <div class="delivery-info">
        <div class="delivery-info-row">
          <span class="delivery-label">${t('forOrderLabel')}</span>
          <span class="delivery-value">${escapeHtml(d.orderClient)}</span>
        </div>
        <div class="delivery-info-row">
          <span class="delivery-label">${t('supplier')}</span>
          <span class="delivery-value">${escapeHtml(d.supplier)}</span>
        </div>
        <div class="delivery-info-row">
          <span class="delivery-label">${t('orderDateLabel')}</span>
          <span class="delivery-value">${escapeHtml(d.orderDate)}</span>
        </div>
        <div class="delivery-info-row">
          <span class="delivery-label">${t('expectedLabel')}</span>
          <span class="delivery-value">${escapeHtml(d.expectedDate)}</span>
        </div>
      </div>
      <div class="delivery-actions">
        <button class="btn small primary" onclick="acceptMaterialDelivery('${m.id}','${d.orderId}',${d.qty})">${t('acceptBtn')}</button>
        <button class="btn small ghost" onclick="editMaterialDelivery('${m.id}','${d.orderId}')">${t('editBtn')}</button>
        <button class="btn small danger" onclick="cancelMaterialDelivery('${m.id}','${d.orderId}')">${t('cancel')}</button>
      </div>
    </div>
  `).join('');
}

// Placeholder functions for delivery actions
function acceptMaterialDelivery(materialId,orderId,qty){
  toast(t('featureAcceptDeliveryStub'));
}

function editMaterialDelivery(materialId,orderId){
  toast(t('featureEditDeliveryStub'));
}

function cancelMaterialDelivery(materialId,orderId){
  toast(t('featureCancelDeliveryStub'));
}

function openNewMaterialOrder(materialId){
  toast(t('featureOrderMaterialStub'));
}

// Quick actions mode switching
function switchQuickActionMode(mode){
  // Update tabs
  document.querySelectorAll('.quick-tab').forEach(tab=>{
    tab.classList.toggle('active',tab.dataset.mode===mode);
  });

  // Update panels
  document.querySelectorAll('.quick-action-panel').forEach(panel=>{
    panel.classList.add('hidden');
    panel.classList.remove('active');
  });

  const activePanel=document.getElementById('quickAction'+mode.charAt(0).toUpperCase()+mode.slice(1));
  if(activePanel){
    activePanel.classList.remove('hidden');
    activePanel.classList.add('active');
  }
}

function materialDetailGo(target){
  const modal=document.querySelector('#modalBackdrop .modal.detail-modal');
  if(!modal)return;
  if(target==='writeoff'){
    switchQuickActionMode('out');
    const card=modal.querySelector('[data-detail-action-card]');
    card?.scrollIntoView({behavior:'smooth',block:'start'});
    setTimeout(()=>document.getElementById('detailQtyChange')?.focus(),180);
    return;
  }
  if(target==='stock'){
    const panel=modal.querySelector('[data-detail-stock]');
    panel?.scrollIntoView({behavior:'smooth',block:'center'});
    panel?.classList.add('pulse-focus');
    setTimeout(()=>panel?.classList.remove('pulse-focus'),900);
    return;
  }
  if(target==='orders'){
    const section=modal.querySelector('[data-detail-section="orders"]');
    if(section){
      section.open=true;
      section.scrollIntoView({behavior:'smooth',block:'start'});
    }
  }
}

// Quick material action execution
function quickMaterialAction(materialId,mode){
  const m=data.materials.find(x=>String(x.id)===String(materialId));
  if(!m){toast(t('notFoundMaterial'));return;}

  const unit=m.unit||'шт';
  let qty;

  if(mode==='in'){
    qty=normalizeStockValue(document.getElementById('detailQtyChange')?.value||0,unit,false);
    if(qty===null){toast(t('enterValidQuantity'));return;}
    adjustMaterialQty(materialId,1);
  }else if(mode==='out'){
    qty=normalizeStockValue(document.getElementById('detailQtyChange')?.value||0,unit,false);
    if(qty===null){toast(t('enterValidQuantity'));return;}
    adjustMaterialQty(materialId,-1);
  }else if(mode==='adjust'){
    const displayUnit=materialDisplayUnit(m);
    const newQty=normalizeStockValue(document.getElementById('quickAdjustNew')?.value||0,displayUnit,false);
    if(newQty===null){toast(t('enterValidQuantity'));return;}

    if(isLinearFabricStock(m)){
      const oldQty=stockNumForUnit(m.quantity,unit);
      const oldAttrs={...(m.attributes||{})};
      const rollLength=Number(oldAttrs.rollLength||oldAttrs.orderedRollLength||0);
      m.attributes={...oldAttrs,linearBalanceMeters:stockNumForUnit(newQty,'пог. м')};
      m.quantity=stockNumForUnit(newQty>0?(rollLength?Math.ceil(newQty/rollLength):1):0,unit);
      m.lastUpdated=today();
      updateMaterialInSupabase(m).then(ok=>{
        if(ok){
          loadMaterialsFromSupabase();
          renderAll();
          openMaterialDetails(materialId);
          toast(t('stockAdjusted'));
        }else{
          m.quantity=oldQty;
          m.attributes=oldAttrs;
        }
      });
      return;
    }

    const oldQty=stockNumForUnit(m.quantity,unit);
    const delta=newQty-oldQty;

    if(delta>0){
      // Increase stock
      applyMaterialReceipt(m,delta);
    }else if(delta<0){
      // Decrease stock
      m.quantity=stockNumForUnit(newQty,unit);
      m.lastUpdated=today();
      updateMaterialInSupabase(m).then(ok=>{
        if(ok){
          loadMaterialsFromSupabase();
          renderAll();
          openMaterialDetails(materialId);
          toast(t('stockAdjusted'));
        }
      });
    }
  }
}

// Material history filtering
function filterMaterialHistory(filterType){
  // Update filter buttons
  document.querySelectorAll('.history-filter-btn').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.filter===filterType);
  });

  // Filter history items (placeholder - will be implemented with actual history data)
  const historyList=document.getElementById('materialHistoryList');
  if(historyList){
    // Placeholder filtering logic
    const items=historyList.querySelectorAll('.history-item');
    items.forEach(item=>{
      const itemType=item.dataset.type;
      if(filterType==='all' || itemType===filterType){
        item.style.display='flex';
      }else{
        item.style.display='none';
      }
    });
  }
}

// Load material history (placeholder)
function loadMaterialHistory(materialId){
  const historyList=document.getElementById('materialHistoryList');
  if(!historyList) return;

  // Placeholder - will be implemented with actual audit/history data
  historyList.innerHTML=`<div class="history-empty">${t('historyEmptyGeneric')}</div>`;
}

function stockInfoBlock(m){const u=m.unit||'';return `<div class="stock-info-grid"><div class="stock-info-card"><div class="stock-info-label">${t('inStockLabel')}</div><div class="stock-info-value">${escapeHtml(qtyWithUnit(stockNumForUnit(m.quantity,u),u))}</div></div><div class="stock-info-card"><div class="stock-info-label">${t('reservedShortLabel')}</div><div class="stock-info-value">${escapeHtml(qtyWithUnit(reservedQty(m),u))}</div>${reservationOrdersHtml(m)}</div><div class="stock-info-card"><div class="stock-info-label">${t('ordered')}</div><div class="stock-info-value">${escapeHtml(qtyWithUnit(orderedQty(m),u))}</div>${orderedOrdersHtml(m)}</div><div class="stock-info-card"><div class="stock-info-label">${t('availableLabel')}</div><div class="stock-info-value">${escapeHtml(qtyWithUnit(availableQty(m),u))}</div></div></div>`}
function stockNumberInput(id,label,value,unit=''){return `<div class="field"><label>${label}${unit?`, ${escapeHtml(unitLabel(unit))}`:''}</label><input id="${id}" type="number" step="${stockStep(unit)}" min="0" class="input" value="${inputQtyValue(stockNumForUnit(value,unit),unit)}" inputmode="decimal"></div>`}
function stockTripleInputs(prefix, values, unit){return `<div class="stock-input-block"><div class="stock-input-head">${t('stockQuantitiesTitle')} <button class="info-btn" type="button" onclick="showStockStatusHelp()">i</button></div><div class="stock-input-row">${stockNumberInput(prefix+'Ordered',t('ordered'),values.ordered,unit)}${stockNumberInput(prefix+'Reserved',t('reservedShortLabel'),values.reserved,unit)}${stockNumberInput(prefix+'Qty',t('inStockLabel'),values.qty,unit)}</div></div>`}
function syncStockInputs(prefix,unit){['Qty','Reserved','Ordered','Min'].forEach(suf=>{const el=document.getElementById(prefix+suf);if(!el)return;el.step=stockStep(unit);el.min='0';const v=normalizeStockValue(el.value,unit,true);if(v!==null)el.value=inputQtyValue(v,unit);});const qtyLabel=document.getElementById(prefix+'QtyLabel');if(qtyLabel)qtyLabel.textContent=`${t('inStockLabel')}, ${unitLabel(unit)}`;}

function stockNeededToOrderQty(m){const u=m.unit||'шт';return Math.max(0,stockNumForUnit(reservedQty(m)-stockNumForUnit(m.quantity,u)-orderedQty(m),u))}
function stockActionSummaryBlock(m){const u=m.unit||'шт';const stock=stockNumForUnit(m.quantity,u);const reserved=reservedQty(m);const ordered=orderedQty(m);const available=availableQty(m);const need=stockNeededToOrderQty(m);const covered=Math.max(0,stockNumForUnit(stock+ordered-reserved,u));return `<div class="stock-action-summary"><div class="stock-action-title">${t('stockAndOrdersTitle')}</div><div class="stock-action-grid"><div class="stock-action-card"><small>${t('inStockLabel')}</small><b>${escapeHtml(qtyWithUnit(stock,u))}</b></div><div class="stock-action-card"><small>${t('reservedShortLabel')}</small><b>${escapeHtml(qtyWithUnit(reserved,u))}</b></div><div class="stock-action-card"><small>${t('ordered')}</small><b>${escapeHtml(qtyWithUnit(ordered,u))}</b></div><div class="stock-action-card ${need>0?'warn':''}"><small>${t('toOrderLabel')}</small><b>${escapeHtml(qtyWithUnit(need,u))}</b></div></div>${need>0?`<div class="order-material-note compact"><b>${t('needToOrderPrefix')}: ${escapeHtml(qtyWithUnit(need,u))}</b><br>${t('calcFormulaLabel')}: ${t('reservedShortWithColon')} ${escapeHtml(qtyWithUnit(reserved,u))} − ${t('minusStockWord')} ${escapeHtml(qtyWithUnit(stock,u))} − ${t('minusOrderedWord')} ${escapeHtml(qtyWithUnit(ordered,u))}.</div>`:''}<div class="stock-action-lists"><div class="stock-action-list"><h5>${t('reserveByOrdersTitle')}</h5>${reservationOrdersHtml(m)}</div><div class="stock-action-list"><h5>${t('orderedToSupplierTitle')}</h5>${orderedOrdersHtml(m)}</div></div></div>`}
function purchaseOrderPickerHtml(m){
  const reservations=materialReservationOrders(m.id);
  const selected=new Set(manualPurchaseOrderAllocations(m).map(x=>String(x.orderId)));
  if(!reservations.length){
    return `<div class="purchase-order-picker"><div class="purchase-order-picker-title">${t('forWhichOrderLabel')}</div><div class="purchase-order-picker-empty">${t('noActiveReservedOrders')}</div></div>`;
  }
  const selectedCount=reservations.filter(r=>selected.has(String(r.order.id))).length;
  const label=selectedCount>0 ? `${t('selectedCountLabel')}: ${selectedCount}` : t('chooseOrdersLabel');
  const rows=reservations.map(r=>{
    const oid=String(r.order.id);
    const checked=selected.has(oid)?'checked':'';
    return `<label class="purchase-order-option"><input class="manual-purchase-order-check" type="checkbox" value="${escapeHtml(oid)}" ${checked} onchange="refreshPurchaseOrderDropdownLabel(this)"><span><b>${escapeHtml(r.order.number||'—')}${r.order.client?' · '+escapeHtml(r.order.client):''}</b><small>${t('reserveLabel')}: ${escapeHtml(qtyWithUnit(r.item.qty,m.unit||'шт'))}</small></span></label>`;
  }).join('');
  return `<div class="purchase-order-picker"><div class="purchase-order-picker-title">${t('forWhichOrderLabel')}</div><div class="purchase-order-dropdown"><button class="purchase-order-toggle" type="button" onclick="togglePurchaseOrderDropdown(this)"><span>${label}</span></button><div class="purchase-order-list">${rows}</div></div></div>`;
}
function togglePurchaseOrderDropdown(btn){
  const picker=btn.closest('.purchase-order-picker');
  if(!picker)return;
  document.querySelectorAll('.purchase-order-picker.open').forEach(x=>{if(x!==picker)x.classList.remove('open')});
  picker.classList.toggle('open');
}
function refreshPurchaseOrderDropdownLabel(input){
  const picker=input.closest('.purchase-order-picker');
  if(!picker)return;
  const count=picker.querySelectorAll('.manual-purchase-order-check:checked').length;
  const label=picker.querySelector('.purchase-order-toggle span');
  if(label)label.textContent=count>0?`${t('selectedCountLabel')}: ${count}`:t('chooseOrdersLabel');
}
function stockAdjustBlock(m){
  const step=stockStep(m.unit||'шт');
  const value=stockDefaultValue(m.unit||'шт');
  const unitText=unitLabel(m.unit||'шт');
  const need=stockNeededToOrderQty(m);
  const orderedInput=need>0?inputQtyValue(need,m.unit||'шт'):inputQtyValue(orderedManualQty(m)||0,m.unit||'шт');
  const receiptBtn=(purchaseStatusOf(m)==='ordered'||orderedManualQty(m)>0)?`<button class="btn primary" onclick="openMaterialReceipt('${m.id}')">${t('receiptBtn')}</button>`:'';
  return `${stockActionSummaryBlock(m)}<div class="stock-adjust"><div><div class="stock-adjust-title">${t('changeStock')}</div><div class="stock-adjust-current">${escapeHtml(qtyWithUnit(stockNumForUnit(m.quantity,m.unit),m.unit||''))}</div></div><div><label class="field" style="display:block;margin:0"><span style="display:block;font-weight:500;font-size:12px;color:#555c68;margin-bottom:7px">${t('qtyWithUnit')}, ${escapeHtml(unitText)}</span><input id="detailQtyChange" class="input" type="number" step="${step}" min="${step}" value="${value}" inputmode="decimal"></label></div><button class="btn danger-fill" onclick="adjustMaterialQty('${m.id}',-1)">− ${t('writeOff')}</button><button class="btn primary" onclick="adjustMaterialQty('${m.id}',1)">+ ${t('add')}</button>${receiptBtn}</div><div class="stock-order-control"><div><div class="stock-order-control-title">${t('orderedToSupplierShort')}</div><div class="stock-order-control-current">${escapeHtml(qtyWithUnit(orderedManualQty(m),m.unit||''))}</div><div class="hint">${t('chooseOrdersForPurchaseHint')}</div></div>${purchaseOrderPickerHtml(m)}<div><label class="field" style="display:block;margin:0"><span style="display:block;font-weight:500;font-size:12px;color:#555c68;margin-bottom:7px">${t('quantityLabel')}, ${escapeHtml(unitText)}</span><input id="detailOrderedQty" class="input" type="number" step="${step}" min="0" value="${orderedInput}" inputmode="decimal"></label></div><button class="btn primary" onclick="setMaterialOrderedQty('${m.id}')">${t('markOrderedBtn')}</button></div>`;
}
function normalizeQtyForUnit(value,unit){return normalizeStockValue(value,unit,false)}
function applyMaterialReceipt(mat, addQty){
  if(!mat) return;
  const unit=mat.unit||'шт';
  mat.attributes=mat.attributes||{};
  const oldStock=stockNumForUnit(mat.quantity,unit);
  const oldOrdered=orderedManualQty(mat);
  mat.quantity=stockNumForUnit(oldStock+addQty,unit);
  mat.attributes.orderedQty=Math.max(0,stockNumForUnit(oldOrdered-addQty,unit));
  const activeReserved=typeof materialReservedOutsideOrder==='function'?materialReservedOutsideOrder(mat.id,''):reservedQty(mat);
  mat.attributes.reservedQty=stockNumForUnit(activeReserved,unit);
  if(mat.attributes.orderedQty<=0 && mat.attributes.purchaseStatus==='ordered'){
    mat.attributes.purchaseStatus=availableQty(mat)>0?'instock':'noorder';
  }
  mat.lastUpdated=today();
}
function receiptAreaPreview(){
  const width=Number(String(document.getElementById('receiptRollWidth')?.value||0).replace(',','.'))||0;
  const length=Number(String(document.getElementById('receiptRollLength')?.value||0).replace(',','.'))||0;
  const box=document.getElementById('receiptAreaPreview');
  if(!box)return;
  if(width>0&&length>0){box.textContent=`${t('areaLabel')}: ${((width/1000)*length).toFixed(2)} м²`;box.classList.remove('hidden')}
  else{box.textContent='';box.classList.add('hidden')}
}
function openMaterialReceipt(id){
  const m=(data.materials||[]).find(x=>String(x.id)===String(id));
  if(!m)return;
  const a=m.attributes||{};
  const unit=isLinearFabricStock(m)?'пог. м':(m.unit||'шт');
  const isFabric=m.category==='Ткань'||m.category==='Экокожа';
  const fabricFields=isFabric?`
    <div class="field"><label>${t('fabricRollWidthMm')}</label><input id="receiptRollWidth" class="input" type="number" min="0" step="1" value="${a.rollWidthMm||((Number(a.rollWidth||0)>0)?Math.round(Number(a.rollWidth)*1000):'')}" oninput="receiptAreaPreview()"></div>
    <div class="field"><label>${t('lengthMetersLabel')}</label><input id="receiptRollLength" class="input" type="number" min="0" step="0.01" value="${a.rollLength||''}" oninput="receiptAreaPreview()"></div>
    <div class="area-preview hidden" id="receiptAreaPreview"></div>`:'';
  const receiptValue=isLinearFabricStock(m)?convertMaterialQty(orderedManualQty(m)||0,m.unit||unit,unit,m):(orderedManualQty(m)||0);
  const body=`<div class="wizard-card"><h4>${t('receiptBtn')}</h4><div class="wizard-soft-note">${t('receiptWizardHint')}</div><div class="form-grid">${fabricFields}<div class="field"><label>${t('actualStockLabel')}, ${escapeHtml(unitLabel(unit))}</label><input id="receiptQty" class="input" type="number" min="0" step="${stockStep(unit)}" value="${inputQtyValue(receiptValue,unit)}"></div><div class="field"><label>${t('storageLocation')}</label><input id="receiptStorageLocation" class="input" value="${a.storageLocation||''}" placeholder="${t('shelfZonePlaceholder')}"></div><div class="field"><label>${t('purchasePrice')}</label><input id="receiptPurchasePrice" class="input" type="number" min="0" step="0.01" value="${a.purchasePrice||''}"></div><div class="field"><label>${t('receiptDate')}</label><input id="receiptDate" class="input" type="date" value="${a.receiptDate||today()}"></div></div></div>`;
  openModal(t('materialReceiptTitle'),body,`<button class="btn" onclick="openMaterialDetails('${m.id}')">${t('back')}</button><button class="btn primary" onclick="saveMaterialReceipt('${m.id}')">${t('save')}</button>`);
  receiptAreaPreview();
}
async function saveMaterialReceipt(id){
  const m=(data.materials||[]).find(x=>String(x.id)===String(id));
  if(!m)return;
  const legacyLinear=isLinearFabricStock(m);
  const unit=legacyLinear?'пог. м':(m.unit||'шт');
  const qty=normalizeStockValue(document.getElementById('receiptQty')?.value||0,unit,true);
  if(qty===null){toast(unit==='шт'?t('fieldWhole'):t('fieldMinZero'));return}
  const a={...(m.attributes||{})};
  const oldOrder={orderedQty:a.orderedQty||0,expectedReceiptDate:a.expectedReceiptDate||'',purchaseNote:a.purchaseNote||a.order||''};
  if(m.category==='Ткань'){
    const widthMm=Number(String(document.getElementById('receiptRollWidth')?.value||0).replace(',','.'))||0;
    const lengthM=Number(String(document.getElementById('receiptRollLength')?.value||0).replace(',','.'))||0;
    a.rollWidth=widthMm?Number((widthMm/1000).toFixed(3)):'';
    a.rollWidthMm=widthMm||'';
    a.rollLength=lengthM||'';
    a.area=widthMm&&lengthM?Number(((widthMm/1000)*lengthM).toFixed(2)):'';
  }
  a.storageLocation=(document.getElementById('receiptStorageLocation')?.value||'').trim();
  a.purchasePrice=document.getElementById('receiptPurchasePrice')?.value||'';
  a.receiptDate=document.getElementById('receiptDate')?.value||today();
  a.purchaseStatus=qty>0?'instock':'noorder';
  a.orderedQty=0;
  a.receiptFromOrder=oldOrder;
  m.attributes=a;
  if(legacyLinear)m.unit='пог. м';
  m.quantity=qty;
  m.lastUpdated=today();
  const ok=await updateMaterialInSupabase(m);
  if(!ok)return;
  if(typeof auditAdd==='function')auditAdd('material_receipt','material',m.id,m.sku||m.name,`${(typeof tRu==='function'?tRu('materialReceiptAuditPrefix'):'Поступление материала')}: ${qtyWithUnit(qty,unit)}`,{...oldOrder,quantity:qty,unit});
  await loadMaterialsFromSupabase();
  openMaterialDetails(id);
  toast(t('materialAcceptedToStockToast'));
}

function detailField(label,value,full=false){return `<div class="detail-field ${full?'full':''}"><small>${escapeHtml(label)}</small><b>${value?value:'—'}</b></div>`}
function woodMm(value){return value?`${escapeHtml(value)} мм`:'—'}
function woodSectionText(a){const parts=[a.thickness&&`${a.thickness} мм`,a.width&&`${a.width} мм`].filter(Boolean);return parts.length?parts.join(' × '):'—'}
function isWoodSheetMaterial(m){
  const a=m?.attributes||{};
  const type=String(a.materialType||m?.subcategory||'');
  return m?.category==='Древесина' && (!!a.sheetArea || ['Мебельный щит','Фанера','MDF','HDF','МДФ','ДСП','ДВП','OSB'].includes(type));
}
function woodSheetArea(m){
  const a=m?.attributes||{};
  const saved=Number(a.sheetArea||0);
  if(Number.isFinite(saved)&&saved>0)return saved;
  const width=Number(a.width||0),length=Number(a.length||0);
  return width>0&&length>0?Number(((width/1000)*(length/1000)).toFixed(6)):0;
}
function materialInfoQty(q,m,fromUnit){
  const unit=fromUnit||m?.unit||'';
  const n=Number(q||0);
  if(isLinearFabricStock(m))return materialDisplayQty(n,m,unit);
  if(!isWoodSheetMaterial(m))return stockNumForUnit(n,unit);
  const area=woodSheetArea(m);
  if(unit==='м²')return stockNumForUnit(n,'м²');
  if(area>0 && (unit==='лист' || (m?.attributes||{}).unitType==='sheet'))return stockNumForUnit(n*area,'м²');
  const thickness=Number((m?.attributes||{}).thickness||0);
  if(unit==='м³'&&thickness>0)return stockNumForUnit(n/(thickness/1000),'м²');
  return stockNumForUnit(area>0?n*area:n,'м²');
}
function materialInfoQtyWithUnit(q,m,fromUnit){
  if(isLinearFabricStock(m))return materialDisplayQtyWithUnit(q,m,fromUnit);
  if(isWoodSheetMaterial(m))return qtyWithUnit(materialInfoQty(q,m,fromUnit),'м²');
  const unit=fromUnit||m?.unit||'шт';
  return qtyWithUnit(q,unit);
}
function materialDetailBasics(m){
  const a=m.attributes||{};
  const rows=[];
  rows.push(detailField(t('skuLabel'),escapeHtml(m.sku||'—')));
  rows.push(detailField(t('nameLabel'),escapeHtml(materialDisplayName(m)||m.name||'—')));
  rows.push(detailField(t('categoryLabel2'),escapeHtml(categoryLabel(m.category)||'—')));
  if(typeof isFabricCategory==='function'&&isFabricCategory(m.category)){
    const color=a.color||'—';
    rows.push(detailField(t('collectionCodeLabel'),escapeHtml(a.collection||'—')));
    rows.push(detailField(t('colorLabel'),`<span class="color-chip only" title="${escapeHtml(color)}" style="background:${materialColorStyle(color)}"></span>`));
    rows.push(detailField(t('materialTypeLabel'),escapeHtml(categoryLabel(a.materialType||m.category))));
    if(m.category==='Кожа'){
      rows.push(detailField(t('areaShortLabel'),escapeHtml(qtyWithUnit(stockNumForUnit(m.quantity||0,m.unit||'м²'),m.unit||'м²'))));
    }else{
      rows.push(detailField(t('rollWidthLabel'),escapeHtml(a.rollWidth?Number(a.rollWidth).toFixed(2)+' м':'—')));
      rows.push(detailField(t('lengthLabel'),escapeHtml(materialDisplayQtyWithUnit(m.quantity||0,m,m.unit))));
      const areaParts=[
        a.rollLength?`${t('rollLengthWord')} ${Number(a.rollLength).toFixed(2)} м`:null,
        a.area?`${t('rollAreaWord')} ${Number(a.area).toFixed(2)} м²`:null,
        materialAreaHint(m,materialLinearStockQty(m))?`${t('totalAreaWord')} ${materialAreaHint(m,materialLinearStockQty(m))}`:(a.totalArea?`${t('totalAreaWord')} ${Number(a.totalArea).toFixed(2)} м²`:null)
      ].filter(Boolean).join(' · ');
      if(areaParts)rows.push(detailField(t('referenceLabel'),`<span class="muted-detail">${escapeHtml(areaParts)}</span>`,true));
    }
    rows.push(detailField(t('unitOfMeasureLabel'),escapeHtml(isLinearFabricStock(m)?unitLabel('м.п.'):(unitLabel(m.unit||'')||'—'))));
  }else if(m.category==='Поролон'){
    rows.push(detailField(t('sizeLabel'),escapeHtml(materialDimensions(m)||'—')));
    rows.push(detailField(t('gradeDensityLabel'),escapeHtml(a.grade||'—')));
    rows.push(detailField(t('formatLabel'),escapeHtml(a.foamKind==='sheet'?t('sheetsWord'):a.foamKind==='detail'?t('detailsWord'):'—')));
    if(a.foamKind==='sheet'){
      rows.push(detailField(t('sheetCountLabel'),escapeHtml(a.sheetCount||'—')));
      rows.push(detailField(t('sheetAreaLabel'),escapeHtml(a.sheetArea?Number(a.sheetArea).toFixed(3)+' м²':'—')));
      rows.push(detailField(t('totalAreaLabel'),escapeHtml(a.totalArea?Number(a.totalArea).toFixed(3)+' м²':'—')));
    }
    if(a.foamKind==='detail')rows.push(detailField(t('detailCountLabel'),escapeHtml(a.detailCount||'—')));
    rows.push(detailField(t('unitOfMeasureLabel'),escapeHtml(unitLabel(m.unit||'')||'—')));
  }else if(m.category==='Древесина'){
    const sheet=isWoodSheetMaterial(m);
    rows.push(detailField(t('materialTypeLabel'),escapeHtml(woodTypeLabel(m.subcategory||a.materialType||'—'))));
    rows.push(detailField(t('woodSpeciesLabel'),escapeHtml(a.woodSpecies||a.woodType||'—')));
    rows.push(detailField(t('sizeLabel'),escapeHtml([a.thickness,a.width,a.length].filter(Boolean).join('×')+(a.thickness||a.width||a.length?' мм':''))));
    if(sheet){
      const area=woodSheetArea(m);
      const totalArea=Number(a.totalArea||0);
      rows.push(detailField(t('sheetAreaLabel'),escapeHtml(area?Number(area).toFixed(2)+' м²':'—')));
      rows.push(detailField(t('totalAreaLabel'),escapeHtml(totalArea>0?qtyWithUnit(totalArea,'м²'):materialInfoQtyWithUnit(m.quantity||0,m,m.unit))));
    }else{
      if(a.sheetArea)rows.push(detailField(t('sheetAreaLabel'),escapeHtml(Number(a.sheetArea).toFixed(2)+' м²')));
      if(a.totalArea)rows.push(detailField(t('totalAreaLabel'),escapeHtml(Number(a.totalArea).toFixed(2)+' м²')));
    }
    rows.push(detailField(t('gradeLabel'),escapeHtml(a.grade||'—')));
    rows.push(detailField(t('unitOfMeasureLabel'),escapeHtml(sheet?t('unitM2'):(unitLabel(m.unit||'')||'—'))));
  }else{
    rows.push(detailField(t('typeSizeLabel'),escapeHtml(m.subcategory||a.size||a.thickness||'—')));
    rows.push(detailField(t('characteristicsLabel'),escapeHtml(materialCompactText(m)||'—'),true));
  }
  return rows.join('');
}
function materialDetailExtra(m){
  const a=m.attributes||{};
  const rows=[];
  if(typeof isFabricCategory==='function'&&isFabricCategory(m.category)){
    rows.push(detailField(t('manufacturerLabel'),escapeHtml(a.manufacturer||'—')));
    rows.push(detailField(t('supplier'),escapeHtml(a.supplier||'—')));
    rows.push(detailField(t('storageLocationLabel'),escapeHtml(a.storageLocation||'—')));
    rows.push(detailField(t('receiptDateLabel'),escapeHtml(a.receiptDate||'—')));
    rows.push(detailField(t('purchasePriceLabel'),escapeHtml(a.purchasePrice||'—')));
  }else{
    rows.push(detailField(t('supplier'),escapeHtml(a.supplier||'—')));
    rows.push(detailField(t('orderPurchaseLabel'),escapeHtml(a.order||'—')));
  }
  const tags=String(a.tags||'').split(',').map(x=>x.trim()).filter(Boolean);
  rows.push(`<div class="detail-field full"><small>${t('tagsLabel')}</small><div class="detail-tags">${tags.length?tags.map(t=>`<span class="detail-tag">${escapeHtml(t)}</span>`).join(''):'<b>—</b>'}</div></div>`);
  return rows.join('');
}
function materialDetailDocuments(m){
  const a=m.attributes||{};
  if(!(a.pdfName||a.pdfPath||a.pdfUrl)) return `<div class="detail-doc-row"><div class="doc-ico">PDF</div><div class="doc-info"><b>${t('docNotAttached')}</b><small>${t('docNotAttachedHint')}</small></div></div>`;
  return `<div class="detail-doc-row"><div class="doc-ico">PDF</div><div class="doc-info"><b>${escapeHtml(a.pdfName||t('docPdfDefault'))}</b><small>${t('docFileLabel')}</small></div><button class="btn small" type="button" onclick="openMaterialPdf('${m.id}')">${t('openDocBtn')}</button></div>`;
}
function openMaterialDetails(id){
  const m=data.materials.find(x=>String(x.id)===String(id));
  if(!m){toast(t('notFoundMaterial'));return;}
  const a=m.attributes||{};
  const st=materialStateOf(m);
  const unit=m.unit||'шт';
  const displayStats=materialDisplayStats(m);
  const displayUnit=displayStats.unit;
  const stock=displayStats.stock;
  const available=displayStats.available;
  const ordered=displayStats.ordered;
  const reserved=displayStats.reserved;
  const need=displayStats.need;
  const subtitleSub=m.subcategory&&m.subcategory!==m.category?` · ${escapeHtml(woodTypeLabel(m.subcategory))}`:'';
  const isFabricRoll=isLinearFabricMaterial(m);
  const rollLength=Number(a.rollLength||a.orderedRollLength||0);
  const linearBalance=isFabricRoll?stock:(Number(a.linearBalanceMeters||0)||((isFabricRoll&&rollLength)?stock*rollLength:0));
  const area=(m.category==='Кожа')?'':((isFabricRoll && a.rollWidth)?Number(linearBalance*Number(a.rollWidth||0)).toFixed(2):(typeof isFabricCategory==='function'&&isFabricCategory(m.category)&&a.rollWidth?Number(stock*Number(a.rollWidth||0)).toFixed(2):''));

  // Sheet material detection (wood, plywood, etc.)
  const isSheetMaterial=isWoodSheetMaterial(m) && a.width && a.length && a.thickness;
  const sheetArea=isSheetMaterial?woodSheetArea(m).toFixed(3):'0';
  const sheetStock=isSheetMaterial?Math.floor(stock/sheetArea):0;
  const stockInfoText=qtyWithUnit(stock,displayUnit);
  const availableInfoText=qtyWithUnit(available,displayUnit);
  const reservedInfoText=qtyWithUnit(reserved,displayUnit);
  const orderedInfoText=qtyWithUnit(ordered,displayUnit);
  const needInfoText=qtyWithUnit(need,displayUnit);
  const summaryAreaSub=(value)=>isFabricRoll&&materialAreaHint(m,value)?`<small class="summary-subtle">${escapeHtml(materialAreaHint(m,value))}</small>`:'';

  const quickUnitControl=isFabricRoll?`<input type="hidden" id="detailQtyUnit" value="м.п.">`:(isSheetMaterial?`<select id="detailQtyUnit" class="select" onchange="syncDetailQtyUnit()"><option value="sheet">${t('sheetsOption')}</option><option value="m2">м²</option></select>`:`<input type="hidden" id="detailQtyUnit" value="${escapeHtml(unit)}">`);
  const quickFabricFields=isFabricRoll?`<div class="quick-roll-fields" id="detailRollFields"><div class="area-preview subtle" id="detailRollPreview"></div><input id="detailRollWidth" type="hidden" value="${escapeHtml(a.rollWidth||((Number(a.rollWidthMm||0)>0)?Number(a.rollWidthMm)/1000:''))}"></div>`:(isSheetMaterial?`<div class="quick-roll-fields" id="detailRollFields"><div class="area-preview">${t('sheetAreaOnePrefix')}: ${sheetArea} м²</div></div>`:'');

  // New summary panel
  const summaryStatus = available > 0 ? t('enoughInStock') : (ordered > 0 ? t('ordered') : (stock > 0 ? t('reservedForOrdersStatus') : t('noneInStock')));
  const summaryStatusClass = available > 0 ? 'success' : (ordered > 0 ? 'ordered' : (stock > 0 ? 'reserved' : 'danger'));

  // Quick actions with three modes
  const quickActionsHtml=`
    <div class="quick-actions-tabs">
      <button class="quick-tab active" data-mode="in" onclick="switchQuickActionMode('in')">${t('receiptTabLabel')}</button>
      <button class="quick-tab" data-mode="out" onclick="switchQuickActionMode('out')">${t('writeoffTabLabel')}</button>
      <button class="quick-tab" data-mode="adjust" onclick="switchQuickActionMode('adjust')">${t('adjustTabLabel')}</button>
    </div>
    <div class="quick-shared-qty">
      <label class="field"><span id="detailQtyLabel">${t('changeStockLabelWithUnit')}, ${escapeHtml(unitLabel(displayUnit)||displayUnit)}</span><input id="detailQtyChange" class="input" type="number" step="${stockStep(displayUnit)}" min="${stockStep(displayUnit)}" value="${stockDefaultValue(displayUnit)}" inputmode="decimal" oninput="syncDetailRollPreview()"></label>
      ${quickUnitControl}
    </div>
    ${quickFabricFields}
    <div class="quick-actions-content">
      <div class="quick-action-panel active" id="quickActionIn">
        <button class="btn primary full-width" onclick="adjustMaterialQty('${m.id}',1)">+ ${t('acceptToStockBtn')}</button>
      </div>
      <div class="quick-action-panel hidden" id="quickActionOut">
        <button class="btn danger-fill full-width" onclick="adjustMaterialQty('${m.id}',-1)">− ${t('writeOffFromStockBtn')}</button>
      </div>
      <div class="quick-action-panel hidden" id="quickActionAdjust">
        <label class="field"><span>${t('currentStockLabel')}</span><input id="quickAdjustCurrent" class="input" type="number" step="${stockStep(displayUnit)}" min="0" value="${inputQtyValue(stock,displayUnit)}" inputmode="decimal" readonly></label>
        <label class="field"><span>${t('newStockLabel')}</span><input id="quickAdjustNew" class="input" type="number" step="${stockStep(displayUnit)}" min="0" value="${inputQtyValue(stock,displayUnit)}" inputmode="decimal"></label>
        <button class="btn primary full-width" onclick="quickMaterialAction('${m.id}','adjust')">✓ ${t('setStockBtn')}</button>
      </div>
    </div>
  `;

  // Material history block
  const historyHtml=`
    <div class="material-history-block">
      <div class="material-history-header">
        <div class="material-history-title">${t('materialHistoryTitle')}</div>
        <div class="material-history-filters">
          <button class="history-filter-btn active" data-filter="all" onclick="filterMaterialHistory('all')">${t('all')}</button>
          <button class="history-filter-btn" data-filter="in" onclick="filterMaterialHistory('in')">${t('receiptTabLabel')}</button>
          <button class="history-filter-btn" data-filter="out" onclick="filterMaterialHistory('out')">${t('writeoffTabLabel')}</button>
          <button class="history-filter-btn" data-filter="reserve" onclick="filterMaterialHistory('reserve')">${t('reserveLabel')}</button>
          <button class="history-filter-btn" data-filter="purchase" onclick="filterMaterialHistory('purchase')">${t('purchaseWord')}</button>
          <button class="history-filter-btn" data-filter="adjust" onclick="filterMaterialHistory('adjust')">${t('adjustTabLabel')}</button>
        </div>
      </div>
      <div class="material-history-list" id="materialHistoryList">
        <div class="history-empty">${t('historyEmptyGeneric')}</div>
      </div>
    </div>
  `;

  const body=`<div class="material-detail-shell material-detail-shell-clean">
    <div class="material-detail-main">
      <div class="material-hero material-hero-clean">
        <div>
          <h4>${escapeHtml(materialTitle(m)||materialDisplayName(m)||t('materialFallback'))}</h4>
          <p>${m.category==='Поролон'&&m.sku?'':escapeHtml(m.sku||t('noSkuLabel'))+' · '}${escapeHtml(categoryLabel(m.category))}${subtitleSub}</p>
        </div>
        <span class="status ${st[0]}">${st[1]}</span>
      </div>

      <div class="material-workflow-actions">
        <button type="button" class="material-workflow-btn danger" onclick="materialDetailGo('writeoff')"><span>−</span><b>${t('writeOffBtn')}</b><small>${t('quickWriteoffHint')}</small></button>
        <button type="button" class="material-workflow-btn" onclick="materialDetailGo('stock')"><span>✓</span><b>${t('availabilityBtn')}</b><small>${t('stockReserveHint')}</small></button>
        <button type="button" class="material-workflow-btn" onclick="materialDetailGo('orders')"><span>↗</span><b>${t('inOrdersBtn')}</b><small>${t('whereUsedHint')}</small></button>
      </div>

      <div class="material-summary-panel material-summary-clean" data-detail-stock>
        <div class="summary-card primary"><span class="summary-label">${t('inStockLabel')}</span><span class="summary-value">${escapeHtml(stockInfoText)}</span>${summaryAreaSub(stock)}</div>
        <div class="summary-card"><span class="summary-label">${t('availableLabel')}</span><span class="summary-value">${escapeHtml(availableInfoText)}</span>${summaryAreaSub(available)}</div>
        <div class="summary-card"><span class="summary-label">${t('reserveLabel')}</span><span class="summary-value">${escapeHtml(reservedInfoText)}</span>${summaryAreaSub(reserved)}</div>
        <div class="summary-card"><span class="summary-label">${t('ordered')}</span><span class="summary-value">${escapeHtml(orderedInfoText)}</span>${summaryAreaSub(ordered)}</div>
        <div class="summary-status summary-status-${summaryStatusClass}">${summaryStatus}</div>
        <div class="summary-need ${need>0?'danger':''}">${t('needToOrderColon')}: ${escapeHtml(needInfoText)}</div>
      </div>

      <details class="material-detail-section" open>
        <summary><span>${t('mainSectionTitle')}</span><b>${t('mainSectionHint')}</b></summary>
        <div class="detail-field-grid compact">${materialDetailBasics(m)}</div>
      </details>
      <details class="material-detail-section">
        <summary><span>${t('extraSectionTitle')}</span><b>${t('extraSectionHint')}</b></summary>
        <div class="detail-field-grid compact">${materialDetailExtra(m)}</div>
      </details>
      <details class="material-detail-section" data-detail-section="orders">
        <summary><span>${t('ordersSectionTitle')}</span><b>${t('ordersSectionHint')}</b></summary>
        <div class="order-usage-list compact">${materialOrderUsageCards(m)}</div>
      </details>
      <details class="material-detail-section">
        <summary><span>${t('documentsSectionTitle')}</span><b>${t('documentsSectionHint')}</b></summary>
        ${materialDetailDocuments(m)}
      </details>
      <details class="material-detail-section">
        <summary><span>${t('historySectionTitle')}</span><b>${t('historySectionHint')}</b></summary>
        ${historyHtml}
      </details>
    </div>
    <aside class="material-detail-side">
      <div class="material-side-card action-card" data-detail-action-card><h5>${t('quickActionsTitle')}</h5>${quickActionsHtml}</div>
      <div class="material-side-card"><h5>${t('deliveriesTitle')}</h5><div class="supplier-deliveries-list">${materialSupplierDeliveries(m)}</div><button class="btn primary full-width" style="width:100%;margin-top:10px" onclick="openNewMaterialOrder('${m.id}')">+ ${t('orderMaterialBtn')}</button></div>
    </aside>
  </div>`;
  const hasPdf=a.pdfPath||a.pdfUrl;
  const foot=`<div class="material-detail-foot"><div class="left"><button class="btn danger" onclick="deleteMaterial('${m.id}')">${t('deleteMaterialBtn')}</button></div><div class="right">${m.sku?`<button class="btn ghost" onclick="printMaterialQrLabel('${m.id}')">${t('printQrBtn')}</button>`:''}${hasPdf?`<button class="btn ghost" onclick="openMaterialPdf('${m.id}')">${t('openPdfBtn')}</button>`:''}<button class="btn primary" onclick="openMaterialEditor('${m.id}')">${t('editBtn2')}</button></div></div>`;
  openModal(t('infoMaterial'),body,foot);
  const modal=document.querySelector('#modalBackdrop .modal');
  if(modal) modal.classList.add('detail-modal');
  syncDetailQtyUnit();
}
function openMaterialDetailsFromModal(id){pushModalState();openMaterialDetails(id)}
function openMaterialEditor(id){
  const m=(data.materials||[]).find(x=>String(x.id)===String(id));
  if(!m){toast(t('notFoundMaterial'));return;}
  if(m.category==='Поролон'&&typeof openFoamModal==='function'){openFoamModal(id);return;}
  openMaterialModal(id,m.category||'Ткань');
}
function statusOf(m){const av=availableQty(m);if(av<=0)return ['out',t('noStock')];if(Number(m.minQuantity||0)>0 && av<=Number(m.minQuantity||0))return ['low',t('lowStock')];return ['ok',t('inStock')]}

function purchaseStatusOf(m){
  const saved=m.attributes&&m.attributes.purchaseStatus;
  const v=saved || (Number(m.quantity||0)>0?'instock':'noorder');
  return ['instock','noorder','needorder','ordered'].includes(v)?v:(Number(m.quantity||0)>0?'instock':'noorder');
}
function materialStateOf(m){
  if(isLinearFabricStock(m)){
    const s=materialDisplayStats(m);
    const min=convertMaterialQty(Number(m.minQuantity||0),m.unit||s.unit,s.unit,m);
    const purchase=purchaseStatusOf(m);
    if(s.need>0) return ['needorder', `${t('needToOrderQtyPrefix')} ${qtyWithUnit(s.need,s.unit)}`];
    if(s.ordered>0 || purchase==='ordered') return ['ordered', purchaseStatusLabel('ordered')];
    if(s.stock<=0) return ['out', t('noStock')];
    if(s.available<=0) return ['reserved', t('reservedStatusWord')];
    if(min>0 && s.available<=min) return ['low', t('lowStock')];
    return ['ok', t('inStock')];
  }
  const unit=m.unit||'шт';
  const stock=stockNumForUnit(m.quantity,unit);
  const reserved=reservedQty(m);
  const available=availableQty(m);
  const min=Number(m.minQuantity||0);
  const ordered=orderedQty(m);
  const purchase=purchaseStatusOf(m);
  const needToOrder=Math.max(0,stockNumForUnit(reserved-stock-ordered,unit));

  // Статусы разделяем так, чтобы не путать физический остаток и свободный остаток:
  // материал есть, но весь занят заказами = «Зарезервировано», а не «Нет в наличии».
  if(needToOrder>0) return ['needorder', `${t('needToOrderQtyPrefix')} ${qtyWithUnit(needToOrder,unit)}`];
  if(ordered>0 || purchase==='ordered') return ['ordered', purchaseStatusLabel('ordered')];
  if(available<=0 && stock>0 && reserved>0) return ['reserved', t('reservedStatusWord')];
  if(purchase==='needorder' && needToOrder>0) return ['needorder', purchaseStatusLabel('needorder')];
  if(available<=0 && stock<=0) return ['noorder', purchaseStatusLabel('noorder')];
  if(min>0 && available<=min) return ['low', t('lowStock')];
  return ['ok', t('inStock')];
}
function purchaseStatusLabel(value){
  const map={
    ru:{instock:'Есть в наличии',noorder:'Нет на складе',needorder:'Нужно заказать',ordered:'Уже заказана'},
    en:{instock:'In stock',noorder:'No stock',needorder:'Need to order',ordered:'Already ordered'},
    lv:{instock:'Ir noliktavā',noorder:'Nav noliktavā',needorder:'Jāpasūta',ordered:'Jau pasūtīts'}
  };
  return (map[currentLang]||map.ru)[value] || (map.ru[value]||value);
}
function defaultPurchaseStatus(m){
  const a=m?.attributes||{};
  if(a.purchaseStatus) return a.purchaseStatus;
  return Number(m?.quantity||0)>0?'instock':'noorder';
}
function purchaseStatusSelect(id='purchaseStatus', current='instock'){
  return `<select id="${id}" class="select">
    <option value="instock" ${current==='instock'?'selected':''}>${purchaseStatusLabel('instock')}</option>
    <option value="noorder" ${current==='noorder'?'selected':''}>${purchaseStatusLabel('noorder')}</option>
    <option value="needorder" ${current==='needorder'?'selected':''}>${purchaseStatusLabel('needorder')}</option>
    <option value="ordered" ${current==='ordered'?'selected':''}>${purchaseStatusLabel('ordered')}</option>
  </select>`;
}
function purchaseStatusLabelBlock(selectHtml){
  return `<div class="label-row"><label>${t('purchaseStatusLabel2')}</label><button class="info-btn" type="button" onclick="showPurchaseStatusInfo()" title="${t('explanationTitle')}">i</button></div>${selectHtml}`;
}
function showPurchaseStatusInfo(){
  alert(t('stockFieldsHelp'));
}

function normalizeSku(v){return String(v||'').trim().toUpperCase().replace(/\s+/g,'')}
function findMaterialBySku(sku){const n=normalizeSku(sku);return data.materials.find(m=>normalizeSku(m.sku)===n)}
function quickUnitBySku(sku){const n=normalizeSku(sku);const prefix=n.split('-')[0];const map={A:'пог. м',E:'пог. м',P:'м²',K:'м³',F:'м²',SP:'м²',B:'шт',G:'шт',S:'шт',SK:'шт',D:'шт',L:'м²',R:'шт',KA:'шт',M:'шт',KR:'шт',FT:'шт',DET:'шт'};return map[prefix]||''}
function updateQuickAddInfo(){const box=document.getElementById('quickAddBox');const info=document.getElementById('quickInfo');if(!box||!info)return;const sku=quickSku.value;box.classList.remove('found','missing');if(!sku.trim()){info.textContent=t('enterSku');return}const mat=findMaterialBySku(sku);if(mat){box.classList.add('found');info.innerHTML=`<span><b>${mat.name}</b><br><span class="muted">${t('quantity')}: ${mat.quantity} ${unitLabel(mat.unit)}</span></span><span class="unit-pill">${mat.unit}</span>`;return}const unit=quickUnitBySku(sku);box.classList.add('missing');info.innerHTML=unit?`${t('notFoundSku')}. ${t('unit')}: <b>${unitLabel(unit)}</b>`:t('materialNotFound');}

function toggleAdvancedFilters(){
  const panel=document.getElementById('proFilterPanel');
  const btn=document.getElementById('advancedFiltersBtn');
  if(!panel)return;
  panel.classList.toggle('show');
  if(btn)btn.classList.toggle('primary',panel.classList.contains('show'));
}
function setQuickFilter(value){
  activeQuickFilter=value||'all';
  document.querySelectorAll('#quickFilterRow .filter-chip').forEach(b=>b.classList.toggle('active',b.dataset.filter===activeQuickFilter));
  const st=document.getElementById('stockStateFilter');
  if(st){
    if(['needorder','ordered'].includes(activeQuickFilter)) st.value=activeQuickFilter;
    else if(activeQuickFilter==='out') st.value='out';
    else if(activeQuickFilter==='low') st.value='low';
    else if(activeQuickFilter==='all'||activeQuickFilter==='problem'||activeQuickFilter==='reserved') st.value='';
  }
  stockPage=1;
  renderAll();
}
function materialMatchesProfessionalFilters(m){
  const state=materialStateOf(m)[0];
  const unit=document.getElementById('unitFilter')?.value||'';
  const stateFilter=document.getElementById('stockStateFilter')?.value||'';
  const supplier=(document.getElementById('supplierFilter')?.value||'').toLowerCase().trim();
  const order=(document.getElementById('orderFilter')?.value||'').toLowerCase().trim();
  const attrs=m.attributes||{};
  const reserved=reservedQty(m);
  const ordered=orderedQty(m);
  const available=availableQty(m);
  const qty=stockNumForUnit(m.quantity,m.unit);
  const isProblem=available<=0 || state==='low' || state==='needorder' || reserved>qty;
  if(unit && m.unit!==unit) return false;
  if(stateFilter && state!==stateFilter) return false;
  if(supplier && !String(attrs.supplier||'').toLowerCase().includes(supplier)) return false;
  if(order && !String(attrs.order||'').toLowerCase().includes(order)) return false;
  if(activeQuickFilter==='problem' && !isProblem) return false;
  if(activeQuickFilter==='reserved' && reserved<=0) return false;
  if(activeQuickFilter==='needorder' && state!=='needorder') return false;
  if(activeQuickFilter==='ordered' && state!=='ordered') return false;
  if(activeQuickFilter==='out' && !(state==='out'||state==='noorder')) return false;
  if(activeQuickFilter==='low' && state!=='low') return false;
  return true;
}
function refreshQuickFilterChips(){
  document.querySelectorAll('#quickFilterRow .filter-chip').forEach(b=>b.classList.toggle('active',b.dataset.filter===activeQuickFilter));
}

function renderFilters(){
  if(typeof ensureStockRefs==='function')ensureStockRefs();
  const cf=document.getElementById('categoryFilter');
  if(!cf)return;
  const currentCat=cf.value||'';
  cf.innerHTML=`<option value="">${t('allCategories')}</option>`+Object.keys(CATEGORIES).map(c=>`<option value="${c}" ${currentCat===c?'selected':''}>${categoryLabel(c)}</option>`).join('');
  cf.onchange=()=>{stockPage=1;updateSubFilter();renderAll()};
  const subEl=document.getElementById('subcategoryFilter');
  if(subEl) subEl.onchange=()=>{stockPage=1;renderAll()};
  const search=document.getElementById('searchInput');
  if(search) search.oninput=()=>{stockPage=1;renderAll()};
  const sortSel=document.getElementById('stockSortSelect');
  if(sortSel){
    const options=[['name:1','sortByNameOpt'],['sku:1','sortBySkuOpt'],['createdAt:-1','sortNewestFirstOpt'],['createdAt:1','sortOldestFirstOpt']];
    const wanted=sortKey+':'+sortDir;
    const hasWanted=options.some(([v])=>v===wanted);
    sortSel.innerHTML=options.map(([v,key])=>`<option value="${v}">${escapeHtml(t(key))}</option>`).join('');
    sortSel.value=hasWanted?wanted:'name:1';
    sortSel.onchange=()=>{const [k,d]=sortSel.value.split(':');sortKey=k;sortDir=Number(d);stockPage=1;renderStock()};
  }
}
function updateSubFilter(){const cat=document.getElementById('categoryFilter')?.value||'';const sf=document.getElementById('subcategoryFilter');if(!sf)return;const currentSub=sf.value||'';let subs=cat?(CATEGORIES[cat].subs||[]):Object.values(CATEGORIES).flatMap(x=>x.subs||[]);sf.innerHTML=`<option value="">${t('allSubcategories')}</option>`+subs.map(s=>`<option ${currentSub===s?'selected':''}>${s}</option>`).join('')}
// v7.38: поиск сравнивал запрос с JSON.stringify(m) — то есть буквально со ВСЕМ объектом
// материала, включая внутренний id (UUID из Supabase) и служебные метки времени. Оба почти
// всегда содержат случайные цифровые подстроки, никак не связанные с видимыми пользователю
// данными — поэтому запрос вроде «15» находил совершенно посторонние позиции, у которых просто
// в id или дате обновления встретилась подстрока «15». Теперь ищем только по видимым полям:
// артикул, название, категория/подкатегория, единица измерения и содержательные атрибуты
// (цвет, производитель, коллекция, марка, тип, размеры и т.п.) — без id, дат и служебных
// полей закупки (цена, статус, зарезервировано/заказано, даты поступления).
function materialSearchHaystack(m){
  const a=m.attributes||{};
  const parts=[
    m.sku,m.name,m.category,m.subcategory,m.unit,
    typeof categoryLabel==='function'?categoryLabel(m.category):'',
    a.color,a.manufacturer,a.producer,a.brand,a.supplier,
    a.collection,a.grade,a.mark,a.materialType,a.type,
    a.woodSpecies,a.species,a.section,a.decor,a.storageLocation,
    a.rollWidth,a.rollWidthMm,a.thickness,a.density,a.hardness,
    a.width,a.length,a.sheetSize,a.size
  ];
  return parts.filter(v=>v!==undefined&&v!==null&&v!=='').join(' ').toLowerCase();
}
function filteredMaterials(){
  const searchEl=document.getElementById('searchInput');
  let q=searchEl?.value?.toLowerCase()||'';
  // v7.10: браузер иногда автозаполняет это поле сохранённым email пользователя (известная
  // особенность Chrome для обычных текстовых полей — срабатывает не только при фокусе на самом
  // поле, поэтому существующая защита protectSearchInputsFromAutofill() не всегда успевает).
  // Реальный пользователь никогда не станет искать материал по своему email — если значение
  // поиска в точности совпадает с email текущего пользователя, считаем это автозаполнением,
  // а не намеренным запросом, и сбрасываем поле, вместо того чтобы отфильтровать весь склад.
  const acctEmail=String((typeof currentUser!=='undefined'&&currentUser?.email)||'').trim().toLowerCase();
  if(acctEmail&&q===acctEmail){q='';if(searchEl)searchEl.value='';}
  const cat=document.getElementById('categoryFilter')?.value||'';const sub=document.getElementById('subcategoryFilter')?.value||'';return data.materials.filter(m=>(!cat||m.category===cat)&&(!sub||m.subcategory===sub)&&materialMatchesProfessionalFilters(m)&&(!q||materialSearchHaystack(m).includes(q))).sort((a,b)=>{let av=a[sortKey]??'',bv=b[sortKey]??'';if(sortKey==='quantity'||sortKey==='minQuantity'){av=Number(av);bv=Number(bv)}return av>bv?sortDir:av<bv?-sortDir:0})}
function renderStats(){const total=data.materials.length;const low=data.materials.filter(m=>statusOf(m)[0]==='low').length;const out=data.materials.filter(m=>statusOf(m)[0]==='out').length;const cats=new Set(data.materials.map(m=>m.category)).size;const cards=[['orders',t('totalItems'),total,t('totalItemsNote'),'▤'],['ready',t('categories'),cats,t('categoriesNote'),'✓'],['missing',t('lowStock'),low,t('needsAttentionNote'),'△'],['ordered',t('outStock'),out,t('outOfStockNote'),'▱']];document.getElementById('stats').innerHTML=cards.map(([cls,label,value,note,icon])=>`<div class="order-stat-card"><span class="order-stat-icon ${cls}">${icon}</span><div class="order-stat-copy"><small class="order-stat-label">${label}</small><b class="order-stat-value">${value}</b><em class="order-stat-note">${note}</em></div></div>`).join('')}
function badge(m){const cls=CATEGORIES[m.category]?.cls||'';return `<span class="badge ${cls}">${escapeHtml(categoryLabel(m.category)||m.category)}${m.subcategory?' · '+escapeHtml(woodTypeLabel(m.subcategory)):''}</span>`}
function stockCategoryTabs(){
  const groups=stockRefs().groups;
  const groupLabel=g=>{const key='stockGroup_'+g.id;const label=t(key);return label===key?(g.label||g.id):label};
  return `<div class="category-tabs stock-primary-tabs">${groups.map(g=>`<button class="category-tab ${activeStockGroup===g.id?'active':''}" type="button" onclick="selectStockGroup('${g.id}')">${escapeHtml(groupLabel(g))}</button>`).join('')}</div>${stockSubTabs()}`;
}
function stockSubTabs(){
  const group=stockGroupById(activeStockGroup);
  if(activeStockGroup==='all')return '';
  const subs=['Все',...(group.subs||[])].filter((v,i,a)=>v&&a.indexOf(v)===i);
  if(subs.length<=1)return '';
  return `<div class="category-tabs stock-secondary-tabs">${subs.map(s=>{const id=s==='Все'?'all':s;const label=s==='Все'?t('all'):s;return `<button class="category-tab secondary ${activeStockSub===id?'active':''}" type="button" onclick="selectStockSub('${escapeHtml(id)}')">${escapeHtml(label)}</button>`}).join('')}</div>`;
}
function selectStockGroup(id){
  activeStockGroup=id||'all';
  activeStockSub='all';
  const group=stockGroupById(activeStockGroup);
  const cf=document.getElementById('categoryFilter');
  if(cf) cf.value=(group.categories&&group.categories.length===1)?group.categories[0]:'';
  const sf=document.getElementById('subcategoryFilter');
  if(sf) sf.value='';
  stockPage=1;
  updateSubFilter();
  renderAll();
}
function selectStockSub(sub){activeStockSub=sub||'all';fabricStockTypeFilter=activeStockSub==='all'?'':activeStockSub;stockPage=1;renderStock()}
// v7.35: раньше эта функция ещё раз рисовала кнопки «Фильтры»/«Сбросить» и, вне раздела
// «Ткани», отдельный селект статуса (stockStateFilterLocal) — оба дублировали то, что уже
// делают верхний тулбар (те же кнопки) и быстрые фильтры-чипсы (тот же набор статусов). Теперь
// здесь остаются только действительно уникальные уточнения — коллекция/цвет для тканей;
// для остальных групп эта строка вообще не рендерится.
// Заодно исправлена опечатка в id группы: сравнение шло с устаревшим 'fabrics' (во
// множественном числе), которого не существует в stockRefs().groups (там 'fabric', в
// единственном числе, см. index.html:675 — там 'fabrics' явно вычищается как legacy id).
// Из-за этого фильтры по коллекции/цвету тканей ни разу не активировались на вкладке «Ткань».
function stockFiltersForCategory(cat){
  if(activeStockGroup!=='fabric') return '';
  const collections=[...new Set((data.materials||[]).filter(m=>m.category==='Ткань').map(m=>(m.attributes||{}).collection).filter(Boolean))];
  const collVal=document.getElementById('fabricCollectionFilter')?.value||'';
  const colorVal=document.getElementById('fabricColorFilter')?.value||'';
  return `<div class="category-filter-row"><select class="select" id="fabricCollectionFilter" onchange="stockPage=1;renderStock()"><option value="">${t('allCollections')}</option>${collections.map(v=>`<option ${collVal===v?'selected':''}>${escapeHtml(v)}</option>`).join('')}</select><input class="input" id="fabricColorFilter" placeholder="${t('allColors')}" value="${escapeHtml(colorVal)}" oninput="stockPage=1;renderStock()"></div>`;
}
function setFabricStockTypeFilter(type){fabricStockTypeFilter=type;activeStockSub=type||'all';stockPage=1;renderStock()}
function attentionMaterials(limit){
  const rows=(data.materials||[])
    .map(m=>({m,st:materialStateOf(m),need:stockNeededToOrderQty(m),available:availableQty(m)}))
    .filter(x=>x.need>0 || x.st[0]==='low')
    .sort((a,b)=> (b.need>0)-(a.need>0) || b.need-a.need);
  return Number.isFinite(limit)?rows.slice(0,limit):rows;
}
// v7.39: у двух колонок «В наличии»/«Нужно» не было собственных классов — на мобильных их
// пытались прятать через `.att-cell:nth-of-type(2)/(3)`, но nth-of-type считает позицию
// среди ВСЕХ <span> одного типа, а не среди элементов с классом .att-cell (те стоят 4-м и
// 5-м по счёту, не 2-м и 3-м) — селектор никогда не срабатывал, и на узком экране строка
// не сжималась, а лишь обрезалась. Добавлены собственные классы для надёжного скрытия.
function attentionRowHtml(x){
  const m=x.m;const need=x.need;const low=x.st[0]==='low'&&need<=0;
  const displayUnit=stockDisplayUnit(m);
  return `<button class="attention-row" type="button" onclick="openMaterialDetails('${m.id}')"><span class="att-dot ${need>0?'need':''}"></span><span class="att-main"><b>${escapeHtml(materialDisplayName(m))}</b><span>${escapeHtml(categoryLabel(m.category))}</span></span><span class="att-badge-wrap"><span class="att-badge ${low?'low':''}">${need>0?t('needToOrderShortWord'):t('runningOutWord')}</span></span><span class="att-cell att-cell-stock"><small>${t('inStockLabel')}</small><b>${escapeHtml(qtyWithUnit(stockDisplayQty(m,m.quantity),displayUnit))}</b></span><span class="att-cell att-cell-need"><small>${need>0?t('needWord'):t('minStockLabel')}</small><b>${escapeHtml(qtyWithUnit(need>0?need:m.minQuantity,displayUnit))}</b></span><span class="att-go">›</span></button>`;
}
function renderAttentionBlock(){
  const all=attentionMaterials();
  const rows=all.slice(0,4);
  if(!all.length){return `<div class="attention-card compact-attention no-more"><div class="attention-head"><b>${t('attentionTitle')}</b><small>${t('noProblems')}</small></div><div class="att-empty">${t('allMaterialsNormal')}</div></div>`}
  const more=all.length>rows.length;
  return `<div class="attention-card compact-attention ${more?'':'no-more'}"><div class="attention-head"><b>${t('attentionTitle')}</b><small>${all.length} ${t('itemsWord')}</small></div><div class="attention-list">${rows.map(attentionRowHtml).join('')}</div><div class="attention-more"><button class="btn small" onclick="openAttentionModal()">${t('showAll')}</button></div></div>`;
}

// v6.93: renderStockChartBlock() removed (Этап 3) — the "Динамика склада" chart on
// the Склад overview rendered a decorative trend generated by a formula, not real
// historical data (no real daily stock-level history is tracked), and it also had
// hardcoded June date labels unrelated to the current date. Showing fabricated
// numbers prominently above the real material table contradicted the Этап 1
// principle "numbers must not lie", so it was removed rather than repositioned.

function filteredMaterialsForSmartTable(){
  const group=stockGroupById(activeStockGroup);
  let rows=filteredMaterials().filter(m=>activeStockGroup==='all'||(group.categories||[]).includes(m.category));
  if(activeStockSub!=='all')rows=rows.filter(m=>stockSubValue(m)===activeStockSub);
  if(activeStockGroup==='fabric'){
    const coll=(document.getElementById('fabricCollectionFilter')?.value||'').toLowerCase();
    const color=(document.getElementById('fabricColorFilter')?.value||'').toLowerCase();
    rows=rows.filter(m=>{
      const a=m.attributes||{};
      const type=String(m.category||a.materialType||'Ткань');
      const sub=String(m.subcategory||type);
      return (!fabricStockTypeFilter||type===fabricStockTypeFilter||sub===fabricStockTypeFilter) && (!coll||String(a.collection||'').toLowerCase()===coll) && (!color||String(a.color||'').toLowerCase().includes(color));
    });
  }
  // v7.35: статус (needorder/low/ok/...) больше не фильтруется здесь отдельным полем —
  // filteredMaterials() (выше) уже применяет activeQuickFilter (быстрые фильтры-чипсы),
  // который и был единственным реально нужным способом отфильтровать по статусу.
  return rows;
}
function stockTableText(key){const dict={ru:{manufacturer:'Производитель',color:'Цвет',rollWidth:'Ширина рулона',reserved:'Зарезервировано',ordered:'Заказано',actions:'Действия',grade:'Марка',density:'Плотность',hardness:'Жёсткость',thickness:'Толщина',sheetSize:'Размер листа',woodSpecies:'Порода',section:'Сечение',length:'Длина',sort:'Сорт',type:'Тип',size:'Размер',decor:'Цвет / декор'},en:{manufacturer:'Manufacturer',color:'Color',rollWidth:'Roll width',reserved:'Reserved',ordered:'Ordered',actions:'Actions',grade:'Grade',density:'Density',hardness:'Hardness',thickness:'Thickness',sheetSize:'Sheet size',woodSpecies:'Species',section:'Section',length:'Length',sort:'Grade',type:'Type',size:'Size',decor:'Color / decor'},lv:{manufacturer:'Ražotājs',color:'Krāsa',rollWidth:'Ruļļa platums',reserved:'Rezervēts',ordered:'Pasūtīts',actions:'Darbības',grade:'Marka',density:'Blīvums',hardness:'Cietība',thickness:'Biezums',sheetSize:'Loksnes izmērs',woodSpecies:'Suga',section:'Šķērsgriezums',length:'Garums',sort:'Šķira',type:'Tips',size:'Izmērs',decor:'Krāsa / dekors'}};return (dict[currentLang]||dict.ru)[key]||key}
function stockSelectedTableCategory(rows){
  const filterCat=document.getElementById('categoryFilter')?.value||'';
  if(filterCat)return filterCat;
  if(activeStockGroup==='fabric')return fabricStockTypeFilter||'Ткань';
  const cats=[...new Set((rows||[]).map(m=>m.category).filter(Boolean))];
  return cats.length===1?cats[0]:'';
}
function isSheetMaterialCategory(cat){return ['Фанера','МДФ','ДСП','ДВП','OSB','Листовые материалы'].includes(cat)}
function tableColumnsByCategory(cat){
  const qty=[stockTableText('reserved'),stockTableText('ordered'),t('needToOrder'),t('condition')];
  if(typeof isFabricCategory==='function'&&isFabricCategory(cat))return [t('sku'),t('material'),stockTableText('manufacturer'),stockTableText('color'),stockTableText('rollWidth'),t('inStock'),...qty];
  if(cat==='Поролон')return [t('sku'),t('material'),stockTableText('grade'),stockTableText('density'),stockTableText('hardness'),stockTableText('thickness'),stockTableText('sheetSize'),t('inStock'),...qty];
  if(cat==='Древесина')return [t('sku'),t('material'),stockTableText('type'),stockTableText('size'),t('qtyColumnLabel'),t('calcColumnLabel'),t('inStock'),...qty];
  if(isSheetMaterialCategory(cat))return [t('sku'),t('material'),stockTableText('type'),stockTableText('thickness'),stockTableText('sheetSize'),stockTableText('decor'),t('inStock'),...qty];
  if(['Фурнитура','Крепёж'].includes(cat))return [t('sku'),t('material'),stockTableText('type'),stockTableText('size'),stockTableText('manufacturer'),t('inStock'),...qty];
  if(cat==='Наполнители')return [t('sku'),t('material'),stockTableText('type'),stockTableText('density'),t('inStock'),...qty];
  return [t('sku'),t('material'),t('category'),t('inStock'),stockTableText('reserved'),stockTableText('ordered'),t('needToOrder'),t('condition'),stockTableText('actions')];
}
function materialColorStyle(color){
  const c=String(color||'').toLowerCase();
  const map={графит:'#374151',серый:'#9ca3af',бежевый:'#d6c7b5',черный:'#111827',чёрный:'#111827',белый:'#f8fafc',коричневый:'#8b5e34',синий:'#3b82f6',зеленый:'#22c55e',зелёный:'#22c55e',красный:'#ef4444'};
  return map[c]||'#d1d5db';
}
function materialMaker(m){const a=m.attributes||{};return a.manufacturer||a.supplier||a.brand||a.producer||'—'}
function stockAttr(m,...keys){const a=m.attributes||{};for(const k of keys){if(a[k]!==undefined&&a[k]!==null&&a[k]!=='')return a[k]}return ''}
function stockDim(...values){return values.filter(v=>v!==undefined&&v!==null&&v!=='').join(' × ')||'—'}
function stockMaterialNameCell(m,withMaker=true){const maker=materialMaker(m);return `<b class="stock-material-title">${escapeHtml(materialDisplayName(m))}</b>${withMaker&&maker!=='—'?`<small>${escapeHtml(maker)}</small>`:''}`}
function stockDisplayUnit(m){return isLinearFabricStock(m)?'пог. м':(m?.unit||'')}
function stockDisplayQty(m,value){const a=m.attributes||{};if(isLinearFabricStock(m)&&value===m.quantity){const len=Number(a.rollLength||a.orderedRollLength||0);return Number(a.linearBalanceMeters||0)||(len?stockNumForUnit(value,m.unit)*len:stockNumForUnit(value,m.unit))}return stockNumForUnit(value,stockDisplayUnit(m))}
function stockQtyCell(value,unit,extra=''){return `<td class="stock-num ${extra}">${escapeHtml(qtyWithUnit(value,unit))}</td>`}
function smartRowByCategory(m,cat){
  const a=m.attributes||{};const st=materialStateOf(m);const need=stockNeededToOrderQty(m);const av=availableQty(m);const ordered=orderedQty(m);
  const statusLabel=st[0]==='ok'?t('stockStatusNormal'):st[0]==='low'?t('stockStatusLow'):st[0]==='needorder'?t('stockStatusNeedOrder'):(['noorder','out'].includes(st[0])?t('stockStatusOut'):st[1]);
  const state=`<span class="stock-status-badge ${st[0]}">${statusLabel}</span>`;
  const displayUnit=stockDisplayUnit(m);
  const qtyCells=`${stockQtyCell(stockDisplayQty(m,m.quantity),displayUnit,av<=0?'stock-danger stock-main-qty':'stock-main-qty')}${stockQtyCell(reservedQty(m),displayUnit)}${stockQtyCell(ordered,displayUnit)}${stockQtyCell(need,displayUnit,need>0?'stock-danger':'')}<td>${state}</td>`;
  const sku=`<td><span class="stock-sku">${escapeHtml(m.sku||'—')}</span></td>`;
  if(typeof isFabricCategory==='function'&&isFabricCategory(cat))return `<tr onclick="openMaterialDetails('${m.id}')">${sku}<td>${stockMaterialNameCell(m,false)}</td><td>${escapeHtml(materialMaker(m))}</td><td>${a.color?`<span class="color-chip only" title="${escapeHtml(a.color)}" style="background:${materialColorStyle(a.color)}"></span> ${escapeHtml(a.color)}`:'—'}</td><td>${escapeHtml(a.rollWidthMm?`${a.rollWidthMm} мм`:a.rollWidth?`${Number(a.rollWidth).toFixed(2)} м`:'—')}</td>${qtyCells}</tr>`;
  if(cat==='Поролон')return `<tr onclick="openMaterialDetails('${m.id}')">${sku}<td>${stockMaterialNameCell(m,false)}</td><td>${escapeHtml(stockAttr(m,'grade','mark')||'—')}</td><td>${escapeHtml(stockAttr(m,'density')||'—')}</td><td>${escapeHtml(stockAttr(m,'hardness')||'—')}</td><td>${escapeHtml(stockAttr(m,'thickness')?`${stockAttr(m,'thickness')} мм`:'—')}</td><td>${escapeHtml(stockDim(stockAttr(m,'width'),stockAttr(m,'length')))}</td>${qtyCells}</tr>`;
  if(cat==='Древесина'){const spec=[a.thickness,a.width,a.length].filter(Boolean).join('×'),amount=qtyWithUnit(stockNumForUnit(m.quantity||0,m.unit||''),m.unit||''),calc=a.totalArea?`${Number(a.totalArea).toFixed(2)} м² · ${Number(a.totalVolume||0).toFixed(4)} м³`:(a.totalVolume?`${Number(a.totalVolume).toFixed(4)} м³`:'—');return `<tr onclick="openMaterialDetails('${m.id}')">${sku}<td>${stockMaterialNameCell(m)}</td><td>${escapeHtml(a.materialType||m.subcategory||'—')}</td><td>${escapeHtml(spec?spec+' мм':'—')}</td><td>${escapeHtml(amount)}</td><td>${escapeHtml(calc)}</td>${qtyCells}</tr>`;}
  if(isSheetMaterialCategory(cat))return `<tr onclick="openMaterialDetails('${m.id}')">${sku}<td>${stockMaterialNameCell(m)}</td><td>${escapeHtml(m.subcategory?woodTypeLabel(m.subcategory):(stockAttr(m,'type')||categoryLabel(m.category)))}</td><td>${escapeHtml(stockAttr(m,'thickness')?`${stockAttr(m,'thickness')} мм`:'—')}</td><td>${escapeHtml(stockDim(stockAttr(m,'width'),stockAttr(m,'length')))}</td><td>${escapeHtml(stockAttr(m,'color','decor')||'—')}</td>${qtyCells}</tr>`;
  if(['Фурнитура','Крепёж'].includes(cat))return `<tr onclick="openMaterialDetails('${m.id}')">${sku}<td>${stockMaterialNameCell(m)}</td><td>${escapeHtml(stockAttr(m,'type')||m.subcategory||'—')}</td><td>${escapeHtml(stockAttr(m,'size','diameter','length')||'—')}</td><td>${escapeHtml(materialMaker(m))}</td>${qtyCells}</tr>`;
  if(cat==='Наполнители')return `<tr onclick="openMaterialDetails('${m.id}')">${sku}<td>${stockMaterialNameCell(m)}</td><td>${escapeHtml(stockAttr(m,'type')||m.subcategory||'—')}</td><td>${escapeHtml(stockAttr(m,'density')||'—')}</td>${qtyCells}</tr>`;
  return `<tr onclick="openMaterialDetails('${m.id}')">${sku}<td>${stockMaterialNameCell(m)}</td><td>${escapeHtml(categoryLabel(m.category))}</td>${qtyCells}<td><button class="iconbtn" type="button" onclick="event.stopPropagation();openMaterialDetails('${m.id}')" aria-label="${escapeHtml(t('open'))}">›</button></td></tr>`;
}
function renderStock(){
  const cf=document.getElementById('categoryFilter');
  if(cf && !cf.value && activeStockGroup==='all') cf.value='';
  const cat=activeStockGroup;
  const rows=filteredMaterialsForSmartTable();
  const box=document.getElementById('stockTable');
  // v7.35: категория выбирается вкладками (stockCategoryTabs) — они теперь рендерятся в
  // отдельный статический контейнер #stockCategoryTabsWrap НАД панелью поиска/фильтров,
  // а не внутри #stockTable, чтобы поиск оказался ближе к самому списку материалов и не
  // перерисовывался вместе с вкладками при каждой смене категории.
  const tabsWrap=document.getElementById('stockCategoryTabsWrap');
  if(tabsWrap) tabsWrap.innerHTML=stockCategoryTabs();
  // v7.36: «Что требует внимания» вынесено из #stockTable в отдельную статическую карточку
  // #stockAttentionWrap НАД панелью поиска/вкладок — по просьбе пользователя, чтобы самое
  // важное (что нужно заказать/заканчивается) было видно сразу, не прокручивая мимо поиска.
  const attentionWrap=document.getElementById('stockAttentionWrap');
  if(attentionWrap) attentionWrap.innerHTML=renderAttentionBlock();
  const totalPages=Math.max(1,Math.ceil(rows.length/stockPageSize));
  stockPage=Math.min(Math.max(1,stockPage),totalPages);
  const startIndex=(stockPage-1)*stockPageSize;
  const pageRows=rows.slice(startIndex,startIndex+stockPageSize);
  const tableCat=stockSelectedTableCategory(rows);
  const cols=tableColumnsByCategory(tableCat);
  const pages=Array.from({length:totalPages},(_,i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-stockPage)<=1);
  let last=0;
  const pageButtons=pages.map(p=>{const gap=p-last>1?`<span class="muted">…</span>`:'';last=p;return gap+`<button class="pagebtn ${p===stockPage?'active':''}" onclick="setStockPage(${p})">${p}</button>`}).join('');
  const filtersRow=stockFiltersForCategory(cat);
  box.innerHTML=`<div class="stock-workspace"><div class="stock-list-card">${filtersRow?`<div class="stock-list-top">${filtersRow}</div>`:''}<div class="smart-table-wrap stock-list-table"><table class="smart-stock-table stock-erp-table"><thead><tr>${cols.map(c=>`<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${pageRows.length?pageRows.map(m=>smartRowByCategory(m,tableCat)).join(''):`<tr><td colspan="${cols.length}"><div class="empty"><b>${t('noMaterialsTitle')}</b>${t('addOrChangeFilters')}</div></td></tr>`}</tbody></table></div><div class="table-foot"><span>${t('shown')} <strong>${rows.length?startIndex+1:0}–${startIndex+pageRows.length}</strong> ${t('of')} ${rows.length} ${t('itemsWord')}</span><div class="pager"><span>${t('showBy')} 15</span><button class="pagebtn ${stockPage<=1?'disabled':''}" onclick="setStockPage(${stockPage-1})">‹</button>${pageButtons}<button class="pagebtn ${stockPage>=totalPages?'disabled':''}" onclick="setStockPage(${stockPage+1})">›</button></div></div></div></div>`;
}
function setStockPage(page){stockPage=page;renderStock()}
function setSort(k){if(sortKey===k)sortDir*=-1;else{sortKey=k;sortDir=1}stockPage=1;renderStock()}
function clearFilters(){document.getElementById('searchInput').value='';document.getElementById('categoryFilter').value='';const subcategoryFilter=document.getElementById('subcategoryFilter');if(subcategoryFilter)subcategoryFilter.value='';['stockStateFilter','unitFilter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});['supplierFilter','orderFilter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});activeQuickFilter='all';fabricStockTypeFilter='';activeStockGroup='all';activeStockSub='all';refreshQuickFilterChips();stockPage=1;updateSubFilter();renderAll()}

function categoryHint(cat){const map={'Поролон':'hintFoam','Ткань':'hintFabric','Экокожа':'hintEcoLeather','Кожа':'hintLeather','Древесина':'hintWood','Фанера':'hintPlywood','МДФ':'hintPlywood','ДСП':'hintChipboard','ДВП':'hintChipboard','OSB':'hintChipboard','Крепёж':'hintFasteners','Фурнитура':'hintHardware','Наполнители':'hintFiller'};return t(map[cat]||'')}

function materialFields(cat,sub,attrs={}){let fields=CATEGORIES[cat]?.fieldsBySub?.[sub]||CATEGORIES[cat]?.fields||[];return fields.map(([key,label,type='text'])=>`<div class="field"><label>${label}</label>${type==='checkbox'?`<select class="select attr" data-key="${key}"><option value="false">${t('noOption')}</option><option value="true" ${attrs[key]?'selected':''}>${t('yesOption')}</option></select>`:`<input class="input attr" data-key="${key}" type="${type}" value="${attrs[key]??''}">`}</div>`).join('')}
function categorySubOptions(cat){
  const group=(stockRefs().groups||[]).find(g=>(g.categories||[]).includes(cat));
  const base=(typeof isFabricCategory==='function'&&isFabricCategory(cat))?(CATEGORIES[cat]?.subs||[cat]):(group?.subs||CATEGORIES[cat]?.subs||[]);
  return [...new Set(base.filter(s=>s&&s!=='Все'))];
}
function renderStockRefsPanel(){
  const box=document.getElementById('stockRefsPanel');
  if(!box)return;
  const refs=stockRefs();
  const primaryBadge=`<span class="version-chip">${escapeHtml(t('refsPrimaryBadge'))}</span>`;
  const categoryBlock=`<div class="refs-card"><div><b>${t('refsCategories')} ${primaryBadge}</b><small>${t('refsCanAddNoCode')}</small></div><div class="refs-chips">${Object.keys(CATEGORIES).map(s=>`<span>${escapeHtml(categoryLabel(s))}</span>`).join('')}</div><div class="refs-add"><input class="input" id="refNewCategory" placeholder="${t('refsNewCategory')}"><button class="btn" type="button" onclick="addStockCategoryRef()">${t('add')}</button></div></div>`;
  const refItem=(key,value,groupId='')=>`<span class="refs-chip-action"><b>${escapeHtml(value)}</b><button type="button" onclick="${groupId?`renameStockRefSub('${groupId}','${escapeHtml(value)}')`:`renameStockRefList('${key}','${escapeHtml(value)}')`}">✎</button><button type="button" onclick="${groupId?`deleteStockRefSub('${groupId}','${escapeHtml(value)}')`:`deleteStockRefList('${key}','${escapeHtml(value)}')`}">×</button></span>`;
  const groupRows=refs.groups.filter(g=>g.id!=='all').map(g=>{const key='stockGroup_'+g.id,label=t(key);return `<div class="refs-card"><div><b>${escapeHtml(label===key?(g.label||g.id):label)} ${primaryBadge}</b><small>${escapeHtml((g.categories||[]).join(', ')||'—')}</small></div><div class="refs-chips refs-editable">${(g.subs||[]).map(s=>refItem('subs',s,g.id)).join('')}</div><div class="refs-add"><input class="input" id="refSub_${g.id}" placeholder="${t('refsNewSubcategory')}"><button class="btn" type="button" onclick="addStockRefSub('${g.id}')">${t('add')}</button></div></div>`}).join('');
  const listBlock=(key,titleKey)=>`<div class="refs-card"><div><b>${t(titleKey)}</b><small>${(refs[key]||[]).length} ${t('valuesCountSuffix')}</small></div><div class="refs-chips refs-editable">${sortedRefValues(key).map(s=>refItem(key,s)).join('')}</div><div class="refs-add"><input class="input" id="refList_${key}" placeholder="${t('refsNewValue')}"><button class="btn" type="button" onclick="addStockRefList('${key}')">${t('add')}</button></div></div>`;
  box.innerHTML=`<div class="refs-shell"><div class="refs-grid">${categoryBlock}${groupRows}${listBlock('manufacturers','manufacturer')}${listBlock('collections','collections')}${listBlock('suppliers','suppliers')}</div></div>`;
}
function addStockCategoryRef(){
  const input=document.getElementById('refNewCategory');
  const value=(input?.value||'').trim();
  if(!value)return;
  const refs=stockRefs();
  refs.customCategories=refs.customCategories||[];
  if(!refs.customCategories.includes(value))refs.customCategories.push(value);
  if(!CATEGORIES[value])CATEGORIES[value]={icon:'＋',cls:'custom',unit:'шт',subs:[],fields:[['type',t('typeDescriptionLabel')],['size',t('sizeLabel')]]};
  save();renderStockRefsPanel();renderFilters?.();renderStock();
}
function addStockRefSub(groupId){
  const input=document.getElementById('refSub_'+groupId);
  const value=(input?.value||'').trim();
  if(!value)return;
  const group=stockRefs().groups.find(g=>g.id===groupId);
  if(group&&!group.subs.includes(value))group.subs.push(value);
  save();renderStockRefsPanel();renderStock();
}
function addStockRefList(key){
  const input=document.getElementById('refList_'+key);
  const value=(input?.value||'').trim();
  if(!value)return;
  const refs=stockRefs();
  refs[key]=refs[key]||[];
  if(!refs[key].includes(value))refs[key].push(value);
  saveStockRefs();
}
function renameStockRefList(key,value){
  const next=prompt(t('newValuePrompt'),value);
  if(next===null)return;
  const clean=String(next||'').trim();
  if(!clean)return;
  const refs=stockRefs();
  refs[key]=(refs[key]||[]).map(v=>v===value?clean:v);
  saveStockRefs();
}
function deleteStockRefList(key,value){
  if(!confirm(t('confirmDeleteRefValue')))return;
  const refs=stockRefs();
  refs[key]=(refs[key]||[]).filter(v=>v!==value);
  saveStockRefs();
}
function renameStockRefSub(groupId,value){
  const next=prompt(t('newValuePrompt'),value);
  if(next===null)return;
  const clean=String(next||'').trim();
  if(!clean)return;
  const group=stockRefs().groups.find(g=>g.id===groupId);
  if(group)group.subs=(group.subs||[]).map(v=>v===value?clean:v).sort((a,b)=>String(a).localeCompare(String(b),'ru'));
  save();renderStockRefsPanel();renderStock();
}
function deleteStockRefSub(groupId,value){
  if(!confirm(t('confirmDeleteRefSub')))return;
  const group=stockRefs().groups.find(g=>g.id===groupId);
  if(group)group.subs=(group.subs||[]).filter(v=>v!==value);
  save();renderStockRefsPanel();renderStock();
}
function openMaterialModal(id=null, presetCategory='Ткань'){
  if(!requireAuth())return;
  const foundMaterial=id?data.materials.find(x=>String(x.id)===String(id)):null;
  if(id && !foundMaterial){toast(t('notFoundMaterial')); return;}
  if(foundMaterial?.category==='Поролон'&&typeof openFoamModal==='function'){openFoamModal(id);return;}
  if(!id&&presetCategory==='Поролон'&&typeof openFoamModal==='function'){openFoamModal();return;}
  if(foundMaterial && typeof isFabricCategory==='function'&&isFabricCategory(foundMaterial.category)){openFabricModal(id,foundMaterial.category);return;}
  if(foundMaterial?.category==='Древесина'&&typeof openWoodModal==='function'){openWoodModal(id);return;}
  if(!id&&presetCategory==='Древесина'&&typeof openWoodModal==='function'){openWoodModal();return;}
  const isEdit=!!id;
  const preset=CATEGORIES[presetCategory]?presetCategory:'Ткань';
  const firstSub=(typeof categorySubOptions==='function'?categorySubOptions(preset):(CATEGORIES[preset]?.subs||[]))[0]||preset;
  const m=foundMaterial||{category:preset,subcategory:firstSub,attributes:{},unit:CATEGORIES[preset]?.unit||'м²',quantity:0,minQuantity:0};
  const autoSku=!id;
  const a=m.attributes||{};
  const baseUnit=materialBaseUnit(m.category||preset);
  const currentState=a.purchaseStatus==='ordered'?'ordered':(stockNumForUnit(m.quantity||0,m.unit||baseUnit)>0||!!a.storageLocation?'stock':'card');
  const body=`<div class="material-wizard" data-step="1">
    <div class="wizard-steps"><button class="wizard-step-pill active" type="button" onclick="setMaterialWizardStep(1)">1 ${t('materialBasic')}</button><button class="wizard-step-pill" type="button" onclick="setMaterialWizardStep(2)">2 ${t('fabricWizardParams')}</button><button class="wizard-step-pill" type="button" onclick="setMaterialWizardStep(3)">3 ${t('materialStock')}</button></div>
    <section class="wizard-card material-wizard-step" data-step="1">
      <h4>${t('fabricWizardBasic')}</h4>
      <div class="form-grid">
        <input id="mCat" type="hidden" value="${escapeHtml(m.category||preset)}">
        <div class="field"><label>${t('name')}</label><input id="mName" class="input" value="${m.name||''}" placeholder="${t('name')}"></div>
        <div class="field"><label>${t('sku')}</label><input id="mSku" class="input" value="${m.sku||nextSku(m.category,m.subcategory,id||'')}"><div class="hint">${t('skuAutoHint')}</div></div>
        <div class="field"><label>${materialSubtypeLabel(m.category||preset)}</label><select id="mSub" class="select"></select></div>
        <div class="field"><label>${t('collection')}</label><input id="mCollection" class="input" value="${escapeHtml(a.collection||'')}" placeholder="${t('collection')}"></div>
        <div class="field"><label>${t('manufacturer')}</label><input id="mManufacturer" class="input" value="${escapeHtml(a.manufacturer||'')}" placeholder="${t('manufacturer')}"></div>
      </div>
    </section>
    <section class="wizard-card material-wizard-step hidden" data-step="2">
      <h4>${t('fabricWizardParams')}</h4>
      <div class="form-grid">${materialWizardParamsHtml(m.category||preset,a,'m')}${typeof isSheetMaterialCategory==='function'&&isSheetMaterialCategory(m.category||preset)?'<div class="area-preview hidden" id="mParamAreaPreview"></div>':''}</div>
    </section>
    <section class="wizard-card material-wizard-step hidden" data-step="3">
      <h4>${t('materialStateTitle')}</h4>
      ${materialStateCards(currentState)}
      <div class="fabric-form-grid">
      <div class="state-fields ${currentState==='ordered'?'':'hidden'}" data-state-fields="ordered">
        <div class="field"><label>${t('ordered')}, ${unitLabel(m.unit||baseUnit)}</label><input id="mOrderedQty" class="input" type="number" min="0" step="${stockStep(m.unit||baseUnit)}" value="${inputQtyValue(stockNumForUnit(a.orderedQty||0,m.unit||baseUnit),m.unit||baseUnit)}" oninput="syncGenericMaterialPreview()"></div>
        <div class="field"><label>${t('expectedReceiptDateLabel')}</label><input id="mExpectedDate" class="input" type="date" value="${a.expectedReceiptDate||''}"></div>
        <div class="field full"><label>${t('purchaseNoteLabel')}</label><input id="mPurchaseNote" class="input" value="${escapeHtml(a.purchaseNote||a.order||'')}" placeholder="${t('purchaseNotePlaceholder')}"></div>
      </div>
      <div class="stock-only-fields ${currentState==='stock'?'':'hidden'}" data-state-fields="stock" id="mStockStep">
        <div class="field"><label>${t('inStockLabel')}, ${unitLabel(m.unit||baseUnit)}</label><input id="mQty" type="number" step="${stockStep(m.unit||baseUnit)}" min="0" class="input" value="${inputQtyValue(stockNumForUnit(m.quantity||0,m.unit||baseUnit),m.unit||baseUnit)}" inputmode="decimal" oninput="syncGenericMaterialPreview()"></div>
        <div class="field"><label>${t('minQuantity')}</label><input id="mMinQty" type="number" step="${stockStep(m.unit||baseUnit)}" min="0" class="input" value="${inputQtyValue(stockNumForUnit(m.minQuantity||0,m.unit||baseUnit),m.unit||baseUnit)}" inputmode="decimal"></div>
        <div class="field"><label>${t('storageLocation')}</label><input id="mStorageLocation" class="input" value="${a.storageLocation||''}" placeholder="${t('shelfZonePlaceholder')}"></div>
        <div class="field"><label>${t('purchasePrice')}</label><input id="mPurchasePrice" class="input" type="number" min="0" step="0.01" value="${a.purchasePrice||''}"></div>
        <div class="field"><label>${t('receiptDate')}</label><input id="mReceiptDate" class="input" type="date" value="${a.receiptDate||''}"></div>
      </div>
      </div>
    </section>
  </div>`;
  const foot=materialWizardFooter(`saveMaterial('${id||''}')`);
  openModal(id?t('edit'):t('addMaterial'),body,foot);
  const catEl=document.getElementById('mCat'),subEl=document.getElementById('mSub'),skuEl=document.getElementById('mSku');
  function refreshSku(){if(autoSku)skuEl.value=nextSku(catEl.value,subEl.value,id||'')}
  function redraw(){const cat=catEl.value;const subs=categorySubOptions(cat);const options=subs.length?subs:[cat];subEl.innerHTML=options.map(s=>`<option ${m.subcategory===s?'selected':''}>${s}</option>`).join('');refreshSku()}
  subEl.onchange=()=>{refreshSku()};
  redraw();
  setMaterialWizardStep(1);
  if(typeof syncGenericMaterialPreview==='function')syncGenericMaterialPreview();
}
function toggleMaterialStockStep(){document.getElementById('mStockStep')?.classList.toggle('hidden',!document.getElementById('mHasStock')?.checked)}
async function saveMaterial(id){
  const cat=document.getElementById('mCat').value;
  const attrs={};
  document.querySelectorAll('.attr').forEach(i=>{if(String(i.value||'').trim()!=='')attrs[i.dataset.key]=i.value==='true'?true:i.value==='false'?false:i.value});
  attrs.collection=(document.getElementById('mCollection')?.value||'').trim();
  attrs.manufacturer=(document.getElementById('mManufacturer')?.value||'').trim();
  Object.assign(attrs,readMaterialWizardParams(cat,'m',(id?(data.materials||[]).find(x=>String(x.id)===String(id))?.attributes:{} )||{}));
  const unit=(id?(data.materials||[]).find(x=>String(x.id)===String(id))?.unit:'')||materialBaseUnit(cat);
  const state=materialCreateState();
  const q=state==='stock'?normalizeStockValue(document.getElementById('mQty')?.value||0,unit,true):0;
  const mn=state==='stock'?normalizeStockValue(document.getElementById('mMinQty')?.value||0,unit,true):normalizeStockValue((id?(data.materials||[]).find(x=>String(x.id)===String(id))?.minQuantity:0)||0,unit,true);
  if(q===null||mn===null){toast(unit==='шт'?t('fieldWhole'):t('fieldMinZero'));return;}
  const ordered=state==='ordered'?normalizeStockValue(document.getElementById('mOrderedQty')?.value||0,unit,true):0;
  if(ordered===null){toast(unit==='шт'?t('fieldWhole'):t('fieldMinZero'));return;}
  attrs.storageLocation=state==='stock'?(document.getElementById('mStorageLocation')?.value||'').trim():'';
  attrs.purchasePrice=state==='stock'?(document.getElementById('mPurchasePrice')?.value||''):'';
  attrs.receiptDate=state==='stock'?(document.getElementById('mReceiptDate')?.value||''):'';
  attrs.expectedReceiptDate=state==='ordered'?(document.getElementById('mExpectedDate')?.value||''):'';
  attrs.purchaseNote=state==='ordered'?(document.getElementById('mPurchaseNote')?.value||'').trim():'';
  attrs.purchaseStatus=state==='ordered'?'ordered':(state==='stock'&&q>0?'instock':'noorder');
  attrs.reservedQty=0;
  attrs.orderedQty=ordered||0;
  if(typeof isSheetMaterialCategory==='function'&&isSheetMaterialCategory(cat)){
    const width=Number(String(attrs.width||0).replace(',','.'))||0;
    const length=Number(String(attrs.length||0).replace(',','.'))||0;
    const thickness=Number(String(attrs.thickness||0).replace(',','.'))||0;
    const sheetArea=width>0&&length>0?Number(((width/1000)*(length/1000)).toFixed(3)):0;
    const sheetVolume=sheetArea>0&&thickness>0?Number((sheetArea*(thickness/1000)).toFixed(4)):0;
    const count=state==='ordered'?ordered:q;
    attrs.sheetArea=sheetArea||'';
    attrs.totalArea=sheetArea&&count?Number((sheetArea*count).toFixed(3)):'';
    attrs.sheetVolume=sheetVolume||'';
    attrs.totalVolume=sheetVolume&&count?Number((sheetVolume*count).toFixed(4)):'';
  }
  const obj={id:id||null,sku:mSku.value.trim()||nextSku(cat,mSub.value,id||''),name:mName.value.trim()||mSub.value||categoryLabel(cat),category:cat,subcategory:mSub.value,attributes:attrs,unit,quantity:q,minQuantity:mn,lastUpdated:today()};
  const ok=id?await updateMaterialInSupabase(obj):await insertMaterialToSupabase(obj);
  if(!ok)return;
  if(id){closeModal();await loadMaterialsFromSupabase();if(document.getElementById('orderMaterialsBox')){rebuildOrderMaterialOptions();refreshOrderMaterialRows();}toast(t('savedMaterial'));return;}
  await finishMaterialSaveAndReturn(obj.sku,obj.category)
}
async function deleteMaterial(id){
  const mat=data.materials.find(x=>String(x.id)===String(id));
  const title=mat?materialTitle(mat):t('materialFallback');
  const usedInOrders=(data.orders||[]).filter(o=>orderMaterials(o).some(i=>String(i.materialId)===String(id)));
  const msg=usedInOrders.length
    ? t('confirmDeleteMaterialUsed').replace('{title}',title).replace('{orders}',usedInOrders.map(o=>o.number||'—').join(', '))
    : t('confirmDeleteMaterialSimple').replace('{title}',title);
  if(!confirm(msg))return;
  const ok=await deleteMaterialFromSupabase(id);
  if(!ok)return;
  data.models.forEach(m=>m.items=m.items.filter(i=>String(i.materialId)!==String(id)));
  data.orders.forEach(o=>{if(Array.isArray(o.materials))o.materials=o.materials.filter(i=>String(i.materialId)!==String(id));});
  save();
  closeModal();
  await loadMaterialsFromSupabase();
  renderAll();
  toast(t('materialDeletedToast'));
}

// ===== v7.07: штрихкоды/QR на складе =====
// Печатаем QR с артикулом (SKU) материала — свой код, а не код производителя,
// т.к. единого стандарта штрихкодов у поставщиков ткани/фурнитуры нет.
// Сканирование ищет материал по этому же SKU через уже существующую findMaterialBySku().

let __scannerStream=null;
let __scannerRAF=null;
let __scannerLastMiss='';
let __scannerLastMissAt=0;

function stopBarcodeScanner(){
  if(__scannerRAF){cancelAnimationFrame(__scannerRAF);__scannerRAF=null;}
  if(__scannerStream){
    __scannerStream.getTracks().forEach(tr=>{try{tr.stop()}catch(e){}});
    __scannerStream=null;
  }
}

function openBarcodeScanner(){
  const body=`
    <div class="scan-wrap">
      <video id="scanVideo" class="scan-video" playsinline autoplay muted></video>
      <div class="scan-frame"></div>
      <div class="scan-hint" id="scanHint">${t('scanHintStarting')}</div>
    </div>
    <div class="scan-manual">
      <div class="scan-manual-label">${t('scanManualLabel')}</div>
      <div class="scan-manual-row">
        <input id="scanManualInput" class="input" placeholder="${t('skuIn')}" onkeydown="if(event.key==='Enter'){event.preventDefault();scanManualSubmit();}">
        <button class="btn primary" type="button" onclick="scanManualSubmit()">${t('scanManualSubmit')}</button>
      </div>
    </div>`;
  openModal(t('scanQrTitle'),body,`<button class="btn" type="button" onclick="closeModal()">${t('cancel')}</button>`);
  startBarcodeScanner();
  setTimeout(()=>document.getElementById('scanManualInput')?.focus(),250);
}

function scanManualSubmit(){
  const val=(document.getElementById('scanManualInput')?.value||'').trim();
  if(!val){toast(t('enterSkuMsg'));return;}
  handleScannedCode(val);
}

async function startBarcodeScanner(){
  const hint=document.getElementById('scanHint');
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||typeof jsQR!=='function'){
    if(hint)hint.textContent=t('scanCameraUnavailable');
    return;
  }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
    if(!document.getElementById('scanVideo')){stream.getTracks().forEach(tr=>tr.stop());return;} // modal already closed
    __scannerStream=stream;
    const video=document.getElementById('scanVideo');
    video.srcObject=stream;
    await video.play().catch(()=>{});
    if(hint)hint.textContent=t('scanHint');
    const canvas=document.createElement('canvas');
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const tick=()=>{
      const v=document.getElementById('scanVideo');
      if(!v){stopBarcodeScanner();return;} // modal closed/replaced elsewhere
      if(v.readyState===v.HAVE_ENOUGH_DATA){
        canvas.width=v.videoWidth;canvas.height=v.videoHeight;
        ctx.drawImage(v,0,0,canvas.width,canvas.height);
        let code=null;
        try{
          const imgData=ctx.getImageData(0,0,canvas.width,canvas.height);
          code=jsQR(imgData.data,imgData.width,imgData.height);
        }catch(e){}
        if(code&&code.data){
          const found=handleScannedCode(code.data,true);
          if(found)return; // stop loop — handleScannedCode already stopped the stream
        }
      }
      __scannerRAF=requestAnimationFrame(tick);
    };
    __scannerRAF=requestAnimationFrame(tick);
  }catch(err){
    if(hint)hint.textContent=t('scanCameraError');
  }
}

// fromCamera=true → called from the scan loop (keep scanning silently on miss).
// fromCamera=false (manual submit) → show a toast on miss.
function handleScannedCode(raw,fromCamera){
  const sku=String(raw||'').trim();
  if(!sku)return false;
  const m=typeof findMaterialBySku==='function'?findMaterialBySku(sku):null;
  if(!m){
    if(fromCamera){
      const now=Date.now();
      if(sku!==__scannerLastMiss||now-__scannerLastMissAt>2500){
        __scannerLastMiss=sku;__scannerLastMissAt=now;
        const hint=document.getElementById('scanHint');
        if(hint)hint.textContent=t('scanNotFoundHint');
      }
    }else{
      toast(t('scanNotFoundToast'));
    }
    return false;
  }
  stopBarcodeScanner();
  openMaterialDetails(m.id);
  setTimeout(()=>{if(typeof materialDetailGo==='function')materialDetailGo('writeoff');},60);
  return true;
}

function printMaterialQrLabel(id){
  const m=(data.materials||[]).find(x=>String(x.id)===String(id));
  if(!m)return;
  const sku=String(m.sku||'').trim();
  if(!sku){toast(t('scanNoSkuToast'));return;}
  const name=(typeof materialDisplayName==='function'?materialDisplayName(m):m.name)||'';
  const cat=(typeof categoryLabel==='function'?categoryLabel(m.category):m.category)||'';
  const w=window.open('','_blank','width=420,height=560');
  if(!w){toast(t('noPopupPrint'));return;}
  const esc=(s)=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(sku)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px;margin:0}
  .qr-label{border:1px dashed #999;border-radius:8px;padding:18px;text-align:center;width:240px}
  #qrCanvas{margin:0 auto 10px}
  .qr-sku{font-size:20px;font-weight:700;letter-spacing:1px;margin-top:4px}
  .qr-name{font-size:12px;color:#444;margin-top:4px;line-height:1.3}
  @media print{.qr-label{border:none}}
</style>
<script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
</head><body>
  <div class="qr-label">
    <div id="qrCanvas"></div>
    <div class="qr-sku">${esc(sku)}</div>
    <div class="qr-name">${esc(name)}${cat?' · '+esc(cat):''}</div>
  </div>
  <script>
    try{
      new QRCode(document.getElementById('qrCanvas'),{text:${JSON.stringify(sku)},width:170,height:170,correctLevel:QRCode.CorrectLevel.M});
      window.onload=function(){setTimeout(function(){window.focus();window.print();},350)};
    }catch(e){document.getElementById('qrCanvas').textContent='QR error';}
  </script>
</body></html>`);
  w.document.close();
}
