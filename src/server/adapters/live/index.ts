/**
 * LIVE 어댑터 — 실제 데이터 제공사 연결 지점.
 *
 * ▶ 여기가 "실데이터 API 를 붙이는 곳"이다.
 *   각 메서드의 TODO 주석에 적힌 대로 normalize 함수만 채우면 화면 코드는 손대지 않아도 된다.
 *
 * 설계 원칙
 *  - 모든 외부 호출은 fetchJson() 을 통해 나간다 (타임아웃·재시도·호스트별 요청제한 적용).
 *  - API 키는 process.env 에서만 읽는다. 클라이언트로 절대 내려보내지 않는다.
 *  - 키가 없으면 AdapterNotConfiguredError 를 던진다. DEMO 데이터로 대체하지 않는다.
 *    (DEMO 와 LIVE 를 섞지 않기 위한 규칙이다.)
 *  - 제공사 약관에 따라 실시간 재배포가 금지된 경우 delayMinutes 를 정확히 표기한다.
 */

import { envUrl, getKeys } from '@/server/config';
import { AdapterNotConfiguredError, SeriesUnavailableError, fetchJson } from '@/server/http';
import { catalogFor } from '@/lib/catalog';
import { buildCryptoFngInput } from './crypto';
import { buildFredMacro } from './macro';
import { buildLiveBasics } from './basics';
import { bigMacConfig } from './providers/bigmac';
import { worldBankConfig } from './providers/worldbank';
import { binanceConfig, fetchFundingHistory, fetchOpenInterestHistory } from './providers/binance';
import {
  COIN_ID,
  COINGECKO_SOURCE,
  coinGeckoConfig,
  fetchCoinQuotes,
  fetchCoinSeries,
  fetchGlobal,
  fetchStablecoinMcap,
  type CoinGeckoConfig,
} from './providers/coingecko';
import { FRED_SOURCE, fetchLatest, fetchSeries, fredConfig, type FredConfig, type FredSeriesKey } from './providers/fred';
import { fetchFredCalendar, fredCalendarConfig } from './providers/fredCalendar';
import { STOOQ_SOURCE, STOOQ_SYMBOL, fetchDailySeries, fetchQuotes, stooqConfig } from './providers/stooq';
import { buildKrFngInput, buildUsFngInput } from './equities';
import { getSession } from '@/lib/marketHours';
import { COMPONENTS, allMetricIds } from '@/server/fng/definitions';
import type { EngineInput } from '@/server/fng/engine';
import type { RegimeSeries } from '@/server/regime';
import type {
  CalendarEvent,
  DataSource,
  EconomyBasic,
  FlowSummary,
  MacroIndicator,
  MarketId,
  NewsItem,
  PredictionDigest,
  PredictionMarket,
  Quote,
  RangeKey,
  SeriesPoint,
} from '@/types';
import type { AdapterContext, BenchmarkSeries, MarketAdapter } from '../types';

/** 구현이 아직 없는 지점을 명확히 알린다. 조용히 빈 값을 만들지 않는다. */
class NotWiredError extends Error {
  constructor(what: string, where: string) {
    super(`${what} 의 LIVE 연결이 아직 구현되지 않았습니다. 구현 위치: ${where}`);
    this.name = 'NotWiredError';
  }
}

/** 상세 차트를 FRED 에서 받는 종목. 카탈로그 id → FRED 계열 키. */
const ASSET_FRED_SERIES: Record<string, FredSeriesKey | undefined> = {
  ust2: 'ust2',
  ust10: 'ust10',
  us_spread_10_2: 'us_spread',
};

/**
 * 무료로는 과거 시계열을 받을 길이 없는 종목과 그 이유.
 *
 * 값(현재가)은 받아 오지만 지나온 선은 못 그리는 것들이다. 화면이 빈 상자만
 * 보여주면 사람은 고장인 줄 알고 새로고침을 누른다. 그래서 이유를 적어 둔다.
 */
