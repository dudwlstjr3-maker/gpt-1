/**
 * 쫄탐광장 화면 문구 — src/lib/plazaText.mjs (앱과 미리보기가 같이 쓴다)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../src/lib/plazaText.mjs';

test('날짜 · 한국시간', () => {
  assert.equal(T.plazaDay('2026-11-27'), '11월 27일(금)');
  assert.equal(T.plazaKst('2026-11-27T14:30:00.000Z'), '11월 27일 23:30');
});

test('고른 쪽 · 결과는 기호와 말로 — 사고팔라는 말 없음', () => {
  assert.equal(T.plazaPick('up'), '▲ 오른다');
  assert.equal(T.plazaPick('down'), '▼ 내린다');
  assert.match(T.plazaResult('flat'), /보합/);
  assert.match(T.plazaResult('void'), /무효/);
  const all = [T.plazaPick('up'), T.plazaPick('down'), ...['up', 'down', 'flat', 'void'].map(T.plazaResult), ...T.plazaRatingHelp({ ratingStart: 1000, k: 32, minPlayed: 5 }),
    T.PLAZA_LEDE, T.PLAZA_POST_NOTE, T.PLAZA_FOOT, T.PLAZA_MEMORY_NOTE].join(' ');
  // "사라져요" 는 지시가 아니다 — 사라 뒤에 끝맺음이 오는 경우만 본다
  assert.doesNotMatch(all, /매수|매도|사세요|파세요|사라[!.\s]|팔라|수익/);
});

test('사람들 몫은 합이 100, 아무도 없으면 0', () => {
  assert.deepEqual(T.plazaCrowd(1, 2), { up: 33, down: 67, n: 3 });
  assert.deepEqual(T.plazaCrowd(0, 0), { up: 0, down: 0, n: 0 });
});

test('적중 · 부호 · 지난 시각', () => {
  assert.equal(T.plazaAccuracy(8, 12), '12판 8번 맞힘 · 67%');
  assert.equal(T.plazaAccuracy(0, 0), '아직 결과 없음');
  assert.equal(T.plazaSigned(12.34), '+12.3');
  assert.equal(T.plazaSigned(-4), '-4.0');
  assert.equal(T.plazaChange(0.01), '+0.01%');
  assert.equal(T.plazaChange(-0.37), '-0.37%');
  const now = Date.parse('2026-11-26T12:00:00Z');
  assert.equal(T.plazaAgo('2026-11-26T11:59:30Z', now), '방금');
  assert.equal(T.plazaAgo('2026-11-26T11:37:00Z', now), '23분 전');
  assert.equal(T.plazaAgo('2026-11-26T09:00:00Z', now), '3시간 전');
  assert.equal(T.plazaAgo('2026-11-24T09:00:00Z', now), '11월 24일');
});
