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
  /** 종목 쫄탐 — 0 공포 ~ 100 탐욕. used 는 쓴 재료 수(2~3), parts 는 재료별 값(0~100) */
  score: {
    v: (number | null)[];
    used: number[];
    parts: { mood: (number | null)[]; gap: (number | null)[]; obv: (number | null)[] };
  };
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
export const TA_SCORE_W: { mood: number; gap: number; obv: number };
export const TA_SCORE_LOW: number;
export const TA_SCORE_HIGH: number;
export const TA_PCT_WIN: number;
export const TA_PCT_MIN: number;
export const TA_CONFIRM: number;
export type TaProfile = 'defensive' | 'aggressive';
export const TA_PROFILES: TaProfile[];
export const TA_PROFILE_TEXT: Record<TaProfile, string>;
export const TA_DEFAULT_PROFILE: TaProfile;
export interface TaMood {
  t: number[];
  v: ReadonlyArray<number | null>;
}
export function moodForBars(bars: ReadonlyArray<{ t: number }>, mood: TaMood | null, sameDay?: boolean, gmtoffsetSec?: number): (number | null)[];
export function pctRank(values: ReadonlyArray<number | null>, win?: number, min?: number): (number | null)[];
export function taScore(parts: {
  mood: ReadonlyArray<number | null> | null;
  gap?: ReadonlyArray<number | null> | null;
  obv?: ReadonlyArray<number | null> | null;
}): { v: (number | null)[]; used: number[] };
export function obvCausal(closes: ReadonlyArray<number>, volumes: ReadonlyArray<number | null> | null): (number | null)[];
export const TA_MIN_SPAN: number;
export interface TaWindow {
  from: number;
  to: number;
  span: number;
  offset: number;
  maxOffset: number;
}
export function taWindow(n: number, span: number, offset?: number): TaWindow;
export function taZoom(n: number, w: TaWindow, factor: number, anchor?: number): TaWindow;
export function taPan(n: number, w: TaWindow, bars: number): TaWindow;
export interface TaSignal {
  /** 표시 봉 */
  i: number;
  /** 조건이 생긴 봉 */
  setup: number;
  side: TaDir;
  why: ('score' | 'rsi' | 'div')[];
  strong: boolean;
  score: number | null;
  rsi: number | null;
}
export function taSignals(m: TaModel, profile?: TaProfile): {
  list: TaSignal[];
  pending: { setup: number; side: TaDir; why: ('score' | 'rsi' | 'div')[] } | null;
};

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
  market?: 'us' | 'kr';
  mood?: TaMood | null;
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
  profileHint: string;
  panHint: string;
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
  last: TaSignal | null;
  signals: TaSignal[];
  pending: { setup: number; side: TaDir; why: ('score' | 'rsi' | 'div')[] } | null;
}
export function techEvents(m: TaModel): TaTechEvent[];
export function techNow(m: TaModel, i?: number, profile?: TaProfile): TaTechNow;
export function taSearch<A extends { id: string; name: string; code?: string | null }>(query: string, assets: A[], limit?: number): A[];

export interface TaTile {
  key: 'score' | 'rsi' | 'st' | 'ma' | 'trend' | 'obv';
  label: string;
  big: string;
  dir: TaDir | null;
  cap: string;
  rsi?: number | null;
  /** RSI 막대 경계 — 강한 침체 · 침체 · 과열 · 강한 과열 */
  bands?: [number, number, number, number];
  /** 같은 칸의 둘째 값 — RSI 칸의 다이버전스 */
  sub?: { big: string; dir: TaDir | null; cap: string };
  /** 맨 아래 작은 줄 — 종목 쫄탐의 재료 */
  note?: string;
}
export interface TaBoardData {
  verdict: { side: TaDir | null; text: string; strong: boolean; sub: string };
  tiles: TaTile[];
  /** 차트에 세로 점선으로 표시할 가장 최근 기법 조건 */
  mark: { i: number; side: TaDir } | null;
  /** 고른 성향으로 표시할 봉 전부 — 차트의 ▲ ▼ */
  signals: { i: number; side: TaDir; strong: boolean }[];
  profile: TaProfile;
}
export function taBoard(m: TaModel, i?: number, profile?: TaProfile): TaBoardData;
