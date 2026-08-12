/* =============================================================================
 * app.js — UI layer. All poker maths lives in engine.js; all text in i18n.js.
 * ========================================================================== */
"use strict";

/* ------------------------------------------------------------- storage --- */
/* Storage is not guaranteed: a sandboxed iframe, private browsing, or a
 * blocked-cookies setting all make localStorage throw. The old wrapper
 * swallowed that silently, so the app looked like it was saving while nothing
 * ever persisted. Probe once, fall back to memory so the session still works,
 * and expose `persistent` so the UI can say so out loud. */
const DB = (function () {
  let persistent = false;
  try {
    const probe = "hb.__probe";
    localStorage.setItem(probe, "1");
    persistent = localStorage.getItem(probe) === "1";
    localStorage.removeItem(probe);
  } catch (e) { persistent = false; }

  const mem = new Map();
  const memStore = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, v); },
    removeItem: (k) => { mem.delete(k); }
  };
  const store = () => (persistent ? localStorage : memStore);

  return {
    get persistent() { return persistent; },
    get(k, d) {
      try { const v = store().getItem("hb." + k); return v === null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set(k, v) {
      const body = JSON.stringify(v);
      try { store().setItem("hb." + k, body); return true; }
      catch (e) {
        // out of quota or storage revoked mid-session: keep the app usable
        persistent = false;
        try { memStore.setItem("hb." + k, body); } catch (_) {}
        return false;
      }
    },
    del(k) { try { store().removeItem("hb." + k); } catch (e) {} }
  };
})();

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
  renderChrome(); renderStaticLabels(); renderStorageBar(); loadSetup(); renderView(STATE.view);
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
const vtShort = (id) => t("villain." + id + ".s") || vtName(id);
const posName = (p) => t("positions." + p) || p;

/* ------------------------------------------------------------------ state - */
const STATE = { view: "home", quiz: null, drill: null, analysis: null };

/* ============================================================ CHROME ===== */
const VIEWS = ["home", "quiz", "hand", "stats", "drill", "range", "tour", "help"];
function renderStorageBar() {
  const el = $("storagebar");
  if (!el) return;
  if (DB.persistent) { el.innerHTML = ""; return; }
  el.innerHTML = '<div class="wrap" style="padding-top:12px;padding-bottom:0">' +
    '<div class="blk warn" style="margin:0"><div class="t">' + esc(t("storage.offTitle")) + "</div>" +
    "<p style=\"margin:0 0 6px\">" + esc(t("storage.offBody")) + "</p>" +
    '<button class="btn sec sm" id="sb-export">' + esc(t("help.exportBtn")) + "</button></div></div>";
  const b = $("sb-export"); if (b) b.onclick = exportData;
}
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
  applyTheme();
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
     drill: renderDrill, range: renderRange, tour: renderTour, help: renderHelp }[v] || (() => {}))();
}
/* Effective theme: the viewer's explicit choice if they made one, otherwise
   whatever the OS asks for. Only an explicit choice stamps data-theme, which
   is what lets the CSS media query take over by default. */
