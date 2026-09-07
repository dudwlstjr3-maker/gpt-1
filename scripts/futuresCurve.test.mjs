/**
 * 인도월 곡선 읽기 단위 테스트.
 *   node --test scripts/futuresCurve.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { curveShape, contractLabel, FLAT_PCT } from '../src/lib/futuresCurve.mjs';

const mk = (...vals) => vals.map((value, i) => ({ n: i + 1, value }));

test('먼 달이 비싸면 콘탱고', () => {
  const r = curveShape(mk(70, 71, 72, 73));
  assert.equal(r.shape, 'contango');
  assert.equal(r.label, '콘탱고');
  assert.ok(r.spreadPct > 0);
  assert.equal(r.months, 3);
  assert.match(r.meaning, /3개월 뒤/);
});

test('가까운 달이 비싸면 백워데이션', () => {
  const r = curveShape(mk(73, 72, 71, 70));
  assert.equal(r.shape, 'backwardation');
  assert.ok(r.spreadPct < 0);
  assert.match(r.meaning, /모자란다/);
});

test('문턱보다 작은 차이는 평평으로 읽는다', () => {
  const r = curveShape(mk(100, 100.1, 100.2, 100.3));
  assert.ok(Math.abs(r.spreadPct) < FLAT_PCT);
  assert.equal(r.shape, 'flat');
  assert.equal(r.glyph, '＝');
});

test('순서가 뒤섞여 와도 인도월 번호로 정렬한다', () => {
  const a = curveShape([{ n: 4, value: 73 }, { n: 1, value: 70 }, { n: 3, value: 72 }, { n: 2, value: 71 }]);
  assert.equal(a.near, 70);
  assert.equal(a.far, 73);
  assert.equal(a.shape, 'contango');
});

test('계약이 하나뿐이면 모양을 지어내지 않는다', () => {
  assert.equal(curveShape(mk(70)), null);
  assert.equal(curveShape([]), null);
  assert.equal(curveShape(null), null);
  assert.equal(curveShape(undefined), null);
});

test('숫자가 아닌 값은 빼고 읽는다', () => {
  const r = curveShape([{ n: 1, value: 70 }, { n: 2, value: null }, { n: 3, value: 'x' }, { n: 4, value: 74 }]);
  assert.equal(r.near, 70);
  assert.equal(r.far, 74);
  assert.equal(r.months, 3);
});

test('근월물이 0 이면 비율을 낼 수 없어 null', () => {
  assert.equal(curveShape([{ n: 1, value: 0 }, { n: 2, value: 5 }]), null);
});

test('계약 이름은 근월 · +n개월', () => {
  assert.equal(contractLabel(1), '근월');
  assert.equal(contractLabel(2), '+1개월');
  assert.equal(contractLabel(4), '+3개월');
  assert.equal(contractLabel(0), '');
  assert.equal(contractLabel('x'), '');
});
