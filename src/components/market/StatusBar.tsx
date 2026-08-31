'use client';

/**
 * 홈 상단 상태바 — 10초 안에 "지금 시장이 열려 있는지, 데이터가 믿을 만한지"를 알려준다.
 * KST 시각 · 시장별 세션 · 데이터 상태 배지 · 마지막 전체 업데이트 · 통화/색상 전환.
 */

import { useEffect, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useSettings } from '@/components/providers/SettingsProvider';
import { Badge, ModeBadge } from '@/components/ui/Badge';
import { formatKstTimeSec, formatRelative } from '@/lib/format';
import { sessionHint } from '@/lib/marketHours';
import { MARKET_LABEL, SESSION_LABEL, type MarketSession, type SessionPhase } from '@/types';

const PHASE_COLOR: Record<SessionPhase, string> = {
  regular: 'var(--ok)',
  pre: 'var(--accent)',
  post: 'var(--accent)',
  closed: 'var(--muted-fg)',
  holiday: 'var(--warn)',
  always: 'var(--ok)',
};

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span className="tnum text-sm font-semibold text-fg-strong" aria-live="off">
      {now ? formatKstTimeSec(now) : '--:--:--'}
      <span className="ml-1 text-[10px] font-normal text-muted">KST</span>
    </span>
  );
}

function SessionChip({ session }: { session: MarketSession }) {
  const hint = sessionHint(session);
  return (
    <div
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 py-1"
      title={hint}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: PHASE_COLOR[session.phase] }} />
      <span className="text-[11px] font-semibold text-fg">{MARKET_LABEL[session.market]}</span>
      <span className="text-[11px]" style={{ color: PHASE_COLOR[session.phase] }}>
        {SESSION_LABEL[session.phase]}
      </span>
      <span className="sr-only">{hint}</span>
    </div>
  );
}

export function StatusBar() {
  const { snapshot, revalidating, error, refresh } = useData();
  const [, tick] = useState(0);

  // 상대 시각("3분 전")을 살아 있게 유지
  useEffect(() => {
    const t = window.setInterval(() => tick((v) => v + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const sessions = snapshot?.sections.sessions.data ?? [];
  const staleSections = snapshot
    ? Object.values(snapshot.sections).filter((s) => s.status === 'stale').length
    : 0;
  const errorSections = snapshot
    ? Object.values(snapshot.sections).filter((s) => s.status === 'error').length
    : 0;

  return (
    <header
      className="sticky top-0 z-30 border-b border-border pt-safe"
      style={{ background: 'color-mix(in srgb, var(--bg) 88%, transparent)', backdropFilter: 'blur(12px)' }}
    >
      <div className="mx-auto w-full max-w-6xl px-3 py-2">
        {/* 1행: 시각 + 상태 배지 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Clock />
            {snapshot ? <ModeBadge mode={snapshot.mode} /> : null}
            {snapshot?.scenario && snapshot.scenario !== 'normal' ? (
              <Badge tone="warn" size="xs">
                시나리오: {snapshot.scenario}
              </Badge>
            ) : null}
            {errorSections > 0 ? (
              <Badge tone="danger" size="xs">
                오류 {errorSections}
              </Badge>
            ) : staleSections > 0 ? (
              <Badge tone="warn" size="xs">
                오래된 데이터 {staleSections}
              </Badge>
            ) : snapshot ? (
              <Badge tone="ok" size="xs">
                정상
              </Badge>
            ) : null}
            {/* 마지막 갱신 시각. 따로 한 줄을 쓰지 않고 상태 배지 옆에 붙인다. */}
            <span className="tnum truncate text-[11px] text-subtle">
              {snapshot ? formatRelative(snapshot.lastFullUpdate) : '—'} 갱신
            </span>
          </div>

          <button
            type="button"
            onClick={refresh}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-[11px] font-semibold text-muted hover:text-fg"
            aria-label="지금 새로고침"
          >
            <span aria-hidden="true" className={revalidating ? 'animate-spin' : ''}>
              ↻
            </span>
            {revalidating ? '갱신 중' : '새로고침'}
          </button>
        </div>

        {/* 2행: 세션 칩 */}
        <div className="scroll-x mt-2 flex items-center gap-1.5 pb-0.5">
          {sessions.length > 0
            ? sessions.map((s) => <SessionChip key={s.market} session={s} />)
            : ['us', 'kr', 'crypto'].map((m) => (
                <div key={m} className="h-6 w-24 shrink-0 skeleton" />
              ))}
        </div>

        {/*
         * 통화·색상 전환은 더보기 → 표시 통화 / 등락 색상 에 그대로 있다.
         * 한 번 정해 두면 며칠씩 그대로 두는 설정이라, 모든 화면 맨 위에 늘 띄워
         * 둘 만한 것이 아니었다. 상태바가 네 줄이던 것을 두 줄로 줄인다.
         *
         * 수신 시각도 뺐다. '마지막 전체 업데이트' 와 거의 늘 같은 값이라
         * 두 개를 나란히 두면 무엇이 다른지 알 수 없다.
         */}
        {error ? (
          <p className="mt-1.5 text-[11px]" style={{ color: 'var(--warn)' }} role="status">
            최신 데이터를 받지 못해 마지막 정상 데이터를 표시하고 있습니다. ({error})
          </p>
        ) : null}
      </div>
    </header>
  );
}
