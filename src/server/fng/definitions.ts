/**
 * Fear & Greed 자체 산출 지수 — 구성요소 정의.
 *
 * 이 앱의 점수는 외부 서비스의 공식 지수를 복제한 것이 아니라,
 * 합법적으로 접근 가능한 시장 데이터로 직접 계산한 "자체 산출 지수"다.
 * 세 시장 모두 0~100 척도를 쓰지만 구성 지표가 다르므로 직접 비교 대상이 아니다.
 */

import type { DataSource, MarketId } from '@/types';

export const FORMULA_VERSION = 'v1.0.0';

/** 미국·한국은 252거래일, 크립토는 365일(연중무휴) 분포를 쓴다. */
export const LOOKBACK: Record<MarketId, number> = {
  us: 252,
  kr: 252,
  crypto: 365,
};

/** winsorization 양쪽 꼬리 비율 */
export const WINSOR_TAIL = 0.025;

/** 이 비율 이상의 가중치가 최신 상태여야 점수를 산출한다. */
export const MIN_COVERAGE = 0.7;

export interface SubMetricDef {
  id: string;
  label: string;
  /** 구성요소 내부 가중치 (합 100) */
  weight: number;
  /** true = 값이 클수록 공포 → 점수 반전 */
  invert: boolean;
  precision: number;
  suffix: string;
  /** 원시값 설명 */
  hint: string;
}

export interface ComponentDef {
  id: string;
  label: string;
  /** 시장 전체 가중치(%) */
  weight: number;
  description: string;
  subMetrics: SubMetricDef[];
  plannedSources: DataSource[];
}

const src = (name: string, url: string, delayMinutes: number | null, terms: string): DataSource => ({
  name,
  url,
  delayMinutes,
  terms,
});

const S = {
  stooq: src('Stooq (지연 시세)', 'https://stooq.com', 15, '개인·비상업 사용 범위 내 이용'),
  fred: src('FRED (세인트루이스 연은)', 'https://fred.stlouisfed.org', 1440, '공공 데이터, 출처 표기 조건 재배포 가능'),
  cboe: src('Cboe 공개 통계', 'https://www.cboe.com', 1440, '공개 통계 페이지 이용약관 준수'),
  krx: src('KRX 정보데이터시스템', 'http://data.krx.co.kr', 20, 'KRX 이용약관 — 실시간 재배포 불가, 지연 데이터 사용'),
  ecos: src('한국은행 ECOS', 'https://ecos.bok.or.kr', 1440, 'API 키 필요, 출처 표기'),
  coingecko: src('CoinGecko API', 'https://www.coingecko.com/en/api', 5, '무료 티어 rate limit 준수, 출처 표기'),
  binance: src('Binance 공개 API', 'https://binance-docs.github.io', 1, '공개 마켓 데이터 엔드포인트'),
  coinglass: src('파생상품 집계 API', 'https://www.coinglass.com', 15, '제공사 약관에 따른 사용'),
  news: src('뉴스 RSS/공개 API', '', 30, '헤드라인·링크만 사용, 전문 재배포 금지'),
};

/* ------------------------------------------------------------------ */
/* 미국                                                                 */
/* ------------------------------------------------------------------ */

