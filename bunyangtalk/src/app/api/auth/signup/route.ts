import { api, body, str, json, fail, clientIp } from "@/lib/http";
import { tx, q1 } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { validateNickname, randomNickname } from "@/lib/nickname";

export const POST = api(async (req) => {
  const b = await body(req);
  const email = str(b, "email", { max: 254, name: "이메일" })!.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "이메일 형식을 확인해 주세요.");
  const password = str(b, "password", { min: 8, max: 72, name: "비밀번호" })!;
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) fail(400, "비밀번호는 영문과 숫자를 함께 써 주세요.");
  if (b.agreeTerms !== true && b.agreeTerms !== "on") fail(400, "이용약관에 동의해 주세요.");
  if (b.agreePrivacy !== true && b.agreePrivacy !== "on") fail(400, "개인정보 수집·이용에 동의해 주세요.");
  const marketing = b.agreeMarketing === true || b.agreeMarketing === "on";
  const wanted = str(b, "nickname", { optional: true });
  const nickname = wanted ? validateNickname(wanted) : null;

  if (await q1("SELECT 1 FROM users WHERE email = $1", [email])) fail(409, "이미 가입된 이메일입니다.");
  const hash = await hashPassword(password);
  const userId = await tx(async (c) => {
    const nick = nickname ?? (await randomNickname(c));
    if (await q1("SELECT 1 FROM profiles WHERE nickname = $1", [nick], c)) fail(409, "이미 쓰이는 닉네임입니다.");
    const u = await q1<{ id: string }>(
      "INSERT INTO users(email, password_hash, terms_agreed_at, privacy_agreed_at) VALUES ($1,$2,now(),now()) RETURNING id",
      [email, hash],
      c,
    );
    await c.query("INSERT INTO profiles(user_id, nickname) VALUES ($1,$2)", [u!.id, nick]);
    await c.query("INSERT INTO nickname_history(user_id, nickname) VALUES ($1,$2)", [u!.id, nick]);
    await c.query(
      "INSERT INTO notification_settings(user_id, marketing_opt_in, marketing_opt_in_at) VALUES ($1,$2,$3)",
      [u!.id, marketing, marketing ? new Date() : null],
    );
    return u!.id;
  });
  await createSession(userId, clientIp(req), req.headers.get("user-agent"));
  return json({ ok: true, redirect: "/" }, 201);
});
