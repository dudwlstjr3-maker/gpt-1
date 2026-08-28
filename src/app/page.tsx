'use client';

/**
 * 홈 — 권장 순서대로 배치.
 *  1) 시장 상태와 업데이트 시각 (상단 상태바, AppShell)
 *  2) Fear & Greed 카드 3개
 *  3) 관심 가격과 주요 지수
 *  4) 오늘의 시장 요약
 *  5) 금리·환율·변동성
 *  6) 오늘의 경제 일정
 *  7) 시장별 자금 흐름과 뉴스
 *  8) 예측시장에서 화제인 질문 (시세가 아니라 별도 칸)
 *  9) 오늘의 경제 상식 (하루 한 가지씩 돌아감)
 */

import { useData } from '@/components/providers/DataProvider';
import { FngSection } from '@/components/market/FngSection';
import { HomePrices } from '@/components/market/HomePrices';
import { SummaryCard } from '@/components/market/SummaryCard';
import { RiskSevenSection } from '@/components/market/RiskSeven';
import { CalendarPreview } from '@/components/market/CalendarList';
import { PredictionSection } from '@/components/market/PredictionSection';
import { DailyBasicCard } from '@/components/market/DailyBasicCard';
import { FlowsNewsSection } from '@/components/market/FlowsNewsSection';
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
      <RiskSevenSection />
      <HomePrices />

      {/* 데스크톱에서는 아래 섹션들을 2열 대시보드로 배치한다 */}
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-2">
        <div>
          <SummaryCard />
          <FlowsNewsSection />
        </div>
        <div>
          <CalendarPreview />
          <PredictionSection />
          <DailyBasicCard />
        </div>
      </div>
    </div>
  );
}
