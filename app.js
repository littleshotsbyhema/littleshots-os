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
  people: [], types: [], typeRows: [], payments: [],
  view: "crm", loc: "All", openId: null, busy: false, archiveTab: "leads"
};

const MODLABEL = { crm: "Sales", prod: "Production", post: "Post Production",
                   print: "Print Production", del: "Delivery", life: "Marketing" };
const ALLMODS = ["crm", "prod", "post", "print", "del", "life"];
const BOARDS = ["crm", "prod", "post", "print", "del"];
const LOCATIONS = ["Coimbatore", "Bangalore - MDP", "Bangalore - JP Nagar", "Erode", "Others"];
const SOURCES = ["Instagram", "Website form", "Google search", "Referral", "Repeat client", "Walk-in", "Other"];
const ALBUM_SIZES = ["9 x 11", "10 x 10", "12 x 12"];
const FRAME_SIZES = ["8 x 12", "12 x 18", "16 x 24", "24 x 36"];
const VENUES = ["Studio", "Home", "Outdoor"];
/* How the money arrived. Everything but cash leaves a screenshot behind, and
   UPI leads the list so the evidence field is in front of you by default —
   choosing Cash becomes a deliberate act rather than an accident. */
const PAY_METHODS = ["UPI", "Cash", "Bank transfer", "Card", "Cheque"];
const needsProof = m => m !== "Cash";
/* work that runs in parallel becomes a child process with a life of its own */
const KINDS = [
  { key: "video", label: "Video", mark: "\u25b6", module: "post",
    applies: j => !!j.has_video },
  { key: "album", label: "Album", mark: "\u25a3", module: "print",
    applies: j => !!j.has_album },
  { key: "frame", label: "Frame", mark: "\u25a2", module: "print",
    applies: j => !!j.frame_included }
];
const kindDef = k => KINDS.find(x => x.key === k);
/* which rows a board shows, in order */
const ROWS = {
  crm:  [{ main: true }],
  prod: [{ main: true }],
  post: [{ main: true }, { kind: "video" }],
  print: [{ main: true }, { kind: "album" }, { kind: "frame" }],
  del:  [{ main: true }]
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
  m = m.replace(/^.*?(Set a shoot|A confirmed shoot|Record the advance|A phone number|Pick a shoot|Set the total|Fill in the delivery|Say what the video|Set the album|Set the frame|Email the terms|The total package|Say where the shoot|Enter how many files|Record the payment|A phone number must|Add the Pixieset|Enter how many files were edited|Enter the address|The video is still|The album is not|The frame is not|Not ready|The digital files|This package has no|A job can only move back|A booked shoot cannot|Paste the list of files|The client has not sent|These are not in|Your selection is already|This link is not|Pick at least one|Add the client email|A payment cannot be dated|A UPI payment|A Card payment|A Cheque payment|A Bank transfer payment|Their selection is already|Review the shoot|Write up what the shoot|This job is not waiting|Name the Production Head|Record what was discussed|Say whether these photos|Say whether this video)/, "$1");   // database messages read fine as-is
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
  if (v === "crm-chase") return myMods().includes("crm");
  if (v === "pay" || v === "archive") return myMods().some(m => m !== "life");
  /* whoever looks after delivery is who clears the drives */
  if (v === "files") return myMods().some(m => m === "del" || m === "print");
  /* posting is marketing's job, but post-production picks what is worth it */
  if (v === "social") return myMods().some(m => m === "life" || m === "post");
  if (v === "dash" || v === "sla" || v === "team") return false;
  return true;
}
const firstAllowed = () => ["dash", ...BOARDS, "life", "social", "pay", "files"].find(canSee) || "noaccess";

/* ---- what the studio still owes its own feed ---- */
/* Three kinds of material come off one shoot. Each is listed on its own and
   ticked off on its own, so a job can be half-posted. */
const POST_KINDS = [
  { key: "bts", label: "BTS", stamp: "posted_bts_at",
    link: j => j.bts_backup_link,
    /* whatever the photographer handed over on the day is fair game */
    wanted: j => !!String(j.bts_backup_link || "").trim() },
  { key: "video", label: "Video", stamp: "posted_video_at",
    link: j => j.video_link,
    wanted: j => j.post_video === true },
  { key: "photos", label: "Photos", stamp: "posted_photos_at",
    link: j => j.edited_link,
    wanted: j => j.post_photos === true }
];
const postKind = k => POST_KINDS.find(x => x.key === k);
const toPost = () => {
  const out = [];
  S.jobs.filter(j => inLoc(j) && !archived(j)).forEach(j =>
    POST_KINDS.forEach(k => {
      if (k.wanted(j) && !j[k.stamp]) out.push({ job: j, kind: k });
    }));
  return out.sort((a, b) =>
    String(a.job.shoot_at || "").localeCompare(String(b.job.shoot_at || "")) ||
    String(a.job.client_name || "").localeCompare(String(b.job.client_name || "")));
};

/* ---- files waiting to come off the studio's drives ---- */
const RETENTION_DAYS = () => num(S.settings.retention_days) || 90;
/* the clock starts when the client is first told their order is ready */
const onDeathRow = j => !!j.retention_started_at && !j.files_deleted_at;
const deleteList = () => S.jobs.filter(j => inLoc(j) && onDeathRow(j))
  .sort((a, b) => num(a.days_to_delete) - num(b.days_to_delete) ||
    String(a.client_name || "").localeCompare(String(b.client_name || "")));
const dueToDelete = () => deleteList().filter(j => num(j.days_to_delete) <= 0);

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
/* amount_due is what anyone should actually chase: the balance normally, and
   nothing at all on a collaboration. Every money gate reads through here, so
   marking a job a collaboration lifts all of them at once. */
const bal = j => Math.max(0, num(j.amount_due != null ? j.amount_due : j.balance));
const collab = j => j.is_collab === true;
const owes = j => j.payment_status === "PENDING";
const locked = j => j.file_access === "VIEW-ONLY - downloads OFF";
const archived = j => !!j.is_parked;
const inLoc = j => S.loc === "All" || j.location === S.loc;
const pool = () => S.jobs.filter(j =>
  inLoc(j) && !archived(j) && !j.archived_at && matchesSearch(j));

/* ---- chasing leads ---- */
/* a lead Sales still has to chase; past Booked nobody is chasing anything */
const isSales = j => (j.stage_modules || []).includes("crm") && !j.is_parked;
const chaseState = j => j.followup_state || "n/a";
const chaseDue = j => isSales(j) && ["Today", "Overdue"].includes(chaseState(j));
const chaseList = () => S.jobs.filter(j => inLoc(j) && chaseDue(j))
  .sort((a, b) => num(a.days_to_followup) - num(b.days_to_followup));
const archiveReasons = () => String(S.settings.archive_reasons || "")
  .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
/* the stages a lead is allowed to move to, mirroring what the database enforces */
const SALES_MOVES = {
  "Package Sent": ["Cold Leads", "Hot Leads", "Archive"],
  "Cold Leads": ["Hot Leads", "Archive"],
  "Hot Leads": ["Payment Link Shared", "Cold Leads", "Archive"],
  "Payment Link Shared": ["Booked", "Archive"]
};
/* one box: digits look for a phone number, letters for a name */
function matchesSearch(j) {
  const q = String(S.q || "").trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3)
    return String(j.phone || "").replace(/\D/g, "").includes(digits);
  return String(j.client_name || "").toLowerCase().includes(q);
}
const archivedJobs = () => S.jobs.filter(j => inLoc(j) && archived(j));
const doneJobs = () => S.jobs.filter(j => inLoc(j) && !!j.archived_at);
const archivedChildren = () => S.children.filter(c => c.state === "archived" && c.kind === "video");
const inMod = (j, k) => (j.stage_modules || []).includes(k);
const modLabel = j => (j.stage_modules || []).map(m => MODLABEL[m]).join(" + ") || "this module";
/* Print Production has no main-line stage of its own — its work is all albums
   and frames, so its counts come off the children rather than the jobs. */
const childrenInMod = k => (S.children || []).filter(c => c.state === "active" &&
  (!k || (c.stage_modules || []).includes(k)));
const modCount = k => pool().filter(j => inMod(j, k)).length + childrenInMod(k).length;
const breaches = k => pool().filter(j => j.sla_status === "OVERDUE" && (!k || inMod(j, k)))
  .concat(childrenInMod(k).filter(c => c.sla_status === "OVERDUE"));
const dueToday = k => pool().filter(j => j.sla_status === "Due today" && (!k || inMod(j, k)))
  .concat(childrenInMod(k).filter(c => c.sla_status === "Due today"));
/* money follows the job, and a job with an album on the press belongs to that
   board too even though its own stage sits elsewhere */
const onBoard = (j, k) => !k || inMod(j, k) ||
  (S.children || []).some(c => c.job_id === j.id && c.state === "active" &&
    (c.stage_modules || []).includes(k));
const owing = k => pool().filter(j => owes(j) && onBoard(j, k));
const owedTotal = k => owing(k).reduce((a, j) => a + bal(j), 0);
const lockedList = k => pool().filter(j => locked(j) && onBoard(j, k));
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
/* The unedited gallery goes out as the shoot goes into QC, not a stage later:
   the client can start choosing while the studio checks the shoot over. */
const galleryLinkNeeded = (job, to) =>
  crossing(job, to, "gallery_link_stage") && !String(job.gallery_link || "").trim();
/* and the shoot itself is reviewed in QC, before anyone starts editing */
const QC_VERDICTS = () => String(S.settings.shoot_qc_verdicts ||
  "Good,Needs attention,Reshoot needed").split(",").map(s => s.trim()).filter(Boolean);
const shootQcDone = job => !!String(job.shoot_qc_verdict || "").trim() &&
  !!String(job.shoot_qc_notes || "").trim() && !!job.shoot_qc_head &&
  !!String(job.shoot_qc_discussion || "").trim();
