/**
 * 회사 목록과 재무 항목 정의.
 *
 * 무엇을 위한 파일인가
 *   지금까지 이 앱은 종목의 **가격**만 알았다. 가격만으로는 "왜 이 값인가" 를
 *   물을 수 없다. 매출이 늘고 있는지, 이익률이 유지되는지, 지금 주가가 이익의
 *   몇 배인지는 다른 자료다. 그 자료가 SEC(미국 증권거래위원회) 공시다.
 *
 * 왜 태그를 여러 개 적어 두나
 *   XBRL 은 회사마다 쓰는 태그가 다르다. 매출 하나에도
 *   Revenues · SalesRevenueNet · RevenueFromContractWithCustomerExcludingAssessedTax
 *   가 쓰이고, 같은 회사도 회계기준이 바뀌면 태그를 갈아탄다.
 *   그래서 **앞에서부터 시도해 값이 오는 첫 태그**를 쓰고, 어느 태그를 썼는지
 *   화면에 밝힌다 — 회사끼리 견줄 때 같은 것을 보고 있는지가 중요하기 때문이다.
 *
 * 약관
 *   SEC 공시 데이터는 미국 연방정부 저작물이라 재배포 제한이 없다. 무료이고 키도
 *   없다. 다만 요청에 연락처가 담긴 User-Agent 를 요구하고, 초당 10건으로 제한한다.
 *   지키지 않으면 차단한다 — 그건 약관이 아니라 접속 조건이라 코드가 지킨다.
 */

export interface CompanyRef {
  /** CATALOG 의 종목 id */
  assetId: string;
  /** SEC 중앙지수키 (10자리, 앞에 0을 채운다) */
  cik: string;
  /** 화면에 쓰는 이름 */
  name: string;
  ticker: string;
}

/**
 * CIK 는 SEC 가 회사마다 붙인 번호다. 티커가 바뀌어도 CIK 는 그대로라
 * 티커가 아니라 CIK 로 조회한다.
 */
export const COMPANIES: CompanyRef[] = [
  { assetId: 'nvda', cik: '0001045810', name: '엔비디아', ticker: 'NVDA' },
  { assetId: 'aapl', cik: '0000320193', name: '애플', ticker: 'AAPL' },
  { assetId: 'msft', cik: '0000789019', name: '마이크로소프트', ticker: 'MSFT' },
  { assetId: 'amzn', cik: '0001018724', name: '아마존', ticker: 'AMZN' },
  { assetId: 'tsla', cik: '0001318605', name: '테슬라', ticker: 'TSLA' },
];

export const COMPANY_BY_ASSET = new Map(COMPANIES.map((c) => [c.assetId, c]));

export type FinancialLineId =
  | 'revenue'
  | 'operating_income'
  | 'net_income'
  | 'eps'
  | 'operating_cash_flow'
  | 'liabilities'
  | 'equity';

export interface FinancialLineDef {
  id: FinancialLineId;
  label: string;
  /** 이 줄이 무엇인지 한 문장 — 재무제표를 처음 보는 사람 기준 */
  hint: string;
  /** 앞에서부터 시도한다. 값이 오는 첫 태그를 쓴다. */
  tags: string[];
  /** USD | shares | usd-per-share */
  unit: 'usd' | 'usd_per_share';
  /** 기간 값인가(손익·현금흐름) 시점 값인가(재무상태표) */
  kind: 'duration' | 'instant';
  /** 이 줄을 표에 크게 보여줄 것인가 */
  primary: boolean;
}

export const FINANCIAL_LINES: FinancialLineDef[] = [
  {
    id: 'revenue',
    label: '매출',
    hint: '회사가 물건과 서비스를 팔아 받은 돈입니다. 여기서 모든 비용을 빼기 전 금액입니다.',
    tags: [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'Revenues',
      'SalesRevenueNet',
      'RevenueFromContractWithCustomerIncludingAssessedTax',
    ],
    unit: 'usd',
    kind: 'duration',
    primary: true,
  },
  {
    id: 'operating_income',
    label: '영업이익',
    hint: '매출에서 원가와 판매·관리비를 뺀 값입니다. 본업으로 얼마를 벌었는지를 봅니다.',
    tags: ['OperatingIncomeLoss'],
    unit: 'usd',
    kind: 'duration',
    primary: true,
  },
  {
    id: 'net_income',
    label: '순이익',
    hint: '이자와 세금까지 다 빼고 마지막에 남은 돈입니다.',
    tags: ['NetIncomeLoss', 'ProfitLoss'],
    unit: 'usd',
    kind: 'duration',
    primary: true,
  },
  {
    id: 'eps',
    label: '주당순이익 (희석)',
    hint: '순이익을 주식 수로 나눈 값입니다. 주식 하나가 벌어들인 몫이며, PER 의 분모가 됩니다.',
    tags: ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted'],
    unit: 'usd_per_share',
    kind: 'duration',
    primary: true,
  },
  {
    id: 'operating_cash_flow',
    label: '영업활동 현금흐름',
    hint: '본업에서 실제로 들어온 현금입니다. 이익은 났는데 현금이 안 들어오는 회사를 가려냅니다.',
    tags: [
      'NetCashProvidedByUsedInOperatingActivities',
      'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
    ],
    unit: 'usd',
    kind: 'duration',
    primary: false,
  },
  {
    id: 'liabilities',
    label: '총부채',
    hint: '회사가 갚아야 할 돈의 합입니다. 특정 시점의 잔액입니다.',
    tags: ['Liabilities'],
    unit: 'usd',
    kind: 'instant',
    primary: false,
  },
  {
    id: 'equity',
    label: '자기자본',
    hint: '자산에서 부채를 뺀, 주주 몫입니다. 부채를 이것으로 나눈 것이 부채비율입니다.',
    tags: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
    unit: 'usd',
    kind: 'instant',
    primary: false,
  },
];

export const LINE_BY_ID = new Map(FINANCIAL_LINES.map((l) => [l.id, l]));

/** 표에 보여줄 기간 단위 */
export const PERIOD_KEYS = ['quarterly', 'annual'] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];
export const PERIOD_LABEL: Record<PeriodKey, string> = { quarterly: '분기', annual: '연간' };

/** 표·차트에 몇 개까지 보여줄 것인가 */
export const MAX_PERIODS = 12;
