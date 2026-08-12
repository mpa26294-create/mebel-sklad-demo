// MOLM — вкладка "Активность": кто сейчас на сайте, когда был последний раз,
// сколько времени провёл сегодня, и календарь активности по дням.
// v7.13: heartbeat раз в 30с пишет/обновляет строку в public.presence_log (user_email+day уникальны).
// active_seconds наращивается только пока вкладка реально видима (document.visibilityState==='visible'),
// чтобы фоновые неактивные вкладки не накручивали время "на сайте".

const PRESENCE_HEARTBEAT_MS = 30000;
const PRESENCE_ONLINE_WINDOW_MS = 90000; // 3x heartbeat — считаем "на сайте сейчас"

let __presenceTimer = null;

async function presenceHeartbeat(){
  if(typeof isLoggedIn!=='function'||!isLoggedIn())return;
  if(typeof isLocalMode==='function'&&isLocalMode())return;
  const email=String((typeof currentUser!=='undefined'&&currentUser&&currentUser.email)||'').trim().toLowerCase();
  if(!email)return;
  const day=typeof today==='function'?today():new Date().toISOString().slice(0,10);
  const nowIso=new Date().toISOString();
  const visible=(typeof document!=='undefined'&&document.visibilityState)?document.visibilityState==='visible':true;
  const displayName=(typeof profileDisplayName==='function')?profileDisplayName():email;
  const role=(typeof profileDisplayRole==='function')?profileDisplayRole():'';
  try{
    const {data:rows,error}=await supabaseClient.from('presence_log').select('*').eq('user_email',email).eq('day',day).limit(1);
    if(error){console.error(error);return;}
    const existing=rows&&rows[0];
    if(!existing){
      await supabaseClient.from('presence_log').insert({user_email:email,display_name:displayName,role,day,first_seen:nowIso,last_seen:nowIso,active_seconds:0});
      return;
    }
    const lastSeenMs=Date.parse(existing.last_seen);
    const gapSec=Number.isFinite(lastSeenMs)?Math.max(0,Math.round((Date.now()-lastSeenMs)/1000)):0;
    // не засчитываем время, если разрыв больше ~3 heartbeat-ов (сон ноутбука, долгий простой) —
    // тогда просто сдвигаем last_seen, не накручивая active_seconds за время отсутствия.
    const addSec=(visible&&gapSec<=Math.round(PRESENCE_HEARTBEAT_MS/1000)*3)?gapSec:0;
    await supabaseClient.from('presence_log').update({last_seen:nowIso,active_seconds:(existing.active_seconds||0)+addSec,display_name:displayName,role}).eq('id',existing.id);
  }catch(e){console.error(e);}
}

function startPresenceHeartbeat(){
  stopPresenceHeartbeat();
  presenceHeartbeat();
  __presenceTimer=setInterval(presenceHeartbeat,PRESENCE_HEARTBEAT_MS);
  document.addEventListener('visibilitychange',presenceOnVisibilityChange);
}
function stopPresenceHeartbeat(){
  if(__presenceTimer){clearInterval(__presenceTimer);__presenceTimer=null;}
  document.removeEventListener('visibilitychange',presenceOnVisibilityChange);
}
function presenceOnVisibilityChange(){
  if(document.visibilityState==='visible')presenceHeartbeat();
}

function presenceIsOnline(row){
  if(!row||!row.last_seen)return false;
  const ms=Date.parse(row.last_seen);
  if(!Number.isFinite(ms))return false;
  return (Date.now()-ms)<=PRESENCE_ONLINE_WINDOW_MS;
}

function presenceFormatDuration(seconds){
  const s=Math.max(0,Math.round(seconds||0));
  const h=Math.floor(s/3600);
  const m=Math.floor((s%3600)/60);
  if(h>0)return `${h} ${t('presenceHoursShort')} ${m} ${t('presenceMinutesShort')}`;
  if(m>0)return `${m} ${t('presenceMinutesShort')}`;
  return t('presenceLessThanMinute');
}

async function fetchPresenceToday(){
  const day=typeof today==='function'?today():new Date().toISOString().slice(0,10);
  const {data,error}=await supabaseClient.from('presence_log').select('*').eq('day',day).order('last_seen',{ascending:false});
  if(error){console.error(error);return [];}
  return data||[];
}

async function fetchPresenceLatestPerUser(){
  const {data,error}=await supabaseClient.from('presence_log').select('*').order('day',{ascending:false}).order('last_seen',{ascending:false}).limit(500);
  if(error){console.error(error);return [];}
  const seen=new Set();
  const out=[];
  (data||[]).forEach(r=>{if(!seen.has(r.user_email)){seen.add(r.user_email);out.push(r);}});
  return out;
}

