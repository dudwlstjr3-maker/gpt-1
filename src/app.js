/* =============================================================================
 * app.js — UI layer. All poker maths lives in engine.js; all text in i18n.js.
 * ========================================================================== */
"use strict";

/* ------------------------------------------------------------- storage --- */
const DB = {
  get(k, d) { try { const v = localStorage.getItem("hb." + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("hb." + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem("hb." + k); } catch (e) {} }
};

/* ------------------------------------------------------------------ i18n - */
let LANG = DB.get("lang", null) || I18N.detect(navigator.languages || [navigator.language]);
function t(path, vars) {
  const v = I18N.lookup(LANG, path);
  if (v === undefined) return path;
  return typeof v === "string" ? I18N.format(v, vars) : v;
}
function setLang(code) {
  LANG = code; DB.set("lang", code);
  const meta = I18N.lookup(code, "meta") || {};
  document.documentElement.lang = meta.htmlLang || code;
  document.title = t("app.docTitle");
  renderChrome(); renderStaticLabels(); loadSetup(); renderView(STATE.view);
}

/* ------------------------------------------------------------------ util - */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s === undefined || s === null ? "" : s)
  .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const nfmt = (x, d) => {
  const p = Math.pow(10, d === undefined ? 1 : d);
  const v = Math.round(x * p) / p;
  return (Object.is(v, -0) ? 0 : v).toString();
};
const pct = (x) => Math.round(x * 100) + "%";
const signed = (x, d) => (x >= 0 ? "+" : "") + nfmt(x, d === undefined ? 2 : d);
/* A loss of zero is "0", never "-0". */
const lossText = (x, d) => (x < 0.005 ? "0" : "-" + nfmt(x, d === undefined ? 2 : d));
function toast(msg) {
  const el = $("toast"); el.textContent = msg; el.classList.add("on");
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("on"), 1800);
}
const cardHTML = (c, sm) => {
  if (c === null || c === undefined) return '<span class="pc ph' + (sm ? " sm" : "") + '">?</span>';
  const s = PE.SUITS[PE.suitOf(c)];
  return '<span class="pc ' + s + (sm ? " sm" : "") + '">' + PE.RANKS[PE.rankOf(c)] + PE.SUIT_GLYPH[s] + "</span>";
};
const catName = (i) => (t("categories") || [])[i] || "";
const drawNames = (keys) => keys.map((k) => t("draws." + k)).filter(Boolean);
const vtName = (id) => t("villain." + id + ".n");
const posName = (p) => t("positions." + p) || p;

/* ------------------------------------------------------------------ state - */
const STATE = { view: "home", quiz: null, drill: null, analysis: null };

/* ============================================================ CHROME ===== */
const VIEWS = ["home", "quiz", "hand", "stats", "drill", "range", "help"];
function renderChrome() {
  $("logo").innerHTML = t("app.title");
  $("nav").innerHTML = VIEWS.map((v) =>
    '<button data-v="' + v + '" class="' + (STATE.view === v ? "on" : "") + '">' + esc(t("nav." + v)) + "</button>"
  ).join("");
  $("nav").querySelectorAll("button").forEach((b) => (b.onclick = () => go(b.dataset.v)));
  const codes = I18N.codes();
  $("langsel").innerHTML = codes.map((c) =>
    '<option value="' + c + '"' + (c === LANG ? " selected" : "") + ">" + esc(I18N.lookup(c, "meta.name")) + "</option>"
  ).join("");
  $("themebtn").textContent = DB.get("theme", "dark") === "dark" ? "☀" : "☾";
}
/** Fill the static markup in the hand-input form from the string table. */
function renderStaticLabels() {
  const set = (id, key) => { const el = $(id); if (el) el.textContent = t(key); };
  set("lbl-setup", "hand.setupTitle"); set("lbl-setupnote", "hand.setupNote");
  set("lbl-gt", "hand.gameType"); set("lbl-seats", "hand.seats"); set("lbl-stack", "hand.effStack");
  set("lbl-bl", "hand.blinds"); set("lbl-ante", "hand.ante"); set("lbl-br", "hand.bankroll");
  set("lbl-goal", "hand.goal"); set("s-save", "hand.saveSetup");
  set("lbl-input", "hand.inputTitle");
  set("lbl-step1", "hand.step1"); set("lbl-step2", "hand.step2"); set("lbl-step2sub", "hand.step2sub");
  set("lbl-step3", "hand.step3"); set("lbl-step4", "hand.step4"); set("lbl-step4sub", "hand.step4sub");
  set("lbl-step5", "hand.step5"); set("lbl-step5sub", "hand.step5sub");
  set("h-run", "hand.run"); set("h-clear", "hand.clear"); set("h-demo", "hand.demo");
  const opts = (id, pairs) => {
    const el = $(id); if (!el) return;
    const keep = el.value;
    el.innerHTML = pairs.map(([v, k]) => '<option value="' + v + '">' + esc(t(k)) + "</option>").join("");
    if (keep) el.value = keep;
  };
  opts("s-gt", [["cash", "hand.cash"], ["mtt", "hand.mtt"], ["sng", "hand.sng"]]);
  opts("s-seats", [["6", "hand.seats6"], ["9", "hand.seats9"], ["2", "hand.seats2"]]);
  opts("s-goal", [["practice", "hand.goalPractice"], ["profit", "hand.goalProfit"], ["leak", "hand.goalLeak"]]);
}
function go(v) {
  STATE.view = v;
  VIEWS.forEach((x) => $("v-" + x).classList.toggle("on", x === v));
  $("nav").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  renderView(v);
  window.scrollTo(0, 0);
}
function renderView(v) {
  ({ home: renderHome, quiz: renderQuiz, hand: renderHand, stats: renderStats,
     drill: renderDrill, range: renderRange, help: renderHelp }[v] || (() => {}))();
}
function toggleTheme() {
  const next = DB.get("theme", "dark") === "dark" ? "light" : "dark";
  DB.set("theme", next);
  document.documentElement.setAttribute("data-theme", next);
  $("themebtn").textContent = next === "dark" ? "☀" : "☾";
}

/* ============================================================ PROFILE ==== */
const AXIS_KEYS = ["A1", "A2", "A3", "A4", "A5", "B1", "B2"];
const CORE_AXES = ["A1", "A2", "A3", "A4", "A5", "B1"];
const QMIN = 25;
const getProfile = () => DB.get("profile", null);

function axisStats(answers) {
  const sum = {}, wsum = {}, cnt = {}, dirs = {};
  AXIS_KEYS.forEach((k) => { sum[k] = 0; wsum[k] = 0; cnt[k] = 0; dirs[k] = []; });
  Object.keys(answers).forEach((qid) => {
    const q = I18N.QUIZ.QUESTIONS.find((x) => x.id == qid); if (!q) return;
    const w = q.w[answers[qid]]; if (!w) return;
    const maxw = {};
    AXIS_KEYS.forEach((k) => {
      let m = 0; q.w.forEach((o) => { if (o[k] !== undefined) m = Math.max(m, Math.abs(o[k])); });
      maxw[k] = m;
    });
    AXIS_KEYS.forEach((k) => {
      // An option that says nothing about an axis is not evidence about it.
      if (!maxw[k] || w[k] === undefined) return;
      sum[k] += w[k]; wsum[k] += maxw[k]; cnt[k]++; dirs[k].push(w[k]);
    });
  });
  const score = {}, conf = {};
  AXIS_KEYS.forEach((k) => {
    score[k] = wsum[k] ? Math.round(sum[k] / wsum[k] * 100) : 0;
    if (!cnt[k]) { conf[k] = 0; return; }
    const mean = dirs[k].reduce((a, b) => a + b, 0) / dirs[k].length;
    const meanAbs = dirs[k].reduce((a, b) => a + Math.abs(b), 0) / dirs[k].length;
    const stable = meanAbs > 0 ? Math.min(1, Math.abs(mean) / meanAbs) : 0.5;
    conf[k] = Math.min(1, cnt[k] / 6) * (0.6 + 0.4 * stable);
  });
  // consistency axis: how similarly the paired questions were answered
  const pairs = {};
  I18N.QUIZ.QUESTIONS.forEach((q) => {
    if (q.pair && answers[q.id] !== undefined) (pairs[q.pair] = pairs[q.pair] || []).push(q.w[answers[q.id]][q.axis] || 0);
  });
  let pc = 0, ps = 0;
  Object.keys(pairs).forEach((p) => {
    if (pairs[p].length >= 2) { ps += 1 - Math.min(1, Math.abs(pairs[p][0] - pairs[p][1]) / 4); pc++; }
  });
  if (pc) { score.B2 = Math.round(ps / pc * 200 - 100); conf.B2 = Math.min(1, pc / 3); }
  return { score, conf, cnt };
}
function archetype(s) {
  const tightness = s.A1, aggr = s.A2;
  if (Math.abs(tightness) < 20 && Math.abs(aggr) < 20) return t("archetypes.balanced");
  if (tightness <= 0 && aggr > 0) return aggr > 55 ? t("archetypes.tagStrong") : t("archetypes.tagWeak");
  if (tightness > 0 && aggr > 0) return (tightness > 50 && aggr > 60) ? t("archetypes.maniac") : t("archetypes.lag");
  if (tightness <= 0 && aggr <= 0) return tightness < -45 ? t("archetypes.rock") : t("archetypes.tightPassive");
  return t("archetypes.station");
}
function profileNotes(s) {
  const L = [];
  if (s.A1 < -25 && s.A2 > 25) L.push(t("profileNotes.tightAgg"));
  if (s.A1 < -25 && s.A2 < -15) L.push(t("profileNotes.tightPass"));
  if (s.A1 > 25 && s.A2 < -15) L.push(t("profileNotes.loosePass"));
  if (s.A1 > 25 && s.A2 > 45) L.push(t("profileNotes.looseAgg"));
  if (s.A4 < -30) L.push(t("profileNotes.foldsEasy"));
  if (s.A4 > 50) L.push(t("profileNotes.neverFolds"));
  if (s.A5 < -25) L.push(t("profileNotes.feel"));
  if (s.A5 > 45) L.push(t("profileNotes.calc"));
  if (s.B1 < -20) L.push(t("profileNotes.tilt"));
  if (s.B2 < -20) L.push(t("profileNotes.inconsistent"));
  if (!L.length) L.push(t("profileNotes.neutral"));
  return L;
}

