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
  session: null, me: null, stages: [], settings: {}, jobs: [], children: [],
  people: [], types: [], typeRows: [],
  view: "crm", loc: "All", openId: null, busy: false, archiveTab: "leads"
};

const MODLABEL = { crm: "Sales", prod: "Production", post: "Post Production",
                   del: "Delivery", life: "Marketing" };
const ALLMODS = ["crm", "prod", "post", "del", "life"];
const BOARDS = ["crm", "prod", "post", "del"];
const LOCATIONS = ["Coimbatore", "Bangalore - MDP", "Bangalore - JP Nagar", "Erode", "Others"];
const SOURCES = ["Instagram", "Website form", "Google search", "Referral", "Repeat client", "Walk-in", "Other"];
const ALBUM_SIZES = ["9 x 11", "10 x 10", "12 x 12"];
const FRAME_SIZES = ["8 x 12", "12 x 18", "16 x 24", "24 x 36"];
const VENUES = ["Studio", "Home", "Outdoor"];
/* work that runs in parallel becomes a child process with a life of its own */
const KINDS = [
  { key: "video", label: "Video", mark: "▶", module: "post",
    applies: j => !!j.has_video },
  { key: "album", label: "Album", mark: "▣", module: "del",
    applies: j => !!j.has_album },
  { key: "frame", label: "Frame", mark: "▢", module: "del",
    applies: j => !!j.frame_included }
];
const kindDef = k => KINDS.find(x => x.key === k);
/* which rows a board shows, in order */
const ROWS = {
  crm:  [{ main: true }],
  prod: [{ main: true }],
  post: [{ main: true }, { kind: "video" }],
  del:  [{ kind: "album" }, { kind: "frame" }, { main: true }]
};

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
const pad = n => String(n).padStart(2, "0");
/* the studio shoots between 8am and 6pm, on the half hour */
const TIME_SLOTS = (() => {
  const out = [];
  for (let m = 8 * 60; m <= 18 * 60; m += 30) {
    const h = Math.floor(m / 60), mi = m % 60;
    out.push({ v: pad(h) + ":" + pad(mi),
               label: (h % 12 === 0 ? 12 : h % 12) + ":" + pad(mi) + (h < 12 ? " am" : " pm") });
  }
  return out;
})();
const dateOf = iso => iso ? (d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)(new Date(iso)) : "";
const timeOf = iso => iso ? (d => pad(d.getHours()) + ":" + pad(d.getMinutes()))(new Date(iso)) : "";
/* a date box and a half-hour dropdown, used wherever a shoot is scheduled */
function slotPicker(prefix, iso) {
  const dv = dateOf(iso), tv = timeOf(iso);
  const odd = tv && !TIME_SLOTS.some(t => t.v === tv);
  return `<div class="f2">
    <div><label>Date</label>
      <input class="inp" id="${prefix}Date" type="date" value="${dv}"></div>
    <div><label>Time</label>
      <select class="inp" id="${prefix}Time">
        <option value="">Pick a time</option>
        ${TIME_SLOTS.map(t => `<option value="${t.v}" ${t.v === tv ? "selected" : ""}>${t.label}</option>`).join("")}
        ${odd ? `<option value="${tv}" selected>${tv} (already set)</option>` : ""}
      </select></div>
  </div>`;
}
function slotValue(prefix) {
  const d = $(prefix + "Date"), t = $(prefix + "Time");
  if (!d || !t || !d.value || !t.value) return "";
  return new Date(d.value + "T" + t.value).toISOString();
}

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
  m = m.replace(/^.*?(Set a shoot|A confirmed shoot|Record the advance|A phone number|Pick a shoot|Set the total|Fill in the delivery|Say what the video|Set the album|Set the frame|Email the terms|The total package|Say where the shoot|Enter how many files|Record the payment|A phone number must|Add the Pixieset|Enter how many files were edited|Enter the address|The video is still|The album is not|The frame is not|Not ready|The digital files|This package has no|A job can only move back|A booked shoot cannot|Paste the list of files|The client has not sent|These are not in|Your selection is already|This link is not|Pick at least one)/, "$1");   // database messages read fine as-is
  toast(m, true);
}

/* ------------------------------------------------- derived helpers */
const stageByName = n => S.stages.find(s => s.name === n);
/* the main line only — a child's steps live outside it */
const flow = () => S.stages.filter(s => !s.is_parked && !s.track).sort((a, b) => a.ordinal - b.ordinal);
const parkedStage = () => (S.stages.find(s => s.is_parked) || {}).name;
const modStages = k => S.stages.filter(s => (s.modules || []).includes(k) && !s.is_parked && !s.track)
  .sort((a, b) => a.ordinal - b.ordinal);
/* the steps of one process, in order */
const kindSteps = k => S.stages.filter(s => s.track === k).sort((a, b) => a.ordinal - b.ordinal);
const childrenOf = id => S.children.filter(c => c.job_id === id);
const childOf = (id, k) => S.children.find(c => c.job_id === id && c.kind === k);
const liveChildren = k => S.children.filter(c => c.state === "active" && c.kind === k &&
  inLoc(S.jobs.find(j => j.id === c.job_id) || {}));
