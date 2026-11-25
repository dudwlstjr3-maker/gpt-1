import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ModeBadge } from '@/components/ui/Badge';
import { homeMood } from '@/lib/homeMood.mjs';
import { scoreColor, stageOf } from '@/lib/scale';
import { formatKstTime } from '@/lib/format';
import type { DataMode, FngScore } from '@/types';

/**
 * 심리 상세에서 "오늘 왜 움직였나" 가 적힌 절(점수 상승·하락 기여도)의 제목 id.
 * 홈의 '이유 보기' 가 이리로 바로 간다 — 그 절은 데이터를 받은 뒤에 그려지므로
 * 스크롤은 HashScroll(components/nav) 이 맡는다.
 */
export const REASON_ANCHOR = 'fng-contrib-title';

const oneDecimal = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 1 });

export function HomeMoodCard({ score, mode }: { score: FngScore; mode: DataMode }) {
  const mood = homeMood(score.score, score.deltaDay);
  const stage = stageOf(mood?.score);
  const style = { '--ink': scoreColor(mood?.score) } as CSSProperties;
  return (
    <article className="card mood-cover p-3" style={style} aria-label="미국 쫄탐지수">
      <header><h3>미국 쫄탐지수</h3><ModeBadge mode={mode} size="xs" /></header>
      {mood && stage ? (
        <>
          <svg className="mood-dial" viewBox="0 0 320 168" aria-hidden="true">
            <image href="/mood-dial.svg" width="320" height="168" />
            {/* 어제 위치 — 점선 바늘. 오늘 바늘 밑에 깐다 */}
            {mood.yesterday && (
              <g transform={`rotate(${mood.yesterday.angle} 160 144)`}>
                <path className="mood-ghost" d="M160 140 L160 46" />
              </g>
            )}
            <g transform={`rotate(${mood.angle} 160 144)`}>
              <path d="M156 148 L159 40 Q160 36 161 40 L164 148Z" fill="#fff5d6" stroke="#442f28" />
              <path d="M160 43 L160 141" stroke="#ff9764" strokeWidth="1.5" />
            </g>
            <circle cx="160" cy="144" r="8" fill="#202b38" stroke="#d4dedc" strokeWidth="2" />
          </svg>
          {mood.yesterday && (
            <p className="mood-ghost-key">
              <svg width="18" height="6" aria-hidden="true"><line x1="1" y1="3" x2="17" y2="3" /></svg>
              어제 {oneDecimal(mood.yesterday.value)}
            </p>
          )}
          <div className="mood-reading">
            <strong style={{ fontSize: mood.word ? mood.size : undefined }}>{mood.word ?? stage.label}</strong>
            <span className="mood-score">{mood.score}<small> / 100</small></span>
          </div>
          <p className="mood-change">
            {mood.word && <b>{stage.label}</b>}
            <span className="mood-delta">
              {mood.glyph && <span aria-hidden="true">{mood.glyph}</span>}
              {mood.change}
            </span>
          </p>
        </>
      ) : <p role="status"><b>산출 불가</b> · {score.unavailableReason ?? '점수를 계산할 데이터가 부족합니다.'}</p>}
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
