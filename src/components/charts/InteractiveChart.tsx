'use client';

/**
 * 상세 화면용 라인 차트.
 *  - 마우스/터치 크로스헤어 + 툴팁
 *  - 키보드(←/→, Home/End)로 데이터 포인트 이동, aria-live 로 값 안내
 *  - "표로 보기" 로 동일 내용을 표와 텍스트 요약으로 제공
 *  - 좌/우 두 개의 축을 지원해 가격과 0~100 점수를 겹쳐 볼 수 있다
 */

import { useCallback, useId, useMemo, useState } from 'react';
import type { SeriesPoint } from '@/types';
import {
  formatCompactEn,
  formatKoreanCompact,
  formatKstDate,
  formatKstYearMonth,
  formatKstYmd,
  formatKstYmdTime,
  formatNumber,
} from '@/lib/format';
import {
  areaPath,
  decimateMinMax,
  linePath,
  linearScale,
  nearestIndex,
  paddedExtent,
  useSize,
} from './chartUtils';
import { SeriesTable, summarizeSeries, type TableSeries } from './SeriesTable';

export interface ChartSeries {
  id: string;
  name: string;
  points: SeriesPoint[];
  color: string;
  axis: 'left' | 'right';
  precision: number;
  suffix?: string;
  /** 0~100 고정 축 (점수 시리즈) */
  fixed0to100?: boolean;
  area?: boolean;
  dashed?: boolean;
}

/**
 * 차트 위에 세로선으로 찍는 시점 표식.
 * 과거 위기처럼 "이때 무슨 일이 있었나"를 그래프 위에서 바로 짚기 위한 것이다.
 */
export interface ChartMarker {
  id: string;
  /** 표식 위치 (epoch ms) */
  t: number;
  /** 목록과 짝을 맞추는 번호 (①②③…) */
  index: number;
  label: string;
  color: string;
}

const MARGIN = { top: 10, right: 46, bottom: 22, left: 50 };
/** 표식 번호 배지가 들어갈 위쪽 여백 */
const MARKER_TOP = 15;

/**
 * 축 눈금 라벨.
 * 원화 가격이나 시가총액처럼 자릿수가 큰 값은 그대로 쓰면 축 영역을 넘어가 잘린다.
 * 큰 값은 조/억(또는 T/B/M)으로 줄여 쓰고, 정확한 값은 툴팁과 "표로 보기"에서 제공한다.
 */
function axisLabel(v: number, precision: number, koreanUnit: boolean): string {
  const a = Math.abs(v);
  if (a >= 1e8) return koreanUnit ? formatKoreanCompact(v, 2) : formatCompactEn(v, 2);
  if (a >= 1e4) return formatNumber(v, 0);
  return formatNumber(v, Math.min(precision, 2));
}

