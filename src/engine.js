/* =============================================================================
 * engine.js — deterministic poker math. No DOM, no app state.
 *
 * Everything the UI shows as a number comes from here so it can be unit-tested
 * in node. The design rule: a villain range is never a "top N% by absolute hand
 * strength" slice. Real betting ranges are polarised (value + bluffs) and real
 * calling ranges are condensed. Truncating to the top N% builds a nut-only
 * villain that no hero hand can ever profitably continue against, which is what
 * made every drill option come out -EV in the previous version.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PE = factory();
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function () {
"use strict";

/* ---------------------------------------------------------------- 0. RNG --
 * Seeded so a drill spot replays identically and so every option inside one
 * spot is scored against the same runouts (common random numbers). Without
 * this, EV differences between two options can be pure Monte-Carlo noise.  */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFrom(x) { return (Math.imul(x ^ 0x9E3779B9, 0x85EBCA6B) >>> 0) || 1; }

/* ------------------------------------------------------------- 1. Cards --
 * A card is 0..51.  rank = c >> 2  (0='2' .. 12='A'),  suit = c & 3.        */
const RANKS = "23456789TJQKA";
const SUITS = "shdc";
const SUIT_GLYPH = { s: "♠", h: "♥", d: "♦", c: "♣" };
const rankOf = (c) => c >> 2;
const suitOf = (c) => c & 3;
const cardId = (r, s) => RANKS.indexOf(r) * 4 + SUITS.indexOf(s);
const cardStr = (c) => RANKS[rankOf(c)] + SUITS[suitOf(c)];

/* --------------------------------------------------------- 2. Evaluator --
 * 5..7 cards -> single comparable integer. Category in the high digits so
 * catOf() can recover "pair / two pair / ..." for display.                  */
function straightHigh(mask) {
  for (let h = 12; h >= 4; h--) {
    let ok = true;
    for (let i = 0; i < 5; i++) if (!((mask >> (h - i)) & 1)) { ok = false; break; }
    if (ok) return h;
  }
  // wheel: A-2-3-4-5
  if ((mask >> 12 & 1) && (mask & 1) && (mask >> 1 & 1) && (mask >> 2 & 1) && (mask >> 3 & 1)) return 3;
  return -1;
}
function mkScore(cat, kickers) {
  let v = cat;
  for (let i = 0; i < 5; i++) v = v * 13 + (kickers[i] === undefined ? 0 : kickers[i]);
  return v;
}
function evalHand(cards) {
  const rc = [0,0,0,0,0,0,0,0,0,0,0,0,0];
  const sc = [0,0,0,0];
  const bySuit = [[],[],[],[]];
  for (let i = 0; i < cards.length; i++) {
    const r = rankOf(cards[i]), s = suitOf(cards[i]);
    rc[r]++; sc[s]++; bySuit[s].push(r);
  }
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (sc[s] >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const rs = bySuit[flushSuit].slice().sort((a, b) => b - a);
    let fm = 0; for (let i = 0; i < rs.length; i++) fm |= 1 << rs[i];
    const sf = straightHigh(fm);
    if (sf >= 0) return mkScore(8, [sf]);
    return mkScore(5, rs.slice(0, 5));
  }
  let m = 0; for (let r = 0; r < 13; r++) if (rc[r]) m |= 1 << r;
  const sh = straightHigh(m);
  const quads = [], trips = [], pairs = [], kick = [];
  for (let r = 12; r >= 0; r--) {
    if (rc[r] === 4) quads.push(r);
    else if (rc[r] === 3) trips.push(r);
    else if (rc[r] === 2) pairs.push(r);
    else if (rc[r] === 1) kick.push(r);
  }
  if (quads.length) {
    const rest = [].concat(trips, pairs, kick).sort((a, b) => b - a);
    return mkScore(7, [quads[0], rest.length ? rest[0] : 0]);
  }
  if (trips.length >= 2) return mkScore(6, [trips[0], Math.max(trips[1], pairs.length ? pairs[0] : -1)]);
  if (trips.length === 1 && pairs.length) return mkScore(6, [trips[0], pairs[0]]);
  if (sh >= 0) return mkScore(4, [sh]);
  if (trips.length === 1) return mkScore(3, [trips[0]].concat(kick.slice(0, 2)));
  if (pairs.length >= 2) {
    const rest = [].concat(pairs.slice(2), kick).sort((a, b) => b - a);
    return mkScore(2, [pairs[0], pairs[1], rest.length ? rest[0] : 0]);
  }
  if (pairs.length === 1) return mkScore(1, [pairs[0]].concat(kick.slice(0, 3)));
  return mkScore(0, kick.slice(0, 5));
}
const CAT_COUNT = 9;
const catOf = (score) => Math.floor(score / Math.pow(13, 5));

/* ---------------------------------------------- 3. 169 classes & ranking --
 * Playability-adjusted ordering (A5s above its raw-equity slot, etc.). Used
 * for "top X%" style ranges where no explicit chart exists.                 */
const RANKED = ("AA KK QQ JJ AKs TT AQs AKo 99 AJs KQs 88 ATs AQo KJs 77 QJs KTs AJo A9s JTs ATo KQo 66 " +
"QTs A8s K9s A5s J9s A7s KJo 55 Q9s A4s T9s A6s A3s QJo K8s JTo A2s 44 KTo 98s T8s K7s Q8s J8s QTo A9o " +
"K6s 33 87s 97s K5s 22 J9o T9o A8o Q7s K4s 76s 86s K3s Q6s J7s A7o T7s K2s Q5s 65s A5o 96s K9o Q4s 75s " +
"J6s A6o Q3s 54s 85s T6s Q2s J5s A4o J8o T8o 64s J4s 95s A3o Q9o 74s J3s 53s 98o A2o T5s J2s K8o 84s " +
"T4s 43s 63s 87o T3s 94s K7o T2s 52s Q8o 73s J7o 93s K6o 42s 62s 76o 83s 92s K5o T7o 97o 32s 82s K4o " +
"J6o Q7o 72s 65o K3o T6o 86o Q6o K2o 96o J5o 75o Q5o 54o T5o J4o 85o Q4o 64o J3o 95o T4o Q3o J2o 53o " +
"74o Q2o T3o 84o 43o 63o T2o 94o 52o 93o 73o 42o 62o 83o 92o 32o 82o 72o").split(/\s+/);
const TOTAL_COMBOS = 1326;
const combosOf = (cl) => (cl[0] === cl[1] ? 6 : cl[2] === "s" ? 4 : 12);

function classToCombos(cl) {
  const a = RANKS.indexOf(cl[0]), b = RANKS.indexOf(cl[1]), out = [];
  if (a === b) { for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) out.push([a * 4 + i, a * 4 + j]); }
  else if (cl[2] === "s") { for (let i = 0; i < 4; i++) out.push([a * 4 + i, b * 4 + i]); }
  else { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (i !== j) out.push([a * 4 + i, b * 4 + j]); }
  return out;
}
function handClass(c1, c2) {
  let a = rankOf(c1), b = rankOf(c2);
  const suited = suitOf(c1) === suitOf(c2);
  if (a < b) { const t = a; a = b; b = t; }
  return a === b ? RANKS[a] + RANKS[a] : RANKS[a] + RANKS[b] + (suited ? "s" : "o");
}
function classPercentile(cl) {
  let acc = 0;
  for (let i = 0; i < RANKED.length; i++) { acc += combosOf(RANKED[i]); if (RANKED[i] === cl) return acc / TOTAL_COMBOS * 100; }
  return 100;
}
/** Top `pct`% of hands by the ranking above; `skip`% peels the top off (flat-call ranges). */
function topPercentRange(pct, skip) {
  skip = skip || 0;
  const need = TOTAL_COMBOS * pct / 100, skipN = TOTAL_COMBOS * skip / 100;
  let acc = 0; const out = [];
  for (let i = 0; i < RANKED.length; i++) {
    const c = combosOf(RANKED[i]), mid = acc + c / 2;
    if (mid > skipN && mid <= need) out.push(RANKED[i]);
    acc += c;
    if (acc > need) break;
  }
  return out;
}

/* ------------------------------------------------- 4. Range notation ----
 * "22+ A9s+ A5s-A4s KTs+ AJo+ KQo" -> list of 169-hand classes.            */
