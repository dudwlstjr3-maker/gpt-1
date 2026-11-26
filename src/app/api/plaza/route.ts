/**
 * 쫄탐광장 API (2026-11-26).
 *
 *   GET  /api/plaza                  → 광장 상태 (판 · 순위표 · 한 줄 토론 · 내 기록)
 *   POST /api/plaza { action, ... }  → join · restore · predict · post · like · report · delete
 *
 * 회원 확인은 x-plaza-key 머리글(복구 코드)로 한다. 관리자 삭제는 x-plaza-admin 머리글이
 * PLAZA_ADMIN_KEY 와 같을 때만 — 키가 없으면 관리자 삭제는 꺼져 있다.
 * 응답은 사람마다 다르므로 캐시하지 않는다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdapter } from '@/server/adapters/registry';
import { rateLimit } from '@/server/cache';
import { CLIENT_RATE_LIMIT_PER_MIN, getPlazaAdminKey } from '@/server/config';
import { getPlazaStore } from '@/server/plaza/store';
import {
  PlazaError, addPost, adminDelete, authenticate, getState, ipTag, join, predict, report, restore, toggleLike, type PlazaCtx,
} from '@/server/plaza/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'local';
}

function makeCtx(): PlazaCtx {
  const { adapter } = getAdapter();
  const now = new Date();
  return { store: getPlazaStore(), mode: adapter.mode, now: now.getTime(), adapter, actx: { now, scenario: 'normal' } };
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
    const ctx = makeCtx();
    const uid = await authenticate(ctx, req.headers.get('x-plaza-key'));
    return NextResponse.json(await getState(ctx, uid), { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  const lim = limited(req);
  if (lim) return lim;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '요청을 읽지 못했어요.' }, { status: 400, headers: NO_STORE });
  }
  try {
    const ctx = makeCtx();
    const action = String(body.action ?? '');
    if (action === 'join' || action === 'restore') {
      const account = action === 'join' ? await join(ctx, body.nickname, ipTag(clientIp(req), ctx.now)) : await restore(ctx, body.key);
      const uid = await authenticate(ctx, account.key);
      return NextResponse.json({ ok: true, account, state: await getState(ctx, uid) }, { headers: NO_STORE });
    }
    if (action === 'delete') {
      const admin = getPlazaAdminKey();
      if (!admin || req.headers.get('x-plaza-admin') !== admin) {
        return NextResponse.json({ error: '관리자만 지울 수 있어요.' }, { status: 403, headers: NO_STORE });
      }
      await adminDelete(ctx, body.id);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }
    const uid = await authenticate(ctx, req.headers.get('x-plaza-key'));
    if (!uid) return NextResponse.json({ error: '닉네임을 먼저 정해 주세요.' }, { status: 401, headers: NO_STORE });
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
