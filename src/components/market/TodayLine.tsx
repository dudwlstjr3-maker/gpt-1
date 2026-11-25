'use client';

/**
 * 오늘의 한 줄 — 홈의 미국 쫄탐 카드 바로 아래.
 *
 * 접힌 '시세와 시장 흐름' 안에 있는 것들 — 불타는 것과 얼어붙은 것, 위험 신호등 — 에서
 * 오늘 가장 할 말이 있는 것만 뽑아 첫 화면에 세운다. 심리 점수는 뽑지 않는다:
 * 바로 위 카드가 전일 변화까지 이미 말한다 (2026-11-25, 같은 말 두 번 없애기).
 *
 * 문장을 짓는 규칙은 src/lib/todayLine.mjs 에 있다. 여기는 그것을 그리기만 한다.
 * 할 말이 없으면 줄 자체를 그리지 않는다 — 빈 자리를 문장으로 메우면 매일
 * 무슨 일이 있는 것처럼 보이고, 그러면 진짜 무슨 일이 있는 날을 놓친다.
 */

import { useMemo } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { pickHeat } from '@/lib/heatRank.mjs';
import { todayLine } from '@/lib/todayLine.mjs';
import { INDEX_MARKET_IDS, type MarketId } from '@/types';

/** 값이 있는 것만 고른다. 지표·통계(펀딩비·청산 규모)는 '종목' 이 아니라 뺀다. */
const TRADABLE = new Set(['equity', 'index', 'crypto', 'commodity']);

export function TodayLine() {
  const { snapshot } = useData();

  const line = useMemo(() => {
    if (!snapshot) return null;
    const quotes = snapshot.sections.quotes?.data ?? null;
    const picks = quotes
      ? INDEX_MARKET_IDS.flatMap((m: MarketId) => {
          const board = pickHeat((quotes[m] ?? []).filter((q) => TRADABLE.has(q.kind)));
          return board ? [board.top, board.bottom] : [];
        })
      : [];
    return todayLine({
      /*
       * 심리 마디는 넘기지 않는다 (2026-11-25).
       * 이 줄은 이제 미국 쫄탐 카드 **바로 아래** 있고, 그 카드가 "어제보다 공포가 5.5점 풀렸어요" 를
       * 이미 말한다. 여기서 "미국 투자심리가 어제보다 5.5점 탐욕 쪽으로 갔고" 를 또 하면 같은 말 두 번이다.
       * 카드에 없는 것 — 크게 움직인 종목, 경고 — 만 남긴다.
       */
      scores: null,
      picks,
      indicators: snapshot.sections.risk?.data?.indicators ?? null,
    });
  }, [snapshot]);

  if (!line) return null;

  return (
    <p className="mt-4 px-3 text-[15px] leading-relaxed break-keep text-fg-strong">
      <span aria-hidden="true" className="mr-1 text-accent">
        —
      </span>
      {line}
    </p>
  );
}
