import { api, body, json, fail, str, isUuid } from "@/lib/http";
import { q1 } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { randomBytes } from "node:crypto";

export const POST = api(async (req) => {
  const v = await requireUser();
  const b = await body(req);
  const code = str(b, "productCode", { max: 40, name: "광고 상품" })!;
  const product = await q1("SELECT id, code, name, type, duration_days, price FROM ad_products WHERE code = $1 AND is_active", [code]);
  if (!product) fail(404, "판매 중인 광고 상품이 아닙니다.");
  if (product!.type !== "premium_job" && product!.type !== "vip_job") fail(400, "이 상품은 운영자와 별도 협의로 진행됩니다.");
  if (!isUuid(b.jobId)) fail(400, "광고할 공고를 선택해 주세요.");
  const job = await q1<{ company_id: string; status: string }>("SELECT company_id, status FROM job_posts WHERE id = $1", [b.jobId]);
  if (!job || !v.verifiedCompanyIds.includes(job.company_id)) fail(403, "소속 기업의 공고만 광고할 수 있습니다.");
  if (job!.status !== "published") fail(409, "게시 중인 공고만 광고할 수 있습니다.");
  // 같은 공고·상품으로 결제 안 된 주문이 있으면 그것을 재사용 (중복 주문 방지)
  const existing = await q1<{ order_no: string }>(
    "SELECT order_no FROM ad_orders WHERE buyer_id = $1 AND job_post_id = $2 AND product_id = $3 AND status = 'pending' AND created_at > now() - interval '1 hour'",
    [v.id, b.jobId, product!.id],
  );
  if (existing) return json({ ok: true, orderNo: existing.order_no, redirect: `/recruiter/checkout/${existing.order_no}` });
  const d = new Date();
  const orderNo = `BT${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${randomBytes(5).toString("hex").toUpperCase()}`;
  await q1(
    `INSERT INTO ad_orders(order_no, buyer_id, company_id, product_id, job_post_id, product_snapshot, amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [orderNo, v.id, job!.company_id, product!.id, b.jobId,
     { code: product!.code, name: product!.name, type: product!.type, duration_days: product!.duration_days, price: product!.price },
     product!.price],
  );
  return json({ ok: true, orderNo, redirect: `/recruiter/checkout/${orderNo}` }, 201);
});
