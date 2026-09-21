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

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

  /*
   * 탭을 눌러도 화면이 움직이지 않게 자리를 잡아 둔다.
   *
   * 무엇이 문제였나
   *   탭마다 본문 길이가 크게 다르다. 재 보니 모바일에서 기준 192px, 경제 233px,
   *   일정 431px, 예측 775px, 자금 780px 이었다. 짧은 탭으로 옮기면 문서가 그만큼
   *   짧아지는데, 이 탭 줄은 홈 맨 아래에 있어서 누를 때는 이미 페이지 끝 가까이
   *   내려와 있다. 문서가 짧아지면 브라우저가 스크롤을 끝으로 당기고, 그 순간
   *   탭 줄이 화면에서 247px 아래로 미끄러진다. 방금 누른 자리에 다른 것이 와 있다.
   *   "눌렀을 때 화면이 변한다" 는 게 이거였다.
   *
   * 어떻게 막나
   *   문서 길이를 그대로 두면 스크롤이 당겨질 일이 없다. 그래서 지금까지 그려 본
   *   본문 중 가장 긴 것과의 차이만큼 자리를 채운다.
   *
   *   그 자리를 본문 바로 밑에 두면 안 된다. 짧은 탭에서 본문과 하단 고지문 사이가
   *   한 화면쯤 비어 버려서, 그건 그것대로 고장 난 화면이 된다. 그래서 남는 자리는
   *   **문서 맨 끝**(고지문 아래)으로 보낸다. 화면에는 구멍이 생기지 않고 문서
   *   길이만 유지된다.
   *
   *   처음 열었을 때는 지금 탭이 곧 최댓값이라 채울 자리가 없다. 들러 보지 않은
   *   탭의 높이는 세지 않으므로, 일정과 경제만 오가면 자리도 431px 까지만 잡는다.
   */
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyH, setBodyH] = useState(0);
  const [floor, setFloor] = useState(0);
  const widthRef = useRef(0);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    // 값이 늦게 도착해 본문이 자라는 경우까지 따라가야 해서 ResizeObserver 로 본다.
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBodyH(r.height);
      // 폭이 바뀌면 세로도 전부 바뀐다. 옛 최댓값을 들고 있으면 빈 자리만 남는다.
      if (Math.abs(r.width - widthRef.current) > 1) {
        widthRef.current = r.width;
        setFloor(r.height);
        return;
      }
      setFloor((prev) => (r.height > prev ? r.height : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* 채울 자리는 본문 밑이 아니라 문서 맨 끝에 붙인다 (main 의 마지막 자식). */
  const [tail, setTail] = useState<HTMLElement | null>(null);
  useEffect(() => setTail(document.getElementById('main')), []);
  const gap = Math.max(0, Math.round(floor - bodyH));

  return (
    <section aria-labelledby="home-lower-title" className="mt-5">
      <h2 id="home-lower-title" className="sr-only">
        더 살펴보기
      </h2>

      <div className="px-3">
        <SegmentedControl label="더 살펴보기" size="sm" full value={tab} onChange={setTab} options={TABS} />
      </div>

      {/* flow-root — 탭마다 첫 카드의 위 여백이 달라서(20px / 12px), 그 여백이 상자
          밖으로 빠져나가면 재 둔 높이와 실제 문서 길이가 어긋난다. */}
      <div ref={bodyRef} className="flow-root">
        {/* 고른 것만 그린다. 감춰 두기만 하면 화면에는 안 보여도
            스크린리더와 탭 이동에는 그대로 남아 길이가 줄지 않는다. */}
        {tab === 'calendar' ? <CalendarPreview /> : null}
        {tab === 'flows' ? <FlowsNewsSection /> : null}
        {tab === 'prediction' ? <PredictionSection /> : null}
        {tab === 'basics' ? <DailyBasicCard /> : null}
        {tab === 'criteria' ? <CriteriaSummaryCard /> : null}
      </div>

      {tail && gap > 0 ? createPortal(<div aria-hidden="true" style={{ height: gap }} />, tail) : null}
    </section>
  );
}
