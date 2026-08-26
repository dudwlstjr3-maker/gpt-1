'use client';

/**
 * 스냅샷 로더 — stale-while-revalidate.
 *  - 첫 로드: 로딩 상태
 *  - 갱신 실패: 마지막 정상 스냅샷을 계속 보여주고 "갱신 실패" 배지를 띄운다
 *  - 자동 갱신: 30초 (설정에서 끌 수 있음). 문서가 숨겨져 있으면 요청하지 않는다.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Snapshot } from '@/types';
import { useSettings } from './SettingsProvider';

const REFRESH_MS = 30_000;

export interface DataContextValue {
  snapshot: Snapshot | null;
  /** 첫 로드 중 */
  initialLoading: boolean;
  /** 백그라운드 갱신 중 */
  revalidating: boolean;
  /** 마지막 갱신 실패 사유 */
  error: string | null;
  /** 마지막으로 성공한 클라이언트 수신 시각 */
  receivedAt: number | null;
  refresh: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { settings, hydrated } = useSettings();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const scenario = settings.scenario;

  const load = useCallback(
    async (isInitial: boolean) => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      if (isInitial) setInitialLoading(true);
      else setRevalidating(true);

      try {
        const res = await fetch(`/api/snapshot?scenario=${encodeURIComponent(scenario)}`, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `서버 응답 오류 (HTTP ${res.status})`);
        }
        const data = (await res.json()) as Snapshot;
        setSnapshot(data);
        setReceivedAt(Date.now());
        setError(null);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (isInitial) setInitialLoading(false);
        setRevalidating(false);
      }
    },
    [scenario],
  );

  // 시나리오가 바뀌면 이전 데이터를 버린다 (DEMO 상태끼리도 섞이지 않게)
  useEffect(() => {
    if (!hydrated) return;
    setSnapshot(null);
    void load(true);
  }, [hydrated, scenario, load]);

  useEffect(() => {
    if (!hydrated || !settings.autoRefresh) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(false);
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [hydrated, settings.autoRefresh, load]);

  const refresh = useCallback(() => {
    void load(snapshot === null);
  }, [load, snapshot]);

  const value = useMemo<DataContextValue>(
    () => ({ snapshot, initialLoading, revalidating, error, receivedAt, refresh }),
    [snapshot, initialLoading, revalidating, error, receivedAt, refresh],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
