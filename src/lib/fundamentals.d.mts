export interface RawFact {
  end?: string;
  start?: string;
  val?: number;
  value?: number;
  form?: string;
  filed?: string;
  fy?: number;
  fp?: string;
}

export interface FinancialPoint {
  end: string;
  start?: string;
  value: number;
  form: string;
  filed: string;
  fy: number | null;
  fp: string;
}

export interface YoyReading {
  pct: number;
  from: FinancialPoint;
  to: FinancialPoint;
}

export interface TtmReading {
  value: number;
  from: FinancialPoint;
  to: FinancialPoint;
}

export type EpsBasis = 'ttm' | 'annual';

export interface Valuation {
  basis: EpsBasis | null;
  eps: number | null;
  per: number | null;
  period: string | null;
  note: string;
}

export declare const QUARTER_MIN: number;
export declare const QUARTER_MAX: number;
export declare const YEAR_MIN: number;
export declare const YEAR_MAX: number;

export declare function spanDays(p: unknown): number | null;
export declare function dedupe(points: unknown): FinancialPoint[];
export declare function quarterly(points: unknown): FinancialPoint[];
export declare function annual(points: unknown): FinancialPoint[];
export declare function instant(points: unknown): FinancialPoint[];
export declare function yoy(points: unknown, at?: FinancialPoint): YoyReading | null;
export declare function ratio(numer: unknown, denom: unknown): FinancialPoint[];
export declare function ttm(quarters: unknown): TtmReading | null;
export declare function valuation(price: unknown, epsQuarters: unknown, epsAnnual: unknown): Valuation;
export declare function trendWord(pct: unknown): { dir: 'up' | 'down' | 'flat'; glyph: string; label: string } | null;
