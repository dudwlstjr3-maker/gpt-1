import Link from "next/link";
import { q } from "@/lib/db";
import { requirePageUser } from "@/lib/auth";
import { JOB_STATUS } from "@/lib/constants";
import { won, ymd } from "@/lib/format";
import { JsonForm } from "@/components/client";
import { PageTitle, Pill, Empty, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "구인자 관리" };

export default async function Recruiter({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const v = await requirePageUser("/recruiter");
  const { paid } = await searchParams;
  const verified = v.verifiedCompanyIds;
  const [jobs, products, orders] = await Promise.all([
    verified.length ? q(
      `SELECT j.id, j.title, j.status, j.reject_reason, j.view_count, j.created_at, s.name AS site_name,
              (SELECT count(*)::int FROM job_events e WHERE e.job_post_id = j.id AND e.event_type = 'contact_click') AS contacts,
              (SELECT json_build_object('type', a.product_type, 'ends', a.ends_at, 'imp', (SELECT count(*) FROM ad_events x WHERE x.campaign_id = a.id AND x.event_type = 'impression'),
                       'clk', (SELECT count(*) FROM ad_events x WHERE x.campaign_id = a.id AND x.event_type = 'click'))
                 FROM ad_campaigns a WHERE a.job_post_id = j.id AND a.status = 'active' AND now() BETWEEN a.starts_at AND a.ends_at
                ORDER BY a.ends_at DESC LIMIT 1) AS ad
         FROM job_posts j JOIN sites s ON s.id = j.site_id WHERE j.company_id = ANY($1) ORDER BY j.created_at DESC LIMIT 100`, [verified]) : [],
    q("SELECT code, name, type, duration_days, price, description FROM ad_products WHERE is_active AND type IN ('premium_job','vip_job') ORDER BY sort, price"),
    verified.length ? q(
      `SELECT o.order_no, o.amount, o.status, o.created_at, o.product_snapshot->>'name' AS product, j.title,
              a.starts_at, a.ends_at, a.status AS campaign_status
         FROM ad_orders o LEFT JOIN job_posts j ON j.id = o.job_post_id LEFT JOIN ad_campaigns a ON a.order_id = o.id
        WHERE o.company_id = ANY($1) ORDER BY o.created_at DESC LIMIT 30`, [verified]) : [],
  ]);
  const published = jobs.filter((j) => j.status === "published");
  const totals = jobs.reduce((t, j) => ({ views: t.views + j.view_count, contacts: t.contacts + j.contacts }), { views: 0, contacts: 0 });

  return (
    <div className="mx-auto max-w-5xl">
      <PageTitle title="구인자 관리" sub="공고 등록·마감, 광고 신청과 성과를 관리합니다."
        right={verified.length ? <Link href="/jobs/new" className="btn-primary btn-sm">공고 등록</Link> : undefined} />
      {paid && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">결제가 완료되어 광고가 시작되었습니다.</p>}

      <section className="card mb-4 p-5">
        <h2 className="section-title">소속 기업</h2>
        {v.companies.length ? (
          <ul className="mt-2 divide-y divide-line">
            {v.companies.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-2.5 text-[15px]">
                <span className="font-semibold">{c.name}</span>
                <Pill tone={c.status === "verified" ? "green" : c.status === "rejected" ? "red" : "gray"}>{c.status === "verified" ? "인증 완료" : c.status === "rejected" ? "반려" : "심사 중"}</Pill>
                {c.role === "owner" && <span className="text-[12px] text-muted">기업 관리자</span>}
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-sm text-muted">구인공고를 등록하려면 기업 인증이 필요합니다. 일반 공고 등록은 무료입니다.</p>}
        <details className="mt-3" open={!v.companies.length}>
          <summary className="cursor-pointer text-sm font-semibold text-brand-700">기업 인증 신청</summary>
          <JsonForm endpoint="/api/companies" submitLabel="인증 신청" submitClass="btn-navy btn-sm" success="신청했습니다. 운영자 확인 후 공고를 등록할 수 있습니다." className="mt-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <input name="name" className="input" placeholder="회사명 (분양대행사 등)" />
              <input name="businessNumber" className="input" placeholder="사업자등록번호 10자리" inputMode="numeric" />
              <input name="representative" className="input" placeholder="대표자명" />
            </div>
            <p className="mt-2 text-xs text-muted">운영자가 사업자 상태를 확인합니다. 사업자등록증명원 제출은 운영자 안내에 따라 진행됩니다 (파일 업로드는 다음 버전).</p>
          </JsonForm>
        </details>
      </section>

      {verified.length > 0 && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="게시 중 공고" value={published.length} />
            <Stat label="누적 조회" value={totals.views.toLocaleString()} />
            <Stat label="문의(연락처 보기)" value={totals.contacts.toLocaleString()} />
            <Stat label="문의 전환율" value={totals.views ? `${((totals.contacts / totals.views) * 100).toFixed(1)}%` : "-"} />
          </div>

          <section className="card mb-4 overflow-hidden">
            <h2 className="section-title px-5 pt-5">내 공고</h2>
            {jobs.length ? (
              <ul className="mt-3 divide-y divide-line">
                {jobs.map((j) => (
                  <li key={j.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={j.status === "published" ? "green" : j.status === "rejected" ? "red" : "gray"}>{JOB_STATUS[j.status]}</Pill>
                      {j.ad && <Pill tone="amber">{j.ad.type === "vip_job" ? "VIP" : "프리미엄"} ~{ymd(j.ad.ends)}</Pill>}
                      <Link href={`/jobs/${j.id}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">{j.title}</Link>
                    </div>
                    <p className="mt-1 text-[13px] text-muted">
                      {j.site_name} · 등록 {ymd(j.created_at)} · 조회 {j.view_count} · 문의 {j.contacts}
                      {j.ad && <> · 광고 노출 {j.ad.imp} · 클릭 {j.ad.clk}</>}
                    </p>
                    {j.reject_reason && <p className="mt-1 text-[13px] text-red-600">사유: {j.reject_reason}</p>}
                    {j.status === "published" && products.length > 0 && (
                      <JsonForm endpoint="/api/ads/orders" extra={{ jobId: j.id }} submitLabel="광고 신청" submitClass="btn-primary btn-sm" className="mt-2 flex flex-wrap items-end gap-2 [&>button]:mt-0">
                        <select name="productCode" className="input h-9 w-auto text-sm">
                          {products.map((p) => <option key={p.code} value={p.code}>{p.name} · {p.duration_days}일 · {won(p.price)}</option>)}
                        </select>
                      </JsonForm>
                    )}
                  </li>
                ))}
              </ul>
            ) : <div className="p-5"><Empty action={<Link href="/jobs/new" className="btn-primary btn-sm">첫 공고 등록</Link>}>등록한 공고가 없습니다.</Empty></div>}
          </section>

          <section className="card overflow-hidden">
            <h2 className="section-title px-5 pt-5">광고 주문 내역</h2>
            {orders.length ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-surface-2 text-muted"><tr><th className="px-5 py-2">주문번호</th><th>상품</th><th>공고</th><th>금액</th><th>상태</th><th>노출 기간</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {orders.map((o) => (
                      <tr key={o.order_no}>
                        <td className="px-5 py-2.5 font-mono text-[12px]">{o.order_no}</td><td>{o.product}</td><td className="max-w-48 truncate">{o.title}</td><td>{won(o.amount)}</td>
                        <td>{o.status === "pending" ? <Link href={`/recruiter/checkout/${o.order_no}`} className="font-semibold text-brand-700">결제 대기</Link> : o.status === "paid" ? "결제 완료" : o.status === "refunded" ? "환불" : o.status}</td>
                        <td className="text-[12px] text-muted">{o.starts_at ? `${ymd(o.starts_at)} ~ ${ymd(o.ends_at)}` : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="px-5 pb-5 pt-2 text-sm text-muted">광고 주문 내역이 없습니다.</p>}
          </section>
        </>
      )}
    </div>
  );
}
