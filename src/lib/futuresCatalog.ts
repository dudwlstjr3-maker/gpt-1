/**
 * 선물 시장 판에 올릴 항목 목록.
 *
 * 무엇을 담았나
 *   Finviz 의 선물 화면이 다루는 범위를 그대로 옮겼다 — 지수·에너지·금속·농산물·
 *   통화·금리·크립토. 서버 어댑터(값 채우기)와 화면(순서·묶음)이 같은 목록을 본다.
 *
 * 왜 'source' 를 항목마다 적어 두나
 *   선물 시세는 대부분 거래소가 파는 데이터다. CME·ICE·KRX 의 실시간·지연 시세는
 *   유료 라이선스이고 재배포도 막혀 있다. 이 앱은 처음부터 "제공업체 이용약관·
 *   재배포 권한·지연 조건을 지킨다" 를 규칙으로 두었으므로, 값을 못 넣는 항목은
 *   **왜 못 넣는지를 항목 옆에 적고 비워 둔다.** 조용히 빼면 목록이 왜 짧은지
 *   알 수가 없고, 아무 데서나 긁어 오면 규칙을 어긴다.
 *
 *   - 'eia'    : 미국 에너지정보청. **인도월별 선물 정산가를 그대로 준다** —
 *               이 목록에서 진짜 선물 계약 값이 실리는 유일한 자리다 (에너지 넷).
 *   - 'fred'   : 미국 정부·연준 공개 데이터. 무료이고 재배포에 제한이 없다.
 *   - 'binance': 거래소 공개 API. 크립토 무기한선물은 공개되어 있다.
 *   - 'none'   : 무료로 쓸 수 있는 합법 소스가 없다. reason 에 이유를 적는다.
 *
 * 'proxy' 는 무엇인가
 *   FRED 가 주는 것은 대개 **선물 계약 가격이 아니라 현물·기준 가격**이다.
 *   (예: WTI 현물 고시가 ≠ CL 선물 근월물) 흐름은 거의 같이 가지만 같은 값은
 *   아니므로, 대신 쓴 경우 그 사실을 화면에 반드시 적는다. 안 적으면 사용자가
 *   선물 가격으로 읽는다.
 */

export type FuturesGroupId = 'index' | 'energy' | 'metal' | 'agri' | 'currency' | 'rate' | 'crypto';

export interface FuturesGroup {
  id: FuturesGroupId;
  label: string;
  note: string;
}

export const FUTURES_GROUPS: FuturesGroup[] = [
  { id: 'index', label: '지수', note: '주가지수 선물. 정규장이 닫혀 있어도 거의 24시간 움직여서 다음 날 분위기를 미리 보여줍니다.' },
  { id: 'energy', label: '에너지', note: '원유·천연가스. 물가와 경기에 바로 얹히는 값입니다. 이 묶음만 인도월 정산가를 받을 수 있어, 받아진 항목에는 인도월 곡선이 함께 붙습니다.' },
  { id: 'metal', label: '금속', note: '금·은은 안전자산, 구리는 경기 민감 금속으로 읽습니다.' },
  { id: 'agri', label: '농산물', note: '곡물·소프트·축산. 식료품 물가의 앞단입니다.' },
  { id: 'currency', label: '통화', note: '달러가 오르면 대체로 원자재와 신흥국 자산이 눌립니다.' },
  { id: 'rate', label: '금리', note: '국채 금리와 선물. 금리가 오르면 채권 선물 가격은 내립니다.' },
  { id: 'crypto', label: '크립토', note: '무기한선물. 펀딩비·미결제약정은 심리 상세 화면에서 따로 봅니다.' },
];