const US_COMPONENTS: ComponentDef[] = [
  {
    id: 'us_momentum',
    label: 'S&P 500 모멘텀 및 이동평균 이격도',
    weight: 20,
    description: 'S&P 500 종가가 125일 이동평균 대비 얼마나 위/아래에 있는지, 그리고 최근 20거래일 수익률을 본다.',
    subMetrics: [
      { id: 'spx_ma125_gap', label: 'S&P 500 125일 이격도', weight: 60, invert: false, precision: 2, suffix: '%', hint: '종가 / 125일 이동평균 - 1' },
      { id: 'spx_ret_20d', label: 'S&P 500 20일 수익률', weight: 40, invert: false, precision: 2, suffix: '%', hint: '최근 20거래일 누적 수익률' },
    ],
    plannedSources: [S.stooq],
  },
  {
    id: 'us_vix',
    label: 'VIX 수준·변화·기간구조',
    weight: 20,
    description: 'VIX 절대 수준, 최근 5일 변화, VIX3M/VIX 기간구조를 함께 본다. 백워데이션은 공포 신호다.',
    subMetrics: [
      { id: 'vix_level', label: 'VIX 수준', weight: 45, invert: true, precision: 2, suffix: '', hint: 'VIX 종가' },
      { id: 'vix_chg_5d', label: 'VIX 5일 변화', weight: 25, invert: true, precision: 2, suffix: 'p', hint: '5거래일 전 대비 절대 변화' },
      { id: 'vix_term', label: 'VIX 기간구조 (VIX3M/VIX)', weight: 30, invert: false, precision: 3, suffix: '배', hint: '1보다 크면 콘탱고(안정)' },
    ],
    plannedSources: [S.stooq, S.cboe],
  },
  {
    id: 'us_breadth',
    label: '상승/하락 종목과 이동평균 상회 비율',
    weight: 15,
    description: '시장 폭. 10일 등락비율과 50·200일 이동평균을 상회하는 종목 비율을 사용한다.',
    subMetrics: [
      { id: 'us_adv_dec_10d', label: '10일 등락 종목 비율', weight: 35, invert: false, precision: 2, suffix: '배', hint: '상승 종목 수 / 하락 종목 수 (10일 누적)' },
      { id: 'us_above_ma50', label: '50일선 상회 비율', weight: 35, invert: false, precision: 1, suffix: '%', hint: 'S&P 500 구성종목 기준' },
      { id: 'us_above_ma200', label: '200일선 상회 비율', weight: 30, invert: false, precision: 1, suffix: '%', hint: 'S&P 500 구성종목 기준' },
    ],
    plannedSources: [S.stooq],
  },
  {
    id: 'us_putcall',
    label: '풋/콜 비율',
    weight: 15,
    description: '주식 옵션 풋/콜 비율의 5일 평균. 높을수록 하방 헤지 수요가 많다는 뜻으로 공포에 해당한다.',
    subMetrics: [
      { id: 'us_equity_pcr_5d', label: '주식 풋/콜 비율 (5일 평균)', weight: 100, invert: true, precision: 3, suffix: '', hint: 'Cboe equity put/call ratio' },
    ],
    plannedSources: [S.cboe],
  },
  {
    id: 'us_credit',
    label: '하이일드 신용스프레드와 안전자산 선호',
    weight: 15,
    description: '하이일드 OAS 와, 주식 대비 국채의 상대 성과(안전자산 선호)를 함께 본다.',
    subMetrics: [
      { id: 'us_hy_oas', label: '하이일드 OAS', weight: 55, invert: true, precision: 2, suffix: '%', hint: 'ICE BofA High Yield OAS' },
      { id: 'us_safe_haven', label: '주식-국채 20일 상대성과', weight: 45, invert: false, precision: 2, suffix: '%p', hint: 'S&P 500 20일 수익률 - 미 국채 20일 수익률' },
    ],
    plannedSources: [S.fred],
  },
  {
    id: 'us_smallcap',
    label: 'Russell 2000 및 경기민감주 상대 강도',
    weight: 15,
    description: '중소형주와 경기민감 섹터가 대형주·방어주 대비 얼마나 강한지 본다. 위험선호의 대리 지표다.',
    subMetrics: [
      { id: 'us_rut_rel_spx_60d', label: 'Russell 2000 상대강도 (60일)', weight: 55, invert: false, precision: 2, suffix: '%p', hint: 'Russell 2000 - S&P 500 60일 수익률' },
      { id: 'us_cyc_rel_def_60d', label: '경기민감/방어주 상대강도 (60일)', weight: 45, invert: false, precision: 2, suffix: '%p', hint: '경기민감 섹터 - 방어 섹터 60일 수익률' },
    ],
    plannedSources: [S.stooq],
  },
];

/* ------------------------------------------------------------------ */
/* 한국                                                                 */
/* ------------------------------------------------------------------ */

