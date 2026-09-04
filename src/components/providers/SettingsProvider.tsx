'use client';

/**
 * 사용자 설정 — 테마, 통화, 등락 색상, 관심목록, 홈 표시 항목, 알림 규칙, DEMO 시나리오.
 * localStorage 에 저장하며, 서버 렌더 결과와 어긋나지 않도록 마운트 후에 적용한다.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { defaultHomeIds, defaultWatchlist } from '@/lib/catalog';
import type { AlertRule, Criterion, DemoScenario } from '@/types';
import type { ChangeColorMode } from '@/lib/scale';
import type { DisplayCurrency } from '@/lib/format';

export type ThemePref = 'dark' | 'light' | 'system';

export interface Settings {
  theme: ThemePref;
  currency: DisplayCurrency;
  colorMode: ChangeColorMode;
  scenario: DemoScenario;
  watchlist: string[];
  /** 홈에 노출할 가격 카드 id (순서 = 표시 순서) */
  homeItems: string[];
  autoRefresh: boolean;
  alertsEnabled: boolean;
  notificationsGranted: boolean;
  alertRules: AlertRule[];
  /**
   * 내 기준 — 사용자가 정한 조건.
   * 기본값이 없다. 앱이 조건을 제안하면 그건 사용자의 기준이 아니라 앱의 훈수가 된다.
   */
  criteria: Criterion[];
}

const STORAGE_KEY = 'mm3.settings.v1';

const DEFAULTS: Settings = {
  theme: 'dark',
  currency: 'KRW',
  colorMode: 'korean',
  scenario: 'normal',
  watchlist: defaultWatchlist(),
  homeItems: defaultHomeIds(),
  autoRefresh: true,
  alertsEnabled: false,
  notificationsGranted: false,
  alertRules: [],
  criteria: [],
};

interface SettingsContextValue {
  settings: Settings;
  /** localStorage 를 읽어 반영이 끝났는지 */
  hydrated: boolean;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
  toggleWatch: (id: string) => void;
  isWatched: (id: string) => boolean;
  toggleHomeItem: (id: string) => void;
  moveHomeItem: (id: string, direction: -1 | 1) => void;
  addAlertRule: (rule: AlertRule) => void;
  removeAlertRule: (id: string) => void;
  updateAlertRule: (id: string, patch: Partial<AlertRule>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function sanitize(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return DEFAULTS;
  const r = raw as Partial<Settings>;
  const arr = (v: unknown, fallback: string[]) =>
    Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : fallback;
  return {
    theme: r.theme === 'light' || r.theme === 'system' || r.theme === 'dark' ? r.theme : DEFAULTS.theme,
    currency: r.currency === 'USD' ? 'USD' : 'KRW',
    colorMode: r.colorMode === 'global' ? 'global' : 'korean',
    scenario: (['normal', 'loading', 'empty', 'partial', 'stale', 'error'] as const).includes(
      r.scenario as DemoScenario,
    )
      ? (r.scenario as DemoScenario)
      : 'normal',
    watchlist: arr(r.watchlist, DEFAULTS.watchlist),
    homeItems: arr(r.homeItems, DEFAULTS.homeItems),
    autoRefresh: typeof r.autoRefresh === 'boolean' ? r.autoRefresh : true,
    alertsEnabled: typeof r.alertsEnabled === 'boolean' ? r.alertsEnabled : false,
    notificationsGranted: typeof r.notificationsGranted === 'boolean' ? r.notificationsGranted : false,
    alertRules: Array.isArray(r.alertRules) ? (r.alertRules as AlertRule[]) : [],
    criteria: Array.isArray(r.criteria) ? (r.criteria as Criterion[]) : [],
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setSettings(sanitize(JSON.parse(raw)));
    } catch {
      /* 저장소를 못 읽어도 기본값으로 동작한다 */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* 용량 초과 등은 무시 */
    }
  }, [settings, hydrated]);

  /* 테마 적용 */
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const resolved =
        settings.theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark'
          : settings.theme;
      root.setAttribute('data-theme', resolved);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', resolved === 'light' ? '#f4f6fa' : '#0a0d14');
    };
    apply();
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULTS), []);

  const toggleWatch = useCallback((id: string) => {
    setSettings((s) => ({
      ...s,
      watchlist: s.watchlist.includes(id) ? s.watchlist.filter((x) => x !== id) : [...s.watchlist, id],
    }));
  }, []);

  const isWatched = useCallback((id: string) => settings.watchlist.includes(id), [settings.watchlist]);

  const toggleHomeItem = useCallback((id: string) => {
    setSettings((s) => ({
      ...s,
      homeItems: s.homeItems.includes(id) ? s.homeItems.filter((x) => x !== id) : [...s.homeItems, id],
    }));
  }, []);

  const moveHomeItem = useCallback((id: string, direction: -1 | 1) => {
    setSettings((s) => {
      const items = [...s.homeItems];
      const i = items.indexOf(id);
      if (i === -1) return s;
      const j = i + direction;
      if (j < 0 || j >= items.length) return s;
      [items[i], items[j]] = [items[j], items[i]];
      return { ...s, homeItems: items };
    });
  }, []);

  const addAlertRule = useCallback((rule: AlertRule) => {
    setSettings((s) => ({ ...s, alertRules: [...s.alertRules, rule] }));
  }, []);

  const removeAlertRule = useCallback((id: string) => {
    setSettings((s) => ({ ...s, alertRules: s.alertRules.filter((r) => r.id !== id) }));
  }, []);

  const updateAlertRule = useCallback((id: string, patch: Partial<AlertRule>) => {
    setSettings((s) => ({
      ...s,
      alertRules: s.alertRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      hydrated,
      update,
      reset,
      toggleWatch,
      isWatched,
      toggleHomeItem,
      moveHomeItem,
      addAlertRule,
      removeAlertRule,
      updateAlertRule,
    }),
    [settings, hydrated, update, reset, toggleWatch, isWatched, toggleHomeItem, moveHomeItem, addAlertRule, removeAlertRule, updateAlertRule],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
