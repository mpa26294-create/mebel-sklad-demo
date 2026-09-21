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
  // v8.32: у операции есть perUnit — сколько таких деталей входит в одно изделие (боковин 2 на изделие). Отметки ведутся в
  // ДЕТАЛЯХ; нужно деталей всего = perUnit × изделий в заказе; в комплект (изделие) идёт perUnit деталей этой операции.
  const perUnitOf=s=>Math.max(1,Math.round(Number(s?.perUnit)||1));
  function subTarget(o,s){return perUnitOf(s)*orderProductQty(o)}
  function sumMarks(op,subId,skip,cap){
    return Math.min(cap,marksOf(op).reduce((n,m)=>n+(m&&!m.undone&&m!==skip&&String(m.subId)===String(subId)?Math.max(0,Number(m.qty)||0):0),0));
  }
  function subDone(o,op,subId){
    const s=stageSubOps(o,op.stepIndex).find(x=>String(x.id)===String(subId));
    return sumMarks(op,subId,null,s?subTarget(o,s):orderProductQty(o));
  }
  // комплектов (изделий) = минимум по операциям из «целых» наборов деталей: floor(сделано деталей / деталей в изделии)
  function subKits(o,op,skip,extra){
    const subs=stageSubOps(o,op.stepIndex);if(!subs.length)return 0;
    const total=orderProductQty(o);
    return Math.min(total,...subs.map(s=>Math.floor((sumMarks(op,s.id,skip,subTarget(o,s))+(extra&&String(extra.subId)===String(s.id)?extra.qty:0))/perUnitOf(s))));
  }
  // productionOp() каждый раз пересобирает o.production.operations в новые объекты — поэтому уже полученный op передаём сюда, а не берём заново
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
  function subOpsPanelHtml(o,op){
    const index=op.stepIndex,subs=stageSubOps(o,index);if(!subs.length)return '';
    const total=orderProductQty(o),kits=subKits(o,op),sel=selectedSubId(o,index,op),canPick=op.status!=='done'&&op.status!=='cancelled';
    const dones=subs.map(s=>subDone(o,op,s.id)),targets=subs.map(s=>subTarget(o,s)),setsDone=subs.map((s,i)=>Math.floor(dones[i]/perUnitOf(s))),minDone=Math.min(...setsDone),maxDone=Math.max(...setsDone);
    const rows=subs.map((s,i)=>{
      const d=dones[i],tg=targets[i],pu=perUnitOf(s),pct=tg?Math.round(d/tg*100):0,full=d>=tg,lag=!full&&setsDone[i]===minDone&&maxDone>minDone,isSel=String(s.id)===String(sel);
      const who=byPersonText(op,s.id);
      return `<button type="button" class="subop-row ${isSel?'selected':''} ${full?'full':''}" aria-pressed="${isSel}" ${canPick&&!full?'':'disabled'} onclick="selectSubOp('${o.id}',${index},'${escapeHtml(String(s.id))}')">
        <span class="subop-radio" aria-hidden="true">${full?'✓':isSel?'●':'○'}</span>
        <span class="subop-main"><b>${escapeHtml(s.name)}</b>${pu>1?`<small class="subop-norm">${pu} ${escapeHtml(t('stageOpPcsPerItem'))}</small>`:''}<i class="subop-bar"><u style="width:${pct}%"></u></i>${who?`<small>${who}</small>`:''}</span>
        <span class="subop-num"><b>${d}</b><small>/ ${tg}</small>${lag?`<em>${escapeHtml(t('subOpLagging'))}</em>`:''}</span>
      </button>`;
    }).join('');
    const hint=!canPick?'':sel?`${escapeHtml(t('subOpNowMarking'))}: <b>${escapeHtml(subs.find(s=>String(s.id)===String(sel))?.name||'')}</b>`:escapeHtml(t('subOpPickHint'));
    return `<div class="subops"><div class="subops-head"><span>${escapeHtml(t('subOpsTitle'))}</span><strong>${escapeHtml(t('subOpsKits'))}: ${kits} / ${total}</strong></div>${rows}${hint?`<div class="subops-hint ${sel?'ok':''}">${hint}</div>`:''}</div>`;
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
    if(mine)mine.lastMarkAt=now;
    op.subMarks=[{id:uid(),subId:sub.id,subName:sub.name,qty,at:now,minutes,by:productionActorName(),byEmail:currentUser?.email||''},...marksOf(op)];
    op.actualMinutes=Math.max(0,Number(op.actualMinutes||0)+minutes);
    const message=`${op.stepName}: ${sub.name} — ${qty} ${tRu('unitsGenitive')}`;
    if(delta>0){
      // комплект(ы) собраны — дальше обычная запись выпуска этапа: списание материалов, «Выполнено», закрытие этапа
      await finalizeProductionQuantity(orderId,index,delta,{kit:true,skipSessionPrompt:true});
      return;
    }
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

  Object.assign(window,{subOpTarget:subTarget,subOpPerUnit:perUnitOf,stageSubOps,hasSubOps,subOpDone:subDone,subOpKits:subKits,subOpsPanelHtml,subMarksListHtml,selectSubOp,recordSubOpMark,undoSubMark,openSubOpMarkModal,confirmSubOpMark});
})();
