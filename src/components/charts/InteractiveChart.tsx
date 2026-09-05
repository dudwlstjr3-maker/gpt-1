'use client';

/**
 * 상세 화면용 라인 차트.
 *  - 끌어서 이동, 휠·핀치로 확대·축소 (트레이딩뷰식). 확대하면 가려져 있던 날짜가 드러난다.
 *  - 마우스/터치 크로스헤어 + 툴팁
 *  - 키보드(←/→ 시점 이동, Shift+←/→ 화면 이동, +/- 확대·축소, 0 전체)
 *  - "표로 보기" 로 동일 내용을 표와 텍스트 요약으로 제공
 *  - 좌/우 두 개의 축을 지원해 가격과 0~100 점수를 겹쳐 볼 수 있다
 */

import { useCallback, useId, useMemo, useRef, useState } from 'react';
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
import { useChartViewport } from './useChartViewport';
import { ChartModal } from './ChartModal';

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
/** 표식(번호 붙은 세로 점선) 위에 올렸다고 볼 가로 거리 */
const MARKER_SNAP = 8;

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

/** 차트 위 작은 조작 버튼 — 터치 목표 크기를 지키려 최소 28px 로 잡는다 */
function ChartButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-[26px] min-w-[28px] items-center justify-center rounded px-1 text-[13px] leading-none font-semibold text-muted hover:bg-surface-3 hover:text-fg disabled:opacity-35 disabled:hover:bg-transparent"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

