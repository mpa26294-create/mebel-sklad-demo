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

  // ---------- деталка: полное редактирование операций и материалов, как в заказе ----------
  async function persistTechChange(tc){
    const ok=await updateTechnologyInSupabase(tc);
    if(ok){tc.updatedAt=new Date().toISOString();if(typeof renderTechnologies==='function')renderTechnologies();}
    return ok;
  }
  const TECH_WORKSHOP_PRESETS=['Столярка','Швейный цех','Поклейка','Тапицерка','Сборка','Упаковка'];
  function technologyOperationsEditableHtml(tc){
    const stepsList=tc.steps||[];
    const addBtn=`<button class="btn primary order-tech-cta" type="button" onclick="addTechOperation('${tc.id}')">＋ ${escapeHtml(t('addOperation'))}</button>`;
    return `<section class="order-tech-card"><div class="order-tech-head"><div><h4>${escapeHtml(t('techOperations'))}</h4><p>${escapeHtml(t('techOperationsHint'))}</p></div>${addBtn}</div>${stepsList.length?`<div class="order-tech-table-scroll"><table class="order-tech-table"><thead><tr><th>${escapeHtml(t('operationStage'))}</th><th>${escapeHtml(t('timePerItem'))}</th><th>${escapeHtml(t('responsibleOptional'))}</th><th></th></tr></thead><tbody>${stepsList.map((s,index)=>`<tr><td><div class="technology-stage-picker"><select class="select" aria-label="${escapeHtml(t('operationTemplate'))}" onchange="applyTechOperationTemplate('${tc.id}',${index},this.value)"><option value="">${escapeHtml(t('chooseOperationTemplate'))}</option>${TECH_WORKSHOP_PRESETS.map(name=>`<option value="${escapeHtml(name)}" ${s.name===name?'selected':''}>${escapeHtml(typeof workshopLabel==='function'?workshopLabel(name):name)}</option>`).join('')}</select><input class="input" value="${escapeHtml(s.name||'')}" placeholder="${escapeHtml(t('customOperationName'))}" onchange="updateTechOperation('${tc.id}',${index},'name',this.value)"></div></td><td><div class="order-tech-time"><input class="input" type="number" min="0" step="1" value="${Number(s.minutes||0)}" onchange="updateTechOperation('${tc.id}',${index},'minutes',this.value)"><span>${escapeHtml(t('minutesShort'))}</span></div></td><td><input class="input" value="${escapeHtml(s.responsible||'')}" placeholder="${escapeHtml(t('notSpecified'))}" onchange="updateTechOperation('${tc.id}',${index},'responsible',this.value)"></td><td><button class="iconbtn order-tech-remove" type="button" aria-label="${escapeHtml(t('deleteOperation'))}" onclick="removeTechOperation('${tc.id}',${index})">×</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="order-tech-empty order-tech-empty-action"><b>${escapeHtml(t('techOperations'))}</b><span>${escapeHtml(t('techOperationsHint'))}</span></div>`}</section>`;
  }
  function technologyWorkshopOptions(tc,selected=''){
    const names=[...new Set([...(tc.steps||[]).map(s=>String(s.name||'').trim()).filter(Boolean),...TECH_WORKSHOP_PRESETS])];
    const current=String(selected||'').trim();
    if(current&&!names.includes(current))names.unshift(current);
    return [`<option value="">${escapeHtml(t('auto'))}</option>`,...names.map(name=>`<option value="${escapeHtml(name)}" ${name===current?'selected':''}>${escapeHtml(typeof workshopLabel==='function'?workshopLabel(name):name)}</option>`)].join('');
  }
  function technologyMaterialRowEditableHtml(tc,item,index){
    const m=(data.materials||[]).find(x=>String(x.id)===String(item.materialId));
    const category=item.category||m?.category||'Поролон';
    const unit=item.unit||(typeof orderUnitForMaterial==='function'?orderUnitForMaterial(m,category):'')||'';
    return `<div class="technology-material-row">
      <div class="field"><label>${escapeHtml(u42('category'))}</label><select class="select" onchange="updateTechMaterial('${tc.id}',${index},'category',this.value)">${(typeof ORDER_MATERIAL_CATS!=='undefined'?ORDER_MATERIAL_CATS:[]).map(cat=>`<option value="${cat}" ${cat===category?'selected':''}>${escapeHtml(categoryLabel(cat))}</option>`).join('')}</select></div>
      <div class="field"><label>${escapeHtml(u42('material'))}</label><select class="select" onchange="updateTechMaterial('${tc.id}',${index},'materialId',this.value)">${typeof materialOptions==='function'?materialOptions(category,item.materialId):''}</select></div>
      <div class="field"><label>Цех</label><select class="select" onchange="updateTechMaterial('${tc.id}',${index},'workshop',this.value)">${technologyWorkshopOptions(tc,item.workshop)}</select></div>
      <div class="field"><label>${escapeHtml(u42('perOne'))}</label><input class="input" type="number" min="0" step="0.01" value="${Number(item.perUnitQty||0)}" onchange="updateTechMaterial('${tc.id}',${index},'perUnitQty',this.value)"></div>
      <div class="field"><label>${escapeHtml(u42('unit'))}</label><select class="select" onchange="updateTechMaterial('${tc.id}',${index},'unit',this.value)">${typeof orderUnitOptions==='function'?orderUnitOptions(category,unit):''}</select></div>
      <button class="iconbtn order-tech-remove" type="button" aria-label="${escapeHtml(t('removeMaterial'))}" onclick="removeTechMaterial('${tc.id}',${index})">×</button>
    </div>`;
  }
  function technologyMaterialsEditableHtml(tc){
    const items=tc.materials||[];
    const buttons=`<div class="actions order-tech-actions"><button class="btn primary order-tech-cta" type="button" onclick="openTechMaterialPicker('${tc.id}')">＋ ${escapeHtml(t('addMaterialFromStock'))}</button><button class="btn order-tech-cta secondary" type="button" onclick="openTechNewMaterial('${tc.id}')">＋ ${escapeHtml(t('addNewMaterialToStock'))}</button></div>`;
    return `<section class="order-tech-card"><div class="order-tech-head"><div><h4>${escapeHtml(t('technologyMaterials'))}</h4><p>${escapeHtml(t('technologyMaterialsTemplateHint'))}</p></div>${buttons}</div><div class="technology-material-list">${items.map((item,index)=>technologyMaterialRowEditableHtml(tc,item,index)).join('')||`<div class="order-tech-empty order-tech-empty-action"><b>${escapeHtml(t('technologyMaterials'))}</b><span>${escapeHtml(t('noTechnologyMaterials'))}</span></div>`}</div></section>`;
  }
  function technologyDetailBody(tc){
    return `<div class="technology-detail">${technologyOperationsEditableHtml(tc)}${technologyMaterialsEditableHtml(tc)}</div>`;
  }
  function openTechnologyDetail(id){
    const tc=(data.technologies||[]).find(x=>String(x.id)===String(id));if(!tc)return;
    openModal(tc.name||t('createTechnologyTitle'),technologyDetailBody(tc),`<button class="btn" type="button" onclick="closeModal()">${escapeHtml(u42('close'))}</button><button class="btn danger" type="button" onclick="closeModal();deleteTechnology('${tc.id}')">${escapeHtml(u42('delete'))}</button>`);
  }

  // ---------- операции: мутаторы (мгновенно сохраняют в Supabase, переоткрывают деталку) ----------
  async function addTechOperation(techId){
    const tc=(data.technologies||[]).find(x=>String(x.id)===String(techId));if(!tc)return;
    tc.steps=[...(tc.steps||[]),{name:t('newOperation'),minutes:0,responsible:''}];
    await persistTechChange(tc);
    openTechnologyDetail(tc.id);
  }
  async function updateTechOperation(techId,index,field,value){
    const tc=(data.technologies||[]).find(x=>String(x.id)===String(techId));if(!tc)return;
    const steps=(tc.steps||[]).map(s=>({...s})),step=steps[index];if(!step)return;
    step[field]=field==='minutes'?Math.max(0,Math.round(Number(value||0))):String(value||'').trim();
    tc.steps=steps;
    await persistTechChange(tc);
    openTechnologyDetail(tc.id);
  }
  async function removeTechOperation(techId,index){
    const tc=(data.technologies||[]).find(x=>String(x.id)===String(techId));if(!tc)return;
    tc.steps=(tc.steps||[]).filter((_,i)=>i!==index);
    await persistTechChange(tc);
    openTechnologyDetail(tc.id);
  }
  function applyTechOperationTemplate(techId,index,value){if(value)updateTechOperation(techId,index,'name',value)}

  // ---------- материалы: мутаторы ----------
  function openTechMaterialPicker(techId){
    const categories=typeof technologyStockCategories==='function'?technologyStockCategories():[];
    const categoryOptions=categories.map(cat=>`<option value="${escapeHtml(cat)}">${escapeHtml(categoryLabel(cat)||cat)}</option>`).join('');
    const hasMaterials=(data.materials||[]).length>0;
    const body=hasMaterials?`<div class="form-grid technology-stock-picker"><div class="field"><label>${escapeHtml(currentLang==='ru'?'Категория':currentLang==='en'?'Category':'Kategorija')}</label><select class="select" id="techMaterialPickerCategory" onchange="updateTechMaterialPickerOptions(this.value)"><option value="">${escapeHtml(currentLang==='ru'?'Все категории':currentLang==='en'?'All categories':'Visas kategorijas')}</option>${categoryOptions}</select></div><div class="field"><label>${escapeHtml(t('material'))}</label><select class="select" id="techMaterialPickerMaterial" onchange="toggleTechMaterialPickerAdd(this.value)"><option value="">${escapeHtml(t('selectMaterialFromStock'))}</option>${typeof materialOptions==='function'?materialOptions('',''):''}</select></div></div>`:`<div class="order-tech-empty">${escapeHtml(t('noWarehouseMaterials'))}</div>`;
    openModal(t('addMaterialFromStock'),body,`<button class="btn" type="button" onclick="openTechnologyDetail('${techId}')">${escapeHtml(u42('cancel'))}</button><button class="btn primary" id="techMaterialPickerAddBtn" type="button" onclick="addTechMaterialFromStock('${techId}')" disabled>${escapeHtml(u42('add'))}</button>`);
  }
  function updateTechMaterialPickerOptions(category){
    const select=document.getElementById('techMaterialPickerMaterial');if(!select)return;
    select.innerHTML=`<option value="">${escapeHtml(t('selectMaterialFromStock'))}</option>${typeof materialOptions==='function'?materialOptions(category,''):''}`;
    toggleTechMaterialPickerAdd('');
  }
  function toggleTechMaterialPickerAdd(value){const btn=document.getElementById('techMaterialPickerAddBtn');if(btn)btn.disabled=!value}
  async function addTechMaterialFromStock(techId){
    const tc=(data.technologies||[]).find(x=>String(x.id)===String(techId));
    const materialId=document.getElementById('techMaterialPickerMaterial')?.value;
    const m=(data.materials||[]).find(x=>String(x.id)===String(materialId));
    if(!tc||!m)return;
    if((tc.materials||[]).some(item=>String(item.materialId)===String(m.id))){toast(t('materialAlreadyInOrder'));return}
    const unit=typeof orderUnitForMaterial==='function'?orderUnitForMaterial(m,m.category||''):(m.unit||'');
    const workshop=typeof materialDefaultWorkshop==='function'?materialDefaultWorkshop(m.category||'',m):'';
    tc.materials=[...(tc.materials||[]),{category:m.category||'',materialId:m.id,workshop,perUnitQty:0,unit}];
    await persistTechChange(tc);
    openTechnologyDetail(tc.id);
  }
  async function updateTechMaterial(techId,index,field,value){
    const tc=(data.technologies||[]).find(x=>String(x.id)===String(techId));if(!tc)return;
    const items=(tc.materials||[]).map(item=>({...item})),item=items[index];if(!item)return;
    if(field==='category'){
      item.category=String(value||'');
      const first=(data.materials||[]).find(m=>m.category===item.category);
      item.materialId=first?.id||'';
      item.unit=typeof orderUnitForMaterial==='function'?orderUnitForMaterial(first,item.category):item.unit;
      item.workshop=typeof materialDefaultWorkshop==='function'?materialDefaultWorkshop(item.category,first):item.workshop;
    }else if(field==='materialId'){
      const m=(data.materials||[]).find(x=>String(x.id)===String(value));
      item.materialId=value;
      item.category=m?.category||item.category;
      item.unit=typeof orderUnitForMaterial==='function'?orderUnitForMaterial(m,item.category):item.unit;
      item.workshop=typeof materialDefaultWorkshop==='function'?materialDefaultWorkshop(item.category,m):item.workshop;
    }else if(field==='workshop')item.workshop=String(value||'').trim();
    else if(field==='unit')item.unit=String(value||'');
    else if(field==='perUnitQty')item.perUnitQty=Math.max(0,Number(value||0));
    items[index]=item;
    tc.materials=items;
    await persistTechChange(tc);
    openTechnologyDetail(tc.id);
  }
  async function removeTechMaterial(techId,index){
    const tc=(data.technologies||[]).find(x=>String(x.id)===String(techId));if(!tc)return;
    tc.materials=(tc.materials||[]).filter((_,i)=>i!==index);
    await persistTechChange(tc);
    openTechnologyDetail(tc.id);
  }
  // v7.19: «Добавить новый материал на склад» прямо из технологии — тот же мастер создания
  // материала, что и в заказе (openAddCategoryModal), с возвратом в деталку технологии.
  function openTechNewMaterial(techId){
    if(typeof requireAuth==='function'&&!requireAuth())return;
    window.pendingTechnologyMaterialTechId=String(techId);
    if(typeof pushModalState==='function')pushModalState();
    openAddCategoryModal(false);
  }
  async function attachCreatedTechnologyMaterialToTech(techId,material){
    const tc=(data.technologies||[]).find(x=>String(x.id)===String(techId));
    if(!tc||!material)return false;
    if(!(tc.materials||[]).some(item=>String(item.materialId)===String(material.id))){
      const unit=typeof orderUnitForMaterial==='function'?orderUnitForMaterial(material,material.category||''):(material.unit||'');
      const workshop=typeof materialDefaultWorkshop==='function'?materialDefaultWorkshop(material.category||'',material):'';
      tc.materials=[...(tc.materials||[]),{category:material.category||'',materialId:material.id,workshop,perUnitQty:0,unit}];
    }
    await persistTechChange(tc);
    openTechnologyDetail(tc.id);
    return true;
  }

  async function deleteTechnology(id){
    if(!confirm(t('confirmDeleteTechnology')))return;
    const ok=await deleteTechnologyFromSupabase(id);
    if(!ok)return;
    data.technologies=(data.technologies||[]).filter(x=>String(x.id)!==String(id));
    toast(t('technologyDeleted'));
    renderTechnologies();
  }

  // ---------- создание технологии: с нуля (как в заказе) или на основе заказа ----------
  function technologyPreviewHtml(o){
    if(!o)return `<div class="order-tech-empty">${escapeHtml(t('techCreateBlankHint'))}</div>`;
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
      // v7.18: заказ теперь необязателен — по умолчанию выбрано "с нуля", как при создании
      // нового заказа: технология создаётся пустой, а операции и материалы добавляются на
      // следующем экране (тем же способом, что и в заказе).
      const optionsHtml=orders.map(o=>`<option value="${o.id}">${escapeHtml(o.number||'')}${o.product?' · '+escapeHtml(o.product):''}${o.client?' · '+escapeHtml(o.client):''}</option>`).join('');
      pickField=`<div class="field"><label>${escapeHtml(t('sourceOrder'))}</label><select class="select" id="techCreateOrderSelect" onchange="refreshTechCreatePreview()"><option value="">${escapeHtml(t('techCreateBlankOption'))}</option>${optionsHtml}</select></div>`;
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
    if(!name){toast(t('enterTechnologyName'));return}
    const o=orderId?(data.orders||[]).find(x=>String(x.id)===String(orderId)):null;
    const steps=o?technologyStepsSnapshot(o):[];
    const materials=o?technologyMaterialsSnapshot(o):[];
    const tc={name,product:o?.product||'',sourceOrderNumber:o?.number||'',steps,materials,createdBy:(typeof profileDisplayName==='function'?profileDisplayName():'')};
    const ok=await insertTechnologyToSupabase(tc);
    if(!ok)return;
    tc.createdAt=new Date().toISOString();tc.updatedAt=tc.createdAt;
    data.technologies=[tc,...(data.technologies||[])];
    renderTechnologies();
    toast(t('technologySaved'));
    // v7.18: сразу открываем полный экран редактирования (операции + материалы) — тот же
    // самый экран, что используется для уже существующих технологий, — чтобы заполнение
    // происходило ровно так же, как раньше заполнялась технология внутри заказа.
    openTechnologyDetail(tc.id);
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
    onTechSaveModeChange,openTechnologySaveDialog,confirmTechnologySave,
    addTechOperation,updateTechOperation,removeTechOperation,applyTechOperationTemplate,
    openTechMaterialPicker,updateTechMaterialPickerOptions,toggleTechMaterialPickerAdd,
    addTechMaterialFromStock,updateTechMaterial,removeTechMaterial,
    openTechNewMaterial,attachCreatedTechnologyMaterialToTech
  });
})();
