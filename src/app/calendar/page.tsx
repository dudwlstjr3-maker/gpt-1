'use client';

/** 경제 캘린더 — 국가·중요도·카테고리 필터, 날짜별 그룹. */

import { useMemo, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, EmptyState } from '@/components/ui/States';
import { SegmentedControl } from '@/components/ui/Controls';
import { EventRow } from '@/components/market/CalendarList';
import { useNow } from '@/lib/useNow';
import { formatKstDate } from '@/lib/format';
import { EVENT_CATEGORY_LABEL, type CalendarEvent, type EventCategory } from '@/types';

type CountryFilter = 'all' | 'US' | 'KR' | 'GLOBAL';
type ImportanceFilter = 'all' | 'high' | 'medium';

export default function CalendarPage() {
  const { snapshot, refresh } = useData();
  const now = useNow(30_000);
  const [country, setCountry] = useState<CountryFilter>('all');
  const [importance, setImportance] = useState<ImportanceFilter>('all');
  const [category, setCategory] = useState<EventCategory | 'all'>('all');

  const section = snapshot?.sections.calendar ?? null;

  const grouped = useMemo(() => {
    const events = section?.data ?? [];
    const filtered = events.filter((e) => {
      if (country !== 'all' && e.country !== country) return false;
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
  }, [section, country, importance, category]);

  const categories: (EventCategory | 'all')[] = ['all', ...(Object.keys(EVENT_CATEGORY_LABEL) as EventCategory[])];

  return (
    <div className="pt-2">
      <h1 className="px-3 pt-1 text-lg font-bold text-fg-strong">경제 캘린더</h1>
      <p className="mt-0.5 px-3 text-[11px] text-muted">모든 시각은 KST 기준입니다.</p>

      <div className="mt-3 space-y-2 px-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="국가"
            size="xs"
            value={country}
            onChange={setCountry}
            options={[
              { value: 'all', label: '전체' },
              { value: 'US', label: '미국' },
              { value: 'KR', label: '한국' },
              { value: 'GLOBAL', label: '글로벌' },
            ]}
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
