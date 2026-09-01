/**
 * FRED (세인트루이스 연준) — 미국 거시지표 · 국채금리 · VIX · 하이일드 스프레드.
 *
 * 왜 이곳인가
 *  - 무료 키 하나로 이 앱이 쓰는 미국 거시 계열을 거의 다 덮는다.
 *  - 발표 기관이 분명하고 개정 이력이 남는다. "공식 통계만 담는다" 는 원칙과 맞는다.
 *
 * 약관 (2026-09 기준 확인 필요)
 *  - 무료. 키를 발급받아 요청마다 붙인다. 출처 표기를 요구한다 — 화면에 "FRED" 를 노출한다.
 *  - 시리즈마다 갱신 주기가 다르다 (일별/주별/월별). asOf 는 관측일을 그대로 쓴다.
 */

import { fetchJson } from '@/server/http';
import type { SeriesPoint } from '@/types';

const DEFAULT_BASE = 'https://api.stlouisfed.org/fred';

/** 이 앱이 쓰는 FRED 시리즈 */
export const FRED_SERIES = {
  /* 금리 */
  us_policy_rate: 'DFEDTARU',   // 연방기금금리 목표 상단
  ust2: 'DGS2',                 // 국채 2년
  ust10: 'DGS10',               // 국채 10년
  us_spread: 'T10Y2Y',          // 10년 - 2년
  /* 물가 · 고용 */
  us_cpi: 'CPIAUCSL',           // 소비자물가지수 (전년비는 여기서 계산)
  us_core_pce: 'PCEPILFE',      // 근원 PCE 물가지수
  us_unemployment: 'UNRATE',    // 실업률
  us_nfp: 'PAYEMS',             // 비농업 고용자수 (전월 대비 증감으로 쓴다)
  /* 위험 */
  vix: 'VIXCLS',                // VIX 종가
  hy_oas: 'BAMLH0A0HYM2',       // 하이일드 OAS
  /* 환율 */
  usdkrw: 'DEXKOUS',            // 원/달러 (일별, 뉴욕 기준)
} as const;

export type FredSeriesKey = keyof typeof FRED_SERIES;

export interface FredConfig {
  base: string;
  key: string;
}

export function fredConfig(key: string, base: string | null): FredConfig {
  return { base: base ?? DEFAULT_BASE, key };
}

interface FredObservation {
  date?: string;
  value?: string;
}

interface FredResponse {
  observations?: FredObservation[];
}

/**
 * 시리즈 관측값을 가져온다.
 *
 * FRED 는 결측을 '.' 으로 준다. 이것을 0 으로 바꾸면 값이 통째로 거짓이 되므로
 * 아예 빼 버린다 — 있는 날짜만 남긴다.
 */
export async function fetchSeries(
  cfg: FredConfig,
  key: FredSeriesKey,
  opts: { start?: string; limit?: number } = {},
): Promise<SeriesPoint[]> {
  const id = FRED_SERIES[key];
  const params = new URLSearchParams({
    series_id: id,
    api_key: cfg.key,
    file_type: 'json',
    sort_order: 'asc',
  });
  if (opts.start) params.set('observation_start', opts.start);
  if (opts.limit) {
    params.set('sort_order', 'desc');
    params.set('limit', String(opts.limit));
  }

  const raw = await fetchJson<FredResponse>(`${cfg.base}/series/observations?${params.toString()}`);
  const rows = Array.isArray(raw.observations) ? raw.observations : [];
  const points = rows
    .map((o) => {
      const v = Number(o.value);
      const t = o.date ? Date.parse(`${o.date}T00:00:00Z`) : NaN;
      return { t, v };
    })
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));

  points.sort((a, b) => a.t - b.t);
  return points;
}

/** 가장 최근 관측값 하나 (없으면 null) */
export async function fetchLatest(cfg: FredConfig, key: FredSeriesKey): Promise<SeriesPoint | null> {
  const pts = await fetchSeries(cfg, key, { limit: 12 });
  return pts.length > 0 ? pts[pts.length - 1] : null;
}

/**
 * 전년 대비 상승률(%). 물가지수처럼 '지수'로 오는 계열을 화면에 쓰는 형태로 바꾼다.
 * 12개월 전 값이 없으면 지어내지 않고 null 을 돌려준다.
 */
export function yearOverYear(points: SeriesPoint[]): number | null {
  if (points.length < 13) return null;
  const last = points[points.length - 1];
  const prev = points[points.length - 13];
  if (!prev || prev.v === 0) return null;
  return ((last.v - prev.v) / Math.abs(prev.v)) * 100;
}

/** 전월 대비 증감 (비농업 고용자수처럼 '수준'으로 오는 계열용, 단위 천명) */
export function monthOverMonthDelta(points: SeriesPoint[]): number | null {
  if (points.length < 2) return null;
  return points[points.length - 1].v - points[points.length - 2].v;
}

export const FRED_SOURCE = {
  name: 'FRED (세인트루이스 연준)',
  url: 'https://fred.stlouisfed.org',
  delayMinutes: 0,
  terms: '무료 공개 통계. 시리즈마다 발표 주기와 개정 일정이 다릅니다.',
} as const;
