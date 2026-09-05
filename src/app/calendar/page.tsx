'use client';

/** 경제 캘린더 — 미국·한국·크립토 시장별 + 중요도·카테고리 필터, 날짜별 그룹. */

import { BackBar } from '@/components/nav/BackBar';
import { useMemo, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, EmptyState } from '@/components/ui/States';
import { SegmentedControl } from '@/components/ui/Controls';
import { EventRow } from '@/components/market/CalendarList';
import { CalendarMonth } from '@/components/market/CalendarMonth';
import { useNow } from '@/lib/useNow';
import { formatKstDate, kstDateKey } from '@/lib/format';
import { EVENT_CATEGORY_LABEL, MARKET_LABEL, type CalendarEvent, type EventCategory, type MarketId } from '@/types';

/**
 * 시장 구분은 앱의 다른 화면(홈·시장·심리)과 같은 축을 쓴다.
 * '글로벌'은 어느 한 시장에 묶이지 않는 일정이며, 시장을 고르면 함께 보여준다 —
 * 미국 탭에서 글로벌 일정이 사라지면 놓치는 일정이 생기기 때문이다.
 */
/**
 * 캘린더에는 '전체'가 있다.
 *
 * 지표·심리 화면에서는 시장을 섞지 않는다 — 미국 CPI 와 BTC 도미넌스를 한 줄에
 * 세면 "빨간불 1개"가 무슨 뜻인지 알 수 없기 때문이다. 하지만 캘린더는 값을 세는
 * 곳이 아니라 시간을 늘어놓는 곳이다. "이번 주에 뭐가 몰려 있나"는 세 시장을
 * 한 번에 봐야 답이 나온다. 대신 어느 시장 일정인지는 시장 색과 배지로 늘 보인다.
 */
type MarketFilter = MarketId | 'all';
type ImportanceFilter = 'all' | 'high' | 'medium';
/** 달력으로 볼지 목록으로 볼지. 달력은 "언제 몰려 있나", 목록은 "다음이 뭔가"에 답한다. */
type ViewMode = 'month' | 'list';

const MARKET_OPTIONS: { value: MarketFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'us', label: MARKET_LABEL.us },
  { value: 'kr', label: MARKET_LABEL.kr },
  { value: 'crypto', label: MARKET_LABEL.crypto },
];

