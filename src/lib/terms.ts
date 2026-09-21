/**
 * 용어 사전 — 큰 글씨는 쉬운 우리말, 작은 글씨는 원래 이름.
 *
 * 왜 필요한가
 *   ROE · PER · EPS · OAS 같은 말은 아는 사람에게만 짧고, 모르는 사람에게는
 *   아무 뜻이 없다. 그렇다고 원래 이름을 지워 버리면 검색도 못 하고, 다른 데서
 *   같은 값을 봤을 때 같은 것인지 알 수 없다.
 *
 *   그래서 **둘 다 적는다.** 큰 글씨로 무슨 뜻인지 우리말로 먼저 말하고,
 *   그 아래 작은 글씨로 원래 이름을 붙인다. 처음 보는 사람은 위만 읽으면 되고,
 *   아는 사람은 아래를 보고 무엇인지 확인하면 된다.
 *
 * 쓰는 법
 *   화면에서 `<TermLabel id="per" />` 처럼 쓴다. 문구를 파일마다 손으로 적으면
 *   같은 용어가 화면마다 다르게 불리므로, 이름은 여기 한 곳에서만 정한다.
 *
 * 이름을 지을 때 지키는 것
 *   · 우리말 이름은 **뜻을 그대로 풀어 쓴다.** '주가수익비율' 은 한자어일 뿐
 *     여전히 설명이 아니다. '주가가 이익의 몇 배' 라야 읽고 바로 안다.
 *   · 사거나 팔라는 뜻이 묻어나는 말은 쓰지 않는다 ('저평가' · '고평가' 같은 말).
 *   · 원어 칸에는 한국어 용어와 영어를 함께 적는다 — 기사에서 둘 다 쓰인다.
 */

export interface TermEntry {
  /** 큰 글씨 — 쉬운 우리말 */
  plain: string;
  /** 작은 글씨 — 원래 이름 (한국어 용어 · 영어) */
  term: string;
  /** 한 줄 뜻. 필요한 화면에서만 쓴다. */
  what?: string;
}

export const TERMS: Record<string, TermEntry> = {
  /* ---------------- 재무제표 ---------------- */
  per: {
    plain: '주가가 이익의 몇 배',
    term: '주가수익비율 · PER',
    what: '지금 주가를 1주가 번 돈으로 나눈 값입니다. 숫자가 클수록 번 돈에 비해 주가가 비싸다는 뜻입니다.',
  },
  eps: {
    plain: '1주가 번 돈',
    term: '주당순이익(희석) · EPS',
    what: '순이익을 주식 수로 나눈 값입니다. 앞의 "몇 배" 를 구할 때 나누는 쪽이 이 값입니다.',
  },
  revenue: {
    plain: '판 돈',
    term: '매출 · Revenue',
    what: '물건과 서비스를 팔아 받은 돈입니다. 여기서 모든 비용을 빼기 전 금액입니다.',
  },
  operating_income: {
    plain: '본업으로 번 돈',
    term: '영업이익 · Operating income',
    what: '판 돈에서 만드는 비용과 파는 비용을 뺀 값입니다.',
  },
  net_income: {
    plain: '마지막에 남은 돈',
    term: '순이익 · Net income',
    what: '이자와 세금까지 다 빼고 최종적으로 남은 돈입니다.',
  },
  operating_cash_flow: {
    plain: '실제로 들어온 현금',
    term: '영업활동 현금흐름 · Operating cash flow',
    what: '장부상 이익이 아니라 본업에서 실제로 들어온 현금입니다.',
  },
  liabilities: {
    plain: '갚아야 할 돈',
    term: '총부채 · Liabilities',
    what: '회사가 남에게 갚아야 할 돈을 모두 더한 것입니다. 그 날짜의 잔액입니다.',
  },
  equity: {
    plain: '주주 몫',
    term: '자기자본 · Equity',
    what: '가진 것에서 갚아야 할 돈을 뺀 나머지입니다.',
  },
  operating_margin: {
    plain: '100원 팔아 남는 돈',
    term: '영업이익률 · Operating margin',
    what: '본업으로 번 돈을 판 돈으로 나눈 비율입니다.',
  },
  revenue_growth: {
    plain: '판 돈이 얼마나 늘었나',
    term: '매출 증감률 · Revenue growth',
    what: '1년 전 같은 기간과 견준 값입니다. 계절을 타는 장사라 직전 분기와는 견주지 않습니다.',
  },
  form_10k: { plain: '연간보고서', term: '10-K' },
  form_10q: { plain: '분기보고서', term: '10-Q' },
  cik: { plain: '회사 번호', term: 'CIK' },
  xbrl_tag: {
    plain: '공시 항목 이름',
    term: 'XBRL 태그',
    what: '회사가 이 값을 어떤 이름으로 신고했는지입니다. 회사마다 이름이 달라서 함께 적습니다.',
  },
  sec: { plain: '미국 증권거래위원회', term: 'SEC' },

  /* ---------------- 선물 ---------------- */
  contango: {
    plain: '먼 달이 더 비쌈',
    term: '콘탱고 · Contango',
    what: '나중에 받는 계약이 더 비싼 상태입니다. 지금 당장은 물량이 넉넉하다는 쪽으로 읽습니다.',
  },
  backwardation: {
    plain: '가까운 달이 더 비쌈',
    term: '백워데이션 · Backwardation',
    what: '당장 받는 계약이 더 비싼 상태입니다. 지금 물량이 모자란다는 쪽으로 읽습니다.',
  },
  futures_curve: {
    plain: '언제 받느냐에 따른 값 차이',
    term: '인도월 곡선 · Futures curve',
  },

  /* ---------------- 위험 신호등 ---------------- */
  hy_oas: {
    plain: '위험한 회사가 더 무는 이자',
    term: '하이일드 스프레드 · High Yield OAS',
    what: '신용등급이 낮은 회사가 나라보다 얼마나 더 높은 이자를 물어야 하는지입니다. 벌어질수록 불안하다는 뜻입니다.',
  },
};

export function termOf(id: string): TermEntry | null {
  return TERMS[id] ?? null;
}
