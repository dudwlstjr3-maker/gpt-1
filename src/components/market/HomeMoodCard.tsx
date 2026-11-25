import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ModeBadge } from '@/components/ui/Badge';
import { MoodGauge } from '@/components/charts/MoodGauge';
import { homeMood } from '@/lib/homeMood.mjs';
import { scoreColor } from '@/lib/scale';
import { formatKstTime } from '@/lib/format';
import type { DataMode, FngScore } from '@/types';

/**
 * 심리 상세에서 "오늘 왜 움직였나" 가 적힌 절(점수 상승·하락 기여도)의 제목 id.
 * 홈의 '이유 보기' 가 이리로 바로 간다 — 그 절은 데이터를 받은 뒤에 그려지므로
 * 스크롤은 HashScroll(components/nav) 이 맡는다.
 */
export const REASON_ANCHOR = 'fng-contrib-title';

/**
 * 홈 1면 카드. 계기판 · 점수 · 전일 변화는 심리 상세와 **같은** MoodGauge 가 그린다.
 * 이 카드가 더하는 것은 틀(카드 · 머리말 · DEMO 배지)과 아래 링크뿐이다.
 */
export function HomeMoodCard({ score, mode }: { score: FngScore; mode: DataMode }) {
  const mood = homeMood(score.score, score.deltaDay);
  const style = { '--ink': scoreColor(mood?.score) } as CSSProperties;
  return (
    <article className="card mood-cover p-3" style={style} aria-label="미국 쫄탐지수">
      <header><h3>미국 쫄탐지수</h3><ModeBadge mode={mode} size="xs" /></header>
      <MoodGauge score={score.score} deltaDay={score.deltaDay} />
      {!mood && <p className="mood-na-why">{score.unavailableReason ?? '점수를 계산할 데이터가 부족합니다.'}</p>}
      <footer>
        <span>자체 산출 · {formatKstTime(score.computedAt)}</span>
        {mood ? (
          <Link href={`/fng/us#${REASON_ANCHOR}`} aria-label="미국 쫄탐지수가 움직인 이유 보기">이유 보기 →</Link>
        ) : (
          <Link href="/fng/us">심리 상세 →</Link>
        )}
      </footer>
    </article>
  );
}
