const AUDIT_STORE_KEY='furnicore_audit_v1';
function auditNow(){return new Date().toISOString()}
function actorName(){return (currentUser&&currentUser.email)||localStorage.getItem('furnicore_actor_name')||t('unknownUser')}
function actorShort(email){const v=String(email||actorName());return v.includes('@')?v.split('@')[0]:v}
function auditLoad(){try{return JSON.parse(localStorage.getItem(AUDIT_STORE_KEY)||'[]')}catch(e){return []}}
function auditSave(list){try{localStorage.setItem(AUDIT_STORE_KEY,JSON.stringify((list||[]).slice(0,600)))}catch(e){console.warn(e)}}
function auditAdd(type,entity,entityId,entityTitle,text,meta={}){
  const row={id:uid(),at:auditNow(),by:actorName(),type,entity,entityId:String(entityId||''),entityTitle:String(entityTitle||''),text:String(text||''),meta};
  const list=auditLoad();list.unshift(row);auditSave(list);return row;
}
function auditFor(entity,entityId){return auditLoad().filter(x=>x.entity===entity&&String(x.entityId)===String(entityId)).slice(0,60)}
function auditTime(iso){const d=new Date(iso||Date.now());return Number.isNaN(d.getTime())?'—':d.toLocaleString(currentLang==='ru'?'ru-RU':currentLang==='lv'?'lv-LV':'en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
function auditUserHtml(user){const u=escapeHtml(user||'—');return `<span class="profile-chip"><span class="profile-avatar">${escapeHtml(String(user||'?').slice(0,1).toUpperCase())}</span>${u}</span>`}
function auditListHtml(entity,entityId){const rows=auditFor(entity,entityId);if(!rows.length)return '<div class="audit-empty">Истории пока нет.</div>';return `<div class="audit-list">${rows.map(r=>`<div class="audit-item"><span class="audit-dot"></span><div><b>${escapeHtml(r.text)}</b><span>${escapeHtml(auditTime(r.at))} · ${escapeHtml(r.by||'—')}</span></div></div>`).join('')}</div>`}
function metaVal(obj,key,fallback='—'){return obj&&obj[key]?obj[key]:fallback}
function ensureMeta(obj){if(!obj.meta||typeof obj.meta!=='object')obj.meta={};return obj.meta}
function hasOrderTechnology(steps){return (steps||[]).some(s=>Number(s&&s.minutes||0)>0)}
function auditListHtmlOrder(o){let rows=auditFor('order',o.id);if(!hasOrderTechnology(o.steps))rows=rows.filter(r=>r.type!=='technology');if(!rows.length)return '<div class="audit-empty">Истории пока нет.</div>';return `<div class="audit-list">${rows.map(r=>`<div class="audit-item"><span class="audit-dot"></span><div><b>${escapeHtml(r.text)}</b><span>${escapeHtml(auditTime(r.at))} · ${escapeHtml(r.by||'—')}</span></div></div>`).join('')}</div>`}
function orderProfileHtml(o){const m=ensureMeta(o);const hasTech=hasOrderTechnology(o.steps);return `<div class="audit-profile-grid"><div class="audit-card"><h5>${t('orderProfile')}</h5><div class="audit-kv"><span>${t('createdOrder')}</span><b>${escapeHtml(metaVal(m,'createdBy'))}</b></div><div class="audit-kv"><span>${t('creationDate')}</span><b>${escapeHtml(m.createdAt?auditTime(m.createdAt):(o.date||'—'))}</b></div><div class="audit-kv"><span>${t('technologyBy')}</span><b>${escapeHtml(hasTech?metaVal(m,'technologyBy'):'—')}</b></div><div class="audit-kv"><span>${t('lastChange')}</span><b>${escapeHtml(metaVal(m,'updatedBy'))}</b></div></div><div class="audit-card"><h5>${t('orderHistory')}</h5>${auditListHtmlOrder(o)}</div></div>`}
function materialProfileHtml(m){const a=m.attributes||{};return `<div class="audit-profile-grid"><div class="audit-card"><h5>${t('materialProfile')}</h5><div class="audit-kv"><span>${t('addedMaterial')}</span><b>${escapeHtml(a.createdBy||'—')}</b></div><div class="audit-kv"><span>${t('additionDate')}</span><b>${escapeHtml(a.createdAt?auditTime(a.createdAt):'—')}</b></div><div class="audit-kv"><span>${t('lastMovement')}</span><b>${escapeHtml(a.stockChangedBy||a.updatedBy||'—')}</b></div><div class="audit-kv"><span>${t('lastChange')}</span><b>${escapeHtml(a.updatedAt?auditTime(a.updatedAt):'—')}</b></div></div><div class="audit-card"><h5>${t('materialHistory')}</h5>${auditListHtml('material',m.id)}</div></div>`}
function appendModalAudit(html){const body=document.getElementById('modalBody');if(body && !body.querySelector('.audit-profile-grid')) body.insertAdjacentHTML('beforeend',html)}
function stepsSignature(steps){return JSON.stringify((steps||[]).map(s=>({name:String(s.name||''),minutes:Number(s.minutes||0)})))}
function setOrderMetaForSave(draft,prev){const now=auditNow();const meta=Object.assign({},prev&&prev.meta?prev.meta:{});if(!prev){meta.createdBy=actorName();meta.createdAt=now;}meta.updatedBy=actorName();meta.updatedAt=now;const techChanged=!prev || stepsSignature(prev.steps)!==stepsSignature(draft.steps);if(hasOrderTechnology(draft.steps) && techChanged){meta.technologyBy=actorName();meta.technologyAt=now;}if(!hasOrderTechnology(draft.steps)){delete meta.technologyBy;delete meta.technologyAt;}draft.meta=meta;return draft;}

function safeEsc(v){return (typeof escapeHtml==='function')?escapeHtml(v):String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function rowText(row){try{return (typeof auditDisplayTextV572==='function')?auditDisplayTextV572(row):(row&&row.text)||''}catch(e){return (row&&row.text)||''}}
function cleanRow(row){if(!row)return false;if(typeof auditIsGenericMaterialUpdateV576==='function'&&auditIsGenericMaterialUpdateV576(row))return false;if(typeof auditIsGenericOrderUpdateV576==='function'&&auditIsGenericOrderUpdateV576(row))return false;const txt=String(rowText(row)||'').trim();if(!txt)return false;if(/^Материал\s+.+\s+измен[её]н$/i.test(txt))return false;if(/^Заказ\s+.+\s+измен[её]н$/i.test(txt))return false;return true}
function allRows(){const rows=(typeof auditLoad==='function'?auditLoad():[]).filter(cleanRow);return rows.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')))}
function sectionLabel(entity){if(entity==='material')return t('stock');if(entity==='order')return t('orders');if(entity==='production')return t('production');return t('system')}
function entityClass(entity){if(entity==='material')return 'material';if(entity==='order')return 'order';if(entity==='production')return 'production';return 'system'}
function eventAction(row){const type=String(row.type||'');if(type.includes('create'))return t('creation');if(type.includes('receive'))return t('receipt');if(type.includes('write')||type.includes('stock_minus'))return t('writeOffAction');if(type.includes('purchase')||type.includes('ordered'))return t('purchase');if(type.includes('cancel'))return t('cancellation');if(type.includes('production'))return t('production');if(type.includes('order_link')||type.includes('order_qty')||type.includes('materials'))return t('orderMaterials');if(type.includes('technology'))return t('technology');if(type.includes('changed')||type.includes('edit'))return t('change');return t('action')}
function auditDateShort(iso){try{return auditTime(iso)}catch(e){const d=new Date(iso||Date.now());return isNaN(d)?'—':d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}}
function auditDateOnly(iso){const d=new Date(iso||Date.now());if(isNaN(d))return '';const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function openFromHistory(id){const row=allRows().find(r=>String(r.id)===String(id))||(typeof auditLoad==='function'?auditLoad():[]).find(r=>String(r.id)===String(id));if(!row)return;if(row.entity==='material'&&typeof openMaterialDetail==='function')return openMaterialDetail(row.entityId);if(row.entity==='order'&&typeof openOrderView==='function')return openOrderView(row.entityId);if(row.entity==='order'&&typeof openProductionModal==='function'&&String(row.type||'').includes('production'))return openProductionModal(row.entityId)}
window.openHistoryEntityV577=openFromHistory;
function filteredHistory(){const q=String(document.getElementById('historySearchInput')?.value||'').toLowerCase().trim();const section=String(document.getElementById('historySectionFilter')?.value||'');const action=String(document.getElementById('historyActionFilter')?.value||'');const user=String(document.getElementById('historyUserFilter')?.value||'');const date=String(document.getElementById('historyDateFilter')?.value||'');return allRows().filter(r=>{const text=[rowText(r),r.entityTitle,r.by,r.type,sectionLabel(r.entity)].join(' ').toLowerCase();if(q&&!text.includes(q))return false;if(section&&String(r.entity)!==section)return false;if(action&&eventAction(r)!==action)return false;if(user&&String(r.by||'')!==user)return false;if(date&&auditDateOnly(r.at)!==date)return false;return true})}
function renderHistoryStats(){const rows=allRows();const todayStr=auditDateOnly(new Date().toISOString());const todayRows=rows.filter(r=>auditDateOnly(r.at)===todayStr).length;const mat=rows.filter(r=>r.entity==='material').length;const ord=rows.filter(r=>r.entity==='order').length;const users=new Set(rows.map(r=>r.by).filter(Boolean)).size;const box=document.getElementById('historyStats');if(!box)return;box.innerHTML=`<div class="stat"><div><span>${t('totalEvents')}</span><b>${rows.length}</b></div></div><div class="stat"><div><span>${t('today')}</span><b>${todayRows}</b></div></div><div class="stat"><div><span>${t('warehouseOrders')}</span><b>${mat} / ${ord}</b></div></div><div class="stat"><div><span>${t('users')}</span><b>${users}</b></div></div>`}
function fillHistoryFilters(){const rows=allRows();const userSel=document.getElementById('historyUserFilter');const actionSel=document.getElementById('historyActionFilter');if(userSel){const cur=userSel.value;const users=[...new Set(rows.map(r=>r.by).filter(Boolean))].sort();userSel.innerHTML=`<option value="">${t('allUsers')}</option>`+users.map(u=>`<option value="${safeEsc(u)}">${safeEsc(u)}</option>`).join('');userSel.value=cur}if(actionSel){const cur=actionSel.value;const actions=[...new Set(rows.map(eventAction).filter(Boolean))].sort();actionSel.innerHTML=`<option value="">${t('allActions')}</option>`+actions.map(a=>`<option value="${safeEsc(a)}">${safeEsc(a)}</option>`).join('');actionSel.value=cur}}
function renderSiteHistory(){const box=document.getElementById('historyTable');if(!box)return;renderHistoryStats();fillHistoryFilters();const rows=filteredHistory();if(!rows.length){box.innerHTML=`<div class="history-empty"><b>${t('historyEmpty')}</b>${t('historyEmptyDesc')}</div>`;return}box.innerHTML=`<div class="history-list">${rows.slice(0,300).map(r=>{const entity=sectionLabel(r.entity),cls=entityClass(r.entity),txt=rowText(r),title=r.entityTitle||r.entityId||'—';return `<div class="history-row" onclick="openHistoryEntityV577('${safeEsc(r.id)}')"><div class="history-time">${safeEsc(auditDateShort(r.at))}</div><div class="history-main"><b><span class="history-type ${cls}">${safeEsc(entity)}</span>${safeEsc(txt)}</b><span>${safeEsc(title)} · ${safeEsc(eventAction(r))}</span></div><div class="history-user">${safeEsc(r.by||'—')}</div><button class="history-go" type="button">›</button></div>`}).join('')}</div>${rows.length>300?`<div class="table-foot"><span>${t('shown300')} ${rows.length}</span></div>`:''}`}
window.renderSiteHistory=renderSiteHistory;
window.clearHistoryFiltersV577=function(){['historySearchInput','historyDateFilter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});['historySectionFilter','historyActionFilter','historyUserFilter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});renderSiteHistory()};
function injectHistoryUI(){const nav=document.getElementById('mainNav');if(nav&&!nav.querySelector('[data-section="history"]')){const btn=document.createElement('button');btn.dataset.section='history';btn.innerHTML='<span class="ico"><svg viewBox="0 0 24 24"><path d="M12 8v5l3 2"/><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg></span> История';const settings=[...nav.querySelectorAll('button')].find(b=>b.textContent.includes('Настройки')||b.dataset.section==='settings');nav.insertBefore(btn,settings||null)}const main=document.querySelector('.main');if(main&&!document.getElementById('history'))main.insertAdjacentHTML('beforeend',`<section id="history" class="section"><div class="topbar"><div class="title"><h2>История</h2><p>Все добавления, изменения и движения по сайту</p></div></div><div class="history-summary" id="historyStats"></div><div class="panel"><div class="history-toolbar"><div class="searchbox"><svg viewBox="0 0 24 24"><path d="M21 21l-4.3-4.3"/><circle cx="11" cy="11" r="7"/></svg><input class="input" id="historySearchInput" placeholder="Поиск по материалу, заказу, пользователю..." oninput="renderSiteHistory()"></div><select class="select" id="historySectionFilter" onchange="renderSiteHistory()"><option value="">Все разделы</option><option value="material">Склад</option><option value="order">Заказы</option><option value="production">Производство</option></select><select class="select" id="historyActionFilter" onchange="renderSiteHistory()"><option value="">Все действия</option></select><select class="select" id="historyUserFilter" onchange="renderSiteHistory()"><option value="">Все пользователи</option></select><input class="input" type="date" id="historyDateFilter" onchange="renderSiteHistory()"><button class="btn" onclick="clearHistoryFiltersV577()">Сбросить</button></div><div id="historyTable"></div></div></section>`)}
window.injectHistoryUI=injectHistoryUI;
function localizeHistoryUI(){const section=document.getElementById('history');if(!section)return;const nav=document.querySelector('#mainNav [data-section="history"]');if(nav){const ico=nav.querySelector('.ico');nav.innerHTML=(ico?ico.outerHTML:'')+' '+t('history')}const title=section.querySelector('.title h2');if(title)title.textContent=t('historyTitle');const desc=section.querySelector('.title p');if(desc)desc.textContent=t('historyDesc');const search=document.getElementById('historySearchInput');if(search)search.placeholder=t('historySearch');const sections=document.getElementById('historySectionFilter');if(sections){const value=sections.value;sections.innerHTML=`<option value="">${t('allSections')}</option><option value="material">${t('stock')}</option><option value="order">${t('orders')}</option><option value="production">${t('production')}</option>`;sections.value=value}const reset=section.querySelector('.history-toolbar .btn');if(reset)reset.textContent=t('reset')}
window.localizeHistoryUI=localizeHistoryUI;
function initHistory(){injectHistoryUI();localizeHistoryUI();const av=document.getElementById('appVersionBadge');if(av)av.textContent='v5.93.4 - Mobile Menu Close Button';renderSiteHistory()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initHistory);else initHistory();

/* v5.70: detailed audit history for every changed field */
function auditCloneV570(obj){try{return JSON.parse(JSON.stringify(obj||null))}catch(e){return null}}
function auditCleanValV570(v){
  if(v===undefined||v===null||v==='')return '—';
  if(typeof v==='boolean')return v?'Да':'Нет';
  if(typeof v==='number')return Number.isInteger(v)?String(v):String(Number(v.toFixed(3))).replace('.',',');
  return String(v);
}
function auditChangedTextV570(label,oldVal,newVal){return `${label}: ${auditCleanValV570(oldVal)} → ${auditCleanValV570(newVal)}`}
function auditPushDiffV570(list,label,oldVal,newVal){
  const a=auditCleanValV570(oldVal), b=auditCleanValV570(newVal);
  if(a!==b)list.push(auditChangedTextV570(label,oldVal,newVal));
}
function auditJoinV570(parts,max=6){
  const arr=(parts||[]).filter(Boolean);
  if(arr.length<=max)return arr.join('; ');
  return arr.slice(0,max).join('; ')+`; ещё ${arr.length-max}`;
}
function auditAttrLabelV570(key){
  const map={
    materialType:'Тип материала',manufacturer:'Производитель',collection:'Коллекция / код',color:'Цвет',rollWidth:'Ширина рулона',rollLength:'Длина рулона',area:'Площадь',
    grade:'Марка / плотность',thickness:'Толщина',width:'Ширина',length:'Длина',height:'Высота',supplier:'Поставщик',order:'№ закупки / поставщик',tags:'Теги',
    crossSection:'Сечение',woodType:'Порода',limited:'Лимитированная партия',laminated:'Ламинированная',decor:'Цвет / декор',thread:'Резьба',strengthClass:'Класс прочности',type:'Тип',size:'Размер',diameter:'Диаметр',pdfName:'PDF'
  };
  return map[key]||key;
}
function auditMaterialFieldDiffsV570(prev,next){
  const diffs=[];
  if(!prev||!next)return diffs;
  auditPushDiffV570(diffs,'Артикул',prev.sku,next.sku);
  auditPushDiffV570(diffs,'Название',prev.name,next.name);
  auditPushDiffV570(diffs,'Категория',prev.category,next.category);
  auditPushDiffV570(diffs,'Подкатегория',prev.subcategory,next.subcategory);
  auditPushDiffV570(diffs,'Единица учёта',prev.unit,next.unit);
  auditPushDiffV570(diffs,'Остаток',prev.quantity,next.quantity);
  auditPushDiffV570(diffs,'Мин. остаток',prev.minQuantity,next.minQuantity);
  const ignore=new Set(['createdBy','createdAt','updatedBy','updatedAt','stockChangedBy','stockChangedAt','reservedQty','orderedQty','frozenQty','manualPurchaseOrders','purchaseStatus','purchaseNo','purchaseQty','pdfPath','pdfUrl']);
  const pa=prev.attributes||{}, na=next.attributes||{};
  Array.from(new Set([...Object.keys(pa),...Object.keys(na)])).sort().forEach(k=>{
    if(ignore.has(k))return;
    auditPushDiffV570(diffs,auditAttrLabelV570(k),pa[k],na[k]);
  });
  return diffs;
}
function auditStepDiffsV570(prevSteps,nextSteps){
  const diffs=[];
  const old=prevSteps||[], neu=nextSteps||[];
  const max=Math.max(old.length,neu.length);
  for(let i=0;i<max;i++){
    const a=old[i]||{}, b=neu[i]||{};
    const oldName=a.name||'', newName=b.name||'';
    if(!old[i]&&neu[i]){diffs.push(`Добавлен этап: ${newName||'Этап'} · ${Number(b.minutes||0)} мин`);continue;}
    if(old[i]&&!neu[i]){diffs.push(`Удалён этап: ${oldName||'Этап'}`);continue;}
    if(oldName!==newName)diffs.push(`Этап ${i+1}: ${oldName||'—'} → ${newName||'—'}`);
    const am=Number(a.minutes||0), bm=Number(b.minutes||0);
    if(am!==bm)diffs.push(`${newName||oldName||('Этап '+(i+1))}: ${am} → ${bm} мин`);
  }
  return diffs;
}
function auditOrderMaterialLabelV570(item){
  const m=(data.materials||[]).find(x=>String(x.id)===String(item&&item.materialId));
  return m?(m.sku||m.name||item.materialId):(item&&item.materialId)||'материал';
}
function auditOrderMaterialDiffsV570(prevMats,nextMats){
  const diffs=[];
  const old=prevMats||[], neu=nextMats||[];
  const ids=Array.from(new Set([...old.map(x=>String(x.materialId)),...neu.map(x=>String(x.materialId))]));
  ids.forEach(id=>{
    const a=old.find(x=>String(x.materialId)===id), b=neu.find(x=>String(x.materialId)===id);
    const label=auditOrderMaterialLabelV570(b||a||{materialId:id});
    if(!a&&b){diffs.push(`Добавлен материал ${label}: ${qtyWithUnit(Number(b.qty||0),b.unit||'')}`);return;}
    if(a&&!b){diffs.push(`Удалён материал ${label}: было ${qtyWithUnit(Number(a.qty||0),a.unit||'')}`);return;}
    if(a&&b){
      if(Number(a.perUnitQty||0)!==Number(b.perUnitQty||0))diffs.push(`${label} на 1 изделие: ${qtyWithUnit(Number(a.perUnitQty||0),b.unit||a.unit||'')} → ${qtyWithUnit(Number(b.perUnitQty||0),b.unit||a.unit||'')}`);
      if(Number(a.qty||0)!==Number(b.qty||0))diffs.push(`${label} всего: ${qtyWithUnit(Number(a.qty||0),b.unit||a.unit||'')} → ${qtyWithUnit(Number(b.qty||0),b.unit||a.unit||'')}`);
    }
  });
  return diffs;
}
function auditOrderFieldDiffsV570(prev,next){
  const diffs=[];
  if(!prev||!next)return diffs;
  auditPushDiffV570(diffs,'Номер заказа',prev.number,next.number);
  auditPushDiffV570(diffs,'Заказчик',prev.client,next.client);
  auditPushDiffV570(diffs,'Количество изделий',orderProductQty(prev),orderProductQty(next));
  auditPushDiffV570(diffs,'Срок сдачи',prev.dueDate,next.dueDate);
  auditPushDiffV570(diffs,'Дата создания',prev.date,next.date);
  auditPushDiffV570(diffs,'Комментарий',prev.comment,next.comment);
  return diffs;
}

if(typeof saveOrder==='function'){
  const __saveOrderV570=saveOrder;
  saveOrder=async function(id=''){
    const prev=id?auditCloneV570((data.orders||[]).find(o=>String(o.id)===String(id))):null;
    await __saveOrderV570(id);
    const next=id?auditCloneV570((data.orders||[]).find(o=>String(o.id)===String(id))):auditCloneV570((data.orders||[])[(data.orders||[]).length-1]);
    if(prev&&next){
      const fieldDiffs=auditOrderFieldDiffsV570(prev,next);
      const techDiffs=auditStepDiffsV570(prev.steps,next.steps);
      const matDiffs=auditOrderMaterialDiffsV570(prev.materials,next.materials);
      if(false&&fieldDiffs.length)auditAdd('order_fields_changed','order',next.id,next.number,`Изменены данные заказа: ${auditJoinV570(fieldDiffs)}`,{diffs:fieldDiffs});
      if(false&&techDiffs.length)auditAdd('technology_details_changed','order',next.id,next.number,`Изменена технология: ${auditJoinV570(techDiffs)}`,{diffs:techDiffs});
      if(false&&matDiffs.length)auditAdd('order_materials_changed','order',next.id,next.number,`Изменены материалы заказа: ${auditJoinV570(matDiffs)}`,{diffs:matDiffs});
    }
    const av=document.getElementById('appVersionBadge');if(av)av.textContent='v5.93.0 - Orders Modals';
  };
}

if(typeof updateMaterialInSupabase==='function'){
  const __updateMaterialV570=updateMaterialInSupabase;
  updateMaterialInSupabase=async function(m){
    const prev=auditCloneV570((data.materials||[]).find(x=>String(x.id)===String(m&&m.id)));
    const next=auditCloneV570(m);
    const ok=await __updateMaterialV570(m);
    if(ok&&prev&&next){
      const diffs=auditMaterialFieldDiffsV570(prev,next);
      if(false&&diffs.length)auditAdd('material_fields_changed','material',next.id,next.sku||next.name,`Изменены поля материала: ${auditJoinV570(diffs)}`,{diffs});
    }
    return ok;
  };
}

// More detailed rows in audit lists: show changed fields under the main history line.
const __auditListHtmlV570=auditListHtml;
auditListHtml=function(entity,entityId){
  const rows=auditFor(entity,entityId);if(!rows.length)return '<div class="audit-empty">Истории пока нет.</div>';
  return `<div class="audit-list">${rows.map(r=>{const details=(r.meta&&Array.isArray(r.meta.diffs)&&r.meta.diffs.length)?`<span>${r.meta.diffs.map(x=>'• '+escapeHtml(x)).join('<br>')}</span>`:'';return `<div class="audit-item"><span class="audit-dot"></span><div><b>${escapeHtml(r.text)}</b><span>${escapeHtml(auditTime(r.at))} · ${escapeHtml(r.by||'—')}</span>${details}</div></div>`}).join('')}</div>`;
};
auditListHtmlOrder=function(o){
  let rows=auditFor('order',o.id);if(!hasOrderTechnology(o.steps))rows=rows.filter(r=>r.type!=='technology');if(!rows.length)return '<div class="audit-empty">Истории пока нет.</div>';
  return `<div class="audit-list">${rows.map(r=>{const details=(r.meta&&Array.isArray(r.meta.diffs)&&r.meta.diffs.length)?`<span>${r.meta.diffs.map(x=>'• '+escapeHtml(x)).join('<br>')}</span>`:'';return `<div class="audit-item"><span class="audit-dot"></span><div><b>${escapeHtml(r.text)}</b><span>${escapeHtml(auditTime(r.at))} · ${escapeHtml(r.by||'—')}</span>${details}</div></div>`}).join('')}</div>`;
};



/* v5.71: short and clean change history */
function auditAutoNameFromGradeV571(prev,next){
  const pa=(prev&&prev.attributes)||{}, na=(next&&next.attributes)||{};
  if((prev&&prev.category)!=='Поролон' || (next&&next.category)!=='Поролон')return false;
  const oldGrade=String(pa.grade||'').trim();
  const newGrade=String(na.grade||'').trim();
  const oldName=String((prev&&prev.name)||'').trim();
  const newName=String((next&&next.name)||'').trim();
  if(!oldGrade || !newGrade || oldGrade===newGrade)return false;
  // If material name changed only because the grade is included in the generated name,
  // do not write a separate "Название" change. The real user change is grade/density.
  const oldWithout=oldName.replace(oldGrade,'').replace(/\s+/g,' ').trim();
  const newWithout=newName.replace(newGrade,'').replace(/\s+/g,' ').trim();
  return oldWithout===newWithout;
}
function auditMaterialFieldDiffsV571(prev,next){
  const diffs=[];
  if(!prev||!next)return diffs;
  auditPushDiffV570(diffs,'Артикул',prev.sku,next.sku);
  if(!auditAutoNameFromGradeV571(prev,next))auditPushDiffV570(diffs,'Название',prev.name,next.name);
  auditPushDiffV570(diffs,'Категория',prev.category,next.category);
  auditPushDiffV570(diffs,'Подкатегория',prev.subcategory,next.subcategory);
  auditPushDiffV570(diffs,'Единица учёта',prev.unit,next.unit);
  auditPushDiffV570(diffs,'Остаток',prev.quantity,next.quantity);
  auditPushDiffV570(diffs,'Мин. остаток',prev.minQuantity,next.minQuantity);
  const ignore=new Set(['createdBy','createdAt','updatedBy','updatedAt','stockChangedBy','stockChangedAt','reservedQty','orderedQty','frozenQty','manualPurchaseOrders','purchaseStatus','purchaseNo','purchaseQty','pdfPath','pdfUrl','area']);
  const pa=prev.attributes||{}, na=next.attributes||{};
  Array.from(new Set([...Object.keys(pa),...Object.keys(na)])).sort().forEach(k=>{
    if(ignore.has(k))return;
    auditPushDiffV570(diffs,auditAttrLabelV570(k),pa[k],na[k]);
  });
  return diffs;
}
function auditMainTextV571(prefix,diffs){
  const arr=(diffs||[]).filter(Boolean);
  if(!arr.length)return prefix;
  if(arr.length===1)return `${prefix}: ${arr[0]}`;
  return `${prefix}: ${auditJoinV570(arr,4)}`;
}

if(typeof updateMaterialInSupabase==='function'){
  const __updateMaterialV571=updateMaterialInSupabase;
  updateMaterialInSupabase=async function(m){
    const prev=auditCloneV570((data.materials||[]).find(x=>String(x.id)===String(m&&m.id)));
    const next=auditCloneV570(m);
    const ok=await __updateMaterialV571(m);
    if(ok&&prev&&next){
      const diffs=auditMaterialFieldDiffsV571(prev,next);
      if(diffs.length)auditAdd('material_fields_changed','material',next.id,next.sku||next.name,auditMainTextV571('Изменено',diffs),{diffs});
    }
    return ok;
  };
}

if(typeof saveOrder==='function'){
  const __saveOrderV571=saveOrder;
  saveOrder=async function(id=''){
    const prev=id?auditCloneV570((data.orders||[]).find(o=>String(o.id)===String(id))):null;
    await __saveOrderV571(id);
    const next=id?auditCloneV570((data.orders||[]).find(o=>String(o.id)===String(id))):auditCloneV570((data.orders||[])[(data.orders||[]).length-1]);
    if(prev&&next){
      const fieldDiffs=auditOrderFieldDiffsV570(prev,next);
      const techDiffs=auditStepDiffsV570(prev.steps,next.steps);
      const matDiffs=auditOrderMaterialDiffsV570(prev.materials,next.materials);
      if(fieldDiffs.length)auditAdd('order_fields_changed','order',next.id,next.number,auditMainTextV571('Изменено в заказе',fieldDiffs),{diffs:fieldDiffs});
      if(techDiffs.length)auditAdd('technology_details_changed','order',next.id,next.number,auditMainTextV571('Изменена технология',techDiffs),{diffs:techDiffs});
      if(matDiffs.length)auditAdd('order_materials_changed','order',next.id,next.number,auditMainTextV571('Изменены материалы',matDiffs),{diffs:matDiffs});
    }
    const av=document.getElementById('appVersionBadge');if(av)av.textContent='v5.93.0 - Orders Modals';
  };
}

// In history cards show only one short clear line. Details are kept in meta for future export, but not duplicated visually.
if(typeof auditFor==='function'){
  auditListHtml=function(entity,entityId){
    const rows=auditFor(entity,entityId);if(!rows.length)return '<div class="audit-empty">Истории пока нет.</div>';
    return `<div class="audit-list">${rows.map(r=>`<div class="audit-item"><span class="audit-dot"></span><div><b>${escapeHtml(r.text)}</b><span>${escapeHtml(auditTime(r.at))} · ${escapeHtml(r.by||'—')}</span></div></div>`).join('')}</div>`;
  };
  auditListHtmlOrder=function(o){
    let rows=auditFor('order',o.id);if(!hasOrderTechnology(o.steps))rows=rows.filter(r=>r.type!=='technology');if(!rows.length)return '<div class="audit-empty">Истории пока нет.</div>';
    return `<div class="audit-list">${rows.map(r=>`<div class="audit-item"><span class="audit-dot"></span><div><b>${escapeHtml(r.text)}</b><span>${escapeHtml(auditTime(r.at))} · ${escapeHtml(r.by||'—')}</span></div></div>`).join('')}</div>`;
  };
}



/* v5.72: do not treat generated foam name as real name change */
function auditExtractArrowV572(diff){
  const text=String(diff||'');
  const i=text.indexOf(':');
  const body=i>=0?text.slice(i+1).trim():text;
  const parts=body.split('→');
  if(parts.length<2)return null;
  return {old:parts[0].trim(), next:parts.slice(1).join('→').trim()};
}
function auditIsFoamGeneratedNameDiffV572(nameDiff, gradeDiff){
  if(!nameDiff || !gradeDiff)return false;
  const n=auditExtractArrowV572(nameDiff);
  const g=auditExtractArrowV572(gradeDiff);
  if(!n || !g)return false;
  const oldName=String(n.old||'').trim();
  const newName=String(n.next||'').trim();
  const oldGrade=String(g.old||'').trim();
  const newGrade=String(g.next||'').trim();
  if(!oldGrade || !newGrade)return false;
  if(!/^Название\s*:/i.test(String(nameDiff)))return false;
  if(!/^(Марка\s*\/\s*плотность|Марка\s*\/\s*Плотность)\s*:/i.test(String(gradeDiff)))return false;
  const oldBase=oldName.replace(oldGrade,'').replace(/\s+/g,' ').trim();
  const newBase=newName.replace(newGrade,'').replace(/\s+/g,' ').trim();
  if(oldBase && oldBase===newBase)return true;
  return oldName.includes(oldGrade) && newName.includes(newGrade) && oldName.replace(oldGrade,'')===newName.replace(newGrade,'');
}
function auditCleanDiffsV572(diffs){
  const arr=(diffs||[]).filter(Boolean).map(String);
  const grade=arr.find(x=>/^(Марка\s*\/\s*плотность|Марка\s*\/\s*Плотность)\s*:/i.test(x));
  return arr.filter(x=>{
    if(/^Название\s*:/i.test(x) && auditIsFoamGeneratedNameDiffV572(x,grade))return false;
    return true;
  });
}
function auditMaterialFieldDiffsV571(prev,next){
  const diffs=[];
  if(!prev||!next)return diffs;
  auditPushDiffV570(diffs,'Артикул',prev.sku,next.sku);
  auditPushDiffV570(diffs,'Название',prev.name,next.name);
  auditPushDiffV570(diffs,'Категория',prev.category,next.category);
  auditPushDiffV570(diffs,'Подкатегория',prev.subcategory,next.subcategory);
  auditPushDiffV570(diffs,'Единица учёта',prev.unit,next.unit);
  auditPushDiffV570(diffs,'Остаток',prev.quantity,next.quantity);
  auditPushDiffV570(diffs,'Мин. остаток',prev.minQuantity,next.minQuantity);
  const ignore=new Set(['createdBy','createdAt','updatedBy','updatedAt','stockChangedBy','stockChangedAt','reservedQty','orderedQty','frozenQty','manualPurchaseOrders','purchaseStatus','purchaseNo','purchaseQty','pdfPath','pdfUrl','area']);
  const pa=prev.attributes||{}, na=next.attributes||{};
  Array.from(new Set([...Object.keys(pa),...Object.keys(na)])).sort().forEach(k=>{
    if(ignore.has(k))return;
    auditPushDiffV570(diffs,auditAttrLabelV570(k),pa[k],na[k]);
  });
  return auditCleanDiffsV572(diffs);
}
function auditMainTextV571(prefix,diffs){
  const arr=auditCleanDiffsV572(diffs||[]);
  if(!arr.length)return prefix;
  if(arr.length===1)return `${prefix}: ${arr[0]}`;
  return `${prefix}: ${auditJoinV570(arr,4)}`;
}
function auditDisplayTextV572(row){
  if(row && row.type==='material_fields_changed' && row.meta && Array.isArray(row.meta.diffs)){
    const diffs=auditCleanDiffsV572(row.meta.diffs);
    if(diffs.length)return auditMainTextV571('Изменено',diffs);
  }
  return row&&row.text?row.text:'';
}
if(typeof auditFor==='function'){
  auditListHtml=function(entity,entityId){
    const rows=auditFor(entity,entityId);if(!rows.length)return '<div class="audit-empty">Истории пока нет.</div>';
    return `<div class="audit-list">${rows.map(r=>`<div class="audit-item"><span class="audit-dot"></span><div><b>${escapeHtml(auditDisplayTextV572(r))}</b><span>${escapeHtml(auditTime(r.at))} · ${escapeHtml(r.by||'—')}</span></div></div>`).join('')}</div>`;
  };
  auditListHtmlOrder=function(o){
    let rows=auditFor('order',o.id);if(!hasOrderTechnology(o.steps))rows=rows.filter(r=>r.type!=='technology');if(!rows.length)return '<div class="audit-empty">Истории пока нет.</div>';
    return `<div class="audit-list">${rows.map(r=>`<div class="audit-item"><span class="audit-dot"></span><div><b>${escapeHtml(auditDisplayTextV572(r))}</b><span>${escapeHtml(auditTime(r.at))} · ${escapeHtml(r.by||'—')}</span></div></div>`).join('')}</div>`;
  };
}

const __renderAllV570=renderAll;
renderAll=function(){__renderAllV570();const av=document.getElementById('appVersionBadge');if(av)av.textContent='v5.93.0 - Orders Modals';}

/* v5.73: material creator/date audit fallback and migration */

function auditMaterialFallbackFromHistoryV573(m){
  const rows = (typeof auditFor === 'function') ? auditFor('material', m && m.id) : [];
  const oldest = rows.length ? rows[rows.length - 1] : null;
  const createRow = [...rows].reverse().find(r =>
    r && (
      r.type === 'material_create' ||
      /материал.+(добавлен|создан)/i.test(String(r.text || ''))
    )
  );
  return {
    by: (createRow && createRow.by) || (oldest && oldest.by) || '',
    at: (createRow && createRow.at) || (oldest && oldest.at) || ''
  };
}

function ensureMaterialAuditMetaV573(m, options = {}){
  if(!m) return m;
  m.attributes = m.attributes || {};
  const a = m.attributes;
  const hist = auditMaterialFallbackFromHistoryV573(m);
  const now = (typeof auditNow === 'function') ? auditNow() : new Date().toISOString();
  const actor = (typeof actorName === 'function') ? actorName() : ((currentUser && currentUser.email) || 'Неизвестный пользователь');

  let changed = false;

  if(!a.createdBy){
    a.createdBy = hist.by || a.updatedBy || a.stockChangedBy || actor;
    changed = true;
  }
  if(!a.createdAt){
    a.createdAt = hist.at || a.updatedAt || a.stockChangedAt || m.createdAt || m.lastUpdated || now;
    changed = true;
  }
  if(!a.updatedBy){
    a.updatedBy = a.stockChangedBy || a.createdBy || actor;
    changed = true;
  }
  if(!a.updatedAt){
    a.updatedAt = a.stockChangedAt || a.createdAt || now;
    changed = true;
  }

  if(options.persist && changed && typeof materialToDb === 'function' && supabaseClient && m.id){
    // Silent one-time migration for old materials.
    try{
      supabaseClient.from('materials').update(materialToDb(m)).eq('id', m.id).then(()=>{}).catch(()=>{});
    }catch(e){}
  }
  return m;
}

if(typeof dbToMaterial === 'function'){
  const __dbToMaterialV573 = dbToMaterial;
  dbToMaterial = function(row){
    const m = __dbToMaterialV573(row);
    if(row && row.created_at && !m.createdAt) m.createdAt = row.created_at;
    return ensureMaterialAuditMetaV573(m);
  };
}

if(typeof loadMaterialsFromSupabase === 'function'){
  const __loadMaterialsFromSupabaseV573 = loadMaterialsFromSupabase;
  loadMaterialsFromSupabase = async function(){
    await __loadMaterialsFromSupabaseV573();
    if(Array.isArray(data && data.materials)){
      data.materials.forEach(m => ensureMaterialAuditMetaV573(m));
    }
    const av=document.getElementById('appVersionBadge');
    if(av) av.textContent = APP_VERSION;
  };
}

if(typeof insertMaterialToSupabase === 'function'){
  const __insertMaterialV573 = insertMaterialToSupabase;
  insertMaterialToSupabase = async function(m){
    const now = (typeof auditNow === 'function') ? auditNow() : new Date().toISOString();
    const actor = (typeof actorName === 'function') ? actorName() : ((currentUser && currentUser.email) || 'Неизвестный пользователь');
    m.attributes = m.attributes || {};
    m.attributes.createdBy = m.attributes.createdBy || actor;
    m.attributes.createdAt = m.attributes.createdAt || now;
    m.attributes.updatedBy = actor;
    m.attributes.updatedAt = now;
    return await __insertMaterialV573(m);
  };
}

if(typeof updateMaterialInSupabase === 'function'){
  const __updateMaterialV573 = updateMaterialInSupabase;
  updateMaterialInSupabase = async function(m){
    const actor = (typeof actorName === 'function') ? actorName() : ((currentUser && currentUser.email) || 'Неизвестный пользователь');
    const now = (typeof auditNow === 'function') ? auditNow() : new Date().toISOString();
    m.attributes = m.attributes || {};
    ensureMaterialAuditMetaV573(m);
    m.attributes.updatedBy = actor;
    m.attributes.updatedAt = now;
    return await __updateMaterialV573(m);
  };
}

if(typeof materialProfileHtml === 'function'){
  materialProfileHtml = function(m){
    ensureMaterialAuditMetaV573(m, {persist:true});
    const a=m.attributes||{};
    return `<div class="audit-profile-grid"><div class="audit-card"><h5>Профиль материала</h5><div class="audit-kv"><span>Добавил материал</span><b>${escapeHtml(a.createdBy||'—')}</b></div><div class="audit-kv"><span>Дата добавления</span><b>${escapeHtml(a.createdAt?auditTime(a.createdAt):'—')}</b></div><div class="audit-kv"><span>Последнее движение</span><b>${escapeHtml(a.stockChangedBy||a.updatedBy||'—')}</b></div><div class="audit-kv"><span>Последнее изменение</span><b>${escapeHtml(a.updatedAt?auditTime(a.updatedAt):'—')}</b></div></div><div class="audit-card"><h5>История материала</h5>${auditListHtml('material',m.id)}</div></div>`;
  };
}

if(typeof openMaterialDetails === 'function'){
  const __openMaterialDetailsV573 = openMaterialDetails;
  openMaterialDetails = function(id){
    const m = data.materials.find(x=>String(x.id)===String(id));
    if(m) ensureMaterialAuditMetaV573(m, {persist:true});
    return __openMaterialDetailsV573(id);
  };
}

if(typeof renderAll === 'function'){
  const __renderAllV573 = renderAll;
  renderAll = function(){
    if(Array.isArray(data && data.materials)) data.materials.forEach(m=>ensureMaterialAuditMetaV573(m));
    __renderAllV573();
    const av=document.getElementById('appVersionBadge');
    if(av) av.textContent = APP_VERSION;
  };
}

/* v5.74: precise purchase audit history */

window.__suppressGenericMaterialUpdateAuditV574 = false;

if(typeof auditAdd === 'function'){
  const __auditAddV574 = auditAdd;
  auditAdd = function(type, entity, entityId, title, text, meta){
    if(window.__suppressGenericMaterialUpdateAuditV574 && entity === 'material' && type === 'material_update'){
      return null;
    }
    return __auditAddV574(type, entity, entityId, title, text, meta);
  };
}

function auditQtyChangeTextV574(label, oldQty, newQty, unit){
  return `${label}: ${qtyWithUnit(Number(oldQty||0), unit||'шт')} → ${qtyWithUnit(Number(newQty||0), unit||'шт')}`;
}
function materialShortNameV574(m){
  return (m && (m.sku || m.name || materialTitle(m))) || 'материал';
}
function orderShortNameV574(o){
  return (o && (o.number || o.id)) || 'заказ';
}

if(typeof setMaterialOrderedQty === 'function'){
  setMaterialOrderedQty = function(id){
    const m=data.materials.find(x=>String(x.id)===String(id));
    if(!m){toast(t('notFoundMaterial'));return;}
    const unit=m.unit||'шт';
    const q=normalizeStockValue(document.getElementById('detailOrderedQty')?.value||0,unit,true);
    if(q===null){toast(unit==='шт'?t('fieldWhole'):t('fieldMinZero'));return;}

    const oldAttrs={...(m.attributes||{})};
    const oldOrdered=orderedManualQty(m);
    const oldAlloc=(oldAttrs.manualPurchaseOrders||[]).length;

    m.attributes=m.attributes||{};
    m.attributes.orderedQty=q;
    m.attributes.manualPurchaseOrders=buildManualPurchaseAllocations(m,q);
    m.attributes.purchaseStatus=q>0?'ordered':(stockNeededToOrderQty(m)>0?'needorder':'instock');
    m.lastUpdated=today();

    window.__suppressGenericMaterialUpdateAuditV574 = true;
    updateMaterialInSupabase(m).then(async ok=>{
      window.__suppressGenericMaterialUpdateAuditV574 = false;
      if(!ok){m.attributes=oldAttrs;return;}

      const newAlloc=(m.attributes.manualPurchaseOrders||[]).length;
      const main = q>0
        ? auditQtyChangeTextV574('Заказано поставщику', oldOrdered, q, unit)
        : auditQtyChangeTextV574('Заказ поставщику сброшен', oldOrdered, 0, unit);
      const extra = q>0 && newAlloc ? ` · привязано к заказам: ${newAlloc}` : '';
      auditAdd('material_purchase_manual','material',m.id,m.sku||m.name,`${main}${extra}`,{
        diffs:[main, `Заказы: ${oldAlloc} → ${newAlloc}`]
      });

      await loadMaterialsFromSupabase();
      renderAll();
      openMaterialDetails(id);
      const linked=m.attributes.manualPurchaseOrders?.length?` · заказов: ${m.attributes.manualPurchaseOrders.length}`:'';
      toast(q>0?`Заказано ${qtyWithUnit(q,unit)}${linked}`:'Заказанное сброшено');
    }).catch(err=>{
      window.__suppressGenericMaterialUpdateAuditV574 = false;
      m.attributes=oldAttrs;
      console.error(err);
      toast('Ошибка обновления');
    });
  };
}

if(typeof saveOrderMaterialPurchase === 'function'){
  saveOrderMaterialPurchase = function(orderId,materialId,opts={}){
    const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));
    if(!o)return;
    const item=orderMaterials(o).find(i=>String(i.materialId)===String(materialId));
    const m=data.materials.find(x=>String(x.id)===String(materialId));
    if(!item||!m)return;
    const unit=m.unit||item.unit||'шт';
    const q=normalizeStockValue(document.getElementById('singlePurchaseQty')?.value||0,unit,true);
    if(q===null || q<=0){toast(unit==='шт'?t('fieldWhole'):t('fieldMinZero'));return;}

    const oldStatus=item.purchaseStatus||'none';
    const oldQty=stockNumForUnit(item.purchaseQty||0,unit);
    const oldNo=item.purchaseNo||'';
    const newNo=document.getElementById('singlePurchaseNo')?.value?.trim()||'';

    item.purchaseStatus='ordered';
    item.purchaseQty=q;
    item.purchaseNo=newNo;
    o.status=calcOrderAutoStatus(o);
    save();

    const qtyDiff=auditQtyChangeTextV574('Заказано поставщику', oldQty, q, unit);
    const noDiff = oldNo!==newNo ? `№ закупки / поставщик: ${auditCleanValV570(oldNo)} → ${auditCleanValV570(newNo)}` : '';
    const statusDiff = oldStatus!=='ordered' ? `Статус закупки: ${auditCleanValV570(oldStatus)} → Заказано` : '';
    const diffs=[qtyDiff,statusDiff,noDiff].filter(Boolean);
    auditAdd('purchase','order',o.id,o.number,`Материал ${materialShortNameV574(m)} заказан: ${qtyWithUnit(q,unit)}`,{diffs});
    auditAdd('purchase','material',m.id,m.sku||m.name,`Заказано для ${orderShortNameV574(o)}: ${qtyWithUnit(q,unit)}`,{diffs});

    renderAll();
    if(opts.clear){
      const qty=document.getElementById('singlePurchaseQty');
      const no=document.getElementById('singlePurchaseNo');
      if(qty)qty.value='';
      if(no)no.value='';
    }
    if(opts.close===false){
      openOrderMaterialPurchase(orderId,materialId);
    }else{
      closeModal();
    }
    toast(opts.toastText||'Закупка обновлена');
  };
}

if(typeof receiveOrderMaterialPurchase === 'function'){
  const __receiveOrderMaterialV574 = receiveOrderMaterialPurchase;
  receiveOrderMaterialPurchase = async function(orderId,materialId){
    const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));
    const item=o?orderMaterials(o).find(i=>String(i.materialId)===String(materialId)):null;
    const m=data.materials.find(x=>String(x.id)===String(materialId));
    const unit=m?.unit||item?.unit||'шт';
    const qty=stockNumForUnit(orderItemPurchaseQty(item||{},0),unit);
    window.__suppressGenericMaterialUpdateAuditV574 = true;
    const res = await __receiveOrderMaterialV574(orderId,materialId);
    window.__suppressGenericMaterialUpdateAuditV574 = false;
    if(o&&m&&qty>0){
      auditAdd('receive','order',o.id,o.number,`Материал ${materialShortNameV574(m)} принят: +${qtyWithUnit(qty,unit)}`);
      auditAdd('receive','material',m.id,m.sku||m.name,`Поступление по ${orderShortNameV574(o)}: +${qtyWithUnit(qty,unit)}`);
    }
    return res;
  };
}

