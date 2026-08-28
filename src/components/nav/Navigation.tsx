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
 * 비워진 자리에는 실제로 자주 여는 지표 화면을 둔다.
 */
const NAV: NavItem[] = [
  { href: '/', label: '홈', icon: <I d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> },
  { href: '/indicators', label: '지표', icon: <I d="M4 20V11M10 20V4M16 20v-7M22 20V8" /> },
  { href: '/calendar', label: '캘린더', icon: <I d="M4 6h16v15H4zM4 10h16M8 3v4M16 3v4" /> },
  { href: '/watchlist', label: '관심목록', icon: <I d="m12 4 2.5 5.2 5.5.8-4 3.9 1 5.6L12 16.9 7 19.5l1-5.6-4-3.9 5.5-.8z" /> },
  { href: '/more', label: '더보기', icon: <I d="M4 7h16M4 12h16M4 17h10" /> },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
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
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors"
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
        <p className="mt-0.5 text-[11px] text-subtle">미국 · 한국 · 크립토 투자심리</p>
      </div>
      <nav aria-label="주요 메뉴">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
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
      {/* 시장은 화면이 분리되어 있고 허브가 없으므로, 사이드바에서 바로 들어간다 */}
      <div className="mt-4 border-t border-border pt-3">
        <p className="mb-1 px-2.5 text-[10px] font-semibold tracking-wide text-subtle">시장별 화면</p>
        <ul className="space-y-0.5">
          {[
            { href: '/market/us', label: '미국' },
            { href: '/market/kr', label: '한국' },
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
          {[
            { href: '/indicators', label: '경제 · 위험 지표' },
            { href: '/basics', label: '생활 속 경제 이야기' },
            { href: '/alerts', label: '알림 설정' },
          ].map((s) => (
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
