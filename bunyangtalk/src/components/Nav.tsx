"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

export const MENU = [
  { href: "/", label: "홈", icon: "home" },
  { href: "/jobs", label: "구인구직", icon: "jobs" },
  { href: "/lounge", label: "익명 라운지", short: "라운지", icon: "chat" },
  { href: "/sites", label: "분양현장", icon: "site" },
  { href: "/me", label: "마이페이지", short: "MY", icon: "user" },
];

const active = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function DesktopNav() {
  const path = usePathname();
  return (
    <nav className="hidden lg:flex items-center gap-1" aria-label="주요 메뉴">
      {MENU.map((m) => (
        <Link key={m.href} href={m.href}
          className={`rounded-lg px-3.5 py-2 text-[15px] font-semibold ${active(path, m.href) ? "text-navy-900 bg-brand-50" : "text-ink-2 hover:bg-surface-2"}`}>
          {m.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  // 채팅방 안에서는 입력창을 위해 하단 탭을 숨긴다
  if (path.startsWith("/lounge/chat/") || path.startsWith("/admin")) return null;
  return (
    <nav aria-label="하단 메뉴" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {MENU.map((m) => {
          const on = active(path, m.href);
          return (
            <li key={m.href}>
              <Link href={m.href} className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${on ? "text-navy-900" : "text-muted"}`}>
                <Icon name={m.icon} size={23} className={on ? "text-brand-600" : ""} />
                {m.short ?? m.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