if(typeof cancelOrderMaterialPurchase === 'function'){
  cancelOrderMaterialPurchase = function(orderId,materialId){
    const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));
    const item=o?orderMaterials(o).find(i=>String(i.materialId)===String(materialId)):null;
    const m=data.materials.find(x=>String(x.id)===String(materialId));
    if(!item)return;
    const unit=m?.unit||item.unit||'шт';
    const oldQty=stockNumForUnit(item.purchaseQty||0,unit);
    const oldNo=item.purchaseNo||'';
    item.purchaseStatus='need';
    item.purchaseQty=0;
    item.purchaseNo='';
    o.status=calcOrderAutoStatus(o);
    save();
    const diff=auditQtyChangeTextV574('Заказ поставщику отменён', oldQty, 0, unit);
    const diffs=[diff, oldNo?`№ закупки / поставщик: ${auditCleanValV570(oldNo)} → —`:null].filter(Boolean);
    if(o)auditAdd('purchase_cancel','order',o.id,o.number,`Закупка материала ${materialShortNameV574(m)} отменена`,{diffs});
    if(m)auditAdd('purchase_cancel','material',m.id,m.sku||m.name,`Закупка для ${orderShortNameV574(o)} отменена: ${qtyWithUnit(oldQty,unit)} → 0 ${unitLabel(unit)}`,{diffs});
    renderAll();
    openOrderMaterialPurchase(orderId,materialId);
    toast('Заказ поставщику отменён');
  };
}

