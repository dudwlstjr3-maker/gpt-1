import { api, body, str, json, fail, clientIp } from "@/lib/http";
import { q, q1 } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";

export const POST = api(async (req) => {
  const b = await body(req);
  const email = str(b, "email", { max: 254, name: "이메일" })!.toLowerCase();
  const password = str(b, "password", { max: 200, name: "비밀번호" })!;
  const ip = clientIp(req);

  // 같은 이메일로 15분 안에 10회 실패하면 잠시 차단
  const recent = await q1<{ n: number }>(
    "SELECT count(*)::int AS n FROM login_attempts WHERE email = $1 AND success = false AND created_at > now() - interval '15 minutes'",
    [email],
  );
  if ((recent?.n ?? 0) >= 10) fail(429, "로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.");

  const u = await q1<{ id: string; password_hash: string; status: string }>(
    "SELECT id, password_hash, status FROM users WHERE email = $1",
    [email],
  );
  const ok = !!u && u.status !== "withdrawn" && (await verifyPassword(password, u.password_hash));
  await q("INSERT INTO login_attempts(email, ip, success) VALUES ($1,$2,$3)", [email, ip, ok]);
  if (!ok) fail(401, "이메일 또는 비밀번호가 맞지 않습니다.");
  await q("UPDATE users SET last_login_at = now() WHERE id = $1", [u!.id]);
  await createSession(u!.id, ip, req.headers.get("user-agent"));
  const next = typeof b.next === "string" && b.next.startsWith("/") && !b.next.startsWith("//") ? b.next : "/";
  return json({ ok: true, redirect: next });
});
