// v8.36 (пока только тестовый сайт): раздел «Пользователи» — отдельно от Настроек, виден только владельцу.
// Показывает КАЖДОГО, у кого есть логин в Supabase (email, когда создан, когда последний раз заходил) —
// список приходит из серверной функции list-auth-users (Supabase Edge Function, отдаёт данные только
// владельцу, сверяет это сама). Раньше узнать «есть логин, но роль не назначена» можно было только
// случайно — см. историю с Martins@molm.eu: логин был, записи в списке ролей не было, «Цеха» показывали
// ему 0, никто не заметил, пока он сам не пожаловался. Теперь такой человек сразу виден с пометкой
// «⚠ без роли — Мастер (весь сайт)». Сама логика ролей не меняется — это тот же workerAccessList и
// saveWorkerAccessList, что и в Настройках → «Пользователи и роли»; здесь только более быстрый способ
// открыть/поправить роль ОДНОГО конкретного человека, не листая общий список.
let authUsersCache=null,authUsersLoading=false,authUsersError='';
async function loadAuthUsersList(force){
  if(authUsersLoading)return;
  if(authUsersCache&&!force)return;
  authUsersLoading=true;authUsersError='';
  if(!authUsersCache)renderUsersSection();
  try{
    const {data,error}=await supabaseClient.functions.invoke('list-auth-users');
    if(error)throw error;
    if(data?.error)throw new Error(data.error==='forbidden'?'Доступно только владельцу':data.error);
    authUsersCache=Array.isArray(data?.users)?data.users:[];
  }catch(e){
    console.error('loadAuthUsersList failed',e);
    authUsersError=String(e?.message||e||'Ошибка загрузки');
  }finally{
    authUsersLoading=false;
    renderUsersSection();
  }
}
function usersRoleSummary(email){
  const row=(workerAccessList||[]).find(w=>String(w.email||'').toLowerCase()===String(email||'').toLowerCase());
  if(!row||!Array.isArray(row.roles)||!row.roles.length)return '';
  const names={technologist:'Технолог',master:'Мастер',storekeeper:'Кладовщик',worker:'Рабочий'};
  let text=row.roles.map(r=>names[r]||r).join(' + ');
  if(row.roles.includes('worker')&&row.workshops?.length)text+=` (${row.workshops.join(', ')})`;
  const diff=(row.extra||[]).length+(row.denied||[]).length;
  if(diff)text+=` · точечных: ${diff}`;
  return text;
}
function usersDateText(iso){
  if(!iso)return 'ни разу не заходил';
  const d=new Date(iso);if(isNaN(d))return '—';
  return d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function usersRowHtml(u){
  const email=String(u.email||'').trim().toLowerCase();
  const isAdmin=email===NOTIFICATION_ADMIN_EMAIL;
  const summary=isAdmin?'':usersRoleSummary(email);
  const noRole=!isAdmin&&!summary;
  const badge=isAdmin?'<span class="users-role-badge owner">Владелец</span>'
    :noRole?'<span class="users-role-badge warn">⚠ без роли — Мастер (весь сайт)</span>'
    :`<span class="users-role-badge ok">${escapeHtml(summary)}</span>`;
  return `<div class="users-row ${noRole?'warn':''}">
    <div class="users-row-main"><b>${escapeHtml(u.email||'—')}</b><small>Последний вход: ${escapeHtml(usersDateText(u.last_sign_in_at))} · логин создан: ${escapeHtml(usersDateText(u.created_at))}</small></div>
    ${badge}
    ${isAdmin?'':`<button class="btn small" type="button" onclick="openQuickRoleModal('${jsStrArg(email)}')">Настроить роль</button>`}
  </div>`;
}
function usersSectionBodyHtml(){
  if(authUsersLoading&&!authUsersCache)return '<p class="muted">Загружаю список входов…</p>';
  if(authUsersError)return `<p class="muted">Не удалось получить список: ${escapeHtml(authUsersError)}</p><button class="btn small" type="button" onclick="loadAuthUsersList(true)">Повторить</button>`;
  const list=(authUsersCache||[]).slice().sort((a,b)=>String(b.last_sign_in_at||b.created_at||'').localeCompare(String(a.last_sign_in_at||a.created_at||'')));
  const warnCount=list.filter(u=>String(u.email||'').trim().toLowerCase()!==NOTIFICATION_ADMIN_EMAIL&&!usersRoleSummary(u.email)).length;
  const head=`<div class="users-head"><b>Всего входов: ${list.length}</b>${warnCount?`<span class="users-warn-count">⚠ без роли: ${warnCount}</span>`:''}<button class="btn small" type="button" onclick="loadAuthUsersList(true)">Обновить</button></div>`;
  return head+`<div class="users-list">${list.map(usersRowHtml).join('')||'<p class="muted">Пока никто не заходил.</p>'}</div>`;
}
function renderUsersSection(){
  const el=document.getElementById('usersContent');
  if(!el)return;
  if(typeof isOwnerUser==='function'&&!isOwnerUser()){el.innerHTML='';return}
  el.innerHTML=usersSectionBodyHtml();
}

// ---------- быстрый редактор роли одного человека (то же хранилище, что и в Настройках) ----------
let quickRoleDraft=null;
function ensureQuickRoleDraft(email){
  const existing=(workerAccessList||[]).find(w=>String(w.email||'').toLowerCase()===String(email).toLowerCase());
  quickRoleDraft=existing
    ?{email:existing.email,roles:[...(existing.roles||['worker'])],workshops:[...(existing.workshops||[])],extra:[...(existing.extra||[])],denied:[...(existing.denied||[])],_open:false}
    :{email,roles:['worker'],workshops:[],extra:[],denied:[],_open:false};
  return quickRoleDraft;
}
function quickRoleToggleRole(role,checked){
  const row=quickRoleDraft;if(!row)return;
  const set=new Set(row.roles);
  if(checked)set.add(role);else set.delete(role);
  row.roles=[...set];
  if(!set.has('worker'))row.workshops=[];
  if(typeof pruneWorkerAccessOverrides==='function')pruneWorkerAccessOverrides(row);
  renderQuickRoleModalBody();
}
function quickRoleToggleWorkshop(name,checked){
  const row=quickRoleDraft;if(!row)return;
  const set=new Set(row.workshops);
  if(checked)set.add(name);else set.delete(name);
  row.workshops=[...set];
  renderQuickRoleModalBody();
}
function quickRoleTogglePerms(){if(quickRoleDraft){quickRoleDraft._open=!quickRoleDraft._open;renderQuickRoleModalBody()}}
function quickRoleTogglePerm(perm,checked){
  const row=quickRoleDraft;if(!row)return;
  const base=permsFromRoles(row.roles),extra=new Set(row.extra||[]),denied=new Set(row.denied||[]);
  if(checked){denied.delete(perm);if(!base.has(perm))extra.add(perm)}
  else{extra.delete(perm);if(base.has(perm))denied.add(perm)}
  row.extra=[...extra];row.denied=[...denied];
  renderQuickRoleModalBody();
}
// Разметка и классы намеренно те же, что у строки в Настройках (workerAccessRowHtml) — привычный вид, без email-поля и удаления.
function quickRoleModalBodyHtml(){
  const row=quickRoleDraft;if(!row)return '';
  const roles=new Set(row.roles||[]);
  const presets=(typeof ORDER_TECH_WORKSHOP_PRESETS!=='undefined'&&ORDER_TECH_WORKSHOP_PRESETS)||[];
  const roleNames={technologist:'Технолог',master:'Мастер',storekeeper:'Кладовщик',worker:'Рабочий'};
  const roleChips=['technologist','master','storekeeper','worker'].map(r=>`<label class="worker-access-chip ${roles.has(r)?'checked':''}"><input type="checkbox" ${roles.has(r)?'checked':''} onchange="quickRoleToggleRole('${r}',this.checked)"><span>${roleNames[r]}</span></label>`).join('');
  const selected=new Set(row.workshops||[]);
  const shopChips=presets.map(w=>`<label class="worker-access-chip ${selected.has(w)?'checked':''}"><input type="checkbox" ${selected.has(w)?'checked':''} onchange="quickRoleToggleWorkshop('${jsStrArg(w)}',this.checked)"><span>${escapeHtml(w)}</span></label>`).join('');
  const shops=roles.has('worker')?`<div class="worker-access-sub"><small>Цеха рабочего</small><div class="worker-access-chips">${shopChips||'<span class="muted" style="font-size:12px">нет цехов в списке</span>'}</div></div>`:'';
  const warn=roles.size?'':'<span class="worker-access-warn">Выберите хотя бы одну должность</span>';
  const eff=effectivePerms({roles:[...roles],extra:row.extra,denied:row.denied});
  const diff=(row.extra||[]).length+(row.denied||[]).length;
  let permsHtml='';
  if(row._open){
    const groups={};
    PERMISSIONS.forEach(pm=>{(groups[pm.group]=groups[pm.group]||[]).push(pm)});
    permsHtml=`<div class="worker-perms">${Object.keys(groups).map(g=>`<div class="worker-perm-group"><b>${escapeHtml(g)}</b>${groups[g].map(pm=>{
      const on=eff.has(pm.key),mark=(row.extra||[]).includes(pm.key)?'добавлено':(row.denied||[]).includes(pm.key)?'отключено':'';
      return `<label class="worker-perm ${on?'checked':''} ${mark?'override':''}"><input type="checkbox" ${on?'checked':''} onchange="quickRoleTogglePerm('${pm.key}',this.checked)"><span>${escapeHtml(pm.label)}</span>${mark?`<em>${mark}</em>`:''}</label>`;
    }).join('')}</div>`).join('')}</div>`;
  }
  const permsBlock=roles.size?`<div class="worker-access-sub"><button type="button" class="worker-access-permbtn" onclick="quickRoleTogglePerms()">Точечные права${diff?` · изменено: ${diff}`:''}<span class="worker-access-permchev ${row._open?'open':''}" aria-hidden="true">⌄</span></button>${permsHtml}</div>`:'';
  return `<div class="worker-access-cols" style="display:flex;flex-direction:column;gap:12px">
    <div class="worker-access-sub"><small>Должности (можно несколько)</small><div class="worker-access-chips">${roleChips}</div></div>
    ${shops}${warn}${permsBlock}
  </div>`;
}
function renderQuickRoleModalBody(){
  const body=document.getElementById('quickRoleModalBody');
  if(body)body.innerHTML=quickRoleModalBodyHtml();
}
function openQuickRoleModal(email){
  ensureQuickRoleDraft(email);
  openModal(`Роль: ${email}`,`<div id="quickRoleModalBody">${quickRoleModalBodyHtml()}</div>`,`<button class="btn" type="button" onclick="closeModal()">Отмена</button><button class="btn primary" type="button" onclick="saveQuickRole()">Сохранить</button>`);
}
async function saveQuickRole(){
  const row=quickRoleDraft;if(!row)return;
  if(!row.roles.length){toast('Выберите хотя бы одну должность');return}
  const list=(workerAccessList||[]).filter(w=>String(w.email||'').toLowerCase()!==String(row.email).toLowerCase());
  list.push({
    email:row.email,
    roles:['technologist','master','storekeeper','worker'].filter(r=>row.roles.includes(r)),
    workshops:row.roles.includes('worker')?row.workshops:[],
    extra:(row.extra||[]).filter(k=>PERMISSION_KEYS.includes(k)),
    denied:(row.denied||[]).filter(k=>PERMISSION_KEYS.includes(k))
  });
  const ok=await saveWorkerAccessList(list);
  if(ok){
    closeModal();
    quickRoleDraft=null;
    renderUsersSection();
    if(typeof renderWorkerAccessPanel==='function')renderWorkerAccessPanel();
  }
}
