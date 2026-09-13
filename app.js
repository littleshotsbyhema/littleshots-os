/* ===================================================================
   Little Shots Studio OS
   Single-page app on Supabase. All security and all derived state
   live in the database — this file is only the interface.
   =================================================================== */

const SUPABASE_URL = "https://bdadnmwauyarukqvfbvd.supabase.co";
const SUPABASE_KEY = "sb_publishable_xnepieuyFIwBqGwtwMJ7Sg_FovsaMNe";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

/* ------------------------------------------------------------ state */
const S = {
  session: null, me: null, stages: [], settings: {}, jobs: [], people: [], types: [],
  view: "crm", loc: "All", openId: null, busy: false
};

const MODLABEL = { crm: "CRM", prod: "Production", del: "Delivery", life: "Marketing" };
const ALLMODS = ["crm", "prod", "del", "life"];
const LOCATIONS = ["Coimbatore", "Bangalore - MDP", "Bangalore - JP Nagar", "Erode", "Others"];
const SOURCES = ["Instagram", "Website form", "Google search", "Referral", "Repeat client", "Walk-in", "Other"];

/* ------------------------------------------------------------ utils */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rupee = n => "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const ini = n => String(n || "?").slice(0, 2).toUpperCase();
const num = v => Number(v) || 0;

const DT = { day: "numeric", month: "short" };
const fmtShoot = iso => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", DT) + ", " +
         d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
};
const fmtDay = iso => new Date(iso).toLocaleDateString("en-IN",
  { weekday: "long", day: "numeric", month: "long" });
