function stockNum(v){const n=Number(String(v??0).replace(',','.'));return Number.isFinite(n)?Number(n.toFixed(3)):0}
function stockNumForUnit(v,unit){const n=stockNum(v);return unit==='шт'?Math.trunc(n):n}
function stockStep(unit){return unit==='шт'?'1':'0.01'}
function stockDefaultValue(unit){return unit==='шт'?'1':'0.01'}
function normalizeStockValue(value,unit,allowZero=true){const raw=String(value??'0').replace(',','.');const n=Number(raw);if(!Number.isFinite(n) || (allowZero?n<0:n<=0))return null;if(unit==='шт'){if(!Number.isInteger(n))return null;return n;}return Number(n.toFixed(3));}
function reservedQty(m){return Math.max(0,stockNumForUnit((m.attributes||{}).reservedQty,m.unit))}
function orderedManualQty(m){return Math.max(0,stockNumForUnit((m.attributes||{}).orderedQty,m.unit))}
function orderedQty(m){return Math.max(0,stockNumForUnit(orderedManualQty(m)+orderedByOrdersQty(m),m.unit))}
function availableQty(m){const u=m.unit;return Math.max(0,stockNumForUnit(stockNumForUnit(m.quantity,u)-reservedQty(m),u))}

function materialOrderedOrders(matId){
  return (data.orders||[])
    .filter(o=>!['Готов','Отменён'].includes(o.status))
    .flatMap(o=>orderMaterials(o).filter(i=>String(i.materialId)===String(matId) && orderItemPurchaseStatus(i)==='ordered' && Number(orderItemPurchaseQty(i,0)||0)>0).map(i=>({order:o,item:i})));
}
function orderedByOrdersQty(m){
  return Math.max(0,stockNumForUnit(materialOrderedOrders(m.id).reduce((s,r)=>s+Number(orderItemPurchaseQty(r.item,0)||0),0),m.unit));
}
function materialReservationOrders(matId){
  return (data.orders||[])
    .filter(o=>!['Готов','Отменён'].includes(o.status))
    .flatMap(o=>orderMaterials(o).filter(i=>String(i.materialId)===String(matId)).map(i=>({order:o,item:i})));
}
function reservationOrdersHtml(m){
  const rows=materialReservationOrders(m.id);
  if(!rows.length)return '<div class="reserve-orders muted">Резерва по заказам нет</div>';
  return `<div class="reserve-orders">${rows.map(r=>`<button class="reserve-order-link" type="button" onclick="goToOrderFromMaterial(event,'${r.order.id}')"><span><b>${escapeHtml(r.order.number||'—')}</b>${r.order.client?` · ${escapeHtml(r.order.client)}`:''}<br><small>Резерв: ${escapeHtml(qtyWithUnit(r.item.qty,m.unit))}</small></span><span class="go">›</span></button>`).join('')}</div>`;
}

function detailItem(label,value,full=false){return `<div class="detail-card ${full?'full':''}"><div class="detail-label">${escapeHtml(label)}</div><div class="detail-value">${value?escapeHtml(value):'—'}</div></div>`}
function reservedForOrdersPanel(m){
  const rows=materialReservationOrders(m.id);
  const total=reservedQty(m);
  if(total<=0) return '';
  if(!rows.length){
    return `<div class="reserved-orders-box"><div class="reserved-orders-title">Резерв</div><div class="reserve-orders muted">${escapeHtml(qtyWithUnit(total,m.unit||'шт'))} · без привязки к заказу</div></div>`;
  }
  return `<div class="reserved-orders-box"><div class="reserved-orders-title">Зарезервировано для заказа</div>${reservationOrdersHtml(m)}</div>`;
}
function manualPurchaseOrderAllocations(m){
  const list=(m.attributes&&Array.isArray(m.attributes.manualPurchaseOrders))?m.attributes.manualPurchaseOrders:[];
  return list
    .map(x=>({orderId:String(x.orderId||''),qty:stockNumForUnit(x.qty||0,m.unit||'шт')}))
    .filter(x=>x.orderId&&x.qty>0);
}
function orderedOrdersHtml(m){
  const rows=materialOrderedOrders(m.id);
  const manual=orderedManualQty(m);
  if(!rows.length && manual<=0)return '<div class="reserve-orders muted">Заказов поставщику нет</div>';

  const allocations=manualPurchaseOrderAllocations(m);
  const allocatedTotal=stockNumForUnit(allocations.reduce((s,x)=>s+Number(x.qty||0),0),m.unit||'шт');
  let manualHtml='';
  if(manual>0 && allocations.length){
    manualHtml=allocations.map(a=>{
      const order=(data.orders||[]).find(o=>String(o.id)===String(a.orderId));
      const title=order?`${escapeHtml(order.number||'—')}${order.client?' · '+escapeHtml(order.client):''}`:'Выбранный заказ';
      return `<button class="reserve-order-link" type="button" onclick="goToOrderFromMaterial(event,'${a.orderId}')"><span><b>${title}</b><br><small>Заказано поставщику: ${escapeHtml(qtyWithUnit(a.qty,m.unit))}</small></span><span class="go">›</span></button>`;
    }).join('');
    const rest=stockNumForUnit(manual-allocatedTotal,m.unit||'шт');
    if(rest>0){
      manualHtml+=`<div class="reserve-order-link" style="cursor:default"><span><b>Ручная закупка</b><br><small>Без привязки: ${escapeHtml(qtyWithUnit(rest,m.unit))}</small></span></div>`;
    }
  }else if(manual>0){
    manualHtml=`<div class="reserve-order-link" style="cursor:default"><span><b>Ручная закупка</b><br><small>Заказано: ${escapeHtml(qtyWithUnit(manual,m.unit))}</small></span></div>`;
  }

  const rowsHtml=rows.map(r=>`<button class="reserve-order-link" type="button" onclick="goToOrderFromMaterial(event,'${r.order.id}')"><span><b>${escapeHtml(r.order.number||'—')}</b>${r.order.client?` · ${escapeHtml(r.order.client)}`:''}<br><small>Заказано: ${escapeHtml(qtyWithUnit(orderItemPurchaseQty(r.item,0),m.unit))}${r.item.purchaseNo?' · '+escapeHtml(r.item.purchaseNo):''}</small></span><span class="go">›</span></button>`).join('');
  return `<div class="reserve-orders">${manualHtml}${rowsHtml}</div>`;
}
function reservationOrdersShort(m){
  const rows=materialReservationOrders(m.id);
  if(!rows.length)return '';
  return `резерв ${qtyWithUnit(reservedQty(m),m.unit)}`;
}

