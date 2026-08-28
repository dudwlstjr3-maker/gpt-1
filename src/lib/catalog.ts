/**
 * 시장별 표시 항목 카탈로그.
 * 서버 어댑터(값 채우기)와 클라이언트(순서·표시 설정 UI)가 같은 목록을 본다.
 */

import type { MarketId, QuoteKind, Unit } from '@/types';

export interface CatalogItem {
  id: string;
  name: string;
  symbol: string;
  market: MarketId;
  kind: QuoteKind;
  unit: Unit;
  precision: number;
  currency: 'KRW' | 'USD' | null;
  /** 홈 화면 기본 노출 여부 */
  home: boolean;
  /** 거래량 표시 여부 */
  hasVolume: boolean;
  /** 기본 정렬 순서 */
  order: number;
  /** 짧은 설명 (상세/툴팁) */
  note?: string;
  /**
   * 지수의 기준 시점과 기준값.
   *
   * "3,714" 라는 숫자 자체는 아무 뜻이 없다. 언제를 100(또는 1000)으로 놓고
   * 거기서 몇 배가 됐는지를 알아야 읽을 수 있어서, 기준점을 같이 적는다.
   * 기준점이 없는 값(가격·금리·환율)에는 두지 않는다.
   */
  baseline?: string;
}

