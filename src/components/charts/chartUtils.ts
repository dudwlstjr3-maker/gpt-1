'use client';

import { useEffect, useRef, useState } from 'react';
import type { SeriesPoint } from '@/types';

/** 컨테이너 실제 픽셀 크기를 측정한다 (포인터 좌표 ↔ 데이터 매핑 정확도를 위해). */
export function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, size];
}

export interface Scale {
  (v: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const fn = ((v: number) => {
    if (span === 0) return (r0 + r1) / 2;
    return r0 + ((v - d0) / span) * (r1 - r0);
  }) as Scale;
  fn.domain = domain;
  fn.range = range;
  return fn;
}

export function extent(values: readonly number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) return [min - Math.abs(min || 1) * 0.02, max + Math.abs(max || 1) * 0.02];
  return [min, max];
}

/** 위아래 여백을 준 도메인 */
export function paddedExtent(values: readonly number[], pad = 0.08): [number, number] {
  const [min, max] = extent(values);
  const p = (max - min) * pad;
  return [min - p, max + p];
}

export function linePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i += 1) {
    d += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
  }
  return d;
}

export function areaPath(points: { x: number; y: number }[], baseY: number): string {
  if (points.length === 0) return '';
  return `${linePath(points)} L ${points[points.length - 1].x.toFixed(2)} ${baseY.toFixed(2)} L ${points[0].x.toFixed(
    2,
  )} ${baseY.toFixed(2)} Z`;
}

/** x 픽셀 위치에 가장 가까운 데이터 인덱스 */
export function nearestIndex(points: SeriesPoint[], x: Scale, px: number): number {
  if (points.length === 0) return -1;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const d = Math.abs(x(points[i].t) - px);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** 눈금 값 (최대 count 개) */
export function ticks(domain: [number, number], count: number): number[] {
  const [d0, d1] = domain;
  if (d0 === d1) return [d0];
  const step = (d1 - d0) / (count - 1);
  return Array.from({ length: count }, (_, i) => d0 + step * i);
}

/** 시계열을 최대 n 개로 균등 다운샘플링 (그리기 비용 절감) */
export function downsample(points: SeriesPoint[], n: number): SeriesPoint[] {
  if (points.length <= n) return points;
  const out: SeriesPoint[] = [];
  const step = (points.length - 1) / (n - 1);
  for (let i = 0; i < n; i += 1) out.push(points[Math.round(i * step)]);
  return out;
}
