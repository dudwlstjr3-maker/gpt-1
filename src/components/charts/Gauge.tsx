'use client';

/**
 * 0~100 반원형 게이지.
 * Fear→Greed 그라데이션 위에 현재 점수 바늘을 놓는다.
 * 색상만으로 의미를 전달하지 않도록 점수·단계명·기호를 함께 표기한다.
 */

import { useId } from 'react';
import { FNG_STAGES } from '@/types';
import { STAGE_GLYPH, scoreColor, stageFill, stageOf } from '@/lib/scale';
import { NO_VALUE, formatScore } from '@/lib/format';

const START_ANGLE = 180;
const END_ANGLE = 0;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 < a0 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

export function Gauge({
  score,
  size = 168,
  showScale = true,
  compact = false,
}: {
  score: number | null;
  size?: number;
  showScale?: boolean;
  compact?: boolean;
}) {
  const gradId = useId();
  const w = size;
  const h = compact ? size * 0.64 : size * 0.7;
  const cx = w / 2;
  const cy = h - (compact ? 12 : 20);
  const r = Math.min(w / 2 - 12, cy - 8);
  const thickness = Math.max(9, r * 0.19);

  const stage = stageOf(score);
  const clamped = score === null ? null : Math.min(100, Math.max(0, score));
  const angle = clamped === null ? null : START_ANGLE - (clamped / 100) * (START_ANGLE - END_ANGLE);

  const label =
    clamped === null
      ? '점수 산출 불가'
      : `100점 만점에 ${formatScore(clamped)}점, ${stage?.label ?? ''} 단계`;

  return (
    <div className="relative" style={{ width: w, height: h }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--stage-extreme-fear-fill)" />
            <stop offset="25%" stopColor="var(--stage-fear-fill)" />
            <stop offset="50%" stopColor="var(--stage-neutral-fill)" />
            <stop offset="75%" stopColor="var(--stage-greed-fill)" />
            <stop offset="100%" stopColor="var(--stage-extreme-greed-fill)" />
          </linearGradient>
        </defs>

        {/* 배경 트랙 */}
        <path
          d={arcPath(cx, cy, r, START_ANGLE, END_ANGLE)}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={thickness}
          strokeLinecap="round"
        />
        {/* 그라데이션 트랙 */}
        <path
          d={arcPath(cx, cy, r, START_ANGLE, END_ANGLE)}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          opacity={clamped === null ? 0.22 : 0.92}
        />

        {/* 단계 경계 눈금 */}
        {showScale &&
          [20, 40, 60, 80].map((v) => {
            const a = START_ANGLE - (v / 100) * 180;
            const p0 = polar(cx, cy, r - thickness / 2, a);
            const p1 = polar(cx, cy, r + thickness / 2, a);
            return (
              <line
                key={v}
                x1={p0.x}
                y1={p0.y}
                x2={p1.x}
                y2={p1.y}
                stroke="var(--bg)"
                strokeWidth={1.5}
                opacity={0.65}
              />
            );
          })}

        {/* 현재 점수 표시침.
            중앙까지 그리지 않고 색상 밴드 위에만 얹는다 — 가운데 점수/단계 텍스트를 가리지 않기 위해서다. */}
        {angle !== null ? (
          <g>
            <line
              x1={polar(cx, cy, r - thickness * 1.15, angle).x}
              y1={polar(cx, cy, r - thickness * 1.15, angle).y}
              x2={polar(cx, cy, r + thickness * 0.62, angle).x}
              y2={polar(cx, cy, r + thickness * 0.62, angle).y}
              stroke="var(--bg)"
              strokeWidth={5.5}
              strokeLinecap="round"
            />
            <line
              x1={polar(cx, cy, r - thickness * 1.05, angle).x}
              y1={polar(cx, cy, r - thickness * 1.05, angle).y}
              x2={polar(cx, cy, r + thickness * 0.55, angle).x}
              y2={polar(cx, cy, r + thickness * 0.55, angle).y}
              stroke="var(--fg-strong)"
              strokeWidth={3}
              strokeLinecap="round"
            />
          </g>
        ) : null}

        {showScale ? (
          <>
            <text x={0} y={h - 1} fontSize={9} fill="var(--subtle-fg)" textAnchor="start">
              0
            </text>
            <text x={w} y={h - 1} fontSize={9} fill="var(--subtle-fg)" textAnchor="end">
              100
            </text>
          </>
        ) : null}
      </svg>

      {/* 중앙 점수 */}
      <div
        className="pointer-events-none absolute inset-x-0 flex flex-col items-center"
        style={{ top: h * (compact ? 0.4 : 0.45) }}
      >
        <span
          className="tnum leading-none font-bold"
          style={{ fontSize: compact ? 22 : 29, color: scoreColor(clamped) }}
        >
          {clamped === null ? NO_VALUE : formatScore(clamped)}
        </span>
        <span className="mt-1 text-[12.5px] font-semibold" style={{ color: scoreColor(clamped) }}>
          {clamped === null ? '산출 불가' : `${STAGE_GLYPH[stage!.id]} ${stage!.label}`}
        </span>
      </div>
    </div>
  );
}

