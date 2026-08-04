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

/* ---------------------------------------------- preflop sizing & all-in -- */
test("preflop pot follows the actual bet sizes", () => {
  const line = (sc, sizes, hp, vp) =>
    PE.preflopLine({ scenario: sc, sizes, heroPos: hp, vilPos: vp, stack: 100 });

  // a bigger open makes a bigger pot, linearly
  assert.equal(line("open_call", { open: 2.5 }, "BTN", "BB").pot, 5.5);
  assert.equal(line("open_call", { open: 3 }, "BTN", "BB").pot, 6.5);
  assert.equal(line("open_call", { open: 5 }, "BTN", "BB").pot, 10.5);

  // blinds of players who folded are dead money on top
  assert.equal(line("open_call", { open: 2.5 }, "CO", "BTN").pot, 6.5);   // SB+BB dead
  assert.equal(line("open_call", { open: 2.5 }, "SB", "BB").pot, 5);      // neither dead

  // hero's investment is what he matched, not the pot
  assert.equal(line("3b_call", { threeBet: 12 }, "BTN", "CO").heroInv, 12);
  assert.equal(line("4b_call", { fourBet: 22 }, "CO", "BTN").heroInv, 22);

  // level is capped by the stack
  assert.equal(line("3b_call", { threeBet: 500 }, "BTN", "CO").level, 100);
});

test("preflop sizing stays close to the old fixed pots at default sizes", () => {
  // The old constants were single numbers that ignored who was in the blinds:
  // 3b_call was always 19, but BTN vs BB is really 2*9 + 0.5 = 18.5 because the
  // big blind is live, not dead. The computed value is the correct one — this
  // only pins that the defaults did not drift somewhere unrecognisable.
  const at = (sc, sizes) => PE.preflopLine({ scenario: sc, sizes, heroPos: "BTN", vilPos: "BB", stack: 100 }).pot;
  assert.equal(at("open_call", { open: 2.5 }), PE.scenarioById("open_call").pot);
  assert.ok(Math.abs(at("3b_call", { threeBet: 9 }) - PE.scenarioById("3b_call").pot) <= 1);

  // and the dead-money rule itself is what accounts for the difference
  const live = PE.preflopLine({ scenario: "3b_call", sizes: { threeBet: 9 }, heroPos: "BTN", vilPos: "BB", stack: 100 });
  const dead = PE.preflopLine({ scenario: "3b_call", sizes: { threeBet: 9 }, heroPos: "BTN", vilPos: "CO", stack: 100 });
  assert.equal(live.dead, 0.5);                 // BB is live, only the SB is dead
  assert.equal(dead.dead, 1.5);                 // both blinds folded
  assert.equal(dead.pot - live.pot, 1);
});

test("facing a shove: required equity is exact and the EV sign follows it", () => {
  const hero = H("Ah Kd");
  const pot = 21, toCall = 19;
  const r = PE.allInPreflop({ hole: hero, vt: PE.VILLAIN_TYPES.unknown, stack: 20,
    heroShoved: false, pot, toCall, rnd: PE.mulberry32(3) });
  assert.ok(Math.abs(r.required - toCall / (pot + toCall)) < 1e-9);
  assert.ok(Math.abs(r.evCall - (r.eq * pot - (1 - r.eq) * toCall)) < 1e-9);
  // EV is positive exactly when equity clears the required threshold
  assert.equal(r.evCall > 0, r.eq > r.required);
});

test("all-in EV is monotonic in hand strength", () => {
  const call = (h) => PE.allInPreflop({ hole: H(h), vt: PE.VILLAIN_TYPES.unknown, stack: 20,
    heroShoved: false, pot: 21, toCall: 19, rnd: PE.mulberry32(5) }).evCall;
  const aa = call("As Ah"), ako = call("Ad Kc"), t7 = call("Td 7c"), junk = call("2c 7d");
  assert.ok(aa > ako && ako > t7 && t7 > junk, `${aa} ${ako} ${t7} ${junk}`);
  assert.ok(aa > 0, "AA must be a profitable call against any shoving range");
});

test("shoving junk is not profitable, shoving good hands is", () => {
  const shove = (h, stack) => PE.allInPreflop({ hole: H(h), vt: PE.VILLAIN_TYPES.unknown,
    stack, heroShoved: true, pot: 1, shove: stack, villainIn: 1, rnd: PE.mulberry32(7) }).evShove;
  [10, 15, 20].forEach((st) => {
    assert.ok(shove("2c 7d", st) < 0, `72o should not be a profitable ${st}BB shove`);
    assert.ok(shove("9c 4d", st) < 0, `94o should not be a profitable ${st}BB shove`);
    assert.ok(shove("Ad 9d", st) > 0, `A9s should be a profitable ${st}BB shove`);
    assert.ok(shove("7c 7d", st) > 0, `77 should be a profitable ${st}BB shove`);
  });
});

