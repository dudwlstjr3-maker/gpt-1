'use client';

/**
 * 주소 끝의 `#이름` 자리까지 내려 준다 — 그 자리가 **나중에** 그려져도.
 *
 * 브라우저도 `#이름` 으로 스크롤하지만, 그 순간에 그 자리가 이미 있어야 한다.
 * 이 앱의 화면은 데이터를 받은 뒤에 그려져서, 홈의 '이유 보기'
 * (`/fng/us#fng-contrib-title`) 를 눌러도 맨 위에 머물렀다 — 기여도 제목은
 * 3,400px 아래에 있는데 scrollY 0. 그래서 그 자리가 생길 때까지 잠깐 기다렸다가 내려 준다.
 *
 * - 최대 10초만 기다린다. 끝내 안 생기면 아무것도 하지 않는다.
 * - 사람이 먼저 화면을 만지면(터치·휠·키) 그만둔다. 읽던 자리를 빼앗지 않는다.
 * - 위쪽 상태바(sticky)에 가리지 않게 그 높이만큼 덜 내려간다.
 * - 위쪽 그래프가 늦게 자리를 잡으면 제목이 밀리므로, 내려 준 뒤 두 번 더 맞춘다.
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const WAIT_MS = 10_000;
const SETTLE_MS = [250, 800];

export function HashScroll() {
  const pathname = usePathname();

  useEffect(() => {
    let stopped = false;
    let observer: MutationObserver | null = null;
    const timers: number[] = [];

    const stop = () => {
      stopped = true;
      observer?.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
    };

    const land = (id: string) => {
      if (stopped) return true;
      const el = document.getElementById(id);
      if (!el) return false;
      const head = document.querySelector('header.sticky');
      const offset = (head?.getBoundingClientRect().height ?? 0) + 8;
      window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset), behavior: 'auto' });
      return true;
    };

    const start = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      stopped = false;
      const landed = () => SETTLE_MS.forEach((ms) => timers.push(window.setTimeout(() => land(id), ms)));
      if (land(id)) return landed();
      observer = new MutationObserver(() => {
        if (land(id)) {
          observer?.disconnect();
          landed();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      timers.push(window.setTimeout(stop, WAIT_MS));
    };

    const touched = () => stop();
    const opts = { passive: true } as const;
    window.addEventListener('touchstart', touched, opts);
    window.addEventListener('wheel', touched, opts);
    window.addEventListener('keydown', touched);
    window.addEventListener('hashchange', start);
    start();

    return () => {
      stop();
      window.removeEventListener('touchstart', touched);
      window.removeEventListener('wheel', touched);
      window.removeEventListener('keydown', touched);
      window.removeEventListener('hashchange', start);
    };
  }, [pathname]);

  return null;
}