function parseRange(str) {
  const out = [];
  const push = (cl) => { if (out.indexOf(cl) < 0) out.push(cl); };
  String(str).trim().split(/[\s,]+/).filter(Boolean).forEach((tok) => {
    let m;
    // pairs with +   e.g. 77+
    if ((m = tok.match(/^([2-9TJQKA])\1\+$/))) {
      const lo = RANKS.indexOf(m[1]);
      for (let r = lo; r < 13; r++) push(RANKS[r] + RANKS[r]);
      return;
    }
    // pair span      e.g. 99-66
    if ((m = tok.match(/^([2-9TJQKA])\1-([2-9TJQKA])\2$/))) {
      let hi = RANKS.indexOf(m[1]), lo = RANKS.indexOf(m[2]);
      if (hi < lo) { const t = hi; hi = lo; lo = t; }
      for (let r = lo; r <= hi; r++) push(RANKS[r] + RANKS[r]);
      return;
    }
    // single pair    e.g. TT
    if ((m = tok.match(/^([2-9TJQKA])\1$/))) { push(m[1] + m[1]); return; }
    // kicker with +  e.g. ATs+  (same high card, kicker climbs to one below it)
    if ((m = tok.match(/^([2-9TJQKA])([2-9TJQKA])([so])\+$/))) {
      const hi = RANKS.indexOf(m[1]), lo = RANKS.indexOf(m[2]);
      for (let k = lo; k < hi; k++) push(RANKS[hi] + RANKS[k] + m[3]);
      return;
    }
    // kicker span    e.g. A5s-A2s
    if ((m = tok.match(/^([2-9TJQKA])([2-9TJQKA])([so])-([2-9TJQKA])([2-9TJQKA])([so])$/))) {
      if (m[1] !== m[4] || m[3] !== m[6]) return;
      const hi = RANKS.indexOf(m[1]);
      let a = RANKS.indexOf(m[2]), b = RANKS.indexOf(m[5]);
      if (a < b) { const t = a; a = b; b = t; }
      for (let k = b; k <= a; k++) push(RANKS[hi] + RANKS[k] + m[3]);
      return;
    }
    // explicit       e.g. AKs / KQo
    if ((m = tok.match(/^([2-9TJQKA])([2-9TJQKA])([so])$/))) {
      const hi = RANKS.indexOf(m[1]), lo = RANKS.indexOf(m[2]);
      if (hi === lo) return;
      push(RANKS[Math.max(hi, lo)] + RANKS[Math.min(hi, lo)] + m[3]);
      return;
    }
  });
  return out;
}
const rangePct = (classes) => classes.reduce((a, c) => a + combosOf(c), 0) / TOTAL_COMBOS * 100;

/* --------------------------------------------------- 5. Preflop charts --
 * Raise-first-in by position. Explicit charts rather than a linear "top X%"
 * slice, because real opening ranges are not linear (suited wheel aces and
 * suited connectors outrank offsuit broadways they lose to preflop).        */
const RFI_6MAX = {
  UTG: "22+ A9s+ A5s-A4s KTs+ QTs+ JTs T9s 98s 87s 76s ATo+ KQo",
  HJ:  "22+ A8s+ A5s-A2s K9s+ Q9s+ J9s+ T8s+ 98s 87s 76s 65s ATo+ KJo+ QJo",
  CO:  "22+ A6s+ A5s-A2s K7s+ Q8s+ J8s+ T7s+ 97s+ 87s 76s 65s 54s A8o+ KTo+ QTo+ JTo",
  BTN: "22+ A2s+ K2s+ Q5s+ J6s+ T6s+ 96s+ 86s+ 75s+ 64s+ 53s+ 43s A2o+ K7o+ Q8o+ J9o+ T9o 98o",
  SB:  "22+ A2s+ K2s+ Q5s+ J6s+ T6s+ 96s+ 86s+ 75s+ 64s+ 53s+ 43s A5o+ K8o+ Q9o+ J9o+ T9o",
  BB:  ""
};
const RFI_9MAX = {
  UTG:    "44+ ATs+ A5s-A4s KJs+ QJs JTs T9s AJo+ KQo",
  "UTG+1":"33+ A9s+ A5s-A4s KTs+ QTs+ JTs T9s 98s AJo+ KQo",
  MP:     "22+ A9s+ A5s-A3s KTs+ QTs+ JTs T9s 98s 87s ATo+ KJo+",
  "MP+1": "22+ A8s+ A5s-A2s K9s+ Q9s+ J9s+ T9s 98s 87s 76s ATo+ KJo+ QJo",
  HJ:     RFI_6MAX.HJ, CO: RFI_6MAX.CO, BTN: RFI_6MAX.BTN, SB: RFI_6MAX.SB, BB: ""
};
const RFI_HU = { "BTN(SB)": "22+ A2s+ K2s+ Q2s+ J2s+ T4s+ 94s+ 84s+ 74s+ 63s+ 53s+ 43s A2o+ K2o+ Q4o+ J6o+ T6o+ 96o+ 86o+ 76o 65o", BB: "" };

const POS_6MAX = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const POS_9MAX = ["UTG", "UTG+1", "MP", "MP+1", "HJ", "CO", "BTN", "SB", "BB"];
const POS_HU = ["BTN(SB)", "BB"];
const posList = (seats) => (seats == 9 ? POS_9MAX : seats == 2 ? POS_HU : POS_6MAX);

function rfiRange(seats, pos) {
  const table = seats == 9 ? RFI_9MAX : seats == 2 ? RFI_HU : RFI_6MAX;
  const s = table[pos] !== undefined ? table[pos] : RFI_6MAX.CO;
  return parseRange(s);
}
function rfiPct(seats, pos) { return rangePct(rfiRange(seats, pos)); }

/** Postflop action order: SB acts first, BB second, then by seat; BTN last. */
function isInPosition(seats, me, villain) {
  const L = posList(seats);
  const order = (p) => (p === "SB" || p === "BTN(SB)" ? 0 : p === "BB" ? 1 : L.indexOf(p) + 2);
  return order(me) > order(villain);
}

/* --------------------------------------- 6. Board texture & draw reading -- */
function boardInfo(board) {
  if (board.length < 3) return null;
  const rs = board.map(rankOf), ss = board.map(suitOf);
  const sCount = {}; ss.forEach((s) => (sCount[s] = (sCount[s] || 0) + 1));
  const maxSuit = Math.max.apply(null, Object.keys(sCount).map((k) => sCount[k]));
  const rCount = {}; rs.forEach((r) => (rCount[r] = (rCount[r] || 0) + 1));
  const paired = Object.keys(rCount).some((k) => rCount[k] >= 2);
  const trips = Object.keys(rCount).some((k) => rCount[k] >= 3);
  const uniq = Array.from(new Set(rs)).sort((a, b) => a - b);
  let conn = 0;
  for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) if (uniq[j] - uniq[i] <= 4) conn++;
  const hi = Math.max.apply(null, rs);
  const wet = (maxSuit >= 3 ? 3 : maxSuit >= 2 ? 1.4 : 0) + (conn >= 3 ? 1.6 : conn >= 2 ? 1 : 0) + (hi >= 10 ? 0.4 : 0);
  return {
    maxSuit, paired, trips, hi, conn, wet,
    texture: wet >= 3 ? "wet" : wet >= 1.6 ? "mid" : "dry",
    suitKey: maxSuit >= 3 ? "mono" : maxSuit === 2 ? "twotone" : "rainbow",
    highKey: hi >= 11 ? "high" : hi >= 8 ? "middling" : "low"
  };
}
/** Draws available to a specific two-card hand. Only meaningful flop/turn. */
function drawInfo(hole, board) {
  const empty = { flush: false, oesd: false, gutshot: false, bdFlush: false, overs: 0, quality: 0, keys: [] };
  if (board.length < 3 || board.length > 4) return empty;
  const all = hole.concat(board);
  const sCount = {}; all.forEach((c) => (sCount[suitOf(c)] = (sCount[suitOf(c)] || 0) + 1));
  let flush = false, bdFlush = false;
  for (const s in sCount) {
    const mine = hole.filter((c) => suitOf(c) == s).length;
    if (sCount[s] === 4 && mine >= 1) flush = true;
    if (sCount[s] === 3 && mine >= 1 && board.length === 3) bdFlush = true;
  }
  let m = 0; all.forEach((c) => (m |= 1 << rankOf(c)));
  let oesd = false, gutshot = false;
  if (straightHigh(m) < 0) {
    let outs = 0;
    for (let r = 0; r < 13; r++) { if (m >> r & 1) continue; if (straightHigh(m | (1 << r)) >= 0) outs++; }
    if (outs >= 2) oesd = true; else if (outs === 1) gutshot = true;
  }
  const boardHi = Math.max.apply(null, board.map(rankOf));
  const overs = hole.filter((c) => rankOf(c) > boardHi).length;
  // Blend into a single 0..1 "how much does this hand want to keep going" number.
  const parts = [];
  if (flush) parts.push(0.92);
  if (oesd) parts.push(0.82);
  if (gutshot) parts.push(0.34);
  if (bdFlush) parts.push(0.16);
  if (overs >= 2) parts.push(0.22);
  else if (overs === 1) parts.push(0.10);
  parts.sort((a, b) => b - a);
  let quality = 0;
  for (let i = 0; i < parts.length; i++) quality += parts[i] * (i === 0 ? 1 : 0.3);
  quality = Math.min(1, quality);
  const keys = [];
  if (flush) keys.push("flushDraw");
  if (oesd) keys.push("oesd"); else if (gutshot) keys.push("gutshot");
  if (!flush && bdFlush) keys.push("bdFlush");
  if (overs >= 2 && !flush && !oesd) keys.push("twoOvers");
  return { flush, oesd, gutshot, bdFlush, overs, quality, keys };
}

