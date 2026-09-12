import type { FngScore, RiskIndicator } from '@/types';
import type { HeatPick } from './heatRank.d.mts';

export const MOVE_MIN: number;
export const HEAT_MIN: number;

export function moodClause(scores: FngScore[] | null | undefined): string | null;
export function heatClause(picks: HeatPick[] | null | undefined): string | null;
export function riskClause(indicators: RiskIndicator[] | null | undefined): string | null;

export function todayLine(input: {
  scores?: FngScore[] | null;
  picks?: HeatPick[] | null;
  indicators?: RiskIndicator[] | null;
}): string | null;
