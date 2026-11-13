import { api, json, fail, isUuid } from "@/lib/http";
import { q, q1, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const POST = api(async (_req, ctx) => {
  const v = await requireUser();
  const { id } = await ctx.params;
  if (!isUuid(id)) fail(404, "글을 찾을 수 없습니다.");
  const liked = await tx(async (c) => {
    const p = await q1("SELECT 1 FROM board_posts WHERE id = $1 AND status = 'visible' FOR UPDATE", [id], c);
    if (!p) fail(404, "글을 찾을 수 없습니다.");
    const del = await q("DELETE FROM board_likes WHERE post_id = $1 AND user_id = $2 RETURNING 1", [id, v.id], c);
    if (del.length) {
      await c.query("UPDATE board_posts SET like_count = like_count - 1 WHERE id = $1", [id]);
      return false;
    }
    await c.query("INSERT INTO board_likes(post_id, user_id) VALUES ($1,$2)", [id, v.id]);
    await c.query("UPDATE board_posts SET like_count = like_count + 1 WHERE id = $1", [id]);
    return true;
  });
  return json({ ok: true, liked });
});
