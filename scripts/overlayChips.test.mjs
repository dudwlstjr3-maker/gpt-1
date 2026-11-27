/**
 * 홈 쫄탐 카드의 두 칩 문구 — src/lib/overlayChips.mjs
 * 앱과 미리보기가 같은 함수를 쓴다. 값이 없으면 '산출 불가', 위/아래는 말로도 적는다.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overlayChips } from '../src/lib/overlayChips.mjs';

const trend = (above, gapPct, maDays = 252) => ({ name: 'S&P 500', maDays, above, gapPct });
const vix = (value, high) => ({ threshold: 35, value, high });

test('지금 값 묶음이 없으면 칩 줄을 그리지 않는다', () => {
  assert.equal(overlayChips(null), null);
  assert.equal(overlayChips(undefined), null);
});

test('평균선 위 — 기호와 말 · 떨어진 정도', () => {
  const [t] = overlayChips({ trend: trend(true, 4.2), vix: null });
  assert.equal(t.glyph, '▲');
  assert.equal(t.label, '추세 · 252거래일');
  assert.equal(t.value, '1년선 위');
  assert.equal(t.sub, '+4.2%');
  assert.match(t.aria, /S&P 500 가격이 1년\(252거래일\) 평균선보다 4\.2% 위/);
});

test('평균선 아래는 음수로 · 말로도 아래', () => {
  const [t] = overlayChips({ trend: trend(false, -3.1), vix: null });
  assert.equal(t.glyph, '▼');
  assert.equal(t.value, '1년선 아래');
  assert.equal(t.sub, '-3.1%');
  assert.match(t.aria, /아래$/);
});

test('VIX — 값과 기준 35 위아래', () => {
  const [, low] = overlayChips({ trend: null, vix: vix(15.2, false) });
  assert.equal(low.value, '15.2');
  assert.equal(low.sub, '35 아래');
  const [, high] = overlayChips({ trend: null, vix: vix(38, true) });
  assert.equal(high.value, '38.0');
  assert.equal(high.sub, '35 이상');
});

test('한쪽이 없으면 그쪽만 산출 불가 — 0 이나 위로 채우지 않는다', () => {
  const [t, v] = overlayChips({ trend: trend(null, null), vix: null });
  assert.equal(t.value, '산출 불가');
  assert.equal(t.glyph, null);
  assert.equal(t.sub, null);
  assert.equal(v.value, '산출 불가');
});

test('사고팔 말을 쓰지 않는다', () => {
  const chips = overlayChips({ trend: trend(false, -8), vix: vix(40, true) });
  const text = chips.map((c) => [c.label, c.value, c.sub, c.aria].join(' ')).join(' ');
  assert.doesNotMatch(text, /매수|매도|사세요|파세요|신호|추천/);
});

test('1년이 아닌 길이면 거래일 수로 적음', () => {
  const [t] = overlayChips({ trend: trend(true, 1, 200), vix: null });
  assert.equal(t.value, '200일선 위');
  assert.match(t.aria, /200거래일 평균선/);
});