function stockInfoBlock(m){const u=m.unit||'';return `<div class="stock-info-grid"><div class="stock-info-card"><div class="stock-info-label">На складе</div><div class="stock-info-value">${escapeHtml(qtyWithUnit(stockNumForUnit(m.quantity,u),u))}</div></div><div class="stock-info-card"><div class="stock-info-label">Зарезервировано</div><div class="stock-info-value">${escapeHtml(qtyWithUnit(reservedQty(m),u))}</div>${reservationOrdersHtml(m)}</div><div class="stock-info-card"><div class="stock-info-label">Заказано</div><div class="stock-info-value">${escapeHtml(qtyWithUnit(orderedQty(m),u))}</div>${orderedOrdersHtml(m)}</div><div class="stock-info-card"><div class="stock-info-label">Доступно</div><div class="stock-info-value">${escapeHtml(qtyWithUnit(availableQty(m),u))}</div></div></div>`}
function stockNumberInput(id,label,value,unit=''){return `<div class="field"><label>${label}${unit?`, ${escapeHtml(unitLabel(unit))}`:''}</label><input id="${id}" type="number" step="${stockStep(unit)}" min="0" class="input" value="${inputQtyValue(stockNumForUnit(value,unit),unit)}" inputmode="decimal"></div>`}
function stockTripleInputs(prefix, values, unit){return `<div class="stock-input-block"><div class="stock-input-head">Складские количества <button class="info-btn" type="button" onclick="showStockStatusHelp()">i</button></div><div class="stock-input-row">${stockNumberInput(prefix+'Ordered','Заказано',values.ordered,unit)}${stockNumberInput(prefix+'Reserved','Зарезервировано',values.reserved,unit)}${stockNumberInput(prefix+'Qty','На складе',values.qty,unit)}</div></div>`}
function syncStockInputs(prefix,unit){['Qty','Reserved','Ordered','Min'].forEach(suf=>{const el=document.getElementById(prefix+suf);if(!el)return;el.step=stockStep(unit);el.min='0';const v=normalizeStockValue(el.value,unit,true);if(v!==null)el.value=inputQtyValue(v,unit);});const qtyLabel=document.getElementById(prefix+'QtyLabel');if(qtyLabel)qtyLabel.textContent=`На складе, ${unitLabel(unit)}`;}

function stockNeededToOrderQty(m){const u=m.unit||'шт';return Math.max(0,stockNumForUnit(reservedQty(m)-stockNumForUnit(m.quantity,u)-orderedQty(m),u))}
function stockActionSummaryBlock(m){const u=m.unit||'шт';const stock=stockNumForUnit(m.quantity,u);const reserved=reservedQty(m);const ordered=orderedQty(m);const available=availableQty(m);const need=stockNeededToOrderQty(m);const covered=Math.max(0,stockNumForUnit(stock+ordered-reserved,u));return `<div class="stock-action-summary"><div class="stock-action-title">Склад и заказы</div><div class="stock-action-grid"><div class="stock-action-card"><small>На складе</small><b>${escapeHtml(qtyWithUnit(stock,u))}</b></div><div class="stock-action-card"><small>Зарезервировано</small><b>${escapeHtml(qtyWithUnit(reserved,u))}</b></div><div class="stock-action-card"><small>Заказано</small><b>${escapeHtml(qtyWithUnit(ordered,u))}</b></div><div class="stock-action-card ${need>0?'warn':''}"><small>До заказать</small><b>${escapeHtml(qtyWithUnit(need,u))}</b></div></div>${need>0?`<div class="order-material-note compact"><b>Нужно до заказать: ${escapeHtml(qtyWithUnit(need,u))}</b><br>Расчёт: резерв ${escapeHtml(qtyWithUnit(reserved,u))} − склад ${escapeHtml(qtyWithUnit(stock,u))} − уже заказано ${escapeHtml(qtyWithUnit(ordered,u))}.</div>`:''}<div class="stock-action-lists"><div class="stock-action-list"><h5>Резерв по заказам</h5>${reservationOrdersHtml(m)}</div><div class="stock-action-list"><h5>Заказано поставщику</h5>${orderedOrdersHtml(m)}</div></div></div>`}
function purchaseOrderPickerHtml(m){
  const reservations=materialReservationOrders(m.id);
  const selected=new Set(manualPurchaseOrderAllocations(m).map(x=>String(x.orderId)));
  if(!reservations.length){
    return `<div class="purchase-order-picker"><div class="purchase-order-picker-title">Для какого заказа</div><div class="purchase-order-picker-empty">Нет активных заказов с резервом</div></div>`;
  }
  const selectedCount=reservations.filter(r=>selected.has(String(r.order.id))).length;
  const label=selectedCount>0 ? `Выбрано: ${selectedCount}` : 'Выберите заказы';
  const rows=reservations.map(r=>{
    const oid=String(r.order.id);
    const checked=selected.has(oid)?'checked':'';
    return `<label class="purchase-order-option"><input class="manual-purchase-order-check" type="checkbox" value="${escapeHtml(oid)}" ${checked} onchange="refreshPurchaseOrderDropdownLabel(this)"><span><b>${escapeHtml(r.order.number||'—')}${r.order.client?' · '+escapeHtml(r.order.client):''}</b><small>Резерв: ${escapeHtml(qtyWithUnit(r.item.qty,m.unit||'шт'))}</small></span></label>`;
  }).join('');
  return `<div class="purchase-order-picker"><div class="purchase-order-picker-title">Для какого заказа</div><div class="purchase-order-dropdown"><button class="purchase-order-toggle" type="button" onclick="togglePurchaseOrderDropdown(this)"><span>${label}</span></button><div class="purchase-order-list">${rows}</div></div></div>`;
}
function togglePurchaseOrderDropdown(btn){
  const picker=btn.closest('.purchase-order-picker');
  if(!picker)return;
  document.querySelectorAll('.purchase-order-picker.open').forEach(x=>{if(x!==picker)x.classList.remove('open')});
  picker.classList.toggle('open');
}
function refreshPurchaseOrderDropdownLabel(input){
  const picker=input.closest('.purchase-order-picker');
  if(!picker)return;
  const count=picker.querySelectorAll('.manual-purchase-order-check:checked').length;
  const label=picker.querySelector('.purchase-order-toggle span');
  if(label)label.textContent=count>0?`Выбрано: ${count}`:'Выберите заказы';
}
function stockAdjustBlock(m){const step=stockStep(m.unit||'шт');const value=stockDefaultValue(m.unit||'шт');const unitText=unitLabel(m.unit||'шт');const need=stockNeededToOrderQty(m);const orderedInput=need>0?inputQtyValue(need,m.unit||'шт'):inputQtyValue(orderedManualQty(m)||0,m.unit||'шт');return `${stockActionSummaryBlock(m)}<div class="stock-adjust"><div><div class="stock-adjust-title">${t('changeStock')}</div><div class="stock-adjust-current">${escapeHtml(qtyWithUnit(stockNumForUnit(m.quantity,m.unit),m.unit||''))}</div></div><div><label class="field" style="display:block;margin:0"><span style="display:block;font-weight:500;font-size:12px;color:#555c68;margin-bottom:7px">${t('qtyWithUnit')}, ${escapeHtml(unitText)}</span><input id="detailQtyChange" class="input" type="number" step="${step}" min="${step}" value="${value}" inputmode="decimal"></label></div><button class="btn danger-fill" onclick="adjustMaterialQty('${m.id}',-1)">− ${t('writeOff')}</button><button class="btn primary" onclick="adjustMaterialQty('${m.id}',1)">+ ${t('add')}</button></div><div class="stock-order-control"><div><div class="stock-order-control-title">Заказано поставщику</div><div class="stock-order-control-current">${escapeHtml(qtyWithUnit(orderedManualQty(m),m.unit||''))}</div><div class="hint">Выберите один или несколько заказов, для которых оформлена закупка.</div></div>${purchaseOrderPickerHtml(m)}<div><label class="field" style="display:block;margin:0"><span style="display:block;font-weight:500;font-size:12px;color:#555c68;margin-bottom:7px">Количество, ${escapeHtml(unitText)}</span><input id="detailOrderedQty" class="input" type="number" step="${step}" min="0" value="${orderedInput}" inputmode="decimal"></label></div><button class="btn primary" onclick="setMaterialOrderedQty('${m.id}')">Заказано</button></div>`}
function normalizeQtyForUnit(value,unit){return normalizeStockValue(value,unit,false)}
function applyMaterialReceipt(mat, addQty){
  if(!mat) return;
  const unit=mat.unit||'шт';
  mat.attributes=mat.attributes||{};
  const oldStock=stockNumForUnit(mat.quantity,unit);
  const oldOrdered=orderedManualQty(mat);
  mat.quantity=stockNumForUnit(oldStock+addQty,unit);
  mat.attributes.orderedQty=Math.max(0,stockNumForUnit(oldOrdered-addQty,unit));
  const activeReserved=typeof materialReservedOutsideOrder==='function'?materialReservedOutsideOrder(mat.id,''):reservedQty(mat);
  mat.attributes.reservedQty=stockNumForUnit(activeReserved,unit);
  if(mat.attributes.orderedQty<=0 && mat.attributes.purchaseStatus==='ordered'){
    mat.attributes.purchaseStatus=availableQty(mat)>0?'instock':'noorder';
  }
  mat.lastUpdated=today();
}

