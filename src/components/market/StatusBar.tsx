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
    <span className="tnum shrink-0 text-sm font-semibold text-fg-strong" aria-live="off">
      {now ? formatKstTimeSec(now) : '--:--:--'}
      <span className="ml-1 text-[11.5px] font-normal text-muted">KST</span>
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
      <span className="text-[12.5px] font-semibold text-fg">{MARKET_LABEL[session.market]}</span>
      <span className="text-[12.5px]" style={{ color: PHASE_COLOR[session.phase] }}>
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
          {/*
           * 한 줄로 못박는다 (flex-wrap 아님).
           *
           * 배지는 상태에 따라 생겼다 없어진다 — '오류 2', '오래된 데이터 3',
           * DEMO 의 '시나리오: partial'. 줄바꿈을 허용해 두었더니 배지 하나가 늘 때마다
           * 이 줄이 25px 에서 52px 이 됐고, 이 머리말은 sticky 라서 **모든 화면이**
           * 23px 씩 통째로 밀렸다. 30초마다 갱신되는 화면에서 그건 못 쓸 일이다.
           *
           * 자리가 모자라면 제일 덜 급한 '몇 분 전 갱신' 이 줄어든다 — 배지는 안 밀린다.
           */}
          <div className="flex min-w-0 flex-nowrap items-center gap-x-2 overflow-hidden">
            <Clock />
            {snapshot ? <ModeBadge mode={snapshot.mode} /> : null}
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
            {/* 마지막 갱신 시각. 따로 한 줄을 쓰지 않고 상태 배지 옆에 붙인다.
                좁은 화면(380px 미만)에서는 아예 감춘다 — 한 글자만 남기고 자르면
                '방' 같은 토막이 되어 오히려 읽는 데 방해가 된다. 이 값은 상태바가
                아니어도 각 카드의 기준 시각에서 확인할 수 있다. */}
            <span className="tnum hidden min-w-0 truncate text-[12.5px] text-subtle min-[380px]:inline">
              {snapshot ? formatRelative(snapshot.lastFullUpdate) : '—'} 갱신
            </span>
          </div>

          <button
            type="button"
            onClick={refresh}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-[12.5px] font-semibold text-muted hover:text-fg"
            aria-label="지금 새로고침"
          >
            <span aria-hidden="true" className={revalidating ? 'animate-spin' : ''}>
              ↻
            </span>
            {revalidating ? '갱신 중' : '새로고침'}
          </button>
        </div>

        {/* 2행: 세션 칩. DEMO 시나리오 배지도 여기 둔다 — 위 줄은 높이가 고정이어야 하고,
            이 줄은 가로로 밀리는 줄이라 무엇이 늘어도 화면이 흔들리지 않는다. */}
        <div className="scroll-x mt-2 flex items-center gap-1.5 pb-0.5">
          {snapshot?.scenario && snapshot.scenario !== 'normal' ? (
            <Badge tone="warn" size="xs">
              시나리오: {snapshot.scenario}
            </Badge>
          ) : null}
          {sessions.length > 0
            ? sessions.map((s) => <SessionChip key={s.market} session={s} />)
            : /* 뼈대는 진짜 칩과 같은 29px 이어야 한다. 24px 로 두었더니 값이 들어오는
                 순간 sticky 머리말이 5px 자라 화면 전체가 그만큼 밀렸다. */
              ['us', 'kr', 'crypto'].map((m) => (
                <div key={m} className="h-[29px] w-24 shrink-0 skeleton" />
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
          <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--warn)' }} role="status">
            최신 데이터를 받지 못해 마지막 정상 데이터를 표시하고 있습니다. ({error})
          </p>
        ) : null}
      </div>
    </header>
  );
}
