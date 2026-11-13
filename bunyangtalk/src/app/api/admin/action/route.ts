import type { PoolClient } from "pg";
import { api, body, json, fail, str, int, oneOf, isUuid, clientIp } from "@/lib/http";
import { q1 } from "@/lib/db";
import { tx } from "@/lib/db";
import { requireUser, type Viewer } from "@/lib/auth";
import { publish } from "@/lib/chat";
import { paymentProvider } from "@/lib/payments";

type B = Record<string, unknown>;
type Out = { targetType: string; targetId: string; detail?: unknown };
type Action = { role: "operator" | "super_admin"; run: (c: PoolClient, b: B, v: Viewer) => Promise<Out> };

const id = (b: B, key = "id") => {
  const v = b[key];
  if (!isUuid(v)) fail(400, "대상 ID가 올바르지 않습니다.");
  return v as string;
};
const one = async (c: PoolClient, sql: string, params: unknown[], msg = "대상을 찾을 수 없습니다.") => {
  const r = await q1(sql, params, c);
  if (!r) fail(404, msg);
  return r!;
};

async function hideTarget(c: PoolClient, type: string, targetId: string, v: Viewer) {
  if (type === "chat_message") {
    const m = await q1<{ room_id: string }>(
      "UPDATE chat_messages SET body = NULL, deleted_at = now(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING room_id",
      [targetId, v.id], c);
    if (m) await publish({ type: "delete", roomId: m.room_id, id: Number(targetId) }, c);
  } else if (type === "board_post") {
    await c.query("UPDATE board_posts SET status = 'hidden', updated_at = now() WHERE id = $1 AND status = 'visible'", [targetId]);
  } else if (type === "board_comment") {
    const r = await q1<{ post_id: string }>("UPDATE board_comments SET status = 'hidden' WHERE id = $1 AND status = 'visible' RETURNING post_id", [targetId], c);
    if (r) await c.query("UPDATE board_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = $1", [r.post_id]);
  } else if (type === "job_post") {
    await c.query("UPDATE job_posts SET status = 'closed', closed_at = now(), reject_reason = '신고 처리로 게시 중단' WHERE id = $1", [targetId]);
  }
}

async function sanction(c: PoolClient, userId: string, type: string, days: number, reason: string, v: Viewer) {
  await c.query(
    "INSERT INTO user_sanctions(user_id, type, reason, ends_at, created_by) VALUES ($1,$2,$3, now() + make_interval(days => $4), $5)",
    [userId, type, reason, days, v.id],
  );
}