if(typeof auditDisplayTextV572 === 'function'){
  const __auditDisplayTextV574 = auditDisplayTextV572;
  auditDisplayTextV572 = function(row){
    if(row && row.type==='material_update' && /^Материал\s+.+\s+изменён$/i.test(String(row.text||''))){
      return 'Материал изменён';
    }
    return __auditDisplayTextV574(row);
  };
}

if(typeof renderAll === 'function'){
  const __renderAllV574 = renderAll;
  renderAll = function(){
    __renderAllV574();
    const av=document.getElementById('appVersionBadge');
    if(av) av.textContent = APP_VERSION;
  };
}

/* v5.75: simple ordered audit text */

function auditSimpleOrderedTextV575(qty, unit){
  return `Заказано: ${qtyWithUnit(Number(qty||0), unit||'шт')}`;
}
function auditSimpleCancelOrderedTextV575(qty, unit){
  return `Заказ отменён: ${qtyWithUnit(Number(qty||0), unit||'шт')}`;
}
function auditParseOrderedArrowV575(text){
  const s=String(text||'');
  const m=s.match(/Заказано\s+поставщику:\s*[^→]+→\s*([^·;]+)/i);
  if(m && m[1]) return `Заказано: ${m[1].trim()}`;
  return null;
}

if(typeof setMaterialOrderedQty === 'function'){
  setMaterialOrderedQty = function(id){
    const m=data.materials.find(x=>String(x.id)===String(id));
    if(!m){toast(t('notFoundMaterial'));return;}
    const unit=m.unit||'шт';
    const q=normalizeStockValue(document.getElementById('detailOrderedQty')?.value||0,unit,true);
    if(q===null){toast(unit==='шт'?t('fieldWhole'):t('fieldMinZero'));return;}

    const oldAttrs={...(m.attributes||{})};
    const oldOrdered=orderedManualQty(m);
    const oldAlloc=(oldAttrs.manualPurchaseOrders||[]).length;

    m.attributes=m.attributes||{};
    m.attributes.orderedQty=q;
    m.attributes.manualPurchaseOrders=buildManualPurchaseAllocations(m,q);
    m.attributes.purchaseStatus=q>0?'ordered':(stockNeededToOrderQty(m)>0?'needorder':'instock');
    m.lastUpdated=today();

    window.__suppressGenericMaterialUpdateAuditV574 = true;
    updateMaterialInSupabase(m).then(async ok=>{
      window.__suppressGenericMaterialUpdateAuditV574 = false;
      if(!ok){m.attributes=oldAttrs;return;}

      const newAlloc=(m.attributes.manualPurchaseOrders||[]).length;
      const text = q>0 ? auditSimpleOrderedTextV575(q, unit) : auditSimpleCancelOrderedTextV575(oldOrdered, unit);
      const diffs = q>0
        ? [`Количество: ${qtyWithUnit(oldOrdered,unit)} → ${qtyWithUnit(q,unit)}`, `Заказы: ${oldAlloc} → ${newAlloc}`]
        : [`Количество: ${qtyWithUnit(oldOrdered,unit)} → ${qtyWithUnit(0,unit)}`];
      auditAdd('material_purchase_manual','material',m.id,m.sku||m.name,text,{diffs});

      await loadMaterialsFromSupabase();
      renderAll();
      openMaterialDetails(id);
      const linked=m.attributes.manualPurchaseOrders?.length?` · заказов: ${m.attributes.manualPurchaseOrders.length}`:'';
      toast(q>0?`Заказано ${qtyWithUnit(q,unit)}${linked}`:'Заказанное сброшено');
    }).catch(err=>{
      window.__suppressGenericMaterialUpdateAuditV574 = false;
      m.attributes=oldAttrs;
      console.error(err);
      toast('Ошибка обновления');
    });
  };
}

