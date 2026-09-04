/**
 * 경제 캘린더 정규화기 단위 테스트.
 *
 *   node --test scripts/fred-calendar.test.mjs
 *
 * 픽스처는 **실제 FRED 응답에서 가져온 값**이다. 공개 저장소에 기록된 FRED
 * releases/dates 응답에서 release id 와 이름을 확인해 그대로 썼다.
 * (id 10 · 46 · 50 · 51 · 53 · 54 · 180 · 192)
 *
 * 여기서 검사하는 것은 "받은 것을 어떻게 다루는가" 다. 잘 생긴 값을 잘 옮기는
 * 것보다 **이상한 값을 조용히 통과시키지 않는 쪽**에 무게를 뒀다.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FOMC_COVERED_THROUGH,
  FOMC_DECISION_DAYS,
  FOMC_RELEASE_ID_NOT_A_SCHEDULE,
  fomcEvents,
  kstDateIso,
  mergeEvents,
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
const FOMC_SOURCE = { name: '미 연방준비제도 공개 회의 일정', url: 'https://www.federalreserve.gov/', delayMinutes: 10080, terms: '' };

/* ------------------------------ 발표 일정 ------------------------------ */

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

test('실제 FRED release id 여덟 개가 모두 규칙에 잡힌다', () => {
  for (const [id, expected] of [
    [10, 'cpi'], [46, 'ppi'], [50, 'employment_situation'], [51, 'trade'],
    [53, 'gdp'], [54, 'pce'], [180, 'jobless_claims'], [192, 'jolts'],
  ]) {
    const rule = ruleFor(id);
    assert.ok(rule !== null, `release ${id} 가 규칙에 없다`);
    assert.equal(rule.id, expected);
  }
});

test('이름이 아니라 id 로 맞춘다 — 헷갈리는 이름에 속지 않는다', () => {
  /*
   * FRED 에는 이런 이름들이 실제로 있다. 이름으로 맞추던 시절이라면
   * "Consumer Price Index" 규칙에 걸릴 뻔한 것들이다.
   */
  const decoys = [
    { release_id: 9999, release_name: 'Consumer Price Index, Japan', date: '2026-09-10' },
    { release_id: 9998, release_name: 'Median Consumer Price Index', date: '2026-09-10' },
    { release_id: 9997, release_name: 'Research Consumer Price Index', date: '2026-09-10' },
    { release_id: 9996, release_name: 'State Employment Situation', date: '2026-09-10' },
  ];
  for (const row of decoys) {
    assert.equal(normalizeReleaseDate(row, SOURCE), null, row.release_name);
  }
});

test('FOMC Press Release(101) 는 일정표가 아니므로 규칙에 없다', () => {
  // FRED 가 데이터 갱신 때마다 날짜를 찍는 release 다. 회의가 없는 날이 섞여 있다.
  assert.equal(ruleFor(FOMC_RELEASE_ID_NOT_A_SCHEDULE), null);
  assert.equal(
    normalizeReleaseDate(
      { release_id: 101, release_name: 'FOMC Press Release', date: '2026-05-14' },
      SOURCE,
    ),
    null,
  );
});