const ACTIONS: Record<string, Action> = {
  // ───── 기업 인증
  "company.verify": { role: "operator", run: async (c, b, v) => {
    const cid = id(b);
    await one(c, "UPDATE companies SET verification_status = 'verified', verified_at = now(), verified_by = $2, reject_reason = NULL WHERE id = $1 RETURNING 1", [cid, v.id]);
    await c.query("UPDATE company_verification_docs SET purge_after = now() + interval '30 days' WHERE company_id = $1", [cid]);
    return { targetType: "company", targetId: cid };
  } },
  "company.reject": { role: "operator", run: async (c, b, v) => {
    const cid = id(b);
    const reason = str(b, "reason", { max: 200, name: "반려 사유" })!;
    await one(c, "UPDATE companies SET verification_status = 'rejected', reject_reason = $2, verified_by = $3 WHERE id = $1 RETURNING 1", [cid, reason, v.id]);
    return { targetType: "company", targetId: cid, detail: { reason } };
  } },
  // ───── 공고 심사
  "job.approve": { role: "operator", run: async (c, b) => {
    const jid = id(b);
    await one(c, "UPDATE job_posts SET status = 'published', published_at = COALESCE(published_at, now()), reject_reason = NULL, updated_at = now() WHERE id = $1 AND status IN ('pending','rejected') RETURNING 1", [jid], "심사 대기 중인 공고가 아닙니다.");
    return { targetType: "job_post", targetId: jid };
  } },
  "job.reject": { role: "operator", run: async (c, b) => {
    const jid = id(b);
    const reason = str(b, "reason", { max: 200, name: "반려 사유" })!;
    await one(c, "UPDATE job_posts SET status = 'rejected', reject_reason = $2, updated_at = now() WHERE id = $1 AND status IN ('pending','published') RETURNING 1", [jid, reason]);
    return { targetType: "job_post", targetId: jid, detail: { reason } };
  } },
  "job.close": { role: "operator", run: async (c, b) => {
    const jid = id(b);
    await one(c, "UPDATE job_posts SET status = 'closed', closed_at = now(), updated_at = now() WHERE id = $1 AND status <> 'closed' RETURNING 1", [jid]);
    return { targetType: "job_post", targetId: jid };
  } },
  // ───── 신고 처리
  "report.action": { role: "operator", run: async (c, b, v) => {
    const rid = id(b);
    const r = await one(c, "SELECT target_type, target_id, target_user_id FROM reports WHERE id = $1 AND status = 'open' FOR UPDATE", [rid], "처리 대기 중인 신고가 아닙니다.");
    await hideTarget(c, r.target_type, r.target_id, v);
    const sanctionType = oneOf(b, "sanction", ["none", "chat_mute", "post_ban"], { optional: true }) ?? "none";
    if (sanctionType !== "none" && r.target_user_id) await sanction(c, r.target_user_id, sanctionType, 7, `신고 처리 (${r.target_type})`, v);
    // 같은 대상에 대한 다른 신고도 함께 처리
    await c.query(
      "UPDATE reports SET status = 'actioned', handled_by = $3, handled_at = now(), action_note = $4 WHERE target_type = $1 AND target_id = $2 AND status = 'open'",
      [r.target_type, r.target_id, v.id, sanctionType === "none" ? "숨김" : `숨김 + ${sanctionType} 7일`],
    );
    return { targetType: r.target_type, targetId: r.target_id, detail: { reportId: rid, sanction: sanctionType } };
  } },
  "report.dismiss": { role: "operator", run: async (c, b, v) => {
    const rid = id(b);
    await one(c, "UPDATE reports SET status = 'dismissed', handled_by = $2, handled_at = now() WHERE id = $1 AND status = 'open' RETURNING 1", [rid, v.id]);
    return { targetType: "report", targetId: rid };
  } },
  // ───── 콘텐츠 직접 관리
  "message.delete": { role: "operator", run: async (c, b, v) => {
    const mid = String(b.id ?? "");
    if (!/^\d+$/.test(mid)) fail(400, "메시지 ID가 올바르지 않습니다.");
    await hideTarget(c, "chat_message", mid, v);
    return { targetType: "chat_message", targetId: mid };
  } },
  // 채팅 메시지 작성자 제재 — 운영자 화면에도 작성자 계정은 노출하지 않고 메시지 ID로 서버에서 찾는다
  "message.muteAuthor": { role: "operator", run: async (c, b, v) => {
    const mid = String(b.id ?? "");
    if (!/^\d+$/.test(mid)) fail(400, "메시지 ID가 올바르지 않습니다.");
    const days = int(b, "days", { min: 1, max: 365, optional: true }) ?? 7;
    const reason = str(b, "reason", { max: 200, name: "사유" })!;
    const m = await one(c, "SELECT sender_id FROM chat_messages WHERE id = $1", [mid]);
    await sanction(c, m.sender_id, "chat_mute", days, reason, v);
    return { targetType: "user", targetId: m.sender_id, detail: { messageId: mid, days, reason } };
  } },
  "post.hide": { role: "operator", run: async (c, b, v) => {
    const pid = id(b);
    await hideTarget(c, "board_post", pid, v);
    return { targetType: "board_post", targetId: pid };
  } },
  "post.restore": { role: "operator", run: async (c, b) => {
    const pid = id(b);
    await one(c, "UPDATE board_posts SET status = 'visible', updated_at = now() WHERE id = $1 AND status = 'hidden' RETURNING 1", [pid]);
    return { targetType: "board_post", targetId: pid };
  } },
  "room.toggle": { role: "operator", run: async (c, b) => {
    const rid = id(b);
    const r = await one(c, "UPDATE chat_rooms SET is_active = NOT is_active WHERE id = $1 AND type <> 'dm' RETURNING is_active", [rid]);
    return { targetType: "chat_room", targetId: rid, detail: { isActive: r.is_active } };
  } },
  "notice.create": { role: "operator", run: async (c, b, v) => {
    const title = str(b, "title", { max: 100, name: "제목" })!;
    const text = str(b, "body", { max: 5000, name: "내용" })!;
    const n = await one(c, "INSERT INTO notices(title, body, is_pinned, created_by) VALUES ($1,$2,$3,$4) RETURNING id", [title, text, b.pinned === true || b.pinned === "on", v.id]);
    return { targetType: "notice", targetId: n.id };
  } },
  // ───── 회원
  "user.suspend": { role: "operator", run: async (c, b, v) => {
    const uid = id(b);
    if (uid === v.id) fail(400, "자기 자신은 정지할 수 없습니다.");
    const reason = str(b, "reason", { max: 200, name: "사유" })!;
    const target = await one(c, "SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id = $1 AND role IN ('operator','super_admin')) AS staff FROM users WHERE id = $1", [uid]);
    if (target.staff && !v.isSuperAdmin) fail(403, "운영진 계정은 최고 관리자만 정지할 수 있습니다.");
    await one(c, "UPDATE users SET status = 'suspended', updated_at = now() WHERE id = $1 AND status = 'active' RETURNING 1", [uid], "활성 회원이 아닙니다.");
    await c.query("DELETE FROM sessions WHERE user_id = $1", [uid]);
    return { targetType: "user", targetId: uid, detail: { reason } };
  } },
  "user.activate": { role: "operator", run: async (c, b) => {
    const uid = id(b);
    await one(c, "UPDATE users SET status = 'active', updated_at = now() WHERE id = $1 AND status = 'suspended' RETURNING 1", [uid], "정지된 회원이 아닙니다.");
    return { targetType: "user", targetId: uid };
  } },
  "user.mute": { role: "operator", run: async (c, b, v) => {
    const uid = id(b);
    const days = int(b, "days", { min: 1, max: 365, name: "기간" })!;
    const reason = str(b, "reason", { max: 200, optional: true }) ?? "운영자 조치";
    await sanction(c, uid, "chat_mute", days, reason, v);
    return { targetType: "user", targetId: uid, detail: { days, reason } };
  } },
  "user.grantRole": { role: "super_admin", run: async (c, b, v) => {
    const uid = id(b);
    const role = oneOf(b, "role", ["operator", "partner", "super_admin"], { name: "권한" })!;
    await c.query("INSERT INTO user_roles(user_id, role, granted_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [uid, role, v.id]);
    return { targetType: "user", targetId: uid, detail: { role } };
  } },
  "user.revokeRole": { role: "super_admin", run: async (c, b, v) => {
    const uid = id(b);
    const role = oneOf(b, "role", ["operator", "partner", "super_admin"], { name: "권한" })!;
    if (uid === v.id && role === "super_admin") fail(400, "자신의 최고 관리자 권한은 회수할 수 없습니다.");
    await c.query("DELETE FROM user_roles WHERE user_id = $1 AND role = $2", [uid, role]);
    return { targetType: "user", targetId: uid, detail: { role } };
  } },
  // ───── 광고 상품·매출 (최고 관리자)
  "product.create": { role: "super_admin", run: async (c, b) => {
    const code = str(b, "code", { max: 40, name: "상품 코드" })!;
    if (!/^[a-z0-9_]+$/.test(code)) fail(400, "상품 코드는 영문 소문자·숫자·_만 쓸 수 있습니다.");
    const p = await one(c,
      "INSERT INTO ad_products(code, name, type, duration_days, price, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [code, str(b, "name", { max: 40, name: "상품명" }), oneOf(b, "type", ["premium_job", "vip_job", "main_banner", "partner"], { name: "유형" }),
       int(b, "durationDays", { min: 1, max: 365, name: "기간" }), int(b, "price", { min: 0, max: 100000000, name: "가격" }),
       str(b, "description", { max: 200, optional: true })]);
    return { targetType: "ad_product", targetId: p.id, detail: { code } };
  } },
  "product.update": { role: "super_admin", run: async (c, b) => {
    const pid = id(b);
    const before = await one(c, "SELECT price, duration_days, is_active FROM ad_products WHERE id = $1 FOR UPDATE", [pid]);
    const price = int(b, "price", { min: 0, max: 100000000, name: "가격" })!;
    const days = int(b, "durationDays", { min: 1, max: 365, name: "기간" })!;
    const active = b.isActive === true || b.isActive === "on";
    await c.query("UPDATE ad_products SET price = $2, duration_days = $3, is_active = $4, updated_at = now() WHERE id = $1", [pid, price, days, active]);
    return { targetType: "ad_product", targetId: pid, detail: { before, after: { price, duration_days: days, is_active: active } } };
  } },
  "order.refund": { role: "super_admin", run: async (c, b) => {
    const oid = id(b);
    const reason = str(b, "reason", { max: 200, name: "환불 사유" })!;
    const o = await one(c, "SELECT o.id, p.payment_key, p.provider FROM ad_orders o JOIN payments p ON p.order_id = o.id AND p.status = 'approved' WHERE o.id = $1 AND o.status = 'paid' FOR UPDATE OF o", [oid], "환불 가능한 결제 완료 주문이 아닙니다.");
    if (o.provider !== "manual") {
      const r = await paymentProvider().cancel({ paymentKey: o.payment_key, reason });
      if (!r.ok) fail(502, `결제사 취소 실패: ${r.message ?? ""}`);
    }
    await c.query("UPDATE payments SET status = 'cancelled', cancelled_at = now(), cancel_reason = $2 WHERE order_id = $1 AND status = 'approved'", [oid, reason]);
    await c.query("UPDATE ad_orders SET status = 'refunded', cancelled_at = now() WHERE id = $1", [oid]);
    await c.query("UPDATE ad_campaigns SET status = 'cancelled' WHERE order_id = $1", [oid]);
    return { targetType: "ad_order", targetId: oid, detail: { reason } };
  } },
  // 메인 배너: 별도 협의 → 운영자가 계약 내용대로 배너·주문(수기 결제)·캠페인을 한 번에 등록
  "banner.create": { role: "super_admin", run: async (c, b, v) => {
    const title = str(b, "title", { max: 60, name: "배너 문구" })!;
    const link = str(b, "linkUrl", { max: 300, optional: true });
    if (link && !/^https:\/\//.test(link)) fail(400, "링크는 https:// 로 시작해야 합니다.");
    const placement = oneOf(b, "placement", ["home_top", "home_middle", "jobs_list"], { name: "노출 위치" })!;
    const days = int(b, "days", { min: 1, max: 365, name: "기간" })!;
    const amount = int(b, "amount", { min: 0, max: 100000000, name: "계약 금액" })!;
    const companyId = isUuid(b.companyId) ? b.companyId : null;
    if (!companyId) fail(400, "광고주 기업을 선택해 주세요.");
    const product = await one(c, "SELECT id, code, name, type FROM ad_products WHERE type = 'main_banner' ORDER BY sort LIMIT 1", [], "메인 배너 상품이 없습니다.");
    const banner = await one(c, "INSERT INTO banners(company_id, title, link_url, placement, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id", [companyId, title, link, placement, v.id]);
    const order = await one(c,
      `INSERT INTO ad_orders(order_no, buyer_id, company_id, product_id, banner_id, product_snapshot, amount, status, paid_at)
       VALUES ('BTM-' || to_char(now(),'YYYYMMDDHH24MISS') || '-' || substr(md5(random()::text),1,6), $1,$2,$3,$4,$5,$6,'paid',now()) RETURNING id`,
      [v.id, companyId, product.id, banner.id, { ...product, duration_days: days, price: amount }, amount]);
    await c.query("INSERT INTO payments(order_id, provider, payment_key, amount, status, approved_at) VALUES ($1,'manual',$2,$3,'approved',now())", [order.id, `manual-${order.id}`, amount]);
    await c.query("INSERT INTO ad_campaigns(order_id, product_type, banner_id, starts_at, ends_at) VALUES ($1,'main_banner',$2,now(),now() + make_interval(days => $3))", [order.id, banner.id, days]);
    return { targetType: "banner", targetId: banner.id, detail: { amount, days, placement } };
  } },
};

export const POST = api(async (req) => {
  const v = await requireUser();
  if (!v.isOperator) fail(403, "관리자만 접근할 수 있습니다.");
  const b = await body(req);
  const name = String(b.action ?? "");
  const action = ACTIONS[name];
  if (!action) fail(400, "알 수 없는 작업입니다.");
  if (action.role === "super_admin" && !v.isSuperAdmin) fail(403, "최고 관리자 권한이 필요한 작업입니다.");
  const ip = clientIp(req);
  await tx(async (c) => {
    const out = await action.run(c, b, v);
    // 감사 로그는 같은 트랜잭션에 기록: 작업이 실패하면 로그도 남지 않고, 작업이 성공하면 반드시 남는다
    await c.query(
      "INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, detail, ip) VALUES ($1,$2,$3,$4,$5,$6)",
      [v.id, name, out.targetType, out.targetId, out.detail ?? null, ip],
    );
  });
  return json({ ok: true });
});
