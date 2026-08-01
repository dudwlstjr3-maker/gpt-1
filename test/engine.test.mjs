/* Node test suite for the poker engine. Run: node --test test/ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PE = require("../src/engine.js");

const C = (s) => PE.cardId(s[0], s[1]);
const H = (str) => str.split(/\s+/).map(C);

/* ------------------------------------------------------------- evaluator */
test("evaluator ranks the standard categories in order", () => {
  const straightFlush = PE.evalHand(H("9s 8s 7s 6s 5s"));
  const quads = PE.evalHand(H("9s 9h 9d 9c 5s"));
  const boat = PE.evalHand(H("9s 9h 9d 5c 5s"));
  const flush = PE.evalHand(H("As Js 9s 6s 3s"));
  const straight = PE.evalHand(H("9s 8h 7d 6c 5s"));
  const trips = PE.evalHand(H("9s 9h 9d 6c 3s"));
  const twoPair = PE.evalHand(H("9s 9h 5d 5c 3s"));
  const pair = PE.evalHand(H("9s 9h 5d 4c 3s"));
  const high = PE.evalHand(H("As Jh 9d 6c 3s"));
  const order = [straightFlush, quads, boat, flush, straight, trips, twoPair, pair, high];
  for (let i = 1; i < order.length; i++) assert.ok(order[i - 1] > order[i], `rank ${i} out of order`);
  assert.equal(PE.catOf(straightFlush), 8);
  assert.equal(PE.catOf(high), 0);
});

test("evaluator finds the wheel and the best 5 of 7", () => {
  assert.equal(PE.catOf(PE.evalHand(H("As 2h 3d 4c 5s"))), 4);
  // 7 cards: should find the flush, not the straight
  assert.equal(PE.catOf(PE.evalHand(H("As Ks 9s 6s 3s 7h 8d"))), 5);
  // board plays: two players with the same board make the same hand
  const board = H("As Ks Qs Js Ts");
  assert.equal(PE.evalHand(board.concat(H("2h 3d"))), PE.evalHand(board.concat(H("4h 5d"))));
});

/* ------------------------------------------------------- range notation */
test("parseRange handles +, spans and explicit hands", () => {
  assert.deepEqual(PE.parseRange("TT+"), ["TT", "JJ", "QQ", "KK", "AA"]);
  assert.deepEqual(PE.parseRange("ATs+"), ["AT" + "s", "AJs", "AQs", "AKs"]);
  assert.deepEqual(PE.parseRange("A5s-A3s").sort(), ["A3s", "A4s", "A5s"].sort());
  assert.deepEqual(PE.parseRange("KQo"), ["KQo"]);
  assert.deepEqual(PE.parseRange("99-77").sort(), ["77", "88", "99"].sort());
});

test("RFI charts land on sane frequencies", () => {
  const p = (pos) => PE.rfiPct(6, pos);
  assert.ok(p("UTG") > 13 && p("UTG") < 18, `UTG ${p("UTG")}`);
  assert.ok(p("HJ") > 17 && p("HJ") < 23, `HJ ${p("HJ")}`);
  assert.ok(p("CO") > 24 && p("CO") < 31, `CO ${p("CO")}`);
  assert.ok(p("BTN") > 40 && p("BTN") < 50, `BTN ${p("BTN")}`);
  // ranges must widen monotonically towards the button
  assert.ok(p("UTG") < p("HJ") && p("HJ") < p("CO") && p("CO") < p("BTN"));
});

test("position order is correct postflop", () => {
  assert.equal(PE.isInPosition(6, "BTN", "BB"), true);
  assert.equal(PE.isInPosition(6, "BB", "BTN"), false);
  assert.equal(PE.isInPosition(6, "BB", "SB"), true);   // SB acts first
  assert.equal(PE.isInPosition(6, "SB", "BB"), false);
});

/* ------------------------------------------------------------- equity */
test("equity: AA vs KK preflop is ~81%", () => {
  const hero = H("As Ah");
  const t = PE.matchupTable(hero, [], PE.classToCombos("KK"), { rnd: PE.mulberry32(1), budget: 5e7 });
  const eq = PE.weightedEquity(t, new Float64Array(t.combos.length).fill(1)).eq;
  assert.ok(Math.abs(eq - 0.81) < 0.02, `got ${eq}`);
});

test("equity: a made flush on the river is 100% against a range it dominates", () => {
  const hero = H("As Ks");
  const board = H("Qs 7s 2s 9h 3d");
  const t = PE.matchupTable(hero, board, PE.expandRange(PE.parseRange("QQ JJ TT"), hero.concat(board)));
  const eq = PE.weightedEquity(t, new Float64Array(t.combos.length).fill(1)).eq;
  assert.equal(eq, 1);
});