export interface FuturesItem {
  id: string;
  /** 한국어 표시명 */
  name: string;
  /** 거래소 심볼 (CME/ICE 코드). 값이 없어도 무엇을 가리키는지는 밝힌다. */
  symbol: string;
  group: FuturesGroupId;
  precision: number;
  suffix: string;
  order: number;
  /** 이 항목의 값을 어디서 가져오는가 */
  source: 'eia' | 'fred' | 'binance' | 'none';
  /** source 가 'none' 일 때 왜 못 가져오는지 */
  reason?: string;
  /**
   * 선물이 아닌 값을 대신 쓰는 경우 무엇을 썼는지.
   * 이 문구는 화면에 그대로 나간다 — 선물 가격으로 오해하면 안 되기 때문이다.
   */
  proxy?: string;
  /**
   * 우선 소스(EIA)를 못 쓸 때 대신 채우는 곳.
   * EIA 무료 키가 없으면 선물 대신 현물 가격이 들어가는데, 그건 다른 값이므로
   * 대신 쓴 순간에만 note 를 화면에 붙인다. 키가 있으면 이 문구는 나오지 않는다.
   */
  fallback?: { source: 'fred'; note: string };
}

const EXCHANGE_PAID =
  '거래소(CME·ICE)가 파는 시세입니다. 무료로 재배포할 수 있는 소스가 없어 값을 비워 둡니다.';
const KRX_PAID = 'KRX 유료 데이터입니다. 무료로 재배포할 수 있는 소스가 없어 값을 비워 둡니다.';

