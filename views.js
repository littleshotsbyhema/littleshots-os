/* ===================================================================
   Little Shots Studio OS — screens
   Pure rendering. Loaded before app.js, which holds the state,
   the data access and the actions these screens call.
   =================================================================== */

function shellError(title, body) {
  return `<div class="login"><div class="loginbox">
    <div class="logo" style="width:38px;height:38px;font-size:15px;margin-bottom:14px">LS</div>
    <h2>${title}</h2><p>${body}</p>
    <button class="btn p" style="width:100%;margin-top:14px" onclick="A.signOut()">Sign out</button>
  </div></div>`;
}

/* ----------------------------------------------------------- login */
function renderLogin(errMsg) {
  $("root").innerHTML = `<div class="login"><div class="loginbox">
    <div class="logo" style="width:38px;height:38px;font-size:15px;margin-bottom:14px">LS</div>
    <h2>Little Shots Studio OS</h2>
    <p>Sign in with your studio account.</p>
    <form id="loginForm" autocomplete="on">
      <label>Username</label>
      <input class="inp" id="liEmail" type="email" placeholder="firstname@littleshotsbyhema.com" autocomplete="username" required>
      <label>Password</label>
      <input class="inp" id="liPass" type="password" autocomplete="current-password" required>
      <button class="btn p" style="width:100%;margin-top:16px" id="liBtn" type="submit">Sign in</button>
    </form>
    ${errMsg ? `<div class="err">${esc(errMsg)}</div>` : ""}
    <p class="hint">Forgotten your password? An admin can reset it for you.</p>
  </div></div>`;
  $("loginForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const btn = $("liBtn");
    btn.disabled = true; btn.textContent = "Signing in…";
    const { data, error } = await sb.auth.signInWithPassword({
      email: $("liEmail").value.trim().toLowerCase(), password: $("liPass").value
    });
    if (error) return renderLogin(error.message === "Invalid login credentials"
      ? "That username or password is not right." : error.message);
    S.session = data.session;
    $("root").innerHTML = `<div class="loader"><div class="spin"></div>Loading your work…</div>`;
    boot();
  });
}

/* ------------------------------------------------- shell + top tabs */
function render() {
  if (!S.session || !S.me) return;
  if (!canSee(S.view)) S.view = firstAllowed();
  $("root").innerHTML = `
    <div class="topbar">
      <div class="tb1">
        <div class="brand"><div class="logo">LS</div>
          <div>Studio OS<small>${esc(S.me.full_name)} · ${esc(accLabel(S.me))}</small></div></div>
        <div class="sp"></div>
        <select onchange="A.setLoc(this.value)" title="Filter by location">
          ${["All", ...LOCATIONS].map(l => `<option ${l === S.loc ? "selected" : ""}>${esc(l)}</option>`).join("")}
        </select>
        ${canSee("crm") ? `<button class="btn p sm" onclick="A.newJob()">+ New enquiry</button>` : ""}
        <button class="btn sm" onclick="A.changePassword()">Password</button>
        <button class="btn sm" onclick="A.signOut()">Sign out</button>
      </div>
      <div class="tabs">${tabs()}</div>
    </div>
    <main class="main" id="main">${viewHTML()}</main>`;
}
function accLabel(p) {
  return p.is_admin ? "Admin" : (p.access.length ? p.access.map(m => MODLABEL[m]).join(" + ") : "No access yet");
}
function tab(key, label, count, bad) {
  return `<button class="${S.view === key ? "on" : ""}" onclick="A.go('${key}')">${label}
    ${count !== undefined && count !== null && count !== "" ? `<span class="count ${bad ? "bad" : ""}">${count}</span>` : ""}</button>`;
}
function tabs() {
  let h = "";
  /* your own page comes first - it is what you open the app for */
  const mine = myJobs().length + myTasks().length;
  h += tab("me", "My work", mine || "", lateTasks().some(t => t.assignee_id === (S.me||{}).id));
  h += tab("tasks", "Tasks", openTasks().length || "", lateTasks().length);
  if (canSee("dash")) h += tab("dash", "Dashboard");
  if (canSee("crm")) {
    const chase = chaseList().length;
    h += tab("crm-chase", "Follow-ups", chase || "", chase);
  }
  BOARDS.filter(canSee).forEach(k => {
    const late = breaches(k).length;
    h += tab(k, MODLABEL[k], late ? late + " late" : modCount(k), late);
  });
  if (canSee("pay")) h += tab("pay", "Payments", owing().length || "", owing().length);
  if (canSee("social")) {
    const n = toPost().length;
    h += tab("social", "Post to Social", n || "", false);
  }
  if (canSee("files")) {
    const due = dueToDelete().length;
    h += tab("files", "Remove Files", due || deleteList().length || "", due);
  }
  if (canSee("life")) h += tab("life", "Marketing");
  if (canSee("sla")) h += tab("sla", "Settings");
  if (canSee("team")) h += tab("team", "Team");
  return h;
}
function viewHTML() {
  switch (S.view) {
    case "dash": return dashView();
    case "prep": return prepView();
    case "crm-chase": return crmView();
    case "pay": return payView();
    case "life": return lifeView();
    case "sla": return slaView();
    case "team": return teamView();
    case "archive": return archiveView();
    case "files": return filesView();
    case "social": return socialView();
    case "me": return meView();
    case "tasks": return tasksView();
    case "noaccess": return `<div class="head"><h1>No access yet</h1></div>
      <p class="sub">No pipelines have been assigned to you. An admin can fix that in Team.</p>`;
    default: return boardView(S.view);
  }
}
const locTag = () => S.loc === "All" ? "" : `<span class="tag grey">${esc(S.loc)}</span>`;

/* --------------------------------------------------- my work */
/* What this person has to do today, in one place: the jobs that sit in their
   name with the one thing each is waiting on, then their own tasks. */
