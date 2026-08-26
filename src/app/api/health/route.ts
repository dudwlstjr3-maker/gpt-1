/**
 * 진단용 — 현재 모드와 어떤 환경변수가 비어 있는지 알려준다.
 * 키 값 자체는 절대 반환하지 않는다.
 */

import { NextResponse } from 'next/server';
import { resolveMode, getModePreference, SECTION_TTL } from '@/server/config';
import { FORMULA_VERSION } from '@/server/fng/definitions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const { mode, reason, missing } = resolveMode();
  return NextResponse.json({
    ok: true,
    mode,
    modePreference: getModePreference(),
    reason,
    missingEnv: missing,
    formulaVersion: FORMULA_VERSION,
    sectionTtlMs: SECTION_TTL,
    serverTime: new Date().toISOString(),
  });
}
