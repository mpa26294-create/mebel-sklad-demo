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

  // ---------- список / поиск / фильтры / сортировка / пагинация ----------
  // v7.23: список «Технологии» — таблица (по умолчанию) с переключателем на карточки, фильтрами
  // по цеху/статусу, сортировкой и пагинацией. Статус (Активна/Черновик) — производная величина
  // (не хранится в БД): технология активна, если в ней есть и операции, и материалы.
  let technologySearchQuery='';
  let technologyWorkshopFilter='';
  let technologyStatusFilter='';
  let technologySortMode='newest';
  const TECH_PAGE_SIZE=10;
  let technologyPage=1;
  let technologyViewMode=(function(){try{return localStorage.getItem('molm_tech_view')==='cards'?'cards':'table'}catch(e){return 'table'}})();
  // v7.21: технология больше не открывается в узком модальном окне — как список цехов/детальный
  // экран цеха (workshopsOverviewHtml/workshopDetailHtml в orders.js), деталка технологии теперь
  // рендерится прямо на всю ширину страницы раздела «Технологии» (см. renderTechnologies()).
  let activeTechnologyId='';

  function technologyStatus(tc){return (tc.steps||[]).length>0&&(tc.materials||[]).length>0?'active':'draft'}
  function technologyStatusLabel(tc){return technologyStatus(tc)==='active'?t('techStatusActive'):t('techStatusDraft')}
  function technologyWorkshopNames(tc){
    const names=new Set();
    (tc.steps||[]).forEach(s=>{const n=String(s.name||'').trim();if(n)names.add(n)});
    (tc.materials||[]).forEach(m=>{const n=String(m.workshop||'').trim();if(n)names.add(n)});
    return [...names];
  }
  function allTechnologyWorkshops(){
    const names=new Set();
    (data.technologies||[]).forEach(tc=>technologyWorkshopNames(tc).forEach(n=>names.add(n)));
    return [...names].sort((a,b)=>String(workshopLabel(a)).localeCompare(String(workshopLabel(b)),'ru'));
  }
  function technologyMatchesWorkshop(tc,workshop){return technologyWorkshopNames(tc).includes(workshop)}

  function updateTechnologySearch(value){technologySearchQuery=String(value||'');technologyPage=1;renderTechnologies()}
  function updateTechnologyWorkshopFilter(value){technologyWorkshopFilter=String(value||'');technologyPage=1;renderTechnologies()}
  function updateTechnologyStatusFilter(value){technologyStatusFilter=String(value||'');technologyPage=1;renderTechnologies()}
  function updateTechnologySortMode(value){technologySortMode=String(value||'newest');technologyPage=1;renderTechnologies()}
  function resetTechnologyFilters(){
    technologySearchQuery='';technologyWorkshopFilter='';technologyStatusFilter='';technologySortMode='newest';technologyPage=1;
    const searchInput=document.getElementById('technologiesSearchInput');if(searchInput)searchInput.value='';
    renderTechnologies();
  }
  function setTechnologyViewMode(mode){
    technologyViewMode=mode==='cards'?'cards':'table';
    try{localStorage.setItem('molm_tech_view',technologyViewMode)}catch(e){}
    renderTechnologies();
  }
  function goToTechnologiesPage(delta){technologyPage=Math.max(1,technologyPage+Number(delta||0));renderTechnologies()}

  function sortTechnologies(list){
    const arr=list.slice();
    if(technologySortMode==='oldest')arr.sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
    else if(technologySortMode==='name')arr.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ru'));
    else if(technologySortMode==='operations')arr.sort((a,b)=>(b.steps||[]).length-(a.steps||[]).length);
    else arr.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    return arr;
  }
  function filteredTechnologies(){
    const q=technologySearchQuery.trim().toLowerCase();
    let list=(data.technologies||[]).slice();
    if(q)list=list.filter(tc=>[tc.name,tc.product,tc.sourceOrderNumber].some(v=>String(v||'').toLowerCase().includes(q)));
    if(technologyWorkshopFilter)list=list.filter(tc=>technologyMatchesWorkshop(tc,technologyWorkshopFilter));
    if(technologyStatusFilter)list=list.filter(tc=>technologyStatus(tc)===technologyStatusFilter);
    return sortTechnologies(list);
  }

  function technologyCardHtml(tc){
    const created=tc.createdAt?new Date(tc.createdAt).toLocaleDateString(currentLang==='ru'?'ru-RU':currentLang==='lv'?'lv-LV':'en-GB'):'';
    return `<article class="technology-card" onclick="openTechnologyDetail('${tc.id}')">
      <div class="technology-card-head"><h3>${escapeHtml(tc.name)}</h3><div class="technology-card-menu" onclick="event.stopPropagation()">${technologyActionMenu(tc.id)}</div></div>
      ${tc.product?`<div class="technology-card-sub">${escapeHtml(tc.product)}</div>`:''}
      <div class="technology-card-stats"><div><small>${escapeHtml(t('totalOperations'))}</small><b>${(tc.steps||[]).length}</b></div><div><small>${escapeHtml(t('materialsCount'))}</small><b>${(tc.materials||[]).length}</b></div></div>
      <div class="technology-card-foot"><span class="tech-status-pill ${technologyStatus(tc)==='active'?'ok':'idle'}">${escapeHtml(technologyStatusLabel(tc))}</span><span>${tc.sourceOrderNumber?escapeHtml(tc.sourceOrderNumber)+' · ':''}${escapeHtml(created)}</span></div>
    </article>`;
  }

  function technologyActionMenu(id){
    return `<div class="action-menu" id="techMenu_${id}"><button class="action-menu-btn" type="button" aria-label="${escapeHtml(u42('actions')||'Actions')}" onclick="toggleTechMenu(event,'${id}')">⋯</button><div class="action-menu-list">
      <button type="button" onclick="closeOrderMenus();openTechnologyDetail('${id}')">${escapeHtml(t('techActionOpen'))}</button>
      <button type="button" onclick="closeOrderMenus();openTechnologyDetail('${id}')">${escapeHtml(t('techActionEdit'))}</button>
      <button type="button" onclick="closeOrderMenus();duplicateTechnology('${id}')">${escapeHtml(t('techActionDuplicate'))}</button>
      <button type="button" class="danger" onclick="closeOrderMenus();deleteTechnology('${id}')">${escapeHtml(u42('delete'))}</button>
    </div></div>`;
  }
  function toggleTechMenu(e,id){
    e.stopPropagation();
    const el=document.getElementById('techMenu_'+id),button=el?.querySelector('.action-menu-btn'),list=el?.querySelector('.action-menu-list'),was=el?.classList.contains('open');
    closeOrderMenus();
    if(!el||!button||!list||was)return;
    el.classList.add('open');
    const rect=button.getBoundingClientRect(),width=Math.max(190,list.scrollWidth||190),height=list.scrollHeight||190,gap=6,left=Math.max(8,Math.min(window.innerWidth-width-8,rect.right-width)),openUp=window.innerHeight-rect.bottom<height+gap&&rect.top>height+gap;
    list.style.position='fixed';list.style.left=`${left}px`;list.style.right='auto';list.style.top=`${Math.max(8,openUp?rect.top-height-gap:Math.min(window.innerHeight-height-8,rect.bottom+gap))}px`;list.style.bottom='auto';list.style.zIndex='10000';
  }

  function technologyTableRowHtml(tc){
    const updated=tc.updatedAt||tc.createdAt;
    const updatedText=updated?new Date(updated).toLocaleDateString(currentLang==='ru'?'ru-RU':currentLang==='lv'?'lv-LV':'en-GB'):'—';
    const workshops=technologyWorkshopNames(tc);
    const workshopText=workshops.length?workshops.slice(0,2).map(w=>workshopLabel(w)).join(', ')+(workshops.length>2?` +${workshops.length-2}`:''):'—';
    const status=technologyStatus(tc);
    return `<div class="tech-table-row" onclick="openTechnologyDetail('${tc.id}')">
      <div class="tech-table-name"><b>${escapeHtml(tc.name)}</b>${tc.product?`<span class="tech-table-sub">${escapeHtml(tc.product)}</span>`:''}</div>
      <div class="tech-table-workshop">${escapeHtml(workshopText)}</div>
      <div class="tech-table-count">${(tc.steps||[]).length}</div>
      <div class="tech-table-count">${(tc.materials||[]).length}</div>
      <div class="tech-table-status"><span class="tech-status-pill ${status==='active'?'ok':'idle'}">${escapeHtml(technologyStatusLabel(tc))}</span></div>
      <div class="tech-table-updated">${escapeHtml(updatedText)}</div>
      <div class="tech-table-actions" onclick="event.stopPropagation()">${technologyActionMenu(tc.id)}</div>
    </div>`;
  }
  function technologyTableHtml(rows){
    return `<div class="tech-table-card"><div class="tech-table-head">
      <div>${escapeHtml(t('techTableColName'))}</div>
      <div>${escapeHtml(t('workshopColumnHeader'))}</div>
      <div>${escapeHtml(t('techTableColOperations'))}</div>
      <div>${escapeHtml(t('techTableColMaterials'))}</div>
      <div>${escapeHtml(t('techTableColStatus'))}</div>
      <div>${escapeHtml(t('techTableColUpdated'))}</div>
      <div></div>
    </div>${rows.map(technologyTableRowHtml).join('')}</div>`;
  }

  function technologyFiltersRowHtml(){
    const workshops=allTechnologyWorkshops();
    return `<div class="toolbar tech-filters-row">
      <select class="select" id="technologyWorkshopFilter" onchange="updateTechnologyWorkshopFilter(this.value)">
        <option value="">${escapeHtml(t('techFilterWorkshopAll'))}</option>
        ${workshops.map(w=>`<option value="${escapeHtml(w)}" ${w===technologyWorkshopFilter?'selected':''}>${escapeHtml(workshopLabel(w))}</option>`).join('')}
      </select>
      <select class="select" id="technologyStatusFilter" onchange="updateTechnologyStatusFilter(this.value)">
        <option value="">${escapeHtml(t('techFilterStatusAll'))}</option>
        <option value="active" ${technologyStatusFilter==='active'?'selected':''}>${escapeHtml(t('techStatusActive'))}</option>
        <option value="draft" ${technologyStatusFilter==='draft'?'selected':''}>${escapeHtml(t('techStatusDraft'))}</option>
      </select>
      <select class="select" id="technologySortMode" onchange="updateTechnologySortMode(this.value)">
        <option value="newest" ${technologySortMode==='newest'?'selected':''}>${escapeHtml(t('techSortNewest'))}</option>
        <option value="oldest" ${technologySortMode==='oldest'?'selected':''}>${escapeHtml(t('techSortOldest'))}</option>
        <option value="name" ${technologySortMode==='name'?'selected':''}>${escapeHtml(t('techSortNameAsc'))}</option>
        <option value="operations" ${technologySortMode==='operations'?'selected':''}>${escapeHtml(t('techSortOperationsDesc'))}</option>
      </select>
      <button class="btn" type="button" onclick="resetTechnologyFilters()">${escapeHtml(t('techResetFilters'))}</button>
      <div class="tech-view-toggle">
        <button type="button" class="tech-view-btn ${technologyViewMode==='table'?'active':''}" onclick="setTechnologyViewMode('table')">${escapeHtml(t('techViewTable'))}</button>
        <button type="button" class="tech-view-btn ${technologyViewMode==='cards'?'active':''}" onclick="setTechnologyViewMode('cards')">${escapeHtml(t('techViewCards'))}</button>
      </div>
    </div>`;
  }
  function technologyPaginationHtml(total,pages){
    if(pages<=1)return '';
    const from=(technologyPage-1)*TECH_PAGE_SIZE+1,to=Math.min(technologyPage*TECH_PAGE_SIZE,total);
    let pageBtns='';
    for(let p=1;p<=pages;p++)pageBtns+=`<button type="button" class="tech-page-btn ${p===technologyPage?'current':''}" onclick="goToTechnologiesPage(${p-technologyPage})" ${p===technologyPage?'disabled':''}>${p}</button>`;
    return `<div class="tech-pagination">
      <span>${escapeHtml(t('techPaginationShowingPrefix'))} ${from}–${to} ${escapeHtml(t('techPaginationOf'))} ${total}</span>
      <div class="tech-pagination-controls">
        <button type="button" class="tech-page-btn" onclick="goToTechnologiesPage(-1)" ${technologyPage<=1?'disabled':''}>‹ ${escapeHtml(t('techPaginationPrev'))}</button>
        ${pageBtns}
        <button type="button" class="tech-page-btn" onclick="goToTechnologiesPage(1)" ${technologyPage>=pages?'disabled':''}>${escapeHtml(t('techPaginationNext'))} ›</button>
      </div>
    </div>`;
  }
  function technologyInfoBlocksHtml(){
    return `<div class="tech-info-blocks">
      <div class="tech-info-block orange"><b>${escapeHtml(t('techInfoQuickStartTitle'))}</b><span>${escapeHtml(t('techInfoQuickStartText'))}</span></div>
      <div class="tech-info-block blue"><b>${escapeHtml(t('techInfoStandardsTitle'))}</b><span>${escapeHtml(t('techInfoStandardsText'))}</span></div>
      <div class="tech-info-block green"><b>${escapeHtml(t('techInfoRelevanceTitle'))}</b><span>${escapeHtml(t('techInfoRelevanceText'))}</span></div>
    </div>`;
  }

  function renderTechnologies(){
    const box=document.getElementById('technologiesList');if(!box)return;
    const countEl=document.getElementById('technologiesCount');if(countEl)countEl.textContent=String((data.technologies||[]).length);
    const searchWrap=document.getElementById('technologiesSearchWrap');
    const createBtn=document.getElementById('technologiesCreateBtn');
    const statsBox=document.getElementById('technologiesStats');
    const toolbarBox=document.getElementById('technologiesToolbar');
    if(activeTechnologyId){
      const tc=(data.technologies||[]).find(x=>String(x.id)===String(activeTechnologyId));
      if(tc){
        if(searchWrap)searchWrap.style.display='none';
        if(createBtn)createBtn.style.display='none';
        if(statsBox)statsBox.style.display='none';
        if(toolbarBox)toolbarBox.style.display='none';
        box.innerHTML=technologyDetailPageHtml(tc);
        return;
      }
      activeTechnologyId=''; // технология удалена/не найдена — вернуться к списку
    }
    if(searchWrap)searchWrap.style.display='';
    if(createBtn)createBtn.style.display='';
    if(statsBox)statsBox.style.display='';
    if(toolbarBox){toolbarBox.style.display='';toolbarBox.innerHTML=technologyFiltersRowHtml()}
    const all=filteredTechnologies();
    if(!(data.technologies||[]).length){box.innerHTML=`<div class="empty"><b>${escapeHtml(t('noTechnologies'))}</b>${escapeHtml(t('noTechnologiesHint'))}</div>${technologyInfoBlocksHtml()}`;return}
    if(!all.length){box.innerHTML=`<div class="empty"><b>${escapeHtml(t('techNoResults'))}</b></div>${technologyInfoBlocksHtml()}`;return}
    const pages=Math.max(1,Math.ceil(all.length/TECH_PAGE_SIZE));
    if(technologyPage>pages)technologyPage=pages;
    if(technologyPage<1)technologyPage=1;
    const start=(technologyPage-1)*TECH_PAGE_SIZE;
    const rows=all.slice(start,start+TECH_PAGE_SIZE);
    const listHtml=technologyViewMode==='cards'?`<div class="technology-card-grid">${rows.map(technologyCardHtml).join('')}</div>`:technologyTableHtml(rows);
    box.innerHTML=`${listHtml}${technologyPaginationHtml(all.length,pages)}${technologyInfoBlocksHtml()}`;
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
  // v7.25: «Количество изделий» — сколько единиц изделия планируется сделать по этой технологии.
  // Не пишется в Supabase (там сейчас нет такой колонки, а доступ к БД временно недоступен) —
  // хранится только в localStorage браузера по id технологии, чисто для этого расчёта на клиенте.
  function getTechPlannedQty(techId){
    try{
      const n=Number(localStorage.getItem('molm_tech_qty_'+techId));
      return Number.isFinite(n)&&n>0?n:1;
    }catch(e){return 1}
  }
  function setTechPlannedQty(techId,value){
    const n=Math.max(1,Math.round(Number(value||1))||1);
    try{localStorage.setItem('molm_tech_qty_'+techId,String(n))}catch(e){}
    return n;
  }
  function updateTechPlannedQty(techId,value){
    setTechPlannedQty(techId,value);
    renderTechnologies(); // деталка уже открыта (activeTechnologyId установлен) — просто перерисовать
  }
  // Хватает ли материала на складе на партию plannedQty штук, с учётом того, что часть остатка уже
  // зарезервирована другими активными заказами (materialReservedOutsideOrder с excludeOrderId='' —
  // технология сама не заказ, поэтому резерв всех заказов учитывается целиком).
  function technologyMaterialAvailability(item,plannedQty){
    const m=(data.materials||[]).find(x=>String(x.id)===String(item.materialId));
    if(!m)return {ok:false,missing:0,available:0,stock:0,unit:item.unit||'',need:0,mat:null};
    const unit=item.unit||(typeof orderUnitForMaterial==='function'?orderUnitForMaterial(m,item.category):'')||m.unit;
    const stock=typeof convertMaterialQty==='function'?convertMaterialQty(m.quantity,m.unit,unit,m):Number(m.quantity||0);
    const reservedOther=typeof materialReservedOutsideOrder==='function'?materialReservedOutsideOrder(m.id,'',unit):0;
    const available=Math.max(0,stock-reservedOther);
    const need=Math.max(0,Number(item.perUnitQty||0))*Math.max(0,Number(plannedQty||0));
    return {ok:available>=need,missing:Math.max(0,need-available),available,stock,unit,need,mat:m};
  }
  function technologyMaterialStatusPill(item,plannedQty){
    const av=technologyMaterialAvailability(item,plannedQty);
    if(!av.mat)return {tone:'bad',label:t('deletedMaterial')};
    if(av.need<=0)return {tone:'idle',label:t('materialUsageNotSpecified')};
    if(av.available<=0)return {tone:'bad',label:`${t('needToPurchase')} · ${qtyWithUnit(av.need,av.unit)}`};
    if(av.available<av.need)return {tone:'warn',label:`${t('partiallyAvailable')} · ${t('missing')}: ${qtyWithUnit(av.missing,av.unit)}`};
    return {tone:'ok',label:`${t('materialsAvailableStatus')} · ${qtyWithUnit(av.available,av.unit)}`};
  }
  function technologyOverallAvailability(tc,plannedQty){
    const items=tc.materials||[];
    if(!items.length)return null;
    const states=items.map(item=>technologyMaterialAvailability(item,plannedQty));
    return {shortageCount:states.filter(s=>!s.ok).length,total:items.length};
  }
  function technologyPlannedQtySummaryHtml(tc,plannedQty){
    const overall=technologyOverallAvailability(tc,plannedQty);
    if(!overall)return '';
    if(overall.shortageCount>0)return `<div class="tech-status-pill idle tech-planned-qty-summary bad">${escapeHtml(t('techPlannedQtyShortPrefix'))} ${overall.shortageCount} ${escapeHtml(t('techPlannedQtyShortOf'))} ${overall.total}</div>`;
    return `<div class="tech-status-pill ok tech-planned-qty-summary">${escapeHtml(t('techPlannedQtyOkPrefix'))} ${plannedQty} ${escapeHtml(t('techPlannedQtyOkSuffix'))}</div>`;
  }
  function technologyMaterialRowEditableHtml(tc,item,index,plannedQty){
    const m=(data.materials||[]).find(x=>String(x.id)===String(item.materialId));
    const category=item.category||m?.category||'Поролон';
    const unit=item.unit||(typeof orderUnitForMaterial==='function'?orderUnitForMaterial(m,category):'')||'';
    const statusPill=technologyMaterialStatusPill(item,plannedQty);
    return `<div class="technology-material-row">
      <div class="field"><label>${escapeHtml(u42('category'))}</label><select class="select" onchange="updateTechMaterial('${tc.id}',${index},'category',this.value)">${(typeof ORDER_MATERIAL_CATS!=='undefined'?ORDER_MATERIAL_CATS:[]).map(cat=>`<option value="${cat}" ${cat===category?'selected':''}>${escapeHtml(categoryLabel(cat))}</option>`).join('')}</select></div>
      <div class="field"><label>${escapeHtml(u42('material'))}</label><select class="select" onchange="updateTechMaterial('${tc.id}',${index},'materialId',this.value)">${typeof materialOptions==='function'?materialOptions(category,item.materialId):''}</select></div>
      <div class="field"><label>Цех</label><select class="select" onchange="updateTechMaterial('${tc.id}',${index},'workshop',this.value)">${technologyWorkshopOptions(tc,item.workshop)}</select></div>
      <div class="field"><label>${escapeHtml(u42('perOne'))}</label><input class="input" type="number" min="0" step="0.01" value="${Number(item.perUnitQty||0)}" onchange="updateTechMaterial('${tc.id}',${index},'perUnitQty',this.value)"></div>
      <div class="field"><label>${escapeHtml(u42('unit'))}</label><select class="select" onchange="updateTechMaterial('${tc.id}',${index},'unit',this.value)">${typeof orderUnitOptions==='function'?orderUnitOptions(category,unit):''}</select></div>
      <button class="iconbtn order-tech-remove" type="button" aria-label="${escapeHtml(t('removeMaterial'))}" onclick="removeTechMaterial('${tc.id}',${index})">×</button>
      ${m?`<button class="iconbtn tech-material-open-btn" type="button" aria-label="${escapeHtml(u42('open'))}" title="${escapeHtml(u42('open'))}" onclick="event.stopPropagation();openMaterialDetails('${m.id}')">›</button>`:'<span></span>'}
      <div class="technology-material-status ${statusPill.tone}"><span>${escapeHtml(statusPill.label)}</span></div>
    </div>`;
  }
  function technologyMaterialsEditableHtml(tc){
    const items=tc.materials||[];
    const plannedQty=getTechPlannedQty(tc.id);
    const buttons=`<div class="actions order-tech-actions"><button class="btn primary order-tech-cta" type="button" onclick="openTechMaterialPicker('${tc.id}')">＋ ${escapeHtml(t('addMaterialFromStock'))}</button><button class="btn order-tech-cta secondary" type="button" onclick="openTechNewMaterial('${tc.id}')">＋ ${escapeHtml(t('addNewMaterialToStock'))}</button></div>`;
    return `<section class="order-tech-card"><div class="order-tech-head"><div><h4>${escapeHtml(t('technologyMaterials'))}</h4><p>${escapeHtml(t('technologyMaterialsTemplateHint'))}</p></div>${buttons}</div><div class="technology-material-list">${items.map((item,index)=>technologyMaterialRowEditableHtml(tc,item,index,plannedQty)).join('')||`<div class="order-tech-empty order-tech-empty-action"><b>${escapeHtml(t('technologyMaterials'))}</b><span>${escapeHtml(t('noTechnologyMaterials'))}</span></div>`}</div></section>`;
  }
  function technologyPlannedQtyCardHtml(tc){
    const plannedQty=getTechPlannedQty(tc.id);
    return `<section class="order-tech-card tech-detail-qty-card">
      <div class="order-tech-head"><div><h4>${escapeHtml(t('techPlannedQtyLabel'))}</h4><p>${escapeHtml(t('techPlannedQtyHint'))}</p></div>${technologyPlannedQtySummaryHtml(tc,plannedQty)}</div>
      <div class="tech-detail-qty-row"><input class="input" type="number" min="1" step="1" id="techDetailPlannedQty" value="${plannedQty}" onchange="updateTechPlannedQty('${tc.id}',this.value)"></div>
    </section>`;
  }
  // v7.26: раньше название сохранялось только по клику «Сохранить» — если между вводом нового
  // названия и кликом по кнопке оператор успевал изменить любое другое поле (операцию, материал,
  // количество изделий), деталка перерисовывалась заново из tc.name, и напечатанное название
  // молча терялось («во время редактирования технологии не меняется название»). Теперь поле
  // «Название» сохраняется сразу по onchange (как и остальные поля на этом экране), так что к
  // моменту любой другой правки новое название уже записано в tc.name и переживает перерисовку.
  // Кнопка «Сохранить» оставлена как явное подтверждение — она просто повторно сохраняет то же
  // значение и не может теперь его перезаписать чем-то устаревшим.
  async function renameTechDetail(techId,value){
    const tc=(data.technologies||[]).find(x=>String(x.id)===String(techId));if(!tc)return;
    const name=String(value||'').trim();
    if(!name){toast(t('enterTechnologyName'));return}
    if(name===tc.name)return;
    tc.name=name;
    await persistTechChange(tc);
  }
  // v7.21: деталка технологии — отдельная широкая страница внутри раздела «Технологии» (не модальное
  // окно), с явной кнопкой «Сохранить» для названия. Операции/материалы по-прежнему сохраняются
  // мгновенно при каждом изменении поля (persistTechChange), «Сохранить» дополнительно фиксирует
  // название и даёт пользователю явное подтверждение, что всё записано.
  function technologyDetailPageHtml(tc){
    return `<div class="workshop-detail-head">
      <button type="button" class="workshop-back-link" onclick="closeTechnologyDetail()">${escapeHtml(t('backToTechnologies'))}</button>
      <span class="workshop-detail-sep"></span>
      <h3>${escapeHtml(tc.name||t('createTechnologyTitle'))}</h3>
    </div>
    <div class="tech-detail-page">
      <section class="order-tech-card tech-detail-name-card">
        <div class="order-tech-head"><div><h4>${escapeHtml(t('technologyName'))}</h4></div></div>
        <div class="tech-detail-name-row"><input class="input" id="techDetailName" value="${escapeHtml(tc.name||'')}" placeholder="${escapeHtml(t('technologyNamePlaceholder'))}" onchange="renameTechDetail('${tc.id}',this.value)"></div>
      </section>
      ${technologyOperationsEditableHtml(tc)}
      ${technologyPlannedQtyCardHtml(tc)}
      ${technologyMaterialsEditableHtml(tc)}
      <div class="tech-detail-actions">
        <button class="btn primary" type="button" onclick="saveTechnologyAndReturn('${tc.id}')">${escapeHtml(u42('save'))}</button>
        <button class="btn danger" type="button" onclick="deleteTechnology('${tc.id}')">${escapeHtml(u42('delete'))}</button>
      </div>
    </div>`;
  }
  function openTechnologyDetail(id){
    const tc=(data.technologies||[]).find(x=>String(x.id)===String(id));if(!tc)return;
    activeTechnologyId=String(id);
    renderTechnologies();
  }
  function closeTechnologyDetail(){
    activeTechnologyId='';
    renderTechnologies();
  }
  async function saveTechnologyAndReturn(techId){
    const tc=(data.technologies||[]).find(x=>String(x.id)===String(techId));if(!tc)return;
    const nameInput=document.getElementById('techDetailName');
    const name=nameInput?nameInput.value.trim():tc.name;
    if(!name){toast(t('enterTechnologyName'));return}
    tc.name=name;
    const ok=await persistTechChange(tc);
    if(ok)toast(t('technologySaved'));
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
    openModal(t('addMaterialFromStock'),body,`<button class="btn" type="button" onclick="closeModal();openTechnologyDetail('${techId}')">${escapeHtml(u42('cancel'))}</button><button class="btn primary" id="techMaterialPickerAddBtn" type="button" onclick="addTechMaterialFromStock('${techId}')" disabled>${escapeHtml(u42('add'))}</button>`);
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
    closeModal();
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
    if(typeof modalStack!=='undefined')modalStack=[];
    closeModal();
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

  // v7.23: «Дублировать» — копия технологии (операции+материалы) с новым именем «Название (копия)»,
  // сразу сохранённая в Supabase как отдельная строка. Исходная технология не изменяется.
  async function duplicateTechnology(id){
    const src=(data.technologies||[]).find(x=>String(x.id)===String(id));if(!src)return;
    const copy={
      name:`${src.name} ${t('techCopySuffix')}`,
      product:src.product||'',
      sourceOrderNumber:src.sourceOrderNumber||'',
      steps:(src.steps||[]).map(s=>({...s})),
      materials:(src.materials||[]).map(m=>({...m})),
      createdBy:(typeof profileDisplayName==='function'?profileDisplayName():'')
    };
    const ok=await insertTechnologyToSupabase(copy);
    if(!ok)return;
    copy.createdAt=new Date().toISOString();copy.updatedAt=copy.createdAt;
    data.technologies=[copy,...(data.technologies||[])];
    toast(t('techDuplicated'));
    renderTechnologies();
  }

  // ---------- создание технологии: всегда с нуля, заказ — только для названия/справки ----------
  // v7.20: раньше выбор заказа-источника подтягивал в новую технологию его шаги/материалы
  // (снимок). По решению пользователя технология ВСЕГДА создаётся пустой — оператор задаёт
  // операции, материалы и время сам на следующем экране, вне зависимости от того, выбран ли
  // заказ. Поле «Заказ-источник» осталось только как удобная подсказка для названия/изделия.
  function technologyPreviewHtml(){
    return `<div class="order-tech-empty">${escapeHtml(t('techCreateBlankHint'))}</div>`;
  }
  function refreshTechCreatePreview(){
    const id=document.getElementById('techCreateOrderSelect')?.value||'';
    const o=(data.orders||[]).find(x=>String(x.id)===String(id));
    const box=document.getElementById('techCreatePreview');if(box)box.innerHTML=technologyPreviewHtml();
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
    return `<div class="tech-create-form">${pickField}<div class="field"><label>${escapeHtml(t('technologyName'))}</label><input class="input" id="techCreateName" value="${escapeHtml(nameDefault)}" placeholder="${escapeHtml(t('technologyNamePlaceholder'))}"></div><div class="tech-create-preview" id="techCreatePreview">${technologyPreviewHtml()}</div></div>`;
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
    // v7.20: заказ-источник больше не подтягивает шаги/материалы — технология всегда создаётся
    // пустой, заказ используется только как подсказка названия/изделия (см. technologyPreviewHtml).
    const tc={name,product:o?.product||'',sourceOrderNumber:o?.number||'',steps:[],materials:[],createdBy:(typeof profileDisplayName==='function'?profileDisplayName():'')};
    const ok=await insertTechnologyToSupabase(tc);
    if(!ok)return;
    tc.createdAt=new Date().toISOString();tc.updatedAt=tc.createdAt;
    data.technologies=[tc,...(data.technologies||[])];
    renderTechnologies();
    toast(t('technologySaved'));
    // v7.18: сразу открываем полный экран редактирования (операции + материалы) — тот же
    // самый экран, что используется для уже существующих технологий, — чтобы заполнение
    // происходило ровно так же, как раньше заполнялась технология внутри заказа.
    // v7.21: сначала закрываем модалку создания — деталка теперь страница, а не модальное окно.
    closeModal();
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
    openTechnologyDetail,closeTechnologyDetail,saveTechnologyAndReturn,deleteTechnology,
    openCreateTechnologyModal,refreshTechCreatePreview,saveNewTechnology,
    technologyApplyBarHtml,applyTechnologyToOrder,
    onTechSaveModeChange,openTechnologySaveDialog,confirmTechnologySave,
    addTechOperation,updateTechOperation,removeTechOperation,applyTechOperationTemplate,
    openTechMaterialPicker,updateTechMaterialPickerOptions,toggleTechMaterialPickerAdd,
    addTechMaterialFromStock,updateTechMaterial,removeTechMaterial,
    updateTechnologyWorkshopFilter,updateTechnologyStatusFilter,updateTechnologySortMode,
    resetTechnologyFilters,setTechnologyViewMode,goToTechnologiesPage,
    toggleTechMenu,duplicateTechnology,filteredTechnologies,technologyStatus,
    openTechNewMaterial,attachCreatedTechnologyMaterialToTech,
    getTechPlannedQty,updateTechPlannedQty,technologyMaterialAvailability,technologyOverallAvailability,
    renameTechDetail
  });
})();
