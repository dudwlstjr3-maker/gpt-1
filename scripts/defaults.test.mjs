import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upgradeDefault } from '../src/lib/defaults.mjs';

const OLD = ['spx', 'kospi', 'btc', 'usdkrw', 'vix'];
const NEW = ['spx', 'ndx', 'kospi', 'usdkrw', 'vix'];

test('옛 기본값을 그대로 쓰던 사람은 새 기본값으로 옮긴다', () => {
  assert.deepEqual(upgradeDefault([...OLD], OLD, NEW), NEW);
});

test('한 항목이라도 뺀 사람은 건드리지 않는다', () => {
  const mine = ['spx', 'kospi', 'usdkrw', 'vix'];
  assert.deepEqual(upgradeDefault(mine, OLD, NEW), mine);
});

test('한 항목이라도 더한 사람은 건드리지 않는다 — 비트코인을 일부러 넣었을 수 있다', () => {
  const mine = [...OLD, 'eth'];
  assert.deepEqual(upgradeDefault(mine, OLD, NEW), mine);
});

test('순서만 바꾼 사람도 고른 것이다', () => {
  const mine = ['btc', 'spx', 'kospi', 'usdkrw', 'vix'];
  assert.deepEqual(upgradeDefault(mine, OLD, NEW), mine);
});

test('비워 둔 것도 고른 것이다 — 빈 목록을 기본값으로 채우지 않는다', () => {
  assert.deepEqual(upgradeDefault([], OLD, NEW), []);
});

test('이미 새 기본값이면 그대로 — 여러 번 불러도 같다', () => {
  const once = upgradeDefault([...OLD], OLD, NEW);
  assert.deepEqual(upgradeDefault(once, OLD, NEW), NEW);
});

test('새 기본값을 돌려줄 때 원본 배열을 함께 쓰지 않는다', () => {
  const out = upgradeDefault([...OLD], OLD, NEW);
  out.push('x');
  assert.deepEqual(NEW, ['spx', 'ndx', 'kospi', 'usdkrw', 'vix']);
});