const isToday = iso => iso && new Date(iso).toDateString() === new Date().toDateString();
/* an ISO string turned into the value a datetime-local input wants */
const toLocalInput = iso => {
  if (!iso) return "";
  const d = new Date(iso), p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

let toastTimer;
function toast(msg, isErr) {
  const el = $("toast");
  el.textContent = msg;
  el.className = "toast on" + (isErr ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 3200);
}
function fail(e) {
  console.error(e);
  let m = (e && (e.message || e.error_description)) || "Something went wrong";
  m = m.replace(/^.*?(Set a shoot|A confirmed shoot|Record the advance|A phone number|Pick a shoot)/, "$1");
  toast(m, true);
}

/* ------------------------------------------------- derived helpers */
const stageByName = n => S.stages.find(s => s.name === n);
const flow = () => S.stages.filter(s => !s.is_parked).sort((a, b) => a.ordinal - b.ordinal);
const parkedStage = () => (S.stages.find(s => s.is_parked) || {}).name;
const modStages = k => S.stages.filter(s => (s.modules || []).includes(k) && !s.is_parked)
  .sort((a, b) => a.ordinal - b.ordinal);
const isAdmin = () => !!(S.me && S.me.is_admin);
const myMods = () => (S.me ? S.me.access : []);
const ordOf = key => (stageByName(S.settings[key]) || {}).ordinal || 999;

function canSee(v) {
  if (!S.me || !S.me.active) return false;
  if (isAdmin()) return true;
  if (ALLMODS.includes(v)) return myMods().includes(v);
  if (v === "pay" || v === "archive") return myMods().some(m => m !== "life");
  if (v === "dash" || v === "sla" || v === "team") return false;
  return true;
}
const firstAllowed = () => ["dash", "crm", "prod", "del", "life", "pay"].find(canSee) || "noaccess";

function appliesTo(job, st) {
  if (!st.optional_for) return true;
  return st.optional_for === "video" ? !!job.has_video : !!job.has_album;
}
function nextStageFor(job) {
  const f = flow();
  let i = f.findIndex(s => s.name === job.stage);
  if (i < 0) return null;
  while (++i < f.length) if (appliesTo(job, f[i])) return f[i].name;
  return null;
}
function prevStageFor(job) {
  const f = flow();
  let i = f.findIndex(s => s.name === job.stage);
  if (i < 0) return null;
  while (--i >= 0) if (appliesTo(job, f[i])) return f[i].name;
  return null;
}
const bal = j => Math.max(0, num(j.balance));
const owes = j => j.payment_status === "PENDING";
const locked = j => j.file_access === "VIEW-ONLY - downloads OFF";
const archived = j => !!j.is_parked;
const inLoc = j => S.loc === "All" || j.location === S.loc;
const pool = () => S.jobs.filter(j => inLoc(j) && !archived(j));
const archivedJobs = () => S.jobs.filter(j => inLoc(j) && archived(j));
const inMod = (j, k) => (j.stage_modules || []).includes(k);
const breaches = k => pool().filter(j => j.sla_status === "OVERDUE" && (!k || inMod(j, k)));
const dueToday = k => pool().filter(j => j.sla_status === "Due today" && (!k || inMod(j, k)));
const owing = k => pool().filter(j => owes(j) && (!k || inMod(j, k)));
const owedTotal = k => owing(k).reduce((a, j) => a + bal(j), 0);
const lockedList = k => pool().filter(j => locked(j) && (!k || inMod(j, k)));
const upcoming = days => pool().filter(j => j.shoot_at &&
  j.days_to_shoot >= -1 && j.days_to_shoot < days)
  .sort((a, b) => new Date(a.shoot_at) - new Date(b.shoot_at));

function slaClass(j) { return { OVERDUE: "late", "Due today": "due", "On track": "ok" }[j.sla_status] || ""; }
function slaPill(j) { return { OVERDUE: "red", "Due today": "amber" }[j.sla_status] || ""; }
function slaText(j) {
  if (j.sla_status === "No SLA") return "no SLA";
  if (j.sla_status === "OVERDUE") return (j.days_in_stage - j.sla_days) + "d over SLA";
  if (j.sla_status === "Due today") return "due today";
  return j.days_in_stage + "/" + j.sla_days + "d";
}
/* the list, plus whatever odd value this job already carries */
function typeOptions(current) {
  const list = S.types.slice();
  if (current && !list.includes(current)) list.push(current);
  return list.map(t => `<option ${t === current ? "selected" : ""}>${esc(t)}</option>`).join("");
}
function teamFor(stageName) {
  const st = stageByName(stageName);
  const mods = st ? st.modules || [] : [];
  return S.people.filter(p => p.active && (p.is_admin || p.access.some(m => mods.includes(m))));
}
/* does moving to this stage need a shoot slot sorted out first? */
function slotNeeded(job, toStage) {
  const st = stageByName(toStage);
  if (!st || st.is_parked) return null;
  if (st.ordinal >= ordOf("shoot_date_from") && !job.shoot_at) return "firm";
  if (st.ordinal >= ordOf("booked_stage") && !job.shoot_at && !job.shoot_tbd) return "any";
  return null;
}

/* ------------------------------------------------------------ data */
async function loadReference() {
  const [st, se, pf, pa, ty] = await Promise.all([
    sb.from("stages").select("*").order("ordinal"),
    sb.from("settings").select("key,value"),
    sb.from("profiles").select("id,full_name,email,is_admin,active").order("full_name"),
    sb.from("profile_access").select("profile_id,module"),
    sb.from("shoot_types").select("name,sort").order("sort")
  ]);
  for (const r of [st, se, pf, pa, ty]) if (r.error) throw r.error;
  S.types = (ty.data || []).map(t => t.name);
  S.stages = st.data || [];
  S.settings = Object.fromEntries((se.data || []).map(r => [r.key, r.value]));
  S.people = (pf.data || []).map(p => ({
    ...p, access: (pa.data || []).filter(a => a.profile_id === p.id).map(a => a.module)
  }));
  S.me = S.people.find(p => p.id === S.session.user.id) || null;
}
async function loadJobs() {
  const { data, error } = await sb.from("v_jobs").select("*")
    .order("stage_no").order("days_in_stage", { ascending: false });
  if (error) throw error;
  S.jobs = data || [];
}
async function refresh(msg) {
  try {
    await loadJobs();
    render();
    if (S.openId) await openJob(S.openId, true);
    if (msg) toast(msg);
  } catch (e) { fail(e); }
}

/* ------------------------------------------------------------ boot */
async function boot() {
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  if (!S.session) return renderLogin();
  try {
    await loadReference();
    if (!S.me) return void ($("root").innerHTML = shellError(
      "Your sign-in worked, but you have no profile yet.",
      "An admin needs to add you in Team &amp; Access."));
    if (!S.me.active) return void ($("root").innerHTML = shellError(
      "This account has been deactivated.", "Ask an admin to reactivate it."));
    await loadJobs();
    S.view = canSee(S.view) ? S.view : firstAllowed();
    render();
  } catch (e) { fail(e); $("root").innerHTML = shellError("Could not load your data.", esc(e.message || "")); }
}
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
  ["crm", "prod", "del"].filter(canSee).forEach(k => {
    const late = breaches(k).length;
    h += tab(k, MODLABEL[k], late ? late + " late" : pool().filter(j => inMod(j, k)).length, late);
  });
  if (canSee("pay")) h += tab("pay", "Payments", owing().length || "", owing().length);
  if (canSee("life")) h += tab("life", "Marketing");
  if (canSee("archive")) h += tab("archive", "Archive", archivedJobs().length || "");
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
      <td>${esc(j.location)}</td>
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
      ${week.length ? `<table><thead><tr><th>Time</th><th>Client</th><th>Location</th><th>Who / stage</th></tr></thead>
        <tbody>${days}</tbody></table>`
        : `<div class="empty">Nothing scheduled in the next 7 days</div>`}
      ${tbd.length ? `<p class="hint">${tbd.length} more booked ${tbd.length === 1 ? "job is" : "jobs are"} waiting on the client to fix a date.</p>` : ""}
    </div>
  </div><div>
    <div class="panel"><h3>Where everything is</h3><p class="ph">Jobs in each stage right now.</p>
      ${barsHTML(flow().map(s => [s.name, pool().filter(j => j.stage === s.name).length]))}</div>
    <div class="panel"><h3>Past SLA by pipeline</h3><p class="ph">Who needs to unblock what.</p>
      ${barsHTML(["crm", "prod", "del"].map(k => [MODLABEL[k], breaches(k).length]))}</div>
  </div></div>`;
}

/* ---------------------------------------------------------- boards */
function boardView(k) {
  const stages = modStages(k);
  const late = breaches(k).length, due = dueToday(k).length;
  const ow = owing(k), lk = lockedList(k);
  const money = ow.length ? `<div class="alert red">
      <b>${rupee(owedTotal(k))} pending across ${ow.length} job${ow.length === 1 ? "" : "s"}.</b>
      ${k === "del" ? "Editing team: nothing gets delivered until this clears." : "Collect before files leave the studio."}
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
      ${ow.length ? `<span class="tag red">${rupee(owedTotal(k))} pending</span>` : ""}</div>
    <p class="sub">${boardSub(k)}</p>${money}${lock}${sla}
    <div class="board">${stages.map(st => colHTML(k, st)).join("")}</div>
    <p class="hint">Card edge shows SLA state. ₹ means money is owed; a black ⤓ strip means the client's link must stay view-only.</p>`;
}
function boardSub(k) {
  return {
    crm: "Every enquiry from first message to signed booking.",
    prod: "Booked jobs through the shoot to raw files in the client's hands.",
    del: "Client selection through post-production to final handover."
  }[k] || "";
}
function colHTML(k, st) {
  const list = pool().filter(j => j.stage === st.name)
    .sort((a, b) => (b.days_in_stage || 0) - (a.days_in_stage || 0));
  const shared = (st.modules || []).length > 1;
  const note = st.optional_for
    ? `<div class="link">${st.optional_for === "video" ? "▶" : "▣"} only packages with ${st.optional_for} — others skip this</div>`
    : shared ? `<div class="link">↳ shared with ${(st.modules || []).filter(m => m !== k).map(m => MODLABEL[m]).join(", ")}</div>` : "";
  return `<div class="col ${shared ? "shared" : ""}">
    <div class="col-h"><div class="r1"><span class="name">${esc(st.name)}</span><span class="n">${list.length}</span></div>
      <div class="sla">${st.sla_days == null ? "No SLA" : "SLA " + st.sla_days + "d · " + esc(st.responsible)}</div>
      ${note}</div>
    <div class="col-body">${list.length ? list.map(cardHTML).join("")
      : `<div class="empty">${st.optional_for ? "No " + st.optional_for + " jobs here" : "Nothing here"}</div>`}</div></div>`;
}
function cardHTML(j) {
  const soon = j.shoot_at && j.days_to_shoot <= 2;
  return `<button class="card ${slaClass(j)} ${owes(j) ? "owes" : ""}" onclick="A.openJob(${j.id})">
    <div class="cn">${esc(j.client_name)}</div>
    <div class="cm">${esc(j.shoot_type)}</div>
    <div class="loc">◎ ${esc(j.location)}</div>
    ${j.shoot_at ? `<div class="shootbar ${soon ? "soon" : "set"}">◷ ${esc(fmtShoot(j.shoot_at))}${isToday(j.shoot_at) ? " · TODAY" : ""}</div>`
      : j.shoot_status === "TBD" ? `<div class="shootbar tbd">◷ DATE TBD</div>`
      : j.shoot_status === "Missing" ? `<div class="owebar">◷ NO SHOOT SLOT</div>` : ""}
    ${owes(j) ? `<div class="owebar">₹ ${rupee(bal(j)).slice(1)} PENDING</div>` : ""}
    ${locked(j) ? `<div class="owebar lock">⤓ DOWNLOAD LOCKED · VIEW ONLY</div>`
      : j.file_access === "Downloads unlocked" ? `<div class="okbar">⤓ Download unlocked</div>` : ""}
    <div class="row">
      <span class="pill ${slaPill(j)}">${slaText(j)}</span>
      ${j.has_video ? `<span class="pill blue">▶ video</span>` : ""}
      ${j.has_album ? `<span class="pill blue">▣ album</span>` : ""}
      ${num(j.package_value) ? `<span class="pill">${rupee(j.package_value)}</span>` : ""}
      <span class="av">${ini(j.owner_name)}</span></div></button>`;
}

