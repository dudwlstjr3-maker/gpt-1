/**
 * 쫄탐광장 규칙 — src/lib/plazaRules.mjs
 * 닉네임 · 글 거름망, Elo 방식 레이팅, 판 일정(장 시작 마감 · 장 마감 뒤 채점 · 휴장일).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkNickname, checkPost, crowdShare, ratingDelta, outcome, RATING_K, CROWD_PRIOR, POST_MAX,
  dateKeyIn, zonedToUtc, isTradingDay, nextTradingDay, prevTradingDay, roundTimes, roundsAt, closesByDate,
} from '../src/lib/plazaRules.mjs';

const US_HOL = { '2026-11-26': 'Thanksgiving', '2026-12-25': 'Christmas' };
const KR_HOL = { '2026-12-25': '성탄절', '2026-12-31': '연말 휴장' };

test('닉네임 — 2~12자, 한글 · 영문 · 숫자 · 밑줄만, 운영자 사칭 · 욕설 거름', () => {
  assert.deepEqual(checkNickname('  곰돌이_7 '), { ok: true, value: '곰돌이_7' });
  assert.equal(checkNickname('가').ok, false);
  assert.equal(checkNickname('가'.repeat(13)).ok, false);
  assert.equal(checkNickname('곰 돌이').ok, false);
  assert.equal(checkNickname('곰돌이!').ok, false);
  assert.equal(checkNickname('관리자김').ok, false);
  assert.equal(checkNickname('Admin1').ok, false);
  assert.equal(checkNickname('씨발').ok, false);
});

test('글 — 140자까지, 링크 · 리딩방 · 욕설은 받지 않음, 공백은 하나로', () => {
  assert.deepEqual(checkPost('  오늘   조용하네요\n\n'), { ok: true, value: '오늘 조용하네요' });
  assert.equal(checkPost('가').ok, false);
  assert.equal(checkPost('가'.repeat(POST_MAX)).ok, true);
  assert.equal(checkPost('가'.repeat(POST_MAX + 1)).ok, false);
  for (const bad of ['https://a.b 보세요', 'www.x.com', 'naver.com 가세요', 't.me/abc', '리딩방 무료 입장', '오픈 채팅 오세요', '수익 보장합니다', '텔레그램 문의', '시발 장']) {
    assert.equal(checkPost(bad).ok, false, bad);
  }
});

test('기대치 — 고른 쪽에 선 사람의 몫, 양쪽에 미리 깐 표로 튀지 않음', () => {
  assert.equal(crowdShare(0, 0, 'up'), 0.5);
  assert.equal(crowdShare(1, 0, 'up'), (1 + CROWD_PRIOR) / (1 + 2 * CROWD_PRIOR));
  assert.ok(crowdShare(80, 20, 'up') > 0.7 && crowdShare(80, 20, 'down') < 0.3);
});

test('레이팅 — 남들과 반대로 골라 맞히면 크게 오르고, 남들 따라 골랐다 틀리면 크게 깎임', () => {
  // 100명 중 80명이 '오른다'
  const bigWin = ratingDelta('down', 'down', 80, 20);   // 반대로 골라 맞힘
  const smallWin = ratingDelta('up', 'up', 80, 20);     // 따라 골라 맞힘
  const bigLoss = ratingDelta('up', 'down', 80, 20);    // 따라 골랐다 틀림
  const smallLoss = ratingDelta('down', 'up', 80, 20);  // 반대로 골랐다 틀림
  assert.ok(bigWin > smallWin && bigWin > 0 && smallWin > 0);
  assert.ok(bigLoss < smallLoss && smallLoss < 0);
  assert.ok(Math.abs(bigWin) <= RATING_K && Math.abs(bigLoss) <= RATING_K);
  // 아무도 없으면 반반 — ±16
  assert.equal(ratingDelta('up', 'up', 0, 0), RATING_K / 2);
  assert.equal(ratingDelta('up', 'down', 0, 0), -RATING_K / 2);
});

test('사람들의 몫이 맞다면 찍기로 오르지 않음 (기대 변화 0)', () => {
  const ups = 60, downs = 40;
  const p = crowdShare(ups, downs, 'up'); // 이 확률로 오른다고 하면
  for (const pick of ['up', 'down']) {
    const ev = p * ratingDelta(pick, 'up', ups, downs) + (1 - p) * ratingDelta(pick, 'down', ups, downs);
    assert.ok(Math.abs(ev) < 0.1, `${pick} ${ev}`);
  }
});

test('보합 · 무효는 0, 결과는 직전 종가와 비교', () => {
  assert.equal(ratingDelta('up', 'flat', 3, 3), 0);
  assert.equal(ratingDelta('up', 'void', 3, 3), 0);
  assert.equal(outcome(101, 100), 'up');
  assert.equal(outcome(99, 100), 'down');
  assert.equal(outcome(100, 100), 'flat');
  assert.equal(outcome(NaN, 100), null);
});

test('시간대 — 뉴욕 9:30 은 서머타임에 따라 한국시간 22:30 / 23:30', () => {
  assert.equal(new Date(zonedToUtc('2026-07-01', 9, 30, 'America/New_York')).toISOString(), '2026-07-01T13:30:00.000Z');
  assert.equal(new Date(zonedToUtc('2026-11-27', 9, 30, 'America/New_York')).toISOString(), '2026-11-27T14:30:00.000Z');
  assert.equal(new Date(zonedToUtc('2026-11-27', 9, 0, 'Asia/Seoul')).toISOString(), '2026-11-27T00:00:00.000Z');
  assert.equal(dateKeyIn(Date.parse('2026-11-27T00:30:00Z'), 'America/New_York'), '2026-11-26');
  assert.equal(dateKeyIn(Date.parse('2026-11-27T00:30:00Z'), 'Asia/Seoul'), '2026-11-27');
});

test('거래일 — 주말 · 휴장일 건너뜀', () => {
  assert.equal(isTradingDay('2026-11-26', US_HOL), false); // 추수감사절
  assert.equal(isTradingDay('2026-11-28', US_HOL), false); // 토
  assert.equal(nextTradingDay('2026-11-25', US_HOL), '2026-11-27');
  assert.equal(prevTradingDay('2026-11-27', US_HOL), '2026-11-25');
  assert.equal(nextTradingDay('2026-11-27', US_HOL), '2026-11-30');
  assert.equal(nextTradingDay('2026-12-24', KR_HOL), '2026-12-28');
});

test('판 — 장 시작 전엔 그날 판을 받고, 시작하면 다음 거래일 판으로 넘어감', () => {
  // 한국 11/27(금) 08:59 → 그날 판, 09:00 → 다음 월요일 판 + 11/27 진행 중
  const before = Date.parse('2026-11-26T23:59:00Z');
  const after = Date.parse('2026-11-27T00:00:00Z');
  assert.deepEqual(roundsAt(before, 'kospi', KR_HOL), { open: '2026-11-27', running: null });
  assert.deepEqual(roundsAt(after, 'kospi', KR_HOL), { open: '2026-11-30', running: '2026-11-27' });
  // 채점 시각(15:30 + 30분)이 지나면 진행 중 판은 없다
  assert.equal(roundsAt(Date.parse('2026-11-27T07:00:00Z'), 'kospi', KR_HOL).running, null);
  // 미국 추수감사절(11/26) 당일 → 받는 판은 11/27, 진행 중인 판 없음
  assert.deepEqual(roundsAt(Date.parse('2026-11-26T15:00:00Z'), 'spx', US_HOL), { open: '2026-11-27', running: null });
});

test('판 시각 — 마감은 장 시작, 채점은 장 마감 30분 뒤', () => {
  const r = roundTimes('kospi', '2026-11-27');
  assert.equal(new Date(r.cutoff).toISOString(), '2026-11-27T00:00:00.000Z');
  assert.equal(new Date(r.resolveAt).toISOString(), '2026-11-27T07:00:00.000Z');
});

test('종가 표 — 그 도시 날짜로 묶고, 숫자가 아닌 점은 버림', () => {
  const m = closesByDate([
    { t: Date.parse('2026-11-25T14:30:00Z'), v: 100 },
    { t: Date.parse('2026-11-27T14:30:00Z'), v: NaN },
    { t: Date.parse('2026-11-27T14:30:00Z'), v: 101 },
  ], 'America/New_York');
  assert.deepEqual([...m], [['2026-11-25', 100], ['2026-11-27', 101]]);
});
