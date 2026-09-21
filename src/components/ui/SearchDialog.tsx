'use client';

/**
 * 찾기 창.
 *
 * 여는 법: 상단 돋보기, 또는 Ctrl+K (맥은 ⌘K).
 * 닫는 법: Esc, 바깥 누르기, 항목 고르기.
 *
 * 무엇을 찾나
 *   종목·지수는 카탈로그에서, 위험 지표와 생활 경제 지수는 지금 받아 둔
 *   스냅샷에서, 용어는 용어집에서 모은다. 바깥에 물어보지 않는다.
 *
 * 왜 문서 맨 위로 옮겨 그리나 (createPortal)
 *   본문(main)이 배치 분기의 기준 칸이라 그 안의 position:fixed 는 화면이 아니라
 *   그 칸을 기준으로 붙는다. 창을 제자리에서 그리면 뒷배경이 본문 크기만큼만
 *   덮인다. 큰 그림 창(ChartModal)과 같은 이유다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useData } from '@/components/providers/DataProvider';
import { CATALOG } from '@/lib/catalog';
import { TERMS } from '@/lib/terms';
import { searchEntries } from '@/lib/search.mjs';
import type { SearchEntry } from '@/lib/search.d.mts';
import { MARKET_LABEL } from '@/types';

/** 탭과 화면 — 이름을 아는 사람이 바로 가는 길 */
const SCREENS: SearchEntry[] = [
  { id: 'scr-home', kind: 'screen', name: '홈', sub: '오늘의 한 줄과 투자심리', href: '/' },
  { id: 'scr-indices', kind: 'screen', name: '시장 지수', sub: '미국 · 한국 · 크립토', href: '/indices' },
  { id: 'scr-basics', kind: 'screen', name: '생활 경제 지수', sub: '나라 살림과 소득', href: '/basics' },
  { id: 'scr-indicators', kind: 'screen', name: '경제 · 위험 지표', sub: '위험 신호등', href: '/indicators' },
  { id: 'scr-calendar', kind: 'screen', name: '경제 캘린더', sub: '발표 일정', href: '/calendar' },
  { id: 'scr-watchlist', kind: 'screen', name: '관심목록', sub: '별표한 것들', href: '/watchlist' },
  { id: 'scr-futures', kind: 'screen', name: '선물 시장', sub: '인도월 곡선', href: '/futures' },
  { id: 'scr-regime', kind: 'screen', name: '국면 전광판', sub: '20년 중 지금 어디', href: '/regime' },
  { id: 'scr-alerts', kind: 'screen', name: '알림 설정', sub: '조건과 기준', href: '/alerts' },
  { id: 'scr-criteria', kind: 'screen', name: '내 기준', sub: '내가 정한 판단 기준', href: '/criteria' },
];

const KIND_LABEL: Record<SearchEntry['kind'], string> = {
  quote: '종목 · 시세',
  index: '지수',
  risk: '위험 지표',
  basic: '생활 경제 지수',
  term: '용어',
  screen: '화면',
};

const KIND_ORDER: SearchEntry['kind'][] = ['quote', 'index', 'risk', 'basic', 'term', 'screen'];

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { snapshot } = useData();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => setMounted(true), []);

  /** 찾을 것들을 한 자리에 모은다 */
  const entries = useMemo<SearchEntry[]>(() => {
    const out: SearchEntry[] = [];

    for (const c of CATALOG) {
      out.push({
        id: `q-${c.id}`,
        kind: c.kind === 'index' ? 'index' : 'quote',
        name: c.name,
        symbol: c.symbol,
        sub: `${MARKET_LABEL[c.market]} · ${c.symbol}`,
        href: `/asset/${c.id}`,
      });
    }

    for (const i of snapshot?.sections.risk?.data?.indicators ?? []) {
      out.push({ id: `r-${i.id}`, kind: 'risk', name: i.name, sub: i.term ?? undefined, href: '/indicators' });
    }

    for (const b of snapshot?.sections.basics?.data ?? []) {
      out.push({ id: `b-${b.id}`, kind: 'basic', name: b.name, sub: b.plainName, href: '/basics' });
    }

    for (const [id, t] of Object.entries(TERMS)) {
      out.push({ id: `t-${id}`, kind: 'term', name: t.term, sub: t.plain, href: '/more' });
    }

    return out.concat(SCREENS);
  }, [snapshot]);

  const hits = useMemo(() => (query ? searchEntries(entries, query, 14) : SCREENS.slice(0, 6)), [entries, query]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const go = useCallback(
    (entry: SearchEntry) => {
      onClose();
      router.push(entry.href);
    },
    [onClose, router],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, hits.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === 'Enter') {
        const hit = hits[cursor];
        if (hit) {
          e.preventDefault();
          go(hit);
        }
      }
    },
    [hits, cursor, go, onClose],
  );

  // 고른 자리가 창 밖으로 나가지 않게 따라 굴린다
  useEffect(() => {
    listRef.current?.querySelector('[data-on="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open || !mounted) return null;

  let lastKind: SearchEntry['kind'] | null = null;
  const ordered = [...hits].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-3 pt-[10vh] backdrop-blur-[2px] motion-safe:animate-[fadeIn_120ms_ease-out]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="찾기"
        onKeyDown={onKeyDown}
        className="card flex max-h-[70vh] w-full max-w-[var(--frame-w)] flex-col overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 py-3">
          <span aria-hidden="true" className="shrink-0 text-muted">
            <SearchGlyph />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="종목 · 지표 · 용어 (초성도 됩니다)"
            aria-label="찾을 말"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-fg-strong outline-none placeholder:text-subtle"
          />
          <button type="button" onClick={onClose} className="btn-quiet shrink-0" aria-label="닫기">
            Esc
          </button>
        </div>

        {ordered.length === 0 ? (
          <p className="border-t border-border px-3 py-6 text-center text-[12.5px] break-keep text-subtle">
            찾는 것이 없습니다. 이 앱 안에 있는 것만 찾습니다 — 종목·지수·지표·용어·화면.
          </p>
        ) : (
          <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto border-t border-border pb-2">
            {ordered.map((entry) => {
              const idx = hits.indexOf(entry);
              const on = idx === cursor;
              const head = entry.kind !== lastKind ? entry.kind : null;
              lastKind = entry.kind;
              return (
                <li key={entry.id}>
                  {head ? (
                    <p className="px-3 pt-3 pb-1 text-[11.5px] font-semibold text-subtle">{KIND_LABEL[head]}</p>
                  ) : null}
                  <button
                    type="button"
                    data-on={on}
                    onMouseEnter={() => setCursor(idx)}
                    onClick={() => go(entry)}
                    className="flex w-full items-baseline gap-2 px-3 py-2 text-left"
                    style={on ? { background: 'var(--surface-2)' } : undefined}
                  >
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg-strong">
                      {entry.name}
                    </span>
                    {entry.sub ? (
                      <span className="shrink-0 truncate text-[11.5px] text-subtle">{entry.sub}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4 4" />
    </svg>
  );
}
