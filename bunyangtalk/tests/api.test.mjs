// API 통합 테스트 — 실행 중인 서버(BASE)와 시연 DB(scripts/seed.mjs)를 대상으로 한다
// 실행: npm run db:reset && (서버 실행) && npm run test:api
import "../scripts/env.mjs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3100";
const PW = process.env.SEED_PASSWORD || "demo1234";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

class Client {
  constructor() { this.cookie = ""; }
  async req(method, path, body, { origin = BASE, raw = false } = {}) {
    const headers = { "content-type": "application/json" };
    if (origin) headers.origin = origin;
    if (this.cookie) headers.cookie = this.cookie;
    const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    const set = r.headers.get("set-cookie");
    if (set) {
      const m = set.match(/bt_session=([^;]*)/);
      if (m) this.cookie = m[1] ? `bt_session=${m[1]}` : "";
    }
    const text = await r.text();
    let data = null;
    if (!raw) { try { data = JSON.parse(text); } catch { data = null; } }
    return { status: r.status, data, text };
  }
  get(p, o) { return this.req("GET", p, undefined, o); }
  post(p, b, o) { return this.req("POST", p, b ?? {}, o); }
  async login(email) {
    const r = await this.post("/api/auth/login", { email, password: PW });
    assert.equal(r.status, 200, `login ${email}: ${r.text}`);
    return this;
  }
}
const as = (email) => new Client().login(email);

let national, users;
before(async () => {
  await db.connect();
  national = (await one("SELECT id FROM chat_rooms WHERE type = 'national'")).id;
  users = (await db.query("SELECT u.id, u.email, p.nickname FROM users u JOIN profiles p ON p.user_id = u.id")).rows;
});
after(async () => { await db.end(); });

// 다른 회원의 user_id·이메일이 응답에 섞여 있지 않은지 검사
function assertNoLeak(text, selfEmail, label) {
  const selfId = users.find((u) => u.email === selfEmail)?.id;
  for (const u of users) {
    if (u.id === selfId) continue;
    assert.ok(!text.includes(u.id), `${label}: 다른 회원 user_id 노출 (${u.nickname})`);
    assert.ok(!text.includes(u.email), `${label}: 다른 회원 이메일 노출 (${u.nickname})`);
  }
}

test("회원가입·로그인 검증", async () => {
  const c = new Client();
  const email = `t${Date.now()}@example.com`;
  assert.equal((await c.post("/api/auth/signup", { email, password: "short", agreeTerms: true, agreePrivacy: true })).status, 400);
  assert.equal((await c.post("/api/auth/signup", { email, password: "abcd1234", agreePrivacy: true })).status, 400, "약관 미동의");
  assert.equal((await c.post("/api/auth/signup", { email, password: "abcd1234", agreeTerms: true, agreePrivacy: true, nickname: "운영자김" })).status, 400, "운영자 사칭 닉네임");
  const r = await c.post("/api/auth/signup", { email, password: "abcd1234", agreeTerms: true, agreePrivacy: true });
  assert.equal(r.status, 201);
  assert.ok(c.cookie, "세션 쿠키 발급");
  const nick = (await one("SELECT p.nickname FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.email = $1", [email])).nickname;
  assert.match(nick, /^익명 /, "자동 익명 닉네임");
  assert.equal((await new Client().post("/api/auth/signup", { email, password: "abcd1234", agreeTerms: true, agreePrivacy: true })).status, 409);
  assert.equal((await new Client().post("/api/auth/login", { email, password: "wrong1234" })).status, 401);
  assert.equal((await new Client().post("/api/auth/login", { email, password: "abcd1234" })).status, 200);
});

