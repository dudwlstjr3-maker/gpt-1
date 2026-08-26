/**
 * DEMO 세계 — 고정 시드로 만드는 결정적 합성 시장 데이터.
 *
 * 중요:
 *  - 이 데이터는 실제 시세가 아니다. 화면 어디에나 DEMO 배지가 붙는다.
 *  - 실데이터와 절대 섞이지 않는다 (모드는 스냅샷 단위로 하나다).
 *  - 값은 시드 고정이라 새로고침해도 동일하다. 날짜만 오늘 기준으로 이동한다.
 *
 * 여기서 만든 "원시 지표"는 실제 Fear & Greed 엔진에 그대로 투입된다.
 * 즉 DEMO 에서도 점수는 하드코딩이 아니라 실제로 계산된 값이다.
 */

import { gaussianFrom, mulberry32 } from '@/lib/rng';
import {
  clamp,
  drawdownSeries,
  maGapSeries,
  pctChangeSeries,
  realizedVolSeries,
  relativeStrengthSeries,
  rollingMean,
  rollingSum,
  sma,
} from '@/lib/stats';
import { kstDateKey } from '@/lib/format';
import type { MarketId, SeriesPoint } from '@/types';

const SEED = 20260826;
/** 주식 거래일 수 (약 4.5년) */
const TRADING_DAYS = 1160;
/** 크립토 일수 (약 4.1년) */
const CRYPTO_DAYS = 1500;

export interface DemoWorld {
  /** 주식 거래일 (epoch ms, 오름차순) */
  dates: number[];
  /** 크립토 일자 (epoch ms, 오름차순) */
  cryptoDates: number[];
  /** 주식 기준 시계열 */
  s: Record<string, number[]>;
  /** 크립토 기준 시계열 */
  c: Record<string, number[]>;
  /** 시장별 F&G 원시 지표 */
  metrics: Record<MarketId, Record<string, (number | null)[]>>;
  /** 종목별 당일 인트라데이 시계열 */
  intraday: Record<string, SeriesPoint[]>;
}

/* ------------------------------------------------------------------ */
/* 날짜                                                                 */
/* ------------------------------------------------------------------ */

function isWeekend(ms: number): boolean {
  const d = new Date(ms).getUTCDay();
  return d === 0 || d === 6;
}

/** 오늘(KST) 기준으로 과거 거래일 배열을 만든다. 종가 시각은 06:00 UTC(15:00 KST). */
function buildTradingDates(todayKey: string, count: number): number[] {
  const [y, m, d] = todayKey.split('-').map(Number);
  let cursor = Date.UTC(y, m - 1, d, 6, 0, 0);
  const out: number[] = [];
  while (out.length < count) {
    if (!isWeekend(cursor)) out.push(cursor);
    cursor -= 86400000;
  }
  return out.reverse();
}

function buildDailyDates(todayKey: string, count: number): number[] {
  const [y, m, d] = todayKey.split('-').map(Number);
  const end = Date.UTC(y, m - 1, d, 6, 0, 0);
  const out: number[] = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(end - i * 86400000);
  return out;
}

/* ------------------------------------------------------------------ */
/* 기본 프로세스                                                         */
/* ------------------------------------------------------------------ */

/** 평균회귀(OU) 과정 */
function ouSeries(
  n: number,
  g: () => number,
  { start, mean, kappa, sigma, min, max }: { start: number; mean: number; kappa: number; sigma: number; min: number; max: number },
  drive?: (i: number) => number,
): number[] {
  const out: number[] = new Array(n);
  let x = start;
  for (let i = 0; i < n; i += 1) {
    const push = drive ? drive(i) : 0;
    x = x + kappa * (mean - x) + sigma * g() + push;
    x = clamp(x, min, max);
    out[i] = x;
  }
  return out;
}

/** 로지스틱 변환 — 이격도 등을 0~100 비율로 바꿀 때 사용 */
function logistic(x: number, scale: number): number {
  return 100 / (1 + Math.exp(-x / scale));
}

function diffSeries(values: readonly number[], lag: number): (number | null)[] {
  return values.map((v, i) => (i < lag ? null : v - values[i - lag]));
}

function ratioSeries(a: readonly number[], b: readonly number[]): (number | null)[] {
  return a.map((v, i) => {
    const d = b[i];
    if (!Number.isFinite(d) || d === 0) return null;
    return v / d;
  });
}

/* ------------------------------------------------------------------ */
/* 세계 생성                                                            */
/* ------------------------------------------------------------------ */

