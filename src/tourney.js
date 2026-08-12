/* =============================================================================
 * tourney.js — running a live tournament: blind structure, clock, prize pool.
 *
 * Everything here is pure and DOM-free so it can be tested directly. The
 * screen that shows a clock to a room full of players is in app.js; the
 * numbers behind it are here.
 *
 * Money is in KRW and chips are chips. Both are stored as plain integers and
 * only abbreviated at the point of display, so no rounding ever creeps into
 * the arithmetic.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TOUR = factory();
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function () {
"use strict";

/* A blind ladder people actually recognise: roughly 1.3x a level, but snapped
 * to the round numbers a dealer can make change for. */
const LADMULT = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12.5, 15, 20, 25, 30, 40, 50, 60, 80, 100,
  125, 150, 200, 250, 300, 400, 500, 600, 800, 1000];
/* Triton publishes its structure, so this is the real ladder, not a model.
 * Its ante equals the big blind, which is why those pots play so large. */
const TRITON_LAD = [[500, 1000], [500, 1000], [1000, 1500], [1000, 2000], [1000, 2500], [1500, 3000],
  [2000, 4000], [2500, 5000], [3000, 6000], [4000, 8000], [5000, 10000], [6000, 12000],
  [8000, 16000], [10000, 20000], [10000, 25000], [15000, 30000], [20000, 40000], [25000, 50000],
  [30000, 60000], [40000, 80000]];

/** Round a blind to a value the table can actually make with its chips. */
function niceChip(x) {
  if (x < 100) return Math.max(25, Math.round(x / 25) * 25);
  if (x < 1000) return Math.round(x / 50) * 50;
  if (x < 10000) return Math.round(x / 100) * 100;
  if (x < 100000) return Math.round(x / 1000) * 1000;
  return Math.round(x / 5000) * 5000;
}
/** Blinds at a level. Past the end of an explicit ladder it keeps climbing. */
function blindsAt(st, lvl) {
  if (st.ladder) {
    const i = Math.min(lvl - 1, st.ladder.length - 1);
    const g = Math.pow(1.3, Math.max(0, lvl - st.ladder.length));
    return { sb: niceChip(st.ladder[i][0] * g), bb: niceChip(st.ladder[i][1] * g) };
  }
  const m = LADMULT[Math.min(lvl - 1, LADMULT.length - 1)] *
    Math.pow(1.3, Math.max(0, lvl - LADMULT.length));
  const bb = niceChip(st.bb * m);
  return { sb: niceChip(bb / 2), bb: bb };
}
/** The whole level list, with breaks inserted every `brkEvery` levels. */
function buildLevels(st, count, brkEvery, brkMin) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    const b = blindsAt(st, i);
    out.push({ sb: b.sb, bb: b.bb, ante: st.noAnte ? 0 : b.bb, min: st.min, brk: false });
    if (brkEvery > 0 && i % brkEvery === 0 && i < count) {
      out.push({ brk: true, min: brkMin, sb: 0, bb: 0, ante: 0 });
    }
  }
  return out;
}
/** A level whose numbers cannot be right — flagged rather than silently run. */
const lvBad = (l) => !l.brk && (l.bb <= 0 || l.sb > l.bb || l.min <= 0);

/* Rounding each share to one decimal leaves the total a little off 100.
 * The remainder goes to first place rather than quietly disappearing. */
function normTo100(arr) {
  const s = arr.reduce((a, b) => a + b, 0);
  if (s <= 0) return arr;
  const out = arr.map((x) => Math.round(x / s * 1000) / 10);
  const diff = Math.round((100 - out.reduce((a, b) => a + b, 0)) * 10) / 10;
  if (diff !== 0) out[0] = Math.round((out[0] + diff) * 10) / 10;
  return out;
}
/** Prize shares for `spots` places. Lower curve = flatter, higher = top-heavy. */
function payoutPct(spots, curve) {
  const e = curve || 1, w = [];
  for (let i = 1; i <= spots; i++) w.push(1 / Math.pow(i, e));
  return normTo100(w);
}

/* ---- reading a level list -------------------------------------------- */
/** Levels are numbered ignoring breaks, the way a room announces them. */
function lvNumber(levels, idx) {
  let n = 0;
  for (let i = 0; i <= idx && i < levels.length; i++) if (!levels[i].brk) n++;
  return n;
}
function nextPlayLv(levels, from) {
  for (let i = from + 1; i < levels.length; i++) if (!levels[i].brk) return levels[i];
  return null;
}
/** How many levels until the next break, and where it is. */
function nextBreakIn(levels, lvl) {
  let n = 0;
  for (let i = lvl; i < levels.length; i++) { if (levels[i].brk) return { n: n, lv: i }; n++; }
  return null;
}
/** Where registration closes relative to where the clock is now. */
function regInfo(levels, lvl) {
  if (!levels) return null;
  let idx = -1;
  for (let i = 0; i < levels.length; i++) if (levels[i].reg) { idx = i; break; }
  if (idx < 0) return null;
  if (lvl > idx) return { state: "done", idx: idx, left: 0 };
  if (lvl === idx) return { state: "now", idx: idx, left: 0 };
  let left = 0;
  for (let i = lvl; i < idx; i++) if (!levels[i].brk) left++;
  return { state: "soon", idx: idx, left: left };
}

