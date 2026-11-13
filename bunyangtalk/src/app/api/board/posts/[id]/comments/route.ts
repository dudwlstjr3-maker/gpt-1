import { api, body, json, fail, str, isUuid } from "@/lib/http";
import { q1, tx } from "@/lib/db";
import { requireUser, activeSanction } from "@/lib/auth";

export const POST = api(async (req, ctx) => {
  const v = await requireUser();
  if (await activeSanction(v.id, "post_ban")) fail(403, "게시 제한 중인 계정입니다.");
  const { id } = await ctx.params;
  if (!isUuid(id)) fail(404, "글을 찾을 수 없습니다.");
  const text = str(await body(req), "body", { max: 1000, name: "댓글" })!;
  const recent = await q1<{ n: number }>("SELECT count(*)::int AS n FROM board_comments WHERE author_id = $1 AND created_at > now() - interval '1 minute'", [v.id]);
  if (!v.isOperator && (recent?.n ?? 0) >= 10) fail(429, "댓글을 너무 빠르게 쓰고 있습니다.");
  await tx(async (c) => {
    const p = await q1("SELECT 1 FROM board_posts WHERE id = $1 AND status = 'visible' FOR UPDATE", [id], c);
    if (!p) fail(404, "글을 찾을 수 없습니다.");
    await c.query("INSERT INTO board_comments(post_id, author_id, author_nickname, body) VALUES ($1,$2,$3,$4)", [id, v.id, v.nickname, text]);
    await c.query("UPDATE board_posts SET comment_count = comment_count + 1 WHERE id = $1", [id]);
  });
  return json({ ok: true }, 201);
});
