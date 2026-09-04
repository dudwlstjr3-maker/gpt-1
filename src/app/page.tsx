'use client';

/**
 * 홈 — 권장 순서대로 배치.
 *  1) 시장 상태와 업데이트 시각 (상단 상태바, AppShell)
 *  2) Fear & Greed 카드 3개
 *  3) 관심 가격과 주요 지수
 *  4) 오늘의 시장 요약
 *  5) 금리·환율·변동성
 *
 * 요약까지가 "10초 안에 파악"이고, 그 아래는 탭으로 나눠 한 번에 하나만 본다.
 *  6) 일정 / 자금·뉴스 / 예측시장 / 경제 이야기
 */

import { useData } from '@/components/providers/DataProvider';
import { FngSection } from '@/components/market/FngSection';
import { RegimeBoardCard } from '@/components/market/RegimeBoard';
import { HomePrices } from '@/components/market/HomePrices';
import { SummaryCard } from '@/components/market/SummaryCard';
import { RiskSevenSection } from '@/components/market/RiskSeven';
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
        <p className="mt-3 text-[11px] text-muted">
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

  return (
    <div className="pt-2">
      <h1 className="sr-only">Market Mood 3 홈 — 미국·한국·크립토 투자심리 요약</h1>
      <FngSection />
      {/* 공포·탐욕이 "요즘 분위기(1년)" 라면 전광판은 "지금이 20년 중 어디인가" 다.
          같은 질문이 아니라서 나란히 둔다. */}
      <RegimeBoardCard />
      <RiskSevenSection />
      <HomePrices />

      <SummaryCard />

      {/* 요약 아래는 탭으로 나눈다.
          2열로 갈라 놓았더니 두 열의 길이가 달라 왼쪽 아래가 크게 비었고,
          모바일에서는 끝까지 내리는 데만 5,700px 이 넘었다. */}
      <HomeLower />
    </div>
  );
}