test("shoving ranges widen as stacks shorten", () => {
  const w = (st) => PE.rangePct(PE.shoveRange(st, PE.VILLAIN_TYPES.unknown));
  assert.ok(w(8) > w(15) && w(15) > w(25) && w(25) > w(40), [w(8), w(15), w(25), w(40)].join(" "));
});

test("calling a shove widens when the price improves", () => {
  const vt = PE.VILLAIN_TYPES.unknown;
  const tight = PE.rangePct(PE.callShoveRange(15, vt, 0.48));
  const loose = PE.rangePct(PE.callShoveRange(15, vt, 0.30));
  assert.ok(loose > tight, `better odds should widen the call: ${loose} vs ${tight}`);
});

test("all-in is offered postflop once the stack is short relative to the pot", () => {
  const hero = H("As Ks"), board = H("Qs 7h 2d");
  const shortCtx = PE.buildContext({ hole: hero, board, villainClasses: PE.topPercentRange(30),
    vt: PE.VILLAIN_TYPES.unknown, ip: true, pot: 20, effStack: 25, history: [] });
  assert.ok(PE.options(shortCtx, null).opts.some((o) => o.key === "allin"), "no all-in at SPR 1.25");
  assert.ok(PE.options(shortCtx, { size: 10 }).opts.some((o) => o.key === "allin"), "no all-in facing a bet at SPR 1.25");

  const deepCtx = PE.buildContext({ hole: hero, board, villainClasses: PE.topPercentRange(30),
    vt: PE.VILLAIN_TYPES.unknown, ip: true, pot: 5, effStack: 200, history: [] });
  assert.ok(!PE.options(deepCtx, null).opts.some((o) => o.key === "allin"), "all-in offered at SPR 40");
});

/* ------------------------------------------------ range read-out ---------- */
test("a betting range reads back as value plus bluffs, not nuts only", () => {
  const board = H("Ks 8d 3c");
  const combos = PE.expandRange(PE.topPercentRange(30), board);
  const rank = PE.rankRange(combos, board);
  const w = PE.actionWeights(rank, "bet", 7, 10, PE.VILLAIN_TYPES.unknown, null);

  const top = PE.topClasses(combos, w, 8);
  assert.ok(top.length >= 5, "read-out should name several holdings");
  top.forEach((x) => assert.ok(x.share > 0 && x.share <= 1, "bad share " + x.share));
  const totalShare = PE.topClasses(combos, w, 999).reduce((a, x) => a + x.share, 0);
  assert.ok(Math.abs(totalShare - 1) < 1e-6, "shares must sum to 1, got " + totalShare);

  const made = PE.categoryBreakdown(combos, w, board);
  const air = made.find((m) => m.key === "0");
  assert.ok(air && air.share > 0.05, "a betting range with no air is the old bug back");
  const pair = made.find((m) => m.key === "1");
  assert.ok(pair && pair.share > 0.2, "a betting range should be mostly made hands");
});

test("hand rank inside the represented range is monotonic", () => {
  const board = H("Kc 9d 4s 2h 7c");
  const heroClasses = PE.flatRange(6, "BB", "CO", PE.VILLAIN_TYPES.unknown);
  const history = [
    { action: "call", size: 2, pot: 5, board: [] },
    { action: "bet", size: 3, pot: 6, board: board.slice(0, 3) },
    { action: "bet", size: 8, pot: 12, board: board.slice(0, 4) },
    { action: "bet", size: 20, pot: 28, board: board.slice() }
  ];
  const per = PE.perceivedRange(heroClasses, board, history, PE.VILLAIN_TYPES.unknown, board);
  assert.ok(per.combos.length > 50, "represented range collapsed to nothing");

  const rankOf = (holeStr) => {
    const mine = PE.evalHand(H(holeStr).concat(board));
    let below = 0, total = 0;
    for (let i = 0; i < per.combos.length; i++) {
      const w = per.weights[i];
      if (w <= 0.001) continue;
      total += w;
      const sc = PE.evalHand([per.combos[i][0], per.combos[i][1]].concat(board));
      if (sc < mine) below += w; else if (sc === mine) below += w * 0.5;
    }
    return 1 - below / total;                 // 0 = top of the range
  };
  const order = ["Kh Kd", "9h 9s", "Kh 9h", "Ks Qs", "8h 8s", "Ah Qd", "5h 3d"].map(rankOf);
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] >= order[i - 1] - 1e-9,
      `stronger hand ranked worse: ${order[i - 1].toFixed(3)} then ${order[i].toFixed(3)}`);
  }
  assert.ok(order[0] < 0.05, "a set of kings should be at the very top, got " + order[0]);
  assert.ok(order[order.length - 1] > 0.85, "air should be at the bottom, got " + order[order.length - 1]);
});