/* ------------------------------------------------------- 7. Range utils -- */
function expandRange(classes, deadCards) {
  const dead = {}; (deadCards || []).forEach((c) => (dead[c] = 1));
  const out = [];
  for (let i = 0; i < classes.length; i++) {
    const cs = classToCombos(classes[i]);
    for (let j = 0; j < cs.length; j++) if (!dead[cs[j][0]] && !dead[cs[j][1]]) out.push(cs[j]);
  }
  return out;
}
/** Uniform-by-combo draw from a class list (not uniform by class). */
function drawCombo(classes, deadCards, rnd) {
  const pool = expandRange(classes, deadCards);
  if (!pool.length) return null;
  return pool[Math.floor(rnd() * pool.length)];
}

/* ---------------------------------------- 8. Matchup table (equity core) --
 * The single expensive computation per spot: hero's equity against EVERY
 * villain combo, over one shared set of runouts. Re-weighting the villain
 * range afterwards is then a weighted average — free, and exact relative to
 * the other options in the same spot. This is what makes option EVs
 * comparable instead of Monte-Carlo noise.                                  */
function matchupTable(hero, board, combos, opt) {
  opt = opt || {};
  const rnd = opt.rnd || Math.random;
  const dead = {}; hero.forEach((c) => (dead[c] = 1)); board.forEach((c) => (dead[c] = 1));
  const deck = []; for (let c = 0; c < 52; c++) if (!dead[c]) deck.push(c);
  const need = 5 - board.length;
  const valid = combos.filter((c) => !dead[c[0]] && !dead[c[1]]);
  const n = valid.length;
  const eq = new Float64Array(n);
  if (!n) return { combos: valid, eq, exact: true, runouts: 0 };

  const budget = opt.budget || 420000;
  let runouts = [], exact = true;
  if (need === 0) {
    runouts = [[]];
  } else if (need === 1) {
    for (let i = 0; i < deck.length; i++) runouts.push([deck[i]]);
  } else if (need === 2 && n * (deck.length * (deck.length - 1) / 2) <= budget) {
    for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) runouts.push([deck[i], deck[j]]);
  } else {
    // Sample `need` distinct cards. Covers turn+river (2) and the preflop
    // case where five board cards still have to come.
    exact = false;
    const k = Math.max(400, Math.min(6000, Math.floor(budget / Math.max(1, n))));
    const pool = deck.slice();
    for (let s = 0; s < k; s++) {
      for (let i = 0; i < need; i++) {
        const j = i + Math.floor(rnd() * (pool.length - i));
        const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
      runouts.push(pool.slice(0, need));
    }
  }
  const heroCache = new Float64Array(runouts.length);
  for (let x = 0; x < runouts.length; x++) heroCache[x] = evalHand(hero.concat(board, runouts[x]));

  for (let i = 0; i < n; i++) {
    const v = valid[i];
    let win = 0, tie = 0, cnt = 0;
    for (let x = 0; x < runouts.length; x++) {
      const ro = runouts[x];
      let clash = false;
      for (let y = 0; y < ro.length; y++) if (ro[y] === v[0] || ro[y] === v[1]) { clash = true; break; }
      if (clash) continue;
      const o = evalHand([v[0], v[1]].concat(board, ro));
      const h = heroCache[x];
      if (h > o) win++; else if (h === o) tie++;
      cnt++;
    }
    eq[i] = cnt ? (win + tie / 2) / cnt : 0.5;
  }
  return { combos: valid, eq, exact, runouts: runouts.length };
}
/** Hero equity against a weighted subset of the table. */
function weightedEquity(table, weights) {
  let num = 0, den = 0;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    if (w <= 0) continue;
    num += w * table.eq[i]; den += w;
  }
  return { eq: den > 0 ? num / den : 0.5, mass: den };
}
const totalMass = (weights) => weights.reduce((a, b) => a + b, 0);

/* ------------------------------------------ 9. Villain strength ranking --
 * Villain must decide without seeing hero's cards, so ranking uses only the
 * villain combo + board: made-hand score, plus draw quality for continues.  */
function rankRange(combos, board) {
  const n = combos.length;
  const made = new Float64Array(n), draw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const c = combos[i];
    made[i] = evalHand([c[0], c[1]].concat(board));
    draw[i] = drawInfo([c[0], c[1]], board).quality;
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => made[b] - made[a]);
  const madePct = new Float64Array(n);           // 0 = strongest hand in range
  for (let k = 0; k < n; k++) madePct[order[k]] = n > 1 ? k / (n - 1) : 0;
  return { made, draw, madePct, order, n };
}

/* -------------------------------------------- 10. Opponent profile types --
 * openMul  : preflop range width multiplier (1 = standard reg)
 * bluffMul : how much of the theoretical bluff quota they actually fire
 * contMul  : how much of MDF they actually defend with (>1 = calling station)
 * valueMul : how wide they value bet                                        */
const VILLAIN_TYPES = {
  unknown: { id: "unknown", openMul: 1.00, bluffMul: 1.00, contMul: 1.00, valueMul: 1.00 },
  nit:     { id: "nit",     openMul: 0.55, bluffMul: 0.35, contMul: 0.70, valueMul: 0.80 },
  tag:     { id: "tag",     openMul: 0.78, bluffMul: 0.95, contMul: 0.95, valueMul: 0.95 },
  station: { id: "station", openMul: 1.60, bluffMul: 0.30, contMul: 1.55, valueMul: 1.35 },
  lag:     { id: "lag",     openMul: 1.90, bluffMul: 1.70, contMul: 1.15, valueMul: 1.25 },
  fish:    { id: "fish",    openMul: 1.70, bluffMul: 0.85, contMul: 1.30, valueMul: 1.30 }
};

/* --------------------------------------------- 11. Range action model ----
 * THE FIX. Given a range on a board, return a weight in [0,1] per combo for
 * a given action.
 *
 *  bet     : polarised. Value = strongest `valueFreq` of the range. Bluffs are
 *            drawn from the weakest hands *with the best draws*, sized so that
 *            bluffs make up s/(P+2s) of the betting range — the equilibrium
 *            ratio that makes a bluff-catcher exactly indifferent. A small
 *            protection weight covers the middle.
 *  call    : condensed. Defends the top `MDF` of the range by (made strength +
 *            draw value), which is where bluff-catchers actually live.
 *  check   : the complement of the betting range.
 *  raise   : value-heavy, with a thin bluff tail.
 *
 * Soft edges (logistic) rather than a hard cut, so a hand right at the
 * threshold is played as a mix — that is what real ranges look like and it
 * keeps EVs from jumping discontinuously.                                   */
