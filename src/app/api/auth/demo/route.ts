/**
 * DEMO 연습 로그인 (2026-11-26) — DEMO 모드에서만 열린다. LIVE 에서는 404.
 * 카카오 앱이 없어도 광장을 눌러 보고, 검증기가 고르기 · 글쓰기를 실제로 해 볼 수 있게.
 * 이름은 연습용이라 실명 표시(real)를 붙이지 않는다.
 */

import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { checkNickname } from '@/lib/plazaRules.mjs';
import { makePlazaCtx } from '@/server/plaza/context';
import { loginAccount } from '@/server/plaza/service';
import { fromOurPage, sessionSecret, setSession } from '@/server/plaza/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ctx = makePlazaCtx();
  if (ctx.mode !== 'DEMO') return NextResponse.json({ error: '없는 주소예요.' }, { status: 404 });
  if (!fromOurPage(req)) return NextResponse.json({ error: '광장 화면에서만 보낼 수 있어요.' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const c = checkNickname(body.name);
  if (!c.ok) return NextResponse.json({ error: c.reason.replace('닉네임', '이름') }, { status: 400 });
  const secret = sessionSecret(ctx.mode) as string;
  const uid = await loginAccount(ctx, 'demo', randomBytes(8).toString('hex'), c.value, false, secret);
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  setSession(res, uid, ctx.mode, secret);
  return res;
}