if(typeof saveOrderMaterialPurchase === 'function'){
  saveOrderMaterialPurchase = function(orderId,materialId,opts={}){
    const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));
    if(!o)return;
    const item=orderMaterials(o).find(i=>String(i.materialId)===String(materialId));
    const m=data.materials.find(x=>String(x.id)===String(materialId));
    if(!item||!m)return;
    const unit=m.unit||item.unit||'шт';
    const q=normalizeStockValue(document.getElementById('singlePurchaseQty')?.value||0,unit,true);
    if(q===null || q<=0){toast(unit==='шт'?t('fieldWhole'):t('fieldMinZero'));return;}

    const oldStatus=item.purchaseStatus||'none';
    const oldQty=stockNumForUnit(item.purchaseQty||0,unit);
    const oldNo=item.purchaseNo||'';
    const newNo=document.getElementById('singlePurchaseNo')?.value?.trim()||'';

    item.purchaseStatus='ordered';
    item.purchaseQty=q;
    item.purchaseNo=newNo;
    o.status=calcOrderAutoStatus(o);
    save();

    const qtyDiff=`Количество: ${qtyWithUnit(oldQty,unit)} → ${qtyWithUnit(q,unit)}`;
    const noDiff = oldNo!==newNo ? `№ закупки / поставщик: ${auditCleanValV570(oldNo)} → ${auditCleanValV570(newNo)}` : '';
    const statusDiff = oldStatus!=='ordered' ? `Статус закупки: ${auditCleanValV570(oldStatus)} → Заказано` : '';
    const diffs=[qtyDiff,statusDiff,noDiff].filter(Boolean);
    auditAdd('purchase','order',o.id,o.number,`Материал ${materialShortNameV574(m)} заказан: ${qtyWithUnit(q,unit)}`,{diffs});
    auditAdd('purchase','material',m.id,m.sku||m.name,auditSimpleOrderedTextV575(q,unit),{diffs});

    renderAll();
    if(opts.clear){
      const qty=document.getElementById('singlePurchaseQty');
      const no=document.getElementById('singlePurchaseNo');
      if(qty)qty.value='';
      if(no)no.value='';
    }
    if(opts.close===false){
      openOrderMaterialPurchase(orderId,materialId);
    }else{
      closeModal();
    }
    toast(opts.toastText||'Закупка обновлена');
  };
}

