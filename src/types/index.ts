/**
 * Market Mood 3 — 도메인 타입 정의
 *
 * 서버 어댑터 / API 응답 / 클라이언트 UI 가 공유하는 단일 계약(contract)이다.
 * 모든 수치 필드는 "값이 없음(null)"과 "값이 0"을 명확히 구분한다.
 */

/* ------------------------------------------------------------------ */
/* 공통                                                                 */
/* ------------------------------------------------------------------ */

export type MarketId = 'us' | 'kr' | 'crypto';

export const MARKET_IDS: MarketId[] = ['us', 'kr', 'crypto'];

export const MARKET_LABEL: Record<MarketId, string> = {
  us: '미국',
  kr: '한국',
  crypto: '크립토',
};

/** 데이터 제공 모드. DEMO 와 LIVE 는 절대 한 응답 안에서 섞이지 않는다. */
export type DataMode = 'LIVE' | 'DEMO';

/** 개별 섹션(카드 묶음)의 상태. UI 의 스켈레톤/빈값/오류 분기를 결정한다. */
export type SectionStatus = 'ok' | 'loading' | 'empty' | 'partial' | 'stale' | 'error';

/** 실시간성 표시. */
export type Freshness = 'live' | 'delayed' | 'stale' | 'demo';

export interface DataSource {
  /** 화면에 노출되는 출처명 */
  name: string;
  /** 출처 링크(없을 수 있음) */
  url?: string;
  /** 지연 시간(분). 0 이면 실시간. null 이면 알 수 없음 */
  delayMinutes: number | null;
  /** 이용약관/재배포 조건 메모 */
  terms?: string;
}

export interface Meta {
  /** 데이터 기준 시각 (ISO8601, UTC) */
  asOf: string;
  /** 서버가 이 값을 받아온 시각 */
  fetchedAt: string;
  freshness: Freshness;
  sources: DataSource[];
  /** 이 섹션에서 실패했거나 비어 있는 항목의 사유 */
  notes?: string[];
}

export interface Section<T> {
  status: SectionStatus;
  data: T | null;
  meta: Meta;
  /** status 가 error/partial 일 때 사용자에게 보여줄 메시지 */
  error?: string;
}

/* ------------------------------------------------------------------ */
/* 시장 세션                                                            */
/* ------------------------------------------------------------------ */

export type SessionPhase = 'pre' | 'regular' | 'post' | 'closed' | 'holiday' | 'always';

export const SESSION_LABEL: Record<SessionPhase, string> = {
  pre: '장전',
  regular: '장중',
  post: '장후',
  closed: '마감',
  holiday: '휴장',
  always: '24시간 거래',
};

export interface MarketSession {
  market: MarketId;
  phase: SessionPhase;
  /** 다음 상태 전환까지 남은 밀리초 (always 면 null) */
  msToNext: number | null;
  /** 다음 전환 라벨 (예: "장 시작까지") */
  nextLabel: string | null;
  /** 휴장 사유 */
  holidayName?: string;
}

/* ------------------------------------------------------------------ */
/* 가격                                                                 */
/* ------------------------------------------------------------------ */

export type QuoteKind = 'index' | 'equity' | 'crypto' | 'fx' | 'rate' | 'commodity' | 'volatility' | 'spread' | 'stat';

export type Unit = 'point' | 'currency' | 'percent' | 'bp' | 'ratio' | 'count' | 'usd_bn' | 'krw_bn';

export interface SeriesPoint {
  /** epoch ms (UTC) */
  t: number;
  v: number;
}

export interface Quote {
  id: string;
  /** 한국어 표시명 */
  name: string;
  /** 원문/티커 */
  symbol: string;
  market: MarketId;
  kind: QuoteKind;
  /** 현재가. null 이면 값 없음(0 아님) */
  price: number | null;
  /** 등락액 */
  change: number | null;
  /** 등락률(%) */
  changePct: number | null;
  /** 표시 통화 (KRW/USD/null=무통화) */
  currency: 'KRW' | 'USD' | null;
  unit: Unit;
  /** 소수점 자리수 */
  precision: number;
  /** 거래량 (없으면 null) */
  volume: number | null;
  volumeUnit?: Unit;
  /** 30포인트 내외의 미니 차트 */
  spark: SeriesPoint[];
  session: SessionPhase;
  meta: Meta;
  /** 값이 없을 때 사용자에게 보여줄 사유 */
  unavailableReason?: string;
}

