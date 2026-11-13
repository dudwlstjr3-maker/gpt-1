import Link from "next/link";
import { q } from "@/lib/db";
import { requirePageUser } from "@/lib/auth";
import { JobForm } from "@/components/JobForm";
import { PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "구인공고 등록" };

export default async function NewJob() {
  const v = await requirePageUser("/jobs/new");
  const companies = v.companies.filter((c) => c.status === "verified");
  if (!companies.length) {
    const pending = v.companies.some((c) => c.status === "pending");
    return (
      <div className="mx-auto max-w-xl">
        <PageTitle title="구인공고 등록" />
        <div className="card p-6 text-[15px] leading-relaxed">
          <p className="font-bold">{pending ? "기업 인증을 검토하고 있습니다." : "기업 인증이 필요합니다."}</p>
          <p className="mt-2 text-muted">허위 공고를 막기 위해 사업자 정보를 확인한 구인자만 공고를 등록할 수 있습니다. 일반 구인공고 등록은 무료입니다.</p>
          <Link href="/recruiter" className="btn-primary mt-5 w-full">{pending ? "인증 상태 보기" : "기업 인증 신청하기"}</Link>
        </div>
      </div>
    );
  }
  const sites = await q<{ id: string; name: string; region_name: string }>(
    "SELECT s.id, s.name, r.name AS region_name FROM sites s JOIN regions r ON r.code = s.region_code WHERE s.status <> 'closed' ORDER BY s.name LIMIT 300",
  );
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="구인공고 등록" sub="일반 공고는 무료입니다. 게시 후 프리미엄 광고로 상단에 노출할 수 있습니다." />
      <div className="card p-5 lg:p-7">
        <JobForm sites={sites} companies={companies} endpoint="/api/jobs" method="POST" />
      </div>
    </div>
  );
}
