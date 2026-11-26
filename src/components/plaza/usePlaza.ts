'use client';

/**
 * 쫄탐광장 상태 · 동작 (2026-11-26).
 * 복구 코드는 이 기기의 localStorage 에만 둔다. 막혀 있으면(사생활 보호 창 등) 이번 방문 동안만 기억한다.
 */

import { useCallback, useEffect, useState } from 'react';
import type { PlazaState } from '@/types';

const STORE_KEY = 'zt.plaza.key';

function readKey(): string | null {
  try {
    return window.localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

function writeKey(key: string | null) {
  try {
    if (key) window.localStorage.setItem(STORE_KEY, key);
    else window.localStorage.removeItem(STORE_KEY);
  } catch {
    /* 저장이 막혀 있으면 이번 방문 동안만 쓴다 */
  }
}

export function usePlaza() {
  const [state, setState] = useState<PlazaState | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (k: string | null) => {
    try {
      const res = await fetch('/api/plaza', { headers: k ? { 'x-plaza-key': k } : {}, cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '광장을 불러오지 못했어요.');
      setState(json as PlazaState);
      // 코드가 더는 맞지 않으면(저장소가 비었거나 지워짐) 잊는다
      if (k && !(json as PlazaState).me) {
        writeKey(null);
        setKey(null);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '광장을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const k = readKey();
    setKey(k);
    void load(k);
  }, [load]);

  const act = useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/plaza', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(key ? { 'x-plaza-key': key } : {}) },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? '잠시 뒤에 다시 해 주세요.');
        if (json.account?.key) {
          writeKey(json.account.key);
          setKey(json.account.key);
        }
        if (json.state) setState(json.state as PlazaState);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : '잠시 뒤에 다시 해 주세요.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [key],
  );

  const leave = useCallback(() => {
    writeKey(null);
    setKey(null);
    void load(null);
  }, [load]);

  return { state, key, error, busy, loading, act, leave, reload: () => load(key) };
}