function softStep(x, edge, width) {
  if (width <= 0) return x <= edge ? 1 : 0;
  return 1 / (1 + Math.exp((x - edge) / width));
}
function actionWeights(rank, action, size, pot, vt, prior) {
  vt = vt || VILLAIN_TYPES.unknown;
  const n = rank.n;
  const w = new Float64Array(n);
  const base = prior || null;
  const get = (i) => (base ? base[i] : 1);
  if (!n) return w;

  if (action === "check") {
    const bet = actionWeights(rank, "bet", size, pot, vt, prior);
    for (let i = 0; i < n; i++) w[i] = Math.max(0, get(i) - bet[i]);
    return w;
  }

  if (action === "bet" || action === "raise") {
    const isRaise = action === "raise";
    const r = pot > 0 ? size / pot : 0.6;
    // Equilibrium bluff share of the betting range: risk / (pot + 2*risk).
    const bluffShare = Math.max(0.05, Math.min(0.55, size / (pot + 2 * size))) * vt.bluffMul;
    // How often the range bets at all. Bigger sizes are used less often and
    // with a tighter value core; raises are far tighter than bets.
    let betFreq = isRaise ? 0.16 : Math.max(0.28, Math.min(0.78, 0.70 - 0.20 * r));
    betFreq = Math.max(0.05, Math.min(0.92, betFreq * (isRaise ? vt.valueMul : (0.5 + 0.5 * vt.valueMul + 0.25 * (vt.bluffMul - 1)))));
    const valueFreq = Math.max(0.02, betFreq * (1 - Math.min(0.7, bluffShare)));
    const bluffFreq = Math.max(0, betFreq - valueFreq);

    // Value: strongest hands.
    for (let i = 0; i < n; i++) w[i] = get(i) * softStep(rank.madePct[i], valueFreq, 0.045);
    // Protection / merge: a thin slice of the middle bets small sizes.
    if (!isRaise && r <= 0.45) {
      for (let i = 0; i < n; i++) {
        if (rank.madePct[i] > valueFreq && rank.madePct[i] < 0.55) w[i] = Math.max(w[i], get(i) * 0.14);
      }
    }
    // Bluffs: from the bottom half of the range, best draws first.
    const cand = [];
    for (let i = 0; i < n; i++) if (rank.madePct[i] > Math.max(valueFreq, 0.45)) cand.push(i);
    cand.sort((a, b) => (rank.draw[b] - rank.draw[a]) || (rank.madePct[b] - rank.madePct[a]));
    let quota = bluffFreq * n, k = 0;
    for (let x = 0; x < cand.length && quota > 0; x++) {
      const i = cand[x];
      // Air with no draw still bluffs sometimes, but draws come first.
      const appetite = 0.35 + 0.65 * rank.draw[i];
      const add = Math.min(1, quota) * appetite;
      w[i] = Math.max(w[i], get(i) * Math.min(1, add));
      quota -= appetite; k++;
    }
    return w;
  }

  if (action === "call") {
    // Minimum defence frequency against a bet of `size` into `pot`.
    const mdf = pot + size > 0 ? pot / (pot + size) : 0.5;
    const cont = Math.max(0.06, Math.min(0.95, mdf * vt.contMul));
    // Rank by "reason to continue" = made strength blended with draw value.
    const score = new Float64Array(n);
    for (let i = 0; i < n; i++) score[i] = (1 - rank.madePct[i]) + 0.45 * rank.draw[i];
    const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => score[b] - score[a]);
    const pctByScore = new Float64Array(n);
    for (let k = 0; k < n; k++) pctByScore[idx[k]] = n > 1 ? k / (n - 1) : 0;
    for (let i = 0; i < n; i++) w[i] = get(i) * softStep(pctByScore[i], cont, 0.05);
    return w;
  }
  for (let i = 0; i < n; i++) w[i] = get(i);
  return w;
}

/** Fold frequency implied by the range model (not a hand-tuned constant). */
function foldFrequency(rank, size, pot, vt, prior) {
  const before = prior ? totalMass(prior) : rank.n;
  if (before <= 0) return { fold: 0, continueW: new Float64Array(rank.n) };
  const cont = actionWeights(rank, "call", size, pot, vt, prior);
  const after = totalMass(cont);
  return { fold: Math.max(0, Math.min(0.95, 1 - after / before)), continueW: cont };
}

/* --------------------------------------------- 12. Equity realisation ----
 * eq * pot assumes hero banks his whole share at showdown. In reality a weak
 * hand out of position realises less than its raw equity and a hand with a
 * draw plus position realises more. Small, bounded, and documented — it moves
 * marginal check/bet calls, never the sign of an obvious one.               */
function realisation(eq, opts) {
  const ip = !!opts.ip, draw = opts.drawQuality || 0, spr = opts.spr === undefined ? 3 : opts.spr;
  let r = 1;
  r += ip ? 0.055 : -0.065;
  r += 0.10 * draw;
  if (eq < 0.45) r -= 0.05;              // weak hands get bet off their equity
  if (eq > 0.75) r += 0.03;              // strong hands over-realise
  if (spr < 1.2) r += 0.03;              // short stacks realise more (fewer streets)
  return Math.max(0.72, Math.min(1.12, r));
}

/* --------------------------------------------------- 13. EV of actions ----
 * Frame: net chips from this moment. Folding now = 0. Money already in the
 * pot is sunk and never appears as a cost.
 *
 *   bet X into pot P
 *     villain folds  (f)      -> +P
 *     villain raises (rz)     -> hero takes the better of folding (-X) or
 *                                calling the raise
 *     villain calls  (1-f-rz) -> pot becomes P+2X; win -> +(P+X), lose -> -X
 *
 * The previous version used eqc*(P + 2X) - (1-eqc)*X for the call branch,
 * which pays hero his own bet back on top of the pot — it overstated every
 * bet by eqc*X.
 * ------------------------------------------------------------------------ */
function evCheck(table, weights, opts) {
  const e = weightedEquity(table, weights);
  const r = opts.realise === false ? 1 : realisation(e.eq, opts);
  return { ev: e.eq * r * opts.pot, eq: e.eq, realised: r };
}
function evBet(ctx, X) {
  const { table, rank, weights, pot, vt, ip, drawQuality, effStack } = ctx;
  const size = Math.min(X, effStack);
  if (size <= 0) return null;
  const before = totalMass(weights);
  if (before <= 0) return null;

  const contW = actionWeights(rank, "call", size, pot, vt, weights);
  // Villain's raising range is the strong end of what continues.
  const raiseW = actionWeights(rank, "raise", size * 2.7, pot + 2 * size, vt, contW);
  const callW = new Float64Array(contW.length);
  for (let i = 0; i < contW.length; i++) callW[i] = Math.max(0, contW[i] - raiseW[i]);

  const mRaise = totalMass(raiseW), mCall = totalMass(callW);
  const fFold = Math.max(0, 1 - (mRaise + mCall) / before);
  const pRaise = mRaise / before, pCall = mCall / before;

  const eqCall = weightedEquity(table, callW).eq;
  const evCalled = eqCall * (pot + size) - (1 - eqCall) * size;

  // Facing the check-raise: hero folds (loses the bet) or calls it.
  // Winning takes the starting pot plus everything the VILLAIN put in (rSize).
  // Hero's own chips are not winnings — counting `pot + size + rSize` here
  // would pay hero back his own bet, the same error as the old P+2X formula.
  const rSize = Math.min(effStack, size * 2.7);
  const eqVsRaise = weightedEquity(table, raiseW).eq;

  const evCallRaise = eqVsRaise * (pot + rSize) - (1 - eqVsRaise) * rSize;
  const evRaised = Math.max(-size, evCallRaise);

  return {
    ev: fFold * pot + pRaise * evRaised + pCall * evCalled,
    size, fold: fFold, raised: pRaise, called: pCall,
    eqWhenCalled: eqCall, eqVsRaise, evCalled, evRaised
  };
}
function evCall(ctx, B) {
  const { table, weights, pot } = ctx;
  const e = weightedEquity(table, weights);
  return { ev: e.eq * (pot + B) - (1 - e.eq) * B, eq: e.eq, required: B / (pot + 2 * B) };
}
function evRaise(ctx, B, X) {
  const { table, rank, weights, pot, vt, effStack } = ctx;
  const size = Math.min(X, effStack);
  if (size <= B) return null;
  const before = totalMass(weights);
  if (before <= 0) return null;
  // Villain faces (size - B) more into a pot of (pot + B + size).
  const contW = actionWeights(rank, "call", size - B, pot + B + size, vt, weights);
  const mCont = totalMass(contW);
  const f = Math.max(0, 1 - mCont / before);
  const eqc = weightedEquity(table, contW).eq;
  // Villain's total contribution once he calls the raise is `size` (his
  // original bet B is part of it, not on top of it), so winning takes
  // pot + size. Adding B as well would pay hero back his opponent's bet twice.
  const evCalled = eqc * (pot + size) - (1 - eqc) * size;
  return { ev: f * (pot + B) + (1 - f) * evCalled, size, fold: f, eqWhenCalled: eqc, evCalled };
}

