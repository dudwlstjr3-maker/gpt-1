'use client';

/**
 * 홈 아래쪽 — 탭으로 나눈 부분.
 *
 * 예전에는 요약 아래로 일정·자금·뉴스·예측시장·경제 이야기가 전부 세로로 이어져
 * 모바일에서 5,700px 을 넘었다. 데스크톱에서는 2열로 갈라 놨는데 두 열의 길이가
 * 달라 왼쪽 아래에 270px 짜리 빈 자리가 생겼다.
 *
 * 위쪽(심리·위험·가격·요약)은 "10초 안에 파악"에 해당하니 그대로 두고,
 * 그 아래는 한 번에 하나씩만 본다. 죽은 공간도 같이 사라진다.
 *
 * 어느 탭에 있었는지는 기억하지 않는다. 홈은 열자마자 오늘 일정이 보이는 편이
 * 낫고, 마지막에 본 탭이 무엇이었는지는 대체로 기억나지 않기 때문이다.
 */

import { useState } from 'react';
import { SegmentedControl } from '@/components/ui/Controls';
import { CalendarPreview } from './CalendarList';
import { FlowsNewsSection } from './FlowsNewsSection';
import { PredictionSection } from './PredictionSection';
import { DailyBasicCard } from './DailyBasicCard';
import { CriteriaSummaryCard } from './CriteriaSummaryCard';

type Tab = 'calendar' | 'flows' | 'prediction' | 'basics' | 'criteria';

/*
 * 이름이 전부 두 글자인 이유.
 * 칸이 다섯이 되면서 320px 에서 한 칸이 58px 이 됐다. 12px 글자로 네 글자를
 * 넣으면 '예측시 / 장' 처럼 두 줄로 쪼개져 오히려 못 읽는다. 각 탭 안에 제
 * 제목이 다시 나오므로, 여기서는 어느 칸인지만 구분되면 된다.
 */
const TABS: { value: Tab; label: string }[] = [
  { value: 'calendar', label: '일정' },
  { value: 'flows', label: '자금' },
  { value: 'prediction', label: '예측' },
  { value: 'basics', label: '경제' },
  { value: 'criteria', label: '기준' },
];

export function HomeLower() {
  const [tab, setTab] = useState<Tab>('calendar');

  return (
    <section aria-labelledby="home-lower-title" className="mt-5">
      <h2 id="home-lower-title" className="sr-only">
        더 살펴보기
      </h2>

      <div className="px-3">
        <SegmentedControl label="더 살펴보기" size="sm" full value={tab} onChange={setTab} options={TABS} />
      </div>

      {/* 고른 것만 그린다. 감춰 두기만 하면 화면에는 안 보여도
          스크린리더와 탭 이동에는 그대로 남아 길이가 줄지 않는다. */}
      {tab === 'calendar' ? <CalendarPreview /> : null}
      {tab === 'flows' ? <FlowsNewsSection /> : null}
      {tab === 'prediction' ? <PredictionSection /> : null}
      {tab === 'basics' ? <DailyBasicCard /> : null}
      {tab === 'criteria' ? <CriteriaSummaryCard /> : null}
    </section>
  );
}
