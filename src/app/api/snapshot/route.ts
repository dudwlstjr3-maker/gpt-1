/**
 * 서버 프록시 — 클라이언트는 외부 API 를 직접 호출하지 않는다.
 * API 키는 이 경로 안쪽에서만 사용되고 응답에 포함되지 않는다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildSnapshot } from '@/server/snapshot';
import { rateLimit } from '@/server/cache';
import { CLIENT_RATE_LIMIT_PER_MIN } from '@/server/config';
import { DEMO_SCENARIOS, type DemoScenario } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/*
 * 서버리스에서 이 함수가 살아 있을 수 있는 시간.
 *
 * 적지 않으면 Vercel 기본값 10초가 걸린다. 그런데 LIVE 모드의 한 번 응답은
 * 제공사 여러 곳에 수십 건을 묻고, 호스트당 초당 5건으로 속도를 지키며 기다린다.
 * 10초로는 모자라 함수가 통째로 잘려 죽고, 화면에는 "데이터 없음" 만 남는다 —
 * 제공사는 멀쩡한데 우리 쪽에서 끊은 것이라 원인을 짚기도 어렵다.
 *
 * 60초는 Hobby 요금제가 허용하는 최대값이다. 바깥 한 곳을 기다리는 시간
 * (HTTP_TIMEOUT_MS, 12초)보다 넉넉해야 한 곳이 느릴 때 그 자리만 비우고
 * 나머지를 돌려줄 수 있다.
 */
export const maxDuration = 60;


const VALID = new Set<string>(DEMO_SCENARIOS.map((s) => s.id));

function clientKey(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'local'
  );
}

export async function GET(req: NextRequest) {
  const limited = rateLimit(clientKey(req), CLIENT_RATE_LIMIT_PER_MIN);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429, headers: { 'retry-after': String(limited.retryAfterSec) } },
    );
  }

  const raw = req.nextUrl.searchParams.get('scenario') ?? 'normal';
  const scenario = (VALID.has(raw) ? raw : 'normal') as DemoScenario;

  // 로딩 상태를 실제로 재현하기 위한 의도적 지연 (DEMO 전용)
  if (scenario === 'loading') {
    await new Promise((r) => setTimeout(r, 1400));
  }

  try {
    const snapshot = await buildSnapshot({ scenario });
    return NextResponse.json(snapshot, {
      headers: {
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `스냅샷 생성 실패: ${message}` }, { status: 500 });
  }
}
