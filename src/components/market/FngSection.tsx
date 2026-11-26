'use client';

/**
 * 오늘의 쫄탐 — 1면.
 *
 * 쫄탐일보는 미국 신문이다 (2026-11-24 리밸런싱).
 *
 * 예전에는 미국·크립토 두 장을 옆으로 미는 줄이었고, 그다음엔 크립토가 카드 밑 한 줄로
 * 내려왔다. 이제 크립토는 앱에서 뺐다 (2026-11-26 사용자: "관심없다"). 1면은 미국 한 장이다.
 *
 * 한국은 여기 없다. 심리 점수를 낼 데이터가 없어서다(types/index.ts 의 MARKET_IDS
 * 주석). 한국의 자리는 아래 가격 지면에서 지수 · 환율 · 종목으로 키웠다.
 */

import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, Notice } from '@/components/ui/States';
import { HomeMoodCard } from './HomeMoodCard';

export function FngSection() {
  const { snapshot, refresh } = useData();
  const section = snapshot?.sections.fng ?? null;
  const mode = snapshot?.mode ?? 'DEMO';


  return (
    <section aria-labelledby="fng-section-title" className="mt-5">
      <h2 id="fng-section-title" className="sr-only">오늘의 쫄탐</h2>
      <SectionGate
        section={section}
        onRetry={refresh}
        loading={
          <div className="px-3">
            <SkeletonCard height={230} lines={2} />
          </div>
        }
      >
        {(scores) => {
          const lead = scores.find((s) => s.market === 'us');
          return (
            <div className="px-3">
              {lead ? <HomeMoodCard score={lead} mode={mode} /> : <Notice tone="neutral">미국 쫄탐지수 · 산출 불가</Notice>}
            </div>
          );
        }}
      </SectionGate>

    </section>
  );
}
