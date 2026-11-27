/** 로그아웃 — 로그인 쿠키를 지운다. 기록은 그대로(탈퇴는 광장의 '탈퇴'). */

import { NextRequest, NextResponse } from 'next/server';
import { clearSession, fromOurPage } from '@/server/plaza/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!fromOurPage(req)) return NextResponse.json({ error: '광장 화면에서만 보낼 수 있어요.' }, { status: 403 });
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  clearSession(res);
  return res;
}
