'use client';

import type { ReactNode } from 'react';
import { BottomTabs, DesktopSidebar } from './Navigation';
import { StatusBar } from '@/components/market/StatusBar';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { AlertsEngine } from '@/components/alerts/AlertsEngine';
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar';

/**
 * 공통 레이아웃.
 * 모바일: 상단 상태바 + 하단 탭 / 데스크톱: 좌측 사이드바 + 다중 열
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <StatusBar />
        <main id="main" className="main-pad mx-auto w-full max-w-6xl flex-1">
          {children}
          <Disclaimer />
        </main>
      </div>
      <BottomTabs />
      <AlertsEngine />
      <ServiceWorkerRegistrar />
    </div>
  );
}
