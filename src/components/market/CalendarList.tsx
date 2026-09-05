'use client';

/** 경제 캘린더 — 국가·중요도·예상치·이전치·발표치·KST 시각·남은 시간. */

import Link from 'next/link';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, EmptyState } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { useNow } from '@/lib/useNow';
import { formatCountdown, formatKstDate, formatKstTime, NO_VALUE } from '@/lib/format';
import { marketColor } from '@/lib/scale';
import { EVENT_CATEGORY_LABEL, MARKET_LABEL, type CalendarEvent, type EventImportance } from '@/types';

/** 배지는 국가가 아니라 '어느 시장 일정인가'를 보여준다 (크립토는 국가가 없다) */
const MARKET_BADGE: Record<CalendarEvent['market'], string> = {
  us: MARKET_LABEL.us,
  kr: MARKET_LABEL.kr,
  crypto: MARKET_LABEL.crypto,
  global: '글로벌',
};

const IMPORTANCE: Record<EventImportance, { label: string; glyph: string; tone: 'danger' | 'warn' | 'neutral' }> = {
  high: { label: '높음', glyph: '●●●', tone: 'danger' },
  medium: { label: '보통', glyph: '●●○', tone: 'warn' },
  low: { label: '낮음', glyph: '●○○', tone: 'neutral' },
};

export function EventRow({ event, now }: { event: CalendarEvent; now: number | null }) {
  const t = Date.parse(event.scheduledAt);
  const imp = IMPORTANCE[event.importance];
  const past = now !== null && t <= now;

  return (
    <li className="border-b border-border px-3 py-2.5 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* 시장 배지에 그 시장 색을 입힌다. 여러 시장이 섞인 목록에서 눈으로 훑는 데 쓰는
                표식일 뿐, 어느 시장인지는 배지 안의 글자가 말한다. */}
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11.5px] font-semibold"
              style={{
                borderColor: `color-mix(in srgb, ${marketColor(event.market)} 45%, var(--border))`,
                background: `color-mix(in srgb, ${marketColor(event.market)} 12%, transparent)`,
                color: marketColor(event.market),
              }}
            >
              <span
                aria-hidden="true"
                className="block h-[5px] w-[5px] rounded-full"
                style={{ background: marketColor(event.market) }}
              />
              {MARKET_BADGE[event.market]}
            </span>
            <Badge tone={imp.tone} size="xs" title={`중요도 ${imp.label}`}>
              <span aria-hidden="true">{imp.glyph}</span>
              {imp.label}
            </Badge>
            {/* 크립토 일정은 배지와 분류명이 같아 두 번 적히므로 하나만 남긴다 */}
            {EVENT_CATEGORY_LABEL[event.category] !== MARKET_BADGE[event.market] ? (
              <span className="text-[11.5px] text-subtle">{EVENT_CATEGORY_LABEL[event.category]}</span>
            ) : null}
          </div>
          <p className="mt-1 text-[13px] leading-snug font-semibold break-keep text-fg">{event.title}</p>
          {event.note ? <p className="mt-0.5 text-[11.5px] text-subtle">{event.note}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          {/*
            시각을 모르는 일정에 시계를 그리지 않는다.
            예전에는 자정을 찍고 뒤에 '*' 를 붙였는데, 별표에 아무 설명이 없어
            "00:00 에 발표" 로 읽혔다. FRED 처럼 날짜만 주는 제공사가 붙으면서
            그런 일정이 실제로 생겼다 — 모르면 모른다고 적는다.
          */}
          <p className="tnum text-[13px] font-semibold text-fg-strong">
            {event.timeTbd ? (
              <span className="text-[12.5px] text-muted">시각 미정</span>
            ) : (
              formatKstTime(event.scheduledAt)
            )}
          </p>
          <p className="tnum text-[11.5px] text-subtle">{formatKstDate(event.scheduledAt)} KST</p>
          <p className="tnum mt-0.5 text-[11.5px]" style={{ color: past ? 'var(--subtle-fg)' : 'var(--accent)' }}>
            {now === null ? '—' : formatCountdown(t - now)}
          </p>
        </div>
      </div>

      <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px]">
        <div className="flex gap-1">
          <dt className="text-subtle">예상</dt>
          <dd className="tnum text-fg">{event.forecast ?? NO_VALUE}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-subtle">이전</dt>
          <dd className="tnum text-fg">{event.previous ?? NO_VALUE}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-subtle">발표</dt>
          <dd className="tnum font-semibold" style={{ color: event.actual ? 'var(--accent)' : 'var(--subtle-fg)' }}>
            {event.actual ?? '미발표'}
          </dd>
        </div>
      </dl>
    </li>
  );
}

/** 홈 미리보기 — 오늘 남은 일정 위주로 최대 4건 */
export function CalendarPreview() {
  const { snapshot, refresh } = useData();
  const now = useNow(30_000);
  const section = snapshot?.sections.calendar ?? null;

  return (
    <section aria-labelledby="calendar-preview-title" className="mt-5 px-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="calendar-preview-title" className="text-base font-bold text-fg-strong">
          오늘의 경제 일정
        </h2>
        <Link href="/calendar" className="text-[12.5px] font-semibold text-accent hover:underline">
          전체 캘린더 →
        </Link>
      </div>

      <SectionGate
        section={section}
        onRetry={refresh}
        loading={<SkeletonCard height={40} lines={3} />}
        empty={<EmptyState title="예정된 일정이 없습니다" description="다음 일정이 등록되면 여기에 표시됩니다." />}
      >
        {(events) => {
          const ref = now ?? Date.now();
          const upcoming = events.filter((e) => Date.parse(e.scheduledAt) >= ref - 6 * 3600_000).slice(0, 4);
          if (upcoming.length === 0) {
            return <EmptyState title="남은 일정이 없습니다" description="오늘 예정된 주요 지표 발표가 없습니다." />;
          }
          return (
            <div className="card overflow-hidden">
              <ul>
                {upcoming.map((e) => (
                  <EventRow key={e.id} event={e} now={now} />
                ))}
              </ul>
            </div>
          );
        }}
      </SectionGate>
    </section>
  );
}
