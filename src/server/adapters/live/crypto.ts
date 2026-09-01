/**
 * 크립토 실데이터 조립 — CoinGecko + Binance.
 *
 * 이 시장만 키 없이 실제 숫자가 나온다. 심리 점수도 여기서만 문턱(70%)을 넘긴다.
 *
 * 못 채우는 지표는 지어내지 않고 비운다. 엔진이 그만큼 가중치를 빼고 다시 계산하며,
 * 남은 가중치가 70% 아래면 점수를 숨기고 "산출 불가" 로 표시한다.
 *   · long_liq_share      청산 데이터를 무료로 공개하는 곳이 없다
 *   · exchange_netflow_14d 온체인 순유입은 유료 데이터다
 *   · search_trend / news_sentiment  검색·뉴스 심리는 별도 계약이 필요하다
 */

import type { RawSeries } from '@/server/fng/engine';
import type { EngineInput } from '@/server/fng/engine';
import type { DataSource, SeriesPoint } from '@/types';
import {
  BINANCE_SOURCE,
  fetchFundingHistory,
  fetchOpenInterestHistory,
  type BinanceConfig,
} from './providers/binance';
import {
  COINGECKO_SOURCE,
  fetchCoinSeries,
  fetchGlobal,
  fetchStablecoinMcap,
  fetchTopCoins,
  type CoinGeckoConfig,
} from './providers/coingecko';

const CG: DataSource = { ...COINGECKO_SOURCE };
const BN: DataSource = { ...BINANCE_SOURCE };

/** 하루 간격 격자에 시계열을 맞춘다. 값이 없는 날은 null 로 둔다. */
function alignDaily(points: SeriesPoint[], dates: number[]): RawSeries {
  const byDay = new Map<number, number>();
  for (const p of points) byDay.set(dayKey(p.t), p.v);
  let carried: number | null = null;
  return dates.map((d) => {
    const hit = byDay.get(dayKey(d));
    if (hit !== undefined) {
      carried = hit;
      return hit;
    }
    // 주말·휴일처럼 관측이 없는 날은 직전 값을 그대로 본다 (없던 값을 만들지는 않는다)
    return carried;
  });
}

function dayKey(t: number): number {
  return Math.floor(t / 86400_000);
}

/** 마지막 N일 기준의 날짜 격자 (UTC 자정) */
export function dailyGrid(now: Date, days: number): number[] {
  const end = Math.floor(now.getTime() / 86400_000);
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push((end - i) * 86400_000);
  return out;
}

/** 이동평균 이격도(%) 시계열 */
function maGap(series: RawSeries, window: number): RawSeries {
  return series.map((v, i) => {
    if (v === null || i + 1 < window) return null;
    let sum = 0;
    let n = 0;
    for (let k = i - window + 1; k <= i; k += 1) {
      const x = series[k];
      if (x === null) return null;
      sum += x;
      n += 1;
    }
    if (n === 0) return null;
    const ma = sum / n;
    return ma === 0 ? null : (v / ma - 1) * 100;
  });
}

/** n일 수익률(%) */
function returnPct(series: RawSeries, n: number): RawSeries {
  return series.map((v, i) => {
    const prev = i >= n ? series[i - n] : null;
    if (v === null || prev === null || prev === 0) return null;
    return (v / prev - 1) * 100;
  });
}

/** 30일 실현변동성 (연율 %) */
function realizedVol(series: RawSeries, window: number): RawSeries {
  return series.map((_, i) => {
    if (i + 1 < window + 1) return null;
    const rets: number[] = [];
    for (let k = i - window + 1; k <= i; k += 1) {
      const a = series[k - 1];
      const b = series[k];
      if (a === null || b === null || a === 0) return null;
      rets.push(Math.log(b / a));
    }
    const mean = rets.reduce((x, y) => x + y, 0) / rets.length;
    const varr = rets.reduce((x, y) => x + (y - mean) ** 2, 0) / (rets.length - 1);
    return Math.sqrt(varr) * Math.sqrt(365) * 100;
  });
}

/** 고점 대비 낙폭(%) — 0 에 가까울수록 고점 부근 */
function drawdown(series: RawSeries): RawSeries {
  let peak: number | null = null;
  return series.map((v) => {
    if (v === null) return null;
    peak = peak === null ? v : Math.max(peak, v);
    return peak === 0 ? null : (v / peak - 1) * 100;
  });
}

/** 값 하나를 격자 전체에 마지막 값으로만 채운다 (히스토리가 없는 지표용) */
function lastOnly(dates: number[], value: number | null): RawSeries {
  const out: RawSeries = dates.map(() => null);
  if (value !== null && out.length > 0) out[out.length - 1] = value;
  return out;
}

export interface CryptoLiveDeps {
  cg: CoinGeckoConfig;
  bn: BinanceConfig;
  now: Date;
  /** 격자 길이(일). 엔진의 롤링 분포에 쓰이므로 넉넉히 잡는다. */
  days: number;
}

/**
 * 크립토 심리 점수 입력을 만든다.
 * 한 호출이 실패해도 그 지표만 비우고 나머지는 그대로 간다 — 화면이 통째로 죽지 않게.
 */