function detailField(label,value,full=false){return `<div class="detail-field ${full?'full':''}"><small>${escapeHtml(label)}</small><b>${value?value:'—'}</b></div>`}
function materialDetailBasics(m){
  const a=m.attributes||{};
  const rows=[];
  rows.push(detailField('Артикул',escapeHtml(m.sku||'—')));
  rows.push(detailField('Название',escapeHtml(materialDisplayName(m)||m.name||'—')));
  rows.push(detailField('Категория',escapeHtml(categoryLabel(m.category)||'—')));
  if(m.category==='Ткань'){
    const color=a.color||'—';
    rows.push(detailField('Коллекция / код',escapeHtml(a.collection||'—')));
    rows.push(detailField('Цвет',`<span class="color-chip only" title="${escapeHtml(color)}" style="background:${materialColorStyle(color)}"></span>`));
    rows.push(detailField('Тип материала',escapeHtml(a.materialType||'Ткань')));
    if((a.materialType||'Ткань')==='Ткань'){
      rows.push(detailField('Ширина рулона',escapeHtml(a.rollWidth?Number(a.rollWidth).toFixed(2)+' м':'—')));
      rows.push(detailField('Единица учёта','м.п. (метры погонные)'));
    }else{
      rows.push(detailField('Единица учёта','м²'));
    }
  }else if(m.category==='Поролон'){
    rows.push(detailField('Размер',escapeHtml(materialDimensions(m)||'—')));
    rows.push(detailField('Марка / плотность',escapeHtml(a.grade||'—')));
    rows.push(detailField('Единица учёта',escapeHtml(unitLabel(m.unit||'')||'—')));
  }else{
    rows.push(detailField('Тип / размер',escapeHtml(m.subcategory||a.size||a.thickness||'—')));
    rows.push(detailField('Характеристики',escapeHtml(materialCompactText(m)||'—'),true));
  }
  return rows.join('');
}
function materialDetailExtra(m){
  const a=m.attributes||{};
  const rows=[];
  if(m.category==='Ткань'){
    rows.push(detailField('Производитель',escapeHtml(a.manufacturer||'—')));
    rows.push(detailField('Длина рулона',escapeHtml(a.rollLength?Number(a.rollLength).toFixed(2)+' м':'—')));
    rows.push(detailField('Площадь',escapeHtml(a.area?Number(a.area).toFixed(2)+' м²':'0.00 м²')));
  }else{
    rows.push(detailField('Поставщик',escapeHtml(a.supplier||'—')));
    rows.push(detailField('Заказ / закупка',escapeHtml(a.order||'—')));
  }
  const tags=String(a.tags||'').split(',').map(x=>x.trim()).filter(Boolean);
  rows.push(`<div class="detail-field full"><small>Теги</small><div class="detail-tags">${tags.length?tags.map(t=>`<span class="detail-tag">${escapeHtml(t)}</span>`).join(''):'<b>—</b>'}</div></div>`);
  return rows.join('');
}
function materialDetailDocuments(m){
  const a=m.attributes||{};
  if(!(a.pdfName||a.pdfPath||a.pdfUrl)) return `<div class="detail-doc-row"><div class="doc-ico">PDF</div><div class="doc-info"><b>Документ не прикреплён</b><small>Можно добавить при редактировании материала</small></div></div>`;
  return `<div class="detail-doc-row"><div class="doc-ico">PDF</div><div class="doc-info"><b>${escapeHtml(a.pdfName||'Документ PDF')}</b><small>Файл материала</small></div><button class="btn small" type="button" onclick="openMaterialPdf('${m.id}')">Открыть</button></div>`;
}
function openMaterialDetails(id){
  const m=data.materials.find(x=>String(x.id)===String(id));
  if(!m){toast(t('notFoundMaterial'));return;}
  const a=m.attributes||{};
  const st=materialStateOf(m);
  const unit=m.unit||'шт';
  const stock=stockNumForUnit(m.quantity,unit);
  const available=availableQty(m);
  const ordered=orderedQty(m);
  const reserved=reservedQty(m);
  const need=stockNeededToOrderQty(m);
  const area=(m.category==='Ткань' && (a.materialType||'Ткань')==='Ткань' && a.rollWidth)?Number(stock*Number(a.rollWidth||0)).toFixed(2):'';
  const body=`<div class="material-detail-shell"><div class="material-detail-main"><div class="material-hero"><div><h4>${escapeHtml(materialTitle(m)||materialDisplayName(m)||'Материал')}</h4><p>${escapeHtml(categoryLabel(m.category))}${m.subcategory?' · '+escapeHtml(m.subcategory):''}</p></div><span class="status ${st[0]}">${st[1]}</span></div><div class="detail-block"><div class="detail-block-head"><span class="detail-block-icon">i</span>Основная информация</div><div class="detail-field-grid">${materialDetailBasics(m)}</div></div><div class="detail-block"><div class="detail-block-head"><span class="detail-block-icon">＋</span>Дополнительная информация</div><div class="detail-field-grid">${materialDetailExtra(m)}</div></div><div class="detail-block"><div class="detail-block-head"><span class="detail-block-icon">PDF</span>Документы</div>${materialDetailDocuments(m)}</div></div><div class="material-detail-side"><div class="material-side-card"><h5>Остатки и движение</h5><div class="kv-line"><span>На складе</span><b>${escapeHtml(qtyWithUnit(stock,unit))}</b></div><div class="kv-line"><span>Доступно</span><b>${escapeHtml(qtyWithUnit(available,unit))}</b></div>${area?`<div class="kv-line"><span>Площадь по остатку</span><b>${escapeHtml(area)} м²</b></div>`:''}<div class="kv-line"><span>Мин. остаток</span><b>${escapeHtml(qtyWithUnit(m.minQuantity||0,unit))}</b></div><div class="kv-line"><span>Зарезервировано</span><b>${escapeHtml(qtyWithUnit(reserved,unit))}</b></div>${reservedForOrdersPanel(m)}<div class="kv-line"><span>Заказано</span><b>${escapeHtml(qtyWithUnit(ordered,unit))}</b></div><div class="kv-line ${need>0?'danger':''}"><span>Нужно заказать</span><b>${escapeHtml(qtyWithUnit(need,unit))}</b></div></div><div class="material-side-card"><h5>Быстрые действия</h5><div class="quick-move"><label class="field"><span style="display:block;font-weight:500;font-size:12px;color:#555c68;margin-bottom:7px">Изменить остаток, ${escapeHtml(unitLabel(unit))}</span><input id="detailQtyChange" class="input" type="number" step="${stockStep(unit)}" min="${stockStep(unit)}" value="${stockDefaultValue(unit)}" inputmode="decimal"></label><div class="quick-move-actions"><button class="btn danger-fill" onclick="adjustMaterialQty('${m.id}',-1)">− Списать</button><button class="btn primary" onclick="adjustMaterialQty('${m.id}',1)">+ Добавить</button></div></div></div><div class="material-side-card"><h5>Заказ поставщику</h5><div class="quick-move"><div>${purchaseOrderPickerHtml(m)}</div><div class="quick-move-row"><input id="detailOrderedQty" class="input" type="number" step="${stockStep(unit)}" min="0" value="${inputQtyValue(need>0?need:orderedManualQty(m),unit)}" inputmode="decimal"><button class="btn primary" onclick="setMaterialOrderedQty('${m.id}')">Заказано</button></div></div></div></div></div>`;
  const hasPdf=a.pdfPath||a.pdfUrl;
  const foot=`<div class="material-detail-foot"><div class="left"><button class="btn danger" onclick="deleteMaterial('${m.id}')">Удалить материал</button></div><div class="right">${hasPdf?`<button class="btn ghost" onclick="openMaterialPdf('${m.id}')">Открыть PDF</button>`:''}<button class="btn primary" onclick="openMaterialModal('${m.id}')">Редактировать</button></div></div>`;
  openModal(t('infoMaterial'),body,foot);
  const modal=document.querySelector('#modalBackdrop .modal');
  if(modal) modal.classList.add('detail-modal');
}
function openMaterialDetailsFromModal(id){pushModalState();openMaterialDetails(id)}
function statusOf(m){const av=availableQty(m);if(av<=0)return ['out',t('noStock')];if(Number(m.minQuantity||0)>0 && av<=Number(m.minQuantity||0))return ['low',t('lowStock')];return ['ok',t('inStock')]}

