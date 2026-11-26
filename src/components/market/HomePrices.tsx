'use client';

/**
 * 홈 — 시세 지면. 미국 → 한국 순으로 **시장별로 묶어** 싣는다. (크립토는 2026-11-26 뺐다)
 *
 * 쫄탐일보는 미국 신문이다 (2026-11-24 리밸런싱). 예전에는 시장 구분 없이 앞에서부터
 * 8칸을 잘랐다. 그러다 보니 카탈로그에 지수 셋 · 환율 · 종목 다섯이 있는 한국이 홈에는
 * 2칸밖에 나오지 않았고, 무엇이 어느 시장인지도 섞여 보였다.
 *
 * 이제 시장마다 실을 칸 수를 정해 둔다 — 미국을 가장 많이, 한국을 그다음.
 * 관심목록에 넣은 것은 그 시장 안에서 앞에 선다. 나머지는 관심목록 화면에 다 있다.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useSettings } from '@/components/providers/SettingsProvider';
import { SectionGate, SkeletonCard, EmptyState } from '@/components/ui/States';
import { PriceCard } from './PriceCard';
import { INDEX_MARKET_IDS, MARKET_LABEL, type MarketId, type Quote } from '@/types';

/** 시장마다 홈에 실을 칸 수. 미리보기(template.html)의 HOME_SLOTS 와 같은 값이다. */
export const HOME_SLOTS: Record<MarketId, number> = { us: 10, kr: 6, crypto: 0 };

export function HomePrices() {
  const { snapshot, refresh } = useData();
  const { settings } = useSettings();
  const section = snapshot?.sections.quotes ?? null;

  const groups = useMemo(() => {
    if (!section?.data) return [];
    // 시장은 응답의 칸(us/kr)으로 정한다 — 그 칸에 담겨 온 것이 그 시장이다.
    const all = new Map<string, { quote: Quote; market: MarketId }>();
    for (const m of INDEX_MARKET_IDS) for (const q of section.data[m] ?? []) all.set(q.id, { quote: q, market: m });

    const ids: string[] = [];
    for (const id of settings.watchlist) if (all.has(id) && !ids.includes(id)) ids.push(id);
    for (const id of settings.homeItems) if (all.has(id) && !ids.includes(id)) ids.push(id);

    return INDEX_MARKET_IDS.map((market) => ({
      market,
      quotes: ids
        .map((id) => all.get(id)!)
        .filter((x) => x.market === market)
        .slice(0, HOME_SLOTS[market])
        .map((x) => x.quote),
    })).filter((g) => g.quotes.length > 0);
  }, [section, settings.watchlist, settings.homeItems]);

  return (
    <section aria-labelledby="home-prices-title" className="mt-5 px-3">
      {/* 지수는 '지수' 탭으로 떼어 놨다. 여기서는 그리로 가는 길만 남긴다.
          설명 두 줄이던 것을 머리 옆 링크 하나로 줄였다 — 홈에서 매번 읽을 문장이 아니다. */}
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="home-prices-title" className="text-base font-bold text-fg-strong">
          관심 가격과 주요 지수
        </h2>
        <Link href="/indices" className="tap shrink-0 text-[12.5px] font-semibold text-accent hover:underline">
          지수 전체 →
        </Link>
      </div>

      <SectionGate
        section={section}
        onRetry={refresh}
        loading={
          <div className="grid grid-cols-1 gap-2 @min-[640px]:grid-cols-2 @min-[1280px]:grid-cols-3">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonCard key={i} height={44} lines={1} />
            ))}
          </div>
        }
        empty={<EmptyState title="표시할 가격이 없습니다" description="더보기 → 표시 항목에서 종목을 추가해 보세요." />}
      >
        {() =>
          groups.length === 0 ? (
            <EmptyState
              title="선택된 항목이 없습니다"
              description="관심목록에 종목을 추가하거나 더보기에서 홈 표시 항목을 설정하세요."
              action={
                <Link href="/more" className="mt-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-fg">
                  표시 항목 설정
                </Link>
              }
            />
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.market} role="group" aria-labelledby={`home-prices-${g.market}`}>
                  <h3 id={`home-prices-${g.market}`} className="mb-2 text-[12.5px] font-semibold text-muted">
                    {MARKET_LABEL[g.market]}
                  </h3>
                  <div className="grid grid-cols-1 gap-2 @min-[640px]:grid-cols-2 @min-[1280px]:grid-cols-3">
                    {g.quotes.map((q) => (
                      <PriceCard key={q.id} quote={q} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </SectionGate>
    </section>
  );
}
