/**
 * 종목 차트에 붙이는 미국 쫄탐지수 일별 값 (2026-11-28 — 종목 쫄탐의 재료).
 *
 * 심리 상세(/api/fng/us)와 같은 엔진 · 같은 입력으로 낸다. 차트는 봉 범위만큼만 쓰므로 길이는 줄인다.
 * 어댑터 한 곳에서 받으므로 DEMO 봉에는 DEMO 쫄탐, LIVE 봉에는 LIVE 쫄탐만 붙는다 — 섞이지 않는다.
 * 한국은 쫄탐지수를 내지 않는다(types/index.ts 의 MARKET_IDS 주석). 한국 종목도 미국 것을 쓴다.
 */

import { swr } from '@/server/cache';
import { computeFng } from '@/server/fng/engine';
import { kstDateKey } from '@/lib/format';
import type { MarketAdapter, AdapterContext } from '@/server/adapters/types';
import type { Meta } from '@/types';

/** 일봉 5년치 차트를 덮는 길이(거래일) — 백분위 창(252봉) 몫은 점수 쪽이 따로 챙긴다 */
const MOOD_HISTORY_DAYS = 1400;

export interface MoodSeries {
  market: 'us';
  t: number[];
  v: (number | null)[];
}

export async function usMoodSeries(adapter: MarketAdapter, ctx: AdapterContext): Promise<MoodSeries> {
  const key = `${adapter.mode}:${ctx.scenario}:${kstDateKey(ctx.now)}:mood-series:us`;
  const result = await swr(
    key,
    async (): Promise<MoodSeries> => {
      const input = await adapter.getFngInput('us', ctx);
      const meta: Meta = {
        asOf: ctx.now.toISOString(),
        fetchedAt: ctx.now.toISOString(),
        freshness: 'delayed',
        sources: Object.values(input.sources)[0] ?? [],
      };
      const { history } = computeFng(input, { historyDays: MOOD_HISTORY_DAYS, meta, computedAt: ctx.now.toISOString() });
      return { market: 'us', t: history.map((p) => p.t), v: history.map((p) => p.v) };
    },
    { ttlMs: 600_000 },
  );
  return result.value;
}

/** 봉 범위(첫 봉 일주일 전부터)만 남긴다 — 응답과 미리보기 크기를 줄이려고 */
export function trimMood(series: MoodSeries, fromT: number): MoodSeries {
  const from = fromT - 7 * 86_400_000;
  const keep = series.t.map((t, i) => [t, i] as const).filter(([t]) => t >= from).map(([, i]) => i);
  return { market: 'us', t: keep.map((i) => series.t[i]), v: keep.map((i) => series.v[i]) };
}
