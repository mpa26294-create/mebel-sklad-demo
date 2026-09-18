// v8.05: роли пользователей — кто что видит и что может менять.
// Должности: admin (владелец — NOTIFICATION_ADMIN_EMAIL, js/orders.js, только он), technologist (технолог),
// master (мастер), storekeeper (кладовщик), worker (рабочий). К одному email админ может отметить СРАЗУ
// НЕСКОЛЬКО должностей — права складываются (Настройки → «Пользователи и роли»). Список хранится в служебной
// строке доступа (см. index.html: applyAccessSyncRow / saveWorkerAccessList). Кого в списке нет — master.
//
// ВАЖНО: пока это ограничение ИНТЕРФЕЙСА, а не базы — так же, как упрощённый режим раньше. Настоящая
// защита (RLS) возможна только после переноса заказов из JSON-блоба в таблицы, см. план по фазам.
const ROLE_CHOICES=['technologist','master','storekeeper','worker']; // что можно назначить в панели
const ROLE_LABEL_KEYS={admin:'roleAdmin',technologist:'roleTechnologist',master:'roleMaster',storekeeper:'roleStorekeeper',worker:'roleWorker'};
// null — все разделы. Разделы, доступные ХОТЯ БЫ одной из должностей пользователя, складываются.
const ROLE_SECTIONS={
  admin:null,
  master:null,
  technologist:['stock','orders','technologies','workshops','models','refs','changelog'],
  storekeeper:['stock','orders','technologies','models','refs','changelog'],
  worker:['stock','workshops']
};
// catalog — создание/правка/удаление заказов, технологий, моделей, справочников;
// production — отметки в цехах (старт, пауза, выпуск, комментарии).
const ROLE_WRITE={
  catalog:['admin','master','technologist'],
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
function userRoles(){return typeof currentUserRoles==='function'?currentUserRoles():['admin']}
function rolesLabel(roles=userRoles()){return roles.map(r=>t(ROLE_LABEL_KEYS[r]||'roleNotSet')).join(', ')}
function roleAllowsSection(roles,sectionId){
  return (Array.isArray(roles)?roles:[roles]).some(r=>{const list=ROLE_SECTIONS[r];return !list||list.includes(sectionId)});
}
function roleCan(permission){
  const allowed=ROLE_WRITE[permission]||[];
  return userRoles().some(r=>allowed.includes(r));
}
// Классы на <body> и скрытие пунктов меню — по объединению должностей (а не по одной): у человека
// «технолог + кладовщик» должно быть видно то, что открыто хотя бы одной из них.
function applyRoleVisibility(){
  const roles=userRoles();
  ['admin','technologist','master','storekeeper','worker'].forEach(r=>document.body.classList.toggle('role-'+r,roles.includes(r)));
  document.body.classList.toggle('no-catalog-write',!roleCan('catalog'));
  document.querySelectorAll('#mainNav button[data-section]').forEach(b=>b.classList.toggle('role-hidden',!roleAllowsSection(roles,b.dataset.section)));
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
