import { api, json, fail, isUuid } from "@/lib/http";
import { q, q1 } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const POST = api(async (_req, ctx) => {
  const v = await requireUser({ active: false });
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await q1("SELECT 1 FROM sites WHERE id = $1", [id]))) fail(404, "현장을 찾을 수 없습니다.");
  const del = await q("DELETE FROM saved_sites WHERE user_id = $1 AND site_id = $2 RETURNING 1", [v.id, id]);
  if (del.length) return json({ ok: true, saved: false });
  await q("INSERT INTO saved_sites(user_id, site_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [v.id, id]);
  return json({ ok: true, saved: true });
});
