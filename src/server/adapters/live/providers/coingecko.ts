/**
 * CoinGecko — 크립토 시세 · 시가총액 · 도미넌스 · 스테이블코인.
 *
 * 왜 이곳인가
 *  - 무료 티어에 키가 필요 없다 (Demo 키를 넣으면 한도가 올라간다).
 *  - 크립토 심리 점수에 필요한 값 대부분이 한 곳에 있다 — 코인 시세, 전체 시총,
 *    BTC 도미넌스, 스테이블코인 시총, 상위 코인 목록, 일별 시계열.
 *
 * 약관 (2026-09 기준 확인 필요)
 *  - 무료 티어는 비상업적 이용과 출처 표기 조건이 붙는다. 화면에 "CoinGecko" 를 그대로 노출한다.
 *  - 분당 요청 한도가 낮다. 섹션 TTL(시세 30초·심리 5분)이 그 안에 들어오도록 잡혀 있다.
 *  - 값은 실시간에 가깝지만 거래소 집계라 체결가와 다를 수 있다. delayMinutes 는 0 이 아니라 1 로 둔다.
 */

import { fetchJson } from '@/server/http';
import type { SeriesPoint } from '@/types';

const DEFAULT_BASE = 'https://api.coingecko.com/api/v3';

/** 카탈로그 id → CoinGecko coin id */
export const COIN_ID: Record<string, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  xrp: 'ripple',
  sol: 'solana',
  bnb: 'binancecoin',
};

export interface CoinGeckoConfig {
  base: string;
  /** 무료 티어는 키 없이도 되지만, 있으면 헤더로 보낸다 */
  key: string | null;
}

function headers(cfg: CoinGeckoConfig): Record<string, string> {
  return cfg.key ? { 'x-cg-demo-api-key': cfg.key } : {};
}

/* ------------------------------------------------------------------ */
/* 시세                                                                */
/* ------------------------------------------------------------------ */

interface SimplePriceRow {
  usd?: number;
  usd_24h_change?: number;
  usd_24h_vol?: number;
  last_updated_at?: number;
}

export interface CoinQuote {
  id: string;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  asOf: string | null;
}

/**
 * 여러 코인의 현재가를 한 번에.
 * 값이 없으면 0 으로 채우지 않고 null 로 둔다 — 화면이 "값 없음"으로 그린다.
 */