/* ============================================================ QUIZ ======= */
function nextQuestion(qz) {
  const st = axisStats(qz.ans);
  const rest = I18N.QUIZ.QUESTIONS.filter((q) => qz.asked.indexOf(q.id) < 0);
  if (!rest.length) return null;
  rest.sort((a, b) => (st.conf[a.axis] || 0) - (st.conf[b.axis] || 0));
  const lowest = st.conf[rest[0].axis] || 0;
  const pool = rest.filter((q) => (st.conf[q.axis] || 0) <= lowest + 0.06);
  return pool[(Math.random() * pool.length) | 0];
}
function quizDone(qz) {
  const n = Object.keys(qz.ans).length;
  if (n >= I18N.QUIZ.QUESTIONS.length) return true;
  if (n < QMIN) return false;
  const st = axisStats(qz.ans);
  return CORE_AXES.every((k) => st.conf[k] >= 0.8);
}
function axisBar(k, v, conf) {
  const A = t("axes." + k), left = (v + 100) / 2;
  return '<div class="axis"><div class="lb"><span>' + esc(A.lo) + "</span><b>" + esc(A.n) +
    " <span class=\"dim\">" + (v > 0 ? "+" : "") + v + "</span></b><span>" + esc(A.hi) + "</span></div>" +
    '<div class="axbar"><u></u><i style="left:calc(' + left + '% - 2px)"></i></div>' +
    '<div class="small dim">' + esc(A.d) + (conf !== undefined && conf < 0.5 ? " · " + esc(t("quiz.lowConf")) : "") + "</div></div>";
}
function renderQuiz() {
  const v = $("v-quiz");
  const qz = STATE.quiz;
  if (!qz) {
    const p = getProfile();
    let h = '<div class="card"><h2>' + esc(t("quiz.h1")) + "</h2><p>" + t("quiz.lead", { min: QMIN }) + "</p>";
    if (p) h += '<div class="notice">' + esc(t("quiz.retakeWarn")) + "</div>";
    h += '<div style="margin-top:14px"><button class="btn" id="qz-go">' + esc(t("common.start")) + "</button></div></div>";
    if (p) h += profileCard(p);
    v.innerHTML = h;
    $("qz-go").onclick = () => { STATE.quiz = { asked: [], ans: {}, cur: null }; STATE.quiz.cur = nextQuestion(STATE.quiz); renderQuiz(); };
    return;
  }
  if (qz.done) {
    const p = saveProfile(qz);
    v.innerHTML = profileCard(p) +
      '<div class="card"><button class="btn sec" id="qz-again">' + esc(t("quiz.restart")) + "</button></div>";
    $("qz-again").onclick = () => { STATE.quiz = null; renderQuiz(); };
    return;
  }
  const q = qz.cur, txt = I18N.QUIZ.TEXT[LANG] || I18N.QUIZ.TEXT.en;
  const qt = txt[q.id] || I18N.QUIZ.TEXT.en[q.id];
  const done = Object.keys(qz.ans).length;
  const st = axisStats(qz.ans);
  const confAvg = CORE_AXES.reduce((a, k) => a + (st.conf[k] || 0), 0) / CORE_AXES.length;
  v.innerHTML = '<div class="card">' +
    '<div class="dprog"><span class="small muted">' + esc(t("quiz.progress", { done, total: I18N.QUIZ.QUESTIONS.length })) + "</span>" +
    '<div class="bar"><i style="width:' + Math.round(Math.max(done / QMIN, confAvg) * 100) + '%"></i></div>' +
    '<span class="small muted">' + esc(t("quiz.confidence")) + " " + Math.round(confAvg * 100) + "%</span></div>" +
    '<div class="tag">' + esc((txt.cats || {})[qt.c] || "") + "</div>" +
    "<h3>" + esc(qt.q) + "</h3>" +
    qt.o.map((o, i) => '<button class="opt" data-i="' + i + '"><b>' + String.fromCharCode(65 + i) + "</b>" + esc(o) + "</button>").join("") +
    "</div>";
  v.querySelectorAll(".opt").forEach((b) => (b.onclick = () => answerQuiz(+b.dataset.i)));
}
function answerQuiz(i) {
  const qz = STATE.quiz;
  qz.ans[qz.cur.id] = i; qz.asked.push(qz.cur.id);
  if (quizDone(qz)) { qz.done = true; } else { qz.cur = nextQuestion(qz); if (!qz.cur) qz.done = true; }
  renderQuiz();
}
function saveProfile(qz) {
  const st = axisStats(qz.ans);
  const p = { axes: st.score, conf: st.conf, cnt: st.cnt, n: Object.keys(qz.ans).length,
              archetype: archetype(st.score), at: Date.now() };
  DB.set("profile", p);
  return p;
}
function profileCard(p) {
  return '<div class="card"><h2>' + esc(t("quiz.resultTitle")) + "</h2>" +
    '<div class="stmeta"><span>' + esc(t("quiz.archetype")) + " <b>" + esc(p.archetype) + "</b></span>" +
    "<span>" + esc(t("quiz.sample", { n: p.n })) + "</span></div>" +
    '<div class="blk"><div class="t">' + esc(t("quiz.axesTitle")) + "</div>" +
    AXIS_KEYS.map((k) => axisBar(k, p.axes[k] || 0, p.conf ? p.conf[k] : undefined)).join("") + "</div>" +
    '<div class="blk hi"><div class="t">' + esc(t("quiz.summaryTitle")) + "</div>" +
    profileNotes(p.axes).map((s) => "<p>" + s + "</p>").join("") + "</div></div>";
}

/* ============================================================ SETUP ====== */
const SETUP_FIELDS = ["gt", "seats", "stack", "bl", "ante", "br", "goal"];
function loadSetup() {
  const s = DB.get("setup", null); if (!s) return;
  SETUP_FIELDS.forEach((k) => { const el = $("s-" + k); if (el && s[k] !== undefined) el.value = s[k]; });
}
function saveSetup() {
  const s = {};
  SETUP_FIELDS.forEach((k) => { const el = $("s-" + k); if (el) s[k] = el.value; });
  DB.set("setup", s); toast(t("hand.setupSaved")); renderBankroll();
}
const setupSeats = () => +($("s-seats") ? $("s-seats").value : 6) || 6;
const setupStack = () => +($("s-stack") ? $("s-stack").value : 100) || 100;

function renderBankroll() {
  const el = $("br-advice"); if (!el) return;
  const br = +$("s-br").value || 0;
  const bl = ($("s-bl").value || "").split("/");
  const bb = +(bl[1] || bl[0] || 0);
  if (!br || !bb) { el.innerHTML = '<div class="notice">' + esc(t("bankroll.setBankroll")) + "</div>"; return; }
  const buyin = bb * 100;
  const n = Math.floor(br / buyin);
  const level = n >= 30 ? "safe" : n >= 15 ? "caution" : "danger";
  el.innerHTML = '<div class="blk ' + (level === "safe" ? "hi" : "warn") + '" style="margin-top:12px">' +
    '<div class="t">' + esc(t("bankroll.title")) + "</div>" +
    "<p>" + t("bankroll.buyins", { n }) + " " + esc(t("bankroll." + level)) + "</p></div>";
}

