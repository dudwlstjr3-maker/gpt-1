/**
 * 국면 전광판이 실제 주가 흐름과 맞는지 검증한 결과.
 *
 * 왜 이 파일이 코드 안에 있나
 *   전광판은 "20년 만의 공포" 같은 큰 문장을 띄운다. 그런 문장을 띄우려면
 *   그게 무슨 뜻이었는지도 같이 보여 줘야 한다. 그래서 검증 결과를 문서가 아니라
 *   **화면이 읽는 데이터**로 둔다. 숫자를 고치려면 백테스트를 다시 돌려야 한다.
 *
 * 어떻게 계산했나
 *   1990-01 ~ 2026-08 월말 기준으로 regimeRules.mjs 의 산식을 그대로 돌렸다.
 *   각 시점의 분포는 **그 시점까지의 자료로만** 만들었다(미래를 보지 않는다).
 *   점수가 나온 달마다 S&P 500 의 이후 12개월 가격 수익률과, 그 12개월 사이
 *   최저점까지의 낙폭을 같이 기록했다.
 *
 * 결론부터
 *   **"공포면 사고 과열이면 판다" 는 이 자료에서 성립하지 않는다.**
 *   그래서 이 앱은 전광판에 매수·매도라는 말을 쓰지 않는다. 규칙이라서가 아니라
 *   숫자가 그 말을 받쳐 주지 않아서다. 근거는 아래 BUCKETS 와 LIMITS 에 있다.
 */

/** 백테스트에 쓴 원자료. 화면에 그대로 표시한다. */
export const EVIDENCE_SOURCES = [
  {
    id: 'vix',
    label: 'VIX 일별 종가 (1990-01 ~ 2026-09)',
    origin: 'Cboe Volatility Index',
    via: 'github.com/datasets/finance-vix',
  },
  {
    id: 'hy',
    label: '하이일드 OAS 일별 (1996-12 ~ 2026-07)',
    origin: 'ICE BofA US High Yield Index OAS (FRED BAMLH0A0HYM2)',
    via: '독립된 두 개의 공개 사본을 받아 겹치는 5,753일이 모두 일치하는 것을 확인한 뒤 사용',
  },
  {
    id: 'spx',
    label: 'S&P 500 월별 (1871-01 ~ 2026-08)',
    origin: 'Robert Shiller 장기 시계열 (월 평균 종가)',
    via: 'github.com/datasets/s-and-p-500',
  },
];

/**
 * 화면이 쓰는 실시간 자료는 위와 다르다.
 * 검증은 위 사본으로 했고, 서비스는 FRED·Stooq 에서 직접 받는다. 산식은 같다.
 */
export const LIVE_VS_BACKTEST =
  '검증은 공개된 과거 자료 사본으로 했고, 화면의 오늘 값은 FRED 와 Stooq 에서 직접 받습니다. ' +
  '산식은 같지만 검증은 월말 기준이고 화면은 일별 기준이라 같은 국면이라도 화면 쪽이 더 극단으로 나올 수 있습니다.';

export const EVIDENCE_SAMPLE = { from: "2000-12", to: "2026-08", months: 309 };

/**
 * 점수 구간별로 그 뒤 12개월에 무슨 일이 있었나.
 *
 * months  = 그 구간에 있던 달 수
 * episodes= 그게 몇 번의 국면이었나 (연속된 달은 한 번으로 센다)
 * positiveShare = 12개월 뒤 플러스였던 달의 비율(%)
 * deepestDip = 그 12개월 사이 최저점까지 얼마나 빠졌었나(%)
 */
export const EVIDENCE_BUCKETS = [
  { id: "extreme_fear", label: "극단적 공포", from: 0, to: 10, months: 26, episodes: 4, sample: 26, fwd12Mean: 12.1, fwd12Median: 16.4, positiveShare: 65, fwd12Worst: -22.6, deepestDip: -37.8 },
  { id: "fear", label: "공포", from: 10, to: 25, months: 30, episodes: 10, sample: 30, fwd12Mean: -2.9, fwd12Median: -14, positiveShare: 47, fwd12Worst: -42.5, deepestDip: -43.6 },
  { id: "caution", label: "경계", from: 25, to: 45, months: 57, episodes: 18, sample: 57, fwd12Mean: 10, fwd12Median: 12.4, positiveShare: 86, fwd12Worst: -40.7, deepestDip: -46 },
  { id: "middle", label: "중간", from: 45, to: 55, months: 49, episodes: 21, sample: 48, fwd12Mean: 10.2, fwd12Median: 10.2, positiveShare: 90, fwd12Worst: -18.7, deepestDip: -19.1 },
  { id: "calm", label: "안정", from: 55, to: 75, months: 83, episodes: 20, sample: 81, fwd12Mean: 9.5, fwd12Median: 11.6, positiveShare: 81, fwd12Worst: -37.1, deepestDip: -37.1 },
  { id: "hot", label: "과열", from: 75, to: 90, months: 64, episodes: 11, sample: 55, fwd12Mean: 9.6, fwd12Median: 12.6, positiveShare: 80, fwd12Worst: -16.5, deepestDip: -20.3 },
  { id: "extreme_hot", label: "극단적 과열", from: 90, to: 101, months: 0, episodes: 0, sample: 0 },
];

