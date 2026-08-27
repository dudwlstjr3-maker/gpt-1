/**
 * Fear & Greed 상세 — 긴 히스토리(최대 10년), 과거 위기 표식, 구성요소 전체, 산출 방법.
 * 홈 스냅샷보다 계산량이 크므로 별도 캐시(TTL 10분)를 쓴다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { swr } from '@/server/cache';
import { getAdapter } from '@/server/adapters/registry';
import { computeFng } from '@/server/fng/engine';
import { buildBandStats } from '@/server/fng/cycle';
import { buildEventMarkers } from '@/server/fng/events';
import {
  COVERAGE_RULE_TEXT,
  FORMULA_VERSION,
  METHODOLOGY_STEPS,
  SCALE_WARNING,
  WINSOR_TEXT,
} from '@/server/fng/definitions';
import { kstDateKey } from '@/lib/format';
import { DEMO_SCENARIOS, MARKET_IDS, type DemoScenario, type FngDetail, type MarketId, type Meta } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * 10년 차트와 과거 위기 표식을 담기 위한 길이.
 *
 * 주식은 거래일(주 5일), 크립토는 달력일(주 7일)이라 같은 10년이라도 일수가 다르다.
 * 하나로 묶으면 크립토만 7년치가 되어 10년 차트가 절반만 채워진다.
 * 어댑터가 그보다 짧은 히스토리를 주면 있는 만큼만 쓴다.
 */
const DETAIL_HISTORY_DAYS: Record<MarketId, number> = {
  us: 2640,
  kr: 2640,
  crypto: 3660,
};
const VALID_SCENARIO = new Set<string>(DEMO_SCENARIOS.map((s) => s.id));

export async function GET(req: NextRequest, { params }: { params: Promise<{ market: string }> }) {
  const { market: marketParam } = await params;
  if (!MARKET_IDS.includes(marketParam as MarketId)) {
    return NextResponse.json({ error: '알 수 없는 시장입니다.' }, { status: 404 });
  }
  const market = marketParam as MarketId;

  const rawScenario = req.nextUrl.searchParams.get('scenario') ?? 'normal';
  const scenario = (VALID_SCENARIO.has(rawScenario) ? rawScenario : 'normal') as DemoScenario;

  const { adapter } = getAdapter();
  const now = new Date();
  const ctx = { now, scenario };

  if (adapter.mode === 'DEMO' && scenario === 'error') {
    return NextResponse.json({ error: 'DEMO 전체 오류 시나리오입니다.' }, { status: 503 });
  }

  try {
    const key = `${adapter.mode}:${scenario}:${kstDateKey(now)}:fng-detail:${market}`;
    const result = await swr(
      key,
      async (): Promise<FngDetail> => {
        const input = await adapter.getFngInput(market, ctx);
        const meta: Meta = {
          asOf: now.toISOString(),
          fetchedAt: now.toISOString(),
          freshness: scenario === 'stale' ? 'stale' : 'delayed',
          sources: Object.values(input.sources)[0] ?? [],
        };
        const { latest, history } = computeFng(input, {
          historyDays: DETAIL_HISTORY_DAYS[market],
          meta,
          computedAt: now.toISOString(),
        });
        const benchmark = await adapter.getBenchmark(market, ctx);

        // 구간별 과거 통계 — 서술 통계일 뿐이며 매매 신호가 아니다.
        const bandStats = benchmark
          ? buildBandStats(
              history,
              benchmark.series,
              benchmark.name,
              adapter.mode === 'DEMO'
                ? 'DEMO 합성 데이터로 계산한 값입니다. 실제 시장 통계가 아니며 화면 동작 확인용입니다.'
                : '과거 표본의 분포를 그대로 집계한 값입니다. 구간이 겹치는(overlapping) 표본이라 통계적 독립성이 없고, 미래 수익을 예측하지 않습니다.',
            )
          : null;

        // 과거 위기 표식 — 날짜와 이름은 사실, 점수는 이 앱의 자체 산출값이다.
        const events = buildEventMarkers(market, history, adapter.mode === 'DEMO');

        return {
          ...latest,
          history,
          events,
          bandStats,
          benchmark,
          methodology: {
            version: FORMULA_VERSION,
            summary:
              '공개·라이선스 데이터를 구성요소별로 수집해 역사적 분포와 비교한 백분위를 가중평균한 자체 산출 지수입니다. 외부 서비스의 공식 지수를 복제하지 않습니다.',
            steps: METHODOLOGY_STEPS,
            winsorization: WINSOR_TEXT,
            coverageRule: COVERAGE_RULE_TEXT,
            scaleWarning: SCALE_WARNING,
          },
        };
      },
      { ttlMs: 600_000 },
    );

    return NextResponse.json(
      { mode: adapter.mode, scenario: adapter.mode === 'DEMO' ? scenario : null, detail: result.value },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `점수 상세를 불러오지 못했습니다: ${message}` }, { status: 502 });
  }
}