const shootQcNeeded = (job, to) =>
  crossing(job, to, "selection_stage") && !shootQcDone(job);
function editInfoNeeded(job, to) {
  if (!crossing(job, to, "qc_stage")) return false;
  return num(job.photos_edited) <= 0 || !String(job.edited_link || "").trim();
}
/* Handing the files over is where the client gets asked to sign them off.
   Already signed off, or already asked, and we do not ask twice. */
const editsApprovalNeeded = (job, to) =>
  crossing(job, to, "digital_stage") && !!String(job.email || "").trim() &&
  !job.edits_approved_at && job.pending_approval !== "edits";
/* prep starts at this stage, and it needs a named photographer and stylist */
const crewNeeded = (job, to) =>
  crossing(job, to, "preprod_stage") && (!job.photographer_id || !job.stylist_id);
/* every email preview in the app looks like this — subject bar, body below */
const emailBox = d =>
  `<div style="border:1px solid var(--line);border-radius:11px;overflow:hidden;background:#fff">
    <div style="background:var(--bg);padding:10px 13px;border-bottom:1px solid var(--line);font-size:12.5px">
      <b style="color:var(--ink-soft);font-weight:600;margin-right:6px">Subject</b>${esc(d.subject)}</div>
    <div style="padding:15px 16px;font-size:13px;line-height:1.6;max-height:320px;overflow-y:auto">${
      esc(d.text).replace(/\n/g, "<br>")}</div>
  </div>`;