/** 극단적 공포(10점 미만) 국면 — 26년 동안 네 번뿐이다. */
export const EXTREME_FEAR_EPISODES = [
  { from: "2000-12", to: "2001-04", months: 4, trough: "2001-03", troughScore: 2.1, fwd12: -2.7, deepestDip: -11.9 },
  { from: "2001-08", to: "2001-10", months: 3, trough: "2001-09", troughScore: 1.1, fwd12: -16.9, deepestDip: -16.9 },
  { from: "2002-06", to: "2003-03", months: 10, trough: "2002-09", troughScore: 0.8, fwd12: 17.5, deepestDip: -3.5 },
  { from: "2008-09", to: "2009-05", months: 9, trough: "2008-11", troughScore: 0.6, fwd12: 23.2, deepestDip: -14.3 },
];

/** 공포(10~25점) 국면 */
export const FEAR_EPISODES = [
  { from: "2001-01", to: "2001-01", months: 1, trough: "2001-01", troughScore: 11.7, fwd12: -14.6, deepestDip: -21.8 },
  { from: "2001-05", to: "2001-07", months: 3, trough: "2001-05", troughScore: 11.4, fwd12: -15, deepestDip: -17.8 },
  { from: "2001-11", to: "2002-05", months: 6, trough: "2001-11", troughScore: 11.5, fwd12: -19.5, deepestDip: -24.3 },
  { from: "2003-04", to: "2003-04", months: 1, trough: "2003-04", troughScore: 22, fwd12: 27.3, deepestDip: 5.2 },
  { from: "2008-01", to: "2008-08", months: 6, trough: "2008-03", troughScore: 14.9, fwd12: -42.5, deepestDip: -42.5 },
  { from: "2009-06", to: "2009-07", months: 2, trough: "2009-06", troughScore: 11.4, fwd12: 17, deepestDip: 1 },
  { from: "2010-06", to: "2010-08", months: 2, trough: "2010-06", troughScore: 18.5, fwd12: 18.8, deepestDip: -0.3 },
  { from: "2011-08", to: "2011-11", months: 4, trough: "2011-09", troughScore: 13.1, fwd12: 23, deepestDip: 2.8 },
  { from: "2020-03", to: "2020-04", months: 2, trough: "2020-03", troughScore: 12.9, fwd12: 47.4, deepestDip: 4.1 },
  { from: "2022-06", to: "2022-10", months: 3, trough: "2022-09", troughScore: 19.9, fwd12: 17.3, deepestDip: -3.2 },
];

/** 과열(75점 이상) 국면 */
export const HOT_EPISODES = [
  { from: "2007-01", to: "2007-01", months: 1, trough: "2007-01", troughScore: 76.3, fwd12: -3.2, deepestDip: -3.2 },
  { from: "2007-05", to: "2007-05", months: 1, trough: "2007-05", troughScore: 84.4, fwd12: -7.1, deepestDip: -12.9 },
  { from: "2013-03", to: "2014-06", months: 11, trough: "2013-05", troughScore: 76.2, fwd12: 15.2, deepestDip: -1.3 },
  { from: "2016-12", to: "2018-01", months: 14, trough: "2016-12", troughScore: 76.6, fwd12: 18.6, deepestDip: 1.3 },
  { from: "2018-07", to: "2018-09", months: 3, trough: "2018-07", troughScore: 80.1, fwd12: 7.2, deepestDip: -8.1 },
  { from: "2019-04", to: "2019-04", months: 1, trough: "2019-04", troughScore: 77.3, fwd12: -4.9, deepestDip: -8.7 },
  { from: "2019-11", to: "2019-12", months: 2, trough: "2019-11", troughScore: 82.7, fwd12: 14.3, deepestDip: -14.6 },
  { from: "2021-03", to: "2021-12", months: 8, trough: "2021-12", troughScore: 78.3, fwd12: -16.3, deepestDip: -20.3 },
  { from: "2023-12", to: "2024-12", months: 12, trough: "2024-04", troughScore: 76.2, fwd12: 5, deepestDip: 2.4 },
  { from: "2025-07", to: "2026-01", months: 7, trough: "2025-07", troughScore: 75.3, fwd12: 18.8, deepestDip: 1.8 },
  { from: "2026-05", to: "2026-08", months: 4, trough: "2026-07", troughScore: 76.9, fwd12: null, deepestDip: null },
];

