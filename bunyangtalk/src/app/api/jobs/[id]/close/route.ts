import { api, json, fail, isUuid } from "@/lib/http";
import { q1 } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const POST = api(async (_req, ctx) => {
  const v = await requireUser();
  const { id } = await ctx.params;
  if (!isUuid(id)) fail(404, "공고를 찾을 수 없습니다.");
  const job = await q1<{ company_id: string }>("SELECT company_id FROM job_posts WHERE id = $1", [id]);
  if (!job) fail(404, "공고를 찾을 수 없습니다.");
  if (!v.verifiedCompanyIds.includes(job!.company_id)) fail(403, "이 공고를 마감할 권한이 없습니다.");
  await q1("UPDATE job_posts SET status = 'closed', closed_at = now(), updated_at = now() WHERE id = $1 AND status <> 'closed'", [id]);
  return json({ ok: true });
});
