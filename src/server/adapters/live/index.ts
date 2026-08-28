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

import { getKeys } from '@/server/config';
import { AdapterNotConfiguredError, fetchJson } from '@/server/http';
import { COMPONENTS, allMetricIds } from '@/server/fng/definitions';
import type { EngineInput } from '@/server/fng/engine';
import type {
  CalendarEvent,
  DataSource,
  EconomyBasic,
  FlowSummary,
  MacroIndicator,
  MarketId,
  NewsItem,
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

function envUrl(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : null;
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
  async getQuotes(market: MarketId, _ctx: AdapterContext): Promise<Quote[]> {
    const key = this.keyFor(market);
    const base = envUrl(this.baseUrlEnvFor(market));
    if (!base) {
      throw new NotWiredError(
        `${market} 시세`,
        `src/server/adapters/live/index.ts > LiveAdapter.getQuotes (환경변수 ${this.baseUrlEnvFor(market)} 미설정)`,
      );
    }
    // 실제 연결 시 아래 주석을 구현으로 교체한다.
    void key;
    void fetchJson;
    throw new NotWiredError(`${market} 시세 normalize`, 'src/server/adapters/live/index.ts > normalizeQuote');
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
  async getFngInput(market: MarketId, _ctx: AdapterContext): Promise<EngineInput> {
    void allMetricIds(market);
    void COMPONENTS;
    throw new NotWiredError(
      `${market} Fear & Greed 원시 지표`,
      'src/server/adapters/live/index.ts > LiveAdapter.getFngInput',
    );
  }

  /* --------------------------- 벤치마크 --------------------------- */
  /** TODO(연결지점 3): 점수와 겹쳐 볼 대표 지수 시계열 (미국=S&P 500, 한국=KOSPI, 크립토=BTC). */
  async getBenchmark(market: MarketId, _ctx: AdapterContext): Promise<BenchmarkSeries | null> {
    throw new NotWiredError(`${market} 벤치마크 시계열`, 'src/server/adapters/live/index.ts > LiveAdapter.getBenchmark');
  }

  /* -------------------------- 투자자 수급 -------------------------- */
  /** TODO(연결지점 4): KRX 투자자별 순매수 (외국인·기관·개인, 단위 억원). */
  async getFlows(_ctx: AdapterContext): Promise<FlowSummary> {
    throw new NotWiredError('한국 투자자별 순매수', 'src/server/adapters/live/index.ts > LiveAdapter.getFlows');
  }

  /* --------------------------- 거시 지표 --------------------------- */
  /** TODO(연결지점 5): FRED / ECOS 등 거시지표. riskLevel 판정 기준은 팀 정책에 맞게 조정. */
  async getMacro(_ctx: AdapterContext): Promise<MacroIndicator[]> {
    throw new NotWiredError('거시·위험 지표', 'src/server/adapters/live/index.ts > LiveAdapter.getMacro');
  }

  /* ------------------------ 생활 경제 상식 지표 ------------------------ */
  /**
   * TODO(연결지점 5-2): 1인당 GDP, 빅맥지수, PPP 환율, 엥겔계수, 소비자심리지수.
   *
   * 출처 후보: World Bank / IMF WEO / OECD PPP / 통계청 가계동향 / 한국은행 ECOS.
   * 빅맥지수 원자료는 이코노미스트가 공개하지만 재배포 조건을 반드시 확인한다.
   * 라떼(스타벅스)지수는 공식 발표 기관이 없으므로 직접 조사한 값만 쓰고
   * official: false 로 내려보내 화면에 "공식 지수 아님"이 뜨게 한다.
   * 발표 시점이 서로 달라 값마다 asOfLabel 을 개별로 채운다. 없는 값은 null 이다.
   */
  async getBasics(_ctx: AdapterContext): Promise<EconomyBasic[]> {
    throw new NotWiredError('생활 경제 상식 지표', 'src/server/adapters/live/index.ts > LiveAdapter.getBasics');
  }

  /* ---------------------------- 캘린더 ---------------------------- */
  /** TODO(연결지점 6): 경제 캘린더. scheduledAt 은 반드시 KST(+09:00) 로 정규화한다. */
  async getCalendar(_ctx: AdapterContext): Promise<CalendarEvent[]> {
    throw new NotWiredError('경제 캘린더', 'src/server/adapters/live/index.ts > LiveAdapter.getCalendar');
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
  /** TODO(연결지점 8): 종목 상세 차트 (1D 는 분봉, 나머지는 일봉). */
  async getAssetSeries(id: string, range: RangeKey, _ctx: AdapterContext): Promise<SeriesPoint[]> {
    throw new NotWiredError(`${id} ${range} 시계열`, 'src/server/adapters/live/index.ts > LiveAdapter.getAssetSeries');
  }

  /* ----------------------------- 환율 ----------------------------- */
  /** TODO(연결지점 9): USD/KRW 환율 (통화 전환에 사용). */
  async getUsdKrw(_ctx: AdapterContext): Promise<number | null> {
    throw new NotWiredError('USD/KRW 환율', 'src/server/adapters/live/index.ts > LiveAdapter.getUsdKrw');
  }

  /* ---------------------------- 내부 ---------------------------- */

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

export const liveAdapter = new LiveAdapter();
