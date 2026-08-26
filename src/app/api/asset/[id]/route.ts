/**
 * 종목·지수 상세 — 구간별 시계열 + 같은 시장의 Fear & Greed 점수 겹쳐보기.
 */

import { NextRequest, NextResponse } from 'next/server';
import { swr } from '@/server/cache';
import { getAdapter } from '@/server/adapters/registry';
import { computeFng } from '@/server/fng/engine';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { kstDateKey } from '@/lib/format';
import {
  DEMO_SCENARIOS,
  type AssetDetail,
  type DemoScenario,
  type FngHistoryPoint,
  type Meta,
  type RangeKey,
} from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RANGES: RangeKey[] = ['1D', '1W', '1M', '3M', '1Y', '3Y'];
const RANGE_MS: Record<RangeKey, number> = {
  '1D': 86400_000,
  '1W': 7 * 86400_000,
  '1M': 31 * 86400_000,
  '3M': 92 * 86400_000,
  '1Y': 366 * 86400_000,
  '3Y': 1096 * 86400_000,
};
const VALID_SCENARIO = new Set<string>(DEMO_SCENARIOS.map((s) => s.id));

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = CATALOG_BY_ID.get(id);
  if (!item) return NextResponse.json({ error: '알 수 없는 종목입니다.' }, { status: 404 });

  const rawScenario = req.nextUrl.searchParams.get('scenario') ?? 'normal';
  const scenario = (VALID_SCENARIO.has(rawScenario) ? rawScenario : 'normal') as DemoScenario;

  const { adapter } = getAdapter();
  const now = new Date();
  const ctx = { now, scenario };

  if (adapter.mode === 'DEMO' && scenario === 'error') {
    return NextResponse.json({ error: 'DEMO 전체 오류 시나리오입니다.' }, { status: 503 });
  }

  try {
    const key = `${adapter.mode}:${scenario}:${kstDateKey(now)}:asset:${id}`;
    const result = await swr(
      key,
      async (): Promise<AssetDetail> => {
        const quotes = await adapter.getQuotes(item.market, ctx);
        const quote = quotes.find((q) => q.id === id);
        if (!quote) throw new Error('시세를 찾을 수 없습니다.');

        const ranges = {} as Record<RangeKey, { t: number; v: number }[]>;
        for (const r of RANGES) {
          ranges[r] = await adapter.getAssetSeries(id, r, ctx);
        }

        const input = await adapter.getFngInput(item.market, ctx);
        const meta: Meta = {
          asOf: now.toISOString(),
          fetchedAt: now.toISOString(),
          freshness: scenario === 'stale' ? 'stale' : 'delayed',
          sources: Object.values(input.sources)[0] ?? [],
        };
        const { history } = computeFng(input, {
          historyDays: 1150,
          meta,
          computedAt: now.toISOString(),
        });

        const fngOverlay = {} as Record<RangeKey, FngHistoryPoint[]>;
        for (const r of RANGES) {
          const cutoff = now.getTime() - RANGE_MS[r];
          const slice = history.filter((p) => p.t >= cutoff);
          // 1D/1W 는 일별 점수가 1~5개뿐이라 최소 표본을 보장한다.
          fngOverlay[r] = slice.length >= 2 ? slice : history.slice(-7);
        }

        return { quote, ranges, fngOverlay, mode: adapter.mode };
      },
      { ttlMs: 120_000 },
    );

    return NextResponse.json(result.value, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `종목 상세를 불러오지 못했습니다: ${message}` }, { status: 502 });
  }
}
