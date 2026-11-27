/**
 * 쫄탐지수에 겹쳐 보는 두 가지 — 추세(1년 평균선)와 VIX 35.
 *
 * 사용자 요청 (2026-11-26): "쫄탐지수에 겹쳐서 볼 수 있는 방법이 있을까? 한눈에 세 가지 다 볼 수 있게".
 *
 * 둘 다 **지금 상태를 알리는 사실**이지 사고팔 때를 알리는 신호가 아니다.
 *  - 추세: 대표 지수가 최근 252거래일(1년) 평균보다 위인가 아래인가.
 *    평균선 아래 구간에서 하락이 길어지는 일이 많았다는 연구가 가장 많이 인용되지만,
 *    수수료·세금을 빼면 우위가 줄고 최근 성과는 약해졌다는 보고도 있다.
 *  - VIX 35: 옵션 시장이 앞으로 30일 큰 출렁임을 예상하는 날. 그런 날 뒤 1년 수익이 대체로
 *    플러스였다는 집계가 있지만, "넘으면 늘린다" 는 규칙은 그냥 들고 있는 것보다 낫지 않았다.
 *
 * 결측은 메우지 않는다. 평균을 낼 만큼 날이 모이지 않은 자리는 '모름' 이다.
 * 이 파일은 순수 함수만 둔다 — 서버(API · 스냅샷)와 단위 검사가 같은 계산을 본다.
 */

/**
 * 추세를 재는 평균선 길이 (거래일) — 1년.
 *
 * 처음엔 가장 흔히 쓰는 200일(약 10개월)이었다가 252일로 바꿨다 (2026-11-27 사용자:
 * "쫄탐지수가 길게 보고 진행하는 만큼 추세선도 그에 준하는 지표로"). 쫄탐지수는 지표마다
 * 최근 252거래일(fng/definitions.ts 의 LOOKBACK) 분포와 견준다 — 추세선도 같은 1년을 본다.
 * S&P 500 월평균(Shiller, 1950-01 ~ 2026-09)으로 센 근삿값: 선을 넘나든 횟수가 10년에
 * 200일선 12.5번 → 1년선 10.2번, 아래 구간 평균 길이 5.3 → 6.3개월. 덜 흔들리고 더 길게 본다.
 */
export const TREND_MA_DAYS = 252;

/**
 * 변동성이 크게 오른 날로 보는 VIX 수준. 공식 기준선은 없다(Cboe 가 정한 선이 아니다).
 *
 * 처음엔 기사에 가장 흔히 나오는 30 이었다가 35 로 올렸다 (2026-11-26, 사용자 요청 · 아래 숫자로 확인).
 * VIX 일별 종가 1990-01-02 ~ 2026-09-22 (9,278거래일, github.com/datasets/finance-vix) 에서 세어 본 값:
 *
 *   기준 | 그 이상인 날 | 최근 10년 '사태'(20거래일 안에 다시 넘으면 하나)
 *   30   | 7.9%        | 13번 — 2021년 12월 · 2026년 3월 같은 짧은 출렁임까지 들어가 띠가 잦다
 *   35   | 3.8%        | 8번  — 2018.2 · 2018.12 · 2020.3 · 2020.10 · 2021.1 · 2022.3 · 2024.8 · 2025.4
 *   40   | 2.2%        | 4번  — 사실상 2020년과 2025년뿐. 2018 · 2022 · 2024.8 이 빠진다
 *
 * 35 가 차트의 위기 표식(2018.2 · 2018.12 · 2020.3 · 2024.8 · 2025.4)과 가장 잘 겹친다.
 * 이 표는 '띠가 얼마나 자주 서는가' 를 고르려고 센 것이지, 넘은 뒤의 수익을 약속하는 숫자가 아니다.
 */
export const VIX_HIGH = 35;

const ok = (p) => p && Number.isFinite(p.t) && Number.isFinite(p.v);

/**
 * 단순 이동평균. 앞의 n-1 개 자리는 평균이 없으므로 내지 않는다.
 * @returns {{ t: number, v: number, ma: number }[]}
 */
export function movingAverage(points, n = TREND_MA_DAYS) {
  const pts = (points ?? []).filter(ok);
  const out = [];
  if (!(n >= 1) || pts.length < n) return out;
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    sum += pts[i].v;
    if (i >= n) sum -= pts[i - n].v;
    if (i >= n - 1) out.push({ t: pts[i].t, v: pts[i].v, ma: sum / n });
  }
  return out;
}

/** 조건을 만족하는 연속 구간을 [첫날, 마지막날] 로 묶는다 */
function runs(rows, pred) {
  const spans = [];
  let from = null;
  let last = null;
  for (const r of rows) {
    if (pred(r)) {
      if (from === null) from = r.t;
      last = r.t;
    } else if (from !== null) {
      spans.push({ from, to: last });
      from = null;
    }
  }
  if (from !== null) spans.push({ from, to: last });
  return spans;
}

/**
 * 대표 지수가 평균선 **아래**였던 구간들.
 * @returns {{ from: number, to: number }[]}
 */
export function belowMaSpans(points, n = TREND_MA_DAYS) {
  return runs(movingAverage(points, n), (r) => r.v < r.ma);
}

/**
 * 값이 기준 **이상**이던 구간들 (VIX 35 이상인 날들).
 * @returns {{ from: number, to: number }[]}
 */
export function thresholdSpans(points, threshold = VIX_HIGH) {
  return runs((points ?? []).filter(ok), (p) => p.v >= threshold);
}

/**
 * 마지막 날의 추세 — 평균선 위인가, 얼마나 떨어져 있나.
 * 날이 모자라면 above · gapPct 모두 null (모름). 0 으로 채우지 않는다.
 * @returns {{ above: boolean | null, gapPct: number | null, ma: number | null, t: number | null }}
 */
export function trendNow(points, n = TREND_MA_DAYS) {
  const ma = movingAverage(points, n);
  const last = ma[ma.length - 1];
  if (!last || !(last.ma > 0)) return { above: null, gapPct: null, ma: null, t: null };
  const gapPct = Math.round(((last.v / last.ma - 1) * 100) * 10) / 10;
  return { above: last.v >= last.ma, gapPct, ma: last.ma, t: last.t };
}

/**
 * 마지막 VIX 와 기준을 넘었는지.
 * @returns {{ value: number | null, high: boolean | null, t: number | null }}
 */
export function vixNow(points, threshold = VIX_HIGH) {
  const pts = (points ?? []).filter(ok);
  const last = pts[pts.length - 1];
  if (!last) return { value: null, high: null, t: null };
  return { value: Math.round(last.v * 10) / 10, high: last.v >= threshold, t: last.t };
}
