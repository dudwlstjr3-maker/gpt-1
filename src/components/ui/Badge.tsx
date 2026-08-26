'use client';

import type { ReactNode } from 'react';
import type { DataMode, Freshness, SessionPhase } from '@/types';
import { SESSION_LABEL } from '@/types';

export type Tone = 'neutral' | 'accent' | 'warn' | 'danger' | 'ok' | 'demo';

const TONE_STYLE: Record<Tone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: 'var(--surface-2)', fg: 'var(--muted-fg)', border: 'var(--border)' },
  accent: { bg: 'color-mix(in srgb, var(--accent) 16%, transparent)', fg: 'var(--accent)', border: 'color-mix(in srgb, var(--accent) 40%, transparent)' },
  warn: { bg: 'color-mix(in srgb, var(--warn) 16%, transparent)', fg: 'var(--warn)', border: 'color-mix(in srgb, var(--warn) 40%, transparent)' },
  danger: { bg: 'color-mix(in srgb, var(--danger) 16%, transparent)', fg: 'var(--danger)', border: 'color-mix(in srgb, var(--danger) 42%, transparent)' },
  ok: { bg: 'color-mix(in srgb, var(--ok) 16%, transparent)', fg: 'var(--ok)', border: 'color-mix(in srgb, var(--ok) 40%, transparent)' },
  demo: { bg: 'color-mix(in srgb, var(--warn) 22%, transparent)', fg: 'var(--warn)', border: 'var(--warn)' },
};

export function Badge({
  children,
  tone = 'neutral',
  title,
  size = 'sm',
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
  size?: 'xs' | 'sm';
}) {
  const s = TONE_STYLE[tone];
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-semibold whitespace-nowrap ${
        size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      }`}
      style={{ background: s.bg, color: s.fg, borderColor: s.border }}
    >
      {children}
    </span>
  );
}

/** DEMO / LIVE 모드 배지 — 모든 화면 상단과 데이터 카드에 노출된다. */
export function ModeBadge({ mode, size = 'sm' }: { mode: DataMode; size?: 'xs' | 'sm' }) {
  return mode === 'DEMO' ? (
    <Badge tone="demo" size={size} title="고정 샘플 데이터입니다. 실제 시세가 아닙니다.">
      DEMO
    </Badge>
  ) : (
    <Badge tone="ok" size={size} title="실데이터 모드">
      LIVE
    </Badge>
  );
}

export function FreshnessBadge({
  freshness,
  delayMinutes,
  size = 'xs',
}: {
  freshness: Freshness;
  delayMinutes?: number | null;
  size?: 'xs' | 'sm';
}) {
  if (freshness === 'stale') {
    return (
      <Badge tone="warn" size={size} title="기준 시각이 오래되었습니다.">
        오래된 데이터
      </Badge>
    );
  }
  if (freshness === 'delayed') {
    return (
      <Badge tone="neutral" size={size} title="제공사 계약에 따른 지연 시세입니다.">
        {delayMinutes ? `${delayMinutes}분 지연` : '지연'}
      </Badge>
    );
  }
  if (freshness === 'demo') {
    return (
      <Badge tone="demo" size={size}>
        DEMO
      </Badge>
    );
  }
  return (
    <Badge tone="ok" size={size} title="실시간에 가까운 데이터입니다.">
      실시간
    </Badge>
  );
}

const SESSION_TONE: Record<SessionPhase, Tone> = {
  pre: 'accent',
  regular: 'ok',
  post: 'accent',
  closed: 'neutral',
  holiday: 'neutral',
  always: 'ok',
};

export function SessionBadge({ phase, size = 'xs' }: { phase: SessionPhase; size?: 'xs' | 'sm' }) {
  return (
    <Badge tone={SESSION_TONE[phase]} size={size}>
      {SESSION_LABEL[phase]}
    </Badge>
  );
}
