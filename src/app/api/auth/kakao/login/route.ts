/**
 * 카카오 로그인 시작 (2026-11-26) — state 를 서명 쿠키에 담고 카카오 동의 화면으로 보낸다.
 * 어떤 항목(닉네임 · 이름)을 물을지는 Kakao Developers 의 동의항목 설정이 정한다 — 여기서 scope 를 고정하지 않는다.
 * 설정되지 않았으면 광장으로 돌려보내고 화면이 그 사실을 알린다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdapter } from '@/server/adapters/registry';
import { getKakaoConfig } from '@/server/config';
import { randomState, safeNext } from '@/server/plaza/authCore.mjs';
import { redirectUriFor, sessionSecret, setState } from '@/server/plaza/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const kakao = getKakaoConfig();
  const secret = sessionSecret(getAdapter().adapter.mode);
  const next = safeNext(req.nextUrl.searchParams.get('next'));
  if (!kakao || !secret) return NextResponse.redirect(new URL('/plaza?login=unavailable', req.nextUrl.origin));
  const state = randomState();
  const url = new URL('https://kauth.kakao.com/oauth/authorize');
  url.searchParams.set('client_id', kakao.clientId);
  url.searchParams.set('redirect_uri', redirectUriFor(req, kakao.redirectUri));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  const res = NextResponse.redirect(url);
  setState(res, state, next, secret);
  return res;
}