function purchaseStatusOf(m){
  const saved=m.attributes&&m.attributes.purchaseStatus;
  const v=saved || (Number(m.quantity||0)>0?'instock':'noorder');
  return ['instock','noorder','needorder','ordered'].includes(v)?v:(Number(m.quantity||0)>0?'instock':'noorder');
}
function materialStateOf(m){
  const unit=m.unit||'шт';
  const stock=stockNumForUnit(m.quantity,unit);
  const reserved=reservedQty(m);
  const available=availableQty(m);
  const min=Number(m.minQuantity||0);
  const ordered=orderedQty(m);
  const purchase=purchaseStatusOf(m);
  const needToOrder=Math.max(0,stockNumForUnit(reserved-stock-ordered,unit));

  // Статусы разделяем так, чтобы не путать физический остаток и свободный остаток:
  // материал есть, но весь занят заказами = «Зарезервировано», а не «Нет в наличии».
  if(needToOrder>0) return ['needorder', `Нужно заказать ${qtyWithUnit(needToOrder,unit)}`];
  if(ordered>0 || purchase==='ordered') return ['ordered', purchaseStatusLabel('ordered')];
  if(available<=0 && stock>0 && reserved>0) return ['reserved', 'Зарезервировано'];
  if(purchase==='needorder' && needToOrder>0) return ['needorder', purchaseStatusLabel('needorder')];
  if(available<=0 && stock<=0) return ['noorder', purchaseStatusLabel('noorder')];
  if(min>0 && available<=min) return ['low', t('lowStock')];
  return ['ok', t('inStock')];
}
function purchaseStatusLabel(value){
  const map={
    ru:{instock:'Есть в наличии',noorder:'Нет на складе',needorder:'Нужно заказать',ordered:'Уже заказана'},
    en:{instock:'In stock',noorder:'No stock',needorder:'Need to order',ordered:'Already ordered'},
    lv:{instock:'Ir noliktavā',noorder:'Nav noliktavā',needorder:'Jāpasūta',ordered:'Jau pasūtīts'}
  };
  return (map[currentLang]||map.ru)[value] || (map.ru[value]||value);
}
function defaultPurchaseStatus(m){
  const a=m?.attributes||{};
  if(a.purchaseStatus) return a.purchaseStatus;
  return Number(m?.quantity||0)>0?'instock':'noorder';
}
function purchaseStatusSelect(id='purchaseStatus', current='instock'){
  return `<select id="${id}" class="select">
    <option value="instock" ${current==='instock'?'selected':''}>${purchaseStatusLabel('instock')}</option>
    <option value="noorder" ${current==='noorder'?'selected':''}>${purchaseStatusLabel('noorder')}</option>
    <option value="needorder" ${current==='needorder'?'selected':''}>${purchaseStatusLabel('needorder')}</option>
    <option value="ordered" ${current==='ordered'?'selected':''}>${purchaseStatusLabel('ordered')}</option>
  </select>`;
}
function purchaseStatusLabelBlock(selectHtml){
  return `<div class="label-row"><label>Статус закупки</label><button class="info-btn" type="button" onclick="showPurchaseStatusInfo()" title="Пояснение">i</button></div>${selectHtml}`;
}
function showPurchaseStatusInfo(){
  alert('Поля склада:\n\nНа складе — физически лежит сейчас.\nЗарезервировано — уже нужно для заказов клиентов.\nЗаказано — едет от поставщика.\nДоступно = На складе − Зарезервировано.\n\nСтатус закупки:\nНет в наличии — материал есть в базе, но покупать пока не нужно.\nНужно заказать — надо купить.\nУже заказана — ждём поставку.');
}

function normalizeSku(v){return String(v||'').trim().toUpperCase().replace(/\s+/g,'')}
function findMaterialBySku(sku){const n=normalizeSku(sku);return data.materials.find(m=>normalizeSku(m.sku)===n)}
function quickUnitBySku(sku){const n=normalizeSku(sku);const prefix=n.split('-')[0];const map={A:'м.п.',P:'м²',K:'м³',F:'м²',SP:'м²',B:'шт',G:'шт',S:'шт',SK:'шт',D:'шт',L:'шт',R:'шт',KA:'шт',M:'шт',KR:'шт',FT:'шт',DET:'шт'};return map[prefix]||''}
function updateQuickAddInfo(){const box=document.getElementById('quickAddBox');const info=document.getElementById('quickInfo');if(!box||!info)return;const sku=quickSku.value;box.classList.remove('found','missing');if(!sku.trim()){info.textContent=t('enterSku');return}const mat=findMaterialBySku(sku);if(mat){box.classList.add('found');info.innerHTML=`<span><b>${mat.name}</b><br><span class="muted">${t('quantity')}: ${mat.quantity} ${unitLabel(mat.unit)}</span></span><span class="unit-pill">${mat.unit}</span>`;return}const unit=quickUnitBySku(sku);box.classList.add('missing');info.innerHTML=unit?`${t('notFoundSku')}. ${t('unit')}: <b>${unitLabel(unit)}</b>`:t('materialNotFound');}

