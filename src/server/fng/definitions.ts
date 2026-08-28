/**
 * Fear & Greed 자체 산출 지수 — 구성요소 정의.
 *
 * 이 앱의 점수는 외부 서비스의 공식 지수를 복제한 것이 아니라,
 * 합법적으로 접근 가능한 시장 데이터로 직접 계산한 "자체 산출 지수"다.
 * 세 시장 모두 0~100 척도를 쓰지만 구성 지표가 다르므로 직접 비교 대상이 아니다.
 */

import type { DataSource, MarketId } from '@/types';

export const FORMULA_VERSION = 'v2.1.0';

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
  trends: src('검색 관심도 공개 API', 'https://trends.google.com', 1440, '공개 지수 이용약관 준수, 원시 데이터 재배포 금지'),
  news: src('뉴스 RSS/공개 API', '', 30, '헤드라인·링크만 사용, 전문 재배포 금지'),
};

/* ------------------------------------------------------------------ */
/* 미국                                                                 */
/* ------------------------------------------------------------------ */
/* 미국                                                                 */
/*                                                                     */
/* 구성 항목은 CNN Fear & Greed Index 가 공개한 7가지 축과 같은 것을 쓴다.  */
/* 다만 점수는 그쪽 값을 가져오는 게 아니라, 같은 성격의 데이터를 받아       */
/* 우리 산식(역사적 분포 백분위 → 가중평균)으로 직접 계산한다.              */
/* 따라서 같은 날 두 숫자가 다를 수 있고, 그게 정상이다.                    */
/*                                                                     */
/* CNN 은 7축을 동일 가중으로 합친다. 여기서도 동일 가중을 따르되            */
/* 정수 가중치 합을 100 으로 맞추기 위해 두 항목만 15% 로 둔다(사실상 균등). */
/* ------------------------------------------------------------------ */

const US_COMPONENTS: ComponentDef[] = [
  {
    id: 'us_momentum',
    label: '시장 모멘텀',
    weight: 15,
    description: 'S&P 500 종가가 125일 이동평균보다 얼마나 위/아래에 있는지를 본다. 평균 위로 멀어질수록 탐욕 쪽이다.',
    subMetrics: [
      { id: 'spx_ma125_gap', label: 'S&P 500 125일 이격도', weight: 100, invert: false, precision: 2, suffix: '%', hint: '종가 / 125일 이동평균 - 1' },
    ],
    plannedSources: [S.stooq],
  },
  {
    id: 'us_strength',
    label: '주가 강도',
    weight: 15,
    description: '52주 신고가를 새로 쓴 종목이 신저가 종목보다 얼마나 많은지를 본다. 신고가가 많을수록 탐욕 쪽이다.',
    subMetrics: [
      { id: 'us_new_high_low', label: '52주 신고가 비중', weight: 100, invert: false, precision: 1, suffix: '%', hint: '신고가 / (신고가 + 신저가)' },
    ],
    plannedSources: [S.stooq],
  },
  {
    id: 'us_breadth',
    label: '주가 폭',
    weight: 14,
    description: '오른 종목과 내린 종목의 거래량 차이를 누적해서 본다. 오르는 종목에 거래가 몰릴수록 탐욕 쪽이다.',
    subMetrics: [
      { id: 'us_volume_breadth', label: '거래량 기준 등락 누적', weight: 100, invert: false, precision: 1, suffix: '', hint: '상승 종목 거래량 - 하락 종목 거래량 (누적·평활)' },
    ],
    plannedSources: [S.stooq],
  },
  {
    id: 'us_putcall',
    label: '풋/콜 옵션',
    weight: 14,
    description: '주식 옵션의 풋/콜 비율 5일 평균. 풋(하락 대비)이 많을수록 공포 쪽이다.',
    subMetrics: [
      { id: 'us_equity_pcr_5d', label: '주식 풋/콜 비율 (5일 평균)', weight: 100, invert: true, precision: 3, suffix: '', hint: 'Cboe equity put/call ratio' },
    ],
    plannedSources: [S.cboe],
  },
  {
    id: 'us_vix',
    label: '시장 변동성',
    weight: 14,
    description: 'VIX 가 자기 50일 평균보다 얼마나 높은지를 본다. 평균 위로 튈수록 공포 쪽이다.',
    subMetrics: [
      { id: 'vix_ma50_gap', label: 'VIX 50일 이격도', weight: 100, invert: true, precision: 2, suffix: '%', hint: 'VIX / 50일 이동평균 - 1' },
    ],
    plannedSources: [S.stooq, S.cboe],
  },
  {
    id: 'us_safe_haven',
    label: '안전자산 선호',
    weight: 14,
    description: '최근 20거래일 동안 주식이 국채보다 얼마나 더 벌었는지를 본다. 국채가 앞서면 공포 쪽이다.',
    subMetrics: [
      { id: 'us_safe_haven', label: '주식-국채 20일 상대성과', weight: 100, invert: false, precision: 2, suffix: '%p', hint: 'S&P 500 20일 수익률 - 미 국채 20일 수익률' },
    ],
    plannedSources: [S.fred, S.stooq],
  },
  {
    id: 'us_junk',
    label: '정크본드 수요',
    weight: 14,
    description: '신용등급 낮은 회사채가 국채보다 더 물어야 하는 금리(스프레드)를 본다. 벌어질수록 공포 쪽이다.',
    subMetrics: [
      { id: 'us_hy_oas', label: '하이일드 OAS', weight: 100, invert: true, precision: 2, suffix: '%', hint: 'ICE BofA High Yield OAS' },
    ],
    plannedSources: [S.fred],
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
    label: '신용잔고 · 투자자예탁금 · KOSDAQ 상대 강도',
    weight: 10,
    description:
      '빚내서 사는 돈(신용융자잔고), 증권계좌에 들어와 대기 중인 돈(투자자예탁금), 그리고 KOSDAQ 의 KOSPI 대비 상대강도로 위험선호를 본다. 투자자예탁금은 국내 시장에서 오래 쓰인 대기 매수 자금 지표라 넣었다.',
    subMetrics: [
      { id: 'kr_margin_chg_20d', label: '신용융자잔고 20일 증감률', weight: 35, invert: false, precision: 2, suffix: '%', hint: '증가 = 위험선호' },
      { id: 'kr_deposit_chg_20d', label: '투자자예탁금 20일 증감률', weight: 35, invert: false, precision: 2, suffix: '%', hint: '증가 = 대기 매수 자금 유입' },
      { id: 'kosdaq_rel_kospi_60d', label: 'KOSDAQ 상대강도 (60일)', weight: 30, invert: false, precision: 2, suffix: '%p', hint: 'KOSDAQ - KOSPI 60일 수익률' },
    ],
    plannedSources: [S.krx, S.ecos],
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
    weight: 18,
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
    weight: 12,
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
    weight: 8,
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
    id: 'cr_attention',
    label: '검색 관심도와 뉴스 심리',
    weight: 7,
    description:
      '"비트코인"류 검색어의 관심도와, 출처가 확인된 뉴스 헤드라인의 긍/부정 비율. 관심이 몰릴수록 탐욕 쪽으로 본다. 근거가 부족하면 결측 처리한다.',
    subMetrics: [
      { id: 'search_trend', label: '검색 관심도', weight: 60, invert: false, precision: 1, suffix: '', hint: '주요 검색어의 상대 관심도 0~100' },
      { id: 'news_sentiment', label: '뉴스 심리 지수', weight: 40, invert: false, precision: 1, suffix: '', hint: '헤드라인 긍정 비율 기반' },
    ],
    plannedSources: [S.trends, S.news],
  },
];

