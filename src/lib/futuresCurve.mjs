/**
 * 인도월 곡선 읽기 — 콘탱고 · 백워데이션.
 *
 * 무엇인가
 *   같은 상품이라도 "이번 달에 받는 계약" 과 "넉 달 뒤에 받는 계약" 의 값은 다르다.
 *   그 네 개를 나란히 놓은 것이 인도월 곡선이다.
 *
 *     먼 달이 더 비싸다  → 콘탱고    → 지금 당장은 넉넉하다는 쪽으로 읽는다
 *     가까운 달이 더 비싸다 → 백워데이션 → 지금 당장 모자란다는 쪽으로 읽는다
 *
 *   가격 하나만 보면 "비싸다/싸다" 밖에 못 읽는다. 곡선을 같이 보면
 *   **시장이 앞으로를 어떻게 보고 있는지** 한 줄이 더 붙는다. 이 화면이
 *   숫자를 늘어놓기만 하지 않으려면 이런 재료가 필요하다.
 *
 * 왜 여기(순수 .mjs)에 있나
 *   서버·화면·미리보기 세 곳이 같은 규칙을 봐야 하고, node --test 로 그 규칙만
 *   따로 태울 수 있어야 한다. 그래서 네트워크가 섞이지 않는 순수 함수로 둔다.
 *
 * 하지 않는 것
 *   "그러니 사라/팔아라" 는 말은 하지 않는다. 모양과 그 모양이 무엇을 가리키는지만
 *   적는다. 곡선이 모자라면(계약이 두 개도 안 오면) 지어내지 않고 null 을 준다.
 */

/** 이 폭 미만은 '거의 평평' 으로 본다 (%). 소수점 노이즈를 모양으로 읽지 않기 위한 문턱. */
export const FLAT_PCT = 0.5;

/**
 * 곡선의 모양을 읽는다.
 *
 * @param curve [{ n, value }] — n 은 1부터인 인도월 번호. 순서가 뒤섞여 있어도 된다.
 * @returns null 이면 읽을 수 없다 (계약이 두 개 미만이거나 값이 숫자가 아니다).
 */
export function curveShape(curve) {
  if (!Array.isArray(curve)) return null;
  const pts = curve
    .filter((p) => p && Number.isFinite(Number(p.n)) && Number.isFinite(Number(p.value)))
    .map((p) => ({ n: Number(p.n), value: Number(p.value) }))
    .sort((a, b) => a.n - b.n);
  if (pts.length < 2) return null;

  const near = pts[0];
  const far = pts[pts.length - 1];
  if (near.value === 0) return null;

  const spreadPct = ((far.value - near.value) / Math.abs(near.value)) * 100;
  const months = far.n - near.n;

  let shape = 'flat';
  if (spreadPct >= FLAT_PCT) shape = 'contango';
  else if (spreadPct <= -FLAT_PCT) shape = 'backwardation';

  return {
    shape,
    /** 근월물 대비 원월물이 몇 % 비싼가 (음수면 싸다) */
    spreadPct,
    /** 근월물과 원월물이 몇 달 떨어져 있는가 */
    months,
    near: near.value,
    far: far.value,
    label: SHAPE_LABEL[shape],
    glyph: SHAPE_GLYPH[shape],
    meaning: meaningOf(shape, months),
  };
}

/** 모양 이름. 색만으로 뜻을 전하지 않기 위해 글자와 기호를 함께 둔다. */
export const SHAPE_LABEL = {
  contango: '콘탱고',
  backwardation: '백워데이션',
  flat: '거의 평평',
};

export const SHAPE_GLYPH = {
  contango: '▲',
  backwardation: '▼',
  flat: '＝',
};

/** 모양이 가리키는 것. 판단은 사용자가 한다 — 여기서는 무엇을 뜻하는지만 적는다. */
export function meaningOf(shape, months) {
  const m = Number.isFinite(months) && months > 0 ? `${months}개월 뒤` : '먼 달';
  if (shape === 'contango') {
    return `${m} 인도분이 더 비쌉니다. 지금 당장은 물량이 넉넉하다는 쪽으로 읽습니다.`;
  }
  if (shape === 'backwardation') {
    return `${m} 인도분이 더 쌉니다. 지금 당장 물량이 모자란다는 쪽으로 읽습니다.`;
  }
  return '인도월끼리 값 차이가 거의 없습니다.';
}

/** 곡선 한 점의 표시 이름. 1번은 '근월', 나머지는 '+n개월'. */
export function contractLabel(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 1) return '';
  return v === 1 ? '근월' : `+${v - 1}개월`;
}