function childNext(c) {
  const steps = kindSteps(c.kind).map(s => s.name);
  const i = steps.indexOf(c.stage);
  return i >= 0 && i + 1 < steps.length ? steps[i + 1] : null;
}
function childPrev(c) {
  const steps = kindSteps(c.kind).map(s => s.name);
  const i = steps.indexOf(c.stage);
  return i > 0 ? steps[i - 1] : null;
}
/* the last step of a process is where it waits to be picked up or archived */
const childAtEnd = c => !childNext(c);
const childBlocking = job => childrenOf(job.id).filter(c => c.state === "active" &&
  c.kind !== "video" && !childAtEnd(c));
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
const firstAllowed = () => ["dash", ...BOARDS, "life", "pay"].find(canSee) || "noaccess";

/* optional stages: the job only passes through if the package calls for it */
function appliesTo(job, st) {
  switch (st.optional_for) {
    case "video":  return !!job.has_video;
    case "album":  return !!job.has_album;
    case "frame":  return !!job.frame_included;
    case "pickup": return !!job.has_album || !!job.frame_included;
    default:       return true;
  }
}
const optionalNote = kind => ({
  video: "only packages with a video",
  album: "only packages with an album",
  frame: "only packages with a frame",
  pickup: "only jobs with an album or frame to collect"
}[kind] || "");
function nextStageFor(job) {
  const f = flow();
  let i = f.findIndex(s => s.name === job.stage);
  if (i < 0) return null;
  while (++i < f.length) if (appliesTo(job, f[i])) return f[i].name;
  return null;
}
/* two stages belong to the same pipeline if they share a module */
const sameModule = (a, b) => (a.modules || []).some(m => (b.modules || []).includes(m));
/* a job walks back only inside its own module - once it has crossed into the
   next one the door closes behind it */
function prevStageFor(job) {
  const f = flow();
  let i = f.findIndex(s => s.name === job.stage);
  if (i < 0) return null;
  const here = f[i];
  while (--i >= 0) if (appliesTo(job, f[i]))
    return sameModule(here, f[i]) ? f[i].name : null;
  return null;
}
const bal = j => Math.max(0, num(j.balance));
const owes = j => j.payment_status === "PENDING";
const locked = j => j.file_access === "VIEW-ONLY - downloads OFF";
const archived = j => !!j.is_parked;
const inLoc = j => S.loc === "All" || j.location === S.loc;
const pool = () => S.jobs.filter(j => inLoc(j) && !archived(j) && !j.archived_at);
const archivedJobs = () => S.jobs.filter(j => inLoc(j) && archived(j));
const doneJobs = () => S.jobs.filter(j => inLoc(j) && !!j.archived_at);
const archivedChildren = () => S.children.filter(c => c.state === "archived" && c.kind === "video");
const inMod = (j, k) => (j.stage_modules || []).includes(k);
const modLabel = j => (j.stage_modules || []).map(m => MODLABEL[m]).join(" + ") || "this module";
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
/* what is still missing from the price and the delivery list */
function packageGaps(job) {
  const g = [];
  if (num(job.package_value) <= 0) g.push("the total package value");
  if (num(job.edited_count) <= 0) g.push("how many edited photos are included");
  if (job.has_video && !String(job.video_notes || "").trim()) g.push("what the video covers");
  if (job.has_album && !String(job.album_size || "").trim()) g.push("the album size");
  if (job.has_album && num(job.album_sheets) <= 0) g.push("the number of album sheets");
  if (job.frame_included && !String(job.frame_size || "").trim()) g.push("the frame size");
  return g;
}
/* does this move need the package pinned down first? */
function packageNeeded(job, toStage) {
  const st = stageByName(toStage);
  if (!st || st.is_parked) return null;
  if (!(st.ordinal >= ordOf("terms_stage") && job.stage_no < ordOf("terms_stage"))) return null;
  const g = packageGaps(job);
  return g.length ? g : null;
}
/* a phone is either ten digits, or an overseas number that starts with + */
function phoneOk(p) {
  const s = String(p || "").replace(/[\s\-()]/g, "");
  return /^\+[0-9]{8,15}$/.test(s) || /^[0-9]{10}$/.test(s);
}
/* is this move crossing the stage named by that setting? */
function crossing(job, toStage, key) {
  const st = stageByName(toStage);
  if (!st || st.is_parked || st.track) return false;
  const o = ordOf(key);
  return st.ordinal >= o && job.stage_no < o;
}
const galleryLinkNeeded = (job, to) =>
  crossing(job, to, "selection_stage") && !String(job.gallery_link || "").trim();
function editInfoNeeded(job, to) {
  if (!crossing(job, to, "qc_stage")) return false;
  return num(job.photos_edited) <= 0 || !String(job.edited_link || "").trim();
}
/* the shoot's file list, and the files the client chose out of it */
const manifestOf = job => job.file_manifest || [];
const chosenOf = job => job.selection_files || [];
const selectionIn = job => !!job.selection_submitted_at && !job.selection_open;
const selectionOver = job => Math.max(0, chosenOf(job).length - num(job.edited_count));
/* a pasted list may be commas, new lines, or one long dictated line */
const parseFiles = t => String(t || "").split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
/* clients rarely type the extension, and case wanders */
const fileKey = f => String(f).toLowerCase().replace(/\.[a-z0-9]+$/, "");
/* match what was pasted against the shoot, and say what didn't land */
function matchFiles(job, names) {
  const list = manifestOf(job);
  if (!list.length) return { hits: names.slice(), missed: [] };
  const byKey = new Map(list.map(f => [fileKey(f), f]));
  const hits = [], missed = [];
  names.forEach(n => {
    const hit = byKey.get(fileKey(n));
    if (hit) { if (!hits.includes(hit)) hits.push(hit); } else missed.push(n);
  });
  return { hits, missed };
}
const selectionLink = job =>
  location.origin + "/select.html?t=" + encodeURIComponent(job.selection_token || "");