test("다른 출처(Origin) 변경 요청 차단", async () => {
  const c = await as("s1@example.com");
  assert.equal((await c.post(`/api/chat/rooms/${national}/messages`, { body: "csrf" }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await c.post(`/api/chat/rooms/${national}/messages`, { body: "csrf" }, { origin: null })).status, 403);
});

test("구인공고: 인증 구인자만 등록 → 심사 → 게시, 권한 검사", async () => {
  const seeker = await as("s2@example.com");
  const site = await one("SELECT id FROM sites ORDER BY name LIMIT 1");
  const job = {
    siteId: site.id, title: "테스트 공고 상담사 모집", ranks: ["counselor"], rtBasis: "per_contract", rtAmountMan: 300,
    dailyPay: 50000, contractType: "commission", contactName: "담당자", contactPhone: "010-1234-5678", description: "테스트용 상세 모집 내용입니다.",
  };
  assert.equal((await seeker.post("/api/jobs", job)).status, 403, "미인증 회원 등록 차단");
  const pendingCo = await as("pending@example.com");
  assert.equal((await pendingCo.post("/api/jobs", job)).status, 403, "심사 중 기업 등록 차단");

  const rec = await as("recruiter1@example.com");
  assert.equal((await rec.post("/api/jobs", { ...job, ranks: [] })).status, 400, "직급 필수");
  const r = await rec.post("/api/jobs", job);
  assert.equal(r.status, 201, r.text);
  const id = r.data.id;
  assert.equal((await one("SELECT status FROM job_posts WHERE id = $1", [id])).status, "pending");
  assert.equal((await new Client().get(`/jobs/${id}`, { raw: true })).status, 404, "심사 전 공고는 비공개");
  assert.equal((await rec.get(`/jobs/${id}`, { raw: true })).status, 200, "작성 기업은 열람 가능");

  // 다른 기업 구인자는 수정 불가
  const rec2 = await as("recruiter2@example.com");
  assert.equal((await rec2.req("PATCH", `/api/jobs/${id}`, job)).status, 403);

  assert.equal((await seeker.post("/api/admin/action", { action: "job.approve", id })).status, 403, "일반 회원 관리자 작업 차단");
  const ops = await as("ops@example.com");
  assert.equal((await ops.post("/api/admin/action", { action: "job.approve", id })).status, 200);
  assert.equal((await one("SELECT status FROM job_posts WHERE id = $1", [id])).status, "published");
  assert.ok(await one("SELECT 1 FROM admin_audit_logs WHERE action = 'job.approve' AND target_id = $1", [id]), "감사 로그 기록");

  // 수정 → 이력 남음
  assert.equal((await rec.req("PATCH", `/api/jobs/${id}`, { ...job, title: "테스트 공고 수정본 모집" })).status, 200);
  assert.equal((await one("SELECT count(*)::int n FROM job_post_revisions WHERE job_post_id = $1", [id])).n, 1);
  // 마감
  assert.equal((await rec2.post(`/api/jobs/${id}/close`)).status, 403);
  assert.equal((await rec.post(`/api/jobs/${id}/close`)).status, 200);
  assert.equal((await one("SELECT status FROM job_posts WHERE id = $1", [id])).status, "closed");
});

test("공고 검색 필터·관심 저장·연락처 보기(문의 집계)", async () => {
  const html = (await new Client().get("/jobs?region=gyeonggi&rank=director", { raw: true })).text;
  assert.ok(html.includes("누리온 더테라스 본부장 모집"), "경기+본부장 공고 포함");
  assert.ok(!html.includes("마곡 오피스텔 480실"), "서울 공고 제외");
  const rt = (await new Client().get("/jobs?rt=5000000", { raw: true })).text;
  assert.ok(rt.includes("해운대 상가 분양 상담사") && !rt.includes("청라 리버뷰 시티 신입"), "RT 500만+ 필터");
  const daily = (await new Client().get("/jobs?daily=100000", { raw: true })).text;
  assert.ok(daily.includes("본부장 모집") && !daily.includes("신입 교육생"), "일비 10만+ 필터");

  const job = await one("SELECT id FROM job_posts WHERE title LIKE '해운대%'");
  assert.equal((await new Client().post(`/api/jobs/${job.id}/contact`)).status, 401, "비회원 연락처 차단");
  const c = await as("s3@example.com");
  const before = (await one("SELECT count(*)::int n FROM job_events WHERE job_post_id = $1 AND event_type = 'contact_click'", [job.id])).n;
  const r = await c.post(`/api/jobs/${job.id}/contact`);
  assert.equal(r.status, 200);
  assert.match(r.data.phone, /^010-/);
  assert.equal((await one("SELECT count(*)::int n FROM job_events WHERE job_post_id = $1 AND event_type = 'contact_click'", [job.id])).n, before + 1);
  assert.equal((await c.post(`/api/jobs/${job.id}/save`)).data.saved, true);
  assert.equal((await c.post(`/api/jobs/${job.id}/save`)).data.saved, false);
});

test("채팅: 전송·익명성·도배 방지·링크 제한", async () => {
  const a = await as("s5@example.com");
  const r = await a.post(`/api/chat/rooms/${national}/messages`, { body: "테스트 메시지입니다" });
  assert.equal(r.status, 201, r.text);
  assert.deepEqual(Object.keys(r.data.message).sort(), ["body", "createdAt", "deleted", "id", "mine", "nickname"]);
  assert.equal(r.data.message.mine, true);

  const list = await a.get(`/api/chat/rooms/${national}/messages`);
  assert.equal(list.status, 200);
  assertNoLeak(list.text, "s5@example.com", "채팅 목록 API");
  for (const m of list.data.messages) assert.equal(m.senderId, undefined);

  assert.equal((await a.post(`/api/chat/rooms/${national}/messages`, { body: "테스트 메시지입니다" })).status, 429, "같은 내용 반복 차단");
  let last;
  for (let i = 0; i < 5; i++) last = await a.post(`/api/chat/rooms/${national}/messages`, { body: `빠른 메시지 ${i}` });
  assert.equal(last.status, 429, "10초 5개 초과 차단");

  const fresh = new Client();
  await fresh.post("/api/auth/signup", { email: `link${Date.now()}@example.com`, password: "abcd1234", agreeTerms: true, agreePrivacy: true });
  assert.equal((await fresh.post(`/api/chat/rooms/${national}/messages`, { body: "여기로 오세요 https://spam.example" })).status, 403, "신규 계정 링크 차단");
  assert.equal((await new Client().get(`/api/chat/rooms/${national}/messages`)).status, 401, "비회원 채팅 열람 차단");
});

test("익명성: 화면 HTML·RSC 페이로드에 다른 회원 식별정보 없음", async () => {
  const c = await as("s2@example.com");
  const post = await one("SELECT id FROM board_posts WHERE status = 'visible' ORDER BY created_at LIMIT 1");
  const site = await one("SELECT id FROM sites LIMIT 1");
  const job = await one("SELECT id FROM job_posts WHERE status = 'published' LIMIT 1");
  for (const path of ["/", "/lounge", "/lounge?tab=board", `/lounge/board/${post.id}`, `/lounge/chat/${national}`, `/sites/${site.id}`, `/jobs/${job.id}`, "/me"]) {
    const r = await c.get(path, { raw: true });
    assert.equal(r.status, 200, path);
    assertNoLeak(r.text, "s2@example.com", path);
  }
});

test("차단·1:1 대화·접근 제어", async () => {
  const s1 = await as("s1@example.com");
  const s2 = await as("s2@example.com");
  const s3 = await as("s3@example.com");
  const s4 = await as("s4@example.com");
  const m = (await s1.post(`/api/chat/rooms/${national}/messages`, { body: `차단 테스트 ${Date.now()}` })).data.message;

  const dm = await s3.post("/api/chat/dm", { targetType: "chat_message", targetId: String(m.id) });
  assert.equal(dm.status, 200);
  const again = await s3.post("/api/chat/dm", { targetType: "chat_message", targetId: String(m.id) });
  assert.equal(again.data.roomId, dm.data.roomId, "같은 상대와는 같은 방");
  assert.equal((await s1.post(`/api/chat/rooms/${dm.data.roomId}/messages`, { body: "안녕하세요 1:1" })).status, 201);
  assert.equal((await s4.get(`/api/chat/rooms/${dm.data.roomId}/messages`)).status, 403, "제3자 1:1 열람 차단");
  const dmHtml = (await s3.get(`/lounge/chat/${dm.data.roomId}`, { raw: true })).text;
  assertNoLeak(dmHtml, "s3@example.com", "1:1 대화 화면");

  assert.equal((await s2.post("/api/blocks", { targetType: "chat_message", targetId: String(m.id) })).status, 200);
  const seen = (await s2.get(`/api/chat/rooms/${national}/messages`)).data.messages;
  assert.ok(!seen.some((x) => x.id === m.id), "차단한 회원 메시지 숨김");
  assert.equal((await s1.post("/api/chat/dm", { targetType: "chat_message", targetId: String((await s2.post(`/api/chat/rooms/${national}/messages`, { body: `차단 후 ${Date.now()}` })).data.message.id) })).status, 403, "차단 관계 1:1 시작 불가");
  const block = await one("SELECT b.id FROM user_blocks b JOIN users u ON u.id = b.blocker_id WHERE u.email = 's2@example.com'");
  assert.equal((await s1.req("DELETE", `/api/blocks/${block.id}`)).status, 404, "남의 차단 기록 해제 불가");
  assert.equal((await s2.req("DELETE", `/api/blocks/${block.id}`)).status, 200);
});

test("신고 → 운영자 처리(숨김 + 채팅 금지)", async () => {
  const s4 = await as("s4@example.com");
  const s3 = await as("s3@example.com");
  const m = (await s4.post(`/api/chat/rooms/${national}/messages`, { body: `신고 대상 메시지 ${Date.now()}` })).data.message;
  assert.equal((await s4.post("/api/reports", { targetType: "chat_message", targetId: String(m.id), reason: "spam" })).status, 400, "본인 신고 불가");
  assert.equal((await s3.post("/api/reports", { targetType: "chat_message", targetId: String(m.id), reason: "spam" })).data.duplicate, false);
  assert.equal((await s3.post("/api/reports", { targetType: "chat_message", targetId: String(m.id), reason: "spam" })).data.duplicate, true);
  const rep = await one("SELECT id FROM reports WHERE target_type = 'chat_message' AND target_id = $1", [String(m.id)]);
  const ops = await as("ops@example.com");
  assert.equal((await ops.post("/api/admin/action", { action: "report.action", id: rep.id, sanction: "chat_mute" })).status, 200);
  assert.equal((await one("SELECT body FROM chat_messages WHERE id = $1", [m.id])).body, null, "메시지 숨김");
  const blocked = await s4.post(`/api/chat/rooms/${national}/messages`, { body: "제재 후 메시지" });
  assert.equal(blocked.status, 403, "채팅 금지 적용");
  assert.match(blocked.data.error, /제한/);
});

test("광고 결제: 서버 금액 검증·중복 승인 방지·노출·만료·환불", async () => {
  const rec2 = await as("recruiter2@example.com");
  const job = await one("SELECT id FROM job_posts WHERE title LIKE '청라 리버뷰 시티 신입%'");
  const o = await rec2.post("/api/ads/orders", { productCode: "premium_7d", jobId: job.id });
  assert.equal(o.status, 201, o.text);
  const orderNo = o.data.orderNo;
  assert.equal((await rec2.post("/api/ads/orders", { productCode: "premium_7d", jobId: job.id })).data.orderNo, orderNo, "미결제 주문 재사용");
  const rec1 = await as("recruiter1@example.com");
  assert.equal((await rec1.post("/api/ads/orders", { productCode: "premium_7d", jobId: job.id })).status, 403, "타 기업 공고 광고 불가");

  assert.equal((await rec2.post("/api/payments/confirm", { orderNo, paymentKey: "mock_x", amount: 1 })).status, 400, "금액 위변조 차단");
  assert.equal((await rec1.post("/api/payments/confirm", { orderNo, paymentKey: "mock_x", amount: 50000 })).status, 403, "남의 주문 결제 차단");

  const key = `mock_${Date.now()}`;
  const results = await Promise.all(Array.from({ length: 6 }, () => rec2.post("/api/payments/confirm", { orderNo, paymentKey: key, amount: 50000 })));
  assert.ok(results.every((r) => r.status === 200), `동시 승인 응답: ${results.map((r) => r.status)}`);
  const ord = await one("SELECT id, status FROM ad_orders WHERE order_no = $1", [orderNo]);
  assert.equal(ord.status, "paid");
  assert.equal((await one("SELECT count(*)::int n FROM payments WHERE order_id = $1", [ord.id])).n, 1, "결제 1건");
  assert.equal((await one("SELECT count(*)::int n FROM ad_campaigns WHERE order_id = $1", [ord.id])).n, 1, "광고 1건");
  assert.equal((await rec2.post("/api/payments/confirm", { orderNo, paymentKey: "mock_other", amount: 50000 })).status, 409, "다른 키로 재결제 차단");

  const premium = (await new Client().get("/jobs?tab=premium", { raw: true })).text;
  assert.ok(premium.includes("청라 리버뷰 시티 신입"), "결제 즉시 프리미엄 노출");

  const camp = await one("SELECT id FROM ad_campaigns WHERE order_id = $1", [ord.id]);
  assert.equal((await new Client().post("/api/ads/impressions", { ids: [camp.id] })).data.n, 1, "노출 집계");
  const click = await new Client().get(`/api/ads/click/${camp.id}`, { raw: true });
  assert.equal(click.status, 302);
  assert.equal((await one("SELECT count(*)::int n FROM ad_events WHERE campaign_id = $1 AND event_type = 'click'", [camp.id])).n, 1, "클릭 집계");

  // 자동 만료: 종료 시각이 지나면 배치 없이 노출에서 빠진다
  await db.query("UPDATE ad_campaigns SET starts_at = now() - interval '8 days', ends_at = now() - interval '1 minute' WHERE id = $1", [camp.id]);
  assert.ok(!(await new Client().get("/jobs?tab=premium", { raw: true })).text.includes("청라 리버뷰 시티 신입"), "만료 광고 미노출");
  await db.query("UPDATE ad_campaigns SET starts_at = now(), ends_at = now() + interval '7 days' WHERE id = $1", [camp.id]);

  const ops = await as("ops@example.com");
  assert.equal((await ops.post("/api/admin/action", { action: "order.refund", id: ord.id, reason: "테스트" })).status, 403, "운영자는 환불 불가");
  const admin = await as("admin@example.com");
  assert.equal((await admin.post("/api/admin/action", { action: "order.refund", id: ord.id, reason: "테스트 환불" })).status, 200);
  assert.equal((await one("SELECT status FROM ad_orders WHERE id = $1", [ord.id])).status, "refunded");
  assert.equal((await one("SELECT status FROM ad_campaigns WHERE id = $1", [camp.id])).status, "cancelled");
  assert.ok(!(await new Client().get("/jobs?tab=premium", { raw: true })).text.includes("청라 리버뷰 시티 신입"), "환불 광고 미노출");
});

test("관리자 권한 분리·감사 로그 불변·이메일 마스킹", async () => {
  const ops = await as("ops@example.com");
  const admin = await as("admin@example.com");
  const p = await one("SELECT id, price FROM ad_products WHERE code = 'premium_7d'");
  assert.equal((await ops.post("/api/admin/action", { action: "product.update", id: p.id, price: 1, durationDays: 7, isActive: true })).status, 403);
  assert.equal((await admin.post("/api/admin/action", { action: "product.update", id: p.id, price: 55000, durationDays: 7, isActive: true })).status, 200);
  const log = await one("SELECT detail FROM admin_audit_logs WHERE action = 'product.update' ORDER BY id DESC LIMIT 1");
  assert.equal(log.detail.before.price, 50000);
  assert.equal(log.detail.after.price, 55000);
  await admin.post("/api/admin/action", { action: "product.update", id: p.id, price: 50000, durationDays: 7, isActive: true });
  await assert.rejects(db.query("UPDATE admin_audit_logs SET action = 'x'"), /append-only/);
  await assert.rejects(db.query("DELETE FROM admin_audit_logs"), /append-only/);

  const opsUsers = (await ops.get("/admin?tab=users", { raw: true })).text;
  assert.ok(!opsUsers.includes("s1@example.com") && opsUsers.includes("s1*@example.com"), "운영자 화면 이메일 마스킹");
  const adminUsers = (await admin.get("/admin?tab=users", { raw: true })).text;
  assert.ok(adminUsers.includes("s1@example.com"), "최고 관리자는 전체 이메일");
  assert.equal((await (await as("s1@example.com")).get("/admin", { raw: true })).status, 404, "일반 회원 관리자 페이지 차단");
  assert.equal((await ops.get("/admin?tab=sales", { raw: true })).status, 404, "운영자 매출 페이지 차단");
});

test("기업 인증 신청 → 승인 → 공고 등록 가능", async () => {
  const c = new Client();
  await c.post("/api/auth/signup", { email: `co${Date.now()}@example.com`, password: "abcd1234", agreeTerms: true, agreePrivacy: true });
  const bn = String(Date.now()).slice(-10);
  assert.equal((await c.post("/api/companies", { name: "테스트대행", businessNumber: "123", representative: "홍길동" })).status, 400);
  assert.equal((await c.post("/api/companies", { name: "테스트대행", businessNumber: bn, representative: "홍길동" })).status, 201);
  assert.equal((await c.post("/api/companies", { name: "중복", businessNumber: bn, representative: "홍길동" })).status, 409);
  const co = await one("SELECT id FROM companies WHERE business_number = $1", [bn]);
  const ops = await as("ops@example.com");
  assert.equal((await ops.post("/api/admin/action", { action: "company.verify", id: co.id })).status, 200);
  const r = await c.post("/api/jobs", {
    siteId: "new", siteName: "테스트 신규 현장", siteRegion: "ulsan", siteType: "apartment", title: "신규 현장 상담사 모집",
    ranks: ["counselor"], rtBasis: "negotiable", contractType: "commission", contactName: "담당", contactPhone: "010-2222-3333", description: "신규 현장 테스트 공고입니다.",
  });
  assert.equal(r.status, 201, r.text);
  assert.ok(await one("SELECT 1 FROM sites WHERE name = '테스트 신규 현장' AND region_code = 'ulsan'"), "새 현장 생성");
});

test("닉네임 변경 제한·탈퇴 시 비식별화", async () => {
  const c = new Client();
  const email = `wd${Date.now()}@example.com`;
  await c.post("/api/auth/signup", { email, password: "abcd1234", agreeTerms: true, agreePrivacy: true });
  assert.equal((await c.req("PATCH", "/api/me", { nickname: "새닉네임테스트" })).status, 200);
  assert.equal((await c.req("PATCH", "/api/me", { nickname: "또바꾼닉네임" })).status, 429, "30일 내 재변경 차단");
  assert.equal((await c.req("PATCH", "/api/me", { nickname: "익명 고양이217" })).status, 429);
  assert.equal((await c.post("/api/me/withdraw", { password: "wrong1234" })).status, 401);
  assert.equal((await c.post("/api/me/withdraw", { password: "abcd1234" })).status, 200);
  assert.ok(!(await one("SELECT 1 FROM users WHERE email = $1", [email])), "이메일 비식별화");
  assert.equal((await new Client().post("/api/auth/login", { email, password: "abcd1234" })).status, 401);
});
