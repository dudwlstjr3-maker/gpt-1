import { api, json, fail, isUuid } from "@/lib/http";
import { q1 } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const DELETE = api(async (_req, ctx) => {
  const v = await requireUser({ active: false });
  const { id } = await ctx.params;
  if (!isUuid(id)) fail(404, "글을 찾을 수 없습니다.");
  const r = await q1("UPDATE board_posts SET status = 'deleted', updated_at = now() WHERE id = $1 AND author_id = $2 AND status <> 'deleted' RETURNING 1", [id, v.id]);
  if (!r) fail(404, "삭제할 수 있는 글이 없습니다.");
  return json({ ok: true, redirect: "/lounge?tab=board" });
});
