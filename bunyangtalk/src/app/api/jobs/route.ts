import { api, body, json, fail, isUuid } from "@/lib/http";
import { tx, q1 } from "@/lib/db";
import { requireUser, activeSanction } from "@/lib/auth";
import { parseJob, resolveSite } from "@/lib/jobInput";

export const POST = api(async (req) => {
  const v = await requireUser();
  const b = await body(req);
  // 직업정보제공사업자 의무: 기업 정보를 확인한 구인자만 공고 등록
  if (!v.verifiedCompanyIds.length) fail(403, "기업 인증을 마친 구인자만 공고를 등록할 수 있습니다.");
  const companyId = isUuid(b.companyId) ? b.companyId : v.verifiedCompanyIds[0];
  if (!v.verifiedCompanyIds.includes(companyId)) fail(403, "인증된 소속 기업을 선택해 주세요.");
  if (await activeSanction(v.id, "post_ban")) fail(403, "게시 제한 중인 계정입니다.");
  const j = parseJob(b);
  const daily = await q1<{ n: number }>(
    "SELECT count(*)::int AS n FROM job_posts WHERE company_id = $1 AND created_at > now() - interval '1 day'",
    [companyId],
  );
  if ((daily?.n ?? 0) >= 30) fail(429, "하루 등록 가능한 공고 수를 넘었습니다.");

  const id = await tx(async (c) => {
    const site = await resolveSite(b, v.id, c);
    const r = await q1<{ id: string }>(
      `INSERT INTO job_posts(company_id, author_id, site_id, region_code, title, ranks, headcount, rt_basis, rt_amount, rt_percent,
         rt_note, daily_pay, daily_pay_condition, settlement_schedule, start_date, deadline, contract_type, benefits,
         contact_name, contact_phone, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
      [companyId, v.id, site.id, site.region, j.title, j.ranks, j.headcount, j.rtBasis, j.rtAmount, j.rtPercent,
       j.rtNote, j.dailyPay, j.dailyPayCondition, j.settlementSchedule, j.startDate, j.deadline, j.contractType, j.benefits,
       j.contactName, j.contactPhone, j.description],
      c,
    );
    return r!.id;
  });
  return json({ ok: true, id, redirect: `/jobs/${id}` }, 201);
});
