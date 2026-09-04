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
  size?: '2xs' | 'xs' | 'sm';
}) {
  const s = TONE_STYLE[tone];
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-semibold whitespace-nowrap ${
        size === '2xs'
          ? 'px-1.5 py-0 text-[9.5px]'
          : size === 'xs'
            ? 'px-1.5 py-0.5 text-[10px]'
            : 'px-2 py-0.5 text-[11px]'
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

/**
 * 지연·실시간 표시.
 *
 * 카드에서 제일 작은 글씨다(9.5px). 이건 **숫자를 읽고 난 뒤에** 확인하는 정보라
 * 가격이나 등락률과 같은 크기로 서 있으면 시선을 뺏는다.
 * 다만 '오래된 데이터' 만은 한 단계 크게 둔다 — 그건 값을 믿기 전에 봐야 하는 경고다.
 */
export function FreshnessBadge({
  freshness,
  delayMinutes,
  size = '2xs',
}: {
  freshness: Freshness;
  delayMinutes?: number | null;
  size?: '2xs' | 'xs' | 'sm';
}) {
  if (freshness === 'stale') {
    return (
      <Badge tone="warn" size={size === '2xs' ? 'xs' : size} title="기준 시각이 오래되었습니다.">
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
