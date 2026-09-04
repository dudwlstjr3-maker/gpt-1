/**
 * 경제 캘린더 정규화 — 순수 함수만 모아 둔 곳.
 *
 * 왜 .mjs 로 떼어냈나
 *  이 앱은 런타임 의존성이 next·react·react-dom 뿐이라 ts-node 같은 걸 쓸 수 없다.
 *  `node --test` 는 TypeScript 를 못 읽으므로, 단위 테스트를 붙이려면 순수 로직이
 *  평범한 JS 파일이어야 한다. 네트워크를 타는 부분은 fredCalendar.ts 에 남겼다.
 *  (타입은 옆의 fredCalendarRules.d.mts 가 붙여 준다)
 *
 *  파일 이름이 fredCalendar.ts 와 다른 것도 이유가 있다. 같은 이름으로 뒀더니
 *  webpack 이 .ts 대신 .mjs 를 물어와서 런타임에 함수가 없다고 터졌다.
 *  tsc 는 .d.mts 를 보고 통과시켜서 못 잡는다 — 실제로 돌려야 나오는 종류다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 캘린더에 올릴 발표 — **release id 로 맞춘다.**
 *
 * 처음에는 release 이름을 정규식으로 맞췄다. 이름은 제공사가 언제든 바꿀 수 있고,
 * 무엇보다 내가 그 이름을 실제로 확인하지 못한 채 적고 있었다. id 는 숫자라
 * 틀리면 그냥 안 걸리고, 맞으면 정확히 하나만 걸린다.
 *
 * 아래 id 는 공개 저장소 두 곳의 FRED 응답 기록과 독립 구현에서 교차 확인했다.
 * (name 은 확인 당시의 표기이며 화면에는 쓰지 않는다 — 대조용 메모다)
 *
 * 이름 매칭을 버리면서 함께 사라진 위험: FRED 에는 "Consumer Price Index, Japan",
 * "Median Consumer Price Index", "Research Consumer Price Index" 처럼 헷갈리는
 * 이름이 여럿 있다. id 로 맞추면 이런 것들이 애초에 후보에 오르지 않는다.
 */
export const RELEASE_RULES = [
  { releaseId: 10, id: 'cpi', name: 'Consumer Price Index',
    title: '미국 소비자물가지수 (CPI)', category: 'inflation', importance: 'high' },
  { releaseId: 46, id: 'ppi', name: 'Producer Price Index',
    title: '미국 생산자물가지수 (PPI)', category: 'inflation', importance: 'medium' },
  { releaseId: 50, id: 'employment_situation', name: 'Employment Situation',
    title: '미국 고용보고서 (비농업 고용 · 실업률)', category: 'employment', importance: 'high' },
  { releaseId: 51, id: 'trade', name: 'International Trade in Goods and Services',
    title: '미국 무역수지', category: 'gdp', importance: 'low' },
  { releaseId: 53, id: 'gdp', name: 'Gross Domestic Product',
    title: '미국 GDP', category: 'gdp', importance: 'high' },
  { releaseId: 54, id: 'pce', name: 'Personal Income and Outlays',
    title: '미국 개인소득·소비지출 (PCE 물가)', category: 'inflation', importance: 'high' },
  { releaseId: 180, id: 'jobless_claims', name: 'Unemployment Insurance Weekly Claims Report',
    title: '미국 주간 신규 실업수당 청구', category: 'employment', importance: 'medium' },
  { releaseId: 192, id: 'jolts', name: 'Job Openings and Labor Turnover Survey',
    title: '미국 구인·이직 보고서 (JOLTS)', category: 'employment', importance: 'low' },
];

/**
 * **FRED release 101 (FOMC Press Release) 은 쓰지 않는다.**
 *
 * 이름만 보면 FOMC 일정 같지만 아니다. FRED 는 데이터를 새로 올릴 때마다 이
 * release 에 날짜를 찍어서, 실제 회의가 없는 날이 잔뜩 섞여 있다. 공개 저장소
 * 두 곳이 각각 독립적으로 같은 사실을 적어 두었다 —
 *   "FRED lists 'FOMC Press Release' on many dates for data refreshes"
 *   "release id 101 is a known non-schedule"
 * 그대로 쓰면 회의가 아닌 날에 "FOMC 정책금리 결정" 이 뜬다.
 */
export const FOMC_RELEASE_ID_NOT_A_SCHEDULE = 101;