/* ------------------------------------------------- 14. Postflop context -- */
function buildContext(o) {
  const combos = expandRange(o.villainClasses, o.hole.concat(o.board));
  const table = matchupTable(o.hole, o.board, combos, { rnd: o.rnd, budget: o.budget });
  const rank = rankRange(table.combos, o.board);
  let weights = new Float64Array(table.combos.length).fill(1);
  // Replay the villain's earlier actions so the range narrows the way the
  // story says it did — bets polarise it, calls condense it.
  (o.history || []).forEach((h) => {
    const r = rankRange(table.combos, h.board);
    weights = actionWeights(r, h.action, h.size || 0, h.pot || 1, o.vt, weights);
  });
  const draw = drawInfo(o.hole, o.board);
  return {
    table, rank, weights, pot: o.pot, vt: o.vt || VILLAIN_TYPES.unknown,
    ip: !!o.ip, effStack: o.effStack, drawQuality: draw.quality, draw,
    spr: o.pot > 0 ? o.effStack / o.pot : 0, board: o.board, hole: o.hole
  };
}

/* ----------------------------------------------- 15. Option enumeration --
 * Builds the full option list for a decision point with an EV on each.      */
const round1 = (x) => Math.round(x * 10) / 10;

function options(ctx, facing) {
  const out = [];
  const P = ctx.pot;
  if (facing && facing.size > 0) {
    const B = Math.min(facing.size, ctx.effStack);
    // Villain's betting range is what hero is up against.
    const betW = actionWeights(ctx.rank, "bet", B, P, ctx.vt, ctx.weights);
    const sub = Object.assign({}, ctx, { weights: betW, pot: P });
    out.push({ key: "fold", label: "fold", ev: 0, amount: 0 });
    const c = evCall(sub, B);
    out.push({ key: "call", label: "call", ev: c.ev, amount: B, eq: c.eq, required: c.required });
    [2.4, 3.4].forEach((mult, i) => {
      const X = Math.min(ctx.effStack, round1(B * mult));
      const r = evRaise(sub, B, X);
      if (r && X > B * 1.4) out.push({
        key: i === 0 ? "raiseSmall" : "raiseBig", label: "raise", ev: r.ev, amount: r.size,
        fold: r.fold, eqWhenCalled: r.eqWhenCalled
      });
    });
    if (ctx.effStack > B * 1.4 && ctx.effStack <= B * 12) {
      const r = evRaise(sub, B, ctx.effStack);
      if (r) out.push({ key: "allin", label: "allin", ev: r.ev, amount: ctx.effStack, fold: r.fold, eqWhenCalled: r.eqWhenCalled });
    }
    const eqRaw = weightedEquity(ctx.table, betW);
    return { opts: out, eq: eqRaw.eq, facing: true, villainRangeSize: Math.round(totalMass(betW)), required: B / (P + 2 * B), mdf: P / (P + B) };
  }
  // Hero acts first (or villain checked).
  const checkW = ctx.weights;
  const ck = evCheck(ctx.table, checkW, { pot: P, ip: ctx.ip, drawQuality: ctx.drawQuality, spr: ctx.spr });
  out.push({ key: "check", label: "check", ev: ck.ev, amount: 0, eq: ck.eq, realised: ck.realised });
  [[0.33, "betSmall"], [0.66, "betMid"], [1.0, "betPot"]].forEach(([frac, key]) => {
    const X = Math.min(ctx.effStack, round1(P * frac));
    if (X <= 0) return;
    const b = evBet(ctx, X);
    if (b) out.push({ key, label: "bet", ev: b.ev, amount: b.size, fold: b.fold, raised: b.raised, eqWhenCalled: b.eqWhenCalled });
  });
  if (ctx.effStack > 0 && ctx.effStack <= P * 3.5) {
    const b = evBet(ctx, ctx.effStack);
    if (b) out.push({ key: "allin", label: "allin", ev: b.ev, amount: ctx.effStack, fold: b.fold, eqWhenCalled: b.eqWhenCalled });
  }
  return { opts: out, eq: ck.eq, facing: false, villainRangeSize: Math.round(totalMass(checkW)) };
}

/* ---------------------------------------------------- 16. Spot factory ----
 * Generates a coherent postflop decision. Earlier streets are *simulated*
 * with the same model for both players, so the story ("flop: I bet, villain
 * called") is consistent with the ranges the EV maths then uses. Hero's own
 * prior actions are sampled from hero's actual hand, so hero is not
 * systematically weaker than the line he supposedly took.                   */
/** Grow or shrink an explicit chart to a target width, keeping its shape:
 *  extra hands are taken in ranking order, trimmed hands are the weakest.  */
function resizeRange(classes, targetPct) {
  const cur = rangePct(classes);
  if (targetPct >= cur) {
    const out = classes.slice();
    let acc = cur;
    for (let i = 0; i < RANKED.length && acc < targetPct; i++) {
      if (out.indexOf(RANKED[i]) >= 0) continue;
      out.push(RANKED[i]); acc += combosOf(RANKED[i]) / TOTAL_COMBOS * 100;
    }
    return out;
  }
  const ordered = classes.slice().sort((a, b) => RANKED.indexOf(a) - RANKED.indexOf(b));
  const out = []; let acc = 0;
  for (let i = 0; i < ordered.length; i++) {
    const add = combosOf(ordered[i]) / TOTAL_COMBOS * 100;
    if (acc + add / 2 > targetPct) break;
    out.push(ordered[i]); acc += add;
  }
  return out.length ? out : classes.slice(0, 1);
}
const clampPct = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/* Preflop range builders. `opener` is whoever put in the raise — never the BB,
 * which is why the caller's position and the opener's position are separate
 * arguments here. Passing the wrong one used to hand the villain a top-6%
 * premium range and quietly crush hero in every "villain opened" spot.      */
function openRange(seats, pos, vt) {
  const chart = rfiRange(seats, pos);
  const base = chart.length ? chart : rfiRange(seats, "CO");
  return resizeRange(base, clampPct(rangePct(base) * vt.openMul, 4, 92));
}
/** Flat-calling an open: the very top of the range 3-bets instead. */
function flatRange(seats, caller, opener, vt) {
  const openW = rangePct(rfiRange(seats, opener)) || 22;
  const width = caller === "BB" ? clampPct(16 + openW * 0.78, 20, 62)
              : caller === "SB" ? 13
              : clampPct(7 + openW * 0.34, 9, 26);
  const skip = caller === "BB" ? 3.5 : 5;
  return topPercentRange(clampPct(width * vt.openMul, 5, 92), skip);
}
/** 3-betting: a value core plus a suited bluff tail, not a pure top-N slice.
 *  How wide depends on who opened — you 3-bet an under-the-gun raiser far
 *  less than a button steal, so the opener's seat has to be an input.      */
function threeBetRange(seats, pos, vt, openerPos) {
  const openW = openerPos ? (rangePct(rfiRange(seats, openerPos)) || 22) : 22;
  // a 15% opener earns ~5.5% of 3-bets, a 45% opener ~11%
  const width = clampPct(3.4 + openW * 0.17, 3, 14) * vt.openMul;
  const value = topPercentRange(clampPct(width, 2, 20));
  const bluffs = parseRange("A5s-A2s K9s-K7s Q9s J9s T9s 98s 76s 65s");
  // wider opens get attacked with more bluffs, not just more value
  const share = clampPct(openW, 10, 50) / 50;
  const wanted = Math.round(bluffs.length * share * clampPct(vt.bluffMul, 0.2, 1.8));
  const out = value.slice();
  bluffs.slice(0, wanted).forEach((c) => { if (out.indexOf(c) < 0) out.push(c); });
  return out;
}
/** The opener's range once it has called a 3-bet: the 4-bet top is gone. */
function callVs3betRange(seats, pos, vt) {
  const open = openRange(seats, pos, vt);
  const openW = rangePct(open);
  return topPercentRange(clampPct(Math.min(openW, 16) * vt.openMul, 4, 30), 2.5);
}

