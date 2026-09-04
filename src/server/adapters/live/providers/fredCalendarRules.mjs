/**
 * FRED 발표 일정 정규화 — 순수 함수만 모아 둔 곳.
 *
 * 왜 .mjs 로 떼어냈나
 *  이 앱은 런타임 의존성이 next·react·react-dom 뿐이라 ts-node 같은 걸 쓸 수 없다.
 *  `node --test` 는 TypeScript 를 못 읽으므로, 단위 테스트를 붙이려면 순수 로직이
 *  평범한 JS 파일이어야 한다. 네트워크를 타는 부분은 fredCalendar.ts 에 남겼다.
 *  (타입은 옆의 fredCalendar.d.mts 가 붙여 준다)
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 어떤 발표를 캘린더에 올릴 것인가.
 *
 * FRED 는 release 이름을 영어로만 주고 중요도·분류를 주지 않는다. 그래서 여기서
 * 정한다. 규칙은 셋이다.
 *
 *  1. **모르는 release 는 버린다.** FRED 에는 수백 개의 release 가 있고 대부분은
 *     이 앱과 상관없는 지역·업종 통계다. 넓은 키워드로 긁어오면 "미시시피주
 *     고용" 같은 게 미국 고용보고서 옆에 앉는다. 매칭에 실패하면 조용히 뺀다.
 *  2. **중요도는 표에 적힌 것만 쓴다.** 제공사가 안 주는 값을 추론으로 만들면
 *     그 순간부터 화면의 '높음' 배지가 근거 없는 말이 된다.
 *  3. **이름은 정확히 겹치는 것만 잡는다.** 지역 통계에는 대개 주 이름이나
 *     대도시권 이름이 붙으므로, 그런 접두·접미가 붙은 것은 rejects 로 걸러낸다.
 *
 * 이 표는 FRED 응답을 실제로 받아 보고 확정해야 한다.
 * `npm run check:live` 가 FRED 가 준 release 이름을 그대로 출력하므로,
 * 키를 넣고 한 번 돌린 뒤 여기 이름과 맞는지 대조하면 된다.
 */
export const RELEASE_RULES = [
  {
    id: 'cpi',
    /* 미국 전국 소비자물가지수. 지역 CPI 는 이름에 지역명이 붙으므로 제외된다. */
    match: /^consumer price index$/i,
    title: '미국 소비자물가지수 (CPI)',
    category: 'inflation',
    importance: 'high',
  },
  {
    id: 'employment_situation',
    /* 비농업 고용·실업률이 함께 나오는 월간 고용보고서 */
    match: /^employment situation$/i,
    title: '미국 고용보고서 (비농업 고용 · 실업률)',
    category: 'employment',
    importance: 'high',
  },
  {
    id: 'gdp',
    match: /^gross domestic product$/i,
    title: '미국 GDP',
    category: 'gdp',
    importance: 'high',
  },
  {
    id: 'pce',
    /* 연준이 물가 판단에 가장 크게 쓰는 개인소비지출 물가 */
    match: /^personal income and outlays$/i,
    title: '미국 개인소득·소비지출 (PCE 물가)',
    category: 'inflation',
    importance: 'high',
  },
  {
    id: 'ppi',
    match: /^producer price index$/i,
    title: '미국 생산자물가지수 (PPI)',
    category: 'inflation',
    importance: 'medium',
  },
  {
    id: 'retail_sales',
    match: /^advance monthly sales for retail and food services$/i,
    title: '미국 소매판매',
    category: 'gdp',
    importance: 'medium',
  },
  {
    id: 'jobless_claims',
    match: /^unemployment insurance weekly claims report$/i,
    title: '미국 주간 신규 실업수당 청구',
    category: 'employment',
    importance: 'medium',
  },
  {
    id: 'jolts',
    match: /^job openings and labor turnover survey$/i,
    title: '미국 구인·이직 보고서 (JOLTS)',
    category: 'employment',
    importance: 'low',
  },
  {
    id: 'fomc_projections',
    /*
     * FOMC 가 분기마다 내는 경제전망요약. FOMC 회의 자체의 일정표는 연준이
     * 기계가 읽을 수 있는 형태로 공개하지 않지만, 이 발표는 FOMC 회의 날에
     * 나오므로 여덟 번 중 네 번은 회의 날짜를 알 수 있다.
     * 나머지 네 번은 이 소스로 알 수 없고, 없는 것을 지어내지 않는다.
     */
    match: /summary of economic projections$/i,
    title: 'FOMC 경제전망요약 (SEP) · 정책금리 결정일',
    category: 'central_bank',
    importance: 'high',
  },
  {
    id: 'h15',
    match: /^h\.15 selected interest rates$/i,
    title: '미국 주요 금리 (H.15)',
    category: 'central_bank',
    importance: 'low',
  },
];

