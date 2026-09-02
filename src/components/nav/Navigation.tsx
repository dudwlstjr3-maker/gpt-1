'use client';

/** 모바일 하단 탭 / 데스크톱 좌측 사이드바. */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const I = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

/*
 * 시장은 탭이 아니다.
 * 홈의 심리 카드마다 "○○ 시장 →" 버튼이 있어 거기서 바로 들어가고,
 * 시장을 고르기만 하던 허브 화면은 홈과 내용이 겹쳐서 없앴다.
 *
 * 대신 '지수' 를 탭으로 세웠다. 지수는 종목과 성격이 달라서 — 살 수 있는
 * 물건이 아니라 시장의 온도계라서 — 홈의 가격 목록에 섞여 있으면 잘 안 보였다.
 * 세 시장의 지수를 모아 둔 화면이 시장별 화면으로 들어가는 입구도 겸한다.
 *
 * '생활' 도 탭이다. 한동안 지수 탭 안의 두 번째 보기로 접어 두었는데, 320px
 * 에서 일곱 칸이면 글자가 뭉개질까 걱정해서였다. 재어 보니 아니었다 — 가장 긴
 * 이름이 네 글자(38px)이고 한 칸이 45.7px 이라 남는다. 걱정 하나 때문에 성격이
 * 다른 두 화면을 겹쳐 둘 이유는 없어서 갈라 놓았다. '관심목록' 은 '관심' 으로
 * 줄였다 — 별 모양 아이콘이 이미 나머지 두 글자를 말하고 있다.
 *
 * '지수' 와 '지표' 는 한 글자 차이라 10px 로 나란히 놓으면 구분되지 않는다.
 * 그래서 지표 쪽 이름을 '경제지표' 로 늘렸다. 같은 이유로 생활 경제 지수는
 * '생활지수' 가 아니라 '생활' 이다.
 */
const NAV: NavItem[] = [
  { href: '/', label: '홈', icon: <I d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> },
  { href: '/indices', label: '지수', icon: <I d="M3 17.5 9 11l4 4 8-8.5M15 6.5h6v6" /> },
  { href: '/basics', label: '생활', icon: <I d="M4 8h16l-1.3 11.1a1 1 0 0 1-1 .9H6.3a1 1 0 0 1-1-.9zM9 8V5.5a3 3 0 0 1 6 0V8" /> },
  { href: '/indicators', label: '경제지표', icon: <I d="M4 20V11M10 20V4M16 20v-7M22 20V8" /> },
  { href: '/calendar', label: '캘린더', icon: <I d="M4 6h16v15H4zM4 10h16M8 3v4M16 3v4" /> },
  { href: '/watchlist', label: '관심', icon: <I d="m12 4 2.5 5.2 5.5.8-4 3.9 1 5.6L12 16.9 7 19.5l1-5.6-4-3.9 5.5-.8z" /> },
  { href: '/more', label: '더보기', icon: <I d="M4 7h16M4 12h16M4 17h10" /> },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === '/') return pathname === '/';
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border pb-safe lg:hidden"
      style={{ background: 'color-mix(in srgb, var(--bg) 92%, transparent)', backdropFilter: 'blur(12px)' }}
    >
      <ul className="mx-auto flex max-w-lg">
        {NAV.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="flex min-w-0 flex-col items-center gap-0.5 px-px py-2 text-[9.5px] font-semibold whitespace-nowrap transition-colors"
                style={{ color: active ? 'var(--accent)' : 'var(--muted-fg)' }}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function DesktopSidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r border-border px-3 py-4 lg:block">
      <div className="mb-5 px-2">
        <p className="text-base font-bold text-fg-strong">Market Mood 3</p>
        <p className="mt-0.5 text-[11px] text-subtle">미국 · 크립토 투자심리와 지수</p>
      </div>
      <nav aria-label="주요 메뉴">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = isActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors hover:bg-surface-2"
                  style={{
                    color: active ? 'var(--accent)' : 'var(--muted-fg)',
                    background: active ? 'var(--surface-2)' : undefined,
                  }}
                >
                  {item.icon}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {/* 지수 화면에서도 들어갈 수 있지만, 데스크톱에서는 한 번에 가는 길을 남겨 둔다 */}
      <div className="mt-4 border-t border-border pt-3">
        <p className="mb-1 px-2.5 text-[10px] font-semibold tracking-wide text-subtle">시장별 화면</p>
        <ul className="space-y-0.5">
          {[
            { href: '/market/us', label: '미국' },
            { href: '/market/crypto', label: '크립토' },
          ].map((m) => {
            const active = pathname === m.href;
            return (
              <li key={m.href}>
                <Link
                  href={m.href}
                  aria-current={active ? 'page' : undefined}
                  className="block rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-surface-2"
                  style={{ color: active ? 'var(--accent)' : 'var(--muted-fg)', background: active ? 'var(--surface-2)' : undefined }}
                >
                  {m.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <ul className="space-y-0.5">
          {[{ href: '/alerts', label: '알림 설정' }].map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="block rounded-lg px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
