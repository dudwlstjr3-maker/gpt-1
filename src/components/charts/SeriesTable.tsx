'use client';

/**
 * 차트와 동일한 내용을 담은 접근 가능한 표.
 * 모든 차트는 이 표(또는 텍스트 요약)를 반드시 함께 제공한다.
 */

import { formatKstDateTime, formatKstYmd, formatNumber } from '@/lib/format';
import type { SeriesPoint } from '@/types';
import { downsample } from './chartUtils';

export interface TableSeries {
  id: string;
  name: string;
  points: SeriesPoint[];
  precision: number;
  suffix?: string;
}

export function SeriesTable({
  series,
  caption,
  maxRows = 24,
}: {
  series: TableSeries[];
  caption: string;
  maxRows?: number;
}) {
  const base = series[0];
  if (!base || base.points.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted">표로 보여줄 데이터가 없습니다.</p>;
  }

  const rows = downsample(base.points, maxRows);
  const span = base.points[base.points.length - 1].t - base.points[0].t;
  const longSpan = span > 400 * 86400_000;
  const valueAt = (s: TableSeries, t: number): number | null => {
    let best: SeriesPoint | null = null;
    let bestDist = Infinity;
    for (const p of s.points) {
      const d = Math.abs(p.t - t);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best ? best.v : null;
  };

  return (
    <div className="scroll-x max-h-64 overflow-y-auto rounded-lg border border-border">
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">시각 (KST)</th>
            {series.map((s) => (
              <th key={s.id} scope="col">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.t}>
              <th scope="row" className="font-normal text-muted">
                {/* 10년 표에서는 연도가 없으면 어느 해인지 알 수 없다 */}
                {longSpan ? formatKstYmd(r.t) : formatKstDateTime(r.t)}
              </th>
              {series.map((s) => (
                <td key={s.id} className="tnum">
                  {formatNumber(valueAt(s, r.t), s.precision)}
                  {s.suffix ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 차트 내용을 한 문장으로 요약 (스크린리더·저시력 사용자 대안 텍스트) */
export function summarizeSeries(name: string, points: SeriesPoint[], precision: number, suffix = ''): string {
  const clean = points.filter((p) => Number.isFinite(p.v));
  if (clean.length < 2) return `${name}: 요약할 데이터가 부족합니다.`;
  const first = clean[0];
  const last = clean[clean.length - 1];
  let min = clean[0];
  let max = clean[0];
  for (const p of clean) {
    if (p.v < min.v) min = p;
    if (p.v > max.v) max = p;
  }
  const change = last.v - first.v;
  const pct = first.v !== 0 ? (change / Math.abs(first.v)) * 100 : null;
  const dir = change > 0 ? '상승' : change < 0 ? '하락' : '보합';
  return `${name}: 기간 시작 ${formatNumber(first.v, precision)}${suffix} → 마지막 ${formatNumber(
    last.v,
    precision,
  )}${suffix}, ${formatNumber(Math.abs(change), precision)}${suffix} ${dir}${
    pct === null ? '' : ` (${formatNumber(pct, 2)}%)`
  }. 기간 최저 ${formatNumber(min.v, precision)}${suffix} (${formatKstYmd(min.t)}), 최고 ${formatNumber(
    max.v,
    precision,
  )}${suffix} (${formatKstYmd(max.t)}).`;
}
