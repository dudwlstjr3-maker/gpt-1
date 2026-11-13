"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// 결제대행사 위젯 자리. 실제 연동 시 결제창 → successUrl(paymentKey, orderId, amount) → 같은 /api/payments/confirm 호출
export function MockPayButton({ orderNo, amount }: { orderNo: string; amount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn-primary mt-4 w-full" disabled={busy} onClick={async () => {
      setBusy(true);
      const paymentKey = `mock_${crypto.randomUUID()}`;
      const r = await fetch("/api/payments/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNo, paymentKey, amount }),
      });
      const d = await r.json().catch(() => ({}));
      setBusy(false);
      if (!r.ok) return alert(d.error || "결제 승인에 실패했습니다.");
      router.push(d.redirect ?? "/recruiter?paid=1");
    }}>
      {busy ? "승인 중…" : "시연용 결제 승인"}
    </button>
  );
}
