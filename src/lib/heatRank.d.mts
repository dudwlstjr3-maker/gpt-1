import type { Quote } from '@/types';

export type HeatLevel = 0 | 1 | 2 | 3;

export interface HeatReading {
  z: number;
  /** 평소의 몇 배 (늘 양수) */
  times: number;
  level: HeatLevel;
  up: boolean;
  word: string;
  /** 그림 세기 0~1 */
  strength: number;
}

export interface HeatPick {
  quote: Quote;
  /** 평소 하루 변동폭(%). 잴 수 없으면 null */
  sigma: number | null;
  heat: HeatReading | null;
  /** 이 자리의 이름 — 다 오른 날에는 '가장 덜 오른 것' 으로 바뀐다 */
  slot: string;
  /** 자리 이름이 바뀐 이유 */
  note: string | null;
}

export interface HeatBoard {
  count: number;
  top: HeatPick;
  bottom: HeatPick;
}

export declare const MIN_SAMPLE: number;
/** 시총 순위가 이 안에 드는 것만 고른다 */
export declare const CAP_RANK_MAX: number;
/** 순위를 아는데 그 밖이면 false. 모르면 true (지수처럼 순위 개념이 없는 것도 있다) */
export declare function withinCap(quote: { capRank?: number | null } | null | undefined, maxRank?: number): boolean;
export declare const HEAT_WORD: Record<number, { up: string; down: string }>;
export declare function dailySigma(spark: unknown): number | null;
export declare function heatOf(changePct: unknown, sigma: unknown): HeatReading | null;
export declare function pickHeat(quotes: unknown, options?: { maxCapRank?: number }): HeatBoard | null;
