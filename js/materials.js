function stockNum(v){const n=Number(String(v??0).replace(',','.'));return Number.isFinite(n)?Number(n.toFixed(3)):0}
function stockNumForUnit(v,unit){const n=stockNum(v);return unit==='шт'?Math.trunc(n):n}
function stockStep(unit){return unit==='шт'?'1':'0.01'}
function stockDefaultValue(unit){return unit==='шт'?'1':'0.01'}
function normalizeStockValue(value,unit,allowZero=true){const raw=String(value??'0').replace(',','.');const n=Number(raw);if(!Number.isFinite(n) || (allowZero?n<0:n<=0))return null;if(unit==='шт'){if(!Number.isInteger(n))return null;return n;}return Number(n.toFixed(3));}
function reservedQty(m){return Math.max(0,stockNumForUnit((m.attributes||{}).reservedQty,m.unit))}
function orderedManualQty(m){return Math.max(0,stockNumForUnit((m.attributes||{}).orderedQty,m.unit))}
function orderedQty(m){return Math.max(0,stockNumForUnit(orderedManualQty(m)+orderedByOrdersQty(m),m.unit))}
function availableQty(m){const u=m.unit;return Math.max(0,stockNumForUnit(stockNumForUnit(m.quantity,u)-reservedQty(m),u))}

function materialOrderedOrders(matId){
  return (data.orders||[])
    .filter(o=>!['Готов','Отменён'].includes(o.status))
    .flatMap(o=>orderMaterials(o).filter(i=>String(i.materialId)===String(matId) && orderItemPurchaseStatus(i)==='ordered' && Number(orderItemPurchaseQty(i,0)||0)>0).map(i=>({order:o,item:i})));
}
function orderedByOrdersQty(m){
  return Math.max(0,stockNumForUnit(materialOrderedOrders(m.id).reduce((s,r)=>s+Number(orderItemPurchaseQty(r.item,0)||0),0),m.unit));
}
function materialReservationOrders(matId){
  return (data.orders||[])
    .filter(o=>!['Готов','Отменён'].includes(o.status))
    .flatMap(o=>orderMaterials(o).filter(i=>String(i.materialId)===String(matId)).map(i=>({order:o,item:i})));
}
function reservationOrdersHtml(m){
  const rows=materialReservationOrders(m.id);
  if(!rows.length)return '<div class="reserve-orders muted">Резерва по заказам нет</div>';
  return `<div class="reserve-orders">${rows.map(r=>`<button class="reserve-order-link" type="button" onclick="goToOrderFromMaterial(event,'${r.order.id}')"><span><b>${escapeHtml(r.order.number||'—')}</b>${r.order.client?` · ${escapeHtml(r.order.client)}`:''}<br><small>Резерв: ${escapeHtml(qtyWithUnit(r.item.qty,m.unit))}</small></span><span class="go">›</span></button>`).join('')}</div>`;
}