/**
 * 지역·업종 통계 걸러내기.
 *
 * FRED 에는 "Consumer Price Index" 와 이름이 비슷한 지역 통계가 많다.
 * 규칙의 정규식이 `^...$` 로 묶여 있어 대부분 걸러지지만, 한 겹 더 둔다.
 * 여기 걸리면 규칙과 맞더라도 버린다.
 */
const REGIONAL = /\b(state|states|metropolitan|county|counties|region|regional|district|area|city|msa)\b/i;

/** 문자열이면 다듬어 돌려주고, 아니면 null. 빈 문자열도 null 이다. */
export function textOrNull(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/**
 * FRED 가 준 발표일(YYYY-MM-DD)을 KST ISO 문자열로.
 *
 * **시각을 지어내지 않는다.** FRED 는 날짜만 주고, 발표 시각은 지표마다 다르다
 * (고용보고서 08:30 ET, FOMC 14:00 ET …). 아무 값이나 넣으면 화면의 카운트다운이
 * 그럴듯하게 틀린 시각을 향해 흘러간다. 그래서 자정으로 두고 timeTbd 를 세워,
 * 화면이 "시각 미정" 이라고 말하게 한다.
 *
 * 자정을 KST 로 잡는 이유는 날짜가 밀리지 않게 하기 위해서다. 미국 지표는
 * 대개 현지 오전에 나오고 그게 KST 로도 같은 날 밤이라, 발표일을 그대로 KST
 * 날짜로 읽는 편이 실제와 맞는다.
 */
export function kstDateIso(date) {
  const raw = textOrNull(date);
  if (raw === null || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const ms = Date.parse(`${raw}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  /*
   * 모양이 맞아도 달력에 없는 날일 수 있다. 자바스크립트는 '2026-02-30' 을
   * 거절하지 않고 3월 2일로 넘겨 버린다. 그대로 두면 2월 30일 발표라는 값이
   * 3월 2일 일정으로 조용히 둔갑한다 — 되돌려서 같은 날인지 확인한다.
   */
  if (new Date(ms).toISOString().slice(0, 10) !== raw) return null;
  return `${raw}T00:00:00.000+09:00`;
}

/** KST 기준 날짜 키 (YYYY-MM-DD). 조회 구간을 만들 때 쓴다. */
export function kstDateKey(ms) {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** release 이름에 맞는 규칙. 없으면 null — 지어내지 않는다. */
export function ruleFor(releaseName) {
  const name = textOrNull(releaseName);
  if (name === null || REGIONAL.test(name)) return null;
  return RELEASE_RULES.find((r) => r.match.test(name)) ?? null;
}

/**
 * FRED releases/dates 한 행 → CalendarEvent.
 * 규칙에 없는 release 이거나 날짜가 이상하면 null 을 돌려 그 행을 버린다.
 */
export function normalizeReleaseDate(row, source) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;

  const releaseName = textOrNull(row.release_name);
  const scheduledAt = kstDateIso(row.date);
  const rule = ruleFor(releaseName);
  if (rule === null || scheduledAt === null) return null;

  const releaseId = row.release_id === undefined ? null : String(row.release_id);

  return {
    id: `fred-${rule.id}-${String(row.date)}`,
    title: rule.title,
    country: 'US',
    market: 'us',
    category: rule.category,
    importance: rule.importance,
    scheduledAt,
    /* FRED 는 날짜만 준다. 시각을 안다고 말하지 않는다. */
    timeTbd: true,
    /*
     * releases/dates 는 일정만 준다. 예상치·이전값·발표값이 아예 없다.
     * 다른 데서 끌어와 채우면 출처가 섞이므로 비운 채로 둔다.
     */
    forecast: null,
    previous: null,
    actual: null,
    unit: null,
    note: `원문 일정명: ${releaseName}${releaseId === null ? '' : ` (FRED release ${releaseId})`}`,
    source: { ...source },
  };
}

/**
 * 응답 배열 → 일정 목록. 같은 날 같은 발표가 두 번 오면 하나만 남기고
 * 시간순으로 세운다. (FRED 는 realtime 구간에 따라 같은 행을 반복해 준다)
 */
export function normalizeReleaseDates(rows, source) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const event = normalizeReleaseDate(row, source);
    if (event === null || seen.has(event.id)) continue;
    seen.add(event.id);
    out.push(event);
  }
  return out.sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
}
