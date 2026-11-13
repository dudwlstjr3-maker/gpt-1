import { notFound } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { requirePageUser } from "@/lib/auth";
import { isUuid } from "@/lib/http";
import { JobForm } from "@/components/JobForm";
import { PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function EditJob({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const v = await requirePageUser(`/jobs/${id}/edit`);
  const j = await q1(
    `SELECT id, company_id, site_id, title, ranks, headcount, rt_basis, rt_amount, rt_percent, rt_note, daily_pay,
            daily_pay_condition, settlement_schedule, to_char(start_date,'YYYY-MM-DD') AS start_date,
            to_char(deadline,'YYYY-MM-DD') AS deadline, contract_type, benefits, contact_name, contact_phone, description, status
       FROM job_posts WHERE id = $1`, [id]);
  if (!j || !v.verifiedCompanyIds.includes(j.company_id) || j.status === "closed") notFound();
  const sites = await q<{ id: string; name: string; region_name: string }>(
    "SELECT s.id, s.name, r.name AS region_name FROM sites s JOIN regions r ON r.code = s.region_code ORDER BY s.name LIMIT 300",
  );
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="공고 수정" sub="수정 전 내용은 이력으로 보관됩니다." />
      <div className="card p-5 lg:p-7">
        <JobForm sites={sites} companies={v.companies.filter((c) => c.status === "verified")} init={j} endpoint={`/api/jobs/${id}`} method="PATCH" />
      </div>
    </div>
  );
}
