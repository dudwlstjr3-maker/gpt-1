'use client';

/**
 * 홈 — 권장 순서대로 배치.
 *  1) 시장 상태와 업데이트 시각 (상단 상태바, AppShell)
 *  1.5) 오늘의 한 줄 — 아래 카드들에서 오늘 할 말이 있는 것만 뽑아 첫 화면에
 *  2) Fear & Greed 카드 3개
 *  3) 관심 가격과 주요 지수
 *  4) 오늘의 시장 요약
 *
 * '시장 위험 신호등' 여섯 장은 여기 있었는데 '경제지표' 탭으로 보냈다.
 * 그 블록은 "빨간불은 팔아라가 아니다" 라는 설명을 함께 읽어야 제대로 읽히는데,
 * 설명을 읽어야 읽히는 것은 10초 화면에 맞지 않는다. 대신 빨간불이 켜진 날에는
 * RiskAlertLine 이 맨 위에 한 줄로 뜬다.
 *
 * 요약까지가 "10초 안에 파악"이고, 그 아래는 탭으로 나눠 한 번에 하나만 본다.
 *  6) 일정 / 자금·뉴스 / 예측시장 / 경제 이야기
 */

import { useData } from '@/components/providers/DataProvider';
import { FngSection } from '@/components/market/FngSection';
import { RegimeBoardCard } from '@/components/market/RegimeBoard';
import { HomePrices } from '@/components/market/HomePrices';
import { HeatBoard } from '@/components/market/HeatBoard';
import { TodayLine } from '@/components/market/TodayLine';
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

  return (
    <div className="pt-2">
      <h1 className="sr-only">Market Mood 3 홈 — 미국·한국·크립토 투자심리 요약</h1>
      {/* 아래 카드들에서 오늘 가장 할 말이 있는 것만 뽑은 한 줄. 할 말이 없으면 그리지 않는다. */}
      <TodayLine />
      {/* 빨간불이 켜진 날에만 뜨는 줄. 평소에는 아무것도 그리지 않는다. */}
      <RiskAlertLine />
      <FngSection />
      {/* 공포·탐욕이 "요즘 분위기(1년)" 라면 전광판은 "지금이 20년 중 어디인가" 다.
          같은 질문이 아니라서 나란히 둔다. */}
      <RegimeBoardCard />
      <HomePrices />

      {/* 가격을 훑고 난 다음 자리다. "오늘 무슨 일이 있었나" 를 여섯 칸으로 잡는다. */}
      <HeatBoard />

      <SummaryCard />

      {/* 요약 아래는 탭으로 나눈다.
          2열로 갈라 놓았더니 두 열의 길이가 달라 왼쪽 아래가 크게 비었고,
          모바일에서는 끝까지 내리는 데만 5,700px 이 넘었다. */}
      <HomeLower />
    </div>
  );
}
