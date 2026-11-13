import { api, body, json, fail } from "@/lib/http";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { resolveAuthor, TARGET_TYPES, type TargetType } from "@/lib/targets";

export const POST = api(async (req) => {
  const v = await requireUser({ active: false });
  const b = await body(req);
  const type = String(b.targetType) as TargetType;
  if (!TARGET_TYPES.includes(type)) fail(400, "차단할 수 없는 대상입니다.");
  const author = await resolveAuthor(type, String(b.targetId ?? ""));
  if (author.userId === v.id) fail(400, "자기 자신은 차단할 수 없습니다.");
  await q(
    "INSERT INTO user_blocks(blocker_id, blocked_id, blocked_nickname) VALUES ($1,$2,$3) ON CONFLICT (blocker_id, blocked_id) DO NOTHING",
    [v.id, author.userId, author.nickname],
  );
  return json({ ok: true, nickname: author.nickname });
});
