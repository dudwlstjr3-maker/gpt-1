/**
 * 쫄탐광장 로그인 — src/server/plaza/authCore.mjs
 * 서명 쿠키 위조 · 만료, 계정 열쇠가 회원번호를 드러내지 않음, 돌아갈 곳은 우리 사이트 안만.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signToken, verifyToken, accountKey, randomState, safeNext } from '../src/server/plaza/authCore.mjs';

const S = 'x'.repeat(40);

test('서명한 것은 읽히고, 한 글자라도 바꾸면 거절', () => {
  const t = signToken({ uid: 'abc', exp: Date.now() + 60_000 }, S);
  assert.equal(verifyToken(t, S).uid, 'abc');
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ uid: 'admin', exp: Date.now() + 60_000 })).toString('base64url');
  assert.equal(verifyToken(`${forged}.${sig}`, S), null);
  assert.equal(verifyToken(`${body}.${sig.slice(0, -2)}AA`, S), null);
  assert.equal(verifyToken(t, 'y'.repeat(40)), null);
  assert.equal(verifyToken('엉터리', S), null);
  assert.equal(verifyToken(t, null), null);
});

test('만료된 것은 거절', () => {
  const t = signToken({ uid: 'abc', exp: 1000 }, S);
  assert.equal(verifyToken(t, S, 2000), null);
  assert.equal(verifyToken(signToken({ uid: 'abc' }, S), S), null); // exp 없음
});

test('계정 열쇠 — 같은 사람은 같은 열쇠, 회원번호가 그대로 드러나지 않음', () => {
  const a = accountKey('kakao', '1234567890', S);
  assert.equal(a, accountKey('kakao', '1234567890', S));
  assert.notEqual(a, accountKey('kakao', '1234567891', S));
  assert.notEqual(a, accountKey('kakao', '1234567890', 'z'.repeat(40)));
  assert.ok(!a.includes('1234567890'));
  assert.match(a, /^[0-9a-f]{40}$/);
});

test('state 는 매번 다름', () => {
  assert.notEqual(randomState(), randomState());
});

test('돌아갈 곳은 우리 사이트 안의 경로만', () => {
  assert.equal(safeNext('/plaza'), '/plaza');
  assert.equal(safeNext('/fng/us#x'), '/fng/us#x');
  for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)', '', null]) {
    assert.equal(safeNext(bad), '/plaza', String(bad));
  }
});
