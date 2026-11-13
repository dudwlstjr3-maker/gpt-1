import { api, body, json, fail, isUuid } from "@/lib/http";
import { tx, q1 } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseJob, resolveSite } from "@/lib/jobInput";

export const PATCH = api(async (req, ctx) => {
  const v = await requireUser();
  const { id } = await ctx.params;
  if (!isUuid(id)) fail(404, "공고를 찾을 수 없습니다.");
  const b = await body(req);
  const j = parseJob(b);
  await tx(async (c) => {
    const cur = await q1("SELECT * FROM job_posts WHERE id = $1 FOR UPDATE", [id], c);
    if (!cur) fail(404, "공고를 찾을 수 없습니다.");
    if (!v.verifiedCompanyIds.includes(cur!.company_id)) fail(403, "이 공고를 수정할 권한이 없습니다.");
    if (cur!.status === "closed") fail(409, "마감된 공고는 수정할 수 없습니다.");
    const site = await resolveSite(b, v.id, c);
    // 수정 직전 상태를 이력으로 남긴다 (관리자 '공고 수정 이력')
    await c.query("INSERT INTO job_post_revisions(job_post_id, editor_id, snapshot) VALUES ($1,$2,$3)", [id, v.id, cur]);
    // 반려된 공고를 고치면 다시 심사 대기로
    await c.query(
      `UPDATE job_posts SET site_id=$2, region_code=$3, title=$4, ranks=$5, headcount=$6, rt_basis=$7, rt_amount=$8, rt_percent=$9,
         rt_note=$10, daily_pay=$11, daily_pay_condition=$12, settlement_schedule=$13, start_date=$14, deadline=$15,
         contract_type=$16, benefits=$17, contact_name=$18, contact_phone=$19, description=$20, updated_at=now(),
         status = CASE WHEN status = 'rejected' THEN 'pending' ELSE status END
       WHERE id = $1`,
      [id, site.id, site.region, j.title, j.ranks, j.headcount, j.rtBasis, j.rtAmount, j.rtPercent, j.rtNote, j.dailyPay,
       j.dailyPayCondition, j.settlementSchedule, j.startDate, j.deadline, j.contractType, j.benefits, j.contactName,
       j.contactPhone, j.description],
    );
  });
  return json({ ok: true, redirect: `/jobs/${id}` });
});
