'use client';

/** 알림 상태 저장소 — 발생 이력, 중복 방지 키, 쿨다운. */

import type { AlertEvent } from '@/types';

const KEY = 'mm3.alerts.v1';
const MAX_EVENTS = 60;

export interface AlertStore {
  events: AlertEvent[];
  /** dedupeKey → 마지막 발생 시각(ms) */
  lastFired: Record<string, number>;
  /** 시장 → 마지막으로 본 단계 id */
  lastStage: Record<string, string>;
  /** quote id → 마지막으로 본 가격 */
  lastPrice: Record<string, number>;
}

const EMPTY: AlertStore = { events: [], lastFired: {}, lastStage: {}, lastPrice: {} };

export function readStore(): AlertStore {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<AlertStore>;
    return {
      events: Array.isArray(parsed.events) ? parsed.events : [],
      lastFired: parsed.lastFired ?? {},
      lastStage: parsed.lastStage ?? {},
      lastPrice: parsed.lastPrice ?? {},
    };
  } catch {
    return EMPTY;
  }
}

export function writeStore(store: AlertStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ ...store, events: store.events.slice(0, MAX_EVENTS) }),
    );
    window.dispatchEvent(new CustomEvent('mm3:alerts-changed'));
  } catch {
    /* 저장 실패는 무시 — 알림은 부가 기능이다 */
  }
}

/** 쿨다운과 중복 키를 확인한다. 통과하면 true. */
export function canFire(store: AlertStore, dedupeKey: string, cooldownMinutes: number, now: number): boolean {
  const last = store.lastFired[dedupeKey];
  if (last === undefined) return true;
  return now - last >= cooldownMinutes * 60_000;
}

export function recordFire(store: AlertStore, event: AlertEvent): AlertStore {
  return {
    ...store,
    events: [event, ...store.events].slice(0, MAX_EVENTS),
    lastFired: { ...store.lastFired, [event.dedupeKey]: event.firedAt },
  };
}

export function markAllRead(): void {
  const s = readStore();
  writeStore({ ...s, events: s.events.map((e) => ({ ...e, read: true })) });
}

export function clearEvents(): void {
  const s = readStore();
  writeStore({ ...s, events: [] });
}