/* --------------------------------------------------------- archive */
function archiveView() {
  const list = archivedJobs();
  return `<div class="head"><h1>Archive</h1>${locTag()}<span class="tag grey">${list.length} parked</span></div>
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
  const gateBlocked = nextS === gate && b > 0;
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
    ${slotSection(j)}
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
           ${soon && j.days_to_shoot >= 0 ? " Confirm with the client." : ""}</p>
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

function moveSection(j, nextS, prevS, gateBlocked, gate, b, parked) {
  const needs = nextS ? slotNeeded(j, nextS) : null;
  return `<div class="sec"><h5>Move stage</h5>
    ${gateBlocked ? `<div class="alert red"><b>Blocked.</b> ${rupee(b)} outstanding — clear it or override.</div>` : ""}
    ${needs ? `<div class="alert amber"><b>${needs === "firm" ? "A confirmed date is needed" : "A shoot slot is needed"}
      before ${esc(nextS)}.</b> You'll be asked for it.</div>` : ""}
    <div class="acts">
      ${parked
        ? `<button class="btn p" onclick="A.moveTo(${j.id},'${esc(flow()[0].name)}')">Restore to ${esc(flow()[0].name)}</button>`
        : `<button class="btn" onclick="A.moveTo(${j.id},${prevS ? `'${esc(prevS)}'` : "null"})" ${prevS ? "" : "disabled"}>← ${esc(prevS || "Back")}</button>
           <button class="btn ${gateBlocked ? "" : "p"}" onclick="A.moveTo(${j.id},${nextS ? `'${esc(nextS)}'` : "null"})" ${!nextS || gateBlocked ? "disabled" : ""}>
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
        : `<button class="btn sm" onclick="A.editMoney(${j.id})">Edit package value</button>`}
      </div></div>
    ${b > 0 ? `<p class="hint">Cannot reach ${esc(gate || "")} until this clears.</p>` : ""}</div>`;
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
      : `<span style="color:var(--ink-soft)">—</span>`}</dd>
    <dt>Shoot type</dt><dd><select class="inp" onchange="A.setType(${j.id},this.value)">
      ${typeOptions(j.shoot_type)}</select></dd>
    <dt>Source</dt><dd>${esc(j.source || "—")}</dd>
    <dt>Deliverables</dt><dd>Photos${j.has_video ? " + video" : ""}${j.has_album ? " + album" : ""}${!j.has_video && !j.has_album ? " only (digital)" : ""}
      <div class="acts" style="margin-top:6px">
        <button class="btn sm" onclick="A.toggleDeliv(${j.id},'video')">${j.has_video ? "Remove video" : "Add video"}</button>
        <button class="btn sm" onclick="A.toggleDeliv(${j.id},'album')">${j.has_album ? "Remove album" : "Add album"}</button></div></dd>
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
      <small>${skip ? "skipped · no " + s.optional_for
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
      ${barsHTML(["crm", "prod", "del"].map(k => [MODLABEL[k], owedTotal(k)]), rupee)}</div>
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
    <div class="panel"><h3>Pipeline funnel</h3><p class="ph">How many have reached each CRM stage or beyond.</p>
      ${barsHTML(funnel)}</div>
    <div class="panel"><h3>Deliverables mix</h3><p class="ph">Photos, album and video.</p>
      ${barsHTML([["Photos only", p.filter(j => !j.has_video && !j.has_album).length],
                  ["With album", p.filter(j => j.has_album).length],
                  ["With video", p.filter(j => j.has_video).length]])}</div>
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
      const here = S.jobs.filter(j => j.stage === s.name).length;
      const late = S.jobs.filter(j => j.stage === s.name && j.sla_status === "OVERDUE").length;
      return `<tr><td><b>${esc(s.name)}</b>
          ${s.optional_for ? `<span class="pill blue">optional</span>` : ""}
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
           ["pay_gate_stage", "Delivery blocked at"],
           ["booked_stage", "Advance and shoot slot required from"],
           ["shoot_date_from", "TBD no longer accepted from"]].map(([k, lbl]) => `<tr>
          <td><b>${lbl}</b></td>
          <td><select class="inp" onchange="A.setSetting('${k}',this.value)">
            ${flow().map(s => `<option ${s.name === S.settings[k] ? "selected" : ""}>${esc(s.name)}</option>`).join("")}
          </select></td></tr>`).join("")}
      </tbody></table>
      <p class="hint">Shoot types are managed in the database — ask me to add one.</p></div>
  </div><div>
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

/* --------------------------------------------------------- actions */
const A = {
  go(v) {
    if (!canSee(v)) return toast("You don't have access to that", true);
    S.view = v; closeDrawer(); render(); window.scrollTo(0, 0);
  },
  setLoc(l) { S.loc = l; closeDrawer(); render(); },
  openJob(id) { openJob(id).catch(fail); },
  closeModal() { $("modalHost").innerHTML = ""; },
  async signOut() { await sb.auth.signOut(); S.session = null; S.me = null; renderLogin(); },

  changePassword() {
    modal(`<h3>Change your password</h3><p class="mh">At least 8 characters.</p>
      <label>New password</label><input class="inp" id="pw1" type="password">
      <label>Repeat it</label><input class="inp" id="pw2" type="password">
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.savePassword()">Save</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>`);
  },
  async savePassword() {
    const a = $("pw1").value, b = $("pw2").value;
    if (a.length < 8) return toast("Too short — at least 8 characters", true);
    if (a !== b) return toast("The two passwords don't match", true);
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) return fail(error);
    A.closeModal(); toast("Password changed");
  },

  /* ---- the shoot slot ---- */
  setShoot(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
    const firm = thenStage ? slotNeeded(j, thenStage) === "firm" : j.stage_no >= ordOf("shoot_date_from");
    modal(`<h3>Shoot date &amp; time</h3>
      <p class="mh">${esc(j.client_name)} · ${esc(j.shoot_type)}${thenStage ? " — needed before " + esc(thenStage) : ""}</p>
      <label>When is the shoot?</label>
      <input class="inp" id="shootAt" type="datetime-local" value="${toLocalInput(j.shoot_at)}">
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveShoot(${id},${thenStage ? `'${esc(thenStage)}'` : "null"})">Save${thenStage ? " and move" : ""}</button>
        ${firm ? "" : `<button class="btn" onclick="A.markTBD(${id},${thenStage ? `'${esc(thenStage)}'` : "null"})">Client hasn't decided — TBD</button>`}
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      ${firm ? `<p class="hint">TBD is not accepted from ${esc(S.settings.shoot_date_from || "Pre-Production")} onward — the date has to be real.</p>` : ""}`);
  },
  async saveShoot(id, thenStage) {
    const v = $("shootAt").value;
    if (!v) return toast("Pick a date and time first", true);
    A.closeModal();
    const iso = new Date(v).toISOString();
    if (thenStage) {
      await patch(id, { shoot_at: iso, shoot_tbd: false, stage: thenStage }, "Scheduled and moved to " + thenStage);
    } else {
      await patch(id, { shoot_at: iso, shoot_tbd: false }, "Shoot set for " + fmtShoot(iso));
    }
  },
  async markTBD(id, thenStage) {
    A.closeModal();
    const f = { shoot_tbd: true, shoot_at: null };
    if (thenStage) f.stage = thenStage;
    await patch(id, f, thenStage ? "Marked TBD and moved to " + thenStage : "Marked TBD");
  },

  editContact(id) {
    const j = S.jobs.find(x => x.id === id);
    modal(`<h3>Contact details</h3><p class="mh">${esc(j.client_name)}</p>
      <label>Phone</label><input class="inp" id="ctPhone" type="tel" value="${esc(j.phone || "")}">
      <label>Email (optional)</label><input class="inp" id="ctEmail" type="email" value="${esc(j.email || "")}">
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveContact(${id})">Save</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>`);
  },
  async saveContact(id) {
    const phone = $("ctPhone").value.trim();
    const email = $("ctEmail").value.trim() || null;   // read before the modal closes
    if (!phone) return toast("A phone number is required", true);
    A.closeModal();
    await patch(id, { phone, email }, "Contact updated");
  },
  async setType(id, t) { await patch(id, { shoot_type: t }, "Shoot type set to " + t); },

  bookJob(id, to) {
    const j = S.jobs.find(x => x.id === id);
    modal(`<h3>Confirm the booking</h3>
      <p class="mh">${esc(j.client_name)} · ${esc(j.shoot_type)}</p>
      <div class="f2">
        <div><label>Package total</label>
          <input class="inp" id="bkVal" type="number" min="0" value="${num(j.package_value)}"></div>
        <div><label>Advance received</label>
          <input class="inp" id="bkAdv" type="number" min="1" value="${num(j.amount_received) || ""}" placeholder="required"></div>
      </div>
      <label style="margin-top:10px">Shoot date &amp; time</label>
      <input class="inp" id="bkAt" type="datetime-local" value="${toLocalInput(j.shoot_at)}">
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveBooking(${id},'${esc(to)}',false)">Book it</button>
        <button class="btn" onclick="A.saveBooking(${id},'${esc(to)}',true)">Book with date TBD</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">An advance is required to book. The date can be TBD for now, but must be confirmed
        before ${esc(S.settings.shoot_date_from || "Pre-Production")}.</p>`);
  },
  async saveBooking(id, to, tbd) {
    const total = parseFloat($("bkVal").value || "0") || 0;
    const adv = parseFloat($("bkAdv").value || "0") || 0;
    const at = $("bkAt").value;
    if (adv <= 0) return toast("Record the advance payment to book this job", true);
    if (total && adv > total) return toast("The advance cannot be more than the package total", true);
    if (!tbd && !at) return toast("Pick a date and time, or choose TBD", true);
    A.closeModal();
    const f = { stage: to, package_value: total, amount_received: adv };
    if (tbd) { f.shoot_tbd = true; f.shoot_at = null; }
    else { f.shoot_at = new Date(at).toISOString(); f.shoot_tbd = false; }
    await patch(id, f, "Booked" + (tbd ? " — date TBD" : " for " + fmtShoot(f.shoot_at)));
  },

  async moveTo(id, to, override) {
    if (!to) return;
    const j = S.jobs.find(x => x.id === id);
    const st = stageByName(to), bookedOrd = ordOf("booked_stage");
    const crossingIntoBooked = st && !st.is_parked && st.ordinal >= bookedOrd && j.stage_no < bookedOrd;
    if (crossingIntoBooked && (num(j.amount_received) <= 0 || (!j.shoot_at && !j.shoot_tbd)))
      return A.bookJob(id, to);
    if (slotNeeded(j, to)) return A.setShoot(id, to);
    if (to === S.settings.pay_gate_stage && bal(j) > 0 && !override)
      return toast("Blocked — " + rupee(bal(j)) + " still owed", true);
    await patch(id, { stage: to }, override
      ? "Overridden — delivered with " + rupee(bal(j)) + " owing" : "Moved to " + to);
    if (override) await sb.from("job_activity").insert({
      job_id: id, action: "payment override: delivered with " + rupee(bal(j)) + " owing", actor_id: S.me.id });
  },
  async recordPay(id, amt) {
    const j = S.jobs.find(x => x.id === id);
    let a = amt;
    if (a === undefined) { const el = $("payBox"); a = parseFloat((el && el.value) || "0"); }
    if (!a || a <= 0) return toast("Enter an amount first", true);
    a = Math.min(a, bal(j));
    await patch(id, { amount_received: num(j.amount_received) + a },
      bal(j) - a > 0 ? rupee(a) + " recorded · " + rupee(bal(j) - a) + " left" : "Fully paid");
  },
  editMoney(id) {
    const j = S.jobs.find(x => x.id === id);
    modal(`<h3>Package value</h3><p class="mh">${esc(j.client_name)}</p>
      <div class="f2">
        <div><label>Total</label><input class="inp" id="mv" type="number" min="0" value="${num(j.package_value)}"></div>
        <div><label>Received</label><input class="inp" id="mr" type="number" min="0" value="${num(j.amount_received)}"></div>
      </div>
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveMoney(${id})">Save</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>`);
  },
  async saveMoney(id) {
    const v = parseFloat($("mv").value || "0"), r = parseFloat($("mr").value || "0");
    if (r > v) return toast("Received cannot be more than the total", true);
    A.closeModal();
    await patch(id, { package_value: v, amount_received: r }, "Payment details updated");
  },
  async reassign(id, uid) { await patch(id, { owner_id: uid || null }, "Reassigned"); },
  async setJobLoc(id, l) { await patch(id, { location: l }, "Location set to " + l); },
  async toggleDeliv(id, kind) {
    const j = S.jobs.find(x => x.id === id);
    const st = S.stages.find(s => s.optional_for === kind);
    const f = kind === "video" ? "has_video" : "has_album";
    if (st && j.stage === st.name && j[f])
      return toast("Can't remove the " + kind + " while the job is in " + st.name, true);
    await patch(id, { [f]: !j[f] }, (!j[f] ? kind + " added" : "no " + kind + " — stage skipped"));
  },
  async ackViewOnly(id) { await patch(id, { view_only_ack: true }, "Logged: link set to view-only"); },
  async addNote(id) {
    const el = $("noteBox"), body = (el && el.value || "").trim();
    if (!body) return toast("Write something first", true);
    const { error } = await sb.from("job_notes").insert({ job_id: id, body, author_id: S.me.id });
    if (error) return fail(error);
    await sb.from("job_activity").insert({ job_id: id, action: "added a note", actor_id: S.me.id });
    await refresh("Note saved");
  },

  newJob() {
    modal(`<h3>New enquiry</h3><p class="mh">It starts at ${esc(flow()[0].name)}.</p>
      <label>Client name</label><input class="inp" id="njName" placeholder="e.g. Divya &amp; Karthik">
      <div class="f2" style="margin-top:9px">
        <div><label>Phone (required)</label><input class="inp" id="njPhone" type="tel" placeholder="98765 43210"></div>
        <div><label>Email (optional)</label><input class="inp" id="njEmail" type="email" placeholder="optional"></div>
      </div>
      <div class="f2" style="margin-top:9px">
        <div><label>Shoot type</label><select class="inp" id="njShoot">
          ${S.types.map(t => `<option>${esc(t)}</option>`).join("")}</select></div>
        <div><label>Location</label><select class="inp" id="njLoc">
          ${LOCATIONS.map(l => `<option>${esc(l)}</option>`).join("")}</select></div>
      </div>
      <div class="f2" style="margin-top:9px">
        <div><label>Where from</label><select class="inp" id="njSrc">
          ${SOURCES.map(s => `<option>${esc(s)}</option>`).join("")}</select></div>
        <div><label>Quote (optional)</label><input class="inp" id="njVal" type="number" min="0" placeholder="0"></div>
      </div>
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveJob()">Add enquiry</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>`);
  },
  async saveJob() {
    const name = $("njName").value.trim(), phone = $("njPhone").value.trim();
    if (!name) return toast("Give the client a name", true);
    if (!phone) return toast("A phone number is required", true);
    const { error } = await sb.from("jobs").insert({
      client_name: name, phone, email: $("njEmail").value.trim() || null,
      shoot_type: $("njShoot").value,
      location: $("njLoc").value, source: $("njSrc").value,
      stage: flow()[0].name, package_value: parseFloat($("njVal").value || "0") || 0,
      owner_id: S.me.id
    });
    if (error) return fail(error);
    A.closeModal();
    await refresh(name + " added");
  },

  async setSla(stage, v) {
    const days = Math.max(0, parseInt(v || "0", 10) || 0);
    const { error } = await sb.from("stages").update({ sla_days: days, sla_agreed: true }).eq("name", stage);
    if (error) return fail(error);
    await loadReference(); await refresh(stage + " SLA set to " + days + " days");
  },
  async setSetting(k, v) {
    const { error } = await sb.from("settings").update({ value: v }).eq("key", k);
    if (error) return fail(error);
    await loadReference(); await refresh("Updated");
  },
  async toggleAcc(pid, m) {
    const p = S.people.find(x => x.id === pid);
    if (p.is_admin) return;
    const has = p.access.includes(m);
    const { error } = await (has
      ? sb.from("profile_access").delete().eq("profile_id", pid).eq("module", m)
      : sb.from("profile_access").insert({ profile_id: pid, module: m }));
    if (error) return fail(error);
    await loadReference(); render();
    toast(p.full_name + ": " + accLabel(S.people.find(x => x.id === pid)));
  },
  async toggleAdmin(pid) {
    const p = S.people.find(x => x.id === pid);
    if (p.is_admin && S.people.filter(x => x.is_admin && x.active).length === 1)
      return toast("Keep at least one admin", true);
    const { error } = await sb.from("profiles").update({ is_admin: !p.is_admin }).eq("id", pid);
    if (error) return fail(error);
    if (!p.is_admin) {
      await sb.from("profile_access").delete().eq("profile_id", pid);
      await sb.from("profile_access").insert(ALLMODS.map(m => ({ profile_id: pid, module: m })));
    }
    await loadReference(); render(); toast(p.full_name + " is now " + (!p.is_admin ? "an admin" : "staff"));
  },
  async toggleActive(pid) {
    const p = S.people.find(x => x.id === pid);
    if (pid === S.me.id) return toast("You can't deactivate yourself", true);
    if (p.active && p.is_admin && S.people.filter(x => x.is_admin && x.active).length === 1)
      return toast("Keep at least one admin", true);
    const { error } = await sb.from("profiles").update({ active: !p.active }).eq("id", pid);
    if (error) return fail(error);
    await loadReference(); render(); toast(p.full_name + (p.active ? " deactivated" : " reactivated"));
  },
  async addMember() {
    const name = $("nmName").value.trim(), pass = $("nmPass").value;
    if (!name) return toast("Give them a name", true);
    if (pass.length < 8) return toast("Password needs at least 8 characters", true);
    const chips = [...document.querySelectorAll("#nmAcc .chip.on")];
    const { data, error } = await sb.functions.invoke("admin-users", {
      body: {
        action: "create", full_name: name, password: pass,
        is_admin: chips.some(c => c.dataset.admin),
        modules: chips.filter(c => c.dataset.m).map(c => c.dataset.m)
      }
    });
    if (error || (data && data.error)) return fail(error || new Error(data.error));
    await loadReference(); render();
    toast(name + " created — username " + (data && data.email));
  }
};
window.A = A;

async function patch(id, fields, msg) {
  if (S.busy) return;
  S.busy = true;
  const { error } = await sb.from("jobs").update(fields).eq("id", id);
  S.busy = false;
  if (error) return fail(error);
  await refresh(msg);
}
function modal(inner) {
  $("modalHost").innerHTML = `<div class="modal" onclick="if(event.target===this)A.closeModal()">
    <div class="modalbox">${inner}</div></div>`;
}

/* ------------------------------------------------------------ wire */
$("drawerClose").addEventListener("click", closeDrawer);
$("scrim").addEventListener("click", closeDrawer);
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeDrawer(); A.closeModal(); }
});
sb.auth.onAuthStateChange(event => {
  if (event === "SIGNED_OUT") { S.session = null; S.me = null; renderLogin(); }
});
boot();