/* the terms go out by email, so the address comes before anything else */
function emailNeeded(job, toStage) {
  const st = stageByName(toStage);
  if (!st || st.is_parked || st.track) return false;
  const o = ordOf("terms_stage");
  return st.ordinal >= o && job.stage_no < o && !String(job.email || "").trim();
}
/* money the job claims, against money with a record behind it */
const recorded = j => num(j.recorded_payments);
const payGap = j => Math.max(0, num(j.amount_received) - recorded(j));
/* a phone screenshot is several megabytes of nothing — send a sensible one */
async function shrinkImage(file, max = 1600, quality = 0.82) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return file;   // leave HEIC and PDF alone
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size < file.size) return new File([blob], "proof.jpg", { type: "image/jpeg" });
  } catch (e) { /* an image we can't decode still uploads as it is */ }
  return file;
}
async function uploadProof(jobId, file) {
  const small = await shrinkImage(file);
  const ext = (small.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  const path = "job-" + jobId + "/" + Date.now() + "-" +
    Math.random().toString(36).slice(2, 8) + "." + (ext || "jpg");
  const { error } = await sb.storage.from("payment-proofs")
    .upload(path, small, { contentType: small.type || "image/jpeg" });
  if (error) throw error;
  return path;
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
/* match what was pasted against the shoot, when we happen to hold a list */
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
  job.stage_no >= ordOf("digital_stage") && job.stage_no < ordOf("pickup_stage") &&
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
/* The shoot debrief: everything the studio needs off the photographer's hands
   on the day, before the job becomes someone else's problem. Asked once, as
   the shoot is marked complete, because by tomorrow nobody remembers which
   drive it went on or what the client said about the gowns. */
const SATISFACTION = () => String(S.settings.satisfaction_levels ||
  "Very happy,Happy,Neutral,Unhappy,Very unhappy").split(",").map(s => s.trim()).filter(Boolean);

function handoverGaps(job) {
  const g = [];
  if (!String(job.backup_location || "").trim()) g.push("where the shoot was backed up");
  if (num(job.files_shot) <= 0) g.push("how many files were taken");
  if (!job.shoot_photographer_id) g.push("which photographer shot it");
  if (!job.shoot_stylist_id) g.push("which stylist worked it");
  if (job.has_video) {
    if (!job.shoot_videographer_id) g.push("who shot the video");
    if (num(job.video_files) <= 0) g.push("how many video files there are");
    if (!String(job.video_backup_link || "").trim()) g.push("the video backup link");
  }
  if (!String(job.client_satisfaction || "").trim()) g.push("how happy the client was");
  if (job.upsold && !String(job.upsell_notes || "").trim()) g.push("what was upsold");
  if (job.upsold && num(job.upsell_amount) <= 0) g.push("the upsell amount");
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
    sb.from("shoot_types").select("name,sort,brochure_url,terms_url,guide_url,prep_kind").order("sort")
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
/* which pre-production list this job uses, if any */
const prepKindFor = j => {
  if (!j) return null;
  const t = (S.typeRows || []).find(x => x.name === j.shoot_type);
  return (t && t.prep_kind) || null;
};
/* the template joined to whatever has been answered for this job */
async function loadPrep(jobId, kind) {
  const [t, a] = await Promise.all([
    sb.from("prep_templates").select("*").eq("kind", kind).eq("active", true).order("sno"),
    sb.from("job_prep").select("*").eq("job_id", jobId)
  ]);
  if (t.error) throw t.error;
  if (a.error) throw a.error;
  const byId = {};
  (a.data || []).forEach(r => { byId[r.template_id] = r; });
  S.prep = (t.data || []).map(row => ({ ...row, template_id: row.id, answer: byId[row.id] || null }));
}
const prepDone = r => r.answer && (r.answer.state === "done" || r.answer.state === "na");
/* asked of the database, so the count is right whether or not the sheet is open */
async function prepLeft(jobId, phase) {
  const { data, error } = await sb.rpc("prep_progress", { p_job: jobId, p_phase: phase });
  if (error) return 0;
  const r = Array.isArray(data) ? data[0] : data;
  return r ? Math.max(0, num(r.total) - num(r.answered)) : 0;
}
function prepCounts(phase) {
  const list = (S.prep || []).filter(r => r.phase === phase);
  return { total: list.length, done: list.filter(prepDone).length };
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

  /* ---- who is shooting it ---- */
  /* Asked when prep starts, because the checklist is work for named people.
     Deliberately separate from the owner: whoever runs the job through the
     system is often not the one behind the camera. */
  setCrew(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
    const team = S.people.filter(p => p.active);
    const pick = (sel, chosen) => `<select class="inp" id="${sel}">
      <option value="">— not assigned —</option>
      ${team.map(p => `<option value="${esc(p.id)}" ${p.id === chosen ? "selected" : ""}>
        ${esc(p.full_name)}</option>`).join("")}</select>`;
    modal(`<h3>Who is on this shoot?</h3>
      <p class="mh">${esc(j.client_name)} · ${esc(j.shoot_type)}${thenStage
        ? " — needed before " + esc(thenStage) : ""}</p>
      <label>Photographer</label>${pick("cwPhot", j.photographer_id)}
      <label style="margin-top:10px">Stylist</label>${pick("cwSty", j.stylist_id)}
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveCrew(${id},${thenStage ? `'${esc(thenStage)}'` : "null"})">
          Save${thenStage ? " and continue" : ""}</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">Both are needed before pre-production starts — the checklist
        is work for named people, not for the job in general. Either can be changed later.</p>`);
  },
  async saveCrew(id, thenStage) {
    const phot = $("cwPhot").value || null;
    const sty = $("cwSty").value || null;
    if (thenStage && (!phot || !sty))
      return toast("Pick both a photographer and a stylist", true);
    A.closeModal();
    const f = { photographer_id: phot, stylist_id: sty };
    if (thenStage) f.stage = thenStage;
    const names = [phot && nameOf(phot), sty && nameOf(sty)].filter(Boolean).join(" and ");
    await patch(id, f, names ? "Shoot crew: " + names : "Crew cleared");
  },

  /* ---- the pre-production sheet ---- */
  /* Its own screen: 66 items will not fit in a 428px drawer, and whoever is
     working through it is standing in the studio, not sitting at a desk. */
  async openPrep(id, phase) {
    const j = S.jobs.find(x => x.id === id);
    if (!j) return;
    const kind = prepKindFor(j);
    if (!kind) return toast("No pre-production list is set up for a " +
      j.shoot_type + " shoot", true);
    S.prepJob = id;
    S.prepPhase = phase || 1;
    S.prepFilter = "all";
    await loadPrep(id, kind);
    S.view = "prep";
    render(); window.scrollTo(0, 0);
  },
  prepPhase(p) { S.prepPhase = p; S.prepFilter = "all"; render(); },
  prepFilter(f) { S.prepFilter = f; render(); },
  prepBack() { S.view = "prod"; render(); openJob(S.prepJob).catch(fail); },

  /* every change saves on its own - nobody is hunting for a Save button
     with one hand full of light stand */
  async setPrep(tid, patch) {
    const row = (S.prep || []).find(r => r.template_id === tid);
    const next = Object.assign({}, row && row.answer, patch);
    const { error } = await sb.from("job_prep").upsert({
      job_id: S.prepJob, template_id: tid,
      state: next.state || "open",
      value: next.value ?? null,
      note: next.note ?? null,
      actor_id: S.me.id
    }, { onConflict: "job_id,template_id" });
    if (error) return fail(error);
    await loadPrep(S.prepJob, prepKindFor(S.jobs.find(x => x.id === S.prepJob)));
    render();
  },
  prepToggle(tid) {
    const r = (S.prep || []).find(x => x.template_id === tid);
    const now = (r && r.answer && r.answer.state) || "open";
    A.setPrep(tid, { state: now === "done" ? "open" : "done" });
  },
  prepNA(tid) {
    const r = (S.prep || []).find(x => x.template_id === tid);
    const now = (r && r.answer && r.answer.state) || "open";
    A.setPrep(tid, { state: now === "na" ? "open" : "na" });
  },
  prepValue(tid, v) {
    const s = String(v || "").trim();
    A.setPrep(tid, { value: s || null, state: s ? "done" : "open" });
  },
  prepNote(tid, v) { A.setPrep(tid, { note: String(v || "").trim() || null }); },
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
  /* a maternity shoot and a newborn shoot need different paperwork */
  async setTypeDoc(name, field, url) {
    const patch = {}; patch[field] = url.trim() || null;
    const { error } = await sb.from("shoot_types").update(patch).eq("name", name);
    if (error) return fail(error);
    await loadReference(); render();
    toast((field === "terms_url" ? "Terms" : "Get-ready guide") + " updated for " + name);
  },

  editContact(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
    const must = !!thenStage;
    modal(`<h3>Client details</h3>
      <p class="mh">${esc(j.shoot_type)} · ${esc(j.location)}${thenStage ? " — needed before " + esc(thenStage) : ""}</p>
      <label>Client name</label><input class="inp" id="ctName" value="${esc(j.client_name || "")}"
        placeholder="e.g. Divya &amp; Karthik">
      <label style="margin-top:10px">Phone</label>
      <input class="inp" id="ctPhone" type="tel" value="${esc(j.phone || "")}"
        placeholder="10 digits, or +44… for overseas">
      <label style="margin-top:10px">Email${must ? " (required)" : " (optional)"}</label>
      <input class="inp" id="ctEmail" type="email" value="${esc(j.email || "")}"
        placeholder="the terms and booking details are sent here">
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveContact(${id},${thenStage ? `'${esc(thenStage)}'` : "null"})">
          Save${thenStage ? " and continue" : ""}</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      ${must ? `<p class="hint">${esc(thenStage)} sends the client their terms and booking
        details, so there has to be somewhere to send them.</p>`
        : `<p class="hint">Fixing a spelling is fine at any stage. The change is logged, and
           anything already emailed to the client keeps the name it was sent with.</p>`}`);
  },
  async saveContact(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
    const name = $("ctName").value.trim();
    const phone = $("ctPhone").value.trim();
    const email = $("ctEmail").value.trim() || null;   // read before the modal closes
    if (!name) return toast("The client needs a name", true);
    if (!phone) return toast("A phone number is required", true);
    if (!phoneOk(phone)) return toast("10 digits, or start with + for an overseas number", true);
    if (thenStage && !email) return toast("An email address is needed before " + thenStage, true);
    A.closeModal();
    const renamed = name !== j.client_name;
    await patch(id, { client_name: name, phone, email },
      renamed ? "Renamed to " + name : "Client details updated");
    if (thenStage) await A.moveTo(id, thenStage);
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
      <label style="margin-top:10px">How did the advance come in?</label>
      <select class="inp" id="bkMethod" onchange="A.paySync('bk')">
        ${PAY_METHODS.map(m => `<option>${esc(m)}</option>`).join("")}</select>
      ${proofFields("bk")}

      <label style="margin-top:12px">Who booked it?</label>
      <select class="inp" id="bkBy">
        ${S.people.filter(p => p.active).map(p =>
          `<option value="${esc(p.id)}" ${p.id === (j.booked_by || S.me.id) ? "selected" : ""}>
            ${esc(p.full_name)}</option>`).join("")}
      </select>
      <label class="chk" style="margin-top:12px"><input type="checkbox" id="bkCopy"
        ${j.copyrights_included ? "checked" : ""}> Booked with copyrights</label>
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveBooking(${id},'${esc(to)}',false)">Book it</button>
        <button class="btn" onclick="A.saveBooking(${id},'${esc(to)}',true)">Book with date TBD</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">An advance is required to book. The date can be TBD for now, but must be confirmed
        before ${esc(S.settings.shoot_date_from || "Pre-Production")}.</p>`);
    A.venueSync(); A.paySync("bk");
  },
  venueSync() {
    const v = $("bkVenue"), box = $("bkAddrBox");
    if (v && box) box.style.display = v.value === "Studio" ? "none" : "";
  },
  async saveBooking(id, to, tbd) {
    const j = S.jobs.find(x => x.id === id);
    const total = parseFloat($("bkVal").value || "0") || 0;
    const adv = parseFloat($("bkAdv").value || "0") || 0;
    const at = slotValue("bk");
    const venue = $("bkVenue").value;
    const addr = $("bkAddr").value.trim();
    /* read every field while the form is still on screen - closeModal() below
       wipes it, and anything read after that silently falls back to a default */
    const by = ($("bkBy") || {}).value || S.me.id;
    const copy = !!($("bkCopy") || {}).checked;
    if (total <= 0) return toast("The total package value is required", true);
    if (adv <= 0) return toast("Record the advance payment to book this job", true);
    if (adv > total) return toast("The advance cannot be more than the package total", true);
    if (!tbd && !at) return toast("Pick a date and a time, or choose TBD", true);
    if (venue !== "Studio" && !addr)
      return toast("Enter the address for a " + venue.toLowerCase() + " shoot", true);
    const method = ($("bkMethod") || {}).value || "Cash";
    const file = (($("bkFile") || {}).files || [])[0];
    if (needsProof(method) && !file)
      return toast("A " + method + " advance needs a screenshot", true);
    /* the advance is money too — give it a record of its own */
    const already = num(j.amount_received);
    if (adv > already) {
      try {
        const proof_path = file ? await uploadProof(id, file) : null;
        const { error } = await sb.from("job_payments").insert({
          job_id: id, amount: adv - already, method, proof_path,
          note: "booking advance", recorded_by: S.me.id
        });
        if (error) throw error;
      } catch (e) { return fail(e); }
    }
    A.closeModal();
    const f = { stage: to, package_value: total, amount_received: adv,
                venue, venue_address: venue === "Studio" ? null : addr,
                booked_by: by, copyrights_included: copy };
    if (tbd) { f.shoot_tbd = true; f.shoot_at = null; }
    else { f.shoot_at = at; f.shoot_tbd = false; }
    await patch(id, f, "Booked" + (tbd ? " — date TBD" : " for " + fmtShoot(f.shoot_at)));
    /* the date is theirs now — tell them, and send the guide with it */
    const after = S.jobs.find(x => x.id === id);
    if (after && after.email && after.stage === to) await A.mailBooking(id);
  },

  /* ---- the booking confirmation ---- */
  async mailBooking(id) {
    const { data, error } = await sb.functions.invoke("send-booking-email",
      { body: { job_id: id, preview: true } });
    if (error || (data && data.error)) return fail(error || new Error(data.error));
    modal(`<h3>Confirm the booking with them</h3>
      <p class="mh">To <b>${esc(data.to)}</b>${data.booked_by
        ? " · booked by " + esc(data.booked_by) : ""}</p>
      ${emailBox(data)}
      <div class="acts" style="margin-top:16px">
        <button class="btn p" id="bkSend" onclick="A.sendBooking(${id})">Send it</button>
        <button class="btn" onclick="A.closeModal()">Not yet</button></div>
      <p class="hint">${data.has_attachment
        ? "The get-ready guide for this shoot type is attached."
        : "No get-ready guide is set for this shoot type, so nothing is attached — " +
          "you can add one in Settings."}
        ${data.copyrights ? " Copyrights are stated as included." : ""}</p>`);
  },
  async sendBooking(id) {
    const btn = $("bkSend");
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    const { data, error } = await sb.functions.invoke("send-booking-email",
      { body: { job_id: id } });
    if (error || (data && data.error)) {
      if (btn) { btn.disabled = false; btn.textContent = "Send it"; }
      return fail(error || new Error(data.error));
    }
    A.closeModal();
    await refresh("Confirmation sent to " + data.to +
      (data.attached ? " with the guide" : ""));
  },

  async moveTo(id, to, override) {
    if (!to) return;
    const j = S.jobs.find(x => x.id === id);
    const st = stageByName(to), bookedOrd = ordOf("booked_stage");
    const crossingIntoBooked = st && !st.is_parked && st.ordinal >= bookedOrd && j.stage_no < bookedOrd;
    /* Sales moves are a fixed set — refuse here rather than let the database
       throw, so the person is told what IS allowed */
    const allowed = SALES_MOVES[j.stage];
    if (allowed && to !== j.stage && !allowed.includes(to))
      return toast("A lead at " + j.stage + " can only go to " +
        allowed.slice(0, -1).join(", ") + " or " + allowed[allowed.length - 1], true);
    /* and a warm lead going away is worth a reason */
    if (to === parkedStage() && ["Hot Leads", "Payment Link Shared"].includes(j.stage)
        && !j.archive_reason) return A.archiveLead(id);
    /* the address first — the package is no use if the terms have nowhere to go */
    if (emailNeeded(j, to)) return A.editContact(id, to);
    if (packageNeeded(j, to)) return A.editPackage(id, to);
    if (termsNeeded(j, to)) return A.previewEmail(id, to);
    if (crossingIntoBooked && (num(j.amount_received) <= 0 || (!j.shoot_at && !j.shoot_tbd)))
      return A.bookJob(id, to);
    if (slotNeeded(j, to)) return A.setShoot(id, to);
    /* the date comes first, then who is doing it — prep is work for named people */
    if (crewNeeded(j, to)) return A.setCrew(id, to);
    /* Pre-production gates both of its phases. Open the sheet rather than just
       refusing — the next thing they need is the list, not an error. */
    const prepPhase = to === (S.settings.preprod_complete_stage || "Pre-Prod Complete") ? 1
                    : to === (S.settings.shoot_ready_stage || "Shoot Ready") ? 2 : 0;
    if (prepPhase && prepKindFor(j)) {
      const left = await prepLeft(id, prepPhase);
      if (left > 0) {
        toast(left + " item" + (left === 1 ? "" : "s") + " still to verify before " + to, true);
        return A.openPrep(id, prepPhase);
      }
    }
    if (handoverNeeded(j, to)) return A.handover(id, to);
    if (galleryLinkNeeded(j, to)) return A.setGallery(id, to);
    if (shootQcNeeded(j, to)) return A.shootQc(id, to);
    if (selectionNeeded(j, to)) return A.setSelection(id, to);
    if (editInfoNeeded(j, to)) return A.setEdit(id, to);
    /* QC is where someone last looked at the work, so it is where we ask */
    if (crossing(j, to, "digital_stage") && j.post_photos == null)
      return A.askPost(id, "photos", to);
    if (editsApprovalNeeded(j, to)) return A.mailEditApproval(id, to);
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
    /* the job is closed off — the only thing left is thanking them for coming in */
    if (to === (S.settings.delivered_stage || "Delivered") && j.email) await A.mailCollected(id);
  },
  /* ---- money in, with something behind it ---- */
  /* the gap case: money the job already counts, but with no record behind it */
  logPast(id) { A.recordPay(id, payGap(S.jobs.find(x => x.id === id)), true); },
  recordPay(id, amt, coverGap) {
    const j = S.jobs.find(x => x.id === id);
    const cap = coverGap ? payGap(j) : bal(j);
    modal(`<h3>${coverGap ? "Add a missing record" : "Record a payment"}</h3>
      <p class="mh">${esc(j.client_name)} · ${coverGap
        ? rupee(cap) + " of what is already counted has no record"
        : rupee(cap) + " outstanding of " + rupee(j.package_value)}</p>
      ${coverGap ? `<div class="alert grey">This money is already in the job's total. Filling this
        in only records how it arrived — it will not be counted twice.</div>` : ""}
      <div class="f2">
        <div><label>Amount received</label>
          <input class="inp" id="pyAmt" type="number" min="1" max="${cap}"
            value="${amt ? num(amt) : ""}" placeholder="${rupee(cap).slice(1)}"></div>
        <div><label>Date received</label>
          <input class="inp" id="pyDate" type="date" value="${dateOf(new Date().toISOString())}"
            max="${dateOf(new Date().toISOString())}"></div>
      </div>
      <label style="margin-top:10px">How did it come in?</label>
      <select class="inp" id="pyMethod" onchange="A.paySync()">
        ${PAY_METHODS.map(m => `<option>${esc(m)}</option>`).join("")}</select>
      ${proofFields("py")}
      <label style="margin-top:10px">Note (optional)</label>
      <input class="inp" id="pyNote" placeholder="e.g. collected at the shoot by Kavitha">
      <div id="pyMsg"></div>
      <div class="acts" style="margin-top:16px">
        <button class="btn p" id="pySave" onclick="A.savePayment(${id},${coverGap ? "true" : "false"})">
          ${coverGap ? "Save the record" : "Record it"}</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">Attach whatever the client sent you — it is the record that the money
        arrived. Cash needs nothing.</p>`);
    A.paySync();
  },
  paySync(prefix) {
    const p = prefix || "py";
    const sel = $(p + "Method"), box = $(p + "Proof");
    if (!sel || !box) return;
    box.style.display = needsProof(sel.value) ? "" : "none";
  },
  async savePayment(id, coverGap) {
    const j = S.jobs.find(x => x.id === id);
    const b = coverGap ? payGap(j) : bal(j);
    const amount = parseFloat($("pyAmt").value || "0") || 0;
    const on = $("pyDate").value;
    const method = $("pyMethod").value;
    const note = $("pyNote").value.trim();
    const file = ($("pyFile").files || [])[0];

    if (amount <= 0) return toast("Enter the amount received", true);
    if (amount > b) return toast("That is more than the " + rupee(b) +
      (coverGap ? " that is missing a record" : " outstanding"), true);
    if (!on) return toast("Pick the date it came in", true);
    if (needsProof(method) && !file)
      return toast("A " + method + " payment needs a screenshot", true);

    const btn = $("pySave");
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    try {
      const proof_path = file ? await uploadProof(id, file) : null;
      const { error } = await sb.from("job_payments").insert({
        job_id: id, amount, method, proof_path,
        note: note || null, received_on: on, recorded_by: S.me.id
      });
      if (error) throw error;
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = "Record it"; }
      return fail(e);
    }
    A.closeModal();
    /* covering a gap only writes the record — the total already counts that money */
    if (coverGap) return refresh(rupee(amount) + " now has a record behind it");
    /* the record is in; only now does the job's total move */
    await patch(id, { amount_received: num(j.amount_received) + amount },
      b - amount > 0 ? rupee(amount) + " recorded · " + rupee(b - amount) + " left" : "Fully paid");
  },
  async openProof(path) {
    const { data, error } = await sb.storage.from("payment-proofs").createSignedUrl(path, 300);
    if (error || !data) return fail(error || new Error("That file could not be opened"));
    window.open(data.signedUrl, "_blank", "noopener");
  },
  /* ---- the client's galleries ---- */
  setGallery(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
    modal(`<h3>Unedited files gallery</h3>
      <p class="mh">${esc(j.client_name)}${thenStage ? " — needed before " + esc(thenStage) : ""}</p>
      <label>Pixieset link for the unedited files</label>
      <input class="inp" id="glLink" value="${esc(j.gallery_link || "")}"
        placeholder="https://littleshots.pixieset.com/…">
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveGallery(${id},${thenStage ? `'${esc(thenStage)}'` : "null"})">
          Save${thenStage ? " and move" : ""}</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">This is the gallery the client picks their photos from, and it goes out
        to them as soon as you save — so it has to be live first.</p>`);
  },
  async saveGallery(id, thenStage) {
    const link = $("glLink").value.trim();
    if (!link) return toast("Paste the Pixieset gallery link", true);
    A.closeModal();
    const f = { gallery_link: link };
    if (thenStage) f.stage = thenStage;
    await patch(id, f, thenStage ? "Gallery shared · moved to " + thenStage : "Gallery link saved");
    /* a client cannot choose photos nobody told them about, so the email
       follows the move straight away — shown first, sent on confirm */
    const j = S.jobs.find(x => x.id === id);
    if (thenStage && j && j.email) await A.mailSelectionLink(id);
  },

  /* ---- the studio's own check on the shoot ---- */
  shootQc(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
    const v = String(j.shoot_qc_verdict || "").trim();
    modal(`<h3>Shoot review</h3>
      <p class="mh">${esc(j.client_name)} · ${esc(j.shoot_type)}${thenStage
        ? " — needed before " + esc(thenStage) : ""}</p>
      <label>How did the shoot come out?</label>
      <select class="inp" id="qcVerdict">
        <option value="">— pick one —</option>
        ${QC_VERDICTS().map(x => `<option ${x === v ? "selected" : ""}>${esc(x)}</option>`).join("")}
      </select>
      <label style="margin-top:10px">What the review found</label>
      <textarea class="inp" id="qcNotes" rows="4"
        placeholder="Coverage, focus, lighting, anything the editor should know or anything to reshoot"
        >${esc(j.shoot_qc_notes || "")}</textarea>
      <label style="margin-top:10px">Reviewed by</label>
      <select class="inp" id="qcBy">
        <option value="">— pick one —</option>
        ${S.people.filter(p => p.active).map(p => `<option value="${esc(p.id)}"
          ${p.id === (j.shoot_qc_by || (S.me || {}).id) ? "selected" : ""}>${esc(p.full_name)}</option>`).join("")}
      </select>
      <label style="margin-top:10px">Production Head</label>
      <select class="inp" id="qcHead">
        <option value="">— pick one —</option>
        ${S.people.filter(p => p.active).map(p => `<option value="${esc(p.id)}"
          ${p.id === j.shoot_qc_head ? "selected" : ""}>${esc(p.full_name)}</option>`).join("")}
      </select>
      <label style="margin-top:10px">Discussed with the photographer</label>
      <textarea class="inp" id="qcTalk" rows="3"
        placeholder="What the Production Head took back to them, and what they said"
        >${esc(j.shoot_qc_discussion || "")}</textarea>
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveShootQc(${id},${thenStage ? `'${esc(thenStage)}'` : "null"})">
          Save${thenStage ? " and move" : ""}</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">This is the studio's own check on the shoot, before the files go
        anywhere near editing. It stays on the job for whoever picks it up next.</p>`);
  },
  async saveShootQc(id, thenStage) {
    const verdict = $("qcVerdict").value.trim();
    const notes = $("qcNotes").value.trim();
    const by = $("qcBy").value || null;
    const head = $("qcHead").value || null;
    const talk = $("qcTalk").value.trim();
    if (!verdict) return toast("Pick how the shoot came out", true);
    if (!notes) return toast("Write up what the review found", true);
    if (!head) return toast("Name the Production Head who reviewed it", true);
    if (!talk) return toast("Record what was discussed with the photographer", true);
    A.closeModal();
    const f = { shoot_qc_verdict: verdict, shoot_qc_notes: notes, shoot_qc_by: by,
                shoot_qc_head: head, shoot_qc_discussion: talk };
    if (thenStage) f.stage = thenStage;
    await patch(id, f, thenStage ? "Shoot reviewed · moved to " + thenStage : "Shoot review saved");
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
  /* The nudge, when they have gone quiet. Same links, softer wording, and it
     is the only record that anyone chased them. */
  async copySelectionReminder(id) {
    const { data, error } = await sb.functions.invoke("send-selection-email",
      { body: { job_id: id, channel: "whatsapp", origin: location.origin } });
    if (error || (data && data.error)) return fail(error || new Error(data.error));
    try {
      await navigator.clipboard.writeText(data.text);
      toast("Reminder copied — paste it into the chat");
    } catch (e) {
      modal(`<h3>Copy this into WhatsApp</h3>
        <textarea style="min-height:160px" onclick="this.select()">${esc(data.text)}</textarea>
        <div class="acts" style="margin-top:16px">
          <button class="btn" onclick="A.closeModal()">Done</button></div>
        <p class="hint">Edit this wording in Settings, under the selection reminder.</p>`);
    }
  },
  mailSelectionReminder(id) { return A.mailSelectionLink(id, true); },

  /* the same road the terms email takes — studio Gmail, wording from Settings */
  async mailSelectionLink(id, reminder) {
    const { data, error } = await sb.functions.invoke("send-selection-email",
      { body: { job_id: id, preview: true, reminder: !!reminder, origin: location.origin } });
    if (error || (data && data.error)) return fail(error || new Error(data.error));
    modal(`<h3>${reminder ? "A gentle reminder" : "Choose your photos"}</h3>
      <p class="mh">To <b>${esc(data.to)}</b></p>
      <div style="border:1px solid var(--line);border-radius:11px;overflow:hidden;background:#fff">
        <div style="background:var(--bg);padding:10px 13px;border-bottom:1px solid var(--line);font-size:12.5px">
          <b style="color:var(--ink-soft);font-weight:600;margin-right:6px">Subject</b>${esc(data.subject)}</div>
        <div style="padding:15px 16px;font-size:13px;line-height:1.6;max-height:320px;overflow-y:auto">${
          esc(data.text).replace(/\n/g, "<br>")}</div>
      </div>
      <div class="acts" style="margin-top:16px">
        <button class="btn p" id="selSend" onclick="A.sendSelectionEmail(${id},${!!reminder})">Send it</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">Edit the wording in Settings. Sent from
        ${esc(data.sender || "the studio address")}, and the link dies once they send their picks.</p>`);
  },
  async sendSelectionEmail(id, reminder) {
    const btn = $("selSend");
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    const { data, error } = await sb.functions.invoke("send-selection-email",
      { body: { job_id: id, reminder: !!reminder, origin: location.origin } });
    if (error || (data && data.error)) {
      if (btn) { btn.disabled = false; btn.textContent = "Send it"; }
      return fail(error || new Error(data.error));
    }
    A.closeModal();
    await refresh((reminder ? "Reminder emailed to " : "Selection link emailed to ") + data.to);
  },
  /* the client sent their picks some other way, or changed their mind on the phone */
  setSelection(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
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
      <p class="hint">Whatever they sent — one per line, or commas. The package promises
        ${num(j.edited_count)} edited photos.</p>`);
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
  /* ---- chasing a lead ---- */
  /* The three things Sales has to record, in one form, because the next
     follow-up date is what resets the clock and nothing else does. */
  logFollowup(id) {
    const j = S.jobs.find(x => x.id === id);
    modal(`<h3>Log a follow-up</h3>
      <p class="mh">${esc(j.client_name)} · ${esc(j.stage)}${j.phone
        ? " · " + esc(j.phone) : ""}</p>
      <label>What did you do?</label>
      <select class="inp" id="fuKind" onchange="A.fuSync()">
        <option value="message">Followed up with a message</option>
        <option value="call">Called them</option>
      </select>
      <div id="fuCallBox" style="margin-top:9px">
        <label>Did they pick up?</label>
        <select class="inp" id="fuOut" onchange="A.fuSync()">
          <option value="unanswered">No answer</option>
          <option value="answered">Yes, we spoke</option>
        </select>
      </div>
      <div style="margin-top:9px">
        <label id="fuNoteLbl">Notes (optional)</label>
        <textarea id="fuNote" style="min-height:88px"
          placeholder="What they asked about, what worried them, what you promised"></textarea>
      </div>
      <label style="margin-top:9px">Follow up again in how many days?</label>
      <input class="inp" id="fuDays" type="number" min="0" max="120" value="3"
        oninput="A.fuSync()">
      <p class="hint" id="fuWhen"></p>
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveFollowup(${id})">Save follow-up</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">Saving this resets the clock — from now on the lead is judged
        against the date above, not how long it has sat in the column.</p>`);
    A.fuSync();
  },
  fuSync() {
    const show = (id, on) => { const e = $(id); if (e) e.style.display = on ? "" : "none"; };
    const kind = $("fuKind").value, out = $("fuOut") ? $("fuOut").value : "";
    show("fuCallBox", kind === "call");
    const must = kind === "call" && out === "answered";
    $("fuNoteLbl").textContent = must ? "What was said (required)" : "Notes (optional)";
    const d = Math.max(0, parseInt($("fuDays").value || "0", 10) || 0);
    const when = new Date(); when.setDate(when.getDate() + d);
    $("fuWhen").textContent = "Next due " + when.toLocaleDateString("en-IN",
      { weekday: "long", day: "numeric", month: "long" }) + (d === 0 ? " — today" : "");
  },
  async saveFollowup(id) {
    const kind = $("fuKind").value;
    const out = kind === "call" ? $("fuOut").value : null;
    const note = $("fuNote").value.trim();
    /* if they answered, what was said is the only part worth keeping */
    if (kind === "call" && out === "answered" && !note)
      return toast("They picked up — what did they say?", true);
    const d = Math.max(0, parseInt($("fuDays").value || "0", 10) || 0);
    const next = new Date(); next.setDate(next.getDate() + d);
    const iso = [next.getFullYear(), String(next.getMonth() + 1).padStart(2, "0"),
                 String(next.getDate()).padStart(2, "0")].join("-");
    const { error } = await sb.from("job_followups").insert({
      job_id: id, kind, outcome: out, notes: note || null,
      next_followup_on: iso, actor_id: S.me.id
    });
    if (error) return fail(error);
    A.closeModal();
    await refresh(kind === "message" ? "Message logged · next due " + iso
      : out === "answered" ? "Call logged · next due " + iso
      : "No answer logged · next due " + iso);
  },

  /* a warm lead going away is the most useful thing Sales can tell you */
  archiveLead(id) {
    const j = S.jobs.find(x => x.id === id);
    const reasons = archiveReasons();
    modal(`<h3>Why didn't they book?</h3>
      <p class="mh">${esc(j.client_name)} · ${esc(j.stage)}</p>
      <label>Reason</label>
      <select class="inp" id="arReason">
        ${reasons.map(r => `<option>${esc(r)}</option>`).join("")}</select>
      <label style="margin-top:9px">Anything worth remembering (optional)</label>
      <textarea id="arNote" style="min-height:80px"
        placeholder="e.g. loved the work but wanted a smaller album"></textarea>
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveArchive(${id})">Archive this lead</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">Counted on the Follow-ups board, so the pattern in what you
        lose is visible rather than guessed at.</p>`);
  },
  async saveArchive(id) {
    const reason = $("arReason").value, note = $("arNote").value.trim();
    A.closeModal();
    await patch(id, { stage: parkedStage(), archive_reason: reason,
                      archive_note: note || null }, "Archived — " + reason);
  },

  setMode(k, m) { S.mode = Object.assign({}, S.mode, { [k]: m }); render(); },
  sortBy(key) {
    if (S.sortKey === key) S.sortDir = S.sortDir === "desc" ? "asc" : "desc";
    else { S.sortKey = key; S.sortDir = "asc"; }
    render();
  },
  setSearch(v) {
    S.q = String(v == null ? "" : v);
    render();
    const box = $("searchBox");
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  },
  clearSearch() { S.q = ""; render(); },

  async reopenSelection(id) {
    const { data, error } = await sb.rpc("reopen_selection", { p_job: id });
    if (error) return fail(error);
    await refresh("Link reopened — back at " + (data || "the selection stage"));
  },

  /* ---- the client signs things off ---- */
  /* Two things ever need approving: the edited photos and the album design.
     Both go out as a link the client answers on. Both can also be ticked off
     by hand, because someone who approved over the phone still approved. */
  async mailEditApproval(id, thenStage) {
    const { data, error } = await sb.functions.invoke("send-approval-email",
      { body: { job_id: id, kind: "edits", preview: true, origin: location.origin } });
    if (error || (data && data.error)) return fail(error || new Error(data.error));
    const q = thenStage ? `'${esc(thenStage)}'` : "null";
    modal(`<h3>Your edited photos are ready</h3>
      <p class="mh">To <b>${esc(data.to)}</b></p>
      ${emailBox(data)}
      <div class="acts" style="margin-top:16px">
        <button class="btn p" id="apSend" onclick="A.sendEditApproval(${id},${q})">
          ${thenStage ? "Send and move" : "Send it"}</button>
        <button class="btn" onclick="A.approveEditsByHand(${id},${q})">They already approved</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">Edit the wording in Settings. If they approved on the phone or in person,
        the middle button records that without emailing them.</p>`);
  },
  async sendEditApproval(id, thenStage) {
    const btn = $("apSend");
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    const { data, error } = await sb.functions.invoke("send-approval-email",
      { body: { job_id: id, kind: "edits", origin: location.origin } });
    if (error || (data && data.error)) {
      if (btn) { btn.disabled = false; btn.textContent = "Send it"; }
      return fail(error || new Error(data.error));
    }
    A.closeModal();
    if (thenStage) return patch(id, { stage: thenStage },
      "Sent to " + data.to + " · moved to " + thenStage);
    await refresh("Sent to " + data.to + " for approval");
  },
  /* approved off-system — record it, do not email, and let the move through */
  async approveEditsByHand(id, thenStage) {
    A.closeModal();
    const f = { edits_approved_at: new Date().toISOString(), pending_approval: null,
                edit_corrections: null };
    if (thenStage) f.stage = thenStage;
    await patch(id, f, "Approval recorded" + (thenStage ? " · moved to " + thenStage : ""));
    await sb.from("job_activity").insert({ job_id: id,
      action: "edited photos approved by the client, recorded by hand", actor_id: S.me.id });
    /* an approval over the phone is still an approval — it starts the printing
       work, and moves the job on, exactly as their yes on the link would have */
    const j = S.jobs.find(x => x.id === id);
    if (j && (j.has_album || j.frame_included) && !childrenOf(id)
        .some(c => c.kind === "album" || c.kind === "frame")) {
      await sb.rpc("start_physical_work", { p_job: id });
    }
    const { data: moved } = await sb.rpc("advance_after_edit_approval", { p_job: id });
    await refresh(moved && moved !== j.stage ? "Approved · moved to " + moved : null);
  },

  /* the album the client is being asked to sign off has to be visible first */
  setAlbumProof(childId, thenStep) {
    const c = S.children.find(x => x.id === childId);
    const j = S.jobs.find(x => x.id === c.job_id);
    modal(`<h3>Album design</h3>
      <p class="mh">${esc(j.client_name)}${thenStep ? " — needed before " + esc(thenStep) : ""}</p>
      <label>Link to the design the client approves from</label>
      <input class="inp" id="abLink" value="${esc(j.album_proof_link || "")}"
        placeholder="https://littleshots.pixieset.com/…">
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveAlbumProof(${childId},${thenStep ? `'${esc(thenStep)}'` : "null"})">
          Save${thenStep ? " and ask them" : ""}</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">Once they approve, the album goes to print as it is — so this has to be
        the design you are willing to print.</p>`);
  },
  async saveAlbumProof(childId, thenStep) {
    const c = S.children.find(x => x.id === childId);
    const link = $("abLink").value.trim();
    if (!link) return toast("Paste the link to the album design", true);
    A.closeModal();
    await patch(c.job_id, { album_proof_link: link }, "Album design link saved");
    if (thenStep) {
      const { error } = await sb.from("job_children").update({ stage: thenStep }).eq("id", childId);
      if (error) return fail(error);
      await refresh("Album at " + thenStep);
      await A.mailAlbumApproval(c.job_id);
    }
  },
  async mailAlbumApproval(id) {
    const { data, error } = await sb.functions.invoke("send-approval-email",
      { body: { job_id: id, kind: "album", preview: true, origin: location.origin } });
    if (error || (data && data.error)) return fail(error || new Error(data.error));
    modal(`<h3>Album design for approval</h3>
      <p class="mh">To <b>${esc(data.to)}</b></p>
      ${emailBox(data)}
      <div class="acts" style="margin-top:16px">
        <button class="btn p" id="abSend" onclick="A.sendAlbumApproval(${id})">Send it</button>
        <button class="btn" onclick="A.closeModal()">Not yet</button></div>
      <p class="hint">They can approve it or send corrections back on the same link. Corrections
        walk the album back to design with their notes attached.</p>`);
  },
  async sendAlbumApproval(id) {
    const btn = $("abSend");
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    const { data, error } = await sb.functions.invoke("send-approval-email",
      { body: { job_id: id, kind: "album", origin: location.origin } });
    if (error || (data && data.error)) {
      if (btn) { btn.disabled = false; btn.textContent = "Send it"; }
      return fail(error || new Error(data.error));
    }
    A.closeModal();
    await refresh("Album sent to " + data.to + " for approval");
  },

  /* ---- thanking them the evening of the shoot ---- */
  /* Offered rather than sent silently: the amounts are in it, and a wrong
     number in a thank-you is worse than no thank-you. */
  async mailShootDone(id) {
    const j = S.jobs.find(x => x.id === id);
    if (j && !j.email) return;
    const { data, error } = await sb.functions.invoke("send-shoot-done-email",
      { body: { job_id: id, preview: true } });
    if (error || (data && data.error)) return fail(error || new Error(data.error));
    modal(`<h3>Thank the client</h3>
      <p class="mh">To <b>${esc(data.to)}</b> · ${data.collab
        ? "collaboration, no amounts shown"
        : rupee(data.paid) + " received" + (data.balance ? ", " + rupee(data.balance) + " pending" : ", nothing pending")}</p>
      ${emailBox(data)}
      <div class="acts" style="margin-top:16px">
        <button class="btn p" id="sdSend" onclick="A.sendShootDone(${id})">Send it</button>
        <button class="btn" onclick="A.closeModal()">Not now</button></div>
      <p class="hint">The ${data.days}-working-day promise comes from Prices &amp; settings,
        and Sundays are skipped when working out the date.</p>`);
  },
  async sendShootDone(id) {
    const btn = $("sdSend");
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    const { data, error } = await sb.functions.invoke("send-shoot-done-email",
      { body: { job_id: id } });
    if (error || (data && data.error)) {
      if (btn) { btn.disabled = false; btn.textContent = "Send it"; }
      return fail(error || new Error(data.error));
    }
    A.closeModal();
    await refresh("Thank-you sent to " + data.to);
  },

  /* ---- come and collect it ---- */
  async mailPickup(id) {
    const { data, error } = await sb.functions.invoke("send-pickup-email",
      { body: { job_id: id, preview: true } });
    if (error || (data && data.error)) return fail(error || new Error(data.error));
    modal(`<h3>Ready for pickup</h3>
      <p class="mh">To <b>${esc(data.to)}</b> · ${esc(data.items)}</p>
      ${emailBox(data)}
      <div class="acts" style="margin-top:16px">
        <button class="btn p" id="pkSend" onclick="A.sendPickup(${id})">Send it</button>
        <button class="btn" onclick="A.closeModal()">Not yet</button></div>
      <p class="hint">What this names is read off the package, so it only promises what
        they actually ordered.</p>`);
  },
  async sendPickup(id) {
    const btn = $("pkSend");
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    const { data, error } = await sb.functions.invoke("send-pickup-email",
      { body: { job_id: id } });
    if (error || (data && data.error)) {
      if (btn) { btn.disabled = false; btn.textContent = "Send it"; }
      return fail(error || new Error(data.error));
    }
    A.closeModal();
    await refresh("Told " + data.to + " their " + data.items + " is ready");
  },

  /* ---- and thank them once it is in their hands ---- */
  async mailCollected(id) {
    const j = S.jobs.find(x => x.id === id);
    if (j && !j.email) return;
    const { data, error } = await sb.functions.invoke("send-collected-email",
      { body: { job_id: id, preview: true } });
    if (error || (data && data.error)) return fail(error || new Error(data.error));
    modal(`<h3>Thank them for collecting</h3>
      <p class="mh">To <b>${esc(data.to)}</b> · ${esc(data.items)}</p>
      ${emailBox(data)}
      <div class="acts" style="margin-top:16px">
        <button class="btn p" id="clSend" onclick="A.sendCollected(${id})">Send it</button>
        <button class="btn" onclick="A.closeModal()">Not now</button></div>
      <p class="hint">This is the last thing the client hears from us, so it asks for a
        Google review. Reword it in Prices &amp; settings.</p>`);
  },
  async sendCollected(id) {
    const btn = $("clSend");
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    const { data, error } = await sb.functions.invoke("send-collected-email",
      { body: { job_id: id } });
    if (error || (data && data.error)) {
      if (btn) { btn.disabled = false; btn.textContent = "Send it"; }
      return fail(error || new Error(data.error));
    }
    A.closeModal();
    await refresh("Thank-you sent to " + data.to);
  },

  /* ---- is this worth putting out? ---- */
  askPost(id, kind, thenStage, childId) {
    const j = S.jobs.find(x => x.id === id);
    const what = kind === "video" ? "video" : "edited photos";
    const link = kind === "video" ? j.video_link : j.edited_link;
    modal(`<h3>Worth posting?</h3>
      <p class="mh">${esc(j.client_name)} · ${esc(j.shoot_type)}${thenStage
        ? " — needed before " + esc(thenStage) : ""}</p>
      <p class="mh" style="margin-top:10px">Is there anything in these ${what} we should
        put on our own feed? Saying yes adds them to Post to Social — it does not post
        anything by itself.</p>
      ${link ? `<p class="hint" style="margin-top:8px"><a href="${esc(link)}"
        target="_blank" rel="noopener">Open the ${esc(what)} ↗</a></p>` : ""}
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.savePost(${id},'${kind}',true,${thenStage
          ? `'${esc(thenStage)}'` : "null"},${childId || "null"})">Yes, worth posting</button>
        <button class="btn" onclick="A.savePost(${id},'${kind}',false,${thenStage
          ? `'${esc(thenStage)}'` : "null"},${childId || "null"})">No, skip it</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>`);
  },
  async savePost(id, kind, yes, thenStage, childId) {
    A.closeModal();
    const f = kind === "video" ? { post_video: yes } : { post_photos: yes };
    /* the answer has to be on the job before the move is tried, or the
       database refuses it on the way past */
    const { error } = await sb.from("jobs").update(f).eq("id", id);
    if (error) return fail(error);
    await loadJobs();
    if (childId && thenStage) return A.moveChild(childId, thenStage);
    if (thenStage) return A.moveTo(id, thenStage);
    await refresh(yes ? "Added to Post to Social" : "Marked as not for posting");
  },
  markPosted(id, kind) {
    const k = postKind(kind);
    if (!k) return;
    const j = S.jobs.find(x => x.id === id);
    modal(`<h3>Mark ${esc(k.label.toLowerCase())} as posted</h3>
      <p class="mh">${esc(j.client_name)} · ${esc(j.shoot_type)}</p>
      <p class="mh" style="margin-top:10px">This takes the row off the list. Only tick it
        once it is actually up.</p>
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.savePosted(${id},'${kind}')">It is posted</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>`);
  },
  async savePosted(id, kind) {
    const k = postKind(kind);
    A.closeModal();
    await patch(id, { [k.stamp]: new Date().toISOString() }, k.label + " marked as posted");
    await sb.from("job_activity").insert({ job_id: id,
      action: k.label.toLowerCase() + " posted to social", actor_id: S.me.id });
  },

  /* ---- clearing the studio's copy ---- */
  markDeleted(id) {
    const j = S.jobs.find(x => x.id === id);
    if (!j) return;
    const left = num(j.days_to_delete);
    modal(`<h3>Remove the files</h3>
      <p class="mh">${esc(j.client_name)} · ${esc(j.shoot_type)}</p>
      ${j.backup_confirmed_at
        ? `<div class="alert green"><b>They have confirmed their own backup.</b>
             Told us ${when(j.backup_confirmed_at)}.</div>`
        : left > 0
        ? `<div class="alert amber"><b>They have not confirmed a backup yet.</b>
             There ${left === 1 ? "is" : "are"} still ${left} day${left === 1 ? "" : "s"}
             to go — check with them before clearing anything.</div>`
        : `<div class="alert amber"><b>Their ${RETENTION_DAYS()} days are up</b>, but they
             never confirmed a backup. Worth one last message before you clear it.</div>`}
      <p class="mh" style="margin-top:12px">Tick this once the unedited and edited files
        are actually off the studio's drives. It is only a record — nothing is deleted
        for you, and this cannot be undone here.</p>
      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveDeleted(${id})">I have deleted them</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>`);
  },
  async saveDeleted(id) {
    A.closeModal();
    await patch(id, { files_deleted_at: new Date().toISOString(), files_deleted_by: S.me.id },
      "Marked as removed from backup");
    await sb.from("job_activity").insert({ job_id: id,
      action: "files removed from the studio backup", actor_id: S.me.id });
  },
  copyBackupLink(id) {
    const j = S.jobs.find(x => x.id === id);
    const link = location.origin + "/backup.html?t=" + encodeURIComponent(j.retention_token || "");
    const msg = "Hi " + j.client_name + ", a reminder to download and back up your photographs — " +
      "we clear our copy after " + RETENTION_DAYS() + " days. Once yours is safely stored, " +
      "you can let us know here:\n" + link;
    navigator.clipboard.writeText(msg)
      .then(() => toast("Reminder copied — paste it into the chat"))
      .catch(() => toast("Could not copy it", true));
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
    /* nobody can approve an album they cannot see */
    const albumAsk = S.settings.album_approval_stage || "Waiting for Client Approval to Print";
    if (c.kind === "album" && target === albumAsk && !String(j.album_proof_link || "").trim())
      return A.setAlbumProof(childId, target);
    /* leaving Video QC is the last look anyone takes at the cut */
    if (c.kind === "video" && target === (S.settings.video_delivery_stage || "Video Delivery")
        && j.post_video == null)
      return A.askPost(c.job_id, "video", target, childId);
    if (childPayGate(j, target) && !override)
      return toast("Blocked — " + rupee(bal(j)) + " still owed before " + target, true);
    await patchChild(childId, { stage: target },
      kindDef(c.kind).label + " · " + target);
    if (override) await sb.from("job_activity").insert({
      job_id: c.job_id, action: "payment override: " + c.kind + " sent to " + target +
        " with " + rupee(bal(j)) + " owing", actor_id: S.me.id });
    /* the design is parked waiting on them, so ask them now */
    if (c.kind === "album" && target === albumAsk && j.email) await A.mailAlbumApproval(c.job_id);
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
    {
      /* it is theirs and it is finished — the only thing left is telling them */
      const j = S.jobs.find(x => x.id === id);
      if (j && j.email && (j.has_album || j.frame_included)) {
        await refresh("Moved to " + (data || "pickup"));
        return A.mailPickup(id);
      }
    }
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

  /* ---- marking the shoot complete ---- */
  /* One long form on purpose. Every field here is something only the people
     who were at the shoot can answer, and they are standing in the studio
     packing up — asking them twice means getting it once. */
  handover(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
    const b = bal(j);
    const team = S.people.filter(p => p.active);
    const pick = (sel, chosen, blank) => `<select class="inp" id="${sel}">
      <option value="">— ${blank} —</option>
      ${team.map(p => `<option value="${esc(p.id)}" ${p.id === chosen ? "selected" : ""}>
        ${esc(p.full_name)}</option>`).join("")}</select>`;

    modal(`<h3>Shoot completed</h3>
      <p class="mh">${esc(j.client_name)} · ${esc(j.shoot_type)}${thenStage
        ? " — needed before " + esc(thenStage) : ""}</p>

      <p class="shead">Files and backup</p>
      <label>Where is the backup?</label>
      <input class="inp" id="hoBackup" value="${esc(j.backup_location || "")}"
        placeholder="e.g. Studio HDD 3 + Google Drive">
      <label style="margin-top:10px">How many files were taken?</label>
      <input class="inp" id="hoFiles" type="number" min="1" value="${num(j.files_shot) || ""}"
        placeholder="e.g. 840">
      <label style="margin-top:10px">Behind-the-scenes backup link <span class="opt">optional</span></label>
      <input class="inp" id="hoBts" value="${esc(j.bts_backup_link || "")}"
        placeholder="Where the BTS footage went">

      <p class="shead">Who shot it</p>
      <label>Photographer</label>${pick("hoPhot", j.shoot_photographer_id || j.photographer_id, "pick one")}
      <label style="margin-top:10px">Stylist</label>${pick("hoSty", j.shoot_stylist_id || j.stylist_id, "pick one")}
      ${j.has_video ? `
        <label style="margin-top:10px">Videographer</label>${pick("hoVid", j.shoot_videographer_id, "pick one")}
        <label style="margin-top:10px">How many video files?</label>
        <input class="inp" id="hoVidFiles" type="number" min="1" value="${num(j.video_files) || ""}"
          placeholder="e.g. 36">
        <label style="margin-top:10px">Video backup link</label>
        <input class="inp" id="hoVidBackup" value="${esc(j.video_backup_link || "")}"
          placeholder="Where the footage went">`
      : `<p class="hint" style="margin-top:8px">No video in this package, so nothing to record for it.</p>`}

      <p class="shead">How the day went</p>
      <label>How happy was the client?</label>
      <select class="inp" id="hoSat">
        <option value="">— pick one —</option>
        ${SATISFACTION().map(s => `<option ${s === j.client_satisfaction ? "selected" : ""}>${esc(s)}</option>`).join("")}
      </select>
      <label style="margin-top:10px">Did they leave a Google review? <span class="opt">optional</span></label>
      <div class="seg" id="hoGrSeg">
        <button type="button" id="hoGrYes" class="${j.google_review === true ? "on" : ""}"
          onclick="A.hoGoogle(true)">Yes</button>
        <button type="button" id="hoGrNo" class="${j.google_review === false ? "on" : ""}"
          onclick="A.hoGoogle(false)">No</button>
      </div>
      <div id="hoGrBox" style="margin-top:8px${j.google_review === true ? "" : ";display:none"}">
        <label>Link to the review <span class="opt">optional</span></label>
        <input class="inp" id="hoGrLink" value="${esc(j.google_review_link || "")}"
          placeholder="https://g.page/…">
      </div>
      <label style="margin-top:10px">Editing notes from the client <span class="opt">optional</span></label>
      <textarea class="inp" id="hoEditFb" rows="2"
        placeholder="Anything they asked for in the edit">${esc(j.edit_feedback || "")}</textarea>
      <label style="margin-top:10px">Problems during the shoot <span class="opt">optional</span></label>
      <textarea class="inp" id="hoProblem" rows="2"
        placeholder="Anything that went wrong, so it does not happen twice">${esc(j.shoot_problems || "")}</textarea>
      <label style="margin-top:10px">Next follow-up for this shoot <span class="opt">optional</span></label>
      <input class="inp" id="hoFollow" type="date" value="${esc(j.shoot_followup_on || "")}">

      <p class="shead">Upselling</p>
      <label class="chk"><input type="checkbox" id="hoUp" onchange="A.hoSync(${id})"
        ${j.upsold ? "checked" : ""}> Something was sold on the day</label>
      <div id="hoUpBox" style="margin-top:6px">
        <label>What was sold?</label>
        <textarea class="inp" id="hoUpNotes" rows="2"
          placeholder="e.g. 10 extra edits and a 12x18 frame">${esc(j.upsell_notes || "")}</textarea>
        <label style="margin-top:10px">Additional edited files <span class="opt">optional</span></label>
        <input class="inp" id="hoUpFiles" type="number" min="0" value="${num(j.upsell_edited_files) || ""}"
          placeholder="Added to the agreed count">
        <label style="margin-top:10px">Add-on album or frame <span class="opt">optional</span></label>
        <input class="inp" id="hoUpAddons" value="${esc(j.upsell_addons || "")}"
          placeholder="e.g. Frame 12x18">
        <label style="margin-top:10px">Amount to add</label>
        <input class="inp" id="hoUpAmt" type="number" min="1" value="${num(j.upsell_amount) || ""}"
          oninput="A.hoSync(${id})" placeholder="e.g. 6000">
        <p class="hint" id="hoUpNote" style="margin-top:6px"></p>
      </div>

      ${thenStage ? (b > 0
        ? `<p class="shead">Payment collected</p>
           <label>Amount collected (required)</label>
           <input class="inp" id="hoPay" type="number" min="1" max="${b}" placeholder="${rupee(b)} outstanding">
           <label style="margin-top:10px">How did it come in?</label>
           <select class="inp" id="hoMethod" onchange="A.paySync('ho')">
             ${PAY_METHODS.map(m => `<option>${esc(m)}</option>`).join("")}</select>
           ${proofFields("ho")}
           <p class="hint" style="margin-top:6px">${rupee(j.amount_received)} received so far of
             ${rupee(j.package_value)}. The balance can stay outstanding — printing is blocked at
             ${esc(S.settings.pay_gate_stage || "Album Printing")}.</p>`
        : `<div class="alert green" style="margin-top:12px"><b>Fully paid.</b> Nothing to collect.</div>`) : ""}

      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveHandover(${id},${thenStage ? `'${esc(thenStage)}'` : "null"})">
          Save${thenStage ? " and move" : ""}</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>
      <p class="hint">A thank-you email goes to the client after this, with the amount
        collected and when the unedited files will reach them.</p>`);
    A.paySync("ho");
    A.hoSync(id);
  },

  /* the upsell block is hidden until it applies, and shows what it does to the bill */
  hoSync(id) {
    const on = ($("hoUp") || {}).checked;
    const box = $("hoUpBox");
    if (box) box.style.display = on ? "" : "none";
    const note = $("hoUpNote");
    if (note && on) {
      const add = parseFloat(($("hoUpAmt") || {}).value || "0") || 0;
      const j = S.jobs.find(x => x.id === id);
      note.textContent = add > 0 && j
        ? "The package goes from " + rupee(j.package_value) + " to " +
          rupee(num(j.package_value) + add) + ", so the balance adjusts with it."
        : "This is added to the package value, so the final bill adjusts.";
    }
  },

  /* yes shows the link box, no hides it — the segment is the source of truth */
  hoGoogle(yes) {
    const y = $("hoGrYes"), n = $("hoGrNo"), box = $("hoGrBox");
    if (!y || !n) return;
    const already = (yes ? y : n).classList.contains("on");
    y.classList.toggle("on", !already && yes);
    n.classList.toggle("on", !already && !yes);
    if (box) box.style.display = y.classList.contains("on") ? "" : "none";
  },
  async saveHandover(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
    const v = k => (($(k) || {}).value || "").trim();
    const backup = v("hoBackup");
    const files = parseInt(v("hoFiles") || "0", 10) || 0;
    const phot = v("hoPhot") || null;
    const sty = v("hoSty") || null;
    const vid = v("hoVid") || null;
    const vidFiles = parseInt(v("hoVidFiles") || "0", 10) || 0;
    const vidBackup = v("hoVidBackup");
    const sat = v("hoSat");
    const up = (($("hoUp") || {}).checked) === true;
    const upAmt = parseFloat(v("hoUpAmt") || "0") || 0;
    const upNotes = v("hoUpNotes");
    /* Every field is read here, before the modal closes. Reading one of them
       further down - after closeModal has torn the form out of the DOM - is
       how "who booked it" silently went missing once already. */
    const bts = v("hoBts"), editFb = v("hoEditFb");
    const grEl = $("hoGrYes");
    const gr = grEl ? (grEl.classList.contains("on") ? true
                     : ($("hoGrNo").classList.contains("on") ? false : null)) : null;
    const grLink = gr === true ? v("hoGrLink") : "";
    const problem = v("hoProblem"), follow = v("hoFollow");
    const upFiles = parseInt(v("hoUpFiles") || "0", 10) || null;
    const upAddons = v("hoUpAddons");
    const payEl = $("hoPay");
    const pay = payEl ? (parseFloat(payEl.value || "0") || 0) : 0;
    const method = ($("hoMethod") || {}).value || "Cash";
    const file = (($("hoFile") || {}).files || [])[0];
    const b = bal(j);

    if (!backup) return toast("Say where the shoot was backed up", true);
    if (files <= 0) return toast("Enter how many files were taken", true);
    if (thenStage) {
      if (!phot) return toast("Say which photographer shot it", true);
      if (!sty) return toast("Say which stylist worked the shoot", true);
      if (j.has_video) {
        if (!vid) return toast("Say who shot the video", true);
        if (vidFiles <= 0) return toast("Enter how many video files were taken", true);
        if (!vidBackup) return toast("Add the video backup link", true);
      }
      if (!sat) return toast("Record how happy the client was", true);
      if (up && !upNotes) return toast("Say what was upsold", true);
      if (up && upAmt <= 0) return toast("Enter the amount to add for the upsell", true);
      if (b > 0) {
        if (pay <= 0) return toast("Record the payment collected at the shoot", true);
        if (pay > b) return toast("That is more than the " + rupee(b) + " outstanding", true);
        if (needsProof(method) && !file)
          return toast("A " + method + " payment needs a screenshot", true);
      }
    }
    /* the money gets its own record before the job's total moves */
    if (pay > 0) {
      try {
        const proof_path = file ? await uploadProof(id, file) : null;
        const { error } = await sb.from("job_payments").insert({
          job_id: id, amount: pay, method, proof_path,
          note: "collected at the shoot", recorded_by: S.me.id
        });
        if (error) throw error;
      } catch (e) { return fail(e); }
    }
    A.closeModal();
    const f = {
      backup_location: backup, files_shot: files,
      bts_backup_link: bts || null,
      shoot_photographer_id: phot, shoot_stylist_id: sty,
      shoot_videographer_id: j.has_video ? vid : null,
      video_files: j.has_video && vidFiles ? vidFiles : null,
      video_backup_link: j.has_video ? (vidBackup || null) : null,
      client_satisfaction: sat || null,
      google_review: gr,
      google_review_link: gr === true ? (grLink || null) : null,
      edit_feedback: editFb || null,
      shoot_problems: problem || null,
      shoot_followup_on: follow || null,
      upsold: up,
      upsell_notes: up ? upNotes : null,
      upsell_edited_files: up ? upFiles : null,
      upsell_addons: up ? (upAddons || null) : null,
      upsell_amount: up ? upAmt : null
    };
    if (thenStage) f.stage = thenStage;
    if (pay > 0) f.amount_received = num(j.amount_received) + pay;
    await patch(id, f, thenStage
      ? "Shoot completed" + (pay > 0 ? " · " + rupee(pay) + " recorded" : "") +
        (up ? " · " + rupee(upAmt) + " upsold" : "") + " · moved to " + thenStage
      : "Shoot details updated");
    if (thenStage) A.mailShootDone(id);
  },

  /* ---- the price and exactly what the client is getting ---- */
  editPackage(id, thenStage) {
    const j = S.jobs.find(x => x.id === id);
    modal(`<h3>Package &amp; delivery details</h3>
      <p class="mh">${esc(j.client_name)} · ${esc(j.shoot_type)}${thenStage
        ? " — needed before " + esc(thenStage) : ""}</p>
      <label>Total package value (required)</label>
      <input class="inp" id="pkVal" type="number" min="1" value="${num(j.package_value) || ""}" placeholder="e.g. 25000">

      <label class="chk" style="margin-top:12px"><input type="checkbox" id="pkCollab"
        onchange="A.pkSync()" ${j.is_collab ? "checked" : ""}> Collaboration — nothing to collect</label>
      <div id="pkCollabBox" style="margin-top:6px">
        <input class="inp" id="pkCollabNote" value="${esc(j.collab_notes || "")}"
          placeholder="What we get in return — e.g. 3 reels and 2 story posts tagging the studio">
        <p class="hint" style="margin-top:6px">The value above is still recorded, so you can see
          what the collaboration was worth — but nothing is owed, no payment gate applies, and
          the client is never shown a price.</p>
      </div>

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
    show("pkCollabBox", on("pkCollab"));
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
    const col = $("pkCollab").checked, cnote = $("pkCollabNote").value.trim();

    if (v <= 0) return toast("The total package value is required", true);
    if (num(j.amount_received) > v) return toast("They have already paid more than that total", true);
    /* money already in on a job someone is now calling free needs a decision,
       not a silent reclassification */
    if (col && num(j.amount_received) > 0)
      return toast("This job already has " + rupee(j.amount_received) +
        " recorded against it, so it can't be a collaboration", true);
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
      frame_included: fr, frame_size: fr ? fsize : null,
      is_collab: col, collab_notes: col ? (cnote || null) : null
    }, col ? "Saved as a collaboration — nothing to collect" : "Package details saved");
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
        <div><label>Where from</label><select class="inp" id="njSrc" onchange="A.njSync()">
          ${SOURCES.map(s => `<option>${esc(s)}</option>`).join("")}</select></div>
        <div><label>Quote (optional)</label><input class="inp" id="njVal" type="number" min="0" placeholder="0"></div>
      </div>

      <div id="njRefBox" style="margin-top:9px">
        <label>Who referred them? (required)</label>
        <input class="inp" id="njRef" list="njRefList" autocomplete="off"
          placeholder="Start typing — past clients will come up">
        <datalist id="njRefList">${
          [...new Set(S.jobs.map(x => x.client_name).filter(Boolean))].sort()
            .map(n => `<option>${esc(n)}</option>`).join("")}</datalist>
        <p class="hint" style="margin-top:6px">Picking a name you already have keeps the spelling
          consistent, so referrals can be counted per person later.</p>
      </div>

      <label class="chk" style="margin-top:12px"><input type="checkbox" id="njCollab"
        onchange="A.njSync()"> Collaboration — nothing to collect</label>
      <div id="njCollabBox" style="margin-top:6px">
        <input class="inp" id="njCollabNote"
          placeholder="What we get in return — e.g. 3 reels and 2 story posts tagging the studio">
      </div>

      <div class="acts" style="margin-top:16px">
        <button class="btn p" onclick="A.saveJob()">Add enquiry</button>
        <button class="btn" onclick="A.closeModal()">Cancel</button></div>`);
    A.njSync();
  },
  njSync() {
    const show = (id, on) => { const e = $(id); if (e) e.style.display = on ? "" : "none"; };
    const src = $("njSrc");
    show("njRefBox", !!src && src.value === "Referral");
    show("njCollabBox", !!$("njCollab") && $("njCollab").checked);
  },
  async saveJob() {
    const name = $("njName").value.trim(), phone = $("njPhone").value.trim();
    const src = $("njSrc").value;
    const ref = $("njRef").value.trim();
    const col = $("njCollab").checked, cnote = $("njCollabNote").value.trim();
    if (!name) return toast("Give the client a name", true);
    if (!phone) return toast("A phone number is required", true);
    if (!phoneOk(phone)) return toast("10 digits, or start with + for an overseas number", true);
    /* a referral with nobody named is the one thing we lose track of later */
    if (src === "Referral" && !ref) return toast("Who referred them?", true);
    const { error } = await sb.from("jobs").insert({
      client_name: name, phone, email: $("njEmail").value.trim() || null,
      shoot_type: $("njShoot").value,
      location: $("njLoc").value, source: src,
      referred_by: src === "Referral" ? ref : null,
      is_collab: col, collab_notes: col ? (cnote || null) : null,
      stage: flow()[0].name, package_value: parseFloat($("njVal").value || "0") || 0,
      owner_id: S.me.id
    });
    if (error) return fail(error);
    A.closeModal();
    await refresh(name + " added" + (col ? " as a collaboration" : "") +
      (src === "Referral" ? " · referred by " + ref : ""));
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
/* the screenshot, shared by the payment form, the booking and the handover */
function proofFields(prefix) {
  return `<div id="${prefix}Proof">
    <label style="margin-top:10px">Screenshot (required)</label>
    <input class="inp" id="${prefix}File" type="file" accept="image/*,application/pdf">
    <p class="hint" style="margin-top:6px">The confirmation the client sent you. Photos are shrunk
      before they are stored. Cash needs nothing.</p>
  </div>`;
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
