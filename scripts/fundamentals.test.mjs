/**
 * 재무제표 읽기 단위 테스트.
 *   node --test scripts/fundamentals.test.mjs
 *
 * SEC 원자료의 까다로운 성질(수정 공시·섞인 기간 길이·빠진 4분기)을 재현해
 * 우리가 거기에 넘어가지 않는지 본다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupe, quarterly, annual, instant, yoy, ratio, ttm, valuation, spanDays, trendWord,
} from '../src/lib/fundamentals.mjs';

/** 분기 하나 (start~end 91일) */
const q = (end, val, extra = {}) => {
  const e = Date.parse(`${end}T00:00:00Z`);
  const s = new Date(e - 91 * 86400000).toISOString().slice(0, 10);
  return { start: s, end, val, form: '10-Q', filed: end, fy: Number(end.slice(0, 4)), fp: 'Q1', ...extra };
};
/** 연간 하나 (365일) */
const y = (end, val, extra = {}) => {
  const e = Date.parse(`${end}T00:00:00Z`);
  const s = new Date(e - 364 * 86400000).toISOString().slice(0, 10);
  return { start: s, end, val, form: '10-K', filed: end, fy: Number(end.slice(0, 4)), fp: 'FY', ...extra };
};

test('기간 길이를 잰다 · 시점 값은 null', () => {
  assert.equal(spanDays({ start: '2026-01-01', end: '2026-04-02' }), 91);
  assert.equal(spanDays({ end: '2026-04-02' }), null);
  assert.equal(spanDays(null), null);
});

test('수정 공시가 오면 나중에 접수된 값을 쓴다', () => {
  const raw = [
    q('2026-03-31', 100, { filed: '2026-04-20' }),
    q('2026-03-31', 108, { filed: '2026-10-30' }), // 정정
  ];
  const out = dedupe(raw);
  assert.equal(out.length, 1);
  assert.equal(out[0].value, 108);
});

test('분기·연간·시점을 기간 길이로 갈라 담는다', () => {
  const raw = [
    q('2026-03-31', 100),
    q('2026-06-30', 110),
    y('2025-12-31', 400),
    { end: '2026-06-30', val: 5000, form: '10-Q', filed: '2026-07-20' }, // 시점(재무상태표)
    { start: '2026-01-01', end: '2026-06-30', val: 210, form: '10-Q', filed: '2026-07-20' }, // 6개월 누적
  ];
  assert.equal(quarterly(raw).length, 2);
  assert.equal(annual(raw).length, 1);
  assert.equal(instant(raw).length, 1);
  // 6개월 누적은 어디에도 안 들어간다 — 분기도 연간도 아니다
  assert.ok(!quarterly(raw).some((p) => p.value === 210));
  assert.ok(!annual(raw).some((p) => p.value === 210));
});

test('전년 동기와 견준다 — 직전 분기가 아니다', () => {
  const qs = quarterly([
    q('2025-03-31', 100), q('2025-06-30', 90), q('2025-09-30', 95), q('2025-12-31', 200),
    q('2026-03-31', 130),
  ]);
  const r = yoy(qs);
  assert.equal(r.from.end, '2025-03-31'); // 1년 전 같은 분기
  assert.equal(Math.round(r.pct), 30);
});

test('1년 전 값이 없으면 증감률을 지어내지 않는다', () => {
  assert.equal(yoy(quarterly([q('2026-03-31', 130)])), null);
  assert.equal(yoy([]), null);
  assert.equal(yoy(null), null);
});

test('비율은 같은 기간끼리만 나눈다', () => {
  const rev = quarterly([q('2026-03-31', 1000), q('2026-06-30', 1200)]);
  const op = quarterly([q('2026-06-30', 300)]); // 3월 분기는 없다
  const m = ratio(op, rev);
  assert.equal(m.length, 1);
  assert.equal(m[0].end, '2026-06-30');
  assert.equal(Math.round(m[0].value), 25);
});

test('분모가 0 이면 비율을 내지 않는다', () => {
  assert.equal(ratio(quarterly([q('2026-06-30', 5)]), quarterly([q('2026-06-30', 0)])).length, 0);
});

test('TTM 은 연속한 네 분기라야 한다', () => {
  const ok = quarterly([q('2025-06-30', 10), q('2025-09-30', 11), q('2025-12-31', 12), q('2026-03-31', 13)]);
  assert.equal(ttm(ok).value, 46);

  // 4분기가 빠진 경우 — 작년 것과 이어 붙이면 한 해가 아니다
  const gap = quarterly([q('2025-03-31', 10), q('2025-06-30', 11), q('2025-09-30', 12), q('2026-03-31', 13)]);
  assert.equal(ttm(gap), null);
  assert.equal(ttm(quarterly([q('2026-03-31', 13)])), null);
});

test('PER — 네 분기가 되면 TTM, 아니면 연간, 어느 쪽인지 밝힌다', () => {
  const qs = quarterly([q('2025-06-30', 1), q('2025-09-30', 1), q('2025-12-31', 2), q('2026-03-31', 2)]);
  const a = annual([y('2025-12-31', 5)]);

  const t = valuation(120, qs, a);
  assert.equal(t.basis, 'ttm');
  assert.equal(t.eps, 6);
  assert.equal(t.per, 20);
  assert.match(t.note, /네 분기/);

  const only = valuation(120, quarterly([q('2026-03-31', 2)]), a);
  assert.equal(only.basis, 'annual');
  assert.equal(only.eps, 5);
  assert.equal(only.per, 24);
  assert.match(only.note, /연간/);
});

test('적자면 PER 을 내지 않고 이유를 적는다', () => {
  const v = valuation(120, [], annual([y('2025-12-31', -3)]));
  assert.equal(v.per, null);
  assert.equal(v.eps, -3);
  assert.match(v.note, /적자/);
});

test('주가나 EPS 가 없으면 PER 이 없고 사유가 남는다', () => {
  assert.match(valuation(null, [], annual([y('2025-12-31', 5)])).note, /주가/);
  const none = valuation(120, [], []);
  assert.equal(none.basis, null);
  assert.match(none.note, /주당순이익을 받지 못해/);
});

test('방향은 글자와 기호로도 말한다', () => {
  assert.equal(trendWord(3).glyph, '▲');
  assert.equal(trendWord(-3).glyph, '▼');
  assert.equal(trendWord(0).glyph, '＝');
  assert.equal(trendWord('x'), null);
});
