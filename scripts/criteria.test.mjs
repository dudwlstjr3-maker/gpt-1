/**
 * 내 기준 판정 로직 단위 테스트.
 *
 *   node --test scripts/criteria.test.mjs
 *
 * 가장 중요한 검사는 **모르는 것을 충족으로 세지 않는가** 다.
 * 결측을 유리하게 세면 "5개 중 5개 충족" 이 거짓이 되고, 그게 이 화면에서
 * 일어날 수 있는 가장 나쁜 일이다.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { describe, evaluate, numOrNull, summarize } from '../src/lib/criteriaRules.mjs';

/** 실제 스냅샷과 같은 모양의 최소 픽스처 */
const SNAP = {
  sections: {
    fng: {
      data: [
        { market: 'us', score: 25.3 },
        { market: 'crypto', score: 78.3 },
        { market: 'kr', score: null, unavailableReason: '구성요소가 부족해 산출할 수 없습니다.' },
      ],
    },
    risk: {
      data: {
        indicators: [
          { id: 'vix', value: 11.552, level: 'calm' },
          { id: 'hy_oas', value: 3.92, level: 'watch' },
          { id: 'us_spread_10_2', value: 10.28, level: 'watch' },
          { id: 'ust10', value: 4.38, level: 'normal' },
          { id: 'usdkrw', value: 1334.95, level: 'normal' },
          { id: 'funding', value: 0.0378, level: 'alert' },
        ],
      },
    },
  },
};

/* ------------------------------ 기본 판정 ------------------------------ */

test('심리 점수 조건을 값으로 판정한다', () => {
  assert.deepEqual(
    evaluate({ id: 'a', kind: 'fng', market: 'us', comparator: 'lte', value: 30 }, SNAP),
    { status: 'met', actual: 25.3 },
  );
  assert.deepEqual(
    evaluate({ id: 'b', kind: 'fng', market: 'us', comparator: 'gte', value: 30 }, SNAP),
    { status: 'unmet', actual: 25.3 },
  );
});

test('경계값은 이상·이하에 포함된다', () => {
  const snap = { sections: { fng: { data: [{ market: 'us', score: 30 }] } } };
  assert.equal(evaluate({ kind: 'fng', market: 'us', comparator: 'gte', value: 30 }, snap).status, 'met');
  assert.equal(evaluate({ kind: 'fng', market: 'us', comparator: 'lte', value: 30 }, snap).status, 'met');
});

test('위험 신호등에서 특정 단계 개수를 센다', () => {
  const r = evaluate({ kind: 'risk_count', level: 'watch', comparator: 'lte', value: 2 }, SNAP);
  assert.equal(r.actual, 2);
  assert.equal(r.status, 'met');

  const alert = evaluate({ kind: 'risk_count', level: 'alert', comparator: 'lte', value: 0 }, SNAP);
  assert.equal(alert.actual, 1);
  assert.equal(alert.status, 'unmet');
});

test('개별 위험 지표 값으로 판정한다', () => {
  const r = evaluate({ kind: 'risk_value', indicatorId: 'vix', comparator: 'lte', value: 20 }, SNAP);
  assert.equal(r.actual, 11.552);
  assert.equal(r.status, 'met');
});

/* --------------------- 모르는 것을 충족으로 세지 않기 --------------------- */

test('산출 불가인 심리 점수는 unknown 이고 그 사유를 들고 온다', () => {
  const r = evaluate({ kind: 'fng', market: 'kr', comparator: 'lte', value: 100 }, SNAP);
  assert.equal(r.status, 'unknown');
  assert.equal(r.actual, null);
  assert.equal(r.reason, '구성요소가 부족해 산출할 수 없습니다.');
});

test('점수가 null 일 때 0 으로 읽지 않는다', () => {
  // 0 으로 읽으면 "30 이하" 가 참이 되어 조건이 충족된 것처럼 보인다
  const r = evaluate({ kind: 'fng', market: 'kr', comparator: 'lte', value: 30 }, SNAP);
  assert.notEqual(r.status, 'met');
  assert.equal(r.status, 'unknown');
});

test('없는 시장·지표는 unknown', () => {
  assert.equal(evaluate({ kind: 'fng', market: 'jp', comparator: 'lte', value: 50 }, SNAP).status, 'unknown');
  assert.equal(
    evaluate({ kind: 'risk_value', indicatorId: 'nope', comparator: 'lte', value: 1 }, SNAP).status,
    'unknown',
  );
});