/* ============================================================ HAND INPUT = */
const SLOTS = ["h0", "h1", "f0", "f1", "f2", "t0", "r0"];
const SLOT_GROUPS = [
  { k: "hand.myCards", s: ["h0", "h1"] }, { k: "common.flop", s: ["f0", "f1", "f2"] },
  { k: "common.turn", s: ["t0"] }, { k: "common.river", s: ["r0"] }
];
const HI = {
  pos: "BTN", vpos: "BB", scenario: "open_call", pick: "me", target: "h0", vt: "unknown",
  // how much actually went in preflop — these drive the pot, the SPR and every
  // downstream EV, instead of the fixed pot each scenario used to carry.
  sizes: { open: 2.5, threeBet: 9, fourBet: 22, limpers: 2, allin: 20, toCall: 20 },
  shover: "villain",
  c: { h0: null, h1: null, f0: null, f1: null, f2: null, t0: null, r0: null },
  acts: [{ v: "check", vs: 0, m: "check", ms: 0 }, { v: "check", vs: 0, m: "check", ms: 0 }, { v: "check", vs: 0, m: "check", ms: 0 }]
};
const flopDone = () => HI.c.f0 !== null && HI.c.f1 !== null && HI.c.f2 !== null;
const slotEnabled = (k) => k === "t0" ? flopDone() : k === "r0" ? (flopDone() && HI.c.t0 !== null) : true;
const usedCards = () => SLOTS.map((k) => HI.c[k]).filter((c) => c !== null);
function boardCards() {
  const f = [HI.c.f0, HI.c.f1, HI.c.f2].filter((c) => c !== null);
  if (f.length < 3) return [];
  const b = f.slice();
  if (HI.c.t0 !== null) { b.push(HI.c.t0); if (HI.c.r0 !== null) b.push(HI.c.r0); }
  return b;
}
function nextTarget(from) {
  const i = SLOTS.indexOf(from);
  for (let j = i + 1; j < SLOTS.length; j++) if (slotEnabled(SLOTS[j]) && HI.c[SLOTS[j]] === null) return SLOTS[j];
  for (let j = 0; j < SLOTS.length; j++) if (slotEnabled(SLOTS[j]) && HI.c[SLOTS[j]] === null) return SLOTS[j];
  return from;
}
function renderSeats() {
  const el = $("seat-map"), L = PE.posList(setupSeats());
  const btn = Math.max(0, L.indexOf("BTN") >= 0 ? L.indexOf("BTN") : L.length - 3);
  let h = '<div class="felt"></div>';
  L.forEach((p, i) => {
    const ang = (90 + (i - btn) * (360 / L.length)) * Math.PI / 180;
    const x = 50 + 46 * Math.cos(ang), y = 50 + 42 * Math.sin(ang);
    const cls = HI.pos === p ? "me" : HI.vpos === p ? "vil" : "";
    h += '<button class="seat ' + cls + '" data-p="' + p + '" style="left:' + x + "%;top:" + y + '%">' +
      "<b>" + (HI.pos === p ? esc(t("hand.myAct")) : HI.vpos === p ? esc(t("hand.villainActs")) : "&nbsp;") + "</b>" + esc(posName(p)) + "</button>";
  });
  el.innerHTML = h;
  el.querySelectorAll(".seat").forEach((b) => (b.onclick = () => {
    const p = b.dataset.p;
    if (HI.pick === "me") { if (HI.vpos === p) HI.vpos = HI.pos; HI.pos = p; HI.pick = "vil"; }
    else { if (HI.pos === p) HI.pos = HI.vpos; HI.vpos = p; HI.pick = "me"; }
    renderSeats(); updateSeatHint();
  }));
  updateSeatHint();
}
function updateSeatHint() {
  $("seat-hint").textContent = HI.pick === "me"
    ? t("hand.myAct") + " · " + posName(HI.pos) : t("hand.villainActs") + " · " + posName(HI.vpos);
}
function renderVillainChips() {
  const el = $("vt-chips");
  el.innerHTML = Object.keys(PE.VILLAIN_TYPES).map((k) =>
    '<button data-k="' + k + '" class="' + (HI.vt === k ? "on" : "") + '">' + esc(vtName(k)) + "</button>").join("");
  el.querySelectorAll("button").forEach((b) => (b.onclick = () => { HI.vt = b.dataset.k; renderVillainChips(); }));
  $("vt-desc").textContent = t("villain." + HI.vt + ".d");
}
/* Which size fields a given preflop line actually needs. */
const SIZE_FIELDS = {
  limp:        [["limpers", "hand.limpers"]],
  open_call:   [["open", "hand.openSize"]],
  call_open:   [["open", "hand.openSize"]],
  "3b_call":   [["open", "hand.openSize"], ["threeBet", "hand.threeBetSize"]],
  call_3b:     [["open", "hand.openSize"], ["threeBet", "hand.threeBetSize"]],
  "4b_call":   [["threeBet", "hand.threeBetSize"], ["fourBet", "hand.fourBetSize"]],
  call_4b:     [["threeBet", "hand.threeBetSize"], ["fourBet", "hand.fourBetSize"]],
  pf_allin:    [["allin", "hand.allinSize"]],
  pf_only:     []
};
function renderScenarioChips() {
  const el = $("pf-chips");
  const ids = PE.SCENARIOS.map((s) => s.id).concat(["pf_allin", "pf_only"]);
  el.innerHTML = ids.map((id) =>
    '<button data-k="' + id + '" class="' + (HI.scenario === id ? "on" : "") + '">' + esc(t("scenarios." + id)) + "</button>").join("");
  el.querySelectorAll("button").forEach((b) => (b.onclick = () => { HI.scenario = b.dataset.k; renderScenarioChips(); renderActions(); }));
  renderPreflopSizes();
}
function renderPreflopSizes() {
  const el = $("pf-sizes");
  if (!el) return;
  const fields = SIZE_FIELDS[HI.scenario] || [];
  const isAllin = HI.scenario === "pf_allin";
  if (!fields.length && !isAllin) { el.innerHTML = ""; return; }

  let h = '<div class="small muted" style="margin:10px 0 6px">' + esc(t("hand.pfSizes")) +
    ' <span class="dim">' + esc(t("hand.pfSizesSub")) + "</span></div>";
  if (isAllin) {
    h += '<div class="bg" id="pf-shover" style="display:flex;margin-bottom:8px">' +
      [["villain", "hand.villainShoved"], ["hero", "hand.iShoved"]].map(([k, lbl]) =>
        '<button data-k="' + k + '" class="' + (HI.shover === k ? "on" : "") + '">' + esc(t(lbl)) + "</button>").join("") + "</div>";
  }
  const rows = isAllin
    ? [["allin", HI.shover === "hero" ? "hand.allinSize" : "hand.toCallSize"]]
    : fields;
  h += '<div class="row">' + rows.map(([k, lbl]) =>
    '<div><label>' + esc(t(lbl)) + '</label><input class="szin" type="number" min="0" step="0.5" data-sz="' + k + '" value="' + (HI.sizes[k]) + '"></div>').join("") + "</div>";

  // show the resulting pot so the numbers are never a mystery
  const line = PE.preflopLine({ scenario: HI.scenario, sizes: HI.sizes, heroPos: HI.pos,
    vilPos: HI.vpos, stack: setupStack(), ante: +($("s-ante") ? $("s-ante").value : 0) || 0 });
  if (line) h += '<div class="small dim" style="margin-top:6px">' + esc(t("hand.potNow")) +
    " <b>" + nfmt(line.pot) + "BB</b> · " + esc(t("hand.deadMoney")) + " " + nfmt(line.dead) + "BB</div>";
  el.innerHTML = h;
  el.querySelectorAll("input[data-sz]").forEach((inp) => (inp.oninput = () => {
    HI.sizes[inp.dataset.sz] = +inp.value || 0; renderPreflopSizes(); renderActions();
  }));
  el.querySelectorAll("#pf-shover button").forEach((b) => (b.onclick = () => { HI.shover = b.dataset.k; renderPreflopSizes(); }));
}
function renderSlots() {
  const el = $("slots");
  el.innerHTML = SLOT_GROUPS.map((g) =>
    '<div class="slotgrp"><div class="gl">' + esc(t(g.k)) + '</div><div class="gc">' +
    g.s.map((k) => {
      const c = HI.c[k], on = slotEnabled(k);
      const suit = c !== null ? PE.SUITS[PE.suitOf(c)] : "";
      return '<button class="slot ' + (c !== null ? "filled " + suit : "") + (HI.target === k ? " tgt" : "") +
        (on ? "" : " off") + '" data-k="' + k + '"' + (on ? "" : " disabled") + ">" +
        (c !== null ? PE.RANKS[PE.rankOf(c)] + PE.SUIT_GLYPH[suit] : "") + "</button>";
    }).join("") + "</div></div>").join("");
  el.querySelectorAll(".slot").forEach((b) => (b.onclick = () => {
    const k = b.dataset.k;
    if (HI.c[k] !== null) { HI.c[k] = null; HI.target = k; } else HI.target = k;
    renderSlots(); renderDeck(); renderActions();
  }));
}
function renderDeck() {
  const used = {}; usedCards().forEach((c) => (used[c] = 1));
  let h = "";
  for (let s = 0; s < 4; s++) {
    h += '<div class="dr">';
    for (let r = 12; r >= 0; r--) {
      const c = r * 4 + s, su = PE.SUITS[s];
      h += '<button class="dc ' + su + (used[c] ? " used" : "") + '" data-c="' + c + '"' + (used[c] ? " disabled" : "") + ">" +
        PE.RANKS[r] + "<small>" + PE.SUIT_GLYPH[su] + "</small></button>";
    }
    h += "</div>";
  }
  $("deck").innerHTML = h;
  $("deck").querySelectorAll(".dc").forEach((b) => (b.onclick = () => {
    const c = +b.dataset.c;
    if (!slotEnabled(HI.target)) HI.target = nextTarget(HI.target);
    HI.c[HI.target] = c; HI.target = nextTarget(HI.target);
    renderSlots(); renderDeck(); renderActions();
  }));
}
/* running pot/investment for the action rows */
function preflopMoney() {
  return PE.preflopLine({ scenario: HI.scenario, sizes: HI.sizes, heroPos: HI.pos,
    vilPos: HI.vpos, stack: setupStack(), ante: +($("s-ante") ? $("s-ante").value : 0) || 0 })
    || { pot: PE.scenarioById(HI.scenario).pot, heroInv: PE.scenarioById(HI.scenario).heroInv, dead: 0, allin: false };
}
function potBefore(i) {
  let pot = preflopMoney().pot;
  for (let k = 0; k < i; k++) {
    const a = HI.acts[k];
    const facing = (a.v === "bet" || a.v === "raise") && +a.vs > 0;
    if (facing) { pot += +a.vs; if (a.m === "call") pot += +a.vs; else if (a.m === "raise") pot += 2 * (+a.ms); }
    else if ((a.m === "bet" || a.m === "raise") && +a.ms > 0) pot += 2 * (+a.ms);
  }
  return Math.round(pot * 10) / 10;
}
function renderActions() {
  const el = $("acts2");
  const names = ["flop", "turn", "river"];
  const board = boardCards();
  let h = "";
  for (let i = 0; i < 3; i++) {
    if (board.length < 3 + i) break;
    const a = HI.acts[i], pot = potBefore(i);
    const facing = (a.v === "bet" || a.v === "raise") && +a.vs > 0;
    h += '<div class="acard"><div class="ah">' + esc(t("common." + names[i])) +
      '<span class="pt">' + esc(t("common.pot")) + " " + nfmt(pot) + "BB</span></div>";
    h += '<div class="arow"><span class="al">' + esc(t("hand.villainActs")) + '</span><span class="bg">' +
      ["check", "bet", "raise"].map((k) => '<button data-i="' + i + '" data-f="v" data-k="' + k + '" class="' + (a.v === k ? "on" : "") + '">' + esc(t("common." + k)) + "</button>").join("") +
      "</span>" + (a.v !== "check" ? '<input class="szin" type="number" min="0" step="0.5" data-i="' + i + '" data-f="vs" value="' + (+a.vs || 0) + '">' : "") + "</div>";
    h += '<div class="arow"><span class="al">' + esc(t("hand.myAct")) + '</span><span class="bg">' +
      (facing ? ["fold", "call", "raise"] : ["check", "bet"]).map((k) => '<button data-i="' + i + '" data-f="m" data-k="' + k + '" class="' + (a.m === k ? "on" : "") + '">' + esc(t("common." + k)) + "</button>").join("") +
      "</span>" + (a.m === "bet" || a.m === "raise" ? '<input class="szin" type="number" min="0" step="0.5" data-i="' + i + '" data-f="ms" value="' + (+a.ms || 0) + '">' : "") + "</div>";
    h += "</div>";
  }
  el.innerHTML = h || '<div class="notice">' + esc(t("hand.step4sub")) + "</div>";
  el.querySelectorAll("button[data-k]").forEach((b) => (b.onclick = () => {
    const i = +b.dataset.i, f = b.dataset.f;
    HI.acts[i][f] = b.dataset.k;
    if (f === "v" && b.dataset.k === "check") { HI.acts[i].vs = 0; if (HI.acts[i].m === "call" || HI.acts[i].m === "fold") HI.acts[i].m = "check"; }
    if (f === "v" && b.dataset.k !== "check" && (HI.acts[i].m === "check" || HI.acts[i].m === "bet")) HI.acts[i].m = "call";
    renderActions();
  }));
  el.querySelectorAll("input[data-f]").forEach((inp) => (inp.oninput = () => { HI.acts[+inp.dataset.i][inp.dataset.f] = +inp.value || 0; }));
}
function buildHandInputs() { renderSeats(); renderVillainChips(); renderScenarioChips(); renderSlots(); renderDeck(); renderActions(); }