function toggleAdvancedFilters(){
  const panel=document.getElementById('proFilterPanel');
  const btn=document.getElementById('advancedFiltersBtn');
  if(!panel)return;
  panel.classList.toggle('show');
  if(btn)btn.classList.toggle('primary',panel.classList.contains('show'));
}
function setQuickFilter(value){
  activeQuickFilter=value||'all';
  document.querySelectorAll('#quickFilterRow .filter-chip').forEach(b=>b.classList.toggle('active',b.dataset.filter===activeQuickFilter));
  const st=document.getElementById('stockStateFilter');
  if(st){
    if(['needorder','ordered'].includes(activeQuickFilter)) st.value=activeQuickFilter;
    else if(activeQuickFilter==='out') st.value='out';
    else if(activeQuickFilter==='low') st.value='low';
    else if(activeQuickFilter==='all'||activeQuickFilter==='problem'||activeQuickFilter==='reserved') st.value='';
  }
  stockPage=1;
  renderAll();
}
function materialMatchesProfessionalFilters(m){
  const state=materialStateOf(m)[0];
  const unit=document.getElementById('unitFilter')?.value||'';
  const stateFilter=document.getElementById('stockStateFilter')?.value||'';
  const supplier=(document.getElementById('supplierFilter')?.value||'').toLowerCase().trim();
  const order=(document.getElementById('orderFilter')?.value||'').toLowerCase().trim();
  const attrs=m.attributes||{};
  const reserved=reservedQty(m);
  const ordered=orderedQty(m);
  const available=availableQty(m);
  const qty=stockNumForUnit(m.quantity,m.unit);
  const isProblem=available<=0 || state==='low' || state==='needorder' || reserved>qty;
  if(unit && m.unit!==unit) return false;
  if(stateFilter && state!==stateFilter) return false;
  if(supplier && !String(attrs.supplier||'').toLowerCase().includes(supplier)) return false;
  if(order && !String(attrs.order||'').toLowerCase().includes(order)) return false;
  if(activeQuickFilter==='problem' && !isProblem) return false;
  if(activeQuickFilter==='reserved' && reserved<=0) return false;
  if(activeQuickFilter==='needorder' && state!=='needorder') return false;
  if(activeQuickFilter==='ordered' && state!=='ordered') return false;
  if(activeQuickFilter==='out' && !(state==='out'||state==='noorder')) return false;
  if(activeQuickFilter==='low' && state!=='low') return false;
  return true;
}
function refreshQuickFilterChips(){
  document.querySelectorAll('#quickFilterRow .filter-chip').forEach(b=>b.classList.toggle('active',b.dataset.filter===activeQuickFilter));
}

function renderFilters(){
  const cf=document.getElementById('categoryFilter');
  if(!cf)return;
  const currentCat=cf.value||'';
  cf.innerHTML=`<option value="">${t('allCategories')}</option>`+Object.keys(CATEGORIES).map(c=>`<option value="${c}" ${currentCat===c?'selected':''}>${categoryLabel(c)}</option>`).join('');
  cf.onchange=()=>{stockPage=1;updateSubFilter();renderAll()};
  const subEl=document.getElementById('subcategoryFilter');
  if(subEl) subEl.onchange=()=>{stockPage=1;renderAll()};
  const search=document.getElementById('searchInput');
  if(search) search.oninput=()=>{const t=document.getElementById('topSearchInput'); if(t&&t.value!==search.value)t.value=search.value; stockPage=1;renderAll()};
  const top=document.getElementById('topSearchInput'); if(top) top.oninput=()=>{document.getElementById('searchInput').value=top.value;stockPage=1;renderAll()};
}
function updateSubFilter(){const cat=document.getElementById('categoryFilter')?.value||'';const sf=document.getElementById('subcategoryFilter');if(!sf)return;const currentSub=sf.value||'';let subs=cat?(CATEGORIES[cat].subs||[]):Object.values(CATEGORIES).flatMap(x=>x.subs||[]);sf.innerHTML=`<option value="">${t('allSubcategories')}</option>`+subs.map(s=>`<option ${currentSub===s?'selected':''}>${s}</option>`).join('')}
function filteredMaterials(){const q=document.getElementById('searchInput')?.value?.toLowerCase()||'';const cat=document.getElementById('categoryFilter')?.value||'';const sub=document.getElementById('subcategoryFilter')?.value||'';return data.materials.filter(m=>(!cat||m.category===cat)&&(!sub||m.subcategory===sub)&&materialMatchesProfessionalFilters(m)&&(!q||JSON.stringify(m).toLowerCase().includes(q))).sort((a,b)=>{let av=a[sortKey]??'',bv=b[sortKey]??'';if(sortKey==='quantity'||sortKey==='minQuantity'){av=Number(av);bv=Number(bv)}return av>bv?sortDir:av<bv?-sortDir:0})}
function renderStats(){const total=data.materials.length;const low=data.materials.filter(m=>statusOf(m)[0]==='low').length;const out=data.materials.filter(m=>statusOf(m)[0]==='out').length;const cats=new Set(data.materials.map(m=>m.category)).size;document.getElementById('stats').innerHTML=`<div class="stat"><div><span>${t('totalItems')}</span><b>${total}</b></div><div class="sico"><svg viewBox="0 0 24 24"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg></div></div><div class="stat"><div><span>${t('categories')}</span><b>${cats}</b></div><div class="sico"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg></div></div><div class="stat"><div><span>${t('lowStock')}</span><b>${low}</b></div><div class="sico"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><path d="M12 17h.01"/></svg></div></div><div class="stat"><div><span>${t('outStock')}</span><b>${out}</b></div><div class="sico"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg></div></div>`}
function badge(m){const cls=CATEGORIES[m.category]?.cls||'';return `<span class="badge ${cls}">${m.category}${m.subcategory?' · '+m.subcategory:''}</span>`}
function stockCategoryTabs(){
  const cats=['Ткань','Поролон','Древесина','Фанера','ДСП','Фурнитура','Крепёж'];
  const active=document.getElementById('categoryFilter')?.value || 'Ткань';
  return `<div class="category-tabs">${cats.map(c=>`<button class="category-tab ${active===c?'active':''}" type="button" onclick="selectStockCategory('${c}')">${escapeHtml(categoryLabel(c))}</button>`).join('')}</div>`;
}
function selectStockCategory(cat){
  const cf=document.getElementById('categoryFilter');
  if(cf) cf.value=cat;
  const sf=document.getElementById('subcategoryFilter');
  if(sf) sf.value='';
  stockPage=1;
  updateSubFilter();
  renderAll();
}
function stockFiltersForCategory(cat){
  const searchValue=escapeHtml(document.getElementById('searchInput')?.value||'');
  let extra='';
  if(cat==='Ткань'){
    extra=`<select class="select" id="fabricCollectionFilter" onchange="stockPage=1;renderStock()"><option value="">${t('allCollections')}</option>${[...new Set((data.materials||[]).filter(m=>m.category==='Ткань').map(m=>(m.attributes||{}).collection).filter(Boolean))].map(v=>`<option ${document.getElementById('fabricCollectionFilter')?.value===v?'selected':''}>${escapeHtml(v)}</option>`).join('')}</select><input class="input" id="fabricColorFilter" placeholder="${t('allColors')}" value="${escapeHtml(document.getElementById('fabricColorFilter')?.value||'')}" oninput="stockPage=1;renderStock()">`;
  }else{
    extra=`<select class="select" id="stockStateFilterLocal" onchange="stockPage=1;renderStock()"><option value="">${t('allStates')}</option><option value="needorder" ${document.getElementById('stockStateFilterLocal')?.value==='needorder'?'selected':''}>${t('needToOrder')}</option><option value="low" ${document.getElementById('stockStateFilterLocal')?.value==='low'?'selected':''}>${t('lowStock')}</option><option value="ok" ${document.getElementById('stockStateFilterLocal')?.value==='ok'?'selected':''}>${t('normal')}</option></select><span></span>`;
  }
  return `<div class="category-filter-row"><div class="searchbox"><svg viewBox="0 0 24 24"><path d="M21 21l-4.3-4.3"/><circle cx="11" cy="11" r="7"/></svg><input class="input" id="categorySearchInput" placeholder="${t(cat==='Ткань'?'searchFabric':'searchMaterials')}" value="${searchValue}" oninput="document.getElementById('searchInput').value=this.value;stockPage=1;renderStock()"></div>${extra}<button class="btn" onclick="toggleAdvancedFilters()">${t('filters')}</button><button class="btn" onclick="clearFilters()">${t('reset')}</button></div>`;
}
function attentionMaterials(limit){
  const rows=(data.materials||[])
    .map(m=>({m,st:materialStateOf(m),need:stockNeededToOrderQty(m),available:availableQty(m)}))
    .filter(x=>x.need>0 || x.st[0]==='low')
    .sort((a,b)=> (b.need>0)-(a.need>0) || b.need-a.need);
  return Number.isFinite(limit)?rows.slice(0,limit):rows;
}
function attentionRowHtml(x){
  const m=x.m;const need=x.need;const low=x.st[0]==='low'&&need<=0;
  return `<button class="attention-row" type="button" onclick="openMaterialDetails('${m.id}')"><span class="att-dot ${need>0?'need':''}"></span><span class="att-main"><b>${escapeHtml(materialDisplayName(m))}</b><span>${escapeHtml(categoryLabel(m.category))}</span></span><span><span class="att-badge ${low?'low':''}">${need>0?'Нужно заказать':'Заканчивается'}</span></span><span class="att-cell"><small>На складе</small><b>${escapeHtml(qtyWithUnit(stockNumForUnit(m.quantity,m.unit),m.unit))}</b></span><span class="att-cell"><small>${need>0?'Нужно':'Мин. остаток'}</small><b>${escapeHtml(qtyWithUnit(need>0?need:m.minQuantity,m.unit))}</b></span><span class="att-go">›</span></button>`;
}
function renderAttentionBlock(){
  const all=attentionMaterials();
  const rows=all.slice(0,4);
  if(!all.length){return `<div class="attention-card compact-attention no-more"><div class="attention-head"><b>${t('attentionTitle')}</b><small>${t('noProblems')}</small></div><div class="att-empty">${t('allMaterialsNormal')}</div></div>`}
  const more=all.length>rows.length;
  return `<div class="attention-card compact-attention ${more?'':'no-more'}"><div class="attention-head"><b>${t('attentionTitle')}</b><small>${all.length} ${t('itemsWord')}</small></div><div class="attention-list">${rows.map(attentionRowHtml).join('')}</div><div class="attention-more"><button class="btn small" onclick="openAttentionModal()">${t('showAll')}</button></div></div>`;
}

