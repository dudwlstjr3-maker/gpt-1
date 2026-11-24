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
          <div className="mood-reading">
            <strong style={{ fontSize: mood.word ? mood.size : undefined }}>{mood.word ?? stage.label}</strong>
            <span className="mood-score">{mood.score}<small> / 100</small></span>
          </div>
          <p className="mood-change">{mood.word && <b>{stage.label} · </b>}{mood.change}</p>
          <div className="mood-ruler" aria-hidden="true"><i style={{ left: mood.score + '%' }} /></div>
          <div className="mood-ends"><span>0 공포</span><span>100 탐욕</span></div>
        </>
      ) : <p role="status"><b>산출 불가</b> · {score.unavailableReason ?? '점수를 계산할 데이터가 부족합니다.'}</p>}
      <footer><span>자체 산출 · {formatKstTime(score.computedAt)}</span><Link href="/fng/us">심리 상세 →</Link></footer>
    </article>
  );
}
