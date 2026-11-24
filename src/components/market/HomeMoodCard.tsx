import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ModeBadge } from '@/components/ui/Badge';
import { homeMood } from '@/lib/homeMood.mjs';
import { scoreColor, stageOf } from '@/lib/scale';
import { formatKstTime } from '@/lib/format';
import type { DataMode, FngScore } from '@/types';

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
            <g transform={`rotate(${mood.angle} 160 144)`}>
              <path d="M156 148 L159 40 Q160 36 161 40 L164 148Z" fill="#fff5d6" stroke="#442f28" />
              <path d="M160 43 L160 141" stroke="#ff9764" strokeWidth="1.5" />
            </g>
            <circle cx="160" cy="144" r="8" fill="#202b38" stroke="#d4dedc" strokeWidth="2" />
          </svg>
          <div className="mood-reading">
            <strong style={{ fontSize: mood.word ? mood.size : undefined }}>{mood.word ?? stage.label}</strong>
            <span className="mood-score">{mood.score}<small> / 100</small></span>
          </div>
          <p className="mood-change">{mood.word && <b>{stage.label} · </b>}{mood.change}</p>
        </>
      ) : <p role="status"><b>산출 불가</b> · {score.unavailableReason ?? '점수를 계산할 데이터가 부족합니다.'}</p>}
      <footer><span>자체 산출 · {formatKstTime(score.computedAt)}</span><Link href="/fng/us">심리 상세 →</Link></footer>
    </article>
  );
}
