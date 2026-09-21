/**
 * Yahoo Finance — 지수 · 종목 · 환율 · 원자재 시세.
 *
 * 왜 여기로 옮겼나
 *   Stooq 가 문을 닫았다 (2026-09). 시세 주소가 404 가 되고, 남아 있는 주소는
 *   'Access denied' 로 자동 접근을 막는다. 브라우저에서 직접 확인한 것이라
 *   우리 쪽 문제가 아니고, 되살릴 방법도 없다. 자세한 기록은 stooq.ts 에 남겼다.
 *
 *   대신할 곳의 조건은 넷이었다.
 *     · 키 없이 될 것 — 쓰는 사람이 가입 절차를 하나 더 겪지 않도록
 *     · 데이터센터에서 막히지 않을 것 — 이 앱은 서버에서 부른다
 *     · 미국 지수 · 미국 종목 · 한국 지수 · 환율 · 원자재를 한 곳에서 줄 것
 *     · 하루 요청 한도가 개인 사용에 모자라지 않을 것
 *
 *   무료 키를 주는 곳들(Alpha Vantage 25건/일, Marketstack 100건/월)은 네 번째에서
 *   걸렸다. 이 앱은 한 화면에 41개 종목을 그린다. Yahoo 가 넷을 다 만족한다.
 *
 * ★ 덤으로 얻은 것: 한국 개별 종목
 *   Stooq 에는 한국 종목이 아예 없어서 LIVE 에서 늘 빈칸이었다. Yahoo 는
 *   '005930.KS' 로 준다. 삼성전자 · SK하이닉스 · 현대차 · 네이버 · 카카오가
 *   처음으로 실제 값을 갖는다.
 *
 * ⚠️ 약관에 대해 — 솔직히 적어 둔다
 *   이 주소는 Yahoo 가 문서로 공개한 API 가 아니다. 웹 화면이 쓰는 주소를
 *   그대로 부르는 것이고, 개인적·비상업적 사용은 널리 쓰이지만 Yahoo 가
 *   보장해 준 것은 아니다. 언제든 막힐 수 있다 — Stooq 가 그랬듯이.
 *
 *   그래서 이렇게 지킨다.
 *     · 호출은 http.ts 의 호스트별 요청 제한(초당 5건)을 그대로 거친다
 *     · 화면에 'Yahoo Finance' 를 출처로 밝힌다
 *     · 값을 재배포하거나 저장해 두고 팔지 않는다
 *     · 상업적으로 쓸 일이 생기면 그때는 정식 계약이 있는 곳으로 옮긴다
 *
 *   공식 계약이 필요해지면 Twelve Data · Finnhub 같은 곳에 유료 등급이 있다.
 *   이 파일의 모양(카탈로그 id → 심볼 표 + fetchQuote 하나)을 그대로 두면
 *   갈아타는 일은 심볼 표를 바꾸는 정도로 끝난다.
 */

import { fetchJson } from '@/server/http';
import type { SeriesPoint } from '@/types';

const DEFAULT_BASE = 'https://query1.finance.yahoo.com';

export interface YahooConfig {
  base: string;
}

export function yahooConfig(base: string | null): YahooConfig {
  return { base: base ?? DEFAULT_BASE };
}

/**
 * 카탈로그 id → Yahoo 심볼.
 *
 * 규칙이 몇 가지 섞여 있다.
 *   ^AAA   지수        (^GSPC = S&P 500)
 *   AAA    미국 종목    (NVDA)
 *   AAA.KS 한국 종목    (005930.KS = 삼성전자, 코스피 상장)
 *   AAA=F  선물        (GC=F = 금, CL=F = WTI)
 *   AAA=X  환율        (KRW=X = 원/달러)
 */
export const YAHOO_SYMBOL: Record<string, string> = {
  /* 미국 지수 */
  spx: '^GSPC',
  // 앱이 '나스닥 종합' 이라 부르므로 종합지수(IXIC)다. 나스닥 100(NDX) 이 아니다.
  ndx: '^IXIC',
  dji: '^DJI',
  rut: '^RUT',
  vix: '^VIX',
  dxy: 'DX-Y.NYB',

  /* 미국 종목 */
  nvda: 'NVDA',
  aapl: 'AAPL',
  msft: 'MSFT',
  amzn: 'AMZN',
  tsla: 'TSLA',
  meta: 'META',
  googl: 'GOOGL',
  avgo: 'AVGO',
  amd: 'AMD',
  nflx: 'NFLX',
  pltr: 'PLTR',
  coin: 'COIN',
  mstr: 'MSTR',
  mu: 'MU',
  smci: 'SMCI',

  /* 원자재 — 현물이 아니라 최근월 선물이다. 화면에도 그렇게 적는다. */
  gold: 'GC=F',
  wti: 'CL=F',

  /* 한국 지수 */
  kospi: '^KS11',
  kosdaq: '^KQ11',
  kospi200: '^KS200',

  /* 한국 종목 — Stooq 에는 없던 것들이다 */
  samsung: '005930.KS',
  hynix: '000660.KS',
  hyundai: '005380.KS',
  naver: '035420.KS',
  kakao: '035720.KS',

  /* 환율 */
  usdkrw: 'KRW=X',
};

