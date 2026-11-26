export type Pick = 'up' | 'down';
export type RoundResult = 'up' | 'down' | 'flat' | 'void';
export type GameMarketId = 'spx' | 'kospi';

export const NICK_MIN: number;
export const NICK_MAX: number;
export const POST_MAX: number;
export const POST_MIN: number;
export const RATING_START: number;
export const RATING_K: number;
export const CROWD_PRIOR: number;
export const LEADER_MIN_PLAYED: number;
export const HIDE_AFTER_REPORTS: number;

export type Checked = { ok: true; value: string } | { ok: false; reason: string };
export function checkNickname(raw: unknown): Checked;
export function checkPost(raw: unknown): Checked;

export function crowdShare(ups: number, downs: number, pick: Pick): number;
export function ratingDelta(pick: Pick, result: RoundResult | null, ups: number, downs: number): number;
export function outcome(close: number, prevClose: number): 'up' | 'down' | 'flat' | null;

export interface GameMarket {
  id: GameMarketId;
  name: string;
  region: string;
  bench: 'us' | 'kr';
  tz: string;
  open: [number, number];
  close: [number, number];
  resolveAfterMin: number;
}
export const GAME_MARKETS: Record<GameMarketId, GameMarket>;
export const GAME_MARKET_IDS: GameMarketId[];

export function dateKeyIn(t: number, tz: string): string;
export function zonedToUtc(dateKey: string, h: number, m: number, tz: string): number;
export function isTradingDay(dateKey: string, holidays?: Record<string, string>): boolean;
export function nextTradingDay(dateKey: string, holidays?: Record<string, string>): string;
export function prevTradingDay(dateKey: string, holidays?: Record<string, string>): string;
export function roundTimes(marketId: GameMarketId, dateKey: string): { cutoff: number; closeAt: number; resolveAt: number };
export function roundsAt(now: number, marketId: GameMarketId, holidays?: Record<string, string>): { open: string; running: string | null };
export function closesByDate(series: ReadonlyArray<{ t: number; v: number }> | null | undefined, tz: string): Map<string, number>;