test('값이 없는 지표는 unknown 이고 사유를 그대로 전한다', () => {
  const snap = {
    sections: { risk: { data: { indicators: [{ id: 'vkospi', value: null, level: 'unknown', unavailableReason: 'KRX 유료 데이터입니다.' }] } } },
  };
  const r = evaluate({ kind: 'risk_value', indicatorId: 'vkospi', comparator: 'lte', value: 20 }, snap);
  assert.equal(r.status, 'unknown');
  assert.equal(r.reason, 'KRX 유료 데이터입니다.');
});

test("단계를 못 매긴 지표는 개수에 넣지 않는다", () => {
  const snap = {
    sections: { risk: { data: { indicators: [
      { id: 'a', value: 1, level: 'alert' },
      { id: 'b', value: null, level: 'unknown' },
    ] } } },
  };
  // '주의' 는 하나뿐. unknown 을 세면 안 된다.
  assert.equal(evaluate({ kind: 'risk_count', level: 'alert', comparator: 'gte', value: 1 }, snap).actual, 1);
});

test('스냅샷이 통째로 없어도 던지지 않고 unknown', () => {
  for (const snap of [null, undefined, {}, { sections: {} }]) {
    const r = evaluate({ kind: 'fng', market: 'us', comparator: 'lte', value: 30 }, snap);
    assert.equal(r.status, 'unknown', JSON.stringify(snap));
  }
});

test('조건 자체가 망가져 있으면 unknown', () => {
  for (const c of [null, undefined, {}, { kind: 'fng' }, { kind: 'nope', comparator: 'gte', value: 1 },
    { kind: 'fng', market: 'us', comparator: 'eq', value: 1 },
    { kind: 'fng', market: 'us', comparator: 'gte', value: 'many' },
    { kind: 'fng', market: 'us', comparator: 'gte', value: NaN }]) {
    assert.equal(evaluate(c, SNAP).status, 'unknown', JSON.stringify(c));
  }
});

/* -------------------------------- 요약 -------------------------------- */

test('요약은 등급이 아니라 개수만 낸다', () => {
  const sum = summarize(
    [
      { kind: 'fng', market: 'us', comparator: 'lte', value: 30 },      // met
      { kind: 'fng', market: 'crypto', comparator: 'lte', value: 30 },  // unmet
      { kind: 'fng', market: 'kr', comparator: 'lte', value: 30 },      // unknown
    ],
    SNAP,
  );
  assert.equal(sum.total, 3);
  assert.equal(sum.met, 1);
  assert.equal(sum.unmet, 1);
  assert.equal(sum.unknown, 1);
  // 점수·등급·판정 같은 필드가 생기면 안 된다
  assert.deepEqual(Object.keys(sum).sort(), ['met', 'results', 'total', 'unknown', 'unmet']);
});

test('판정 불가는 충족 개수에 들어가지 않는다', () => {
  const sum = summarize([{ kind: 'fng', market: 'kr', comparator: 'lte', value: 100 }], SNAP);
  assert.equal(sum.met, 0);
  assert.equal(sum.unknown, 1);
});

test('조건이 없으면 0 개짜리 요약', () => {
  for (const c of [[], null, undefined, 'nope']) {
    const sum = summarize(c, SNAP);
    assert.equal(sum.total, 0);
    assert.equal(sum.met, 0);
  }
});

/* ------------------------------- 문장 ------------------------------- */

test('조건을 사람이 읽는 한 줄로 만든다', () => {
  assert.equal(
    describe({ kind: 'fng', market: 'us', comparator: 'lte', value: 30 }, { market: '미국' }),
    '미국 심리 점수가 30 이하',
  );
  assert.equal(
    describe({ kind: 'risk_count', level: 'alert', comparator: 'lte', value: 1 }, { level: '주의' }),
    "위험 신호등에서 '주의' 인 지표가 1개 이하",
  );
});

test('설명에 매매를 권하는 말이 섞이지 않는다', () => {
  const banned = ['매수', '매도', '사세요', '파세요', '추천', '유리', '기회'];
  const lines = [
    describe({ kind: 'fng', market: 'us', comparator: 'lte', value: 30 }, { market: '미국' }),
    describe({ kind: 'risk_count', level: 'alert', comparator: 'gte', value: 2 }, { level: '주의' }),
    describe({ kind: 'risk_value', indicatorId: 'vix', comparator: 'gte', value: 30 }, { indicator: 'VIX' }),
  ];
  for (const line of lines) {
    for (const word of banned) assert.ok(!line.includes(word), `"${line}" 에 '${word}' 가 있다`);
  }
});

test('numOrNull 은 NaN·Infinity·문자열을 null 로 본다', () => {
  assert.equal(numOrNull(3), 3);
  assert.equal(numOrNull(0), 0);
  assert.equal(numOrNull(NaN), null);
  assert.equal(numOrNull(Infinity), null);
  assert.equal(numOrNull('3'), null);
  assert.equal(numOrNull(null), null);
});