export interface FlowSummary {
  /** 투자자별 당일 순매수 (단위: 억원) */
  foreign: number | null;
  institution: number | null;
  individual: number | null;
  unit: 'krw_100m';
  meta: Meta;
}

/* ------------------------------------------------------------------ */
/* Fear & Greed                                                        */
/* ------------------------------------------------------------------ */

export type FngStageId = 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';

export interface FngStage {
  id: FngStageId;
  label: string;
  min: number;
  max: number;
}

export const FNG_STAGES: FngStage[] = [
  { id: 'extreme_fear', label: '극단적 공포', min: 0, max: 19 },
  { id: 'fear', label: '공포', min: 20, max: 39 },
  { id: 'neutral', label: '중립', min: 40, max: 59 },
  { id: 'greed', label: '탐욕', min: 60, max: 79 },
  { id: 'extreme_greed', label: '극단적 탐욕', min: 80, max: 100 },
];

export type Confidence = 'high' | 'medium' | 'low';

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: '높음',
  medium: '보통',
  low: '낮음',
};

/** 구성요소를 이루는 하위 지표 */
export interface SubMetricResult {
  id: string;
  label: string;
  /** 구성요소 내부 가중치 (합 100) */
  weight: number;
  /** 0~100 백분위 점수. null = 결측 */
  score: number | null;
  /** 원시값 */
  raw: number | null;
  rawLabel: string;
  /** 값이 클수록 공포인가? (true 면 점수 산출 시 반전) */
  inverted: boolean;
  /** 결측 사유 */
  missingReason?: string;
  /** 마지막 관측 시각 */
  asOf: string | null;
}

export interface ComponentResult {
  id: string;
  label: string;
  /** 시장 전체에서의 가중치(%) — 모든 구성요소 합 = 100 */
  weight: number;
  /** 결측 재조정 후 실제 적용된 가중치(%) */
  effectiveWeight: number;
  /** 0~100. null = 결측 */
  score: number | null;
  /** 전일 대비 구성요소 점수 변화 */
  deltaDay: number | null;
  /** 총점 변화에 대한 기여도(점) */
  contributionDay: number | null;
  description: string;
  sources: DataSource[];
  subMetrics: SubMetricResult[];
  available: boolean;
  missingReason?: string;
  asOf: string | null;
}

export interface FngHistoryPoint {
  /** epoch ms */
  t: number;
  /** null = 해당일 산출 불가 */
  v: number | null;
  formulaVersion: string;
}

export interface FngDriver {
  componentId: string;
  label: string;
  /** 점수 기여도(점). 양수=상승요인, 음수=하락요인 */
  contribution: number;
  detail: string;
}

export interface FngScore {
  market: MarketId;
  /** 0~100. null 이면 "산출 불가" */
  score: number | null;
  stage: FngStage | null;
  /** 산출 불가 사유 */
  unavailableReason?: string;

  deltaDay: number | null;
  deltaWeek: number | null;
  deltaMonth: number | null;

  /** 최근 30일 미니 차트 */
  spark: FngHistoryPoint[];

  /** 데이터 충족률 0~1 (최신 구성요소 가중치 합 / 100) */
  coverage: number;
  /** 신선도 점수 0~1 */
  freshnessScore: number;
  confidence: Confidence;
  confidenceReason: string;

  /** 산식 버전 */
  formulaVersion: string;
  /** 산출 시각 */
  computedAt: string;
  /** 사용된 역사적 분포 길이 */
  lookbackDays: number;

  components: ComponentResult[];
  topPositive: FngDriver | null;
  topNegative: FngDriver | null;

  /** 사이클 — 기간별 심리 위치와 현재 국면 */
  cycle: FngCycle;

  meta: Meta;
}

/* ------------------------------------------------------------------ */
/* 심리 사이클                                                          */
/* ------------------------------------------------------------------ */

/**
 * 국면은 "지금 점수가 어느 구간인가(수준)"와 "올라가는 중인가 내려가는 중인가(방향)"를
 * 조합한 서술이다. 앞으로의 방향을 예측하지 않는다.
 */