/* ---- the money ------------------------------------------------------- */
const gross = (td) => (td ? td.entries * td.buyin + td.rebuys * td.rebuyPrice : 0);
/** What actually goes to the players. Floored to 1,000 so the payouts are
 *  payable in notes; the remainder stays with the house. */
function pool(td) {
  if (!td) return 0;
  const p = td.poolPct === undefined ? 100 : td.poolPct;
  return Math.floor(gross(td) * p / 100 / 1000) * 1000;
}
const house = (td) => gross(td) - pool(td);
const chips = (td) => (td ? td.entries * td.startStack + td.rebuys * td.rebuyStack : 0);
const avgStack = (td) => (td && td.players > 0 ? Math.round(chips(td) / td.players) : 0);
/** Average stack in big blinds — the number that says how deep the room is. */
function avgBB(td, level) {
  const a = avgStack(td);
  return level && level.bb > 0 ? Math.round(a / level.bb * 10) / 10 : 0;
}

const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
};

/* ---- structure presets ------------------------------------------------
 * `note` says plainly which numbers are confirmed and which are a sane
 * default, because a director copying a structure deserves to know which
 * parts to check against the venue's own sheet. The prose lives in i18n
 * under tour.struct.<id>; only the numbers are here.                      */
const TSTRUCT = [
  { id: "f9_daily", grp: "pub", stack: 2000000, bb: 10000, min: 6, hph: 12, seats: 9,
    noAnte: true, buyin: 10000, rebuyPrice: 10000, rebuyStack: 3000000 },
  { id: "f9_monster", grp: "pub", stack: 5000000, bb: 10000, min: 8, hph: 16, seats: 9,
    noAnte: true, buyin: 30000, rebuyPrice: 30000, rebuyStack: 7500000 },
  { id: "f9_main", grp: "pub", stack: 10000000, bb: 10000, min: 12, hph: 24, seats: 9,
    buyin: 50000, rebuyPrice: 50000, rebuyStack: 15000000 },
  { id: "pub_hyper", grp: "pub", stack: 2000000, bb: 10000, min: 5, hph: 10, seats: 9,
    noAnte: true, buyin: 30000, rebuyPrice: 30000, rebuyStack: 3000000 },
  { id: "pub_deep", grp: "pub", stack: 3000000, bb: 10000, min: 15, hph: 30, seats: 9,
    buyin: 50000, rebuyPrice: 0, rebuyStack: 0 },
  { id: "apt_a", grp: "series", stack: 100000, bb: 200, min: 60, hph: 30, seats: 9,
    buyin: 1000000, rebuyPrice: 0, rebuyStack: 0 },
  { id: "apt_d", grp: "series", stack: 100000, bb: 200, min: 30, hph: 15, seats: 9,
    buyin: 1000000, rebuyPrice: 0, rebuyStack: 0 },
  { id: "apt_ss", grp: "series", stack: 250000, bb: 400, min: 40, hph: 20, seats: 9,
    buyin: 2000000, rebuyPrice: 0, rebuyStack: 0 },
  { id: "wsop", grp: "series", stack: 60000, bb: 200, min: 120, hph: 60, seats: 9,
    buyin: 13000000, rebuyPrice: 0, rebuyStack: 0 },
  { id: "triton", grp: "series", stack: 200000, bb: 1000, min: 60, hph: 30, seats: 8,
    ladder: TRITON_LAD, buyin: 130000000, rebuyPrice: 0, rebuyStack: 0 },
  { id: "turbo", grp: "series", stack: 10000, bb: 100, min: 5, hph: 8, seats: 9,
    buyin: 30000, rebuyPrice: 30000, rebuyStack: 10000 }
];
const structById = (id) => TSTRUCT.filter((s) => s.id === id)[0] || TSTRUCT[0];

/** A fresh, unstarted tournament. */
function blank() {
  return { name: "", buyin: 10000, startStack: 2000000, rebuyPrice: 10000, rebuyStack: 3000000,
    entries: 0, rebuys: 0, players: 0, started: false,
    levels: [], lvl: 0, remain: 0, endsAt: null, running: false,
    payN: 0, pay: [], payManual: false, payCurve: 1, poolPct: 100, showCount: false,
    at: Date.now() };
}
/** Places paid, when the director has not overridden it: the usual ~15%. */
function autoPay(td) {
  if (td.payManual) return;
  td.payN = Math.max(1, Math.ceil((td.entries || 1) * 0.15));
  td.pay = payoutPct(td.payN, td.payCurve);
}

return {
  LADMULT, TRITON_LAD, TSTRUCT, structById,
  niceChip, blindsAt, buildLevels, lvBad,
  normTo100, payoutPct, autoPay,
  lvNumber, nextPlayLv, nextBreakIn, regInfo,
  gross, pool, house, chips, avgStack, avgBB,
  mmss, blank
};
});
