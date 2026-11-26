/**
 * 쫄탐광장 API (2026-11-26).
 *
 *   GET  /api/plaza                  → 광장 상태 (판 · 순위표 · 한 줄 토론 · 내 기록)
 *   POST /api/plaza { action, ... }  → predict · post · like · report · leave · delete
 *
 * 회원 확인은 로그인 쿠키(zt_session, 카카오 로그인 뒤 서버가 심음)로 한다.
 * 쓰기 요청은 x-plaza: 1 머리글이 있어야 받는다(다른 사이트가 쿠키로 몰래 보내는 요청을 막으려고).
 * 관리자 삭제는 x-plaza-admin 머리글이 PLAZA_ADMIN_KEY 와 같을 때만.
 * 응답은 사람마다 다르므로 캐시하지 않는다.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/server/cache';
import { CLIENT_RATE_LIMIT_PER_MIN, getPlazaAdminKey } from '@/server/config';
import { makePlazaCtx } from '@/server/plaza/context';
import { clearSession, fromOurPage, readSession } from '@/server/plaza/session';
import { PlazaError, addPost, adminDelete, authenticate, getState, leave, predict, report, toggleLike } from '@/server/plaza/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'local';
}

/** 관리자 키 비교 — 글자마다 걸리는 시간이 달라 키를 한 글자씩 짐작해 내지 못하게, 해시를 시간 일정하게 견준다 */
function isAdmin(given: string | null, admin: string | null): boolean {
  if (!admin || !given) return false;
  const h = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(h(given), h(admin));
}

function fail(e: unknown) {
  if (e instanceof PlazaError) return NextResponse.json({ error: e.message }, { status: e.status, headers: NO_STORE });
  // 저장소 주소 · 토큰이 오류 문구에 섞여 나가지 않게 내용은 숨긴다
  return NextResponse.json({ error: '광장 저장소에 잠시 닿지 못했어요. 조금 뒤에 다시 해 주세요.' }, { status: 503, headers: NO_STORE });
}

function limited(req: NextRequest) {
  const r = rateLimit(`plaza:${clientIp(req)}`, CLIENT_RATE_LIMIT_PER_MIN);
  return r.allowed
    ? null
    : NextResponse.json({ error: '요청이 너무 잦아요. 잠시 뒤에 다시 해 주세요.' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(r.retryAfterSec) } });
}

export async function GET(req: NextRequest) {
  const lim = limited(req);
  if (lim) return lim;
  try {
    const ctx = makePlazaCtx();
    const uid = await authenticate(ctx, readSession(req, ctx.mode));
    return NextResponse.json(await getState(ctx, uid), { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  const lim = limited(req);
  if (lim) return lim;
  if (!fromOurPage(req)) return NextResponse.json({ error: '광장 화면에서만 보낼 수 있어요.' }, { status: 403, headers: NO_STORE });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '요청을 읽지 못했어요.' }, { status: 400, headers: NO_STORE });
  }
  try {
    const ctx = makePlazaCtx();
    const action = String(body.action ?? '');
    if (action === 'delete') {
      const admin = getPlazaAdminKey();
      if (!isAdmin(req.headers.get('x-plaza-admin'), admin)) {
        return NextResponse.json({ error: '관리자만 지울 수 있어요.' }, { status: 403, headers: NO_STORE });
      }
      await adminDelete(ctx, body.id);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }
    const uid = await authenticate(ctx, readSession(req, ctx.mode));
    if (!uid) return NextResponse.json({ error: '카카오로 로그인해 주세요.' }, { status: 401, headers: NO_STORE });
    if (action === 'leave') {
      await leave(ctx, uid);
      const res = NextResponse.json({ ok: true, state: await getState(ctx, null) }, { headers: NO_STORE });
      clearSession(res);
      return res;
    }
    if (action === 'predict') await predict(ctx, uid, body.market, body.pick, body.date);
    else if (action === 'post') await addPost(ctx, uid, body.text);
    else if (action === 'like') await toggleLike(ctx, uid, body.id);
    else if (action === 'report') await report(ctx, uid, body.id);
    else return NextResponse.json({ error: '알 수 없는 요청이에요.' }, { status: 400, headers: NO_STORE });
    return NextResponse.json({ ok: true, state: await getState(ctx, uid) }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}