/* ----------------------------------------------------------- tournament */
test("ICM equity sums to the prize pool and orders by stack", () => {
  const pay = [0.5, 0.3, 0.2];
  const eq = PE.icmEquity([50, 30, 20], pay);
  const sum = eq.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, "equity does not sum to the pool: " + sum);
  assert.ok(eq[0] > eq[1] && eq[1] > eq[2], "bigger stacks must hold more equity: " + eq.join(", "));
  // the chip leader holds 50% of the chips but less than 50% of the money
  assert.ok(eq[0] < 0.5, "ICM must penalise the leader, got " + eq[0]);
  // and the short stack holds 20% of the chips but more than 20% of the money
  assert.ok(eq[2] > 0.2, "ICM must reward the short stack, got " + eq[2]);
});

test("with equal stacks everyone holds an equal share", () => {
  const eq = PE.icmEquity([100, 100, 100, 100], [0.4, 0.3, 0.2, 0.1]);
  eq.forEach((e) => assert.ok(Math.abs(e - 0.25) < 1e-9, "unequal share: " + eq.join(", ")));
});

test("a winner-take-all ladder makes chips linear again", () => {
  // one prize = chip equity, which is exactly the cash-game case
  const stacks = [55, 25, 12, 8];
  const eq = PE.icmEquity(stacks, [1]);
  const total = stacks.reduce((a, b) => a + b, 0);
  stacks.forEach((s, i) =>
    assert.ok(Math.abs(eq[i] - s / total) < 1e-9,
      `winner-take-all should be proportional: ${eq[i]} vs ${s / total}`));
});

test("a linear ladder reproduces the chip EV exactly", () => {
  // Under winner-take-all the ICM pass must be a no-op: any other result
  // means the transform is distorting EV rather than re-pricing it.
  const tbl = { stacks: [40, 40, 40], payouts: [1] };
  const v = PE.icmValuer(tbl);
  const pot = 10;
  const branches = [{ p: 0.4, x: pot + 8 }, { p: 0.6, x: -8 }];
  const chip = branches.reduce((a, b) => a + b.p * b.x, 0);
  const icm = PE.icmEv(v, pot, branches);
  assert.ok(Math.abs(icm - chip) < 1e-6, `linear ladder changed the EV: ${icm} vs ${chip}`);
});

test("folding is the zero point under ICM too", () => {
  const tbl = PE.icmTable({ stage: "bubble", heroStack: 20, vilStack: 30 });
  const v = PE.icmValuer(tbl);
  assert.equal(PE.icmEv(v, 12, [{ p: 1, x: 0 }]), 0);
});

test("ICM demands more equity to call off than pot odds do", () => {
  // 20BB hero calling a 20BB shove into a 12BB pot, one off the money
  const tbl = PE.icmTable({ stage: "bubble", heroStack: 20, vilStack: 25 });
  const r = PE.icmRequired(tbl, 12, 20);
  assert.ok(Math.abs(r.chip - 20 / 52) < 1e-9, "pot odds wrong: " + r.chip);
  assert.ok(r.premium > 0.02,
    `the bubble should carry a real risk premium, got ${(r.premium * 100).toFixed(1)}pp`);
  assert.ok(r.icm < 1, "required equity must stay a probability: " + r.icm);
});

test("the risk premium grows as the ladder steepens", () => {
  const at = (stage) => PE.icmRequired(
    PE.icmTable({ stage, heroStack: 20, vilStack: 25 }), 12, 20).premium;
  const early = at("early"), bubble = at("bubble");
  assert.ok(bubble > early,
    `the bubble must bite harder than the early stage: ${bubble} vs ${early}`);
  // and with no ladder at all there is no premium
  const flat = PE.icmRequired({ stacks: [20, 25, 22, 22], payouts: [1] }, 12, 20).premium;
  assert.ok(Math.abs(flat) < 1e-6, "winner-take-all should carry no premium: " + flat);
});

