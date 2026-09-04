/**
 * 경제 캘린더 — FRED 발표 일정 (`fred/releases/dates`).
 *
 * 왜 이곳인가
 *  - **이미 붙어 있는 제공사다.** 거시지표·국채금리·VIX 를 여기서 받고 있고,
 *    키(MACRO_API_KEY)도 이미 발급받아 쓴다. 새 계약도 새 키도 필요 없다.
 *  - **1차 출처다.** 일정을 모아 파는 중개사가 아니라, 발표 기관들의 일정을
 *    연준이 직접 모아 공개한다.
 *  - `include_release_dates_with_no_data=true` 를 주면 아직 데이터가 없는
 *    **앞으로의 발표 예정일**이 나온다. 그게 곧 캘린더다.
 *
 * 약관 (2026-09 확인)
 *  - FRED API 이용약관은 이 API 로 앱을 만들어 배포하는 것을 명시적으로 다룬다.
 *    출처 표기를 요구하므로 화면과 source.name 에 FRED 를 노출한다.
 *  - 주의: 개별 시리즈의 **값**에는 원 제공기관의 권리가 따로 붙을 수 있다.
 *    여기서 쓰는 것은 값이 아니라 발표 일정이라 그 문제에서 비교적 자유롭지만,
 *    값까지 끌어와 채우지 않는 이유이기도 하다.
 *
 * 한계 — 화면이 그대로 말해야 하는 것들
 *  - **시각이 없다.** 날짜만 준다. timeTbd 를 세우고 시각을 지어내지 않는다.
 *  - **예상치·이전값이 없다.** 일정만 준다. 비운 채로 둔다.
 *  - **미국뿐이다.** 한국·크립토 일정은 여기서 나오지 않는다. 없는 것을 만들지 않는다.
 *  - **FOMC 는 FRED 에서 못 받는다.** release 101 의 이름이 "FOMC Press Release" 라
 *    일정처럼 보이지만, FRED 가 데이터를 새로 올릴 때마다 날짜를 찍어서 실제 회의가
 *    없는 날이 잔뜩 섞여 있다. 그래서 연준이 공개한 회의 일정을 손으로 옮긴 표를
 *    따로 두고 합친다 (fredCalendarRules.mjs 의 FOMC_DECISION_DAYS).
 */

import { fetchJson } from '@/server/http';
import type { CalendarEvent, DataSource } from '@/types';
import {
  FOMC_SOURCE_URL,
  FOMC_VERIFIED_ON,
  fomcEvents,
  kstDateKey,
  mergeEvents,
  normalizeReleaseDates,
} from './fredCalendarRules.mjs';

const DEFAULT_BASE = 'https://api.stlouisfed.org/fred';

/**
 * FOMC 는 FRED 가 아니라 연준이 공개한 일정을 옮긴 것이라 출처를 따로 붙인다.
 * 한 화면에 두 출처가 섞일 때 어느 줄이 어디서 왔는지 보이게 해야 한다.
 */
export const FOMC_CALENDAR_SOURCE: DataSource = {
  name: '미 연방준비제도 공개 회의 일정',
  url: FOMC_SOURCE_URL,
  /* 연 단위로 미리 공개되는 일정이다. '지연' 이라는 말이 어울리지 않아 넉넉히 잡는다. */
  delayMinutes: 10_080,
  terms: `연준이 공개한 회의 일정을 옮겨 적었습니다 (${FOMC_VERIFIED_ON} 확인).`,
};

export const FRED_CALENDAR_SOURCE: DataSource = {
  name: 'FRED 발표 일정 (세인트루이스 연은)',
  url: 'https://fred.stlouisfed.org/docs/api/fred/releases_dates.html',
  /*
   * 일정표는 시세가 아니라 예정표다. "몇 분 지연" 이라는 말이 어울리지 않지만,
   * 그렇다고 0(실시간)이라고 적으면 이 앱의 배지가 '실시간'으로 뜬다.
   * 발표 기관이 일정을 바꾸면 반영까지 하루쯤 걸린다고 보고 보수적으로 잡는다.
   */
  delayMinutes: 1440,
  terms: 'FRED API 이용약관 · 출처 표기 필요 · 발표 일정(값 아님)만 사용',
};

