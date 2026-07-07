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