/**
 * 자료가 실제로 말해 주는 것.
 * 각 줄은 위 숫자에서 바로 읽을 수 있는 것만 적었다.
 */
export const EVIDENCE_FINDINGS = [
  {
    id: 'extreme_is_rare',
    title: '극단은 26년에 네 번뿐이었다',
    body:
      '점수가 10 아래로 내려간 국면은 2000~2001, 2001년 9월, 2002~2003, 2008~2009 — 네 번이다. ' +
      '그중 두 번은 12개월 뒤에도 손실이었다(2001년 3월 이후 -2.7%, 2001년 9월 이후 -16.9%). ' +
      '네 번 중 두 번이면 동전 던지기와 구분되지 않는다. 신호로 쓸 수 있는 표본이 아니다.',
  },
  {
    id: 'fear_was_worst',
    title: '"공포" 구간이 모든 구간 중 성적이 가장 나빴다',
    body:
      '10~25점 구간의 이후 12개월은 평균 -2.9%, 중앙값 -14.0%, 플러스 비율 47% 로 일곱 구간 중 꼴찌였다. ' +
      '2008년 3월이 그 구간이었고 12개월 뒤 -42.5% 였다. "무서울 때 사면 된다" 는 이 자료에서 성립하지 않는다.',
  },
  {
    id: 'hot_kept_rising',
    title: '"과열" 뒤에도 대체로 더 올랐다',
    body:
      '75점 이상이던 11번의 국면 중 8번은 12개월 뒤 플러스였고, 구간 평균은 +9.6%, 플러스 비율 80% 였다. ' +
      '과열에서 팔았다면 대부분 손해였다. 90점 이상(극단적 과열)은 26년 동안 한 번도 없었다 — 위쪽 극단은 표본 자체가 0이다.',
  },
  {
    id: 'never_marked_a_top',
    title: '이 지표는 시장 고점을 한 번도 짚지 못했다',
    body:
      '2007년 10월 S&P 500 고점에서 점수는 59.1 — "안정" 이었다. 오히려 그 직후인 11~12월에 29~31점 "경계" 로 내려갔고, ' +
      '그 시점에서 12개월 뒤는 -39.7%, -40.7% 였다. 점수가 낮다는 것과 지금 사도 된다는 것은 다른 이야기다.',
  },
  {
    id: 'cost_of_entry',
    title: '맞았던 경우에도 견뎌야 했던 낙폭이 컸다',
    body:
      '극단적 공포 구간의 어떤 달에 들어갔다면 이후 12개월 사이 최대 -37.8% 까지 더 빠진 적이 있다. ' +
      '12개월 뒤 결과가 플러스였던 국면에서도 중간 과정은 그랬다.',
  },
];

/** 이 검증이 못 하는 것 */
export const EVIDENCE_LIMITS = [
  '월말 기준이라 장중·월중 급락을 놓친다. 2020년 3월 코로나 폭락은 월말에 이미 반등 중이어서 12.9점(공포)으로만 찍혔다. 화면은 일별로 계산하므로 같은 사건이 더 낮게 나올 수 있다.',
  '12개월 수익률 구간이 서로 겹친다. "26개월" 이라고 해도 실제로는 네 번의 국면이라 통계적 유의성을 주장할 수 없다.',
  'S&P 500 가격지수 기준이라 배당이 빠져 있다. 실제 보유 수익률은 이보다 연 1~2%p 정도 높다.',
  '신용 스프레드 자료가 1996년부터라 그 이전 구간은 세 축으로만 계산했다.',
  '미국 시장만 본 것이다. 한국·크립토에는 그대로 적용되지 않는다.',
  '과거에 그랬다는 기록일 뿐 앞으로도 그럴 것이라는 근거가 아니다.',
];
