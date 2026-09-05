'use client';

/**
 * 심리 사이클 표시.
 *
 * "지금 몇 점인가"만으로는 부족하다. 같은 45점이라도 80점에서 내려온 45점과
 * 20점에서 올라온 45점은 다르다. 그래서 기간별 위치(단기·중기·장기)와
 * 국면(수준 × 방향)을 함께 보여준다.
 *
 * 국면은 서술이지 예측이 아니다. 다음 방향을 말하지 않는다.
 */

import { ScoreSparkline } from '@/components/charts/Sparkline';
import { Badge, type Tone } from '@/components/ui/Badge';
import { formatNumber, formatSigned, NO_VALUE } from '@/lib/format';
import { scoreColor, scoreFill } from '@/lib/scale';
import { useChangeColor } from './useChangeColor';
import type { CyclePhaseId, FngCycle, FngCycleHorizon } from '@/types';

const PHASE_TONE: Record<CyclePhaseId, Tone> = {
  recovery: 'ok',
  deepening: 'danger',
  improving: 'ok',
  weakening: 'warn',
  heating: 'warn',
  cooling: 'accent',
  unknown: 'neutral',
};

const PHASE_GLYPH: Record<CyclePhaseId, string> = {
  recovery: '↗',
  deepening: '↘',
  improving: '↗',
  weakening: '↘',
  heating: '↗',
  cooling: '↘',
  unknown: '—',
};

/** 카드 헤더 등에 붙이는 작은 국면 배지 */
export function CyclePhaseBadge({ cycle, size = 'xs' }: { cycle: FngCycle; size?: 'xs' | 'sm' }) {
  return (
    <Badge tone={PHASE_TONE[cycle.phase.id]} size={size} title={cycle.phase.description}>
      <span aria-hidden="true">{PHASE_GLYPH[cycle.phase.id]}</span>
      {cycle.phase.label}
    </Badge>
  );
}

/** 백분위를 말로 옮긴다. 숫자만으로는 8% 가 높은지 낮은지 헷갈린다. */
function positionLabel(p: number): string {
  if (p >= 70) return '기간 상단권';
  if (p <= 30) return '기간 하단권';
  return '기간 중간권';
}

function HorizonRow({ h, score }: { h: FngCycleHorizon; score: number | null }) {
  const c = useChangeColor();
  const unavailable = h.percentile === null;

  return (
    <li className="border-b border-border py-2.5 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-fg">{h.label}</p>
          {unavailable ? (
            <p className="mt-0.5 text-[11.5px]" style={{ color: 'var(--warn)' }}>
              {h.unavailableReason ?? '표본 부족'}
            </p>
          ) : (
            <p className="tnum mt-0.5 text-[11.5px] text-subtle">
              평균 {formatNumber(h.mean, 1)} · 범위 {formatNumber(h.min, 0)}~{formatNumber(h.max, 0)}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[13px] font-bold" style={{ color: 'var(--fg-strong)' }}>
            {unavailable ? NO_VALUE : positionLabel(h.percentile ?? 0)}
          </p>
          <p className="tnum text-[11.5px]" style={{ color: c.color(h.change) }}>
            {c.glyph(h.change)} {h.change === null ? NO_VALUE : `${formatSigned(h.change, 1)}점`}
          </p>
        </div>
      </div>

      {/* 기간 내 위치 막대.
          30% / 70% 자리에 눈금을 넣어 하단권·중간권·상단권 경계를 눈으로 확인할 수 있게 한다. */}
      {!unavailable ? (
        <div className="mt-2 flex items-center gap-2">
          <div className="relative h-2.5 flex-1 rounded-full" style={{ background: 'var(--surface-3)' }}>
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${h.percentile}%`, background: scoreFill(score) }}
            />
            {[30, 70].map((t) => (
              <span
                key={t}
                aria-hidden="true"
                className="absolute inset-y-0 w-px"
                style={{ left: `${t}%`, background: 'var(--border-strong)' }}
              />
            ))}
            <span
              aria-hidden="true"
              className="absolute top-1/2 h-4 w-[2.5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${h.percentile}%`, background: 'var(--fg-strong)', boxShadow: '0 0 0 2px var(--surface)' }}
            />
          </div>
          <ScoreSparkline points={h.points} width={64} height={20} ariaLabel={`${h.label} 점수 추이`} />
        </div>
      ) : null}

      {/* 세 줄이 같은 설명을 되풀이하지 않는다. 무엇을 재는 값인지는 목록 위에 한 번 적혀 있다. */}
      {!unavailable ? (
        <p className="tnum mt-1 text-[11.5px] text-subtle">
          기간 내 위치 {formatNumber(h.percentile, 0)}%
          <span className="sr-only"> — {h.windowDays}일 중 현재 점수보다 낮았던 날의 비율</span>
        </p>
      ) : null}
    </li>
  );
}