function activityStatCardHtml(cls,label,value,note,icon){
  return `<div class="order-stat-card"><span class="order-stat-icon ${cls}">${icon}</span><div class="order-stat-copy"><small class="order-stat-label">${escapeHtml(label)}</small><b class="order-stat-value">${escapeHtml(String(value))}</b><em class="order-stat-note">${escapeHtml(note)}</em></div></div>`;
}

function activityUserRowHtml(u){
  const initial=escapeHtml((u.name||u.email||'?').trim().slice(0,1).toUpperCase()||'?');
  const lastSeenText=u.online?t('presenceOnlineNow'):(u.lastSeen?productionDateTimeText(u.lastSeen):t('presenceNever'));
  return `<div class="activity-user-row"><span class="activity-status-dot ${u.online?'online':'offline'}" title="${u.online?escapeHtml(t('presenceOnlineNow')):escapeHtml(t('presenceOffline'))}"></span><span class="activity-avatar">${initial}</span><div class="activity-user-info"><b>${escapeHtml(u.name||u.email)}</b><small>${escapeHtml(u.email)}${u.role?' · '+escapeHtml(u.role):''}</small></div><div class="activity-user-meta"><span class="activity-last-seen">${escapeHtml(lastSeenText)}</span><span class="activity-today-time">${escapeHtml(t('presenceTodayTimeLabel'))}: ${presenceFormatDuration(u.todaySeconds)}</span></div></div>`;
}

async function renderActivity(){
  const statsBox=document.getElementById('activityStats');
  const listBox=document.getElementById('activityUsersList');
  if(!statsBox||!listBox)return;
  if(typeof isLoggedIn!=='function'||!isLoggedIn()){
    statsBox.innerHTML='';
    listBox.innerHTML=`<div class="empty"><b>${escapeHtml(t('loginRequired'))}</b></div>`;
    return;
  }
  listBox.innerHTML=`<div class="empty muted">${escapeHtml(t('loading'))}</div>`;
  const [todayRows,latestRows]=await Promise.all([fetchPresenceToday(),fetchPresenceLatestPerUser()]);
  const todayByEmail={};
  todayRows.forEach(r=>{todayByEmail[r.user_email]=r;});
  const users=latestRows.map(r=>{
    const todayRow=todayByEmail[r.user_email];
    const activeRow=todayRow||r;
    return {
      email:r.user_email,
      name:(todayRow&&todayRow.display_name)||r.display_name||r.user_email,
      role:(todayRow&&todayRow.role)||r.role||'',
      lastSeen:activeRow.last_seen,
      todaySeconds:todayRow?(todayRow.active_seconds||0):0,
      online:presenceIsOnline(activeRow)
    };
  }).sort((a,b)=>(Number(b.online)-Number(a.online))||((Date.parse(b.lastSeen)||0)-(Date.parse(a.lastSeen)||0)));
  const onlineCount=users.filter(u=>u.online).length;
  const totalTodaySeconds=todayRows.reduce((sum,r)=>sum+(r.active_seconds||0),0);
  statsBox.innerHTML=[
    activityStatCardHtml('ready',t('presenceOnlineNowStat'),onlineCount,t('presenceOnlineNowNote'),'●'),
    activityStatCardHtml('orders',t('presenceTotalUsersStat'),users.length,t('presenceTotalUsersNote'),'◔'),
    activityStatCardHtml('missing',t('presenceTodayTotalStat'),presenceFormatDuration(totalTodaySeconds),t('presenceTodayTotalNote'),'◷')
  ].join('');
  listBox.innerHTML=users.length?users.map(activityUserRowHtml).join(''):`<div class="empty muted">${escapeHtml(t('presenceNoUsers'))}</div>`;
  renderActivityCalendar();
}

let __activityCalMonth=null;
let __activitySelectedDay=null;

function activityCalInitMonth(){
  if(__activityCalMonth)return;
  const d=new Date();
  __activityCalMonth={year:d.getFullYear(),month:d.getMonth()};
}
function activityCalPrevMonth(){
  activityCalInitMonth();
  __activityCalMonth.month--;
  if(__activityCalMonth.month<0){__activityCalMonth.month=11;__activityCalMonth.year--;}
  renderActivityCalendar();
}
function activityCalNextMonth(){
  activityCalInitMonth();
  __activityCalMonth.month++;
  if(__activityCalMonth.month>11){__activityCalMonth.month=0;__activityCalMonth.year++;}
  renderActivityCalendar();
}
function activityLocale(){return currentLang==='ru'?'ru-RU':currentLang==='lv'?'lv-LV':'en-GB'}
function activityPad(n){return String(n).padStart(2,'0')}

