import { api, json, fail, isUuid } from "@/lib/http";
import { q1, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const DELETE = api(async (_req, ctx) => {
  const v = await requireUser({ active: false });
  const { id } = await ctx.params;
  if (!isUuid(id)) fail(404, "댓글을 찾을 수 없습니다.");
  await tx(async (c) => {
    const r = await q1<{ post_id: string }>(
      "UPDATE board_comments SET status = 'deleted' WHERE id = $1 AND author_id = $2 AND status = 'visible' RETURNING post_id",
      [id, v.id],
      c,
    );
    if (!r) fail(404, "삭제할 수 있는 댓글이 없습니다.");
    await c.query("UPDATE board_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = $1", [r!.post_id]);
  });
  return json({ ok: true });
});