function meView() {
  const who = viewingId(), own = who === (S.me || {}).id;
  const jobs = myJobs(who), tasks = myTasks(who);
  const late = jobs.filter(j => j.sla_status === "OVERDUE");
  const name = own ? ((S.me && S.me.full_name) || "you") : viewingName();
  const taskRow = t => `<tr onclick="A.editTask(${t.id})" style="cursor:pointer">
      <td><b>${esc(t.title)}</b>${t.job_client
        ? `<br><span style="color:var(--ink-soft);font-size:12px">${esc(t.job_client)}</span>` : ""}</td>
      <td>${t.due_state === "OVERDUE" ? `<span class="pill red">overdue</span>`
          : t.due_state === "Due today" ? `<span class="pill amber">today</span>`
          : esc(t.due_on)}</td>
      <td style="color:var(--ink-soft);font-size:12px">${esc(t.created_by_name || "")}</td></tr>`;
  const jobRow = j => `<tr onclick="A.openJob(${j.id})" style="cursor:pointer">
      <td><b>${esc(j.client_name)}</b><br>
        <span style="color:var(--ink-soft);font-size:12px">${esc(j.shoot_type)}${
          j.shoot_at ? " · " + when(j.shoot_at) : ""}</span></td>
      <td><span class="pill ${slaPill(j)}">${esc(j.stage)}</span></td>
      <td>${esc(nextAction(j) || "Nothing outstanding")}</td></tr>`;
  return `<div class="head"><h1>${own ? "My work" : esc(name) + "'s work"}</h1>${locTag()}
      <span class="tag">${jobs.length} job${jobs.length === 1 ? "" : "s"}</span>
      ${tasks.length ? `<span class="tag">${tasks.length} task${tasks.length === 1 ? "" : "s"}</span>` : ""}
      ${late.length ? `<span class="tag red">${late.length} past SLA</span>` : ""}</div>
    <p class="sub">Everything in ${esc(name)}'s name, and what each one is waiting on.</p>
    ${isAdmin() ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <span style="font-size:12px;color:var(--ink-soft);font-weight:650">Looking at</span>
      <select class="inp" style="max-width:240px" onchange="A.lookAt(this.value)">
        <option value="">${esc((S.me && S.me.full_name) || "Me")} (me)</option>
        ${S.people.filter(p => p.active && p.id !== (S.me || {}).id)
          .map(p => `<option value="${esc(p.id)}" ${p.id === who ? "selected" : ""}
            >${esc(p.full_name)}</option>`).join("")}
      </select>
      ${own ? "" : `<button class="btn sm" onclick="A.lookAt(null)">Back to mine</button>`}
    </div>` : ""}
    <div class="acts" style="margin-bottom:12px">
      <button class="btn p sm" onclick="A.newTask(null)">+ New task</button></div>

    <div class="panel"><h3>${own ? "Jobs in my name" : "Jobs in " + esc(name) + "'s name"}</h3>
      <p class="ph">The next thing each one needs. Click a row to open it.</p>
      ${jobs.length ? `<table><thead><tr><th>Client</th><th>Stage</th><th>Next action</th></tr></thead>
        <tbody>${jobs.slice().sort((a, b) =>
          num(b.days_in_stage) - num(a.days_in_stage)).map(jobRow).join("")}</tbody></table>`
        : `<div class="empty">${own ? "Nothing is assigned to you right now"
             : "Nothing is assigned to " + esc(name) + " right now"}</div>`}</div>

    <div class="panel"><h3>${own ? "My tasks" : esc(name) + "'s tasks"}</h3>
      <p class="ph">${own
        ? "Open tasks someone has given you. Click one to update or close it."
        : "Open tasks " + esc(name) + " has been given."}</p>
      ${tasks.length ? `<table><thead><tr><th>Task</th><th>Finish by</th><th>From</th></tr></thead>
        <tbody>${tasks.map(taskRow).join("")}</tbody></table>`
        : `<div class="empty">No open tasks</div>`}</div>`;
}

/* ------------------------------------------------------- tasks */
function tasksView() {
  const view = S.taskView || "mine";
  const all = S.tasks || [];
  const rows = view === "mine" ? all.filter(t => t.assignee_id === (S.me||{}).id && t.status === "open")
             : view === "late" ? all.filter(t => t.status === "open" && t.due_state === "OVERDUE")
             : view === "done" ? all.filter(t => t.status === "done")
             : all.filter(t => t.status === "open");
  const pill = v => `<button class="${view === v ? "on" : ""}"
      aria-pressed="${view === v}" onclick="A.taskFilter('${v}')">`;
  const row = t => `<tr onclick="A.editTask(${t.id})" style="cursor:pointer">
      <td><b>${esc(t.title)}</b>${t.detail
        ? `<br><span style="color:var(--ink-soft);font-size:12px">${esc(t.detail)}</span>` : ""}</td>
      <td>${esc(t.assignee_name || "—")}</td>
      <td>${t.status === "done" ? `<span class="pill green">done</span>`
          : t.due_state === "OVERDUE" ? `<span class="pill red">overdue</span>`
          : t.due_state === "Due today" ? `<span class="pill amber">today</span>`
          : esc(t.due_on)}</td>
      <td>${t.job_client
        ? `<span style="color:var(--ink-soft);font-size:12px">${esc(t.job_client)}</span>` : ""}</td>
      <td style="color:var(--ink-soft);font-size:12px">${esc(t.created_by_name || "")}</td></tr>`;
  return `<div class="head"><h1>Tasks</h1>${locTag()}
      <span class="tag">${openTasks().length} open</span>
      ${lateTasks().length ? `<span class="tag red">${lateTasks().length} overdue</span>` : ""}</div>
    <p class="sub">Anything the studio needs doing that is not a shoot. Everyone sees them all.</p>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
      <div class="modeswitch">
        ${pill("mine")}Mine</button>
        ${pill("open")}All open</button>
        ${pill("late")}Overdue</button>
        ${pill("done")}Done</button>
      </div>
      <button class="btn p sm" onclick="A.newTask(null)">+ New task</button>
    </div>
    ${rows.length ? `<div class="panel"><table>
      <thead><tr><th>Task</th><th>For</th><th>Finish by</th><th>Job</th><th>From</th></tr></thead>
      <tbody>${rows.map(row).join("")}</tbody></table></div>`
      : `<div class="empty">Nothing here</div>`}`;
}

/* ------------------------------------------------ post to social */
/* One row per piece of material, not per job. Ticking it posted is what
   takes it off the list, so what is left is always what still owes a post. */
function socialView() {
  const rows = toPost();
  const byKind = k => rows.filter(r => r.kind.key === k).length;
  const line = r => {
    const j = r.job, k = r.kind, link = k.link(j);
    return `<tr>
      <td><b>${esc(j.client_name)}</b><br>
        <span style="color:var(--ink-soft);font-size:12px">${esc(j.shoot_type)}${
          j.shoot_at ? " · " + when(j.shoot_at) : ""}</span></td>
      <td><span class="pill blue">${esc(k.label)}</span></td>
      <td style="font-size:12.5px">${link
        ? `<a href="${esc(link)}" target="_blank" rel="noreferrer noopener"
             style="color:var(--rose);font-weight:600;word-break:break-all">${esc(link)}</a>`
        : `<span style="color:var(--ink-soft)">no link on file</span>`}</td>
      <td style="white-space:nowrap">
        <button class="btn p sm" onclick="A.markPosted(${j.id},'${k.key}')">Mark posted</button>
        <button class="btn sm" onclick="A.openJob(${j.id})">Open job</button></td></tr>`;
  };
  return `<div class="head"><h1>Post to Social</h1>${locTag()}
      <span class="tag">${rows.length} waiting</span>
      ${["bts", "video", "photos"].map(k => byKind(k)
        ? `<span class="tag grey">${byKind(k)} ${esc(postKind(k).label.toLowerCase())}</span>` : "").join("")}</div>
    <p class="sub">Everything the studio has that is worth putting out and has not gone up yet.
      BTS appears as soon as the photographer hands over a backup link; video and photos
      appear when QC says they are worth it.</p>
    ${rows.length ? `<div class="panel"><table>
      <thead><tr><th>Client</th><th>What</th><th>Files</th><th></th></tr></thead>
      <tbody>${rows.map(line).join("")}</tbody></table></div>`
      : `<div class="empty">Nothing waiting to be posted</div>`}
    <p class="hint">Marking a row posted only takes it off this list — it does not post
      anything. A job can sit here three times, once for each kind.</p>`;
}

/* --------------------------------------- remove files from backup */
/* Every job whose clock is running, soonest first. A row leaves this list the
   moment someone marks the files gone, which is the whole point of it. */
function filesView() {
  const rows = deleteList(), due = dueToDelete();
  const days = RETENTION_DAYS();
  const line = j => {
    const left = num(j.days_to_delete);
    const ok = !!j.backup_confirmed_at;
    const state = ok
      ? `<span class="pill green">backup confirmed</span>`
      : left > 0 ? `<span class="pill">waiting on client</span>`
      : `<span class="pill amber">never confirmed</span>`;
    const clock = left > 0
      ? `${left} day${left === 1 ? "" : "s"} left`
      : `<b style="color:var(--red)">due now</b>`;
    const links = [
      j.gallery_link ? `<a href="${esc(j.gallery_link)}" target="_blank" rel="noopener">unedited</a>` : "",
      j.edited_link ? `<a href="${esc(j.edited_link)}" target="_blank" rel="noopener">edited</a>` : "",
      j.has_video && j.video_link ? `<a href="${esc(j.video_link)}" target="_blank" rel="noopener">video</a>` : ""
    ].filter(Boolean).join(" · ") || `<span style="color:var(--ink-soft)">no links on file</span>`;
    return `<tr>
      <td><b>${esc(j.client_name)}</b><br>
        <span style="color:var(--ink-soft);font-size:12px">${esc(j.shoot_type)}</span></td>
      <td style="font-size:12.5px">${links}</td>
      <td>${state}${j.backup_confirmed_at
        ? `<br><span style="color:var(--ink-soft);font-size:12px">${when(j.backup_confirmed_at)}</span>` : ""}</td>
      <td>${clock}<br><span style="color:var(--ink-soft);font-size:12px">${
        j.delete_due_on ? esc(j.delete_due_on) : ""}</span></td>
      <td style="white-space:nowrap">
        <button class="btn p sm" onclick="A.markDeleted(${j.id})">Mark deleted</button>
        ${j.backup_confirmed_at ? "" :
          `<button class="btn sm" onclick="A.copyBackupLink(${j.id})">Remind</button>`}</td></tr>`;
  };
  return `<div class="head"><h1>Remove Files from Backup</h1>${locTag()}
      <span class="tag">${rows.length} waiting</span>
      ${due.length ? `<span class="tag red">${due.length} due now</span>` : ""}</div>
    <p class="sub">The studio keeps every shoot for ${days} days after the client is told
      their order is ready. This is what is still on the drives.</p>
    ${due.length ? `<div class="alert red"><b>${due.length} ${due.length === 1
        ? "shoot is" : "shoots are"} ready to come off the drives.</b>
        Either their ${days} days are up, or they have told us their own backup is taken.</div>`
      : `<div class="alert green"><b>Nothing is due yet.</b> ${rows.length
        ? "The soonest has " + num(rows[0].days_to_delete) + " days to go." : ""}</div>`}
    ${rows.length ? `<div class="panel"><table>
      <thead><tr><th>Client</th><th>Files</th><th>Backup</th><th>Delete by</th><th></th></tr></thead>
      <tbody>${rows.map(line).join("")}</tbody></table></div>`
      : `<div class="empty">Nothing is waiting to be deleted</div>`}
    <p class="hint">Marking a row deleted only records that you have cleared the drive —
      it takes the row off this list and cannot be undone here.</p>`;
}

/* ------------------------------------------------------- dashboard */
function dashView() {
  const p = pool();
  const week = upcoming(7), today = week.filter(j => isToday(j.shoot_at));
  const monday = new Date(); monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const bookedWeek = p.filter(j => j.booked_at && new Date(j.booked_at) >= monday);
  const firstOfMonth = new Date(); firstOfMonth.setDate(1); firstOfMonth.setHours(0, 0, 0, 0);
  const lateMonth = p.filter(j => j.sla_status === "OVERDUE" &&
    new Date(j.stage_entered_at) >= firstOfMonth);
  const tbd = p.filter(j => j.shoot_status === "TBD");
  const missing = p.filter(j => j.shoot_status === "Missing");

  const kpi = [
    ["Shoots this week", String(week.length), today.length ? today.length + " today" : "next 7 days", false],
    ["Booked this week", String(bookedWeek.length),
      bookedWeek.length ? rupee(bookedWeek.reduce((a, j) => a + num(j.package_value), 0)) : "none yet", false],
    ["Past SLA now", String(breaches().length), breaches().length ? "needs clearing" : "all clear", !!breaches().length],
    ["Past SLA this month", String(lateMonth.length), "entered the stage this month", !!lateMonth.length],
    ["Dates still TBD", String(tbd.length), tbd.length ? "chase the client" : "all confirmed", !!tbd.length],
    ["Outstanding", rupee(owedTotal()), owing().length + " job" + (owing().length === 1 ? "" : "s"), !!owedTotal()]
  ];

  let days = "", cur = "";
  week.forEach(j => {
    const d = fmtDay(j.shoot_at);
    if (d !== cur) { cur = d; days += `<tr><td colspan="4" class="daygroup">${esc(d)}${isToday(j.shoot_at) ? " · today" : ""}</td></tr>`; }
    days += `<tr style="cursor:pointer" onclick="A.openJob(${j.id})">
      <td><b>${new Date(j.shoot_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</b></td>
      <td><b>${esc(j.client_name)}</b><br><span style="color:var(--ink-soft)">${esc(j.shoot_type)}</span></td>
      <td>${esc(j.venue && j.venue !== "Studio" ? j.venue + " · " + j.location : j.location)}</td>
      <td>${esc(j.owner_name || "unassigned")}<br>
        <span class="pill ${slaPill(j)}">${esc(j.stage)}</span></td></tr>`;
  });

  return `<div class="head"><h1>This week</h1>${locTag()}
      <span class="tag grey">${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</span></div>
  <p class="sub">Everything that needs your attention, counted live.</p>
  <div class="kpis">${kpi.map(([l, v, d, bad]) => `<div class="kpi ${bad ? "hot" : ""}">
    <div class="l">${esc(l)}</div><div class="v">${esc(v)}</div>
    <div class="d ${bad ? "dn" : "mute"}">${esc(d)}</div></div>`).join("")}</div>

  ${missing.length ? `<div class="alert red"><b>${missing.length} booked job${missing.length === 1 ? " has" : "s have"} no shoot slot at all.</b>
     Open them and either set a date or mark TBD.</div>` : ""}

  <div class="grid2"><div>
    <div class="panel"><h3>Upcoming shoots · next 7 days</h3>
      <p class="ph">Click a row to open the job.</p>
      ${week.length ? `<table><thead><tr><th>Time</th><th>Client</th><th>Where</th><th>Who / stage</th></tr></thead>
        <tbody>${days}</tbody></table>`
        : `<div class="empty">Nothing scheduled in the next 7 days</div>`}
      ${tbd.length ? `<p class="hint">${tbd.length} more booked ${tbd.length === 1 ? "job is" : "jobs are"} waiting on the client to fix a date.</p>` : ""}
    </div>
  </div><div>
    <div class="panel"><h3>Where everything is</h3><p class="ph">Jobs in each stage right now.</p>
      ${barsHTML(flow().map(s => [s.name, pool().filter(j => j.stage === s.name).length]))}</div>
    <div class="panel"><h3>Past SLA by pipeline</h3><p class="ph">Who needs to unblock what.</p>
      ${barsHTML(BOARDS.map(k => [MODLABEL[k], breaches(k).length]))}</div>
  </div></div>`;
}

/* ---------------------------------------------------------- boards */
function boardView(k) {
  const stages = modStages(k);
  const late = breaches(k).length, due = dueToday(k).length;
  const ow = owing(k), lk = lockedList(k);
  const money = ow.length ? `<div class="alert red">
      <b>${rupee(owedTotal(k))} pending across ${ow.length} job${ow.length === 1 ? "" : "s"}.</b>
      ${k === "del" || k === "post" || k === "print" ? "Nothing is handed over or printed until this clears." : "Collect before files leave the studio."}
      <button class="btn sm" onclick="A.go('pay')">See list</button></div>` : "";
  const lock = lk.length ? `<div class="alert dark">
      <b>⤓ ${lk.length} client link${lk.length === 1 ? "" : "s"} must stay view-only.</b>
      Preview links with downloads disabled — no originals, no Drive access, until the balance clears.
      <button class="btn sm dark" onclick="A.go('pay')">Which ones</button></div>` : "";
  const sla = late
    ? `<div class="alert amber"><b>${late} past SLA.</b> Longest waits are at the top of each column.</div>`
    : `<div class="alert green"><b>Everything inside SLA.</b> ${due ? due + " due today." : "Nothing due today."}</div>`;
  return `<div class="head"><h1>${MODLABEL[k]}</h1>${locTag()}
      <span class="tag">${modCount(k)} active</span>
      ${late ? `<span class="tag amber">${late} past SLA</span>` : ""}
      ${ow.length ? `<span class="tag red">${rupee(owedTotal(k))} pending</span>` : ""}
      ${k === "crm" && canSee("archive") ? `<button class="archlink" onclick="A.go('archive')">
        Archive (${archivedJobs().length})</button>` : ""}</div>
    <p class="sub">${boardSub(k)}</p>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
      ${modeSwitch(k)}<div style="flex:1;min-width:220px">${searchBar(true)}</div>
    </div>
    ${money}${lock}${sla}
    ${boardMode(k) === "list" ? listHTML(k)
      : (ROWS[k] || [{ main: true }]).map(r => r.main
        ? `<div class="board">${stages.map(st => colHTML(k, st)).join("")}</div>`
        : childRowHTML(r.kind)).join("")}
    <p class="hint">${boardMode(k) === "list"
      ? "Click a column heading to sort. The coloured edge is the SLA state."
      : "Card edge shows SLA state. ₹ means money is owed; a black ⤓ strip means the client's link must stay view-only."}</p>`;
}
/* Board or list. A board is worth looking at when a column holds a dozen jobs;
   past that it is a list pretending otherwise, so Sales starts as a list. */
const boardMode = k => (S.mode && S.mode[k]) || (k === "crm" ? "list" : "board");
function modeSwitch(k) {
  const m = boardMode(k);
  return `<div class="modeswitch">
    <button class="${m === "list" ? "on" : ""}" onclick="A.setMode('${k}','list')">List</button>
    <button class="${m === "board" ? "on" : ""}" onclick="A.setMode('${k}','board')">Board</button>
  </div>`;
}
/* Every job in one scrollable table. Sales gets the follow-up columns because
   that is what it is judged on; the other boards get the shoot and the wait. */
function listHTML(k) {
  const sales = k === "crm";
  const rows = pool().filter(j => onBoard(j, k));
  const key = S.sortKey || (sales ? "followup" : "days");
  const dir = S.sortDir === "desc" ? -1 : 1;
  const val = (j, kk) => ({
    client: String(j.client_name || "").toLowerCase(),
    stage: num(j.stage_no) * 1e6 - num(j.days_in_stage),
    followup: j.next_followup_on ? Date.parse(j.next_followup_on) : 8.64e15,
    chased: j.last_followup_at ? Date.parse(j.last_followup_at) : 0,
    days: -num(j.days_in_stage),
    shoot: j.shoot_at ? Date.parse(j.shoot_at) : 8.64e15,
    owner: String(j.owner_name || "~").toLowerCase()
  })[kk];
  const sorted = rows.slice().sort((a, b) => {
    const x = val(a, key), y = val(b, key);
    return (x > y ? 1 : x < y ? -1 : 0) * dir;
  });
  const th = (kk, label) =>
    `<th onclick="A.sortBy('${kk}')">${label}${key === kk ? (dir === 1 ? " ↑" : " ↓") : ""}</th>`;

  const row = j => `<tr onclick="A.openJob(${j.id})">
    <td><span class="edge ${slaClass(j)}"></span><b>${esc(j.client_name)}</b>
      <div class="mute">${esc(j.shoot_type)}${collab(j) ? " · collaboration" : ""}${
        j.referred_by ? " · via " + esc(j.referred_by) : ""}</div></td>
    <td>${esc(j.phone || "—")}</td>
    <td>${esc(j.stage)}<div class="mute">${num(j.days_in_stage)}d</div></td>
    ${sales ? `<td>${j.next_followup_on
        ? `${when(j.next_followup_on)}<div class="mute">${chaseState(j)}</div>`
        : `<span class="pill amber">not set</span>`}</td>
      <td>${j.last_followup_at ? when(j.last_followup_at) : "never"}
        <div class="mute">${num(j.followups_count) || 0} logged</div></td>`
      : `<td>${j.shoot_at ? fmtShoot(j.shoot_at) : (j.shoot_tbd ? "TBD" : "—")}</td>
         <td>${bal(j) > 0 ? `<span class="pill red">${rupee(bal(j))}</span>`
            : collab(j) ? `<span class="pill">collab</span>` : `<span class="pill green">clear</span>`}</td>`}
    <td>${esc(j.owner_name || "unassigned")}</td>
    <td>${sales ? `<button class="btn sm" onclick="event.stopPropagation();A.logFollowup(${j.id})">Log</button>` : ""}</td>
  </tr>`;

  if (!sorted.length) {
    return `<div class="listwrap"><div class="empty" style="padding:26px">${
      S.q ? "Nothing matches that search." : "Nothing here yet."}</div></div>`;
  }
  return `<div class="listwrap"><table>
    <thead><tr>
      ${th("client", "Client")}
      <th style="cursor:default">Phone</th>
      ${th("stage", "Stage")}
      ${sales ? th("followup", "Next follow-up") + th("chased", "Last chased")
              : th("shoot", "Shoot") + `<th style="cursor:default">Money</th>`}
      ${th("owner", "Owner")}<th style="cursor:default"></th>
    </tr></thead>
    <tbody>${sorted.map(row).join("")}</tbody></table></div>
    <p class="hint">${sorted.length} ${sorted.length === 1 ? "job" : "jobs"} shown.</p>`;
}
/* One box for "she's on the phone right now and I need her job".
   Digits look for a phone number, anything else for a name. */
function searchBar(inline) {
  const q = String(S.q || "");
  const hits = q ? pool().length : 0;
  return `<div class="searchbar" style="display:flex;align-items:center;gap:9px;${
    inline ? "" : "margin-bottom:12px"}">
    <input class="inp" id="searchBox" style="max-width:320px" value="${esc(q)}"
      autocomplete="off" inputmode="search"
      placeholder="Search a mobile number or a name"
      oninput="A.setSearch(this.value)">
    ${q ? `<button class="btn sm" onclick="A.clearSearch()">Clear</button>
      <span class="tag ${hits ? "" : "amber"}">${hits
        ? hits + (hits === 1 ? " match" : " matches") : "nothing found"}</span>` : ""}
  </div>`;
}
function boardSub(k) {
  return {
    crm: "Every enquiry from first message to signed booking.",
    prod: "Booked jobs through the shoot to the client's gallery.",
    post: "Client selection, editing and quality control — with the video moving in parallel.",
    print: "Jobs the client has signed off, with their album and frame being made.",
    del: "The client collecting their order, and the job being closed off."
  }[k] || "";
}
function colHTML(k, st) {
  const list = pool().filter(j => j.stage === st.name)
    .sort((a, b) => (b.days_in_stage || 0) - (a.days_in_stage || 0));
  const shared = (st.modules || []).length > 1;
  const note = st.optional_for
    ? `<div class="link">${{ video: "▶", album: "▣", frame: "▢", pickup: "▫" }[st.optional_for] || "•"} ${optionalNote(st.optional_for)} — others skip this</div>`
    : shared ? `<div class="link">↳ shared with ${(st.modules || []).filter(m => m !== k).map(m => MODLABEL[m]).join(", ")}</div>` : "";
  return `<div class="col ${shared ? "shared" : ""}">
    <div class="col-h"><div class="r1"><span class="name">${esc(st.name)}</span><span class="n">${list.length}</span></div>
      <div class="sla">${st.sla_days == null ? "No SLA" : "SLA " + st.sla_days + "d · " + esc(st.responsible)}</div>
      ${note}</div>
    <div class="col-body">${list.length ? list.map(cardHTML).join("")
      : `<div class="empty">Nothing here</div>`}</div></div>`;
}
/* one row per process, in the order this module wants them */
function childRowHTML(kind) {
  const def = kindDef(kind);
  const live = liveChildren(kind);
  return `<div class="trackwrap">
    <div class="trackhead">${def.mark} ${esc(def.label)} process
      <span class="tag grey">${live.length} running</span>
      <small>${esc(childRowNote(kind))}</small></div>
    <div class="board">${kindSteps(kind).map(st => childColHTML(kind, st)).join("")}</div></div>`;
}
function childRowNote(kind) {
  if (kind === "video") return "starts at " + (S.settings.selection_stage || "Waiting for Client Selection") +
    " and finishes on its own — the photos never wait for it";
  if (kind === "album") return "starts the moment the client approves their photos; " +
    (S.settings.pickup_stage || "Waiting for Client Pickup") + " waits for it";
  return "starts with the album, on the same approval; it ends at " +
    (S.settings.frame_done_stage || "Frame Completed");
}
function childColHTML(kind, st) {
  const list = liveChildren(kind).filter(c => c.stage === st.name)
    .sort((a, b) => (b.days_in_stage || 0) - (a.days_in_stage || 0));
  return `<div class="col track">
    <div class="col-h"><div class="r1"><span class="name">${esc(st.name)}</span>
      <span class="n">${list.length}</span></div>
      <div class="sla">${st.sla_days == null ? "No SLA" : "SLA " + st.sla_days + "d · " + esc(st.responsible)}</div>
    </div>
    <div class="col-body">${list.length ? list.map(childCardHTML).join("")
      : `<div class="empty">Nothing here</div>`}</div></div>`;
}
function childCardHTML(c) {
  const cls = { OVERDUE: "late", "Due today": "due", "On track": "ok" }[c.sla_status] || "";
  const pill = { OVERDUE: "red", "Due today": "amber" }[c.sla_status] || "";
  const owed = num(c.balance) > 0;
  return `<button class="card ${cls}" onclick="A.openJob(${c.job_id})">
    <div class="cn">${esc(c.client_name)}</div>
    <div class="cm">${esc(c.shoot_type)} · job at ${esc(c.job_stage)}</div>
    <div class="row">
      <span class="pill ${pill}">${c.sla_status === "No SLA" ? "no SLA"
        : c.sla_status === "OVERDUE" ? (c.days_in_stage - c.sla_days) + "d over"
        : c.sla_status === "Due today" ? "due today"
        : c.days_in_stage + "/" + c.sla_days + "d"}</span>
      ${c.days_until_archive != null ? `<span class="pill">archives in ${c.days_until_archive}d</span>` : ""}
      ${owed ? `<span class="pill red">${rupee(c.balance)} owed</span>` : ""}
      <span class="av">${ini(c.owner_name)}</span></div></button>`;
}
function cardHTML(j) {
  const soon = j.shoot_at && j.days_to_shoot <= 2;
  return `<button class="card ${slaClass(j)} ${owes(j) ? "owes" : ""}" onclick="A.openJob(${j.id})">
    <div class="cn">${esc(j.client_name)}</div>
    <div class="cm">${esc(j.shoot_type)}</div>
    <div class="loc">◎ ${esc(j.location)}${j.venue && j.venue !== "Studio" ? " · " + esc(j.venue) : ""}</div>
    ${j.shoot_at ? `<div class="shootbar ${soon ? "soon" : "set"}">◷ ${esc(fmtShoot(j.shoot_at))}${isToday(j.shoot_at) ? " · TODAY" : ""}</div>`
      : j.shoot_status === "TBD" ? `<div class="shootbar tbd">◷ DATE TBD</div>`
      : j.shoot_status === "Missing" ? `<div class="owebar">◷ NO SHOOT SLOT</div>` : ""}
    ${owes(j) ? `<div class="owebar">₹ ${rupee(bal(j)).slice(1)} PENDING</div>` : ""}
    ${selectionOver(j) ? `<div class="shootbar tbd">◆ ${selectionOver(j)} OVER THE PACKAGE</div>` : ""}
    ${locked(j) ? `<div class="owebar lock">⤓ DOWNLOAD LOCKED · VIEW ONLY</div>`
      : j.file_access === "Downloads unlocked" ? `<div class="okbar">⤓ Download unlocked</div>` : ""}
    <div class="row">
      <span class="pill ${slaPill(j)}">${slaText(j)}</span>
      ${childrenOf(j.id).filter(c => c.state === "active")
        .map(c => `<span class="pill blue">${kindDef(c.kind).mark} ${esc(c.stage)}</span>`).join("")}
      ${num(j.package_value) ? `<span class="pill">${rupee(j.package_value)}</span>` : ""}
      <span class="av">${ini(j.owner_name)}</span></div></button>`;
}

/* --------------------------------------------------------- archive */
function archiveView() {
  const tab = S.archiveTab || "leads";
  const leads = archivedJobs(), done = doneJobs(), vids = archivedChildren();
  const chip = (k, label, n) => `<button class="chip ${tab === k ? "on" : ""}"
    onclick="A.archiveTab('${k}')">${label} (${n})</button>`;
  return `<div class="head"><h1>Archive</h1>${locTag()}
    <button class="archlink" onclick="A.go('crm')">← Back to Sales</button></div>
  <p class="sub">Nothing here is running. Leads that went cold, jobs that closed, and videos
    the client had a fortnight to come back on.</p>
  <div class="acts" style="margin-bottom:14px">
    ${chip("leads", "Leads", leads.length)}
    ${chip("jobs", "Completed jobs", done.length)}
    ${chip("videos", "Delivered videos", vids.length)}
  </div>
  <div class="panel">${
    tab === "leads" ? archiveLeads(leads)
    : tab === "jobs" ? archiveJobs(done)
    : archiveVideos(vids)}</div>`;
}
function archiveLeads(list) {
  if (!list.length) return `<div class="empty">Nothing archived</div>`;
  return `<table><thead><tr><th>Client</th><th>Shoot</th><th>Location</th><th>Parked</th><th></th></tr></thead><tbody>
    ${list.map(j => `<tr>
      <td style="cursor:pointer" onclick="A.openJob(${j.id})"><b>${esc(j.client_name)}</b></td>
      <td>${esc(j.shoot_type)}</td><td>${esc(j.location)}</td>
      <td style="color:var(--ink-soft)">${j.days_in_stage} days</td>
      <td><button class="btn sm" onclick="A.moveTo(${j.id},'${esc(flow()[0].name)}')">Restore</button></td>
    </tr>`).join("")}</tbody></table>`;
}
function archiveJobs(list) {
  if (!list.length) return `<div class="empty">No jobs have closed yet</div>`;
  return `<table><thead><tr><th>Client</th><th>Shoot</th><th>Delivered</th><th>Value</th><th></th></tr></thead><tbody>
    ${list.map(j => `<tr>
      <td style="cursor:pointer" onclick="A.openJob(${j.id})"><b>${esc(j.client_name)}</b>
        <br><span style="color:var(--ink-soft);font-size:11px">${esc(j.location)}</span></td>
      <td>${esc(j.shoot_type)}</td>
      <td style="color:var(--ink-soft)">${j.delivered_at ? when(j.delivered_at) : "—"}</td>
      <td>${rupee(j.package_value)}</td>
      <td><button class="btn sm" onclick="A.openJob(${j.id})">View</button></td>
    </tr>`).join("")}</tbody></table>`;
}
function archiveVideos(list) {
  if (!list.length) return `<div class="empty">No delivered videos yet</div>`;
  return `<table><thead><tr><th>Client</th><th>Delivered</th><th>Job</th><th></th></tr></thead><tbody>
    ${list.map(c => `<tr>
      <td style="cursor:pointer" onclick="A.openJob(${c.job_id})"><b>${esc(c.client_name)}</b>
        <br><span style="color:var(--ink-soft);font-size:11px">${esc(c.shoot_type)}</span></td>
      <td style="color:var(--ink-soft)">${c.delivered_at ? when(c.delivered_at) : "—"}</td>
      <td>${esc(c.job_stage)}</td>
      <td><button class="btn sm" onclick="A.restoreVideo(${c.job_id})">Reopen</button></td>
    </tr>`).join("")}</tbody></table>`;
}

/* ---------------------------------------------------------- drawer */
async function openJob(id, quiet) {
  S.openId = id;
  const j = S.jobs.find(x => x.id === id);
  if (!j) return closeDrawer();
  if (!quiet) { $("drawer").classList.add("on"); $("scrim").classList.add("on"); }
  $("dTitle").textContent = j.client_name;
  $("dSub").textContent = `${j.shoot_type} · ${j.location} · ${j.stage}`;
  $("dBody").innerHTML = jobBody(j, null, null);
  const [n, a, p] = await Promise.all([
    sb.from("job_notes").select("body,created_at,author_id").eq("job_id", id).order("created_at", { ascending: false }).limit(30),
    sb.from("job_activity").select("action,created_at,actor_id").eq("job_id", id).order("created_at", { ascending: false }).limit(40),
    sb.from("v_job_payments").select("*").eq("job_id", id).order("received_on", { ascending: false }).limit(40)
  ]);
  S.payments = p.data || [];
  if (S.openId === id) $("dBody").innerHTML = jobBody(j, n.data || [], a.data || []);
}
const nameOf = uid => (S.people.find(p => p.id === uid) || {}).full_name || "System";
const when = ts => {
  const days = Math.round((Date.now() - new Date(ts)) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days + " days ago";
};

function jobBody(j, notes, acts) {
  const nextS = nextStageFor(j), prevS = prevStageFor(j);
  const b = bal(j), gate = S.settings.pay_gate_stage;
  const gateBlocked = !!nextS && payGateCrossed(j, nextS);
  const parked = archived(j);

  const payBanner = owes(j)
    ? `<div class="alert red"><b>${rupee(b)} still owed.</b> Flag before any file leaves.</div>` : "";
  const slaBanner = j.sla_status === "OVERDUE"
    ? `<div class="alert red"><b>SLA breached.</b> ${j.days_in_stage} days in ${esc(j.stage)}, target ${j.sla_days}.</div>`
    : j.sla_status === "Due today" ? `<div class="alert amber"><b>Due today.</b> Day ${j.days_in_stage} of ${j.sla_days}.</div>`
    : j.sla_status === "No SLA" ? `<div class="alert grey"><b>Parked.</b> No SLA runs on ${esc(j.stage)}.</div>`
    : `<div class="alert green"><b>Inside SLA.</b> Day ${j.days_in_stage} of ${j.sla_days}.</div>`;

  return payBanner + slaBanner + `
    ${notesSection(j, notes)}
    ${packageSection(j)}
    ${prepSection(j)}
    ${followupSection(j)}
    ${emailSection(j)}
    ${slotSection(j)}
    ${handoverSection(j)}
    ${shootQcSection(j)}
    ${selectionSection(j)}
    ${approvalSection(j)}
    ${tracksSection(j)}
    ${linksSection(j)}
    ${moveSection(j, nextS, prevS, gateBlocked, gate, b, parked)}
    ${paySection(j, b, gate)}
    ${accessSection(j, b)}
    ${closedSection(j)}
    ${jobTasksSection(j)}
    ${detailSection(j)}
    ${activitySection(acts)}
    <details class="journey"><summary>Journey</summary><div>${stepper(j)}</div></details>`;
}

function notesSection(j, notes) {
  return `<div class="sec"><h5>Notes${notes ? " (" + notes.length + ")" : ""}</h5>
    <textarea id="noteBox" placeholder="What happened? e.g. client asked to move the shoot to Sunday"></textarea>
    <div class="acts" style="margin:9px 0 12px"><button class="btn p" onclick="A.addNote(${j.id})">Save note</button></div>
    ${notes === null ? `<p class="hint">Loading…</p>`
      : notes.length ? notes.map(n => `<div class="noteitem">${esc(n.body)}
          <div class="m">${esc(nameOf(n.author_id))} · ${when(n.created_at)}</div></div>`).join("")
      : `<div class="empty">No notes yet</div>`}</div>`;
}

function packageSection(j) {
  const gaps = packageGaps(j), done = !gaps.length;
  const row = (label, value, on) => `<div class="payrow">
    <span>${label}</span><b style="${on ? "" : "color:var(--ink-soft);font-weight:600"}">${value}</b></div>`;
  const missing = `<span style="color:var(--red)">not set</span>`;
  return `<div class="sec"><h5>Package &amp; delivery details</h5>
    <div class="paybox ${done ? "" : "owes"}">
      ${row("Total package value", num(j.package_value) ? "<b>" + rupee(j.package_value) + "</b>" : missing, num(j.package_value))}
      ${row("Edited photos", num(j.edited_count) ? j.edited_count + " photos" : missing, num(j.edited_count))}
      ${row("Unedited photos", j.unedited_included ? "included" : "not included", j.unedited_included)}
      ${row("Video", j.has_video ? (esc(j.video_notes || "") || missing) : "not included", j.has_video)}
      ${row("Album", j.has_album
        ? ((esc(j.album_size || "") || missing) + (num(j.album_sheets) ? " · " + j.album_sheets + " sheets" : " · " + missing))
        : "not included", j.has_album)}
      ${row("Frame", j.frame_included ? (esc(j.frame_size || "") || missing) : "not included", j.frame_included)}
      <div class="acts" style="margin-top:11px">
        <button class="btn ${done ? "sm" : "p sm"}" onclick="A.editPackage(${j.id})">
          ${done ? "Edit details" : "Fill these in"}</button></div>
    </div>
    ${done ? "" : `<p class="hint" style="color:var(--amber)">Still missing ${gaps.join(", ")}.
      All of it is needed before ${esc(S.settings.terms_stage || "Payment Link Shared")}.</p>`}</div>`;
}

function emailSection(j) {
  const gate = S.settings.terms_stage || "Payment Link Shared";
  const gOrd = (stageByName(gate) || {}).ordinal || 0;
  if (archived(j) || j.stage_no > gOrd) return "";        // done with, or past it
  const sent = !!j.terms_sent_at;
  const doc = (S.settings.terms_url || "").trim();
  return `<div class="sec"><h5>Terms &amp; booking details</h5>
    <div class="slot ${sent ? "set" : "missing"}">
      <h6>${sent ? "✓ Terms emailed" : "Not sent yet"}</h6>
      <p>${sent
          ? `Sent ${when(j.terms_sent_at)}. The client has the terms and their booking details.`
          : j.email
            ? `Required before ${esc(gate)}. Goes to <b>${esc(j.email)}</b>${doc ? " with the terms attached" : ""}.`
            : `<span style="color:var(--red)">No email address on file.</span> Add one — the terms have to go out before ${esc(gate)}.`}
         ${!doc ? `<br><span style="color:var(--amber)">No terms document set in Settings yet.</span>` : ""}</p>
      <div class="acts" style="margin-top:10px">
        ${j.email
          ? `<button class="btn ${sent ? "sm" : "p sm"}" onclick="A.previewEmail(${j.id})">
               ${sent ? "Send again" : "Preview &amp; send"}</button>`
          : `<button class="btn sm" onclick="A.editContact(${j.id})">Add an email</button>`}
      </div></div></div>`;
}

function slotSection(j) {
  if (j.shoot_status === "Not booked yet" || j.shoot_status === "n/a") {
    return `<div class="sec"><h5>Shoot slot</h5>
      <div class="slot"><h6>Not booked yet</h6>
        <p>A date is asked for when this reaches ${esc(S.settings.booked_stage || "Booked")}.</p>
        <div class="acts" style="margin-top:10px">
          <button class="btn sm" onclick="A.setShoot(${j.id})">Set a date anyway</button></div></div></div>`;
  }
  const firm = ordOf("shoot_date_from");
  const mustBeFirm = j.stage_no >= firm;
  if (j.shoot_at) {
    const soon = j.days_to_shoot <= 2;
    return `<div class="sec"><h5>Shoot slot</h5>
      <div class="slot set"><h6>◷ ${esc(fmtShoot(j.shoot_at))}</h6>
        <p>${isToday(j.shoot_at) ? "Today." : j.days_to_shoot < 0 ? "Already happened."
            : "In " + j.days_to_shoot + " day" + (j.days_to_shoot === 1 ? "" : "s") + "."}
           ${soon && j.days_to_shoot >= 0 ? " Confirm with the client." : ""}
           ${j.venue && j.venue !== "Studio" ? "<br><b>" + esc(j.venue) + "</b> · " + esc(j.venue_address || "no address yet") : ""}</p>
        <div class="acts" style="margin-top:10px">
          <button class="btn sm" onclick="A.setShoot(${j.id})">Change date &amp; time</button></div></div></div>`;
  }
  if (j.shoot_status === "TBD") {
    return `<div class="sec"><h5>Shoot slot</h5>
      <div class="slot tbd"><h6>◷ Date to be confirmed</h6>
        <p>Booked, but the client hasn't fixed a date.
           ${mustBeFirm ? "This stage requires a real date." : "It becomes mandatory at " + esc(S.settings.shoot_date_from || "Pre-Production") + "."}</p>
        <div class="acts" style="margin-top:10px">
          <button class="btn p sm" onclick="A.setShoot(${j.id})">Set the date now</button></div></div></div>`;
  }
  return `<div class="sec"><h5>Shoot slot</h5>
    <div class="slot missing"><h6>◷ No shoot slot</h6>
      <p>This job is booked but has neither a date nor a TBD marker.</p>
      <div class="acts" style="margin-top:10px">
        <button class="btn p sm" onclick="A.setShoot(${j.id})">Fix this</button></div></div></div>`;
}

/* Everything captured as the shoot was marked complete. Shown as a read-back
   rather than a form: the people reading this later are the editors, and what
   they need is the backup, the crew and anything the client asked for. */
function handoverSection(j) {
  const gOrd = ordOf("gallery_stage");
  if (archived(j) || j.stage_no < gOrd - 1) return "";     // nothing shot yet
  const has = String(j.backup_location || "").trim(), files = num(j.files_shot);
  const done = has && files > 0;
  const past = j.stage_no >= gOrd;
  const sat = String(j.client_satisfaction || "").trim();
  const happy = /^very happy|^happy/i.test(sat);
  const row = (lbl, val) => val
    ? `<div class="drow"><span>${lbl}</span><b>${val}</b></div>` : "";
  const note = (lbl, val) => String(val || "").trim()
    ? `<div class="dnote"><span>${lbl}</span>${esc(String(val).trim())}</div>` : "";

  return `<div class="sec"><h5>Shoot completed</h5>
    <div class="slot ${done ? "set" : past ? "missing" : ""}">
      <h6>${done ? "✓ Backed up · " + files + " files" : "Shoot details not recorded"}</h6>
      <p>${done
        ? "Kept at <b>" + esc(has) + "</b>."
        : "Needed before " + esc(S.settings.gallery_stage || "Shoot Completed") +
          " — the backup, who shot it, and how the day went."}</p>
      ${done ? `<div class="dlist">
        ${row("Shot by", [j.shoot_photographer_name && esc(j.shoot_photographer_name) + " (camera)",
                          j.shoot_stylist_name && esc(j.shoot_stylist_name) + " (styling)",
                          j.shoot_videographer_name && esc(j.shoot_videographer_name) + " (video)"]
                         .filter(Boolean).join("<br>"))}
        ${row("Video", num(j.video_files)
          ? num(j.video_files) + " files" + (j.video_backup_link
              ? ` · <a href="${esc(j.video_backup_link)}" target="_blank" rel="noopener">backup</a>` : "")
          : "")}
        ${row("BTS", j.bts_backup_link
          ? `<a href="${esc(j.bts_backup_link)}" target="_blank" rel="noopener">backup link</a>` : "")}
        ${row("At the studio", j.client_in_time
          ? esc(String(j.client_in_time).slice(0,5)) +
            (j.client_out_time ? " to " + esc(String(j.client_out_time).slice(0,5)) : " — no leaving time")
          : "")}
        ${row("Client", sat ? `<span class="pill ${happy ? "green" : "amber"}">${esc(sat)}</span>` : "")}
        ${row("Google review", j.google_review === true
          ? `<span class="pill green">left one</span>${j.google_review_link
              ? ` · <a href="${esc(j.google_review_link)}" target="_blank" rel="noopener">read it</a>` : ""}`
          : j.google_review === false ? `<span class="pill">not yet</span>` : "")}
        ${row("Follow up", j.shoot_followup_on ? esc(j.shoot_followup_on) : "")}
        ${row("Thank-you", j.shootdone_sent_at
          ? '<span class="pill green">sent</span>'
          : (j.email ? '<span class="pill amber">not sent</span>' : "no email on file"))}
      </div>
      ${note("Review on the day", j.shoot_reviews)}
      ${note("Asked for in the edit", j.edit_feedback)}
      ${note("Problems", j.shoot_problems)}
      ${j.upsold ? `<div class="dnote up"><span>Upsold ${rupee(j.upsell_amount)}</span>
        ${esc(String(j.upsell_notes || "").trim())}
        ${num(j.upsell_edited_files) ? "<br>+" + num(j.upsell_edited_files) + " edited files" : ""}
        ${j.upsell_addons ? "<br>" + esc(j.upsell_addons) : ""}
        <br><span style="color:var(--ink-soft)">already added to the package value</span></div>` : ""}` : ""}
      <div class="acts" style="margin-top:10px">
        <button class="btn ${done ? "sm" : "p sm"}" onclick="A.handover(${j.id})">
          ${done ? "Edit" : "Record it"}</button>
        ${done && j.email ? `<button class="btn sm" onclick="A.mailShootDone(${j.id})">
          ${j.shootdone_sent_at ? "Send again" : "Send thank-you"}</button>` : ""}</div>
    </div></div>`;
}

/* The studio's own check on the shoot, done while the client is choosing.
   Nothing reaches an editor until someone has looked the shoot over. */
function shootQcSection(j) {
  const qcOrd = ordOf("shoot_qc_stage"), selOrd = ordOf("selection_stage");
  if (archived(j) || j.stage_no < qcOrd) return "";
  const verdict = String(j.shoot_qc_verdict || "").trim();
  const notes = String(j.shoot_qc_notes || "").trim();
  const done = verdict && notes && j.shoot_qc_head && String(j.shoot_qc_discussion || "").trim();
  const past = j.stage_no >= selOrd;
  const clean = /^good|^pass|^ok/i.test(verdict);
  const box = done
    ? `<div class="slot ${clean ? "set" : ""}">
        <h6><span class="pill ${clean ? "green" : "amber"}">${esc(verdict)}</span></h6>
        <p>Reviewed${j.shoot_qc_by_name ? " by <b>" + esc(j.shoot_qc_by_name) + "</b>" : ""}
          ${j.shoot_qc_at ? when(j.shoot_qc_at) : ""}${j.shoot_qc_head_name
            ? ` · Production Head <b>${esc(j.shoot_qc_head_name)}</b>` : ""}.</p>
        <div class="dnote"><span>What it found</span>${esc(notes)}</div>
        ${String(j.shoot_qc_discussion || "").trim()
          ? `<div class="dnote"><span>Discussed with the photographer</span>${
              esc(String(j.shoot_qc_discussion).trim())}</div>` : ""}</div>`
    : past
    ? `<div class="slot"><h6>Never reviewed</h6>
        <p>This shoot moved on before the review was part of the process.
          You can still record one.</p></div>`
    : `<div class="slot missing"><h6>Not reviewed yet</h6>
        <p>The shoot has to be looked over, the findings written up, and the
          Production Head's discussion with the photographer recorded, before
          it moves to ${esc(S.settings.selection_stage || "the next stage")}.</p></div>`;
  return `<div class="sec"><h5>Shoot review</h5>${box}
    <div class="acts" style="margin-top:10px">
      <button class="btn ${done ? "sm" : "p sm"}" onclick="A.shootQc(${j.id})">
        ${done ? "Edit the review" : "Review the shoot"}</button></div></div>`;
}

/* the client picks their own photos, on their own link */
function selectionSection(j) {
  const selOrd = ordOf("selection_stage"), glOrd = ordOf("gallery_link_stage");
  if (archived(j) || j.stage_no < glOrd) return "";     // the gallery isn't out yet
  const picked = chosenOf(j), inHand = selectionIn(j), over = selectionOver(j);
  /* their link is live from the moment the gallery goes out, which is a stage
     before the job sits down to wait for them */
  const live = j.stage_no >= glOrd && j.stage_no <= selOrd && j.selection_open;
  const box = inHand
    ? `<div class="slot set"><h6>✓ ${picked.length} photo${picked.length === 1 ? "" : "s"} chosen</h6>
        <p>Sent in ${when(j.selection_submitted_at)}${num(j.edited_count)
          ? " · the package promises " + j.edited_count : ""}.
          ${over ? `<br><b style="color:var(--amber)">${over} more than the package includes —
            bill the extras or trim it with them.</b>` : ""}</p></div>`
    : live
    ? `<div class="slot"><h6>Waiting on the client</h6>
        <p>Their link is live. They list their photos and it lands here by itself${
          j.stage_no < selOrd
            ? " — their picks will be waiting when the shoot review is done"
            : " — the job moves on to " + esc(nextStageFor(j) || "editing") +
              " the moment they send it"}.</p></div>`
    : `<div class="slot missing"><h6>Nothing recorded</h6>
        <p>This job moved past the selection without one on file.</p></div>`;
  return `<div class="sec"><h5>Client selection</h5>${box}
    <div class="acts" style="margin-top:10px">
      ${live ? `<button class="btn p sm" onclick="A.copySelectionReminder(${j.id})">Copy reminder for WhatsApp</button>
        ${j.email ? `<button class="btn sm" onclick="A.mailSelectionReminder(${j.id})">Send a reminder</button>` : ""}
        <button class="btn sm" onclick="A.setSelection(${j.id})">Enter it myself</button>
        <button class="btn sm" onclick="A.copySelectionLink(${j.id})">Just the link</button>` : ""}
      ${inHand ? `<button class="btn sm" onclick="A.reopenSelection(${j.id})">Let them change it</button>
        <button class="btn sm" onclick="A.setSelection(${j.id})">Edit the list</button>` : ""}
      ${!inHand && !live ? `<button class="btn p sm" onclick="A.setSelection(${j.id})">Record it</button>` : ""}
    </div>
    ${picked.length ? `<details style="margin-top:11px"><summary
      style="cursor:pointer;font-size:12.5px;color:var(--ink-soft);font-weight:650">
      The ${picked.length} files they chose</summary>
      <textarea readonly style="min-height:120px;margin-top:8px"
        onclick="this.select()">${esc(picked.join("\n"))}</textarea></details>` : ""}
  </div>`;
}

/* The chase, for a lead that is still in Sales. The next date is the whole
   point: it is what the lead is judged against, so it leads the panel. */
function followupSection(j) {
  if (!isSales(j)) {
    /* an archived lead still owes an explanation */
    if (archived(j) && j.archive_reason) {
      return `<div class="sec"><h5>Why it was archived</h5>
        <div class="slot missing"><h6>${esc(j.archive_reason)}</h6>
          ${j.archive_note ? `<p>${esc(j.archive_note)}</p>` : ""}</div></div>`;
    }
    return "";
  }
  const state = chaseState(j), d = num(j.days_to_followup);
  const n = num(j.followups_count);
  const line = state === "Overdue"
      ? `<div class="slot missing"><h6>${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue</h6>
          <p>Due ${when(j.next_followup_on)}. Nobody has been back to them since.</p></div>`
    : state === "Today"
      ? `<div class="slot"><h6>Due today</h6><p>This is today's list — call or message them.</p></div>`
    : state === "Upcoming"
      ? `<div class="slot set"><h6>Next in ${d} day${d === 1 ? "" : "s"}</h6>
          <p>Due ${when(j.next_followup_on)}.</p></div>`
      : `<div class="slot missing"><h6>No follow-up set</h6>
          <p>Nothing scheduled — this lead will go quiet unnoticed.</p></div>`;
  return `<div class="sec"><h5>Follow-up</h5>${line}
    <p class="hint" style="margin-top:8px">${n
      ? n + (n === 1 ? " follow-up" : " follow-ups") + " logged"
        + (j.last_followup_at ? ", last " + when(j.last_followup_at) : "")
      : "Never followed up"}.</p>
    <div class="acts" style="margin-top:9px">
      <button class="btn p sm" onclick="A.logFollowup(${j.id})">Log a follow-up</button>
      ${SALES_MOVES[j.stage] ? SALES_MOVES[j.stage].filter(s => s !== "Archive")
        .map(s => `<button class="btn sm" onclick="A.moveTo(${j.id},'${esc(s)}')">${esc(s)}</button>`)
        .join("") : ""}
      ${SALES_MOVES[j.stage] ? `<button class="btn sm" onclick="A.moveTo(${j.id},'${esc(parkedStage())}')">Archive</button>` : ""}
    </div></div>`;
}

/* Today's chase list, and the shape of what Sales is sitting on. */
function crmView() {
  const mine = S.jobs.filter(j => inLoc(j) && isSales(j));
  const over = mine.filter(j => chaseState(j) === "Overdue")
    .sort((a, b) => num(a.days_to_followup) - num(b.days_to_followup));
  const today = mine.filter(j => chaseState(j) === "Today");
  const soon = mine.filter(j => chaseState(j) === "Upcoming")
    .sort((a, b) => num(a.days_to_followup) - num(b.days_to_followup));
  const cold = mine.filter(j => chaseState(j) === "Not set");
  const never = mine.filter(j => !num(j.followups_count));

  const row = j => `<tr onclick="A.openJob(${j.id})" style="cursor:pointer">
    <td><b>${esc(j.client_name)}</b><div style="color:var(--ink-soft);font-size:11.5px">
      ${esc(j.shoot_type)}${j.referred_by ? " · via " + esc(j.referred_by) : ""}</div></td>
    <td>${esc(j.stage)}</td>
    <td>${esc(j.phone || "—")}</td>
    <td>${j.next_followup_on ? when(j.next_followup_on) : "—"}</td>
    <td>${num(j.followups_count) || "never"}</td>
    <td><button class="btn sm" onclick="event.stopPropagation();A.logFollowup(${j.id})">Log</button></td></tr>`;

  const table = (list, empty) => list.length
    ? `<table class="tbl"><thead><tr><th>Client</th><th>Stage</th><th>Phone</th>
        <th>Due</th><th>Chased</th><th></th></tr></thead>
       <tbody>${list.map(row).join("")}</tbody></table>`
    : `<div class="empty">${esc(empty)}</div>`;

  /* why leads were lost, counted off the archive reasons */
  const lost = {};
  S.jobs.filter(j => inLoc(j) && j.archive_reason)
    .forEach(j => { lost[j.archive_reason] = (lost[j.archive_reason] || 0) + 1; });
  const lostRows = Object.entries(lost).sort((a, b) => b[1] - a[1]);

  const kpi = [
    ["Due today", String(today.length), today.length ? "" : ""],
    ["Overdue", String(over.length), over.length ? "dn" : ""],
    ["Never chased", String(never.length), never.length ? "dn" : ""],
    ["Live leads", String(mine.length), ""]
  ];

  return `<div class="head"><h1>Follow-ups</h1>${locTag()}
      <span class="tag">${mine.length} live leads</span>
      ${over.length ? `<span class="tag red">${over.length} overdue</span>` : ""}</div>
    <p class="sub">Who to call today, and who has been left to go quiet.</p>
    ${searchBar()}
    <div class="kpis">${kpi.map(([l, v, d]) => `<div class="kpi"><div class="l">${esc(l)}</div>
      <div class="v">${esc(v)}</div>${d ? `<div class="d dn">needs attention</div>` : ""}</div>`).join("")}</div>

    <div class="panel"><h3>Overdue</h3>
      <p class="ph">Promised a follow-up date that has already passed.</p>
      ${table(over, "Nothing overdue — the list is clean.")}</div>

    <div class="panel"><h3>Due today</h3>
      <p class="ph">Today's calls and messages.</p>
      ${table(today, "Nothing due today.")}</div>

    <div class="panel"><h3>No follow-up set</h3>
      <p class="ph">In Sales with no next date — these are the ones that quietly disappear.</p>
      ${table(cold, "Every lead has a next date.")}</div>

    <div class="panel"><h3>Coming up</h3>
      <p class="ph">The next ten, soonest first.</p>
      ${table(soon.slice(0, 10), "Nothing scheduled ahead.")}</div>

    ${lostRows.length ? `<div class="panel"><h3>Why leads are lost</h3>
      <p class="ph">Every archived lead with a reason on it.</p>
      ${barsHTML(lostRows)}</div>` : ""}`;
}

/* The way into the sheet from the job, and the only place its progress shows
   without opening it. Hidden once the shoot is past Shoot Ready. */
function prepSection(j) {
  if (archived(j)) return "";
  const kind = prepKindFor(j);
  const readyOrd = ordOf("shoot_ready_stage");
  if (!kind || num(j.stage_no) < ordOf("booked_stage") || num(j.stage_no) > readyOrd) return "";
  const live = S.prepJob === j.id && (S.prep || []).length;
  const c1 = live ? prepCounts(1) : null, c2 = live ? prepCounts(2) : null;
  return `<div class="sec"><h5>Pre-production</h5>
    <div class="slot">
      <h6>${esc(kind === "maternity" ? "Maternity" : "Baby")} checklist</h6>
      <p>${live
        ? `Phase 1: ${c1.done} of ${c1.total} · Phase 2: ${c2.done} of ${c2.total}`
        : "Everything to verify before the shoot, in two phases."}</p>
    </div>
    <div class="acts" style="margin-top:9px">
      <button class="btn p sm" onclick="A.openPrep(${j.id},1)">Open the checklist</button>
    </div></div>`;
}

/* ------------------------------------------- pre-production sheet */
/* One control per item, driven by the template. The sheet's 19 input spellings
   became 8 controls plus flags, so this renders all of them. */
function prepControl(r) {
  const a = r.answer || {};
  const v = a.value == null ? "" : a.value;
  const id = r.template_id;
  const set = `A.prepValue(${id},this.value)`;
  switch (r.control) {
    case "number":
      return `<input class="inp pv" type="number" value="${esc(v)}" onchange="${set}">`;
    case "date":
      return `<input class="inp pv" type="date" value="${esc(v)}" onchange="${set}">`;
    case "time":
      return `<input class="inp pv" type="time" value="${esc(v)}" onchange="${set}">`;
    case "datetime":
      return `<input class="inp pv" type="datetime-local" value="${esc(v)}" onchange="${set}">`;
    case "text":
      return `<textarea class="inp" style="min-height:62px" onchange="${set}"
        placeholder="${esc(r.description || "")}">${esc(v)}</textarea>`;
    case "upload":
      return `<div class="pup"><input class="inp" value="${esc(v)}" onchange="${set}"
          placeholder="Paste a link to the photo or file${r.must_upload ? " (required)" : ""}">
        ${v ? `<a class="plink" href="${esc(v)}" target="_blank" rel="noreferrer noopener">open ↗</a>` : ""}</div>`;
    case "select":
      return `<input class="inp" value="${esc(v)}" onchange="${set}"
        placeholder="Who / which one">`;
    case "yesno": {
      const opt = (lab, val) => `<button class="${a.value === val ? "on" : ""}"
        onclick="A.prepValue(${id},'${val}')">${lab}</button>`;
      return `<div class="seg">${opt("Yes", "yes")}${opt("No", "no")}${
        r.allow_unknown ? opt("Unknown", "unknown") : ""}</div>`;
    }
    default: return "";
  }
}

function prepView() {
  const j = S.jobs.find(x => x.id === S.prepJob);
  if (!j) return `<div class="head"><h1>Pre-production</h1></div>
    <p class="sub">That job is no longer open.</p>`;
  const phase = S.prepPhase || 1;
  const c1 = prepCounts(1), c2 = prepCounts(2);
  const here = phase === 1 ? c1 : c2;
  const target = phase === 1
    ? (S.settings.preprod_complete_stage || "Pre-Prod Complete")
    : (S.settings.shoot_ready_stage || "Shoot Ready");

  const list = (S.prep || []).filter(r => r.phase === phase).filter(r => {
    if (S.prepFilter === "left") return !prepDone(r);
    if (S.prepFilter === "flagged") return !!(r.answer && r.answer.note);
    return true;
  });

  const sections = [];
  list.forEach(r => {
    const s = r.section || "Items";
    let g = sections.find(x => x.name === s);
    if (!g) { g = { name: s, rows: [] }; sections.push(g); }
    g.rows.push(r);
  });

  const phaseTab = (p, cnt) => {
    const all = (S.prep || []).filter(r => r.phase === p);
    const lo = all.length ? all[0].sno : 0, hi = all.length ? all[all.length - 1].sno : 0;
    const pct = cnt.total ? Math.round(cnt.done / cnt.total * 100) : 0;
    return `<button class="ph ${phase === p ? "on" : ""}" onclick="A.prepPhase(${p})">
      <div class="pl">Items ${lo}–${hi}</div>
      <div class="ps">to ${esc(p === 1 ? (S.settings.preprod_complete_stage || "Pre-Prod Complete")
        : (S.settings.shoot_ready_stage || "Shoot Ready"))} · ${cnt.done} of ${cnt.total}</div>
      <div class="pb"><div class="pf ${cnt.done === cnt.total && cnt.total ? "ok" : ""}"
        style="width:${pct}%"></div></div></button>`;
  };

  const itemHTML = r => {
    const a = r.answer || {};
    const st = a.state || "open";
    const ctl = prepControl(r);
    return `<div class="pit ${st === "done" ? "done" : ""} ${st === "na" ? "na" : ""} ${
      a.note ? "flagged" : ""}">
      <div class="pq">
        <span class="psn">${r.sno}</span>
        ${r.control === "check"
          ? `<button class="pbox ${st === "done" ? "on" : ""}" onclick="A.prepToggle(${r.template_id})">${
              st === "done" ? "✓" : st === "na" ? "—" : ""}</button>`
          : `<span class="pbox ${st === "done" ? "on" : ""} ${st === "na" ? "nabox" : ""}">${
              st === "done" ? "✓" : st === "na" ? "—" : ""}</span>`}
        <span class="plab">${esc(r.item)}
          ${r.description ? `<span class="phint">${esc(r.description)}</span>` : ""}
          ${r.depends_on && st === "na"
            ? `<span class="phint">Not needed — the question above was answered no.</span>` : ""}</span>
        ${r.allow_na ? `<button class="pna ${st === "na" ? "on" : ""}"
          onclick="A.prepNA(${r.template_id})" title="Not applicable">N/A</button>` : ""}
      </div>
      ${ctl && st !== "na" ? `<div class="pctl">${ctl}</div>` : ""}
      ${r.wants_stamp && a.done_at
        ? `<div class="pstamp">✓ ${esc(when(a.done_at))}${a.actor_id
            ? " by " + esc(nameOf(a.actor_id)) : ""}</div>` : ""}
      ${r.wants_note || a.note ? `<div class="pctl">
        <input class="inp" value="${esc(a.note || "")}" placeholder="Remarks"
          onchange="A.prepNote(${r.template_id},this.value)"></div>` : ""}
    </div>`;
  };

  return `<div class="head"><h1>Pre-production</h1>${locTag()}
      <span class="tag">${esc(j.shoot_type)}</span></div>
    <p class="sub"><button class="archlink" onclick="A.prepBack()">← ${esc(j.client_name)}</button>
      · ${j.shoot_at ? esc(fmtShoot(j.shoot_at)) : "date not set"} · ${esc(j.stage)}</p>

    <div class="phases">${phaseTab(1, c1)}${phaseTab(2, c2)}</div>

    <div class="chips" style="margin:12px 0">
      ${[["all", "All", here.total], ["left", "Remaining", here.total - here.done],
         ["flagged", "With remarks", (S.prep || []).filter(r => r.phase === phase && r.answer && r.answer.note).length]]
        .map(([k, lab, n]) => `<button class="chip ${(S.prepFilter || "all") === k ? "on" : ""}"
          onclick="A.prepFilter('${k}')">${lab}<span class="n">${n}</span></button>`).join("")}
    </div>

    ${here.done === here.total && here.total
      ? `<div class="alert green"><b>All ${here.total} verified.</b>
          This job can move to ${esc(target)}.</div>`
      : `<div class="alert amber"><b>${here.total - here.done} still to verify</b>
          before ${esc(target)}.</div>`}

    ${sections.map(g => {
      const d = g.rows.filter(prepDone).length;
      return `<div class="grp">
        <div class="gh"><h2>${esc(g.name)}</h2>
          <span class="gc ${d === g.rows.length ? "done" : ""}">${d} / ${g.rows.length}</span></div>
        <div class="gbody">${g.rows.map(itemHTML).join("")}</div></div>`;
    }).join("") || `<div class="empty">Nothing here with that filter.</div>`}

    <p class="hint">Every change saves on its own. N/A counts as verified —
      use it for anything this shoot does not need.</p>`;
}

/* Who actually sends work our way — the whole reason the referrer's name is
   asked for on the enquiry. Hidden until there is something to show. */
function referrerPanel() {
  const tally = {};
  S.jobs.forEach(j => {
    const n = String(j.referred_by || "").trim();
    if (n) tally[n] = (tally[n] || 0) + 1;
  });
  const rows = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!rows.length) return "";
  return `<div class="panel"><h3>Who refers you</h3>
    <p class="ph">Named on the enquiry · ${rows.length === 1
      ? "1 person" : rows.length + " people"} so far.</p>
    ${barsHTML(rows)}</div>`;
}

/* What the client has been asked to sign off, and what they said back.
   Corrections matter most — they are the one thing here that creates work. */
function approvalSection(j) {
  if (archived(j)) return "";
  const asked = j.pending_approval, fixes = String(j.album_corrections || "").trim();
  const rev = num(j.album_revision);
  const edFixes = String(j.edit_corrections || "").trim(), edRev = num(j.edit_revision);
  const rows = [];

  /* the client sent the photos back - this is work, and it leads the panel */
  if (edFixes) {
    rows.push(`<div class="slot missing"><h6>Photo corrections asked for</h6>
      <p>${edRev > 1 ? "Round " + edRev + ". " : ""}The job went back to
        ${esc(S.settings.editing_stage || "Photo Editing")} with these notes:</p>
      <textarea readonly style="min-height:78px;margin-top:7px"
        onclick="this.select()">${esc(edFixes)}</textarea></div>`);
  }

  /* what goes to the printer, in their own words */
  const prints = [
    j.album_cover_file ? `<b>Album cover:</b> ${esc(j.album_cover_file)}${
      j.album_size ? " · " + esc(j.album_size) : ""}` : "",
    j.frame_file ? `<b>Frame:</b> ${esc(j.frame_file)}${
      j.frame_size ? " · " + esc(j.frame_size) : ""}` : ""
  ].filter(Boolean);

  if (j.edits_approved_at) {
    rows.push(`<div class="slot set"><h6>✓ Edited photos approved</h6>
      <p>The client signed them off ${when(j.edits_approved_at)}${edRev
        ? " after " + edRev + " round" + (edRev === 1 ? "" : "s") + " of corrections" : ""}.
        ${prints.length ? "<br>" + prints.join("<br>") : ""}</p></div>`);
  } else if (asked === "edits") {
    const wants = [j.has_album ? "the album cover" : "", j.frame_included ? "the frame" : ""]
      .filter(Boolean).join(" and ");
    rows.push(`<div class="slot"><h6>Waiting on the client</h6>
      <p>They have been asked to approve the edited photos${wants
        ? " and pick the photo for " + wants : ""}. It lands here the moment
        they answer — a yes starts ${j.has_album || j.frame_included
          ? "the " + [j.has_album ? "album" : "", j.frame_included ? "frame" : ""]
            .filter(Boolean).join(" and ") + " by itself"
          : "nothing else off"}, and corrections send it
        back to ${esc(S.settings.editing_stage || "Photo Editing")}.</p></div>`);
  } else if (prints.length) {
    rows.push(`<div class="slot set"><h6>Chosen for print</h6>
      <p>${prints.join("<br>")}</p></div>`);
  }

  if (fixes) {
    rows.push(`<div class="slot missing"><h6>Album corrections asked for</h6>
      <p>${rev > 1 ? "Round " + rev + ". " : ""}The album went back to design with these notes:</p>
      <textarea readonly style="min-height:78px;margin-top:7px"
        onclick="this.select()">${esc(fixes)}</textarea></div>`);
  } else if (j.album_approved_at) {
    rows.push(`<div class="slot set"><h6>✓ Album approved for print</h6>
      <p>Approved ${when(j.album_approved_at)}${rev ? " after " + rev +
        " round" + (rev === 1 ? "" : "s") + " of corrections" : ""}.</p></div>`);
  } else if (asked === "album") {
    rows.push(`<div class="slot"><h6>Waiting on the client</h6>
      <p>They are looking at the album design. They can approve it, or send
        corrections back.</p></div>`);
  }

  if (!rows.length) return "";
  return `<div class="sec"><h5>Client approvals</h5>${rows.join("")}
    ${asked && j.email ? `<div class="acts" style="margin-top:10px">
      <button class="btn sm" onclick="${asked === "album"
        ? `A.mailAlbumApproval(${j.id})` : `A.mailEditApproval(${j.id},null)`}">Ask again</button>
    </div>` : ""}</div>`;
}

