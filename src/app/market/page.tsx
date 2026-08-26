'use client';

/** 시장 화면 — 미국 / 한국 / 크립토 탭. */

import { useMemo, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useSettings } from '@/components/providers/SettingsProvider';
import { Tabs, SegmentedControl } from '@/components/ui/Controls';
import { SectionGate, SkeletonCard, EmptyState, Notice } from '@/components/ui/States';
import { PriceCard } from '@/components/market/PriceCard';
import { FngCard } from '@/components/market/FngCard';
import { formatKoreanCompact, NO_VALUE } from '@/lib/format';
import { useChangeColor } from '@/components/market/useChangeColor';
import { MARKET_IDS, MARKET_LABEL, type MarketId, type Quote } from '@/types';

type SortKey = 'default' | 'gain' | 'loss' | 'name';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'default', label: '기본' },
  { value: 'gain', label: '상승순' },
  { value: 'loss', label: '하락순' },
  { value: 'name', label: '이름순' },
];

function sortQuotes(list: Quote[], key: SortKey): Quote[] {
  const copy = [...list];
  if (key === 'name') return copy.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  if (key === 'gain') return copy.sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));
  if (key === 'loss') return copy.sort((a, b) => (a.changePct ?? Infinity) - (b.changePct ?? Infinity));
  return copy;
}

export default function MarketPage() {
  const { snapshot, refresh } = useData();
  const { settings } = useSettings();
  const flowColor = useChangeColor();
  const [market, setMarket] = useState<MarketId>('us');
  const [sort, setSort] = useState<SortKey>('default');
  const [onlyWatched, setOnlyWatched] = useState(false);

  const quotesSection = snapshot?.sections.quotes ?? null;
  const fng = snapshot?.sections.fng.data?.find((f) => f.market === market) ?? null;
  const flows = snapshot?.sections.flows.data ?? null;

  const list = useMemo(() => {
    const raw = quotesSection?.data?.[market] ?? [];
    const filtered = onlyWatched ? raw.filter((q) => settings.watchlist.includes(q.id)) : raw;
    return sortQuotes(filtered, sort);
  }, [quotesSection, market, sort, onlyWatched, settings.watchlist]);

  return (
    <div className="pt-2">
      <h1 className="px-3 pt-1 text-lg font-bold text-fg-strong">시장</h1>

      <div className="mt-2 px-3">
        <Tabs
          label="시장 선택"
          value={market}
          onChange={setMarket}
          options={MARKET_IDS.map((m) => ({ value: m, label: MARKET_LABEL[m] }))}
        />
      </div>

      {/* 데스크톱에서는 좌측에 심리 카드, 우측에 시세 목록을 두는 다중 열 구성 */}
      <div className="mt-3 px-3 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-4">
        <div className="lg:sticky lg:top-32 lg:space-y-3">
          {fng && snapshot ? <FngCard score={fng} mode={snapshot.mode} /> : <SkeletonCard height={140} lines={2} />}

          {/* 한국 전용: 투자자별 수급 요약 */}
          {market === 'kr' ? (
            <div className="card mt-3 p-3 lg:mt-0">
            <h2 className="mb-1.5 text-sm font-bold text-fg-strong">투자자별 당일 순매수</h2>
            {flows ? (
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['외국인', flows.foreign],
                    ['기관', flows.institution],
                    ['개인', flows.individual],
                  ] as const
                ).map(([label, v]) => {
                  const color = flowColor.color(v);
                  return (
                    <div key={label} className="rounded-lg bg-surface-2 p-2 text-center">
                      <p className="text-[10px] text-muted">{label}</p>
                      <p className="tnum mt-0.5 text-[13px] font-bold" style={{ color }}>
                        {v === null ? NO_VALUE : `${v > 0 ? '+' : '-'}${formatKoreanCompact(Math.abs(v) * 1e8, 1)}원`}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Notice tone="warn">투자자별 매매동향 데이터를 받지 못했습니다.</Notice>
            )}
            </div>
          ) : null}
        </div>

        <div className="mt-4 lg:mt-0">
          {/* 필터 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentedControl label="정렬" size="xs" value={sort} onChange={setSort} options={SORT_OPTIONS} />
            <button
              type="button"
              onClick={() => setOnlyWatched((v) => !v)}
              aria-pressed={onlyWatched}
              className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold"
              style={{
                background: onlyWatched ? 'var(--surface-3)' : 'var(--surface-2)',
                color: onlyWatched ? 'var(--accent)' : 'var(--muted-fg)',
              }}
            >
              {onlyWatched ? '★ 관심만 보는 중' : '☆ 관심만 보기'}
            </button>
          </div>

          <div className="mt-2">
        <SectionGate
          section={quotesSection}
          onRetry={refresh}
          loading={
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <SkeletonCard key={i} height={44} lines={1} />
              ))}
            </div>
          }
          empty={<EmptyState title="시세 데이터가 없습니다" />}
        >
          {() =>
            list.length === 0 ? (
              <EmptyState
                title={onlyWatched ? '관심목록에 담긴 항목이 없습니다' : '표시할 항목이 없습니다'}
                description={onlyWatched ? '카드의 ☆ 를 눌러 관심목록에 추가하세요.' : undefined}
              />
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((q) => (
                  <PriceCard key={q.id} quote={q} />
                ))}
              </div>
            )
          }
            </SectionGate>
          </div>
        </div>
      </div>
    </div>
  );
}