test("a big stack pays less of a premium than a covered short stack", () => {
  // same spot, but hero is the one at risk of busting vs the one who cannot
  const short = PE.icmRequired(PE.icmTable({ stage: "final", heroStack: 12, vilStack: 60 }), 10, 12).premium;
  const big = PE.icmRequired(PE.icmTable({ stage: "final", heroStack: 60, vilStack: 12 }), 10, 12).premium;
  assert.ok(short > big,
    `busting must cost more than covering: short ${short.toFixed(4)} vs big ${big.toFixed(4)}`);
});

test("ICM never makes a stack-risking call look better than chip EV", () => {
  const tbl = PE.icmTable({ stage: "bubble", heroStack: 25, vilStack: 25 });
  const pot = 14, B = 25;
  const opts = [
    { key: "fold", label: "fold", ev: 0, amount: 0 },
    { key: "call", label: "call", ev: 0.55 * (pot + B) - 0.45 * B, amount: B, eq: 0.55 }
  ];
  const out = PE.applyIcm(opts, pot, tbl);
  assert.equal(out[0].ev, 0, "fold must stay at zero");
  assert.ok(out[1].ev < out[1].chipEv,
    `ICM should shade a coinflip-for-your-life down: ${out[1].ev} vs ${out[1].chipEv}`);
  assert.equal(out[1].chipEv, opts[1].ev, "the chip EV must be preserved for display");
});

test("option branches account for the whole distribution", () => {
  const bet = { key: "betMid", label: "bet", amount: 7, fold: 0.4, raised: 0.1,
    eqWhenCalled: 0.6, ev: 0 };
  const br = PE.optionBranches(bet, 10);
  const total = br.reduce((a, b) => a + b.p, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, "branch probabilities must sum to 1, got " + total);
});

test("the grouped ICM agrees with the exact recursion", () => {
  const stacks = [50, 30, 20, 15];
  const flat = PE.icmEquity(stacks, [0.5, 0.3, 0.2]);
  const grouped = PE.icmEquityGrouped(stacks.map((s) => ({ stack: s, count: 1 })), [0.5, 0.3, 0.2]);
  flat.forEach((e, i) => assert.ok(Math.abs(e - grouped[i]) < 1e-12,
    `grouped disagrees at ${i}: ${e} vs ${grouped[i]}`));
  // and with real multiplicity, where the grouping actually does something
  const g = PE.icmEquityGrouped([{ stack: 40, count: 1 }, { stack: 20, count: 3 }], [0.6, 0.4]);
  const f = PE.icmEquity([40, 20, 20, 20], [0.6, 0.4]);
  assert.ok(Math.abs(g[0] - f[0]) < 1e-12, `leader: ${g[0]} vs ${f[0]}`);
  assert.ok(Math.abs(g[1] - f[1]) < 1e-12, `member of the group: ${g[1]} vs ${f[1]}`);
});

test("a large field stays computable and near-linear far from the money", () => {
  // 300 left and 45 paid must not cost more than the money itself does
  const t0 = Date.now();
  const tbl = PE.icmTable({ stage: "early", heroStack: 20, vilStack: 25 });
  const r = PE.icmRequired(tbl, 12, 20);
  const ms = Date.now() - t0;
  assert.ok(ms < 500, "a 300-player field took " + ms + "ms");
  assert.ok(r.premium < 0.05,
    `300 from the money, chips are nearly linear; got +${(r.premium * 100).toFixed(1)}pp`);
});

test("risk premiums land where tournament players expect them", () => {
  const at = (stage) => PE.icmRequired(
    PE.icmTable({ stage, heroStack: 20, vilStack: 25 }), 12, 20).premium * 100;
  const early = at("early"), middle = at("middle"), bubble = at("bubble");
  assert.ok(early < middle && middle < bubble,
    `stages out of order: early ${early} middle ${middle} bubble ${bubble}`);
  assert.ok(early < 4, "the early stage should be nearly linear, got +" + early.toFixed(1) + "pp");
  assert.ok(bubble > 8 && bubble < 30,
    "a bubble premium should be big but not absurd, got +" + bubble.toFixed(1) + "pp");
});

test("the payout ladder is top-heavy and sums to the pool", () => {
  const p = PE.mttPayouts(45);
  assert.equal(p.length, 45);
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9, "ladder does not sum to 1");
  for (let i = 1; i < p.length; i++) assert.ok(p[i] < p[i - 1], "ladder is not descending at " + i);
  assert.ok(p[0] > 8 * p[44], "the ladder should be top-heavy: " + p[0] + " vs " + p[44]);
});

