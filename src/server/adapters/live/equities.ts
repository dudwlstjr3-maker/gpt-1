/**
 * 미국 · 한국 실데이터 조립 — Stooq(시세) + FRED(금리·변동성·환율).
 *
 * 무료로 닿는 것과 닿지 않는 것을 분명히 갈라 둔다.
 * 닿지 않는 지표는 지어내지 않고 사유를 적어 비운다. 엔진이 가중치를 빼고 다시 계산하며,
 * 남은 가중치가 70% 아래면 점수를 숨기고 "산출 불가" 로 표시한다.
 */

import { envUrl } from '@/server/config';
import type { EngineInput, RawSeries } from '@/server/fng/engine';
import type { DataSource, MarketId, SeriesPoint } from '@/types';
import { FRED_SOURCE, fetchSeries, type FredConfig } from './providers/fred';
import { STOOQ_SOURCE, fetchDailySeries, type StooqConfig } from './providers/stooq';
import { CBOE_SOURCE, cboeConfig, fetchEquityPutCall } from './providers/cboe';

const ST: DataSource = { ...STOOQ_SOURCE };
const FR: DataSource = { ...FRED_SOURCE };
const CB: DataSource = { ...CBOE_SOURCE };

function dayKey(t: number): number {
  return Math.floor(t / 86400_000);
}

/** 거래일 격자에 맞춘다. 휴장일은 직전 값을 본다 (없던 값을 만들지는 않는다). */
function align(points: SeriesPoint[], dates: number[]): RawSeries {
  const byDay = new Map<number, number>();
  for (const p of points) byDay.set(dayKey(p.t), p.v);
  let carried: number | null = null;
  return dates.map((d) => {
    const hit = byDay.get(dayKey(d));
    if (hit !== undefined) carried = hit;
    return carried;
  });
}

function grid(now: Date, days: number): number[] {
  const end = Math.floor(now.getTime() / 86400_000);
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push((end - i) * 86400_000);
  return out;
}

function maGap(s: RawSeries, window: number): RawSeries {
  return s.map((v, i) => {
    if (v === null || i + 1 < window) return null;
    let sum = 0;
    for (let k = i - window + 1; k <= i; k += 1) {
      const x = s[k];
      if (x === null) return null;
      sum += x;
    }
    const ma = sum / window;
    return ma === 0 ? null : (v / ma - 1) * 100;
  });
}

function retPct(s: RawSeries, n: number): RawSeries {
  return s.map((v, i) => {
    const prev = i >= n ? s[i - n] : null;
    if (v === null || prev === null || prev === 0) return null;
    return (v / prev - 1) * 100;
  });
}

function diff(a: RawSeries, b: RawSeries): RawSeries {
  return a.map((v, i) => (v === null || b[i] === null ? null : v - (b[i] as number)));
}

function vol(s: RawSeries, window: number): RawSeries {
  return s.map((_, i) => {
    if (i < window) return null;
    const rets: number[] = [];
    for (let k = i - window + 1; k <= i; k += 1) {
      const x = s[k - 1];
      const y = s[k];
      if (x === null || y === null || x === 0) return null;
      rets.push(Math.log(y / x));
    }
    const m = rets.reduce((p, q) => p + q, 0) / rets.length;
    const v = rets.reduce((p, q) => p + (q - m) ** 2, 0) / (rets.length - 1);
    return Math.sqrt(v) * Math.sqrt(252) * 100;
  });
}

export interface EquityDeps {
  stooq: StooqConfig;
  fred: FredConfig | null;
  now: Date;
  days: number;
}