export type CyclePhaseId =
  | 'recovery'   // 공포 + 상승 → 회복 시도
  | 'deepening'  // 공포 + 하락 → 공포 심화
  | 'improving'  // 중립 + 상승 → 개선
  | 'weakening'  // 중립 + 하락 → 약화
  | 'heating'    // 탐욕 + 상승 → 과열 진행
  | 'cooling'    // 탐욕 + 하락 → 탐욕 후퇴
  | 'unknown';

export interface CyclePhase {
  id: CyclePhaseId;
  label: string;
  /** 수준 축 */
  levelLabel: string;
  /** 방향 축 */
  directionLabel: string;
  /** 한 줄 서술 (사실 기반) */
  description: string;
}

export const CYCLE_PHASE_LABEL: Record<CyclePhaseId, string> = {
  recovery: '회복 시도',
  deepening: '공포 심화',
  improving: '개선',
  weakening: '약화',
  heating: '과열 진행',
  cooling: '탐욕 후퇴',
  unknown: '판단 불가',
};

export interface FngCycleHorizon {
  id: 'short' | 'mid' | 'long';
  label: string;
  windowDays: number;
  /** 이 기간 안에서 현재 점수가 놓인 백분위 (0~100). null = 표본 부족 */
  percentile: number | null;
  mean: number | null;
  min: number | null;
  max: number | null;
  /** 기간 시작 대비 점수 변화 */
  change: number | null;
  direction: 'up' | 'down' | 'flat' | 'unknown';
  /** 이 기간 평균이 속한 단계 */
  averageStage: FngStage | null;
  /** 미니 차트용 (다운샘플) */
  points: FngHistoryPoint[];
  /** 표본이 부족할 때 사유 */
  unavailableReason?: string;
}

export interface FngCycle {
  market: MarketId;
  score: number | null;
  /** 20일 이동평균 */
  ma20: number | null;
  /** 최근 10일 기울기 (점/일) */
  slope: number | null;
  phase: CyclePhase;
  horizons: FngCycleHorizon[];
}

/* ------------------------------------------------------------------ */
/* 구간별 과거 통계                                                       */
/* ------------------------------------------------------------------ */

/**
 * "이 점수 구간이던 날들 이후 대표 지수가 어떻게 움직였는가"를 집계한 서술 통계.
 * 매매 신호가 아니며 미래 수익을 예측하지 않는다.
 */
export interface FngBandStat {
  stageId: FngStageId;
  stageLabel: string;
  /** 표본 일수 */
  sampleDays: number;
  /** 이후 N거래일 수익률 평균(%) */
  avgForward: number | null;
  /** 중앙값(%) */
  medianForward: number | null;
  /** 플러스로 끝난 비율(%) */
  positiveShare: number | null;
  /** 최악/최선 */
  worst: number | null;
  best: number | null;
}

export interface FngBandStats {
  /** 앞으로 몇 거래일을 봤는가 */
  forwardDays: number;
  /** 비교 대상 지수 이름 */
  benchmarkName: string;
  /** 전체 표본 일수 */
  totalDays: number;
  bands: FngBandStat[];
  /** 데이터 성격에 대한 경고 (DEMO 여부 등) */
  caveat: string;
}

/* ------------------------------------------------------------------ */
/* 과거 사건 표식                                                        */
/* ------------------------------------------------------------------ */

export type MarketEventCategory = 'crisis' | 'shock' | 'policy';

export const MARKET_EVENT_CATEGORY_LABEL: Record<MarketEventCategory, string> = {
  crisis: '위기',
  shock: '급락',
  policy: '정책',
};

/** 실제로 있었던 사건. 날짜와 이름은 사실이며 이 앱이 만들어 낸 값이 아니다. */
export interface MarketEvent {
  id: string;
  /** 사건 기준일 (YYYY-MM-DD) */
  date: string;
  label: string;
  /** 무슨 일이었는지 한 줄 */
  note: string;
  category: MarketEventCategory;
  /** 이 사건을 표시할 시장 */
  markets: MarketId[];
}

