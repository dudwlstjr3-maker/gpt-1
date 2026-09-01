/**
 * Binance 공개 API — 펀딩비 · 미결제약정.
 *
 * 크립토 심리 점수의 '파생' 구성요소(15%)에 필요한 값인데 CoinGecko 에는 없다.
 * 공개 엔드포인트라 키가 필요 없다.
 *
 * 못 가져오는 것
 *  - 롱 청산 비중(long_liq_share)은 무료로 공개하는 곳이 없다. 지어내지 않고 비운다.
 *    엔진이 그만큼 가중치를 빼고 계산하며, 남은 가중치가 70% 아래로 내려가면
 *    점수를 숨기고 "산출 불가" 로 표시한다.
 *
 * 약관 (2026-09 기준 확인 필요)
 *  - 공개 시장 데이터는 키 없이 조회 가능하고, 가중치 기반 요청 한도가 있다.
 *  - 지역에 따라 접속이 막힐 수 있다. 그때는 이 구성요소만 비고 나머지는 그대로 간다.
 */

import { fetchJson } from '@/server/http';
import type { SeriesPoint } from '@/types';

const DEFAULT_BASE = 'https://fapi.binance.com';

export interface BinanceConfig {
  base: string;
}

export function binanceConfig(base: string | null): BinanceConfig {
  return { base: base ?? DEFAULT_BASE };
}

interface FundingRow {
  symbol?: string;
  fundingRate?: string;
  fundingTime?: number;
}

/**
 * 최근 펀딩비 이력. 8시간마다 한 번 정산되므로 7일이면 21개다.
 * 반환값은 % 단위 (0.0001 → 0.01%).
 */
export async function fetchFundingHistory(cfg: BinanceConfig, symbol: string, limit: number): Promise<SeriesPoint[]> {
  const url = `${cfg.base}/fapi/v1/fundingRate?symbol=${symbol}&limit=${Math.min(limit, 1000)}`;
  const raw = await fetchJson<FundingRow[]>(url);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({ t: Number(r.fundingTime), v: Number(r.fundingRate) * 100 }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
}

interface OpenInterestRow {
  sumOpenInterestValue?: string;
  timestamp?: number;
}

/**
 * 미결제약정(달러 환산) 이력.
 * period 는 '5m' | '1h' | '1d' 등. 무료 엔드포인트는 최근 30일까지만 준다.
 */
export async function fetchOpenInterestHistory(
  cfg: BinanceConfig,
  symbol: string,
  period: '1h' | '4h' | '1d',
  limit: number,
): Promise<SeriesPoint[]> {
  const url = `${cfg.base}/futures/data/openInterestHist?symbol=${symbol}&period=${period}&limit=${Math.min(limit, 500)}`;
  const raw = await fetchJson<OpenInterestRow[]>(url);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({ t: Number(r.timestamp), v: Number(r.sumOpenInterestValue) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
}

export const BINANCE_SOURCE = {
  name: 'Binance 공개 API',
  url: 'https://binance-docs.github.io/apidocs/futures/en/',
  delayMinutes: 1,
  terms: '공개 시장 데이터. 펀딩비는 8시간마다 정산되는 값입니다.',
} as const;