export function FngCycleView({ cycle }: { cycle: FngCycle }) {
  const c = useChangeColor();

  return (
    <div className="card p-3.5">
      {/* 국면 */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-fg-strong">현재 국면</h3>
          <p className="mt-0.5 text-[11.5px] text-subtle">
            {cycle.phase.levelLabel} × {cycle.phase.directionLabel}
          </p>
        </div>
        <CyclePhaseBadge cycle={cycle} size="sm" />
      </div>

      <p className="mt-2 text-[12.5px] leading-relaxed break-keep text-muted">{cycle.phase.description}</p>

      <dl className="mt-2.5 flex gap-2 border-t border-border pt-2.5">
        <div className="flex-1 rounded-lg bg-surface-2 px-2 py-2 text-center">
          <dt className="text-[11.5px] text-muted">현재 점수</dt>
          <dd className="tnum mt-0.5 text-[13px] font-bold" style={{ color: scoreColor(cycle.score) }}>
            {cycle.score === null ? NO_VALUE : formatNumber(cycle.score, 1)}
          </dd>
        </div>
        <div className="flex-1 rounded-lg bg-surface-2 px-2 py-2 text-center">
          <dt className="text-[11.5px] text-muted">20일 평균</dt>
          <dd className="tnum mt-0.5 text-[13px] font-bold text-fg">
            {cycle.ma20 === null ? NO_VALUE : formatNumber(cycle.ma20, 1)}
          </dd>
        </div>
        <div className="flex-1 rounded-lg bg-surface-2 px-2 py-2 text-center">
          <dt className="text-[11.5px] text-muted">10일 기울기</dt>
          <dd className="tnum mt-0.5 text-[13px] font-bold" style={{ color: c.color(cycle.slope) }}>
            {cycle.slope === null ? NO_VALUE : `${formatSigned(cycle.slope, 2)}`}
            <span className="ml-0.5 text-[10.5px] font-normal text-subtle">점/일</span>
          </dd>
        </div>
      </dl>

      {/* 기간별 위치 */}
      <div className="mt-3 border-t border-border pt-2.5">
        <h4 className="mb-1 text-[12.5px] font-bold text-muted">기간별 심리 위치</h4>
        <p className="mb-1 text-[11.5px] leading-relaxed break-keep text-subtle">
          같은 점수라도 최근 흐름 안에서 어디쯤인지에 따라 의미가 다릅니다. <strong>기간 내 위치</strong>는 그
          기간의 날 가운데 지금보다 점수가 낮았던 날의 비율입니다.
        </p>
        {cycle.horizons.length === 0 ? (
          <p className="py-2 text-[12.5px]" style={{ color: 'var(--warn)' }}>
            기간별 위치를 계산할 히스토리가 없습니다.
          </p>
        ) : (
          <ul>
            {cycle.horizons.map((h) => (
              <HorizonRow key={h.id} h={h} score={cycle.score} />
            ))}
          </ul>
        )}
      </div>

      <p className="mt-2 border-t border-border pt-2 text-[11.5px] leading-relaxed break-keep text-subtle">
        국면은 현재 수준과 최근 방향을 조합해 이름 붙인 서술입니다. 앞으로의 방향을 예측하지 않으며 매매 신호가 아닙니다.
      </p>
    </div>
  );
}
