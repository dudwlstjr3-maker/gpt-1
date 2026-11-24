import type { FngScore, MarketId, RiskIndicator } from '@/types';
import type { HeatPick } from './heatRank.d.mts';

export const MOVE_MIN: number;
export const HEAT_MIN: number;
/** 1면에 올리는 순서. 앞 시장에 할 말이 있으면 뒤 시장은 헤드라인을 못 가져간다. */
export const MARKET_PRIORITY: readonly MarketId[];

export function moodClause(scores: FngScore[] | null | undefined): string | null;
export function heatClause(picks: HeatPick[] | null | undefined): string | null;
export function riskClause(indicators: RiskIndicator[] | null | undefined): string | null;

export function todayLine(input: {
  scores?: FngScore[] | null;
  picks?: HeatPick[] | null;
  indicators?: RiskIndicator[] | null;
}): string | null;
