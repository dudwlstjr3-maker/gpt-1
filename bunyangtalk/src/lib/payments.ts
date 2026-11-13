import "server-only";
import { randomUUID } from "node:crypto";

// 결제대행사 연동 지점. 운영 연동 시 TossPaymentsProvider(또는 포트원)를 구현해 교체한다.
// confirm: 클라이언트가 받은 paymentKey를 서버에서 결제사에 승인 요청 → 금액·주문번호 일치 확인
export type ConfirmResult = { ok: true; approvedAt: Date; raw: unknown } | { ok: false; message: string };

export interface PaymentProvider {
  name: string;
  confirm(input: { paymentKey: string; orderNo: string; amount: number }): Promise<ConfirmResult>;
  cancel(input: { paymentKey: string; reason: string }): Promise<{ ok: boolean; message?: string }>;
}

// 시연용: 실제 돈이 오가지 않는다. paymentKey가 mock_ 으로 시작해야 하고 'fail'을 포함하면 실패를 흉내낸다
const mockProvider: PaymentProvider = {
  name: "mock",
  async confirm({ paymentKey, orderNo, amount }) {
    if (!paymentKey.startsWith("mock_")) return { ok: false, message: "유효하지 않은 결제 키입니다." };
    if (paymentKey.includes("fail")) return { ok: false, message: "카드사 승인 거절(시연)" };
    return { ok: true, approvedAt: new Date(), raw: { provider: "mock", paymentKey, orderNo, amount, txId: randomUUID() } };
  },
  async cancel() {
    return { ok: true };
  },
};

export function paymentProvider(): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER || "mock";
  if (name === "mock") return mockProvider;
  throw new Error(`결제 제공자 '${name}'는 아직 연동되지 않았습니다.`);
}

export const isMockPayment = () => (process.env.PAYMENT_PROVIDER || "mock") === "mock";
