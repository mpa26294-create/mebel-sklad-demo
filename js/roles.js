// v8.04: роли пользователей — кто что видит и что может менять.
// Роли: admin (владелец — NOTIFICATION_ADMIN_EMAIL, js/orders.js), master (мастер/технолог),
// storekeeper (кладовщик), worker (рабочий). Кто есть кто — задаёт админ в Настройках
// («Пользователи и роли»), список хранится в служебной строке доступа (см. index.html,
// applyAccessSyncRow / saveWorkerAccessList). Кого в списке нет — по умолчанию master.
//
// ВАЖНО: пока это ограничение ИНТЕРФЕЙСА, а не базы — так же, как и упрощённый режим раньше. Настоящая
// защита (RLS) возможна только после переноса заказов из JSON-блоба в таблицы, см. план по фазам.
const ROLE_SECTIONS={
  admin:null,
  master:null,
  storekeeper:['stock','orders','technologies','models','refs','changelog'],
  worker:['stock','workshops']
};
// catalog — создание/правка/удаление заказов, технологий, моделей, справочников;
// production — отметки в цехах (старт, пауза, выпуск, комментарии).
const ROLE_WRITE={
  catalog:['admin','master'],
  production:['admin','master','worker']
};
const ROLE_GUARDED_FUNCTIONS={
  catalog:[
    'openOrderModal','saveManagerOrder','saveOrder','saveOrderLegacy','deleteOrder','transferOrderToProduction','transferOrderToCompletion',
    'saveTechnologyForLater','removeTechnologyOperation','removeTechnologyMaterial','saveProductionTechnologyEdit','applyTechnologyOperationTemplate',
    'toggleCompletionCheck','saveCompletionComment','saveCompletionDelayReason','saveCancelReview',
    'applyTechnologyToOrder','clearOrderTechnology','confirmTechnologySave','deleteTechnology','duplicateTechnology','openCreateTechnologyModal','openTechnologySaveDialog','saveNewTechnology','saveTechnologyAndReturn',
    'openModelModal','saveModel','deleteModel','addModelItem',
    'addStockRefList','addStockRefSub','addStockCategoryRef','deleteStockRefList','deleteStockRefSub','renameStockRefList','renameStockRefSub','saveStockRefs'
  ],
  production:[
    'startProductionOperation','pauseProductionOperation','toggleProductionOperation','completeProductionOperation','finalizeProductionQuantity',
    'saveProductionComment','recordWorkshopQuickQty','undoLastProductionConsumption'
  ]
};
function roleLabel(role){
  return t({admin:'roleAdmin',master:'roleMaster',storekeeper:'roleStorekeeper',worker:'roleWorker'}[role]||'roleNotSet');
}
function roleAllowsSection(role,sectionId){
  const list=ROLE_SECTIONS[role];
  return !list||list.includes(sectionId);
}
function roleCan(permission){
  const role=typeof currentUserRole==='function'?currentUserRole():'admin';
  return (ROLE_WRITE[permission]||[]).includes(role);
}
function guardWrite(name,permission){
  const fn=window[name];
  if(typeof fn!=='function'||fn.__roleGuarded)return;
  const wrapped=function(...args){
    if(!roleCan(permission)){toast(t('roleReadOnly'));return}
    return fn.apply(this,args);
  };
  wrapped.__roleGuarded=true;
  window[name]=wrapped;
}
// Оборачиваем входные точки записи один раз, когда роль уже известна (все скрипты к этому моменту загружены).
let roleGuardsInstalled=false;
function installRoleGuards(){
  if(roleGuardsInstalled)return;
  roleGuardsInstalled=true;
  Object.keys(ROLE_GUARDED_FUNCTIONS).forEach(permission=>ROLE_GUARDED_FUNCTIONS[permission].forEach(name=>guardWrite(name,permission)));
}
