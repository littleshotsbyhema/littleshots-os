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
  if (canSee("dash")) h += tab("dash", "Dashboard");
  BOARDS.filter(canSee).forEach(k => {
    const late = breaches(k).length;
    h += tab(k, MODLABEL[k], late ? late + " late" : pool().filter(j => inMod(j, k)).length, late);
  });
  if (canSee("pay")) h += tab("pay", "Payments", owing().length || "", owing().length);
  if (canSee("life")) h += tab("life", "Marketing");
  if (canSee("sla")) h += tab("sla", "Settings");
  if (canSee("team")) h += tab("team", "Team");
  return h;
}
function viewHTML() {
  switch (S.view) {
    case "dash": return dashView();
    case "pay": return payView();
    case "life": return lifeView();
    case "sla": return slaView();
    case "team": return teamView();
    case "archive": return archiveView();
    case "noaccess": return `<div class="head"><h1>No access yet</h1></div>
      <p class="sub">No pipelines have been assigned to you. An admin can fix that in Team.</p>`;
    default: return boardView(S.view);
  }
}
const locTag = () => S.loc === "All" ? "" : `<span class="tag grey">${esc(S.loc)}</span>`;

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
      ${k === "del" || k === "post" ? "Editing team: nothing is handed over until this clears." : "Collect before files leave the studio."}
      <button class="btn sm" onclick="A.go('pay')">See list</button></div>` : "";
  const lock = lk.length ? `<div class="alert dark">
      <b>⤓ ${lk.length} client link${lk.length === 1 ? "" : "s"} must stay view-only.</b>
      Preview links with downloads disabled — no originals, no Drive access, until the balance clears.
      <button class="btn sm dark" onclick="A.go('pay')">Which ones</button></div>` : "";
  const sla = late
    ? `<div class="alert amber"><b>${late} past SLA.</b> Longest waits are at the top of each column.</div>`
    : `<div class="alert green"><b>Everything inside SLA.</b> ${due ? due + " due today." : "Nothing due today."}</div>`;
  return `<div class="head"><h1>${MODLABEL[k]}</h1>${locTag()}
      <span class="tag">${pool().filter(j => inMod(j, k)).length} active</span>
      ${late ? `<span class="tag amber">${late} past SLA</span>` : ""}
      ${ow.length ? `<span class="tag red">${rupee(owedTotal(k))} pending</span>` : ""}
      ${k === "crm" && canSee("archive") ? `<button class="archlink" onclick="A.go('archive')">
        Archive (${archivedJobs().length})</button>` : ""}</div>
    <p class="sub">${boardSub(k)}</p>${money}${lock}${sla}
    <div class="board">${stages.map(st => colHTML(k, st)).join("")}</div>
    ${trackBoards(k)}
    <p class="hint">Card edge shows SLA state. ₹ means money is owed; a black ⤓ strip means the client's link must stay view-only.</p>`;
}
function boardSub(k) {
  return {
    crm: "Every enquiry from first message to signed booking.",
    prod: "Booked jobs through the shoot to the client's gallery.",
    post: "Client selection, editing and quality control — with the video moving in parallel.",
    del: "Album, frame, pickup and handover."
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

/* the side tracks that belong to this module, each as its own little board */
function trackBoards(k) {
  return modTracks(k).map(t => {
    const steps = trackSteps(t.key).filter(s => (s.modules || []).includes(k));
    const live = pool().filter(j => trackRuns(j, t.key) && trackOf(j, t.key) &&
      trackOf(j, t.key) !== "Done");
    return `<div class="trackwrap">
      <div class="trackhead">${{ video: "▶", album: "▣", frame: "▢" }[t.key] || "•"}
        ${esc(t.label)} track
        <span class="tag grey">${live.length} running</span>
        <small>runs alongside — it does not hold the main line up, but
          ${esc(t.key === "video" ? S.settings.digital_stage || "Digital Files Delivery"
                                  : S.settings.pickup_stage || "Waiting for Client Pickup")}
          waits for it</small></div>
      <div class="board">${steps.map(st => trackColHTML(t, st)).join("")}</div></div>`;
  }).join("");
}
function trackColHTML(t, st) {
  const list = pool().filter(j => trackRuns(j, t.key) && trackOf(j, t.key) === st.name)
    .sort((a, b) => trackDays(b, t.key) - trackDays(a, t.key));
  return `<div class="col track">
    <div class="col-h"><div class="r1"><span class="name">${esc(st.name)}</span>
      <span class="n">${list.length}</span></div>
      <div class="sla">${st.sla_days == null ? "No SLA" : "SLA " + st.sla_days + "d · " + esc(st.responsible)}</div>
    </div>
    <div class="col-body">${list.length ? list.map(j => trackCardHTML(j, t)).join("")
      : `<div class="empty">Nothing here</div>`}</div></div>`;
}
function trackCardHTML(j, t) {
  const status = trackSla(j, t.key);
  const cls = { OVERDUE: "late", "Due today": "due", "On track": "ok" }[status] || "";
  const pill = { OVERDUE: "red", "Due today": "amber" }[status] || "";
  const st = stageByName(trackOf(j, t.key)) || {};
  return `<button class="card ${cls}" onclick="A.openJob(${j.id})">
    <div class="cn">${esc(j.client_name)}</div>
    <div class="cm">${esc(j.shoot_type)} · main line at ${esc(j.stage)}</div>
    <div class="row">
      <span class="pill ${pill}">${status === "No SLA" ? "no SLA"
        : status === "OVERDUE" ? (trackDays(j, t.key) - st.sla_days) + "d over"
        : status === "Due today" ? "due today"
        : trackDays(j, t.key) + "/" + st.sla_days + "d"}</span>
      ${owes(j) ? `<span class="pill red">${rupee(bal(j))} owed</span>` : ""}
      <span class="av">${ini(j.owner_name)}</span></div></button>`;
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
    ${locked(j) ? `<div class="owebar lock">⤓ DOWNLOAD LOCKED · VIEW ONLY</div>`
      : j.file_access === "Downloads unlocked" ? `<div class="okbar">⤓ Download unlocked</div>` : ""}
    <div class="row">
      <span class="pill ${slaPill(j)}">${slaText(j)}</span>
      ${TRACKS.filter(t => trackRuns(j, t.key) && trackOf(j, t.key) && trackOf(j, t.key) !== "Done")
        .map(t => `<span class="pill blue">${{ video: "▶", album: "▣", frame: "▢" }[t.key]} ${esc(trackOf(j, t.key))}</span>`).join("")}
      ${num(j.package_value) ? `<span class="pill">${rupee(j.package_value)}</span>` : ""}
      <span class="av">${ini(j.owner_name)}</span></div></button>`;
}

/* --------------------------------------------------------- archive */
function archiveView() {
  const list = archivedJobs();
  return `<div class="head"><h1>Archive</h1>${locTag()}<span class="tag grey">${list.length} parked</span>
    <button class="archlink" onclick="A.go('crm')">← Back to Sales</button></div>
  <p class="sub">Leads that went cold or chose someone else. No SLA runs here, and they stay out of the boards.</p>
  <div class="panel">
    ${list.length ? `<table><thead><tr><th>Client</th><th>Shoot</th><th>Location</th><th>Parked</th><th></th></tr></thead><tbody>
      ${list.map(j => `<tr>
        <td style="cursor:pointer" onclick="A.openJob(${j.id})"><b>${esc(j.client_name)}</b></td>
        <td>${esc(j.shoot_type)}</td><td>${esc(j.location)}</td>
        <td style="color:var(--ink-soft)">${j.days_in_stage} days</td>
        <td><button class="btn sm" onclick="A.moveTo(${j.id},'${esc(flow()[0].name)}')">Restore</button></td>
      </tr>`).join("")}</tbody></table>` : `<div class="empty">Nothing archived</div>`}
  </div>`;
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
  const [n, a] = await Promise.all([
    sb.from("job_notes").select("body,created_at,author_id").eq("job_id", id).order("created_at", { ascending: false }).limit(30),
    sb.from("job_activity").select("action,created_at,actor_id").eq("job_id", id).order("created_at", { ascending: false }).limit(40)
  ]);
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
    ${emailSection(j)}
    ${slotSection(j)}
    ${handoverSection(j)}
    ${tracksSection(j)}
    ${linksSection(j)}
    ${moveSection(j, nextS, prevS, gateBlocked, gate, b, parked)}
    ${paySection(j, b, gate)}
    ${accessSection(j, b)}
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
  const mustBeFirm = j.stage_no >= ordOf("shoot_date_from");
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

/* the backup and the file count, from the shoot onwards */
function handoverSection(j) {
  const gOrd = ordOf("gallery_stage");
  if (archived(j) || j.stage_no < gOrd - 1) return "";     // nothing shot yet
  const has = String(j.backup_location || "").trim(), files = num(j.files_shot);
  const done = has && files > 0;
  const past = j.stage_no >= gOrd;
  return `<div class="sec"><h5>Shoot handover</h5>
    <div class="slot ${done ? "set" : past ? "missing" : ""}">
      <h6>${done ? "✓ Backed up · " + files + " files" : "Backup not recorded"}</h6>
      <p>${done
        ? "Kept at <b>" + esc(has) + "</b>."
        : "Needed before " + esc(S.settings.gallery_stage || "Client Gallery Ready") +
          " — where the files are backed up, and how many were taken."}</p>
      <div class="acts" style="margin-top:10px">
        <button class="btn ${done ? "sm" : "p sm"}" onclick="A.handover(${j.id})">
          ${done ? "Edit" : "Record it"}</button></div>
    </div></div>`;
}

/* video, album and frame — each moving at its own pace */
function tracksSection(j) {
  const live = TRACKS.filter(t => trackRuns(j, t.key));
  if (archived(j) || !live.length) return "";
  return `<div class="sec"><h5>Side tracks</h5>${live.map(t => {
    const at = trackOf(j, t.key), done = at === "Done";
    const next = trackNext(j, t.key), prev = trackPrev(j, t.key);
    const blocked = next && trackPayGate(j, next);
    const status = at && !done ? trackSla(j, t.key) : null;
    const gateStage = t.key === "video" ? (S.settings.digital_stage || "Digital Files Delivery")
                                        : (S.settings.pickup_stage || "Waiting for Client Pickup");
    return `<div class="trackrow ${done ? "done" : ""}">
      <div class="tr1"><b>${esc(t.label)}</b>
        <span class="pill ${done ? "green" : status === "OVERDUE" ? "red"
          : status === "Due today" ? "amber" : ""}">${done ? "✓ finished"
          : at ? esc(at) : "not started"}</span>
        ${at && !done && trackDays(j, t.key) ? `<span class="trd">day ${trackDays(j, t.key)}</span>` : ""}</div>
      ${blocked ? `<div class="alert red" style="margin:8px 0 0">
        <b>${rupee(bal(j))} outstanding.</b> ${esc(next)} is blocked until it clears.</div>` : ""}
      <div class="acts" style="margin-top:8px">
        <button class="btn sm" onclick="A.moveTrack(${j.id},'${t.key}','${esc(prev || "")}')"
          ${prev ? "" : "disabled"}>←</button>
        <button class="btn ${blocked ? "" : "p"} sm"
          onclick="A.moveTrack(${j.id},'${t.key}',${next ? `'${esc(next)}'` : "null"})"
          ${next && !blocked ? "" : "disabled"}>${next ? (next === "Done" ? "Mark finished"
            : esc(next) + " →") : "Finished"}</button>
        ${blocked ? `<button class="btn warn sm"
          onclick="A.moveTrack(${j.id},'${t.key}','${esc(next)}',true)">Override</button>` : ""}
      </div>
      ${done ? "" : `<p class="hint" style="margin-top:6px">${esc(gateStage)} waits for this.</p>`}
    </div>`;
  }).join("")}</div>`;
}

/* every link the client has been given */
function linksSection(j) {
  const rows = [
    ["Selection gallery", j.gallery_link, "gallery_link"],
    ["Edited photos", j.edited_link, "edited_link"],
    ["Edited video", j.has_video ? j.video_link : null, "video_link"]
  ].filter(r => r[1] || (r[2] === "gallery_link" && j.stage_no >= ordOf("selection_stage")));
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
  const termsGate = nextS && !pkGaps && termsNeeded(j, nextS);
  const held = nextS ? trackBlocking(j, nextS) : null;
  const needGallery = nextS && galleryLinkNeeded(j, nextS);
  const needEdit = nextS && editInfoNeeded(j, nextS);
  return `<div class="sec"><h5>Move stage</h5>
    ${held ? `<div class="alert red"><b>Held by a side track.</b> The ${esc(held)} —
      ${esc(nextS)} waits for it.</div>` : ""}
    ${needGallery ? `<div class="alert amber"><b>${esc(nextS)} needs the Pixieset gallery link.</b>
      You'll be asked for it.</div>` : ""}
    ${needEdit ? `<div class="alert amber"><b>${esc(nextS)} needs the edited file count and link.</b>
      You'll be asked for them.</div>` : ""}
    ${gateBlocked ? `<div class="alert red"><b>Blocked.</b> ${rupee(b)} outstanding — clear it or override.</div>` : ""}
    ${pkGaps ? `<div class="alert amber"><b>${esc(nextS)} needs the package settled first.</b>
      Missing ${esc(pkGaps.join(", "))} — you'll be asked for it.</div>` : ""}
    ${termsGate ? `<div class="alert amber"><b>The terms and booking details have to be emailed
      before ${esc(nextS)}.</b> You'll be asked to send them.</div>` : ""}
    ${needs ? `<div class="alert amber"><b>${needs === "firm" ? "A confirmed date is needed" : "A shoot slot is needed"}
      before ${esc(nextS)}.</b> You'll be asked for it.</div>` : ""}
    ${hoGaps ? `<div class="alert amber"><b>${esc(nextS)} needs the shoot handed over first.</b>
      Missing ${esc(hoGaps.join(", "))} — you'll be asked for it.</div>` : ""}
    <div class="acts">
      ${parked
        ? `<button class="btn p" onclick="A.moveTo(${j.id},'${esc(flow()[0].name)}')">Restore to ${esc(flow()[0].name)}</button>`
        : `<button class="btn" onclick="A.moveTo(${j.id},${prevS ? `'${esc(prevS)}'` : "null"})" ${prevS ? "" : "disabled"}>← ${esc(prevS || "Back")}</button>
           <button class="btn ${gateBlocked || held ? "" : "p"}" onclick="A.moveTo(${j.id},${nextS ? `'${esc(nextS)}'` : "null"})" ${!nextS || gateBlocked || held ? "disabled" : ""}>
             ${nextS ? esc(nextS) + " →" : "Final stage"}</button>
           ${gateBlocked ? `<button class="btn warn" onclick="A.moveTo(${j.id},'${esc(nextS)}',true)">Override &amp; deliver</button>` : ""}
           ${parkedStage() ? `<button class="btn" onclick="A.moveTo(${j.id},'${esc(parkedStage())}')">Archive</button>` : ""}`}
    </div><p class="hint">Moving resets the SLA clock and is logged against your name.</p></div>`;
}

function paySection(j, b, gate) {
  return `<div class="sec"><h5>Payment</h5>
    <div class="paybox ${owes(j) ? "owes" : ""}">
      <div class="payrow"><span>Package total</span><b>${num(j.package_value) ? rupee(j.package_value) : "not quoted"}</b></div>
      <div class="payrow"><span>Received</span><b>${rupee(j.amount_received)}</b></div>
      <div class="payrow total ${b > 0 ? "red" : ""}"><span>${b > 0 ? "Balance pending" : "Fully paid"}</span>
        <span>${b > 0 ? rupee(b) : "✓"}</span></div>
      <div class="acts" style="margin-top:11px">
        ${b > 0 ? `<input class="inp" id="payBox" style="width:110px" type="number" min="1" max="${b}" placeholder="Amount">
          <button class="btn p" onclick="A.recordPay(${j.id})">Record payment</button>
          <button class="btn sm" onclick="A.recordPay(${j.id},${b})">Mark fully paid</button>`
        : ""}
        <button class="btn sm" onclick="A.editPackage(${j.id})">Edit package &amp; delivery</button>
      </div></div>
    ${b > 0 ? `<p class="hint">${esc(gate || "")} is blocked until this clears.</p>` : ""}</div>`;
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
    <dt>Source</dt><dd>${esc(j.source || "—")}</dd>
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
    <dt>Days in stage</dt><dd>${j.days_in_stage}${j.sla_days == null ? " · no SLA" : " of " + j.sla_days + " allowed"}</dd>
    <dt>Stage owner</dt><dd>${esc(j.stage_responsible)}</dd>
    <dt>Assigned to</dt><dd><select class="inp" onchange="A.reassign(${j.id},this.value)">
      <option value="">Unassigned</option>
      ${teamFor(j.stage).map(p => `<option value="${p.id}" ${p.id === j.owner_id ? "selected" : ""}>${esc(p.full_name)}</option>`).join("")}
      </select>
      <div style="color:var(--ink-soft);font-size:11px;margin-top:3px">only people with access to this pipeline</div></dd>
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
        ? S.jobs.filter(j => trackOf(j, s.track) === s.name).length
        : S.jobs.filter(j => j.stage === s.name).length;
      const late = s.track ? 0 : S.jobs.filter(j => j.stage === s.name && j.sla_status === "OVERDUE").length;
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
           ["terms_stage", "Terms email required before"],
           ["gallery_stage", "Shoot handover required before"],
           ["selection_stage", "Gallery link required before"],
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
      </tbody></table>
      <p class="hint">Shoot types are managed in the database — ask me to add one.</p></div>
  </div><div>
    <div class="panel"><h3>Terms &amp; conditions</h3>
      <p class="ph">Attached to every terms email. Paste a public link to the PDF.</p>
      <input class="inp" value="${esc(S.settings.terms_url || "")}" placeholder="https://…"
        onchange="A.setSetting('terms_url',this.value)">
      <p class="hint">Without this the email still sends, just with nothing attached.</p></div>
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
