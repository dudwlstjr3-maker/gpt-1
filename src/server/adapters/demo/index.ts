/**
 * DEMO 어댑터 — API 키 없이도 앱 전체를 확인할 수 있게 하는 고정 샘플 데이터.
 *
 * 규칙
 *  - 실데이터와 절대 섞이지 않는다. 모드는 스냅샷 단위로 하나다.
 *  - 모든 값은 시드 고정이라 재현 가능하다.
 *  - 점수는 하드코딩이 아니라 실제 엔진이 계산한다.
 *  - 뉴스는 실제 매체를 사칭하지 않도록 가상의 샘플 매체명을 쓴다.
 */

import { mulberry32, gaussianFrom, hashSeed } from '@/lib/rng';
import { CATALOG, catalogFor, type CatalogItem } from '@/lib/catalog';
import { getSession } from '@/lib/marketHours';
import { clamp, round } from '@/lib/stats';
import type {
  CalendarEvent,
  DataSource,
  EconomyBasic,
  EventCategory,
  EventImportance,
  FlowSummary,
  MacroIndicator,
  MarketId,
  Meta,
  NewsItem,
  PredictionDigest,
  PredictionMarket,
  Quote,
  RangeKey,
  SeriesPoint,
} from '@/types';
import type { EngineInput } from '@/server/fng/engine';
import { COMPONENTS } from '@/server/fng/definitions';
import type { AdapterContext, BenchmarkSeries, MarketAdapter } from '../types';
import { getWorld, type DemoWorld } from './world';

const DEMO_SOURCE: DataSource = {
  name: 'DEMO 합성 데이터 (실제 시세 아님)',
  delayMinutes: 0,
  terms: '고정 시드로 생성한 샘플입니다. 투자 판단에 사용할 수 없습니다.',
};

/** 시장별 표시 지연(분) — DEMO 에서도 지연 배지 동작을 재현한다. */
const DELAY_MIN: Record<MarketId, number> = { us: 15, kr: 20, crypto: 1 };

/* ------------------------------------------------------------------ */
/* 시리즈 매핑                                                          */
/* ------------------------------------------------------------------ */

interface SeriesRef {
  values: number[];
  dates: number[];
  /** 표시 값으로 변환 */
  scale?: number;
}

function seriesFor(world: DemoWorld, item: CatalogItem): SeriesRef | null {
  const d = world.dates;
  const cd = world.cryptoDates;
  const s = world.s;
  const c = world.c;

  switch (item.id) {
    case 'spx': return { values: s.spx, dates: d };
    case 'ndx': return { values: s.ndx, dates: d };
    case 'dji': return { values: s.dji, dates: d };
    case 'rut': return { values: s.rut, dates: d };
    case 'vix': return { values: s.vix, dates: d };
    case 'ust2': return { values: s.ust2, dates: d };
    case 'ust10': return { values: s.ust10, dates: d };
    case 'us_spread_10_2':
      return { values: s.ust10.map((v, i) => (v - s.ust2[i]) * 100), dates: d };
    case 'dxy': return { values: s.dxy, dates: d };
    case 'gold': return { values: s.gold, dates: d };
    case 'wti': return { values: s.wti, dates: d };
    case 'nvda': return { values: s.nvda, dates: d };
    case 'aapl': return { values: s.aapl, dates: d };
    case 'msft': return { values: s.msft, dates: d };
    case 'amzn': return { values: s.amzn, dates: d };
    case 'tsla': return { values: s.tsla, dates: d };

    case 'kospi': return { values: s.kospi, dates: d };
    case 'kosdaq': return { values: s.kosdaq, dates: d };
    case 'kospi200': return { values: s.kospi200, dates: d };
    case 'vkospi': return { values: s.vkospi, dates: d };
    case 'usdkrw': return { values: s.usdkrw, dates: d };
    case 'ktb3': return { values: s.ktb3, dates: d };
    case 'ktb10': return { values: s.ktb10, dates: d };
    case 'samsung': return { values: s.samsung.map((v) => Math.round(v / 10) * 10), dates: d };
    case 'hynix': return { values: s.hynix.map((v) => Math.round(v / 100) * 100), dates: d };
    case 'hyundai': return { values: s.hyundai.map((v) => Math.round(v / 100) * 100), dates: d };
    case 'naver': return { values: s.naver.map((v) => Math.round(v / 100) * 100), dates: d };
    case 'kakao': return { values: s.kakao.map((v) => Math.round(v / 50) * 50), dates: d };

    case 'btc': return { values: c.btc, dates: cd };
    case 'eth': return { values: c.eth, dates: cd };
    case 'xrp': return { values: c.xrp, dates: cd };
    case 'sol': return { values: c.sol, dates: cd };
    case 'bnb': return { values: c.bnb, dates: cd };
    case 'total_mcap': return { values: c.totalMcap.map((v) => v / 1e9), dates: cd };
    case 'total_vol': return { values: c.totalVol.map((v) => v / 1e9), dates: cd };
    case 'btc_dom': return { values: c.btcDom, dates: cd };
    case 'stable_mcap': return { values: c.stableMcap.map((v) => v / 1e9), dates: cd };
    case 'funding': return { values: c.funding, dates: cd };
    case 'open_interest': return { values: c.openInterest.map((v) => v / 1e9), dates: cd };
    case 'liquidations': return { values: c.liquidations.map((v) => v / 1e9), dates: cd };
    default: return null;
  }
}

/** 결정적 거래량 생성 */
function volumeFor(item: CatalogItem, values: number[], index: number): number | null {
  if (!item.hasVolume) return null;
  const r = mulberry32(hashSeed(item.id) ^ index);
  const prev = values[index - 1] ?? values[index];
  const move = Math.abs((values[index] - prev) / (prev || 1));
  const base =
    item.market === 'kr' && item.kind === 'equity'
      ? 9_000_000
      : item.market === 'us' && item.kind === 'equity'
        ? 42_000_000
        : item.market === 'crypto'
          ? 18_000
          : 620_000_000;
  return Math.round(base * (0.65 + r() * 0.7) * (1 + move * 9));
}

/* ------------------------------------------------------------------ */
/* Quote 생성                                                           */
/* ------------------------------------------------------------------ */

function makeMeta(ctx: AdapterContext, market: MarketId, extraNotes?: string[]): Meta {
  const delay = DELAY_MIN[market];
  const staleShift = ctx.scenario === 'stale' ? 3 * 86400_000 : 0;
  const asOf = new Date(ctx.now.getTime() - delay * 60_000 - staleShift).toISOString();
  return {
    asOf,
    fetchedAt: new Date(ctx.now.getTime() - staleShift).toISOString(),
    freshness: ctx.scenario === 'stale' ? 'stale' : delay > 5 ? 'delayed' : 'live',
    sources: [{ ...DEMO_SOURCE, delayMinutes: delay }],
    ...(extraNotes && extraNotes.length ? { notes: extraNotes } : {}),
  };
}

/** partial 시나리오에서 값이 비는 종목 */
const PARTIAL_BROKEN_QUOTES = new Set(['tsla', 'kakao', 'liquidations']);

