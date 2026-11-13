import { api, body, json, fail, str, int } from "@/lib/http";
import { q1, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { paymentProvider } from "@/lib/payments";

// 결제 승인: 금액·주문번호를 서버에서 다시 확인하고, 주문 행 잠금 + 유일 인덱스로 중복 활성화를 막는다
export const POST = api(async (req) => {
  const v = await requireUser();
  const b = await body(req);
  const orderNo = str(b, "orderNo", { max: 40 })!;
  const paymentKey = str(b, "paymentKey", { max: 200 })!;
  const amount = int(b, "amount", { min: 0 })!;
  const provider = paymentProvider();

  const result = await tx(async (c) => {
    const o = await q1("SELECT * FROM ad_orders WHERE order_no = $1 FOR UPDATE", [orderNo], c);
    if (!o) fail(404, "주문을 찾을 수 없습니다.");
    if (o!.buyer_id !== v.id) fail(403, "본인 주문만 결제할 수 있습니다.");
    if (o!.status === "paid") {
      const p = await q1("SELECT payment_key FROM payments WHERE order_id = $1 AND status = 'approved'", [o!.id], c);
      if (p?.payment_key === paymentKey) return { already: true };
      fail(409, "이미 결제가 완료된 주문입니다.");
    }
    if (o!.status !== "pending") fail(409, "결제할 수 없는 주문 상태입니다.");
    if (o!.amount !== amount) fail(400, "결제 금액이 주문 금액과 다릅니다.");

    const r = await provider.confirm({ paymentKey, orderNo, amount });
    if (!r.ok) {
      await c.query("UPDATE ad_orders SET status = 'failed' WHERE id = $1", [o!.id]);
      return { failed: r.message };
    }
    await c.query(
      "INSERT INTO payments(order_id, provider, payment_key, amount, status, raw, approved_at) VALUES ($1,$2,$3,$4,'approved',$5,$6)",
      [o!.id, provider.name, paymentKey, amount, r.raw, r.approvedAt],
    );
    await c.query("UPDATE ad_orders SET status = 'paid', paid_at = now() WHERE id = $1", [o!.id]);
    const snap = o!.product_snapshot as { type: string; duration_days: number };
    // 같은 공고에 같은 종류 광고가 진행 중이면 그 종료 시점부터 이어서 연장
    const last = await q1<{ ends_at: Date }>(
      `SELECT max(ends_at) AS ends_at FROM ad_campaigns
        WHERE job_post_id = $1 AND product_type = $2 AND status = 'active' AND ends_at > now()`,
      [o!.job_post_id, snap.type],
      c,
    );
    const start = last?.ends_at ? new Date(last.ends_at) : new Date();
    const end = new Date(start.getTime() + snap.duration_days * 86400000);
    await c.query(
      "INSERT INTO ad_campaigns(order_id, product_type, job_post_id, starts_at, ends_at) VALUES ($1,$2,$3,$4,$5)",
      [o!.id, snap.type, o!.job_post_id, start, end],
    );
    return { ok: true, startsAt: start, endsAt: end };
  });
  if ("failed" in result) return json({ error: result.failed }, 402);
  return json({ ok: true, ...result, redirect: "/recruiter?paid=1" });
});
