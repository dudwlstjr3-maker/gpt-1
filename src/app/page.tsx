'use client';

import { useData } from '@/components/providers/DataProvider';
import { FngSection } from '@/components/market/FngSection';
import { RegimeBoardCard } from '@/components/market/RegimeBoard';
import { HomePrices } from '@/components/market/HomePrices';
import { HeatBoard } from '@/components/market/HeatBoard';
import { TodayLine } from '@/components/market/TodayLine';
import { HomePlazaCard } from '@/components/plaza/HomePlazaCard';
import { SummaryCard } from '@/components/market/SummaryCard';
import { RiskAlertLine } from '@/components/market/RiskAlertLine';
import { HomeLower } from '@/components/market/HomeLower';
import { ErrorState } from '@/components/ui/States';

export default function HomePage() {
  const { snapshot, initialLoading, error, refresh } = useData();

  if (snapshot?.fatalError) {
    return (
      <div className="px-3 pt-4">
        <ErrorState
          title="전체 데이터를 불러오지 못했습니다"
          message={snapshot.fatalError}
          onRetry={refresh}
        />
        <p className="mt-3 text-[12.5px] text-muted">
          더보기 → DEMO 시나리오에서 다른 상태로 전환할 수 있습니다.
        </p>
      </div>
    );
  }

  if (!snapshot && !initialLoading && error) {
    return (
      <div className="px-3 pt-4">
        <ErrorState title="서버에 연결하지 못했습니다" message={error} onRetry={refresh} />
      </div>
    );
  }

  // 2026-11-28 토스증권 느낌 — 단계 색 빛 번짐을 걷어 바탕은 평평하다. 단계 색은 카드 안 계기판에만
  return (
    <div className="mood-home pt-2">
      <h1 className="sr-only">쫄탐일보 홈 — 미국·한국 투자심리 요약</h1>
      <FngSection />
      <RiskAlertLine />
      <TodayLine />
      {/* 쫄탐광장 들어가는 문 (2026-11-26) — 다음 거래일 맞히기 */}
      <HomePlazaCard />
      <details className="home-fold">
        <summary>시세와 시장 흐름</summary>
        <RegimeBoardCard />
        <HomePrices />
        <HeatBoard />
        <SummaryCard />
      </details>
      <details className="home-fold">
        <summary>일정과 뉴스</summary>
        <HomeLower />
      </details>
    </div>
  );
}