const NO_FREE_SERIES: Record<string, string | undefined> = {
  /* 크립토 시장 전체 지표 — CoinGecko 는 과거 전체 시총·도미넌스를 유료로만 준다 */
  total_mcap: 'CoinGecko 무료 API 는 시장 전체 시가총액의 과거 값을 주지 않습니다 (유료 플랜 전용).',
  total_vol: 'CoinGecko 무료 API 는 전체 거래대금의 과거 값을 주지 않습니다 (유료 플랜 전용).',
  btc_dom: 'CoinGecko 무료 API 는 도미넌스의 과거 값을 주지 않습니다 (유료 플랜 전용).',
  stable_mcap: 'CoinGecko 무료 API 는 스테이블코인 시총의 과거 값을 주지 않습니다 (유료 플랜 전용).',
  liquidations: '청산 규모를 무료로 공개하는 거래소가 없습니다.',
  /* 한국 — 무료 실시간 소스가 없어 시장 자체를 뺐다. 지수 시세만 Stooq 로 남아 있다. */
  kospi200: 'KOSPI 200 은 무료로 과거 시계열을 주는 곳이 없습니다. KOSPI · KOSDAQ 은 지수 화면에 있습니다.',
  vkospi: 'VKOSPI 는 KRX 유료 데이터입니다.',
  ktb3: '국고채 금리는 한국은행 ECOS 연결이 필요합니다.',
  ktb10: '국고채 금리는 한국은행 ECOS 연결이 필요합니다.',
  samsung: '한국 개별주는 무료 실시간·과거 시세 소스가 없습니다 (증권사 계좌 API 가 필요합니다).',
  hynix: '한국 개별주는 무료 실시간·과거 시세 소스가 없습니다 (증권사 계좌 API 가 필요합니다).',
  hyundai: '한국 개별주는 무료 실시간·과거 시세 소스가 없습니다 (증권사 계좌 API 가 필요합니다).',
  naver: '한국 개별주는 무료 실시간·과거 시세 소스가 없습니다 (증권사 계좌 API 가 필요합니다).',
  kakao: '한국 개별주는 무료 실시간·과거 시세 소스가 없습니다 (증권사 계좌 API 가 필요합니다).',
};