export const FUTURES_ITEMS: FuturesItem[] = [
  /* ---------------- 지수 ---------------- */
  { id: 'es', name: 'S&P 500 선물', symbol: 'ES', group: 'index', precision: 2, suffix: '', order: 1, source: 'none', reason: EXCHANGE_PAID },
  { id: 'nq', name: '나스닥 100 선물', symbol: 'NQ', group: 'index', precision: 2, suffix: '', order: 2, source: 'none', reason: EXCHANGE_PAID },
  { id: 'ym', name: '다우 선물', symbol: 'YM', group: 'index', precision: 0, suffix: '', order: 3, source: 'none', reason: EXCHANGE_PAID },
  { id: 'rty', name: '러셀 2000 선물', symbol: 'RTY', group: 'index', precision: 1, suffix: '', order: 4, source: 'none', reason: EXCHANGE_PAID },
  { id: 'vx', name: '변동성지수 VIX', symbol: 'VIX', group: 'index', precision: 2, suffix: '', order: 5, source: 'fred', proxy: 'VIX 선물이 아니라 VIX 지수 종가입니다 (Cboe → FRED).' },
  { id: 'k200f', name: '코스피200 선물', symbol: 'K200', group: 'index', precision: 2, suffix: '', order: 6, source: 'none', reason: KRX_PAID },

  /* ---------------- 에너지 ---------------- */
  { id: 'cl', name: 'WTI 원유', symbol: 'CL', group: 'energy', precision: 2, suffix: '$', order: 1, source: 'eia', fallback: { source: 'fred', note: '선물 근월물이 아니라 WTI 현물 고시가입니다 (EIA → FRED). EIA 무료 키를 넣으면 선물 정산가로 바뀝니다.' } },
  { id: 'bz', name: '브렌트유', symbol: 'BZ', group: 'energy', precision: 2, suffix: '$', order: 2, source: 'fred', proxy: '선물 근월물이 아니라 브렌트 현물 고시가입니다 (EIA → FRED).' },
  { id: 'ng', name: '천연가스', symbol: 'NG', group: 'energy', precision: 3, suffix: '$', order: 3, source: 'eia', fallback: { source: 'fred', note: '선물 근월물이 아니라 헨리허브 현물 가격입니다 (EIA → FRED). EIA 무료 키를 넣으면 선물 정산가로 바뀝니다.' } },
  { id: 'ho', name: '난방유', symbol: 'HO', group: 'energy', precision: 4, suffix: '$', order: 4, source: 'eia' },
  { id: 'rb', name: '휘발유(RBOB)', symbol: 'RB', group: 'energy', precision: 4, suffix: '$', order: 5, source: 'eia' },

  /* ---------------- 금속 ---------------- */
  { id: 'gc', name: '금', symbol: 'GC', group: 'metal', precision: 2, suffix: '$', order: 1, source: 'none', reason: EXCHANGE_PAID },
  { id: 'si', name: '은', symbol: 'SI', group: 'metal', precision: 3, suffix: '$', order: 2, source: 'none', reason: EXCHANGE_PAID },
  { id: 'hg', name: '구리', symbol: 'HG', group: 'metal', precision: 4, suffix: '$', order: 3, source: 'none', reason: EXCHANGE_PAID },
  { id: 'pl', name: '백금', symbol: 'PL', group: 'metal', precision: 2, suffix: '$', order: 4, source: 'none', reason: EXCHANGE_PAID },
  { id: 'pa', name: '팔라듐', symbol: 'PA', group: 'metal', precision: 2, suffix: '$', order: 5, source: 'none', reason: EXCHANGE_PAID },

  /* ---------------- 농산물 ---------------- */
  { id: 'zc', name: '옥수수', symbol: 'ZC', group: 'agri', precision: 2, suffix: '', order: 1, source: 'none', reason: EXCHANGE_PAID },
  { id: 'zw', name: '밀', symbol: 'ZW', group: 'agri', precision: 2, suffix: '', order: 2, source: 'none', reason: EXCHANGE_PAID },
  { id: 'zs', name: '대두', symbol: 'ZS', group: 'agri', precision: 2, suffix: '', order: 3, source: 'none', reason: EXCHANGE_PAID },
  { id: 'sb', name: '설탕', symbol: 'SB', group: 'agri', precision: 2, suffix: '', order: 4, source: 'none', reason: EXCHANGE_PAID },
  { id: 'kc', name: '커피', symbol: 'KC', group: 'agri', precision: 2, suffix: '', order: 5, source: 'none', reason: EXCHANGE_PAID },
  { id: 'cc', name: '코코아', symbol: 'CC', group: 'agri', precision: 0, suffix: '', order: 6, source: 'none', reason: EXCHANGE_PAID },
  { id: 'ct', name: '면화', symbol: 'CT', group: 'agri', precision: 2, suffix: '', order: 7, source: 'none', reason: EXCHANGE_PAID },
  { id: 'le', name: '생우', symbol: 'LE', group: 'agri', precision: 2, suffix: '', order: 8, source: 'none', reason: EXCHANGE_PAID },
  { id: 'he', name: '돈육', symbol: 'HE', group: 'agri', precision: 2, suffix: '', order: 9, source: 'none', reason: EXCHANGE_PAID },

  /* ---------------- 통화 ---------------- */
  { id: 'dx', name: '달러지수', symbol: 'DXY', group: 'currency', precision: 2, suffix: '', order: 1, source: 'fred', proxy: 'ICE 달러지수 선물이 아니라 연준이 내는 광의 달러지수입니다 (FRED).' },
  { id: '6e', name: '유로/달러', symbol: 'EUR', group: 'currency', precision: 4, suffix: '', order: 2, source: 'fred', proxy: '선물이 아니라 현물 환율입니다 (연준 고시 → FRED).' },
  { id: '6j', name: '달러/엔', symbol: 'JPY', group: 'currency', precision: 2, suffix: '', order: 3, source: 'fred', proxy: '선물이 아니라 현물 환율입니다 (연준 고시 → FRED).' },
  { id: '6b', name: '파운드/달러', symbol: 'GBP', group: 'currency', precision: 4, suffix: '', order: 4, source: 'fred', proxy: '선물이 아니라 현물 환율입니다 (연준 고시 → FRED).' },
  { id: '6c', name: '달러/캐나다달러', symbol: 'CAD', group: 'currency', precision: 4, suffix: '', order: 5, source: 'fred', proxy: '선물이 아니라 현물 환율입니다 (연준 고시 → FRED).' },
  { id: '6a', name: '호주달러/달러', symbol: 'AUD', group: 'currency', precision: 4, suffix: '', order: 6, source: 'fred', proxy: '선물이 아니라 현물 환율입니다 (연준 고시 → FRED).' },
  { id: '6s', name: '달러/스위스프랑', symbol: 'CHF', group: 'currency', precision: 4, suffix: '', order: 7, source: 'fred', proxy: '선물이 아니라 현물 환율입니다 (연준 고시 → FRED).' },
  { id: 'krw', name: '원/달러', symbol: 'KRW', group: 'currency', precision: 2, suffix: '원', order: 8, source: 'fred', proxy: '선물이 아니라 현물 환율입니다 (연준 고시 → FRED).' },

  /* ---------------- 금리 ---------------- */
  { id: 'zt', name: '미국 국채 2년', symbol: 'ZT', group: 'rate', precision: 3, suffix: '%', order: 1, source: 'fred', proxy: '채권 선물 가격이 아니라 국채 2년 금리입니다 (재무부 → FRED). 금리가 오르면 선물 가격은 내립니다.' },
  { id: 'zf', name: '미국 국채 5년', symbol: 'ZF', group: 'rate', precision: 3, suffix: '%', order: 2, source: 'fred', proxy: '채권 선물 가격이 아니라 국채 5년 금리입니다 (재무부 → FRED).' },
  { id: 'zn', name: '미국 국채 10년', symbol: 'ZN', group: 'rate', precision: 3, suffix: '%', order: 3, source: 'fred', proxy: '채권 선물 가격이 아니라 국채 10년 금리입니다 (재무부 → FRED).' },
  { id: 'zb', name: '미국 국채 30년', symbol: 'ZB', group: 'rate', precision: 3, suffix: '%', order: 4, source: 'fred', proxy: '채권 선물 가격이 아니라 국채 30년 금리입니다 (재무부 → FRED).' },

  /* ---------------- 크립토 ---------------- */
  { id: 'btcf', name: '비트코인 무기한', symbol: 'BTCUSDT', group: 'crypto', precision: 0, suffix: '$', order: 1, source: 'binance' },
  { id: 'ethf', name: '이더리움 무기한', symbol: 'ETHUSDT', group: 'crypto', precision: 2, suffix: '$', order: 2, source: 'binance' },
];