export interface FredCalendarConfig {
  base: string;
  key: string;
}

export function fredCalendarConfig(key: string, base: string | null): FredCalendarConfig {
  return { base: base ?? DEFAULT_BASE, key };
}

interface ReleaseDatesResponse {
  release_dates?: unknown;
}

/** 조회 구간 — 지난 일주일부터 앞으로 45일까지. 화면의 달력 한 장을 덮는다. */
const LOOKBACK_DAYS = 7;
const LOOKAHEAD_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;

function buildUrl(cfg: FredCalendarConfig, now: Date, limit: number): string {
  const url = new URL(`${cfg.base}/releases/dates`);
  url.searchParams.set('api_key', cfg.key);
  url.searchParams.set('file_type', 'json');
  // 이게 없으면 '이미 데이터가 올라온 날'만 와서 앞으로의 일정이 빠진다
  url.searchParams.set('include_release_dates_with_no_data', 'true');
  url.searchParams.set('realtime_start', kstDateKey(now.getTime() - LOOKBACK_DAYS * DAY_MS));
  url.searchParams.set('realtime_end', kstDateKey(now.getTime() + LOOKAHEAD_DAYS * DAY_MS));
  url.searchParams.set('sort_order', 'asc');
  url.searchParams.set('limit', String(limit));
  return url.toString();
}

/**
 * 발표 일정을 받아 화면이 쓰는 형태로 돌려준다.
 *
 * FRED 는 수백 개 release 를 한 번에 주므로 limit 을 크게 잡고, 규칙에 없는 것은
 * 정규화 단계에서 버린다. 서버가 준 것보다 적게 남는 것이 정상이다.
 */
export async function fetchFredCalendar(cfg: FredCalendarConfig, now: Date): Promise<CalendarEvent[]> {
  const raw = await fetchJson<ReleaseDatesResponse>(buildUrl(cfg, now, 1000));
  if (!Array.isArray(raw.release_dates)) {
    throw new Error('FRED 발표 일정 응답에 release_dates 배열이 없습니다.');
  }
  const releases = normalizeReleaseDates(raw.release_dates, FRED_CALENDAR_SOURCE);
  const fomc = fomcEvents(
    kstDateKey(now.getTime() - LOOKBACK_DAYS * DAY_MS),
    kstDateKey(now.getTime() + LOOKAHEAD_DAYS * DAY_MS),
    FOMC_CALENDAR_SOURCE,
  );
  return mergeEvents(releases, fomc);
}

/**
 * 점검용 — FRED 가 실제로 어떤 release 이름을 주는지 그대로 돌려준다.
 *
 * 규칙표(RELEASE_RULES)의 이름은 실제 응답을 보고 확정해야 한다. 이 함수가
 * `npm run check:live` 에서 원문 이름을 찍어 주므로, 표와 대조해 고칠 수 있다.
 * 추측한 이름이 코드에 그대로 남지 않게 하려고 둔 장치다.
 */
export async function fetchFredReleaseNames(cfg: FredCalendarConfig, now: Date): Promise<string[]> {
  const raw = await fetchJson<ReleaseDatesResponse>(buildUrl(cfg, now, 1000));
  if (!Array.isArray(raw.release_dates)) return [];
  const names = new Set<string>();
  for (const row of raw.release_dates) {
    if (row !== null && typeof row === 'object' && !Array.isArray(row)) {
      const name = (row as { release_name?: unknown }).release_name;
      if (typeof name === 'string' && name.trim() !== '') names.add(name.trim());
    }
  }
  return [...names].sort();
}
