import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { q, q1, type Db } from "./db";
import { fail } from "./http";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opt: object) => Promise<Buffer>;
export const SESSION_COOKIE = "bt_session";
const SESSION_DAYS = 30;

// 형식: scrypt$N$r$p$salt(b64)$hash(b64)  — scripts/seed.mjs 와 같은 형식
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const key = await scrypt(pw, salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, N, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(pw, Buffer.from(salt, "base64"), expected.length, { N: +N, r: +r, p: +p });
  return timingSafeEqual(key, expected);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string, ip: string | null, ua: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await q(
    "INSERT INTO sessions(token_hash, user_id, expires_at, ip, user_agent) VALUES ($1,$2,$3,$4,$5)",
    [sha256(token), userId, expires, ip, ua?.slice(0, 300) ?? null],
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await q("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

export type Viewer = {
  id: string;
  email: string;
  nickname: string;
  status: string;
  createdAt: Date;
  jobSeekingStatus: string;
  badge: string | null;
  roles: string[];
  isOperator: boolean;
  isSuperAdmin: boolean;
  companies: { id: string; name: string; status: string; role: string }[];
  verifiedCompanyIds: string[];
};

export async function viewerById(userId: string, db?: Db): Promise<Viewer | null> {
  const u = await q1(
    `SELECT u.id, u.email, u.status, u.created_at, p.nickname, p.job_seeking_status, p.badge_rank,
            COALESCE((SELECT array_agg(role) FROM user_roles WHERE user_id = u.id), '{}') AS roles
       FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`,
    [userId],
    db,
  );
  if (!u) return null;
  const companies = await q<{ id: string; name: string; status: string; role: string }>(
    `SELECT c.id, c.name, c.verification_status AS status, m.role
       FROM company_members m JOIN companies c ON c.id = m.company_id
      WHERE m.user_id = $1 ORDER BY m.joined_at`,
    [userId],
    db,
  );
  const roles: string[] = u.roles;
  return {
    id: u.id,
    email: u.email,
    nickname: u.nickname,
    status: u.status,
    createdAt: u.created_at,
    jobSeekingStatus: u.job_seeking_status,
    badge: u.badge_rank ?? null,
    roles,
    isSuperAdmin: roles.includes("super_admin"),
    isOperator: roles.includes("operator") || roles.includes("super_admin"),
    companies,
    verifiedCompanyIds: companies.filter((c) => c.status === "verified").map((c) => c.id),
  };
}

// 요청당 1회만 조회
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await q1<{ user_id: string }>(
    "SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()",
    [sha256(token)],
  );
  if (!s) return null;
  const v = await viewerById(s.user_id);
  if (!v || v.status === "withdrawn") return null;
  return v;
});

// API용
export async function requireUser(opts: { active?: boolean } = { active: true }): Promise<Viewer> {
  const v = await getViewer();
  if (!v) return fail(401, "로그인이 필요합니다.");
  if (opts.active !== false && v.status !== "active") fail(403, "이용이 제한된 계정입니다.");
  return v;
}

// 페이지용
export async function requirePageUser(next: string): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect(`/login?next=${encodeURIComponent(next)}`);
  return v;
}

export async function activeSanction(userId: string, type: "chat_mute" | "post_ban", db?: Db) {
  return q1<{ ends_at: Date | null; reason: string }>(
    `SELECT ends_at, reason FROM user_sanctions
      WHERE user_id = $1 AND type = $2 AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
      ORDER BY ends_at DESC NULLS FIRST LIMIT 1`,
    [userId, type],
    db,
  );
}
