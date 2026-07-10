function discreteStockUnit(unit){return ['шт','лист','рулон'].includes(unit)}
function unitLabel(unit){return unit==='шт'?t('unitPieces'):unit==='м²'?t('unitM2'):unit==='м.п.'?'пог. м':unit||''}
function formatQty(qty,unit){const n=Number(qty||0);if(discreteStockUnit(unit))return String(Math.trunc(n));return String(Number(n.toFixed(3))).replace('.',',')}
function inputQtyValue(qty,unit){const n=Number(qty||0);if(discreteStockUnit(unit))return String(Math.trunc(n));return String(Number(n.toFixed(3)))}
function qtyWithUnit(qty,unit){return `${formatQty(qty,unit)} ${unitLabel(unit)}`.trim()}
function uid(){return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random())}
function today(){return new Date().toISOString().slice(0,10)}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
