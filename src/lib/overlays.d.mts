export interface OverlayPoint {
  t: number;
  v: number;
}

export interface TimeSpan {
  from: number;
  to: number;
}

export const TREND_MA_DAYS: number;
export const VIX_HIGH: number;

export function movingAverage(points: ReadonlyArray<OverlayPoint> | null | undefined, n?: number): { t: number; v: number; ma: number }[];
/** 대표 지수가 평균선 아래였던 구간들 */
export function belowMaSpans(points: ReadonlyArray<OverlayPoint> | null | undefined, n?: number): TimeSpan[];
/** 값이 기준 이상이던 구간들 */
export function thresholdSpans(points: ReadonlyArray<OverlayPoint> | null | undefined, threshold?: number): TimeSpan[];
/** 마지막 날의 추세. 날이 모자라면 모두 null */
export function trendNow(
  points: ReadonlyArray<OverlayPoint> | null | undefined,
  n?: number,
): { above: boolean | null; gapPct: number | null; ma: number | null; t: number | null };
/** 마지막 VIX 와 기준을 넘었는지 */
export function vixNow(
  points: ReadonlyArray<OverlayPoint> | null | undefined,
  threshold?: number,
): { value: number | null; high: boolean | null; t: number | null };
