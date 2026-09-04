/**
 * 국면 전광판 단위 테스트.
 *
 *   node --test scripts/regime.test.mjs
 *
 * 여기서 가장 중요한 검사는 **과장하지 않는가** 다.
 * 전광판은 크게 뜨고 알림으로도 나가기 때문에, 틀린 "20년 만에" 한 줄이
 * 이 앱에서 일어날 수 있는 가장 나쁜 일이다.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BANDS,
  LOOKBACK_YEARS,
  MAX_STALE_DAYS,
  MIN_COVERAGE,
  REGIME_AXES,
  bandFor,
  buildBoard,
  buildHistory,
  percentileOf,
  rarity,
  scoreAt,
} from '../src/lib/regimeRules.mjs';

const DAY = 86_400_000;
/** 엔진이 쓰는 것과 같은 1년. 테스트가 365 를 쓰면 경계에서 하루씩 어긋난다. */
const YEAR = 365.25;
const T0 = Date.UTC(2026, 0, 1);

/** t 일 전 시각 */
const ago = (days) => T0 - days * DAY;

/** 지정한 값으로 days 일치 일별 시계열을 만든다 */
function daily(days, valueAt) {
  const out = [];
  for (let i = days; i >= 0; i -= 1) out.push({ t: ago(i), v: valueAt(i) });
  return out;
}

/** 네 축 모두 15년치가 있는 정상 입력 */
function fullSeries(last = {}) {
  const N = 365 * 15;
  const mk = (base, lastValue) =>
    daily(N, (i) => (i === 0 && lastValue !== undefined ? lastValue : base + ((i * 7919) % 100) / 100));
  return {
    vol: mk(15, last.vol),
    credit: mk(4, last.credit),
    drawdown: mk(-5, last.drawdown),
    trend: mk(2, last.trend),
  };
}

/* ------------------------------ 백분위 ------------------------------ */

test('중간순위 백분위 — 같은 값이 몰려 있어도 0/100 으로 튀지 않는다', () => {
  assert.equal(percentileOf([1, 1, 1, 1], 1), 50);
  assert.equal(percentileOf([0, 10], 10), 75);
  assert.equal(percentileOf([0, 10], 0), 25);
});

test('백분위는 값이 없으면 null', () => {
  assert.equal(percentileOf([], 1), null);
  assert.equal(percentileOf([1, 2], null), null);
  assert.equal(percentileOf([1, 2], NaN), null);
  assert.equal(percentileOf(null, 1), null);
});

/* ------------------------------ 방향 ------------------------------ */

test('공포 지표는 뒤집혀서 들어간다 — VIX 가 높으면 점수가 낮다', () => {
  const calm = scoreAt(fullSeries({ vol: 9 }), T0);
  const panic = scoreAt(fullSeries({ vol: 90 }), T0);
  const v = (r) => r.axes.find((a) => a.id === 'vol').percentile;
  assert.ok(v(panic) < v(calm), `공포 ${v(panic)} 가 평온 ${v(calm)} 보다 낮아야 한다`);
  assert.ok(panic.score < calm.score);
});

test('낙폭은 뒤집지 않는다 — 많이 빠져 있을수록 점수가 낮다', () => {
  const top = scoreAt(fullSeries({ drawdown: 0 }), T0);
  const deep = scoreAt(fullSeries({ drawdown: -55 }), T0);
  const v = (r) => r.axes.find((a) => a.id === 'drawdown').percentile;
  assert.ok(v(deep) < v(top));
});

/* --------------------- 모르는 것을 메우지 않기 --------------------- */

test('축이 둘만 살아 있으면(50%) 점수를 내지 않는다', () => {
  const s = fullSeries();
  delete s.credit;
  delete s.trend;
  const r = scoreAt(s, T0);
  assert.equal(r.score, null);
  assert.ok(r.coverage < MIN_COVERAGE);
  assert.match(r.reason, /70%/);
});