if(typeof cancelOrderMaterialPurchase === 'function'){
  cancelOrderMaterialPurchase = function(orderId,materialId){
    const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));
    const item=o?orderMaterials(o).find(i=>String(i.materialId)===String(materialId)):null;
    const m=data.materials.find(x=>String(x.id)===String(materialId));
    if(!item)return;
    const unit=m?.unit||item.unit||'шт';
    const oldQty=stockNumForUnit(item.purchaseQty||0,unit);
    const oldNo=item.purchaseNo||'';
    item.purchaseStatus='need';
    item.purchaseQty=0;
    item.purchaseNo='';
    o.status=calcOrderAutoStatus(o);
    save();
    const diffs=[`Количество: ${qtyWithUnit(oldQty,unit)} → ${qtyWithUnit(0,unit)}`, oldNo?`№ закупки / поставщик: ${auditCleanValV570(oldNo)} → —`:null].filter(Boolean);
    if(o)auditAdd('purchase_cancel','order',o.id,o.number,`Закупка материала ${materialShortNameV574(m)} отменена`,{diffs});
    if(m)auditAdd('purchase_cancel','material',m.id,m.sku||m.name,auditSimpleCancelOrderedTextV575(oldQty,unit),{diffs});
    renderAll();
    openOrderMaterialPurchase(orderId,materialId);
    toast('Заказ поставщику отменён');
  };
}

