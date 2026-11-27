/**
 * 참고 차트의 봉 (2026-11-27).
 *
 *   GET /api/ta?a=tsla&tf=1d        카탈로그 항목
 *   GET /api/ta?code=TSLA&tf=4h     목록에 없는 종목 — 모양은 taParseCode 가 거른다
 *
 * 봉만 보낸다. 지표(RSI · 슈퍼트렌드 · OBV · 이동평균 · 1년선)는 화면이 ta.mjs 로 계산한다 —
 * 미리보기도 같은 파일로 같은 값을 그린다. DEMO 와 LIVE 는 어댑터가 가르고 섞지 않는다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { swr } from '@/server/cache';
import { getAdapter } from '@/server/adapters/registry';
import { SeriesUnavailableError } from '@/server/http';
import { YAHOO_SYMBOL } from '@/server/adapters/live/providers/yahoo';
import { taAsset, taAssets } from '@/lib/taAssets';
import { taParseCode } from '@/lib/ta.mjs';
import type { TaTf } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// 4시간봉은 1시간봉과 일봉을 한 번씩 더 받는다. asset 라우트와 같은 까닭으로 넉넉히.
export const maxDuration = 60;

/** 코드가 목록의 종목이면 목록 항목으로 본다 — 이름 · 소수 자리 · DEMO 값이 있다 */
function catalogIdForCode(code: string): string | null {
  for (const item of taAssets()) {
    const yahoo = YAHOO_SYMBOL[item.id]?.replace(/\.(KS|KQ)$/, '');
    if (item.symbol.toUpperCase() === code || yahoo === code) return item.id;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tfRaw = sp.get('tf') ?? '1d';
  if (tfRaw !== '1d' && tfRaw !== '4h') {
    return NextResponse.json({ error: '봉 단위는 1d(일봉) 또는 4h(4시간봉)입니다.' }, { status: 400 });
  }
  const tf = tfRaw as TaTf;

  let assetId: string | null = null;
  let code: string | null = null;
  const a = sp.get('a');
  const c = sp.get('code');
  if (a) {
    if (!taAsset(a)) return NextResponse.json({ error: '참고 차트에서 볼 수 없는 항목입니다.' }, { status: 404 });
    assetId = a;
  } else if (c) {
    const parsed = taParseCode(c);
    if (!parsed) {
      return NextResponse.json({ error: '코드 모양이 아닙니다. 미국은 TSLA, 한국은 005930 처럼 적어 주세요.' }, { status: 400 });
    }
    assetId = catalogIdForCode(parsed.code);
    code = assetId ? null : parsed.code;
  } else {
    return NextResponse.json({ error: '볼 항목(a) 또는 코드(code)가 필요합니다.' }, { status: 400 });
  }

  const { adapter } = getAdapter();
  const now = new Date();
  const ctx = { now, scenario: 'normal' as const };
  try {
    const key = `${adapter.mode}:ta:${assetId ?? `code:${code}`}:${tf}`;
    const result = await swr(key, () => adapter.getBars({ assetId, code, tf }, ctx), { ttlMs: 120_000 });
    return NextResponse.json(result.value, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof SeriesUnavailableError) {
      return NextResponse.json({ error: e.reason, mode: adapter.mode }, { status: 404 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `봉을 불러오지 못했습니다: ${message}`, mode: adapter.mode }, { status: 502 });
  }
}
