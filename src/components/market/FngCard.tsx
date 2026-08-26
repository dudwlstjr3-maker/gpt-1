'use client';

/**
 * Fear & Greed 카드.
 * 0~100 게이지 · 단계 · 전일/1주/1개월 변화 · 30일 추이 · 신뢰도 · 산출 시각 ·
 * 최대 상승/하락 요인까지 한 장에 담되, 상세는 눌러서 보게 한다.
 */

import Link from 'next/link';
import { Badge, ModeBadge } from '@/components/ui/Badge';
import { Gauge } from '@/components/charts/Gauge';
import { ScoreSparkline } from '@/components/charts/Sparkline';
import { formatKstTime, formatSigned, NO_VALUE } from '@/lib/format';
import { confidenceGlyph } from '@/lib/scale';
import { useChangeColor } from './useChangeColor';
import { CyclePhaseBadge } from './FngCycleView';
import { CONFIDENCE_LABEL, MARKET_LABEL, type DataMode, type FngScore } from '@/types';

function DeltaChip({ label, value }: { label: string; value: number | null }) {
  const c = useChangeColor();
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 rounded-lg bg-surface-2 py-1.5">
      <span className="text-[10px] text-muted">{label}</span>
      <span className="tnum flex items-center gap-0.5 text-[12px] font-semibold" style={{ color: c.color(value) }}>
        <span aria-hidden="true">{c.glyph(value)}</span>
        {value === null ? NO_VALUE : formatSigned(value, 1)}
        <span className="sr-only">{c.label(value)}</span>
      </span>
    </div>
  );
}

function DriverRow({ kind, label, detail }: { kind: 'up' | 'down'; label: string | null; detail: string | null }) {
  const c = useChangeColor();
  const color = c.color(kind === 'up' ? 1 : -1);
  return (
    <div className="flex items-start gap-1.5">
      <span aria-hidden="true" className="mt-px text-[10px] font-bold" style={{ color }}>
        {kind === 'up' ? '▲' : '▼'}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] leading-tight break-keep text-fg">
          <span className="text-muted">{kind === 'up' ? '상승 요인 ' : '하락 요인 '}</span>
          {label ?? '판단할 데이터가 부족합니다'}
        </p>
        {detail ? <p className="text-[10px] text-subtle">{detail}</p> : null}
      </div>
    </div>
  );
}

export function FngCard({ score, mode }: { score: FngScore; mode: DataMode }) {
  const unavailable = score.score === null;

  return (
    <article
      className="card flex h-full flex-col p-3.5"
      aria-labelledby={`fng-${score.market}-title`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`fng-${score.market}-title`} className="text-sm font-bold text-fg-strong">
            {MARKET_LABEL[score.market]} 투자심리
          </h3>
          <p className="mt-0.5 text-[10px] text-subtle">자체 산출 지수 · {score.formulaVersion}</p>
          <div className="mt-1.5">
            <CyclePhaseBadge cycle={score.cycle} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <ModeBadge mode={mode} size="xs" />
          <Badge
            tone={score.confidence === 'high' ? 'ok' : score.confidence === 'medium' ? 'neutral' : 'warn'}
            size="xs"
            title={score.confidenceReason}
          >
            <span aria-hidden="true">{confidenceGlyph(score.confidence)}</span>
            신뢰도 {CONFIDENCE_LABEL[score.confidence]}
          </Badge>
        </div>
      </div>

      <div className="flex flex-col items-center">
        <Gauge score={score.score} size={168} />
      </div>

      {unavailable ? (
        <p
          className="mt-1 rounded-lg px-2.5 py-2 text-[11px] leading-relaxed break-keep"
          style={{ background: 'color-mix(in srgb, var(--warn) 12%, transparent)', color: 'var(--warn)' }}
          role="status"
        >
          {score.unavailableReason ?? '데이터가 부족해 점수를 산출할 수 없습니다.'}
        </p>
      ) : (
        <div className="mt-1 flex items-stretch gap-1.5">
          <DeltaChip label="전일" value={score.deltaDay} />
          <DeltaChip label="1주" value={score.deltaWeek} />
          <DeltaChip label="1개월" value={score.deltaMonth} />
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted">최근 30일</span>
        <ScoreSparkline
          points={score.spark}
          width={132}
          height={30}
          ariaLabel={`${MARKET_LABEL[score.market]} 최근 30일 점수 추이`}
        />
      </div>

      <div className="mt-2.5 space-y-1.5 border-t border-border pt-2.5">
        <DriverRow
          kind="up"
          label={score.topPositive?.label ?? null}
          detail={score.topPositive ? `${formatSigned(score.topPositive.contribution, 2)}점 기여` : null}
        />
        <DriverRow
          kind="down"
          label={score.topNegative?.label ?? null}
          detail={score.topNegative ? `${formatSigned(score.topNegative.contribution, 2)}점 기여` : null}
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2">
        <p className="text-[10px] text-subtle">
          산출 {formatKstTime(score.computedAt)} · 충족률 {Math.round(score.coverage * 100)}%
        </p>
        <Link
          href={`/fng/${score.market}`}
          className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] font-semibold text-fg hover:bg-surface-3"
        >
          상세 보기 →
        </Link>
      </div>
    </article>
  );
}