function renderStockChartBlock(){
  const w=560,h=210,padL=42,padR=12,padT=18,padB=30;
  const cats=['Поролон','Ткань','Древесина'];
  const colors={'Поролон':'#1570ef','Ткань':'#7c3aed','Древесина':'#f97316'};
  const totals={};
  cats.forEach(c=>{totals[c]=(data.materials||[]).filter(m=>m.category===c).reduce((s,m)=>s+Number(m.quantity||0),0)});
  const max=Math.max(10,...Object.values(totals));
  const points={};
  cats.forEach((c,ci)=>{
    const base=totals[c]||0;
    points[c]=Array.from({length:8},(_,i)=>{
      const factor=1-(7-i)*0.035 + (ci===1&&i>3?0.06:0) + (ci===2?-(7-i)*0.015:0);
      return Math.max(0,base*factor);
    });
  });
  const x=i=>padL+i*((w-padL-padR)/7);
  const y=v=>padT+(max-v)/max*(h-padT-padB);
  const line=c=>points[c].map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
  const dots=c=>points[c].map((v,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${colors[c]}"/>`).join('');
  return `<div class="stock-chart-card"><div class="stock-chart-head"><b>${t('stockDynamics')}</b><select class="select"><option>${t('allCategories')}</option></select></div><div class="chart-legend"><span><i class="legend-dot legend-blue"></i>${categoryLabel('Поролон')}</span><span><i class="legend-dot legend-purple"></i>${t('fabrics')}</span><span><i class="legend-dot legend-orange"></i>${categoryLabel('Древесина')}</span></div><div class="stock-chart"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${[0,1,2,3].map(i=>{const yy=padT+i*((h-padT-padB)/3);return `<line class="chart-grid" x1="${padL}" y1="${yy}" x2="${w-padR}" y2="${yy}"/>`}).join('')}${[0,1,2,3,4,5,6,7].map(i=>`<line class="chart-grid" x1="${x(i)}" y1="${padT}" x2="${x(i)}" y2="${h-padB}"/>`).join('')}<line class="chart-axis" x1="${padL}" y1="${h-padB}" x2="${w-padR}" y2="${h-padB}"/>${[0,1,2,3].map(i=>{const val=Math.round(max-(i*max/3));const yy=padT+i*((h-padT-padB)/3);return `<text class="chart-label" x="4" y="${yy+4}">${val}</text>`}).join('')}<text class="chart-label" x="${padL}" y="${h-8}">01.06</text><text class="chart-label" x="${x(2)}" y="${h-8}">08.06</text><text class="chart-label" x="${x(4)}" y="${h-8}">15.06</text><text class="chart-label" x="${x(6)}" y="${h-8}">22.06</text><text class="chart-label" x="${x(7)-22}" y="${h-8}">29.06</text>${cats.map(c=>`<path d="${line(c)}" fill="none" stroke="${colors[c]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots(c)}`).join('')}</svg></div><div style="padding:0 16px 16px"><button class="btn small" type="button">${t('details')}</button></div></div>`;
}

function filteredMaterialsForSmartTable(cat){
  let rows=filteredMaterials().filter(m=>m.category===cat);
  if(cat==='Ткань'){
    const coll=(document.getElementById('fabricCollectionFilter')?.value||'').toLowerCase();
    const color=(document.getElementById('fabricColorFilter')?.value||'').toLowerCase();
    rows=rows.filter(m=>{
      const a=m.attributes||{};
      return (!coll||String(a.collection||'').toLowerCase()===coll) && (!color||String(a.color||'').toLowerCase().includes(color));
    });
  }else{
    const st=document.getElementById('stockStateFilterLocal')?.value||'';
    if(st) rows=rows.filter(m=>materialStateOf(m)[0]===st);
  }
  return rows;
}
function tableColumnsByCategory(cat){
  if(cat==='Ткань') return [t('sku'),t('name'),t('collectionCode'),t('color'),t('rollWidth'),t('stockLinear'),t('minLinear'),t('needToOrder'),t('condition')];
  if(cat==='Поролон') return [t('sku'),t('material'),t('size'),t('densityGrade'),t('inStock'),t('available'),t('ordered'),t('minQuantity'),t('condition')];
  if(['Древесина','Фанера','ДСП'].includes(cat)) return [t('sku'),t('material'),t('typeSize'),t('woodGrade'),t('inStock'),t('available'),t('ordered'),t('minQuantity'),t('condition')];
  return [t('sku'),t('material'),t('description'),t('inStock'),t('available'),t('ordered'),t('minQuantity'),t('condition')];
}
function materialColorStyle(color){
  const c=String(color||'').toLowerCase();
  const map={графит:'#374151',серый:'#9ca3af',бежевый:'#d6c7b5',черный:'#111827',чёрный:'#111827',белый:'#f8fafc',коричневый:'#8b5e34',синий:'#3b82f6',зеленый:'#22c55e',зелёный:'#22c55e',красный:'#ef4444'};
  return map[c]||'#d1d5db';
}
function smartRowByCategory(m,cat){
  const a=m.attributes||{};const st=materialStateOf(m);const need=stockNeededToOrderQty(m);const av=availableQty(m);const ordered=orderedQty(m);
  const state=`<span class="status ${st[0]}">${st[1]}</span>`;
  if(cat==='Ткань'){
    const color=a.color||'—';
    const type=a.materialType||'Ткань';
    return `<tr onclick="openMaterialDetails('${m.id}')"><td><span class="stock-sku">${escapeHtml(m.sku||'—')}</span></td><td>${escapeHtml(m.name||'—')}<div class="sub">${escapeHtml(type)}</div></td><td>${escapeHtml(a.collection||'—')}</td><td><span class="color-chip only" title="${escapeHtml(color)}" style="background:${materialColorStyle(color)}"></span></td><td>${escapeHtml(a.rollWidth?Number(a.rollWidth).toFixed(2)+' м':'—')}</td><td class="${stockNumForUnit(m.quantity,m.unit)<=Number(m.minQuantity||0)?'stock-warn':''}">${escapeHtml(qtyWithUnit(stockNumForUnit(m.quantity,m.unit),m.unit))}</td><td>${escapeHtml(qtyWithUnit(m.minQuantity||0,m.unit))}</td><td class="${need>0?'stock-danger':''}">${escapeHtml(qtyWithUnit(need,m.unit))}</td><td>${state}</td></tr>`;
  }
  if(cat==='Поролон'){
    return `<tr onclick="openMaterialDetails('${m.id}')"><td><span class="stock-sku">${escapeHtml(m.sku||'—')}</span></td><td>${escapeHtml(materialDisplayName(m))}</td><td>${escapeHtml(materialDimensions(m)||'—')}</td><td>${escapeHtml(materialDensity(m))}</td><td>${escapeHtml(qtyWithUnit(stockNumForUnit(m.quantity,m.unit),m.unit))}</td><td class="${av<=0?'stock-danger':''}">${escapeHtml(qtyWithUnit(av,m.unit))}</td><td>${escapeHtml(qtyWithUnit(ordered,m.unit))}</td><td>${escapeHtml(qtyWithUnit(m.minQuantity||0,m.unit))}</td><td>${state}</td></tr>`;
  }
  const desc=materialCompactText(m)||'—';
  return `<tr onclick="openMaterialDetails('${m.id}')"><td><span class="stock-sku">${escapeHtml(m.sku||'—')}</span></td><td>${escapeHtml(materialDisplayName(m))}</td><td>${escapeHtml(m.subcategory||a.size||a.thickness||'—')}</td><td>${escapeHtml(a.woodType||a.grade||a.decor||'—')}</td><td>${escapeHtml(qtyWithUnit(stockNumForUnit(m.quantity,m.unit),m.unit))}</td><td class="${av<=0?'stock-danger':''}">${escapeHtml(qtyWithUnit(av,m.unit))}</td><td>${escapeHtml(qtyWithUnit(ordered,m.unit))}</td><td>${escapeHtml(qtyWithUnit(m.minQuantity||0,m.unit))}</td><td>${state}</td></tr>`;
}
function renderStock(){
  const cf=document.getElementById('categoryFilter');
  if(cf && !cf.value) cf.value='Ткань';
  const cat=cf?.value || 'Ткань';
  const rows=filteredMaterialsForSmartTable(cat);
  const box=document.getElementById('stockTable');
  const totalPages=Math.max(1,Math.ceil(rows.length/stockPageSize));
  stockPage=Math.min(Math.max(1,stockPage),totalPages);
  const startIndex=(stockPage-1)*stockPageSize;
  const pageRows=rows.slice(startIndex,startIndex+stockPageSize);
  const cols=tableColumnsByCategory(cat);
  const pages=Array.from({length:totalPages},(_,i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-stockPage)<=1);
  let last=0;
  const pageButtons=pages.map(p=>{const gap=p-last>1?`<span class="muted">…</span>`:'';last=p;return gap+`<button class="pagebtn ${p===stockPage?'active':''}" onclick="setStockPage(${p})">${p}</button>`}).join('');
  box.innerHTML=`<div class="stock-workspace"><div class="stock-dashboard-row">${renderAttentionBlock()}${renderStockChartBlock()}</div><div class="stock-list-card"><div class="stock-list-top">${stockFiltersForCategory(cat)}${stockCategoryTabs()}</div><div class="smart-table-wrap stock-list-table"><table class="smart-stock-table"><thead><tr>${cols.map(c=>`<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${pageRows.length?pageRows.map(m=>smartRowByCategory(m,cat)).join(''):`<tr><td colspan="${cols.length}"><div class="empty"><b>${t('noMaterialsTitle')}</b>${t('addOrChangeFilters')}</div></td></tr>`}</tbody></table></div><div class="table-foot"><span>${t('shown')} <strong>${rows.length?startIndex+1:0}–${startIndex+pageRows.length}</strong> ${t('of')} ${rows.length} ${t('itemsWord')}</span><div class="pager"><span>${t('showBy')} 15</span><button class="pagebtn ${stockPage<=1?'disabled':''}" onclick="setStockPage(${stockPage-1})">‹</button>${pageButtons}<button class="pagebtn ${stockPage>=totalPages?'disabled':''}" onclick="setStockPage(${stockPage+1})">›</button></div></div></div></div>`;
}
function setStockPage(page){stockPage=page;renderStock()}
function setSort(k){if(sortKey===k)sortDir*=-1;else{sortKey=k;sortDir=1}stockPage=1;renderStock()}
function clearFilters(){document.getElementById('searchInput').value='';const t=document.getElementById('topSearchInput');if(t)t.value='';document.getElementById('categoryFilter').value='';document.getElementById('subcategoryFilter').value='';['stockStateFilter','unitFilter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});['supplierFilter','orderFilter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});activeQuickFilter='all';refreshQuickFilterChips();stockPage=1;updateSubFilter();renderAll()}

function categoryHint(cat){const map={'Поролон':'hintFoam','Ткань':'hintFabric','Древесина':'hintWood','Фанера':'hintPlywood','ДСП':'hintChipboard','Крепёж':'hintFasteners','Фурнитура':'hintHardware'};return t(map[cat]||'')}

function materialFields(cat,sub,attrs={}){let fields=CATEGORIES[cat]?.fieldsBySub?.[sub]||CATEGORIES[cat]?.fields||[];return fields.map(([key,label,type='text'])=>`<div class="field"><label>${label}</label>${type==='checkbox'?`<select class="select attr" data-key="${key}"><option value="false">Нет</option><option value="true" ${attrs[key]?'selected':''}>Да</option></select>`:`<input class="input attr" data-key="${key}" type="${type}" value="${attrs[key]??''}">`}</div>`).join('')}
function openMaterialModal(id=null, presetCategory='Ткань'){
  if(!requireAuth())return;
  const foundMaterial=id?data.materials.find(x=>String(x.id)===String(id)):null;
  if(id && !foundMaterial){toast('Материал не найден'); return;}
  if(foundMaterial && foundMaterial.category==='Поролон'){openFoamModal(id);return;}
  if(foundMaterial && foundMaterial.category==='Ткань'){openFabricModal(id);return;}
  const isEdit=!!id;
  const preset=CATEGORIES[presetCategory]?presetCategory:'Ткань';
  const firstSub=(CATEGORIES[preset]?.subs||[])[0]||'';
  const m=foundMaterial||{category:preset,subcategory:firstSub,attributes:{},unit:CATEGORIES[preset]?.unit||'м²',quantity:0,minQuantity:0};
  const autoSku=!id;
  const stockBlock=isEdit
    ? `<div class="field">${purchaseStatusLabelBlock(purchaseStatusSelect('mPurchaseStatus',defaultPurchaseStatus(m)))}</div><div class="field"><label>${t('minQuantity')}</label><input id="mMin" type="number" step="${stockStep(m.unit||'м²')}" min="0" class="input" value="${inputQtyValue(stockNumForUnit(m.minQuantity||0,m.unit||'м²'),m.unit||'м²')}" inputmode="decimal"></div>${stockTripleInputs('m',{ordered:(m.attributes||{}).orderedQty||0,reserved:(m.attributes||{}).reservedQty||0,qty:m.quantity||0},m.unit||'м²')}<div class="field"><label>${t('unit')}</label><input id="mUnit" class="input" value="${m.unit||'м²'}"></div>`
    : `<div class="field"><label>${t('unit')}</label><input id="mUnit" class="input" value="${m.unit||'м²'}"></div><div class="add-material-simple-stock"><div class="field"><label>На складе</label><input id="mQty" type="number" step="${stockStep(m.unit||'м²')}" min="0" class="input" value="0" inputmode="decimal"></div><div class="field"><label>${t('minQuantity')}</label><input id="mMin" type="number" step="${stockStep(m.unit||'м²')}" min="0" class="input" value="0" inputmode="decimal"></div></div>`;
  const body=`<div class="step-title"><span>1</span> ${t('materialBasic')}</div><div class="form-grid"><div class="field"><label>${t('sku')}</label><input id="mSku" class="input" value="${m.sku||nextSku(m.category,m.subcategory,id||'')}"><div class="hint">${t('skuAutoHint')}</div></div><div class="field"><label>${t('name')}</label><input id="mName" class="input" value="${m.name||''}"></div><div class="field"><label>${t('category')}</label><select id="mCat" class="select">${Object.keys(CATEGORIES).map(c=>`<option value="${c}" ${m.category===c?'selected':''}>${categoryLabel(c)}</option>`).join('')}</select></div><div class="field"><label>${t('subcategory')}</label><select id="mSub" class="select"></select></div></div><div class="step-title"><span>2</span> ${t('materialAttrs')}</div><div class="form-grid" id="attrBox"></div><div class="step-title"><span>3</span> ${t('materialStock')}</div><div class="form-grid">${stockBlock}</div>`;
  const foot=`<button class="btn" onclick="closeModal()">${t('cancel')}</button><button class="btn primary" onclick="saveMaterial('${id||''}')">${t('save')}</button>`;
  openModal(id?t('edit'):t('addMaterial'),body,foot);
  const catEl=document.getElementById('mCat'),subEl=document.getElementById('mSub'),unitEl=document.getElementById('mUnit'),skuEl=document.getElementById('mSku');
  function refreshSku(){if(autoSku)skuEl.value=nextSku(catEl.value,subEl.value,id||'')}
  function redraw(){const cat=catEl.value;const subs=CATEGORIES[cat].subs||[];subEl.innerHTML=`<option value="">${t('noSubcategory')}</option>`+subs.map(s=>`<option ${m.subcategory===s?'selected':''}>${s}</option>`).join('');unitEl.value=CATEGORIES[cat].unit;syncStockInputs('m',unitEl.value);document.getElementById('attrBox').innerHTML=materialFields(cat,subEl.value,m.attributes||{});refreshSku()}
  catEl.onchange=()=>{m.subcategory='';redraw()};
  subEl.onchange=()=>{document.getElementById('attrBox').innerHTML=materialFields(catEl.value,subEl.value,m.attributes||{});refreshSku()};
  unitEl.oninput=()=>syncStockInputs('m',unitEl.value);
  redraw();
}
async function saveMaterial(id){const cat=document.getElementById('mCat').value;const attrs={};document.querySelectorAll('.attr').forEach(i=>attrs[i.dataset.key]=i.value==='true'?true:i.value==='false'?false:i.value);const unit=mUnit.value||'м²';const q=normalizeStockValue(mQty.value,unit,true), mn=normalizeStockValue(mMin.value,unit,true);const rs=document.getElementById('mReserved')?normalizeStockValue(mReserved.value,unit,true):0;const od=document.getElementById('mOrdered')?normalizeStockValue(mOrdered.value,unit,true):0;if(q===null||mn===null||rs===null||od===null){toast(unit==='шт'?t('fieldWhole'):t('fieldMinZero'));return;}attrs.purchaseStatus=document.getElementById('mPurchaseStatus')?.value || (q>0?'instock':'noorder');attrs.reservedQty=rs;attrs.orderedQty=od;const obj={id:id||null,sku:mSku.value.trim()||nextSku(cat,mSub.value,id||''),name:mName.value.trim()||'Без названия',category:cat,subcategory:mSub.value,attributes:attrs,unit,quantity:q,minQuantity:mn,lastUpdated:today()};const ok=id?await updateMaterialInSupabase(obj):await insertMaterialToSupabase(obj);if(!ok)return;if(id){closeModal();await loadMaterialsFromSupabase();if(document.getElementById('orderMaterialsBox')){rebuildOrderMaterialOptions();refreshOrderMaterialRows();}toast(t('savedMaterial'));return;}await finishMaterialSaveAndReturn(obj.sku,obj.category)}
async function deleteMaterial(id){
  const mat=data.materials.find(x=>String(x.id)===String(id));
  const title=mat?materialTitle(mat):'материал';
  const usedInOrders=(data.orders||[]).filter(o=>orderMaterials(o).some(i=>String(i.materialId)===String(id)));
  const msg=usedInOrders.length
    ? `Удалить материал полностью?\n\n${title} используется в заказах: ${usedInOrders.map(o=>o.number||'—').join(', ')}.\nПосле удаления он исчезнет из склада и из этих заказов.`
    : `Удалить материал полностью?\n\n${title} будет удалён со склада.`;
  if(!confirm(msg))return;
  const ok=await deleteMaterialFromSupabase(id);
  if(!ok)return;
  data.models.forEach(m=>m.items=m.items.filter(i=>String(i.materialId)!==String(id)));
  data.orders.forEach(o=>{if(Array.isArray(o.materials))o.materials=o.materials.filter(i=>String(i.materialId)!==String(id));});
  save();
  closeModal();
  await loadMaterialsFromSupabase();
  renderAll();
  toast('Материал удалён');
}
