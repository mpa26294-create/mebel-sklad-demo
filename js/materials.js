function stockNum(v){const n=Number(String(v??0).replace(',','.'));return Number.isFinite(n)?Number(n.toFixed(3)):0}
function stockNumForUnit(v,unit){const n=stockNum(v);return unit==='шт'?Math.trunc(n):n}
function stockStep(unit){return unit==='шт'?'1':'0.01'}
function stockDefaultValue(unit){return unit==='шт'?'1':'0.01'}
function normalizeStockValue(value,unit,allowZero=true){const raw=String(value??'0').replace(',','.');const n=Number(raw);if(!Number.isFinite(n) || (allowZero?n<0:n<=0))return null;if(unit==='шт'){if(!Number.isInteger(n))return null;return n;}return Number(n.toFixed(3));}
function reservedQty(m){return Math.max(0,stockNumForUnit((m.attributes||{}).reservedQty,m.unit))}
function orderedManualQty(m){return Math.max(0,stockNumForUnit((m.attributes||{}).orderedQty,m.unit))}
function orderedQty(m){return Math.max(0,stockNumForUnit(orderedManualQty(m)+orderedByOrdersQty(m),m.unit))}
function availableQty(m){const u=m.unit;return Math.max(0,stockNumForUnit(stockNumForUnit(m.quantity,u)-reservedQty(m),u))}