/** FRED 는 시작 날짜로 자른다. 여유를 조금 둬야 휴일로 앞이 비지 않는다. */
function startDateFor(range: RangeKey): string {
  const days: Record<RangeKey, number> = { '1D': 7, '1W': 14, '1M': 45, '3M': 120, '1Y': 400, '3Y': 1150 };
  const d = new Date(Date.now() - days[range] * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** 달러 → 십억 달러. 화면이 usd_bn 단위로 그린다. */
function toBn(v: number | null): number | null {
  return v === null ? null : v / 1e9;
}

/** LIVE 는 받은 시각을 그대로 쓴다. 지연 여부는 제공사가 밝힌 값으로 판단한다. */
function meta(asOf: string, fetchedAt: string, source: DataSource, notes?: string[]) {
  const delay = source.delayMinutes ?? null;
  const ageMin = (Date.parse(fetchedAt) - Date.parse(asOf)) / 60_000;
  return {
    asOf,
    fetchedAt,
    freshness: (Number.isFinite(ageMin) && ageMin > 60 ? 'stale' : delay && delay > 5 ? 'delayed' : 'live') as
      | 'live'
      | 'delayed'
      | 'stale',
    sources: [source],
    ...(notes && notes.length ? { notes } : {}),
  };
}

/* ------------------------------------------------------------------ */

export class LiveAdapter implements MarketAdapter {
  readonly id = 'live';
  readonly mode = 'LIVE' as const;

  /* ---------------------------- 시세 ---------------------------- */
  /**
   * TODO(연결지점 1): 시장별 시세.
   *
   * 예시 (제공사 REST):
   *   const raw = await fetchJson<ProviderQuoteResponse>(
   *     `${base}/quotes?symbols=${symbols.join(',')}&apikey=${key}`,
   *   );
   *   return raw.data.map((r) => normalizeQuote(r, item));
   *
   * normalizeQuote 에서 반드시 지킬 것:
   *   - price/change/changePct 는 유한한 숫자가 아니면 null 로 둔다 (0 으로 채우지 않는다).
   *   - meta.asOf 는 제공사가 준 기준 시각을 그대로 쓴다. 없으면 null 처리하고 사유를 notes 에 남긴다.
   *   - meta.sources[].delayMinutes 에 계약상 지연 시간을 정확히 기입한다.
   */
  async getQuotes(market: MarketId, ctx: AdapterContext): Promise<Quote[]> {
    // 크립토는 키 없이 공개 API 로 실제 값을 받는다.
    if (market === 'crypto') return this.cryptoQuotes(ctx);

    // 미국·한국은 Stooq CSV 로 받는다. 키가 없어도 되지만 실시간이 아니라
    // 15분 안팎 지연이며, 그 사실을 배지로 그대로 띄운다.
    return this.stooqQuotes(market);
  }

  /** Stooq 로 지수·종목 시세를 채운다. 심볼이 없는 항목은 사유를 적고 비운다. */
  private async stooqQuotes(market: MarketId): Promise<Quote[]> {
    const cfg = stooqConfig(envUrl(this.baseUrlEnvFor(market)));
    const items = catalogFor(market);
    const ids = items.filter((i) => STOOQ_SYMBOL[i.id]).map((i) => i.id);
    const quotes = await fetchQuotes(cfg, ids).catch(() => new Map());

    const fetchedAt = new Date().toISOString();
    const source: DataSource = { ...STOOQ_SOURCE };
    const session = getSession(market, new Date()).phase;

    return items.map((item) => {
      const base = {
        id: item.id,
        name: item.name,
        symbol: item.symbol,
        market,
        kind: item.kind,
        currency: item.currency,
        unit: item.unit,
        precision: item.precision,
        volume: null as number | null,
        spark: [] as SeriesPoint[],
        session,
      };

      if (!STOOQ_SYMBOL[item.id]) {
        return {
          ...base,
          price: null,
          change: null,
          changePct: null,
          meta: meta(fetchedAt, fetchedAt, source, ['무료 제공사에 이 심볼이 없습니다.']),
          unavailableReason: '무료 제공사에 없는 항목이라 표시하지 않습니다.',
        };
      }

      const q = quotes.get(item.id);
      if (!q || q.close === null) {
        return {
          ...base,
          price: null,
          change: null,
          changePct: null,
          meta: meta(fetchedAt, fetchedAt, source, ['제공사가 값을 주지 않았습니다.']),
          unavailableReason: '제공사가 값을 주지 않았습니다.',
        };
      }

      // Stooq 의 한 줄에는 전일 종가가 없다. 시가 대비 변화로 그날의 움직임을 나타낸다.
      const change = q.open !== null ? q.close - q.open : null;
      const changePct = q.open !== null && q.open !== 0 ? (q.close / q.open - 1) * 100 : null;

      return {
        ...base,
        price: q.close,
        change,
        changePct,
        volume: item.hasVolume ? q.volume : null,
        ...(item.hasVolume ? { volumeUnit: 'count' as const } : {}),
        meta: meta(q.asOf ?? fetchedAt, fetchedAt, source,
          change === null ? ['시가를 받지 못해 등락을 계산하지 않았습니다.'] : undefined),
      };
    });
  }

  /** CoinGecko 로 코인 시세와 시장 전체 값을 채운다. 못 받은 항목은 사유를 남기고 비운다. */
  private async cryptoQuotes(ctx: AdapterContext): Promise<Quote[]> {
    const cg = this.coinGecko();
    const items = catalogFor('crypto');
    const coinIds = items.filter((i) => COIN_ID[i.id]).map((i) => i.id);

    const [quotes, global, stable] = await Promise.all([
      fetchCoinQuotes(cg, coinIds).catch(() => new Map()),
      fetchGlobal(cg).catch(() => null),
      fetchStablecoinMcap(cg).catch(() => null),
    ]);

    const fetchedAt = new Date().toISOString();
    const source: DataSource = { ...COINGECKO_SOURCE };

    return items.map((item) => {
      const base = {
        id: item.id,
        name: item.name,
        symbol: item.symbol,
        market: 'crypto' as const,
        kind: item.kind,
        currency: item.currency,
        unit: item.unit,
        precision: item.precision,
        volume: null as number | null,
        spark: [] as SeriesPoint[],
        session: 'always' as const,
      };

      const coin = quotes.get(item.id);
      if (coin) {
        const prev =
          coin.price !== null && coin.changePct !== null && coin.changePct !== -100
            ? coin.price / (1 + coin.changePct / 100)
            : null;
        return {
          ...base,
          price: coin.price,
          change: coin.price !== null && prev !== null ? coin.price - prev : null,
          changePct: coin.changePct,
          volume: item.hasVolume ? coin.volume : null,
          ...(item.hasVolume ? { volumeUnit: 'usd_bn' as const } : {}),
          meta: meta(coin.asOf ?? fetchedAt, fetchedAt, source),
          ...(coin.price === null ? { unavailableReason: '제공사가 값을 주지 않았습니다.' } : {}),
        };
      }

      // 시장 전체를 재는 값들
      const wide: Record<string, number | null> = {
        total_mcap: global ? toBn(global.totalMcapUsd) : null,
        total_vol: global ? toBn(global.totalVolUsd) : null,
        btc_dom: global ? global.btcDominancePct : null,
        stable_mcap: toBn(stable),
      };
      if (item.id in wide) {
        const v = wide[item.id];
        return {
          ...base,
          price: v,
          change: null,
          changePct: item.id === 'total_mcap' && global ? global.mcapChangePct24h : null,
          meta: meta(global?.asOf ?? fetchedAt, fetchedAt, source),
          ...(v === null ? { unavailableReason: '제공사가 값을 주지 않았습니다.' } : {}),
        };
      }

      // 무료 제공사로 못 받는 항목 (선물 펀딩비·미결제약정·청산)은 사유를 적고 비운다
      return {
        ...base,
        price: null,
        change: null,
        changePct: null,
        meta: meta(fetchedAt, fetchedAt, source, ['무료 제공사에 없는 값입니다.']),
        unavailableReason: '무료 제공사에 없는 값이라 표시하지 않습니다.',
      };
    });
  }

  /* ------------------------ Fear & Greed 입력 ------------------------ */
  /**
   * TODO(연결지점 2): F&G 원시 지표 시계열.
   *
   * 반환할 EngineInput:
   *   dates:   최근 N 일(미국·한국 최소 500 거래일, 크립토 최소 600일)의 오름차순 epoch ms
   *   metrics: definitions.ts 의 subMetric id → 같은 길이의 원시값 배열 (없는 날은 null)
   *   metricAsOf: 지표별 마지막 관측 시각 (신뢰도의 "신선도" 계산에 쓰인다)
   *   sources: componentId → DataSource[]
   *
   * 필요한 지표 id 목록은 allMetricIds(market) 으로 확인할 수 있다.
   * 일부 지표를 아직 붙이지 못했다면 metrics 에서 빼면 된다.
   * 엔진이 자동으로 결측 처리하고, 가중치 70% 미만이면 "산출 불가"로 표시한다.
   */
  async getFngInput(market: MarketId, ctx: AdapterContext): Promise<EngineInput> {
    if (market === 'crypto') {
      return buildCryptoFngInput({
        cg: this.coinGecko(),
        bn: binanceConfig(envUrl('CRYPTO_DERIV_BASE_URL')),
        now: ctx.now,
        days: 600,
      });
    }
    if (market === 'kr') {
      // 한국은 시장에서 뺐다. 여기까지 불렸다면 호출하는 쪽이 잘못된 것이라
      // 빈 값을 만들어 덮지 않고 그대로 알린다.
      throw new NotWiredError(
        '한국 Fear & Greed',
        '한국은 무료 소스로 확보 가중치가 약 33% 라 시장에서 제외했습니다 (MARKET_IDS 참조)',
      );
    }
    const deps = {
      stooq: stooqConfig(envUrl(this.baseUrlEnvFor(market))),
      fred: this.fred(),
      now: ctx.now,
      days: 700,
    };
    void allMetricIds(market);
    void COMPONENTS;
    return market === 'us' ? buildUsFngInput(deps) : buildKrFngInput(deps);
  }

  /* --------------------------- 벤치마크 --------------------------- */
  /** TODO(연결지점 3): 점수와 겹쳐 볼 대표 지수 시계열 (미국=S&P 500, 한국=KOSPI, 크립토=BTC). */
  async getBenchmark(market: MarketId, _ctx: AdapterContext): Promise<BenchmarkSeries | null> {
    if (market === 'crypto') {
      const series = await fetchCoinSeries(this.coinGecko(), 'bitcoin', 365);
      return series.length ? { id: 'btc', name: '비트코인', series, precision: 0 } : null;
    }
    const id = market === 'us' ? 'spx' : 'kospi';
    const name = market === 'us' ? 'S&P 500' : 'KOSPI';
    const series = await fetchDailySeries(stooqConfig(envUrl(this.baseUrlEnvFor(market))), id, 400);
    return series.length ? { id, name, series, precision: 2 } : null;
  }

  /* -------------------------- 투자자 수급 -------------------------- */
  /** TODO(연결지점 4): KRX 투자자별 순매수 (외국인·기관·개인, 단위 억원). */
  async getFlows(_ctx: AdapterContext): Promise<FlowSummary> {
    throw new NotWiredError('한국 투자자별 순매수', 'src/server/adapters/live/index.ts > LiveAdapter.getFlows');
  }

  /* -------------------------- 국면 전광판 -------------------------- */
  /**
   * 20년치 원자료를 모은다.
   *
   *  - 변동성·신용 스프레드: FRED (VIXCLS, BAMLH0A0HYM2) — 둘 다 20년보다 긴 이력이 있다.
   *  - 낙폭·추세: Stooq 의 S&P 500 일별 종가에서 직접 계산한다.
   *
   * 축 하나가 실패해도 전체를 던지지 않는다. 빠진 축은 커버리지 규칙이 처리하고,
   * 화면은 "무엇이 빠졌고 왜인지" 를 그대로 보여 준다. 여기서 지어내지 않는 게 핵심이다.
   */
  async getRegimeSeries(ctx: AdapterContext): Promise<{ series: RegimeSeries; sources: DataSource[] }> {
    const key = getKeys().macro;
    if (!key) throw new AdapterNotConfiguredError('국면 전광판(FRED)', ['MACRO_API_KEY']);
    const cfg = fredConfig(key, envUrl('MACRO_BASE_URL'));
    const start = new Date(ctx.now.getTime() - 21 * 365.25 * 86_400_000).toISOString().slice(0, 10);

    const series: RegimeSeries = {};
    const sources: DataSource[] = [];

    const [vix, hy, spx] = await Promise.allSettled([
      fetchSeries(cfg, 'vix', { start }),
      fetchSeries(cfg, 'hy_oas', { start }),
      fetchDailySeries(stooqConfig(envUrl('US_MARKET_BASE_URL')), 'spx', 21 * 366),
    ]);

    if (vix.status === 'fulfilled' && vix.value.length > 0) series.vol = vix.value;
    if (hy.status === 'fulfilled' && hy.value.length > 0) series.credit = hy.value;
    if (vix.status === 'fulfilled' || hy.status === 'fulfilled') sources.push({ ...FRED_SOURCE });

    if (spx.status === 'fulfilled' && spx.value.length > 60) {
      const closes = spx.value;
      const drawdown: SeriesPoint[] = [];
      const trend: SeriesPoint[] = [];
      let peak = -Infinity;
      for (let i = 0; i < closes.length; i += 1) {
        const p = closes[i];
        peak = Math.max(peak, p.v);
        drawdown.push({ t: p.t, v: (p.v / peak - 1) * 100 });
        // 1년 이동평균. 앞쪽 250개는 평균을 만들 수 없어 아예 넣지 않는다.
        if (i >= 249) {
          const w = closes.slice(i - 249, i + 1);
          const ma = w.reduce((a, b) => a + b.v, 0) / w.length;
          trend.push({ t: p.t, v: (p.v / ma - 1) * 100 });
        }
      }
      series.drawdown = drawdown;
      series.trend = trend;
      sources.push({ ...STOOQ_SOURCE });
    }

    if (Object.keys(series).length === 0) {
      throw new SeriesUnavailableError('국면 전광판에 쓸 20년치 자료를 한 축도 받지 못했습니다.');
    }
    return { series, sources };
  }

  /* --------------------------- 거시 지표 --------------------------- */
  /** TODO(연결지점 5): FRED / ECOS 등 거시지표. riskLevel 판정 기준은 팀 정책에 맞게 조정. */
  async getMacro(ctx: AdapterContext): Promise<MacroIndicator[]> {
    const key = getKeys().macro;
    if (!key) throw new AdapterNotConfiguredError('거시 지표(FRED)', ['MACRO_API_KEY']);
    return buildFredMacro(fredConfig(key, envUrl('MACRO_BASE_URL')), ctx.now);
  }

  /* ------------------------ 생활 속 경제 이야기 ------------------------ */
  /**
   * TODO(연결지점 5-2): 1인당 GDP, 빅맥지수, PPP 환율, 엥겔계수, 소비자심리지수.
   *
   * 출처 후보: World Bank / IMF WEO / OECD (PPP·경기선행지수) / 통계청 (가계동향·소득분배) /
   * 한국은행 ECOS (소비자심리지수) / KB·국토부 (주택가격).
   * 빅맥지수 원자료는 이코노미스트가 공개하지만 재배포 조건을 반드시 확인한다.
   *
   * 담는 기준: **발표 기관이 있는 공식 지표만.** 발표 기관이 없는 개념을 넣어야 한다면
   * official: false 로 내려보내 화면에 "비공식 개념" 배지가 뜨게 한다.
   * 나라 비교는 한국·중국·일본·미국 네 나라를 그 순서로 채운다. 값이 없으면 null 이고,
   * 애초에 견줄 수 없는 지표라면 comparisonNote 에 이유를 적는다 (sameScale: false 면 막대도 빠진다).
   * 발표 시점이 서로 달라 값마다 asOfLabel 을 개별로 채운다.
   */
  async getBasics(ctx: AdapterContext): Promise<EconomyBasic[]> {
    return buildLiveBasics({
      wb: worldBankConfig(envUrl('WORLDBANK_BASE_URL')),
      bigmac: bigMacConfig(envUrl('BIGMAC_CSV_URL')),
      now: ctx.now,
    });
  }

  /* --------------------------- 예측시장 --------------------------- */
  /**
   * 폴리마켓 Gamma API — 거래량 상위 시장 몇 개.
   *
   * 다른 연결지점과 달리 **API 키가 필요 없어 실제로 구현해 뒀다.**
   * 다만 이 저장소를 만든 환경에서는 polymarket.com 으로 나가는 통신이
   * 막혀 있어 **응답 필드 이름을 실제 호출로 확인하지 못했다.** 문서에 적힌
   * 모양(question / outcomes / outcomePrices / volume24hr / endDate /
   * oneDayPriceChange)을 기준으로 썼고, 값이 예상과 다르면 조용히 추측해
   * 채우지 않고 그 시장만 결측 처리한다. 처음 붙일 때 응답 한 건을 찍어 보고
   * 필드명을 확인하는 것을 권한다.
   *
   * 엔드포인트는 POLYMARKET_API_BASE 로 바꿀 수 있다.
   * 약관상 표시 조건이 바뀌면 delayMinutes / terms 를 함께 고친다.
   */
  async getPrediction(_ctx: AdapterContext): Promise<PredictionDigest> {
    const base = envUrl('POLYMARKET_API_BASE') ?? 'https://gamma-api.polymarket.com';
    const limit = Number(process.env.PREDICTION_MARKET_COUNT ?? 2);
    const count = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 6) : 2;

    const url =
      `${base}/markets?active=true&closed=false&archived=false` +
      `&order=volume24hr&ascending=false&limit=${count}`;

    const raw = await fetchJson<unknown[]>(url, { timeoutMs: 5000 });
    const now = new Date().toISOString();
    const list = Array.isArray(raw) ? raw : [];
    const markets = list.slice(0, count).map((row, idx) => normalizePredictionMarket(row, idx));

    return {
      venue: 'Polymarket',
      markets,
      meta: {
        asOf: now,
        fetchedAt: now,
        freshness: 'live',
        sources: [
          {
            name: 'Polymarket (Gamma API)',
            url: 'https://polymarket.com',
            delayMinutes: 0,
            terms: '공개 API. 표시 조건·재배포 범위는 제공사 약관을 확인할 것.',
          },
        ],
        ...(markets.some((m) => m.unavailableReason)
          ? { notes: ['일부 시장의 값을 읽지 못했습니다.'] }
          : {}),
      },
    };
  }

  /* ---------------------------- 캘린더 ---------------------------- */
  /**
   * 경제 캘린더 — FRED 가 모아 둔 미국 발표 일정.
   *
   * 여기서 나오지 않는 것(한국·크립토 일정, 발표 시각, 예상치)을 다른 데서
   * 끌어와 채우지 않는다. DEMO 값으로 메우면 모드가 섞이고, 시각을 지어내면
   * 화면의 카운트다운이 그럴듯하게 틀린 곳을 향해 흘러간다.
   */
  async getCalendar(ctx: AdapterContext): Promise<CalendarEvent[]> {
    const key = getKeys().macro;
    if (!key) throw new AdapterNotConfiguredError('경제 캘린더(FRED)', ['MACRO_API_KEY']);
    return fetchFredCalendar(fredCalendarConfig(key, envUrl('MACRO_BASE_URL')), ctx.now);
  }

  /* ----------------------------- 뉴스 ----------------------------- */
  /**
   * TODO(연결지점 7): 뉴스.
   * 제공사 약관상 본문 재배포가 금지된 경우가 많다. 헤드라인·매체·발행시각·원문 링크만 저장하고
   * summaryKo 는 직접 생성한 요약(summaryOrigin: 'derived')임을 표시한다.
   */
  async getNews(_ctx: AdapterContext): Promise<NewsItem[]> {
    throw new NotWiredError('뉴스', 'src/server/adapters/live/index.ts > LiveAdapter.getNews');
  }

  /* -------------------------- 종목 상세 차트 -------------------------- */

  /**
   * 종목 상세 차트.
   *
   * 구간마다 받을 수 있는 곳이 다르고, **받을 수 없는 구간이 종목마다 다르다.**
   * 예전에는 못 받는 구간을 다른 구간 데이터로 슬쩍 메웠다 —
   * 코인 3년치를 달라고 하면 30일치를 주고, Stooq 에 1일치를 달라고 하면
   * 5일치 일봉을 줬다. 화면에는 "3년" · "1일" 이라고 적혀 있으니 그대로 거짓말이다.
   * 지금은 못 받으면 못 받는다고 하고, 왜 못 받는지를 같이 올려보낸다.
   */
  async getAssetSeries(id: string, range: RangeKey, _ctx: AdapterContext): Promise<SeriesPoint[]> {
    /* 코인 — CoinGecko. 무료 티어는 과거 365일까지만 준다. */
    const coin = COIN_ID[id];
    if (coin) {
      const days: Partial<Record<RangeKey, number>> = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365 };
      const d = days[range];
      if (d === undefined) {
        throw new SeriesUnavailableError(
          'CoinGecko 무료 API 는 과거 365일까지만 줍니다. 3년 구간은 유료 플랜이 필요합니다.',
        );
      }
      return fetchCoinSeries(this.coinGecko(), coin, d);
    }

    /* 미국 국채 금리와 장단기 금리차 — FRED. 발표 즉시 갱신되는 일별 계열이다. */
    const fredKey = ASSET_FRED_SERIES[id];
    if (fredKey) {
      const cfg = this.fred();
      if (!cfg) throw new AdapterNotConfiguredError(`${id} 시계열(FRED)`, ['MACRO_API_KEY']);
      if (range === '1D') {
        throw new SeriesUnavailableError('국채 금리는 하루 한 번 발표됩니다. 하루 안의 움직임은 없습니다.');
      }
      return fetchSeries(cfg, fredKey, { start: startDateFor(range) });
    }

    /* 펀딩비 · 미결제약정 — Binance. 둘 다 보관 기간이 짧다. */
    if (id === 'funding' || id === 'open_interest') {
      const cfg = binanceConfig(envUrl('CRYPTO_DERIV_BASE_URL'));
      if (id === 'funding') {
        // 8시간마다 한 번 정산되므로 하루에 세 점이다. 1일 구간은 선이 되지 않는다.
        const counts: Partial<Record<RangeKey, number>> = { '1W': 21, '1M': 90, '3M': 270 };
        const n = counts[range];
        if (n === undefined) {
          throw new SeriesUnavailableError(
            range === '1D'
              ? '펀딩비는 8시간마다 한 번 정산됩니다. 하루치로는 점 세 개뿐이라 그리지 않습니다.'
              : 'Binance 공개 API 가 주는 펀딩비 이력의 한계를 넘는 구간입니다.',
          );
        }
        return fetchFundingHistory(cfg, 'BTCUSDT', n);
      }
      // 미결제약정 이력은 무료 엔드포인트가 최근 30일까지만 준다
      const oi: Partial<Record<RangeKey, { period: '1h' | '4h' | '1d'; limit: number }>> = {
        '1D': { period: '1h', limit: 24 },
        '1W': { period: '4h', limit: 42 },
        '1M': { period: '1d', limit: 30 },
      };
      const spec = oi[range];
      if (!spec) {
        throw new SeriesUnavailableError('Binance 무료 미결제약정 이력은 최근 30일까지만 제공합니다.');
      }
      return fetchOpenInterestHistory(cfg, 'BTCUSDT', spec.period, spec.limit);
    }

    /* 지수 · 개별주 · 원자재 — Stooq. 일봉만 있다. */
    if (STOOQ_SYMBOL[id]) {
      if (range === '1D') {
        throw new SeriesUnavailableError('Stooq 무료 CSV 는 일봉만 있어 하루 안의 움직임을 그릴 수 없습니다.');
      }
      const days: Partial<Record<RangeKey, number>> = { '1W': 10, '1M': 35, '3M': 100, '1Y': 400, '3Y': 1200 };
      return fetchDailySeries(stooqConfig(null), id, days[range] ?? 35);
    }

    /* 여기까지 왔으면 무료로 받을 길이 없는 값이다. 사유를 그대로 올려보낸다. */
    const why = NO_FREE_SERIES[id];
    if (why) throw new SeriesUnavailableError(why);
    throw new NotWiredError(`${id} ${range} 시계열`, 'src/server/adapters/live/index.ts > LiveAdapter.getAssetSeries');
  }

  /* ----------------------------- 환율 ----------------------------- */
  /** TODO(연결지점 9): USD/KRW 환율 (통화 전환에 사용). */
  async getUsdKrw(_ctx: AdapterContext): Promise<number | null> {
    const key = getKeys().macro;
    if (!key) throw new AdapterNotConfiguredError('환율(FRED)', ['MACRO_API_KEY']);
    const last = await fetchLatest(fredConfig(key, envUrl('MACRO_BASE_URL')), 'usdkrw');
    return last ? last.v : null;
  }

  /* ---------------------------- 내부 ---------------------------- */

  /** CoinGecko 설정. 무료 티어는 키 없이도 되고, CRYPTO_API_KEY 가 있으면 한도가 올라간다. */
  private coinGecko(): CoinGeckoConfig {
    return coinGeckoConfig(getKeys().crypto, envUrl('CRYPTO_BASE_URL'));
  }

  /** FRED 설정. 키가 없으면 null 을 돌려주고, 그 지표들은 사유와 함께 빈다. */
  private fred(): FredConfig | null {
    const key = getKeys().macro;
    return key ? fredConfig(key, envUrl('MACRO_BASE_URL')) : null;
  }

  private keyFor(market: MarketId): string {
    const keys = getKeys();
    const map: Record<MarketId, { value: string | null; env: string }> = {
      us: { value: keys.usMarket, env: 'US_MARKET_API_KEY' },
      kr: { value: keys.krMarket, env: 'KR_MARKET_API_KEY' },
      crypto: { value: keys.crypto, env: 'CRYPTO_API_KEY' },
    };
    const entry = map[market];
    if (!entry.value) throw new AdapterNotConfiguredError(`${market} 시장`, [entry.env]);
    return entry.value;
  }

  private baseUrlEnvFor(market: MarketId): string {
    return market === 'us' ? 'US_MARKET_BASE_URL' : market === 'kr' ? 'KR_MARKET_BASE_URL' : 'CRYPTO_BASE_URL';
  }
}

