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