/* video, album and frame — each a process of its own */
function tracksSection(j) {
  if (archived(j)) return "";
  const mine = childrenOf(j.id);
  const due = physicalDue(j);
  if (!mine.length && !due) return "";
  return `<div class="sec"><h5>Processes</h5>
    ${mine.map(c => childRow(j, c)).join("")}
    ${due ? `<div class="trackrow">
      <div class="tr1"><b>${j.has_album ? "Album" : ""}${j.has_album && j.frame_included ? " and frame" : ""}${!j.has_album ? "Frame" : ""}</b>
        <span class="pill amber">not started</span></div>
      <p class="hint" style="margin-top:4px">Their approval normally starts this by itself.
        Nothing has been started here yet.</p>
      <div class="acts" style="margin-top:8px">
        <button class="btn p sm" onclick="A.startPhysical(${j.id})">Client approved — start it</button>
      </div></div>` : ""}
  </div>`;
}
function childRow(j, c) {
  const def = kindDef(c.kind);
  const next = childNext(c), prev = childPrev(c);
  const gone = c.state === "archived";
  const blocked = next && childPayGate(j, next);
  return `<div class="trackrow ${gone ? "done" : ""}">
    <div class="tr1"><b>${def.mark} ${esc(def.label)}</b>
      <span class="pill ${gone ? "green" : c.sla_status === "OVERDUE" ? "red"
        : c.sla_status === "Due today" ? "amber" : ""}">${gone ? "✓ closed" : esc(c.stage)}</span>
      ${!gone && c.days_in_stage ? `<span class="trd">day ${c.days_in_stage}</span>` : ""}</div>
    ${!gone && c.days_until_archive != null ? `<p class="hint" style="margin-top:4px">
      Archives by itself in ${c.days_until_archive} day${c.days_until_archive === 1 ? "" : "s"}.</p>` : ""}
    ${blocked ? `<div class="alert red" style="margin:8px 0 0">
      <b>${rupee(bal(j))} outstanding.</b> ${esc(next)} is blocked until it clears.</div>` : ""}
    <div class="acts" style="margin-top:8px">
      ${gone ? (c.kind === "video"
        ? `<button class="btn p sm" onclick="A.restoreVideo(${j.id})">Client came back — reopen</button>`
        : `<span class="hint" style="margin:0">Finished and closed.</span>`)
      : `<button class="btn sm" onclick="A.moveChild(${c.id},'${esc(prev || "")}')"
             ${prev ? "" : "disabled"}>←</button>
         <button class="btn ${blocked ? "" : "p"} sm"
           onclick="A.moveChild(${c.id},${next ? `'${esc(next)}'` : "null"})"
           ${next && !blocked ? "" : "disabled"}>${next ? esc(next) + " →" : "Last step"}</button>
         ${blocked ? `<button class="btn warn sm"
           onclick="A.moveChild(${c.id},'${esc(next)}',true)">Override</button>` : ""}`}
    </div>
    ${gone || c.kind === "video" ? "" : `<p class="hint" style="margin-top:6px">${
      esc(S.settings.pickup_stage || "Waiting for Client Pickup")} waits for this — move the job
      itself from Move stage once this is finished.</p>`}
    <div style="margin-top:8px">
      <select class="inp" onchange="A.assignChild(${c.id},this.value)" ${gone ? "disabled" : ""}>
        <option value="">Unassigned</option>
        ${teamFor(c.stage).map(p => `<option value="${p.id}" ${p.id === c.owner_id ? "selected" : ""}>${esc(p.full_name)}</option>`).join("")}
      </select></div>
  </div>`;
}

