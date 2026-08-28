'use client';

/**
 * 차트 이동·확대 (트레이딩뷰식).
 *
 *  - 끌기        : 시간축을 좌우로 민다
 *  - 휠          : 커서 위치를 기준으로 확대·축소
 *  - 두 손가락   : 벌리면 확대, 오므리면 축소
 *  - 더블클릭    : 전체 구간으로 되돌린다
 *
 * 페이지 스크롤을 잡아먹지 않도록 두 가지를 지킨다.
 *  1) 이미 전체가 보이는 상태에서 '축소' 방향으로 휠을 굴리면 막지 않고 페이지가 스크롤된다.
 *  2) 세로 방향 터치 스크롤은 CSS `touch-action: pan-y` 로 브라우저에 넘긴다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface Viewport {
  t0: number;
  t1: number;
}

/** 확대해도 이보다 좁아지지 않는다 — 점 몇 개만 남으면 차트가 아니게 된다 */
const MIN_SPAN_RATIO = 1 / 400;
const MIN_SPAN_MS = 2 * 86400_000;

function clampToFull(view: Viewport, full: Viewport): Viewport {
  const fullSpan = full.t1 - full.t0;
  const minSpan = Math.max(fullSpan * MIN_SPAN_RATIO, Math.min(MIN_SPAN_MS, fullSpan));
  let span = Math.min(Math.max(view.t1 - view.t0, minSpan), fullSpan);
  let t0 = view.t0;
  // 데이터 바깥으로는 나가지 않는다. 빈 여백을 끌고 다니면 위치 감각이 무너진다.
  if (t0 < full.t0) t0 = full.t0;
  if (t0 + span > full.t1) t0 = full.t1 - span;
  if (!Number.isFinite(t0) || !Number.isFinite(span)) return full;
  return { t0, t1: t0 + span };
}

export interface ChartViewport {
  /** 지금 보이는 구간 */
  view: Viewport;
  /** 전체에서 일부만 보고 있는가 */
  zoomed: boolean;
  reset: () => void;
  /** factor < 1 이면 확대, > 1 이면 축소. anchor 없으면 가운데 기준. */
  zoomBy: (factor: number, anchorT?: number) => void;
  /** 보이는 폭의 비율만큼 민다 (+ 는 미래 쪽) */
  panByRatio: (ratio: number) => void;
  /**
   * 지금 끌어서 고르고 있는 구간.
   * 전체가 보이는 상태에서는 끌어도 옮길 데가 없으므로, 대신 구간을 골라 확대한다.
   * 화면은 이 값을 받아 고르는 동안 띠를 그린다.
   */
  selection: Viewport | null;
  /** 손가락·마우스를 끄는 중인가 (커서 표시를 잠시 감춘다) */
  dragging: boolean;
}

