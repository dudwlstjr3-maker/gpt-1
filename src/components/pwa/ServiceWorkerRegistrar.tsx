'use client';

import { useEffect } from 'react';

/** 설치 가능한 PWA 를 위해 서비스 워커를 등록한다. 실패해도 앱 동작에는 영향이 없다. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* 등록 실패는 무시 — 오프라인 캐시만 사용할 수 없다 */
      });
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);
  return null;
}