/** 사건 + 그 시점에 이 앱이 산출한 점수 */
export interface EventMarker {
  id: string;
  date: string;
  label: string;
  note: string;
  category: MarketEventCategory;
  /** 히스토리에서 실제로 매칭된 시점 (epoch ms) */
  t: number;
  /** 매칭된 시점이 사건일에서 며칠 떨어져 있는가 */
  offsetDays: number;
  score: number | null;
  stageId: FngStageId | null;
  stageLabel: string | null;
  /** 점수를 붙이지 못한 사유 */
  unavailableReason?: string;
  /**
   * DEMO 합성 데이터에서 뽑은 값인가.
   * true 면 "그날 실제로 이 값이었다"가 아니라 "합성 세계에서 계산된 값"이다.
   */
  synthetic: boolean;
}

export interface FngEvents {
  markers: EventMarker[];
  /** 사건 목록의 범위를 벗어나 표시하지 못한 개수 */
  outOfRange: number;
  /** 화면에 그대로 노출할 한계 문구 */
  caveat: string;
}

export interface FngDetail extends FngScore {
  /** 1M/3M/1Y/3Y/10Y 를 모두 담는 최대 길이 히스토리 */
  history: FngHistoryPoint[];
  /** 과거 위기 시점 표식 */
  events: FngEvents;
  /** 구간별 과거 통계 (표본이 부족하면 null) */
  bandStats: FngBandStats | null;
  /** 대표 시장 가격 (점수와 겹쳐 보기용) */
  benchmark: {
    id: string;
    name: string;
    series: SeriesPoint[];
    precision: number;
  } | null;
  methodology: {
    version: string;
    summary: string;
    steps: string[];
    winsorization: string;
    coverageRule: string;
    scaleWarning: string;
    /** 다른 공포·탐욕 지수를 훑어보고 무엇을 넣고 뺐는지 */
    compositionNote: string;
  };
}

/* ------------------------------------------------------------------ */
/* 거시 지표 / 캘린더 / 뉴스                                             */
/* ------------------------------------------------------------------ */

export type MacroTrend = 'up' | 'down' | 'flat' | 'unknown';

export interface MacroIndicator {
  id: string;
  name: string;
  /** 소속: 미국 / 한국 / 글로벌 / 크립토 */
  group: '미국' | '한국' | '글로벌' | '크립토';
  value: number | null;
  previous: number | null;
  unit: Unit;
  precision: number;
  /** 표시용 접미사 (예: "%", "bp") */
  suffix?: string;
  trend: MacroTrend;
  /** 위험 신호 여부 — 색상이 아닌 텍스트로도 표기 */
  riskLevel: 'normal' | 'watch' | 'alert' | 'unknown';
  riskNote: string;
  /** 홈 화면 요약에 노출할지 */
  featured: boolean;
  releaseDate: string | null;
  nextRelease: string | null;
  /** 추이 미니 차트 (시계열이 있는 지표만) */
  spark?: SeriesPoint[];
  meta: Meta;
}

/* ------------------------------------------------------------------ */
/* 생활 경제 상식 지표                                                    */
/*                                                                     */
/* 시세와 달리 1년에 한두 번 바뀌는, "우리 형편이 어느 정도인가"를 재는     */
/* 숫자들이다. 매매 판단용이 아니라 뉴스에 나오는 말을 알아듣기 위한        */
/* 배경 지식으로 따로 둔다.                                              */
/* ------------------------------------------------------------------ */

/** 나란히 놓고 비교하는 값 하나 (예: 한국 / 미국 / OECD 평균) */
export interface BasicComparison {
  label: string;
  value: number | null;
  precision: number;
  suffix: string;
  /** 비교의 중심이 되는 항목 — 화면에서 강조한다 */
  primary?: boolean;
}

export interface EconomyBasic {
  id: string;
  /** 한국어 이름 (예: 빅맥지수) */
  name: string;
  /** 원어 이름 (예: Big Mac Index) */
  englishName: string;
  /** 대표 숫자. 값이 없으면 null — 0 으로 채우지 않는다 */
  value: number | null;
  /** 직전 발표치 */
  previous: number | null;
  precision: number;
  suffix: string;
  /** 대표 숫자를 한 문장으로 읽어 준 것 */
  reading: string;
  /** 나란히 놓고 보는 값들 */
  comparisons: BasicComparison[];
  /** 기준 시점 표기 (예: "2025년", "2025년 7월") */
  asOfLabel: string;
  /** 통계기관이 공식 발표하는 지표인지 */
  official: boolean;
  /** 공식 지표가 아닐 때 그 사실을 알리는 한 줄 */
  officialNote?: string;
  meta: Meta;
}

