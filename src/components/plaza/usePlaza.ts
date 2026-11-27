'use client';

/**
 * 쫄탐광장 상태 · 동작 (2026-11-26).
 * 로그인은 카카오만 — 로그인 쿠키(httpOnly)는 서버가 심고, 화면 코드는 그 값을 읽지 못한다.
 * 쓰기 요청에는 x-plaza: 1 을 붙인다(서버가 다른 사이트에서 온 요청과 가르는 표시).
 */

import { useCallback, useEffect, useState } from 'react';
import type { PlazaState } from '@/types';

const WRITE = { 'content-type': 'application/json', 'x-plaza': '1' };

export const LOGIN_MESSAGE: Record<string, string> = {
  unavailable: '카카오 로그인이 아직 설정되지 않았어요. 운영자가 카카오 앱을 연결하면 열려요.',
  cancelled: '카카오 로그인을 취소했어요.',
  state: '로그인 확인 값이 맞지 않아 멈췄어요. 다시 시도해 주세요.',
  failed: '카카오에서 정보를 받지 못했어요. 잠시 뒤 다시 시도해 주세요.',
};

export function usePlaza() {
  const [state, setState] = useState<PlazaState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/plaza', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '광장을 불러오지 못했어요.');
      setState(json as PlazaState);
    } catch (e) {
      setError(e instanceof Error ? e.message : '광장을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 카카오에서 돌아올 때 붙는 ?login=… 를 알림으로 바꾸고 주소에서 지운다
    const q = new URLSearchParams(window.location.search).get('login');
    if (q && LOGIN_MESSAGE[q]) {
      setError(LOGIN_MESSAGE[q]);
      window.history.replaceState(null, '', window.location.pathname);
    }
    void load();
  }, [load]);

  const send = useCallback(async (url: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: WRITE, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '잠시 뒤에 다시 해 주세요.');
      return json as Record<string, unknown>;
    } catch (e) {
      setError(e instanceof Error ? e.message : '잠시 뒤에 다시 해 주세요.');
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const act = useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      const json = await send('/api/plaza', body);
      if (json?.state) setState(json.state as PlazaState);
      return !!json;
    },
    [send],
  );

  const demoLogin = useCallback(
    async (name: string) => {
      if (await send('/api/auth/demo', { name })) await load();
    },
    [send, load],
  );

  const logout = useCallback(async () => {
    if (await send('/api/auth/logout', {})) await load();
  }, [send, load]);

  return { state, error, busy, loading, act, demoLogin, logout, reload: load };
}