export function InteractiveChart({
  series,
  height = 220,
  label,
  emptyMessage = '차트를 그릴 데이터가 부족합니다.',
  maxPoints = 320,
  markers = [],
  focusT = null,
}: {
  series: ChartSeries[];
  height?: number;
  label: string;
  emptyMessage?: string;
  maxPoints?: number;
  /** 세로선으로 표시할 시점들 */
  markers?: ChartMarker[];
  /** 바깥에서 지정한 강조 시점 (목록에서 항목을 고른 경우) */
  focusT?: number | null;
}) {
  const [wrapRef, size] = useSize<HTMLDivElement>();
  const [cursor, setCursor] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const liveId = useId();

  const prepared = useMemo(
    () =>
      series
        .map((s) => ({ ...s, points: decimateMinMax(s.points.filter((p) => Number.isFinite(p.v)), maxPoints) }))
        .filter((s) => s.points.length >= 2),
    [series, maxPoints],
  );

  /** 몇 년에 걸친 구간이면 축 라벨에 연도를 넣는다 */
  const longSpan = useMemo(() => {
    const all = prepared.flatMap((s) => [s.points[0]?.t, s.points[s.points.length - 1]?.t]).filter(Boolean) as number[];
    if (all.length < 2) return false;
    return Math.max(...all) - Math.min(...all) > 400 * 86400_000;
  }, [prepared]);

  const base = prepared[0];

  const geometry = useMemo(() => {
    if (!base || size.w === 0) return null;
    const w = size.w;
    const innerW = Math.max(10, w - MARGIN.left - MARGIN.right);
    // 표식이 있으면 번호 배지가 앉을 자리를 위에 비워 둔다
    const top = MARGIN.top + (markers.length > 0 ? MARKER_TOP : 0);
    const innerH = Math.max(10, height - top - MARGIN.bottom);

    const allT = prepared.flatMap((s) => [s.points[0].t, s.points[s.points.length - 1].t]);
    const tDomain: [number, number] = [Math.min(...allT), Math.max(...allT)];
    const x = linearScale(tDomain, [MARGIN.left, MARGIN.left + innerW]);

    const leftVals = prepared.filter((s) => s.axis === 'left').flatMap((s) => s.points.map((p) => p.v));
    const rightSeries = prepared.filter((s) => s.axis === 'right');
    const rightVals = rightSeries.flatMap((s) => s.points.map((p) => p.v));

    const yLeft = linearScale(paddedExtent(leftVals), [top + innerH, top]);
    const rightFixed = rightSeries.some((s) => s.fixed0to100);
    const yRight = linearScale(
      rightFixed ? [0, 100] : paddedExtent(rightVals),
      [top + innerH, top],
    );

    return { w, innerW, innerH, top, x, yLeft, yRight, hasRight: rightSeries.length > 0 };
  }, [base, prepared, size.w, height, markers.length]);

  const setCursorFromX = useCallback(
    (px: number) => {
      if (!geometry || !base) return;
      const i = nearestIndex(base.points, geometry.x, px);
      setCursor(i >= 0 ? i : null);
    },
    [geometry, base],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!base) return;
      const n = base.points.length;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setCursor((c) => {
          const next = (c ?? n - 1) + (e.key === 'ArrowRight' ? 1 : -1);
          return Math.max(0, Math.min(n - 1, next));
        });
      } else if (e.key === 'Home') {
        e.preventDefault();
        setCursor(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setCursor(n - 1);
      } else if (e.key === 'Escape') {
        setCursor(null);
      }
    },
    [base],
  );

  const tableSeries: TableSeries[] = series.map((s) => ({
    id: s.id,
    name: s.name,
    points: s.points,
    precision: s.precision,
    ...(s.suffix ? { suffix: s.suffix } : {}),
  }));

  const textSummary = series
    .map((s) => summarizeSeries(s.name, s.points, s.precision, s.suffix ?? ''))
    .join(' ');

  // 표식은 그림으로만 전달되면 안 되므로 대체 텍스트에도 담는다
  const markerSummary =
    markers.length > 0
      ? ` 표시된 시점 ${markers.length}건: ${markers
          .map((m) => `${m.index}번 ${formatKstYmd(m.t)} ${m.label}`)
          .join(', ')}.`
      : '';

  if (!base) {
    return (
      <div className="card-flat px-3 py-6 text-center text-xs text-muted" role="status">
        {emptyMessage}
      </div>
    );
  }

  const cursorPoint = cursor !== null ? base.points[cursor] : null;

  const valueAt = (s: ChartSeries, t: number): number | null => {
    let best: SeriesPoint | null = null;
    let dist = Infinity;
    for (const p of s.points) {
      const d = Math.abs(p.t - t);
      if (d < dist) {
        dist = d;
        best = p;
      }
    }
    return best ? best.v : null;
  };

  const liveText = cursorPoint
    ? `${formatKstYmdTime(cursorPoint.t)}, ${prepared
        .map((s) => `${s.name} ${formatNumber(valueAt(s, cursorPoint.t), s.precision)}${s.suffix ?? ''}`)
        .join(', ')}`
    : '';

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {series.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5 text-[11px] text-muted">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-4 rounded-full"
                style={{
                  background: s.color,
                  ...(s.dashed ? { backgroundImage: 'none', opacity: 0.85 } : {}),
                }}
              />
              {s.name}
              {s.axis === 'right' ? <span className="text-subtle">(우축)</span> : null}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] font-semibold text-muted hover:text-fg"
        >
          {showTable ? '차트로 보기' : '표로 보기'}
        </button>
      </div>

      {showTable ? (
        <div>
          <SeriesTable series={tableSeries} caption={label} />
          <p className="mt-2 text-[11px] leading-relaxed break-keep text-muted">{textSummary}</p>
        </div>
      ) : (
        <div ref={wrapRef} className="relative w-full" style={{ height }}>
          {geometry ? (
            <svg
              width={geometry.w}
              height={height}
              viewBox={`0 0 ${geometry.w} ${height}`}
              role="img"
              aria-label={`${label}. ${textSummary}${markerSummary}`}
              tabIndex={0}
              onKeyDown={onKeyDown}
              onMouseMove={(e) => setCursorFromX(e.nativeEvent.offsetX)}
              onMouseLeave={() => setCursor(null)}
              onTouchStart={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setCursorFromX(e.touches[0].clientX - rect.left);
              }}
              onTouchMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setCursorFromX(e.touches[0].clientX - rect.left);
              }}
              className="touch-pan-y"
            >
              {/* 가로 그리드 + 좌축 라벨 */}
              {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                const y = geometry.top + geometry.innerH * f;
                const domain = geometry.yLeft.domain;
                const v = domain[1] - (domain[1] - domain[0]) * f;
                return (
                  <g key={f}>
                    <line
                      x1={MARGIN.left}
                      y1={y}
                      x2={MARGIN.left + geometry.innerW}
                      y2={y}
                      stroke="var(--border)"
                      strokeWidth={1}
                      opacity={0.5}
                    />
                    <text x={MARGIN.left - 6} y={y + 3} textAnchor="end" fontSize={9} fill="var(--subtle-fg)" className="tnum">
                      {axisLabel(v, base.precision, base.suffix === '원')}
                    </text>
                    {geometry.hasRight ? (
                      <text
                        x={MARGIN.left + geometry.innerW + 6}
                        y={y + 3}
                        fontSize={9}
                        fill="var(--subtle-fg)"
                        className="tnum"
                      >
                        {axisLabel(
                          geometry.yRight.domain[1] - (geometry.yRight.domain[1] - geometry.yRight.domain[0]) * f,
                          0,
                          false,
                        )}
                      </text>
                    ) : null}
                  </g>
                );
              })}

              {/* x축 라벨 */}
              {[0, 0.5, 1].map((f) => {
                const t = geometry.x.domain[0] + (geometry.x.domain[1] - geometry.x.domain[0]) * f;
                return (
                  <text
                    key={f}
                    x={geometry.x(t)}
                    y={height - 6}
                    textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}
                    fontSize={9}
                    fill="var(--subtle-fg)"
                  >
                    {longSpan ? formatKstYearMonth(t) : formatKstDate(t)}
                  </text>
                );
              })}

              {/* 시리즈 */}
              {prepared.map((s) => {
                const y = s.axis === 'right' ? geometry.yRight : geometry.yLeft;
                const pts = s.points.map((p) => ({ x: geometry.x(p.t), y: y(p.v) }));
                return (
                  <g key={s.id}>
                    {s.area ? (
                      <path d={areaPath(pts, geometry.top + geometry.innerH)} fill={s.color} opacity={0.12} />
                    ) : null}
                    <path
                      d={linePath(pts)}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={s.axis === 'right' ? 1.5 : 1.9}
                      strokeDasharray={s.dashed ? '4 3' : undefined}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}

              {/* 시점 표식 — 세로 점선 + 번호 배지. 아래 목록의 번호와 짝을 이룬다. */}
              {markers.map((m) => {
                const mx = geometry.x(m.t);
                if (mx < MARGIN.left - 1 || mx > MARGIN.left + geometry.innerW + 1) return null;
                const active = focusT !== null && Math.abs(focusT - m.t) < 86400000;
                return (
                  <g key={m.id} opacity={focusT === null || active ? 1 : 0.4}>
                    <line
                      x1={mx}
                      y1={geometry.top}
                      x2={mx}
                      y2={geometry.top + geometry.innerH}
                      stroke={m.color}
                      strokeWidth={active ? 1.6 : 1}
                      strokeDasharray="3 3"
                      opacity={active ? 0.95 : 0.6}
                    />
                    <circle cx={mx} cy={geometry.top - 8} r={active ? 8 : 7} fill={m.color} />
                    <text
                      x={mx}
                      y={geometry.top - 8 + 3.2}
                      textAnchor="middle"
                      fontSize={9}
                      fontWeight={700}
                      fill="var(--bg)"
                    >
                      {m.index}
                    </text>
                  </g>
                );
              })}

              {/* 크로스헤어 */}
              {cursorPoint ? (
                <g>
                  <line
                    x1={geometry.x(cursorPoint.t)}
                    y1={geometry.top}
                    x2={geometry.x(cursorPoint.t)}
                    y2={geometry.top + geometry.innerH}
                    stroke="var(--fg)"
                    strokeWidth={1}
                    opacity={0.45}
                  />
                  {prepared.map((s) => {
                    const v = valueAt(s, cursorPoint.t);
                    if (v === null) return null;
                    const y = s.axis === 'right' ? geometry.yRight : geometry.yLeft;
                    return <circle key={s.id} cx={geometry.x(cursorPoint.t)} cy={y(v)} r={3.2} fill={s.color} stroke="var(--surface)" strokeWidth={1.2} />;
                  })}
                </g>
              ) : null}
            </svg>
          ) : null}

          {/* 툴팁 */}
          {cursorPoint && geometry ? (
            <div
              className="pointer-events-none absolute top-1 rounded-lg border border-border px-2 py-1.5 text-[11px] shadow-lg"
              style={{
                background: 'var(--bg-elevated)',
                left: Math.max(0, Math.min(geometry.w - 150, geometry.x(cursorPoint.t) - 75)),
                width: 150,
              }}
            >
              <div className="mb-0.5 text-[10px] text-subtle">
                {/* 툴팁은 어느 구간을 보고 있든 연도를 함께 보여 준다 */}
                {longSpan ? formatKstYmd(cursorPoint.t) : formatKstYmdTime(cursorPoint.t)}
              </div>
              {prepared.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 truncate text-muted">
                    <span aria-hidden="true" className="inline-block h-0.5 w-2.5 rounded" style={{ background: s.color }} />
                    {s.name}
                  </span>
                  <span className="tnum font-semibold text-fg">
                    {formatNumber(valueAt(s, cursorPoint.t), s.precision)}
                    {s.suffix ?? ''}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      <p id={liveId} aria-live="polite" className="sr-only">
        {liveText}
      </p>
      {!showTable ? (
        <p className="mt-1 text-[10px] text-subtle">
          차트에 포커스한 뒤 ← → 키로 시점을 이동할 수 있습니다. 같은 내용을 표로도 볼 수 있습니다.
        </p>
      ) : null}
    </div>
  );
}
