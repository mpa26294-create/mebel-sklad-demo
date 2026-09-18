// v8.06: роли и точечные права — кто что видит и что может менять.
// Модель: ПРАВА (permissions) — мелкие действия («изменять заказ», «удалять заказ», «удалять материалы»…).
// ДОЛЖНОСТЬ даёт набор прав по умолчанию (ROLE_PERMS); у одного email можно отметить несколько должностей —
// наборы складываются; сверху админ может ВКЛЮЧИТЬ лишнее право (extra) или ОТКЛЮЧИТЬ право из должности
// (denied) — точечно для конкретного человека. Итог: (права должностей) + extra − denied.
// Владелец (NOTIFICATION_ADMIN_EMAIL, js/orders.js) — всегда все права, ничего не отключается.
// Настройки → «Пользователи и роли» (только владелец) — единственное место, где это задаётся; список лежит в
// служебной строке доступа (index.html: applyAccessSyncRow / saveWorkerAccessList). Кого в списке нет — master.
//
// ВАЖНО: пока это ограничение ИНТЕРФЕЙСА, а не базы — так же, как упрощённый режим раньше. Настоящая
// защита (RLS) возможна только после переноса заказов из JSON-блоба в таблицы, см. план по фазам.
const PERMISSIONS=[
  {key:'view.stock',group:'Разделы',label:'Склад'},
  {key:'view.orders',group:'Разделы',label:'Заказы'},
  {key:'view.technologies',group:'Разделы',label:'Технологии'},
  {key:'view.workshops',group:'Разделы',label:'Цеха'},
  {key:'view.models',group:'Разделы',label:'Модели мебели'},
  {key:'view.refs',group:'Разделы',label:'Справочники'},
  {key:'view.activity',group:'Разделы',label:'Активность'},
  {key:'view.history',group:'Разделы',label:'История'},
  {key:'view.settings',group:'Разделы',label:'Настройки (личные)'},
  {key:'view.changelog',group:'Разделы',label:'Релизы'},
  {key:'stock.move',group:'Склад',label:'Приход и расход материала'},
  {key:'stock.edit',group:'Склад',label:'Создавать и править материалы'},
  {key:'stock.delete',group:'Склад',label:'Удалять материалы'},
  {key:'orders.create',group:'Заказы',label:'Создавать заказы'},
  {key:'orders.edit',group:'Заказы',label:'Изменять заказ'},
  {key:'orders.delete',group:'Заказы',label:'Удалять заказ'},
  {key:'orders.workflow',group:'Заказы',label:'Передавать в производство и на завершение'},
  {key:'orders.technology',group:'Заказы',label:'Править технологию внутри заказа'},
  {key:'tech.edit',group:'Справочные данные',label:'Технологии (шаблоны): создавать, править, удалять'},
  {key:'models.edit',group:'Справочные данные',label:'Модели мебели: создавать, править, удалять'},
  {key:'refs.edit',group:'Справочные данные',label:'Справочники: править'},
  {key:'production.mark',group:'Цеха',label:'Отмечать работу и выпуск (свои отметки за сегодня можно править)'},
  {key:'production.fixAny',group:'Цеха',label:'Править чужие отметки и за прошлые дни'}
];
const PERMISSION_KEYS=PERMISSIONS.map(p=>p.key);
const ROLE_CHOICES=['technologist','master','storekeeper','worker']; // что можно назначить в панели
const ROLE_LABEL_KEYS={admin:'roleAdmin',technologist:'roleTechnologist',master:'roleMaster',storekeeper:'roleStorekeeper',worker:'roleWorker'};
const ROLE_PERMS={
  master:PERMISSION_KEYS.slice(),
  technologist:['view.stock','view.orders','view.technologies','view.workshops','view.models','view.refs','view.changelog','stock.move','stock.edit','orders.create','orders.edit','orders.delete','orders.workflow','orders.technology','tech.edit','models.edit','refs.edit'],
  storekeeper:['view.stock','view.orders','view.technologies','view.models','view.refs','view.changelog','stock.move','stock.edit','stock.delete'],
  worker:['view.stock','view.workshops','stock.move','production.mark']
};
// Входные точки записи → нужное право. Функция вместо строки — когда право зависит от аргументов
// (например, openOrderModal без id — создание, с id существующего заказа — изменение).
const orderExistsFor=id=>!!id&&typeof data!=='undefined'&&(data.orders||[]).some(o=>String(o.id)===String(id));
const orderSavePerm=args=>orderExistsFor(args[0])?'orders.edit':'orders.create';
const ROLE_GUARDS={
  openOrderModal:orderSavePerm,saveManagerOrder:orderSavePerm,saveOrder:orderSavePerm,saveOrderLegacy:orderSavePerm,
  deleteOrder:'orders.delete',
  transferOrderToProduction:'orders.workflow',transferOrderToCompletion:'orders.workflow',toggleCompletionCheck:'orders.workflow',saveCompletionComment:'orders.workflow',saveCompletionDelayReason:'orders.workflow',saveCancelReview:'orders.workflow',
  saveTechnologyForLater:'orders.technology',removeTechnologyOperation:'orders.technology',removeTechnologyMaterial:'orders.technology',saveProductionTechnologyEdit:'orders.technology',applyTechnologyOperationTemplate:'orders.technology',applyTechnologyToOrder:'orders.technology',clearOrderTechnology:'orders.technology',
  confirmTechnologySave:'tech.edit',deleteTechnology:'tech.edit',duplicateTechnology:'tech.edit',openCreateTechnologyModal:'tech.edit',openTechnologySaveDialog:'tech.edit',saveNewTechnology:'tech.edit',saveTechnologyAndReturn:'tech.edit',
  openModelModal:'models.edit',saveModel:'models.edit',deleteModel:'models.edit',addModelItem:'models.edit',
  addStockRefList:'refs.edit',addStockRefSub:'refs.edit',addStockCategoryRef:'refs.edit',deleteStockRefList:'refs.edit',deleteStockRefSub:'refs.edit',renameStockRefList:'refs.edit',renameStockRefSub:'refs.edit',saveStockRefs:'refs.edit',
  openMaterialModal:'stock.edit',openFabricModal:'stock.edit',openFoamModal:'stock.edit',openWoodModal:'stock.edit',openMaterialEditor:'stock.edit',saveMaterial:'stock.edit',saveFabricMaterial:'stock.edit',saveFoamMaterial:'stock.edit',saveWoodMaterial:'stock.edit',
  deleteMaterial:'stock.delete',
  quickAddStock:'stock.move',quickWriteOffStock:'stock.move',quickSubmitStock:'stock.move',quickMaterialAction:'stock.move',adjustMaterialQty:'stock.move',openMaterialReceipt:'stock.move',applyMaterialReceipt:'stock.move',saveMaterialReceipt:'stock.move',
  startProductionOperation:'production.mark',pauseProductionOperation:'production.mark',toggleProductionOperation:'production.mark',completeProductionOperation:'production.mark',finalizeProductionQuantity:'production.mark',saveProductionComment:'production.mark',recordWorkshopQuickQty:'production.mark',undoLastProductionConsumption:'production.mark'
};
// Кнопки создания скрываем по классу на <body> (deny-<право>) — см. css; сами функции закрыты в guardWrite.
function permsFromRoles(roles){
  const set=new Set();
  (roles||[]).forEach(r=>(ROLE_PERMS[r]||[]).forEach(p=>set.add(p)));
  return set;
}
function effectivePerms(entry){
  const set=permsFromRoles(entry?.roles);
  (entry?.extra||[]).forEach(p=>set.add(p));
  (entry?.denied||[]).forEach(p=>set.delete(p));
  return set;
}
function userPerms(){
  if(typeof isNotificationAdmin==='function'&&isNotificationAdmin())return new Set(PERMISSION_KEYS);
  const entry=typeof currentWorkerAssignment==='function'?currentWorkerAssignment():null;
  return effectivePerms(entry||{roles:['master']});
}
function userCan(permission){return userPerms().has(permission)}
function userCanSection(sectionId){
  const key='view.'+sectionId;
  return PERMISSION_KEYS.includes(key)?userCan(key):true;
}
// Упрощённый вид рабочего — только если не открыт ни один раздел, кроме Склада и Цехов.
function userSeesOnlyWorkerSections(){
  const p=userPerms();
  return PERMISSION_KEYS.filter(k=>k.startsWith('view.')&&k!=='view.stock'&&k!=='view.workshops').every(k=>!p.has(k));
}
function rolesLabel(roles){
  const list=roles||(typeof currentUserRoles==='function'?currentUserRoles():['admin']);
  return list.map(r=>t(ROLE_LABEL_KEYS[r]||'roleNotSet')).join(', ');
}
function permissionLabel(key){return (PERMISSIONS.find(p=>p.key===key)||{}).label||key}
// Классы на <body> (deny-orders-create …) и скрытие пунктов меню — по итоговым правам.
function applyRoleVisibility(){
  const p=userPerms(),roles=typeof currentUserRoles==='function'?currentUserRoles():['admin'];
  ['admin','technologist','master','storekeeper','worker'].forEach(r=>document.body.classList.toggle('role-'+r,roles.includes(r)));
  PERMISSION_KEYS.forEach(k=>document.body.classList.toggle('deny-'+k.replace('.','-'),!p.has(k)));
  document.querySelectorAll('#mainNav button[data-section]').forEach(b=>b.classList.toggle('role-hidden',!userCanSection(b.dataset.section)));
}
function guardWrite(name,spec){
  const fn=window[name];
  if(typeof fn!=='function'||fn.__roleGuarded)return;
  const wrapped=function(...args){
    const permission=typeof spec==='function'?spec(args):spec;
    if(!userCan(permission)){toast(t('roleNoPermission').replace('{perm}',permissionLabel(permission)));return}
    return fn.apply(this,args);
  };
  wrapped.__roleGuarded=true;
  window[name]=wrapped;
}
// Оборачиваем входные точки записи один раз, когда права уже известны (все скрипты к этому моменту загружены).
let roleGuardsInstalled=false;
function installRoleGuards(){
  if(roleGuardsInstalled)return;
  roleGuardsInstalled=true;
  Object.keys(ROLE_GUARDS).forEach(name=>guardWrite(name,ROLE_GUARDS[name]));
}
