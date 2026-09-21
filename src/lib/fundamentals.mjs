/**
 * 재무제표 읽기 — SEC 가 주는 원자료를 사람이 볼 수 있는 줄로 바꾼다.
 *
 * 왜 순수 모듈인가
 *   서버(값 채우기)·화면(표시)·미리보기가 같은 규칙을 봐야 하고, node --test 로
 *   그 규칙만 따로 태울 수 있어야 한다. 네트워크가 섞이지 않는 순수 함수로 둔다.
 *
 * SEC 원자료의 성질 — 여기서 조심할 것들
 *
 *   ① 같은 기간이 여러 번 온다.
 *      회사가 나중에 수정 공시(restatement)를 하면 같은 기간이 값만 달라진 채로
 *      또 들어온다. **가장 나중에 접수된 것**을 남긴다. 평균을 내거나 먼저 온
 *      것을 쓰면 이미 정정된 값을 보여주게 된다.
 *
 *   ② 기간 길이가 섞여 있다.
 *      한 태그 안에 3개월(분기)·6개월·9개월(누적)·12개월(연간)이 다 들어 있다.
 *      길이를 안 보고 이어 그리면 분기 매출과 연간 매출이 한 선에 섞인다.
 *      **기간 길이로 갈라 담는다.**
 *
 *   ③ 4분기가 비는 회사가 많다.
 *      10-K(연간보고서)는 한 해 전체를 담고 4분기만 따로 담지 않는 경우가 있다.
 *      그럴 때 **연간에서 1~3분기를 빼서 채우지 않는다.** 뺄셈은 되지만 그건
 *      회사가 보고한 값이 아니다. 분기 표에 빈칸을 남기고 연간 탭으로 안내한다.
 *
 *   ④ 태그가 회사마다 다르다.
 *      매출 하나에도 Revenues · SalesRevenueNet ·
 *      RevenueFromContractWithCustomerExcludingAssessedTax 가 쓰인다. 어느 태그를
 *      썼는지는 화면에 밝힌다 — 회사끼리 견줄 때 같은 것을 보고 있는지가 중요하다.
 */

