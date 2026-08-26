'use client';

import { useEffect, useState } from 'react';

/**
 * 주기적으로 갱신되는 현재 시각.
 * 서버 렌더와 어긋나지 않도록 마운트 전에는 null 을 돌려준다.
 */
export function useNow(intervalMs = 60_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}