/* ============================================================ ANALYSIS === */
function analyzeHand() {
  const hole = [HI.c.h0, HI.c.h1];
  if (hole[0] === null || hole[1] === null) { toast(t("hand.needCards")); return null; }
  const seats = setupSeats(), stack = setupStack();
  const vt = PE.VILLAIN_TYPES[HI.vt];
  const scen = PE.scenarioById(HI.scenario);
  const cls = PE.handClass(hole[0], hole[1]);
  const ip = PE.isInPosition(seats, HI.pos, HI.vpos);
  const res = { cls, ip, vt, scenario: HI.scenario, pos: HI.pos, vpos: HI.vpos, streets: [] };

  // preflop
  const chart = PE.rfiRange(seats, HI.pos);
  res.preflop = {
    inChart: chart.indexOf(cls) >= 0,
    pctl: PE.classPercentile(cls),
    openPct: PE.rangePct(chart),
    chart
  };
  if (HI.scenario === "pf_only") return res;

  const money = preflopMoney();
  res.money = money;

  // All-in preflop: no streets left, so it resolves to pure equity.
  if (HI.scenario === "pf_allin") {
    const heroShoved = HI.shover === "hero";
    const amount = Math.min(HI.sizes.allin || 0, stack);
    const heroBlind = PE.blindOf(HI.pos), vilBlind = PE.blindOf(HI.vpos);
    // Facing a shove: the pot is the dead money, hero's own blind, and the
    // whole shove. Shoving: it is what hero collects when everyone folds, so
    // hero's own blind does not count — that money comes back to him.
    const potBefore = heroShoved
      ? money.dead + vilBlind
      : money.dead + heroBlind + amount;
    // Range width must come from the stack actually in play, not the stack
    // configured in setup: a 20BB jam is a far wider range than a 100BB one.
    const effAllin = Math.max(1, Math.min(stack, amount));
    res.allin = PE.allInPreflop({
      hole, vt, stack: effAllin, heroShoved,
      pot: Math.round(potBefore * 10) / 10,
      toCall: Math.max(0, amount - heroBlind), shove: amount, villainIn: vilBlind,
      rnd: PE.mulberry32(PE.seedFrom(hole[0] * 53 + hole[1] * 7))
    });
    return res;
  }

  const board = boardCards();
  if (board.length < 3) return res;

  const heroClasses = scen.heroR(seats, HI.pos, HI.vpos, PE.VILLAIN_TYPES.unknown);
  const villainClasses = scen.vilR(seats, HI.pos, HI.vpos, vt);
  res.heroClasses = heroClasses; res.villainClasses = villainClasses;

  let pot = money.pot, heroInv = money.heroInv;
  const history = [];
  const names = ["flop", "turn", "river"];

  for (let i = 0; i < 3; i++) {
    const bd = board.slice(0, 3 + i);
    if (board.length < 3 + i) break;
    const a = HI.acts[i];
    const vAct = a.v || "check", vSize = +a.vs || 0, mAct = a.m || "check", mSize = +a.ms || 0;
    const facing = (vAct === "bet" || vAct === "raise") && vSize > 0;
    const effStack = Math.max(0.5, stack - heroInv);

    const ctx = PE.buildContext({
      hole, board: bd, villainClasses, vt, ip, pot, effStack, history,
      rnd: PE.mulberry32(PE.seedFrom(hole[0] * 53 + hole[1] * 7 + i))
    });
    const res2 = PE.options(ctx, facing ? { size: vSize } : null);
    const opts = res2.opts.slice().sort((x, y) => y.ev - x.ev);
    const best = opts[0];

    // what the user actually did, matched to the closest option
    const mineKey = facing ? (mAct === "fold" ? "fold" : mAct === "call" ? "call" : "raise") : (mAct === "check" ? "check" : "bet");
    let mine = null;
    if (mineKey === "raise" || mineKey === "bet") {
      const cands = res2.opts.filter((o) => o.label === mineKey || (mineKey === "bet" && o.key === "allin") || (mineKey === "raise" && o.key === "allin"));
      mine = cands.sort((x, y) => Math.abs(x.amount - mSize) - Math.abs(y.amount - mSize))[0] || null;
    } else mine = res2.opts.find((o) => o.key === mineKey) || null;

    const bi = PE.boardInfo(bd), dr = PE.drawInfo(hole, bd);
    const myScore = PE.evalHand(hole.concat(bd));
    res.streets.push({
      name: names[i], board: bd.slice(), pot, effStack, spr: ctx.spr,
      eq: res2.eq, facing, vAct, vSize, mAct, mSize,
      required: facing ? vSize / (pot + 2 * vSize) : 0,
      mdf: facing ? pot / (pot + vSize) : 0,
      alpha: facing ? vSize / (pot + vSize) : 0,
      bi, draw: dr, cat: PE.catOf(myScore),
      opts, best, mine, evLost: mine ? Math.max(0, best.ev - mine.ev) : 0,
      villainCombos: res2.villainRangeSize, ip
    });

    // advance the pot with what actually happened
    if (facing) {
      pot += vSize;
      if (mAct === "call") { pot += vSize; heroInv += vSize; history.push({ action: "bet", size: vSize, pot: pot - 2 * vSize, board: bd }); }
      else if (mAct === "raise") { pot += 2 * mSize; heroInv += mSize; history.push({ action: "bet", size: vSize, pot: pot, board: bd }); }
      else break;
    } else {
      if ((mAct === "bet" || mAct === "raise") && mSize > 0) { pot += 2 * mSize; heroInv += mSize; history.push({ action: "call", size: mSize, pot, board: bd }); }
      else history.push({ action: "check", size: Math.round(pot * 0.5 * 10) / 10, pot, board: bd });
    }
    pot = Math.round(pot * 10) / 10;
  }
  return res;
}