if(typeof auditDisplayTextV572 === 'function'){
  const __auditDisplayTextV575 = auditDisplayTextV572;
  auditDisplayTextV572 = function(row){
    const parsed = auditParseOrderedArrowV575(row && row.text);
    if(parsed) return parsed;
    return __auditDisplayTextV575(row);
  };
}

if(typeof renderAll === 'function'){
  const __renderAllV575 = renderAll;
  renderAll = function(){
    __renderAllV575();
    const av=document.getElementById('appVersionBadge');
    if(av) av.textContent = APP_VERSION;
  };
}

/* v5.76: clean material history for order changes */

function auditIsGenericMaterialUpdateV576(row){
  if(!row) return false;
  const txt = String(row.text||'').trim();
  return row.entity === 'material' && row.type === 'material_update' && /^Материал\s+.+\s+изменён$/i.test(txt);
}
function auditIsGenericOrderUpdateV576(row){
  if(!row) return false;
  const txt = String(row.text||'').trim();
  return row.entity === 'order' && row.type === 'order_update' && /^Заказ\s+.+\s+изменён$/i.test(txt);
}
function auditVisibleRowsV576(entity, entityId){
  let rows = auditFor(entity, entityId) || [];
  return rows.filter(r => !auditIsGenericMaterialUpdateV576(r) && !auditIsGenericOrderUpdateV576(r));
}
function auditMaterialLabelV576(m){
  if(!m) return 'материал';
  return m.sku || m.name || 'материал';
}
function auditOrderLabelV576(o){
  return (o && o.number) ? o.number : 'заказ';
}
function auditOrderMaterialRowsV576(order){
  return (orderMaterials(order)||[]).map(x => ({
    materialId: String(x.materialId||''),
    qty: Number(x.qty||0),
    perUnitQty: Number(x.perUnitQty||0),
    unit: x.unit || ((data.materials||[]).find(m=>String(m.id)===String(x.materialId))||{}).unit || ''
  }));
}
function auditOrderMaterialChangesForMaterialsV576(prev,next){
  const oldRows = auditOrderMaterialRowsV576(prev||{});
  const newRows = auditOrderMaterialRowsV576(next||{});
  const ids = Array.from(new Set([...oldRows.map(x=>x.materialId), ...newRows.map(x=>x.materialId)])).filter(Boolean);
  const orderNo = auditOrderLabelV576(next||prev);
  ids.forEach(id=>{
    const before = oldRows.find(x=>x.materialId===id);
    const after = newRows.find(x=>x.materialId===id);
    const m = (data.materials||[]).find(x=>String(x.id)===String(id));
    const unit = (after&&after.unit) || (before&&before.unit) || (m&&m.unit) || '';
    if(!before && after){
      auditAdd('material_order_link','material',id,auditMaterialLabelV576(m),`Добавлен в заказ ${orderNo}: ${qtyWithUnit(after.qty,unit)}`);
      return;
    }
    if(before && !after){
      auditAdd('material_order_unlink','material',id,auditMaterialLabelV576(m),`Удалён из заказа ${orderNo}: ${qtyWithUnit(before.qty,unit)}`);
      return;
    }
    if(before && after && Number(before.qty||0)!==Number(after.qty||0)){
      auditAdd('material_order_qty','material',id,auditMaterialLabelV576(m),`Изменено в заказе ${orderNo}: ${qtyWithUnit(before.qty,unit)} → ${qtyWithUnit(after.qty,unit)}`);
    }
  });
}

