import { api, json, fail, isUuid } from "@/lib/http";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const DELETE = api(async (_req, ctx) => {
  const v = await requireUser({ active: false });
  const { id } = await ctx.params;
  if (!isUuid(id)) fail(404, "차단 기록을 찾을 수 없습니다.");
  const r = await q("DELETE FROM user_blocks WHERE id = $1 AND blocker_id = $2 RETURNING 1", [id, v.id]);
  if (!r.length) fail(404, "차단 기록을 찾을 수 없습니다.");
  return json({ ok: true });
});
