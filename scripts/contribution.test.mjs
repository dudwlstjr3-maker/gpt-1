/**
 * 심리 상세 '점수 상승·하락 기여도' 의 몫(%) — src/lib/contribution.mjs
 *
 * 왜 있나: "+0.72" "+2.06" 같은 점수 숫자만 있어 읽기 어려웠다(사용자: "0.## 이라는 숫자를 보고 이해를 못하겠네").
 * 이제 "오늘 움직인 크기 가운데 이 지표가 맡은 몫" 을 %로 보인다.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contributionShares } from '../src/lib/contribution.mjs';

const DEMO = [0.72, 0, 0.67, 0.32, 2.06, 0.99, 0.73]; // 미국 DEMO 하루 (합 +5.49)

test('DEMO 하루 — 시장 변동성이 오늘 움직임의 38%', () => {
  const r = contributionShares(DEMO);
  assert.deepEqual(r.rows.map((x) => x.text), ['13%', '0%', '12%', '6%', '38%', '18%', '13%']);
  assert.equal(r.net, 5.5);
  assert.equal(r.moved, true);
});

test('몫을 모두 더하면 100% (반올림 전)', () => {
  for (const vals of [DEMO, [3, -1], [-0.2, -0.3, 0.1, 4], [0.001, 9.999]]) {
    const sum = contributionShares(vals).rows.reduce((a, x) => a + (x.share ?? 0), 0);
    assert.ok(Math.abs(sum - 100) < 1e-9, `${vals} → ${sum}`);
  }
});

test('오르내림이 섞인 날에도 0~100% 안 — 순변화로 나누지 않는다', () => {
  const r = contributionShares([3, -1]); // 순변화 +2 로 나누면 150% · −50% 가 된다
  assert.deepEqual(r.rows.map((x) => [x.text, x.dir]), [['75%', 1], ['25%', -1]]);
  assert.equal(r.net, 2);
});

test('결측은 0 으로 채우지 않고 분모에서도 뺀다', () => {
  const r = contributionShares([1, null, 3, undefined, Number.NaN]);
  assert.deepEqual(r.rows.map((x) => x.text), ['25%', '결측', '75%', '결측', '결측']);
  assert.equal(r.rows[1].share, null);
});

test('아무것도 안 움직였으면 모두 0% · moved=false', () => {
  const r = contributionShares([0, 0, null]);
  assert.deepEqual(r.rows.map((x) => x.text), ['0%', '0%', '결측']);
  assert.equal(r.moved, false);
  assert.equal(r.net, 0);
});

test('아주 작은 몫은 0% 가 아니라 <1%', () => {
  const r = contributionShares([0.001, 9.999]);
  assert.equal(r.rows[0].text, '<1%');
  assert.equal(r.rows[1].text, '100%');
});