/**
 * 제공사 응답 → Quote 정규화 자리.
 * 실제 스키마에 맞춰 구현한다. 값이 이상하면 보정하지 말고 null + unavailableReason 을 채운다.
 */
export function normalizeQuote(): never {
  throw new NotWiredError('Quote 정규화', 'src/server/adapters/live/index.ts > normalizeQuote');
}

/** 참고용: 실서비스에서 표기할 출처 예시 */
export const LIVE_SOURCE_EXAMPLES: DataSource[] = [
  { name: 'FRED (세인트루이스 연은)', url: 'https://fred.stlouisfed.org', delayMinutes: 1440, terms: '공공 데이터 · 출처 표기' },
  { name: 'KRX 정보데이터시스템', url: 'http://data.krx.co.kr', delayMinutes: 20, terms: '실시간 재배포 불가 · 지연 데이터 사용' },
  { name: 'CoinGecko API', url: 'https://www.coingecko.com/en/api', delayMinutes: 5, terms: '무료 티어 rate limit 준수' },
];

/* ------------------------------------------------------------------ */
/* 폴리마켓 응답 정규화                                                   */
/*                                                                     */
/* 밖에서 온 값은 하나도 믿지 않는다. 숫자가 아니면 null 이고, 필수 항목이  */
/* 비면 그 시장만 사유를 달아 결측 처리한다. 0 으로 채우지 않는다.          */
/* ------------------------------------------------------------------ */

