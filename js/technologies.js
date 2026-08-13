// MOLM — «Технологии»: переиспользуемые шаблоны операций+материалов, снятые с заказа.
// Хранятся в отдельной таблице Supabase (public.technologies), полностью независимой от
// таблицы materials и её «скрытых» строк-синков заказов/аудита — эта фича физически не может
// затронуть склад или заказы, т.к. не читает и не пишет в те же строки/таблицы.
(function(){

  if(!Array.isArray(window.data?.technologies))window.data = window.data || {}; // на случай раннего вызова
  if(typeof data!=='undefined' && !Array.isArray(data.technologies))data.technologies=[];

  function technologyToDb(tc){
    return {
      name: tc.name||'',
      product: tc.product||'',
      source_order_number: tc.sourceOrderNumber||'',
      steps: Array.isArray(tc.steps)?tc.steps:[],
      materials: Array.isArray(tc.materials)?tc.materials:[],
      updated_at: new Date().toISOString(),
      created_by: tc.createdBy||''
    };
  }
  function dbToTechnology(row){
    return {
      id: row.id,
      name: row.name||'',
      product: row.product||'',
      sourceOrderNumber: row.source_order_number||'',
      steps: Array.isArray(row.steps)?row.steps:[],
      materials: Array.isArray(row.materials)?row.materials:[],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by||''
    };
  }

  async function loadTechnologiesFromSupabase(){
    if(typeof isLoggedIn==='function'&&!isLoggedIn())return;
    if(typeof supabaseClient==='undefined'||!supabaseClient)return;
    const {data:rows,error}=await supabaseClient.from('technologies').select('*').order('created_at',{ascending:false});
    if(error){console.error('Technologies load failed',error);return}
    data.technologies=(rows||[]).map(dbToTechnology);
  }

  async function insertTechnologyToSupabase(tc){
    if(typeof requireAuth==='function'&&!requireAuth())return false;
    const {data:rows,error}=await supabaseClient.from('technologies').insert(technologyToDb(tc)).select('id');
    if(error){console.error('Technology insert failed',error);toast(t('technologySaveError'));return false}
    tc.id=rows?.[0]?.id;
    return true;
  }
  async function updateTechnologyInSupabase(tc){
    if(typeof requireAuth==='function'&&!requireAuth())return false;
    const {error}=await supabaseClient.from('technologies').update(technologyToDb(tc)).eq('id',tc.id);
    if(error){console.error('Technology update failed',error);toast(t('technologySaveError'));return false}
    return true;
  }
  async function deleteTechnologyFromSupabase(id){
    if(typeof requireAuth==='function'&&!requireAuth())return false;
    const {error}=await supabaseClient.from('technologies').delete().eq('id',id);
    if(error){console.error('Technology delete failed',error);toast(t('technologyDeleteError'));return false}
    return true;
  }

  // ---------- список / поиск ----------
  let technologySearchQuery='';
  function updateTechnologySearch(value){technologySearchQuery=String(value||'');renderTechnologies()}
  function filteredTechnologies(){
    const q=technologySearchQuery.trim().toLowerCase();
    const list=(data.technologies||[]).slice();
    if(!q)return list;
    return list.filter(tc=>[tc.name,tc.product,tc.sourceOrderNumber].some(v=>String(v||'').toLowerCase().includes(q)));
  }
  function technologyCardHtml(tc){
    const created=tc.createdAt?new Date(tc.createdAt).toLocaleDateString(currentLang==='ru'?'ru-RU':currentLang==='lv'?'lv-LV':'en-GB'):'';
    return `<article class="technology-card" onclick="openTechnologyDetail('${tc.id}')">
      <div class="technology-card-head"><h3>${escapeHtml(tc.name)}</h3><button class="iconbtn" type="button" aria-label="${escapeHtml(u42('delete'))}" onclick="event.stopPropagation();deleteTechnology('${tc.id}')">×</button></div>
      ${tc.product?`<div class="technology-card-sub">${escapeHtml(tc.product)}</div>`:''}
      <div class="technology-card-stats"><div><small>${escapeHtml(t('totalOperations'))}</small><b>${(tc.steps||[]).length}</b></div><div><small>${escapeHtml(t('materialsCount'))}</small><b>${(tc.materials||[]).length}</b></div></div>
      <div class="technology-card-foot"><span>${tc.sourceOrderNumber?escapeHtml(tc.sourceOrderNumber)+' · ':''}${escapeHtml(created)}</span></div>
    </article>`;
  }
  function renderTechnologies(){
    const box=document.getElementById('technologiesList');if(!box)return;
    const countEl=document.getElementById('technologiesCount');if(countEl)countEl.textContent=String((data.technologies||[]).length);
    const rows=filteredTechnologies();
    if(!rows.length){box.innerHTML=`<div class="empty"><b>${escapeHtml(t('noTechnologies'))}</b>${escapeHtml(t('noTechnologiesHint'))}</div>`;return}
    box.innerHTML=`<div class="technology-card-grid">${rows.map(technologyCardHtml).join('')}</div>`;
  }

  // ---------- деталка (только просмотр) ----------
  function technologyDetailBody(tc){
    const stepsHtml=(tc.steps||[]).length?`<table class="order-tech-table"><thead><tr><th>${escapeHtml(t('operationStage'))}</th><th>${escapeHtml(t('timePerItem'))}</th><th>${escapeHtml(t('responsibleOptional'))}</th></tr></thead><tbody>${tc.steps.map(s=>`<tr><td>${escapeHtml(typeof workshopLabel==='function'?workshopLabel(s.name||''):(s.name||''))}</td><td>${Number(s.minutes||0)} ${escapeHtml(t('minutesShort'))}</td><td>${escapeHtml(s.responsible||'—')}</td></tr>`).join('')}</tbody></table>`:`<div class="order-tech-empty">${escapeHtml(t('techOperationsHint'))}</div>`;
    const matsHtml=(tc.materials||[]).length?`<table class="order-tech-table"><thead><tr><th>${escapeHtml(u42('material'))}</th><th>Цех</th><th>${escapeHtml(u42('perOne'))}</th></tr></thead><tbody>${tc.materials.map(item=>{const m=(data.materials||[]).find(x=>String(x.id)===String(item.materialId));return `<tr><td>${escapeHtml(m?materialTitle(m):(item.category||'—'))}</td><td>${escapeHtml(typeof workshopLabel==='function'?workshopLabel(item.workshop||''):(item.workshop||''))}</td><td>${Number(item.perUnitQty||0)} ${escapeHtml(item.unit||'')}</td></tr>`}).join('')}</tbody></table>`:`<div class="order-tech-empty">${escapeHtml(t('noTechnologyMaterials'))}</div>`;
    return `<div class="technology-detail"><section class="order-tech-card"><h4>${escapeHtml(t('techOperations'))}</h4>${stepsHtml}</section><section class="order-tech-card"><h4>${escapeHtml(t('technologyMaterials'))}</h4>${matsHtml}</section></div>`;
  }
  function openTechnologyDetail(id){
    const tc=(data.technologies||[]).find(x=>String(x.id)===String(id));if(!tc)return;
    openModal(tc.name||t('createTechnologyTitle'),technologyDetailBody(tc),`<button class="btn" type="button" onclick="closeModal()">${escapeHtml(u42('close'))}</button><button class="btn danger" type="button" onclick="closeModal();deleteTechnology('${tc.id}')">${escapeHtml(u42('delete'))}</button>`);
  }

  async function deleteTechnology(id){
    if(!confirm(t('confirmDeleteTechnology')))return;
    const ok=await deleteTechnologyFromSupabase(id);
    if(!ok)return;
    data.technologies=(data.technologies||[]).filter(x=>String(x.id)!==String(id));
    toast(t('technologyDeleted'));
    renderTechnologies();
  }

  // ---------- создание технологии из заказа ----------
  function technologyPreviewHtml(o){
    if(!o)return `<div class="order-tech-empty">${escapeHtml(t('chooseOrderHint'))}</div>`;
    const steps=(typeof orderSteps==='function'?orderSteps(o):[]);
    const mats=(typeof orderMaterials==='function'?orderMaterials(o):[]);
    if(!steps.length&&!mats.length)return `<div class="order-tech-empty">${escapeHtml(t('noTechnologyDataInOrder'))}</div>`;
    return `<div class="tech-create-counts"><div><small>${escapeHtml(t('totalOperations'))}</small><b>${steps.length}</b></div><div><small>${escapeHtml(t('materialsCount'))}</small><b>${mats.length}</b></div></div>`;
  }
  function refreshTechCreatePreview(){
    const id=document.getElementById('techCreateOrderSelect')?.value||'';
    const o=(data.orders||[]).find(x=>String(x.id)===String(id));
    const box=document.getElementById('techCreatePreview');if(box)box.innerHTML=technologyPreviewHtml(o);
    const nameInput=document.getElementById('techCreateName');
    if(nameInput&&!nameInput.value.trim()&&o)nameInput.value=o.product||o.number||'';
  }
  function createTechnologyModalBody(orderId=''){
    const orders=(data.orders||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    const selected=orderId?orders.find(o=>String(o.id)===String(orderId)):null;
    let pickField;
    if(orderId){
      pickField=`<div class="field"><label>${escapeHtml(t('sourceOrder'))}</label><div class="readonly-pill">${escapeHtml(selected?.number||'')}${selected?.product?' · '+escapeHtml(selected.product):''}</div></div><input type="hidden" id="techCreateOrderSelect" value="${escapeHtml(orderId)}">`;
    }else{
      const optionsHtml=orders.map(o=>`<option value="${o.id}">${escapeHtml(o.number||'')}${o.product?' · '+escapeHtml(o.product):''}${o.client?' · '+escapeHtml(o.client):''}</option>`).join('');
      pickField=`<div class="field"><label>${escapeHtml(t('sourceOrder'))}</label><select class="select" id="techCreateOrderSelect" onchange="refreshTechCreatePreview()"><option value="">${escapeHtml(t('chooseOrder'))}</option>${optionsHtml}</select></div>`;
    }
    const nameDefault=selected?(selected.product||selected.number||''):'';
    return `<div class="tech-create-form">${pickField}<div class="field"><label>${escapeHtml(t('technologyName'))}</label><input class="input" id="techCreateName" value="${escapeHtml(nameDefault)}" placeholder="${escapeHtml(t('technologyNamePlaceholder'))}"></div><div class="tech-create-preview" id="techCreatePreview">${technologyPreviewHtml(selected)}</div></div>`;
  }
  function openCreateTechnologyModal(orderId=''){
    if(typeof requireAuth==='function'&&!requireAuth())return;
    const body=createTechnologyModalBody(orderId);
    openModal(t('createTechnologyTitle'),body,`<button class="btn" type="button" onclick="closeModal()">${escapeHtml(u42('cancel'))}</button><button class="btn primary" type="button" onclick="saveNewTechnology()">${escapeHtml(u42('save'))}</button>`);
  }
  function technologyStepsSnapshot(o){
    return (typeof orderSteps==='function'?orderSteps(o):[]).map(s=>({name:s.name||'',minutes:Number(s.minutes||0),responsible:s.responsible||''}));
  }
  function technologyMaterialsSnapshot(o){
    return (typeof orderMaterials==='function'?orderMaterials(o):[]).map(item=>({category:item.category||'',materialId:item.materialId||'',workshop:item.workshop||'',perUnitQty:Number(item.perUnitQty||0),unit:item.unit||''}));
  }
  async function saveNewTechnology(){
    const orderId=document.getElementById('techCreateOrderSelect')?.value||'';
    const name=document.getElementById('techCreateName')?.value.trim();
    const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));
    if(!o){toast(t('chooseOrderHint'));return}
    if(!name){toast(t('enterTechnologyName'));return}
    const steps=technologyStepsSnapshot(o),materials=technologyMaterialsSnapshot(o);
    if(!steps.length&&!materials.length){toast(t('noTechnologyDataInOrder'));return}
    const tc={name,product:o.product||'',sourceOrderNumber:o.number||'',steps,materials,createdBy:(typeof profileDisplayName==='function'?profileDisplayName():'')};
    const ok=await insertTechnologyToSupabase(tc);
    if(!ok)return;
    tc.createdAt=new Date().toISOString();tc.updatedAt=tc.createdAt;
    data.technologies=[tc,...(data.technologies||[])];
    closeModal();
    toast(t('technologySaved'));
    renderTechnologies();
  }

  // ---------- применение технологии к заказу ----------
  function technologyApplyBarHtml(o){
    if(!(data.technologies||[]).length)return '';
    const current=o.technologyId?(data.technologies||[]).find(x=>String(x.id)===String(o.technologyId)):null;
    const options=(data.technologies||[]).map(tc=>`<option value="${tc.id}">${escapeHtml(tc.name)}${tc.product?' — '+escapeHtml(tc.product):''}</option>`).join('');
    return `<div class="tech-apply-bar">
      ${current?`<span class="tech-apply-current">${escapeHtml(t('technologyLinked'))}: <b>${escapeHtml(current.name)}</b></span>`:'<span></span>'}
      <div class="tech-apply-controls">
        <select class="select" id="technologyApplySelect_${o.id}"><option value="">${escapeHtml(t('chooseTechnology'))}</option>${options}</select>
        <button class="btn" type="button" onclick="applyTechnologyToOrder('${o.id}',document.getElementById('technologyApplySelect_${o.id}').value)">${escapeHtml(t('applyTechnologyBtn'))}</button>
      </div>
    </div>`;
  }
  async function applyTechnologyToOrder(orderId,techId){
    if(!techId)return;
    const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));
    const tc=(data.technologies||[]).find(x=>String(x.id)===String(techId));
    if(!o||!tc)return;
    const hasExisting=(typeof orderSteps==='function'?orderSteps(o):[]).length>0||(typeof orderMaterials==='function'?orderMaterials(o):[]).length>0;
    if(hasExisting&&!confirm(t('confirmApplyTechnologyOverwrite')))return;
    if(typeof markTechnologyStarted==='function')markTechnologyStarted(o);
    o.steps=(tc.steps||[]).map(s=>({name:s.name||'',minutes:Number(s.minutes||0),responsible:s.responsible||''}));
    o.materials=(tc.materials||[]).map(item=>{
      const m=(data.materials||[]).find(x=>String(x.id)===String(item.materialId));
      const unit=item.unit||(typeof orderUnitForMaterial==='function'?orderUnitForMaterial(m,item.category):'')||'';
      const perUnitQty=Number(item.perUnitQty||0);
      const qty=typeof calcOrderItemTotalQty==='function'?calcOrderItemTotalQty(perUnitQty,typeof orderProductQty==='function'?orderProductQty(o):1,unit):perUnitQty;
      return {category:item.category||'',materialId:item.materialId||'',workshop:item.workshop||'',perUnitQty,qty,unit,purchaseStatus:'none',purchaseQty:0,purchaseNo:''};
    });
    o.technologyId=tc.id;
    o.technologyName=tc.name;
    o.technologyAppliedAt=new Date().toISOString();
    if(typeof auditAdd==='function')auditAdd('technology_applied','order',o.id,o.number,`${tRu('historyTechnologyApplied')}: ${tc.name}`);
    if(typeof persistTechnologyOrder==='function')await persistTechnologyOrder(o);
    toast(t('technologyApplied'));
  }

  // ---------- сохранение изменений обратно в технологию (3 варианта) ----------
  function onTechSaveModeChange(){
    const mode=document.querySelector('input[name="techSaveMode"]:checked')?.value;
    const field=document.getElementById('techSaveNewNameField');
    if(field)field.style.display=mode==='new'?'':'none';
  }
  function openTechnologySaveDialog(orderId){
    const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));
    if(!o||!o.technologyId)return;
    const tc=(data.technologies||[]).find(x=>String(x.id)===String(o.technologyId));
    if(!tc)return;
    const defaultNewName=`${tc.name} (2)`;
    const body=`<div class="tech-save-dialog">
      <p class="tech-save-hint">${escapeHtml(t('techSaveHint'))} «<b>${escapeHtml(tc.name)}</b>»</p>
      <label class="tech-save-radio"><input type="radio" name="techSaveMode" value="overwrite" checked onchange="onTechSaveModeChange()"><span><b>${escapeHtml(t('techSaveOverwrite'))}</b><small>${escapeHtml(t('techSaveOverwriteHint'))}</small></span></label>
      <label class="tech-save-radio"><input type="radio" name="techSaveMode" value="keep" onchange="onTechSaveModeChange()"><span><b>${escapeHtml(t('techSaveKeep'))}</b><small>${escapeHtml(t('techSaveKeepHint'))}</small></span></label>
      <label class="tech-save-radio"><input type="radio" name="techSaveMode" value="new" onchange="onTechSaveModeChange()"><span><b>${escapeHtml(t('techSaveNew'))}</b><small>${escapeHtml(t('techSaveNewHint'))}</small></span></label>
      <div class="field" id="techSaveNewNameField" style="display:none"><label>${escapeHtml(t('technologyName'))}</label><input id="techSaveNewName" class="input" value="${escapeHtml(defaultNewName)}"></div>
    </div>`;
    openModal(t('updateTechnologyTitle'),body,`<button class="btn" type="button" onclick="closeModal()">${escapeHtml(u42('cancel'))}</button><button class="btn primary" type="button" onclick="confirmTechnologySave('${o.id}')">${escapeHtml(u42('save'))}</button>`);
  }
  async function confirmTechnologySave(orderId){
    const o=(data.orders||[]).find(x=>String(x.id)===String(orderId));
    if(!o||!o.technologyId)return;
    const tc=(data.technologies||[]).find(x=>String(x.id)===String(o.technologyId));
    if(!tc)return;
    const mode=document.querySelector('input[name="techSaveMode"]:checked')?.value||'keep';
    if(mode==='keep'){closeModal();return}
    const steps=technologyStepsSnapshot(o),materials=technologyMaterialsSnapshot(o);
    if(mode==='overwrite'){
      tc.steps=steps;tc.materials=materials;
      const ok=await updateTechnologyInSupabase(tc);
      if(!ok)return;
      tc.updatedAt=new Date().toISOString();
      closeModal();
      toast(t('technologyUpdated'));
      renderTechnologies();
      return;
    }
    if(mode==='new'){
      const name=document.getElementById('techSaveNewName')?.value.trim();
      if(!name){toast(t('enterTechnologyName'));return}
      const newTc={name,product:o.product||'',sourceOrderNumber:o.number||'',steps,materials,createdBy:(typeof profileDisplayName==='function'?profileDisplayName():'')};
      const ok=await insertTechnologyToSupabase(newTc);
      if(!ok)return;
      newTc.createdAt=new Date().toISOString();newTc.updatedAt=newTc.createdAt;
      data.technologies=[newTc,...(data.technologies||[])];
      o.technologyId=newTc.id;o.technologyName=newTc.name;
      if(typeof persistTechnologyOrder==='function')await persistTechnologyOrder(o);
      closeModal();
      toast(t('technologySavedAsNew'));
      renderTechnologies();
    }
  }

  // экспорт в глобальную область — так же, как остальные модули этого приложения
  Object.assign(window,{
    loadTechnologiesFromSupabase,renderTechnologies,updateTechnologySearch,
    openTechnologyDetail,deleteTechnology,
    openCreateTechnologyModal,refreshTechCreatePreview,saveNewTechnology,
    technologyApplyBarHtml,applyTechnologyToOrder,
    onTechSaveModeChange,openTechnologySaveDialog,confirmTechnologySave
  });
})();
