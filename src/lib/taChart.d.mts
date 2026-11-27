import type { TaModel, TaTechEvent, TaBoardData } from './ta.mjs';

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
    tech?: TaTechEvent[];
    rsiHigh?: number;
    rsiLow?: number;
    rsiStrongHigh?: number;
    rsiStrongLow?: number;
  },
): { html: string; layout: TaLayout };
export function taIndexAt(layout: TaLayout, px: number): number;
export function taXOf(layout: TaLayout, i: number): number;
export function taPrice(precision: number): (v: number | null | undefined) => string;
export function taAxisDate(tf: '1d' | '4h', spanBars: number, market: 'us' | 'kr'): (t: number) => string;
export function taStamp(tf: '1d' | '4h', market: 'us' | 'kr'): (t: number) => string;
export function taSuggestHtml(list: { id: string; name: string; code?: string | null }[], code: string | null): string;
export function taQuickHtml(items: { id: string; name: string }[], current: string | null): string;
export function taBoardHtml(board: TaBoardData): string;