const KR_COMPONENTS: ComponentDef[] = [
  {
    id: 'kr_momentum',
    label: 'KOSPI 모멘텀 및 이동평균 이격도',
    weight: 20,
    description: 'KOSPI 종가의 125일 이격도와 20거래일 수익률.',
    subMetrics: [
      { id: 'kospi_ma125_gap', label: 'KOSPI 125일 이격도', weight: 60, invert: false, precision: 2, suffix: '%', hint: '종가 / 125일 이동평균 - 1' },
      { id: 'kospi_ret_20d', label: 'KOSPI 20일 수익률', weight: 40, invert: false, precision: 2, suffix: '%', hint: '최근 20거래일 누적 수익률' },
    ],
    plannedSources: [S.krx],
  },
  {
    id: 'kr_vkospi',
    label: 'VKOSPI 수준과 변화',
    weight: 20,
    description: '한국 변동성지수의 절대 수준과 최근 5거래일 변화.',
    subMetrics: [
      { id: 'vkospi_level', label: 'VKOSPI 수준', weight: 60, invert: true, precision: 2, suffix: '', hint: 'VKOSPI 종가' },
      { id: 'vkospi_chg_5d', label: 'VKOSPI 5일 변화', weight: 40, invert: true, precision: 2, suffix: 'p', hint: '5거래일 전 대비 절대 변화' },
    ],
    plannedSources: [S.krx],
  },
  {
    id: 'kr_breadth',
    label: '상승/하락 종목 및 시장 폭',
    weight: 15,
    description: '유가증권시장 등락 종목 비율과 50일선 상회 비율.',
    subMetrics: [
      { id: 'kr_adv_dec_10d', label: '10일 등락 종목 비율', weight: 50, invert: false, precision: 2, suffix: '배', hint: '상승 / 하락 종목 수 (10일 누적)' },
      { id: 'kr_above_ma50', label: '50일선 상회 비율', weight: 50, invert: false, precision: 1, suffix: '%', hint: 'KOSPI 구성종목 기준' },
    ],
    plannedSources: [S.krx],
  },
  {
    id: 'kr_flows',
    label: '외국인·기관 순매수 흐름',
    weight: 15,
    description: '외국인과 기관의 20거래일 누적 순매수 금액. 수급이 곧 심리인 시장 특성을 반영한다.',
    subMetrics: [
      { id: 'kr_foreign_net_20d', label: '외국인 20일 누적 순매수', weight: 55, invert: false, precision: 0, suffix: '억원', hint: 'KOSPI 기준 누적' },
      { id: 'kr_inst_net_20d', label: '기관 20일 누적 순매수', weight: 45, invert: false, precision: 0, suffix: '억원', hint: 'KOSPI 기준 누적' },
    ],
    plannedSources: [S.krx],
  },
  {
    id: 'kr_derivatives',
    label: '선물·옵션 풋/콜 및 파생시장 심리',
    weight: 10,
    description: 'KOSPI200 옵션 풋/콜 비율 5일 평균.',
    subMetrics: [
      { id: 'kr_pcr_5d', label: 'KOSPI200 풋/콜 비율 (5일)', weight: 100, invert: true, precision: 3, suffix: '', hint: '거래량 기준 풋/콜' },
    ],
    plannedSources: [S.krx],
  },
  {
    id: 'kr_fx',
    label: 'USD/KRW 급등과 환율 변동성',
    weight: 10,
    description: '원화 약세와 환율 변동성 확대는 한국 시장에서 위험회피 신호로 작동한다.',
    subMetrics: [
      { id: 'usdkrw_ret_20d', label: 'USD/KRW 20일 변화율', weight: 55, invert: true, precision: 2, suffix: '%', hint: '상승 = 원화 약세' },
      { id: 'usdkrw_vol_20d', label: 'USD/KRW 20일 변동성', weight: 45, invert: true, precision: 2, suffix: '%', hint: '연율화 실현변동성' },
    ],
    plannedSources: [S.ecos, S.stooq],
  },
  {
    id: 'kr_credit_kosdaq',
    label: '신용잔고와 KOSDAQ 상대 강도',
    weight: 10,
    description: '신용융자잔고 증감과 KOSDAQ 의 KOSPI 대비 상대강도로 위험선호를 본다.',
    subMetrics: [
      { id: 'kr_margin_chg_20d', label: '신용융자잔고 20일 증감률', weight: 50, invert: false, precision: 2, suffix: '%', hint: '증가 = 위험선호' },
      { id: 'kosdaq_rel_kospi_60d', label: 'KOSDAQ 상대강도 (60일)', weight: 50, invert: false, precision: 2, suffix: '%p', hint: 'KOSDAQ - KOSPI 60일 수익률' },
    ],
    plannedSources: [S.krx],
  },
];

