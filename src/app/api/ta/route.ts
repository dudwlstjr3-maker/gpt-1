/**
 * 종목 차트의 봉 (2026-11-27).
 *
 *   GET /api/ta?a=tsla&tf=1d        카탈로그 항목
 *   GET /api/ta?code=TSLA&tf=4h     목록에 없는 종목 — 모양은 taParseCode 가 거른다
 *
 * 봉과 미국 쫄탐지수 일별 값(종목 쫄탐의 재료, 2026-11-28)을 보낸다.
 * 지표(종목 쫄탐 · RSI · 슈퍼트렌드 · OBV · 이동평균 · 1년선)는 화면이 ta.mjs 로 계산한다 —
 * 미리보기도 같은 파일로 같은 값을 그린다. DEMO 와 LIVE 는 어댑터가 가르고 섞지 않는다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { swr } from '@/server/cache';
import { getAdapter } from '@/server/adapters/registry';
import { SeriesUnavailableError } from '@/server/http';
import { YAHOO_SYMBOL } from '@/server/adapters/live/providers/yahoo';
import { taAsset, taAssets } from '@/lib/taAssets';
import { taParseCode } from '@/lib/ta.mjs';
import { trimMood, usMoodSeries } from '@/server/fng/moodSeries';
import type { TaBarsResult, TaTf } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// 4시간봉은 1시간봉과 일봉을 한 번씩 더 받는다. asset 라우트와 같은 까닭으로 넉넉히.
export const maxDuration = 60;
/** 종목 쫄탐의 재료(미국 쫄탐지수)를 기다리는 최대 시간 */
const MOOD_WAIT_MS = 20_000;

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
    if (!taAsset(a)) return NextResponse.json({ error: '종목 차트에서 볼 수 없는 항목입니다.' }, { status: 404 });
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
    // 종목 쫄탐의 재료 — 같은 어댑터의 미국 쫄탐지수. 못 받아도 봉은 보여 주고, 점수만 내지 않는다
    let mood: TaBarsResult['mood'] = null;
    let moodNote: string | null = null;
    // LIVE 에서 쫄탐 입력을 처음 모으는 데 오래 걸려도 봉까지 늦추지 않는다 — 기다리다 넘기면 이번에는 점수 없이 보내고,
    // 모으던 것은 캐시에 남아 다음 요청에 쓰인다
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const series = await Promise.race([
        usMoodSeries(adapter, ctx),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), MOOD_WAIT_MS);
        }),
      ]);
      mood = trimMood(series, result.value.bars[0]?.t ?? 0);
    } catch (e) {
      moodNote = e instanceof Error && e.message === 'timeout'
        ? '시장 쫄탐지수를 아직 모으는 중이라 이번에는 종목 쫄탐을 내지 못했습니다. 잠시 뒤 다시 열어 주세요.'
        : '시장 쫄탐지수를 받지 못해 종목 쫄탐을 낼 수 없습니다.';
    } finally {
      clearTimeout(timer);
    }
    const body: TaBarsResult = { ...result.value, mood, moodNote };
    return NextResponse.json(body, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof SeriesUnavailableError) {
      return NextResponse.json({ error: e.reason, mode: adapter.mode }, { status: 404 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `봉을 불러오지 못했습니다: ${message}`, mode: adapter.mode }, { status: 502 });
  }
}
