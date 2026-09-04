'use client';

/**
 * 차트를 크게 보는 창.
 *
 * 왜 필요한가
 *   카드 안의 그림은 100px 언저리다. 그 크기에 확대·축소 버튼까지 밀어 넣으면
 *   정작 그림 볼 자리가 없어진다. 그래서 작은 그림은 **작게 두고**, 누르면
 *   화면 가득 열어 거기서 마음껏 끌고 확대하게 한다.
 *
 * 지키는 것
 *  - Esc 와 바깥 누르기로 닫힌다. 닫으면 원래 눌렀던 버튼으로 초점이 돌아간다.
 *  - 열려 있는 동안 뒤 페이지는 스크롤되지 않는다.
 *  - 초점이 창 밖으로 새 나가지 않는다(Tab 순환).
 *  - prefers-reduced-motion 이면 나타나는 동작을 생략한다.
 */

import { useCallback, useEffect, useRef } from 'react';

export function ChartModal({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  /** 열기 전에 초점이 있던 곳 — 닫을 때 여기로 돌려준다 */
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // 열자마자 닫기 버튼에 초점을 준다. 스크린리더가 창이 열린 것을 알 수 있어야 한다.
    const t = window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      returnTo.current?.focus?.();
    };
  }, [open]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      // 초점 순환 — 창 안에서만 돌게 잡아 둔다
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-[2px] sm:p-6 motion-safe:animate-[fadeIn_120ms_ease-out]"
      onMouseDown={(e) => {
        // 창 안에서 끌다가 바깥에서 손을 떼도 닫히면 안 된다. 눌린 자리로 판단한다.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={onKeyDown}
        className="flex max-h-full w-full flex-col rounded-2xl border border-border bg-bg-elevated shadow-[var(--shadow-card)] sm:max-h-[92vh] sm:w-full sm:max-w-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-bold text-fg-strong">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[11px] break-keep text-muted">{subtitle}</p> : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mt-0.5 shrink-0 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[12px] font-semibold text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]"
          >
            닫기 <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">{children}</div>
      </div>
    </div>
  );
}

/**
 * 그림을 누르면 크게 열리는 버튼.
 *
 * 그림 자체를 버튼으로 감싼다. 작은 ⤢ 아이콘만 누르게 하면 손가락으로는 거의 못 누른다.
 * 다만 스크린리더에는 "크게 보기" 라는 말로 읽히게 이름을 따로 준다.
 */
export function ExpandTrigger({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} 크게 보기`}
      className="group relative block w-full cursor-zoom-in rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
    >
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1 right-1 rounded border border-border bg-surface-2/85 px-1 text-[10px] leading-[15px] font-semibold text-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        ⤢
      </span>
    </button>
  );
}