test("equity is symmetric: hero vs villain == 1 - villain vs hero", () => {
  const hero = H("Jd Td"), vil = H("Ac Kc"), board = H("9s 8h 2c");
  const a = PE.weightedEquity(PE.matchupTable(hero, board, [vil]), [1]).eq;
  const b = PE.weightedEquity(PE.matchupTable(vil, board, [hero]), [1]).eq;
  assert.ok(Math.abs(a + b - 1) < 1e-9, `${a} + ${b}`);
});

/* -------------------------------------------------- THE REGRESSION TEST --
 * The old model truncated the villain to the top N% by absolute hand
 * strength, producing a bluff-free nut range. These assert the new model
 * keeps weak hands in a betting range.                                     */
test("a betting range is polarised, not the top N% of hands", () => {
  const board = H("Ks 8d 3c");
  const combos = PE.expandRange(PE.topPercentRange(30), board);
  const rank = PE.rankRange(combos, board);
  const w = PE.actionWeights(rank, "bet", 5, 10, PE.VILLAIN_TYPES.unknown, null);

  // strongest hand in the range must be betting
  let best = 0; for (let i = 1; i < rank.n; i++) if (rank.madePct[i] < rank.madePct[best]) best = i;
  assert.ok(w[best] > 0.8, "top of range should bet");

  // and some hands in the bottom third must ALSO be betting (bluffs)
  let bottomBluffs = 0;
  for (let i = 0; i < rank.n; i++) if (rank.madePct[i] > 0.66 && w[i] > 0.4) bottomBluffs++;
  assert.ok(bottomBluffs > 0, "a betting range with zero bluffs is what broke the drill");
});

test("bigger bets carry proportionally more bluffs", () => {
  const board = H("Ks 8d 3c");
  const combos = PE.expandRange(PE.topPercentRange(30), board);
  const rank = PE.rankRange(combos, board);
  const share = (size) => {
    const w = PE.actionWeights(rank, "bet", size, 10, PE.VILLAIN_TYPES.unknown, null);
    let bluff = 0, all = 0;
    for (let i = 0; i < rank.n; i++) { all += w[i]; if (rank.madePct[i] > 0.5) bluff += w[i]; }
    return all > 0 ? bluff / all : 0;
  };
  assert.ok(share(10) > share(3), `pot-size bet should be more bluff-heavy: ${share(10)} vs ${share(3)}`);
});

test("hero equity against a villain betting range stays realistic", () => {
  // The old engine drove this to ~0.26. Against a polarised range a random
  // hand from a reasonable preflop range should be near a coin flip.
  let sum = 0, n = 0;
  const rnd = PE.mulberry32(42);
  for (let i = 0; i < 60; i++) {
    const sp = PE.makeSpot({ seed: 1000 + i, stack: 100, villainType: "unknown" });
    if (!sp) continue;
    sum += sp.eq; n++;
  }
  const mean = sum / n;
  assert.ok(mean > 0.40 && mean < 0.60, `mean hero equity ${mean.toFixed(3)} — should be near 0.5`);
});

test("the drill produces +EV options, not only losses", () => {
  // The reported bug: every drill option scored negative. Folding correctly is
  // a legitimate answer, so the bar is not "never fold" — it is that most spots
  // offer a profitable line and that no single action dominates the answer key.
  let spots = 0, withPositive = 0, foldBest = 0, facing = 0;
  const bestKeys = {};
  for (let i = 0; i < 120; i++) {
    const sp = PE.makeSpot({ seed: 5000 + i, stack: 100, villainType: "random" });
    if (!sp) continue;
    spots++;
    const best = Math.max(...sp.options.map((o) => o.ev));
    const bestOpt = sp.options.find((o) => o.ev === best);
    bestKeys[bestOpt.label] = (bestKeys[bestOpt.label] || 0) + 1;
    if (best > 0.001) withPositive++;
    if (sp.facing) { facing++; if (bestOpt.key === "fold") foldBest++; }
  }
  assert.ok(withPositive / spots > 0.78, `only ${withPositive}/${spots} spots had a +EV line`);
  assert.ok(foldBest / Math.max(1, facing) < 0.42, `fold was best in ${foldBest}/${facing} facing spots`);
  assert.ok(Object.keys(bestKeys).length >= 4, `answer key too narrow: ${JSON.stringify(bestKeys)}`);
  Object.values(bestKeys).forEach((v) => assert.ok(v / spots < 0.55, "one action dominates the answer key"));
});