test('축 하나가 빠져도(75%) 남은 것으로 계산한다', () => {
  const s = fullSeries();
  delete s.credit;
  const r = scoreAt(s, T0);
  assert.ok(r.score !== null);
  assert.equal(r.coverage, 0.75);
  // 빠진 축은 0점이 아니라 아예 빠져야 한다
  const credit = r.axes.find((a) => a.id === 'credit');
  assert.equal(credit.percentile, null);
});

test('결측 축을 0점으로 세지 않는다', () => {
  const whole = scoreAt(fullSeries({ credit: 4 }), T0);
  const s = fullSeries();
  delete s.credit;
  const partial = scoreAt(s, T0);
  // 0점으로 셌다면 부분 점수가 전체 점수보다 크게 낮아진다
  assert.ok(Math.abs(partial.score - whole.score) < 30, `${partial.score} vs ${whole.score}`);
});

test('발표가 멈춘 축은 옛 값을 오늘 값처럼 쓰지 않는다', () => {
  const s = fullSeries();
  // credit 의 마지막 관측치를 60일 전으로 잘라낸다
  s.credit = s.credit.filter((p) => p.t <= ago(60));
  const r = scoreAt(s, T0);
  const credit = r.axes.find((a) => a.id === 'credit');
  assert.equal(credit.percentile, null);
  assert.match(credit.reason, /일 전/);
  assert.equal(r.coverage, 0.75);
});

test('MAX_STALE_DAYS 안쪽이면 정상으로 본다', () => {
  const s = fullSeries();
  s.credit = s.credit.filter((p) => p.t <= ago(MAX_STALE_DAYS - 1));
  assert.ok(scoreAt(s, T0).axes.find((a) => a.id === 'credit').percentile !== null);
});

test('10년치가 안 되는 축은 분포를 만들지 않는다', () => {
  const s = fullSeries();
  s.credit = s.credit.filter((p) => p.t >= ago(365 * 3));
  const credit = scoreAt(s, T0).axes.find((a) => a.id === 'credit');
  assert.equal(credit.percentile, null);
  assert.match(credit.reason, /10년/);
});

test('입력이 통째로 망가져도 던지지 않는다', () => {
  for (const bad of [null, undefined, {}, { vol: null }, { vol: 'nope' }, { vol: [{ t: 'x', v: 'y' }] }]) {
    const r = scoreAt(bad, T0);
    assert.equal(r.score, null);
  }
  assert.equal(scoreAt(fullSeries(), NaN).score, null);
});

/* ------------------------- 희소성: 과장 금지 ------------------------- */

const hist = (pairs) => pairs.map(([daysAgo, score]) => ({ t: ago(daysAgo), score }));

test('"N년 만" 은 이보다 낮았던 마지막 날까지의 거리다', () => {
  const r = rarity(hist([[YEAR * 6 + 10, 5], [YEAR * 2, 40], [30, 42]]), 10, T0);
  assert.equal(r.side, 'low');
  assert.match(r.headline, /6년 만의 공포/);
  assert.match(r.text, /2019년 12월/);
  assert.equal(r.notable, true);
});

test('남은 개월은 올림하지 않는다 — 5년 11개월은 "5년 만" 이다', () => {
  // 과장하는 쪽으로 반올림하면 "6년 만" 이 되고, 그게 이 화면에서 제일 나쁜 거짓말이다
  const r = rarity(hist([[YEAR * 6 - 20, 5]]), 10, T0);
  assert.match(r.headline, /5년 만의 공포/);
  assert.ok(!/6년/.test(r.headline));
});

test('기록 전체가 7년뿐이면 "20년 만" 이라고 쓰지 않는다', () => {
  // 지금이 기록상 최저 — 과거에 더 낮았던 날이 없다
  const r = rarity(hist([[YEAR * 7 + 10, 30], [YEAR * 3, 50]]), 5, T0);
  assert.equal(r.sinceT, null);
  assert.match(r.text, /자료가 있는 7년 중 가장 낮습니다/);
  assert.ok(!/20년/.test(r.text), '없는 20년을 주장하면 안 된다');
  assert.ok(!/만에/.test(r.text), '"만에" 는 그런 날이 있었을 때만 쓴다');
});