/**
 * 게이지 아래에 놓는 단계 띠.
 *
 * 0~100 을 다섯 칸으로 나눠 신호등 램프(빨-주-노-연두-초) 그대로 칠하고,
 * 현재 점수 자리에 표식을 찍는다. 점 다섯 개를 늘어놓는 것보다
 * "지금 어느 칸에 있는가"가 한눈에 들어온다.
 *
 * 여기서 색은 위험이 아니라 심리다. 빨강은 공포, 초록은 탐욕이다.
 * 오해하기 쉬운 부분이라 띠 아래에 그대로 적어 둔다.
 */
export function StageLegend({ score }: { score?: number | null }) {
  const clamped = score === null || score === undefined || !Number.isFinite(score)
    ? null
    : Math.min(100, Math.max(0, score));
  const current = stageOf(clamped);

  return (
    <div>
      <div
        className="tl-band relative"
        style={{ height: 14 }}
        role="img"
        aria-label={`공포에서 탐욕까지 5단계 띠. ${FNG_STAGES.map((s) => `${s.label} ${s.min}부터 ${s.max}`).join(', ')}.${
          current ? ` 현재는 ${current.label} 단계.` : ''
        }`}
      >
        {FNG_STAGES.map((s) => (
          <span
            key={s.id}
            data-on={!current || current.id === s.id ? '1' : '0'}
            style={{ width: '20%', background: stageFill(s.id) }}
          />
        ))}
        {clamped !== null ? (
          <span
            aria-hidden="true"
            className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `${clamped}%`, background: 'var(--fg-strong)', boxShadow: '0 0 0 2px var(--surface)' }}
          />
        ) : null}
      </div>

      <ul className="mt-1.5 flex text-[10.5px] leading-tight">
        {FNG_STAGES.map((s) => {
          const active = current?.id === s.id;
          return (
            <li key={s.id} className="w-1/5 px-0.5 text-center">
              <span
                className="block break-keep"
                style={{
                  color: active ? `var(--stage-${s.id.replace('_', '-')})` : 'var(--subtle-fg)',
                  fontWeight: active ? 700 : 400,
                }}
              >
                {s.label}
              </span>
              <span className="tnum block text-subtle">
                {s.min}–{s.max}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[11.5px] leading-relaxed break-keep text-subtle">
        이 띠의 색은 <strong className="text-muted">위험도가 아니라 심리</strong>입니다. 빨강은 공포가 심한 쪽,
        초록은 탐욕이 강한 쪽이라는 뜻이며 어느 쪽이 좋다·나쁘다는 뜻이 아닙니다. 시장 위험 신호등(빨=경계)과는
        다른 의미이니 함께 볼 때 주의하세요.
      </p>
    </div>
  );
}
