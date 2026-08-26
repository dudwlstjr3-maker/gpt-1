import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SettingsProvider } from '@/components/providers/SettingsProvider';
import { DataProvider } from '@/components/providers/DataProvider';
import { AppShell } from '@/components/nav/AppShell';

export const metadata: Metadata = {
  title: 'Market Mood 3 — 미국·한국·크립토 투자심리 대시보드',
  description:
    '미국·한국·크립토 시장의 투자심리, 주요 가격, 경제지표를 10초 안에 파악하는 모바일 우선 대시보드. 정보 제공 목적이며 투자 조언이 아닙니다.',
  applicationName: 'Market Mood 3',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Market Mood 3',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0d14',
};

/** 첫 페인트 전에 테마를 적용해 화면 깜빡임을 막는다. */
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('mm3.settings.v1');var t='dark';if(s){var p=JSON.parse(s);if(p&&p.theme){t=p.theme;}}if(t==='system'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          본문으로 건너뛰기
        </a>
        <SettingsProvider>
          <DataProvider>
            <AppShell>{children}</AppShell>
          </DataProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
