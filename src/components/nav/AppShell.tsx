'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { markInternalNav } from './BackBar';
import { BottomTabs, DesktopSidebar } from './Navigation';
import { StatusBar } from '@/components/market/StatusBar';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { AlertsEngine } from '@/components/alerts/AlertsEngine';
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar';

/**
 * 공통 레이아웃.
 * 모바일: 상단 상태바 + 하단 탭 / 데스크톱: 좌측 사이드바 + 다중 열
 *
 * 화면이 바뀔 때 새 내용이 **스르륵 올라오며 나타난다**.
 * 예전에는 눌리는 순간 통째로 갈아치워져서, 어디로 왔는지 알아채기 전에
 * 이미 다른 화면이었다. 220ms 는 "바뀌었다" 를 눈이 따라갈 만큼은 되고
 * 기다린다는 느낌은 안 드는 길이다.
 *
 * key 에 경로를 주는 것이 핵심이다 — 경로가 바뀌어야만 다시 재생된다.
 * 같은 화면 안에서 값만 갱신될 때(30초마다 오는 스냅샷)는 애니메이션이 돌지 않는다.
 * 그때도 재생되면 숫자 볼 때마다 화면이 들썩인다.
 *
 * 축소 모션을 켠 사람에게는 globals.css 가 전역으로 시간을 0 으로 만든다.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  /*
   * 앱 안에서 한 번이라도 화면을 옮겼으면 그 사실을 남긴다.
   * 뒤로 가기 버튼이 "앱 밖으로 튕겨 나가는 뒤로가기" 를 부르지 않게 하는 근거다.
   * 첫 화면(들어온 그 페이지)은 이동이 아니므로 세지 않는다.
   */
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    markInternalNav();
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <StatusBar />
        <main id="main" className="main-pad mx-auto w-full max-w-6xl flex-1">
          <div key={pathname} className="view-enter">
            {children}
          </div>
          <Disclaimer />
        </main>
      </div>
      <BottomTabs />
      <AlertsEngine />
      <ServiceWorkerRegistrar />
    </div>
  );
}