function effectiveTheme() {
  const stored = DB.get("theme", null);
  if (stored) return stored;
  return (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
}
function applyTheme() {
  const stored = DB.get("theme", null);
  if (stored) document.documentElement.setAttribute("data-theme", stored);
  else document.documentElement.removeAttribute("data-theme");
  const btn = $("themebtn");
  if (btn) {
    const now = effectiveTheme();
    btn.textContent = now === "dark" ? "☀" : "☾";
    btn.setAttribute("aria-label", now === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }
}
function toggleTheme() {
  DB.set("theme", effectiveTheme() === "dark" ? "light" : "dark");
  applyTheme();
}

/* ============================================================ PROFILE ==== */
const AXIS_KEYS = ["A1", "A2", "A3", "A4", "A5", "B1", "B2"];
const CORE_AXES = ["A1", "A2", "A3", "A4", "A5", "B1"];
const QMIN = 25;
const getProfile = () => DB.get("profile", null);

/* --------------------------------------------------------- play profile --
 * The quiz asks what you think you do. This records what you actually did,
 * so the profile keeps moving as you practise. Only the axes that play can
 * evidence are touched: how often you take the aggressive line, how often you
 * fold, and how often you pick the biggest size — each measured against what
 * the best line would have done in the same spots, so the baseline is the
 * spot mix and not your own taste. */
const blankPlay = () => ({ picks: 0, aggr: 0, bestAggr: 0, facing: 0, folds: 0, bestFolds: 0, big: 0, bestBig: 0 });
const getPlay = () => Object.assign(blankPlay(), DB.get("playstats", null) || {});

function recordPlay(opts, mine, best, facing) {
  const st = getPlay();
  st.picks++;
  if (isAggressive(mine.key)) st.aggr++;
  if (isAggressive(best.key)) st.bestAggr++;
  if (facing) {
    st.facing++;
    if (mine.key === "fold") st.folds++;
    if (best.key === "fold") st.bestFolds++;
  }
  // "big" = the largest sizing offered, or an all-in
  const sizes = opts.filter((o) => o.amount > 0).map((o) => o.amount);
  const maxSize = sizes.length ? Math.max.apply(null, sizes) : 0;
  if (maxSize > 0) {
    if (mine.amount >= maxSize - 1e-9) st.big++;
    if (best.amount >= maxSize - 1e-9) st.bestBig++;
  }
  DB.set("playstats", st);
}

/** Axis deltas implied by play, relative to what the best line would do. */
function playAxes(st) {
  if (!st || st.picks < 8) return null;
  const w = Math.min(1, st.picks / 60);          // confidence grows with sample
  const rate = (a, b) => (b > 0 ? a / b : 0);
  const d = {};
  d.A2 = Math.max(-60, Math.min(60, (rate(st.aggr, st.picks) - rate(st.bestAggr, st.picks)) * 220 * w));
  if (st.facing >= 5) {
    // folding MORE than optimal means lower resistance to pressure
    d.A4 = Math.max(-60, Math.min(60, (rate(st.bestFolds, st.facing) - rate(st.folds, st.facing)) * 220 * w));
  }
  d.A3 = Math.max(-50, Math.min(50, (rate(st.big, st.picks) - rate(st.bestBig, st.picks)) * 200 * w));
  Object.keys(d).forEach((k) => (d[k] = Math.round(d[k])));
  return { deltas: d, picks: st.picks, weight: w };
}
/** The profile actually used everywhere: answers, moved by observed play. */
function effectiveProfile() {
  const p = getProfile();
  const play = playAxes(getPlay());
  if (!p) return play ? { axes: playAxesOnly(play), conf: {}, n: 0, archetype: null, play, derived: true } : null;
  if (!play) return Object.assign({}, p, { play: null });
  const axes = Object.assign({}, p.axes);
  Object.keys(play.deltas).forEach((k) => {
    axes[k] = Math.max(-100, Math.min(100, Math.round((axes[k] || 0) + play.deltas[k])));
  });
  return Object.assign({}, p, { axes, play });
}
/** With no quiz answers, play alone still says something about a few axes. */
function playAxesOnly(play) {
  const axes = {};
  AXIS_KEYS.forEach((k) => (axes[k] = 0));
  Object.keys(play.deltas).forEach((k) => (axes[k] = play.deltas[k]));
  return axes;
}

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
function axisBar(k, v, conf, delta) {
  const A = t("axes." + k), left = (v + 100) / 2;
  return '<div class="axis"><div class="lb"><span>' + esc(A.lo) + "</span><b>" + esc(A.n) +
    " <span class=\"dim\">" + (v > 0 ? "+" : "") + v + "</span>" +
    (delta ? ' <span class="pill m" style="font-size:10px">' + esc(delta) + " " + esc(t("quiz.playAdjusted")) + "</span>" : "") +
    "</b><span>" + esc(A.hi) + "</span></div>" +
    '<div class="axbar"><u></u><i style="left:calc(' + left + '% - 2px)"></i></div>' +
    '<div class="small dim">' + esc(A.d) + (conf !== undefined && conf < 0.5 ? " · " + esc(t("quiz.lowConf")) : "") + "</div></div>";
}
function renderQuiz() {
  const v = $("v-quiz");
  const qz = STATE.quiz;
  if (!qz) {
    // Branch on whether the ASSESSMENT was taken, not on whether we have any
    // signal: play alone yields a partial profile, but it is not a substitute
    // for the questions and must not present itself as one.
    const answered = getProfile();
    const p = effectiveProfile();
    let h;
    if (answered) {
      // A saved profile is the point of this screen; retaking is secondary.
      h = profileCard(p) +
        '<div class="card"><div class="small dim" style="margin-bottom:8px">' +
          (answered.at ? esc(t("quiz.savedAt", { d: new Date(answered.at).toLocaleDateString() })) + " · " : "") +
          esc(t("quiz.savedNote")) + "</div>" +
        '<button class="btn sec" id="qz-go">' + esc(t("quiz.restart")) + "</button>" +
        '<div class="notice">' + esc(t("quiz.retakeWarn")) + "</div></div>";
    } else {
      h = '<div class="card"><h2>' + esc(t("quiz.noneTitle")) + "</h2>" +
        "<p>" + esc(t("quiz.noneBody")) + "</p><p>" + t("quiz.lead", { min: QMIN }) + "</p>" +
        '<div style="margin-top:14px"><button class="btn" id="qz-go">' + esc(t("quiz.startDiagnose")) + "</button></div></div>";
      // play on its own still says something — show it, clearly labelled
      if (p && p.play) h += profileCard(p, true);
    }
    v.innerHTML = h;
    $("qz-go").onclick = () => { STATE.quiz = { asked: [], ans: {}, cur: null }; STATE.quiz.cur = nextQuestion(STATE.quiz); renderQuiz(); };
    return;
  }
  if (qz.done) {
    saveProfile(qz);
    v.innerHTML = profileCard(effectiveProfile()) +
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
function profileCard(p, playOnly) {
  const play = p.play;
  let h = '<div class="card"><h2>' +
    esc(playOnly ? t("quiz.playOnlyTitle") : t("quiz.resultTitle")) + "</h2>" +
    (playOnly ? "<p>" + t("quiz.playOnlyNote") + "</p>" : "") +
    '<div class="stmeta">' +
    // an archetype needs the questions; play alone cannot name one
    (playOnly ? "" : '<span>' + esc(t("quiz.archetype")) + " <b>" +
      esc(p.archetype || archetype(p.axes)) + "</b></span>") +
    (p.n ? "<span>" + esc(t("quiz.sample", { n: p.n })) + "</span>" : "") +
    (play ? '<span>' + esc(t("quiz.playAdjusted")) + " <b>" + play.picks + "</b></span>" : "") +
    "</div>" +
    '<div class="blk"><div class="t">' + esc(t("quiz.axesTitle")) + "</div>" +
    AXIS_KEYS.filter((k) => !playOnly || (play && play.deltas[k] !== undefined)).map((k) => {
      const moved = play && play.deltas[k] !== undefined && play.deltas[k] !== 0;
      return axisBar(k, p.axes[k] || 0, p.conf ? p.conf[k] : undefined,
        moved ? (play.deltas[k] > 0 ? "+" : "") + play.deltas[k] : null);
    }).join("") +
    '<div class="small dim">' + esc(t("quiz.playAxisNote")) + "</div></div>";

  // what the table actually showed
  h += '<div class="blk ' + (play ? "vx" : "") + '"><div class="t">' + esc(t("quiz.playTitle")) + "</div>";
  if (!play) h += '<p class="small dim">' + esc(t("quiz.playNone")) + "</p>";
  else {
    h += "<p>" + t("quiz.playNote", { n: play.picks }) + "</p><ul style=\"padding-left:18px;margin:0\">" +
      (play.deltas.A2 >= 8 ? "<li>" + esc(t("quiz.playMoreAggr")) + "</li>"
        : play.deltas.A2 <= -8 ? "<li>" + esc(t("quiz.playLessAggr")) + "</li>" : "") +
      (play.deltas.A4 !== undefined && play.deltas.A4 <= -8 ? "<li>" + esc(t("quiz.playMoreFold")) + "</li>"
        : play.deltas.A4 >= 8 ? "<li>" + esc(t("quiz.playLessFold")) + "</li>" : "") +
      (Math.abs(play.deltas.A2) < 8 && Math.abs(play.deltas.A4 || 0) < 8
        ? "<li>" + esc(t("quiz.playOnPoint")) + "</li>" : "") + "</ul>";
  }
  h += "</div>";

  if (!playOnly) {
    h += '<div class="blk hi"><div class="t">' + esc(t("quiz.summaryTitle")) + "</div>" +
      profileNotes(p.axes).map((x) => "<p>" + x + "</p>").join("") + "</div>";
  }
  return h + "</div>";
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
/** "cash" | "mtt" | "sng". Anything but cash is played on a prize ladder. */
const setupGame = () => ($("s-gt") ? $("s-gt").value : "cash") || "cash";
const setupAnte = () => Math.max(0, +($("s-ante") ? $("s-ante").value : 0) || 0);
const MAX_PRACTICE_BB = 500;   // nobody plays deeper than this; beyond it the value is a typo
const rawStack = () => +($("s-stack") ? $("s-stack").value : 100) || 100;
/** Stack in BB, clamped to something a real game could produce. */
const setupStack = () => Math.max(2, Math.min(MAX_PRACTICE_BB, rawStack()));
function blindSize() {
  const parts = (($("s-bl") ? $("s-bl").value : "") || "").split("/");
  const bb = +(parts[1] || parts[0] || 0);
  return bb > 0 ? bb : 0;
}
/** Live feedback under the stack field so BB-vs-chips can't be confused. */
function renderStackHint() {
  const el = $("stack-hint"); if (!el) return;
  const bb = rawStack(), unit = blindSize();
  let h = "";
  if (unit) {
    h += '<div class="small dim">' + esc(t("hand.stackHint", {
      bb: nfmt(bb, 0), chips: (bb * unit).toLocaleString(), bl: ($("s-bl").value || "")
    })) + "</div>";
  }
  if (bb > MAX_PRACTICE_BB) {
    h += '<div class="blk warn" style="margin:6px 0 0"><p style="margin:0 0 4px">' + t("hand.stackTooDeep") + "</p>" +
      '<div class="small dim">' + esc(t("hand.stackClamped", { n: MAX_PRACTICE_BB })) + "</div></div>";
  }
  el.innerHTML = h;
}

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
  pos: "BTN", vpos: "BB", scenario: "open_call", target: "h0", vt: "unknown",
  // seat -> opponent type. Several seats may share a type; only the seat named
  // by `vpos` is the opponent the heads-up maths actually runs against.
  seated: { BB: "unknown" },
  paint: "unknown",
  // how much actually went in preflop — these drive the pot, the SPR and every
  // downstream EV, instead of the fixed pot each scenario used to carry.
  sizes: { open: 2.5, threeBet: 9, fourBet: 22, limpers: 2, allin: 20, toCall: 20 },
  shover: "villain",
  stage: "middle",          // only read when the setup's game type is not cash
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
function paletteItems() {
  // No "empty" brush: tapping a seat that already holds the selected type
  // clears it, and the button under the map empties the whole table.
  return [{ k: "me", label: t("hand.paintMe") }]
    .concat(Object.keys(PE.VILLAIN_TYPES).map((k) => ({ k, label: vtName(k) })));
}
function seatedOpponents() {
  return PE.posList(setupSeats()).filter((p) => p !== HI.pos && HI.seated[p]);
}
/** Keep the designated opponent and HI.vt consistent with what is on the table. */
function syncVillain() {
  const seated = seatedOpponents();
  if (!seated.length) { HI.vpos = null; HI.vt = "unknown"; return; }
  if (seated.indexOf(HI.vpos) < 0) HI.vpos = seated[0];
  HI.vt = HI.seated[HI.vpos] || "unknown";
}
function renderSeatPalette() {
  const el = $("seat-palette");
  if (!el) return;
  el.innerHTML = paletteItems().map((it) =>
    '<button data-k="' + esc(it.k) + '" class="' + (HI.paint === it.k ? "on" : "") + '">' +
    esc(it.label) + "</button>").join("");
  el.querySelectorAll("button").forEach((b) => (b.onclick = () => { HI.paint = b.dataset.k; renderSeatPalette(); }));
}
/** Empty every opponent seat in one go. Hero keeps a seat — a hand needs one. */
function renderSeatTools() {
  const el = $("seat-tools");
  if (!el) return;
  const n = seatedOpponents().length;
  el.innerHTML = '<button class="btn sec sm" id="seat-reset"' + (n ? "" : " disabled") + ">" +
    esc(t("hand.clearSeats")) + "</button>";
  const b = $("seat-reset");
  if (b && n) b.onclick = () => {
    HI.seated = {}; HI.vpos = null; HI.vt = "unknown";
    buildHandInputs(); toast(t("hand.seatsCleared"));
  };
}
function renderSeats() {
  const el = $("seat-map"), L = PE.posList(setupSeats());
  // drop anything seated at a position this table size does not have
  Object.keys(HI.seated).forEach((p) => { if (L.indexOf(p) < 0) delete HI.seated[p]; });
  if (L.indexOf(HI.pos) < 0) HI.pos = L[L.length - 3] || L[0];
  delete HI.seated[HI.pos];
  syncVillain();

  const btn = Math.max(0, L.indexOf("BTN") >= 0 ? L.indexOf("BTN") : L.length - 3);
  let h = '<div class="felt"></div>';
  L.forEach((p, i) => {
    const ang = (90 + (i - btn) * (360 / L.length)) * Math.PI / 180;
    const x = 50 + 46 * Math.cos(ang), y = 50 + 42 * Math.sin(ang);
    const isMe = HI.pos === p, type = HI.seated[p];
    const cls = isMe ? "me" : type ? "vil" : "";
    const tag = isMe ? t("hand.paintMe") : type ? vtShort(type) : "";
    h += '<button class="seat ' + cls + (HI.vpos === p ? " active" : "") + '" data-p="' + p + '" ' +
      'style="left:' + x + "%;top:" + y + '%" title="' + esc(isMe ? t("hand.paintMe") : type ? vtName(type) : "") + '">' +
      "<b>" + (tag ? esc(tag) : "&nbsp;") + "</b>" + esc(posName(p)) + "</button>";
  });
  el.innerHTML = h;
  el.querySelectorAll(".seat").forEach((b) => (b.onclick = () => {
    const p = b.dataset.p;
    if (HI.paint === "me") { delete HI.seated[p]; HI.pos = p; }
    else if (HI.pos === p) return;
    else if (HI.seated[p] === HI.paint) { delete HI.seated[p]; }   // tap again to clear
    else { HI.seated[p] = HI.paint; if (!HI.vpos) HI.vpos = p; }
    buildHandInputs();
  }));
  updateSeatHint();
  renderSeatTools();
}
function updateSeatHint() {
  const n = seatedOpponents().length;
  $("seat-hint").textContent = t("hand.paintMe") + " · " + posName(HI.pos) +
    "  ·  " + t("hand.seatedCount", { n });
}
/** Which seated opponent this hand is actually against. */
function renderVillainChips() {
  const el = $("vt-chips");
  const seated = seatedOpponents();
  if (!seated.length) {
    el.innerHTML = '<span class="small dim">' + esc(t("hand.seatedNone")) + "</span>";
    $("vt-desc").textContent = "";
    return;
  }
  el.innerHTML = seated.map((p) =>
    '<button data-p="' + p + '" class="' + (HI.vpos === p ? "on" : "") + '">' +
    esc(posName(p)) + " · " + esc(vtName(HI.seated[p])) + "</button>").join("");
  el.querySelectorAll("button").forEach((b) => (b.onclick = () => {
    HI.vpos = b.dataset.p; syncVillain(); buildHandInputs();
  }));
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

  // On a prize ladder the stage decides how much a stack-off really costs, so
  // it has to be an input here the same way the villain's type is.
  let h = "";
  if (setupGame() !== "cash") {
    h += '<div class="small muted" style="margin:10px 0 6px">' + esc(t("drill.stageStep")) + "</div>" +
      '<div class="bg" id="pf-stage" style="display:flex;margin-bottom:8px">' +
      MTT_STAGE_KEYS.map((k) => '<button data-k="' + k + '" class="' + (HI.stage === k ? "on" : "") + '">' +
        esc(stageName(k)) + "</button>").join("") + "</div>" +
      '<div class="small dim" style="margin:-4px 0 4px">' + esc(stageBlurb(HI.stage, setupGame())) + "</div>";
  }
  h += '<div class="small muted" style="margin:10px 0 6px">' + esc(t("hand.pfSizes")) +
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
  el.querySelectorAll("#pf-stage button").forEach((b) => (b.onclick = () => { HI.stage = b.dataset.k; renderPreflopSizes(); renderActions(); }));
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
function buildHandInputs() { renderSeatPalette(); renderSeats(); renderVillainChips(); renderScenarioChips(); renderSlots(); renderDeck(); renderActions(); }

/* ============================================================ ANALYSIS === */
function analyzeHand() {
  const hole = [HI.c.h0, HI.c.h1];
  if (hole[0] === null || hole[1] === null) { toast(t("hand.needCards")); return null; }
  const seats = setupSeats(), stack = setupStack();
  const vt = PE.VILLAIN_TYPES[HI.vt];
  const scen = PE.scenarioById(HI.scenario);
  const cls = PE.handClass(hole[0], hole[1]);
  const ip = PE.isInPosition(seats, HI.pos, HI.vpos);
  // The setup's game type has always been on screen; until now nothing read
  // it, so a tournament hand was analysed as if a chip were worth a chip.
  const game = setupGame();
  const mtt = game !== "cash";
  const ante = setupAnte();
  const res = { cls, ip, vt, scenario: HI.scenario, pos: HI.pos, vpos: HI.vpos, streets: [],
    game, stage: HI.stage, ante };

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

  const heroClasses = scen.heroR(seats, HI.pos, HI.vpos, PE.VILLAIN_TYPES.unknown, ante);
  const villainClasses = scen.vilR(seats, HI.pos, HI.vpos, vt, ante);
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

    const icm = mtt
      ? PE.icmTable({ stage: HI.stage, format: game, heroStack: effStack, vilStack: effStack })
      : null;
    const ctx = PE.buildContext({
      hole, board: bd, villainClasses, vt, ip, pot, effStack, history, icm,
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
      requiredIcm: res2.requiredIcm, riskPremium: res2.riskPremium,
      mdf: facing ? pot / (pot + vSize) : 0,
      alpha: facing ? vSize / (pot + vSize) : 0,
      bi, draw: dr, cat: PE.catOf(myScore),
      opts, best, mine, evLost: mine ? Math.max(0, best.ev - mine.ev) : 0,
      villainCombos: res2.villainRangeSize, ip,
      // kept so the read-out shows the very weights the EV was computed from
      combos: ctx.table.combos, weights: facing
        ? PE.actionWeights(ctx.rank, "bet", vSize, pot, vt, ctx.weights)
        : ctx.weights
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
/* --- tournament read-outs ---------------------------------------------- */
/** A chip in the spot header naming the game and, in a tournament, the stage
 *  and the ante — the two things that make the numbers below differ. */
const stageName = (k) => t("drill.stage" + k[0].toUpperCase() + k.slice(1));
function gameChip(sp) {
  if (!sp || !sp.game || sp.game === "cash") return "";
  return '<span class="gm">' + esc(t(sp.game === "sng" ? "hand.sng" : "drill.gameMtt")) + " · " +
    esc(stageName(sp.stage)) +
    (sp.ante ? " · " + esc(t("drill.anteChip", { v: nfmt(sp.ante) })) : "") + "</span>";
}
/** "46 left, 45 paid — one more out and everyone else cashes." A sit-and-go
 *  runs the same four stages on a nine-handed, three-paid ladder. */
function stageBlurb(stage, format) {
  const table = PE.stagesFor(format);
  const s = table[stage] || table.middle;
  return t("drill.stageBlurb", { left: s.left, paid: s.paid }) + " " +
    t("drill.stage" + stage[0].toUpperCase() + stage.slice(1) + "D");
}
/** The one number that explains tournament play: what the ladder adds to the
 *  price of a call. Rendered only when it is big enough to matter. */
function riskPremiumHTML(sp) {
  if (!sp || !(sp.riskPremium > 0.005) || sp.required === undefined) return "";
  const cell = (k, v, warn) => '<div class="icmc"><div class="k">' + esc(k) + "</div>" +
    '<div class="v"' + (warn ? ' style="color:var(--warn)"' : "") + ">" + v + "</div></div>";
  return '<div class="blk warn"><div class="t">' + esc(t("drill.icmTitle")) + "</div>" +
    '<div class="icm3">' +
      cell(t("drill.icmChip"), pct(sp.required)) +
      cell(t("drill.icmIcm"), pct(sp.requiredIcm), true) +
      cell(t("drill.icmPremium"), "+" + (sp.riskPremium * 100).toFixed(1) + "pp", true) +
    "</div>" +
    '<div class="small dim" style="margin-top:8px">' + t("drill.icmNote") + "</div></div>";
}
/** How far an option moved once the prize ladder was applied. */
function icmDelta(o) {
  if (o.chipEv === undefined) return "";
  const d = o.ev - o.chipEv;
  if (Math.abs(d) < 0.05) return "";
  return ' <span class="pill ' + (d < 0 ? "w" : "g") + '" style="font-size:10px">' +
    esc(t("drill.icmWas", { v: nfmt(o.chipEv, 2) })) + "</span>";
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
      '<span class="dn">' + esc(optNote(o)) + icmDelta(o) + "</span></div>";
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
/* --- pieces of the analysis view ------------------------------------- */

/** The whole hand as one strip: which street cost you what. */
function lineStrip(res) {
  const total = res.streets.reduce((a, st) => a + (st.mine ? st.evLost : 0), 0);
  const segs = res.streets.map((st, i) => {
    const has = !!st.mine;
    const bad = has && st.evLost >= 0.02;
    return '<a class="lseg' + (bad ? " bad" : has ? " ok" : "") + '" href="#st-' + i + '">' +
      '<span class="ln">' + esc(t("common." + st.name)) + "</span>" +
      '<span class="la">' + esc(has ? optLabel(st.mine) : t("hand.noActionYet")) + "</span>" +
      '<span class="lv">' + (has ? (bad ? lossText(st.evLost) + "BB" : "✓") : "—") + "</span></a>";
  }).join("");
  return '<div class="blk"><div class="t">' + esc(t("hand.lineSummary")) + "</div>" +
    '<div class="linebar">' + segs + "</div>" +
    (total >= 0.02
      ? '<div class="small" style="margin-top:6px">' + esc(t("hand.totalEvLost")) +
        ' <b style="color:var(--bad)">' + lossText(total) + "BB</b></div>"
      : "") + "</div>";
}

/** Equity against what you need — the one picture that decides a call. */
function equityBar(eq, required) {
  const have = Math.max(0, Math.min(1, eq));
  const need = Math.max(0, Math.min(1, required || 0));
  const ok = have >= need;
  return '<div class="eqbar-wrap">' +
    '<div class="small muted">' + esc(need > 0 ? t("hand.equityVsNeeded") : t("common.equity")) + "</div>" +
    '<div class="eqbar">' +
    '<i style="width:' + (have * 100).toFixed(1) + '%;background:' + (ok ? "var(--good)" : "var(--bad)") + '"></i>' +
    (need > 0 ? '<u style="left:' + (need * 100).toFixed(1) + '%"></u>' : "") +
    "</div><div class=\"eqlab\">" +
      '<span>' + esc(t("hand.youHave")) + " <b>" + pct(have) + "</b></span>" +
      (need > 0 ? '<span>' + esc(t("hand.youNeed")) + " <b>" + pct(need) + "</b></span>" +
        '<span style="color:' + (ok ? "var(--good)" : "var(--bad)") + '">' + esc(t("hand.margin")) +
        " <b>" + (have >= need ? "+" : "") + Math.round((have - need) * 100) + "%p</b></span>" : "") +
    "</div>" + (need > 0 ? '<div class="small dim">' + esc(t("hand.equityBarNote")) + "</div>" : "") + "</div>";
}

/** Best line and the one you took, next to each other. */
function compareBlock(st) {
  const same = st.mine && st.evLost < 0.02;
  return '<div class="cmp">' +
    '<div class="cmpc best"><div class="cl">' + esc(t("hand.recommendedShort")) + "</div>" +
      '<div class="ca">' + esc(optLabel(st.best)) + "</div>" +
      '<div class="cv" style="color:var(--good)">' + signed(st.best.ev) + " BB</div></div>" +
    '<div class="cmpc' + (same ? " ok" : st.mine ? " off" : "") + '"><div class="cl">' +
      esc(t("hand.yoursShort")) + "</div>" +
      '<div class="ca">' + esc(st.mine ? optLabel(st.mine) : t("hand.noActionYet")) + "</div>" +
      '<div class="cv" style="color:' + (!st.mine ? "var(--tx3)" : st.mine.ev >= 0 ? "var(--good)" : "var(--bad)") + '">' +
        (st.mine ? signed(st.mine.ev) + " BB" : "—") +
        (same ? ' <span class="pill g">' + esc(t("hand.matches")) + "</span>" : "") + "</div></div>" +
    "</div>" +
    (st.mine && st.evLost >= 0.02
      ? '<div class="small" style="margin-top:6px">' + esc(t("hand.evLost")) +
        ' <b style="color:var(--bad)">' + lossText(st.evLost) + "BB</b></div>"
      : "");
}

/** What the villain can hold here, read off the weights the EV used. */
function villainReadout(st) {
  if (!st.combos || !st.combos.length) return "";
  const top = PE.topClasses(st.combos, st.weights, 6);
  if (!top.length) return "";
  const bars = (rows, scale) => '<div class="cbars">' + rows.map((x) =>
    '<div class="cb"><span class="cn">' + esc(x.label) + '</span><span class="cf"><i style="width:' +
    Math.round(x.share / scale * 100) + '%"></i></span><span class="cv">' +
    (x.share * 100).toFixed(1) + "%</span></div>").join("") + "</div>";
  let h = '<div class="blk vx"><div class="t">' + esc(t("hand.villainHolds")) + "</div>" +
    bars(top.map((x) => ({ label: x.cls, share: x.share })), top[0].share);
  if (st.board.length >= 3) {
    const made = PE.categoryBreakdown(st.combos, st.weights, st.board).slice(0, 4);
    if (made.length) {
      h += '<div class="small muted" style="margin:10px 0 4px">' + esc(t("hand.villainMadeOf")) + "</div>" +
        bars(made.map((x) => ({
          label: x.key === "draw" ? t("draws.any") : catName(+x.key), share: x.share
        })), 1);
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
    "<span>" + esc(vtName(res.vt.id)) + "</span>" +
    "<span>" + esc(res.ip ? t("common.inPosition") : t("common.outOfPosition")) + "</span>" +
    gameChip(res) + "</div>";
  if (res.streets.length) h += lineStrip(res);
  h += "</div>";

  // ---- preflop ----
  h += '<div class="card"><h3>' + esc(t("hand.preflopTitle")) + "</h3>" +
    '<div class="facts">' +
    fact(t("hand.handClass"), res.cls, "") +
    fact(t("hand.handPctl"), nfmt(res.preflop.pctl) + "%", "") +
    fact(t("hand.openStd"), nfmt(res.preflop.openPct) + "%", posName(res.pos)) +
    '</div><p style="margin-top:9px">' +
      '<span class="pill ' + (res.preflop.inChart ? "g" : "w") + '">' +
      esc(res.preflop.inChart ? t("hand.inChart") : t("hand.notInChart")) + "</span></p>" +
    gridHTML(res.preflop.chart, res.cls) + "</div>";

  // ---- preflop all-in resolves the hand on its own ----
  if (res.allin) {
    const a = res.allin, isCall = a.mode === "call";
    const ev = isCall ? a.evCall : a.evShove;
    const good = ev > 0;
    h += '<div class="card"><h3>' + esc(t("hand.allinTitle")) + "</h3>" +
      (isCall ? equityBar(a.eq, a.required) : equityBar(a.eqCalled, 0)) +
      '<div class="facts" style="margin-top:10px">' +
      (isCall ? fact(t("hand.toCallSize"), nfmt(a.toCall) + "BB", "")
              : fact(t("hand.allinFoldEq"), pct(a.foldFreq), t("hand.allinEqCalled") + " " + pct(a.eqCalled))) +
      fact(t("common.pot"), nfmt(a.pot) + "BB", isCall ? t("hand.potFacing") : t("hand.potIfAllFold")) +
      fact(t("common.ev"), signed(ev) + " BB", isCall ? t("common.call") : t("common.allin")) +
      "</div>" +
      '<div class="recbox' + (good ? " good" : "") + '" style="margin-top:12px"><div class="rl">' + esc(t("hand.recTitle")) + "</div>" +
      '<div class="ra">' + esc(good ? (isCall ? t("common.call") : t("common.allin")) : t("common.fold")) + "</div>" +
      '<div class="rs">' + (isCall
        ? t(good ? "hand.allinCallGood" : "hand.allinCallBad", { req: pct(a.required), eq: pct(a.eq) })
        : t(good ? "hand.allinShoveGood" : "hand.allinShoveBad", { fe: pct(a.foldFreq), eqc: pct(a.eqCalled) })) +
      "</div></div>" +
      '<details><summary>' + esc(isCall ? t("hand.allinVsRange") : t("hand.allinVsCallRange")) + "</summary>" +
      '<div class="small dim" style="margin-bottom:6px">' + nfmt(PE.rangePct(a.classes)) + "% · " +
      esc(t("range.combos", { n: a.combos })) + "</div>" + gridHTML(a.classes, res.cls) + "</details>" +
      '<div class="notice">' + esc(t("hand.allinNote")) + "</div></div>";
    out.innerHTML = h;
    return;
  }

  // ---- streets: the one that cost the most opens by default ----
  let worst = -1, worstLoss = 0.02;
  res.streets.forEach((st, i) => { if (st.mine && st.evLost > worstLoss) { worstLoss = st.evLost; worst = i; } });

  res.streets.forEach((st, i) => {
    const open = i === worst || (worst < 0 && i === res.streets.length - 1);
    h += '<details class="stcard" id="st-' + i + '"' + (open ? " open" : "") + '><summary>' +
      '<span class="stn">' + esc(t("common." + st.name)) + "</span>" +
      '<span class="stb">' + st.board.map((c) => cardHTML(c, true)).join("") + "</span>" +
      '<span class="steq">' + esc(t("common.equity")) + " " + pct(st.eq) + "</span>" +
      (st.mine && st.evLost >= 0.02
        ? '<span class="stloss">' + lossText(st.evLost) + "BB</span>"
        : st.mine ? '<span class="stok">✓</span>' : "") +
      "</summary><div class=\"bd\">";

    h += equityBar(st.eq, st.required);
    h += '<div class="facts" style="margin-top:12px">' +
      fact(t("common.pot"), nfmt(st.pot) + "BB", st.facing ? t("hand.reqEquity") + " " + pct(st.required) : "") +
      fact(t("hand.spr"), nfmt(st.spr), st.facing ? t("hand.mdf") + " " + pct(st.mdf) : "") +
      fact(t("hand.myHandNow"), catName(st.cat), drawNames(st.draw.keys).join(" · ")) +
      "</div>";
    h += '<div class="blk" style="margin-top:12px">' + compareBlock(st) + "</div>";
    h += riskPremiumHTML(st);
    h += '<details class="numd"><summary><b>' + esc(t("hand.evTitle")) + "</b></summary>" +
      evTable(st.opts, st.mine) + "</details>";
    h += villainReadout(st);
    h += '<div class="notice">' + t("hand.assumptionNote", {
      type: esc(vtName(res.vt.id)), n: st.villainCombos }) + "</div>";
    h += "</div></details>";
  });

  h += '<div class="card"><button class="btn" id="h-save">' + esc(t("hand.saveHand")) + "</button></div>";
  out.innerHTML = h;
  $("h-save").onclick = () => {
    const hands = DB.get("hands", []);
    hands.unshift({
      at: Date.now(), cls: res.cls, pos: res.pos, vpos: res.vpos, scenario: res.scenario,
      vt: res.vt.id, streets: res.streets.map((st) => ({ name: st.name, evLost: st.evLost, eq: st.eq,
        best: optLabel(st.best), mine: st.mine ? optLabel(st.mine) : null }))
    });
    DB.set("hands", hands.slice(0, 200)); toast(t("hand.handSaved")); renderHome();
  };
}
function renderHand() { loadSetup(); buildHandInputs(); renderBankroll(); renderStackHint(); }

/* ======================================================== CHALLENGE ======
 * There is no server behind this page, so two people cannot see each other's
 * records by opening the same link — every browser holds its own storage and
 * nothing travels between them. What can travel is a short code.
 *
 * A challenge card carries the session SPEC and its SEED, which together
 * reproduce the exact same hands on any device, plus the sender's result on
 * those hands. Play it and the comparison is not an estimate over two
 * different sets of spots: it is the same spots, decision for decision.
 * ======================================================================== */
const CHALLENGE_V = 1;
/** Unicode-safe base64 that survives being pasted into a chat app. */
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64decode(code) {
  const s = String(code).trim().replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
const r2 = (x) => Math.round(x * 100) / 100;
/** A finished session, compressed to what a comparison actually needs. */
function resultOf(D) {
  return {
    nm: (D.who || "").slice(0, 16),
    n: D.i, d: Math.max(1, D.decisions || D.i),
    el: r2(D.evLost), ps: r2(D.potSum), ee: r2(D.evEarned), eb: r2(D.evBest),
    cp: r2(D.evCaptured), cr: D.correct,
    // per spot (or per hand) EV lost, so the card can name where it was decided
    sp: perUnitLoss(D)
  };
}
/** EV lost on each spot, or on each hand in whole-hand mode. */
function perUnitLoss(D) {
  if (D.mode !== "hand") return D.log.map((l) => r2(l.lost));
  const byHand = [];
  D.log.forEach((l) => {
    const k = (l.hand || 1) - 1;
    byHand[k] = r2((byHand[k] || 0) + l.lost);
  });
  return byHand;
}
function encodeChallenge(D) {
  return "HS1." + b64encode(JSON.stringify({
    v: CHALLENGE_V, seed: D.seed, spec: sessionSpec(D), from: resultOf(D)
  }));
}
/** Returns the parsed card, or null with a reason the paste was rejected. */
function decodeChallenge(code) {
  const raw = String(code || "").trim().replace(/\s+/g, "");
  if (!raw) return null;
  try {
    const body = raw.indexOf("HS1.") === 0 ? raw.slice(4) : raw;
    const o = JSON.parse(b64decode(body));
    if (!o || o.v !== CHALLENGE_V || !o.spec || !o.from) return null;
    if (!(o.spec.n > 0) || typeof o.seed !== "number") return null;
    return o;
  } catch (e) { return null; }
}

/* ============================================================ DRILL ====== */
const DIFFICULTY = { easy: "easy", normal: "normal", hard: "hard" };
/* Stack depth changes the game more than anything else on this screen: at
 * 12BB it is push-fold, at 100BB it is a postflop game. "Mixed" deliberately
 * spends most of its spots below 50BB, because that is where the decisions
 * are sharpest and where the old build never went. */
const DEPTHS = [
  { k: "random", label: "drill.depthRandom", desc: "drill.depthRandomD" },
  { k: "deep",   label: "drill.depthDeep",   desc: "drill.depthDeepD",   bb: 100 },
  { k: "mid",    label: "drill.depthMid",    desc: "drill.depthMidD",    bb: 40 },
  { k: "short",  label: "drill.depthShort",  desc: "drill.depthShortD",  bb: 20 },
  { k: "ultra",  label: "drill.depthUltra",  desc: "drill.depthUltraD",  bb: 12 }
];
const MIXED_DEPTHS = [100, 75, 50, 40, 30, 25, 20, 15, 12, 10];
/* A tournament is not a cash game with a shorter stack. Stacks really are
 * shorter, but the pot also carries an ante and the chips are worth less the
 * further you risk them, so the depth mix is drawn from a different shelf. */
const MTT_DEPTHS = [60, 45, 35, 28, 22, 18, 15, 12, 10, 8];
const MTT_STAGE_KEYS = ["early", "middle", "bubble", "final"];
const isMtt = (cfg) => (cfg && cfg.game) === "mtt";
/** Stack for the next spot: the chosen depth, or a draw from the mix.
 *  `rnd` makes the draw reproducible so a session can be replayed exactly. */
function depthFor(cfg, rnd) {
  const chosen = DEPTHS.find((d) => d.k === (cfg.depth || "random"));
  const cap = cfg.stack || setupStack();
  if (chosen && chosen.bb) return Math.min(chosen.bb, cap);
  const mix = isMtt(cfg) ? MTT_DEPTHS : MIXED_DEPTHS;
  const bb = mix[((rnd ? rnd() : Math.random()) * mix.length) | 0];
  return Math.min(bb, cap);
}
/* Every session is generated from one seed, so any session can be replayed
 * move for move on another device. That is what makes a challenge exact
 * rather than a rough comparison of two different sets of hands. */
function spotRng(D, i) {
  return PE.mulberry32(PE.seedFrom((D.seed | 0) + i * 7919 + 13));
}
function drillConfig() {
  return DB.get("drillcfg", { n: 10, vt: "random", diff: "normal", game: "cash", stage: "middle" });
}
/** The tournament settings shared by every spot factory call. */
function gameOpts(cfg) {
  return isMtt(cfg) ? { game: "mtt", stage: cfg.stage || "middle" } : { game: "cash" };
}

function makeDrillSpot(cfg, stack, seed) {
  // Difficulty filters on how close the top two options are: "easy" wants a
  // clear best line, "hard" wants genuinely close decisions.
  const base = (attempt) => Object.assign(
    { villainType: cfg.vt, stack, seats: cfg.seats || setupSeats() },
    seed === undefined ? {} : { seed: seed + attempt * 104729 },
    gameOpts(cfg));
  let best = null;
  for (let attempt = 0; attempt < (cfg.diff === "normal" ? 1 : 14); attempt++) {
    const sp = PE.makeSpot(base(attempt));
    if (!sp) continue;
    const evs = sp.options.map((o) => o.ev).sort((a, b) => b - a);
    const gap = evs.length > 1 ? evs[0] - evs[1] : 99;
    if (cfg.diff === "easy" && gap >= 0.45) return sp;
    if (cfg.diff === "hard" && gap <= 0.22) return sp;
    if (!best) best = sp;
    if (cfg.diff === "normal") return sp;
  }
  return best || PE.makeSpot(base(0));
}
/** The settings that fully determine which hands a session deals. Two people
 *  running the same spec with the same seed face the same spots. */
function sessionSpec(cfg) {
  return { n: cfg.n, vt: cfg.vt, diff: cfg.diff, mode: cfg.mode || "spot",
    depth: cfg.depth || "random", stack: cfg.stack || setupStack(),
    seats: cfg.seats || setupSeats(),
    game: cfg.game || "cash", stage: cfg.stage || "middle" };
}
function startDrill(cfg, challenge) {
  const spec = challenge ? challenge.spec : sessionSpec(cfg);
  STATE.drill = Object.assign({}, spec, {
    seed: challenge ? challenge.seed : (Math.random() * 1e9) | 0,
    challenge: challenge || null,
    i: 0, evLost: 0, evEarned: 0, evBest: 0, evCaptured: 0, potSum: 0, correct: 0,
    decisions: 0, answered: null, log: [], done: false });
  if (STATE.drill.mode === "hand") loadHand(); else loadSpot();
}

/* ---------------------------------------------------------- whole hand -- */
function loadHand() {
  const v = $("v-drill");
  v.innerHTML = '<div class="card"><div class="empty">' + esc(t("drill.computing")) + "</div></div>";
  setTimeout(() => {
    const D = STATE.drill;
    // Derive this hand's stack and seed from the session seed, so the same
    // seed always deals the same hands — the basis of a challenge.
    const rnd = spotRng(D, D.i);
    const stack = depthFor(D, rnd);
    const seed = ((rnd() * 1e9) | 0) + 1;
    D.run = HandRun.start(Object.assign(
      { stack, seed, villainType: D.vt, seats: D.seats || setupSeats() }, gameOpts(D)));
    if (!D.run) { D.seed = (D.seed | 0) + 1; loadHand(); return; }
    D.dec = HandRun.decision(D.run);
    D.answered = null;
    renderDrill();
  }, 20);
}
function answerHand(i) {
  const D = STATE.drill;
  if (D.answered !== null) return;
  const opt = D.dec.res.opts[i];
  const evs = D.dec.res.opts.map((o) => o.ev);
  const bestEv = Math.max.apply(null, evs), worst = Math.min.apply(null, evs);
  const span = bestEv - worst;
  D.evLost += bestEv - opt.ev;
  D.potSum += Math.max(0.5, D.run.pot);
  D.evEarned += opt.ev;
  D.evBest += bestEv;
  D.evCaptured += span > 1e-9 ? (opt.ev - worst) / span : 1;
  if (bestEv - opt.ev < 0.02) D.correct++;
  recordPlay(D.dec.res.opts, opt, D.dec.res.opts.find((o) => o.ev === bestEv), !!D.run.facing);
  D.decisions = (D.decisions || 0) + 1;
  D.answered = i;
  renderDrill();
}
function continueHand() {
  const D = STATE.drill;
  const opt = D.dec.res.opts[D.answered];
  HandRun.choose(D.run, opt, D.dec);
  D.answered = null;
  if (D.run.done) { renderDrill(); return; }
  const v = $("v-drill");
  v.innerHTML = '<div class="card"><div class="empty">' + esc(t("drill.computing")) + "</div></div>";
  setTimeout(() => { D.dec = HandRun.decision(D.run); renderDrill(); }, 20);
}
function nextHand() {
  const D = STATE.drill;
  D.i++;
  // Log the decisions, not the hand. A single "hand" entry left the by-action
  // review with nothing to print, and gave the leak detector an action it
  // could not classify, so every losing hand was blamed on sizing.
  D.run.log.forEach((l) => D.log.push({
    street: l.street, streetLabel: streetName(l.street), facing: !!l.facing,
    mine: l.mine.key, mineLabel: optLabel(l.mine),
    best: l.best.key, bestLabel: optLabel(l.best),
    lost: l.lost, eq: l.eq, hand: D.i, result: D.run.result
  }));
  if (D.i >= D.n) { D.done = true; saveDrill(); renderDrill(); } else loadHand();
}
function loadSpot() {
  const v = $("v-drill");
  v.innerHTML = '<div class="card"><div class="empty">' + esc(t("drill.computing")) + "</div></div>";
  setTimeout(() => {
    const D = STATE.drill;
    // D carries the session's settings; passing a hand-built subset here is
    // how the game type got silently dropped from every spot.
    const rnd = spotRng(D, D.i);
    D.cur = makeDrillSpot(D, depthFor(D, rnd), ((rnd() * 1e9) | 0) + 1);
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
  D.potSum += Math.max(0.5, sp.pot);   // scores EV loss relative to what was at stake
  D.evEarned += mine.ev;     // what your decisions were actually worth
  D.evBest += best;          // what perfect play would have been worth
  D.evCaptured += capture;
  if (lost < 0.02) D.correct++;
  D.decisions = (D.decisions || 0) + 1;
  recordPlay(sp.options, mine, sp.options.find((o) => o.ev === best), !!sp.facing);
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
  const dec = Math.max(1, D.decisions || D.i);
  hist.unshift({ at: Date.now(), n: D.i, vt: D.vt, diff: D.diff, mode: D.mode,
    decisions: dec, potSum: D.potSum,
    evLost: D.evLost, evEarned: D.evEarned, evBest: D.evBest,
    capture: D.evCaptured / dec, correct: D.correct,
    // Enough to recognise a session someone challenges you back on, and to
    // compare against it without having to play the same hands twice.
    seed: D.seed, spec: sessionSpec(D), result: resultOf(D),
    log: D.log });
  DB.set("drills", hist.slice(0, 100));
}
/* Rating and grade both come from one number: EV lost per decision. The
 * anchors are the grade boundaries, interpolated between, so the letter and
 * the number can never disagree. Lower loss = higher rating. */
/** How many decisions a stored session represents (hand mode logs several). */
const sessionDecisions = (d) => Math.max(1, d.decisions || d.n || 1);

/* EV lost is scored as a FRACTION OF THE POT, not in absolute BB. A 0.5BB
 * mistake in a 5BB pot and the same 0.5BB in a 40BB pot are not the same
 * error, and this app mixes stack depths from 10BB to 100BB. Grading on
 * absolute BB put even a strong player in D: simulated across skill levels,
 * an expert loses 0.27BB per decision and a random player 2.4BB, which the
 * old anchors (D beyond 1.5BB) squashed into one grade.
 *
 * As a share of the pot the same players separate cleanly — expert 1.5%,
 * strong 4%, decent 9%, casual 16% — so the anchors sit there.            */
const RATING_ANCHORS = [[0, 100], [0.015, 90], [0.045, 78], [0.10, 60], [0.16, 40], [0.26, 0]];
/* Records saved before pot sizes were tracked only have absolute BB. These
 * anchors are the same skill levels measured in BB, so old rows still grade
 * sensibly instead of all reading D. */
const RATING_ANCHORS_BB = [[0, 100], [0.25, 90], [0.6, 75], [1.0, 55], [1.8, 35], [3.0, 0]];
function interp(anchors, x) {
  x = Math.max(0, x || 0);
  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1], [x1, y1] = anchors[i];
    if (x <= x1) return Math.round(y0 + (y1 - y0) * (x - x0) / (x1 - x0));
  }
  return 0;
}
const ratingOf = (lossFrac) => interp(RATING_ANCHORS, lossFrac);
const ratingOfBB = (lossBB) => interp(RATING_ANCHORS_BB, lossBB);
const gradeFromRating = (r) => (r >= 90 ? "S" : r >= 75 ? "A" : r >= 55 ? "B" : r >= 35 ? "C" : "D");
const gradeOf = (lossFrac) => gradeFromRating(ratingOf(lossFrac));
/** Rating for a stored session: by pot share when we have it, else by BB. */
function sessionRating(d) {
  const n = sessionDecisions(d);
  if (d.potSum > 0) return ratingOf((d.evLost || 0) / d.potSum);
  return ratingOfBB((d.evLost || 0) / n);
}
const gradeColor = (g) => (g === "S" || g === "A" ? "var(--good)" : g === "B" ? "var(--ac2)" : g === "C" ? "var(--warn)" : "var(--bad)");
/** Pool every stored session into one rating. */
function overallRating() {
  const hist = DB.get("drills", []);
  if (!hist.length) return null;
  let loss = 0, potSum = 0, n = 0, bbLoss = 0, bbN = 0;
  hist.forEach((d) => {
    n += sessionDecisions(d);
    if (d.potSum > 0) { loss += d.evLost || 0; potSum += d.potSum; }
    else { bbLoss += d.evLost || 0; bbN += sessionDecisions(d); }
  });
  // prefer the pot-share measure; fall back to BB only if nothing has pots
  const rating = potSum > 0 ? ratingOf(loss / potSum) : bbN ? ratingOfBB(bbLoss / bbN) : null;
  if (rating === null) return null;
  return {
    rating, grade: gradeFromRating(rating), decisions: n, sessions: hist.length,
    per: potSum > 0 ? loss / potSum : null, perBB: potSum > 0 ? null : bbLoss / bbN
  };
}
function gradeBadge(grade, rating) {
  return '<span class="gbadge" style="color:' + gradeColor(grade) + ';border-color:' + gradeColor(grade) + '">' +
    esc(grade) + (rating === undefined ? "" : ' <b>' + rating + "</b>") + "</span>";
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
      '<div class="step"><span class="num">1</span>' + esc(t("drill.gameStep")) + "</div>" +
      '<div class="bg" id="dr-game" style="display:flex">' +
        [["cash", "drill.gameCash"], ["mtt", "drill.gameMtt"]].map(([k, lbl]) =>
          '<button data-k="' + k + '" class="' + ((cfg.game || "cash") === k ? "on" : "") + '">' + esc(t(lbl)) + "</button>").join("") + "</div>" +
      '<div class="small dim" style="margin-top:5px">' + esc(t(isMtt(cfg) ? "drill.gameMttD" : "drill.gameCashD")) + "</div>" +
      (isMtt(cfg)
        ? '<div class="step sub">' + esc(t("drill.stageStep")) + "</div>" +
          '<div class="bg" id="dr-stage" style="display:flex">' +
            MTT_STAGE_KEYS.map((k) => '<button data-k="' + k + '" class="' + ((cfg.stage || "middle") === k ? "on" : "") + '">' +
              esc(stageName(k)) + "</button>").join("") + "</div>" +
          '<div class="small dim" style="margin-top:5px">' + esc(stageBlurb(cfg.stage || "middle", "mtt")) + "</div>"
        : "") +
      '<div class="step"><span class="num">2</span>' + esc(t("drill.step1")) + "</div>" +
      '<div class="bg" id="dr-n" style="display:flex">' +
        [5, 10, 20].map((n) => '<button data-n="' + n + '" class="' + (cfg.n === n ? "on" : "") + '">' + esc(t("drill.spots", { n })) + "</button>").join("") + "</div>" +
      '<div class="step"><span class="num">3</span>' + esc(t("drill.step2")) + "</div>" +
      '<div class="bg" id="dr-vt" style="display:flex">' +
        '<button data-k="random" class="' + (cfg.vt === "random" ? "on" : "") + '">' + esc(t("drill.randomVillain")) + "</button>" +
        Object.keys(PE.VILLAIN_TYPES).map((k) => '<button data-k="' + k + '" class="' + (cfg.vt === k ? "on" : "") + '">' + esc(vtName(k)) + "</button>").join("") + "</div>" +
      '<div class="step"><span class="num">4</span>' + esc(t("drill.mode")) + "</div>" +
      '<div class="bg" id="dr-mode" style="display:flex">' +
        [["spot", "drill.modeSpot"], ["hand", "drill.modeHand"]].map(([k, lbl]) =>
          '<button data-k="' + k + '" class="' + ((cfg.mode || "spot") === k ? "on" : "") + '">' + esc(t(lbl)) + "</button>").join("") + "</div>" +
      '<div class="small dim" style="margin-top:5px">' + esc(t("drill.mode" + ((cfg.mode || "spot") === "hand" ? "Hand" : "Spot") + "D")) + "</div>" +
      '<div class="step"><span class="num">5</span>' + esc(t("drill.depth")) + "</div>" +
      '<div class="bg" id="dr-depth" style="display:flex">' +
        DEPTHS.map((d) => '<button data-k="' + d.k + '" class="' + ((cfg.depth || "random") === d.k ? "on" : "") + '">' +
          esc(t(d.label)) + "</button>").join("") + "</div>" +
      '<div class="small dim" style="margin-top:5px">' +
        esc(t((DEPTHS.find((d) => d.k === (cfg.depth || "random")) || DEPTHS[0]).desc)) + "</div>" +
      '<div class="step"><span class="num">6</span>' + esc(t("drill.step3")) + "</div>" +
      '<div class="bg" id="dr-diff" style="display:flex">' +
        Object.keys(DIFFICULTY).map((k) => '<button data-k="' + k + '" class="' + (cfg.diff === k ? "on" : "") + '">' +
          esc(t("drill.diff" + k[0].toUpperCase() + k.slice(1))) + "</button>").join("") + "</div>" +
      '<div class="small dim" style="margin-top:5px">' + esc(t("drill.diff" + cfg.diff[0].toUpperCase() + cfg.diff.slice(1) + "D")) + "</div>" +
      '<div style="margin-top:16px"><button class="btn" id="dr-go">' + esc(t("common.start")) + "</button></div></div>" +
      challengeAcceptHTML() +
      drillHistoryHTML();
    v.querySelectorAll("#dr-n button").forEach((b) => (b.onclick = () => { cfg.n = +b.dataset.n; DB.set("drillcfg", cfg); renderDrill(); }));
    v.querySelectorAll("#dr-vt button").forEach((b) => (b.onclick = () => { cfg.vt = b.dataset.k; DB.set("drillcfg", cfg); renderDrill(); }));
    v.querySelectorAll("#dr-diff button").forEach((b) => (b.onclick = () => { cfg.diff = b.dataset.k; DB.set("drillcfg", cfg); renderDrill(); }));
    v.querySelectorAll("#dr-mode button").forEach((b) => (b.onclick = () => { cfg.mode = b.dataset.k; DB.set("drillcfg", cfg); renderDrill(); }));
    v.querySelectorAll("#dr-depth button").forEach((b) => (b.onclick = () => { cfg.depth = b.dataset.k; DB.set("drillcfg", cfg); renderDrill(); }));
    v.querySelectorAll("#dr-game button").forEach((b) => (b.onclick = () => { cfg.game = b.dataset.k; DB.set("drillcfg", cfg); renderDrill(); }));
    v.querySelectorAll("#dr-stage button").forEach((b) => (b.onclick = () => { cfg.stage = b.dataset.k; DB.set("drillcfg", cfg); renderDrill(); }));
    $("dr-go").onclick = () => startDrill(cfg);
    bindChallengeAccept();
    return;
  }
  if (D.done) return renderDrillEnd(v);
  if (D.mode === "hand") return renderHandDrill(v);

  const sp = D.cur;
  const streetName = t("common." + ["flop", "turn", "river"][sp.street]);
  const runLost = D.evLost, runEarned = D.evEarned;
  let h = '<div class="card">' +
    '<div class="dprog"><span class="small muted">' + esc(t("drill.progress", { i: D.i + 1, n: D.n })) + "</span>" +
    '<div class="bar"><i style="width:' + Math.round(D.i / D.n * 100) + '%"></i></div>' +
    '<span class="small muted">' + esc(t("drill.runningEarned")) + ' <b style="color:' +
      (runEarned >= 0 ? "var(--good)" : "var(--bad)") + '">' + signed(runEarned) + "BB</b></span>" +
    '<span class="small muted">' + esc(t("drill.runningLost")) + ' <b style="color:' +
      (runLost < 0.02 ? "var(--good)" : "var(--bad)") + '">' + lossText(runLost) + "BB</b></span></div>" +
    '<div class="stmeta">' +
      "<span>" + esc(posName(sp.pos)) + " <b>vs</b> " + esc(posName(sp.vpos)) + "</span>" +
      "<span>" + esc(t("scenarios." + sp.scenario)) + "</span>" +
      "<span>" + esc(vtName(sp.villainType)) + "</span>" +
      "<span>" + esc(t("common.pot")) + " <b>" + nfmt(sp.pot) + "BB</b></span>" +
      "<span>" + esc(t("common.stack")) + " <b>" + nfmt(sp.effStack) + "BB</b></span>" +
      "<span>" + esc(sp.ip ? t("common.inPosition") : t("common.outOfPosition")) + "</span>" +
      gameChip(sp) +
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
    h += riskPremiumHTML(sp);
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
/* ---------------------------------------------- whole-hand rendering ---- */
function streetName(i) { return (t("drill.streets") || [])[i] || ""; }

function renderHandDrill(v) {
  const D = STATE.drill, run = D.run;
  if (run.done) return renderHandReport(v);
  const dec = D.dec, res = dec.res;
  const eff = Math.max(0, run.stack - run.heroInv);

  let h = '<div class="card">' +
    '<div class="dprog"><span class="small muted">' + esc(t("drill.progress", { i: D.i + 1, n: D.n })) + "</span>" +
    '<div class="bar"><i style="width:' + Math.round(D.i / D.n * 100) + '%"></i></div>' +
    '<span class="small muted">' + esc(t("drill.runningEarned")) + ' <b style="color:' +
      (D.evEarned >= 0 ? "var(--good)" : "var(--bad)") + '">' + signed(D.evEarned) + "BB</b></span></div>" +
    '<div class="stmeta">' +
      "<span>" + esc(posName(run.heroPos)) + " <b>vs</b> " + esc(posName(run.vilPos)) + "</span>" +
      "<span>" + esc(vtName(run.vt.id)) + "</span>" +
      "<span>" + esc(t("drill.potNow")) + " <b>" + nfmt(run.pot) + "BB</b></span>" +
      "<span>" + esc(t("common.stack")) + " <b>" + nfmt(eff) + "BB</b></span>" +
      "<span>" + esc(run.ip ? t("common.inPosition") : t("common.outOfPosition")) + "</span>" +
      gameChip(run) +
    "</div>";

  // street rail — shows where in the hand you are
  h += '<div class="rail">' + [0, 1, 2, 3].map((i) =>
    '<span class="' + (i === run.street ? "on" : i < run.street ? "done" : "") + '">' + esc(streetName(i)) + "</span>").join("") + "</div>";

  h += '<div class="dspot"><div class="dq">' + esc(streetName(run.street)) + " — " + esc(t("hand.myCards")) + "</div>" +
    '<div class="dh">' + run.hole.map((c) => cardHTML(c)).join("") + "</div>" +
    (run.board.length ? '<div class="dq" style="margin-top:10px">' + esc(t("common.board")) + "</div>" +
      '<div class="dh">' + run.board.map((c) => cardHTML(c)).join("") + "</div>" : "") +
    '<div class="dvs">' + (run.street === 0
      ? t(run.heroPos === "BB" ? "drill.youPostBB" : "drill.villainOpened", { size: nfmt(run.openSize) })
      : run.facing ? t("drill.villainBet", { size: nfmt(run.facing.size) })
                   : (run.ip ? t("drill.villainCheck") : t("drill.heroFirst"))) + "</div>" +
    (run.facing ? '<div class="small muted" style="margin-top:6px">' + esc(t("drill.toCall")) + " " +
      nfmt(run.facing.size) + "BB</div>" : "") + "</div>";

  if (D.answered === null) {
    h += res.opts.map((o, i) => '<button class="dopt" data-i="' + i + '"><span class="kn">' +
      (i + 1) + '</span><span class="kk">' + esc(optLabel(o)) + "</span></button>").join("");
    h += '<div class="small dim" style="margin:2px 0 8px">' + esc(t("drill.keyHint")) + "</div>";
  } else {
    const evs = res.opts.map((o) => o.ev);
    const bestEv = Math.max.apply(null, evs);
    const best = res.opts.find((o) => o.ev === bestEv);
    const mine = res.opts[D.answered];
    const lost = bestEv - mine.ev;
    h += '<div class="recbox' + (lost < 0.02 ? " good" : "") + '"><div class="rl">' + esc(t("common.yourPick")) + "</div>" +
      '<div class="ra">' + esc(optLabel(mine)) + ' <span style="font-size:15px;color:' +
        (mine.ev >= 0 ? "var(--good)" : "var(--bad)") + '">' + signed(mine.ev) + " BB</span></div>" +
      '<div class="rs">' + (lost < 0.02 ? t("drill.perfect")
        : t("drill.lostEv", { v: nfmt(lost, 2), best: esc(optLabel(best)) })) + "</div></div>";
    h += '<div class="blk"><div class="t">' + esc(t("drill.evTable")) + "</div>" + evTable(res.opts, mine) + "</div>";
    h += riskPremiumHTML(res);
    h += '<button class="btn" id="dr-cont">' + esc(t("common.next")) + "</button>";
  }
  v.innerHTML = h + "</div>";
  if (D.answered === null) v.querySelectorAll(".dopt").forEach((b) => (b.onclick = () => answerHand(+b.dataset.i)));
  else $("dr-cont").onclick = continueHand;
}

/* The report: what happened, what the villain could hold, what you looked like. */
function renderHandReport(v) {
  const D = STATE.drill, run = D.run;
  const totalLost = run.log.reduce((a, l) => a + l.lost, 0);
  const vr = HandRun.villainRange(run);
  const likely = PE.topClasses(vr.combos, vr.weights, 8);
  const made = run.board.length >= 3 ? PE.categoryBreakdown(vr.combos, vr.weights, run.board) : [];
  const standing = HandRun.heroStanding(run);

  // Why the hand stopped, said plainly. A hand that ends before the river —
  // villain folding to your bet, most often preflop — otherwise just looks like
  // the practice refused to deal the next street.
  const lastAct = run.log.length ? optLabel(run.log[run.log.length - 1].mine) : "";
  let head, outcome, tone;
  if (run.result === "heroFold") {
    head = t("drill.outHeroFold"); outcome = esc(t("drill.endedHeroFold")); tone = "warn";
  } else if (run.result === "villainFold") {
    head = t("drill.outVillainFold"); tone = "good";
    outcome = t("drill.endedWhy", { act: esc(lastAct), pot: nfmt(run.wonPot || run.pot) });
  } else if (run.result === "allin") {
    head = t("drill.outAllin"); outcome = esc(t("drill.endedAllin")); tone = "";
  } else {
    head = t("drill.outShowdown"); outcome = esc(t("drill.endedShowdown")); tone = "";
  }

  let h = '<div class="card"><h2>' + esc(t("drill.reportTitle")) + "</h2>" +
    '<div class="endban ' + tone + '"><div class="eh">' + esc(head) + "</div>" +
    '<div class="es">' + outcome + "</div>" +
    '<div class="ew">' + esc(t("drill.endedAt", { street: streetName(run.street) })) +
      (run.result === "villainFold" && run.street < 3 ? " · " + esc(t("drill.endedEarly")) : "") + "</div></div>" +
    '<div class="stmeta"><span>' + esc(posName(run.heroPos)) + " <b>vs</b> " + esc(posName(run.vilPos)) + "</span>" +
    "<span>" + esc(vtName(run.vt.id)) + "</span>" +
    "<span>" + esc(t("common.pot")) + " <b>" + nfmt(run.pot) + "BB</b></span></div>" +
    '<div class="dspot"><div class="dh">' + run.hole.map((c) => cardHTML(c)).join("") +
      (run.board.length ? ' <span class="dim" style="margin:0 8px">|</span> ' + run.board.map((c) => cardHTML(c)).join("") : "") +
    "</div></div>";

  // showdown, if it got there
  if (run.result === "showdown") {
    const vh = HandRun.showdown(run);
    if (vh) {
      const mine = PE.evalHand(run.hole.concat(run.board));
      const theirs = PE.evalHand([vh[0], vh[1]].concat(run.board));
      const verdict = mine > theirs ? "showdownWin" : mine < theirs ? "showdownLose" : "showdownTie";
      h += '<div class="blk ' + (mine > theirs ? "hi" : "warn") + '"><div class="t">' + esc(t("drill.villainShows")) + "</div>" +
        "<p>" + vh.map((c) => cardHTML(c, true)).join("") + " — " + esc(catName(PE.catOf(theirs))) +
        " · <b>" + esc(t("drill." + verdict)) + "</b></p>" +
        '<div class="small dim">' + esc(t("drill.resultNote")) + "</div></div>";
    }
  }

  // the line, street by street
  h += '<div class="blk sumcard"><div class="t">' + esc(t("drill.reportLine")) + "</div>" +
    run.log.map((l) => '<div class="sr"><span class="n">' + esc(streetName(l.street)) + "</span>" +
      '<span class="a">' + esc(optLabel(l.mine)) +
        (l.lost < 0.02 ? "" : " → <b>" + esc(optLabel(l.best)) + "</b>") +
        ' <span class="dim">· ' + esc(t("common.equity")) + " " + pct(l.eq) + "</span></span>" +
      '<span class="z" style="color:' + (l.lost < 0.02 ? "var(--good)" : "var(--bad)") + '">' +
        signed(l.mine.ev) + "BB" + (l.lost < 0.02 ? " ✓" : " (" + lossText(l.lost) + ")") + "</span></div>").join("") +
    '<div class="sr"><span class="n"></span><span class="a"><b>' + esc(t("drill.endEvLost")) + "</b></span>" +
      '<span class="z" style="color:' + (totalLost < 0.02 ? "var(--good)" : "var(--bad)") + '">' + lossText(totalLost) + "BB</span></div></div>";

  // villain's likely holdings
  h += '<div class="blk vx"><div class="t">' + esc(t("drill.villainLikely")) + "</div>" +
    '<div class="cbars">' + likely.map((x) =>
      '<div class="cb"><span class="cn">' + esc(x.cls) + '</span><span class="cf"><i style="width:' +
      Math.round(x.share / Math.max(0.0001, likely[0].share) * 100) + '%"></i></span>' +
      '<span class="cv">' + (x.share * 100).toFixed(1) + "%</span></div>").join("") + "</div>";
  if (made.length) {
    h += '<div class="small muted" style="margin:10px 0 4px">' + esc(t("drill.villainMade")) + "</div>" +
      '<div class="cbars">' + made.slice(0, 5).map((x) =>
        '<div class="cb"><span class="cn">' + esc(x.key === "draw" ? t("draws.any") : catName(+x.key)) +
        '</span><span class="cf"><i style="width:' + Math.round(x.share * 100) + '%"></i></span>' +
        '<span class="cv">' + Math.round(x.share * 100) + "%</span></div>").join("") + "</div>";
  }
  h += "</div>";

  // what hero's own line represented
  if (standing) {
    const rep = PE.topClasses(standing.perceived.combos, standing.perceived.weights, 8);
    const band = standing.pct <= 0.33 ? "narrativeStrong" : standing.pct <= 0.66 ? "narrativeMid" : "narrativeWeak";
    h += '<div class="blk"><div class="t">' + esc(t("drill.youRepresent")) + "</div>" +
      '<p class="small muted">' + esc(t("drill.youRepresentNote")) + "</p>" +
      '<div class="cbars">' + rep.map((x) =>
        '<div class="cb"><span class="cn">' + esc(x.cls) + '</span><span class="cf"><i style="width:' +
        Math.round(x.share / Math.max(0.0001, rep[0].share) * 100) + '%"></i></span>' +
        '<span class="cv">' + (x.share * 100).toFixed(1) + "%</span></div>").join("") + "</div>" +
      '<div class="blk hi" style="margin-top:10px"><div class="t">' + esc(t("drill.heroRank")) + "</div>" +
      "<p>" + t("drill.heroRankVal", {
        cat: esc(catName(PE.catOf(PE.evalHand(run.hole.concat(run.board))))),
        p: Math.max(1, Math.round(standing.pct * 100)),
        beat: Math.max(0, Math.round((1 - standing.pct) * 100))
      }) + "</p><p>" + t("drill." + band) + "</p>" +
      '<div class="small dim">' + t("drill.heroRankNote") + "</div></div></div>";
  }

  h += '<button class="btn" id="dr-nexthand">' + esc(D.i + 1 >= D.n ? t("drill.seeResult") : t("drill.next")) + "</button></div>";
  v.innerHTML = h;
  $("dr-nexthand").onclick = nextHand;
}

function storyText(s) {
  return t("drill.story." + s.k, { size: s.size !== undefined ? nfmt(s.size) : "" }) || "";
}
function renderDrillEnd(v) {
  const D = STATE.drill;
  const n = Math.max(1, D.i);
  // Accuracy, capture and EV lost are accumulated once per DECISION. A whole
  // hand is several decisions, so dividing them by the hand count reported
  // accuracy above 100%. Everything per-decision divides by decisions.
  const dec = Math.max(1, D.decisions || D.i);
  const perSpot = D.evLost / dec;
  const capture = D.evCaptured / dec;
  const accuracy = Math.round(D.correct / dec * 100);
  const earned = D.evEarned, bestPossible = D.evBest;
  const sessionRate = D.potSum > 0 ? ratingOf(D.evLost / D.potSum) : ratingOfBB(perSpot);
  const grade = gradeFromRating(sessionRate);
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
    '<div class="score"><div class="ring" style="--p:' + Math.min(100, accuracy) + '"><b>' +
      accuracy + "%</b></div>" +
    '<div><div class="small muted">' + esc(t("drill.grade")) + " · " + esc(t("drill.rating")) + "</div>" +
    '<div class="gv" style="color:' + gradeColor(grade) + '">' + grade +
      ' <span style="font-size:20px">' + sessionRate + "</span></div>" +
    '<div class="small dim">' + esc(t("drill.gradeNote")) + "</div></div></div>" +
    '<div class="kpi">' +
      '<div class="k"><div class="kk">' + esc(t(D.mode === "hand" ? "drill.endHands" : "drill.endSpots")) +
        '</div><div class="kv">' + D.i + "</div></div>" +
      (D.mode === "hand"
        ? '<div class="k"><div class="kk">' + esc(t("drill.endDecisions")) + '</div><div class="kv">' + dec + "</div></div>"
        : "") +
      '<div class="k"><div class="kk">' + esc(t("drill.endEarned")) + '</div><div class="kv" style="color:' +
        (earned >= 0 ? "var(--good)" : "var(--bad)") + '">' + signed(earned) + "</div></div>" +
      '<div class="k"><div class="kk">' + esc(t("drill.endBest")) + '</div><div class="kv">' + signed(bestPossible) + "</div></div>" +
      '<div class="k"><div class="kk">' + esc(t("drill.endEvLost")) + '</div><div class="kv">' + lossText(D.evLost) + "</div></div>" +
      '<div class="k"><div class="kk">' + esc(t(D.mode === "hand" ? "drill.endPerDecision" : "drill.endPerSpot")) +
        '</div><div class="kv">' + lossText(perSpot) + "</div></div>" +
      '<div class="k"><div class="kk">' + esc(t("drill.endCapture")) + '</div><div class="kv">' + Math.round(capture * 100) + "%</div></div>" +
    "</div>" +
    '<div class="blk hi" style="margin-top:14px"><p style="margin:0">' +
      t(D.evLost < 0.02 ? "drill.sessionPerfect" : "drill.sessionEarned",
        { earned: signed(earned), best: signed(bestPossible) }) + "</p></div>" +
    '<div class="blk warn" style="margin-top:14px"><div class="t">' + esc(t("drill.endLeak")) + "</div><p>" + esc(leakText) + "</p></div>";
  // per-spot review
  h += '<div class="blk sumcard"><div class="t">' + esc(t("drill.endByAction")) + "</div>" +
    (D.log.length
      ? D.log.map((l, i) => {
          // In hand mode several rows belong to one hand; label the first of
          // each hand so a run of decisions reads as the hand it came from.
          const newHand = l.hand !== undefined && (i === 0 || D.log[i - 1].hand !== l.hand);
          const label = l.hand !== undefined
            ? (newHand ? t("drill.handNo", { n: l.hand }) : "")
            : String(i + 1);
          return '<div class="sr' + (newHand && i > 0 ? " hsep" : "") + '"><span class="n">' + esc(label) + "</span>" +
            '<span class="a">' + (l.streetLabel ? '<span class="dim">' + esc(l.streetLabel) + "</span> " : "") +
              esc(l.mineLabel) + (l.lost < 0.02 ? "" : " → <b>" + esc(l.bestLabel) + "</b>") + "</span>" +
            '<span class="z" style="color:' + (l.lost < 0.02 ? "var(--good)" : "var(--bad)") + '">' +
            (l.lost < 0.02 ? "✓" : lossText(l.lost) + "BB") + "</span></div>";
        }).join("")
      : '<p class="small dim" style="margin:0">' + esc(t("drill.endNoActions")) + "</p>") + "</div>";
  h += headToHeadHTML(D);
  h += challengeShareHTML(D);
  h += '<div class="row" style="margin-top:12px">' +
    '<div style="flex:0 0 auto"><button class="btn" id="dr-again">' + esc(t("drill.again")) + "</button></div>" +
    '<div style="flex:0 0 auto"><button class="btn sec" id="dr-home">' + esc(t("drill.home")) + "</button></div></div></div>";
  v.innerHTML = h;
  $("dr-again").onclick = () => startDrill(drillConfig());
  $("dr-home").onclick = () => { STATE.drill = null; renderDrill(); };
  bindChallengeShare(D);
}

/* --- head to head ------------------------------------------------------- */
function headToHeadHTML(D) {
  const ch = D.challenge;
  if (!ch || !ch.from) return "";
  return h2hBlock(resultOf(D), ch.from);
}
/** Both sides of a challenge, scored the same way on the same hands. */
function h2hBlock(me, them) {
  const rate = (r) => (r.ps > 0 ? ratingOf(r.el / r.ps) : ratingOfBB(r.el / Math.max(1, r.d)));
  const mineRate = rate(me), theirRate = rate(them);
  const name = them.nm || t("vs.them");

  const row = (label, mv, tv, better, fmt) => {
    const f = fmt || ((x) => nfmt(x, 2));
    const win = better === 0 ? null : (better > 0 ? mv > tv : mv < tv);
    const tie = Math.abs(mv - tv) < 1e-9;
    return '<div class="h2h"><span class="hl">' + esc(label) + "</span>" +
      '<span class="hv' + (!tie && win ? " w" : "") + '">' + esc(f(mv)) + "</span>" +
      '<span class="hv' + (!tie && win === false ? " w" : "") + '">' + esc(f(tv)) + "</span></div>";
  };

  const gap = mineRate - theirRate;
  const evGap = them.el - me.el;              // + means I gave away less
  const verdict = Math.abs(gap) < 3 ? "h2hEven" : gap > 0 ? "h2hAhead" : "h2hBehind";

  return '<div class="blk ' + (gap >= 0 ? "hi" : "warn") + '" style="margin-top:14px">' +
    '<div class="t">' + esc(t("vs.title")) + "</div>" +
    '<p style="margin:0 0 10px">' + t("vs." + verdict, {
      who: esc(name), pts: Math.abs(Math.round(gap)), bb: nfmt(Math.abs(evGap), 2) }) + "</p>" +
    '<div class="h2h head"><span class="hl"></span><span class="hv">' + esc(t("vs.me")) +
      '</span><span class="hv">' + esc(name) + "</span></div>" +
    row(t("drill.rating"), mineRate, theirRate, 1, (x) => Math.round(x) +
      " " + gradeFromRating(x)) +
    row(t("drill.endEvLost"), me.el, them.el, -1, (x) => lossText(x) + "BB") +
    row(t("drill.endAccuracy"), me.cr / me.d * 100, them.cr / them.d * 100, 1,
      (x) => Math.round(x) + "%") +
    row(t("drill.endCapture"), me.cp / me.d * 100, them.cp / them.d * 100, 1,
      (x) => Math.round(x) + "%") +
    '<div class="small dim" style="margin-top:10px">' + esc(t("vs.sameSpots")) + "</div>" +
    biggestGapsHTML(me, them) + "</div>";
}
/** Where the match was actually decided. */
function biggestGapsHTML(me, them) {
  const n = Math.min(me.sp.length, them.sp.length);
  if (n < 2) return "";
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ i, d: (them.sp[i] || 0) - (me.sp[i] || 0) });
  rows.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const top = rows.slice(0, 3).filter((r) => Math.abs(r.d) >= 0.05);
  if (!top.length) return "";
  return '<div class="blk sumcard" style="margin:10px 0 0">' +
    '<div class="t">' + esc(t("vs.decidedBy")) + "</div>" +
    top.map((r) => '<div class="sr"><span class="n">' + (r.i + 1) + "</span>" +
      '<span class="a">' + esc(t(r.d > 0 ? "vs.wonSpot" : "vs.lostSpot")) + "</span>" +
      '<span class="z" style="color:' + (r.d > 0 ? "var(--good)" : "var(--bad)") + '">' +
      signed(r.d) + "BB</span></div>").join("") + "</div>";
}

/** Paste a friend's code and play their exact session. */
function challengeAcceptHTML() {
  return '<div class="card"><h3>' + esc(t("vs.acceptTitle")) + "</h3>" +
    "<p>" + esc(t("vs.acceptNote")) + "</p>" +
    '<div><label>' + esc(t("vs.pasteLabel")) + "</label>" +
    '<textarea id="ch-in" rows="3" placeholder="HS1..." style="width:100%"></textarea></div>' +
    '<div class="row" style="margin-top:10px">' +
      '<div style="flex:0 0 auto"><button class="btn sec" id="ch-load">' + esc(t("vs.loadCode")) + "</button></div>" +
    "</div><div id=\"ch-preview\"></div></div>";
}
function bindChallengeAccept() {
  const btn = $("ch-load"); if (!btn) return;
  btn.onclick = () => {
    const card = decodeChallenge($("ch-in").value);
    const out = $("ch-preview");
    if (!card) {
      out.innerHTML = '<div class="notice" style="margin-top:10px">' + esc(t("vs.badCode")) + "</div>";
      return;
    }
    const s = card.spec, f = card.from;
    const rating = f.ps > 0 ? ratingOf(f.el / f.ps) : ratingOfBB(f.el / Math.max(1, f.d));
    // have I already played these exact hands?
    const mine = DB.get("drills", []).find((d) => d.seed === card.seed && d.result &&
      d.spec && d.spec.n === s.n && d.spec.mode === s.mode);
    out.innerHTML = '<div class="blk hi" style="margin-top:12px"><div class="t">' +
      esc(t("vs.fromWho", { who: f.nm || t("vs.them") })) + "</div>" +
      '<div class="stmeta">' +
        "<span>" + esc(t(s.mode === "hand" ? "drill.modeHand" : "drill.modeSpot")) + "</span>" +
        "<span>" + esc(t(s.mode === "hand" ? "drill.endHands" : "drill.endSpots")) + " <b>" + s.n + "</b></span>" +
        "<span>" + esc(t(s.game === "cash" ? "drill.gameCash" : "drill.gameMtt")) + "</span>" +
        "<span>" + esc(t("drill.rating")) + " <b>" + Math.round(rating) + " " + gradeFromRating(rating) + "</b></span>" +
      "</div>" +
      // If this is a challenge back on a session already played, there is
      // nothing to replay — go straight to the comparison.
      (mine
        ? "<p>" + esc(t("vs.alreadyPlayed")) + "</p>" +
          '<button class="btn" id="ch-compare">' + esc(t("vs.compareNow")) + "</button> " +
          '<button class="btn sec" id="ch-start">' + esc(t("vs.playAgain")) + "</button>"
        : "<p>" + esc(t("vs.acceptWarn")) + "</p>" +
          '<button class="btn" id="ch-start">' + esc(t("vs.playIt")) + "</button>") +
      "</div>";
    $("ch-start").onclick = () => startDrill(null, card);
    if (mine) {
      $("ch-compare").onclick = () => {
        out.innerHTML = '<div style="margin-top:12px">' + h2hBlock(mine.result, f) + "</div>";
      };
    }
  };
}

/* --- making and accepting a challenge ----------------------------------- */
function challengeShareHTML(D) {
  return '<div class="blk" style="margin-top:14px"><div class="t">' + esc(t("vs.shareTitle")) + "</div>" +
    "<p>" + esc(t(D.challenge ? "vs.shareBackNote" : "vs.shareNote")) + "</p>" +
    '<div class="row" style="margin-top:8px">' +
      '<div><label>' + esc(t("vs.yourName")) + '</label>' +
      '<input id="ch-name" maxlength="16" value="' + esc(DB.get("who", "")) + '" placeholder="' + esc(t("vs.namePh")) + '"></div>' +
    "</div>" +
    '<div class="row" style="margin-top:10px">' +
      '<div style="flex:0 0 auto"><button class="btn" id="ch-make">' + esc(t("vs.makeCode")) + "</button></div>" +
    "</div><div id=\"ch-out\"></div></div>";
}
function bindChallengeShare(D) {
  const btn = $("ch-make"); if (!btn) return;
  btn.onclick = () => {
    const who = ($("ch-name").value || "").trim().slice(0, 16);
    DB.set("who", who);
    D.who = who;
    const code = encodeChallenge(D);
    $("ch-out").innerHTML = '<div class="small muted" style="margin:12px 0 4px">' +
      esc(t("vs.codeReady")) + "</div>" +
      '<div class="notation" id="ch-code">' + esc(code) + "</div>" +
      '<button class="btn sec sm" id="ch-copy" style="margin-top:8px">' + esc(t("vs.copyCode")) + "</button>" +
      '<div class="small dim" style="margin-top:6px">' + esc(t("vs.codeHint")) + "</div>";
    $("ch-copy").onclick = () => {
      if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => toast(t("common.copied")), () => {});
      else toast(t("common.copied"));
    };
  };
}
function drillHistoryHTML() {
  const hist = DB.get("drills", []);
  if (!hist.length) return "";
  return '<div class="card"><h3>' + esc(t("drill.history")) + "</h3>" +
    '<div class="scrollx"><table class="tstack"><tr><th>' + esc(t("stats.date")) + "</th><th>" +
    esc(t("drill.endSpots")) + "</th><th>" + esc(t("drill.grade")) + "</th><th>" +
    esc(t("drill.endEarned")) + "</th><th>" + esc(t("drill.endEvLost")) + "</th></tr>" +
    hist.slice(0, 8).map((d) => "<tr><td data-l=\"" + esc(t("stats.date")) + "\">" + new Date(d.at).toLocaleDateString() + "</td>" +
      '<td data-l="' + esc(t("drill.endSpots")) + '">' + d.n + "</td>" +
      '<td data-l="' + esc(t("drill.grade")) + '">' + (function () {
        const r = sessionRating(d);
        return gradeBadge(gradeFromRating(r), r);
      })() + "</td>" +
      '<td data-l="' + esc(t("drill.endEarned")) + '">' +
        (d.evEarned === undefined ? "—" : '<span style="color:' + (d.evEarned >= 0 ? "var(--good)" : "var(--bad)") + '">' + signed(d.evEarned) + "BB</span>") + "</td>" +
      '<td data-l="' + esc(t("drill.endEvLost")) + '">' + lossText(d.evLost) + "BB</td></tr>").join("") +
    "</table></div></div>";
}

/* ============================================================ RANGE LAB == */
const RANGE_STATE = {
  seats: 6, situation: "rfi", pos: "BTN", vs: "CO", stack: 15,
  game: "cash", stage: "bubble",
  hand: "", custom: "22+ A9s+ KTs+ AJo+", board: ""
};
function chips(id, items, active, key) {
  return '<div class="bg" id="' + id + '" style="display:flex;margin-bottom:8px">' +
    items.map((it) => '<button data-k="' + esc(it.k) + '" class="' + (String(active) === String(it.k) ? "on" : "") + '">' +
      esc(it.label) + "</button>").join("") + "</div>";
}
function renderRange() {
  const v = $("v-range");
  const R = RANGE_STATE;
  const sit = PE.SITUATIONS.find((x) => x.id === R.situation) || PE.SITUATIONS[0];

  // positions that can actually take this action at this table size
  const all = PE.posList(R.seats);
  const canAct = R.situation === "rfi"
    ? all.filter((p) => PE.rfiRange(R.seats, p).length)
    : /shove/.test(R.situation) ? all : all;
  if (canAct.indexOf(R.pos) < 0) R.pos = canAct[canAct.length - 1];
  const opponents = all.filter((p) => p !== R.pos);
  if (opponents.indexOf(R.vs) < 0) R.vs = opponents[0];

  const mtt = R.game === "mtt";
  const ante = mtt ? 1 : 0;
  const shortStack = /shove/.test(R.situation);
  // A jam is the one chart where the prize ladder changes the answer, so it
  // is the only one that carries an ICM model.
  const icm = mtt && shortStack
    ? PE.icmTable({ stage: R.stage, heroStack: R.stack, vilStack: R.stack }) : null;
  const args = { seats: R.seats, situation: R.situation, pos: R.pos, vs: R.vs,
    stack: R.stack, vt: PE.VILLAIN_TYPES.unknown, ante, icm };
  const classes = PE.situationRange(args);
  // What to compare against depends on what is doing the work. For an ordinary
  // chart the ante is the whole story, so cash is the baseline. For a jam the
  // ante and the ladder pull in opposite directions and roughly cancel against
  // cash — comparing to the same tournament chart priced on chips instead
  // isolates what the ladder actually costs you.
  const baseArgs = icm ? Object.assign({}, args, { icm: null })
                       : Object.assign({}, args, { ante: 0 });
  const baseClasses = mtt ? PE.situationRange(baseArgs) : null;
  const baseLabel = icm ? "range.vsChipEv" : "range.vsCash";
  const combos = classes.reduce((a, c) => a + PE.combosOf(c), 0);

  let h = '<div class="card"><h2>' + esc(t("range.h1")) + "</h2><p>" + esc(t("range.lead")) + "</p></div>";
  h += '<div class="card">' +
    '<div class="small muted" style="margin-bottom:4px">' + esc(t("range.tableSize")) + "</div>" +
    chips("rg-seats", [
      { k: 2, label: t("hand.seats2") }, { k: 6, label: t("hand.seats6") }, { k: 9, label: t("hand.seats9") }
    ], R.seats) +
    '<div class="small muted" style="margin-bottom:4px">' + esc(t("drill.gameStep")) + "</div>" +
    chips("rg-game", [{ k: "cash", label: t("drill.gameCash") }, { k: "mtt", label: t("drill.gameMtt") }], R.game) +
    (mtt && shortStack
      ? '<div class="small muted" style="margin-bottom:4px">' + esc(t("drill.stageStep")) + "</div>" +
        chips("rg-stage", MTT_STAGE_KEYS.map((k) =>
          ({ k, label: stageName(k) })), R.stage)
      : "") +
    '<div class="small muted" style="margin-bottom:4px">' + esc(t("range.situation")) + "</div>" +
    chips("rg-sit", PE.SITUATIONS.map((x) => ({ k: x.id, label: t("range.sit." + x.id) })), R.situation) +
    '<div class="small muted" style="margin-bottom:4px">' + esc(t("range.position")) + "</div>" +
    chips("rg-pos", canAct.map((p) => ({ k: p, label: posName(p) })), R.pos) +
    (sit.needsVs
      ? '<div class="small muted" style="margin-bottom:4px">' + esc(t("range.vsPosition")) + "</div>" +
        chips("rg-vs", opponents.map((p) => ({ k: p, label: posName(p) })), R.vs)
      : "") +
    (shortStack
      ? '<div class="small muted" style="margin-bottom:4px">' + esc(t("range.stackDepth")) + "</div>" +
        chips("rg-stack", [8, 10, 12, 15, 20, 25].map((n) => ({ k: n, label: n + "BB" })), R.stack)
      : "") +
    '<div class="blk hi" style="margin-top:12px"><div class="t">' +
      esc(t("range.sit." + R.situation)) + " · " + esc(posName(R.pos)) +
      (sit.needsVs ? " " + esc(t("common.vs")) + " " + esc(posName(R.vs)) : "") +
      (shortStack ? " · " + R.stack + "BB" : "") +
      (mtt ? " · " + esc(t("drill.gameMtt")) + (icm ? " " + esc(stageName(R.stage)) : "") : "") +
      "</div>" +
    "<p>" + esc(t("range.sitNote." + R.situation)) + "</p>" +
    (mtt ? '<p class="small dim">' + t(icm ? "range.mttIcmNote" : "range.mttNote") + "</p>" : "") +
    '<div class="facts" style="margin-bottom:10px">' +
      fact(t("common.hand"), nfmt(PE.rangePct(classes)) + "%", t("range.combos", { n: combos })) +
      (baseClasses
        ? fact(t(baseLabel), nfmt(PE.rangePct(baseClasses)) + "%",
            t("range.vsCashD", { v: signed(PE.rangePct(classes) - PE.rangePct(baseClasses), 1) }))
        : "") +
    "</div>" +
    gridHTML(classes, null) +
    '<div class="small muted" style="margin:10px 0 4px">' + esc(t("range.notation")) + "</div>" +
    '<div class="notation" id="rg-note">' + esc(PE.rangeNotation(classes)) + "</div>" +
    '<button class="btn sec sm" id="rg-copy" style="margin-top:8px">' + esc(t("range.copyNotation")) + "</button>" +
    "</div></div>";

  h += '<div class="card"><h3>' + esc(t("range.calcTitle")) + "</h3>" +
    '<div class="grid g3">' +
    '<div><label>' + esc(t("range.myHand")) + '</label><input id="rg-hand" value="' + esc(R.hand) + '" placeholder="AsKd"></div>' +
    '<div><label>' + esc(t("range.vsRange")) + '</label><input id="rg-range" value="' + esc(R.custom) + '"></div>' +
    '<div><label>' + esc(t("range.boardOpt")) + '</label><input id="rg-board" value="' + esc(R.board) + '" placeholder="Kh7s2d"></div>' +
    "</div>" +
    '<div class="small dim" style="margin-top:6px">' + esc(t("range.rangeHint")) + "</div>" +
    '<div class="row" style="margin-top:12px">' +
      '<div style="flex:0 0 auto"><button class="btn" id="rg-go">' + esc(t("range.calc")) + "</button></div>" +
      '<div style="flex:0 0 auto"><button class="btn sec" id="rg-use">' + esc(t("range.situation")) + " →</button></div>" +
    "</div><div id=\"rg-out\"></div></div>";
  v.innerHTML = h;

  const bind = (id, prop, cast) => {
    const el = $(id); if (!el) return;
    el.querySelectorAll("button").forEach((b) => (b.onclick = () => {
      RANGE_STATE[prop] = cast ? cast(b.dataset.k) : b.dataset.k; renderRange();
    }));
  };
  bind("rg-seats", "seats", Number); bind("rg-sit", "situation");
  bind("rg-pos", "pos"); bind("rg-vs", "vs"); bind("rg-stack", "stack", Number);
  bind("rg-game", "game"); bind("rg-stage", "stage");
  $("rg-copy").onclick = () => {
    const text = PE.rangeNotation(classes);
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast(t("common.copied")), () => {});
    else toast(t("common.copied"));
  };
  // drop the charted range straight into the calculator
  $("rg-use").onclick = () => { RANGE_STATE.custom = PE.rangeNotation(classes); renderRange(); };
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
  const ov = overallRating();
  let h = '<div class="card"><h2>' + esc(t("stats.h1")) + "</h2>";
  if (ov) {
    h += '<div class="score" style="margin-bottom:12px">' +
      '<div class="ring" style="--p:' + ov.rating + '"><b style="color:' + gradeColor(ov.grade) + '">' + ov.grade + "</b></div>" +
      '<div><div class="small muted">' + esc(t("stats.overallRating")) + "</div>" +
      '<div class="gv" style="color:' + gradeColor(ov.grade) + '">' + ov.rating + "</div>" +
      '<div class="small dim">' + esc(t("stats.decisions")) + " " + ov.decisions + " · " +
        esc(t("hand.evLost")) + " " +
        (ov.per !== null ? Math.round(ov.per * 1000) / 10 + "% " + esc(t("stats.ofPot"))
                         : lossText(ov.perBB) + "BB") + "</div></div></div>" +
      '<div class="small dim" style="margin-bottom:10px">' + esc(t("stats.ratingNote")) + "</div>";
  }
  h += '<div class="kpi">' +
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
  h += '<div class="card"><h3>' + esc(t("stats.leakTitle")) + "</h3>" +
    '<details style="margin:0 0 12px"><summary>' + esc(t("stats.leakWhat")) + "</summary><p>" +
    t("stats.leakWhatBody") + "</p></details>";
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
/* Home is the player's own record at a glance. The tendency profile has its
 * own tab and used to be repeated here in full, which buried everything
 * else — a summary of who you are, not a second copy of the profile. */
function myInfoCard() {
  const ov = overallRating();
  const hands = DB.get("hands", []), drills = DB.get("drills", []);
  const who = DB.get("who", "");
  const lastAt = Math.max(drills.length ? drills[0].at || 0 : 0, hands.length ? hands[0].at || 0 : 0);

  let h = '<div class="card"><div class="mehead">' +
    '<div class="meid"><h3 style="margin:0">' + esc(who || t("home.meAnon")) + "</h3>" +
    '<div class="small dim">' + esc(lastAt ? t("home.lastSeen", { d: new Date(lastAt).toLocaleDateString() })
      : t("home.neverPlayed")) + "</div></div>" +
    (ov ? gradeBadge(ov.grade, Math.round(ov.rating)) : "") + "</div>";

  if (!ov && !hands.length) {
    h += '<div class="empty">' + esc(t("home.meEmpty")) + "</div></div>";
    return h;
  }
  h += '<div class="kpi" style="margin-top:12px">' +
    '<div class="k"><div class="kk">' + esc(t("stats.overallRating")) + '</div><div class="kv">' +
      (ov ? Math.round(ov.rating) : "—") + "</div></div>" +
    '<div class="k"><div class="kk">' + esc(t("home.meSessions")) + '</div><div class="kv">' +
      (ov ? ov.sessions : 0) + "</div></div>" +
    '<div class="k"><div class="kk">' + esc(t("stats.decisions")) + '</div><div class="kv">' +
      (ov ? ov.decisions : 0) + "</div></div>" +
    '<div class="k"><div class="kk">' + esc(t("home.meHands")) + '</div><div class="kv">' +
      hands.length + "</div></div>" +
    "</div>";
  if (ov && ov.per !== null) {
    h += '<div class="small dim" style="margin-top:10px">' +
      esc(t("home.meLoss", { v: (ov.per * 100).toFixed(1) })) + "</div>";
  }
  h += '<div class="row" style="margin-top:12px">' +
    '<div style="flex:0 0 auto"><button class="btn sec sm" data-go="stats">' + esc(t("home.meMore")) + "</button></div>" +
    "</div></div>";
  return h;
}

function renderHome() {
  const v = $("v-home");
  const hands = DB.get("hands", []), drills = DB.get("drills", []);
  let h = '<div class="card"><h1>' + esc(t("home.h1")) + "</h1><p>" + t("home.lead") + "</p>" +
    '<div class="homecta">' +
      '<button data-go="quiz"><div class="ct">' + esc(t("home.cta1")) + '</div><div class="cd">' + esc(t("home.cta1d")) + "</div></button>" +
      '<button data-go="hand"><div class="ct">' + esc(t("home.cta2")) + '</div><div class="cd">' + esc(t("home.cta2d")) + "</div></button>" +
      '<button data-go="drill"><div class="ct">' + esc(t("home.cta3")) + '</div><div class="cd">' + esc(t("home.cta3d")) + "</div></button>" +
    "</div></div>";
  h += myInfoCard();
  if (drills.length) {
    const last = drills[0];
    h += '<div class="card"><h3>' + esc(t("home.drillSummary")) + "</h3>" +
      '<div class="kpi"><div class="k"><div class="kk">' + esc(t("drill.endSpots")) + '</div><div class="kv">' + last.n + "</div></div>" +
      '<div class="k"><div class="kk">' + esc(t("drill.grade")) + '</div><div class="kv">' + (function () {
        const r = sessionRating(last), g = gradeFromRating(r);
        return '<span style="color:' + gradeColor(g) + '">' + g + " " + r + "</span>";
      })() + "</div></div>" +
      '<div class="k"><div class="kk">' + esc(t("drill.endEarned")) + '</div><div class="kv" style="color:' +
        (last.evEarned === undefined ? "" : last.evEarned >= 0 ? "var(--good)" : "var(--bad)") + '">' +
        (last.evEarned === undefined ? "—" : signed(last.evEarned)) + "</div></div>" +
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
  HI.pos = "BTN"; HI.seated = { BB: "tag", CO: "station", HJ: "nit" };
  HI.vpos = "BB"; HI.scenario = "open_call"; HI.vt = "tag";
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
  applyTheme();
  const meta = I18N.lookup(LANG, "meta") || {};
  document.documentElement.lang = meta.htmlLang || LANG;
  document.title = t("app.docTitle");
  renderChrome();
  renderStaticLabels();
  renderStorageBar();

  $("langsel").onchange = (e) => setLang(e.target.value);
  $("themebtn").onclick = toggleTheme;
  $("s-save").onclick = saveSetup;
  ["s-seats", "s-stack", "s-bl", "s-br", "s-gt", "s-ante"].forEach((id) => {
    const el = $(id); if (el) {
      const on = () => {
        renderBankroll(); renderStackHint();
        if (id === "s-seats") buildHandInputs();
        // Switching to a tournament brings in the ante and the stage picker;
        // a tournament with no ante posted is almost never what was meant.
        if (id === "s-gt") {
          const ante = $("s-ante");
          if (ante && setupGame() !== "cash" && !(+ante.value > 0)) ante.value = 1;
          if (ante && setupGame() === "cash" && +ante.value === 1) ante.value = 0;
        }
        if (id === "s-gt" || id === "s-ante") { renderPreflopSizes(); renderActions(); }
      };
      el.onchange = on; el.oninput = on;
    }
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
/* ======================================================== TOURNAMENT =====
 * Running a live game: pick a structure, open the tournament, and put the
 * clock on a screen the room can see. The maths is in tourney.js; this is
 * the board and the director's controls.
 *
 * The board deliberately stays dark in both themes — it is meant for a
 * projector or a TV across a room, where a light background is glare.
 * ======================================================================== */
let TD = null, TDINT = null;
const tdSave = () => { if (TD) { TD.at = Date.now(); DB.set("td", TD); } };
const tdCustom = () => DB.get("tdcustom", []);
const curLv = () => (TD && TD.levels[TD.lvl] ? TD.levels[TD.lvl] : null);
const tdStructName = (id) => t("tour.struct." + id + ".n");

/* Amounts are KRW. Korean reads them in 만 units the way a cash desk does;
 * everywhere else gets grouped digits, which is unambiguous. */
function money(n) {
  n = n || 0;
  if (LANG !== "ko") return "₩" + Math.round(n).toLocaleString();
  // Past 1억, "54,600만원" is a wall of digits nobody reads off a board.
  if (n >= 100000000) return (Math.round(n / 1000000) / 100).toLocaleString() + t("tour.eok");
  const m = n / 10000;
  const s = m >= 100 ? Math.round(m) : m >= 10 ? Math.round(m * 10) / 10 : Math.round(m * 100) / 100;
  return s.toLocaleString() + t("tour.manwon");
}
/** Chip counts abbreviate too, but blinds never do — those must be read exactly. */
function chipsOf(n) {
  n = n || 0;
  if (LANG !== "ko") return Math.round(n).toLocaleString();
  if (n >= 10000) {
    const m = n / 10000;
    return (m >= 100 ? Math.round(m) : Math.round(m * 10) / 10).toLocaleString() + t("tour.man");
  }
  if (n >= 1000) return (Math.round(n / 100) / 10) + t("tour.cheon");
  return Math.round(n).toLocaleString();
}
const numk = (n) => (n || 0).toLocaleString();

function tdSaveCustom(name) {
  const arr = tdCustom();
  arr.unshift({ id: "c" + Date.now(), n: name, buyin: TD.buyin, stack: TD.startStack,
    rebuyPrice: TD.rebuyPrice, rebuyStack: TD.rebuyStack,
    payN: TD.payN, pay: TD.pay.slice(), payCurve: TD.payCurve, poolPct: TD.poolPct,
    levels: JSON.parse(JSON.stringify(TD.levels)) });
  DB.set("tdcustom", arr.slice(0, 20));
}

/* ---- the clock ------------------------------------------------------- */
function beep(times, freq) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const A = new AC();
    for (let i = 0; i < (times || 1); i++) {
      const o = A.createOscillator(), g = A.createGain();
      o.connect(g); g.connect(A.destination);
      o.type = "sine"; o.frequency.value = freq || 880;
      const at = A.currentTime + i * 0.34;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.30);
      o.start(at); o.stop(at + 0.32);
    }
  } catch (e) { /* a silent clock is better than a broken one */ }
}
function tdStart() {
  if (!TD.levels.length) return;
  if (TD.remain <= 0) TD.remain = (curLv().min || 1) * 60000;
  TD.endsAt = Date.now() + TD.remain;
  TD.running = true; tdSave(); tdLoop();
}
function tdPause() {
  if (TD.running) {
    TD.remain = Math.max(0, TD.endsAt - Date.now());
    TD.running = false; TD.endsAt = null; tdSave();
  }
  paintClock();
}
function tdGoto(i, keepRunning) {
  TD.lvl = Math.max(0, Math.min(TD.levels.length - 1, i));
  TD.remain = (curLv().min || 1) * 60000;
  if (TD.running || keepRunning) { TD.endsAt = Date.now() + TD.remain; TD.running = true; }
  else TD.endsAt = null;
  tdSave(); renderTour();
}
function tdAdjust(ms) {
  TD.remain = Math.max(0, (TD.running ? TD.endsAt - Date.now() : TD.remain) + ms);
  if (TD.running) TD.endsAt = Date.now() + TD.remain;
  tdSave(); paintClock();
}
function tdLoop() {
  if (TDINT) clearInterval(TDINT);
  TDINT = setInterval(() => {
    if (!TD || !TD.running) return;
    const left = TD.endsAt - Date.now();
    if (left <= 0) {
      beep(3, 1046);
      if (TD.lvl < TD.levels.length - 1) tdGoto(TD.lvl + 1, true);
      else { TD.running = false; TD.remain = 0; tdSave(); renderTour(); }
      return;
    }
    if (left <= 60000 && left > 59000) beep(1, 660);   // one minute warning
    TD.remain = left;
    paintClock();
  }, 250);
}
/* Repainting only the digits, so the clock does not rebuild the page 4x a second. */
function paintClock() {
  const el = $("td-time");
  if (!el || !TD || !curLv()) return;
  const left = TD.running ? Math.max(0, TD.endsAt - Date.now()) : TD.remain;
  el.textContent = TOUR.mmss(left);
  el.classList.toggle("hot", left <= 60000);
  const pb = $("td-prog");
  if (pb) {
    const total = (curLv().min || 1) * 60000;
    pb.style.width = Math.max(0, Math.min(100, (1 - left / total) * 100)) + "%";
  }
  const b = $("td-run");
  if (b) b.textContent = TD.running ? t("tour.pause") : t("tour.start");
}

/* ---- screens --------------------------------------------------------- */
function renderTour() {
  const v = $("v-tour");
  if (!v) return;
  if (!TD) TD = DB.get("td", null);
  if (TD && TD.started === undefined) TD.started = TD.levels.length > 0;   // older saves
  if (!TD || !TD.levels.length || !TD.started) return renderTDSetup(v);
  renderTDClock(v);
}

function renderTDSetup(v) {
  if (!TD) TD = TOUR.blank();
  const D = TD;
  if (!D._tpl || !TOUR.TSTRUCT.some((s) => s.id === D._tpl)) D._tpl = "f9_daily";
  if (!D._count) D._count = 20;
  if (D._brkEvery === undefined) D._brkEvery = 4;
  if (!D._brkMin) D._brkMin = 10;
  const st = TOUR.structById(D._tpl);
  const man = (n) => Math.round((n || 0) / 10000 * 100) / 100;
  const groups = { pub: "tour.grpPub", series: "tour.grpSeries" };

  let h = '<div class="card"><h2>' + esc(t("tour.h1")) + "</h2><p>" + t("tour.lead") + "</p>" +
    '<div class="step"><span class="num">1</span>' + esc(t("tour.step1")) +
      ' <span class="sub">' + esc(t("tour.step1sub")) + "</span></div>" +
    Object.keys(groups).map((g) =>
      '<div style="margin:0 0 9px"><div class="small dim" style="margin-bottom:5px">' +
        esc(t(groups[g])) + "</div>" +
      '<div class="bg" style="display:flex;flex-wrap:wrap">' +
        TOUR.TSTRUCT.filter((s) => s.grp === g).map((s) =>
          '<button class="tplb ' + (D._tpl === s.id ? "on" : "") + '" data-id="' + s.id + '">' +
          esc(tdStructName(s.id)) + "</button>").join("") +
      "</div></div>").join("") +
    (tdCustom().length
      ? '<div style="margin:0 0 9px"><div class="small dim" style="margin-bottom:5px">' +
        esc(t("tour.myStructs")) + "</div>" +
        '<div class="bg" style="display:flex;flex-wrap:wrap">' +
          tdCustom().map((c) => '<button class="cstb" data-cid="' + c.id + '">' + esc(c.n) + "</button>" +
            '<button class="cstx" data-cid="' + c.id + '" aria-label="' + esc(t("common.reset")) + '">×</button>').join("") +
        "</div></div>"
      : "") +
    '<div class="tv">' + t("tour.struct." + st.id + ".note") + "</div>" +
    '<div class="row" style="margin-top:12px"><div style="flex:0 0 auto">' +
      '<button class="btn" id="td-quick" style="font-size:15px;padding:12px 22px">▶ ' +
        esc(t("tour.openNow")) + "</button></div>" +
      '<div class="small dim" style="align-self:center">' + esc(t("tour.openNowSub")) + "</div></div>" +

    '<div class="step"><span class="num">2</span>' + esc(t("tour.step2")) +
      ' <span class="sub">' + esc(t("tour.step2sub")) + "</span></div>" +
    '<div class="grid g3">' +
      '<div><label>' + esc(t("tour.fName")) + '</label><input id="td-name" value="' + esc(D.name) + '"></div>' +
      '<div><label>' + esc(t("tour.fBuyin")) + '</label><input id="td-buyin" type="number" step="0.5" value="' + man(D.buyin) + '"></div>' +
      '<div><label>' + esc(t("tour.fStack")) + '</label><input id="td-stack" type="number" step="10" value="' + man(D.startStack) + '"></div>' +
      '<div><label>' + esc(t("tour.fRbPrice")) + '</label><input id="td-rbprice" type="number" step="0.5" value="' + man(D.rebuyPrice) + '"></div>' +
      '<div><label>' + esc(t("tour.fRbStack")) + '</label><input id="td-rbstack" type="number" step="10" value="' + man(D.rebuyStack) + '"></div>' +
      '<div><label>' + esc(t("tour.fEntries")) + '</label><input id="td-entries" type="number" min="0" value="' + D.entries + '"></div>' +
    "</div>" +
    '<div class="row" style="margin-top:10px">' +
      '<div><label>' + esc(t("tour.fCount")) + '</label><input id="td-count" type="number" min="4" max="60" value="' + D._count + '"></div>' +
      '<div><label>' + esc(t("tour.fBrkEvery")) + '</label><input id="td-brke" type="number" min="0" max="12" value="' + D._brkEvery + '"></div>' +
      '<div><label>' + esc(t("tour.fBrkMin")) + '</label><input id="td-brkm" type="number" min="1" max="60" value="' + D._brkMin + '"></div>' +
    "</div>" +
    '<div class="notice">' + t("tour.regenNote") + "</div>" +
    tdBadBanner() +
    '<div class="row" style="margin-top:10px">' +
      '<div style="flex:0 0 auto"><button class="btn sec" id="td-lvtoggle">' +
        (D._lvOpen ? "▲ " + esc(t("tour.hideLevels"))
                   : "▼ " + esc(t("tour.showLevels", { n: D.levels.length }))) + "</button></div>" +
      (D.levels.length ? '<div style="flex:0 0 auto">' +
        '<button class="btn sec sm" id="td-savecst">' + esc(t("tour.saveStruct")) + "</button></div>" : "") +
    "</div>" +
    (D._lvOpen ? (D.levels.length ? tdLevelTable(true)
      : '<div class="empty">' + esc(t("tour.noLevels")) + "</div>") : "") +
    "</div>";
  v.innerHTML = h;

  const num = (id) => +$(id).value || 0;
  const grab = () => {
    D.name = $("td-name").value;
    D.buyin = num("td-buyin") * 10000; D.startStack = num("td-stack") * 10000;
    D.rebuyPrice = num("td-rbprice") * 10000; D.rebuyStack = num("td-rbstack") * 10000;
    D.entries = num("td-entries");
    D._count = Math.max(4, num("td-count"));
    D._brkEvery = num("td-brke");
    D._brkMin = Math.max(1, num("td-brkm"));
  };
  const applyTpl = (tpl) => {
    D._tpl = tpl.id;
    D.name = tdStructName(tpl.id);
    D.buyin = tpl.buyin || D.buyin;
    D.startStack = tpl.stack;
    D.rebuyPrice = tpl.rebuyPrice !== undefined ? tpl.rebuyPrice : (tpl.buyin || 0);
    D.rebuyStack = tpl.rebuyStack !== undefined ? tpl.rebuyStack : tpl.stack;
    D.levels = TOUR.buildLevels(tpl, D._count, D._brkEvery, D._brkMin);
    D.lvl = 0; D.remain = (D.levels[0].min || 1) * 60000; D.running = false; D.endsAt = null;
  };
  v.querySelectorAll(".tplb").forEach((b) => (b.onclick = () => {
    grab(); applyTpl(TOUR.structById(b.dataset.id)); tdSave(); renderTDSetup(v);
  }));
  v.querySelectorAll(".cstb").forEach((b) => (b.onclick = () => {
    const c = tdCustom().filter((x) => x.id === b.dataset.cid)[0];
    if (!c) return;
    grab();
    D.name = c.n; D.levels = JSON.parse(JSON.stringify(c.levels));
    if (c.buyin) D.buyin = c.buyin;
    if (c.stack) D.startStack = c.stack;
    if (c.rebuyPrice !== undefined) D.rebuyPrice = c.rebuyPrice;
    if (c.rebuyStack !== undefined) D.rebuyStack = c.rebuyStack;
    if (c.payN) { D.payN = c.payN; D.pay = (c.pay || []).slice(); D.payCurve = c.payCurve || 1; D.payManual = true; }
    if (c.poolPct !== undefined) D.poolPct = c.poolPct;
    D.lvl = 0; D.remain = (D.levels[0].min || 1) * 60000; D.running = false; D.endsAt = null;
    tdSave(); renderTDSetup(v); toast(t("tour.loaded", { n: c.n }));
  }));
  v.querySelectorAll(".cstx").forEach((b) => (b.onclick = () => {
    if (!confirm(t("tour.confirmDelStruct"))) return;
    DB.set("tdcustom", tdCustom().filter((x) => x.id !== b.dataset.cid));
    renderTDSetup(v);
  }));
  const regen = () => {
    grab();
    D.levels = TOUR.buildLevels(TOUR.structById(D._tpl), D._count, D._brkEvery, D._brkMin);
    D.lvl = 0; D.remain = (D.levels[0].min || 1) * 60000; D.running = false; D.endsAt = null;
    tdSave(); renderTDSetup(v);
  };
  ["td-count", "td-brke", "td-brkm"].forEach((id) => { const el = $(id); if (el) el.onchange = regen; });
  $("td-lvtoggle").onclick = () => { grab(); D._lvOpen = !D._lvOpen; tdSave(); renderTDSetup(v); };
  bindLevelTable(v);
  const sc = $("td-savecst");
  if (sc) sc.onclick = () => {
    grab();
    const nm = prompt(t("tour.nameStruct"), D.name || tdStructName(D._tpl));
    if (!nm) return;
    tdSaveCustom(nm.trim()); renderTDSetup(v); toast(t("tour.saved", { n: nm.trim() }));
  };
  $("td-quick").onclick = () => {
    grab();
    if (!D.levels.length) applyTpl(TOUR.structById(D._tpl));
    if (!D.name) D.name = tdStructName(D._tpl);
    D.players = D.entries; D.rebuys = 0; D.payManual = false; D.started = true;
    TOUR.autoPay(D);
    D.lvl = 0; D.remain = (D.levels[0].min || 1) * 60000; D.running = false; D.endsAt = null;
    tdSave(); renderTour();
  };
}

/* A folded table still has to admit it contains something wrong. */
function tdBadBanner() {
  const bad = TD.levels.filter(TOUR.lvBad).length;
  return bad ? '<div class="blk warn" style="margin:10px 0 0"><div class="t">' +
    esc(t("tour.checkNeeded")) + '</div><div>' + esc(t("tour.badLevels", { n: bad })) + "</div></div>" : "";
}
function tdLevelTable(editable) {
  let h = '<div class="scrollx" style="margin-top:10px"><table id="td-lv"><tr><th>#</th>' +
    "<th>SB</th><th>BB</th><th>" + esc(t("tour.ante")) + "</th><th>" + esc(t("tour.min")) +
    "</th><th>" + esc(t("tour.reg")) + "</th><th></th></tr>";
  TD.levels.forEach((l, i) => {
    h += '<tr class="' + (l.brk ? "lvbrk" : (TOUR.lvBad(l) ? "lvbad" : "")) + '">' +
      "<td>" + (l.brk ? '<b style="color:var(--warn)">' + esc(t("tour.break")) + "</b>"
                      : TOUR.lvNumber(TD.levels, i)) + "</td>" +
      (l.brk
        ? '<td colspan="3" class="dim">' + esc(t("tour.rest")) + "</td>"
        : '<td><input class="lvin" data-i="' + i + '" data-f="sb" type="number" value="' + l.sb + '"></td>' +
          '<td><input class="lvin" data-i="' + i + '" data-f="bb" type="number" value="' + l.bb + '"></td>' +
          '<td><input class="lvin" data-i="' + i + '" data-f="ante" type="number" value="' + l.ante + '"></td>') +
      '<td><input class="lvin lvmin" data-i="' + i + '" data-f="min" type="number" value="' + l.min + '"></td>' +
      '<td data-l="' + esc(t("tour.reg")) + '"><button class="btn ' + (l.reg ? "" : "sec") + ' sm lvreg" data-i="' + i + '">' +
        (l.reg ? esc(t("tour.regClosed")) : "—") + "</button></td>" +
      "<td>" + (editable ? '<button class="btn sec sm lvdel" data-i="' + i + '">' + esc(t("tour.del")) + "</button>" : "") +
      "</td></tr>";
  });
  h += "</table></div>";
  if (editable) h += '<div class="row" style="margin-top:8px">' +
    '<div style="flex:0 0 auto"><button class="btn sec sm" id="lv-add">' + esc(t("tour.addLevel")) + "</button></div>" +
    '<div style="flex:0 0 auto"><button class="btn sec sm" id="lv-brk">' + esc(t("tour.addBreak")) + "</button></div></div>";
  return h;
}
function bindLevelTable(v) {
  v.querySelectorAll(".lvin").forEach((inp) => (inp.onchange = () => {
    const i = +inp.dataset.i;
    TD.levels[i][inp.dataset.f] = +inp.value || 0;
    if (i === TD.lvl && inp.dataset.f === "min" && !TD.running) TD.remain = (TD.levels[i].min || 1) * 60000;
    tdSave(); renderTour();
  }));
  v.querySelectorAll(".lvreg").forEach((b) => (b.onclick = () => {
    const i = +b.dataset.i, was = !!TD.levels[i].reg;
    TD.levels.forEach((l) => { delete l.reg; });      // registration closes in one place only
    if (!was) TD.levels[i].reg = true;
    tdSave(); renderTour();
  }));
  v.querySelectorAll(".lvdel").forEach((b) => (b.onclick = () => {
    if (TD.levels.length <= 1) { toast(t("tour.needOneLevel")); return; }
    TD.levels.splice(+b.dataset.i, 1);
    if (TD.lvl >= TD.levels.length) TD.lvl = TD.levels.length - 1;
    tdSave(); renderTour();
  }));
  const add = $("lv-add");
  if (add) add.onclick = () => {
    const last = TD.levels.filter((l) => !l.brk).slice(-1)[0] || { sb: 100, bb: 200, ante: 200, min: 20 };
    TD.levels.push({ sb: TOUR.niceChip(last.sb * 1.4), bb: TOUR.niceChip(last.bb * 1.4),
      ante: TOUR.niceChip(last.bb * 1.4), min: last.min, brk: false });
    tdSave(); renderTour();
  };
  const brk = $("lv-brk");
  if (brk) brk.onclick = () => { TD.levels.push({ brk: true, min: 10, sb: 0, bb: 0, ante: 0 }); tdSave(); renderTour(); };
}

function renderTDClock(v) {
  const l = curLv();
  const nx = TOUR.nextPlayLv(TD.levels, TD.lvl), nb = TOUR.nextBreakIn(TD.levels, TD.lvl);
  const pool = TOUR.pool(TD);
  const left = TD.running ? Math.max(0, TD.endsAt - Date.now()) : TD.remain;
  const r = TOUR.regInfo(TD.levels, TD.lvl);

  /* ===== the board — only what the room should see ===== */
  let h = '<div id="td-screen" class="tdwrap">' +
    '<div class="tdtop">' +
      '<div class="tdname">' + esc(TD.name || t("tour.untitled")) + "</div>" +
      '<div class="tdlv">' + (l.brk ? '<span class="brk">' + esc(t("tour.breakCaps")) + "</span>"
                                    : esc(t("tour.levelCaps")) + " " + TOUR.lvNumber(TD.levels, TD.lvl)) + "</div>" +
    "</div>" +
    '<div class="tdclock"><div id="td-time" class="' + (left <= 60000 ? "hot" : "") + '">' +
      TOUR.mmss(left) + '</div><div class="tdbar"><i id="td-prog" style="width:0%"></i></div></div>' +
    (l.brk
      ? '<div class="tdblinds"><div class="lb">' + esc(t("tour.rest")) + "</div>" +
        '<div class="bl">' + esc(t("tour.breakCaps")) + " " + l.min + esc(t("tour.minShort")) + "</div></div>"
      : '<div class="tdblinds"><div class="lb">' + esc(t("tour.blindsCaps")) + "</div>" +
        '<div class="bl">' + numk(l.sb) + " / " + numk(l.bb) +
        (l.ante ? ' <span class="an">' + esc(t("tour.ante")) + " " + numk(l.ante) + "</span>" : "") +
        "</div></div>") +
    '<div class="tdnext">' +
      (nx ? esc(t("tour.nextCaps")) + " &nbsp;" + numk(nx.sb) + " / " + numk(nx.bb) +
            (nx.ante ? " (" + esc(t("tour.ante")) + " " + numk(nx.ante) + ")" : "")
          : esc(t("tour.lastLevel"))) +
      (nb ? " &nbsp;·&nbsp; " + esc(t("tour.toBreak", { n: nb.n })) : "") + "</div>" +
    (r ? '<div class="tdreg ' + r.state + '">' + esc(
      r.state === "done" ? t("tour.regDone")
      : r.state === "now" ? t("tour.regNow")
      : r.left <= 1 ? t("tour.regAfterThis") : t("tour.regIn", { n: r.left })) + "</div>" : "") +
    (TD.showCount
      ? '<div class="tdcount">' + t("tour.boardCount", { e: TD.entries, p: TD.players }) +
        (TD.players > 0 ? " &nbsp;·&nbsp; " + esc(t("tour.avg")) + " <b>" + chipsOf(TOUR.avgStack(TD)) + "</b>" +
          (l.bb > 0 ? " <b>(" + TOUR.avgBB(TD, l) + "BB)</b>" : "") : "") + "</div>"
      : "") +
    '<div class="tdprize"><span class="lb">' + esc(t("tour.totalPrize")) + '</span><span class="pv">' +
      esc(money(pool)) + "</span></div>" +
    '<div class="tdpay">' + TD.pay.map((p, i) =>
      "<span><b>" + esc(t("tour.place", { n: i + 1 })) + "</b> " + esc(money(pool * p / 100)) + "</span>").join("") +
    "</div></div>";

  /* ===== below the fold is the director's own console ===== */
  h += '<div class="card"><h3>' + esc(t("tour.controls")) + "</h3>" +
    '<div class="row">' +
      '<div style="flex:0 0 auto"><button class="btn" id="td-run">' + esc(TD.running ? t("tour.pause") : t("tour.start")) + "</button></div>" +
      '<div style="flex:0 0 auto"><button class="btn sec" id="td-prev">◀ ' + esc(t("tour.prevLevel")) + "</button></div>" +
      '<div style="flex:0 0 auto"><button class="btn sec" id="td-next">' + esc(t("tour.nextLevel")) + " ▶</button></div>" +
      '<div style="flex:0 0 auto"><button class="btn sec" id="td-m1">−1' + esc(t("tour.minShort")) + "</button></div>" +
      '<div style="flex:0 0 auto"><button class="btn sec" id="td-p1">+1' + esc(t("tour.minShort")) + "</button></div>" +
      '<div style="flex:0 0 auto"><button class="btn sec" id="td-full">' + esc(t("tour.fullscreen")) + "</button></div>" +
      '<div style="flex:0 0 auto"><button class="btn sec" id="td-showcnt">' +
        esc(TD.showCount ? t("tour.hideCount") : t("tour.showCount")) + "</button></div>" +
    "</div></div>";

  h += '<div class="card"><h3>' + esc(t("tour.peopleTitle")) +
      ' <span class="small dim">— ' + esc(t("tour.peopleSub")) + "</span></h3>" +
    '<div class="hudline">' +
      '<div><span class="k">' + esc(t("tour.entries")) + "</span>" +
        '<input class="cntin" data-f="entries" type="number" min="0" value="' + TD.entries + '"><span class="u">' + esc(t("tour.people")) + "</span>" +
        '<button class="btn sm" data-act="e+">+1</button><button class="btn sec sm" data-act="e-">−1</button></div>' +
      '<div><span class="k">' + esc(t("tour.remaining")) + "</span>" +
        '<input class="cntin" data-f="players" type="number" min="0" value="' + TD.players + '"><span class="u">' + esc(t("tour.people")) + "</span>" +
        '<button class="btn sec sm" data-act="p+">+1</button><button class="btn sec sm" data-act="p-">' + esc(t("tour.bustOne")) + "</button></div>" +
      '<div><span class="k">' + esc(t("tour.rebuys")) + "</span>" +
        '<input class="cntin" data-f="rebuys" type="number" min="0" value="' + TD.rebuys + '"><span class="u">' + esc(t("tour.times")) + "</span>" +
        '<button class="btn sm" data-act="r+">+1</button><button class="btn sec sm" data-act="r-">−1</button></div>' +
    "</div>" +
    '<div class="hudline" style="margin-top:9px">' +
      '<div><span class="k">' + esc(t("tour.avgStack")) + "</span><b>" + esc(chipsOf(TOUR.avgStack(TD))) +
        (l.bb > 0 ? " (" + TOUR.avgBB(TD, l) + "BB)" : "") + "</b></div>" +
      '<div><span class="k">' + esc(t("tour.totalChips")) + "</span><b>" + esc(chipsOf(TOUR.chips(TD))) + "</b></div>" +
      '<div><span class="k">' + esc(t("tour.collected")) + "</span><b>" + esc(money(TOUR.gross(TD))) + "</b></div>" +
      '<div><span class="k">' + esc(t("tour.prizePct", { p: TD.poolPct === undefined ? 100 : TD.poolPct })) +
        '</span><b style="color:var(--ac)">' + esc(money(pool)) + "</b></div>" +
      '<div><span class="k">' + esc(t("tour.houseCut")) + "</span><b>" + esc(money(TOUR.house(TD))) + "</b></div>" +
    "</div>" +
    '<div class="notice">' + t("tour.countNote", {
      buyin: esc(money(TD.buyin)), stack: esc(chipsOf(TD.startStack)),
      rbPrice: esc(money(TD.rebuyPrice)), rbStack: esc(chipsOf(TD.rebuyStack)) }) + "</div>" +
    '<div class="small dim">' + t("tour.keys") + "</div></div>";

  /* ===== prize distribution ===== */
  const sum = Math.round(TD.pay.reduce((a, b) => a + b, 0) * 10) / 10;
  const pctOf = TD.entries ? Math.round(TD.payN / TD.entries * 100) : 0;
  h += '<div class="card"><h3>' + esc(t("tour.payTitle")) +
      ' <span class="small dim">— ' + esc(t("tour.paySub")) + "</span></h3>" +
    '<div class="step" style="margin-top:2px"><span class="num">1</span>' + esc(t("tour.payStep1")) + "</div>" +
    '<div class="poolcalc">' +
      "<span>" + esc(t("tour.collected")) + " <b>" + esc(money(TOUR.gross(TD))) + "</b></span>" +
      '<span class="op">×</span>' +
      '<span><input id="td-poolpct" type="number" min="0" max="100" step="1" value="' +
        (TD.poolPct === undefined ? 100 : TD.poolPct) + '"> %</span>' +
      '<span class="op">=</span>' +
      '<span class="res">' + esc(t("tour.prize")) + " <b>" + esc(money(pool)) + "</b></span>" +
      '<span class="hs">' + esc(t("tour.houseCut")) + " " + esc(money(TOUR.house(TD))) + "</span>" +
    "</div>" +
    '<div class="bg" id="td-poolq" style="display:flex;margin-top:8px">' +
      [100, 90, 85, 80, 70].map((x) => '<button data-p="' + x + '" class="' +
        ((TD.poolPct === undefined ? 100 : TD.poolPct) === x ? "on" : "") + '">' + x + "%</button>").join("") +
    "</div>" +
    '<div class="small dim" style="margin-top:5px">' + t("tour.poolNote") + "</div>" +

    '<div class="step"><span class="num">2</span>' + esc(t("tour.payStep2")) + "</div>" +
    '<div class="row">' +
      '<div style="flex:0 0 130px"><label>' + esc(t("tour.paidPlaces")) + "</label>" +
        '<input id="td-payn" type="number" min="1" value="' + TD.payN + '"></div>' +
      '<div style="flex:1 1 auto"><label>' + esc(t("tour.quickByField")) + '</label><div class="bg" id="td-payq" style="display:flex">' +
        [10, 15, 20, 25].map((x) => '<button data-p="' + x + '">' + esc(t("tour.topPct", { p: x })) + "</button>").join("") +
      "</div></div>" +
    "</div>" +
    '<div class="small dim" style="margin-top:5px">' +
      esc(t("tour.payingNow", { e: TD.entries, n: TD.payN })) +
      (TD.entries ? " (" + esc(t("tour.topPct", { p: pctOf })) + ")" : "") + "</div>" +

    '<div class="step"><span class="num">3</span>' + esc(t("tour.payStep3")) + "</div>" +
    '<div class="bg" id="td-curve" style="display:flex;flex-wrap:wrap">' +
      [[0.7, "tour.curveFlat"], [1.0, "tour.curveNormal"], [1.4, "tour.curveSteep"]].map((c) =>
        '<button data-c="' + c[0] + '" class="' + (Math.abs((TD.payCurve || 1) - c[0]) < 0.01 ? "on" : "") + '">' +
        esc(t(c[1])) + "</button>").join("") +
      '<button id="td-payflat">' + esc(t("tour.curveEven")) + "</button>" +
      '<span style="display:inline-flex;align-items:center;gap:6px;margin-left:6px">' +
        '<span class="small dim">' + esc(t("tour.curveManual")) + "</span>" +
        '<input id="td-curvein" type="number" step="0.1" min="0.2" max="3" value="' +
          (TD.payCurve === undefined ? 1 : TD.payCurve) + '" style="width:74px">' +
      "</span></div>" +
    '<div class="small dim" style="margin-top:5px">' + esc(t("tour.curveNote")) + "</div>" +

    '<div class="step"><span class="num">4</span>' + esc(t("tour.payStep4")) + "</div>" +
    '<div class="scrollx"><table class="tstack paytbl"><tr><th>' + esc(t("tour.rank")) + "</th><th>" +
      esc(t("tour.share")) + "</th><th>" + esc(t("tour.amount")) + "</th></tr>" +
    TD.pay.map((p, i) => "<tr><td>" + esc(t("tour.place", { n: i + 1 })) + "</td>" +
      '<td data-l="' + esc(t("tour.share")) + '"><input class="payin" data-i="' + i + '" type="number" step="0.1" min="0" value="' + p + '"> %</td>' +
      '<td data-l="' + esc(t("tour.amount")) + '">' + esc(money(pool * p / 100)) + "</td></tr>").join("") +
    "</table></div>" +
    '<div class="row" style="margin-top:9px">' +
      '<div style="flex:0 0 auto" class="' + (Math.abs(sum - 100) > 0.5 ? "" : "dim") + '">' +
        esc(t("tour.sum")) + ' <b style="color:' + (Math.abs(sum - 100) > 0.5 ? "var(--warn)" : "var(--good)") + '">' + sum + "%</b></div>" +
      (Math.abs(sum - 100) > 0.5 ? '<div style="flex:0 0 auto"><button class="btn sec sm" id="td-pay100">' +
        esc(t("tour.fixTo100")) + "</button></div>" : "") +
    "</div>" +
    (Math.abs(sum - 100) > 0.5 ? '<div class="notice">' + esc(t("tour.sumWarn")) + "</div>" : "") +
    "</div>";

  h += '<div class="card"><h3>' + esc(t("tour.levelTable")) + "</h3>" +
    '<div class="small muted">' + t("tour.levelTableNote") + "</div>" +
    tdBadBanner() +
    '<div class="row" style="margin-top:9px">' +
      '<div style="flex:0 0 auto"><button class="btn sec" id="td-lvtoggle2">' +
        (TD._lvOpen ? "▲ " + esc(t("tour.hideLevels"))
                    : "▼ " + esc(t("tour.showLevels", { n: TD.levels.length }))) + "</button></div>" +
      '<div style="flex:0 0 auto"><button class="btn sec sm" id="td-savecst2">' + esc(t("tour.saveStruct")) + "</button></div>" +
      '<div style="flex:0 0 auto"><button class="btn sec sm" id="td-reset">' + esc(t("tour.endEvent")) + "</button></div>" +
    "</div>" +
    (TD._lvOpen ? tdLevelTable(true) : "") + "</div>";

  v.innerHTML = h;

  $("td-lvtoggle2").onclick = () => { TD._lvOpen = !TD._lvOpen; tdSave(); renderTour(); };
  $("td-run").onclick = () => { TD.running ? tdPause() : tdStart(); paintClock(); };
  $("td-prev").onclick = () => tdGoto(TD.lvl - 1);
  $("td-next").onclick = () => tdGoto(TD.lvl + 1);
  $("td-m1").onclick = () => tdAdjust(-60000);
  $("td-p1").onclick = () => tdAdjust(60000);
  $("td-showcnt").onclick = () => { TD.showCount = !TD.showCount; tdSave(); renderTour(); };
  $("td-full").onclick = () => {
    const el = $("td-screen");
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen();
  };
  v.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => tdCount(b.dataset.act)));
  v.querySelectorAll(".cntin").forEach((inp) => (inp.onchange = () => {
    TD[inp.dataset.f] = Math.max(0, Math.round(+inp.value || 0));
    TOUR.autoPay(TD); tdSave(); renderTour();
  }));

  $("td-poolpct").onchange = (e) => {
    TD.poolPct = Math.max(0, Math.min(100, +e.target.value || 0)); tdSave(); renderTour();
  };
  v.querySelectorAll("#td-poolq button").forEach((b) => (b.onclick = () => {
    TD.poolPct = +b.dataset.p; tdSave(); renderTour();
  }));
  $("td-payn").onchange = (e) => {
    TD.payManual = true; TD.payN = Math.max(1, +e.target.value || 1);
    TD.pay = TOUR.payoutPct(TD.payN, TD.payCurve); tdSave(); renderTour();
  };
  v.querySelectorAll("#td-payq button").forEach((b) => (b.onclick = () => {
    TD.payManual = true;
    TD.payN = Math.max(1, Math.round((TD.entries || 1) * (+b.dataset.p) / 100));
    TD.pay = TOUR.payoutPct(TD.payN, TD.payCurve); tdSave(); renderTour();
  }));
  v.querySelectorAll("#td-curve button[data-c]").forEach((b) => (b.onclick = () => {
    TD.payCurve = +b.dataset.c; TD.pay = TOUR.payoutPct(TD.payN, TD.payCurve); tdSave(); renderTour();
  }));
  $("td-curvein").onchange = (e) => {
    TD.payCurve = Math.max(0.2, Math.min(3, +e.target.value || 1));
    TD.pay = TOUR.payoutPct(TD.payN, TD.payCurve); tdSave(); renderTour();
  };
  $("td-payflat").onclick = () => {
    TD.pay = TOUR.normTo100(new Array(TD.payN).fill(1)); tdSave(); renderTour();
  };
  v.querySelectorAll(".payin").forEach((inp) => (inp.onchange = () => {
    TD.payManual = true; TD.pay[+inp.dataset.i] = Math.max(0, +inp.value || 0); tdSave(); renderTour();
  }));
  const p100 = $("td-pay100");
  if (p100) p100.onclick = () => { TD.pay = TOUR.normTo100(TD.pay); tdSave(); renderTour(); };

  $("td-savecst2").onclick = () => {
    const nm = prompt(t("tour.nameStruct"), TD.name || tdStructName(TD._tpl || "f9_daily"));
    if (!nm) return;
    tdSaveCustom(nm.trim()); toast(t("tour.saved", { n: nm.trim() }));
  };
  $("td-reset").onclick = () => {
    if (!confirm(t("tour.confirmEnd"))) return;
    if (TDINT) clearInterval(TDINT);
    TD.levels = []; TD.running = false; TD.endsAt = null; TD.started = false;
    tdSave(); renderTour();
  };
  bindLevelTable(v);
  const rows = v.querySelectorAll("#td-lv tr");
  if (rows[TD.lvl + 1]) rows[TD.lvl + 1].classList.add("lvcur");
  if (TD.running) tdLoop();
  paintClock();
}

/* A director runs this one-handed while dealing with the room, so the
 * common actions are single keys. */
function tdCount(act) {
  if (act === "e+") { TD.entries++; TD.players++; }
  else if (act === "e-") { if (TD.entries > 0) { TD.entries--; TD.players = Math.max(0, TD.players - 1); } }
  else if (act === "p+") TD.players++;
  else if (act === "p-") TD.players = Math.max(0, TD.players - 1);
  else if (act === "r+") { TD.rebuys++; TD.players++; }
  else if (act === "r-") { if (TD.rebuys > 0) { TD.rebuys--; TD.players = Math.max(0, TD.players - 1); } }
  TOUR.autoPay(TD); tdSave(); renderTour();
}
document.addEventListener("keydown", (e) => {
  if (STATE.view !== "tour" || !TD || !TD.levels.length || !TD.started) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || "")) return;
  const k = (e.key || "").toLowerCase();
  if (e.code === "Space") { e.preventDefault(); TD.running ? tdPause() : tdStart(); paintClock(); }
  else if (e.code === "ArrowRight") tdGoto(TD.lvl + 1);
  else if (e.code === "ArrowLeft") tdGoto(TD.lvl - 1);
  else if (k === "f") { const el = $("td-screen");
    if (el) { document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen(); } }
  else if (k === "b") tdCount("p-");
  else if (k === "e") tdCount("e+");
  else if (k === "r") tdCount("r+");
});

document.addEventListener("DOMContentLoaded", boot);