async function renderActivityCalendar(){
  activityCalInitMonth();
  const grid=document.getElementById('activityCalGrid');
  const label=document.getElementById('activityCalMonthLabel');
  if(!grid||!label)return;
  const {year,month}=__activityCalMonth;
  label.textContent=new Date(year,month,1).toLocaleDateString(activityLocale(),{month:'long',year:'numeric'});
  const firstOfMonth=new Date(year,month,1);
  const startWeekday=(firstOfMonth.getDay()+6)%7; // неделя начинается с понедельника
  const daysInMonth=new Date(year,month+1,0).getDate();
  const monthStart=`${year}-${activityPad(month+1)}-01`;
  const monthEnd=`${year}-${activityPad(month+1)}-${activityPad(daysInMonth)}`;
  const {data:rows,error}=await supabaseClient.from('presence_log').select('day,user_email,display_name,active_seconds').gte('day',monthStart).lte('day',monthEnd);
  if(error)console.error(error);
  const byDay={};
  (rows||[]).forEach(r=>{(byDay[r.day]=byDay[r.day]||[]).push(r);});
  const todayStr=typeof today==='function'?today():new Date().toISOString().slice(0,10);
  const weekdayLabels=t('presenceWeekdaysShort').split(',');
  const cells=weekdayLabels.map(w=>`<div class="activity-cal-weekday">${escapeHtml(w)}</div>`).join('');
  const dayCells=[];
  for(let i=0;i<startWeekday;i++)dayCells.push('<span class="activity-cal-cell empty"></span>');
  for(let day=1;day<=daysInMonth;day++){
    const dateStr=`${year}-${activityPad(month+1)}-${activityPad(day)}`;
    const hasActivity=!!(byDay[dateStr]&&byDay[dateStr].length);
    const isToday=dateStr===todayStr;
    const isSelected=__activitySelectedDay===dateStr;
    dayCells.push(`<button type="button" class="activity-cal-cell${hasActivity?' has-activity':''}${isToday?' is-today':''}${isSelected?' selected':''}" onclick="activitySelectDay('${dateStr}')"><span class="activity-cal-daynum">${day}</span>${hasActivity?'<span class="activity-cal-dot"></span>':''}</button>`);
  }
  grid.innerHTML=cells+dayCells.join('');
  if(!__activitySelectedDay&&byDay[todayStr])__activitySelectedDay=todayStr;
  if(__activitySelectedDay&&byDay[__activitySelectedDay]&&__activitySelectedDay.slice(0,7)===`${year}-${activityPad(month+1)}`){
    renderActivityDayDetail(byDay[__activitySelectedDay],__activitySelectedDay);
  }else if(!(__activitySelectedDay&&__activitySelectedDay.slice(0,7)===`${year}-${activityPad(month+1)}`)){
    renderActivityDayDetail([],null);
  }
}

async function activitySelectDay(dateStr){
  __activitySelectedDay=dateStr;
  const {data:rows,error}=await supabaseClient.from('presence_log').select('*').eq('day',dateStr).order('active_seconds',{ascending:false});
  if(error){console.error(error);renderActivityDayDetail([],dateStr);return;}
  renderActivityDayDetail(rows||[],dateStr);
  renderActivityCalendar();
}

function renderActivityDayDetail(rows,dateStr){
  const box=document.getElementById('activityDayDetail');
  if(!box)return;
  if(!dateStr){box.innerHTML=`<p class="muted">${escapeHtml(t('presencePickDayHint'))}</p>`;return;}
  const dateLabel=new Date(dateStr+'T00:00:00').toLocaleDateString(activityLocale(),{day:'2-digit',month:'long',year:'numeric'});
  if(!rows||!rows.length){box.innerHTML=`<b>${escapeHtml(dateLabel)}</b><p class="muted">${escapeHtml(t('presenceNoDataDay'))}</p>`;return;}
  const rowsHtml=rows.map(r=>{
    const initial=escapeHtml((r.display_name||r.user_email||'?').trim().slice(0,1).toUpperCase()||'?');
    return `<div class="activity-day-row"><span class="activity-avatar small">${initial}</span><div class="activity-user-info"><b>${escapeHtml(r.display_name||r.user_email)}</b><small>${escapeHtml(r.user_email)}</small></div><span class="activity-day-time">${presenceFormatDuration(r.active_seconds)}</span></div>`;
  }).join('');
  box.innerHTML=`<b>${escapeHtml(dateLabel)}</b><div class="activity-day-list">${rowsHtml}</div>`;
}