test("small pots stay linear while stack-offs do not", () => {
  // The property that makes ICM worth modelling at all: shoving your stack in
  // for a chip-EV-positive flip can be a large *loss* of real money, while a
  // 1BB pot is priced the same as it would be in a cash game.
  const v = PE.icmValuer(PE.icmTable({ stage: "bubble", heroStack: 24, vilStack: 24 }));
  const tiny = PE.icmEv(v, 1, [{ p: 0.5, x: 1.2 }, { p: 0.5, x: -0.2 }]);
  assert.ok(Math.abs(tiny - 0.5) < 0.02,
    "a 1BB pot should price like chips, got " + tiny.toFixed(4));
  const stackOff = PE.icmEv(v, 6, [{ p: 0.5, x: 30 }, { p: 0.5, x: -24 }]);
  assert.ok(stackOff < 0,
    "a +3BB chip-EV flip for the stack must be a loss on the bubble, got " + stackOff.toFixed(2));
});

test("tournament spots carry an ante and price every option under the ladder", () => {
  const cash = PE.makeSpot({ seed: 4242, seats: 6, stack: 25, street: 0, villainType: "unknown" });
  const mtt = PE.makeSpot({ seed: 4242, seats: 6, stack: 25, street: 0, villainType: "unknown",
    game: "mtt", stage: "bubble" });
  assert.equal(cash.ante, 0, "a cash game has no ante");
  assert.equal(mtt.ante, 1, "a tournament spot should post a big-blind ante");
  assert.ok(mtt.pot > cash.pot, `the ante must be in the pot: ${mtt.pot} vs ${cash.pot}`);

  const fold = mtt.options.find((o) => o.key === "fold");
  assert.equal(fold.ev, 0, "folding is still the zero point");
  mtt.options.filter((o) => o.key !== "fold").forEach((o) => {
    assert.ok(o.chipEv !== undefined, o.key + " lost its chip EV");
    assert.ok(o.icm, o.key + " was not re-priced");
  });
  // the all-in is where the ladder bites hardest
  const jam = mtt.options.find((o) => o.key === "allin");
  if (jam) assert.ok(jam.ev < jam.chipEv,
    `risking the stack on the bubble must cost: ${jam.ev} vs ${jam.chipEv}`);
  // and a cash spot is untouched
  cash.options.forEach((o) => assert.equal(o.chipEv, undefined, "cash options must not be re-priced"));
});

test("an ante widens the ranges that get dealt", () => {
  const cash = PE.rangePct(PE.openRange(6, "CO", PE.VILLAIN_TYPES.unknown, 0));
  const mtt = PE.rangePct(PE.openRange(6, "CO", PE.VILLAIN_TYPES.unknown, 1));
  assert.ok(mtt > cash + 3,
    `a 1BB ante should visibly widen the steal: ${mtt.toFixed(1)}% vs ${cash.toFixed(1)}%`);
  assert.ok(mtt < 70, "but not absurdly: " + mtt.toFixed(1) + "%");
});

test("a sit-and-go is a crueller ladder than an MTT at every stage", () => {
  // Nine players and three paid concentrates the whole pool in three places,
  // so the same spot costs more than it does in a field of hundreds. Treating
  // a 9-man as an MTT stage would understate the pressure everywhere.
  const at = (format, stage) => PE.icmRequired(
    PE.icmTable({ stage, format, heroStack: 20, vilStack: 25 }), 12, 20).premium;
  ["early", "middle", "bubble", "final"].forEach((stage) => {
    const mtt = at("mtt", stage), sng = at("sng", stage);
    assert.ok(sng > mtt,
      `${stage}: sng ${(sng * 100).toFixed(1)}pp should exceed mtt ${(mtt * 100).toFixed(1)}pp`);
  });
  // the 9-man ladder should look like the standard 50/30/20
  const pay = PE.mttPayouts(3);
  assert.ok(pay[0] > 0.45 && pay[0] < 0.60, "winner's share off: " + pay[0]);
  assert.ok(pay[2] > 0.14 && pay[2] < 0.24, "third place off: " + pay[2]);
});

test("the game format reaches the spot it produces", () => {
  const sng = PE.makeSpot({ seed: 909, seats: 6, stack: 20, game: "sng", stage: "bubble" });
  assert.equal(sng.game, "sng", "the spot forgot it was a sit-and-go");
  assert.equal(sng.icm.format, "sng");
  assert.equal(sng.icm.left, 4, "a 9-man bubble is four-handed, got " + sng.icm.left);
  assert.equal(sng.icm.paid, 3);
  const mtt = PE.makeSpot({ seed: 909, seats: 6, stack: 20, game: "mtt", stage: "bubble" });
  assert.equal(mtt.icm.left, 46, "an MTT bubble is not four-handed");
});