/**
 * FOMC 정책금리 결정일 — 손으로 옮겨 적은 표.
 *
 * 연준은 회의 일정을 사람이 읽는 HTML 로만 공개한다. 기계가 읽을 수 있는 것은
 * *지나간* 보도자료 RSS 뿐이고, 스크래핑은 이 프로젝트가 하지 않는다.
 * 그래서 여기만 예외적으로 손으로 옮긴 값이 들어간다.
 *
 * 지어낸 값이 아니라는 근거
 *  - 원 출처: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
 *  - 공개 저장소 **네 곳**의 서로 다른 구현에서 같은 날짜를 확인했다.
 *    그중 한 곳은 이틀짜리 회의의 양일을 모두 적어 두는데, 그 둘째 날이
 *    아래 날짜와 정확히 일치한다 (정책 결정은 회의 마지막 날에 나온다).
 *  - 확인일: 2026-09-04
 *
 * 손으로 적은 값의 진짜 위험은 틀리는 게 아니라 **낡는 것**이다. 그래서 아래
 * COVERED_THROUGH 를 두고, 그 뒤로는 아무것도 내보내지 않는다. 조용히 비는
 * 편이 작년 일정을 올해 것인 양 보여주는 것보다 낫다.
 */
export const FOMC_SOURCE_URL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
export const FOMC_VERIFIED_ON = '2026-09-04';
export const FOMC_COVERED_THROUGH = '2028-01-26';
export const FOMC_DECISION_DAYS = [
  /* 2026 */
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
  /* 2027 */
  '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09',
  '2027-07-28', '2027-09-15', '2027-10-27', '2027-12-08',
  /* 2028 — 2027년 일정 발표에 함께 공개된 1월분까지만 */
  '2028-01-26',
];

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

/** release id 에 맞는 규칙. 없으면 null — 짐작해서 분류하지 않는다. */
export function ruleFor(releaseId) {
  const n = typeof releaseId === 'number' ? releaseId : Number(textOrNull(releaseId));
  if (!Number.isInteger(n)) return null;
  return RELEASE_RULES.find((r) => r.releaseId === n) ?? null;
}

/**
 * FRED releases/dates 한 행 → CalendarEvent.
 * 규칙에 없는 release 이거나 날짜가 이상하면 null 을 돌려 그 행을 버린다.
 */
export function normalizeReleaseDate(row, source) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;

  const rule = ruleFor(row.release_id);
  const scheduledAt = kstDateIso(row.date);
  if (rule === null || scheduledAt === null) return null;

  const givenName = textOrNull(row.release_name);

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
    note: `원문 일정명: ${givenName ?? rule.name} (FRED release ${rule.releaseId})`,
    source: { ...source },
  };
}

/**
 * 응답 배열 → 일정 목록. 같은 날 같은 발표가 두 번 오면 하나만 남긴다.
 * (FRED 는 realtime 구간에 따라 같은 행을 반복해 준다)
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
  return out;
}

/**
 * FOMC 정책금리 결정일 → CalendarEvent.
 *
 * 손으로 옮긴 표에서만 만든다. 구간 밖이거나 표가 덮는 기간을 넘어서면 아무것도
 * 내보내지 않는다 — 낡은 표로 없는 회의를 그리는 것이 최악이다.
 */
export function fomcEvents(fromKey, toKey, source) {
  const from = textOrNull(fromKey);
  const to = textOrNull(toKey);
  if (from === null || to === null) return [];

  return FOMC_DECISION_DAYS.filter((d) => d >= from && d <= to && d <= FOMC_COVERED_THROUGH)
    .map((d) => {
      const scheduledAt = kstDateIso(d);
      if (scheduledAt === null) return null;
      return {
        id: `fomc-${d}`,
        title: 'FOMC 정책금리 결정',
        country: 'US',
        market: 'us',
        category: 'central_bank',
        importance: 'high',
        scheduledAt,
        /* 연준은 보통 현지 14:00 에 발표하지만 그 시각까지 공개 일정으로 받은 게 아니다 */
        timeTbd: true,
        forecast: null,
        previous: null,
        actual: null,
        unit: null,
        note: `연준이 공개한 회의 일정 (${FOMC_VERIFIED_ON} 확인). 이틀 회의의 마지막 날이 결정일입니다.`,
        source: { ...source },
      };
    })
    .filter((e) => e !== null);
}

/** 두 목록을 합쳐 날짜순으로. 같은 id 는 한 번만. */
export function mergeEvents(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const e of list ?? []) {
      if (e === null || seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
  }
  return out.sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
}