test('가운데 구간은 희소하다고 말하지 않는다', () => {
  for (const s of [45, 50, 54.9]) {
    const r = rarity(hist([[YEAR * 5, 10]]), s, T0);
    assert.equal(r.side, null);
    assert.equal(r.text, null);
    assert.equal(r.notable, false);
  }
});

test('1년이 안 되는 간격은 크게 띄우지 않는다(notable=false)', () => {
  const near = rarity(hist([[100, 8]]), 10, T0);
  assert.equal(near.notable, false);
  const far = rarity(hist([[YEAR * 3, 8]]), 10, T0);
  assert.equal(far.notable, true);
});

test('과열 쪽도 같은 규칙으로 센다', () => {
  const r = rarity(hist([[YEAR * 4 + 10, 95], [10, 60]]), 90, T0);
  assert.equal(r.side, 'high');
  assert.match(r.headline, /4년 만의 과열/);
  assert.match(r.text, /높았던/);
});

test('과거 기록이 없으면 문장을 만들지 않는다', () => {
  for (const h of [[], null, undefined, 'nope']) {
    const r = rarity(h, 5, T0);
    assert.ok(r === null || r.text === null);
  }
});

/* -------------------------------- 밴드 -------------------------------- */

test('밴드는 시장 상태를 가리키지 사용자의 행동을 가리키지 않는다', () => {
  const banned = ['매수', '매도', '사세요', '파세요', '추천', '기회', '진입', '청산', '익절', '손절'];
  for (const b of BANDS) {
    for (const w of banned) assert.ok(!b.label.includes(w), `밴드 '${b.label}' 에 '${w}' 가 있다`);
    assert.ok(b.glyph && b.glyph.length > 0, `밴드 '${b.label}' 에 글리프가 없다 — 색만으로 뜻을 전할 수 없다`);
  }
});

test('밴드 경계가 빈틈 없이 이어진다', () => {
  assert.equal(bandFor(0).id, 'extreme_fear');
  assert.equal(bandFor(9.9).id, 'extreme_fear');
  assert.equal(bandFor(10).id, 'fear');
  assert.equal(bandFor(100).id, 'extreme_hot');
  assert.equal(bandFor(null), null);
  assert.equal(bandFor(NaN), null);
});

/* ------------------------------- 전광판 ------------------------------- */

test('전광판은 점수를 못 낼 때 사유를 들고 온다', () => {
  const s = fullSeries();
  delete s.credit;
  delete s.trend;
  const b = buildBoard(s, T0, []);
  assert.equal(b.score, null);
  assert.ok(b.unavailableReason.length > 0);
  assert.equal(b.rarity, null);
});

test('전광판에 등급·판정 같은 필드가 생기지 않는다', () => {
  const b = buildBoard(fullSeries(), T0, []);
  const keys = Object.keys(b).sort();
  assert.deepEqual(keys, ['asOf', 'axes', 'band', 'coverage', 'lookbackYears', 'rarity', 'score', 'unavailableReason']);
  assert.ok(!('action' in b) && !('signal' in b) && !('verdict' in b));
});

test('축 가중치 합은 100 이고 되돌아보는 기간은 20년이다', () => {
  assert.equal(REGIME_AXES.reduce((s, a) => s + a.weight, 0), 100);
  assert.equal(LOOKBACK_YEARS, 20);
});

test('과거 곡선은 미래를 보지 않는다', () => {
  const s = fullSeries();
  const h = buildHistory(s, ago(365 * 3), T0, 30);
  assert.ok(h.length > 30);
  // 같은 시점을 따로 계산해도 같은 값이 나와야 한다 (그 시점까지의 자료만 썼다는 뜻)
  const mid = h[10];
  assert.equal(scoreAt(s, mid.t).score, mid.score);
});