/** 무료 소스로는 닿지 않는 지표와 그 이유 */
const UNAVAILABLE: Record<string, string> = {
  us_new_high_low: '52주 신고가·신저가 종목 수를 무료로 공개하는 제공사가 없습니다.',
  us_volume_breadth: '거래량 기준 등락 누적은 무료로 공개되지 않습니다.',
  vkospi_level: 'VKOSPI 를 무료로 주는 제공사를 찾지 못했습니다.',
  vkospi_chg_5d: 'VKOSPI 를 무료로 주는 제공사를 찾지 못했습니다.',
  kr_adv_dec_10d: '전종목 등락 집계는 무료 한도 안에서 받기 어렵습니다.',
  kr_above_ma50: '전종목 50일선 상회 비율은 무료 한도 안에서 받기 어렵습니다.',
  kr_foreign_net_20d: '투자자별 순매수는 무료 실시간 소스가 없습니다 (증권사 계좌 API 필요).',
  kr_inst_net_20d: '투자자별 순매수는 무료 실시간 소스가 없습니다 (증권사 계좌 API 필요).',
  kr_pcr_5d: 'KOSPI200 풋/콜 비율은 무료로 공개되지 않습니다.',
  kr_margin_chg_20d: '신용융자잔고는 무료 API 로 제공되지 않습니다.',
  kr_deposit_chg_20d: '투자자예탁금은 무료 API 로 제공되지 않습니다.',
};

/** 미국 심리 점수 입력 */
export async function buildUsFngInput(deps: EquityDeps): Promise<EngineInput> {
  const { stooq, fred, now, days } = deps;
  const dates = grid(now, days);
  const metrics: Record<string, RawSeries> = {};
  const forcedMissing: Record<string, string> = { ...pick(UNAVAILABLE, ['us_new_high_low', 'us_volume_breadth']) };
  const metricAsOf: Record<string, string> = {};

  const spx = await soft(() => fetchDailySeries(stooq, 'spx', days), forcedMissing, ['spx_ma125_gap'], 'S&P 500 시계열');
  let spxAligned: RawSeries | null = null;
  if (spx) {
    spxAligned = align(spx, dates);
    metrics.spx_ma125_gap = maGap(spxAligned, 125);
    if (spx.length) metricAsOf.spx_ma125_gap = new Date(spx[spx.length - 1].t).toISOString();
  }

  if (fred) {
    const vix = await soft(() => fetchSeries(fred, 'vix', { start: startOf(now, days) }), forcedMissing, ['vix_ma50_gap'], 'VIX 시계열');
    if (vix) {
      metrics.vix_ma50_gap = maGap(align(vix, dates), 50);
      if (vix.length) metricAsOf.vix_ma50_gap = new Date(vix[vix.length - 1].t).toISOString();
    }

    const hy = await soft(() => fetchSeries(fred, 'hy_oas', { start: startOf(now, days) }), forcedMissing, ['us_hy_oas'], '하이일드 스프레드');
    if (hy) {
      metrics.us_hy_oas = align(hy, dates);
      if (hy.length) metricAsOf.us_hy_oas = new Date(hy[hy.length - 1].t).toISOString();
    }

    const ust = await soft(() => fetchSeries(fred, 'ust10', { start: startOf(now, days) }), forcedMissing, ['us_safe_haven'], '국채 10년');
    if (ust && spxAligned) {
      // 주식 20일 수익률 - 국채 20일 수익률. 국채는 '가격'이 아니라 금리라
      // 금리가 오르면 채권 가격은 내린다 — 부호를 뒤집어 쓴다.
      const bond = retPct(align(ust, dates), 20).map((v) => (v === null ? null : -v));
      metrics.us_safe_haven = diff(retPct(spxAligned, 20), bond);
    }
  } else {
    for (const id of ['vix_ma50_gap', 'us_hy_oas', 'us_safe_haven']) {
      forcedMissing[id] = 'MACRO_API_KEY(FRED) 가 없어 받지 못했습니다.';
    }
  }

  // 풋/콜 비율 — 이 하나가 있어야 미국이 70% 문턱을 넘는다 (57% → 71%)
  const pc = await soft(() => fetchEquityPutCall(cboeConfig(envUrl('CBOE_CSV_URL'))), forcedMissing, ['us_equity_pcr_5d'], '주식 풋/콜 비율');
  if (pc && pc.length > 0) {
    const s5 = align(pc, dates);
    metrics.us_equity_pcr_5d = s5.map((_, i) => {
      if (i < 4) return null;
      const win = s5.slice(i - 4, i + 1);
      if (win.some((x) => x === null)) return null;
      return (win as number[]).reduce((a, b) => a + b, 0) / 5;
    });
    metricAsOf.us_equity_pcr_5d = new Date(pc[pc.length - 1].t).toISOString();
  } else if (pc) {
    forcedMissing.us_equity_pcr_5d = '풋/콜 비율 파일에서 필요한 열을 찾지 못했습니다.';
  }

  return {
    market: 'us',
    dates,
    metrics,
    forcedMissing,
    metricAsOf,
    sources: {
      us_momentum: [ST],
      us_strength: [],
      us_breadth: [],
      us_putcall: [CB],
      us_vix: [FR],
      us_safe_haven: [ST, FR],
      us_junk: [FR],
    },
  };
}