export const FUTURES_RANGES = ['1D', '1W', '1M', '3M', 'YTD'] as const;
export type FuturesRange = (typeof FUTURES_RANGES)[number];
export const FUTURES_RANGE_LABEL: Record<FuturesRange, string> = {
  '1D': '하루',
  '1W': '1주',
  '1M': '1개월',
  '3M': '3개월',
  YTD: '올해',
};

/** 기간별로 며칠 전과 견줄 것인가 (거래일). 서버와 화면이 같은 표를 본다. */
export const FUTURES_LOOKBACK: Record<FuturesRange, number> = {
  '1D': 1,
  '1W': 5,
  '1M': 21,
  '3M': 63,
  YTD: 170,
};

/**
 * 지나온 값에서 고른 기간의 등락을 계산한다.
 *
 * 기간을 바꿀 때마다 서버에 다시 묻지 않으려고 화면에서 계산한다. 서버는 넉넉한
 * 길이의 선을 한 번 주고, 어느 구간을 견줄지는 화면이 정한다 — 기간 단추가
 * 즉시 반응하고, 같은 데이터로 계산하니 값이 어긋날 일도 없다.
 *
 * 선이 고른 기간만큼 길지 않으면 **없는 값을 지어내지 않고** null 을 돌려준다.
 */
export function changeOver(
  spark: { t: number; v: number }[] | undefined,
  back: number,
): { change: number; pct: number } | null {
  if (!Array.isArray(spark) || spark.length < 2) return null;
  const last = spark[spark.length - 1];
  const idx = spark.length - 1 - back;
  if (idx < 0) return null; // 그만큼 지나온 값이 없다
  const prev = spark[idx];
  if (!prev || prev.v === 0 || !Number.isFinite(prev.v) || !Number.isFinite(last.v)) return null;
  return { change: last.v - prev.v, pct: ((last.v - prev.v) / prev.v) * 100 };
}

/** 묶음별로 나눈 목록. 값이 없는 항목도 빼지 않는다 — 왜 없는지가 정보다. */
export function groupedFutures<T extends { id: string }>(
  rows: T[],
): { group: FuturesGroup; items: (T & { item: FuturesItem })[] }[] {
  const byId = new Map(FUTURES_ITEMS.map((f) => [f.id, f]));
  return FUTURES_GROUPS.map((g) => ({
    group: g,
    items: rows
      .map((r) => ({ ...r, item: byId.get(r.id) }))
      .filter((r): r is T & { item: FuturesItem } => r.item !== undefined && r.item.group === g.id)
      .sort((a, b) => a.item.order - b.item.order),
  })).filter((g) => g.items.length > 0);
}