function generate(todayKey: string): DemoWorld {
  const rand = mulberry32(SEED);
  const g = gaussianFrom(rand);

  const dates = buildTradingDates(todayKey, TRADING_DAYS);
  const cryptoDates = buildDailyDates(todayKey, CRYPTO_DAYS);
  const n = dates.length;

  /* ---------- 공통 위험 요인 (AR(1) + 간헐적 충격) ---------- */
  const riskRet: number[] = new Array(n);
  const volState: number[] = new Array(n);
  let vs = 1;
  let prevShock = 0;
  for (let i = 0; i < n; i += 1) {
    // 변동성 상태: 평균회귀 + 가끔 급등
    const jump = rand() < 0.012 ? 0.9 + rand() * 1.6 : 0;
    vs = clamp(vs + 0.06 * (1 - vs) + 0.09 * g() + jump, 0.45, 4.2);
    volState[i] = vs;
    const shock = g();
    // 약한 자기상관으로 추세 구간을 만든다
    const r = 0.0004 + vs * 0.0072 * (0.82 * shock + 0.18 * prevShock);
    prevShock = shock;
    riskRet[i] = r;
  }

  /** 위험요인 + 고유변동으로 가격 시계열 만들기 */
  const build = (start: number, beta: number, idioVol: number, drift = 0): number[] => {
    const out: number[] = new Array(n);
    let p = start;
    for (let i = 0; i < n; i += 1) {
      const r = drift + beta * riskRet[i] + idioVol * volState[i] * g();
      p = Math.max(p * (1 + r), 0.01);
      out[i] = p;
    }
    return out;
  };

  /* ---------- 미국 ---------- */
  const spx = build(4180, 1, 0.0018);
  const ndx = build(13100, 1.22, 0.0031);
  const dji = build(33800, 0.84, 0.0016);
  const rut = build(1880, 1.18, 0.0042);
  const cyc = build(1000, 1.25, 0.0035);
  const def = build(1000, 0.62, 0.0026);

  const nvda = build(210, 2.05, 0.0135, 0.0011);
  const aapl = build(178, 1.06, 0.0072, 0.0003);
  const msft = build(330, 1.02, 0.0068, 0.0004);
  const amzn = build(132, 1.28, 0.0092, 0.0003);
  const tsla = build(245, 1.72, 0.0165, 0.0001);

  // VIX: 평균회귀 + 주가 하락에 강하게 반응
  const vix: number[] = new Array(n);
  let v = 16.5;
  for (let i = 0; i < n; i += 1) {
    v = clamp(v + 0.11 * (14.5 + 4 * (volState[i] - 1) - v) - 105 * riskRet[i] + 0.55 * g(), 9.4, 78);
    vix[i] = v;
  }
  // VIX3M: 평시 콘탱고, 급등 시 백워데이션
  const vix3m = vix.map((x, i) => clamp(x * (1.12 - 0.0075 * (x - 15)) + 0.25 * g() + 0.02 * i * 0, 9.8, 70));

  const ust10 = ouSeries(n, g, { start: 4.05, mean: 4.15, kappa: 0.012, sigma: 0.045, min: 0.6, max: 6.2 }, (i) => 8 * riskRet[i]);
  const ust2 = ouSeries(n, g, { start: 4.35, mean: 3.98, kappa: 0.014, sigma: 0.048, min: 0.4, max: 6.4 }, (i) => 6 * riskRet[i]);
  const dxy = ouSeries(n, g, { start: 103, mean: 101.5, kappa: 0.01, sigma: 0.33, min: 88, max: 118 }, (i) => -28 * riskRet[i]);
  const gold = build(1980, -0.18, 0.0055, 0.00035);
  const wti = build(78, 0.62, 0.0125, -0.00005);
  const hyOas = ouSeries(n, g, { start: 3.6, mean: 3.35, kappa: 0.02, sigma: 0.055, min: 2.4, max: 11 }, (i) => -34 * riskRet[i]);
  const pcr = ouSeries(n, g, { start: 0.62, mean: 0.63, kappa: 0.09, sigma: 0.045, min: 0.3, max: 1.5 }, (i) => -9 * riskRet[i]);

  /* ---------- 한국 ---------- */
  const krRisk = riskRet.map((r, i) => 0.72 * (i > 0 ? riskRet[i - 1] : r) + 0.28 * r);
  const buildKr = (start: number, beta: number, idio: number, drift = 0): number[] => {
    const out: number[] = new Array(n);
    let p = start;
    for (let i = 0; i < n; i += 1) {
      p = Math.max(p * (1 + drift + beta * krRisk[i] + idio * volState[i] * g()), 0.01);
      out[i] = p;
    }
    return out;
  };

  const kospi = buildKr(2480, 1.05, 0.0035);
  const kosdaq = buildKr(820, 1.28, 0.0058);
  const kospi200 = kospi.map((x, i) => (x / 2480) * 328 * (1 + 0.00004 * Math.sin(i / 40)));
  const samsung = buildKr(68000, 1.15, 0.0072);
  const hynix = buildKr(118000, 1.55, 0.0115, 0.0006);
  const hyundai = buildKr(185000, 0.92, 0.0082);
  const naver = buildKr(205000, 1.12, 0.0105, -0.0002);
  const kakao = buildKr(48000, 1.22, 0.0125, -0.0004);

  const vkospi: number[] = new Array(n);
  let vk = 17.5;
  for (let i = 0; i < n; i += 1) {
    vk = clamp(vk + 0.1 * (15.8 + 4.5 * (volState[i] - 1) - vk) - 95 * krRisk[i] + 0.6 * g(), 10.2, 62);
    vkospi[i] = vk;
  }

  const usdkrw = ouSeries(n, g, { start: 1330, mean: 1355, kappa: 0.008, sigma: 4.6, min: 1080, max: 1560 }, (i) => -900 * riskRet[i]);
  const ktb3 = ouSeries(n, g, { start: 3.35, mean: 3.05, kappa: 0.012, sigma: 0.032, min: 1.1, max: 5.2 }, (i) => 5 * krRisk[i]);
  const ktb10 = ouSeries(n, g, { start: 3.5, mean: 3.28, kappa: 0.011, sigma: 0.035, min: 1.3, max: 5.4 }, (i) => 6 * krRisk[i]);

  // 투자자별 일별 순매수 (억원)
  const foreignDaily = krRisk.map((r) => Math.round(r * 480000 + g() * 2400));
  const instDaily = krRisk.map((r) => Math.round(r * 190000 + g() * 1900));
  const indivDaily = foreignDaily.map((f, i) => -(f + instDaily[i]) + Math.round(g() * 700));
  const marginBalance = ouSeries(n, g, { start: 185000, mean: 190000, kappa: 0.006, sigma: 900, min: 120000, max: 280000 }, (i) => 260000 * krRisk[i]);
  const krPcr = ouSeries(n, g, { start: 0.9, mean: 0.92, kappa: 0.08, sigma: 0.055, min: 0.42, max: 1.9 }, (i) => -11 * krRisk[i]);

  /* ---------- 크립토 (일 단위) ---------- */
  const cn = cryptoDates.length;
  const crand = mulberry32(SEED ^ 0x9e3779b9);
  const cg = gaussianFrom(crand);
  const cRiskRet: number[] = new Array(cn);
  const cVol: number[] = new Array(cn);
  let cv = 1;
  for (let i = 0; i < cn; i += 1) {
    const jump = crand() < 0.014 ? 1.1 + crand() * 2.1 : 0;
    cv = clamp(cv + 0.05 * (1 - cv) + 0.11 * cg() + jump, 0.5, 5);
    cVol[i] = cv;
    cRiskRet[i] = 0.0009 + cv * 0.019 * cg();
  }
  const buildC = (start: number, beta: number, idio: number, drift = 0): number[] => {
    const out: number[] = new Array(cn);
    let p = start;
    for (let i = 0; i < cn; i += 1) {
      p = Math.max(p * (1 + drift + beta * cRiskRet[i] + idio * cVol[i] * cg()), 0.0001);
      out[i] = p;
    }
    return out;
  };

  const btc = buildC(29500, 1, 0.006, 0.0007);
  const eth = buildC(1850, 1.12, 0.0095, 0.0003);
  const xrp = buildC(0.52, 1.18, 0.0165, 0.0002);
  const sol = buildC(24, 1.45, 0.0195, 0.0016);
  const bnb = buildC(240, 0.88, 0.0092, 0.0004);

  const btcDom = ouSeries(cn, cg, { start: 49, mean: 53.5, kappa: 0.006, sigma: 0.28, min: 36, max: 66 }, (i) => -14 * cRiskRet[i]);
  const totalMcap = btc.map((b, i) => (b / btcDom[i]) * 100 * 19_500_000 * (1 + 0.02 * Math.sin(i / 90)));
  const totalVol = totalMcap.map((m, i) => m * (0.035 + 0.02 * cVol[i]) * (0.8 + 0.4 * crand()));
  const stableMcap = ouSeries(cn, cg, { start: 124e9, mean: 150e9, kappa: 0.004, sigma: 4.2e8, min: 90e9, max: 260e9 }, (i) => 2.6e10 * cRiskRet[i]);
  const funding = ouSeries(cn, cg, { start: 0.008, mean: 0.0085, kappa: 0.09, sigma: 0.0055, min: -0.06, max: 0.09 }, (i) => 0.35 * cRiskRet[i]);
  const openInterest = ouSeries(cn, cg, { start: 28e9, mean: 34e9, kappa: 0.008, sigma: 5.5e8, min: 12e9, max: 78e9 }, (i) => 9e10 * cRiskRet[i]);
  const liquidations = cRiskRet.map((r, i) => Math.abs(r) * 1.9e9 * cVol[i] + 3e7 + crand() * 4e7);
  const longLiqShare = cRiskRet.map((r) => clamp(50 - r * 1400 + cg() * 5, 5, 95));
  const exchangeNetflow = cRiskRet.map((r) => -r * 42000 + cg() * 1300);
  const altBreadth = cRiskRet.map((r, i) => clamp(50 + r * 1250 + cg() * 7 - (btcDom[i] - 53.5) * 1.6, 2, 98));
  const newsSent = ouSeries(cn, cg, { start: 52, mean: 51, kappa: 0.06, sigma: 5.5, min: 5, max: 95 }, (i) => 620 * cRiskRet[i]);

  /* ------------------------------------------------------------------ */
  /* 파생 지표                                                            */
  /* ------------------------------------------------------------------ */

  const spxMa50 = sma(spx, 50);
  const spxMa200 = sma(spx, 200);
  const kospiMa50 = sma(kospi, 50);
  const btcMa50 = sma(btc, 50);

  const ret10 = pctChangeSeries(spx, 10);
  const krRet10 = pctChangeSeries(kospi, 10);

  const usMetrics: Record<string, (number | null)[]> = {
    spx_ma125_gap: maGapSeries(spx, 125),
    spx_ret_20d: pctChangeSeries(spx, 20),
    vix_level: vix,
    vix_chg_5d: diffSeries(vix, 5),
    vix_term: ratioSeries(vix3m, vix),
    us_adv_dec_10d: ret10.map((r, i) => (r === null ? null : clamp(1 + 0.11 * r + 0.06 * g(), 0.15, 4.5))),
    us_above_ma50: spx.map((p, i) => {
      const m = spxMa50[i];
      if (m === null) return null;
      return clamp(logistic(((p - m) / m) * 100, 2.4) + 4 * g(), 1, 99);
    }),
    us_above_ma200: spx.map((p, i) => {
      const m = spxMa200[i];
      if (m === null) return null;
      return clamp(logistic(((p - m) / m) * 100, 5.5) + 4 * g(), 1, 99);
    }),
    us_equity_pcr_5d: rollingMean(pcr, 5),
    us_hy_oas: hyOas,
    us_safe_haven: (() => {
      const spxRet20 = pctChangeSeries(spx, 20);
      const y10Diff = diffSeries(ust10, 20);
      return spx.map((_, i) => {
        const a = spxRet20[i];
        const b = y10Diff[i];
        if (a === null || b === null) return null;
        // 국채 총수익률 근사: -듀레이션(8.2) × 금리변화
        return a - -8.2 * b;
      });
    })(),
    us_rut_rel_spx_60d: relativeStrengthSeries(rut, spx, 60),
    us_cyc_rel_def_60d: relativeStrengthSeries(cyc, def, 60),
  };

  const krMetrics: Record<string, (number | null)[]> = {
    kospi_ma125_gap: maGapSeries(kospi, 125),
    kospi_ret_20d: pctChangeSeries(kospi, 20),
    vkospi_level: vkospi,
    vkospi_chg_5d: diffSeries(vkospi, 5),
    kr_adv_dec_10d: krRet10.map((r) => (r === null ? null : clamp(1 + 0.1 * r + 0.07 * g(), 0.15, 4.5))),
    kr_above_ma50: kospi.map((p, i) => {
      const m = kospiMa50[i];
      if (m === null) return null;
      return clamp(logistic(((p - m) / m) * 100, 2.8) + 4.5 * g(), 1, 99);
    }),
    kr_foreign_net_20d: rollingSum(foreignDaily, 20),
    kr_inst_net_20d: rollingSum(instDaily, 20),
    kr_pcr_5d: rollingMean(krPcr, 5),
    usdkrw_ret_20d: pctChangeSeries(usdkrw, 20),
    usdkrw_vol_20d: realizedVolSeries(usdkrw, 20),
    kr_margin_chg_20d: pctChangeSeries(marginBalance, 20),
    kosdaq_rel_kospi_60d: relativeStrengthSeries(kosdaq, kospi, 60),
  };

  const cryptoMetrics: Record<string, (number | null)[]> = {
    btc_ma100_gap: maGapSeries(btc, 100),
    eth_ma100_gap: maGapSeries(eth, 100),
    total_mcap_ret_30d: pctChangeSeries(totalMcap, 30),
    btc_vol_30d: realizedVolSeries(btc, 30, 365),
    btc_drawdown: drawdownSeries(btc),
    top50_above_ma50: btc.map((p, i) => {
      const m = btcMa50[i];
      if (m === null) return null;
      return clamp(logistic(((p - m) / m) * 100, 6) + (altBreadth[i] - 50) * 0.25 + 4 * cg(), 1, 99);
    }),
    spot_vol_ratio_30d: (() => {
      const avg = sma(totalVol, 30);
      return totalVol.map((x, i) => {
        const a = avg[i];
        if (a === null || a === 0) return null;
        return x / a;
      });
    })(),
    funding_7d: rollingMean(funding, 7),
    oi_chg_14d: pctChangeSeries(openInterest, 14),
    long_liq_share: longLiqShare,
    stable_mcap_chg_30d: pctChangeSeries(stableMcap, 30),
    exchange_netflow_14d: rollingSum(exchangeNetflow, 14),
    btc_dom_chg_30d: diffSeries(btcDom, 30),
    alt_breadth: altBreadth,
    news_sentiment: newsSent,
  };

  /* ---------- 인트라데이 (1D 차트용) ---------- */
  const intraday: Record<string, SeriesPoint[]> = {};
  const makeIntraday = (id: string, lastClose: number, prevClose: number, points: number, spanHours: number) => {
    const r = mulberry32(SEED ^ (id.length * 7919) ^ Math.round(lastClose));
    const ig = gaussianFrom(r);
    const end = dates[dates.length - 1];
    const startT = end - spanHours * 3600000;
    const out: SeriesPoint[] = [];
    let p = prevClose;
    const target = lastClose;
    for (let i = 0; i < points; i += 1) {
      const w = (i + 1) / points;
      const drift = (target - p) * (1 / (points - i));
      p = p + drift + Math.abs(target) * 0.0016 * ig() * (1 - w * 0.35);
      out.push({ t: Math.round(startT + ((end - startT) * (i + 1)) / points), v: Math.max(p, 0.0001) });
    }
    out[out.length - 1] = { t: end, v: lastClose };
    return out;
  };

  const registerIntraday = (id: string, arr: number[], span: number, points: number) => {
    intraday[id] = makeIntraday(id, arr[arr.length - 1], arr[arr.length - 2], points, span);
  };

  const s: Record<string, number[]> = {
    spx, ndx, dji, rut, vix, vix3m, ust10, ust2, dxy, gold, wti,
    nvda, aapl, msft, amzn, tsla,
    kospi, kosdaq, kospi200, vkospi, usdkrw, ktb3, ktb10,
    samsung, hynix, hyundai, naver, kakao,
    hyOas, pcr, marginBalance, krPcr,
    foreignDaily, instDaily, indivDaily,
    cyc, def,
  };

  const c: Record<string, number[]> = {
    btc, eth, xrp, sol, bnb, totalMcap, totalVol, btcDom, stableMcap,
    funding, openInterest, liquidations, longLiqShare, altBreadth,
  };

  for (const [id, arr] of Object.entries(s)) registerIntraday(id, arr, 8, 64);
  for (const [id, arr] of Object.entries(c)) registerIntraday(id, arr, 24, 72);

  return {
    dates,
    cryptoDates,
    s,
    c,
    metrics: { us: usMetrics, kr: krMetrics, crypto: cryptoMetrics },
    intraday,
  };
}

/* ------------------------------------------------------------------ */

let cache: { key: string; world: DemoWorld } | null = null;

/** 같은 날에는 항상 같은 세계를 돌려준다. */
export function getWorld(now: Date = new Date()): DemoWorld {
  const key = kstDateKey(now);
  if (cache && cache.key === key) return cache.world;
  const world = generate(key);
  cache = { key, world };
  return world;
}
