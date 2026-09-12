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
          ? 'px-2 py-0 text-[10.5px]'
          : size === 'xs'
            ? 'px-2 py-0.5 text-[11.5px]'
            : 'px-2 py-0.5 text-[12.5px]'
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

/**
 * 카드에 붙는 상태 잔글씨 — '마감 · 15분 지연'.
 *
 * 왜 알약을 뗐나. 배지 하나는 글씨를 10.5px 까지 줄여도 테두리와 좌우 여백으로
 * 24px 을 더 먹는다. 둘이면 60px 이다. 그 60px 이 이름 칸에서 나갔고, 그래서
 * '다우존스 산업평균' 이 320px 에서 두 줄로 접혔다. 이름이 먼저다 — 무엇의
 * 값인지 모르면 옆의 숫자도 읽을 수 없다.
 *
 * 다만 전부 잔글씨로 내리지는 않는다.
 *  - '마감'·'장중'·'15분 지연'·'실시간' 은 값을 읽고 **난 뒤에** 확인하는 사실이다.
 *    이름 아래 회색 한 줄이면 족하다.
 *  - '오래된 데이터'·'DEMO' 는 값을 믿기 **전에** 봐야 하는 경고다.
 *    테두리와 색을 그대로 남긴다.
 *
 * 부모의 글자 크기를 물려받는다. 놓이는 자리(카드 아래 11.5px 줄)가 크기를 정한다.
 */
export function StatusLine({
  phase,
  freshness,
  delayMinutes,
}: {
  phase?: SessionPhase | null;
  freshness: Freshness;
  delayMinutes?: number | null;
}) {
  const alert = freshness === 'stale' ? '오래된 데이터' : freshness === 'demo' ? 'DEMO' : null;
  const words: string[] = [];
  if (phase) words.push(SESSION_LABEL[phase]);
  if (freshness === 'delayed') words.push(delayMinutes ? `${delayMinutes}분 지연` : '지연');
  else if (freshness === 'live') words.push('실시간');

  return (
    <>
      {words.length > 0 ? (
        <span
          className="whitespace-nowrap"
          title={freshness === 'delayed' ? '제공사 계약에 따른 지연 시세입니다.' : undefined}
        >
          {words.join(' · ')}
        </span>
      ) : null}
      {alert ? (
        <Badge
          tone={freshness === 'demo' ? 'demo' : 'warn'}
          size="2xs"
          title={
            freshness === 'demo'
              ? '고정 샘플 데이터입니다. 실제 시세가 아닙니다.'
              : '기준 시각이 오래되었습니다.'
          }
        >
          {alert}
        </Badge>
      ) : null}
    </>
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

/**
 * 장 상태 배지 — 기본을 제일 작은 칸으로 둔다.
 *
 * '마감' · '장중' 은 곁들이는 말이지 카드에서 읽을 거리가 아니다. 종목 이름과
 * 비슷한 크기로 있으면 눈이 어디를 먼저 볼지 헷갈린다.
 */
export function SessionBadge({ phase, size = '2xs' }: { phase: SessionPhase; size?: '2xs' | 'xs' | 'sm' }) {
  return (
    <Badge tone={SESSION_TONE[phase]} size={size}>
      {SESSION_LABEL[phase]}
    </Badge>
  );
}