export interface YahooQuote {
  symbol: string;
  /** 마지막 체결가 */
  price: number | null;
  /** 직전 거래일 종가 — 등락은 이것과 견준다 */
  previousClose: number | null;
  volume: number | null;
  /** 제공사가 준 기준 시각 */
  asOf: string | null;
  /** 최근 30거래일 종가. 스파크라인에 쓴다. */
  spark: SeriesPoint[];
}

/* ------------------------------------------------------------------ */

interface ChartMeta {
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  regularMarketVolume?: number;
  regularMarketTime?: number;
}

interface ChartResponse {
  chart?: {
    result?: {
      meta?: ChartMeta;
      timestamp?: number[];
      indicators?: { quote?: { close?: (number | null)[]; volume?: (number | null)[] }[] };
    }[];
    error?: { code?: string; description?: string } | null;
  };
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * 한 종목의 시세와 최근 추이.
 *
 * 왜 종목마다 따로 부르나
 *   Yahoo 에 여러 종목을 한 번에 묻는 주소(v7/quote)가 있지만, 지금은 쿠키와
 *   crumb 토큰을 요구해서 서버에서 부르기 까다롭다. 이 주소(v8/chart)는 그런
 *   것 없이 답하고, **시세와 추이를 한 번에** 준다 — 예전에는 둘을 따로 불러야
 *   했으니 호출 수가 크게 늘지는 않는다.
 *
 * 값이 없으면 0 으로 채우지 않는다. null 로 두고 화면이 '값 없음' 으로 그린다.
 */
export async function fetchQuote(cfg: YahooConfig, id: string): Promise<YahooQuote | null> {
  const symbol = YAHOO_SYMBOL[id];
  if (!symbol) return null;

  const url =
    `${cfg.base}/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=2mo&interval=1d&includePrePost=false`;
  const raw = await fetchJson<ChartResponse>(url);

  const result = raw.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta ?? {};
  const ts = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];

  const spark: SeriesPoint[] = [];
  for (let i = 0; i < ts.length; i += 1) {
    const v = num(closes[i]);
    // 휴장일은 null 로 온다. 앞 값으로 메우지 않고 그냥 건너뛴다.
    if (v === null) continue;
    spark.push({ t: ts[i] * 1000, v });
  }
  const last30 = spark.slice(-30);

  // 장중이면 meta 가 현재가를 주고, 장이 닫혔으면 마지막 종가가 곧 현재가다
  const price = num(meta.regularMarketPrice) ?? (last30.length ? last30[last30.length - 1].v : null);
  const previousClose = num(meta.previousClose) ?? num(meta.chartPreviousClose) ??
    (last30.length >= 2 ? last30[last30.length - 2].v : null);

  return {
    symbol,
    price,
    previousClose,
    volume: num(meta.regularMarketVolume),
    asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    spark: last30,
  };
}

/**
 * 여러 종목을 한꺼번에.
 * 한 곳이 실패해도 나머지는 그대로 간다 — 한 종목 때문에 화면 전체가 비면 안 된다.
 */
export async function fetchQuotes(cfg: YahooConfig, ids: string[]): Promise<Map<string, YahooQuote>> {
  const wanted = ids.filter((i) => YAHOO_SYMBOL[i]);
  const out = new Map<string, YahooQuote>();
  const settled = await Promise.allSettled(wanted.map((id) => fetchQuote(cfg, id)));
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) out.set(wanted[i], r.value);
  });
  return out;
}

/** 일별 종가 시계열 — 그래프의 긴 구간에 쓴다 */
export async function fetchDailySeries(cfg: YahooConfig, id: string, days: number): Promise<SeriesPoint[]> {
  const symbol = YAHOO_SYMBOL[id];
  if (!symbol) return [];

  // Yahoo 는 날짜 대신 기간 이름을 받는다. 필요한 날수보다 넉넉한 쪽으로 고른다.
  const range = days <= 35 ? '1mo' : days <= 100 ? '3mo' : days <= 200 ? '6mo'
    : days <= 400 ? '1y' : days <= 800 ? '2y' : days <= 1900 ? '5y'
    : days <= 3800 ? '10y' : 'max';

  const url = `${cfg.base}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const raw = await fetchJson<ChartResponse>(url);

  const result = raw.chart?.result?.[0];
  if (!result) return [];
  const ts = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];

  const out: SeriesPoint[] = [];
  for (let i = 0; i < ts.length; i += 1) {
    const v = num(closes[i]);
    if (v === null) continue;
    out.push({ t: ts[i] * 1000, v });
  }
  return out.sort((a, b) => a.t - b.t);
}

export const YAHOO_SOURCE = {
  name: 'Yahoo Finance',
  url: 'https://finance.yahoo.com',
  /**
   * 지연 시간.
   *
   * Yahoo 는 거래소마다 다르게 준다 — 미국 주식은 대체로 실시간에 가깝고,
   * 한국은 15~20분 지연이다. 심볼마다 다른 값을 정확히 알 수 없으므로
   * **더 느린 쪽에 맞춰 15분이라고 적는다.** 모를 때 0(실시간)이라고 적는 것이
   * 더 위험한 거짓말이기 때문이다.
   */
  delayMinutes: 15,
  terms:
    'Yahoo 가 문서로 공개한 API 가 아니라 웹 화면이 쓰는 주소입니다. ' +
    '개인적·비상업적 범위에서 쓰며, 값을 재배포하지 않습니다. 지연 시간은 거래소마다 다릅니다.',
} as const;