/** 한국 심리 점수 입력 */
export async function buildKrFngInput(deps: EquityDeps): Promise<EngineInput> {
  const { stooq, fred, now, days } = deps;
  const dates = grid(now, days);
  const metrics: Record<string, RawSeries> = {};
  const forcedMissing: Record<string, string> = {
    ...pick(UNAVAILABLE, [
      'vkospi_level', 'vkospi_chg_5d', 'kr_adv_dec_10d', 'kr_above_ma50',
      'kr_foreign_net_20d', 'kr_inst_net_20d', 'kr_pcr_5d',
      'kr_margin_chg_20d', 'kr_deposit_chg_20d',
    ]),
  };
  const metricAsOf: Record<string, string> = {};

  const kospi = await soft(() => fetchDailySeries(stooq, 'kospi', days), forcedMissing, ['kospi_ma125_gap', 'kospi_ret_20d'], 'KOSPI 시계열');
  let kospiAligned: RawSeries | null = null;
  if (kospi) {
    kospiAligned = align(kospi, dates);
    metrics.kospi_ma125_gap = maGap(kospiAligned, 125);
    metrics.kospi_ret_20d = retPct(kospiAligned, 20);
    if (kospi.length) metricAsOf.kospi_ma125_gap = new Date(kospi[kospi.length - 1].t).toISOString();
  }

  const kosdaq = await soft(() => fetchDailySeries(stooq, 'kosdaq', days), forcedMissing, ['kosdaq_rel_kospi_60d'], 'KOSDAQ 시계열');
  if (kosdaq && kospiAligned) {
    metrics.kosdaq_rel_kospi_60d = diff(retPct(align(kosdaq, dates), 60), retPct(kospiAligned, 60));
  }

  if (fred) {
    const fx = await soft(() => fetchSeries(fred, 'usdkrw', { start: startOf(now, days) }), forcedMissing, ['usdkrw_ret_20d', 'usdkrw_vol_20d'], '원/달러 시계열');
    if (fx) {
      const s = align(fx, dates);
      metrics.usdkrw_ret_20d = retPct(s, 20);
      metrics.usdkrw_vol_20d = vol(s, 20);
      if (fx.length) metricAsOf.usdkrw_ret_20d = new Date(fx[fx.length - 1].t).toISOString();
    }
  } else {
    for (const id of ['usdkrw_ret_20d', 'usdkrw_vol_20d']) {
      forcedMissing[id] = 'MACRO_API_KEY(FRED) 가 없어 받지 못했습니다.';
    }
  }

  return {
    market: 'kr',
    dates,
    metrics,
    forcedMissing,
    metricAsOf,
    sources: {
      kr_momentum: [ST],
      kr_vkospi: [],
      kr_breadth: [],
      kr_flows: [],
      kr_derivatives: [],
      kr_fx: [FR],
      kr_credit_kosdaq: [ST],
    },
  };
}

/* ------------------------------------------------------------------ */

function startOf(now: Date, days: number): string {
  return new Date(now.getTime() - (days + 30) * 86400_000).toISOString().slice(0, 10);
}

function pick(src: Record<string, string>, ids: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of ids) if (src[id]) out[id] = src[id];
  return out;
}

/** 한 지표가 실패해도 나머지는 그대로 간다. 실패는 사유로 남긴다. */
async function soft<T>(
  run: () => Promise<T>,
  forcedMissing: Record<string, string>,
  ids: string[],
  what: string,
): Promise<T | null> {
  try {
    return await run();
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    for (const id of ids) forcedMissing[id] = `${what} 를 받지 못했습니다: ${why}`;
    return null;
  }
}
