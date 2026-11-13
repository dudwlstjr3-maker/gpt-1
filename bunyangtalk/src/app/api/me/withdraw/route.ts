import { api, body, json, fail, str } from "@/lib/http";
import { q1, tx } from "@/lib/db";
import { requireUser, verifyPassword, destroySession } from "@/lib/auth";

// 탈퇴: 로그인 정보·프로필 식별정보를 즉시 비식별화. 결제 기록은 전자상거래법상 5년 보존 대상이라 남긴다
export const POST = api(async (req) => {
  const v = await requireUser({ active: false });
  const pw = str(await body(req), "password", { name: "비밀번호" })!;
  const u = await q1<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [v.id]);
  if (!u || !(await verifyPassword(pw, u.password_hash))) fail(401, "비밀번호가 맞지 않습니다.");
  if (v.companies.some((c) => c.role === "owner")) fail(409, "기업 관리자는 탈퇴 전에 운영자에게 기업 관리 권한 이전을 요청해 주세요.");
  await tx(async (c) => {
    const anon = `withdrawn-${v.id}@invalid.local`;
    await c.query(
      "UPDATE users SET email = $2, password_hash = 'withdrawn', status = 'withdrawn', withdrawn_at = now(), updated_at = now() WHERE id = $1",
      [v.id, anon],
    );
    await c.query("UPDATE profiles SET nickname = $2, preferred_region = NULL, preferred_rank = NULL WHERE user_id = $1", [v.id, `탈퇴한 회원 ${v.id.slice(0, 6)}`]);
    await c.query("DELETE FROM sessions WHERE user_id = $1", [v.id]);
    await c.query("DELETE FROM saved_jobs WHERE user_id = $1", [v.id]);
    await c.query("DELETE FROM saved_sites WHERE user_id = $1", [v.id]);
    await c.query("DELETE FROM company_members WHERE user_id = $1", [v.id]);
    await c.query("UPDATE notification_settings SET marketing_opt_in = false, marketing_opt_out_at = now() WHERE user_id = $1", [v.id]);
  });
  await destroySession();
  return json({ ok: true, redirect: "/" });
});