export async function fetchCoinQuotes(cfg: CoinGeckoConfig, ids: string[]): Promise<Map<string, CoinQuote>> {
  const coinIds = ids.map((i) => COIN_ID[i]).filter(Boolean);
  if (coinIds.length === 0) return new Map();

  const url =
    `${cfg.base}/simple/price?ids=${coinIds.join(',')}` +
    `&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_last_updated_at=true`;
  const raw = await fetchJson<Record<string, SimplePriceRow>>(url, { headers: headers(cfg) });

  const out = new Map<string, CoinQuote>();
  for (const id of ids) {
    const row = raw[COIN_ID[id]];
    if (!row) continue;
    out.set(id, {
      id,
      price: num(row.usd),
      changePct: num(row.usd_24h_change),
      volume: num(row.usd_24h_vol),
      asOf: row.last_updated_at ? new Date(row.last_updated_at * 1000).toISOString() : null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 시장 전체                                                            */
/* ------------------------------------------------------------------ */

interface GlobalResponse {
  data?: {
    total_market_cap?: Record<string, number>;
    total_volume?: Record<string, number>;
    market_cap_percentage?: Record<string, number>;
    market_cap_change_percentage_24h_usd?: number;
    updated_at?: number;
  };
}

export interface CryptoGlobal {
  totalMcapUsd: number | null;
  totalVolUsd: number | null;
  btcDominancePct: number | null;
  mcapChangePct24h: number | null;
  asOf: string | null;
}

export async function fetchGlobal(cfg: CoinGeckoConfig): Promise<CryptoGlobal> {
  const raw = await fetchJson<GlobalResponse>(`${cfg.base}/global`, { headers: headers(cfg) });
  const d = raw.data ?? {};
  return {
    totalMcapUsd: num(d.total_market_cap?.usd),
    totalVolUsd: num(d.total_volume?.usd),
    btcDominancePct: num(d.market_cap_percentage?.btc),
    mcapChangePct24h: num(d.market_cap_change_percentage_24h_usd),
    asOf: d.updated_at ? new Date(d.updated_at * 1000).toISOString() : null,
  };
}

/* ------------------------------------------------------------------ */
/* 시계열                                                              */
/* ------------------------------------------------------------------ */

interface MarketChartResponse {
  prices?: [number, number][];
  total_volumes?: [number, number][];
  market_caps?: [number, number][];
}

/** 일별 종가 시계열. days 는 조회 일수. */
export async function fetchCoinSeries(
  cfg: CoinGeckoConfig,
  coinId: string,
  days: number,
  field: 'prices' | 'total_volumes' | 'market_caps' = 'prices',
): Promise<SeriesPoint[]> {
  const url = `${cfg.base}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  const raw = await fetchJson<MarketChartResponse>(url, { headers: headers(cfg) });
  return toSeries(raw[field]);
}

/** 시장 전체 시총·거래량 시계열 (도미넌스 계산용으로 BTC 시총도 함께 쓴다) */
export async function fetchGlobalSeries(cfg: CoinGeckoConfig, days: number): Promise<{
  totalMcap: SeriesPoint[];
  totalVol: SeriesPoint[];
}> {
  // CoinGecko 무료 티어에는 전체 시총 시계열 엔드포인트가 없다.
  // 비트코인 시총 ÷ 도미넌스로 되짚는 방법도 있지만 과거 도미넌스를 또 받아야 해서
  // 정확도가 떨어진다. 대신 상위 코인 시총 합으로 근사하지 않고, 있는 것만 돌려준다.
  const btc = await fetchJson<MarketChartResponse>(
    `${cfg.base}/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`,
    { headers: headers(cfg) },
  );
  return { totalMcap: toSeries(btc.market_caps), totalVol: toSeries(btc.total_volumes) };
}

/* ------------------------------------------------------------------ */
/* 상위 코인 (시장 폭 · 알트 상승 비율)                                   */
/* ------------------------------------------------------------------ */

interface MarketRow {
  id: string;
  symbol: string;
  current_price?: number;
  market_cap?: number;
  price_change_percentage_24h?: number;
  sparkline_in_7d?: { price?: number[] };
}

export interface TopCoin {
  id: string;
  symbol: string;
  price: number | null;
  mcap: number | null;
  change24hPct: number | null;
}

/** 시총 상위 N개. 상위 50개의 50일선 상회 비율과 알트 상승 비율에 쓴다. */
export async function fetchTopCoins(cfg: CoinGeckoConfig, n: number): Promise<TopCoin[]> {
  const url =
    `${cfg.base}/coins/markets?vs_currency=usd&order=market_cap_desc` +
    `&per_page=${Math.min(n, 250)}&page=1&sparkline=false&price_change_percentage=24h`;
  const raw = await fetchJson<MarketRow[]>(url, { headers: headers(cfg) });
  return raw.map((r) => ({
    id: r.id,
    symbol: (r.symbol ?? '').toUpperCase(),
    price: num(r.current_price),
    mcap: num(r.market_cap),
    change24hPct: num(r.price_change_percentage_24h),
  }));
}

/** 스테이블코인 시총 합계 (상위 스테이블 몇 개를 더한다) */
export async function fetchStablecoinMcap(cfg: CoinGeckoConfig): Promise<number | null> {
  const url = `${cfg.base}/coins/markets?vs_currency=usd&category=stablecoins&order=market_cap_desc&per_page=20&page=1&sparkline=false`;
  const raw = await fetchJson<MarketRow[]>(url, { headers: headers(cfg) });
  const sum = raw.reduce((a, r) => a + (num(r.market_cap) ?? 0), 0);
  return sum > 0 ? sum : null;
}

/* ------------------------------------------------------------------ */

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toSeries(rows: [number, number][] | undefined): SeriesPoint[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1]))
    .map((r) => ({ t: r[0], v: r[1] }));
}

export const COINGECKO_SOURCE = {
  name: 'CoinGecko',
  url: 'https://www.coingecko.com',
  delayMinutes: 1,
  terms: '무료 티어 — 출처 표기 조건. 거래소 집계값이라 개별 거래소 체결가와 다를 수 있습니다.',
} as const;

export function coinGeckoConfig(key: string | null, base: string | null): CoinGeckoConfig {
  return { base: base ?? DEFAULT_BASE, key };
}