export async function buildCryptoFngInput(deps: CryptoLiveDeps): Promise<EngineInput> {
  const { cg, bn, now, days } = deps;
  const dates = dailyGrid(now, days);
  const metrics: Record<string, RawSeries> = {};
  const forcedMissing: Record<string, string> = {};
  const metricAsOf: Record<string, string> = {};

  const soft = async <T>(what: string, ids: string[], run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      for (const id of ids) forcedMissing[id] = `${what} 를 받지 못했습니다: ${why}`;
      return null;
    }
  };

  /* ---------- 모멘텀 ---------- */
  const btc = await soft('BTC 시계열', ['btc_ma100_gap'], () => fetchCoinSeries(cg, 'bitcoin', days));
  if (btc) {
    const s = alignDaily(btc, dates);
    metrics.btc_ma100_gap = maGap(s, 100);
    metrics.btc_vol_30d = realizedVol(s, 30);
    metrics.btc_drawdown = drawdown(s);
    if (btc.length) metricAsOf.btc_ma100_gap = new Date(btc[btc.length - 1].t).toISOString();
  }

  const eth = await soft('ETH 시계열', ['eth_ma100_gap'], () => fetchCoinSeries(cg, 'ethereum', days));
  if (eth) metrics.eth_ma100_gap = maGap(alignDaily(eth, dates), 100);

  const mcap = await soft('전체 시총 시계열', ['total_mcap_ret_30d'], () =>
    fetchCoinSeries(cg, 'bitcoin', days, 'market_caps'),
  );
  if (mcap) metrics.total_mcap_ret_30d = returnPct(alignDaily(mcap, dates), 30);

  /* ---------- 거래량 ---------- */
  const vol = await soft('현물 거래량 시계열', ['spot_vol_ratio_30d'], () =>
    fetchCoinSeries(cg, 'bitcoin', days, 'total_volumes'),
  );
  if (vol) {
    const s = alignDaily(vol, dates);
    metrics.spot_vol_ratio_30d = s.map((v, i) => {
      if (v === null || i < 30) return null;
      let sum = 0;
      for (let k = i - 29; k <= i; k += 1) {
        const x = s[k];
        if (x === null) return null;
        sum += x;
      }
      const avg = sum / 30;
      return avg === 0 ? null : v / avg;
    });
  }

  /* ---------- 파생 ---------- */
  const funding = await soft('펀딩비', ['funding_7d'], () => fetchFundingHistory(bn, 'BTCUSDT', 500));
  if (funding) {
    // 8시간마다 정산되므로 하루 3개를 평균해 일별로 만든다
    const byDay = new Map<number, number[]>();
    for (const p of funding) {
      const k = dayKey(p.t);
      const arr = byDay.get(k) ?? [];
      arr.push(p.v);
      byDay.set(k, arr);
    }
    const daily: SeriesPoint[] = [...byDay.entries()].map(([k, arr]) => ({
      t: k * 86400_000,
      v: arr.reduce((a, b) => a + b, 0) / arr.length,
    }));
    const s = alignDaily(daily, dates);
    metrics.funding_7d = s.map((_, i) => {
      if (i < 6) return null;
      const win = s.slice(i - 6, i + 1);
      if (win.some((x) => x === null)) return null;
      return (win as number[]).reduce((a, b) => a + b, 0) / 7;
    });
    if (funding.length) metricAsOf.funding_7d = new Date(funding[funding.length - 1].t).toISOString();
  }

  const oi = await soft('미결제약정', ['oi_chg_14d'], () =>
    fetchOpenInterestHistory(bn, 'BTCUSDT', '1d', 90),
  );
  if (oi) metrics.oi_chg_14d = returnPct(alignDaily(oi, dates), 14);

  /* ---------- 스테이블코인 ---------- */
  const stable = await soft('스테이블코인 시총', ['stable_mcap_chg_30d'], () => fetchStablecoinMcap(cg));
  if (stable !== null) {
    // 시총 자체는 현재값만 온다. 30일 증감률을 만들 히스토리가 없으므로 비운다.
    forcedMissing.stable_mcap_chg_30d =
      '스테이블코인 시총의 과거 30일 값을 무료로 받을 수 없어 증감률을 계산하지 않았습니다.';
  }

  /* ---------- 도미넌스 · 시장 폭 ---------- */
  const top = await soft('상위 코인 목록', ['top50_above_ma50', 'alt_breadth'], () => fetchTopCoins(cg, 100));
  if (top) {
    const alts = top.filter((c) => c.id !== 'bitcoin');
    const up = alts.filter((c) => (c.change24hPct ?? 0) > 0).length;
    metrics.alt_breadth = lastOnly(dates, alts.length ? (up / alts.length) * 100 : null);
    // 상위 50개의 50일선 상회 비율은 코인마다 시계열을 받아야 해서 무료 한도로는 무리다.
    forcedMissing.top50_above_ma50 =
      '상위 50개 코인의 50일선 상회 비율은 코인마다 시계열이 필요해 무료 한도 안에서 받지 못했습니다.';
  }

  const global = await soft('시장 전체 지표', ['btc_dom_chg_30d'], () => fetchGlobal(cg));
  if (global) {
    forcedMissing.btc_dom_chg_30d =
      'BTC 도미넌스의 과거 30일 값을 무료로 받을 수 없어 변화폭을 계산하지 않았습니다.';
  }

  /* ---------- 무료로는 못 채우는 것 ---------- */
  forcedMissing.long_liq_share = '청산 규모를 무료로 공개하는 제공사가 없습니다.';
  forcedMissing.exchange_netflow_14d = '거래소 순유입은 유료 온체인 데이터입니다.';
  forcedMissing.search_trend = '검색 관심도는 별도 계약이 필요합니다.';
  forcedMissing.news_sentiment = '뉴스 심리는 별도 계약이 필요합니다.';

  const sources: Record<string, DataSource[]> = {
    cr_momentum: [CG],
    cr_volatility: [CG],
    cr_ma_breadth: [CG],
    cr_volume: [CG],
    cr_derivatives: [BN],
    cr_stablecoin: [CG],
    cr_dominance: [CG],
    cr_attention: [],
  };

  return { market: 'crypto', dates, metrics, forcedMissing, metricAsOf, sources };
}