/** 문자열로 온 숫자까지 받아 주되, 유한한 숫자가 아니면 null */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 배열이거나 JSON 문자열로 온 배열을 배열로 만든다 */
function arr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const p: unknown = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function normalizePredictionMarket(row: unknown, idx: number): PredictionMarket {
  const r = (row ?? {}) as Record<string, unknown>;
  const id = str(r.id) ?? str(r.conditionId) ?? str(r.slug) ?? `market-${idx}`;
  const question = str(r.question) ?? str(r.title) ?? str(r.groupItemTitle) ?? '';
  const slug = str(r.slug);
  const url = slug ? `https://polymarket.com/event/${slug}` : '';

  const labels = arr(r.outcomes).map(str);
  const prices = arr(r.outcomePrices).map(num);

  // 0~1 로 오는 가격을 0~100 으로 맞춘다. 이미 100 단위면 그대로 둔다.
  const scale = prices.some((p) => p !== null && p > 1.0001) ? 1 : 100;

  const outcomes: PredictionMarket['outcomes'] = labels
    .map((label, k) => {
      const p = prices[k];
      return {
        label: label ?? `선택지 ${k + 1}`,
        labelKo: label === 'Yes' ? '예' : label === 'No' ? '아니오' : null,
        price: p === null ? null : Math.round(p * scale * 10) / 10,
      };
    })
    .sort((a, b) => (b.price ?? -1) - (a.price ?? -1))
    .slice(0, 4);

  const priced = outcomes.filter((o) => o.price !== null);

  // oneDayPriceChange 는 원문 첫 선택지(대개 Yes) 기준이다.
  // 화면은 값이 가장 높은 선택지를 크게 보여주므로, 정렬 후 그 자리가 바뀌었으면
  // 두 선택지짜리에 한해 부호를 뒤집는다. 셋 이상이면 어디에 붙는 값인지 알 수 없어 버린다.
  const firstLabel = labels[0];
  const chgRaw = num(r.oneDayPriceChange);
  const chg =
    chgRaw === null
      ? null
      : outcomes.length > 2
        ? null
        : outcomes[0]?.label === firstLabel
          ? chgRaw
          : -chgRaw;
  const closeRaw = str(r.endDate) ?? str(r.end_date_iso);
  const closesAt = closeRaw && !Number.isNaN(Date.parse(closeRaw)) ? new Date(closeRaw).toISOString() : null;

  const missing =
    question === '' ? '질문을 읽지 못했습니다.' : priced.length === 0 ? '가격을 읽지 못했습니다.' : null;

  return {
    id,
    question,
    // 원문 질문은 대개 영어다. 서버에서 번역하지 않고 원문 그대로 내려보낸다.
    questionKo: null,
    questionOrigin: null,
    outcomes,
    // oneDayPriceChange 는 0~1 단위로 오므로 %p 로 맞춘다
    changeDay: chg === null ? null : Math.round(chg * (Math.abs(chg) > 1.0001 ? 1 : 100) * 10) / 10,
    volume24h: num(r.volume24hr) ?? num(r.volume24hrClob),
    closesAt,
    url,
    ...(missing ? { unavailableReason: missing } : {}),
  };
}

export const liveAdapter = new LiveAdapter();
