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

import { CATALOG_BY_ID } from '@/lib/catalog';
import { topic } from '@/lib/particle.mjs';
import { TERMS } from '@/lib/terms';

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

/**
 * 재무제표를 못 보여 주는 이유.
 *
 * 두 가지를 갈라 적는다. 예전에는 한 문장으로 뭉뚱그렸는데, 그러면 메타나
 * AMD 앞에서 "SEC 공시가 있는 미국 상장사만 보여줍니다" 라고 말하게 된다 —
 * 그 회사들은 미국 상장사이고 공시도 있다. 틀린 말을 하는 셈이다.
 *
 *  ① 애초에 공시가 없는 것 — 지수·원자재·환율·코인·한국 종목.
 *  ② 공시는 있는데 아직 잇지 않은 것 — 회사 번호(CIK)를 확인해 companyCatalog
 *     에 적어야 잇힌다. CIK 를 짐작으로 적으면 엉뚱한 회사의 재무제표가 나오므로
 *     확인한 것만 적는다.
 */
export function fundamentalsUnavailableReason(assetId: string): string {
  const item = CATALOG_BY_ID.get(assetId);
  if (item && item.market === 'us' && item.kind === 'equity') {
    return `${item.name}${topic(item.name)} 미국 상장사지만 회사 번호(CIK)를 확인하지 못해 아직 재무제표를 잇지 않았습니다. 시세와 그래프는 그대로 나옵니다.`;
  }
  return 'SEC 공시가 있는 미국 상장사만 재무제표를 보여줍니다. 지수·원자재·환율·코인에는 공시가 없습니다.';
}

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
  /** 큰 글씨 — 쉬운 우리말 (terms.ts 에서 가져온다) */
  label: string;
  /** 작은 글씨 — 원래 이름 */
  term: string;
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

/**
 * 이름과 설명은 손으로 적지 않고 용어 사전에서 가져온다.
 * 같은 용어가 화면마다 다르게 불리지 않게 하려는 것이다.
 */
function named(id: FinancialLineId) {
  const t = TERMS[id];
  if (!t) throw new Error(`용어 사전에 없는 항목입니다: ${id}`);
  return { id, label: t.plain, term: t.term, hint: t.what ?? '' };
}

export const FINANCIAL_LINES: FinancialLineDef[] = [
  {
    ...named('revenue'),
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
    ...named('operating_income'),
    tags: ['OperatingIncomeLoss'],
    unit: 'usd',
    kind: 'duration',
    primary: true,
  },
  {
    ...named('net_income'),
    tags: ['NetIncomeLoss', 'ProfitLoss'],
    unit: 'usd',
    kind: 'duration',
    primary: true,
  },
  {
    ...named('eps'),
    tags: ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted'],
    unit: 'usd_per_share',
    kind: 'duration',
    primary: true,
  },
  {
    ...named('operating_cash_flow'),
    tags: [
      'NetCashProvidedByUsedInOperatingActivities',
      'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
    ],
    unit: 'usd',
    kind: 'duration',
    primary: false,
  },
  {
    ...named('liabilities'),
    tags: ['Liabilities'],
    unit: 'usd',
    kind: 'instant',
    primary: false,
  },
  {
    ...named('equity'),
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