/* ---------------------------------------------------------------- EV maths */
test("call EV matches the closed form and flips sign exactly at the pot odds", () => {
  const hero = H("As Ac"), board = H("Kd 7h 2c 9s 3d");
  const combos = PE.expandRange(PE.parseRange("KK 77 22"), hero.concat(board));
  const table = PE.matchupTable(hero, board, combos);
  const w = new Float64Array(table.combos.length).fill(1);
  const eq = PE.weightedEquity(table, w).eq;
  const pot = 10, B = 5;
  const r = PE.evCall({ table, weights: w, pot }, B);
  assert.ok(Math.abs(r.ev - (eq * (pot + B) - (1 - eq) * B)) < 1e-9);
  assert.equal(r.required, B / (pot + 2 * B));
  // at exactly the required equity the EV is zero
  const breakeven = r.required;
  const evAt = breakeven * (pot + B) - (1 - breakeven) * B;
  assert.ok(Math.abs(evAt) < 1e-9, `breakeven EV should be 0, got ${evAt}`);
});

test("bet EV does not pay hero back his own bet (the P+2X bug)", () => {
  // Nuts on the river: villain either folds or calls and loses. Hero can win
  // at most pot + bet, never pot + 2*bet.
  const hero = H("As Ks");
  const board = H("Qs Js Ts 4d 3c");            // hero has the royal flush
  const villainClasses = PE.parseRange("99 88 77");
  const ctx = PE.buildContext({ hole: hero, board, villainClasses, vt: PE.VILLAIN_TYPES.unknown, ip: true, pot: 10, effStack: 100, history: [] });
  const b = PE.evBet(ctx, 10);
  assert.equal(b.eqWhenCalled, 1, "hero has the nuts, equity when called must be 1");
  // fold branch pays pot(10); call branch pays pot + bet (20). EV must sit between.
  assert.ok(b.ev >= 10 - 1e-9 && b.ev <= 20 + 1e-9, `bet EV ${b.ev} outside [pot, pot+bet]`);
});

/* With the nuts every equity term is exactly 1, so each EV reduces to pure
 * arithmetic over the branch probabilities. Any chip hero is paid back that is
 * actually his own shows up immediately. This is the family of bug that made
 * the old build overstate every aggressive line. */
test("no EV branch pays hero back his own chips", () => {
  const hero = H("As Ks");
  const board = H("Qs Js Ts 4d 3c");                 // royal flush, equity 1
  const P = 20;
  const ctx = PE.buildContext({ hole: hero, board, villainClasses: PE.parseRange("99 88 77"),
    vt: PE.VILLAIN_TYPES.unknown, ip: true, pot: P, effStack: 200, history: [] });

  // hero raises over a bet of B to X total
  const B = 10, X = 34;
  const r = PE.evRaise(ctx, B, X);
  assert.equal(r.eqWhenCalled, 1, "hero holds the nuts");
  // villain folds -> +(P+B); villain calls -> +(P+X), because villain's total
  // contribution once he calls the raise is X, not B+X.
  const expectRaise = r.fold * (P + B) + (1 - r.fold) * (P + X);
  assert.ok(Math.abs(r.ev - expectRaise) < 1e-9, `evRaise ${r.ev} != ${expectRaise}`);

  // hero bets and gets check-raised
  const b = PE.evBet(ctx, 12);
  assert.equal(b.eqWhenCalled, 1);
  const rSize = Math.min(200, b.size * 2.7);
  const expectBet = b.fold * P + b.called * (P + b.size) + b.raised * (P + rSize);
  assert.ok(Math.abs(b.ev - expectBet) < 1e-9, `evBet ${b.ev} != ${expectBet}`);
});

test("with the pure nuts, no line can ever be -EV", () => {
  const hero = H("As Ks");
  const board = H("Qs Js Ts 4d 3c");
  const ctx = PE.buildContext({ hole: hero, board, villainClasses: PE.topPercentRange(35),
    vt: PE.VILLAIN_TYPES.unknown, ip: true, pot: 20, effStack: 120, history: [] });
  PE.options(ctx, null).opts.forEach((o) => assert.ok(o.ev >= -1e-9, `${o.key} is ${o.ev} with the nuts`));
  PE.options(ctx, { size: 10 }).opts.forEach((o) => assert.ok(o.ev >= -1e-9, `${o.key} is ${o.ev} with the nuts`));
});