export function InteractiveChart({
  series,
  height = 220,
  label,
  emptyMessage = '차트를 그릴 데이터가 부족합니다.',
  maxPoints = 320,
  markers = [],
  focusT = null,
  expandable = true,
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
  /**
   * '크게' 버튼을 보일지.
   * 큰 창 안에서 또 크게 열 수는 없으므로 창 안쪽 차트는 false 로 넘긴다.
   */
  expandable?: boolean;
}) {
  const [wrapRef, size] = useSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  /**
   * 커서는 인덱스가 아니라 '시각'으로 들고 있는다.
   * 확대·이동하면 화면에 남는 점의 개수가 바뀌므로 인덱스는 금방 다른 날을 가리키게 된다.
   */
  const [cursorT, setCursorT] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [big, setBig] = useState(false);
  const liveId = useId();

  /** 결측을 걸러낸 원본 (뷰포트 계산의 기준) */
  const cleaned = useMemo(
    () => series.map((s) => ({ ...s, points: s.points.filter((p) => Number.isFinite(p.v)) })).filter((s) => s.points.length >= 2),
    [series],
  );

  const fullExtent = useMemo(() => {
    if (cleaned.length === 0) return null;
    const ts = cleaned.flatMap((s) => [s.points[0].t, s.points[s.points.length - 1].t]);
    const t0 = Math.min(...ts);
    const t1 = Math.max(...ts);
    return t1 > t0 ? { t0, t1 } : null;
  }, [cleaned]);

  const innerWNow = Math.max(10, size.w - MARGIN.left - MARGIN.right);
  /** 짚기만 했을 때 크로스헤어를 세우는 콜백 — geometry 가 만들어진 뒤 채워진다 */
  const tapRef = useRef<(px: number, py: number) => void>(() => {});
  const vp = useChartViewport({
    ref: svgRef,
    full: fullExtent,
    plotLeft: MARGIN.left,
    plotWidth: innerWNow,
    enabled: !showTable && size.w > 0,
    onTap: (px, py) => tapRef.current(px, py),
  });

  /**
   * 보이는 구간만 잘라서 그린다. 확대할수록 같은 폭에 더 적은 날이 들어가므로
   * 솎아내기에서 살아남는 점이 늘고, 가려져 있던 굴곡이 드러난다.
   */
  const prepared = useMemo(() => {
    const { t0, t1 } = vp.view;
    // 선이 화면 가장자리에서 끊기지 않도록 창 밖 한 점씩 더 가져온다
    return cleaned
      .map((s) => {
        const pts = s.points;
        let lo = 0;
        let hi = pts.length - 1;
        while (lo < pts.length && pts[lo].t < t0) lo += 1;
        while (hi >= 0 && pts[hi].t > t1) hi -= 1;
        const from = Math.max(0, lo - 1);
        const to = Math.min(pts.length - 1, hi + 1);
        const win = from <= to ? pts.slice(from, to + 1) : [];
        return { ...s, points: decimateMinMax(win, maxPoints) };
      })
      .filter((s) => s.points.length >= 2);
  }, [cleaned, vp.view, maxPoints]);

  /** 몇 년에 걸친 구간이면 축 라벨에 연도를 넣는다 (보이는 구간 기준) */
  const longSpan = vp.view.t1 - vp.view.t0 > 400 * 86400_000;

  const base = prepared[0];

  const geometry = useMemo(() => {
    if (!base || size.w === 0) return null;
    const w = size.w;
    const innerW = Math.max(10, w - MARGIN.left - MARGIN.right);
    // 표식이 있으면 번호 배지가 앉을 자리를 위에 비워 둔다
    const top = MARGIN.top + (markers.length > 0 ? MARKER_TOP : 0);
    const innerH = Math.max(10, height - top - MARGIN.bottom);

    // 축은 데이터 끝이 아니라 '보고 있는 구간'에 맞춘다. 데이터에 맞추면 끌 때마다 화면이 튄다.
    const x = linearScale([vp.view.t0, vp.view.t1], [MARGIN.left, MARGIN.left + innerW]);

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
  }, [base, prepared, size.w, height, markers.length, vp.view]);

  const setCursorFromX = useCallback(
    (px: number) => {
      if (!geometry || !base) return;
      const i = nearestIndex(base.points, geometry.x, px);
      setCursorT(i >= 0 ? base.points[i].t : null);
    },
    [geometry, base],
  );

  /**
   * 포인터가 무엇 위에 있는가.
   *
   * 예전에는 x 만 보고 크로스헤어를 세웠다. 그래서 왼쪽 축 글씨 위든, 번호 배지가
   * 앉는 위쪽 띠든, 아래 연도 글씨 위든 — 그림 안이 아닌 어디에 올려도 값이 떴다.
   * 그 자리들은 값을 읽는 자리가 아니다.
   *
   * 표식은 따로 잡는다. 번호 붙은 세로 점선은 그 자체가 가리키는 사건이 있는데,
   * 예전에는 그걸 무시하고 그냥 그날 점수만 떴다. 이제 점선이든 그 위의 번호
   * 배지든 올리면 그 날짜에 딱 서고, 툴팁이 사건 이름부터 알려 준다.
   */
  const hitAt = useCallback(
    (px: number, py: number): ChartMarker | 'plot' | null => {
      if (!geometry) return null;
      const x0 = MARGIN.left;
      const x1 = MARGIN.left + geometry.innerW;
      const y0 = geometry.top;
      const y1 = geometry.top + geometry.innerH;

      // ① 표식 — 그래프 안의 점선이든, 그 위에 앉은 번호 배지든
      if (py >= y0 - MARKER_TOP - 2 && py <= y1) {
        let hit: ChartMarker | null = null;
        let best = MARKER_SNAP;
        for (const m of markers) {
          const mx = geometry.x(m.t);
          if (mx < x0 - 1 || mx > x1 + 1) continue;
          const d = Math.abs(px - mx);
          if (d <= best) {
            best = d;
            hit = m;
          }
        }
        if (hit) return hit;
      }

      // ② 그래프 안쪽. 그 밖은 아무것도 아니다.
      if (px < x0 || px > x1 || py < y0 || py > y1) return null;
      return 'plot';
    },
    [geometry, markers],
  );

  const moveCursor = useCallback(
    (px: number, py: number) => {
      const hit = hitAt(px, py);
      if (hit === null) setCursorT(null);
      else if (hit === 'plot') setCursorFromX(px);
      else setCursorT(hit.t); // 표식 위에서는 그 날짜에 딱 세운다
    },
    [hitAt, setCursorFromX],
  );

  /** 커서를 보이는 점 기준으로 한 칸 옮긴다 */
  const stepCursor = useCallback(
    (dir: 1 | -1) => {
      if (!base) return;
      const pts = base.points;
      setCursorT((t) => {
        if (t === null) return pts[dir === 1 ? 0 : pts.length - 1].t;
        let i = 0;
        let best = Infinity;
        for (let k = 0; k < pts.length; k += 1) {
          const d = Math.abs(pts[k].t - t);
          if (d < best) { best = d; i = k; }
        }
        return pts[Math.max(0, Math.min(pts.length - 1, i + dir))].t;
      });
    },
    [base],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!base) return;
      const pts = base.points;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        // Shift 를 누르면 커서가 아니라 화면 자체를 민다
        if (e.shiftKey) vp.panByRatio(dir * 0.25);
        else stepCursor(dir);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setCursorT(pts[0].t);
      } else if (e.key === 'End') {
        e.preventDefault();
        setCursorT(pts[pts.length - 1].t);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        vp.zoomBy(1 / 1.4);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        vp.zoomBy(1.4);
      } else if (e.key === '0') {
        e.preventDefault();
        vp.reset();
      } else if (e.key === 'Escape') {
        setCursorT(null);
      }
    },
    [base, stepCursor, vp],
  );

  tapRef.current = moveCursor;

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

  /** 끄는 중에는 크로스헤어를 감춘다 — 손가락 밑에서 값이 계속 바뀌면 읽을 수가 없다 */
  const cursorPoint = (() => {
    if (cursorT === null || vp.dragging) return null;
    if (cursorT < vp.view.t0 || cursorT > vp.view.t1) return null;
    let best: SeriesPoint | null = null;
    let dist = Infinity;
    for (const p of base.points) {
      const d = Math.abs(p.t - cursorT);
      if (d < dist) { dist = d; best = p; }
    }
    return best;
  })();

  /**
   * 크로스헤어가 표식 위에 서 있으면 그 사건을 툴팁 머리에 적는다.
   * 상태로 따로 들고 있지 않고 위치에서 뽑는다 — 키보드로 옮겨 가도 똑같이 따라온다.
   */
  const cursorMarker =
    cursorPoint && geometry
      ? (markers.find((m) => Math.abs(geometry.x(m.t) - geometry.x(cursorPoint.t)) <= MARKER_SNAP) ?? null)
      : null;

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
    ? `${cursorMarker ? `${cursorMarker.index}번 ${cursorMarker.label}. ` : ''}${formatKstYmdTime(cursorPoint.t)}, ${prepared
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
        <div className="flex shrink-0 items-center gap-1">
          {!showTable ? (
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5" role="group" aria-label="차트 확대·축소">
              <ChartButton label="축소" onClick={() => vp.zoomBy(1.4)}>
                −
              </ChartButton>
              <ChartButton label="확대" onClick={() => vp.zoomBy(1 / 1.4)}>
                ＋
              </ChartButton>
              <ChartButton label="전체 구간 보기" onClick={vp.reset} disabled={!vp.zoomed}>
                ⤢
              </ChartButton>
            </div>
          ) : null}
          {expandable && !showTable ? (
            <button
              type="button"
              onClick={() => setBig(true)}
              className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] font-semibold text-muted hover:text-fg"
            >
              크게
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-expanded={showTable}
            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] font-semibold text-muted hover:text-fg"
          >
            {showTable ? '차트로 보기' : '표로 보기'}
          </button>
        </div>
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
              ref={svgRef}
              width={geometry.w}
              height={height}
              viewBox={`0 0 ${geometry.w} ${height}`}
              role="img"
              aria-label={`${label}. ${textSummary}${markerSummary}`}
              tabIndex={0}
              onKeyDown={onKeyDown}
              onMouseMove={(e) => {
                // 끄는 중에는 이동이 우선이라 크로스헤어를 갱신하지 않는다
                if (!vp.dragging) moveCursor(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
              }}
              onMouseLeave={() => setCursorT(null)}
              onDoubleClick={() => vp.reset()}
              className="rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]"
              /* 세로 스크롤은 브라우저에 넘기고, 가로 끌기·핀치는 우리가 처리한다 */
              style={{ touchAction: 'pan-y', cursor: vp.dragging ? 'grabbing' : 'grab' }}
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

              {/* 끌어서 고르고 있는 구간.
                  전체가 보이는 상태에서는 끌어도 옮길 데가 없으므로 구간 고르기로 쓴다.
                  손을 떼면 이 구간만 남기고 확대한다. */}
              {vp.selection ? (
                (() => {
                  const x0 = Math.max(MARGIN.left, geometry.x(vp.selection.t0));
                  const x1 = Math.min(MARGIN.left + geometry.innerW, geometry.x(vp.selection.t1));
                  if (x1 <= x0) return null;
                  return (
                    <g aria-hidden="true">
                      <rect
                        x={x0}
                        y={MARGIN.top}
                        width={x1 - x0}
                        height={geometry.innerH}
                        fill="color-mix(in srgb, var(--accent) 16%, transparent)"
                      />
                      {[x0, x1].map((x, i) => (
                        <line
                          key={i}
                          x1={x}
                          y1={MARGIN.top}
                          x2={x}
                          y2={MARGIN.top + geometry.innerH}
                          stroke="var(--accent)"
                          strokeWidth={1.5}
                        />
                      ))}
                    </g>
                  );
                })()
              ) : null}

              {/* 시점 표식 — 세로 점선 + 번호 배지. 아래 목록의 번호와 짝을 이룬다. */}
              {markers.map((m) => {
                const mx = geometry.x(m.t);
                if (mx < MARGIN.left - 1 || mx > MARGIN.left + geometry.innerW + 1) return null;
                const active =
                  (focusT !== null && Math.abs(focusT - m.t) < 86400000) || cursorMarker?.id === m.id;
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
                left: Math.max(0, Math.min(geometry.w - 172, geometry.x(cursorPoint.t) - 86)),
                width: 172,
              }}
            >
              {/* 표식 위에 섰으면 무슨 일이 있었는지부터 알려 준다 */}
              {cursorMarker ? (
                <div className="mb-1 flex items-start gap-1.5 border-b border-border pb-1">
                  <span
                    aria-hidden="true"
                    className="mt-px inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                    style={{ background: cursorMarker.color, color: 'var(--bg)' }}
                  >
                    {cursorMarker.index}
                  </span>
                  <span className="min-w-0 text-[10.5px] leading-snug font-semibold break-keep text-fg">
                    {cursorMarker.label}
                  </span>
                </div>
              ) : null}
              <div className="mb-0.5 text-[10px] text-subtle">
                {/* 툴팁은 어느 구간을 보고 있든 연도를 함께 보여 준다 */}
                {longSpan ? formatKstYmd(cursorPoint.t) : formatKstYmdTime(cursorPoint.t)}
              </div>
              {prepared.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1 text-muted">
                    <span aria-hidden="true" className="inline-block h-0.5 w-2.5 shrink-0 rounded" style={{ background: s.color }} />
                    <span className="truncate text-[10px]">{s.name}</span>
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
        <p className="mt-1 text-[10px] leading-relaxed break-keep text-subtle">
          {vp.zoomed
            ? '끌어서 좌우로 옮기고, 휠이나 두 손가락으로 확대·축소할 수 있습니다. 두 번 누르면 전체 구간으로 돌아갑니다.'
            : '끌어서 구간을 고르면 그 구간만 확대됩니다. 확대한 뒤에는 끌어서 좌우로 옮길 수 있습니다. 휠이나 두 손가락으로도 확대·축소할 수 있습니다.'}{' '}
          키보드는 ← → 시점 이동, Shift+← → 화면 이동, ＋/− 확대·축소, 0 전체입니다. 같은 내용을 표로도 볼 수 있습니다.
          {vp.zoomed ? (
            <>
              {' '}
              지금은 <strong className="text-muted">{formatKstYmd(vp.view.t0)} ~ {formatKstYmd(vp.view.t1)}</strong> 구간만
              보고 있습니다.
            </>
          ) : null}
        </p>
      ) : null}

      {/* 크게 보기 — 창 안의 차트는 또 열 수 없게 expandable 을 끈다 */}
      {expandable ? (
        <ChartModal
          open={big}
          onClose={() => setBig(false)}
          title={label}
          subtitle="끌어서 이동 · 휠이나 두 손가락으로 확대·축소 · 두 번 누르면 전체로"
        >
          <InteractiveChart
            series={series}
            height={380}
            label={label}
            markers={markers}
            focusT={focusT}
            maxPoints={maxPoints}
            expandable={false}
          />
        </ChartModal>
      ) : null}
    </div>
  );
}