/* ------------------------------------------------------------------ */
/* 크립토                                                               */
/* ------------------------------------------------------------------ */

const CRYPTO_COMPONENTS: ComponentDef[] = [
  {
    id: 'cr_momentum',
    label: 'BTC·ETH 및 전체 시장 모멘텀',
    weight: 20,
    description: 'BTC·ETH 의 100일 이격도와 전체 시가총액 30일 수익률.',
    subMetrics: [
      { id: 'btc_ma100_gap', label: 'BTC 100일 이격도', weight: 45, invert: false, precision: 2, suffix: '%', hint: '종가 / 100일 이동평균 - 1' },
      { id: 'eth_ma100_gap', label: 'ETH 100일 이격도', weight: 25, invert: false, precision: 2, suffix: '%', hint: '종가 / 100일 이동평균 - 1' },
      { id: 'total_mcap_ret_30d', label: '전체 시총 30일 수익률', weight: 30, invert: false, precision: 2, suffix: '%', hint: '전체 크립토 시가총액 기준' },
    ],
    plannedSources: [S.coingecko],
  },
  {
    id: 'cr_volatility',
    label: '변동성·고점 대비 낙폭',
    weight: 15,
    description: 'BTC 30일 실현변동성과 사상 최고가 대비 낙폭.',
    subMetrics: [
      { id: 'btc_vol_30d', label: 'BTC 30일 실현변동성', weight: 50, invert: true, precision: 1, suffix: '%', hint: '연율화' },
      { id: 'btc_drawdown', label: 'BTC 고점 대비 낙폭', weight: 50, invert: false, precision: 1, suffix: '%', hint: '0에 가까울수록 고점 부근' },
    ],
    plannedSources: [S.coingecko, S.binance],
  },
  {
    id: 'cr_ma_breadth',
    label: '주요 코인의 이동평균 상회 비율',
    weight: 15,
    description: '시가총액 상위 50개 코인 중 50일 이동평균을 상회하는 비율.',
    subMetrics: [
      { id: 'top50_above_ma50', label: '상위 50개 코인 50일선 상회 비율', weight: 100, invert: false, precision: 1, suffix: '%', hint: '시총 상위 50 기준' },
    ],
    plannedSources: [S.coingecko],
  },
  {
    id: 'cr_volume',
    label: '현물 거래량과 거래 강도',
    weight: 10,
    description: '최근 현물 거래량이 30일 평균 대비 얼마나 많은지.',
    subMetrics: [
      { id: 'spot_vol_ratio_30d', label: '현물 거래량 / 30일 평균', weight: 100, invert: false, precision: 3, suffix: '배', hint: '1보다 크면 거래 활발' },
    ],
    plannedSources: [S.coingecko, S.binance],
  },
  {
    id: 'cr_derivatives',
    label: '펀딩비·미결제약정·청산 데이터',
    weight: 15,
    description: '무기한 선물 펀딩비, 미결제약정 증감, 청산에서 롱이 차지하는 비중.',
    subMetrics: [
      { id: 'funding_7d', label: '펀딩비 7일 평균', weight: 40, invert: false, precision: 4, suffix: '%', hint: '양수 = 롱 우위' },
      { id: 'oi_chg_14d', label: '미결제약정 14일 증감률', weight: 30, invert: false, precision: 2, suffix: '%', hint: '레버리지 유입' },
      { id: 'long_liq_share', label: '롱 청산 비중', weight: 30, invert: true, precision: 1, suffix: '%', hint: '높을수록 하락 청산 압력' },
    ],
    plannedSources: [S.coinglass, S.binance],
  },
  {
    id: 'cr_stablecoin',
    label: '스테이블코인 및 온체인 자금 흐름',
    weight: 10,
    description: '스테이블코인 시가총액 증감과 거래소 순유입. 거래소로 코인이 들어오면 매도 대기 물량으로 본다.',
    subMetrics: [
      { id: 'stable_mcap_chg_30d', label: '스테이블코인 시총 30일 증감률', weight: 55, invert: false, precision: 2, suffix: '%', hint: '증가 = 대기 매수 여력' },
      { id: 'exchange_netflow_14d', label: '거래소 순유입 (14일)', weight: 45, invert: true, precision: 0, suffix: 'BTC', hint: '양수 = 거래소로 순유입' },
    ],
    plannedSources: [S.coingecko],
  },
  {
    id: 'cr_dominance',
    label: 'BTC 도미넌스와 알트코인 시장 폭',
    weight: 10,
    description: '도미넌스 상승은 위험회피, 알트코인 폭 확대는 위험선호로 해석한다.',
    subMetrics: [
      { id: 'btc_dom_chg_30d', label: 'BTC 도미넌스 30일 변화', weight: 50, invert: true, precision: 2, suffix: '%p', hint: '상승 = 알트 회피' },
      { id: 'alt_breadth', label: '알트코인 상승 비율', weight: 50, invert: false, precision: 1, suffix: '%', hint: '상위 100개 중 24시간 상승 비율' },
    ],
    plannedSources: [S.coingecko],
  },
  {
    id: 'cr_news',
    label: '출처가 명확한 뉴스·검색 심리',
    weight: 5,
    description: '출처가 확인된 뉴스 헤드라인의 긍/부정 비율. 근거가 부족하면 결측 처리한다.',
    subMetrics: [
      { id: 'news_sentiment', label: '뉴스 심리 지수', weight: 100, invert: false, precision: 1, suffix: '', hint: '헤드라인 긍정 비율 기반' },
    ],
    plannedSources: [S.news],
  },
];

