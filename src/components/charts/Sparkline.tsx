'use client';

/** 미니 차트. 값이 없으면 자리만 차지하지 않고 사유를 표시한다. */

import { useId } from 'react';
import type { SeriesPoint } from '@/types';
import { areaPath, downsample, extent, linePath, linearScale } from './chartUtils';

export function Sparkline({
  points,
  width = 84,
  height = 28,
  color = 'var(--accent)',
  fill = true,
  ariaLabel,
  strokeWidth = 1.6,
}: {
  points: SeriesPoint[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  ariaLabel?: string;
  strokeWidth?: number;
}) {
  const gradId = useId();
  const data = downsample(points.filter((p) => Number.isFinite(p.v)), 60);

  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded text-[10px] text-subtle"
        style={{ width, height }}
        aria-label="차트를 그릴 데이터가 부족합니다"
        role="img"
      >
        데이터 없음
      </div>
    );
  }

  const pad = strokeWidth + 1;
  const xs = linearScale([data[0].t, data[data.length - 1].t], [pad, width - pad]);
  const ys = linearScale(extent(data.map((d) => d.v)), [height - pad, pad]);
  const pts = data.map((d) => ({ x: xs(d.t), y: ys(d.v) }));

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? '기간 추이 미니 차트'}
      className="overflow-visible"
    >
      {fill ? (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={areaPath(pts, height - pad)} fill={`url(#${gradId})`} />
        </>
      ) : null}
      <path d={linePath(pts)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={strokeWidth + 0.4} fill={color} />
    </svg>
  );
}

/** Fear→Greed 그라데이션을 쓰는 점수 전용 미니 차트 */
export function ScoreSparkline({
  points,
  width = 84,
  height = 28,
  ariaLabel,
}: {
  points: { t: number; v: number | null }[];
  width?: number;
  height?: number;
  ariaLabel?: string;
}) {
  const gradId = useId();
  const data = points.filter((p): p is SeriesPoint => p.v !== null && Number.isFinite(p.v));

  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-subtle"
        style={{ width, height }}
        role="img"
        aria-label="점수 추이 데이터가 부족합니다"
      >
        추이 없음
      </div>
    );
  }

  const pad = 2.5;
  const xs = linearScale([data[0].t, data[data.length - 1].t], [pad, width - pad]);
  const ys = linearScale([0, 100], [height - pad, pad]);
  const pts = data.map((d) => ({ x: xs(d.t), y: ys(d.v) }));

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel ?? '최근 30일 점수 추이'}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--stage-extreme-fear)" />
          <stop offset="30%" stopColor="var(--stage-fear)" />
          <stop offset="50%" stopColor="var(--stage-neutral)" />
          <stop offset="72%" stopColor="var(--stage-greed)" />
          <stop offset="100%" stopColor="var(--stage-extreme-greed)" />
        </linearGradient>
      </defs>
      <line x1={0} y1={ys(50)} x2={width} y2={ys(50)} stroke="var(--border)" strokeWidth={1} strokeDasharray="2 3" />
      <path d={linePath(pts)} fill="none" stroke={`url(#${gradId})`} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={2.2} fill="var(--fg-strong)" />
    </svg>
  );
}
