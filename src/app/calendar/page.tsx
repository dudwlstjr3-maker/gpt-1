'use client';

/** 경제 캘린더 — 미국·한국·크립토 시장별 + 중요도·카테고리 필터, 날짜별 그룹. */

import { useMemo, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, EmptyState } from '@/components/ui/States';
import { SegmentedControl } from '@/components/ui/Controls';
import { EventRow } from '@/components/market/CalendarList';
import { useNow } from '@/lib/useNow';
import { formatKstDate } from '@/lib/format';
import { EVENT_CATEGORY_LABEL, MARKET_LABEL, type CalendarEvent, type EventCategory, type MarketId } from '@/types';

/**
 * 시장 구분은 앱의 다른 화면(홈·시장·심리)과 같은 축을 쓴다.
 * '글로벌'은 어느 한 시장에 묶이지 않는 일정이며, 시장을 고르면 함께 보여준다 —
 * 미국 탭에서 글로벌 일정이 사라지면 놓치는 일정이 생기기 때문이다.
 */
/**
 * 시장은 항상 하나만 고른다.
 * 미국·한국·크립토는 열리는 시간도 움직이는 이유도 다른 별개 시장이라,
 * 셋을 한 목록에 섞어 놓으면 무엇을 보고 있는지가 흐려진다.
 */
type MarketFilter = MarketId;
type ImportanceFilter = 'all' | 'high' | 'medium';

const MARKET_OPTIONS: { value: MarketFilter; label: string }[] = [
  { value: 'us', label: MARKET_LABEL.us },
  { value: 'kr', label: MARKET_LABEL.kr },
  { value: 'crypto', label: MARKET_LABEL.crypto },
];

export default function CalendarPage() {
  const { snapshot, refresh } = useData();
  const now = useNow(30_000);
  const [market, setMarket] = useState<MarketFilter>('us');
  const [importance, setImportance] = useState<ImportanceFilter>('all');
  const [category, setCategory] = useState<EventCategory | 'all'>('all');

  const section = snapshot?.sections.calendar ?? null;

  const grouped = useMemo(() => {
    const events = section?.data ?? [];
    const filtered = events.filter((e) => {
      if (e.market !== market && e.market !== 'global') return false;
      if (importance === 'high' && e.importance !== 'high') return false;
      if (importance === 'medium' && e.importance === 'low') return false;
      if (category !== 'all' && e.category !== category) return false;
      return true;
    });
    const map = new Map<string, CalendarEvent[]>();
    for (const e of filtered) {
      const key = formatKstDate(e.scheduledAt);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [section, market, importance, category]);

  const categories: (EventCategory | 'all')[] = ['all', ...(Object.keys(EVENT_CATEGORY_LABEL) as EventCategory[])];

  return (
    <div className="pt-2">
      <h1 className="px-3 pt-1 text-lg font-bold text-fg-strong">경제 캘린더</h1>
      <p className="mt-0.5 px-3 text-[11px] break-keep text-muted">
        모든 시각은 KST 기준입니다. 고른 시장의 일정과, 어느 한 시장에 묶이지 않는 글로벌 일정을 함께 보여줍니다.
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
            grouped.length === 0 ? (
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
