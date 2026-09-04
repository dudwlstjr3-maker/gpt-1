/**
 * FRED 발표 일정 정규화기 단위 테스트.
 *
 *   node --test scripts/fred-calendar.test.mjs
 *
 * 여기서 검사하는 것은 "우리가 받은 것을 어떻게 다루는가" 지, 제공사가 실제로
 * 저런 모양을 주는지가 아니다. 그건 코드로 증명할 수 없고 `npm run check:live`
 * 로 실제 응답을 봐야 한다. 그래서 아래 픽스처는 FRED 문서가 적어 둔 필드
 * (release_id · release_name · date)만 쓰고, 그 밖의 필드는 가정하지 않는다.
 *
 * 특히 **버려야 할 입력**을 많이 넣었다. 이 정규화기의 일은 잘 생긴 값을 잘
 * 옮기는 것보다, 이상한 값을 조용히 통과시키지 않는 쪽에 가깝다.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  kstDateIso,
  normalizeReleaseDate,
  normalizeReleaseDates,
  ruleFor,
  textOrNull,
} from '../src/server/adapters/live/providers/fredCalendarRules.mjs';

const SOURCE = {
  name: 'FRED 발표 일정 (세인트루이스 연은)',
  url: 'https://fred.stlouisfed.org/docs/api/fred/releases_dates.html',
  delayMinutes: 1440,
  terms: 'FRED API 이용약관 · 출처 표기 필요 · 발표 일정(값 아님)만 사용',
};

test('CPI 발표일을 CalendarEvent 계약대로 옮긴다', () => {
  const event = normalizeReleaseDate(
    { release_id: 10, release_name: 'Consumer Price Index', date: '2026-09-10' },
    SOURCE,
  );

  assert.deepEqual(event, {
    id: 'fred-cpi-2026-09-10',
    title: '미국 소비자물가지수 (CPI)',
    country: 'US',
    market: 'us',
    category: 'inflation',
    importance: 'high',
    scheduledAt: '2026-09-10T00:00:00.000+09:00',
    timeTbd: true,
    forecast: null,
    previous: null,
    actual: null,
    unit: null,
    note: '원문 일정명: Consumer Price Index (FRED release 10)',
    source: SOURCE,
  });
});

test('날짜만 오므로 timeTbd 를 세우고 시각을 지어내지 않는다', () => {
  const event = normalizeReleaseDate(
    { release_id: 50, release_name: 'Employment Situation', date: '2026-10-02' },
    SOURCE,
  );
  assert.equal(event.timeTbd, true);
  // 08:30 ET 같은 값을 몰래 채워 넣지 않았는지 — 자정 그대로여야 한다
  assert.equal(event.scheduledAt, '2026-10-02T00:00:00.000+09:00');
  assert.ok(event.scheduledAt.endsWith('+09:00'), 'KST 오프셋이 붙어 있어야 한다');
});

test('일정만 주므로 예상치·이전값·발표값은 전부 null 이다', () => {
  const event = normalizeReleaseDate(
    { release_id: 53, release_name: 'Gross Domestic Product', date: '2026-10-29' },
    SOURCE,
  );
  assert.equal(event.forecast, null);
  assert.equal(event.previous, null);
  assert.equal(event.actual, null);
  assert.equal(event.unit, null);
});

test('규칙에 없는 release 는 버린다 — 짐작해서 분류하지 않는다', () => {
  assert.equal(ruleFor('Beige Book'), null);
  assert.equal(ruleFor('Commercial Paper Rates and Outstanding'), null);
  assert.equal(
    normalizeReleaseDate({ release_id: 1, release_name: 'Beige Book', date: '2026-09-03' }, SOURCE),
    null,
  );
});

test('이름이 비슷한 지역 통계를 미국 전국 지표로 착각하지 않는다', () => {
  assert.equal(ruleFor('Consumer Price Index by Metropolitan Area'), null);
  assert.equal(ruleFor('State Employment Situation'), null);
  assert.equal(ruleFor('Employment Situation in the New York Region'), null);
});

test('날짜가 이상하면 그 행을 버린다', () => {
  const bad = [
    { release_id: 10, release_name: 'Consumer Price Index', date: '2026-9-10' },
    { release_id: 10, release_name: 'Consumer Price Index', date: '' },
    { release_id: 10, release_name: 'Consumer Price Index', date: null },
    { release_id: 10, release_name: 'Consumer Price Index' },
  ];
  for (const row of bad) assert.equal(normalizeReleaseDate(row, SOURCE), null, JSON.stringify(row));

  // 모양은 YYYY-MM-DD 인데 달력에 없는 날. 정규식만 통과하고 Date.parse 에서 걸려야 한다.
  assert.equal(kstDateIso('2026-13-40'), null);
  assert.equal(kstDateIso('2026-02-30'), null);
  assert.equal(kstDateIso('2026-09-10'), '2026-09-10T00:00:00.000+09:00');
});

test('행 자체가 객체가 아니면 버린다', () => {
  for (const row of [null, undefined, 'CPI', 42, ['CPI'], true]) {
    assert.equal(normalizeReleaseDate(row, SOURCE), null, String(row));
  }
});

test('같은 발표가 여러 번 와도 하나만 남기고 날짜순으로 세운다', () => {
  const events = normalizeReleaseDates(
    [
      { release_id: 53, release_name: 'Gross Domestic Product', date: '2026-10-29' },
      { release_id: 10, release_name: 'Consumer Price Index', date: '2026-09-10' },
      { release_id: 10, release_name: 'Consumer Price Index', date: '2026-09-10' },
      { release_id: 999, release_name: 'Beige Book', date: '2026-09-03' },
    ],
    SOURCE,
  );
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((e) => e.id),
    ['fred-cpi-2026-09-10', 'fred-gdp-2026-10-29'],
  );
});

test('배열이 아니면 빈 목록 — 던지지 않고 조용히 비운다', () => {
  for (const rows of [null, undefined, {}, 'nope', 7]) {
    assert.deepEqual(normalizeReleaseDates(rows, SOURCE), []);
  }
});

test('FOMC 경제전망요약은 통화정책 일정으로 잡는다', () => {
  const rule = ruleFor('FOMC Summary of Economic Projections');
  assert.ok(rule !== null, 'SEP 은 규칙에 잡혀야 한다');
  assert.equal(rule.category, 'central_bank');
  assert.equal(rule.importance, 'high');
});

test('textOrNull 은 빈 문자열과 공백을 null 로 본다', () => {
  assert.equal(textOrNull('  CPI '), 'CPI');
  assert.equal(textOrNull('   '), null);
  assert.equal(textOrNull(''), null);
  assert.equal(textOrNull(7), null);
  assert.equal(textOrNull(null), null);
});