const SCENARIOS = [
  // hero raised first in and got called
  { id: "open_call", pot: 5.5, heroAgg: true, heroInv: 2.5, opener: "hero",
    heroR: (seats, hp, vp, vt) => openRange(seats, hp, VILLAIN_TYPES.unknown),
    vilR:  (seats, hp, vp, vt) => flatRange(seats, vp, hp, vt) },
  // villain raised first in, hero called
  { id: "call_open", pot: 5.5, heroAgg: false, heroInv: 2.5, opener: "villain",
    heroR: (seats, hp, vp, vt) => flatRange(seats, hp, vp, VILLAIN_TYPES.unknown),
    vilR:  (seats, hp, vp, vt) => openRange(seats, vp, vt) },
  // hero 3-bet the villain's open and the villain called
  { id: "3b_call", pot: 19, heroAgg: true, heroInv: 9, opener: "villain",
    heroR: (seats, hp, vp, vt) => threeBetRange(seats, hp, VILLAIN_TYPES.unknown, vp),
    vilR:  (seats, hp, vp, vt) => callVs3betRange(seats, vp, vt) },
  // hero opened, villain 3-bet, hero called
  { id: "call_3b", pot: 19, heroAgg: false, heroInv: 9, opener: "hero",
    heroR: (seats, hp, vp, vt) => callVs3betRange(seats, hp, VILLAIN_TYPES.unknown),
    vilR:  (seats, hp, vp, vt) => threeBetRange(seats, vp, vt, hp) },
  // multiway-ish limped pot
  { id: "limp", pot: 4.5, heroAgg: false, heroInv: 1, opener: null,
    heroR: () => topPercentRange(45, 5),
    vilR:  (seats, hp, vp, vt) => topPercentRange(clampPct(50 * vt.openMul, 12, 90), 6) }
];
/* 4-bet ranges, and the shove/call-a-shove ranges short stacks actually use. */
function fourBetRange(seats, pos, vt) {
  const value = topPercentRange(clampPct(3 * vt.openMul, 1, 12));
  const bluffs = parseRange("A5s-A4s KQs A5o");
  const out = value.slice();
  if (vt.bluffMul >= 0.8) bluffs.slice(0, Math.round(bluffs.length * Math.min(1.5, vt.bluffMul))).forEach((c) => { if (out.indexOf(c) < 0) out.push(c); });
  return out;
}
function callVs4betRange(seats, pos, vt) { return topPercentRange(clampPct(5 * vt.openMul, 1.5, 16)); }
/** Shoving widens sharply as the stack shortens; calling a shove does too, but less. */
function shoveRange(stackBB, vt) {
  const w = stackBB <= 8 ? 38 : stackBB <= 12 ? 27 : stackBB <= 18 ? 18 : stackBB <= 25 ? 12 : 7;
  return topPercentRange(clampPct(w * vt.openMul, 2, 85));
}
/* Calling a shove is a pot-odds decision: the shorter the shove relative to the
 * pot, the better the price and the wider the call. Calibrated so that a very
 * wide shove is punished — with too tight a calling range, fold equity gets so
 * large that even 72o shows as a profitable jam, which is wrong. */
function callShoveRange(stackBB, vt, requiredEq) {
  const byStack = stackBB <= 8 ? 34 : stackBB <= 12 ? 26 : stackBB <= 18 ? 20 : stackBB <= 25 ? 15 : 10;
  let w = byStack;
  if (requiredEq !== undefined && requiredEq > 0) {
    // needing ~50% -> tight; needing ~33% -> roughly double
    w = byStack * Math.max(0.6, Math.min(2.4, 0.47 / Math.max(0.2, requiredEq)));
  }
  return topPercentRange(clampPct(w * vt.contMul, 2, 75));
}
/** Blind posted by a seat, in BB. Used to work out what is already in the pot. */
const blindOf = (p) => (p === "BB" ? 1 : (p === "SB" || p === "BTN(SB)") ? 0.5 : 0);

SCENARIOS.push(
  { id: "4b_call", pot: 45, heroAgg: true, heroInv: 22, opener: "villain",
    heroR: (seats, hp, vp, vt) => fourBetRange(seats, hp, VILLAIN_TYPES.unknown),
    vilR:  (seats, hp, vp, vt) => callVs4betRange(seats, vp, vt) },
  { id: "call_4b", pot: 45, heroAgg: false, heroInv: 22, opener: "hero",
    heroR: (seats, hp, vp, vt) => callVs4betRange(seats, hp, VILLAIN_TYPES.unknown),
    vilR:  (seats, hp, vp, vt) => fourBetRange(seats, vp, vt) }
);
const scenarioById = (id) => SCENARIOS.filter((s) => s.id === id)[0] || SCENARIOS[0];

/* ------------------------------------------------ range read-out ---------
 * Turning a weighted combo list back into something a human can read: which
 * hands the villain most likely holds, and what your own line represents.  */
