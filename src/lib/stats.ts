/**
 * Fear & Greed 산출에 쓰이는 통계 유틸.
 * 모든 함수는 결측(null/NaN/Infinity)을 0 으로 대체하지 않고 걸러낸다.
 */

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 유한한 숫자만 남긴다. 결측은 제거되며 0으로 치환되지 않는다. */
export function finiteOnly(values: readonly (number | null | undefined)[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (isFiniteNumber(v)) out.push(v);
  }
  return out;
}

export function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function stdev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  if (m === null) return null;
  let acc = 0;
  for (const v of values) acc += (v - m) ** 2;
  return Math.sqrt(acc / (values.length - 1));
}

/**
 * 선형 보간 분위수. p 는 0~1.
 * 입력 배열은 정렬되어 있어야 한다.
 */
export function quantileSorted(sorted: readonly number[], p: number): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  if (n === 1) return sorted[0];
  const pos = clamp(p, 0, 1) * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const w = pos - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

export function quantile(values: readonly number[], p: number): number | null {
  const arr = [...values].sort((a, b) => a - b);
  return quantileSorted(arr, p);
}

/**
 * winsorization — 상·하위 극단치를 분포 경계값으로 눌러 이상치 영향을 줄인다.
 * @param values 원본 표본
 * @param tail   양쪽 꼬리 비율 (기본 2.5%)
 */
export function winsorize(values: readonly number[], tail = 0.025): number[] {
  const clean = finiteOnly(values);
  if (clean.length === 0) return [];
  const sorted = [...clean].sort((a, b) => a - b);
  const lo = quantileSorted(sorted, tail);
  const hi = quantileSorted(sorted, 1 - tail);
  if (lo === null || hi === null) return clean;
  return clean.map((v) => clamp(v, lo, hi));
}

/**
 * 표본 분포 안에서 value 의 백분위(0~100)를 구한다.
 * 동점 처리는 midrank(동점의 절반을 아래로) 방식.
 */
export function percentileRank(sample: readonly number[], value: number): number | null {
  const clean = finiteOnly(sample);
  if (clean.length < 2 || !isFiniteNumber(value)) return null;
  let below = 0;
  let equal = 0;
  for (const v of clean) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
  }
  const rank = (below + equal / 2) / clean.length;
  return clamp(rank * 100, 0, 100);
}

/**
 * 역사적 분포 대비 0~100 점수를 만든다.
 *  1) 표본을 winsorize
 *  2) 대상값도 같은 경계로 clamp
 *  3) 백분위 계산
 *  4) invert 면 100 - p (공포가 클수록 커지는 지표를 탐욕 기준으로 통일)
 */
export function distributionScore(
  historyWindow: readonly number[],
  value: number | null | undefined,
  invert: boolean,
  tail = 0.025,
): number | null {
  if (!isFiniteNumber(value)) return null;
  const clean = finiteOnly(historyWindow);
  if (clean.length < 30) return null; // 표본이 너무 적으면 산출하지 않는다
  const sorted = [...clean].sort((a, b) => a - b);
  const lo = quantileSorted(sorted, tail);
  const hi = quantileSorted(sorted, 1 - tail);
  if (lo === null || hi === null || hi === lo) return null;
  const wins = clean.map((v) => clamp(v, lo, hi));
  const target = clamp(value, lo, hi);
  const p = percentileRank(wins, target);
  if (p === null) return null;
  const score = invert ? 100 - p : p;
  return clamp(round(score, 1), 0, 100);
}

export function round(v: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** 단순 이동평균. 앞부분은 null. */
export function sma(values: readonly number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (window <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

/** n 기간 수익률(%) 시계열. */
export function pctChangeSeries(values: readonly number[], window: number): (number | null)[] {
  return values.map((v, i) => {
    if (i < window) return null;
    const base = values[i - window];
    if (!isFiniteNumber(base) || base === 0) return null;
    return ((v - base) / Math.abs(base)) * 100;
  });
}

/** 종가 대비 이동평균 이격도(%). */
export function maGapSeries(values: readonly number[], window: number): (number | null)[] {
  const ma = sma(values, window);
  return values.map((v, i) => {
    const m = ma[i];
    if (m === null || m === 0) return null;
    return ((v - m) / m) * 100;
  });
}

/** 연율화 변동성(%) — 일간 로그수익률 표준편차 × sqrt(252). */
export function realizedVolSeries(values: readonly number[], window: number, periodsPerYear = 252): (number | null)[] {
  const rets: (number | null)[] = values.map((v, i) => {
    if (i === 0) return null;
    const prev = values[i - 1];
    if (!isFiniteNumber(prev) || prev <= 0 || v <= 0) return null;
    return Math.log(v / prev);
  });
  return values.map((_, i) => {
    if (i < window) return null;
    const slice = finiteOnly(rets.slice(i - window + 1, i + 1));
    if (slice.length < Math.max(5, window * 0.6)) return null;
    const sd = stdev(slice);
    if (sd === null) return null;
    return sd * Math.sqrt(periodsPerYear) * 100;
  });
}

/** 사상 최고가 대비 낙폭(%) — 음수. */
export function drawdownSeries(values: readonly number[]): (number | null)[] {
  let peak = -Infinity;
  return values.map((v) => {
    if (!isFiniteNumber(v)) return null;
    if (v > peak) peak = v;
    if (peak <= 0) return null;
    return ((v - peak) / peak) * 100;
  });
}

/** a 시리즈의 b 대비 상대강도(%) — window 기간 초과수익. */
export function relativeStrengthSeries(
  a: readonly number[],
  b: readonly number[],
  window: number,
): (number | null)[] {
  const ra = pctChangeSeries(a, window);
  const rb = pctChangeSeries(b, window);
  return a.map((_, i) => {
    const x = ra[i];
    const y = rb[i];
    if (x === null || y === null) return null;
    return x - y;
  });
}

/** window 기간 이동합. */
export function rollingSum(values: readonly number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = sum;
  }
  return out;
}

/** window 기간 이동평균 (null 허용 입력). */
export function rollingMean(values: readonly (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = finiteOnly(values.slice(i - window + 1, i + 1));
    if (slice.length < Math.ceil(window * 0.6)) return null;
    return mean(slice);
  });
}
