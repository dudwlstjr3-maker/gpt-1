export interface Boundary {
  level: string;
  label: string;
  at: number;
  delta: number;
  dir: 'worse' | 'better';
}
export interface RecentPosition {
  min: number;
  max: number;
  pct: number;
  days: number;
}
export function nextBoundary(indicator: unknown): Boundary | null;
export function recentPosition(spark: unknown, value: unknown): RecentPosition | null;
export function positionWord(pct: unknown): string;
