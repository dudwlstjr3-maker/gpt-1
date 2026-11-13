import { api, body, json, fail, str, oneOf, isUuid } from "@/lib/http";
import { q1 } from "@/lib/db";
import { requireUser, activeSanction } from "@/lib/auth";
import { BOARD_CATEGORIES, keys } from "@/lib/constants";

export const POST = api(async (req) => {
  const v = await requireUser();
  if (await activeSanction(v.id, "post_ban")) fail(403, "게시 제한 중인 계정입니다.");
  const b = await body(req);
  const category = oneOf(b, "category", keys(BOARD_CATEGORIES), { name: "말머리" })!;
  const title = str(b, "title", { min: 2, max: 100, name: "제목" })!;
  const text = str(b, "body", { min: 2, max: 5000, name: "내용" })!;
  const siteId = isUuid(b.siteId) ? b.siteId : null;
  const recent = await q1<{ n: number }>("SELECT count(*)::int AS n FROM board_posts WHERE author_id = $1 AND created_at > now() - interval '1 minute'", [v.id]);
  if (!v.isOperator && (recent?.n ?? 0) >= 1) fail(429, "글은 1분에 한 번만 쓸 수 있습니다.");
  const r = await q1<{ id: string }>(
    "INSERT INTO board_posts(author_id, author_nickname, author_badge, category, site_id, title, body) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [v.id, v.nickname, v.badge, category, siteId, title, text],
  );
  return json({ ok: true, id: r!.id, redirect: `/lounge/board/${r!.id}` }, 201);
});
