import { api, body, json, fail, str, oneOf } from "@/lib/http";
import { q, q1 } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { REPORT_REASONS, keys } from "@/lib/constants";
import { resolveAuthor, TARGET_TYPES, type TargetType } from "@/lib/targets";

export const POST = api(async (req) => {
  const v = await requireUser({ active: false });
  const b = await body(req);
  const type = oneOf(b, "targetType", TARGET_TYPES, { name: "신고 대상" }) as TargetType;
  const targetId = str(b, "targetId", { max: 64 })!;
  const reason = oneOf(b, "reason", keys(REPORT_REASONS), { name: "신고 사유" })!;
  const detail = str(b, "detail", { max: 1000, optional: true });
  const author = await resolveAuthor(type, targetId);
  if (author.userId === v.id) fail(400, "본인 글은 신고할 수 없습니다.");
  const daily = await q1<{ n: number }>("SELECT count(*)::int AS n FROM reports WHERE reporter_id = $1 AND created_at > now() - interval '1 day'", [v.id]);
  if ((daily?.n ?? 0) >= 30) fail(429, "오늘 신고 가능한 횟수를 넘었습니다.");
  const r = await q(
    `INSERT INTO reports(reporter_id, target_type, target_id, target_user_id, reason, detail) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING RETURNING id`,
    [v.id, type, targetId, author.userId, reason, detail],
  );
  return json({ ok: true, duplicate: r.length === 0 });
});