/* every link the client has been given */
function linksSection(j) {
  const rows = [
    ["Unedited files", j.gallery_link, "gallery_link"],
    ["Edited photos", j.edited_link, "edited_link"],
    ["Edited video", j.has_video ? j.video_link : null, "video_link"]
  ].filter(r => r[1] || (r[2] === "gallery_link" && j.stage_no >= ordOf("gallery_link_stage")));
  if (archived(j) || !rows.length) return "";
  return `<div class="sec"><h5>Pixieset links</h5><dl class="kv">
    ${rows.map(([label, link]) => `<dt>${label}</dt><dd>${link
      ? `<a href="${esc(link)}" target="_blank" rel="noreferrer noopener"
           style="color:var(--rose);font-weight:600;word-break:break-all">${esc(link)}</a>`
      : `<span style="color:var(--ink-soft)">not shared yet</span>`}</dd>`).join("")}
  </dl>
  ${num(j.photos_edited) ? `<p class="hint">${j.photos_edited} files edited${num(j.edited_count)
      ? " of " + j.edited_count + " promised" : ""}.</p>` : ""}</div>`;
}

function moveSection(j, nextS, prevS, gateBlocked, gate, b, parked) {
  const needs = nextS ? slotNeeded(j, nextS) : null;
  const hoGaps = nextS && !needs ? handoverNeeded(j, nextS) : null;
  const pkGaps = nextS ? packageNeeded(j, nextS) : null;
  const mailGate = nextS && emailNeeded(j, nextS);
  const termsGate = nextS && !pkGaps && termsNeeded(j, nextS);
  const held = nextS ? childBlocking2(j, nextS) : null;
  const needGallery = nextS && galleryLinkNeeded(j, nextS);
  const needQc = nextS && shootQcNeeded(j, nextS);
  const needPicks = nextS && selectionNeeded(j, nextS);
  const needEdit = nextS && editInfoNeeded(j, nextS);
  return `<div class="sec"><h5>Move stage</h5>
    ${held ? `<div class="alert red"><b>Held by another process.</b> The ${esc(held)} —
      ${esc(nextS)} waits for it.</div>` : ""}
    ${mailGate ? `<div class="alert amber"><b>${esc(nextS)} needs the client's email address first.</b>
      That is where the terms go — you'll be asked for it before anything else.</div>` : ""}
    ${needGallery ? `<div class="alert amber"><b>${esc(nextS)} needs the Pixieset link for the
      unedited files.</b> You'll be asked for it, and the client is emailed the gallery
      as soon as you save it.</div>` : ""}
    ${needQc ? `<div class="alert amber"><b>The shoot has to be reviewed before ${esc(nextS)}.</b>
      You'll be asked how it came out and what the review found.</div>` : ""}
    ${needPicks ? `<div class="alert amber"><b>The client hasn't sent their selection yet.</b>
      Their link is live — or you can enter the files yourself when you move it.</div>` : ""}
    ${needEdit ? `<div class="alert amber"><b>${esc(nextS)} needs the edited file count and link.</b>
      You'll be asked for them.</div>` : ""}
    ${gateBlocked ? `<div class="alert red"><b>Blocked.</b> ${rupee(b)} outstanding — clear it or override.</div>` : ""}
    ${pkGaps && !mailGate ? `<div class="alert amber"><b>${esc(nextS)} needs the package settled first.</b>
      Missing ${esc(pkGaps.join(", "))} — you'll be asked for it.</div>` : ""}
    ${termsGate ? `<div class="alert amber"><b>The terms and booking details have to be emailed
      before ${esc(nextS)}.</b> You'll be asked to send them.</div>` : ""}
    ${needs ? `<div class="alert amber"><b>${needs === "firm" ? "A confirmed date is needed" : "A shoot slot is needed"}
      before ${esc(nextS)}.</b> You'll be asked for it.</div>` : ""}
    ${hoGaps ? `<div class="alert amber"><b>${esc(nextS)} needs the shoot handed over first.</b>
      Missing ${esc(hoGaps.join(", "))} — you'll be asked for it.</div>` : ""}
    ${!parked && !prevS && j.stage !== flow()[0].name
      ? `<div class="alert grey"><b>This is the first step of ${esc(modLabel(j))}.</b>
         A job moves back freely inside its own module, but never into one it has already left.</div>` : ""}
    <div class="acts">
      ${parked
        ? `<button class="btn p" onclick="A.moveTo(${j.id},'${esc(flow()[0].name)}')">Restore to ${esc(flow()[0].name)}</button>`
        : `<button class="btn" onclick="A.moveTo(${j.id},${prevS ? `'${esc(prevS)}'` : "null"})" ${prevS ? "" : "disabled"}>← ${esc(prevS || "Back")}</button>
           <button class="btn ${gateBlocked || held ? "" : "p"}" onclick="A.moveTo(${j.id},${nextS ? `'${esc(nextS)}'` : "null"})" ${!nextS || gateBlocked || held ? "disabled" : ""}>
             ${nextS ? esc(nextS) + " →" : "Final stage"}</button>
           ${gateBlocked ? `<button class="btn warn" onclick="A.moveTo(${j.id},'${esc(nextS)}',true)">Override &amp; deliver</button>` : ""}
           ${parkedStage() && j.stage_no < ordOf("booked_stage")
              ? `<button class="btn" onclick="A.moveTo(${j.id},'${esc(parkedStage())}')">Archive</button>` : ""}`}
    </div><p class="hint">Moving resets the SLA clock and is logged against your name.${
      j.stage_no >= ordOf("booked_stage") && !parked
        ? " A booked shoot cannot be archived." : ""}</p></div>`;
}

function paySection(j, b, gate) {
  /* A collaboration has a value but no debt. Showing a balance here, or a
     Record a payment button, would only invite someone to chase it. */
  if (collab(j)) {
    return `<div class="sec"><h5>Payment</h5>
      <div class="paybox">
        <div class="payrow"><span>Collaboration</span><b>nothing to collect</b></div>
        <div class="payrow"><span>What it is worth</span><b>${
          num(j.package_value) ? rupee(j.package_value) : "not valued"}</b></div>
        ${j.collab_notes ? `<div class="payrow"><span>In return</span>
          <b style="font-weight:600;text-align:right">${esc(j.collab_notes)}</b></div>` : ""}
        <div class="acts" style="margin-top:11px">
          <button class="btn sm" onclick="A.editPackage(${j.id})">Edit package &amp; delivery</button>
        </div></div>
      <p class="hint">No payment gate applies to this job, and the client is never
        shown a price. The value is kept so you can total what you have given away.</p>
      ${paymentsList(j)}</div>`;
  }
  return `<div class="sec"><h5>Payment</h5>
    <div class="paybox ${owes(j) ? "owes" : ""}">
      <div class="payrow"><span>Package total</span><b>${num(j.package_value) ? rupee(j.package_value) : "not quoted"}</b></div>
      <div class="payrow"><span>Received</span><b>${rupee(j.amount_received)}</b></div>
      <div class="payrow total ${b > 0 ? "red" : ""}"><span>${b > 0 ? "Balance pending" : "Fully paid"}</span>
        <span>${b > 0 ? rupee(b) : "✓"}</span></div>
      <div class="acts" style="margin-top:11px">
        ${b > 0 ? `<button class="btn p" onclick="A.recordPay(${j.id})">Record a payment</button>
          <button class="btn sm" onclick="A.recordPay(${j.id},${b})">Record the full ${rupee(b)}</button>`
        : ""}
        <button class="btn sm" onclick="A.editPackage(${j.id})">Edit package &amp; delivery</button>
      </div></div>
    ${b > 0 ? `<p class="hint">${esc(gate || "")} is blocked until this clears.</p>` : ""}
    ${paymentsList(j)}</div>`;
}

/* every payment that has a record behind it */
function paymentsList(j) {
  const list = S.payments || [];
  const gap = payGap(j);
  if (!list.length && !num(j.amount_received)) return "";
  const mark = { Cash: "₹", UPI: "⇄", "Bank transfer": "≡", Card: "▤", Cheque: "✎" };
  return `<div style="margin-top:13px">
    <h6 style="font-size:11.5px;color:var(--ink-soft);font-weight:700;margin:0 0 7px">
      What has a record behind it</h6>
    ${list.length ? `<div class="log" style="max-height:none">
      ${list.map(p => `<div style="padding:7px 0;border-bottom:1px solid var(--line)">
        <b>${rupee(p.amount)}</b> · ${esc(p.method)} ${mark[p.method] || ""}
        ${p.reference ? `<br><span style="color:var(--ink-soft)">ref ${esc(p.reference)}</span>` : ""}
        ${p.proof_path ? ` <button class="btn sm" style="padding:2px 8px;font-size:11px"
          onclick="A.openProof('${esc(p.proof_path)}')">Screenshot</button>` : ""}
        <br><span style="color:var(--ink-soft);font-size:11px">
          ${esc(fmtDay(p.received_on))} · ${esc(p.recorded_by_name || "unknown")}${
          p.note ? " · " + esc(p.note) : ""}</span>
      </div>`).join("")}
    </div>` : ""}
    ${gap > 0 ? `<p class="hint" style="color:var(--amber);margin-top:8px">
      ${rupee(gap)} of the ${rupee(j.amount_received)} received has no record behind it${
      list.length ? " — a payment was typed straight onto the total" : " — it predates this, or was typed straight onto the total"}.
      <button class="btn sm" style="margin-left:4px" onclick="A.logPast(${j.id})">Add the record</button></p>`
    : list.length ? `<p class="hint" style="color:var(--green);margin-top:8px">
      Every rupee received has a record behind it.</p>` : ""}
  </div>`;
}

/* Anything somebody has been asked to do about this particular client. */
function jobTasksSection(j) {
  if (archived(j)) return "";
  const rows = tasksForJob(j.id);
  const open = rows.filter(t => t.status === "open");
  return `<div class="sec"><h5>Tasks</h5>
    ${rows.length ? rows.map(t => `<div class="slot ${t.status === "done" ? "set"
        : t.due_state === "OVERDUE" ? "missing" : ""}" style="cursor:pointer"
        onclick="A.editTask(${t.id})">
        <h6>${t.status === "done" ? "\u2713 " : ""}${esc(t.title)}</h6>
        <p>${esc(t.assignee_name || "unassigned")}${t.status === "done"
          ? " · done " + when(t.done_at)
          : t.due_state === "OVERDUE" ? " · <b>overdue</b> since " + esc(t.due_on)
          : " · by " + esc(t.due_on)}</p></div>`).join("")
      : `<div class="slot"><h6>Nothing outstanding</h6>
         <p>No one has been asked to do anything on this job.</p></div>`}
    <div class="acts" style="margin-top:10px">
      <button class="btn ${open.length ? "sm" : "p sm"}" onclick="A.newTask(${j.id})">
        Add a task</button></div></div>`;
}

/* The job is finished. The only thing that can still be owed to the client
   here is the thank-you, so that is all this shows. */
function closedSection(j) {
  if (archived(j) || j.stage !== (S.settings.delivered_stage || "Delivered")) return "";
  const sent = j.collected_sent_at;
  return `<div class="sec"><h5>Closed off</h5>
    <div class="slot ${sent ? "set" : ""}">
      <h6>${sent ? "\u2713 Thanked for collecting" : "Thank-you not sent"}</h6>
      <p>${sent ? "Sent " + when(sent) + "."
        : j.email ? "They have not been thanked for coming in yet."
        : "No email address on file, so there is nobody to send it to."}</p></div>
    ${j.email ? `<div class="acts" style="margin-top:10px">
      <button class="btn ${sent ? "sm" : "p sm"}" onclick="A.mailCollected(${j.id})">
        ${sent ? "Send again" : "Send the thank-you"}</button></div>` : ""}</div>`;
}

function accessSection(j, b) {
  const box = locked(j)
    ? `<div class="lockbox off"><h6>⤓ Downloads OFF · view-only link</h6>
        <p>${rupee(b)} outstanding. Preview-only gallery: no download button, no originals, no Drive access.
           It unlocks by itself the moment payment is recorded.</p>
        <div class="acts" style="margin-top:11px">
          <button class="btn sm dark" onclick="A.ackViewOnly(${j.id})" ${j.view_only_ack ? "disabled" : ""}>
            ${j.view_only_ack ? "✓ Confirmed view-only" : "I've set the link to view-only"}</button></div></div>`
    : j.file_access === "Downloads unlocked"
    ? `<div class="lockbox on"><h6>⤓ Downloads unlocked</h6><p>Fully paid — originals can be released.</p></div>`
    : `<div class="lockbox idle"><h6>Nothing shared yet</h6>
        <p>Sharing rules start at ${esc(S.settings.share_from_stage || "")}.</p></div>`;
  return `<div class="sec"><h5>Client file access</h5>${box}</div>`;
}

function detailSection(j) {
  return `<div class="sec"><h5>Details</h5><dl class="kv">
    <dt>Client</dt><dd><b style="color:var(--ink)">${esc(j.client_name)}</b>
      <button class="btn sm" style="margin-left:6px" onclick="A.editContact(${j.id})">Edit</button>
      <div style="color:var(--ink-soft);font-size:11px;margin-top:3px">name, phone and email</div></dd>
    <dt>Location</dt><dd><select class="inp" onchange="A.setJobLoc(${j.id},this.value)">
      ${LOCATIONS.map(l => `<option ${l === j.location ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></dd>
    <dt>Phone</dt><dd>${j.phone
      ? `<a href="tel:${esc(j.phone)}" style="color:var(--rose);font-weight:600">${esc(j.phone)}</a>`
      : `<span style="color:var(--red)">missing</span>`}
      <button class="btn sm" style="margin-left:6px" onclick="A.editContact(${j.id})">Edit</button></dd>
    <dt>Email</dt><dd>${j.email
      ? `<a href="mailto:${esc(j.email)}" style="color:var(--ink-soft)">${esc(j.email)}</a>`
      : `<span style="color:var(--ink-soft)">none yet</span>`}
      <button class="btn sm" style="margin-left:6px" onclick="A.editContact(${j.id})">
        ${j.email ? "Edit" : "Add"}</button></dd>
    <dt>Shoot type</dt><dd><select class="inp" onchange="A.setType(${j.id},this.value)">
      ${typeOptions(j.shoot_type)}</select></dd>
    <dt>Source</dt><dd>${esc(j.source || "—")}${collab(j)
      ? ' <span class="tag grey">Collaboration</span>' : ""}</dd>
    ${j.referred_by ? `<dt>Referred by</dt><dd>${esc(j.referred_by)}</dd>` : ""}
    ${num(j.stage_no) >= ordOf("booked_stage") && !archived(j)
      ? `<dt>Shoot crew</dt><dd>${j.photographer_name || j.stylist_name
          ? `${esc(j.photographer_name || "no photographer")} <span style="color:var(--ink-soft)">camera</span>
             <div>${esc(j.stylist_name || "no stylist")} <span style="color:var(--ink-soft)">styling</span></div>`
          : `<span class="pill amber">not assigned</span>`}
          <button class="btn sm" style="margin-left:6px" onclick="A.setCrew(${j.id},null)">
            ${j.photographer_name || j.stylist_name ? "Change" : "Assign"}</button></dd>` : ""}
    ${j.booked_by_name ? `<dt>Booked by</dt><dd>${esc(j.booked_by_name)}
      ${j.booked_at ? `<div style="color:var(--ink-soft);font-size:11.5px;margin-top:2px">${
        when(j.booked_at)}</div>` : ""}</dd>` : ""}
    ${j.stage_no >= ordOf("booked_stage") ? `<dt>Copyrights</dt><dd>${j.copyrights_included
      ? '<span class="pill green">included</span>'
      : '<span class="pill">studio retains</span>'}</dd>` : ""}
    <dt>Venue</dt><dd>${esc(j.venue || "Studio")}${j.venue_address
      ? '<div style="color:var(--ink-soft);font-size:11.5px;margin-top:2px">' + esc(j.venue_address) + "</div>" : ""}</dd>
    <dt>Deliverables</dt><dd>${[
        num(j.edited_count) ? j.edited_count + " edited photos" : "photos",
        j.unedited_included ? "unedited included" : null,
        j.has_video ? "video" : null,
        j.has_album ? "album" + (j.album_size ? " " + esc(j.album_size) : "") : null,
        j.frame_included ? "frame" + (j.frame_size ? " " + esc(j.frame_size) : "") : null
      ].filter(Boolean).join(" · ")}
      <div style="color:var(--ink-soft);font-size:11px;margin-top:3px">set in Package &amp; delivery details above</div></dd>
    ${j.backup_location || num(j.files_shot) ? `<dt>Shoot files</dt><dd>${num(j.files_shot)
        ? j.files_shot + " files" : "count not recorded"}${j.backup_location
        ? ' <span style="color:var(--ink-soft)">· ' + esc(j.backup_location) + "</span>" : ""}</dd>` : ""}
    ${j.booking_id ? `<dt>Booking ID</dt><dd style="font-family:ui-monospace,Menlo,monospace">${esc(j.booking_id)}</dd>` : ""}
    <dt>Days in stage</dt><dd>${j.days_in_stage}${j.sla_days == null ? " · no SLA" : " of " + j.sla_days + " allowed"}</dd>
    <dt>Stage owner</dt><dd>${esc(j.stage_responsible)}</dd>
    <dt>Assigned to</dt><dd><select class="inp" onchange="A.reassign(${j.id},this.value)">
      <option value="">Unassigned</option>
      ${teamFor(j.stage).map(p => `<option value="${p.id}" ${p.id === j.owner_id ? "selected" : ""}>${esc(p.full_name)}</option>`).join("")}
      </select>
      <div style="color:var(--ink-soft);font-size:11px;margin-top:3px">${j.owner_pinned
        ? "picked by hand — they keep this job through every stage, until you set it back to Unassigned"
        : "follows the rules in Settings — the next stage will reassign it"}</div></dd>
  </dl></div>`;
}

function activitySection(acts) {
  return `<div class="sec"><h5>Activity</h5>
    ${acts === null ? `<p class="hint">Loading…</p>` : `<div class="log">
      ${acts.map(a => `<div><b>${esc(nameOf(a.actor_id))}</b> ${esc(a.action)} · ${when(a.created_at)}</div>`).join("")}
    </div>`}</div>`;
}

function stepper(j) {
  if (archived(j)) return `<div class="alert grey">Archived — parked out of the journey.</div>`;
  const f = flow(), at = f.findIndex(s => s.name === j.stage);
  let out = "", cur = "";
  f.forEach((s, i) => {
    const label = (s.modules || []).map(m => MODLABEL[m]).join(" + ");
    if (label !== cur) { cur = label; out += `<div class="modline">${esc(label)}</div>`; }
    const skip = !appliesTo(j, s);
    out += `<div class="step ${skip ? "" : i < at ? "done" : i === at ? "now" : ""}" ${skip ? 'style="opacity:.4"' : ""}>
      <span class="bul"></span><span class="sw"><span>${esc(s.name)}</span>
      <small>${skip ? "skipped"
        : (s.sla_days == null ? "no SLA" : "SLA " + s.sla_days + "d") + (i === at ? " · day " + j.days_in_stage : "")}</small>
      </span></div>`;
  });
  return out;
}
function closeDrawer() {
  S.openId = null;
  $("drawer").classList.remove("on");
  $("scrim").classList.remove("on");
}

/* ------------------------------------------------- pending payments */
function payView() {
  const list = owing().slice().sort((a, b) => bal(b) - bal(a));
  const total = owedTotal(), lk = lockedList();
  return `<div class="head"><h1>Pending Payments</h1>${locTag()}
    ${list.length ? `<span class="tag red">${rupee(total)} across ${list.length}</span>` : `<span class="tag green">All clear</span>`}</div>
  <p class="sub">Every booked job still owing money. Check this before anything is delivered.</p>
  ${list.length ? `<div class="alert red"><b>${rupee(total)} outstanding.</b> Nothing reaches ${esc(S.settings.pay_gate_stage || "")} until it clears.</div>`
    : `<div class="alert green"><b>Nothing outstanding.</b></div>`}
  ${lk.length ? `<div class="alert dark"><b>⤓ ${lk.length} client link${lk.length === 1 ? "" : "s"} must stay view-only.</b>
      These clients already have files in front of them.</div>` : ""}
  <div class="grid2"><div>
    <div class="panel"><h3>Who owes what</h3><p class="ph">Largest balance first. Click a row to open the job.</p>
      ${list.length ? `<table><thead><tr><th>Client</th><th>Stage</th><th>Shoot</th><th>Balance</th><th>Client link</th></tr></thead><tbody>
        ${list.map(j => `<tr style="cursor:pointer" onclick="A.openJob(${j.id})">
          <td><b>${esc(j.client_name)}</b><br><span style="color:var(--ink-soft)">${esc(j.location)}</span></td>
          <td>${esc(j.stage)}</td>
          <td>${j.shoot_at ? esc(fmtShoot(j.shoot_at)) : j.shoot_status === "TBD" ? "<span class='pill amber'>TBD</span>" : "—"}</td>
          <td><span class="pill red">${rupee(bal(j))}</span><br>
            <span style="color:var(--ink-soft);font-size:11px">of ${rupee(j.package_value)}</span></td>
          <td>${locked(j) ? `<span class="pill red">⤓ view-only</span>${j.view_only_ack
              ? '<br><span style="color:var(--green);font-size:11px">✓ confirmed</span>'
              : '<br><span style="color:var(--amber);font-size:11px">not confirmed</span>'}`
            : `<span class="pill">not shared yet</span>`}</td></tr>`).join("")}
      </tbody></table>` : `<div class="empty">Nothing pending</div>`}</div>
  </div><div>
    <div class="panel"><h3>Pending by pipeline</h3><p class="ph">Where the money is stuck.</p>
      ${barsHTML(BOARDS.map(k => [MODLABEL[k], owedTotal(k)]), rupee)}</div>
    <div class="panel"><h3>Pending by location</h3><p class="ph">Balance owed, not job count.</p>
      ${barsHTML(LOCATIONS.map(l => [l, S.jobs.filter(j => owes(j) && j.location === l).reduce((a, j) => a + bal(j), 0)]), rupee)}</div>
  </div></div>`;
}
function barsHTML(pairs, fmt) {
  const max = Math.max(1, ...pairs.map(p => p[1]));
  return `<div class="bars">${pairs.map(([t, v]) => `<div class="bar"><span class="t">${esc(t)}</span>
    <span class="track"><span class="fill" style="width:${Math.round(v / max * 100)}%"></span></span>
    <span class="n">${v ? (fmt ? fmt(v) : v) : "—"}</span></div>`).join("")}</div>`;
}

/* ------------------------------------------------------- marketing */
function lifeView() {
  const p = pool();
  const bookedOrd = ordOf("booked_stage");
  const booked = p.filter(j => j.stage_no >= bookedOrd);
  const value = booked.reduce((a, j) => a + num(j.package_value), 0);
  const collected = booked.reduce((a, j) => a + num(j.amount_received), 0);
  const funnel = modStages("crm").map(s => [s.name, p.filter(j => j.stage_no >= s.ordinal).length]);
  const kpi = [
    ["Active jobs", String(p.length), ""],
    ["Confirmed bookings", String(booked.length), ""],
    ["Value booked", rupee(value), ""],
    ["Collected", rupee(collected), ""],
    ["Outstanding", rupee(owedTotal()), owedTotal() ? "dn" : ""],
    ["Archived leads", String(archivedJobs().length), ""]
  ];
  return `<div class="head"><h1>Marketing</h1>${locTag()}<span class="tag">live from your jobs</span></div>
  <p class="sub">Everything here is counted from real records — no manual tracking.</p>
  <div class="kpis">${kpi.map(([l, v, d]) => `<div class="kpi"><div class="l">${esc(l)}</div>
    <div class="v">${esc(v)}</div>${d ? `<div class="d dn">needs attention</div>` : ""}</div>`).join("")}</div>
  <div class="grid2"><div>
    <div class="panel"><h3>Where enquiries come from</h3><p class="ph">Every job on record.</p>
      ${barsHTML(SOURCES.map(s => [s, S.jobs.filter(j => j.source === s).length]))}</div>
    ${referrerPanel()}
    <div class="panel"><h3>Shoot types</h3><p class="ph">What the studio is actually selling.</p>
      ${barsHTML(S.types.map(t => [t, S.jobs.filter(j => j.shoot_type === t).length]))}</div>
  </div><div>
    <div class="panel"><h3>Jobs by location</h3><p class="ph">Whole pipeline.</p>
      ${barsHTML(LOCATIONS.map(l => [l, S.jobs.filter(j => j.location === l).length]))}</div>
    <div class="panel"><h3>Where the shoots happen</h3><p class="ph">Studio, home or on location.</p>
      ${barsHTML(VENUES.map(v => [v, S.jobs.filter(j => (j.venue || "Studio") === v).length]))}</div>
    <div class="panel"><h3>Sales funnel</h3><p class="ph">How many have reached each Sales stage or beyond.</p>
      ${barsHTML(funnel)}</div>
    <div class="panel"><h3>Deliverables mix</h3><p class="ph">What clients are actually buying.</p>
      ${barsHTML([["Photos only", p.filter(j => !j.has_video && !j.has_album && !j.frame_included).length],
                  ["With album", p.filter(j => j.has_album).length],
                  ["With video", p.filter(j => j.has_video).length],
                  ["With frame", p.filter(j => j.frame_included).length],
                  ["Unedited included", p.filter(j => j.unedited_included).length]])}</div>
  </div></div>
  <p class="hint">Lifecycle campaigns (100 days, sitter, cake smash, festivals) come next — they need a date of birth on each job.</p>`;
}

/* -------------------------------------------------------- settings */
function slaView() {
  return `<div class="head"><h1>Settings</h1><span class="tag">Admins only</span></div>
  <p class="sub">Stage targets and the studio rules. Changes apply to everyone immediately.</p>
  <div class="panel"><h3>SLA per stage</h3>
    <p class="ph">Days a job may sit in a stage before it is flagged. Alerts are currently
      <b>${S.settings.alerts_active === "true" ? "on" : "off"}</b>.</p>
    <table><thead><tr><th>Stage</th><th>Pipeline</th><th>Responsible</th><th style="width:120px">SLA (days)</th><th style="width:110px">Here now</th></tr></thead><tbody>
    ${S.stages.map(s => {
      const here = s.track
        ? S.children.filter(c => c.stage === s.name && c.state === "active").length
        : S.jobs.filter(j => j.stage === s.name).length;
      const late = s.track
        ? S.children.filter(c => c.stage === s.name && c.sla_status === "OVERDUE").length
        : S.jobs.filter(j => j.stage === s.name && j.sla_status === "OVERDUE").length;
      return `<tr><td><b>${esc(s.name)}</b>
          ${s.optional_for ? `<span class="pill blue">optional</span>` : ""}
          ${s.track ? `<span class="pill blue">${esc(s.track)} track</span>` : ""}
          ${s.is_parked ? `<span class="pill">hidden from boards</span>` : ""}
          ${s.sla_agreed || s.sla_days == null ? "" : `<span class="pill amber">placeholder</span>`}</td>
        <td style="color:var(--ink-soft)">${(s.modules || []).map(m => MODLABEL[m]).join(" + ")}</td>
        <td style="color:var(--ink-soft)">${esc(s.responsible)}</td>
        <td>${s.sla_days == null ? `<span class="pill">no SLA</span>`
          : `<input class="num-in" type="number" min="0" max="120" value="${s.sla_days}"
               onchange="A.setSla('${esc(s.name)}',this.value)">`}</td>
        <td>${here}${late ? ` <span class="pill red">${late} late</span>` : ""}</td></tr>`;
    }).join("")}
    </tbody></table></div>
  <div class="grid2"><div>
    <div class="panel"><h3>Studio rules</h3><p class="ph">Change these only with good reason.</p>
      <table><tbody>
        ${[["owed_from_stage", "Money counts as owed from"],
           ["share_from_stage", "Client can see files from"],
           ["pay_gate_stage", "Blocked while money is owed"],
           ["booked_stage", "Advance and shoot slot required from"],
           ["shoot_date_from", "TBD no longer accepted from"],
           ["terms_stage", "Email and terms required before"],
           ["gallery_stage", "Shoot debrief required before"],
           ["gallery_link_stage", "Unedited gallery link required before"],
           ["selection_stage", "Shoot review required before"],
           ["qc_stage", "Edited count and link required before"],
           ["digital_stage", "Video track must be finished before"],
           ["pickup_stage", "Album and frame must be finished before"]].map(([k, lbl]) => `<tr>
          <td><b>${lbl}</b></td>
          <td><select class="inp" onchange="A.setSetting('${k}',this.value)">
            ${(k === "pay_gate_stage" ? S.stages.filter(s => !s.is_parked)
                  .sort((a, b) => a.ordinal - b.ordinal) : flow())
              .map(s => `<option ${s.name === S.settings[k] ? "selected" : ""}>${esc(s.name)}${
                s.track ? " (" + s.track + " track)" : ""}</option>`).join("")}
          </select></td></tr>`).join("")}
      </tbody></table></div>
  </div><div>
    <div class="panel"><h3>Terms &amp; conditions</h3>
      <p class="ph">Attached to the terms email. A shoot type with its own document uses
        that one; the rest fall back to the studio default.</p>
      <table><tbody>
        ${S.typeRows.map(t => `<tr><td style="width:110px"><b>${esc(t.name)}</b></td>
          <td><input class="inp" value="${esc(t.terms_url || "")}" placeholder="same as the default"
            onchange="A.setTypeDoc('${esc(t.name)}','terms_url',this.value)"></td></tr>`).join("")}
        <tr><td><b>Studio default</b></td>
          <td><input class="inp" value="${esc(S.settings.terms_url || "")}" placeholder="https://…"
            onchange="A.setSetting('terms_url',this.value)"></td></tr>
      </tbody></table>
      <p class="hint">Without any of these the email still sends, just with nothing attached.</p></div>
    <div class="panel"><h3>Get-ready guides</h3>
      <p class="ph">Attached to the booking confirmation, per shoot type — what a mother
        needs before a maternity shoot is not what a parent needs before a newborn one.</p>
      <table><tbody>
        ${S.typeRows.map(t => `<tr><td style="width:110px"><b>${esc(t.name)}</b></td>
          <td><input class="inp" value="${esc(t.guide_url || "")}" placeholder="same as the default"
            onchange="A.setTypeDoc('${esc(t.name)}','guide_url',this.value)"></td></tr>`).join("")}
        <tr><td><b>Fallback</b></td>
          <td><input class="inp" value="${esc(S.settings.guide_url_default || "")}" placeholder="used when a type has none"
            onchange="A.setSetting('guide_url_default',this.value)"></td></tr>
      </tbody></table>
      <p class="hint">With none set, the confirmation still goes out — just without a guide.</p></div>
    <div class="panel"><h3>Package PDFs (optional)</h3>
      <p class="ph">Sent alongside the terms, per shoot type.</p>
      <table><tbody>
        ${S.typeRows.map(t => `<tr><td style="width:110px"><b>${esc(t.name)}</b></td>
          <td><input class="inp" value="${esc(t.brochure_url || "")}" placeholder="https://…"
            onchange="A.setBrochure('${esc(t.name)}',this.value)"></td></tr>`).join("")}
        <tr><td><b>Fallback</b></td>
          <td><input class="inp" value="${esc(S.settings.brochure_url_default || "")}" placeholder="used when a type has none"
            onchange="A.setSetting('brochure_url_default',this.value)"></td></tr>
      </tbody></table></div>
    <div class="panel"><h3>Terms email</h3>
      <p class="ph">Sent from the job drawer before the payment link.
        {{client_name}}, {{shoot_type}}, {{price}} and {{booking_details}} are filled in.
        The balance owed is deliberately left out.</p>
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650">From</label>
      <input class="inp" value="${esc(S.settings.email_from || "")}" onchange="A.setSetting('email_from',this.value)">
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650;margin-top:9px;display:block">Replies go to</label>
      <input class="inp" value="${esc(S.settings.email_reply_to || "")}" onchange="A.setSetting('email_reply_to',this.value)">
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650;margin-top:9px;display:block">Subject</label>
      <input class="inp" value="${esc(S.settings.email_subject || "")}" onchange="A.setSetting('email_subject',this.value)">
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650;margin-top:9px;display:block">Body</label>
      <textarea style="min-height:170px" onchange="A.setSetting('email_body',this.value)">${esc(S.settings.email_body || "")}</textarea>
      <p class="hint">Sent through the studio Gmail account. Replies go wherever the reply-to says.</p></div>
    <div class="panel"><h3>Selection email</h3>
      <p class="ph">Sent from the job drawer to ask the client for their picks.
        {{client_name}}, {{shoot_type}}, {{edited_count}} and {{selection_link}} are filled in.
        The link must be in there somewhere.</p>
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650">Subject</label>
      <input class="inp" value="${esc(S.settings.selection_subject || "")}" onchange="A.setSetting('selection_subject',this.value)">
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650;margin-top:9px;display:block">Body</label>
      <textarea style="min-height:170px" onchange="A.setSetting('selection_body',this.value)">${esc(S.settings.selection_body || "")}</textarea>
      <p class="hint">Goes out from the same studio Gmail, with no attachments.</p></div>
    <div class="panel" style="grid-column:1/-1"><h3>Who picks it up</h3>
      <p class="ph">When a job reaches a stage it is handed to whoever is named here,
        whoever had it before. A stage left blank changes nothing — the job keeps
        the person it already had. Tick <b>by location</b> where Bangalore and
        Coimbatore are handled by different people.</p>
      <table><thead><tr>
        <th style="width:38%">Stage</th><th style="width:14%">By location</th><th>Assign to</th>
      </tr></thead><tbody>
        ${S.stages.filter(st => !st.is_parked).sort((a, b) => a.ordinal - b.ordinal).map(st => {
          const split = ruleSplit(st.name);
          const pick = (grp, label) => `<div style="display:flex;align-items:center;gap:7px;${
              split ? "margin-bottom:5px" : ""}">
            ${label ? `<span style="font-size:11.5px;color:var(--ink-soft);min-width:120px">${label}</span>` : ""}
            <select class="inp" style="max-width:220px"
              onchange="A.setRule('${esc(st.name)}','${grp}',this.value)">
              <option value="">— nobody —</option>
              ${S.people.filter(p => p.active).map(p => `<option value="${esc(p.id)}"
                ${(ruleFor(st.name, grp) || {}).profile_id === p.id ? "selected" : ""}
                >${esc(p.full_name)}</option>`).join("")}
            </select></div>`;
          return `<tr>
            <td><b>${esc(st.name)}</b>${st.track
              ? ` <span class="pill blue">${esc(st.track)}</span>` : ""}</td>
            <td><label class="chk"><input type="checkbox" ${split ? "checked" : ""}
              onchange="A.splitRule('${esc(st.name)}',this.checked)"></label></td>
            <td>${split
              ? pick("bangalore", "Bangalore") + pick("cbe_erode", "Coimbatore / Erode")
              : pick("any", "")}</td></tr>`;
        }).join("")}
      </tbody></table>
      <p class="hint">Anywhere that is not Bangalore — Coimbatore, Erode and Others —
        follows the Coimbatore / Erode row. Assigning somebody by hand on a job overrides
        all of this: they keep it until the job is set back to Unassigned.</p></div>
    <div class="panel"><h3>Keeping files</h3>
      <p class="ph">How long a shoot stays on the studio's drives after the client is
        first told their order is ready. Both emails say this and carry the link the
        client uses to confirm their own backup.</p>
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650">Days kept</label>
      <input class="inp" type="number" min="1" style="max-width:120px"
        value="${esc(S.settings.retention_days || "90")}"
        onchange="A.setSetting('retention_days',this.value)">
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650;margin-top:9px;display:block">
        Where the app lives</label>
      <input class="inp" value="${esc(S.settings.app_origin || "")}"
        placeholder="https://littleshots-os.vercel.app"
        onchange="A.setSetting('app_origin',this.value)">
      <p class="hint">The confirm link in the emails is built from this, so it has to be
        the address clients can actually reach.</p></div>
    <div class="panel"><h3>Collected thank-you email</h3>
      <p class="ph">Offered on the last move, into ${esc(S.settings.delivered_stage || "Delivered")}.
        {{client_name}}, {{shoot_type}} and {{items_collected}} are filled in —
        {{items_collected}} names the album and frame they actually ordered, and reads
        "your photographs" for a package with nothing to collect.</p>
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650">Subject</label>
      <input class="inp" value="${esc(S.settings.collected_subject || "")}" onchange="A.setSetting('collected_subject',this.value)">
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650;margin-top:9px;display:block">Body</label>
      <textarea style="min-height:170px" onchange="A.setSetting('collected_body',this.value)">${esc(S.settings.collected_body || "")}</textarea>
      <p class="hint">This one asks for a Google review. Take that paragraph out if you
        would rather ask in person.</p></div>
    <div class="panel"><h3>Shoot thank-you email</h3>
      <p class="ph">Offered the moment a shoot is marked complete. {{client_name}},
        {{shoot_type}}, {{payment_block}}, {{unedited_days}} and {{unedited_by}} are filled in —
        {{payment_block}} is dropped entirely for a collaboration, and {{unedited_by}} is the
        actual date, Sundays skipped.</p>
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650">Subject</label>
      <input class="inp" value="${esc(S.settings.shootdone_subject || "")}" onchange="A.setSetting('shootdone_subject',this.value)">
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650;margin-top:9px;display:block">Body</label>
      <textarea style="min-height:170px" onchange="A.setSetting('shootdone_body',this.value)">${esc(S.settings.shootdone_body || "")}</textarea>
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650;margin-top:9px;display:block">
        Working days before the unedited files go out</label>
      <input class="inp" type="number" min="1" style="max-width:120px"
        value="${esc(S.settings.unedited_working_days || "3")}"
        onchange="A.setSetting('unedited_working_days',this.value)">
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650;margin-top:9px;display:block">
        Client satisfaction options</label>
      <input class="inp" value="${esc(S.settings.satisfaction_levels || "")}"
        onchange="A.setSetting('satisfaction_levels',this.value)">
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650;margin-top:9px;display:block">
        Shoot review verdicts</label>
      <input class="inp" value="${esc(S.settings.shoot_qc_verdicts || "")}"
        onchange="A.setSetting('shoot_qc_verdicts',this.value)">
      <p class="hint">Comma separated, best first. Changing these does not rewrite what
        past shoots already recorded.</p></div>
    <div class="panel"><h3>SLA breach email</h3><p class="ph">Daily summary to the founder.</p>
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650">Send to</label>
      <input class="inp" value="${esc(S.settings.alert_to || "")}" onchange="A.setSetting('alert_to',this.value)">
      <div style="height:10px"></div>
      <div class="acts">
        <button class="btn ${S.settings.alerts_active === "true" ? "" : "p"}"
          onclick="A.setSetting('alerts_active','${S.settings.alerts_active === "true" ? "false" : "true"}')">
          ${S.settings.alerts_active === "true" ? "Pause alerts" : "Turn alerts on"}</button>
        <span class="pill ${S.settings.alerts_active === "true" ? "green" : "amber"}">
          ${S.settings.alerts_active === "true" ? "Active" : "Paused"}</span></div>
      <p class="hint">The sending job is not built yet — turn this on once the SLA numbers are agreed.</p></div>
  </div></div>`;
}

/* ------------------------------------------------------------ team */
function teamView() {
  const act = S.people.filter(p => p.active);
  return `<div class="head"><h1>Team &amp; Access</h1><span class="tag">${act.length} active</span>
    <span class="tag grey">${S.people.filter(p => p.is_admin && p.active).length} admins</span></div>
  <p class="sub">Who can open which pipeline. Enforced by the database, not just hidden in the menu.</p>
  <div class="grid2"><div>
    <div class="panel"><h3>Members</h3><p class="ph">Click a pipeline to grant or remove it.</p>
      <table><thead><tr><th>Name</th><th>Access</th><th>Admin</th><th></th></tr></thead><tbody>
      ${S.people.map(p => `<tr style="${p.active ? "" : "opacity:.45"}">
        <td><b>${esc(p.full_name)}</b>${p.id === S.me.id ? ` <span class="pill rose">you</span>` : ""}
          <br><span style="color:var(--ink-soft);font-size:11px">${esc(p.email)}</span></td>
        <td><div class="acts">${ALLMODS.map(m => {
            const on = p.is_admin || p.access.includes(m);
            return `<button class="chip ${on ? "on" : ""}" ${p.is_admin ? "disabled" : ""}
              onclick="A.toggleAcc('${p.id}','${m}')">${MODLABEL[m]}</button>`;
          }).join("")}</div></td>
        <td><button class="chip ${p.is_admin ? "on" : ""}" onclick="A.toggleAdmin('${p.id}')">${p.is_admin ? "Admin" : "Staff"}</button></td>
        <td><button class="btn sm" onclick="A.toggleActive('${p.id}')">${p.active ? "Deactivate" : "Reactivate"}</button></td>
      </tr>`).join("")}
      </tbody></table>
      <p class="hint">Deactivating keeps their notes and history — it only stops them signing in.</p></div>
  </div><div>
    <div class="panel"><h3>Add a team member</h3>
      <p class="ph">Creates their login straight away. Give them the password in person.</p>
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650">Name</label>
      <input class="inp" id="nmName" placeholder="e.g. Kavitha">
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650;margin-top:9px;display:block">Temporary password</label>
      <input class="inp" id="nmPass" placeholder="at least 8 characters">
      <label style="font-size:11px;color:var(--ink-soft);font-weight:650;margin-top:9px;display:block">Access</label>
      <div class="acts" style="margin:5px 0 12px" id="nmAcc">
        ${ALLMODS.map(m => `<button class="chip" data-m="${m}" onclick="this.classList.toggle('on')">${MODLABEL[m]}</button>`).join("")}
        <button class="chip" data-admin="1" onclick="this.classList.toggle('on')">Admin</button></div>
      <button class="btn p" style="width:100%" onclick="A.addMember()">Create account</button>
      <p class="hint">Username becomes name@littleshotsbyhema.com. No inbox needed.</p></div>
    <div class="panel"><h3>Coverage</h3><p class="ph">How many people can work each pipeline.</p>
      ${barsHTML(ALLMODS.map(m => [MODLABEL[m], S.people.filter(p => p.active && (p.is_admin || p.access.includes(m))).length]))}</div>
  </div></div>`;
}