/* ------------------------------------------------------------------ */
/* 시장 위험 신호등                                                         */
/* ------------------------------------------------------------------ */

/** 위험 단계. 색상뿐 아니라 라벨·기호로도 표기한다. */
export type RiskLevel = 'calm' | 'normal' | 'watch' | 'alert';

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  calm: '안정',
  normal: '보통',
  watch: '관찰',
  alert: '주의',
};

export const RISK_LEVEL_GLYPH: Record<RiskLevel, string> = {
  calm: '○',
  normal: '●',
  watch: '△',
  alert: '▲',
};

export interface RiskBand {
  level: RiskLevel;
  /** 구간 시작(포함). null = 하한 없음 */
  from: number | null;
  /** 구간 끝(미포함). null = 상한 없음 */
  to: number | null;
  label: string;
}

export interface RiskIndicator {
  id: string;
  /** 한국어 표시명 */
  name: string;
  /** 짧은 이름 (타일용) */
  shortName: string;
  /** 어느 시장의 위험을 보는 지표인가 */
  scope: MarketId | 'global';
  value: number | null;
  previous: number | null;
  change: number | null;
  changePct: number | null;
  unit: Unit;
  precision: number;
  suffix: string;
  /** 값이 클수록 위험한가, 작을수록 위험한가 */
  direction: 'higher_is_riskier' | 'lower_is_riskier';
  level: RiskLevel;
  /** 밴드 스케일에서 현재 값의 위치 (0~100). null = 값 없음 */
  position: number | null;
  bands: RiskBand[];
  /** 스케일 표시 범위 */
  scaleMin: number;
  scaleMax: number;
  /** 이 지표가 왜 중요한가 (고정 설명) */
  why: string;
  /** 값이 오르면 무슨 일이 벌어지는가 (초보자용 고정 설명) */
  whenUp: string;
  /** 값이 내리면 무슨 일이 벌어지는가 */
  whenDown: string;
  /** 지금 수치를 어떻게 읽어야 하는가 (값에 따라 달라지는 해석) */
  reading: string;
  spark: SeriesPoint[];
  /** 값이 없을 때 사유 */
  unavailableReason?: string;
  meta: Meta;
}

export interface RiskDigest {
  indicators: RiskIndicator[];
  /** 주의 단계 개수 */
  alertCount: number;
  /** 관찰 이상 개수 */
  watchCount: number;
  /** 값을 산출한 지표 수 */
  availableCount: number;
  /** 한 줄 종합 (사실 기반) */
  headline: string;
  generatedAt: string;
}

export type EventImportance = 'high' | 'medium' | 'low';

export type EventCategory =
  | 'central_bank'
  | 'inflation'
  | 'employment'
  | 'pmi'
  | 'gdp'
  | 'expiry'
  | 'earnings'
  | 'crypto';

export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  central_bank: '통화정책',
  inflation: '물가',
  employment: '고용',
  pmi: 'PMI',
  gdp: 'GDP',
  expiry: '옵션만기',
  earnings: '실적',
  crypto: '크립토',
};

export interface CalendarEvent {
  id: string;
  title: string;
  country: 'US' | 'KR' | 'GLOBAL';
  /**
   * 이 일정이 어느 시장을 움직이는가.
   * country 와 다를 수 있다 — 크립토 일정은 특정 국가에 묶이지 않는다.
   * 화면의 미국·한국·크립토 구분은 country 가 아니라 이 값을 따른다.
   */
  market: MarketId | 'global';
  category: EventCategory;
  importance: EventImportance;
  /** KST 기준 시각 (ISO8601 with +09:00) */
  scheduledAt: string;
  /** 시각 미정 여부 */
  timeTbd: boolean;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  unit: string | null;
  note?: string;
  source: DataSource;
}

export interface NewsItem {
  id: string;
  /** 한국어 요약 (1~2문장) */
  summaryKo: string;
  /** 원문 제목 */
  titleOriginal: string;
  outlet: string;
  publishedAt: string;
  url: string;
  markets: MarketId[];
  /** 요약이 기계 번역/요약인지 명시 */
  summaryOrigin: 'provider' | 'derived';
}

