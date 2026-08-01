/* =============================================================================
 * handrun.js — "whole hand" drill: play one hand from preflop to the river.
 *
 * The single-spot drill judges one frozen moment. This plays the hand out:
 * every street is a real decision scored on its own EV, and at the end you get
 * the villain's likely holdings, what your own line represented, and why each
 * decision should have gone the way it did.
 *
 * The villain is not an opponent AI holding cards — it is the range model
 * acting at its own frequencies, so the ranges shown in the report are exactly
 * the ones the EV maths used. Cards are only dealt to the villain at showdown,
 * drawn from whatever range survived the betting.
 *
 * Money convention, used everywhere below:
 *   run.pot         chips in the middle *before hero acts* (includes any bet
 *                   hero is currently facing)
 *   run.facing.size what hero must put in to continue
 *   opt.amount      what hero commits this street with the chosen action
 * So when hero raises to `amount` against a bet of `facing`, the villain has
 * to add `amount - facing` to call, and the pot becomes
 * `pot + amount + (amount - facing)`.
 * ========================================================================== */
"use strict";

const HandRun = (function () {

  const r1 = (x) => Math.round(x * 10) / 10;

  function start(cfg) {
    const seats = cfg.seats || 6;
    const stack = cfg.stack || 100;
    const seed = cfg.seed === undefined ? (Math.random() * 1e9) | 0 : cfg.seed;
    const rnd = PE.mulberry32(PE.seedFrom(seed));
    const pick = (a) => a[Math.floor(rnd() * a.length)];

    const L = PE.posList(seats);
    const openers = L.filter((p) => p !== "BB" && PE.rfiRange(seats, p).length);
    const vilPos = pick(openers);
    const later = L.filter((p) => L.indexOf(p) > L.indexOf(vilPos));
    const heroPos = later.length ? pick(later) : "BB";

    const vt = PE.VILLAIN_TYPES[cfg.villainType === "random" || !cfg.villainType
      ? pick(Object.keys(PE.VILLAIN_TYPES)) : cfg.villainType] || PE.VILLAIN_TYPES.unknown;

    const openSize = pick([2.2, 2.5, 3]);
    const vilClasses = PE.openRange(seats, vilPos, vt);
    const heroClasses = PE.flatRange(seats, heroPos, vilPos, PE.VILLAIN_TYPES.unknown);
    const hole = PE.drawCombo(heroClasses.length ? heroClasses : PE.topPercentRange(35), [], rnd);
    if (!hole) return null;

    const deck = [];
    for (let c = 0; c < 52; c++) if (c !== hole[0] && c !== hole[1]) deck.push(c);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }

    const heroBlind = PE.blindOf(heroPos);
    let dead = 0;
    const live = [heroPos, vilPos];
    if (live.indexOf("SB") < 0 && live.indexOf("BTN(SB)") < 0) dead += 0.5;
    if (live.indexOf("BB") < 0) dead += 1;

    return {
      seed, seats, stack, rnd, vt, heroPos, vilPos, hole,
      deck, board: [], street: 0, done: false,
      heroClasses, vilClasses, openSize,
      pot: r1(openSize + heroBlind + dead),
      heroInv: heroBlind, vilInv: openSize,
      facing: { size: r1(openSize - heroBlind) },
      ip: PE.isInPosition(seats, heroPos, vilPos),
      history: [],        // villain's actions — replayed to narrow the villain range
      heroHistory: [],    // hero's actions — replayed to build the perceived range
      log: [], result: null, villainHand: null, lastCtx: null
    };
  }

  /** The decision facing hero right now, with an EV on every option. */
  function decision(run) {
    const eff = Math.max(0.5, run.stack - run.heroInv);
    const ctx = PE.buildContext({
      hole: run.hole, board: run.board, villainClasses: run.vilClasses, vt: run.vt,
      ip: run.ip, pot: run.pot, effStack: eff, history: run.history, rnd: run.rnd,
      budget: run.street === 0 ? 90000 : 260000
    });
    run.lastCtx = ctx;
    return { ctx, res: PE.options(ctx, run.facing), eff };
  }

  function choose(run, opt, dec) {
    const evs = dec.res.opts.map((o) => o.ev);
    const bestEv = Math.max.apply(null, evs);
    const bestOpt = dec.res.opts.find((o) => o.ev === bestEv);
    const facing = run.facing ? run.facing.size : 0;

    run.log.push({
      street: run.street, board: run.board.slice(), pot: run.pot, facing,
      mine: opt, best: bestOpt, lost: Math.max(0, bestEv - opt.ev), eq: dec.res.eq,
      combos: dec.ctx.table.combos, weights: dec.ctx.weights
    });

    if (opt.key === "fold") { run.done = true; run.result = "heroFold"; return run; }

    if (opt.label === "bet" || opt.label === "raise" || opt.key === "allin") {
      const villainAdds = Math.max(0.5, opt.amount - facing);
      const rank = dec.ctx.rank;
      const contW = PE.actionWeights(rank, "call", villainAdds, run.pot, run.vt, dec.ctx.weights);
      const before = PE.totalMass(dec.ctx.weights), after = PE.totalMass(contW);
      const foldFreq = before > 0 ? Math.max(0, Math.min(0.97, 1 - after / before)) : 0;

      run.heroHistory.push({ action: "bet", size: opt.amount, pot: run.pot, board: run.board.slice() });
      if (run.rnd() < foldFreq) {
        run.done = true; run.result = "villainFold";
        run.wonPot = run.pot;                       // hero's own bet comes back
        return run;
      }
      run.history.push({ action: "call", size: villainAdds, pot: run.pot, board: run.board.slice() });
      run.pot = r1(run.pot + opt.amount + villainAdds);
      run.heroInv += opt.amount;
      run.vilInv += villainAdds;
    } else if (opt.key === "call") {
      run.heroHistory.push({ action: "call", size: facing, pot: run.pot, board: run.board.slice() });
      // villain's bet is already in run.pot; record it so the range narrows right
      run.history.push({ action: "bet", size: facing, pot: r1(run.pot - facing), board: run.board.slice() });
      run.pot = r1(run.pot + facing);
      run.heroInv += facing;
    } else {
      run.heroHistory.push({ action: "check", size: r1(run.pot * 0.5), pot: run.pot, board: run.board.slice() });
      run.history.push({ action: "check", size: r1(run.pot * 0.5), pot: run.pot, board: run.board.slice() });
    }
    return nextStreet(run);
  }

  function nextStreet(run) {
    if (run.street >= 3) { run.done = true; run.result = "showdown"; return run; }
    const need = run.street === 0 ? 3 : 1;
    for (let i = 0; i < need; i++) run.board.push(run.deck.shift());
    run.street++;
    run.facing = null;

    const eff = Math.max(0, run.stack - run.heroInv);
    if (eff <= 0.5) { run.done = true; run.result = "allin"; return run; }

    // Villain acts first whenever hero has position.
    if (run.ip) {
      const combos = PE.expandRange(run.vilClasses, run.hole.concat(run.board));
      if (!combos.length) return run;
      let weights = new Float64Array(combos.length).fill(1);
      run.history.forEach((h) => {
        const rk = PE.rankRange(combos, h.board);
        weights = PE.actionWeights(rk, h.action, h.size || 0, h.pot || 1, run.vt, weights);
      });
      const rank = PE.rankRange(combos, run.board);
      const u = run.rnd();
      const size = r1(run.pot * (u < 0.45 ? 0.33 : u < 0.8 ? 0.66 : 1));
      const w = PE.actionWeights(rank, "bet", size, run.pot, run.vt, weights);
      const before = PE.totalMass(weights);
      const freq = before > 0 ? PE.totalMass(w) / before : 0;
      if (run.rnd() < freq) {
        const bet = Math.min(size, eff);
        run.facing = { size: bet };
        run.history.push({ action: "bet", size: bet, pot: run.pot, board: run.board.slice() });
        run.pot = r1(run.pot + bet);
        run.vilInv += bet;
      }
    }
    return run;
  }

  /** The villain range as it stands now: combos plus their surviving weights. */
  function villainRange(run) {
    const combos = PE.expandRange(run.vilClasses, run.hole.concat(run.board));
    if (!combos.length) return { combos, weights: new Float64Array(0) };
    let weights = new Float64Array(combos.length).fill(1);
    run.history.forEach((h) => {
      const rk = PE.rankRange(combos, h.board);
      weights = PE.actionWeights(rk, h.action, h.size || 0, h.pot || 1, run.vt, weights);
    });
    return { combos, weights };
  }

  /** Deal the villain a hand at showdown, sampled from the surviving range. */
  function showdown(run) {
    if (run.villainHand) return run.villainHand;
    const { combos, weights } = villainRange(run);
    if (!combos.length) return null;
    let total = 0;
    for (let i = 0; i < combos.length; i++) total += Math.max(0, weights[i]);
    if (total <= 0) { run.villainHand = combos[0]; return run.villainHand; }
    let roll = run.rnd() * total;
    for (let i = 0; i < combos.length; i++) {
      roll -= Math.max(0, weights[i]);
      if (roll <= 0) { run.villainHand = combos[i]; break; }
    }
    if (!run.villainHand) run.villainHand = combos[combos.length - 1];
    return run.villainHand;
  }

  /** Where hero's actual hand sits inside the range his own line represents. */
  function heroStanding(run) {
    const board = run.board;
    if (board.length < 3) return null;
    const per = PE.perceivedRange(run.heroClasses, board, run.heroHistory, run.vt, board);
    if (!per.combos.length) return null;
    const mine = PE.evalHand(run.hole.concat(board));
    let below = 0, total = 0;
    for (let i = 0; i < per.combos.length; i++) {
      const w = per.weights[i];
      if (w <= 0.001) continue;
      total += w;
      const sc = PE.evalHand([per.combos[i][0], per.combos[i][1]].concat(board));
      // Ties count as half, as in equity. Without this, a hand that just plays
      // the board reads as beating 0% of the range when it actually chops.
      if (sc < mine) below += w;
      else if (sc === mine) below += w * 0.5;
    }
    if (!total) return null;
    return { pct: 1 - below / total, perceived: per };   // 0 = strongest in the range
  }

  return { start, decision, choose, nextStreet, villainRange, showdown, heroStanding };
})();
