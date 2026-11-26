/**
 * 카카오 로그인 돌아오는 곳 (2026-11-26).
 *
 * 1) state 쿠키와 주소의 state 가 같은지 본다 — 다르면 다른 사이트가 끼어든 것.
 * 2) code 를 토큰으로 바꾼다 (POST, 한 번만 쓰는 code 라 재시도하지 않는다).
 * 3) 토큰으로 이름 · 닉네임을 받는다. 토큰은 저장하지 않고 여기서 버린다.
 * 4) 이름을 가운데 가려 계정을 만들거나 고치고, 로그인 쿠키를 심는다.
 * 바깥 호출은 fetchJson 을 거친다(AGENTS.md 3절).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getKakaoConfig } from '@/server/config';
import { fetchJson } from '@/server/http';
import { makePlazaCtx } from '@/server/plaza/context';
import { loginAccount } from '@/server/plaza/service';
import { clearState, readState, redirectUriFor, sessionSecret, setSession } from '@/server/plaza/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface KakaoMe {
  id?: number | string;
  kakao_account?: { name?: string; profile?: { nickname?: string } };
  properties?: { nickname?: string };
}

export async function GET(req: NextRequest) {
  const back = (why: string) => {
    const res = NextResponse.redirect(new URL(`/plaza?login=${why}`, req.nextUrl.origin));
    clearState(res);
    return res;
  };
  const kakao = getKakaoConfig();
  const ctx = makePlazaCtx();
  const secret = sessionSecret(ctx.mode);
  if (!kakao || !secret) return back('unavailable');
  const q = req.nextUrl.searchParams;
  if (q.get('error')) return back('cancelled');
  const st = readState(req, secret);
  const code = q.get('code');
  if (!st || !code || q.get('state') !== st.s) return back('state');
  try {
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: kakao.clientId,
      redirect_uri: redirectUriFor(req, kakao.redirectUri),
      code,
      ...(kakao.clientSecret ? { client_secret: kakao.clientSecret } : {}),
    });
    const tok = await fetchJson<{ access_token?: string }>('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      body: form.toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' },
      retries: 0,
    });
    if (!tok.access_token) return back('failed');
    const me = await fetchJson<KakaoMe>('https://kapi.kakao.com/v2/user/me', {
      headers: { authorization: `Bearer ${tok.access_token}` },
      retries: 1,
    });
    if (me.id === undefined || me.id === null) return back('failed');
    const name = me.kakao_account?.name?.trim() || null;
    const nickname = me.kakao_account?.profile?.nickname?.trim() || me.properties?.nickname?.trim() || null;
    const uid = await loginAccount(ctx, 'kakao', String(me.id), name ?? nickname, !!name, secret);
    const res = NextResponse.redirect(new URL(st.next, req.nextUrl.origin));
    clearState(res);
    setSession(res, uid, ctx.mode, secret);
    return res;
  } catch {
    return back('failed');
  }
}
