/**
 * 로그인 쿠키 (2026-11-26).
 *
 *  - zt_session: { uid, m(모드), exp } 를 AUTH_SECRET 으로 서명. httpOnly · SameSite=Lax · (운영) Secure. 30일.
 *  - zt_oauth:   카카오로 보낼 때 만든 state 와 돌아올 곳. 10분.
 *  - 모드를 서명 안에 넣는다 — DEMO 쿠키가 LIVE 에서 통하지 않는다.
 *  - AUTH_SECRET 이 없으면 LIVE 로그인은 꺼진다. DEMO 는 서버가 뜰 때 만든 임시 키를 쓴다(다시 뜨면 로그아웃).
 *
 * 쓰기 요청(POST)은 x-plaza: 1 머리글이 있어야 받는다. 다른 사이트가 사용자의 쿠키로
 * 몰래 보내는 요청(CSRF)은 이 머리글을 붙일 수 없다. SameSite=Lax 가 한 겹 더 막는다.
 */

import { randomBytes } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { getAuthSecret } from '@/server/config';
import { signToken, verifyToken } from './authCore.mjs';
import type { DataMode } from '@/types';

export const SESSION_COOKIE = 'zt_session';
export const STATE_COOKIE = 'zt_oauth';
const SESSION_DAYS = 30;
/* DEMO 임시 서명 키도 globalThis 에 하나 — 라우트마다 다른 키가 생기면 로그인 쿠키가 다른 라우트에서 안 맞는다 */
const G = globalThis as typeof globalThis & { __ztDemoSecret?: string };
G.__ztDemoSecret ??= randomBytes(32).toString('hex');
const DEMO_SECRET = G.__ztDemoSecret;

export function sessionSecret(mode: DataMode): string | null {
  return getAuthSecret() ?? (mode === 'DEMO' ? DEMO_SECRET : null);
}

const cookieBase = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
});

export function readSession(req: NextRequest, mode: DataMode): string | null {
  const p = verifyToken(req.cookies.get(SESSION_COOKIE)?.value, sessionSecret(mode));
  return p && p.m === mode && typeof p.uid === 'string' ? p.uid : null;
}

export function setSession(res: NextResponse, uid: string, mode: DataMode, secret: string) {
  res.cookies.set(SESSION_COOKIE, signToken({ uid, m: mode, exp: Date.now() + SESSION_DAYS * 86_400_000 }, secret), {
    ...cookieBase(),
    maxAge: SESSION_DAYS * 86_400,
  });
}

export function clearSession(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', { ...cookieBase(), maxAge: 0 });
}

export function setState(res: NextResponse, state: string, next: string, secret: string) {
  res.cookies.set(STATE_COOKIE, signToken({ s: state, next, exp: Date.now() + 10 * 60_000 }, secret), { ...cookieBase(), maxAge: 600 });
}

export function readState(req: NextRequest, secret: string): { s: string; next: string } | null {
  const p = verifyToken(req.cookies.get(STATE_COOKIE)?.value, secret);
  return p && typeof p.s === 'string' && typeof p.next === 'string' ? { s: p.s, next: p.next } : null;
}

export function clearState(res: NextResponse) {
  res.cookies.set(STATE_COOKIE, '', { ...cookieBase(), maxAge: 0 });
}

/** 쓰기 요청이 우리 화면에서 온 것인지 */
export function fromOurPage(req: NextRequest): boolean {
  return req.headers.get('x-plaza') === '1';
}

/** 카카오에 등록한 Redirect URI — 설정이 있으면 그것, 없으면 지금 주소 + /api/auth/kakao/callback */
export function redirectUriFor(req: NextRequest, configured: string | null): string {
  return configured ?? `${req.nextUrl.origin}/api/auth/kakao/callback`;
}