function optLabel(o) {
  const size = nfmt(o.amount);
  if (o.key === "fold") return t("drill.optFold");
  if (o.key === "check") return t("drill.optCheck");
  if (o.key === "call") return t("drill.optCall", { size });
  if (o.key === "allin") return t("drill.optAllin", { size });
  if (o.label === "raise") return t("drill.optRaise", { size });
  const tag = o.key === "betSmall" ? t("drill.betLabelSmall") : o.key === "betMid" ? t("drill.betLabelMid") : t("drill.betLabelPot");
  return t("drill.optBet", { size }) + " · " + tag;
}
function optNote(o) {
  const bits = [];
  if (o.key === "check" && o.eq !== undefined) bits.push(t("common.equity") + " " + pct(o.eq));
  if (o.key === "call") bits.push(t("common.equity") + " " + pct(o.eq) + " · " + t("common.needed") + " " + pct(o.required));
  if (o.fold !== undefined) bits.push(t("common.folds") + " " + pct(o.fold));
  if (o.eqWhenCalled !== undefined) bits.push(t("common.ifCalled") + " " + pct(o.eqWhenCalled));
  return bits.join(" · ");
}
function evTable(opts, mine) {
  const best = Math.max.apply(null, opts.map((o) => o.ev));
  return '<div class="dtable">' + opts.slice().sort((a, b) => b.ev - a.ev).map((o) => {
    const isBest = o.ev === best, isMine = mine && o === mine;
    return '<div class="drow' + (isBest ? " best" : "") + (isMine ? " mine" : "") + '">' +
      '<span class="dk">' + esc(optLabel(o)) + "</span>" +
      '<span class="dv" style="color:' + (o.ev >= 0 ? "var(--good)" : "var(--bad)") + '">' + signed(o.ev) + " BB</span>" +
      (isBest ? '<span class="dbadge b">' + esc(t("common.best")) + "</span>" : "") +
      (isMine ? '<span class="dbadge m">' + esc(t("common.yourPick")) + "</span>" : "") +
      '<span class="dn">' + esc(optNote(o)) + "</span></div>";
  }).join("") + "</div>";
}
function fact(k, v, s) {
  return '<div class="fact"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div><div class="s">' + esc(s || "") + "</div></div>";
}
function gridHTML(classes, highlight) {
  const set = {}; classes.forEach((c) => (set[c] = 1));
  let h = '<div class="g13">';
  for (let i = 12; i >= 0; i--) {
    for (let j = 12; j >= 0; j--) {
      const hi = Math.max(i, j), lo = Math.min(i, j);
      const cl = i === j ? PE.RANKS[i] + PE.RANKS[i] : PE.RANKS[hi] + PE.RANKS[lo] + (i > j ? "s" : "o");
      const cls = cl === highlight ? "pt" : set[cl] ? "in" : "";
      h += '<div class="' + cls + '">' + cl + "</div>";
    }
  }
  return h + "</div>";
}
function renderAnalysis(res) {
  const out = $("h-out");
  if (!res) { out.innerHTML = ""; return; }
  let h = '<div class="card"><h2>' + esc(t("hand.resultTitle")) + "</h2>" +
    '<div class="stmeta"><span>' + esc(posName(res.pos)) + " <b>vs</b> " + esc(posName(res.vpos)) + "</span>" +
    "<span>" + esc(t("scenarios." + res.scenario)) + "</span>" +
    "<span>" + esc(t("villain.label")) + " <b>" + esc(vtName(res.vt.id)) + "</b></span>" +
    "<span>" + esc(res.ip ? t("common.inPosition") : t("common.outOfPosition")) + "</span></div>";
  // preflop
  h += '<div class="blk"><div class="t">' + esc(t("hand.preflopTitle")) + "</div>" +
    '<div class="facts">' +
    fact(t("hand.handClass"), res.cls, "") +
    fact(t("hand.handPctl"), nfmt(res.preflop.pctl) + "%", "") +
    fact(t("hand.openStd"), nfmt(res.preflop.openPct) + "%", posName(res.pos)) +
    "</div><p style=\"margin-top:9px\">" + esc(res.preflop.inChart ? t("hand.inChart") : t("hand.notInChart")) + "</p>" +
    gridHTML(res.preflop.chart, res.cls) + "</div></div>";

  // ---- preflop all-in: one equity question, no streets ----
  if (res.allin) {
    const a = res.allin;
    const isCall = a.mode === "call";
    const ev = isCall ? a.evCall : a.evShove;
    const good = ev > 0;
    h += '<div class="blk"><div class="t">' + esc(t("hand.allinTitle")) + '</div><div class="facts">' +
      fact(t("common.equity"), pct(a.eq), "") +
      (isCall ? fact(t("hand.reqEquity"), pct(a.required), t("hand.toCallSize") + " " + nfmt(a.toCall) + "BB")
              : fact(t("hand.allinFoldEq"), pct(a.foldFreq), t("hand.allinEqCalled") + " " + pct(a.eqCalled))) +
      fact(t("common.pot"), nfmt(a.pot) + "BB", isCall ? t("hand.potFacing") : t("hand.potIfAllFold")) +
      fact(t("common.ev"), signed(ev) + " BB", isCall ? t("common.call") : t("common.allin")) +
      "</div></div>";
    h += '<div class="recbox' + (good ? " good" : "") + '"><div class="rl">' + esc(t("hand.recTitle")) + "</div>" +
      '<div class="ra">' + esc(good ? (isCall ? t("common.call") : t("common.allin")) : t("common.fold")) + "</div>" +
      '<div class="rs">' + (isCall
        ? t(good ? "hand.allinCallGood" : "hand.allinCallBad", { req: pct(a.required), eq: pct(a.eq) })
        : t(good ? "hand.allinShoveGood" : "hand.allinShoveBad", { fe: pct(a.foldFreq), eqc: pct(a.eqCalled) })) +
      "</div></div>";
    h += '<div class="blk"><div class="t">' + esc(isCall ? t("hand.allinVsRange") : t("hand.allinVsCallRange")) + "</div>" +
      '<div class="small dim" style="margin-bottom:6px">' + nfmt(PE.rangePct(a.classes)) + "% · " + a.combos + " combos</div>" +
      gridHTML(a.classes, res.cls) + "</div>";
    h += '<div class="notice">' + esc(t("hand.allinNote")) + "</div></div>";
    out.innerHTML = h;
    return;
  }

  res.streets.forEach((s) => {
    h += '<div class="st"><h3><span class="stn">' + esc(t("common." + s.name)) + "</span>" +
      "<span>" + s.board.map((c) => cardHTML(c, true)).join("") + "</span>" +
      '<span class="steq">' + esc(t("common.equity")) + " " + pct(s.eq) + "</span></h3><div class=\"bd\">";
    h += '<div class="blk"><div class="t">' + esc(t("hand.numbersTitle")) + '</div><div class="facts">' +
      fact(t("common.pot"), nfmt(s.pot) + "BB", "") +
      fact(t("hand.spr"), nfmt(s.spr), "") +
      fact(t("hand.myHandNow"), catName(s.cat), drawNames(s.draw.keys).join(" · ")) +
      (s.facing ? fact(t("hand.reqEquity"), pct(s.required), t("hand.mdf") + " " + pct(s.mdf)) : "") +
      fact(t("hand.villainCombos"), s.villainCombos, s.bi ? t("texture." + s.bi.texture) : "") +
      "</div></div>";
    h += '<div class="recbox good"><div class="rl">' + esc(t("hand.recTitle")) + "</div>" +
      '<div class="ra">' + esc(optLabel(s.best)) + "</div>" +
      '<div class="rs">' + esc(t("common.ev")) + " " + signed(s.best.ev) + " BB</div></div>";
    h += '<div class="blk"><div class="t">' + esc(t("hand.evTitle")) + "</div>" + evTable(s.opts, s.mine) + "</div>";
    if (s.mine) {
      const lost = s.evLost;
      h += '<div class="blk ' + (lost < 0.02 ? "hi" : "warn") + '"><div class="t">' + esc(t("hand.yourActionTitle")) + "</div>" +
        "<p><b>" + esc(optLabel(s.mine)) + "</b> · " + esc(t("common.ev")) + " " + signed(s.mine.ev) + " BB" +
        (lost >= 0.02 ? " · " + esc(t("hand.evLost")) + " <b>" + lossText(lost) + "BB</b>" : "") + "</p></div>";
    }
    h += '<div class="notice">' + t("hand.assumptionNote", { type: esc(vtName(res.vt.id)), n: s.villainCombos }) + "</div>";
    h += "</div></div>";
  });
  h += '<div class="card"><button class="btn" id="h-save">' + esc(t("hand.saveHand")) + "</button></div>";
  out.innerHTML = h;
  $("h-save").onclick = () => {
    const hands = DB.get("hands", []);
    hands.unshift({
      at: Date.now(), cls: res.cls, pos: res.pos, vpos: res.vpos, scenario: res.scenario,
      vt: res.vt.id, streets: res.streets.map((s) => ({ name: s.name, evLost: s.evLost, eq: s.eq,
        best: optLabel(s.best), mine: s.mine ? optLabel(s.mine) : null }))
    });
    DB.set("hands", hands.slice(0, 200)); toast(t("hand.handSaved")); renderHome();
  };
}
function renderHand() { loadSetup(); buildHandInputs(); renderBankroll(); }

/* ============================================================ DRILL ====== */
const DIFFICULTY = { easy: "easy", normal: "normal", hard: "hard" };
function drillConfig() { return DB.get("drillcfg", { n: 10, vt: "random", diff: "normal" }); }

function makeDrillSpot(cfg, stack) {
  // Difficulty filters on how close the top two options are: "easy" wants a
  // clear best line, "hard" wants genuinely close decisions.
  let best = null;
  for (let attempt = 0; attempt < (cfg.diff === "normal" ? 1 : 14); attempt++) {
    const sp = PE.makeSpot({ villainType: cfg.vt, stack, seats: setupSeats() });
    if (!sp) continue;
    const evs = sp.options.map((o) => o.ev).sort((a, b) => b - a);
    const gap = evs.length > 1 ? evs[0] - evs[1] : 99;
    if (cfg.diff === "easy" && gap >= 0.45) return sp;
    if (cfg.diff === "hard" && gap <= 0.22) return sp;
    if (!best) best = sp;
    if (cfg.diff === "normal") return sp;
  }
  return best || PE.makeSpot({ villainType: cfg.vt, stack, seats: setupSeats() });
}
function startDrill(cfg) {
  STATE.drill = { n: cfg.n, vt: cfg.vt, diff: cfg.diff, stack: setupStack(),
    i: 0, evLost: 0, evCaptured: 0, correct: 0, answered: null, log: [], done: false };
  loadSpot();
}
function loadSpot() {
  const v = $("v-drill");
  v.innerHTML = '<div class="card"><div class="empty">' + esc(t("drill.computing")) + "</div></div>";
  setTimeout(() => {
    const D = STATE.drill;
    D.cur = makeDrillSpot({ n: D.n, vt: D.vt, diff: D.diff }, D.stack);
    D.answered = null;
    renderDrill();
  }, 20);
}
function answerSpot(i) {
  const D = STATE.drill, sp = D.cur;
  if (D.answered !== null) return;
  D.answered = i;
  const evs = sp.options.map((o) => o.ev);
  const best = Math.max.apply(null, evs), worst = Math.min.apply(null, evs);
  const mine = sp.options[i];
  const lost = best - mine.ev;
  const span = best - worst;
  const capture = span > 1e-9 ? (mine.ev - worst) / span : 1;
  D.evLost += lost;
  D.evCaptured += capture;
  if (lost < 0.02) D.correct++;
  D.log.push({
    street: sp.street, facing: !!sp.facing, mine: mine.key, mineLabel: optLabel(mine),
    best: sp.options.find((o) => o.ev === best).key, bestLabel: optLabel(sp.options.find((o) => o.ev === best)),
    lost, capture, eq: sp.eq, vt: sp.villainType
  });
  renderDrill();
}
function nextSpot() {
  const D = STATE.drill;
  D.i++;
  if (D.i >= D.n) { D.done = true; saveDrill(); renderDrill(); } else loadSpot();
}
function saveDrill() {
  const D = STATE.drill;
  const hist = DB.get("drills", []);
  hist.unshift({ at: Date.now(), n: D.i, vt: D.vt, diff: D.diff,
    evLost: D.evLost, capture: D.i ? D.evCaptured / D.i : 0, correct: D.correct,
    log: D.log });
  DB.set("drills", hist.slice(0, 100));
}
function gradeOf(perSpot) {
  return perSpot < 0.05 ? "S" : perSpot < 0.15 ? "A" : perSpot < 0.35 ? "B" : perSpot < 0.7 ? "C" : "D";
}
const isAggressive = (key) => /^(bet|raise|allin)/.test(key);