if(typeof saveOrder === 'function'){
  const __saveOrderV576 = saveOrder;
  saveOrder = async function(id=''){
    const prev = id ? auditCloneV570((data.orders||[]).find(o=>String(o.id)===String(id))) : null;
    const result = await __saveOrderV576(id);
    const next = id ? auditCloneV570((data.orders||[]).find(o=>String(o.id)===String(id))) : auditCloneV570((data.orders||[])[(data.orders||[]).length-1]);
    if(prev && next){
      try{ auditOrderMaterialChangesForMaterialsV576(prev,next); }catch(e){ console.warn('material order audit skipped', e); }
    }
    return result;
  };
}

// Hide empty generic rows and keep history readable.
if(typeof auditFor === 'function'){
  auditListHtml = function(entity, entityId){
    const rows = auditVisibleRowsV576(entity, entityId);
    if(!rows.length) return '<div class="audit-empty">Истории пока нет.</div>';
    return `<div class="audit-list">${rows.map(r=>`<div class="audit-item"><span class="audit-dot"></span><div><b>${escapeHtml(auditDisplayTextV572(r))}</b><span>${escapeHtml(auditTime(r.at))} · ${escapeHtml(r.by||'—')}</span></div></div>`).join('')}</div>`;
  };
  auditListHtmlOrder = function(o){
    let rows = auditVisibleRowsV576('order', o.id);
    if(!hasOrderTechnology(o.steps)) rows = rows.filter(r=>r.type!=='technology');
    if(!rows.length) return '<div class="audit-empty">Истории пока нет.</div>';
    return `<div class="audit-list">${rows.map(r=>`<div class="audit-item"><span class="audit-dot"></span><div><b>${escapeHtml(auditDisplayTextV572(r))}</b><span>${escapeHtml(auditTime(r.at))} · ${escapeHtml(r.by||'—')}</span></div></div>`).join('')}</div>`;
  };
}

if(typeof renderAll === 'function'){
  const __renderAllV576 = renderAll;
  renderAll = function(){
    __renderAllV576();
    const av=document.getElementById('appVersionBadge');
    if(av) av.textContent = APP_VERSION;
  };
}

/* v5.77: full site history / audit tree */
(function(){
  const VERSION='v5.93.4 - Mobile Menu Close Button';
  const oldApply=window.applyI18n;
  if(typeof oldApply==='function'){
    window.applyI18n=function(){ oldApply(); localizeHistoryUI(); const av=document.getElementById('appVersionBadge'); if(av) av.textContent=VERSION; };
  }
  const oldRenderAll=window.renderAll;
  if(typeof oldRenderAll==='function'){
    window.renderAll=function(){ oldRenderAll(); injectHistoryUI(); renderSiteHistory(); const av=document.getElementById('appVersionBadge'); if(av) av.textContent=VERSION; };
  }
  const oldAuditAdd=window.auditAdd;
  if(typeof oldAuditAdd==='function'){
    window.auditAdd=function(){ const r=oldAuditAdd.apply(this,arguments); try{renderSiteHistory();}catch(e){} return r; };
  }
})();