test("EV is bounded by what is physically in play", () => {
  // Hero can never win more than the pot plus the villain's whole stack.
  for (let i = 0; i < 40; i++) {
    const sp = PE.makeSpot({ seed: 77000 + i, stack: 100, villainType: "random" });
    if (!sp) continue;
    const ceiling = sp.pot + sp.effStack;
    sp.options.forEach((o) => {
      assert.ok(o.ev <= ceiling + 1e-6, `${o.key} EV ${o.ev} exceeds pot+stack ${ceiling}`);
      assert.ok(o.ev >= -sp.effStack - 1e-6, `${o.key} EV ${o.ev} loses more than the stack`);
    });
  }
});

test("fold equity is derived from the range, and nits fold more than stations", () => {
  const board = H("Ks 8d 3c");
  const combos = PE.expandRange(PE.topPercentRange(35), board);
  const rank = PE.rankRange(combos, board);
  const f = (vt) => PE.foldFrequency(rank, 7, 10, PE.VILLAIN_TYPES[vt], null).fold;
  assert.ok(f("nit") > f("unknown"), `nit ${f("nit")} vs reg ${f("unknown")}`);
  assert.ok(f("unknown") > f("station"), `reg ${f("unknown")} vs station ${f("station")}`);
  assert.ok(f("station") >= 0 && f("nit") <= 0.95);
});

test("bigger bets generate more folds", () => {
  const board = H("Ks 8d 3c");
  const rank = PE.rankRange(PE.expandRange(PE.topPercentRange(35), board), board);
  const small = PE.foldFrequency(rank, 3, 10, PE.VILLAIN_TYPES.unknown, null).fold;
  const big = PE.foldFrequency(rank, 12, 10, PE.VILLAIN_TYPES.unknown, null).fold;
  assert.ok(big > small, `${big} should exceed ${small}`);
});

test("value betting the nuts beats checking them", () => {
  const hero = H("As Ks");
  const board = H("Qs Js Ts 4d 3c");
  const ctx = PE.buildContext({ hole: hero, board, villainClasses: PE.topPercentRange(30), vt: PE.VILLAIN_TYPES.unknown, ip: true, pot: 10, effStack: 100, history: [] });
  const res = PE.options(ctx, null);
  const check = res.opts.find((o) => o.key === "check");
  const bestBet = Math.max(...res.opts.filter((o) => o.label === "bet" || o.key === "allin").map((o) => o.ev));
  assert.ok(bestBet > check.ev, `betting the nuts (${bestBet}) must beat checking (${check.ev})`);
});

test("folding the worst hand to a big bet beats calling it", () => {
  const hero = H("7c 2d");
  const board = H("As Ks Qh Jd 9s");           // hero has literally nothing
  const ctx = PE.buildContext({ hole: hero, board, villainClasses: PE.topPercentRange(20), vt: PE.VILLAIN_TYPES.unknown, ip: false, pot: 10, effStack: 100, history: [] });
  const res = PE.options(ctx, { size: 10 });
  const fold = res.opts.find((o) => o.key === "fold");
  const call = res.opts.find((o) => o.key === "call");
  assert.ok(fold.ev > call.ev, `fold ${fold.ev} should beat call ${call.ev}`);
});

test("every generated spot is internally consistent", () => {
  for (let i = 0; i < 60; i++) {
    const sp = PE.makeSpot({ seed: 9000 + i, stack: 100, villainType: "random" });
    if (!sp) continue;
    assert.ok(sp.options.length >= 2, "a decision needs at least two options");
    assert.ok(sp.board.length === 3 + sp.street);
    assert.ok(new Set(sp.hole.concat(sp.board)).size === sp.hole.length + sp.board.length, "duplicate card dealt");
    assert.ok(sp.pot > 0 && sp.effStack > 0);
    sp.options.forEach((o) => {
      assert.ok(Number.isFinite(o.ev), `non-finite EV on ${o.key}`);
      assert.ok(Math.abs(o.ev) < 500, `absurd EV ${o.ev} on ${o.key}`);
      assert.ok(o.amount <= sp.effStack + 1e-9, `${o.key} bets ${o.amount} with ${sp.effStack} behind`);
    });
    if (sp.facing) assert.equal(sp.options[0].ev, 0, "fold must be the 0 baseline");
  }
});

test("spots are reproducible from their seed", () => {
  const a = PE.makeSpot({ seed: 12345, stack: 100, villainType: "tag" });
  const b = PE.makeSpot({ seed: 12345, stack: 100, villainType: "tag" });
  assert.deepEqual(a.hole, b.hole);
  assert.deepEqual(a.board, b.board);
  assert.deepEqual(a.options.map((o) => o.key), b.options.map((o) => o.key));
  a.options.forEach((o, i) => assert.ok(Math.abs(o.ev - b.options[i].ev) < 1e-9, "same seed must give the same EV"));
});
