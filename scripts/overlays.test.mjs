/**
 * 쫄탐지수에 겹쳐 보는 두 가지 — src/lib/overlays.mjs
 * 추세(200일 평균선 위/아래)와 VIX 35. 둘 다 사실 표시이지 매매 신호가 아니다.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movingAverage, belowMaSpans, thresholdSpans, trendNow, vixNow, TREND_MA_DAYS, VIX_HIGH } from '../src/lib/overlays.mjs';

const D = 86_400_000;
const series = (vals) => vals.map((v, i) => ({ t: i * D, v }));

test('기본값은 200일 평균선 · VIX 35', () => {
  assert.equal(TREND_MA_DAYS, 200);
  assert.equal(VIX_HIGH, 35);
});

test('이동평균은 n 일이 모인 뒤부터 낸다 — 앞자리를 0 으로 채우지 않는다', () => {
  const ma = movingAverage(series([1, 2, 3, 4, 5]), 3);
  assert.deepEqual(ma.map((r) => r.ma), [2, 3, 4]);
  assert.equal(ma[0].t, 2 * D);
  assert.deepEqual(movingAverage(series([1, 2]), 3), []);
});

test('평균선 아래 구간을 첫날~마지막날로 묶는다', () => {
  // 3일 평균: [10,10,10]=10 → 위, 7 → 평균 9 아래, 6 → 평균 7.67 아래, 12 → 평균 8.33 위
  const spans = belowMaSpans(series([10, 10, 10, 7, 6, 12]), 3);
  assert.deepEqual(spans, [{ from: 3 * D, to: 4 * D }]);
});

test('끝까지 아래면 마지막 구간도 닫는다', () => {
  const spans = belowMaSpans(series([10, 10, 10, 8, 7]), 3);
  assert.deepEqual(spans, [{ from: 3 * D, to: 4 * D }]);
});

test('기준 이상인 날들을 구간으로 — 기준과 같은 값은 넘은 것으로 본다', () => {
  const spans = thresholdSpans(series([18, 31, 35, 29, 30, 22]), 30);
  assert.deepEqual(spans, [{ from: 1 * D, to: 2 * D }, { from: 4 * D, to: 4 * D }]);
});

test('결측(NaN · null)은 건너뛰고 메우지 않는다', () => {
  const pts = [{ t: 0, v: 31 }, { t: D, v: NaN }, { t: 2 * D, v: null }, { t: 3 * D, v: 33 }];
  assert.deepEqual(thresholdSpans(pts, 30), [{ from: 0, to: 3 * D }]);
});

test('지금 추세 — 평균선 위/아래와 떨어진 정도(%)', () => {
  const up = trendNow(series([10, 10, 10, 11]), 3); // 평균 10.33, 값 11 → +6.5%
  assert.equal(up.above, true);
  assert.equal(up.gapPct, 6.5);
  const down = trendNow(series([10, 10, 10, 9]), 3); // 평균 9.67, 값 9 → -6.9%
  assert.equal(down.above, false);
  assert.equal(down.gapPct, -6.9);
});

test('날이 모자라면 추세는 모름 (null) — 위라고도 아래라고도 하지 않는다', () => {
  assert.deepEqual(trendNow(series([10, 11]), 3), { above: null, gapPct: null, ma: null, t: null });
  assert.deepEqual(trendNow([], 3).above, null);
});

test('지금 VIX — 값과 기준(기본 35)을 넘었는지', () => {
  assert.deepEqual(vixNow(series([20, 36.26])), { value: 36.3, high: true, t: D });
  assert.equal(vixNow(series([34.99])).high, false);
  assert.equal(vixNow(series([35])).high, true);
  assert.deepEqual(vixNow([]), { value: null, high: null, t: null });
});