/* nothing gets edited until we know which files the client chose */
function selectionNeeded(job, toStage) {
  const st = stageByName(toStage);
  if (!st || st.is_parked || st.track) return false;
  const o = ordOf("selection_stage");
  return st.ordinal > o && job.stage_no <= o && !chosenOf(job).length;
}
/* a child process that has not finished, and is holding the job back */
function childBlocking2(job, toStage) {
  if (!crossing(job, toStage, "pickup_stage")) return null;
  const held = childBlocking(job);
  if (!held.length) return null;
  return held.map(c => kindDef(c.kind).label.toLowerCase() + " is still at " + c.stage).join(", ");
}
/* nothing physical has been started yet, but the package calls for it */
const physicalDue = job =>
  job.stage === (S.settings.digital_stage || "Digital Files Delivery") &&
  (job.has_album || job.frame_included) &&
  !childrenOf(job.id).some(c => c.kind === "album" || c.kind === "frame");
/* money owed, and this move would take the job past the point where that matters */
function payGateCrossed(job, toStage) {
  const gate = stageByName(S.settings.pay_gate_stage);
  if (!gate || gate.track) return false;        // the gate sits on a child process instead
  const st = stageByName(toStage);
  if (!st || st.is_parked || st.track || bal(job) <= 0) return false;
  return st.ordinal >= gate.ordinal && job.stage_no < gate.ordinal;
}
/* the same block, for a child step such as Album Printing */
const childPayGate = (job, toStep) =>
  toStep === S.settings.pay_gate_stage && bal(job) > 0;