function topClasses(combos, weights, limit) {
  const byClass = {};
  for (let i = 0; i < combos.length; i++) {
    const w = weights ? weights[i] : 1;
    if (w <= 0.001) continue;
    const cl = handClass(combos[i][0], combos[i][1]);
    byClass[cl] = (byClass[cl] || 0) + w;
  }
  const total = Object.keys(byClass).reduce((a, k) => a + byClass[k], 0) || 1;
  return Object.keys(byClass)
    .map((cl) => ({ cls: cl, weight: byClass[cl], share: byClass[cl] / total }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit || 8);
}
/** Group a weighted range by what it actually made on this board. */
function categoryBreakdown(combos, weights, board) {
  const buckets = {};
  let total = 0;
  for (let i = 0; i < combos.length; i++) {
    const w = weights ? weights[i] : 1;
    if (w <= 0.001) continue;
    const c = combos[i];
    const cat = board.length >= 3 ? catOf(evalHand([c[0], c[1]].concat(board))) : -1;
    const dr = board.length >= 3 && board.length <= 4 ? drawInfo([c[0], c[1]], board) : null;
    // a hand with a real draw and no made hand is its own bucket
    const key = (cat <= 0 && dr && dr.quality >= 0.6) ? "draw" : String(cat);
    buckets[key] = (buckets[key] || 0) + w;
    total += w;
  }
  return Object.keys(buckets)
    .map((k) => ({ key: k, weight: buckets[k], share: total ? buckets[k] / total : 0 }))
    .sort((a, b) => b.weight - a.weight);
}
/** What your own line represents: your preflop range narrowed by what you did. */
function perceivedRange(heroClasses, board, history, vt, dead) {
  let combos = expandRange(heroClasses, dead || []);
  combos = combos.filter((c) => board.indexOf(c[0]) < 0 && board.indexOf(c[1]) < 0);
  if (!combos.length) return { combos, weights: new Float64Array(0) };
  let weights = new Float64Array(combos.length).fill(1);
  (history || []).forEach((h) => {
    const live = h.board.filter((c) => true);
    const rank = rankRange(combos, live);
    weights = actionWeights(rank, h.action, h.size || 0, h.pot || 1, vt || VILLAIN_TYPES.unknown, weights);
  });
  return { combos, weights };
}

/* ------------------------------------------------- situational ranges ----
 * One accessor for every preflop spot the Range Lab shows, so the charts on
 * screen are the same objects the EV maths uses — a chart that disagrees with
 * the engine is worse than no chart.                                        */
const SITUATIONS = [
  { id: "rfi",       needsVs: false },   // first in
  { id: "vs_open_3b", needsVs: true },   // facing an open: 3-bet
  { id: "vs_open_call", needsVs: true }, // facing an open: flat
  { id: "vs_3b_4b",  needsVs: true },    // facing a 3-bet: 4-bet
  { id: "vs_3b_call", needsVs: true },   // facing a 3-bet: call
  { id: "shove",     needsVs: false },   // short stack: jam
  { id: "call_shove", needsVs: false }   // short stack: call a jam
];
function situationRange(o) {
  const seats = o.seats || 6, pos = o.pos, vs = o.vs || "CO";
  const vt = o.vt || VILLAIN_TYPES.unknown;
  const stack = o.stack === undefined ? 15 : o.stack;
  switch (o.situation) {
    case "rfi":          return openRange(seats, pos, vt);
    case "vs_open_3b":   return threeBetRange(seats, pos, vt, vs);
    case "vs_open_call": return flatRange(seats, pos, vs, vt);
    case "vs_3b_4b":     return fourBetRange(seats, pos, vt);
    case "vs_3b_call":   return callVs3betRange(seats, pos, vt);
    case "shove":        return shoveRange(stack, vt);
    case "call_shove":   return callShoveRange(stack, vt);
    default:             return openRange(seats, pos, vt);
  }
}
/** Compact chart notation for a class list, e.g. "22+ A9s+ ATo+". */
function rangeNotation(classes) {
  const set = {}; classes.forEach((c) => (set[c] = 1));
  const out = [];
  // pairs
  const pairs = RANKS.split("").filter((r) => set[r + r]);
  if (pairs.length) {
    let i = 0;
    while (i < pairs.length) {
      let j = i;
      while (j + 1 < pairs.length && RANKS.indexOf(pairs[j + 1]) === RANKS.indexOf(pairs[j]) + 1) j++;
      const lo = pairs[i], hi = pairs[j];
      if (RANKS.indexOf(hi) === 12) out.push(lo + lo + "+");
      else if (i === j) out.push(lo + lo);
      else out.push(hi + hi + "-" + lo + lo);
      i = j + 1;
    }
  }
  // suited / offsuit runs, grouped by high card
  ["s", "o"].forEach((suit) => {
    for (let h = 12; h >= 0; h--) {
      const ks = [];
      for (let k = h - 1; k >= 0; k--) if (set[RANKS[h] + RANKS[k] + suit]) ks.push(k);
      if (!ks.length) continue;
      ks.sort((a, b) => b - a);
      let i = 0;
      while (i < ks.length) {
        let j = i;
        while (j + 1 < ks.length && ks[j + 1] === ks[j] - 1) j++;
        const hiK = ks[i], loK = ks[j];
        const label = (k) => RANKS[h] + RANKS[k] + suit;
        if (hiK === h - 1) out.push(label(loK) + "+");
        else if (i === j) out.push(label(hiK));
        else out.push(label(hiK) + "-" + label(loK));
        i = j + 1;
      }
    }
  });
  return out.join(" ");
}

/* ------------------------------------------------- preflop money ---------
 * The scenario fixes the *shape* of the preflop action; these sizes fix how
 * much actually went in. Each scenario used to carry a hardcoded pot
 * (open_call was always 5.5BB), so a 3BB open or a 12BB 3-bet produced the
 * wrong pot, the wrong SPR, and therefore the wrong EV on every later street.
 *
 * `level` is the amount each of the two live players finally matched. Blinds
 * belonging to players who folded are dead money and are added on top; a blind
 * belonging to a live player is already part of the level they matched.     */
const PREFLOP_LEVEL = {
  limp: (s) => s.open || 1,
  open_call: (s) => s.open || 2.5,
  call_open: (s) => s.open || 2.5,
  "3b_call": (s) => s.threeBet || 9,
  call_3b: (s) => s.threeBet || 9,
  "4b_call": (s) => s.fourBet || 22,
  call_4b: (s) => s.fourBet || 22,
  pf_allin: (s) => s.allin || 20
};
function preflopLine(o) {
  const id = o.scenario;
  const sizes = o.sizes || {};
  const stack = o.stack || 100;
  const levelFn = PREFLOP_LEVEL[id];
  if (!levelFn) return null;

  const level = Math.max(0.5, Math.min(levelFn(sizes), stack));
  const live = [o.heroPos, o.vilPos];
  const hasSB = live.indexOf("SB") >= 0 || live.indexOf("BTN(SB)") >= 0;
  const hasBB = live.indexOf("BB") >= 0;
  let dead = 0;
  if (!hasSB) dead += 0.5;
  if (!hasBB) dead += 1;
  // extra limpers who folded to the flop still leave their chips behind
  const extra = id === "limp" ? Math.max(0, (sizes.limpers || 0)) * level : 0;
  const ante = Math.max(0, o.ante || 0);

  return {
    level,
    dead: round1(dead + extra + ante),
    pot: round1(2 * level + dead + extra + ante),
    heroInv: level,
    vilInv: level,
    allin: id === "pf_allin" || level >= stack - 1e-9
  };
}

/* ---- preflop all-in --------------------------------------------------
 * No streets left to play, so this is pure equity against the range that
 * gets the money in. Two shapes:
 *   heroShoved = false : villain jammed, hero decides whether to call
 *   heroShoved = true  : hero jams, villain folds or calls                */
function allInPreflop(o) {
  const vt = o.vt || VILLAIN_TYPES.unknown;
  const stack = o.stack || 20;
  const classes = o.villainClasses && o.villainClasses.length
    ? o.villainClasses
    : (o.heroShoved ? callShoveRange(stack, vt) : shoveRange(stack, vt));
  const combos = expandRange(classes, o.hole);
  const table = matchupTable(o.hole, [], combos, { rnd: o.rnd, budget: o.budget || 800000 });
  const w = new Float64Array(table.combos.length).fill(1);
  const eq = weightedEquity(table, w).eq;

  const pot = o.pot;                 // chips in the middle before hero acts
  if (!o.heroShoved) {
    // Hero calls `toCall` to play for a pot of `pot`.
    const toCall = Math.min(o.toCall, stack);
    const required = toCall / (pot + toCall);
    const evCall = eq * pot - (1 - eq) * toCall;
    return { mode: "call", eq, required, toCall, pot, evCall, evFold: 0,
      combos: table.combos.length, classes,
      best: evCall > 0 ? "call" : "fold", edge: eq - required };
  }
  // Hero jams `shove`. Villain folds, or calls with the range above.
  const shove = Math.min(o.shove, stack);
  // What the villain has to put in, and therefore the price he is getting.
  const villainIn = o.villainIn === undefined ? 0 : o.villainIn;
  const toCallVillain = Math.max(0.5, shove - villainIn);
  const villainRequired = toCallVillain / (pot + shove + toCallVillain - villainIn);
  const callClasses = callShoveRange(stack, vt, villainRequired);
  const callers = expandRange(callClasses, o.hole);
  const totalCombos = expandRange(topPercentRange(100), o.hole).length;
  const foldFreq = Math.max(0.02, Math.min(0.97, 1 - callers.length / Math.max(1, totalCombos)));
  const callTable = matchupTable(o.hole, [], callers, { rnd: o.rnd, budget: o.budget || 800000 });
  const eqCalled = weightedEquity(callTable, new Float64Array(callTable.combos.length).fill(1)).eq;
  const evShove = foldFreq * pot + (1 - foldFreq) * (eqCalled * (pot + shove) - (1 - eqCalled) * shove);
  return { mode: "shove", eq, eqCalled, foldFreq, shove, pot, evShove, evFold: 0,
    combos: callTable.combos.length, classes: callClasses, villainRequired,
    best: evShove > 0 ? "shove" : "fold" };
}

/** Preflop action order is exactly the position list, so "acted earlier"
 *  is just a lower index. The raiser must act before the caller.           */
function pickPositions(scen, seats, pick) {
  const L = posList(seats);
  const canOpen = L.filter((p) => p !== "BB" && rfiRange(seats, p).length > 0);
  for (let tries = 0; tries < 200; tries++) {
    const opener = pick(canOpen);
    const later = L.filter((p) => L.indexOf(p) > L.indexOf(opener));
    if (!later.length) continue;
    const responder = pick(later);
    if (scen.opener === "hero") return { pos: opener, vpos: responder };
    if (scen.opener === "villain") return { pos: responder, vpos: opener };
    return pick([0, 1]) ? { pos: opener, vpos: responder } : { pos: responder, vpos: opener };
  }
  return { pos: L[L.length - 2], vpos: L[L.length - 1] };
}

function makeSpot(cfg) {
  const seed = cfg.seed === undefined ? (Math.random() * 1e9) | 0 : cfg.seed;
  const rnd = mulberry32(seedFrom(seed));
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const seats = cfg.seats || 6;
  const L = posList(seats);

  const scen = scenarioById(cfg.scenario || pick(["open_call", "call_open", "3b_call", "call_3b", "limp"]));
  const { pos, vpos } = pickPositions(scen, seats, pick);

  const vt = VILLAIN_TYPES[cfg.villainType === "random" || !cfg.villainType
    ? pick(Object.keys(VILLAIN_TYPES)) : cfg.villainType] || VILLAIN_TYPES.unknown;

  const heroClasses = scen.heroR(seats, pos, vpos, vt);
  const villainClasses = scen.vilR(seats, pos, vpos, vt);
  const hole = drawCombo(heroClasses.length ? heroClasses : topPercentRange(30), [], rnd);
  if (!hole) return null;

  const deck = []; for (let c = 0; c < 52; c++) if (c !== hole[0] && c !== hole[1]) deck.push(c);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }

  const targetStreet = cfg.street === undefined ? Math.floor(rnd() * 3) : cfg.street; // 0 flop 1 turn 2 river
  const fullBoard = deck.slice(0, 3 + targetStreet);
  const ip = isInPosition(seats, pos, vpos);

  let pot = scen.pot, heroInv = scen.heroInv;
  const stack = cfg.stack || 100;
  const story = [], history = [];
  let vilCombos = expandRange(villainClasses, hole);
  if (!vilCombos.length) return null;

  // ---- simulate the streets before the decision point ----
  for (let s = 0; s < targetStreet; s++) {
    const board = fullBoard.slice(0, 3 + s);
    const live = vilCombos.filter((c) => board.indexOf(c[0]) < 0 && board.indexOf(c[1]) < 0);
    if (!live.length) break;
    const rank = rankRange(live, board);
    const heroRank = rankRange(expandRange(heroClasses, board), board);
    const heroIdxRank = (() => {
      const mine = evalHand([hole[0], hole[1]].concat(board));
      let below = 0; for (let i = 0; i < heroRank.n; i++) if (heroRank.made[i] < mine) below++;
      return heroRank.n > 1 ? 1 - below / (heroRank.n - 1) : 0.5;   // 0 = strongest
    })();
    const heroDraw = drawInfo(hole, board).quality;

    const betSize = round1(pot * pick([0.33, 0.5, 0.66]));
    const eff = Math.max(0, stack - heroInv);
    if (eff <= 0.5) break;
    const size = Math.min(eff, betSize);

    const villainBetsFirst = !ip;   // whoever is OOP acts first
    let acted = false;

    if (villainBetsFirst === false) {
      // hero is OOP -> hero acts first
      const betW = actionWeights(heroRank, "bet", size, pot, VILLAIN_TYPES.unknown);
      // hero's own frequency for this exact hand, by its rank slot
      const heroBetFreq = Math.min(1, (heroIdxRank < 0.35 ? 0.75 : heroDraw > 0.5 ? 0.6 : 0.25));
      if (rnd() < heroBetFreq) {
        const fq = foldFrequency(rank, size, pot, vt, null);
        if (rnd() < fq.fold) { story.push({ k: "heroBetVillainFold", street: s, size }); return makeSpot(Object.assign({}, cfg, { seed: seed + 7919, depth: (cfg.depth || 0) + 1 })); }
        story.push({ k: "heroBetVillainCall", street: s, size });
        history.push({ action: "call", size, pot, board });
        pot = round1(pot + 2 * size); heroInv += size; acted = true;
      } else {
        // hero checks, villain decides
        const bw = actionWeights(rank, "bet", size, pot, vt, null);
        const betMass = totalMass(bw) / rank.n;
        if (rnd() < betMass) {
          story.push({ k: "heroCheckVillainBetHeroCall", street: s, size });
          history.push({ action: "bet", size, pot, board });
          pot = round1(pot + 2 * size); heroInv += size; acted = true;
        } else {
          story.push({ k: "checkCheck", street: s });
          history.push({ action: "check", size: round1(pot * 0.5), pot, board });
          acted = true;
        }
      }
    } else {
      // hero is IP -> villain acts first
      const bw = actionWeights(rank, "bet", size, pot, vt, null);
      const betMass = totalMass(bw) / rank.n;
      if (rnd() < betMass) {
        story.push({ k: "villainBetHeroCall", street: s, size });
        history.push({ action: "bet", size, pot, board });
        pot = round1(pot + 2 * size); heroInv += size; acted = true;
      } else {
        const heroBetFreq = heroIdxRank < 0.4 ? 0.7 : heroDraw > 0.5 ? 0.55 : 0.3;
        if (rnd() < heroBetFreq) {
          const fq = foldFrequency(rank, size, pot, vt, null);
          if (rnd() < fq.fold) return makeSpot(Object.assign({}, cfg, { seed: seed + 7919, depth: (cfg.depth || 0) + 1 }));
          story.push({ k: "villainCheckHeroBetVillainCall", street: s, size });
          history.push({ action: "call", size, pot, board });
          pot = round1(pot + 2 * size); heroInv += size; acted = true;
        } else {
          story.push({ k: "checkCheck", street: s });
          history.push({ action: "check", size: round1(pot * 0.5), pot, board });
          acted = true;
        }
      }
    }
    if (!acted) break;
  }

  const effStack = Math.max(0.5, stack - heroInv);
  const ctx = buildContext({
    hole, board: fullBoard, villainClasses, vt, ip, pot, effStack, history, rnd
  });

  // ---- decide the decision point itself ----
  // Bet sizes are weighted towards the small end, the way they actually occur.
  // A uniform pick over {1/3, 1/2, 3/4, 1.25x} manufactures far more overbets
  // than real play, which inflates how often folding is the answer.
  const pickSize = () => {
    const u = rnd();
    return u < 0.34 ? 0.33 : u < 0.64 ? 0.5 : u < 0.90 ? 0.75 : 1.25;
  };
  let facing = null, prelude = null;
  const rankNow = ctx.rank;
  const betFreqFor = (size) => {
    const bw = actionWeights(rankNow, "bet", size, pot, vt, ctx.weights);
    const tot = totalMass(ctx.weights);
    return tot > 0 ? totalMass(bw) / tot : 0;
  };
  if (ip) {
    // villain acts first: he checks or bets
    const size = round1(pot * pickSize());
    if (rnd() < betFreqFor(size)) facing = { size: Math.min(size, effStack) };
  } else {
    // hero acts first; sometimes we instead show "you checked, villain bet"
    if (rnd() < 0.45) {
      const size = round1(pot * pickSize());
      if (rnd() < Math.max(0.35, betFreqFor(size))) { facing = { size: Math.min(size, effStack) }; prelude = "heroChecked"; }
    }
  }

  const res = options(ctx, facing);

  // ---- curation ----
  // Spots where hero holds pure air against a bet teach nothing: the answer is
  // "fold" with no decision to make. Keep a few so folding stays a live option,
  // drop the rest. `cfg.curate === false` disables this for analysis use.
  if (cfg.curate !== false && facing && res.eq < 0.12 && rnd() < 0.75 && (cfg.depth || 0) < 6) {
    return makeSpot(Object.assign({}, cfg, { seed: seed + 104729, depth: (cfg.depth || 0) + 1 }));
  }
  return {
    seed, seats, scenario: scen.id, pos, vpos, villainType: vt.id, vt,
    hole, board: fullBoard, street: targetStreet, pot, effStack, ip,
    story, prelude, facing, heroClasses, villainClasses,
    options: res.opts, eq: res.eq, villainRangeSize: res.villainRangeSize,
    required: res.required, mdf: res.mdf, ctx
  };
}

