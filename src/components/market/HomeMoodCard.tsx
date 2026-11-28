import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ModeBadge } from '@/components/ui/Badge';
import { MoodGauge } from '@/components/charts/MoodGauge';
import { homeMood } from '@/lib/homeMood.mjs';
import { overlayChips } from '@/lib/overlayChips.mjs';
import { scoreColor } from '@/lib/scale';
import { formatKstTime } from '@/lib/format';
import type { DataMode, FngScore } from '@/types';

/**
 * 심리 상세에서 "오늘 왜 움직였나" 가 적힌 절(점수 상승·하락 기여도)의 제목 id.
 * 홈의 '이유 보기' 가 이리로 바로 간다 — 그 절은 데이터를 받은 뒤에 그려지므로
 * 스크롤은 HashScroll(components/nav) 이 맡는다.
 */
export const REASON_ANCHOR = 'fng-contrib-title';

/** 홈의 두 칩을 누르면 심리 상세의 '점수 추이' 차트로 간다 — 거기에 두 가지가 겹쳐 그려져 있다 */
export const CHART_ANCHOR = 'fng-chart-title';

/**
 * 홈 1면 카드. 계기판 · 점수 · 전일 변화는 심리 상세와 **같은** MoodGauge 가 그린다.
 * 이 카드가 더하는 것은 틀(카드 · 머리말 · DEMO 배지)과 아래 링크뿐이다.
 */
export function HomeMoodCard({ score, mode }: { score: FngScore; mode: DataMode }) {
  const mood = homeMood(score.score, score.deltaDay);
  const style = { '--ink': scoreColor(mood?.score) } as CSSProperties;
  const chips = overlayChips(score.overlayNow);
  return (
    <article className="card mood-cover" style={style} aria-label="미국 쫄탐지수">
      <header><h3>미국 쫄탐지수</h3><ModeBadge mode={mode} size="xs" /></header>
      <MoodGauge score={score.score} deltaDay={score.deltaDay} />
      {!mood && <p className="mood-na-why">{score.unavailableReason ?? '점수를 계산할 데이터가 부족합니다.'}</p>}
      {/* 함께 보는 두 가지 — 지금 상태를 적는 사실이지 사고팔 신호가 아니다. 누르면 겹쳐 그린 차트로 */}
      {chips && (
        <Link className="mood-chips" href={`/fng/us#${CHART_ANCHOR}`}>
          {chips.map((c) => (
            <span key={c.id} className="mood-chip" data-chip={c.id} role="img" aria-label={c.aria}>
              <small>{c.label}</small>
              <b>
                {c.glyph && <span aria-hidden="true">{c.glyph} </span>}
                {c.value}
              </b>
              {c.sub && <span className="mood-chip-sub">{c.sub}</span>}
            </span>
          ))}
          <span className="mood-chips-go" aria-hidden="true">›</span>
          <span className="mood-vh">— 쫄탐지수 차트에 겹쳐 보기</span>
        </Link>
      )}
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
