/** regimeRules.mjs 의 타입. 순수 로직은 .mjs 에 있다. */

import type {
  RegimeAxisDef,
  RegimeAxisId,
  RegimeAxisResult,
  RegimeBand,
  RegimeBoard,
  RegimeRarity,
} from '@/types';

export type { RegimeAxisDef, RegimeAxisId, RegimeAxisResult, RegimeBand, RegimeBoard, RegimeRarity };

export interface RegimeSeriesPoint {
  t: number;
  v: number;
}

export interface RegimeOptions {
  /** 축의 마지막 값이 이보다 오래되면 죽은 것으로 본다 */
  maxStaleDays?: number;
}

export declare const REGIME_AXES: RegimeAxisDef[];
export declare const BANDS: RegimeBand[];
export declare const LOOKBACK_YEARS: number;
export declare const MIN_HISTORY_YEARS: number;
export declare const MIN_COVERAGE: number;
export declare const MAX_STALE_DAYS: number;

export declare function numOrNull(v: unknown): number | null;
export declare function bandFor(score: unknown): RegimeBand | null;
export declare function percentileOf(window: unknown, x: unknown): number | null;
export declare function scoreAt(
  series: Partial<Record<RegimeAxisId, RegimeSeriesPoint[]>> | null | undefined,
  at: number,
  options?: RegimeOptions,
): { score: number | null; coverage: number; axes: RegimeAxisResult[]; reason?: string };
export declare function rarity(
  history: { t: number; score: number }[] | null | undefined,
  score: number,
  at: number,
): RegimeRarity | null;
export declare function buildBoard(
  series: Partial<Record<RegimeAxisId, RegimeSeriesPoint[]>> | null | undefined,
  at: number,
  history: { t: number; score: number }[],
  options?: RegimeOptions,
): RegimeBoard;
export declare function buildHistory(
  series: Partial<Record<RegimeAxisId, RegimeSeriesPoint[]>> | null | undefined,
  from: number,
  to: number,
  stepDays?: number,
  options?: RegimeOptions,
): { t: number; score: number }[];
