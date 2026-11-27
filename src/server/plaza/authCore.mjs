/**
 * 쫄탐광장 로그인 — 서명 쿠키와 계정 열쇠 (2026-11-26).
 *
 * 새 npm 의존성을 넣지 않는다(AGENTS.md 4절). node:crypto 의 HMAC 으로 직접 서명한다.
 * 서버 전용 — 화면 코드에서 가져다 쓰지 않는다(src/lib 이 아니라 src/server 에 둔 이유).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const mac = (secret, body) => createHmac('sha256', secret).update(body).digest();

/** {…, exp} → '본문.서명' */
export function signToken(payload, secret) {
  const body = b64u(JSON.stringify(payload));
  return `${body}.${b64u(mac(secret, body))}`;
}

/** 서명이 맞고 exp 가 지나지 않았으면 본문, 아니면 null */
export function verifyToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !secret) return null;
  const i = token.indexOf('.');
  if (i <= 0) return null;
  const body = token.slice(0, i);
  let sig;
  try {
    sig = Buffer.from(token.slice(i + 1), 'base64url');
  } catch {
    return null;
  }
  const want = mac(secret, body);
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!p || typeof p !== 'object' || !Number.isFinite(p.exp) || p.exp <= now) return null;
    return p;
  } catch {
    return null;
  }
}

/**
 * 카카오 회원번호 → 우리 쪽 계정 열쇠. 회원번호를 그대로 저장하지 않는다 —
 * 비밀값을 섞은 HMAC 이라 저장소가 새어도 카카오 회원번호로 되돌릴 수 없다.
 */
export function accountKey(provider, subject, secret) {
  return createHmac('sha256', secret).update(`${provider}:${subject}`).digest('hex').slice(0, 40);
}

export function randomState() {
  return b64u(randomBytes(16));
}

/** 로그인 뒤 돌아갈 곳 — 우리 사이트 안의 경로만. 바깥 주소(//evil.com 등)로 보내지 않는다 */
export function safeNext(next) {
  return typeof next === 'string' && /^\/(?![/\\])[\w\-./?=&#%]*$/.test(next) ? next : '/plaza';
}