function drillTip(sp, mine, best) {
  if (mine === best) return t("drill.tipBest");
  if (isAggressive(best.key) && !isAggressive(mine.key)) return t("drill.tipShouldAggr", { eq: pct(sp.eq) });
  if (!isAggressive(best.key) && isAggressive(mine.key)) return t("drill.tipShouldPassive", { type: vtName(sp.villainType) });
  if (best.key === "fold") return t("drill.tipShouldFold");
  if (best.key === "call") return t("drill.tipShouldCall", { eq: pct(sp.eq) });
  return t("drill.tipSizing");
}
function renderDrill() {
  const v = $("v-drill"), D = STATE.drill;
  if (!D) {
    const cfg = drillConfig();
    v.innerHTML = '<div class="card"><h2>' + esc(t("drill.h1")) + "</h2><p>" + t("drill.lead") + "</p>" +
      '<div class="notice">' + t("drill.note") + "</div>" +
      '<div class="step"><span class="num">1</span>' + esc(t("drill.step1")) + "</div>" +
      '<div class="bg" id="dr-n" style="display:flex">' +
        [5, 10, 20].map((n) => '<button data-n="' + n + '" class="' + (cfg.n === n ? "on" : "") + '">' + esc(t("drill.spots", { n })) + "</button>").join("") + "</div>" +
      '<div class="step"><span class="num">2</span>' + esc(t("drill.step2")) + "</div>" +
      '<div class="bg" id="dr-vt" style="display:flex">' +
        '<button data-k="random" class="' + (cfg.vt === "random" ? "on" : "") + '">' + esc(t("drill.randomVillain")) + "</button>" +
        Object.keys(PE.VILLAIN_TYPES).map((k) => '<button data-k="' + k + '" class="' + (cfg.vt === k ? "on" : "") + '">' + esc(vtName(k)) + "</button>").join("") + "</div>" +
      '<div class="step"><span class="num">3</span>' + esc(t("drill.step3")) + "</div>" +
      '<div class="bg" id="dr-diff" style="display:flex">' +
        Object.keys(DIFFICULTY).map((k) => '<button data-k="' + k + '" class="' + (cfg.diff === k ? "on" : "") + '">' +
          esc(t("drill.diff" + k[0].toUpperCase() + k.slice(1))) + "</button>").join("") + "</div>" +
      '<div class="small dim" style="margin-top:5px">' + esc(t("drill.diff" + cfg.diff[0].toUpperCase() + cfg.diff.slice(1) + "D")) + "</div>" +
      '<div style="margin-top:16px"><button class="btn" id="dr-go">' + esc(t("common.start")) + "</button></div></div>" +
      drillHistoryHTML();
    v.querySelectorAll("#dr-n button").forEach((b) => (b.onclick = () => { cfg.n = +b.dataset.n; DB.set("drillcfg", cfg); renderDrill(); }));
    v.querySelectorAll("#dr-vt button").forEach((b) => (b.onclick = () => { cfg.vt = b.dataset.k; DB.set("drillcfg", cfg); renderDrill(); }));
    v.querySelectorAll("#dr-diff button").forEach((b) => (b.onclick = () => { cfg.diff = b.dataset.k; DB.set("drillcfg", cfg); renderDrill(); }));
    $("dr-go").onclick = () => startDrill(cfg);
    return;
  }
  if (D.done) return renderDrillEnd(v);

  const sp = D.cur;
  const streetName = t("common." + ["flop", "turn", "river"][sp.street]);
  const runLost = D.evLost;
  let h = '<div class="card">' +
    '<div class="dprog"><span class="small muted">' + esc(t("drill.progress", { i: D.i + 1, n: D.n })) + "</span>" +
    '<div class="bar"><i style="width:' + Math.round(D.i / D.n * 100) + '%"></i></div>' +
    '<span class="small muted">' + esc(t("drill.runningLost")) + ' <b style="color:' +
      (runLost < 0.02 ? "var(--good)" : "var(--bad)") + '">' + lossText(runLost) + "BB</b></span></div>" +
    '<div class="stmeta">' +
      "<span>" + esc(posName(sp.pos)) + " <b>vs</b> " + esc(posName(sp.vpos)) + "</span>" +
      "<span>" + esc(t("scenarios." + sp.scenario)) + "</span>" +
      "<span>" + esc(vtName(sp.villainType)) + "</span>" +
      "<span>" + esc(t("common.pot")) + " <b>" + nfmt(sp.pot) + "BB</b></span>" +
      "<span>" + esc(t("common.stack")) + " <b>" + nfmt(sp.effStack) + "BB</b></span>" +
      "<span>" + esc(sp.ip ? t("common.inPosition") : t("common.outOfPosition")) + "</span>" +
    "</div>";
  if (sp.story && sp.story.length) {
    h += '<div class="small muted" style="margin:-4px 0 10px">' + sp.story.map((s) =>
      esc(t("common." + ["flop", "turn"][s.street]) + " " + storyText(s))).join(" · ") + "</div>";
  }
  h += '<div class="dspot"><div class="dq">' + esc(streetName) + " — " + esc(t("hand.myCards")) + "</div>" +
    '<div class="dh">' + sp.hole.map((c) => cardHTML(c)).join("") + "</div>" +
    '<div class="dq" style="margin-top:10px">' + esc(t("common.board")) + "</div>" +
    '<div class="dh">' + sp.board.map((c) => cardHTML(c)).join("") + "</div>" +
    '<div class="dvs">' + (sp.facing
      ? (sp.prelude === "heroChecked" ? t("drill.afterCheck", { size: nfmt(sp.facing.size) }) : t("drill.villainBet", { size: nfmt(sp.facing.size) }))
      : (sp.ip ? t("drill.villainCheck") : t("drill.heroFirst"))) + "</div></div>";

  if (D.answered === null) {
    h += sp.options.map((o, i) => '<button class="dopt" data-i="' + i + '"><span class="kn">' +
      (i + 1) + '</span><span class="kk">' + esc(optLabel(o)) + "</span></button>").join("");
    h += '<div class="small dim" style="margin:2px 0 8px">' + esc(t("drill.keyHint")) + "</div>";
    h += '<div class="row"><div style="flex:0 0 auto"><button class="btn sec sm" id="dr-quit">' + esc(t("drill.quit")) + "</button></div></div>";
  } else {
    const evs = sp.options.map((o) => o.ev);
    const bestEv = Math.max.apply(null, evs), worst = Math.min.apply(null, evs);
    const best = sp.options.find((o) => o.ev === bestEv);
    const mine = sp.options[D.answered];
    const lost = bestEv - mine.ev;
    // Feedback is framed by what actually happened, not always as a loss.
    // A correct fold is a win: say what calling would have cost instead.
    let headline, good = false;
    if (lost < 0.02) {
      good = true;
      const callOpt = sp.options.find((o) => o.key === "call");
      headline = (best.key === "fold" && callOpt)
        ? t("drill.correctFold", { v: nfmt(Math.abs(callOpt.ev), 2) })
        : t("drill.perfect");
    } else if (mine.ev > 0.001) {
      headline = t("drill.profitableButNotBest", { best: esc(optLabel(best)), v: nfmt(lost, 2) });
    } else {
      headline = t("drill.lostEv", { v: nfmt(lost, 2), best: esc(optLabel(best)) });
    }
    h += '<div class="recbox' + (good ? " good" : "") + '"><div class="rl">' + esc(t("common.yourPick")) + "</div>" +
      '<div class="ra">' + esc(optLabel(mine)) + ' <span style="font-size:15px;color:' + (mine.ev >= 0 ? "var(--good)" : "var(--bad)") + '">' + signed(mine.ev) + " BB</span></div>" +
      '<div class="rs">' + headline + "</div>" +
      (lost >= 0.02
        ? '<div class="rs">' + esc(t("drill.spotLoss")) + ' <b style="color:var(--bad)">' + lossText(lost) + " BB</b></div>"
        : "") + "</div>";
    h += '<div class="blk"><div class="t">' + esc(t("drill.evTable")) + "</div>" + evTable(sp.options, mine) +
      '<div class="notice">' + t("drill.rangeNote", { type: esc(vtName(sp.villainType)), n: sp.villainRangeSize }) + "</div></div>";
    h += '<div class="blk"><div class="t">' + esc(t("drill.tipTitle")) + '</div><div class="rx">' + drillTip(sp, mine, best) + "</div></div>";
    h += '<button class="btn" id="dr-next">' + esc(D.i + 1 >= D.n ? t("drill.seeResult") : t("drill.next")) + "</button>";
  }
  v.innerHTML = h + "</div>";

  if (D.answered === null) {
    v.querySelectorAll(".dopt").forEach((b) => (b.onclick = () => answerSpot(+b.dataset.i)));
    $("dr-quit").onclick = () => { D.n = D.i; D.done = true; saveDrill(); renderDrill(); };
  } else {
    $("dr-next").onclick = nextSpot;
  }
}
function storyText(s) {
  return t("drill.story." + s.k, { size: s.size !== undefined ? nfmt(s.size) : "" }) || "";
}
function renderDrillEnd(v) {
  const D = STATE.drill;
  const n = Math.max(1, D.i);
  const perSpot = D.evLost / n;
  const capture = D.evCaptured / n;
  const grade = gradeOf(perSpot);
  // leak detection
  const counts = { passive: 0, aggro: 0, overfold: 0, calldown: 0, sizing: 0 };
  D.log.forEach((l) => {
    if (l.lost < 0.02) return;
    const ba = isAggressive(l.best), ma = isAggressive(l.mine);
    if (ba && !ma) counts.passive++;
    else if (!ba && ma) counts.aggro++;
    else if (l.best !== "fold" && l.mine === "fold") counts.overfold++;
    else if (l.best === "fold" && l.mine === "call") counts.calldown++;
    else counts.sizing++;
  });
  const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const leakText = counts[top] > 0 ? t("drill.leak" + top[0].toUpperCase() + top.slice(1)) : t("drill.endNoLeak");

  let h = '<div class="card"><h2>' + esc(t("drill.endTitle")) + "</h2>" +
    '<div class="score"><div class="ring" style="--p:' + Math.round(D.correct / n * 100) + '"><b>' +
      Math.round(D.correct / n * 100) + "%</b></div>" +
    '<div><div class="small muted">' + esc(t("drill.grade")) + '</div><div class="gv">' + grade + "</div>" +
    '<div class="small dim">' + esc(t("drill.endAccuracy")) + "</div></div></div>" +
    '<div class="kpi">' +
      '<div class="k"><div class="kk">' + esc(t("drill.endSpots")) + '</div><div class="kv">' + D.i + "</div></div>" +
      '<div class="k"><div class="kk">' + esc(t("drill.endEvLost")) + '</div><div class="kv">' + lossText(D.evLost) + "</div></div>" +
      '<div class="k"><div class="kk">' + esc(t("drill.endPerSpot")) + '</div><div class="kv">' + lossText(perSpot) + "</div></div>" +
      '<div class="k"><div class="kk">' + esc(t("drill.endCapture")) + '</div><div class="kv">' + Math.round(capture * 100) + "%</div></div>" +
    "</div>" +
    '<div class="blk warn" style="margin-top:14px"><div class="t">' + esc(t("drill.endLeak")) + "</div><p>" + esc(leakText) + "</p></div>";
  // per-spot review
  h += '<div class="blk sumcard"><div class="t">' + esc(t("drill.endByAction")) + "</div>" +
    D.log.map((l, i) => '<div class="sr"><span class="n">' + (i + 1) + "</span>" +
      '<span class="a">' + esc(l.mineLabel) + (l.lost < 0.02 ? "" : " → <b>" + esc(l.bestLabel) + "</b>") + "</span>" +
      '<span class="z" style="color:' + (l.lost < 0.02 ? "var(--good)" : "var(--bad)") + '">' +
      (l.lost < 0.02 ? "✓" : lossText(l.lost) + "BB") + "</span></div>").join("") + "</div>";
  h += '<div class="row" style="margin-top:12px">' +
    '<div style="flex:0 0 auto"><button class="btn" id="dr-again">' + esc(t("drill.again")) + "</button></div>" +
    '<div style="flex:0 0 auto"><button class="btn sec" id="dr-home">' + esc(t("drill.home")) + "</button></div></div></div>";
  v.innerHTML = h;
  $("dr-again").onclick = () => startDrill(drillConfig());
  $("dr-home").onclick = () => { STATE.drill = null; renderDrill(); };
}
function drillHistoryHTML() {
  const hist = DB.get("drills", []);
  if (!hist.length) return "";
  return '<div class="card"><h3>' + esc(t("drill.history")) + "</h3>" +
    '<div class="scrollx"><table class="tstack"><tr><th>' + esc(t("stats.date")) + "</th><th>" +
    esc(t("drill.endSpots")) + "</th><th>" + esc(t("drill.endCapture")) + "</th><th>" + esc(t("drill.endEvLost")) + "</th></tr>" +
    hist.slice(0, 8).map((d) => "<tr><td data-l=\"" + esc(t("stats.date")) + "\">" + new Date(d.at).toLocaleDateString() + "</td>" +
      '<td data-l="' + esc(t("drill.endSpots")) + '">' + d.n + "</td>" +
      '<td data-l="' + esc(t("drill.endCapture")) + '">' + Math.round((d.capture || 0) * 100) + "%</td>" +
      '<td data-l="' + esc(t("drill.endEvLost")) + '">' + lossText(d.evLost) + "BB</td></tr>").join("") +
    "</table></div></div>";
}

