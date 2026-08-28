'use client';

/**
 * 월 달력.
 *
 * 목록만 있으면 "이번 주에 뭐가 몰려 있나"를 알 수 없다. 한 달을 격자로 펴 놓으면
 * 일정이 몰린 날과 빈 날이 한눈에 보인다. 날짜를 누르면 그날 일정만 아래에 펼친다.
 *
 * 색만으로 중요도를 말하지 않는다. 점의 개수와 색을 함께 쓰고, 각 칸의 스크린리더
 * 라벨에 "일정 3건, 중요 1건"처럼 말로도 적는다.
 */

import { useMemo } from 'react';
import { kstDateKey } from '@/lib/format';
import type { CalendarEvent, EventImportance } from '@/types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const DOT_COLOR: Record<EventImportance, string> = {
  high: 'var(--danger)',
  medium: 'var(--warn)',
  low: 'var(--muted-fg)',
};

/** KST 기준 달력 격자. 앞뒤로 빈 칸을 채워 항상 일요일에서 시작한다. */
function monthGrid(year: number, month: number): (string | null)[] {
  // month 는 1~12. UTC 로 만들되 KST 날짜 키만 쓰므로 시차가 끼어들지 않는다.
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export interface CalendarMonthProps {
  /** 이 달에 그릴 일정 (이미 시장·중요도 필터를 거친 것) */
  events: CalendarEvent[];
  year: number;
  month: number;
  /** 지금 고른 날 (yyyy-mm-dd). 없으면 아무 날도 안 골린 상태 */
  selected: string | null;
  onSelect: (dateKey: string) => void;
  onMonthChange: (year: number, month: number) => void;
  /** 오늘 (yyyy-mm-dd) */
  today: string;
}

export function CalendarMonth({
  events,
  year,
  month,
  selected,
  onSelect,
  onMonthChange,
  today,
}: CalendarMonthProps) {
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = kstDateKey(new Date(e.scheduledAt));
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  const cells = useMemo(() => monthGrid(year, month), [year, month]);

  const step = (delta: number) => {
    const m = month + delta;
    if (m < 1) onMonthChange(year - 1, 12);
    else if (m > 12) onMonthChange(year + 1, 1);
    else onMonthChange(year, m);
  };

  return (
    <div className="card p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="이전 달"
          className="h-7 w-7 rounded-md border border-border text-[13px] text-muted hover:bg-surface-2"
        >
          ‹
        </button>
        <p className="tnum text-[13px] font-bold text-fg-strong">
          {year}년 {month}월
        </p>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="다음 달"
          className="h-7 w-7 rounded-md border border-border text-[13px] text-muted hover:bg-surface-2"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5" role="grid" aria-label={`${year}년 ${month}월 일정 달력`}>
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            role="columnheader"
            className="pb-1 text-center text-[10px] font-semibold"
            style={{ color: i === 0 ? 'var(--danger)' : i === 6 ? 'var(--accent)' : 'var(--subtle-fg)' }}
          >
            {w}
          </div>
        ))}

        {cells.map((key, i) => {
          if (!key) return <div key={`e${i}`} role="gridcell" aria-hidden="true" />;
          const list = byDate.get(key) ?? [];
          const high = list.filter((e) => e.importance === 'high').length;
          const isToday = key === today;
          const isSelected = key === selected;
          const day = Number(key.slice(8));
          const dow = i % 7;

          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              onClick={() => onSelect(key)}
              aria-pressed={isSelected}
              aria-label={
                `${month}월 ${day}일` +
                (isToday ? ' (오늘)' : '') +
                (list.length ? `, 일정 ${list.length}건${high ? `, 중요 ${high}건` : ''}` : ', 일정 없음')
              }
              className="flex min-h-[44px] flex-col items-center rounded-md border py-1 transition-colors"
              style={{
                borderColor: isSelected ? 'var(--accent)' : isToday ? 'var(--border-strong)' : 'transparent',
                background: isSelected
                  ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                  : list.length
                    ? 'var(--surface-2)'
                    : 'transparent',
              }}
            >
              <span
                className="tnum text-[11.5px] leading-none font-semibold"
                style={{
                  color: isSelected
                    ? 'var(--accent)'
                    : dow === 0
                      ? 'var(--danger)'
                      : dow === 6
                        ? 'var(--accent)'
                        : 'var(--fg)',
                }}
              >
                {day}
              </span>
              {isToday ? (
                <span className="mt-0.5 text-[8px] leading-none font-bold text-accent">오늘</span>
              ) : null}

              {/* 색만으로 말하지 않는다. 점 개수가 곧 건수이고, 3건 넘으면 숫자로 적는다. */}
              <span className="mt-auto flex items-center gap-[2px] pt-1" aria-hidden="true">
                {list.slice(0, 3).map((e, k) => (
                  <span
                    key={k}
                    className="block h-[4px] w-[4px] rounded-full"
                    style={{ background: DOT_COLOR[e.importance] }}
                  />
                ))}
                {list.length > 3 ? (
                  <span className="tnum text-[8px] leading-none text-subtle">+{list.length - 3}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-[10px] text-subtle">
        {(['high', 'medium', 'low'] as EventImportance[]).map((imp) => (
          <li key={imp} className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className="block h-[5px] w-[5px] rounded-full"
              style={{ background: DOT_COLOR[imp] }}
            />
            {imp === 'high' ? '중요도 높음' : imp === 'medium' ? '보통' : '낮음'}
          </li>
        ))}
        <li>점 하나가 일정 하나입니다. 날짜를 누르면 그날 일정만 아래에 나옵니다.</li>
      </ul>
    </div>
  );
}
