/**
 * 세계은행 공개 API — 나라별 연간 통계 (키 불필요).
 *
 * 왜 이곳인가
 *  - 1인당 GDP · 지니계수 · 물가상승률 · 실업률 · 구매력평가 환율을 한 형식으로 준다.
 *  - 나라 코드만 바꾸면 한국·중국·일본·미국을 같은 잣대로 받을 수 있다.
 *    "네 나라를 나란히 놓는다" 는 이 화면의 뼈대와 정확히 맞는다.
 *  - 연도별로 수십 년이 쌓여 있어 시계열 그래프를 그릴 수 있다.
 *
 * 약관 (2026-09 기준 확인 필요)
 *  - 공개 데이터. 출처 표기를 요구한다 — 화면에 "세계은행" 을 그대로 노출한다.
 *
 * 응답 모양
 *  [ {page,pages,total,...}, [ {indicator:{id,value}, country:{id,value}, date:"2024", value:36129.9}, ... ] ]
 *  값이 없는 해는 value 가 null 로 온다. 0 으로 바꾸지 않고 빼 버린다.
 */

import { fetchJson } from '@/server/http';
import type { SeriesPoint } from '@/types';

const DEFAULT_BASE = 'https://api.worldbank.org/v2';

export interface WorldBankConfig {
  base: string;
}

export function worldBankConfig(base: string | null): WorldBankConfig {
  return { base: base ?? DEFAULT_BASE };
}

/** 이 앱이 쓰는 세계은행 지표 코드 */
export const WB_INDICATOR = {
  /** 1인당 GDP (현재 미국 달러) */
  per_capita_gdp: 'NY.GDP.PCAP.CD',
  /** 지니계수 (0~100 으로 온다 — 화면은 0~1 로 쓰므로 100 으로 나눈다) */
  gini: 'SI.POV.GINI',
  /** 소비자물가 상승률 (연간 %) */
  inflation: 'FP.CPI.TOTL.ZG',
  /** 실업률 (%) */
  unemployment: 'SL.UEM.TOTL.ZS',
  /** 구매력평가 환율 (자국통화/달러) */
  ppp: 'PA.NUS.PPP',
  /** 시장 환율 (자국통화/달러) */
  fx: 'PA.NUS.FCRF',
} as const;

export type WbIndicator = keyof typeof WB_INDICATOR;

/** 이 앱이 견주는 네 나라 (세계은행 2자리 코드) */
export const WB_COUNTRIES: { code: string; label: string }[] = [
  { code: 'KR', label: '한국' },
  { code: 'CN', label: '중국' },
  { code: 'JP', label: '일본' },
  { code: 'US', label: '미국' },
];

interface WbRow {
  date?: string;
  value?: number | null;
}

/**
 * 한 지표를 네 나라치 한 번에 받는다.
 * 세계은행은 `KR;CN;JP;US` 처럼 세미콜론으로 묶어 조회할 수 있다.
 */
export async function fetchIndicator(
  cfg: WorldBankConfig,
  indicator: WbIndicator,
  years: number,
): Promise<Map<string, SeriesPoint[]>> {
  const codes = WB_COUNTRIES.map((c) => c.code).join(';');
  const url =
    `${cfg.base}/country/${codes}/indicator/${WB_INDICATOR[indicator]}` +
    `?format=json&per_page=${years * WB_COUNTRIES.length}&mrnev=${years}`;

  const raw = await fetchJson<unknown>(url);
  if (!Array.isArray(raw) || raw.length < 2 || !Array.isArray(raw[1])) return new Map();

  const out = new Map<string, SeriesPoint[]>();
  for (const c of WB_COUNTRIES) out.set(c.code, []);

  for (const row of raw[1] as (WbRow & { country?: { id?: string } })[]) {
    const code = row.country?.id;
    const v = row.value;
    const year = Number(row.date);
    if (!code || typeof v !== 'number' || !Number.isFinite(v) || !Number.isFinite(year)) continue;
    const list = out.get(code);
    if (!list) continue;
    list.push({ t: Date.UTC(year, 0, 1), v });
  }

  for (const list of out.values()) list.sort((a, b) => a.t - b.t);
  return out;
}

/** 가장 최근 값 (없으면 null) */
export function latestOf(points: SeriesPoint[] | undefined): SeriesPoint | null {
  return points && points.length > 0 ? points[points.length - 1] : null;
}

/** 마지막 직전 값 */
export function previousOf(points: SeriesPoint[] | undefined): SeriesPoint | null {
  return points && points.length > 1 ? points[points.length - 2] : null;
}

export const WORLDBANK_SOURCE = {
  name: '세계은행',
  url: 'https://data.worldbank.org',
  delayMinutes: 0,
  terms: '공개 데이터. 나라마다 최신 관측 연도가 다를 수 있습니다.',
} as const;
