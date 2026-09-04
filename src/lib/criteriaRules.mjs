/**
 * 내 기준 — 사용자가 정한 조건이 지금 맞는지 확인하는 순수 로직.
 *
 * **이건 매매 신호가 아니다.**
 * 이 앱은 첫 줄부터 "투자 추천·매수/매도 지시를 하지 않는다" 를 지키고 있다.
 * 그래서 여기가 하는 일은 판단이 아니라 **사실 확인**이다 —
 * 조건도 문턱도 사용자가 정하고, 앱은 "지금 그 값이 얼마인가" 만 답한다.
 *
 * 그 선을 코드로 지키는 방법
 *  1. 결과에 등급이 없다. met / unmet / unknown 세 가지뿐이고 점수를 매기지 않는다.
 *  2. 요약도 판정이 아니라 **개수**다. "5개 중 3개" 이지 "매수 우위" 가 아니다.
 *  3. 조건을 앱이 제안하지 않는다. 기본값으로 깔아 두는 조건이 없다.
 *  4. **모르는 것은 met 도 unmet 도 아니다.** 값을 못 받으면 unknown 이고,
 *     충족 개수에 들어가지 않는다. 결측을 유리하게 세면 그게 조용한 거짓말이 된다.
 *
 * .mjs 인 이유는 이 프로젝트가 새 의존성을 못 쓰고 node --test 가 TS 를 못 읽어서다.
 */

/** 비교 방향 */
export const COMPARATORS = ['gte', 'lte'];

export const COMPARATOR_LABEL = {
  gte: '이상',
  lte: '이하',
};

/**
 * 조건이 볼 수 있는 값.
 *
 * 스냅샷에 실제로 있는 것만 넣는다. 화면에 없는 지표를 조건으로 만들 수 있게 하면
 * 영원히 '판정 불가' 인 줄이 생긴다.
 */
export const SOURCE_KINDS = ['fng', 'risk_count', 'risk_value'];

/** 숫자면 그대로, 아니면 null. NaN·Infinity 도 null 이다. */
export function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * 조건 하나가 지금 어떤 상태인지.
 *
 * @returns {{ status: 'met'|'unmet'|'unknown', actual: number|null, reason?: string }}
 */
export function evaluate(criterion, snapshot) {
  if (criterion === null || typeof criterion !== 'object') {
    return { status: 'unknown', actual: null, reason: '조건이 비어 있습니다.' };
  }
  const { kind, comparator, value } = criterion;
  const target = numOrNull(value);
  if (!COMPARATORS.includes(comparator) || target === null) {
    return { status: 'unknown', actual: null, reason: '조건의 비교값이 올바르지 않습니다.' };
  }

  const actual = readValue(criterion, snapshot);
  if (actual.value === null) {
    return { status: 'unknown', actual: null, reason: actual.reason };
  }

  const met = comparator === 'gte' ? actual.value >= target : actual.value <= target;
  return { status: met ? 'met' : 'unmet', actual: actual.value };
}

/**
 * 조건이 가리키는 실제 값을 스냅샷에서 꺼낸다.
 * 못 꺼내면 이유를 함께 돌려준다 — 화면이 "왜 판정 불가인지" 를 말할 수 있어야 한다.
 */
function readValue(criterion, snapshot) {
  const s = snapshot ?? {};
  const sections = s.sections ?? {};

  if (criterion.kind === 'fng') {
    const list = sections.fng?.data ?? [];
    const hit = Array.isArray(list) ? list.find((f) => f?.market === criterion.market) : null;
    if (!hit) return { value: null, reason: '이 시장의 심리 점수를 받지 못했습니다.' };
    const v = numOrNull(hit.score);
    // 산출 불가(구성요소 부족)일 때 score 가 null 로 온다. 0 으로 읽으면 안 된다.
    if (v === null) return { value: null, reason: hit.unavailableReason ?? '심리 점수를 산출하지 못했습니다.' };
    return { value: v, reason: null };
  }

  if (criterion.kind === 'risk_count') {
    const list = sections.risk?.data?.indicators ?? [];
    if (!Array.isArray(list) || list.length === 0) {
      return { value: null, reason: '위험 지표를 받지 못했습니다.' };
    }
    // 단계를 못 매긴 지표는 세지 않는다. 세면 '주의 0개' 가 거짓이 된다.
    const known = list.filter((i) => typeof i?.level === 'string' && i.level !== 'unknown');
    if (known.length === 0) return { value: null, reason: '단계를 매긴 지표가 없습니다.' };
    return { value: known.filter((i) => i.level === criterion.level).length, reason: null };
  }

  if (criterion.kind === 'risk_value') {
    const list = sections.risk?.data?.indicators ?? [];
    const hit = Array.isArray(list) ? list.find((i) => i?.id === criterion.indicatorId) : null;
    if (!hit) return { value: null, reason: '이 지표를 받지 못했습니다.' };
    const v = numOrNull(hit.value);
    if (v === null) return { value: null, reason: hit.unavailableReason ?? '값을 받지 못했습니다.' };
    return { value: v, reason: null };
  }

  return { value: null, reason: '알 수 없는 조건입니다.' };
}

/**
 * 조건 목록 전체를 세어 본다.
 *
 * 여기서 나오는 것은 **개수뿐이다.** 등급도 점수도 만들지 않는다.
 * 사용자가 "5개 중 3개" 를 보고 무엇을 할지는 사용자가 정한다.
 */
export function summarize(criteria, snapshot) {
  const list = Array.isArray(criteria) ? criteria : [];
  const results = list.map((c) => ({ criterion: c, ...evaluate(c, snapshot) }));
  return {
    results,
    total: list.length,
    met: results.filter((r) => r.status === 'met').length,
    unmet: results.filter((r) => r.status === 'unmet').length,
    /* 판정 불가는 충족에도 미충족에도 넣지 않는다 */
    unknown: results.filter((r) => r.status === 'unknown').length,
  };
}

/** 조건을 사람이 읽는 한 줄로. 화면과 스크린리더가 같은 문장을 쓴다. */
export function describe(criterion, labels) {
  const l = labels ?? {};
  const cmp = COMPARATOR_LABEL[criterion?.comparator] ?? '';
  const v = numOrNull(criterion?.value);
  const shown = v === null ? '—' : String(v);

  if (criterion?.kind === 'fng') {
    return `${l.market ?? criterion.market} 심리 점수가 ${shown} ${cmp}`;
  }
  if (criterion?.kind === 'risk_count') {
    return `위험 신호등에서 '${l.level ?? criterion.level}' 인 지표가 ${shown}개 ${cmp}`;
  }
  if (criterion?.kind === 'risk_value') {
    return `${l.indicator ?? criterion.indicatorId} 가 ${shown} ${cmp}`;
  }
  return '알 수 없는 조건';
}