test('날짜만 오므로 timeTbd 를 세우고 시각을 지어내지 않는다', () => {
  const event = normalizeReleaseDate(
    { release_id: 50, release_name: 'Employment Situation', date: '2026-10-02' },
    SOURCE,
  );
  assert.equal(event.timeTbd, true);
  // 08:30 ET 같은 값을 몰래 채워 넣지 않았는지 — 자정 그대로여야 한다
  assert.equal(event.scheduledAt, '2026-10-02T00:00:00.000+09:00');
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

test('규칙에 없는 release 는 버린다', () => {
  assert.equal(ruleFor(1), null);
  assert.equal(ruleFor('nope'), null);
  assert.equal(ruleFor(null), null);
  assert.equal(ruleFor(10.5), null);
});

test('날짜가 이상하면 그 행을 버린다', () => {
  const bad = [
    { release_id: 10, date: '2026-9-10' },
    { release_id: 10, date: '' },
    { release_id: 10, date: null },
    { release_id: 10 },
  ];
  for (const row of bad) assert.equal(normalizeReleaseDate(row, SOURCE), null, JSON.stringify(row));

  // 모양은 YYYY-MM-DD 인데 달력에 없는 날. 자바스크립트가 3월 2일로 넘겨 버린다.
  assert.equal(kstDateIso('2026-02-30'), null);
  assert.equal(kstDateIso('2026-13-40'), null);
  assert.equal(kstDateIso('2026-09-10'), '2026-09-10T00:00:00.000+09:00');
});

test('행 자체가 객체가 아니면 버린다', () => {
  for (const row of [null, undefined, 'CPI', 42, ['CPI'], true]) {
    assert.equal(normalizeReleaseDate(row, SOURCE), null, String(row));
  }
});

test('같은 발표가 여러 번 와도 하나만 남긴다', () => {
  const events = normalizeReleaseDates(
    [
      { release_id: 10, release_name: 'Consumer Price Index', date: '2026-09-10' },
      { release_id: 10, release_name: 'Consumer Price Index', date: '2026-09-10' },
      { release_id: 1, release_name: 'Beige Book', date: '2026-09-03' },
    ],
    SOURCE,
  );
  assert.equal(events.length, 1);
});

test('배열이 아니면 빈 목록 — 던지지 않고 조용히 비운다', () => {
  for (const rows of [null, undefined, {}, 'nope', 7]) {
    assert.deepEqual(normalizeReleaseDates(rows, SOURCE), []);
  }
});

/* -------------------------------- FOMC -------------------------------- */

test('구간 안의 FOMC 회의일만 내보낸다', () => {
  const events = fomcEvents('2026-09-01', '2026-10-31', FOMC_SOURCE);
  assert.deepEqual(events.map((e) => e.scheduledAt.slice(0, 10)), ['2026-09-16', '2026-10-28']);
  assert.equal(events[0].title, 'FOMC 정책금리 결정');
  assert.equal(events[0].category, 'central_bank');
  assert.equal(events[0].importance, 'high');
  assert.equal(events[0].timeTbd, true);
});

test('표가 덮는 기간을 넘어서면 아무것도 내보내지 않는다', () => {
  // 낡은 표로 없는 회의를 그리느니 조용히 비운다
  assert.deepEqual(fomcEvents('2028-02-01', '2029-12-31', FOMC_SOURCE), []);
});

test('FOMC 표가 날짜순이고 중복이 없다', () => {
  const sorted = [...FOMC_DECISION_DAYS].sort();
  assert.deepEqual(FOMC_DECISION_DAYS, sorted, '표가 날짜순이어야 한다');
  assert.equal(new Set(FOMC_DECISION_DAYS).size, FOMC_DECISION_DAYS.length, '중복이 있다');
  for (const d of FOMC_DECISION_DAYS) {
    assert.ok(kstDateIso(d) !== null, `달력에 없는 날: ${d}`);
    assert.ok(d <= FOMC_COVERED_THROUGH, `덮는 기간을 넘는 값: ${d}`);
  }
});

test('연준은 한 해 여덟 번 모인다 — 2026·2027 이 여덟 개씩', () => {
  for (const year of ['2026', '2027']) {
    const n = FOMC_DECISION_DAYS.filter((d) => d.startsWith(year)).length;
    assert.equal(n, 8, `${year}년이 ${n}개다`);
  }
});

test('잘못된 구간을 주면 빈 목록', () => {
  assert.deepEqual(fomcEvents(null, '2026-12-31', FOMC_SOURCE), []);
  assert.deepEqual(fomcEvents('2026-01-01', '', FOMC_SOURCE), []);
});

/* ------------------------------- 합치기 ------------------------------- */

test('두 출처를 합쳐 날짜순으로 세우고 중복을 지운다', () => {
  const releases = normalizeReleaseDates(
    [
      { release_id: 53, release_name: 'Gross Domestic Product', date: '2026-10-29' },
      { release_id: 10, release_name: 'Consumer Price Index', date: '2026-09-10' },
    ],
    SOURCE,
  );
  const fomc = fomcEvents('2026-09-01', '2026-10-31', FOMC_SOURCE);
  const merged = mergeEvents(releases, fomc, releases);

  assert.deepEqual(
    merged.map((e) => e.scheduledAt.slice(0, 10)),
    ['2026-09-10', '2026-09-16', '2026-10-28', '2026-10-29'],
  );
  // 출처가 섞여도 각 줄이 제 출처를 들고 있어야 한다
  assert.equal(merged[0].source.name, SOURCE.name);
  assert.equal(merged[1].source.name, FOMC_SOURCE.name);
});

test('textOrNull 은 빈 문자열과 공백을 null 로 본다', () => {
  assert.equal(textOrNull('  CPI '), 'CPI');
  assert.equal(textOrNull('   '), null);
  assert.equal(textOrNull(7), null);
  assert.equal(textOrNull(null), null);
});