export const COMPONENTS: Record<MarketId, ComponentDef[]> = {
  us: US_COMPONENTS,
  kr: KR_COMPONENTS,
  crypto: CRYPTO_COMPONENTS,
};

/** 시장별 모든 하위 지표 id 목록 */
export function allMetricIds(market: MarketId): string[] {
  return COMPONENTS[market].flatMap((c) => c.subMetrics.map((s) => s.id));
}

export const METHODOLOGY_STEPS: string[] = [
  '① 구성요소별 원시 지표를 수집한다 (가격, 변동성, 시장 폭, 수급, 파생, 신용 등).',
  '② 각 지표를 최근 252거래일(크립토는 365일) 분포와 비교해 0~100 백분위로 변환한다.',
  '③ 극단치 영향을 줄이기 위해 상·하위 2.5% winsorization 을 적용한 뒤 백분위를 계산한다.',
  '④ 값이 클수록 공포인 지표(VIX, 풋/콜, 신용스프레드 등)는 방향을 반전해 "높은 점수 = 탐욕"으로 통일한다.',
  '⑤ 하위 지표 점수를 구성요소 내부 가중치로 평균해 구성요소 점수를 만든다.',
  '⑥ 구성요소 점수를 시장별 가중치로 가중평균해 최종 0~100 점수를 산출한다.',
  '⑦ 결측 구성요소는 0점으로 처리하지 않는다. 사용 가능한 구성요소 가중치 합이 70% 이상일 때만 그 안에서 가중치를 재조정해 계산하고, 70% 미만이면 "산출 불가"로 표시한다.',
];

export const SCALE_WARNING =
  '세 시장 모두 0~100 척도를 사용하지만 구성 지표와 가중치가 서로 다릅니다. 같은 숫자라도 의미가 동일하지 않으므로 시장 간 점수를 직접 비교하지 마세요.';

export const COVERAGE_RULE_TEXT = `최신 상태인 구성요소의 가중치 합이 전체의 ${Math.round(
  MIN_COVERAGE * 100,
)}% 이상일 때만 점수를 산출합니다. 그 미만이면 점수를 숨기고 "산출 불가"로 표시합니다. 결측 구성요소는 0점으로 계산하지 않습니다.`;

export const WINSOR_TEXT = `역사적 분포의 상·하위 ${(WINSOR_TAIL * 100).toFixed(
  1,
)}% 를 경계값으로 눌러(winsorization) 일시적 극단치가 점수를 왜곡하지 않도록 합니다.`;