function buildQuote(world: DemoWorld, item: CatalogItem, ctx: AdapterContext): Quote {
  const ref = seriesFor(world, item);
  const session = getSession(item.market, ctx.now).phase;

  if (!ref || ref.values.length < 2) {
    return {
      id: item.id,
      name: item.name,
      symbol: item.symbol,
      market: item.market,
      kind: item.kind,
      price: null,
      change: null,
      changePct: null,
      currency: item.currency,
      unit: item.unit,
      precision: item.precision,
      volume: null,
      spark: [],
      session,
      meta: makeMeta(ctx, item.market, ['시계열을 찾을 수 없습니다.']),
      unavailableReason: '데이터 소스 미연결',
    };
  }

  const broken = ctx.scenario === 'partial' && PARTIAL_BROKEN_QUOTES.has(item.id);
  const i = ref.values.length - 1;
  const price = broken ? null : round(ref.values[i], Math.max(item.precision, 4));
  const prev = ref.values[i - 1];
  const change = price === null ? null : round(price - prev, Math.max(item.precision, 4));
  const changePct = price === null || prev === 0 ? null : round(((price - prev) / Math.abs(prev)) * 100, 2);

  const spark: SeriesPoint[] = [];
  const start = Math.max(0, ref.values.length - 30);
  for (let k = start; k < ref.values.length; k += 1) {
    spark.push({ t: ref.dates[k], v: round(ref.values[k], 6) });
  }

  return {
    id: item.id,
    name: item.name,
    symbol: item.symbol,
    market: item.market,
    kind: item.kind,
    price,
    change,
    changePct,
    currency: item.currency,
    unit: item.unit,
    precision: item.precision,
    volume: broken ? null : volumeFor(item, ref.values, i),
    ...(item.hasVolume ? { volumeUnit: 'count' as const } : {}),
    spark: broken ? [] : spark,
    session,
    meta: makeMeta(ctx, item.market, broken ? ['제공사 응답 오류 (DEMO 부분 실패 재현)'] : undefined),
    ...(broken ? { unavailableReason: '제공사 응답 오류로 값을 받지 못했습니다.' } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* 시나리오별 강제 결측                                                   */
/* ------------------------------------------------------------------ */

const PARTIAL_FORCED_MISSING: Record<MarketId, Record<string, string>> = {
  us: {
    us_equity_pcr_5d: '옵션 데이터 제공사 응답 없음 (DEMO 부분 실패 재현)',
  },
  kr: {
    kr_foreign_net_20d: '투자자별 매매동향 수집 실패 (DEMO 부분 실패 재현)',
    kr_inst_net_20d: '투자자별 매매동향 수집 실패 (DEMO 부분 실패 재현)',
    kr_pcr_5d: '파생 통계 응답 지연 (DEMO 부분 실패 재현)',
    kr_margin_chg_20d: '신용잔고 데이터 지연 (DEMO 부분 실패 재현)',
    kosdaq_rel_kospi_60d: '신용잔고 데이터 지연 (DEMO 부분 실패 재현)',
  },
  crypto: {},
};

/* ------------------------------------------------------------------ */
/* 캘린더                                                               */
/* ------------------------------------------------------------------ */

function kstIso(y: number, m: number, d: number, hh: number, mm: number): string {
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00+09:00`;
}

function nthWeekday(y: number, m: number, weekday: number, nth: number): number {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const offset = (weekday - first + 7) % 7;
  return 1 + offset + (nth - 1) * 7;
}

interface EventTemplate {
  key: string;
  title: string;
  country: 'US' | 'KR' | 'GLOBAL';
  category: EventCategory;
  importance: EventImportance;
  forecast: string | null;
  previous: string | null;
  unit: string | null;
  note?: string;
  /** 해당 월의 발표일/시각 계산 */
  when: (y: number, m: number) => { d: number; hh: number; mm: number } | null;
}

const TEMPLATES: EventTemplate[] = [
  {
    key: 'fomc',
    title: 'FOMC 정책금리 결정',
    country: 'US',
    category: 'central_bank',
    importance: 'high',
    forecast: '4.00%',
    previous: '4.25%',
    unit: '%',
    note: '기자회견 03:30 KST',
    when: (y, m) => ([3, 4, 6, 7, 9, 10, 12].includes(m) ? { d: nthWeekday(y, m, 4, 3) + 1, hh: 3, mm: 0 } : null),
  },
  {
    key: 'bok',
    title: '한국은행 금융통화위원회',
    country: 'KR',
    category: 'central_bank',
    importance: 'high',
    forecast: '2.50%',
    previous: '2.50%',
    unit: '%',
    note: '통화정책방향 의결',
    when: (y, m) => ([1, 2, 4, 5, 7, 8, 10, 11].includes(m) ? { d: nthWeekday(y, m, 4, 4), hh: 10, mm: 0 } : null),
  },
  {
    key: 'us_cpi',
    title: '미국 소비자물가지수 (CPI)',
    country: 'US',
    category: 'inflation',
    importance: 'high',
    forecast: '전년비 +2.7%',
    previous: '전년비 +2.9%',
    unit: '%',
    when: (y, m) => ({ d: nthWeekday(y, m, 3, 2), hh: 21, mm: 30 }),
  },
  {
    key: 'us_pce',
    title: '미국 근원 PCE 물가지수',
    country: 'US',
    category: 'inflation',
    importance: 'high',
    forecast: '전년비 +2.6%',
    previous: '전년비 +2.7%',
    unit: '%',
    when: (y, m) => ({ d: Math.min(nthWeekday(y, m, 5, 4) + 1, 28), hh: 22, mm: 30 }),
  },
  {
    key: 'us_nfp',
    title: '미국 고용보고서 (비농업 고용·실업률)',
    country: 'US',
    category: 'employment',
    importance: 'high',
    forecast: '+11.5만 명 / 4.3%',
    previous: '+7.3만 명 / 4.4%',
    unit: '명',
    when: (y, m) => ({ d: nthWeekday(y, m, 5, 1), hh: 22, mm: 30 }),
  },
  {
    key: 'us_ism',
    title: '미국 ISM 제조업 PMI',
    country: 'US',
    category: 'pmi',
    importance: 'medium',
    forecast: '49.2',
    previous: '48.7',
    unit: 'pt',
    when: (y, m) => ({ d: 2, hh: 23, mm: 0 }),
  },
  {
    key: 'kr_cpi',
    title: '한국 소비자물가지수',
    country: 'KR',
    category: 'inflation',
    importance: 'high',
    forecast: '전년비 +2.0%',
    previous: '전년비 +2.1%',
    unit: '%',
    when: () => ({ d: 2, hh: 8, mm: 0 }),
  },
  {
    key: 'kr_pmi',
    title: '한국 S&P Global 제조업 PMI',
    country: 'KR',
    category: 'pmi',
    importance: 'medium',
    forecast: '49.8',
    previous: '49.5',
    unit: 'pt',
    when: () => ({ d: 1, hh: 9, mm: 30 }),
  },
  {
    key: 'us_gdp',
    title: '미국 GDP 성장률 (속보치)',
    country: 'US',
    category: 'gdp',
    importance: 'high',
    forecast: '전기비 연율 +1.8%',
    previous: '+2.1%',
    unit: '%',
    when: (y, m) => ([1, 4, 7, 10].includes(m) ? { d: Math.min(nthWeekday(y, m, 4, 4), 30), hh: 22, mm: 30 } : null),
  },
  {
    key: 'kr_gdp',
    title: '한국 GDP 성장률 (속보치)',
    country: 'KR',
    category: 'gdp',
    importance: 'medium',
    forecast: '전기비 +0.5%',
    previous: '+0.6%',
    unit: '%',
    when: (y, m) => ([1, 4, 7, 10].includes(m) ? { d: Math.min(nthWeekday(y, m, 4, 4) - 2, 28), hh: 8, mm: 0 } : null),
  },
  {
    key: 'kr_expiry',
    title: 'KOSPI200 선물·옵션 동시만기',
    country: 'KR',
    category: 'expiry',
    importance: 'medium',
    forecast: null,
    previous: null,
    unit: null,
    note: '만기일 수급 변동성 확대 가능',
    when: (y, m) => ({ d: nthWeekday(y, m, 4, 2), hh: 15, mm: 20 }),
  },
  {
    key: 'us_expiry',
    title: '미국 주식·지수 옵션 만기',
    country: 'US',
    category: 'expiry',
    importance: 'medium',
    forecast: null,
    previous: null,
    unit: null,
    when: (y, m) => ({ d: nthWeekday(y, m, 5, 3), hh: 5, mm: 0 }),
  },
  {
    key: 'nvda_earnings',
    title: '엔비디아 분기 실적 발표',
    country: 'US',
    category: 'earnings',
    importance: 'high',
    forecast: 'EPS 1.42달러',
    previous: 'EPS 1.31달러',
    unit: 'USD',
    note: '장 마감 후 발표',
    when: (y, m) => ([2, 5, 8, 11].includes(m) ? { d: nthWeekday(y, m, 3, 4), hh: 6, mm: 20 } : null),
  },
  {
    key: 'samsung_earnings',
    title: '삼성전자 잠정 실적 발표',
    country: 'KR',
    category: 'earnings',
    importance: 'high',
    forecast: '영업이익 9.2조원',
    previous: '영업이익 8.4조원',
    unit: 'KRW',
    when: (y, m) => ([1, 4, 7, 10].includes(m) ? { d: 8, hh: 8, mm: 30 } : null),
  },
  {
    key: 'eth_upgrade',
    title: '이더리움 네트워크 업그레이드 예정',
    country: 'GLOBAL',
    category: 'crypto',
    importance: 'medium',
    forecast: null,
    previous: null,
    unit: null,
    note: '메인넷 적용 일정은 변경될 수 있음',
    when: (y, m) => (m % 3 === 2 ? { d: 12, hh: 20, mm: 0 } : null),
  },
  {
    key: 'token_unlock',
    title: '주요 알트코인 대규모 토큰 언락',
    country: 'GLOBAL',
    category: 'crypto',
    importance: 'low',
    forecast: null,
    previous: null,
    unit: null,
    note: '유통량 증가에 따른 변동성 가능',
    when: () => ({ d: 15, hh: 9, mm: 0 }),
  },
  {
    key: 'cme_expiry',
    title: 'CME 비트코인 선물·옵션 만기',
    country: 'GLOBAL',
    category: 'crypto',
    importance: 'medium',
    forecast: null,
    previous: null,
    unit: null,
    note: '만기 전후로 미결제약정이 정리되며 변동성이 커질 수 있음',
    when: (y, m) => ({ d: lastFridayOf(y, m), hh: 0, mm: 0 }),
  },
  {
    key: 'etf_flow',
    title: '비트코인 현물 ETF 주간 순유입 집계',
    country: 'GLOBAL',
    category: 'crypto',
    importance: 'medium',
    forecast: null,
    previous: null,
    unit: null,
    note: '기관 자금의 방향을 읽는 참고 지표',
    when: (y, m) => ({ d: firstMondayOf(y, m), hh: 9, mm: 0 }),
  },
  {
    key: 'stablecoin_supply',
    title: '스테이블코인 총 발행량 월간 점검',
    country: 'GLOBAL',
    category: 'crypto',
    importance: 'low',
    forecast: null,
    previous: null,
    unit: null,
    note: '늘면 대기 매수 여력이 늘었다는 뜻으로 읽는 경우가 많음',
    when: () => ({ d: 1, hh: 9, mm: 0 }),
  },
];

/** 그 달의 마지막 금요일 (CME 만기 관행) */
function lastFridayOf(y: number, m: number): number {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = last; d > last - 7; d -= 1) {
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 5) return d;
  }
  return last;
}

/** 그 달의 첫 월요일 */
function firstMondayOf(y: number, m: number): number {
  for (let d = 1; d <= 7; d += 1) {
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1) return d;
  }
  return 1;
}

/**
 * 일정을 시장으로 접는다.
 * 크립토는 특정 국가에 묶이지 않으므로 country 가 아니라 category 로 판별한다.
 */
function marketOfEvent(country: 'US' | 'KR' | 'GLOBAL', category: EventCategory): MarketId | 'global' {
  if (category === 'crypto') return 'crypto';
  if (country === 'US') return 'us';
  if (country === 'KR') return 'kr';
  return 'global';
}

function buildCalendar(ctx: AdapterContext): CalendarEvent[] {
  const now = ctx.now.getTime();
  const base = new Date(now);
  const out: CalendarEvent[] = [];
  const source: DataSource = { ...DEMO_SOURCE, delayMinutes: 0 };

  for (let offset = -1; offset <= 1; offset += 1) {
    const cursor = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1));
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1;
    for (const t of TEMPLATES) {
      const when = t.when(y, m);
      if (!when) continue;
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const day = clamp(when.d, 1, daysInMonth);
      const iso = kstIso(y, m, day, when.hh, when.mm);
      const t0 = Date.parse(iso);
      if (Number.isNaN(t0)) continue;
      if (t0 < now - 5 * 86400_000 || t0 > now + 32 * 86400_000) continue;
      const past = t0 <= now;
      out.push({
        id: `${t.key}-${y}${String(m).padStart(2, '0')}`,
        title: t.title,
        country: t.country,
        market: marketOfEvent(t.country, t.category),
        category: t.category,
        importance: t.importance,
        scheduledAt: iso,
        timeTbd: false,
        forecast: t.forecast,
        previous: t.previous,
        actual: past && t.forecast ? t.forecast.replace(/(\d+\.\d+)/, (mm2) => (Number(mm2) + 0.1).toFixed(1)) : null,
        unit: t.unit,
        ...(t.note ? { note: t.note } : {}),
        source,
      });
    }
  }
  out.sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  return out;
}

/* ------------------------------------------------------------------ */
/* 뉴스 (가상의 샘플 매체 — 실제 매체를 사칭하지 않는다)                     */
/* ------------------------------------------------------------------ */

interface NewsTemplate {
  summaryKo: string;
  titleOriginal: string;
  outlet: string;
  markets: MarketId[];
  hoursAgo: number;
}

const NEWS_TEMPLATES: NewsTemplate[] = [
  {
    summaryKo: '연준 위원 발언에서 추가 인하 시점에 대한 신중론이 나오며 단기 금리 기대가 소폭 되돌려졌습니다.',
    titleOriginal: '[DEMO] Fed official signals patience on further cuts',
    outlet: '샘플 통신 A',
    markets: ['us'],
    hoursAgo: 2,
  },
  {
    summaryKo: '반도체 업종 중심으로 외국인 순매수가 이어지며 지수 방어력이 유지됐다는 시장 코멘트가 나왔습니다.',
    titleOriginal: '[DEMO] 외국인, 반도체 중심 순매수 지속',
    outlet: '샘플 경제신문 B',
    markets: ['kr'],
    hoursAgo: 4,
  },
  {
    summaryKo: '무기한 선물 펀딩비가 완만한 양수 구간에 머물며 과열 신호는 제한적이라는 분석이 제시됐습니다.',
    titleOriginal: '[DEMO] Perp funding stays mildly positive',
    outlet: '샘플 크립토 미디어 C',
    markets: ['crypto'],
    hoursAgo: 5,
  },
  {
    summaryKo: '원/달러 환율이 장중 변동성을 키우며 수입물가와 외국인 수급에 미칠 영향이 거론됐습니다.',
    titleOriginal: '[DEMO] 원/달러 환율 변동성 확대',
    outlet: '샘플 경제신문 B',
    markets: ['kr'],
    hoursAgo: 7,
  },
  {
    summaryKo: '하이일드 신용스프레드가 최근 범위 상단 부근에 머물며 위험자산 선호가 다소 약화됐다는 평가가 나왔습니다.',
    titleOriginal: '[DEMO] High yield spreads hover near recent highs',
    outlet: '샘플 통신 A',
    markets: ['us'],
    hoursAgo: 9,
  },
  {
    summaryKo: '스테이블코인 시가총액 증가세가 이어지며 대기 매수 여력이 유지되고 있다는 온체인 리포트가 공개됐습니다.',
    titleOriginal: '[DEMO] Stablecoin supply keeps grinding higher',
    outlet: '샘플 리서치 D',
    markets: ['crypto'],
    hoursAgo: 13,
  },
  {
    summaryKo: '중소형주 상대 강도가 개선되며 위험선호가 일부 회복됐다는 관측이 제시됐습니다.',
    titleOriginal: '[DEMO] Small caps narrow the performance gap',
    outlet: '샘플 리서치 D',
    markets: ['us'],
    hoursAgo: 18,
  },
  {
    summaryKo: '옵션 만기를 앞두고 파생 수급에 따른 지수 변동성이 커질 수 있다는 점이 언급됐습니다.',
    titleOriginal: '[DEMO] 만기 주간 파생 수급 주목',
    outlet: '샘플 경제신문 B',
    markets: ['kr', 'us'],
    hoursAgo: 22,
  },
];

/* ------------------------------------------------------------------ */
/* 거시 지표                                                            */
/* ------------------------------------------------------------------ */

/**
 * 발표 주기가 길어 시계열로 만들지 않는 값들.
 *
 * 거시 지표 화면과 생활 속 경제 이야기(미저리 지수 등)이 같은 숫자를 봐야 하므로
 * 양쪽에서 따로 적지 않고 여기 한 곳에 둔다.
 */
const FIXED_MACRO = {
  usCpi: 2.9,
  usCpiPrev: 3.0,
  krCpi: 2.1,
  krCpiPrev: 2.2,
  usUnemployment: 4.4,
  usUnemploymentPrev: 4.3,
  krUnemployment: 2.9,
  krUnemploymentPrev: 3.0,
  cnCpi: 0.3,
  cnUnemployment: 5.2,
  jpCpi: 2.8,
  jpUnemployment: 2.5,
} as const;

function buildMacro(world: DemoWorld, ctx: AdapterContext): MacroIndicator[] {
  const i = world.dates.length - 1;
  const ci = world.cryptoDates.length - 1;
  const s = world.s;
  const c = world.c;
  const meta = makeMeta(ctx, 'us');
  const metaKr = makeMeta(ctx, 'kr');
  const metaCr = makeMeta(ctx, 'crypto');

  const spread = (s.ust10[i] - s.ust2[i]) * 100;
  const spreadPrev = (s.ust10[i - 1] - s.ust2[i - 1]) * 100;

  const mk = (
    id: string,
    name: string,
    group: MacroIndicator['group'],
    value: number | null,
    previous: number | null,
    unit: MacroIndicator['unit'],
    precision: number,
    featured: boolean,
    risk: { level: MacroIndicator['riskLevel']; note: string },
    m: Meta,
    suffix?: string,
    spark?: SeriesPoint[],
  ): MacroIndicator => ({
    id,
    name,
    group,
    value,
    previous,
    unit,
    precision,
    ...(suffix ? { suffix } : {}),
    trend:
      value === null || previous === null
        ? 'unknown'
        : value > previous
          ? 'up'
          : value < previous
            ? 'down'
            : 'flat',
    riskLevel: risk.level,
    riskNote: risk.note,
    featured,
    releaseDate: m.asOf,
    nextRelease: null,
    ...(spark && spark.length ? { spark } : {}),
    meta: m,
  });

  /** 월드 시계열에서 최근 30포인트 스파크라인을 만든다. */
  const sparkOf = (values: number[], dates: number[], scale = 1): SeriesPoint[] => {
    const start = Math.max(0, values.length - 30);
    const out: SeriesPoint[] = [];
    for (let k = start; k < values.length; k += 1) out.push({ t: dates[k], v: round(values[k] * scale, 6) });
    return out;
  };
  const d = world.dates;
  const cd = world.cryptoDates;

  const vixNow = s.vix[i];
  const vkospiNow = s.vkospi[i];
  const usdkrwNow = s.usdkrw[i];
  const hyNow = s.hyOas[i];

  return [
    mk('us_policy_rate', '미국 기준금리', '미국', 4.25, 4.5, 'percent', 2, true,
      { level: 'watch', note: '인하 사이클 진행 중 — 발표 일정 확인' }, meta),
    mk('us_cpi', '미국 CPI (전년비)', '미국', FIXED_MACRO.usCpi, FIXED_MACRO.usCpiPrev, 'percent', 1, true,
      { level: 'watch', note: '목표치 2% 상회' }, meta),
    mk('us_core_pce', '미국 근원 PCE (전년비)', '미국', 2.7, 2.8, 'percent', 1, false,
      { level: 'watch', note: '연준이 가장 중시하는 물가 지표' }, meta),
    mk('us_unemployment', '미국 실업률', '미국', FIXED_MACRO.usUnemployment, FIXED_MACRO.usUnemploymentPrev, 'percent', 1, true,
      { level: 'watch', note: '완만한 상승 추세' }, meta),
    mk('us_nfp', '미국 비농업 고용 (천 명)', '미국', 73, 105, 'count', 0, false,
      { level: 'watch', note: '고용 증가 속도 둔화' }, meta),
    mk('us_pmi', '미국 ISM 제조업 PMI', '미국', 48.7, 49.1, 'point', 1, false,
      { level: 'alert', note: '50 미만 = 위축 국면' }, meta),
    mk('us_spread', '미국 10년-2년 금리차', '미국', round(spread, 1), round(spreadPrev, 1), 'bp', 1, true,
      spread < 0
        ? { level: 'alert', note: '장단기 금리 역전 상태' }
        : spread < 20
          ? { level: 'watch', note: '역전 해소 초기 구간' }
          : { level: 'normal', note: '정상 스프레드' },
      meta, undefined, sparkOf(s.ust10.map((v, k) => (v - s.ust2[k]) * 100), d)),
    mk('dxy', '달러지수 DXY', '글로벌', round(s.dxy[i], 2), round(s.dxy[i - 1], 2), 'point', 2, false,
      s.dxy[i] > 106 ? { level: 'watch', note: '강달러 — 신흥국 자금 유출 압력' } : { level: 'normal', note: '중립 범위' }, meta,
      undefined, sparkOf(s.dxy, d)),
    mk('usdkrw', 'USD/KRW', '글로벌', round(usdkrwNow, 2), round(s.usdkrw[i - 1], 2), 'point', 2, true,
      usdkrwNow > 1420
        ? { level: 'alert', note: '원화 약세 심화 구간' }
        : usdkrwNow > 1380
          ? { level: 'watch', note: '원화 약세 압력' }
          : { level: 'normal', note: '안정 범위' }, metaKr, undefined, sparkOf(s.usdkrw, d)),
    mk('hy_oas', '미국 하이일드 스프레드', '미국', round(hyNow, 2), round(s.hyOas[i - 1], 2), 'percent', 2, true,
      hyNow > 4.5
        ? { level: 'alert', note: '신용 위험 확대' }
        : hyNow > 3.8
          ? { level: 'watch', note: '스프레드 확대 추세' }
          : { level: 'normal', note: '안정 범위' }, meta, undefined, sparkOf(s.hyOas, d)),
    mk('gold', '금 (온스당)', '글로벌', round(s.gold[i], 2), round(s.gold[i - 1], 2), 'currency', 2, false,
      { level: 'normal', note: '안전자산 수요 참고' }, meta, undefined, sparkOf(s.gold, d)),
    mk('wti', 'WTI 원유', '글로벌', round(s.wti[i], 2), round(s.wti[i - 1], 2), 'currency', 2, false,
      s.wti[i] > 95 ? { level: 'watch', note: '유가 상승 — 물가 압력' } : { level: 'normal', note: '중립 범위' }, meta,
      undefined, sparkOf(s.wti, d)),
    mk('spx_pe', 'S&P 500 예상 P/E', '미국', 21.4, 21.1, 'ratio', 1, false,
      { level: 'watch', note: '장기 평균 대비 높은 편' }, meta),
    mk('crypto_mcap', '크립토 전체 시가총액', '크립토', round(c.totalMcap[ci] / 1e9, 1), round(c.totalMcap[ci - 1] / 1e9, 1), 'usd_bn', 1, false,
      { level: 'normal', note: '' }, metaCr, undefined, sparkOf(c.totalMcap, cd, 1 / 1e9)),
    mk('btc_dom', 'BTC 도미넌스', '크립토', round(c.btcDom[ci], 2), round(c.btcDom[ci - 1], 2), 'percent', 2, false,
      c.btcDom[ci] > 58 ? { level: 'watch', note: '알트코인 회피 성향' } : { level: 'normal', note: '' }, metaCr,
      undefined, sparkOf(c.btcDom, cd)),
    mk('vix', 'VIX', '미국', round(vixNow, 2), round(s.vix[i - 1], 2), 'point', 2, true,
      vixNow > 28
        ? { level: 'alert', note: '변동성 급등 — 위험회피 강화' }
        : vixNow > 20
          ? { level: 'watch', note: '경계 구간' }
          : { level: 'normal', note: '안정 구간' }, meta, undefined, sparkOf(s.vix, d)),
  ];
}

/* ------------------------------------------------------------------ */
/* 생활 속 경제 이야기                                                    */
/*                                                                     */
/* 시세가 아니라 "우리 형편이 어느 정도인가"를 재는 숫자들이다.            */
/* 발표 주기가 제각각이라 previous 는 지표마다 다른 시점에서 가져온다.     */
/* 환율이 걸린 값은 DEMO 월드의 USD/KRW 에서 계산해 화면 안에서 앞뒤가     */
/* 맞도록 했다. 실제 발표치가 아니라 합성값이라는 점은 출처에 적혀 있다.   */
/* ------------------------------------------------------------------ */

/** DEMO 에서 쓰는 고정 가격표 — 실제 판매가가 아니라 계산 예시용 수치다. */
const BASIC_PRICES = {
  /* 빅맥 현지 가격 — 통화별 */
  bigmacKrw: 5500,
  bigmacUsd: 5.79,
  bigmacCny: 25.0,
  bigmacJpy: 480,
  /* 오늘의 시장 환율 기준값. DXY 움직임에 맞춰 과거 시점으로 되돌린다 */
  usdCny: 7.1,
  usdJpy: 148.0,
  /* 구매력평가 환율 (OECD·IMF 수준대) */
  pppCnyPerUsd: 4.2,
  pppJpyPerUsd: 100.0,
  /** 처분가능소득 기준 지니계수 (0=완전 평등, 1=완전 불평등) */
  giniKr: 0.323,
  giniKrPrev: 0.324,
  giniCn: 0.465,
  giniJp: 0.334,
  giniUs: 0.395,
  /** 소득 대비 주택가격 배수 */
  pirSeoul: 15.2,
  pirSeoulPrev: 15.8,
  pirBeijing: 23.5,
  pirTokyo: 10.4,
  pirNewYork: 7.1,
  /** OECD 가 계산하는 한국 구매력평가 환율 수준대 */
  pppKrwPerUsd: 891,
  /** 1인당 명목 GDP (원). 달러 환산은 그날 환율로 한다 */
  krGdpPerCapitaKrw: 49_200_000,
  cnGdpPerCapitaUsd: 13_700,
  jpGdpPerCapitaUsd: 34_600,
  usGdpPerCapitaUsd: 89_100,
  /* 엥겔계수 — 나라마다 외식·주류 포함 범위가 달라 그대로 견주기 어렵다 */
  engelKr: 12.9,
  engelKrPrev: 12.6,
  engelCn: 29.8,
  engelJp: 26.2,
  engelUs: 13.0,
  /* 소비자심리지수 — 기준연도와 산출 방식이 나라마다 완전히 다르다 */
  ccsiCn: 88.4,
  ccsiJp: 34.9,
  ccsiUs: 97.6,
} as const;

/**
 * partial 시나리오에서 값이 비는 항목.
 * 분기마다 갱신되고 기관별로 값이 갈리는 PIR 이 실제로도 가장 자주 비는 자리다.
 */
const PARTIAL_BROKEN_BASICS = new Set(['pir']);

function buildBasics(world: DemoWorld, ctx: AdapterContext): EconomyBasic[] {
  const s = world.s;
  const i = world.dates.length - 1;
  /** 발표 주기에 맞춰 과거 시점을 고른다 (거래일 기준) */
  const at = (backDays: number) => Math.max(0, i - backDays);
  const fx = (k: number) => s.usdkrw[k];
  /**
   * 위안·엔 환율.
   * DEMO 월드에 두 통화 시계열이 없어, 오늘 값을 기준으로 잡고 달러지수(DXY)
   * 움직임만큼 과거로 되돌린다. 실제 시세가 아니라 화면 안에서 앞뒤가 맞는 합성값이다.
   */
  const fxRel = (k: number, today: number) => {
    const d0 = s.dxy[world.dates.length - 1];
    return d0 > 0 ? today * (s.dxy[k] / d0) : today;
  };
  const fxCny = (k: number) => fxRel(k, BASIC_PRICES.usdCny);
  const fxJpy = (k: number) => fxRel(k, BASIC_PRICES.usdJpy);

  const B = BASIC_PRICES;
  const meta = makeMeta(ctx, 'kr');
  const broken = ctx.scenario === 'partial';

  /** 통화가 기준 환율보다 몇 % 싸게 거래되는가 (음수 = 저평가). 달러는 기준이라 늘 0 이다. */
  const undervalued = (implied: number, market: number) => (implied / market - 1) * 100;
  const undervaluedKrw = (impliedKrwPerUsd: number, k: number) => undervalued(impliedKrwPerUsd, fx(k));

  const won = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}원`;

  /**
   * 나라 비교는 언제나 한국·중국·일본·미국 순서로 같은 자리에 놓는다.
   * 카드마다 순서가 달라지면 여러 카드를 훑을 때 눈이 자리를 다시 찾아야 한다.
   * 한국이 늘 맨 앞이고 강조 표시가 붙는다.
   */
  const COUNTRIES = ['한국', '중국', '일본', '미국'] as const;

  const fourLabeled = (
    labels: readonly string[],
    values: (number | null)[],
    precision: number,
    suffix: string,
    baseNote?: string,
  ): EconomyBasic['comparisons'] =>
    labels.map((label, k) => ({
      // 달러가 기준인 지표(빅맥·PPP)에서는 미국 자리에 '기준'이라고 적어 준다
      label: baseNote && k === labels.length - 1 ? `${label} (${baseNote})` : label,
      value: values[k],
      precision,
      suffix,
      ...(k === 0 ? { primary: true } : {}),
    }));

  const four = (
    kr: number | null,
    cn: number | null,
    jp: number | null,
    us: number | null,
    precision: number,
    suffix: string,
    baseNote?: string,
  ) => fourLabeled(COUNTRIES, [kr, cn, jp, us], precision, suffix, baseNote);
  /** 부호를 문장으로 풀어 준다. "-28.8% 어긋나 있다"는 읽히지 않는다. */
  const gapWords = (v: number) =>
    v < 0
      ? `원화가 ${round(Math.abs(v), 1)}% 싸게 거래되고 있다`
      : `원화가 ${round(v, 1)}% 비싸게 거래되고 있다`;

  const mk = (
    id: string,
    name: string,
    englishName: string,
    value: number | null,
    previous: number | null,
    precision: number,
    suffix: string,
    reading: string,
    comparisons: EconomyBasic['comparisons'],
    asOfLabel: string,
    official: boolean,
    officialNote?: string,
    comparisonNote?: string,
    /** 비교값들이 같은 잣대가 아니면 false — 화면이 막대를 그리지 않는다 */
    sameScale?: boolean,
  ): EconomyBasic => {
    const missing = broken && PARTIAL_BROKEN_BASICS.has(id);
    return {
      id,
      name,
      englishName,
      value: missing ? null : value,
      previous: missing ? null : previous,
      precision,
      suffix,
      reading: missing ? '이번 갱신에서 값을 받지 못했습니다. 빈 값을 임의로 채우지 않습니다.' : reading,
      comparisons: missing ? comparisons.map((c) => ({ ...c, value: null })) : comparisons,
      asOfLabel,
      official,
      ...(officialNote ? { officialNote } : {}),
      ...(comparisonNote ? { comparisonNote } : {}),
      ...(sameScale === false ? { sameScale: false } : {}),
      meta: missing ? { ...meta, notes: [`${name} 값을 받지 못했습니다.`] } : meta,
    };
  };

  /* ---------- 1인당 GDP ---------- */
  const krGdpNow = BASIC_PRICES.krGdpPerCapitaKrw / fx(i);
  const krGdpPrev = BASIC_PRICES.krGdpPerCapitaKrw / fx(at(250));

  /* ---------- 빅맥 · PPP ---------- */
  const bigmacRate = BASIC_PRICES.bigmacKrw / BASIC_PRICES.bigmacUsd;
  const bigmacNow = undervaluedKrw(bigmacRate, i);
    const pppNow = undervaluedKrw(BASIC_PRICES.pppKrwPerUsd, i);

  /* ---------- 미저리 지수 ---------- */
  /* 지표 화면에 나오는 CPI·실업률을 그대로 더한다. 두 화면의 숫자가 어긋나면 안 된다. */
  const miseryKr = FIXED_MACRO.krCpi + FIXED_MACRO.krUnemployment;
  const miseryKrPrev = FIXED_MACRO.krCpiPrev + FIXED_MACRO.krUnemploymentPrev;
  const miseryUs = FIXED_MACRO.usCpi + FIXED_MACRO.usUnemployment;
  const miseryCn = FIXED_MACRO.cnCpi + FIXED_MACRO.cnUnemployment;
  const miseryJp = FIXED_MACRO.jpCpi + FIXED_MACRO.jpUnemployment;

  /* ---------- OECD 경기선행지수 ---------- */
  /* 100 이 장기 평균. DEMO 에서는 지수의 120일 이격도로 방향을 만든다.
     중국·일본은 월드에 지수 시계열이 없어 다른 계열을 대리로 쓴다. 합성값이다. */
  const cliAt = (vals: number[], k: number) => {
    const from = Math.max(0, k - 120);
    let sum = 0;
    for (let x = from; x <= k; x += 1) sum += vals[x];
    const ma = sum / (k - from + 1);
    return ma > 0 ? clamp(100 + (vals[k] / ma - 1) * 26, 94.5, 106.5) : 100;
  };

  /* ---------- 소비자심리지수 ---------- */
  const ccsiAt = (k: number) => {
    const base = s.kospi[Math.max(0, k - 60)];
    const ret60 = base > 0 ? (s.kospi[k] / base - 1) * 100 : 0;
    return clamp(97.5 + ret60 * 0.62 - Math.max(0, (s.usdkrw[k] - 1380) / 22), 62, 124);
  };

  return [
    mk(
      'per_capita_gdp',
      '1인당 GDP',
      'GDP per capita',
      round(krGdpNow, 0),
      round(krGdpPrev, 0),
      0,
      '달러',
      `한국은 1인당 약 ${Math.round(krGdpNow).toLocaleString('ko-KR')}달러입니다. 미국의 ${round(
        (krGdpNow / BASIC_PRICES.usGdpPerCapitaUsd) * 100,
        0,
      )}%, 중국의 ${round((krGdpNow / BASIC_PRICES.cnGdpPerCapitaUsd) * 100, 0)}% 수준이며, 원화로는 약 ${(BASIC_PRICES.krGdpPerCapitaKrw / 10000).toLocaleString('ko-KR')}만원입니다. 달러 환산액이라 환율이 오르면 그것만으로도 줄어듭니다.`,
      four(
        round(krGdpNow, 0),
        BASIC_PRICES.cnGdpPerCapitaUsd,
        BASIC_PRICES.jpGdpPerCapitaUsd,
        BASIC_PRICES.usGdpPerCapitaUsd,
        0,
        '달러',
      ),
      '연 1회 발표 · 직전 값은 1년 전',
      true,
    ),

    mk(
      'gini',
      '지니계수',
      'Gini coefficient',
      B.giniKr,
      B.giniKrPrev,
      3,
      '',
      `한국은 ${B.giniKr} 입니다. 0에 가까울수록 소득이 고르게 나뉘어 있다는 뜻이고, 0.3 아래면 고른 편으로 봅니다. 바로 위 1인당 GDP 가 "평균 얼마"라면 이 숫자는 "얼마나 고르게 나뉘었나"입니다.`,
      four(B.giniKr, B.giniCn, B.giniJp, B.giniUs, 3, ''),
      '연 1회 발표 · 처분가능소득 기준',
      true,
    ),

    mk(
      'misery',
      '미저리 지수',
      'Misery Index',
      round(miseryKr, 1),
      round(miseryKrPrev, 1),
      1,
      '',
      `한국은 물가상승률 ${FIXED_MACRO.krCpi}% 와 실업률 ${FIXED_MACRO.krUnemployment}% 를 더해 ${round(
        miseryKr,
        1,
      )} 입니다. 절대 기준이 있는 숫자가 아니라 예년이나 다른 나라와 견줄 때 씁니다.`,
      four(round(miseryKr, 1), round(miseryCn, 1), round(miseryJp, 1), round(miseryUs, 1), 1, ''),
      '매월 갱신 · 물가상승률 + 실업률',
      true,
    ),

    mk(
      'bigmac',
      '빅맥지수',
      'Big Mac Index',
      round(bigmacNow, 1),
      round(undervaluedKrw(bigmacRate, at(120)), 1),
      1,
      '%',
      `빅맥 값으로 계산한 환율은 ${won(bigmacRate)}인데 시장 환율은 ${won(
        fx(i),
      )}입니다. 빅맥으로 재보면 ${gapWords(bigmacNow)}는 뜻입니다. 아래 네 나라 숫자는 모두 달러를 기준(0%)으로 놓고 각 통화가 몇 % 어긋나 있는지이며, 마이너스면 그만큼 싸다는 의미입니다.`,
      four(
        round(bigmacNow, 1),
        round(undervalued(BASIC_PRICES.bigmacCny / BASIC_PRICES.bigmacUsd, fxCny(i)), 1),
        round(undervalued(BASIC_PRICES.bigmacJpy / BASIC_PRICES.bigmacUsd, fxJpy(i)), 1),
        0,
        1,
        '%',
        '기준',
      ),
      '연 2회 발표 · 직전 값은 약 6개월 전',
      true,
    ),

    mk(
      'ppp_gap',
      '구매력평가(PPP) 환율 괴리',
      'PPP exchange rate gap',
      round(pppNow, 1),
      round(undervaluedKrw(BASIC_PRICES.pppKrwPerUsd, at(250)), 1),
      1,
      '%',
      `물가 바구니로 계산한 적정 환율은 ${won(BASIC_PRICES.pppKrwPerUsd)}인데 시장 환율은 ${won(
        fx(i),
      )}입니다. 물가로 재보면 ${gapWords(pppNow)}는 뜻이며, 빅맥 하나 대신 수백 개 품목으로 계산했다는 점이 빅맥지수와 다릅니다. 아래 숫자도 달러를 기준(0%)으로 놓은 값입니다.`,
      four(
        round(pppNow, 1),
        round(undervalued(BASIC_PRICES.pppCnyPerUsd, fxCny(i)), 1),
        round(undervalued(BASIC_PRICES.pppJpyPerUsd, fxJpy(i)), 1),
        0,
        1,
        '%',
        '기준',
      ),
      '연 1회 갱신 · 직전 값은 1년 전',
      true,
    ),

    mk(
      'engel',
      '엥겔계수',
      'Engel coefficient',
      B.engelKr,
      B.engelKrPrev,
      1,
      '%',
      `가구가 쓰는 돈 100원 가운데 약 ${Math.round(B.engelKr)}원이 식료품·비주류음료에 들어갑니다. 낮을수록 먹거리 말고 다른 데 쓸 여유가 있다는 뜻으로 읽습니다.`,
      four(B.engelKr, B.engelCn, B.engelJp, B.engelUs, 1, '%'),
      '연 1회 발표 · 직전 값은 1년 전',
      true,
      undefined,
      '나라마다 외식·주류를 포함하는 범위가 달라 소수점까지 견주는 것은 의미가 없습니다. 큰 차이만 보세요.',
    ),

    mk(
      'pir',
      '소득 대비 주택가격 (PIR)',
      'Price to Income Ratio',
      B.pirSeoul,
      B.pirSeoulPrev,
      1,
      '배',
      `서울은 ${B.pirSeoul}배입니다. 소득을 한 푼도 안 쓰고 ${Math.round(
        B.pirSeoul,
      )}년을 모아야 집 한 채 값이 된다는 뜻입니다. 아래는 나라 전체가 아니라 각국 대표 도시끼리의 비교입니다.`,
      fourLabeled(
        ['서울', '베이징', '도쿄', '뉴욕'],
        [B.pirSeoul, B.pirBeijing, B.pirTokyo, B.pirNewYork],
        1,
        '배',
      ),
      '분기 갱신 · 아파트 중위가격 ÷ 가구 중위소득',
      true,
      undefined,
      '나라 전체가 아니라 대표 도시끼리의 비교입니다. 기관마다 정의가 달라 같은 도시도 숫자가 두세 배 차이 납니다.',
    ),

    mk(
      'cli',
      'OECD 경기선행지수',
      'OECD Composite Leading Indicator',
      round(cliAt(s.kospi, i), 1),
      round(cliAt(s.kospi, at(20)), 1),
      1,
      '',
      (() => {
        const now = cliAt(s.kospi, i);
        const prev = cliAt(s.kospi, at(20));
        const level = now >= 100 ? '장기 평균 위' : '장기 평균 아래';
        const dir = now > prev ? '오르는 중' : now < prev ? '내리는 중' : '보합';
        return `한국은 ${round(now, 1)}로 ${level}이고 ${dir}입니다. 수준과 방향을 같이 봐야 하며, 이 숫자 하나로 시점을 잡을 수는 없습니다.`;
      })(),
      four(
        round(cliAt(s.kospi, i), 1),
        round(cliAt(s.cyc, i), 1),
        round(cliAt(s.ndx, i), 1),
        round(cliAt(s.spx, i), 1),
        1,
        '',
      ),
      '매월 발표 · 직전 값은 한 달 전 · 사후 수정 잦음',
      true,
      undefined,
      '네 나라 모두 100이 그 나라의 장기 평균입니다. 그래서 수준끼리 견주는 것보다 각자 100에서 얼마나, 어느 방향으로 벗어났는지를 보는 편이 낫습니다.',
    ),

    mk(
      'ccsi',
      '소비자심리지수',
      'CCSI',
      round(ccsiAt(i), 1),
      round(ccsiAt(at(20)), 1),
      1,
      '',
      ccsiAt(i) >= 100
        ? `${round(ccsiAt(i), 1)}로 기준선 100을 넘습니다. 살림살이와 앞날을 과거 평균보다 낙관적으로 보는 가구가 더 많다는 뜻입니다.`
        : `${round(ccsiAt(i), 1)}로 기준선 100을 밑돕니다. 살림살이와 앞날을 과거 평균보다 비관적으로 보는 가구가 더 많다는 뜻입니다.`,
      four(round(ccsiAt(i), 1), B.ccsiCn, B.ccsiJp, B.ccsiUs, 1, ''),
      '매월 발표 · 직전 값은 한 달 전',
      true,
      undefined,
      '나라마다 기준연도와 산출 방식이 완전히 달라 숫자를 그대로 견주면 안 됩니다. 한국·중국은 100이 중립이고, 일본은 50 부근이 중립, 미국은 1985년을 100으로 둔 지수입니다. 각 나라 안에서 오르내리는 방향만 보세요.',
      // 같은 잣대가 아니라서 막대를 그리지 않는다. 길이를 그려 주면 글로 말려도 눈이 먼저 견준다.
      false,
    ),

  ];
}

/* ------------------------------------------------------------------ */
/* 예측시장                                                             */
/*                                                                     */
/* 실제 폴리마켓 질문을 베끼지 않는다. 뉴스와 같은 규칙이다 — 존재하지     */
/* 않는 샘플 질문을 쓰고 원문 링크를 비워, 진짜 시장으로 오해할 여지를     */
/* 남기지 않는다. 가격만 DEMO 월드에서 끌어와 화면 안에서 앞뒤가 맞게 한다. */
/* ------------------------------------------------------------------ */

function buildPrediction(world: DemoWorld, ctx: AdapterContext): PredictionDigest {
  const s = world.s;
  const c = world.c;
  const i = world.dates.length - 1;
  const ci = world.cryptoDates.length - 1;

  /** 두 선택지짜리 시장을 만든다. p 는 '예' 쪽 가격(0~100). */
  const binary = (
    id: string,
    question: string,
    questionKo: string,
    p: number,
    pPrev: number,
    volume: number,
    closesInDays: number,
  ): PredictionMarket => {
    const yes = clamp(p, 1, 99);
    const yesDelta = yes - clamp(pPrev, 1, 99);
    // 화면은 값이 가장 높은 선택지를 크게 보여준다.
    // 변화폭도 그 선택지 기준이어야 숫자 두 개가 같은 것을 가리킨다.
    const topIsYes = yes >= 50;
    return {
      id,
      question,
      questionKo,
      questionOrigin: 'derived' as const,
      outcomes: ([
        { label: 'Yes', labelKo: '예', price: round(yes, 1) },
        { label: 'No', labelKo: '아니오', price: round(100 - yes, 1) },
      ] as PredictionMarket['outcomes']).sort((a, b) => (b.price ?? 0) - (a.price ?? 0)),
      changeDay: round(topIsYes ? yesDelta : -yesDelta, 1),
      volume24h: Math.round(volume),
      closesAt: new Date(ctx.now.getTime() + closesInDays * 86400_000).toISOString(),
      // DEMO 샘플이라 가리킬 원문이 없다. 없는 링크를 지어내지 않는다.
      url: '',
    };
  };

  // 1) 금리 — 단기금리가 낮을수록 '내린다'에 값이 붙는다
  const cutOdds = (k: number) => clamp(50 + (3.9 - s.ust2[k]) * 46, 3, 97);
  // 2) 비트코인 — 최근 3개월 고점까지의 거리로 값을 매긴다.
  //    DEMO 월드는 난수 행보라 절대 가격을 못 박으면 질문이 늘 한쪽으로 쏠린다.
  const btcOdds = (k: number) => {
    const from = Math.max(0, k - 60);
    let hi = 0;
    for (let x = from; x <= k; x += 1) hi = Math.max(hi, c.btc[x]);
    return hi > 0 ? clamp(50 + (c.btc[k] / hi - 1) * 320, 3, 97) : 50;
  };

  const markets = [
    binary(
      'demo-rate-cut',
      '[DEMO] Will the Fed cut rates below 3.5% this year?',
      '[DEMO] 올해 안에 미국 기준금리가 3.5% 아래로 내려갈까?',
      cutOdds(i),
      cutOdds(Math.max(0, i - 1)),
      1_850_000 + (s.vix[i] - 18) * 90_000,
      118,
    ),
    binary(
      'demo-btc-high',
      '[DEMO] Will Bitcoin top its 3-month high this quarter?',
      '[DEMO] 비트코인이 이번 분기 안에 최근 3개월 고점을 다시 넘을까?',
      btcOdds(ci),
      btcOdds(Math.max(0, ci - 1)),
      2_400_000 + (c.totalVol[ci] / 1e9) * 6_000,
      92,
    ),
  ];

  // 안내는 venue 이름과 출처(DEMO_SOURCE)에 이미 적혀 있다.
  // notes 에 넣으면 섹션이 '부분 실패'로 잡히므로 여기서는 쓰지 않는다.
  const meta = makeMeta(ctx, 'crypto');

  if (ctx.scenario === 'partial') {
    // 한쪽만 값이 비는 상태를 재현한다. 0 으로 채우지 않는다.
    markets[1] = {
      ...markets[1],
      outcomes: markets[1].outcomes.map((o) => ({ ...o, price: null })),
      changeDay: null,
      volume24h: null,
      unavailableReason: '가격을 받지 못했습니다. 값을 임의로 채우지 않습니다.',
    };
  }

  const notes = markets.filter((m) => m.unavailableReason).map((m) => `${m.questionKo ?? m.question}: 값 없음`);

  return {
    venue: 'DEMO 예측시장 (실제 폴리마켓 아님)',
    markets,
    meta: notes.length ? { ...meta, notes } : meta,
  };
}

/* ------------------------------------------------------------------ */
/* 구간별 시계열                                                         */
/* ------------------------------------------------------------------ */

const RANGE_DAYS: Record<RangeKey, number> = { '1D': 1, '1W': 7, '1M': 30, '3M': 92, '1Y': 365, '3Y': 1095 };

function expandWeekly(values: number[], dates: number[], id: string): SeriesPoint[] {
  const take = Math.min(7, values.length);
  const slice = values.slice(-take);
  const dslice = dates.slice(-take);
  const r = mulberry32(hashSeed(`${id}-1w`));
  const g = gaussianFrom(r);
  const out: SeriesPoint[] = [];
  for (let i = 0; i < slice.length - 1; i += 1) {
    const a = slice[i];
    const b = slice[i + 1];
    const ta = dslice[i];
    const tb = dslice[i + 1];
    for (let k = 0; k < 6; k += 1) {
      const w = k / 6;
      const v = a + (b - a) * w + Math.abs(a) * 0.0022 * g();
      out.push({ t: Math.round(ta + (tb - ta) * w), v: round(v, 6) });
    }
  }
  out.push({ t: dslice[dslice.length - 1], v: round(slice[slice.length - 1], 6) });
  return out;
}

/* ------------------------------------------------------------------ */
/* 어댑터                                                               */
/* ------------------------------------------------------------------ */

export class DemoAdapter implements MarketAdapter {
  readonly id = 'demo';
  readonly mode = 'DEMO' as const;

  async getQuotes(market: MarketId, ctx: AdapterContext): Promise<Quote[]> {
    if (ctx.scenario === 'empty') return [];
    const world = getWorld(ctx.now);
    return catalogFor(market).map((item) => buildQuote(world, item, ctx));
  }

  async getFngInput(market: MarketId, ctx: AdapterContext): Promise<EngineInput> {
    const world = getWorld(ctx.now);
    const dates = market === 'crypto' ? world.cryptoDates : world.dates;
    const metrics = world.metrics[market];
    const asOfIso = new Date(ctx.now.getTime() - DELAY_MIN[market] * 60_000).toISOString();
    const metricAsOf: Record<string, string> = {};
    for (const key of Object.keys(metrics)) metricAsOf[key] = asOfIso;

    const sources: Record<string, DataSource[]> = {};
    for (const comp of COMPONENTS[market]) {
      sources[comp.id] = [{ ...DEMO_SOURCE, delayMinutes: DELAY_MIN[market] }];
    }

    const forcedMissing = ctx.scenario === 'partial' ? PARTIAL_FORCED_MISSING[market] : {};

    return {
      market,
      dates,
      metrics: ctx.scenario === 'empty' ? {} : metrics,
      forcedMissing,
      metricAsOf,
      sources,
      freshnessLimitHours: market === 'crypto' ? 6 : 30,
    };
  }

  async getBenchmark(market: MarketId, ctx: AdapterContext): Promise<BenchmarkSeries | null> {
    const world = getWorld(ctx.now);
    const map: Record<MarketId, { id: string; name: string; values: number[]; dates: number[]; precision: number }> = {
      us: { id: 'spx', name: 'S&P 500', values: world.s.spx, dates: world.dates, precision: 2 },
      kr: { id: 'kospi', name: 'KOSPI', values: world.s.kospi, dates: world.dates, precision: 2 },
      crypto: { id: 'btc', name: 'BTC', values: world.c.btc, dates: world.cryptoDates, precision: 0 },
    };
    const m = map[market];
    // 10년 차트에서 점수와 가격을 같이 보려면 비교 가격도 같은 길이여야 한다.
    // 크립토는 달력일이라 같은 10년이라도 필요한 일수가 더 많다.
    const take = Math.min(m.values.length, market === 'crypto' ? 3700 : 2700);
    const values = m.values.slice(-take);
    const dates = m.dates.slice(-take);
    return {
      id: m.id,
      name: m.name,
      series: values.map((v, i) => ({ t: dates[i], v: round(v, 6) })),
      precision: m.precision,
    };
  }

  async getFlows(ctx: AdapterContext): Promise<FlowSummary> {
    const world = getWorld(ctx.now);
    const i = world.dates.length - 1;
    const missing = ctx.scenario === 'partial' || ctx.scenario === 'empty';
    return {
      foreign: missing ? null : world.s.foreignDaily[i],
      institution: missing ? null : world.s.instDaily[i],
      individual: missing ? null : world.s.indivDaily[i],
      unit: 'krw_100m',
      meta: makeMeta(ctx, 'kr', missing ? ['투자자별 매매동향 수집 실패 (DEMO 재현)'] : undefined),
    };
  }

  async getMacro(ctx: AdapterContext): Promise<MacroIndicator[]> {
    if (ctx.scenario === 'empty') return [];
    return buildMacro(getWorld(ctx.now), ctx);
  }

  async getBasics(ctx: AdapterContext): Promise<EconomyBasic[]> {
    if (ctx.scenario === 'empty') return [];
    return buildBasics(getWorld(ctx.now), ctx);
  }

  async getPrediction(ctx: AdapterContext): Promise<PredictionDigest> {
    const world = getWorld(ctx.now);
    if (ctx.scenario === 'empty') {
      return { venue: 'DEMO 예측시장 (실제 폴리마켓 아님)', markets: [], meta: makeMeta(ctx, 'crypto') };
    }
    return buildPrediction(world, ctx);
  }

  async getCalendar(ctx: AdapterContext): Promise<CalendarEvent[]> {
    if (ctx.scenario === 'empty') return [];
    return buildCalendar(ctx);
  }

  async getNews(ctx: AdapterContext): Promise<NewsItem[]> {
    if (ctx.scenario === 'empty') return [];
    const now = ctx.now.getTime();
    return NEWS_TEMPLATES.map((t, i) => ({
      id: `demo-news-${i}`,
      summaryKo: t.summaryKo,
      titleOriginal: t.titleOriginal,
      outlet: t.outlet,
      publishedAt: new Date(now - t.hoursAgo * 3600_000).toISOString(),
      url: '',
      markets: t.markets,
      summaryOrigin: 'derived' as const,
    }));
  }

  async getAssetSeries(id: string, range: RangeKey, ctx: AdapterContext): Promise<SeriesPoint[]> {
    const world = getWorld(ctx.now);
    const item = CATALOG.find((c) => c.id === id);
    if (!item) return [];
    const ref = seriesFor(world, item);
    if (!ref) return [];

    if (range === '1D') {
      const intra = world.intraday[intradayKeyFor(id)];
      if (intra) return intra;
    }
    if (range === '1W') return expandWeekly(ref.values, ref.dates, id);

    const perYear = item.market === 'crypto' ? 365 : 252;
    const days = RANGE_DAYS[range];
    const take = Math.min(ref.values.length, Math.max(10, Math.round((days / 365) * perYear)));
    const values = ref.values.slice(-take);
    const dates = ref.dates.slice(-take);
    return values.map((v, i) => ({ t: dates[i], v: round(v, 6) }));
  }

  async getUsdKrw(ctx: AdapterContext): Promise<number | null> {
    const world = getWorld(ctx.now);
    return round(world.s.usdkrw[world.s.usdkrw.length - 1], 2);
  }
}

/** catalog id → world.intraday 키 */
function intradayKeyFor(id: string): string {
  const map: Record<string, string> = {
    total_mcap: 'totalMcap',
    total_vol: 'totalVol',
    btc_dom: 'btcDom',
    stable_mcap: 'stableMcap',
    open_interest: 'openInterest',
    us_spread_10_2: 'ust10',
  };
  return map[id] ?? id;
}

export const demoAdapter = new DemoAdapter();
