export const REGIONS: [string, string][] = [
  ["seoul", "서울"], ["gyeonggi", "경기"], ["incheon", "인천"], ["busan", "부산"], ["daegu", "대구"],
  ["gwangju", "광주"], ["daejeon", "대전"], ["ulsan", "울산"], ["sejong", "세종"], ["gangwon", "강원"],
  ["chungbuk", "충북"], ["chungnam", "충남"], ["jeonbuk", "전북"], ["jeonnam", "전남"],
  ["gyeongbuk", "경북"], ["gyeongnam", "경남"], ["jeju", "제주"],
];
export const RANKS: [string, string][] = [
  ["counselor", "상담사"], ["team_leader", "팀장"], ["director", "본부장"], ["newbie", "신입·교육생"],
];
export const PROPERTY_TYPES: [string, string][] = [
  ["apartment", "아파트"], ["officetel", "오피스텔"], ["commercial", "상가"],
  ["knowledge_center", "지식산업센터"], ["lodging", "생활숙박시설"], ["townhouse", "타운하우스"], ["etc", "기타"],
];
export const RT_BASIS: [string, string][] = [
  ["per_contract", "계약 1건당"], ["per_unit", "호실(세대)당"], ["percent", "분양가 대비 %"], ["negotiable", "협의"],
];
export const CONTRACT_TYPES: [string, string][] = [
  ["commission", "위촉(프리랜서)"], ["employment", "근로계약"], ["etc", "기타"],
];
export const SITE_STATUS: [string, string][] = [
  ["upcoming", "분양 예정"], ["recruiting", "인력 모집 중"], ["selling", "분양 중"], ["closed", "마감"],
];
export const JOB_STATUS: Record<string, string> = {
  pending: "검토 중", published: "게시 중", rejected: "반려", closed: "마감",
};
export const BENEFITS = ["숙소 제공", "식대 지원", "교통비 지원", "주차 지원", "교육 지원", "4대보험"];
export const BOARD_CATEGORIES: [string, string][] = [
  ["free", "자유"], ["site", "현장정보"], ["qna", "질문"], ["settle", "수수료·정산"],
];
export const REPORT_REASONS: [string, string][] = [
  ["spam", "스팸·홍보"], ["abuse", "욕설·비방"], ["false_job", "허위 공고"],
  ["rights", "권리침해(명예훼손 등)"], ["obscene", "음란·불법"], ["other", "기타"],
];
export const SEEKING_STATUS: [string, string][] = [
  ["seeking", "적극 구직 중"], ["open", "좋은 제안이면 이동"], ["not_seeking", "구직 안 함"],
];
export const RT_MIN_OPTIONS: [string, string][] = [
  ["1000000", "100만원 이상"], ["2000000", "200만원 이상"], ["3000000", "300만원 이상"], ["5000000", "500만원 이상"],
];
export const DAILY_MIN_OPTIONS: [string, string][] = [
  ["30000", "3만원 이상"], ["50000", "5만원 이상"], ["100000", "10만원 이상"],
];

export const label = (pairs: [string, string][], key: string | null | undefined) =>
  pairs.find(([k]) => k === key)?.[1] ?? key ?? "";
export const keys = (pairs: [string, string][]) => pairs.map(([k]) => k);