export default function CalendarPage() {
  const { snapshot, refresh } = useData();
  const now = useNow(30_000);
  const [market, setMarket] = useState<MarketFilter>('all');
  const [importance, setImportance] = useState<ImportanceFilter>('all');
  const [category, setCategory] = useState<EventCategory | 'all'>('all');
  const [view, setView] = useState<ViewMode>('month');

  const todayKey = kstDateKey(now ?? Date.now());
  const [cursor, setCursor] = useState(() => ({ year: Number(todayKey.slice(0, 4)), month: Number(todayKey.slice(5, 7)) }));
  const [selected, setSelected] = useState<string | null>(todayKey);

  const section = snapshot?.sections.calendar ?? null;

  /** 시장·중요도·분류를 거친 일정. 달력과 목록이 같은 집합을 본다. */
  const filtered = useMemo(() => {
    const events = section?.data ?? [];
    return events.filter((e) => {
      if (market !== 'all' && e.market !== market && e.market !== 'global') return false;
      if (importance === 'high' && e.importance !== 'high') return false;
      if (importance === 'medium' && e.importance === 'low') return false;
      if (category !== 'all' && e.category !== category) return false;
      return true;
    });
  }, [section, market, importance, category]);

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of filtered) {
      const key = formatKstDate(e.scheduledAt);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  /** 고른 날의 일정. 시각 순으로 정렬해 그날 순서대로 읽히게 한다. */
  const selectedEvents = useMemo(() => {
    if (!selected) return [];
    return filtered
      .filter((e) => kstDateKey(new Date(e.scheduledAt)) === selected)
      .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  }, [filtered, selected]);

  const categories: (EventCategory | 'all')[] = ['all', ...(Object.keys(EVENT_CATEGORY_LABEL) as EventCategory[])];

  return (
    <div className="pt-2">
      <BackBar />
      <h1 className="px-3 pt-1 text-lg font-bold text-fg-strong">경제 캘린더</h1>
      <p className="mt-0.5 px-3 text-[11px] break-keep text-muted">
        모든 시각은 KST 기준입니다. 전체를 고르면 세 시장을 한 번에, 시장을 고르면 그 시장과 글로벌 일정을 봅니다.
        어느 시장 일정인지는 색과 배지로 표시합니다.
      </p>

      <div className="mt-3 space-y-2 px-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="시장"
            size="xs"
            value={market}
            onChange={setMarket}
            options={MARKET_OPTIONS}
          />
          <SegmentedControl
            label="중요도"
            size="xs"
            value={importance}
            onChange={setImportance}
            options={[
              { value: 'all', label: '전체' },
              { value: 'medium', label: '보통 이상' },
              { value: 'high', label: '높음만' },
            ]}
          />
          <SegmentedControl
            label="보기"
            size="xs"
            value={view}
            onChange={setView}
            options={[
              { value: 'month', label: '달력' },
              { value: 'list', label: '목록' },
            ]}
          />
        </div>
        <div className="scroll-x flex gap-1.5 pb-1">
          {categories.map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={active}
                className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                style={{
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  background: active ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'var(--surface-2)',
                  color: active ? 'var(--accent)' : 'var(--muted-fg)',
                }}
              >
                {c === 'all' ? '전체' : EVENT_CATEGORY_LABEL[c]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 space-y-4 px-3">
        <SectionGate
          section={section}
          onRetry={refresh}
          loading={<SkeletonCard height={40} lines={4} />}
          empty={<EmptyState title="등록된 일정이 없습니다" />}
        >
          {() =>
            view === 'month' ? (
              <>
                <CalendarMonth
                  events={filtered}
                  year={cursor.year}
                  month={cursor.month}
                  selected={selected}
                  today={todayKey}
                  onSelect={setSelected}
                  onMonthChange={(y, m) => setCursor({ year: y, month: m })}
                />

                {/* 고른 날의 일정. 달력에서 누른 날이 여기로 이어진다. */}
                <section aria-label="고른 날의 일정" aria-live="polite">
                  <h2 className="mb-1.5 text-[12px] font-bold text-muted">
                    {selected ? formatKstDate(`${selected}T00:00:00+09:00`) : '날짜를 고르세요'}
                    {selected ? (
                      <span className="ml-1.5 font-normal text-subtle">
                        {selectedEvents.length ? `${selectedEvents.length}건` : '일정 없음'}
                      </span>
                    ) : null}
                  </h2>
                  {selected && selectedEvents.length > 0 ? (
                    <div className="card overflow-hidden">
                      <ul>
                        {selectedEvents.map((e) => (
                          <EventRow key={e.id} event={e} now={now} />
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <EmptyState
                      title={selected ? '이날은 등록된 일정이 없습니다' : '날짜를 눌러 보세요'}
                      description={selected ? '다른 날짜를 눌러 보세요.' : undefined}
                    />
                  )}
                </section>
              </>
            ) : grouped.length === 0 ? (
              <EmptyState title="조건에 맞는 일정이 없습니다" description="필터를 바꿔 보세요." />
            ) : (
              <>
                {grouped.map(([date, events]) => (
                  <section key={date} aria-label={`${date} 일정`}>
                    <h2 className="mb-1.5 text-[12px] font-bold text-muted">{date}</h2>
                    <div className="card overflow-hidden">
                      <ul>
                        {events.map((e) => (
                          <EventRow key={e.id} event={e} now={now} />
                        ))}
                      </ul>
                    </div>
                  </section>
                ))}
              </>
            )
          }
        </SectionGate>
      </div>
    </div>
  );
}
