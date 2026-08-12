/* Tournament director maths. Run: node --test test/tourney.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const T = require("../src/tourney.js");

test("blinds only ever climb, and land on payable numbers", () => {
  const st = T.structById("f9_daily");
  let prev = 0;
  for (let lvl = 1; lvl <= 40; lvl++) {
    const b = T.blindsAt(st, lvl);
    assert.ok(b.bb > 0, "level " + lvl + " has no big blind");
    assert.ok(b.bb >= prev, `blinds went down at level ${lvl}: ${prev} then ${b.bb}`);
    assert.ok(b.sb <= b.bb, `small blind above big at level ${lvl}: ${b.sb}/${b.bb}`);
    // a dealer has to be able to make the number out of real chips
    assert.equal(b.bb, T.niceChip(b.bb), "big blind is not a round chip value: " + b.bb);
    prev = b.bb;
  }
});

test("an explicit ladder is used verbatim, then keeps climbing past its end", () => {
  const st = T.structById("triton");
  // Triton publishes 500/1000 at level 1, with the ante equal to the big blind
  assert.deepEqual(T.blindsAt(st, 1), { sb: 500, bb: 1000 });
  assert.deepEqual(T.blindsAt(st, 3), { sb: 1000, bb: 1500 });
  const last = T.blindsAt(st, T.TRITON_LAD.length);
  const past = T.blindsAt(st, T.TRITON_LAD.length + 3);
  assert.ok(past.bb > last.bb, "the ladder stopped climbing after its last published level");
});

test("levels are built with breaks in the right places", () => {
  const st = T.structById("f9_daily");
  const lv = T.buildLevels(st, 12, 4, 10);
  const breaks = lv.filter((l) => l.brk);
  assert.equal(breaks.length, 2, "12 levels with a break every 4 should give 2 breaks");
  breaks.forEach((b) => assert.equal(b.min, 10, "break length not carried through"));
  assert.equal(lv.filter((l) => !l.brk).length, 12, "wrong number of playing levels");
  // no trailing break — the tournament does not end on a rest
  assert.ok(!lv[lv.length - 1].brk, "the structure ends on a break");
  // levels are numbered ignoring breaks
  assert.equal(T.lvNumber(lv, lv.length - 1), 12);
  const firstBreakAt = lv.findIndex((l) => l.brk);
  assert.equal(T.lvNumber(lv, firstBreakAt), 4, "break should come after level 4");
});

test("a structure with no ante keeps the ante column at zero", () => {
  const noAnte = T.buildLevels(T.structById("f9_daily"), 6, 0, 0);
  noAnte.forEach((l) => assert.equal(l.ante, 0, "an ante appeared in a no-ante structure"));
  const withAnte = T.buildLevels(T.structById("f9_main"), 6, 0, 0);
  withAnte.forEach((l) => assert.equal(l.ante, l.bb, "the big-blind ante should equal the BB"));
});

test("payouts always sum to exactly 100%", () => {
  for (const spots of [1, 2, 3, 5, 9, 17, 40]) {
    for (const curve of [0.7, 1, 1.4, 2.5]) {
      const p = T.payoutPct(spots, curve);
      assert.equal(p.length, spots);
      const sum = Math.round(p.reduce((a, b) => a + b, 0) * 10) / 10;
      assert.equal(sum, 100, `${spots} spots at curve ${curve} summed to ${sum}`);
      for (let i = 1; i < p.length; i++) {
        assert.ok(p[i] <= p[i - 1], `place ${i + 1} pays more than place ${i}`);
      }
    }
  }
});

test("a steeper curve concentrates the prize on first place", () => {
  const flat = T.payoutPct(9, 0.7), steep = T.payoutPct(9, 1.4);
  assert.ok(steep[0] > flat[0], `steep should pay first more: ${steep[0]} vs ${flat[0]}`);
  assert.ok(steep[8] < flat[8], `steep should pay last less: ${steep[8]} vs ${flat[8]}`);
});

test("an even split is still an even split after normalising", () => {
  const even = T.normTo100([1, 1, 1, 1]);
  assert.deepEqual(even, [25, 25, 25, 25]);
  assert.equal(T.normTo100([0, 0]).reduce((a, b) => a + b, 0), 0, "an empty split must not invent money");
});

test("the prize pool never exceeds what was collected", () => {
  const td = Object.assign(T.blank(), {
    buyin: 30000, rebuyPrice: 30000, startStack: 2000000, rebuyStack: 3000000,
    entries: 37, rebuys: 11, players: 24, poolPct: 85
  });
  const g = T.gross(td);
  assert.equal(g, 37 * 30000 + 11 * 30000);
  const p = T.pool(td);
  assert.ok(p <= g, `pool ${p} exceeds the ${g} collected`);
  assert.equal(p % 1000, 0, "the pool should be payable in notes: " + p);
  assert.equal(T.house(td), g - p, "the house share must be the remainder exactly");
  // and every won is accounted for
  assert.equal(T.pool(td) + T.house(td), g);
});

test("100% to the players leaves the house nothing", () => {
  const td = Object.assign(T.blank(), { buyin: 10000, entries: 20, rebuys: 0, poolPct: 100 });
  assert.equal(T.pool(td), 200000);
  assert.equal(T.house(td), 0);
});

test("chips in play and the average stack follow the rebuys", () => {
  const td = Object.assign(T.blank(), {
    startStack: 2000000, rebuyStack: 3000000, entries: 10, rebuys: 4, players: 8
  });
  assert.equal(T.chips(td), 10 * 2000000 + 4 * 3000000);
  assert.equal(T.avgStack(td), Math.round(T.chips(td) / 8));
  assert.equal(T.avgBB(td, { bb: 10000 }), Math.round(T.avgStack(td) / 10000 * 10) / 10);
  // nobody left is not a division by zero
  assert.equal(T.avgStack(Object.assign({}, td, { players: 0 })), 0);
});

test("places paid tracks the field until the director overrides it", () => {
  const td = Object.assign(T.blank(), { entries: 40, payCurve: 1 });
  T.autoPay(td);
  assert.equal(td.payN, 6, "40 runners should pay 6 (top 15%), got " + td.payN);
  assert.equal(Math.round(td.pay.reduce((a, b) => a + b, 0) * 10) / 10, 100);
  td.payManual = true;
  td.payN = 3;
  T.autoPay(td);
  assert.equal(td.payN, 3, "autoPay overwrote a manual choice");
});

test("registration closing is reported relative to where the clock is", () => {
  const lv = T.buildLevels(T.structById("f9_daily"), 8, 4, 10);
  const regAt = lv.findIndex((l) => l.brk);       // close registration at the first break
  lv[regAt].reg = true;
  assert.equal(T.regInfo(lv, 0).state, "soon");
  assert.equal(T.regInfo(lv, 0).left, 4, "four levels to play before the break");
  assert.equal(T.regInfo(lv, regAt).state, "now");
  assert.equal(T.regInfo(lv, regAt + 1).state, "done");
  const unmarked = T.buildLevels(T.structById("f9_daily"), 4, 0, 0);
  assert.equal(T.regInfo(unmarked, 0), null, "no registration marker means nothing to report");
});

test("the next break and the next playing level skip over breaks", () => {
  const lv = T.buildLevels(T.structById("f9_daily"), 8, 4, 10);
  const brk = lv.findIndex((l) => l.brk);
  assert.equal(T.nextBreakIn(lv, 0).n, 4, "the first break is four levels away");
  assert.equal(T.nextBreakIn(lv, brk).n, 0, "standing on a break is zero away");
  // the level after a break is the next one played, not the break itself
  const nx = T.nextPlayLv(lv, brk - 1);
  assert.ok(nx && !nx.brk, "next playing level landed on a break");
  assert.equal(T.nextBreakIn(lv, lv.length - 1), null, "no break left at the end");
});

test("a broken level is flagged rather than quietly run", () => {
  assert.ok(T.lvBad({ sb: 200, bb: 100, min: 10 }), "small blind above big should be flagged");
  assert.ok(T.lvBad({ sb: 0, bb: 0, min: 10 }), "a zero blind should be flagged");
  assert.ok(T.lvBad({ sb: 100, bb: 200, min: 0 }), "a zero-length level should be flagged");
  assert.ok(!T.lvBad({ sb: 100, bb: 200, min: 20 }), "a good level was flagged");
  assert.ok(!T.lvBad({ brk: true, min: 10, sb: 0, bb: 0 }), "a break is not a broken level");
});

test("the clock formats as minutes and seconds, and never goes negative", () => {
  assert.equal(T.mmss(0), "00:00");
  assert.equal(T.mmss(61000), "01:01");
  assert.equal(T.mmss(20 * 60000), "20:00");
  assert.equal(T.mmss(-5000), "00:00", "an overrun clock must not show a negative time");
});

test("every preset is internally consistent", () => {
  T.TSTRUCT.forEach((s) => {
    assert.ok(s.stack > 0, s.id + " has no starting stack");
    assert.ok(s.min > 0, s.id + " has no level length");
    assert.ok(s.bb > 0 || s.ladder, s.id + " has neither a big blind nor a ladder");
    assert.ok(s.buyin >= 0, s.id + " has a negative buy-in");
    // the starting stack has to be a sane number of big blinds
    const bb = T.blindsAt(s, 1).bb;
    const depth = s.stack / bb;
    assert.ok(depth >= 20 && depth <= 2000,
      `${s.id} starts at ${Math.round(depth)}BB, which is not a real structure`);
  });
});
