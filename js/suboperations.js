// v8.31: отметки по ОПЕРАЦИЯМ внутри этапа (цех).
// Если у этапа технологии есть операции (например, этап «Поклейка» → боковины / спинки / седушки), рабочий в цеху
// выбирает, что именно он сделал, и вводит количество. Система ведёт свой счётчик по каждой операции
// (op.subMarks — журнал отметок), а «комплект» считается готовым, когда по ВСЕМ операциям набрано нужное число:
// комплектов = минимум из «сделано» по операциям. Как только комплектов становится больше, чем уже записано в выпуск
// этапа, система сама записывает разницу обычным способом (finalizeProductionQuantity с kit:true) — при этом
// списываются материалы, растёт «Выполнено» по этапу, а при полном комплекте на весь заказ этап закрывается.
// Этапы без операций работают как раньше.
(function(){
  const selected=new Map(); // «заказ_этап» → id выбранной операции
  const skey=(orderId,index)=>`${orderId}_${index}`;
  const findOrder=id=>(data.orders||[]).find(x=>String(x.id)===String(id));
  function stageSubOps(o,index){const s=orderSteps(o)[Number(index)];return Array.isArray(s?.operations)?s.operations.filter(x=>x&&x.id&&String(x.name||'').trim()):[]}
  function hasSubOps(o,index){return stageSubOps(o,index).length>0}
  const marksOf=op=>Array.isArray(op?.subMarks)?op.subMarks:[];
  // v8.38: «деталей в изделии» убрали — у каждой операции снова 1 деталь = 1 изделие, как в v8.31.
  function subTarget(o,s){return orderProductQty(o)}
  // Выпуск, записанный обычным способом (до разбивки этапа на операции): засчитывается по ВСЕМ операциям — это уже сделанные
  // полные изделия. Автозаписи комплектов (kit) сюда не входят, они пришли из отметок операций.
  function classicBase(o,op){
    const kit=(Array.isArray(op?.sessions)?op.sessions:[]).reduce((n,x)=>n+(x&&!x.undone&&x.kit?Math.max(0,Number(x.qty)||0):0),0);
    return Math.max(0,productionCompletedQty(o,op)-kit);
  }
  function partsDone(o,op,s,skip,extra){
    const marks=marksOf(op).reduce((n,m)=>n+(m&&!m.undone&&m!==skip&&String(m.subId)===String(s.id)?Math.max(0,Number(m.qty)||0):0),0);
    return Math.min(subTarget(o,s),classicBase(o,op)+marks+(extra&&String(extra.subId)===String(s.id)?extra.qty:0));
  }
  function subDone(o,op,subId){
    const s=stageSubOps(o,op.stepIndex).find(x=>String(x.id)===String(subId));
    return s?partsDone(o,op,s,null,null):0;
  }
  // комплектов (изделий) = минимум по операциям из «целых» наборов деталей: floor(сделано деталей / деталей в изделии)
  function subKits(o,op,skip,extra){
    const subs=stageSubOps(o,op.stepIndex);if(!subs.length)return 0;
    return Math.min(orderProductQty(o),...subs.map(s=>partsDone(o,op,s,skip,extra)));
  }
  function selectedSubId(o,index,opArg){
    const subs=stageSubOps(o,index),op=opArg||productionOp(o,index),cur=selected.get(skey(o.id,index));
    if(cur&&subs.some(s=>String(s.id)===String(cur)))return cur;
    const open=op?subs.filter(s=>subDone(o,op,s.id)<orderProductQty(o)):subs;
    return open.length===1?open[0].id:''; // осталась одна невыполненная — выбираем её сами
  }
  function rerender(orderId){
    const ws=document.getElementById('workshops');
    if(ws&&ws.classList.contains('active')&&typeof renderWorkshops==='function')renderWorkshops();
    else if(typeof refreshOrderWorkflow==='function')refreshOrderWorkflow(orderId);
  }
  function selectSubOp(orderId,index,subId){selected.set(skey(orderId,index),String(subId));rerender(orderId)}

  function byPersonText(op,subId){
    const map=new Map();
    marksOf(op).forEach(m=>{if(!m||m.undone||String(m.subId)!==String(subId))return;const k=m.by||'—';map.set(k,(map.get(k)||0)+(Number(m.qty)||0))});
    return [...map.entries()].map(([n,q])=>`${escapeHtml(n)} ${q}`).join(' · ');
  }
  // Панель «Операции комплекта»: прогресс по каждой операции, выбор «что делаю сейчас», сколько комплектов собрано.
  // Шаблон технологии, привязанный к заказу, мог быть разбит на операции ПОСЛЕ того, как этапы скопировались в заказ.
  function templateOpsFor(o,index){
    const tc=o.technologyId?(data.technologies||[]).find(x=>String(x.id)===String(o.technologyId)):null;if(!tc)return null;
    const st=orderSteps(o)[Number(index)];if(!st)return null;
    const nm=x=>String(x?.name||'').trim(),tsteps=Array.isArray(tc.steps)?tc.steps:[];
    const ts=tsteps[index]&&nm(tsteps[index])===nm(st)?tsteps[index]:tsteps.find(x=>nm(x)===nm(st));
    const ops=Array.isArray(ts?.operations)?ts.operations.filter(x=>x&&x.id&&nm(x)):[];
    return ops.length?{tc,ops}:null;
  }
  function syncHintHtml(o,op){
    const tpl=templateOpsFor(o,op.stepIndex);if(!tpl||op.status==='done'||op.status==='cancelled')return '';
    const can=typeof userCan==='function'?userCan('orders.technology'):true;
    const txt=String(t('subOpSyncText')).replace('{tech}',tpl.tc.name||'').replace('{stage}',op.stepName||'').replace('{ops}',tpl.ops.map(x=>x.name).join(', '));
    return `<div class="subops-sync"><span>${escapeHtml(txt)}</span>${can?`<button type="button" class="btn small primary" onclick="syncStageOpsFromTemplate('${o.id}',${op.stepIndex})">${escapeHtml(t('subOpSyncBtn'))}</button>`:`<small>${escapeHtml(t('subOpSyncNoRight'))}</small>`}</div>`;
  }
  async function syncStageOpsFromTemplate(orderId,index){
    const o=findOrder(orderId);if(!o)return;
    const tpl=templateOpsFor(o,index);if(!tpl)return;
    const st=orderSteps(o)[index],op=productionOp(o,index),done=op?productionCompletedQty(o,op):0;
    const ops=tpl.ops.map(x=>({id:x.id,name:x.name,perUnit:Math.max(1,Math.round(Number(x.perUnit)||1)),minutes:Math.max(0,Number(x.minutes)||0)}));
    const newMin=ops.reduce((n,x)=>n+Math.round(x.minutes*x.perUnit),0);
    const msg=String(t('subOpSyncConfirm')).replace('{stage}',st.name||'').replace('{ops}',ops.map(x=>x.name).join(', ')).replace('{done}',done).replace('{old}',Number(st.minutes||0)).replace('{new}',newMin);
    if(!confirm(msg))return;
    o.steps=orderSteps(o).map(x=>({...x}));
    o.steps[index].operations=ops;
    if(newMin>0)o.steps[index].minutes=newMin;
    await persistProductionWorkflow(o,`${tRu('subOpAuditSync')}: ${st.name} → ${ops.map(x=>x.name).join(', ')}`,'technology_operations_synced',{step:st.name,operations:ops.map(x=>x.name)});
  }
  function subOpsPanelHtml(o,op){
    const index=op.stepIndex,subs=stageSubOps(o,index);if(!subs.length)return syncHintHtml(o,op);
    const sel=selectedSubId(o,index,op),canPick=op.status!=='done'&&op.status!=='cancelled';
    const dones=subs.map(s=>subDone(o,op,s.id)),targets=subs.map(s=>subTarget(o,s)),minDone=Math.min(...dones),maxDone=Math.max(...dones);
    const rows=subs.map((s,i)=>{
      const d=dones[i],tg=targets[i],pct=tg?Math.round(d/tg*100):0,full=d>=tg,lag=!full&&d===minDone&&maxDone>minDone,isSel=String(s.id)===String(sel);
      const who=byPersonText(op,s.id);
      return `<button type="button" class="subop-row ${isSel?'selected':''} ${full?'full':''}" aria-pressed="${isSel}" ${canPick&&!full?'':'disabled'} onclick="selectSubOp('${o.id}',${index},'${escapeHtml(String(s.id))}')">
        <span class="subop-radio" aria-hidden="true">${full?'✓':isSel?'●':'○'}</span>
        <span class="subop-main"><b>${escapeHtml(s.name)}</b><i class="subop-bar"><u style="width:${pct}%"></u></i>${who?`<small>${who}</small>`:''}</span>
        <span class="subop-num"><b>${d}</b><small>/ ${tg}</small>${lag?`<em>${escapeHtml(t('subOpLagging'))}</em>`:''}</span>
      </button>`;
    }).join('');
    const hint=!canPick?'':sel?`${escapeHtml(t('subOpNowMarking'))}: <b>${escapeHtml(subs.find(s=>String(s.id)===String(sel))?.name||'')}</b>`:escapeHtml(t('subOpPickHint'));
    // v8.58: числа "Комплектов готово: X/Y" убрали из заголовка панели — это ровно то же число, что уже
    // показано главным прогрессом карточки заказа выше (там теперь именно kits, а не op.completedQty,
    // см. workshopCurrentCardHtml) — раньше на экране одновременно было два разных числа и было неясно,
    // какое из них верное.
    return `<div class="subops"><div class="subops-head"><span>${escapeHtml(t('subOpsTitle'))}</span></div>${rows}${hint?`<div class="subops-hint ${sel?'ok':''}">${hint}</div>`:''}</div>`;
  }
  // Отметки по операциям (кто, что, сколько, когда) + отмена ошибочной.
  function subMarksListHtml(o,op){
    const marks=marksOf(op).slice().sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
    if(!marks.length&&!hasSubOps(o,op.stepIndex))return '';
    const can=typeof userCan==='function'?userCan:()=>true,me=String(currentUser?.email||'').toLowerCase();
    const canUndo=m=>!m.undone&&(can('production.fixAny')||(can('production.mark')&&String(m.byEmail||'').toLowerCase()===me&&String(m.at||'').slice(0,10)===today()));
    const rows=marks.slice(0,12).map(m=>`<div class="${m.undone?'session-undone':''}"><span><b>${escapeHtml(m.subName||'—')} · ${Number(m.qty)||0} ${escapeHtml(t('unitPieces'))}</b><small>${escapeHtml(productionDateTimeText(m.at))}${m.undone?` · ${escapeHtml(t('subOpUndone'))}`:''}</small></span><em>${escapeHtml(m.by||'—')}</em>${canUndo(m)?`<button class="btn small ghost" type="button" onclick="undoSubMark('${o.id}',${op.stepIndex},'${escapeHtml(String(m.id))}')">${escapeHtml(t('subOpUndo'))}</button>`:''}</div>`).join('');
    return `<div class="workshop-marks-today subops-marks"><div class="workshop-marks-today-head"><span>${escapeHtml(t('subOpMarks'))}</span></div>${rows?`<div class="production-session-list workshop-marks-today-list">${rows}</div>`:`<div class="workshop-marks-empty">${escapeHtml(t('subOpMarksNone'))}</div>`}</div>`;
  }

  async function recordSubOpMark(orderId,index,qty,options={}){
    const o=findOrder(orderId);if(!o)return;
    const op=productionOp(o,index);if(!op||op.status==='done')return;
    const subs=stageSubOps(o,index),subId=selectedSubId(o,index,op),sub=subs.find(s=>String(s.id)===String(subId));
    if(!sub){toast(t('subOpChoose'));return}
    const left=subTarget(o,sub)-subDone(o,op,sub.id);
    if(left<1){toast(t('subOpAlreadyFull'));return}
    qty=Math.trunc(Number(qty||0));
    if(!Number.isFinite(qty)||qty<1){toast(t('prodInvalidQty'));return}
    if(qty>left){qty=left;toast(String(t('subOpClipped')).replace('{n}',left))}
    // как и при обычной отметке: если рабочая смена не начата — спросить, записывать ли без учёта времени
    if(!options.skipSessionPrompt&&!myWorkSession(o,index)){openWorkSessionMissingModal(orderId,index,qty);return}
    // хватит ли материалов на комплекты, которые эта отметка «закроет»
    const kitsAfter=subKits(o,op,null,{subId:sub.id,qty});
    const delta=kitsAfter-productionCompletedQty(o,op);
    if(delta>0){
      const plan=productionConsumptionPlan(o,op,delta);
      if(!plan.ok){openModal(t('insufficientMaterialTitle'),productionConsumptionPreviewHtml(plan),`<button class="btn primary" type="button" onclick="closeModal()">${escapeHtml(t('closeBtn'))}</button>`);return}
    }
    const now=productionNow();if(!op.startedAt)op.startedAt=now;
    const mine=myWorkSession(o,index),sinceIso=mine?((mine.lastMarkAt&&mine.lastMarkAt>mine.startedAt)?mine.lastMarkAt:mine.startedAt):now;
    const minutes=mine?Math.max(0,productionMinutesBetween(sinceIso,now)):0;
    op.subMarks=[{id:uid(),subId:sub.id,subName:sub.name,qty,at:now,minutes,by:productionActorName(),byEmail:currentUser?.email||''},...marksOf(op)];
    const message=`${op.stepName}: ${sub.name} — ${qty} ${tRu('unitsGenitive')}`;
    if(delta>0){
      // Комплект(ы) собраны — дальше обычная запись выпуска этапа (списание материалов, «Выполнено», закрытие этапа).
      // v8.41: время этой отметки отдаём ЕЙ — finalizeProductionQuantity сама считает «сколько прошло с последней
      // отметки» и продвигает mine.lastMarkAt. Раньше мы делали это уже здесь ДО вызова, поэтому к моменту, когда
      // finalizeProductionQuantity сама считала время, с последней отметки не проходило ни секунды — комплект в
      // «Комплекты и списание материалов» всегда показывал 0 мин, хотя работа заняла время.
      await finalizeProductionQuantity(orderId,index,delta,{kit:true,skipSessionPrompt:true});
      return;
    }
    if(mine)mine.lastMarkAt=now;
    op.actualMinutes=Math.max(0,Number(op.actualMinutes||0)+minutes);
    if(openWorkSessions(o,index).length){op.status='running';op.pausedAt=''}
    else{op.status='paused';op.pausedAt=now;op.currentSessionStartedAt='';op.currentSessionPauseMinutes=0}
    await persistProductionWorkflow(o,message,'production_suboperation_marked',{step:op.stepName,operation:sub.name,qty,minutes,doneBySub:subDone(o,op,sub.id),target:subTarget(o,sub),totalQty:orderProductQty(o)});
  }
  // Отмена ошибочной отметки. Нельзя, если по ней уже собраны и записаны комплекты (иначе разъедутся списания материалов) —
  // тогда сначала исправляют выпуск комплектов («Редактировать» в списке смен).
  async function undoSubMark(orderId,index,markId){
    const o=findOrder(orderId);if(!o)return;
    const op=productionOp(o,index);if(!op)return;
    const m=marksOf(op).find(x=>String(x.id)===String(markId));if(!m||m.undone)return;
    if(op.status==='done'||subKits(o,op,m)<productionCompletedQty(o,op)){toast(t('subOpUndoBlocked'));return}
    m.undone=true;m.undoneAt=productionNow();m.undoneBy=productionActorName();
    await persistProductionWorkflow(o,`${tRu('subOpAuditUndo')}: ${op.stepName} · ${m.subName} — ${m.qty}`,'production_suboperation_undone',{step:op.stepName,operation:m.subName,qty:m.qty});
  }
  // Окно «Отметить операцию» — для кнопок «Записать выпуск / Другое количество» в полном виде цеха.
  function openSubOpMarkModal(orderId,index){
    const o=findOrder(orderId);if(!o)return;const op=productionOp(o,index);if(!op||op.status==='done')return;
    const subs=stageSubOps(o,index),sel=selectedSubId(o,index,op);
    const opts=subs.map(s=>{const d=subDone(o,op,s.id),tg=subTarget(o,s);return `<option value="${escapeHtml(String(s.id))}" ${String(s.id)===String(sel)?'selected':''} ${d>=tg?'disabled':''}>${escapeHtml(s.name)} — ${d} / ${tg}</option>`}).join('');
    openModal(t('subOpModalTitle'),`<div class="production-quantity-modal"><label class="field"><span>${escapeHtml(t('subOpModalOp'))}</span><select class="select" id="subOpModalSel">${opts}</select></label><label class="field"><span>${escapeHtml(t('prodEnterCompletedQty'))}</span><input class="input" id="subOpModalQty" type="number" min="1" step="1" value="1"></label></div>`,`<button class="btn" type="button" onclick="closeModal()">${escapeHtml(t('cancel'))}</button><button class="btn primary" type="button" onclick="confirmSubOpMark('${o.id}',${index})">${escapeHtml(t('confirm'))}</button>`);
    setTimeout(()=>document.getElementById('subOpModalQty')?.select(),0);
  }
  async function confirmSubOpMark(orderId,index){
    const subId=document.getElementById('subOpModalSel')?.value,qty=Math.trunc(Number(document.getElementById('subOpModalQty')?.value||0));
    if(!subId){toast(t('subOpChoose'));return}
    if(!Number.isFinite(qty)||qty<1){toast(t('prodInvalidQty'));return}
    selected.set(skey(orderId,index),String(subId));
    closeModal();
    await recordSubOpMark(orderId,index,qty,{});
  }

  // v8.34: «Начать / Продолжить / Присоединиться» на этапе с операциями — сначала выбор, что именно будут делать.
  function needSubOpChoice(o,index){
    if(!hasSubOps(o,index)||myWorkSession(o,index))return false;
    const op=productionOp(o,index);if(!op||op.status==='done'||op.status==='cancelled')return false;
    const open=stageSubOps(o,index).filter(s=>subDone(o,op,s.id)<subTarget(o,s));
    if(open.length===1){selected.set(skey(o.id,index),String(open[0].id));return false} // осталась одна — выбор очевиден
    return open.length>1;
  }
  function openSubOpChooseModal(orderId,index){
    const o=findOrder(orderId);if(!o)return;const op=productionOp(o,index);if(!op)return;
    const subs=stageSubOps(o,index),cur=selectedSubId(o,index,op);
    const rows=subs.map(s=>{const d=subDone(o,op,s.id),tg=subTarget(o,s),full=d>=tg,pct=tg?Math.round(d/tg*100):0;
      return `<button type="button" class="subop-row ${String(s.id)===String(cur)?'selected':''} ${full?'full':''}" ${full?'disabled':''} onclick="pickSubOpAndStart('${o.id}',${index},'${escapeHtml(String(s.id))}')"><span class="subop-radio" aria-hidden="true">${full?'✓':'▶'}</span><span class="subop-main"><b>${escapeHtml(s.name)}</b><i class="subop-bar"><u style="width:${pct}%"></u></i></span><span class="subop-num"><b>${d}</b><small>/ ${tg}</small></span></button>`}).join('');
    openModal(t('subOpStartTitle'),`<p class="subop-choose-hint">${escapeHtml(t('subOpStartHint'))}</p>${rows}`,`<button class="btn" type="button" onclick="closeModal()">${escapeHtml(t('cancel'))}</button>`);
  }
  async function pickSubOpAndStart(orderId,index,subId){
    selected.set(skey(orderId,index),String(subId));
    closeModal();
    await startProductionOperation(orderId,index,{skipSubChoice:true});
  }

  Object.assign(window,{syncStageOpsFromTemplate,needSubOpChoice,openSubOpChooseModal,pickSubOpAndStart,subOpTarget:subTarget,stageSubOps,hasSubOps,subOpDone:subDone,subOpKits:subKits,subOpsPanelHtml,subMarksListHtml,selectSubOp,selectedSubId,recordSubOpMark,undoSubMark,openSubOpMarkModal,confirmSubOpMark});
})();