/* --------------------------------------------------- 17. Preflop advice -- */
function preflopAdvice(seats, pos, cls, scenarioId) {
  const chart = rfiRange(seats, pos);
  const inChart = chart.indexOf(cls) >= 0;
  const pctl = classPercentile(cls);
  const openPct = rangePct(chart);
  return { inChart, pctl, openPct, chart };
}

/* ------------------------------------------------------------- exports -- */
return {
  // cards
  RANKS, SUITS, SUIT_GLYPH, rankOf, suitOf, cardId, cardStr,
  // eval
  evalHand, catOf, CAT_COUNT, straightHigh,
  // classes / ranges
  RANKED, TOTAL_COMBOS, combosOf, classToCombos, handClass, classPercentile,
  topPercentRange, parseRange, rangePct, expandRange, drawCombo,
  RFI_6MAX, RFI_9MAX, RFI_HU, rfiRange, rfiPct, posList, isInPosition,
  POS_6MAX, POS_9MAX, POS_HU,
  // board
  boardInfo, drawInfo,
  // equity
  matchupTable, weightedEquity, totalMass, rankRange,
  // model
  VILLAIN_TYPES, actionWeights, foldFrequency, realisation,
  // ev
  evCheck, evBet, evCall, evRaise, buildContext, options,
  // spots
  SCENARIOS, scenarioById, makeSpot, preflopAdvice,
  preflopLine, allInPreflop, shoveRange, callShoveRange, blindOf,
  SITUATIONS, situationRange, rangeNotation, openRange, flatRange, threeBetRange,
  topClasses, categoryBreakdown, perceivedRange, fourBetRange, callVs4betRange,
  // util
  mulberry32, seedFrom, round1
};
});
