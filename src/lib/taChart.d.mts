import type { TaModel, TaDir, TaBoardData } from './ta.mjs';

export interface TaLayout {
  L: number;
  R: number;
  step: number;
  from: number;
  to: number;
  W: number;
  H: number;
  P: { top: number; h: number };
  /** 신호 줄 (2026-11-28) — 종목 쫄탐 · RSI · OBV 칸을 대신한다 */
  SG: { top: number; h: number };
  lo: number;
  hi: number;
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
    /** 가장 최근 기법 조건 — 세로 점선과 꼬리표 하나 */
    mark?: { i: number; side: TaDir } | null;
    /** 고른 성향의 기법 조건 봉 전부 — 봉 아래 ▲ · 위 ▼ */
    signals?: { i: number; side: TaDir; strong: boolean }[];
    /** '방어적' · '공격적' — 범례와 개수 줄에 */
    profileText?: string;
    scoreLow?: number;
    scoreHigh?: number;
    rsiHigh?: number;
    rsiLow?: number;
    rsiStrongHigh?: number;
    rsiStrongLow?: number;
  },
): { html: string; layout: TaLayout; counts: { up: number; down: number } };
export function taIndexAt(layout: TaLayout, px: number): number;
export function taSignalTitle(score: number | null | undefined, rsi: number | null | undefined, obv: number | null | undefined): string;
export function taXOf(layout: TaLayout, i: number): number;
export function taPrice(precision: number): (v: number | null | undefined) => string;
export function taAxisDate(tf: '1d' | '4h', spanBars: number, market: 'us' | 'kr'): (t: number) => string;
export function taStamp(tf: '1d' | '4h', market: 'us' | 'kr'): (t: number) => string;
export function taSuggestHtml(list: { id: string; name: string; code?: string | null }[], code: string | null): string;
export function taQuickHtml(items: { id: string; name: string }[], current: string | null): string;
export function taBoardHtml(board: TaBoardData): string;
export function taCrossSvg(
  m: TaModel,
  layout: TaLayout,
  i: number,
  opt?: { price?: (v: number) => string; stamp?: (t: number) => string; up?: string; down?: string },
): string;
