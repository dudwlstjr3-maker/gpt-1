/** criteriaRules.mjs 의 타입. 순수 로직은 .mjs 에 있다. */

import type { Criterion, MarketSnapshot } from '@/types';

export type Comparator = 'gte' | 'lte';
export type CriterionStatus = 'met' | 'unmet' | 'unknown';

export interface CriterionResult {
  criterion: Criterion;
  status: CriterionStatus;
  actual: number | null;
  reason?: string;
}

export interface CriteriaSummary {
  results: CriterionResult[];
  total: number;
  met: number;
  unmet: number;
  unknown: number;
}

export declare const COMPARATORS: Comparator[];
export declare const COMPARATOR_LABEL: Record<Comparator, string>;
export declare const SOURCE_KINDS: string[];

export declare function numOrNull(v: unknown): number | null;
export declare function evaluate(
  criterion: unknown,
  snapshot: MarketSnapshot | null,
): { status: CriterionStatus; actual: number | null; reason?: string };
export declare function summarize(criteria: unknown, snapshot: MarketSnapshot | null): CriteriaSummary;
export declare function describe(
  criterion: unknown,
  labels?: { market?: string; level?: string; indicator?: string },
): string;
