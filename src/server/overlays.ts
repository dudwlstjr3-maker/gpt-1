/**
 * 쫄탐지수와 겹쳐 보는 두 가지 — 서버 쪽 묶음 (2026-11-26).
 *
 * 계산은 src/lib/overlays.mjs 한 곳이다. 여기서는 어댑터에서 받은 시계열을 그 계산에 넣어
 * 화면이 쓰는 모양(상세 차트의 구간 · 홈 카드의 지금 값)으로 만든다.
 * 둘 중 하나를 못 받으면 그것만 null — 다른 하나와 쫄탐지수는 그대로 나온다.
 */

import { belowMaSpans, thresholdSpans, trendNow, vixNow, TREND_MA_DAYS, VIX_HIGH } from '@/lib/overlays.mjs';
import type { FngOverlayNow, FngOverlays, SeriesPoint } from '@/types';
import type { AdapterContext, BenchmarkSeries, MarketAdapter } from '@/server/adapters/types';

async function soft<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

export interface OverlayInputs {
  benchmark: BenchmarkSeries | null;
  vix: SeriesPoint[] | null;
}

/** 이미 받은 대표 지수에 VIX 만 더 받는다 (상세 API 용) */
export async function overlayInputs(
  adapter: MarketAdapter,
  ctx: AdapterContext,
  benchmark?: BenchmarkSeries | null,
): Promise<OverlayInputs> {
  const [b, vix] = await Promise.all([
    benchmark !== undefined ? Promise.resolve(benchmark) : soft(() => adapter.getBenchmark('us', ctx)),
    soft(() => adapter.getVix(ctx)),
  ]);
  return { benchmark: b ?? null, vix: vix ?? null };
}

/** 상세 차트에 겹치는 구간 */
export function overlaysFrom({ benchmark, vix }: OverlayInputs): FngOverlays | null {
  const trend = benchmark && benchmark.series.length >= TREND_MA_DAYS
    ? { name: benchmark.name, maDays: TREND_MA_DAYS, spans: belowMaSpans(benchmark.series, TREND_MA_DAYS) }
    : null;
  const v = vix && vix.length ? { threshold: VIX_HIGH, spans: thresholdSpans(vix, VIX_HIGH) } : null;
  return trend || v ? { trend, vix: v } : null;
}

/** 홈 카드의 두 칩 */
export function overlayNowFrom({ benchmark, vix }: OverlayInputs): FngOverlayNow | null {
  const tn = benchmark ? trendNow(benchmark.series, TREND_MA_DAYS) : null;
  const trend = benchmark && tn
    ? { name: benchmark.name, maDays: TREND_MA_DAYS, above: tn.above, gapPct: tn.gapPct }
    : null;
  const vn = vix && vix.length ? vixNow(vix, VIX_HIGH) : null;
  const v = vn ? { threshold: VIX_HIGH, value: vn.value, high: vn.high } : null;
  return trend || v ? { trend, vix: v } : null;
}