/* ------------------------------------------------------------------ */
/* 오늘의 시장 요약                                                      */
/* ------------------------------------------------------------------ */

export interface SummaryLine {
  /** fact = 관측된 수치, interpretation = 해석 */
  kind: 'fact' | 'interpretation' | 'insufficient';
  text: string;
  /** 근거가 된 데이터 id 목록 */
  evidence: string[];
}

export interface MarketSummary {
  lines: SummaryLine[];
  generatedAt: string;
  /** 근거 부족 여부 */
  insufficient: boolean;
}

/* ------------------------------------------------------------------ */
/* 스냅샷 (API 최상위 응답)                                               */
/* ------------------------------------------------------------------ */

export interface SnapshotSections {
  sessions: Section<MarketSession[]>;
  fng: Section<FngScore[]>;
  quotes: Section<Record<MarketId, Quote[]>>;
  flows: Section<FlowSummary>;
  macro: Section<MacroIndicator[]>;
  basics: Section<EconomyBasic[]>;
  risk: Section<RiskDigest>;
  calendar: Section<CalendarEvent[]>;
  news: Section<NewsItem[]>;
  summary: Section<MarketSummary>;
}

export type SectionKey = keyof SnapshotSections;

export interface Snapshot {
  mode: DataMode;
  /** DEMO 시나리오 이름 (LIVE 면 null) */
  scenario: DemoScenario | null;
  /** 서버가 스냅샷을 조립한 시각 */
  generatedAt: string;
  /** 마지막 전체 업데이트 시각 = 섹션 중 가장 오래된 fetchedAt */
  lastFullUpdate: string;
  /** USD/KRW — 통화 전환에 사용 */
  usdKrw: number | null;
  formulaVersion: string;
  sections: SnapshotSections;
  /** 스냅샷 전체가 실패한 경우 */
  fatalError?: string;
}

export type DemoScenario = 'normal' | 'loading' | 'empty' | 'partial' | 'stale' | 'error';

export const DEMO_SCENARIOS: { id: DemoScenario; label: string; description: string }[] = [
  { id: 'normal', label: '정상', description: '모든 섹션이 정상 응답합니다.' },
  { id: 'loading', label: '로딩', description: '응답이 지연되어 스켈레톤이 표시됩니다.' },
  { id: 'empty', label: '빈값', description: '데이터가 비어 있는 상태입니다.' },
  { id: 'partial', label: '부분 실패', description: '일부 구성요소가 결측되어 재조정/산출 불가가 발생합니다.' },
  { id: 'stale', label: '오래된 데이터', description: '기준 시각이 오래되어 stale 배지가 표시됩니다.' },
  { id: 'error', label: '전체 오류', description: '스냅샷 조립이 실패한 상태입니다.' },
];

/* ------------------------------------------------------------------ */
/* 자산 상세                                                            */
/* ------------------------------------------------------------------ */

export type RangeKey = '1D' | '1W' | '1M' | '3M' | '1Y' | '3Y';

export interface AssetDetail {
  quote: Quote;
  ranges: Record<RangeKey, SeriesPoint[]>;
  /** 같은 시장의 F&G 점수(겹쳐보기용) */
  fngOverlay: Record<RangeKey, FngHistoryPoint[]>;
  mode: DataMode;
}

/* ------------------------------------------------------------------ */
/* 알림                                                                 */
/* ------------------------------------------------------------------ */

export type AlertRuleType =
  | 'fng_stage_change'
  | 'fng_threshold'
  | 'price_target'
  | 'price_move'
  | 'risk_spike'
  | 'calendar_reminder';

export interface AlertRule {
  id: string;
  type: AlertRuleType;
  enabled: boolean;
  label: string;
  /** 대상 (시장 id 또는 quote id) */
  target: string;
  /** 임계값 */
  threshold?: number;
  direction?: 'above' | 'below' | 'both';
  /** 쿨다운(분) */
  cooldownMinutes: number;
  createdAt: number;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  title: string;
  body: string;
  firedAt: number;
  /** 중복 방지 키 */
  dedupeKey: string;
  read: boolean;
}