/** 기간 길이(일)를 잰다. 시점 값(재무상태표)이면 null. */
export function spanDays(p) {
  if (!p || !p.start || !p.end) return null;
  const a = Date.parse(`${p.start}T00:00:00Z`);
  const b = Date.parse(`${p.end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** 분기(3개월)로 볼 기간 길이 */
export const QUARTER_MIN = 80;
export const QUARTER_MAX = 100;
/** 연간(12개월)으로 볼 기간 길이 */
export const YEAR_MIN = 340;
export const YEAR_MAX = 380;

/**
 * 같은 기간이 여러 번 온 것을 하나로 줄인다 — 가장 나중에 접수된 것을 남긴다.
 * 기간 값은 (start, end) 가 같아야 같은 기간이다. 시점 값은 end 만 본다.
 */
export function dedupe(points) {
  if (!Array.isArray(points)) return [];
  const best = new Map();
  for (const p of points) {
    if (!p || typeof p.end !== 'string' || !Number.isFinite(Number(p.val ?? p.value))) continue;
    const key = `${p.start ?? ''}|${p.end}`;
    const prev = best.get(key);
    // filed 가 없으면 나중에 온 것을 나중 것으로 본다
    if (!prev || String(p.filed ?? '') >= String(prev.filed ?? '')) best.set(key, p);
  }
  return [...best.values()]
    .map((p) => ({
      end: p.end,
      ...(p.start ? { start: p.start } : {}),
      value: Number(p.val ?? p.value),
      form: String(p.form ?? ''),
      filed: String(p.filed ?? ''),
      fy: Number.isFinite(Number(p.fy)) ? Number(p.fy) : null,
      fp: String(p.fp ?? ''),
    }))
    .sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0));
}

/** 분기 값만 골라낸다 (3개월짜리) */
export function quarterly(points) {
  return dedupe(points).filter((p) => {
    const d = spanDays(p);
    return d !== null && d >= QUARTER_MIN && d <= QUARTER_MAX;
  });
}

/** 연간 값만 골라낸다 (12개월짜리) */
export function annual(points) {
  return dedupe(points).filter((p) => {
    const d = spanDays(p);
    return d !== null && d >= YEAR_MIN && d <= YEAR_MAX;
  });
}

/** 시점 값만 골라낸다 (재무상태표 — 기간이 없다) */
export function instant(points) {
  return dedupe(points).filter((p) => !p.start);
}

/**
 * 전년 동기 대비 증감률(%).
 *
 * 분기 값은 계절을 탄다 — 애플의 12월 분기는 늘 크다. 그래서 **직전 분기가 아니라
 * 1년 전 같은 분기**와 견준다. 1년 전 값이 없으면 지어내지 않고 null 을 준다.
 */
export function yoy(points, at) {
  const list = Array.isArray(points) ? points : [];
  const cur = at ?? list[list.length - 1];
  if (!cur || !Number.isFinite(cur.value)) return null;
  const t = Date.parse(`${cur.end}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  let prev = null;
  for (const p of list) {
    if (p === cur) continue;
    const d = Math.round((t - Date.parse(`${p.end}T00:00:00Z`)) / 86400000);
    if (d >= YEAR_MIN && d <= YEAR_MAX) prev = p;
  }
  if (!prev || prev.value === 0 || !Number.isFinite(prev.value)) return null;
  return { pct: ((cur.value - prev.value) / Math.abs(prev.value)) * 100, from: prev, to: cur };
}

/**
 * 두 줄의 비율(%) — 같은 기간끼리만 나눈다.
 * 매출은 3분기 것이고 영업이익은 연간 것이면 그 비율은 아무 뜻이 없다.
 */
export function ratio(numer, denom) {
  const byKey = new Map();
  for (const d of Array.isArray(denom) ? denom : []) byKey.set(`${d.start ?? ''}|${d.end}`, d);
  const out = [];
  for (const n of Array.isArray(numer) ? numer : []) {
    const d = byKey.get(`${n.start ?? ''}|${n.end}`);
    if (!d || d.value === 0 || !Number.isFinite(d.value) || !Number.isFinite(n.value)) continue;
    out.push({ end: n.end, ...(n.start ? { start: n.start } : {}), value: (n.value / d.value) * 100, form: n.form, filed: n.filed, fy: n.fy, fp: n.fp });
  }
  return out;
}

/**
 * 최근 네 분기를 더한다 (TTM).
 *
 * **연속한 네 분기라야 한다.** 4분기가 비어서 Q3·Q2·Q1 과 작년 Q4 를 더하면
 * 그건 한 해가 아니다. 사이가 벌어져 있으면 null 을 준다.
 */
export function ttm(quarters) {
  const list = Array.isArray(quarters) ? quarters : [];
  if (list.length < 4) return null;
  const last4 = list.slice(-4);
  for (let i = 1; i < last4.length; i += 1) {
    const gap = Math.round(
      (Date.parse(`${last4[i].end}T00:00:00Z`) - Date.parse(`${last4[i - 1].end}T00:00:00Z`)) / 86400000,
    );
    if (!(gap >= QUARTER_MIN && gap <= QUARTER_MAX)) return null;
  }
  if (!last4.every((p) => Number.isFinite(p.value))) return null;
  return { value: last4.reduce((a, p) => a + p.value, 0), from: last4[0], to: last4[3] };
}

/**
 * 주가가 이익의 몇 배인가 = 주가 / 1주가 번 돈.
 * (원래 이름은 주가수익비율 · PER 이고, 나누는 쪽은 주당순이익 · EPS 다.)
 *
 * 최근 네 분기 것을 더한 값을 우선 쓰고, 그게 안 되면 최근 1년치 값을 쓴다.
 * **어느 쪽을 썼는지 반드시 함께 돌려준다** — 둘은 다른 숫자다.
 * 1주가 번 돈이 0 이하면 내지 않는다 (적자일 때는 이 숫자가 뜻을 잃는다).
 *
 * 문구를 여기서 우리말로 쓰는 이유
 *   이 글은 화면에 그대로 나간다. 'PER 을 낼 수 없습니다' 라고 적으면 PER 이
 *   무엇인지 아는 사람에게만 설명이 된다.
 */
export function valuation(price, epsQuarters, epsAnnual) {
  const t = ttm(epsQuarters);
  const a = Array.isArray(epsAnnual) && epsAnnual.length > 0 ? epsAnnual[epsAnnual.length - 1] : null;

  let eps = null;
  let basis = null;
  let period = null;
  if (t) {
    eps = t.value;
    basis = 'ttm';
    period = `${t.from.end} ~ ${t.to.end}`;
  } else if (a && Number.isFinite(a.value)) {
    eps = a.value;
    basis = 'annual';
    period = `${a.start ?? ''} ~ ${a.end}`;
  }

  if (eps === null) {
    return {
      basis: null,
      eps: null,
      per: null,
      period: null,
      note: '1주가 번 돈(주당순이익)을 받지 못해 몇 배인지 낼 수 없습니다.',
    };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { basis, eps, per: null, period, note: '주가를 받지 못해 몇 배인지 낼 수 없습니다.' };
  }
  if (eps <= 0) {
    return {
      basis,
      eps,
      per: null,
      period,
      note: '1주가 번 돈이 0 이하, 곧 적자라 몇 배인지 내지 않습니다. 적자일 때는 이 숫자가 뜻을 잃습니다.',
    };
  }
  return {
    basis,
    eps,
    per: price / eps,
    period,
    note:
      basis === 'ttm'
        ? `최근 네 분기에 1주가 번 돈을 더한 값(${period}) 으로 주가를 나눴습니다.`
        : `최근 1년치로 1주가 번 돈(${period}) 으로 주가를 나눴습니다. 네 분기가 연속으로 오지 않아 연간 값을 썼습니다.`,
  };
}

/** 늘었나 줄었나 — 색만으로 말하지 않기 위한 글자와 기호 */
export function trendWord(pct) {
  if (!Number.isFinite(pct)) return null;
  if (pct >= 0.05) return { dir: 'up', glyph: '▲', label: '늘었습니다' };
  if (pct <= -0.05) return { dir: 'down', glyph: '▼', label: '줄었습니다' };
  return { dir: 'flat', glyph: '＝', label: '거의 그대로입니다' };
}
