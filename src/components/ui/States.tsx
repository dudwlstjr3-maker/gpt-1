'use client';

/**
 * 로딩 / 빈값 / 부분 오류 / 전체 오류 / 오래된 데이터 상태 표시.
 * 어떤 상태든 "왜 이런지"를 한국어로 알려주고, 가능하면 다음 행동을 준다.
 */

import type { ReactNode } from 'react';
import type { Section, SectionStatus } from '@/types';

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

export function SkeletonCard({ lines = 3, height = 120 }: { lines?: number; height?: number }) {
  return (
    <div className="card p-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">데이터를 불러오는 중입니다.</span>
      <Skeleton className="mb-3 h-4 w-24" />
      <Skeleton className="mb-3 w-full" style={{ height }} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="mb-2 h-3" style={{ width: `${85 - i * 15}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({
  title = '표시할 데이터가 없습니다',
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-4 py-8 text-center">
      <span aria-hidden="true" className="text-2xl">
        〰
      </span>
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description ? <p className="max-w-xs text-xs text-muted">{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title = '데이터를 불러오지 못했습니다',
  message,
  onRetry,
  compact = false,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`card flex flex-col items-start gap-2 ${compact ? 'px-3 py-3' : 'px-4 py-6'}`}
      style={{ borderColor: 'color-mix(in srgb, var(--danger) 40%, var(--border))' }}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" style={{ color: 'var(--danger)' }}>
          ⚠
        </span>
        <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>
          {title}
        </p>
      </div>
      {message ? <p className="text-xs break-keep text-muted">{message}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-3"
        >
          다시 시도
        </button>
      ) : null}
    </div>
  );
}

export function Notice({
  tone = 'warn',
  children,
}: {
  tone?: 'warn' | 'neutral' | 'danger';
  children: ReactNode;
}) {
  const color = tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--muted-fg)';
  return (
    <p
      className="flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[11px] leading-relaxed break-keep"
      style={{ background: `color-mix(in srgb, ${color} 10%, transparent)`, color }}
    >
      {/* 줄지 않게 못 박는다. 눌리면 글리프가 제 상자를 넘어 옆 글자 위로 올라탄다. */}
      <span aria-hidden="true" className="shrink-0">
        ⓘ
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export const STATUS_LABEL: Record<SectionStatus, string> = {
  ok: '정상',
  loading: '불러오는 중',
  empty: '데이터 없음',
  partial: '일부 항목 누락',
  stale: '오래된 데이터',
  error: '오류',
};

/**
 * 섹션 상태에 따라 로딩/빈값/오류를 대신 렌더링한다.
 * 정상·부분·오래됨이면 children 을 그대로 보여준다 (배지는 각 카드가 표시).
 */
export function SectionGate<T>({
  section,
  loading,
  empty,
  onRetry,
  children,
}: {
  section: Section<T> | null | undefined;
  loading: ReactNode;
  empty?: ReactNode;
  onRetry?: () => void;
  children: (data: T, section: Section<T>) => ReactNode;
}) {
  if (!section || section.status === 'loading') return <>{loading}</>;
  if (section.status === 'error' || section.data === null) {
    return <ErrorState message={section.error ?? '알 수 없는 오류입니다.'} onRetry={onRetry} />;
  }
  if (section.status === 'empty') return <>{empty ?? <EmptyState />}</>;
  return <>{children(section.data, section)}</>;
}
