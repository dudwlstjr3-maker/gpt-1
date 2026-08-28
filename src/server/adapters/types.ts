/**
 * 시장별 교체 가능한 API Adapter 인터페이스.
 *
 * 새 데이터 제공사를 붙이려면 이 인터페이스만 구현해 registry 에 등록하면 된다.
 * 화면·엔진 코드는 어댑터 구현을 알지 못한다.
 */

import type {
  CalendarEvent,
  DataMode,
  DemoScenario,
  EconomyBasic,
  FlowSummary,
  MacroIndicator,
  MarketId,
  NewsItem,
  PredictionDigest,
  Quote,
  RangeKey,
  SeriesPoint,
} from '@/types';
import type { EngineInput } from '@/server/fng/engine';

export interface AdapterContext {
  now: Date;
  /** DEMO 모드에서만 유효 */
  scenario: DemoScenario;
}

export interface BenchmarkSeries {
  id: string;
  name: string;
  series: SeriesPoint[];
  precision: number;
}

export interface MarketAdapter {
  /** 어댑터 식별자 (화면 하단 진단 정보에 노출) */
  readonly id: string;
  readonly mode: DataMode;

  /** 시장별 시세 목록 */
  getQuotes(market: MarketId, ctx: AdapterContext): Promise<Quote[]>;

  /** Fear & Greed 엔진에 넣을 원시 지표 */
  getFngInput(market: MarketId, ctx: AdapterContext): Promise<EngineInput>;

  /** F&G 점수와 비교할 대표 시장 가격 */
  getBenchmark(market: MarketId, ctx: AdapterContext): Promise<BenchmarkSeries | null>;

  /** 한국 투자자별 순매수 */
  getFlows(ctx: AdapterContext): Promise<FlowSummary>;

  /** 거시·위험 지표 */
  getMacro(ctx: AdapterContext): Promise<MacroIndicator[]>;

  /** 생활 경제 상식 지표 (1인당 GDP, 빅맥지수 등) */
  getBasics(ctx: AdapterContext): Promise<EconomyBasic[]>;

  /** 예측시장에서 화제인 질문 (폴리마켓 등) */
  getPrediction(ctx: AdapterContext): Promise<PredictionDigest>;

  /** 경제 캘린더 */
  getCalendar(ctx: AdapterContext): Promise<CalendarEvent[]>;

  /** 뉴스 */
  getNews(ctx: AdapterContext): Promise<NewsItem[]>;

  /** 종목 상세 차트 */
  getAssetSeries(id: string, range: RangeKey, ctx: AdapterContext): Promise<SeriesPoint[]>;

  /** 통화 전환용 환율 */
  getUsdKrw(ctx: AdapterContext): Promise<number | null>;
}
