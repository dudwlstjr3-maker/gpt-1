export type TaTf = '1d' | '4h';
export type TaDir = 'up' | 'down';

export interface TaBar {
  t: number;
  o: number | null;
  h: number | null;
  l: number | null;
  c: number | null;
  v: number | null;
}

export interface TaDivergence {
  /** 피벗 봉 */
  i: number;
  /** 견준 앞 피벗 봉 */
  from: number;
  kind: 'bull' | 'bear';
  /** 확인된 봉 (i + 오른쪽 봉 수) */
  seenAt: number;
}

export type TaObv = { ok: true; osc: (number | null)[] } | { ok: false; reason: string };

export interface TaModel {
  tf: TaTf;
  n: number;
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: (number | null)[];
  ma: { p: number; v: (number | null)[] }[];
  trend: (number | null)[];
  st: { line: (number | null)[]; dir: (TaDir | null)[]; flips: { i: number; dir: TaDir }[] };
  rsi: (number | null)[];
  div: TaDivergence[];
  obv: TaObv;
}

export interface TaRow {
  key: 'st' | 'ma' | 'trend' | 'obv' | 'rsi' | 'div' | 'tdiv' | 'trsi' | 'tst';
  name: string;
  value: string;
  dir: TaDir | null;
  note: string;
}

export const TA_RSI: number;
export const TA_RSI_HIGH: number;
export const TA_RSI_LOW: number;
export const TA_RSI_STRONG_HIGH: number;
export const TA_RSI_STRONG_LOW: number;
export const TA_DEFAULT_TF: TaTf;
export const TA_ST_ATR: number;
export const TA_ST_MULT: number;
export const TA_OBV_EMA: number;
export const TA_MA: number[];
export const TA_TREND_DAYS: number;
export const TA_DIV: { left: number; right: number; min: number; max: number };
export const TA_RECENT: number;

export function sma(values: ReadonlyArray<number | null>, n: number): (number | null)[];
export function ema(values: ReadonlyArray<number | null>, n: number): (number | null)[];
export function rma(values: ReadonlyArray<number | null>, n: number): (number | null)[];
export function rsi(closes: ReadonlyArray<number | null>, n?: number): (number | null)[];
export function atr(high: number[], low: number[], close: number[], n: number): (number | null)[];
export function supertrend(high: number[], low: number[], close: number[], atrLen?: number, mult?: number): TaModel['st'];
export function obvOsc(closes: number[], volumes: ReadonlyArray<number | null> | null, n?: number): TaObv;
export function pivots(values: ReadonlyArray<number | null>, kind: 'low' | 'high', left?: number, right?: number): number[];
export function rsiDivergence(
  r: ReadonlyArray<number | null>,
  low: number[],
  high: number[],
  opt?: { left: number; right: number; min: number; max: number },
): TaDivergence[];
export function toFourHour<B extends TaBar>(bars: B[], gmtoffsetSec: number): B[];
export function trendForBars(
  bars: ReadonlyArray<{ t: number; c?: number | null }>,
  daily: ReadonlyArray<{ t: number; c: number }> | null,
  n?: number,
  gmtoffsetSec?: number,
): (number | null)[];
export function taParseCode(raw: unknown): { code: string; market: 'us' | 'kr'; candidates: string[] } | null;
export function taModel(input: {
  tf: TaTf;
  bars: TaBar[];
  daily?: { t: number; c: number }[] | null;
  gmtoffset?: number;
}): TaModel;

export type TaZone = 'strongHigh' | 'high' | 'mid' | 'low' | 'strongLow';
export function rsiZone(x: number | null | undefined): TaZone | null;
export const TA_ZONE_TEXT: Record<TaZone, string>;
export const TA_DIR_TEXT: Record<TaDir, string>;
export const TA_FLIP_TEXT: Record<TaDir, string>;
export const TA_DIV_TEXT: Record<'bull' | 'bear', string>;
export function taBarUnit(tf: TaTf): string;
export function taSummary(m: TaModel, i?: number): TaRow[];
export function taTally(rows: TaRow[]): { up: number; down: number; none: number; counted: number };
export function taTallyText(t: { up: number; down: number; none: number; counted: number }): string;
export function taLastChange(m: TaModel): { abs: number; pct: number; label: string } | null;
export function taReadout(m: TaModel, i: number, fmt?: (x: number) => string): string;
export const TA_RANGES: Record<TaTf, [string, string, number][]>;
export const TA_DEFAULT_RANGE: Record<TaTf, string>;
export const TA_TEXT: {
  title: string;
  lede: string;
  markNote: string;
  tallyNote: string;
  techTitle: string;
  techSteps: string[];
  techNote: string;
  searchHint: string;
  codeHint: string;
  methods: [string, string][];
  notIncluded: string;
};

export interface TaTechEvent {
  i: number;
  seenAt: number;
  side: TaDir;
  kind: 'rsi' | 'div';
  strong: boolean;
  rsi: number;
}
export interface TaTechNow {
  head: { side: TaDir | null; text: string; strong: boolean };
  sub: string;
  rows: TaRow[];
  last: TaTechEvent | null;
}
export function techEvents(m: TaModel): TaTechEvent[];
export function techNow(m: TaModel, i?: number): TaTechNow;
export function taSearch<A extends { id: string; name: string; code?: string | null }>(query: string, assets: A[], limit?: number): A[];

export interface TaTile {
  key: 'tdiv' | 'trsi' | 'st' | 'ma' | 'trend' | 'obv';
  label: string;
  big: string;
  dir: TaDir | null;
  cap: string;
  rsi?: number | null;
  /** RSI 막대 경계 — 강한 침체 · 침체 · 과열 · 강한 과열 */
  bands?: [number, number, number, number];
}
export interface TaBoardData {
  verdict: { side: TaDir | null; text: string; strong: boolean; sub: string };
  tiles: TaTile[];
}
export function taBoard(m: TaModel, i?: number): TaBoardData;
