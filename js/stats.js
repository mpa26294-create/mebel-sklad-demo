// v8.24: раздел «Статистика» — кто сколько сделал и сколько времени отработал.
// Источники (уже собираются в заказах, ничего нового в базу не пишется):
//  • отметки выпуска — order.production.operations[].sessions (кто, сколько изделий, когда), без отменённых;
//  • рабочие сессии — order.production.workSessions (кто, в каком цехе, с какого по какое время).
// Время работы считается по рабочим сессиям («Начать» → «Пауза/конец смены»), выпуск — по отметкам.
const statsState={period:'week',from:'',to:'',workshop:'',person:''};
const STATS_RESTORED_LABEL='Восстановлено администратором';
function statsTz(){try{return shiftSettings().default.timezone||'Europe/Riga'}catch(e){return 'Europe/Riga'}}
function statsDayKey(iso){const ms=productionDateValue(iso);return ms?tzDayKeyOf(ms,statsTz()):''}
function statsAddDays(key,n){const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function statsRange(){
  const today=tzDayKeyOf(Date.now(),statsTz());
  switch(statsState.period){
    case 'today':return {from:today,to:today};
    case 'yesterday':{const y=statsAddDays(today,-1);return {from:y,to:y}}
    case 'week':return {from:statsAddDays(today,-6),to:today};
    case 'month':return {from:statsAddDays(today,-29),to:today};
    case 'custom':return {from:statsState.from||'0000-01-01',to:statsState.to||'9999-12-31'};
    default:return {from:'0000-01-01',to:'9999-12-31'};
  }
}
function statsCollect(){
  const marks=[],sessions=[],nameToKey=new Map();
  const orders=(data.orders||[]).filter(o=>o&&typeof o.production==='object'&&o.production);
  orders.forEach(o=>(Array.isArray(o.production.workSessions)?o.production.workSessions:[]).forEach(w=>{const k=sessionUserKey(w.userEmail);if(k&&w.userName)nameToKey.set(w.userName,k)}));
  orders.forEach(o=>{
    const prod=o.production;
    (Array.isArray(prod.operations)?prod.operations:[]).forEach(op=>{
      const subMarksList=Array.isArray(op.subMarks)?op.subMarks:[];
      if(subMarksList.length){ // v8.31: этап разбит на операции — выпуск людей считаем по их отметкам: 1 деталь = 1/N комплекта
        const stepOpsDef=(Array.isArray(o.steps)?o.steps:[])[op.stepIndex]?.operations||[];
        const perUnitFor=id=>Math.max(1,Math.round(Number((stepOpsDef.find(x=>String(x.id)===String(id))||{}).perUnit)||1));
        const subCount=Math.max(1,stepOpsDef.length||new Set(subMarksList.map(x=>String(x.subId))).size);
        subMarksList.forEach(m=>{
          if(!m||m.undone)return;
          const qty=Math.round((Number(m.qty)||0)/perUnitFor(m.subId)/subCount*10)/10;if(qty<=0)return;
          const email=sessionUserKey(m.byEmail),key=email||nameToKey.get(m.by)||('n:'+(m.by||'?')),name=m.by||email||'—',at=m.at||'';
          marks.push({order:o.number||'—',client:o.client||'',workshop:op.stepName||'',key,name,qty,at,day:statsDayKey(at),restored:false});
        });
      }
      (Array.isArray(op.sessions)?op.sessions:[]).forEach(m=>{
        if(!m||m.undone)return;
        if(subMarksList.length&&m.kit)return; // автозапись комплекта уже учтена по отметкам операций
        const qty=Number(m.qty)||0;if(qty<=0)return;
        const at=m.endedAt||m.startedAt||'';
        let key,name;
        if(m.restored&&m.by===STATS_RESTORED_LABEL){key='__restored__';name=t('statsRestored')}
        else{const email=sessionUserKey(m.byEmail);key=email||nameToKey.get(m.by)||('n:'+(m.by||'?'));name=m.by||email||'—'}
        marks.push({order:o.number||'—',client:o.client||'',workshop:op.stepName||'',key,name,qty,at,day:statsDayKey(at),restored:!!m.restored});
      });
    });
    (Array.isArray(prod.workSessions)?prod.workSessions:[]).forEach(w=>{
      const email=sessionUserKey(w.userEmail),key=email||('n:'+(w.userName||'?'));
      sessions.push({order:o.number||'—',workshop:w.workshop||'',key,email,name:(w.userName&&w.userName!==w.userEmail)?w.userName:(w.userEmail||w.userName||'—'),day:statsDayKey(w.startedAt),minutes:workSessionMinutes(w),overtime:!!w.overtime});
    });
  });
  return {marks,sessions};
}
function statsFiltered(){
  const {marks,sessions}=statsCollect(),r=statsRange(),f=statsState;
  const inRange=x=>x.day&&x.day>=r.from&&x.day<=r.to;
  const okW=x=>!f.workshop||x.workshop===f.workshop;
  const okP=x=>!f.person||x.key===f.person;
  return {
    marks:marks.filter(x=>inRange(x)&&okW(x)&&okP(x)),
    sessions:sessions.filter(x=>inRange(x)&&okW(x)&&okP(x)),
    all:{marks,sessions}
  };
}
function statsAggregate(d){
  const people=new Map(),shops=new Map(),days=new Map(),orders=new Set();
  const person=(k,name,email)=>{let p=people.get(k);if(!p){p={key:k,name,email:email||'',qty:0,marks:0,minutes:0,shops:new Set()};people.set(k,p)}
    if(name&&(!p.name||p.name==='—'||(p.name.includes('@')&&!String(name).includes('@'))))p.name=name;if(email&&!p.email)p.email=email;return p};
  const shop=w=>{let s=shops.get(w||'—');if(!s){s={name:w||'—',qty:0,minutes:0,people:new Set()};shops.set(w||'—',s)}return s};
  const day=k=>{let x=days.get(k);if(!x){x={day:k,qty:0,minutes:0};days.set(k,x)}return x};
  const r1=x=>Math.round(x*10)/10; // доли комплекта (v8.31) дают дробные штуки — без «3.9000000000000004»
  d.marks.forEach(m=>{const p=person(m.key,m.name);p.qty=r1(p.qty+m.qty);p.marks++;if(m.workshop)p.shops.add(m.workshop);const s=shop(m.workshop);s.qty=r1(s.qty+m.qty);s.people.add(m.key);const dd=day(m.day);dd.qty=r1(dd.qty+m.qty);orders.add(m.order)});
  d.sessions.forEach(s=>{const p=person(s.key,s.name,s.email);p.minutes+=s.minutes;if(s.workshop)p.shops.add(s.workshop);const sh=shop(s.workshop);sh.minutes+=s.minutes;sh.people.add(s.key);day(s.day).minutes+=s.minutes;orders.add(s.order)});
  const peopleList=[...people.values()].sort((a,b)=>b.qty-a.qty||b.minutes-a.minutes);
  const shopList=[...shops.values()].sort((a,b)=>b.qty-a.qty||b.minutes-a.minutes);
  const dayList=[...days.values()].sort((a,b)=>a.day.localeCompare(b.day));
  return {peopleList,shopList,dayList,ordersCount:orders.size,orderList:[...orders].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true})),
    totalQty:r1(d.marks.reduce((n,m)=>n+m.qty,0)),totalMinutes:d.sessions.reduce((n,s)=>n+s.minutes,0),realPeople:peopleList.filter(p=>p.key!=='__restored__').length};
}
// v8.25: число («Людей», «Сотрудников», «Заказов») кликабельное: при наведении — подсказка со списком, по нажатию —
// список раскрывается под числом (работает и на планшете, где нет наведения).
function statsChipHtml(count,items){
  const list=(items||[]).filter(Boolean);
  if(!list.length)return String(count);
  return `<button type="button" class="st-chip" title="${escapeHtml(list.join(', '))}" onclick="toggleStatsList(this)">${count}</button><div class="st-chip-list" hidden>${list.map(x=>`<span>${escapeHtml(x)}</span>`).join('')}</div>`;
}
function toggleStatsList(btn){const box=btn.nextElementSibling;if(!box)return;box.hidden=!box.hidden;btn.classList.toggle('open',!box.hidden)}
function statsPersonLabel(p){return p.email&&p.email!==p.name?`${p.name} (${p.email})`:p.name}
function statsPace(p){return p.qty>0&&p.minutes>0?(Math.round(p.minutes/p.qty*10)/10):null}
function statsFmtNum(n){return String(Number(n)).replace('.',currentLang==='en'?'.':',')}
function statsDayLabel(key){const d=new Date(key+'T12:00:00Z');return d.toLocaleDateString(uiDateLocale(),{day:'2-digit',month:'2-digit',timeZone:'UTC'})}
function statsMarkTime(iso){const d=new Date(iso||'');return Number.isNaN(d.getTime())?'':d.toLocaleString(uiDateLocale(),{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:statsTz()})}
function statsOptions(list,selected,allLabel){return `<option value="">${escapeHtml(allLabel)}</option>`+list.map(x=>`<option value="${escapeHtml(x.value)}" ${x.value===selected?'selected':''}>${escapeHtml(x.label)}</option>`).join('')}
function setWorkStatsFilter(key,value){statsState[key]=value;if(key==='period'&&value!=='custom'){statsState.from='';statsState.to=''}renderWorkStats()}
function statsCsvCell(v){const s=String(v??'');return /[";\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
function exportWorkStatsCsv(){
  const d=statsFiltered(),a=statsAggregate(d);
  const rows=[[t('statsColPerson'),'Email',t('statsColQty'),t('statsColMarks'),t('statsColTimeMin'),t('statsColPace'),t('statsColWorkshops')]];
  a.peopleList.forEach(p=>rows.push([p.name,p.email,p.qty,p.marks,p.minutes,statsPace(p)??'',[...p.shops].join(', ')]));
  rows.push([]);
  rows.push([t('statsColDate'),t('statsColPerson'),t('statsColOrder'),t('statsColWorkshop'),t('statsColQty')]);
  d.marks.slice().sort((x,y)=>String(y.at).localeCompare(String(x.at))).forEach(m=>rows.push([statsMarkTime(m.at),m.name,m.order,m.workshop,m.qty]));
  const csv='﻿'+rows.map(r=>r.map(statsCsvCell).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a2=document.createElement('a');a2.href=url;a2.download=`statistika-${tzDayKeyOf(Date.now(),statsTz())}.csv`;document.body.appendChild(a2);a2.click();a2.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function renderWorkStats(){
  const box=document.getElementById('workStatsContent');if(!box)return;
  const d=statsFiltered(),a=statsAggregate(d);
  const all=d.all;
  const shopNames=[...new Set([...all.marks.map(x=>x.workshop),...all.sessions.map(x=>x.workshop)].filter(Boolean))].sort();
  const peopleAll=new Map();all.marks.forEach(m=>peopleAll.set(m.key,m.name));all.sessions.forEach(s=>peopleAll.set(s.key,s.name));
  const periods=[['today','statsToday'],['yesterday','statsYesterday'],['week','statsWeek'],['month','statsMonth'],['all','statsAll'],['custom','statsCustom']];
  const filters=`<div class="st-filters">
    <label><small>${escapeHtml(t('statsPeriod'))}</small><select class="select" onchange="setWorkStatsFilter('period',this.value)">${periods.map(([v,k])=>`<option value="${v}" ${statsState.period===v?'selected':''}>${escapeHtml(t(k))}</option>`).join('')}</select></label>
    ${statsState.period==='custom'?`<label><small>${escapeHtml(t('statsFrom'))}</small><input class="input" type="date" value="${escapeHtml(statsState.from)}" onchange="setWorkStatsFilter('from',this.value)"></label><label><small>${escapeHtml(t('statsTo'))}</small><input class="input" type="date" value="${escapeHtml(statsState.to)}" onchange="setWorkStatsFilter('to',this.value)"></label>`:''}
    <label><small>${escapeHtml(t('statsWorkshop'))}</small><select class="select" onchange="setWorkStatsFilter('workshop',this.value)">${statsOptions(shopNames.map(x=>({value:x,label:x})),statsState.workshop,t('statsAllWorkshops'))}</select></label>
    <label><small>${escapeHtml(t('statsPerson'))}</small><select class="select" onchange="setWorkStatsFilter('person',this.value)">${statsOptions([...peopleAll.entries()].map(([value,label])=>({value,label:value==='__restored__'?t('statsRestored'):label})),statsState.person,t('statsAllPeople'))}</select></label>
    <button type="button" class="btn" onclick="exportWorkStatsCsv()">${escapeHtml(t('statsExport'))}</button>
  </div>`;
  const cards=`<div class="st-cards">
    <div class="st-card"><small>${escapeHtml(t('statsCardQty'))}</small><b>${a.totalQty}</b><span>${escapeHtml(t('unitPieces'))}</span></div>
    <div class="st-card"><small>${escapeHtml(t('statsCardTime'))}</small><b>${escapeHtml(orderTimeText(a.totalMinutes))}</b><span>${escapeHtml(t('statsCardTimeSub'))}</span></div>
    <div class="st-card"><small>${escapeHtml(t('statsCardPeople'))}</small><b>${statsChipHtml(a.realPeople,a.peopleList.filter(p=>p.key!=='__restored__').map(statsPersonLabel))}</b></div>
    <div class="st-card"><small>${escapeHtml(t('statsCardOrders'))}</small><b>${statsChipHtml(a.ordersCount,a.orderList)}</b></div>
  </div>`;
  if(!a.peopleList.length){box.innerHTML=filters+cards+`<div class="empty"><b>${escapeHtml(t('statsEmpty'))}</b>${escapeHtml(t('statsEmptyHint'))}</div>`;return}
  const maxQty=Math.max(1,...a.dayList.map(x=>x.qty));
  const dayList=a.dayList.slice(-31);
  const chart=`<div class="st-chart">${dayList.map(x=>`<div class="st-bar" title="${escapeHtml(statsDayLabel(x.day))}: ${x.qty} ${escapeHtml(t('unitPieces'))} · ${escapeHtml(orderTimeText(x.minutes))}"><i style="height:${Math.round(x.qty/maxQty*100)}%"></i><em>${x.qty}</em><span>${escapeHtml(statsDayLabel(x.day))}</span></div>`).join('')}</div>`;
  const peopleTable=`<div class="st-table-wrap"><table class="st-table"><thead><tr><th>${escapeHtml(t('statsColPerson'))}</th><th class="n">${escapeHtml(t('statsColQty'))}</th><th class="n">${escapeHtml(t('statsColMarks'))}</th><th class="n">${escapeHtml(t('statsColTime'))}</th><th class="n">${escapeHtml(t('statsColPace'))}</th><th>${escapeHtml(t('statsColWorkshops'))}</th></tr></thead><tbody>${a.peopleList.map(p=>{const pace=statsPace(p);return `<tr class="${p.key==='__restored__'?'restored':''}"><td><b>${escapeHtml(p.name)}</b>${p.email&&p.email!==p.name?`<small>${escapeHtml(p.email)}</small>`:''}</td><td class="n">${p.qty}</td><td class="n">${p.marks}</td><td class="n">${p.minutes?escapeHtml(orderTimeText(p.minutes)):'—'}</td><td class="n">${pace!==null?statsFmtNum(pace):'—'}</td><td>${escapeHtml([...p.shops].join(', ')||'—')}</td></tr>`}).join('')}</tbody></table></div>`;
  const shopTable=`<div class="st-table-wrap"><table class="st-table"><thead><tr><th>${escapeHtml(t('statsColWorkshop'))}</th><th class="n">${escapeHtml(t('statsColQty'))}</th><th class="n">${escapeHtml(t('statsColTime'))}</th><th class="n">${escapeHtml(t('statsColPeople'))}</th></tr></thead><tbody>${a.shopList.map(s=>`<tr><td><b>${escapeHtml(s.name)}</b></td><td class="n">${s.qty}</td><td class="n">${s.minutes?escapeHtml(orderTimeText(s.minutes)):'—'}</td><td class="n">${(()=>{const names=[...s.people].filter(k=>k!=='__restored__').map(k=>{const p=a.peopleList.find(x=>x.key===k);return p?statsPersonLabel(p):''});return statsChipHtml(names.length,names)})()}</td></tr>`).join('')}</tbody></table></div>`;
  const last=d.marks.slice().sort((x,y)=>String(y.at).localeCompare(String(x.at))).slice(0,40);
  const marksTable=`<div class="st-table-wrap"><table class="st-table"><thead><tr><th>${escapeHtml(t('statsColDate'))}</th><th>${escapeHtml(t('statsColPerson'))}</th><th>${escapeHtml(t('statsColOrder'))}</th><th>${escapeHtml(t('statsColWorkshop'))}</th><th class="n">${escapeHtml(t('statsColQty'))}</th></tr></thead><tbody>${last.map(m=>`<tr class="${m.restored?'restored':''}"><td>${escapeHtml(statsMarkTime(m.at))}</td><td>${escapeHtml(m.name)}</td><td><b>${escapeHtml(m.order)}</b>${m.client?`<small>${escapeHtml(m.client)}</small>`:''}</td><td>${escapeHtml(m.workshop)}</td><td class="n">${m.qty}</td></tr>`).join('')}</tbody></table></div>`;
  box.innerHTML=filters+cards
    +`<section class="panel st-panel"><h3>${escapeHtml(t('statsByPerson'))}</h3>${peopleTable}<p class="st-note">${escapeHtml(t('statsNote'))}</p></section>`
    +`<section class="panel st-panel"><h3>${escapeHtml(t('statsByDay'))}</h3>${chart}</section>`
    +`<section class="panel st-panel"><h3>${escapeHtml(t('statsByWorkshop'))}</h3>${shopTable}</section>`
    +`<section class="panel st-panel"><h3>${escapeHtml(t('statsMarksList'))}</h3>${marksTable}</section>`;
}
