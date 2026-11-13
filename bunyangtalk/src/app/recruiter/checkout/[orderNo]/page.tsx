import { notFound } from "next/navigation";
import { q1 } from "@/lib/db";
import { requirePageUser } from "@/lib/auth";
import { isMockPayment } from "@/lib/payments";
import { won } from "@/lib/format";
import { PageTitle } from "@/components/ui";
import { MockPayButton } from "@/components/MockPay";

export const dynamic = "force-dynamic";
export const metadata = { title: "광고 결제" };

export default async function Checkout({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const v = await requirePageUser(`/recruiter/checkout/${orderNo}`);
  const o = await q1(
    `SELECT o.order_no, o.amount, o.status, o.buyer_id, o.product_snapshot, j.title FROM ad_orders o LEFT JOIN job_posts j ON j.id = o.job_post_id WHERE o.order_no = $1`,
    [orderNo]);
  if (!o || o.buyer_id !== v.id) notFound();
  const p = o.product_snapshot as { name: string; duration_days: number };
  return (
    <div className="mx-auto max-w-md">
      <PageTitle title="광고 결제" />
      <div className="card p-5">
        <dl className="space-y-2 text-[15px]">
          <div className="flex justify-between"><dt className="text-muted">상품</dt><dd className="font-semibold">{p.name} ({p.duration_days}일)</dd></div>
          <div className="flex justify-between gap-4"><dt className="shrink-0 text-muted">광고 공고</dt><dd className="truncate">{o.title}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">주문번호</dt><dd className="font-mono text-[13px]">{o.order_no}</dd></div>
          <div className="flex justify-between border-t border-line pt-3 text-lg"><dt className="font-bold">결제 금액</dt><dd className="font-bold text-navy-900">{won(o.amount)}</dd></div>
        </dl>
        {o.status !== "pending" ? (
          <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm">이 주문은 이미 처리되었습니다 ({o.status}).</p>
        ) : isMockPayment() ? (
          <>
            <p className="mt-4 rounded-xl bg-ad-50 px-4 py-3 text-[13px] leading-relaxed text-ad-700">
              <b>시연용 결제</b> — 실제 결제대행사가 아직 연동되지 않아 돈이 청구되지 않습니다. 버튼을 누르면 서버가 주문 금액을 검증하고 광고를 시작합니다.
            </p>
            <MockPayButton orderNo={o.order_no} amount={o.amount} />
          </>
        ) : (
          <p className="mt-4 text-sm text-red-600">결제 모듈이 설정되지 않았습니다.</p>
        )}
      </div>
    </div>
  );
}
