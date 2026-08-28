'use client';

/** 홈 — 관심 가격과 주요 지수. 관심목록을 먼저, 그 다음 홈 표시 항목 순서대로. */

import Link from 'next/link';
import { useMemo } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useSettings } from '@/components/providers/SettingsProvider';
import { SectionGate, SkeletonCard, EmptyState } from '@/components/ui/States';
import { PriceCard } from './PriceCard';
import { marketColor } from '@/lib/scale';
import { MARKET_IDS, MARKET_LABEL, type Quote } from '@/types';

const MAX_ON_HOME = 8;

export function HomePrices() {
  const { snapshot, refresh } = useData();
  const { settings } = useSettings();
  const section = snapshot?.sections.quotes ?? null;

  const ordered = useMemo(() => {
    if (!section?.data) return [];
    const all = new Map<string, Quote>();
    for (const m of MARKET_IDS) for (const q of section.data[m] ?? []) all.set(q.id, q);

    const ids: string[] = [];
    for (const id of settings.watchlist) if (all.has(id)) ids.push(id);
    for (const id of settings.homeItems) if (all.has(id) && !ids.includes(id)) ids.push(id);
    return ids.slice(0, MAX_ON_HOME).map((id) => all.get(id) as Quote);
  }, [section, settings.watchlist, settings.homeItems]);

  return (
    <section aria-labelledby="home-prices-title" className="mt-5 px-3">
      <div className="mb-2">
        <h2 id="home-prices-title" className="text-base font-bold text-fg-strong">
          관심 가격과 주요 지수
        </h2>
        {/* 시장별 전체 지수·종목 목록으로 들어가는 길.
            시장 탭을 없앤 뒤로 들어갈 곳이 심리 카드의 버튼 하나뿐이라
            지수 목록을 찾기 어려웠다. 세 시장을 여기 나란히 세워 둔다. */}
        <nav aria-label="시장별 전체 목록" className="mt-1.5 flex flex-wrap gap-1.5">
          {MARKET_IDS.map((m) => (
            <Link
              key={m}
              href={`/market/${m}`}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors hover:bg-surface-2"
              style={{
                borderColor: `color-mix(in srgb, ${marketColor(m)} 40%, var(--border))`,
                color: marketColor(m),
              }}
            >
              <span
                aria-hidden="true"
                className="block h-[6px] w-[6px] rounded-full"
                style={{ background: marketColor(m) }}
              />
              {MARKET_LABEL[m]} 지수 전체 →
            </Link>
          ))}
        </nav>
      </div>

      <SectionGate
        section={section}
        onRetry={refresh}
        loading={
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonCard key={i} height={44} lines={1} />
            ))}
          </div>
        }
        empty={<EmptyState title="표시할 가격이 없습니다" description="더보기 → 표시 항목에서 종목을 추가해 보세요." />}
      >
        {() =>
          ordered.length === 0 ? (
            <EmptyState
              title="선택된 항목이 없습니다"
              description="관심목록에 종목을 추가하거나 더보기에서 홈 표시 항목을 설정하세요."
              action={
                <Link href="/more" className="mt-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-fg">
                  표시 항목 설정
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {ordered.map((q) => (
                <PriceCard key={q.id} quote={q} />
              ))}
            </div>
          )
        }
      </SectionGate>
    </section>
  );
}
