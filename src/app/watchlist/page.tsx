'use client';

/** 관심목록 — 추가/삭제, 순서 변경, 홈 표시 여부. */

import Link from 'next/link';
import { useMemo } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useSettings } from '@/components/providers/SettingsProvider';
import { SectionGate, SkeletonCard, EmptyState } from '@/components/ui/States';
import { PriceCard } from '@/components/market/PriceCard';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { INDEX_MARKET_IDS, MARKET_LABEL, type Quote } from '@/types';

export default function WatchlistPage() {
  const { snapshot, refresh } = useData();
  const { settings, update, toggleWatch } = useSettings();
  const section = snapshot?.sections.quotes ?? null;

  const quotes = useMemo(() => {
    const all = new Map<string, Quote>();
    if (section?.data) for (const m of INDEX_MARKET_IDS) for (const q of section.data[m] ?? []) all.set(q.id, q);
    return settings.watchlist.map((id) => all.get(id)).filter((q): q is Quote => q !== undefined);
  }, [section, settings.watchlist]);

  const move = (id: string, dir: -1 | 1) => {
    const list = [...settings.watchlist];
    const i = list.indexOf(id);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    update({ watchlist: list });
  };

  return (
    <div className="pt-2">
      <div className="flex items-baseline justify-between gap-2 px-3 pt-1">
        <h1 className="text-lg font-bold text-fg-strong">관심목록</h1>
        <Link href="/market/us" className="text-[12.5px] font-semibold text-accent hover:underline">
          종목 추가 →
        </Link>
      </div>

      {settings.watchlist.length === 0 ? (
        <div className="mt-4 px-3">
          <EmptyState
            title="관심목록이 비어 있습니다"
            description="시장 화면에서 카드의 ☆ 를 눌러 추가하세요. 관심목록 항목은 홈 화면 상단에 먼저 표시됩니다."
            action={
              <Link href="/market/us" className="mt-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-fg">
                시장 화면으로 이동
              </Link>
            }
          />
        </div>
      ) : (
        <>
          {/* 순서 편집 */}
          <section aria-labelledby="watch-order-title" className="mt-3 px-3">
            <h2 id="watch-order-title" className="mb-1.5 text-[13px] font-bold text-muted">
              표시 순서
            </h2>
            <ul className="card divide-y divide-[var(--border)] overflow-hidden">
              {settings.watchlist.map((id, idx) => {
                const item = CATALOG_BY_ID.get(id);
                return (
                  <li key={id} className="flex items-center gap-2 px-3 py-2">
                    <span className="tnum w-5 shrink-0 text-[12.5px] text-subtle">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-fg">{item?.name ?? id}</p>
                      <p className="text-[11.5px] text-subtle">
                        {item ? `${MARKET_LABEL[item.market]} · ${item.symbol}` : '카탈로그에 없는 항목'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(id, -1)}
                        disabled={idx === 0}
                        aria-label={`${item?.name ?? id} 위로 이동`}
                        className="h-10 w-10 rounded-md border border-border text-[13px] text-muted disabled:opacity-35"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(id, 1)}
                        disabled={idx === settings.watchlist.length - 1}
                        aria-label={`${item?.name ?? id} 아래로 이동`}
                        className="h-10 w-10 rounded-md border border-border text-[13px] text-muted disabled:opacity-35"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleWatch(id)}
                        aria-label={`${item?.name ?? id} 관심목록에서 제거`}
                        className="h-10 w-10 rounded-md border border-border text-[13px]"
                        style={{ color: 'var(--danger)' }}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="watch-quotes-title" className="mt-4 px-3">
            <h2 id="watch-quotes-title" className="mb-1.5 text-[13px] font-bold text-muted">
              현재 시세
            </h2>
            <SectionGate
              section={section}
              onRetry={refresh}
              loading={
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {[0, 1, 2].map((i) => (
                    <SkeletonCard key={i} height={44} lines={1} />
                  ))}
                </div>
              }
            >
              {() =>
                quotes.length === 0 ? (
                  <EmptyState title="시세를 찾을 수 없습니다" description="선택한 항목이 현재 응답에 없습니다." />
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {quotes.map((q) => (
                      <PriceCard key={q.id} quote={q} />
                    ))}
                  </div>
                )
              }
            </SectionGate>
          </section>
        </>
      )}
    </div>
  );
}