/* ============================================================ RANGE LAB == */
const RANGE_STATE = { pos: "BTN", hand: "", vs: "top20", custom: "22+ A9s+ KTs+ AJo+", board: "" };
function renderRange() {
  const v = $("v-range");
  const seats = setupSeats();
  const L = PE.posList(seats).filter((p) => PE.rfiRange(seats, p).length);
  if (L.indexOf(RANGE_STATE.pos) < 0) RANGE_STATE.pos = L[L.length - 1];
  const chart = PE.rfiRange(seats, RANGE_STATE.pos);
  let h = '<div class="card"><h2>' + esc(t("range.h1")) + "</h2><p>" + esc(t("range.lead")) + "</p></div>";
  h += '<div class="card"><h3>' + esc(t("range.chartTitle")) + "</h3>" +
    '<div class="bg" id="rg-pos" style="display:flex;margin-bottom:10px">' +
    L.map((p) => '<button data-p="' + p + '" class="' + (RANGE_STATE.pos === p ? "on" : "") + '">' + esc(posName(p)) + "</button>").join("") + "</div>" +
    '<div class="small muted" style="margin-bottom:8px">' + esc(t("range.chartSub", {
      seats: seats + "-max", pos: posName(RANGE_STATE.pos), pct: nfmt(PE.rangePct(chart)) })) + "</div>" +
    gridHTML(chart, null) + "</div>";
  h += '<div class="card"><h3>' + esc(t("range.calcTitle")) + "</h3>" +
    '<div class="grid g3">' +
    '<div><label>' + esc(t("range.myHand")) + '</label><input id="rg-hand" value="' + esc(RANGE_STATE.hand) + '" placeholder="AsKd"></div>' +
    '<div><label>' + esc(t("range.vsRange")) + '</label><input id="rg-range" value="' + esc(RANGE_STATE.custom) + '"></div>' +
    '<div><label>' + esc(t("range.boardOpt")) + '</label><input id="rg-board" value="' + esc(RANGE_STATE.board) + '" placeholder="Kh7s2d"></div>' +
    "</div>" +
    '<div class="small dim" style="margin-top:6px">' + esc(t("range.rangeHint")) + "</div>" +
    '<div class="row" style="margin-top:12px"><div style="flex:0 0 auto"><button class="btn" id="rg-go">' + esc(t("range.calc")) + "</button></div></div>" +
    '<div id="rg-out"></div></div>';
  v.innerHTML = h;
  v.querySelectorAll("#rg-pos button").forEach((b) => (b.onclick = () => { RANGE_STATE.pos = b.dataset.p; renderRange(); }));
  $("rg-go").onclick = runRangeCalc;
}
function parseCards(str) {
  const out = [];
  String(str || "").replace(/\s+/g, "").replace(/([2-9TJQKAtjqka])([shdcSHDC])/g, (m, r, s) => {
    out.push(PE.cardId(r.toUpperCase(), s.toLowerCase())); return "";
  });
  return out.filter((c) => c >= 0 && c < 52);
}
function runRangeCalc() {
  RANGE_STATE.hand = $("rg-hand").value;
  RANGE_STATE.custom = $("rg-range").value;
  RANGE_STATE.board = $("rg-board").value;
  const hole = parseCards(RANGE_STATE.hand), board = parseCards(RANGE_STATE.board);
  const classes = PE.parseRange(RANGE_STATE.custom);
  const out = $("rg-out");
  if (hole.length !== 2 || !classes.length) { out.innerHTML = '<div class="notice">' + esc(t("range.invalidRange")) + "</div>"; return; }
  if (new Set(hole.concat(board)).size !== hole.length + board.length) { out.innerHTML = '<div class="notice">' + esc(t("range.invalidRange")) + "</div>"; return; }
  out.innerHTML = '<div class="empty">' + esc(t("common.loading")) + "</div>";
  setTimeout(() => {
    const combos = PE.expandRange(classes, hole.concat(board));
    const table = PE.matchupTable(hole, board, combos, { rnd: PE.mulberry32(1) });
    const eq = PE.weightedEquity(table, new Float64Array(table.combos.length).fill(1)).eq;
    out.innerHTML = '<div class="blk hi" style="margin-top:12px"><div class="t">' + esc(t("range.result")) + "</div>" +
      "<p>" + hole.map((c) => cardHTML(c, true)).join("") +
      (board.length ? ' <span class="dim">/</span> ' + board.map((c) => cardHTML(c, true)).join("") : "") + "</p>" +
      "<p>" + t("range.eqResult", { eq: pct(eq), n: table.combos.length }) + "</p></div>" +
      gridHTML(classes, PE.handClass(hole[0], hole[1]));
  }, 20);
}