export const CATALOG: CatalogItem[] = [
  /* ------------------------------- 미국 ------------------------------- */
  { id: 'spx', name: 'S&P 500', symbol: 'SPX', market: 'us', kind: 'index', unit: 'point', precision: 2, currency: null, home: true, hasVolume: false, order: 1 },
  { id: 'ndx', name: 'Nasdaq Composite', symbol: 'IXIC', market: 'us', kind: 'index', unit: 'point', precision: 2, currency: null, home: true, hasVolume: false, order: 2 },
  { id: 'dji', name: 'Dow Jones', symbol: 'DJI', market: 'us', kind: 'index', unit: 'point', precision: 2, currency: null, home: false, hasVolume: false, order: 3 },
  { id: 'rut', name: 'Russell 2000', symbol: 'RUT', market: 'us', kind: 'index', unit: 'point', precision: 2, currency: null, home: false, hasVolume: false, order: 4 },
  { id: 'vix', name: 'VIX', symbol: 'VIX', market: 'us', kind: 'volatility', unit: 'point', precision: 2, currency: null, home: true, hasVolume: false, order: 5, note: '변동성지수 — 높을수록 시장 불안' },
  { id: 'ust2', name: '미국 국채 2년', symbol: 'US2Y', market: 'us', kind: 'rate', unit: 'percent', precision: 3, currency: null, home: false, hasVolume: false, order: 6 },
  { id: 'ust10', name: '미국 국채 10년', symbol: 'US10Y', market: 'us', kind: 'rate', unit: 'percent', precision: 3, currency: null, home: true, hasVolume: false, order: 7 },
  { id: 'us_spread_10_2', name: '10년-2년 금리차', symbol: '10Y-2Y', market: 'us', kind: 'spread', unit: 'bp', precision: 1, currency: null, home: true, hasVolume: false, order: 8, note: '음수면 장단기 금리 역전' },
  { id: 'dxy', name: '달러지수 DXY', symbol: 'DXY', market: 'us', kind: 'fx', unit: 'point', precision: 2, currency: null, home: false, hasVolume: false, order: 9 , baseline: '1973년 3월 = 100'},
  { id: 'gold', name: '금', symbol: 'XAU', market: 'us', kind: 'commodity', unit: 'currency', precision: 2, currency: 'USD', home: false, hasVolume: false, order: 10 },
  { id: 'wti', name: 'WTI 원유', symbol: 'CL', market: 'us', kind: 'commodity', unit: 'currency', precision: 2, currency: 'USD', home: false, hasVolume: false, order: 11 },
  { id: 'nvda', name: '엔비디아', symbol: 'NVDA', market: 'us', kind: 'equity', unit: 'currency', precision: 2, currency: 'USD', home: true, hasVolume: true, order: 12 },
  { id: 'aapl', name: '애플', symbol: 'AAPL', market: 'us', kind: 'equity', unit: 'currency', precision: 2, currency: 'USD', home: false, hasVolume: true, order: 13 },
  { id: 'msft', name: '마이크로소프트', symbol: 'MSFT', market: 'us', kind: 'equity', unit: 'currency', precision: 2, currency: 'USD', home: false, hasVolume: true, order: 14 },
  { id: 'amzn', name: '아마존', symbol: 'AMZN', market: 'us', kind: 'equity', unit: 'currency', precision: 2, currency: 'USD', home: false, hasVolume: true, order: 15 },
  { id: 'tsla', name: '테슬라', symbol: 'TSLA', market: 'us', kind: 'equity', unit: 'currency', precision: 2, currency: 'USD', home: false, hasVolume: true, order: 16 },

  /* ------------------------------- 한국 ------------------------------- */
  { id: 'kospi', name: 'KOSPI', symbol: 'KOSPI', market: 'kr', kind: 'index', unit: 'point', precision: 2, currency: null, home: true, hasVolume: true, order: 1 , baseline: '1980년 1월 4일 = 100'},
  { id: 'kosdaq', name: 'KOSDAQ', symbol: 'KOSDAQ', market: 'kr', kind: 'index', unit: 'point', precision: 2, currency: null, home: true, hasVolume: true, order: 2 , baseline: '1996년 7월 1일 = 1,000'},
  { id: 'kospi200', name: 'KOSPI 200', symbol: 'KOSPI200', market: 'kr', kind: 'index', unit: 'point', precision: 2, currency: null, home: false, hasVolume: false, order: 3 , baseline: '1990년 1월 3일 = 100'},
  { id: 'vkospi', name: 'VKOSPI', symbol: 'VKOSPI', market: 'kr', kind: 'volatility', unit: 'point', precision: 2, currency: null, home: true, hasVolume: false, order: 4, note: '한국 변동성지수' },
  { id: 'usdkrw', name: 'USD/KRW', symbol: 'USDKRW', market: 'kr', kind: 'fx', unit: 'point', precision: 2, currency: null, home: true, hasVolume: false, order: 5, note: '상승 = 원화 약세' },
  { id: 'ktb3', name: '국고채 3년', symbol: 'KTB3Y', market: 'kr', kind: 'rate', unit: 'percent', precision: 3, currency: null, home: false, hasVolume: false, order: 6 },
  { id: 'ktb10', name: '국고채 10년', symbol: 'KTB10Y', market: 'kr', kind: 'rate', unit: 'percent', precision: 3, currency: null, home: false, hasVolume: false, order: 7 },
  { id: 'samsung', name: '삼성전자', symbol: '005930', market: 'kr', kind: 'equity', unit: 'currency', precision: 0, currency: 'KRW', home: true, hasVolume: true, order: 8 },
  { id: 'hynix', name: 'SK하이닉스', symbol: '000660', market: 'kr', kind: 'equity', unit: 'currency', precision: 0, currency: 'KRW', home: false, hasVolume: true, order: 9 },
  { id: 'hyundai', name: '현대차', symbol: '005380', market: 'kr', kind: 'equity', unit: 'currency', precision: 0, currency: 'KRW', home: false, hasVolume: true, order: 10 },
  { id: 'naver', name: 'NAVER', symbol: '035420', market: 'kr', kind: 'equity', unit: 'currency', precision: 0, currency: 'KRW', home: false, hasVolume: true, order: 11 },
  { id: 'kakao', name: '카카오', symbol: '035720', market: 'kr', kind: 'equity', unit: 'currency', precision: 0, currency: 'KRW', home: false, hasVolume: true, order: 12 },

  /* ------------------------------ 크립토 ------------------------------ */
  { id: 'btc', name: '비트코인', symbol: 'BTC', market: 'crypto', kind: 'crypto', unit: 'currency', precision: 0, currency: 'USD', home: true, hasVolume: true, order: 1 },
  { id: 'eth', name: '이더리움', symbol: 'ETH', market: 'crypto', kind: 'crypto', unit: 'currency', precision: 2, currency: 'USD', home: true, hasVolume: true, order: 2 },
  { id: 'xrp', name: '리플', symbol: 'XRP', market: 'crypto', kind: 'crypto', unit: 'currency', precision: 4, currency: 'USD', home: false, hasVolume: true, order: 3 },
  { id: 'sol', name: '솔라나', symbol: 'SOL', market: 'crypto', kind: 'crypto', unit: 'currency', precision: 2, currency: 'USD', home: false, hasVolume: true, order: 4 },
  { id: 'bnb', name: 'BNB', symbol: 'BNB', market: 'crypto', kind: 'crypto', unit: 'currency', precision: 2, currency: 'USD', home: false, hasVolume: true, order: 5 },
  { id: 'total_mcap', name: '전체 시가총액', symbol: 'TOTAL', market: 'crypto', kind: 'stat', unit: 'usd_bn', precision: 2, currency: null, home: true, hasVolume: false, order: 6 },
  { id: 'total_vol', name: '24시간 거래량', symbol: 'VOL24', market: 'crypto', kind: 'stat', unit: 'usd_bn', precision: 2, currency: null, home: false, hasVolume: false, order: 7 },
  { id: 'btc_dom', name: 'BTC 도미넌스', symbol: 'BTC.D', market: 'crypto', kind: 'stat', unit: 'percent', precision: 2, currency: null, home: true, hasVolume: false, order: 8 },
  { id: 'stable_mcap', name: '스테이블코인 시총', symbol: 'STABLE', market: 'crypto', kind: 'stat', unit: 'usd_bn', precision: 2, currency: null, home: false, hasVolume: false, order: 9 },
  { id: 'funding', name: '선물 펀딩비', symbol: 'FUNDING', market: 'crypto', kind: 'stat', unit: 'percent', precision: 4, currency: null, home: false, hasVolume: false, order: 10, note: '양수 = 롱 포지션이 비용 지불' },
  { id: 'open_interest', name: '미결제약정', symbol: 'OI', market: 'crypto', kind: 'stat', unit: 'usd_bn', precision: 2, currency: null, home: false, hasVolume: false, order: 11 },
  { id: 'liquidations', name: '24시간 청산 규모', symbol: 'LIQ', market: 'crypto', kind: 'stat', unit: 'usd_bn', precision: 3, currency: null, home: false, hasVolume: false, order: 12 },
];

export const CATALOG_BY_ID = new Map(CATALOG.map((c) => [c.id, c]));

export function catalogFor(market: MarketId): CatalogItem[] {
  return CATALOG.filter((c) => c.market === market).sort((a, b) => a.order - b.order);
}

export function defaultHomeIds(): string[] {
  return CATALOG.filter((c) => c.home).map((c) => c.id);
}

export function defaultWatchlist(): string[] {
  return ['spx', 'kospi', 'btc', 'usdkrw', 'vix'];
}
