'use client';

/** 모바일: 가로 스와이프 카드 / 데스크톱: 3열 그리드 */

import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, Notice } from '@/components/ui/States';
import { FngCard } from './FngCard';
import { MARKET_IDS } from '@/types';
import { SCALE_WARNING_TEXT } from './constants';

export function FngSection() {
  const { snapshot, refresh } = useData();
  const section = snapshot?.sections.fng ?? null;
  const mode = snapshot?.mode ?? 'DEMO';

  return (
    <section aria-labelledby="fng-section-title" className="mt-3">
      <div className="mb-2 flex items-baseline justify-between gap-2 px-3">
        <h2 id="fng-section-title" className="text-base font-bold text-fg-strong">
          시장별 투자심리
        </h2>
        <span className="text-[11px] text-subtle">0=극단적 공포 · 100=극단적 탐욕</span>
      </div>

      <SectionGate
        section={section}
        onRetry={refresh}
        loading={
          <div className="grid grid-cols-1 gap-3 px-3 lg:grid-cols-3">
            {MARKET_IDS.map((m) => (
              <SkeletonCard key={m} height={150} lines={2} />
            ))}
          </div>
        }
      >
        {(scores) => (
          <>
            {/* 모바일: 가로 스와이프 */}
            <div className="snap-row px-3 lg:hidden">
              {scores.map((s) => (
                <div key={s.market} className="snap-item w-[85vw] max-w-[340px]">
                  <FngCard score={s} mode={mode} />
                </div>
              ))}
            </div>
            {/* 데스크톱: 3열 */}
            <div className="hidden gap-3 px-3 lg:grid lg:grid-cols-3">
              {scores.map((s) => (
                <FngCard key={s.market} score={s} mode={mode} />
              ))}
            </div>
          </>
        )}
      </SectionGate>

      <div className="mt-2 px-3">
        <Notice tone="neutral">{SCALE_WARNING_TEXT}</Notice>
      </div>
    </section>
  );
}
