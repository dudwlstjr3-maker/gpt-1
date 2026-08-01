# Holdem Studio

A browser-based No-Limit Hold'em study tool: profile your tendencies, replay hands
with street-by-street EV, and drill random spots that are scored against the EV of
every option you could have picked.

`index.html` is the whole app — one self-contained file, no network access, no
build step needed to run it. Open it in a browser (or host it anywhere static) and
it works offline. All data stays in `localStorage`.

**Languages:** English and Korean, switchable in the header and auto-detected from
the browser locale.

---

## The bug this release fixes

The previous version scored almost every drill option as **-EV**. There were three
independent causes, all now fixed and covered by regression tests.

### 1. The villain's range had no bluffs in it

Ranges were narrowed with `filterByStrength(combos, board, keep)` — sort by
absolute made-hand strength and keep the top `keep` fraction. So the villain's
*betting* range was the top 40–68% of his hands by raw strength, with the weak end
thrown away entirely.

A betting range with zero bluffs cannot be profitably called by anything. Worse, it
compounded across streets: a river pot-sized bet left the villain with the top
`0.62 × 0.62 × 0.40 ≈ 15%` of his preflop range, all of it value.

Measured on the old build, this cost hero **21.7 equity points**:

```
hero equity vs villain's full preflop range : 0.480
hero equity vs the strength-filtered range  : 0.263
```

Betting ranges are now **polarised** — a value core plus bluffs drawn from the weak
hands with the best draws, mixed at the equilibrium ratio `s / (P + 2s)` that makes
a bluff-catcher indifferent. Calling ranges are **condensed** around MDF. Opponent
type shifts those ratios rather than truncating the range.

### 2. Three EV formulas paid hero back his own chips

The bet formula was:

```js
eqc * (pot + 2 * X) - (1 - eqc) * X     // wrong
```

If the villain calls a bet of `X` into a pot of `P`, hero wins `P + X` — the pot
plus the villain's call. His own `X` is already his. The `2X` form overstated every
bet by `eqc · X`.

The same error was present in two other branches (hero raising over a bet, and hero
facing a check-raise) and was found by asserting that with the pure nuts every EV
must reduce to exact arithmetic:

```
evRaise: got 54.2944  expected 47.1490   -> overstated by exactly eq·B
evBet  : got 31.8097  expected 30.1826   -> overstated by exactly raised·size
```

`test/engine.test.mjs` now pins all three identities.

### 3. Feedback was loss-only

Every result read `EV 손실 -X BB`, and the running total was hard-coded with a
minus sign, so a perfect session still displayed as a loss. A **correct fold** —
where fold is the best line at 0 EV and everything else is negative — rendered as a
wall of red with no indication you had played it right.

Now: a correct fold is reported as a win with what calling would have cost, a line
that is +EV but not optimal says so, and the running counter shows `0` rather than
`-0`.

### Result

| | before | after |
|---|---|---|
| mean hero equity | 0.385 | 0.465 |
| spots with a +EV line | 88% | 87% |
| **fold is the best answer** | — | 29% of spots facing a bet |
| best-action spread | fold/check dominated | spread across check, bet ×3, call, raise ×2, all-in |

---

## Other changes

**Engine**
- Preflop ranges come from explicit **positional RFI charts** (6-max, 9-max, HU)
  rather than a linear "top X%" slice, so suited wheel aces and suited connectors
  sit where they actually belong. `parseRange()` accepts standard notation
  (`22+ A9s+ A5s-A2s KTs+ AJo+`).
- Fixed a bug where a villain in the big blind was given a top-6% range, because
  the BB has no raise-first-in chart and the lookup fell through to a floor value.
  Scenario ranges now mirror correctly (`open_call` 0.541 / `call_open` 0.454).
- Fixed the equity engine dealing only 2 runout cards regardless of street, which
  made preflop equities evaluate 4-card hands. Validated against known values:
  AA vs KK 81.0%, AKo vs QQ 43.0%, A5s vs KQo 60.6%, and one matchup checked
  against a full C(48,5) enumeration.
- **Common random numbers**: one matchup table per spot holds hero's equity against
  every villain combo, and each option is a re-weighting of it. Option EVs inside a
  spot are therefore exactly comparable rather than differing by Monte-Carlo noise.
- Fold frequency is *derived* from the range model instead of a hand-tuned
  constant, so nits folding more than stations falls out of the model.
- Spots simulate their own earlier streets for both players, so the story shown
  ("flop: villain bet 1.5BB, you called") matches the ranges the EV maths uses.

**App**
- Full i18n layer (en/ko, 378 keys, at parity). Adding a language is a data-only
  change to `src/i18n.js`.
- Light and dark themes; drill keyboard shortcuts (1–9, Enter); difficulty setting;
  a Range Lab with the positional charts and an equity calculator; grading and leak
  detection across drill sessions; JSON export/import.

---

## Layout

```
index.html              built, self-contained — this is the deliverable
src/engine.js           poker maths: evaluator, ranges, equity, EV. No DOM.
src/i18n.js             every user-facing string, plus the quiz question bank
src/app.js              UI: router, views, rendering
src/style.css           styles (light + dark)
src/index.template.html shell the build fills in
build.mjs               inlines src/* into index.html
test/engine.test.mjs    23 node tests — maths, ranges, EV identities
test/ui.test.mjs        13 Playwright tests against the built file
```

## Build and test

```bash
node build.mjs                     # regenerate index.html from src/
node --test test/engine.test.mjs   # engine (no browser needed)
node --test test/ui.test.mjs       # browser smoke tests (needs Playwright)
npm test                           # both
```

Edit files in `src/` and rebuild — do not edit `index.html` by hand.

## What is exact and what is modelled

Stated in-app under Help, and worth repeating:

- **Exact** — pot odds, required equity, SPR, MDF, and the EV arithmetic.
- **Exact** — your hand's equity against a given range: full enumeration of the
  remaining cards, or fixed-seed Monte Carlo when that is too large.
- **Modelled** — the villain's range, and how it splits between value and bluffs.
  This is an approximation with assumptions shown on screen, not solver output.
- **Derived** — recommended actions come from the EV table, not a rule cascade.
  Trust the direction, not the decimal.

This is a study tool. It is not gambling advice.