/* what the photographer still owes the studio before the gallery goes out */
function handoverGaps(job) {
  const g = [];
  if (!String(job.backup_location || "").trim()) g.push("where the shoot was backed up");
  if (!manifestOf(job).length && num(job.files_shot) <= 0) g.push("the list of files from the shoot");
  if (bal(job) > 0) g.push("the payment collected at the shoot");
  return g;
}
function handoverNeeded(job, toStage) {
  const st = stageByName(toStage);
  if (!st || st.is_parked) return null;
  if (!(st.ordinal >= ordOf("gallery_stage") && job.stage_no < ordOf("gallery_stage"))) return null;
  const g = handoverGaps(job);
  return g.length ? g : null;
}
/* must the terms go out before this move? */
function termsNeeded(job, toStage) {
  const st = stageByName(toStage);
  if (!st || st.is_parked || job.terms_sent_at) return false;
  return st.ordinal >= ordOf("terms_stage") && job.stage_no < ordOf("terms_stage");
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
    sb.from("shoot_types").select("name,sort,brochure_url").order("sort")
  ]);
  for (const r of [st, se, pf, pa, ty]) if (r.error) throw r.error;
  S.typeRows = ty.data || [];
  S.types = S.typeRows.map(t => t.name);
  S.stages = st.data || [];
  S.settings = Object.fromEntries((se.data || []).map(r => [r.key, r.value]));
  S.people = (pf.data || []).map(p => ({
    ...p, access: (pa.data || []).filter(a => a.profile_id === p.id).map(a => a.module)
  }));
  S.me = S.people.find(p => p.id === S.session.user.id) || null;
}
async function loadJobs() {
  const [j, c] = await Promise.all([
    sb.from("v_jobs").select("*").order("stage_no").order("days_in_stage", { ascending: false }),
    sb.from("v_children").select("*").order("stage_no").order("days_in_stage", { ascending: false })
  ]);
  if (j.error) throw j.error;
  if (c.error) throw c.error;
  S.jobs = j.data || [];
  S.children = c.data || [];
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

/* --------------------------------------------------------- actions */
const A = {
  go(v) {
    if (!canSee(v)) return toast("You don't have access to that", true);
    S.view = v; closeDrawer(); render(); window.scrollTo(0, 0);
  },
  setLoc(l) { S.loc = l; closeDrawer(); render(); },
  archiveTab(t) { S.archiveTab = t; render(); },
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
      ${slotPicker("shoot", j.shoot_at)}
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveShoot(${id},${thenStage ? `'${esc(thenStage)}'` : "null"})">Save${thenStage ? " and move" : ""}</button>
        ${firm ? "" : `<button class="btn" onclick="A.markTBD(${id},${thenStage ? `'${esc(thenStage)}'` : "null"})">Client hasn't decided — TBD</button>`}
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      ${firm ? `<p class="hint">TBD is not accepted from ${esc(S.settings.shoot_date_from || "Pre-Production")} onward — the date has to be real.</p>` : ""}`);
  },
  async saveShoot(id, thenStage) {
    const iso = slotValue("shoot");
    if (!iso) return toast("Pick a date and a time first", true);
    A.closeModal();
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

  async previewEmail(id, thenStage) {
    const { data, error } = await sb.functions.invoke("send-package-email",
      { body: { job_id: id, preview: true } });
    if (error || (data && data.error)) return fail(error || new Error(data.error));
    modal(`<h3>Terms &amp; booking details</h3>
      <p class="mh">To <b>${esc(data.to)}</b></p>
      <div style="border:1px solid var(--line);border-radius:11px;overflow:hidden;background:#fff">
        <div style="background:var(--bg);padding:10px 13px;border-bottom:1px solid var(--line);font-size:12.5px">
          <b style="color:var(--ink-soft);font-weight:600;margin-right:6px">Subject</b>${esc(data.subject)}</div>
        <div style="padding:15px 16px;font-size:13px;line-height:1.6;max-height:320px;overflow-y:auto">${esc(data.text).replace(/\n/g, "<br>")}
          ${data.has_attachment ? `<p style="margin-top:16px">
            <span class="pill blue">📎 ${data.terms ? "terms" : ""}${data.terms && data.extra ? " + " : ""}${data.extra ? "package PDF" : ""} attached</span></p>` : ""}</div>
      </div>
      ${data.terms ? "" : `<p class="hint" style="color:var(--amber)">
        No terms document is set in Settings, so nothing will be attached.</p>`}
      <div class="acts" style="margin-top:16px">
        <button class="btn p" id="sendBtn" onclick="A.sendEmail(${id},${thenStage ? `'${esc(thenStage)}'` : "null"})">
          ${thenStage ? "Send and move to " + esc(thenStage) : "Send it"}</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">Edit the wording in Settings. It is sent from
        ${esc(data.sender || (S.settings.email_from || "").replace(/.*</, "").replace(/>.*/, "") || "the studio address")}.</p>`);
  },
  async sendEmail(id, thenStage) {
    const btn = $("sendBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    const { data, error } = await sb.functions.invoke("send-package-email",
      { body: { job_id: id, then_stage: thenStage || null } });
    if (error || (data && data.error)) {
      if (btn) { btn.disabled = false; btn.textContent = "Send it"; }
      return fail(error || new Error(data.error));
    }
    A.closeModal();
    /* the email can go out and the move still fail — never let that pass quietly */
    if (thenStage && !data.moved) {
      await refresh();
      return fail(new Error("Emailed " + data.to + ", but the job did not move to " +
        thenStage + (data.move_error ? ": " + data.move_error : ". Try the move again.")));
    }
    await refresh("Emailed " + data.to + (data.moved ? " · moved to " + data.stage : ""));
  },
  async setBrochure(name, url) {
    const { error } = await sb.from("shoot_types").update({ brochure_url: url.trim() || null }).eq("name", name);
    if (error) return fail(error);
    await loadReference(); render(); toast("Brochure updated for " + name);
  },

  editContact(id) {
    const j = S.jobs.find(x => x.id === id);
    modal(`<h3>Contact details</h3><p class="mh">${esc(j.client_name)}</p>
      <label>Phone</label><input class="inp" id="ctPhone" type="tel" value="${esc(j.phone || "")}"
        placeholder="10 digits, or +44… for overseas">
      <label>Email (optional)</label><input class="inp" id="ctEmail" type="email" value="${esc(j.email || "")}"
        placeholder="needed before the terms email can go out">
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveContact(${id})">Save</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>`);
  },
  async saveContact(id) {
    const phone = $("ctPhone").value.trim();
    const email = $("ctEmail").value.trim() || null;   // read before the modal closes
    if (!phone) return toast("A phone number is required", true);
    if (!phoneOk(phone)) return toast("10 digits, or start with + for an overseas number", true);
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
          <input class="inp" id="bkVal" type="number" min="1" value="${num(j.package_value) || ""}"></div>
        <div><label>Advance received</label>
          <input class="inp" id="bkAdv" type="number" min="1" value="${num(j.amount_received) || ""}" placeholder="required"></div>
      </div>
      <div style="margin-top:4px">${slotPicker("bk", j.shoot_at)}</div>
      <label style="margin-top:10px">Where is the shoot?</label>
      <select class="inp" id="bkVenue" onchange="A.venueSync()">
        ${VENUES.map(v => `<option ${v === (j.venue || "Studio") ? "selected" : ""}>${esc(v)}</option>`).join("")}
      </select>
      <div id="bkAddrBox" style="margin-top:8px">
        <label>Address</label>
        <input class="inp" id="bkAddr" value="${esc(j.venue_address || "")}"
          placeholder="where the team should turn up"></div>
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveBooking(${id},'${esc(to)}',false)">Book it</button>
        <button class="btn" onclick="A.saveBooking(${id},'${esc(to)}',true)">Book with date TBD</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">An advance is required to book. The date can be TBD for now, but must be confirmed
        before ${esc(S.settings.shoot_date_from || "Pre-Production")}.</p>`);
    A.venueSync();
  },
  venueSync() {
    const v = $("bkVenue"), box = $("bkAddrBox");
    if (v && box) box.style.display = v.value === "Studio" ? "none" : "";
  },
  async saveBooking(id, to, tbd) {
    const total = parseFloat($("bkVal").value || "0") || 0;
    const adv = parseFloat($("bkAdv").value || "0") || 0;
    const at = slotValue("bk");
    const venue = $("bkVenue").value;
    const addr = $("bkAddr").value.trim();
    if (total <= 0) return toast("The total package value is required", true);
    if (adv <= 0) return toast("Record the advance payment to book this job", true);
    if (adv > total) return toast("The advance cannot be more than the package total", true);
    if (!tbd && !at) return toast("Pick a date and a time, or choose TBD", true);
    if (venue !== "Studio" && !addr)
      return toast("Enter the address for a " + venue.toLowerCase() + " shoot", true);
    A.closeModal();
    const f = { stage: to, package_value: total, amount_received: adv,
                venue, venue_address: venue === "Studio" ? null : addr };
    if (tbd) { f.shoot_tbd = true; f.shoot_at = null; }
    else { f.shoot_at = at; f.shoot_tbd = false; }
    await patch(id, f, "Booked" + (tbd ? " — date TBD" : " for " + fmtShoot(f.shoot_at)));
  },

  async moveTo(id, to, override) {
    if (!to) return;
    const j = S.jobs.find(x => x.id === id);
    const st = stageByName(to), bookedOrd = ordOf("booked_stage");
    const crossingIntoBooked = st && !st.is_parked && st.ordinal >= bookedOrd && j.stage_no < bookedOrd;
    if (packageNeeded(j, to)) return A.editPackage(id, to);
    if (termsNeeded(j, to)) return A.previewEmail(id, to);
    if (crossingIntoBooked && (num(j.amount_received) <= 0 || (!j.shoot_at && !j.shoot_tbd)))
      return A.bookJob(id, to);
    if (slotNeeded(j, to)) return A.setShoot(id, to);
    if (handoverNeeded(j, to)) return A.handover(id, to);
    if (galleryLinkNeeded(j, to)) return A.setGallery(id, to);
    if (selectionNeeded(j, to)) return A.setSelection(id, to);
    if (editInfoNeeded(j, to)) return A.setEdit(id, to);
    /* the physical work hands the job over itself, and closes itself off.
       The database checks it is finished and says so if it is not. */
    if (to === (S.settings.pickup_stage || "Waiting for Client Pickup") &&
        childrenOf(id).some(c => c.state === "active" && c.kind !== "video"))
      return A.readyForPickup(id);
    const held = childBlocking2(j, to);
    if (held) return toast("Blocked — " + held, true);
    if (payGateCrossed(j, to) && !override)
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
  /* ---- the client's galleries ---- */
  setGallery(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
    modal(`<h3>Pixieset gallery</h3>
      <p class="mh">${esc(j.client_name)}${thenStage ? " — needed before " + esc(thenStage) : ""}</p>
      <label>Link the client selects from</label>
      <input class="inp" id="glLink" value="${esc(j.gallery_link || "")}"
        placeholder="https://littleshots.pixieset.com/…">
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveGallery(${id},${thenStage ? `'${esc(thenStage)}'` : "null"})">
          Save${thenStage ? " and move" : ""}</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">The client picks their photos here, so it has to be live before they are asked.</p>`);
  },
  async saveGallery(id, thenStage) {
    const link = $("glLink").value.trim();
    if (!link) return toast("Paste the Pixieset gallery link", true);
    A.closeModal();
    const f = { gallery_link: link };
    if (thenStage) f.stage = thenStage;
    await patch(id, f, thenStage ? "Gallery shared · moved to " + thenStage : "Gallery link saved");
  },

  setEdit(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
    modal(`<h3>Edited files</h3>
      <p class="mh">${esc(j.client_name)}${thenStage ? " — needed before " + esc(thenStage) : ""}</p>
      <label>How many files were edited?</label>
      <input class="inp" id="edCount" type="number" min="1"
        value="${num(j.photos_edited) || chosenOf(j).length || ""}"
        placeholder="${num(j.edited_count) ? num(j.edited_count) + " were promised" : "e.g. 80"}">
      <label style="margin-top:10px">Pixieset link for the edited files</label>
      <input class="inp" id="edLink" value="${esc(j.edited_link || "")}"
        placeholder="https://littleshots.pixieset.com/…">
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveEdit(${id},${thenStage ? `'${esc(thenStage)}'` : "null"})">
          Save${thenStage ? " and move" : ""}</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      ${num(j.edited_count) ? `<p class="hint">The package promises ${j.edited_count} edited photos.</p>` : ""}`);
  },
  async saveEdit(id, thenStage) {
    const n = parseInt($("edCount").value || "0", 10) || 0;
    const link = $("edLink").value.trim();
    if (n <= 0) return toast("Enter how many files were edited", true);
    if (!link) return toast("Paste the Pixieset link for the edited files", true);
    A.closeModal();
    const f = { photos_edited: n, edited_link: link };
    if (thenStage) f.stage = thenStage;
    await patch(id, f, thenStage ? n + " files · moved to " + thenStage : "Edited files recorded");
  },

  /* ---- the client's own selection ---- */
  async copySelectionLink(id) {
    const j = S.jobs.find(x => x.id === id);
    const msg = "Hi " + j.client_name + ", your gallery is ready. Please pick the photos you'd " +
      "like edited here and send them in when you're done:\n" + selectionLink(j);
    try {
      await navigator.clipboard.writeText(msg);
      toast("Message copied — paste it into the group");
    } catch (e) {
      A.showSelectionLink(id);
    }
  },
  showSelectionLink(id) {
    const j = S.jobs.find(x => x.id === id);
    modal(`<h3>The client's link</h3><p class="mh">${esc(j.client_name)}</p>
      <textarea style="min-height:90px" onclick="this.select()">${esc(selectionLink(j))}</textarea>
      <div class="acts" style="margin-top:16px">
        <button class="btn" onclick="A.closeModal()">Done</button></div>
      <p class="hint">Copy this into the WhatsApp group. It stops working once they send their picks.</p>`);
  },
  mailSelectionLink(id) {
    const j = S.jobs.find(x => x.id === id);
    const body = "Hi " + j.client_name + ",\n\nYour gallery is ready. Please pick the photos " +
      "you'd like edited here:\n\n" + selectionLink(j) +
      "\n\nYour package includes " + num(j.edited_count) + " edited photos." +
      "\n\nLittle Shots by Hema";
    location.href = "mailto:" + encodeURIComponent(j.email || "") +
      "?subject=" + encodeURIComponent("Choose your photos — " + j.shoot_type) +
      "&body=" + encodeURIComponent(body);
  },
  /* the client sent their picks some other way, or changed their mind on the phone */
  setSelection(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
    const held = manifestOf(j).length;
    modal(`<h3>The client's selection</h3>
      <p class="mh">${esc(j.client_name)}${thenStage ? " — needed before " + esc(thenStage) : ""}</p>
      <label>Which files did they choose?</label>
      <textarea id="selBox" style="min-height:130px"
        placeholder="IMG_1234, IMG_1240, IMG_1255…">${esc(chosenOf(j).join("\n"))}</textarea>
      <div id="selMsg"></div>
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveSelection(${id},${thenStage ? `'${esc(thenStage)}'` : "null"})">
          Save${thenStage ? " and move" : ""}</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">${held
        ? "Checked against the " + held + " files from the shoot, so a typo won't slip through."
        : "No file list was recorded for this shoot, so these are taken as typed."}
        The package promises ${num(j.edited_count)} edited photos.</p>`);
  },
  async saveSelection(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
    const names = parseFiles($("selBox").value);
    if (!names.length) return toast("Paste the files the client chose", true);
    const { hits, missed } = matchFiles(j, names);
    if (missed.length) {
      $("selMsg").innerHTML = `<div class="alert red" style="margin:11px 0 0">
        <b>${missed.length} of those aren't in this shoot:</b> ${esc(missed.slice(0, 10).join(", "))}${
        missed.length > 10 ? "…" : ""}. Fix them, or take them out.</div>`;
      return;
    }
    A.closeModal();
    const over = Math.max(0, hits.length - num(j.edited_count));
    const f = { selection_files: hits, selection_submitted_at: new Date().toISOString(),
                selection_open: false };
    if (thenStage) f.stage = thenStage;
    await patch(id, f, hits.length + " files recorded" +
      (over ? " · " + over + " over the package" : "") +
      (thenStage ? " · moved to " + thenStage : ""));
  },
  async reopenSelection(id) {
    const { data, error } = await sb.rpc("reopen_selection", { p_job: id });
    if (error) return fail(error);
    await refresh("Link reopened — back at " + (data || "the selection stage"));
  },

  /* ---- child processes ---- */
  async moveChild(childId, to, override) {
    const c = S.children.find(x => x.id === childId);
    if (!c) return;
    const j = S.jobs.find(x => x.id === c.job_id);
    const target = to || childNext(c);
    if (!target) return;
    if (c.kind === "video" && target === "Video QC" && !String(j.video_link || "").trim())
      return A.setVideoLink(childId, target);
    if (childPayGate(j, target) && !override)
      return toast("Blocked — " + rupee(bal(j)) + " still owed before " + target, true);
    await patchChild(childId, { stage: target },
      kindDef(c.kind).label + " · " + target);
    if (override) await sb.from("job_activity").insert({
      job_id: c.job_id, action: "payment override: " + c.kind + " sent to " + target +
        " with " + rupee(bal(j)) + " owing", actor_id: S.me.id });
  },
  async assignChild(childId, uid) {
    await patchChild(childId, { owner_id: uid || null }, "Reassigned");
  },
  async startPhysical(id) {
    const { data, error } = await sb.rpc("start_physical_work", { p_job: id });
    if (error) return fail(error);
    await refresh("Started the " + (data || "physical work"));
  },
  async readyForPickup(id) {
    const { data, error } = await sb.rpc("ready_for_pickup", { p_job: id });
    if (error) return fail(error);
    await refresh("Moved to " + (data || "pickup"));
  },
  async restoreVideo(id) {
    const { data, error } = await sb.rpc("restore_video", { p_job: id });
    if (error) return fail(error);
    await refresh("Video back at " + (data || "Video Editing"));
  },
  setVideoLink(childId, thenStep) {
    const c = S.children.find(x => x.id === childId);
    const j = S.jobs.find(x => x.id === c.job_id);
    modal(`<h3>Edited video</h3>
      <p class="mh">${esc(j.client_name)}${thenStep ? " — needed before " + esc(thenStep) : ""}</p>
      <label>Pixieset link for the edited video</label>
      <input class="inp" id="vdLink" value="${esc(j.video_link || "")}"
        placeholder="https://littleshots.pixieset.com/…">
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveVideoLink(${childId},${thenStep ? `'${esc(thenStep)}'` : "null"})">
          Save${thenStep ? " and move" : ""}</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>`);
  },
  async saveVideoLink(childId, thenStep) {
    const c = S.children.find(x => x.id === childId);
    const link = $("vdLink").value.trim();
    if (!link) return toast("Paste the Pixieset link for the video", true);
    A.closeModal();
    const { error } = await sb.from("jobs").update({ video_link: link }).eq("id", c.job_id);
    if (error) return fail(error);
    /* the link is on the job now, so move the child directly rather than
       bouncing back through moveChild, which would still see the old copy */
    if (thenStep) return patchChild(childId, { stage: thenStep }, "Video · " + thenStep);
    await refresh("Video link saved");
  },

  /* ---- handing the shoot over to the studio ---- */
  handover(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
    const b = bal(j);
    modal(`<h3>Shoot handover</h3>
      <p class="mh">${esc(j.client_name)} · ${esc(j.shoot_type)}${thenStage
        ? " — needed before " + esc(thenStage) : ""}</p>
      <label>Where is the backup?</label>
      <input class="inp" id="hoBackup" value="${esc(j.backup_location || "")}"
        placeholder="e.g. Studio HDD 3 + Google Drive">
      <label style="margin-top:10px">Paste the file names from the shoot</label>
      <textarea id="hoList" style="min-height:110px" oninput="A.hoCount()"
        placeholder="IMG_1001.jpg, IMG_1002.jpg, IMG_1003.jpg&#10;— straight out of Finder, Explorer or Lightroom">${esc(manifestOf(j).join("\n"))}</textarea>
      <p class="hint" id="hoTally" style="margin-top:6px"></p>
      <div id="hoCountBox" style="margin-top:10px">
        <label>… or just how many were taken</label>
        <input class="inp" id="hoFiles" type="number" min="1" value="${num(j.files_shot) || ""}"
          placeholder="e.g. 840">
      </div>
      ${thenStage ? (b > 0
        ? `<label style="margin-top:10px">Payment collected (required)</label>
           <input class="inp" id="hoPay" type="number" min="1" max="${b}" placeholder="${rupee(b)} outstanding">
           <p class="hint" style="margin-top:6px">${rupee(j.amount_received)} received so far of
             ${rupee(j.package_value)}. The balance can stay outstanding — printing is blocked at
             ${esc(S.settings.pay_gate_stage || "Album Printing")}.</p>`
        : `<div class="alert green" style="margin-top:12px"><b>Fully paid.</b> Nothing to collect.</div>`) : ""}
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveHandover(${id},${thenStage ? `'${esc(thenStage)}'` : "null"})">
          Save${thenStage ? " and move" : ""}</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">The file names are what the client picks from, so paste them if you can —
        a bare count still works, but then nothing they send can be checked.</p>`);
    A.hoCount();
  },
  /* the pasted list speaks for how many files were taken */
  hoCount() {
    const box = $("hoList"), tally = $("hoTally"), countBox = $("hoCountBox");
    if (!box || !tally) return;
    const n = parseFiles(box.value).length;
    tally.textContent = n ? n + " file" + (n === 1 ? "" : "s") + " pasted" : "";
    if (countBox) countBox.style.display = n ? "none" : "";
  },
  async saveHandover(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
    const backup = $("hoBackup").value.trim();
    const manifest = parseFiles($("hoList").value);
    const files = manifest.length || (parseInt($("hoFiles").value || "0", 10) || 0);
    const payEl = $("hoPay");
    const pay = payEl ? (parseFloat(payEl.value || "0") || 0) : 0;
    const b = bal(j);

    if (!backup) return toast("Say where the shoot was backed up", true);
    if (files <= 0) return toast("Paste the file names, or enter how many were taken", true);
    if (thenStage && b > 0) {
      if (pay <= 0) return toast("Record the payment collected at the shoot", true);
      if (pay > b) return toast("That is more than the " + rupee(b) + " outstanding", true);
    }
    A.closeModal();
    const f = { backup_location: backup, files_shot: files, file_manifest: manifest };
    if (thenStage) f.stage = thenStage;
    if (pay > 0) f.amount_received = num(j.amount_received) + pay;
    await patch(id, f, thenStage
      ? "Handed over" + (pay > 0 ? " · " + rupee(pay) + " recorded" : "") + " · moved to " + thenStage
      : "Shoot handover updated");
  },

  /* ---- the price and exactly what the client is getting ---- */
  editPackage(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
    modal(`<h3>Package &amp; delivery details</h3>
      <p class="mh">${esc(j.client_name)} · ${esc(j.shoot_type)}${thenStage
        ? " — needed before " + esc(thenStage) : ""}</p>
      <label>Total package value (required)</label>
      <input class="inp" id="pkVal" type="number" min="1" value="${num(j.package_value) || ""}" placeholder="e.g. 25000">

      <div class="sec" style="border:0;padding:14px 0 0"><h5>What the client gets</h5>

      <div class="f2">
        <div><label>Edited photos (required)</label>
          <input class="inp" id="pkEd" type="number" min="1" value="${num(j.edited_count) || ""}" placeholder="e.g. 60"></div>
        <div><label>Unedited photos</label>
          <label class="chk"><input type="checkbox" id="pkUn" ${j.unedited_included ? "checked" : ""}>
            Unedited / raw photos included</label></div>
      </div>

      <label class="chk" style="margin-top:12px"><input type="checkbox" id="pkVid"
        onchange="A.pkSync()" ${j.has_video ? "checked" : ""}> Video included</label>
      <div id="pkVidBox" style="margin-top:6px">
        <input class="inp" id="pkVnote" value="${esc(j.video_notes || "")}"
          placeholder="What the video covers — e.g. 3 min highlight reel, teaser for reels">
      </div>

      <label class="chk" style="margin-top:12px"><input type="checkbox" id="pkAlb"
        onchange="A.pkSync()" ${j.has_album ? "checked" : ""}> Album included</label>
      <div id="pkAlbBox" class="f2" style="margin-top:6px">
        <div><label>Album size</label>${sizeSelect("pkAlbSize", j.album_size, ALBUM_SIZES)}
          <div id="pkAlbOtherWrap" style="margin-top:6px">
            <input class="inp" id="pkAlbOther" placeholder="Type the size"
              value="${esc(ALBUM_SIZES.includes(j.album_size) ? "" : (j.album_size || ""))}"></div></div>
        <div><label>Number of sheets</label>
          <input class="inp" id="pkSheets" type="number" min="1" value="${num(j.album_sheets) || ""}" placeholder="e.g. 20"></div>
      </div>

      <label class="chk" style="margin-top:12px"><input type="checkbox" id="pkFr"
        onchange="A.pkSync()" ${j.frame_included ? "checked" : ""}> Frame included</label>
      <div id="pkFrBox" style="margin-top:6px">
        <label>Frame size</label>${sizeSelect("pkFrSize", j.frame_size, FRAME_SIZES)}
        <div id="pkFrOtherWrap" style="margin-top:6px">
          <input class="inp" id="pkFrOther" placeholder="Type the size"
            value="${esc(FRAME_SIZES.includes(j.frame_size) ? "" : (j.frame_size || ""))}"></div>
      </div></div>

      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.savePackage(${id},${thenStage ? `'${esc(thenStage)}'` : "null"})">
          Save${thenStage ? " and continue" : ""}</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">This is what goes into the terms email, so it has to be right before
        the payment link is shared. A video, album or frame each become a process of their own.</p>`);
    A.pkSync();
  },
  pkSync() {
    const show = (id, on) => { const e = $(id); if (e) e.style.display = on ? "" : "none"; };
    const on = id => { const e = $(id); return !!(e && e.checked); };
    const val = id => { const e = $(id); return e ? e.value : ""; };
    show("pkVidBox", on("pkVid"));
    show("pkAlbBox", on("pkAlb"));
    show("pkFrBox", on("pkFr"));
    show("pkAlbOtherWrap", on("pkAlb") && val("pkAlbSize") === "Others");
    show("pkFrOtherWrap", on("pkFr") && val("pkFrSize") === "Others");
  },
  async savePackage(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
    const v = parseFloat($("pkVal").value || "0") || 0;
    const ed = parseInt($("pkEd").value || "0", 10) || 0;
    const un = $("pkUn").checked;
    const vid = $("pkVid").checked, vnote = $("pkVnote").value.trim();
    const alb = $("pkAlb").checked, sheets = parseInt($("pkSheets").value || "0", 10) || 0;
    const asize = sizeValue("pkAlbSize", "pkAlbOther");
    const fr = $("pkFr").checked, fsize = sizeValue("pkFrSize", "pkFrOther");

    if (v <= 0) return toast("The total package value is required", true);
    if (num(j.amount_received) > v) return toast("They have already paid more than that total", true);
    if (ed <= 0) return toast("How many edited photos are included?", true);
    if (vid && !vnote) return toast("Say what the video covers", true);
    if (alb && !asize) return toast("Pick the album size", true);
    if (alb && sheets <= 0) return toast("How many sheets in the album?", true);
    if (fr && !fsize) return toast("Pick the frame size", true);
    /* a process that is already under way cannot simply be taken off the job */
    for (const [on, key] of [[vid, "video"], [alb, "album"], [fr, "frame"]]) {
      const c = childOf(id, key);
      if (!on && c && c.state === "active")
        return toast("Can't remove the " + key + " — its process is already at " + c.stage, true);
    }

    A.closeModal();
    await patch(id, {
      package_value: v, edited_count: ed, unedited_included: un,
      has_video: vid, video_notes: vid ? vnote : null,
      has_album: alb, album_size: alb ? asize : null, album_sheets: alb ? sheets : null,
      frame_included: fr, frame_size: fr ? fsize : null
    }, "Package details saved");
    if (thenStage) await A.moveTo(id, thenStage);
  },
  async reassign(id, uid) { await patch(id, { owner_id: uid || null }, "Reassigned"); },
  async setJobLoc(id, l) { await patch(id, { location: l }, "Location set to " + l); },
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
        <div><label>Phone (required)</label><input class="inp" id="njPhone" type="tel" placeholder="10 digits, or +44…"></div>
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
    if (!phoneOk(phone)) return toast("10 digits, or start with + for an overseas number", true);
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
/* a size dropdown with the studio's standard sizes plus Others */
function sizeSelect(id, current, list) {
  const other = !!(current && !list.includes(current));
  return `<select class="inp" id="${id}" onchange="A.pkSync()">
    <option value="">Pick a size</option>
    ${list.map(s => `<option ${s === current ? "selected" : ""}>${esc(s)}</option>`).join("")}
    <option ${other ? "selected" : ""}>Others</option></select>`;
}
function sizeValue(selId, otherId) {
  const sel = $(selId), oth = $(otherId);
  const v = sel ? sel.value : "";
  return v === "Others" ? ((oth && oth.value) || "").trim() : v;
}
async function patchChild(id, fields, msg) {
  if (S.busy) return;
  S.busy = true;
  const { error } = await sb.from("job_children").update(fields).eq("id", id);
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