export function useChartViewport({
  ref,
  full,
  plotLeft,
  plotWidth,
  enabled,
  onTap,
}: {
  ref: React.RefObject<SVGSVGElement | null>;
  full: Viewport | null;
  plotLeft: number;
  plotWidth: number;
  enabled: boolean;
  /** 끌지 않고 짚기만 했을 때 (터치로 크로스헤어를 세울 때 쓴다) */
  onTap?: (localX: number) => void;
}): ChartViewport {
  const [view, setView] = useState<Viewport | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selection, setSelection] = useState<Viewport | null>(null);

  // 데이터가 바뀌면(기간 버튼 등) 보던 구간을 버리고 전체로 돌아간다
  const fullKey = full ? `${full.t0}:${full.t1}` : '';
  useEffect(() => {
    setView(null);
  }, [fullKey]);

  const effective = full ? clampToFull(view ?? full, full) : { t0: 0, t1: 1 };
  const zoomed =
    full !== null && view !== null && (effective.t1 - effective.t0) < (full.t1 - full.t0) - 1;

  /* 최신 값을 이벤트 핸들러에서 읽기 위한 참조 */
  const state = useRef({ effective, full, plotLeft, plotWidth, enabled, onTap });
  state.current = { effective, full, plotLeft, plotWidth, enabled, onTap };

  const apply = useCallback((next: Viewport) => {
    const f = state.current.full;
    if (!f) return;
    const c = clampToFull(next, f);
    setView(c.t1 - c.t0 >= f.t1 - f.t0 - 1 ? null : c);
  }, []);

  const timeAtPx = useCallback((px: number) => {
    const { effective: v, plotLeft: L, plotWidth: W } = state.current;
    if (W <= 0) return (v.t0 + v.t1) / 2;
    const r = Math.min(1, Math.max(0, (px - L) / W));
    return v.t0 + (v.t1 - v.t0) * r;
  }, []);

  const zoomBy = useCallback(
    (factor: number, anchorT?: number) => {
      const { effective: v } = state.current;
      const a = anchorT ?? (v.t0 + v.t1) / 2;
      apply({ t0: a - (a - v.t0) * factor, t1: a + (v.t1 - a) * factor });
    },
    [apply],
  );

  const panByRatio = useCallback(
    (ratio: number) => {
      const { effective: v } = state.current;
      const d = (v.t1 - v.t0) * ratio;
      apply({ t0: v.t0 + d, t1: v.t1 + d });
    },
    [apply],
  );

  const reset = useCallback(() => setView(null), []);

  /* ---------------- 휠 확대·축소 ---------------- */
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const onWheel = (e: WheelEvent) => {
      const { full: f, effective: v } = state.current;
      if (!f) return;
      const zoomOut = e.deltaY > 0;
      const atFull = v.t1 - v.t0 >= f.t1 - f.t0 - 1;
      // 이미 전체가 보이는데 더 축소하려는 휠은 페이지 스크롤로 넘긴다
      if (zoomOut && atFull) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomBy(zoomOut ? 1.18 : 1 / 1.18, timeAtPx(e.clientX - rect.left));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref, enabled, zoomBy, timeAtPx]);

  /* ---------------- 끌기 · 핀치 ---------------- */
  const gesture = useRef<{
    pointers: Map<number, number>;
    startView: Viewport | null;
    startX: number;
    startDist: number;
    startAnchorT: number;
    moved: boolean;
    /** 끌기를 시작할 때 전체가 보이고 있었는가 */
    startedAtFull: boolean;
  }>({
    pointers: new Map(),
    startView: null,
    startX: 0,
    startDist: 0,
    startAnchorT: 0,
    moved: false,
    startedAtFull: false,
  });

  /* 이벤트 핸들러는 한 번만 붙으므로 최신 선택 구간을 참조로 읽는다 */
  const selRef = useRef<Viewport | null>(null);
  selRef.current = selection;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const g = gesture.current;

    const localX = (clientX: number) => clientX - el.getBoundingClientRect().left;

    const begin = () => {
      const xs = [...g.pointers.values()];
      const f = state.current.full;
      g.startView = state.current.effective;
      g.moved = false;
      // 전체가 보이는 상태면 끌어도 옮길 데가 없다. 그때는 구간 고르기로 쓴다.
      g.startedAtFull =
        f !== null && state.current.effective.t1 - state.current.effective.t0 >= f.t1 - f.t0 - 1;
      if (xs.length === 1) {
        g.startX = xs[0];
      } else if (xs.length >= 2) {
        g.startDist = Math.abs(xs[0] - xs[1]);
        g.startAnchorT = timeAtPx((xs[0] + xs[1]) / 2);
      }
    };

    const onDown = (e: PointerEvent) => {
      // 마우스는 왼쪽 버튼만
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      g.pointers.set(e.pointerId, localX(e.clientX));
      el.setPointerCapture(e.pointerId);
      begin();
      setDragging(true);
    };

    const onMove = (e: PointerEvent) => {
      if (!g.pointers.has(e.pointerId)) return;
      g.pointers.set(e.pointerId, localX(e.clientX));
      const xs = [...g.pointers.values()];
      const start = g.startView;
      const { plotWidth: W } = state.current;
      if (!start || W <= 0) return;

      if (xs.length >= 2) {
        const dist = Math.abs(xs[0] - xs[1]);
        if (g.startDist > 8 && dist > 8) {
          g.moved = true;
          const span = start.t1 - start.t0;
          const nextSpan = span * (g.startDist / dist);
          const a = g.startAnchorT;
          const r = (a - start.t0) / span;
          apply({ t0: a - nextSpan * r, t1: a + nextSpan * (1 - r) });
        }
        return;
      }

      const dx = xs[0] - g.startX;
      if (Math.abs(dx) > 2) g.moved = true;
      if (!g.moved) return;

      // 전체가 보이던 중이면 구간을 고르는 중이다. 확정은 손을 뗄 때 한다.
      if (g.startedAtFull) {
        const a = timeAtPx(g.startX);
        const bT = timeAtPx(xs[0]);
        setSelection({ t0: Math.min(a, bT), t1: Math.max(a, bT) });
        return;
      }

      const span = start.t1 - start.t0;
      const dt = -(dx / W) * span;
      apply({ t0: start.t0 + dt, t1: start.t1 + dt });
    };

    const onUp = (e: PointerEvent) => {
      const wasSingle = g.pointers.size === 1;
      g.pointers.delete(e.pointerId);
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (g.pointers.size === 0) {
        setDragging(false);
        // 고르던 구간이 있으면 거기로 확대한다. 너무 좁으면 실수로 본다.
        const sel = selRef.current;
        setSelection(null);
        if (sel) {
          const f = state.current.full;
          const wide = f !== null && sel.t1 - sel.t0 > (f.t1 - f.t0) * 0.02;
          if (wide) {
            apply(sel);
            return;
          }
        }
        // 끌지 않고 짚기만 했으면 그 자리에 크로스헤어를 세운다
        if (wasSingle && !g.moved) state.current.onTap?.(localX(e.clientX));
      } else {
        begin();
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [ref, enabled, apply, timeAtPx]);

  return { view: effective, zoomed, reset, zoomBy, panByRatio, dragging, selection };
}
