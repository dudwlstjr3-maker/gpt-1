/**
 * 불타는 것 · 얼어붙은 것 단위 테스트.
 *   node --test scripts/heatRank.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dailySigma, heatOf, pickHeat, HEAT_WORD, withinCap } from '../src/lib/heatRank.mjs';

/** 하루 step% 씩 번갈아 오르내리는 선 — 평소 폭이 대략 step 이 된다 */
const wobble = (n, step, base = 100) => {
  const out = [];
  let v = base;
  for (let i = 0; i < n; i += 1) { out.push({ t: i, v }); v *= 1 + (i % 2 ? step : -step) / 100; }
  return out;
};
const quote = (id, changePct, spark, extra = {}) => ({ id, name: id, price: 100, changePct, spark, ...extra });

test('평소 하루 변동폭을 낸다', () => {
  const sd = dailySigma(wobble(31, 2));
  assert.ok(sd > 1 && sd < 3, `sd=${sd}`);
});

test('표본이 모자라면 재지 않는다', () => {
  assert.equal(dailySigma(wobble(5, 2)), null);
  assert.equal(dailySigma([]), null);
  assert.equal(dailySigma(null), null);
});

test('한 줄로 평평한 선은 평소 폭이 0 이라 재지 않는다', () => {
  assert.equal(dailySigma(Array.from({ length: 31 }, (_, i) => ({ t: i, v: 100 }))), null);
});

test('평소의 몇 배인지로 말이 정해진다', () => {
  assert.equal(heatOf(1, 1).word, HEAT_WORD[1].up);      // 1배
  assert.equal(heatOf(2.5, 1).word, HEAT_WORD[2].up);    // 2.5배
  assert.equal(heatOf(4, 1).word, HEAT_WORD[3].up);      // 4배
  assert.equal(heatOf(0.5, 1).word, HEAT_WORD[0].up);    // 0.5배
  assert.equal(heatOf(-4, 1).word, HEAT_WORD[3].down);
  assert.equal(heatOf(-0.5, 1).word, HEAT_WORD[0].down);
});

test('세기는 0~1 을 넘지 않는다', () => {
  assert.equal(heatOf(100, 1).strength, 1);
  assert.ok(heatOf(0.3, 1).strength < 0.2);
});

test('평소 폭을 모르면 배수를 지어내지 않는다', () => {
  assert.equal(heatOf(5, null), null);
  assert.equal(heatOf(5, 0), null);
  assert.equal(heatOf(null, 1), null);
});

test('작은 %가 큰 %보다 유별날 수 있다 — 이게 이 계산의 핵심이다', () => {
  const 삼성 = heatOf(1.5, 0.75);   // 평소 0.75% 움직이던 것이 1.5%
  const 리플 = heatOf(8.8, 5.32);   // 평소 5.32% 움직이던 것이 8.8%
  assert.ok(삼성.times > 리플.times, `${삼성.times} > ${리플.times}`);
  assert.equal(삼성.level, 2);
  assert.equal(리플.level, 1);
});

test('가장 많이 오른 것과 내린 것을 고른다', () => {
  const r = pickHeat([
    quote('a', 3, wobble(31, 1)),
    quote('b', -2, wobble(31, 1)),
    quote('c', 0.5, wobble(31, 1)),
  ]);
  assert.equal(r.top.quote.id, 'a');
  assert.equal(r.bottom.quote.id, 'b');
  assert.equal(r.top.slot, '가장 많이 오른 것');
  assert.equal(r.bottom.slot, '가장 많이 내린 것');
  assert.equal(r.bottom.note, null);
  assert.equal(r.count, 3);
});

test('다 오른 날에는 내렸다고 말하지 않는다', () => {
  const r = pickHeat([quote('a', 8, wobble(31, 1)), quote('b', 2, wobble(31, 1))]);
  assert.equal(r.bottom.slot, '가장 덜 오른 것');
  assert.match(r.bottom.note, /내린 것이 하나도 없습니다/);
  assert.equal(r.bottom.heat.up, true, '오른 것이므로 불 쪽이어야 한다');
});

test('다 내린 날에는 올랐다고 말하지 않는다', () => {
  const r = pickHeat([quote('a', -2, wobble(31, 1)), quote('b', -8, wobble(31, 1))]);
  assert.equal(r.top.slot, '가장 덜 내린 것');
  assert.match(r.top.note, /오른 것이 하나도 없습니다/);
  assert.equal(r.top.heat.up, false);
});

test('값이 없는 종목은 아예 빼고 고른다', () => {
  const r = pickHeat([
    quote('a', 3, wobble(31, 1)),
    { id: 'x', name: 'x', price: null, changePct: null, spark: [] },
    quote('b', -1, wobble(31, 1)),
  ]);
  assert.equal(r.count, 2);
  assert.ok(!['x'].includes(r.top.quote.id) && !['x'].includes(r.bottom.quote.id));
});

test('고를 것이 둘도 안 되면 판을 만들지 않는다', () => {
  assert.equal(pickHeat([quote('a', 3, wobble(31, 1))]), null);
  assert.equal(pickHeat([]), null);
  assert.equal(pickHeat(null), null);
});

test('지나온 값이 모자란 종목도 자리에는 오르되 배수는 비운다', () => {
  const r = pickHeat([quote('a', 9, []), quote('b', -3, wobble(31, 1))]);
  assert.equal(r.top.quote.id, 'a');
  assert.equal(r.top.heat, null, '못 재면 null 이어야 한다');
  assert.equal(r.top.sigma, null);
  assert.ok(r.bottom.heat);
});

test('사라·팔라로 읽히는 낱말을 쓰지 않는다', () => {
  const words = Object.values(HEAT_WORD).flatMap((v) => [v.up, v.down]);
  for (const w of words) assert.doesNotMatch(w, /(매수|매도|사세요|파세요|대박|폭등|기회|추천|수익)/, w);
  assert.equal(words.length, 8);
});

/* ---------------- 시총 순위로 거르기 ---------------- */

test('순위를 모르면 그대로 둔다', () => {
  assert.equal(withinCap({ capRank: null }), true);
  assert.equal(withinCap({}), true);
  assert.equal(withinCap(undefined), true);
});

test('300위 안쪽만 후보다', () => {
  assert.equal(withinCap({ capRank: 1 }), true);
  assert.equal(withinCap({ capRank: 300 }), true);
  assert.equal(withinCap({ capRank: 301 }), false);
  assert.equal(withinCap({ capRank: 4210 }), false);
});

test('순위 밖인 것은 고르지 않는다', () => {
  const q = (id, pct, rank) => ({
    id, name: id, price: 100, changePct: pct, capRank: rank,
    spark: Array.from({ length: 20 }, (_, i) => ({ t: i, v: 100 + (i % 3) })),
  });
  // 잡주가 +40% 로 제일 크게 움직였지만 순위 밖이라 빠진다
  const board = pickHeat([q('잡주', 40, 4210), q('큰주', 3, 12), q('작은하락', -5, 900), q('큰하락', -2, 40)]);
  assert.equal(board.count, 2);
  assert.equal(board.top.quote.id, '큰주');
  assert.equal(board.bottom.quote.id, '큰하락');
});

test('기준을 바꿔 부를 수 있다', () => {
  const q = (id, pct, rank) => ({
    id, name: id, price: 100, changePct: pct, capRank: rank,
    spark: Array.from({ length: 20 }, (_, i) => ({ t: i, v: 100 + (i % 3) })),
  });
  const wide = pickHeat([q('a', 5, 10), q('b', -5, 900)], { maxCapRank: 1000 });
  assert.equal(wide.count, 2);
});
