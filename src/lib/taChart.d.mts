import type { TaModel, TaRow } from './ta.mjs';

export interface TaLayout {
  L: number;
  step: number;
  from: number;
  to: number;
  W: number;
  H: number;
}

export function taChartHtml(
  m: TaModel,
  opt: {
    from: number;
    to: number;
    width: number;
    up?: string;
    down?: string;
    price?: (v: number) => string;
    date?: (t: number) => string;
    title?: string;
  },
): { html: string; layout: TaLayout };
export function taIndexAt(layout: TaLayout, px: number): number;
export function taXOf(layout: TaLayout, i: number): number;
export function taSummaryHtml(rows: TaRow[], tally: string): string;
export function taPrice(precision: number): (v: number | null | undefined) => string;
export function taAxisDate(tf: '1d' | '4h', spanBars: number, market: 'us' | 'kr'): (t: number) => string;
export function taStamp(tf: '1d' | '4h', market: 'us' | 'kr'): (t: number) => string;
