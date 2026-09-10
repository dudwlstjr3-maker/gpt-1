'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { markInternalNav } from './BackBar';
import { BottomTabs } from './Navigation';
import { StatusBar } from '@/components/market/StatusBar';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { AlertsEngine } from '@/components/alerts/AlertsEngine';
import { SearchDialog } from '@/components/ui/SearchDialog';
import { SearchProvider } from '@/components/providers/SearchProvider';
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar';

/**
 * 공통 레이아웃 — 폰이든 데스크톱이든 한 벌이다.
 *
 * 상단 상태바 + 본문 + 하단 탭. 넓은 화면에서는 이 한 벌이 430px 짜리 틀 안에
 * 들어가고 양옆에 바닥이 깔린다 (globals.css 의 .app-frame).
 *
 * 예전에는 1024px 부터 좌측 사이드바 + 다중 열로 갈라졌다. 접었다 —
 * 손에 들고 10초 안에 훑는 화면으로 만든 것이라 창을 넓혔다고 카드를 서너 열로
 * 펼치면 같은 앱이 아니게 되고, 화면 하나를 손볼 때마다 두 벌을 맞춰야 했다.
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
  /*
   * 찾기 창은 여기서 연다.
   *
   * 어느 화면에서든 Ctrl+K (맥은 ⌘K) 로 열려야 하므로, 화면마다 붙이지 않고
   * 껍데기 한 곳에서 듣는다. 글자를 치는 중(input·textarea)일 때는 가로채지 않는다.
   */
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'k' && e.key !== 'K' && e.key !== 'ㅏ') return;
      if (!e.metaKey && !e.ctrlKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    markInternalNav();
  }, [pathname]);

  return (
    <SearchProvider onOpen={openSearch}>
      <div className="app-frame">
        <StatusBar />
        {/* 본문이 배치 분기의 기준이 된다 — 창 폭이 아니라 이 칸의 폭을 본다 */}
        <main id="main" className="main-pad app-main w-full flex-1">
          <div key={pathname} className="view-enter">
            {children}
          </div>
          <Disclaimer />
        </main>
      </div>
      {/*
       * 하단 탭과 알림은 틀 **바깥**에 둔다.
       * 틀은 container-type 을 가진 칸이 아니지만, 본문(main)은 그렇다 —
       * 그 안에 position:fixed 를 두면 화면이 아니라 그 칸을 기준으로 붙는다.
       */}
      <BottomTabs />
      <AlertsEngine />
      <ServiceWorkerRegistrar />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </SearchProvider>
  );
}