/* ============================================================ STATS ====== */
function renderStats() {
  const v = $("v-stats");
  const hands = DB.get("hands", []), drills = DB.get("drills", []);
  if (!hands.length && !drills.length) {
    v.innerHTML = '<div class="card"><h2>' + esc(t("stats.h1")) + '</h2><div class="empty">' + esc(t("stats.noData")) + "</div></div>";
    return;
  }
  const avgCapture = drills.length ? drills.reduce((a, d) => a + (d.capture || 0), 0) / drills.length : 0;
  let h = '<div class="card"><h2>' + esc(t("stats.h1")) + "</h2>" +
    '<div class="kpi">' +
    '<div class="k"><div class="kk">' + esc(t("stats.totalHands")) + '</div><div class="kv">' + hands.length + "</div></div>" +
    '<div class="k"><div class="kk">' + esc(t("stats.totalDrills")) + '</div><div class="kv">' + drills.length + "</div></div>" +
    '<div class="k"><div class="kk">' + esc(t("stats.avgCapture")) + '</div><div class="kv">' + Math.round(avgCapture * 100) + "%</div></div>" +
    "</div></div>";
  // aggregate leaks across drill logs
  const counts = { passive: 0, aggro: 0, overfold: 0, calldown: 0, sizing: 0 };
  let total = 0;
  drills.forEach((d) => (d.log || []).forEach((l) => {
    if (l.lost < 0.02) return;
    total++;
    const ba = isAggressive(l.best), ma = isAggressive(l.mine);
    if (ba && !ma) counts.passive++;
    else if (!ba && ma) counts.aggro++;
    else if (l.best !== "fold" && l.mine === "fold") counts.overfold++;
    else if (l.best === "fold" && l.mine === "call") counts.calldown++;
    else counts.sizing++;
  }));
  h += '<div class="card"><h3>' + esc(t("stats.leakTitle")) + "</h3>";
  if (total < 5) h += '<div class="notice">' + esc(t("stats.leakNone")) + "</div>";
  else {
    h += Object.keys(counts).filter((k) => counts[k]).sort((a, b) => counts[b] - counts[a]).map((k) =>
      '<div class="axis"><div class="lb"><span>' + esc(t("drill.leak" + k[0].toUpperCase() + k.slice(1))) + "</span><b>" +
      Math.round(counts[k] / total * 100) + "%</b></div>" +
      '<div class="bar"><i style="width:' + Math.round(counts[k] / total * 100) + '%"></i></div></div>').join("");
  }
  h += "</div>";
  if (hands.length) {
    h += '<div class="card"><h3>' + esc(t("stats.handsTitle")) + '</h3><div class="scrollx"><table class="tstack">' +
      "<tr><th>" + esc(t("stats.date")) + "</th><th>" + esc(t("common.hand")) + "</th><th>" + esc(t("stats.spot")) + "</th><th>" + esc(t("stats.evLost")) + "</th><th></th></tr>" +
      hands.slice(0, 40).map((x, i) => {
        const lost = (x.streets || []).reduce((a, s) => a + (s.evLost || 0), 0);
        return "<tr><td data-l=\"" + esc(t("stats.date")) + "\">" + new Date(x.at).toLocaleDateString() + "</td>" +
          '<td data-l="' + esc(t("common.hand")) + '">' + esc(x.cls) + "</td>" +
          '<td data-l="' + esc(t("stats.spot")) + '">' + esc(posName(x.pos)) + " vs " + esc(posName(x.vpos)) + "</td>" +
          '<td data-l="' + esc(t("stats.evLost")) + '">' + lossText(lost) + "BB</td>" +
          '<td><button class="btn sec sm" data-del="' + i + '">' + esc(t("stats.delete")) + "</button></td></tr>";
      }).join("") + "</table></div></div>";
  }
  h += drillHistoryHTML();
  v.innerHTML = h;
  v.querySelectorAll("button[data-del]").forEach((b) => (b.onclick = () => {
    if (!confirm(t("stats.confirmDelete"))) return;
    const arr = DB.get("hands", []); arr.splice(+b.dataset.del, 1); DB.set("hands", arr); renderStats(); renderHome();
  }));
}

/* ============================================================ HOME ======= */
function renderHome() {
  const v = $("v-home");
  const p = getProfile(), hands = DB.get("hands", []), drills = DB.get("drills", []);
  let h = '<div class="card"><h1>' + esc(t("home.h1")) + "</h1><p>" + t("home.lead") + "</p>" +
    '<div class="homecta">' +
      '<button data-go="quiz"><div class="ct">' + esc(t("home.cta1")) + '</div><div class="cd">' + esc(t("home.cta1d")) + "</div></button>" +
      '<button data-go="hand"><div class="ct">' + esc(t("home.cta2")) + '</div><div class="cd">' + esc(t("home.cta2d")) + "</div></button>" +
      '<button data-go="drill"><div class="ct">' + esc(t("home.cta3")) + '</div><div class="cd">' + esc(t("home.cta3d")) + "</div></button>" +
    "</div></div>";
  if (p) h += profileCard(p);
  else h += '<div class="card"><h3>' + esc(t("home.profileTitle")) + '</h3><div class="empty">' + esc(t("home.noProfile")) + "</div></div>";
  if (drills.length) {
    const last = drills[0];
    h += '<div class="card"><h3>' + esc(t("home.drillSummary")) + "</h3>" +
      '<div class="kpi"><div class="k"><div class="kk">' + esc(t("drill.endSpots")) + '</div><div class="kv">' + last.n + "</div></div>" +
      '<div class="k"><div class="kk">' + esc(t("drill.endCapture")) + '</div><div class="kv">' + Math.round((last.capture || 0) * 100) + "%</div></div>" +
      '<div class="k"><div class="kk">' + esc(t("drill.endPerSpot")) + '</div><div class="kv">' + lossText(last.evLost / Math.max(1, last.n)) + "</div></div></div></div>";
  }
  v.innerHTML = h;
  v.querySelectorAll("button[data-go]").forEach((b) => (b.onclick = () => go(b.dataset.go)));
}

/* ============================================================ HELP ======= */
function renderHelp() {
  const v = $("v-help");
  v.innerHTML = '<div class="card"><h2>' + esc(t("help.h1")) + "</h2>" +
    "<h3>" + esc(t("help.whatTitle")) + "</h3><p>" + t("help.whatBody") + "</p>" +
    '<h3 style="margin-top:16px">' + esc(t("help.mathTitle")) + "</h3>" +
    '<ul class="muted" style="padding-left:18px">' +
      "<li>" + t("help.mathExact") + "</li><li>" + t("help.mathEquity") + "</li>" +
      "<li>" + t("help.mathModel") + "</li><li>" + t("help.mathRec") + "</li></ul>" +
    '<h3 style="margin-top:16px">' + esc(t("help.fixTitle")) + "</h3><p>" + t("help.fixBody") + "</p>" +
    '<h3 style="margin-top:16px">' + esc(t("help.dataTitle")) + "</h3><p>" + t("help.dataBody") + "</p>" +
    '<div class="row" style="margin-top:10px">' +
      '<div style="flex:0 0 auto"><button class="btn sec sm" id="ex-json">' + esc(t("help.exportBtn")) + "</button></div>" +
      '<div style="flex:0 0 auto"><button class="btn sec sm" id="im-json">' + esc(t("help.importBtn")) + "</button></div>" +
      '<div style="flex:0 0 auto"><button class="btn sec sm" id="rs-all">' + esc(t("help.resetBtn")) + "</button></div>" +
    "</div>" +
    '<input type="file" id="im-file" accept=".json" style="display:none"><hr>' +
    '<p class="small dim">' + esc(t("help.disclaimer")) + "</p>" +
    '<p class="small dim">' + esc(t("help.responsible")) + "</p></div>";
  $("ex-json").onclick = exportData;
  $("im-json").onclick = () => $("im-file").click();
  $("im-file").onchange = importData;
  $("rs-all").onclick = () => {
    if (!confirm(t("help.confirmReset"))) return;
    ["profile", "hands", "drills", "setup", "drillcfg"].forEach(DB.del);
    toast(t("common.done")); renderHome(); renderHelp();
  };
}
function exportData() {
  const data = {};
  ["profile", "hands", "drills", "setup", "drillcfg", "lang", "theme"].forEach((k) => (data[k] = DB.get(k, null)));
  const blob = new Blob([JSON.stringify({ app: "holdem-studio", v: 2, at: Date.now(), data }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "holdem-studio-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click(); URL.revokeObjectURL(a.href);
  toast(t("help.exported"));
}
function importData(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      const d = j.data || j;
      Object.keys(d).forEach((k) => { if (d[k] !== null && d[k] !== undefined) DB.set(k, d[k]); });
      toast(t("help.imported"));
      if (d.lang) setLang(d.lang); else { renderChrome(); renderView(STATE.view); }
    } catch (err) { toast(t("help.importFail")); }
  };
  r.readAsText(f);
  e.target.value = "";
}

/* ============================================================ BOOT ======= */
function fillDemo() {
  const C = (s) => PE.cardId(s[0], s[1]);
  HI.pos = "BTN"; HI.vpos = "BB"; HI.scenario = "open_call"; HI.vt = "tag";
  HI.c = { h0: C("As"), h1: C("Ks"), f0: C("Qs"), f1: C("7h"), f2: C("2d"), t0: C("9s"), r0: null };
  HI.acts = [{ v: "check", vs: 0, m: "bet", ms: 2 }, { v: "bet", vs: 6, m: "call", ms: 0 }, { v: "check", vs: 0, m: "check", ms: 0 }];
  HI.target = "r0";
  buildHandInputs();
}
function clearHand() {
  SLOTS.forEach((k) => (HI.c[k] = null));
  HI.acts = [{ v: "check", vs: 0, m: "check", ms: 0 }, { v: "check", vs: 0, m: "check", ms: 0 }, { v: "check", vs: 0, m: "check", ms: 0 }];
  HI.target = "h0";
  buildHandInputs(); $("h-out").innerHTML = "";
}
function boot() {
  document.documentElement.setAttribute("data-theme", DB.get("theme", "dark"));
  const meta = I18N.lookup(LANG, "meta") || {};
  document.documentElement.lang = meta.htmlLang || LANG;
  document.title = t("app.docTitle");
  renderChrome();
  renderStaticLabels();

  $("langsel").onchange = (e) => setLang(e.target.value);
  $("themebtn").onclick = toggleTheme;
  $("s-save").onclick = saveSetup;
  ["s-seats", "s-stack", "s-bl", "s-br"].forEach((id) => {
    const el = $(id); if (el) el.onchange = () => { renderBankroll(); if (id === "s-seats") buildHandInputs(); };
  });
  $("h-run").onclick = () => { const r = analyzeHand(); if (r) { STATE.analysis = r; renderAnalysis(r); $("h-out").scrollIntoView({ behavior: "smooth", block: "start" }); } };
  $("h-clear").onclick = clearHand;
  $("h-demo").onclick = fillDemo;

  // keyboard shortcuts for the drill
  document.addEventListener("keydown", (e) => {
    if (STATE.view !== "drill" || !STATE.drill || STATE.drill.done) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
    const D = STATE.drill;
    if (D.answered === null && /^[1-9]$/.test(e.key)) {
      const i = +e.key - 1;
      if (D.cur && i < D.cur.options.length) { e.preventDefault(); answerSpot(i); }
    } else if (D.answered !== null && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault(); nextSpot();
    }
  });

  loadSetup();
  go("home");
}
document.addEventListener("DOMContentLoaded", boot);