/* ------------------------------------------------------------------ */
/* 구성 항목을 정할 때 무엇을 참고했나                                     */
/*                                                                     */
/* 다른 공포·탐욕 지수들이 공개한 방법론을 훑어보고, 우리 목록에 빠진 것과   */
/* 굳이 넣을 필요가 없는 것을 정리한 결과를 그대로 적어 둔다.               */
/* 어느 지수의 숫자도 가져오지 않는다. 참고한 것은 "무엇을 보는가"뿐이다.    */
/* ------------------------------------------------------------------ */

export const COMPOSITION_NOTES: Record<MarketId, string> = {
  us:
    '미국은 널리 알려진 7가지 축(모멘텀·주가 강도·주가 폭·풋/콜·변동성·안전자산 선호·정크본드 수요)을 그대로 씁니다. ' +
    '개인투자자 설문 심리(AAII)나 운용사 노출도(NAAIM) 같은 설문 지표도 검토했지만, 재배포 조건이 명확하지 않아 넣지 않았습니다. ' +
    '숫자는 이 앱이 직접 계산한 값이며 공식 지수가 아닙니다.',
  kr:
    '한국은 공표된 표준 공포·탐욕 지수가 없어, 국내에서 오래 쓰인 심리 지표들을 모았습니다. ' +
    '수급(외국인·기관), 변동성(VKOSPI), 시장 폭, 파생 풋/콜, 환율에 더해 신용융자잔고와 투자자예탁금을 함께 봅니다. ' +
    '예탁금은 "증권계좌에 들어와 아직 안 쓴 돈"이라 국내 대기 매수 자금을 읽는 데 오래 쓰여 온 지표입니다.',
  crypto:
    '크립토는 공개된 코인 공포·탐욕 지수들이 공통으로 쓰는 축(변동성, 모멘텀·거래량, 도미넌스, 검색 관심도)을 기준으로 맞췄습니다. ' +
    '빠져 있던 검색 관심도를 새로 넣고, 다른 지수들이 가장 무겁게 두는 변동성 비중을 올렸습니다. ' +
    '대신 파생(펀딩비·미결제약정·청산)과 스테이블코인·거래소 유출입처럼 코인 시장에서만 볼 수 있는 항목은 그대로 둡니다. ' +
    'SNS 게시물 수를 세는 방식은 봇 계정을 걸러낼 방법이 없어 넣지 않았습니다.',
};

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
