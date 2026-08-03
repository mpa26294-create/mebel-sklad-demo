function discreteStockUnit(unit){return ['шт','лист','рулон'].includes(unit)}
function unitLabel(unit){return unit==='шт'?t('unitPieces'):unit==='м²'?t('unitM2'):unit==='м.п.'||unit==='пог. м'?'пог. м':unit||''}
function formatQty(qty,unit){const n=Number(qty||0);if(discreteStockUnit(unit))return String(Math.trunc(n));return String(Number(n.toFixed(3))).replace('.',',')}
function inputQtyValue(qty,unit){const n=Number(qty||0);if(discreteStockUnit(unit))return String(Math.trunc(n));return String(Number(n.toFixed(3)))}
function qtyWithUnit(qty,unit){return `${formatQty(qty,unit)} ${unitLabel(unit)}`.trim()}
function isLinearUnit(unit){return ['м.п.','пог. м','м'].includes(String(unit||''))}
function materialRollLength(m){
  const a=m?.attributes||{};
  const direct=Number(String(a.rollLength||a.orderedRollLength||0).replace(',','.'));
  if(Number.isFinite(direct)&&direct>0)return direct;
  const balance=Number(String(a.linearBalanceMeters||0).replace(',','.'));
  const rolls=Number(m?.quantity||0);
  if(Number.isFinite(balance)&&balance>0&&Number.isFinite(rolls)&&rolls>0)return balance/rolls;
  return 0;
}
function orderUnitForMaterial(m,category=''){
  const cat=category||m?.category||'';
  if((cat==='Ткань'||cat==='Экокожа')&&m?.unit==='рулон')return 'пог. м';
  if(cat==='Ткань'||cat==='Экокожа')return 'пог. м';
  return m?.unit||(typeof orderDefaultUnitForCategory==='function'?orderDefaultUnitForCategory(cat):'шт');
}
function convertMaterialQty(qty,fromUnit,toUnit,m){
  const n=Number(qty||0);
  if(!Number.isFinite(n)||fromUnit===toUnit)return typeof stockNumForUnit==='function'?stockNumForUnit(n,toUnit):n;
  const rollLength=materialRollLength(m);
  if(isLinearUnit(fromUnit)&&toUnit==='рулон'){
    const rolls=rollLength>0?Math.ceil(n/rollLength):n;
    return typeof stockNumForUnit==='function'?stockNumForUnit(rolls,toUnit):rolls;
  }
  if(fromUnit==='рулон'&&isLinearUnit(toUnit)){
    return rollLength>0?n*rollLength:n;
  }
  return typeof stockNumForUnit==='function'?stockNumForUnit(n,toUnit):n;
}
function uid(){return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random())}
function today(){return new Date().toISOString().slice(0,10)}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
