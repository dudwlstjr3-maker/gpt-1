// 시연용 데이터 (실제 업체·현장·인물이 아님). 운영 DB에서는 실행하지 않는다
import "./env.mjs";
import pg from "pg";
import { randomBytes, scryptSync } from "node:crypto";

if (process.env.NODE_ENV === "production") throw new Error("운영 환경에서는 시연 데이터를 넣지 않습니다.");
const PW = process.env.SEED_PASSWORD || "demo1234";
const hash = (pw) => {
  const salt = randomBytes(16);
  const key = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
};
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const one = async (sql, p) => (await c.query(sql, p)).rows[0];
const days = (n) => new Date(Date.now() + n * 86400000);
const ymd = (d) => d.toISOString().slice(0, 10);

try {
  await c.query("BEGIN");
  if ((await one("SELECT count(*)::int n FROM users")).n > 0) {
    console.log("이미 데이터가 있습니다. npm run db:reset 으로 초기화 후 실행하세요.");
    await c.query("ROLLBACK");
    process.exit(0);
  }
  const pwHash = hash(PW);
  const users = {};
  const mk = async (key, email, nickname, opts = {}) => {
    const u = await one(
      `INSERT INTO users(email, password_hash, terms_agreed_at, privacy_agreed_at, created_at, last_login_at)
       VALUES ($1,$2,now(),now(),$3,now()) RETURNING id`, [email, pwHash, opts.created ?? days(-20)]);
    await c.query("INSERT INTO profiles(user_id, nickname, job_seeking_status) VALUES ($1,$2,$3)", [u.id, nickname, opts.seeking ?? "open"]);
    await c.query("INSERT INTO nickname_history(user_id, nickname) VALUES ($1,$2)", [u.id, nickname]);
    await c.query("INSERT INTO notification_settings(user_id) VALUES ($1)", [u.id]);
    users[key] = u.id;
  };
  await mk("admin", "admin@example.com", "분양톡지기");
  await c.query("INSERT INTO user_roles(user_id, role) VALUES ($1,'super_admin')", [users.admin]);
  await c.query("UPDATE profiles SET nickname = '운영팀 알파' WHERE user_id = $1", [users.admin]);
  await mk("ops", "ops@example.com", "운영 매니저 B");
  await c.query("UPDATE profiles SET nickname = '모더레이터B' WHERE user_id = $1", [users.ops]);
  await c.query("INSERT INTO user_roles(user_id, role) VALUES ($1,'operator')", [users.ops]);
  await mk("rec1", "recruiter1@example.com", "가온본부장");
  await mk("rec2", "recruiter2@example.com", "하람팀장");
  await mk("rec3", "pending@example.com", "새내기대행");
  const seekers = [["s1", "익명 고양이217"], ["s2", "익명 수달508"], ["s3", "익명 판다331"], ["s4", "익명 여우742"], ["s5", "익명 펭귄119"]];
  for (const [k, n] of seekers) await mk(k, `${k}@example.com`, n, { seeking: "seeking" });

  const co = async (name, bn, rep, owner, status) => {
    const r = await one(
      `INSERT INTO companies(name, business_number, representative, created_by, verification_status, verified_at, verified_by)
       VALUES ($1,$2,$3,$4,$5, CASE WHEN $5 = 'verified' THEN now() END, CASE WHEN $5 = 'verified' THEN $6::uuid END) RETURNING id`,
      [name, bn, rep, owner, status, users.admin]);
    await c.query("INSERT INTO company_members(company_id, user_id, role) VALUES ($1,$2,'owner')", [r.id, owner]);
    return r.id;
  };
  const gaon = await co("가온분양마케팅(시연)", "1010000001", "김가온", users.rec1, "verified");
  const haram = await co("하람파트너스(시연)", "1010000002", "이하람", users.rec2, "verified");
  await co("새내기분양대행(시연)", "1010000003", "박새솔", users.rec3, "pending");

  const siteRows = [
    ["누리온 더테라스", "gyeonggi", "apartment", "경기 화성시 동탄 일대", "누리온개발", "가온건설", -3],
    ["하람 리버뷰 시티", "incheon", "apartment", "인천 서구 청라 일대", "하람디앤씨", "하람종합건설", -9],
    ["솔빛 스카이 오피스텔", "seoul", "officetel", "서울 강서구 마곡 일대", "솔빛AMC", "솔빛건설", -2],
    ["새온 지식산업센터", "gyeonggi", "knowledge_center", "경기 하남시 미사 일대", "새온산업", "새온이앤씨", -40],
    ["다온 센트로 상가", "busan", "commercial", "부산 해운대구 일대", "다온PFV", "다온건설", -15],
    ["윤슬 레이크 파크", "chungnam", "apartment", "충남 천안시 서북구 일대", "윤슬디벨롭", "윤슬산업개발", -5],
    ["라온 스테이 레지던스", "gangwon", "lodging", "강원 속초시 일대", "라온리츠", "라온건설", -25],
    ["별하 포레스트", "daegu", "apartment", "대구 수성구 일대", "별하개발", "별하건설", -1],
  ];
  const sites = [];
  for (const [name, region, type, addr, dev, bld, ago] of siteRows) {
    const s = await one(
      `INSERT INTO sites(name, region_code, property_type, address, developer, builder, status, description, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'recruiting',$7,$8,$9) RETURNING id, region_code`,
      [name, region, type, addr, dev, bld, "시연용 가상 현장입니다.", users.rec1, days(ago)]);
    sites.push(s);
  }

  const jobDefs = [
    [0, gaon, users.rec1, "동탄 1,200세대 아파트 상담사·팀장 대거 모집", ["counselor", "team_leader"], 30, "per_contract", 3000000, 50000, 12, 21],
    [0, gaon, users.rec1, "누리온 더테라스 본부장 모집 (팀 단위 환영)", ["director"], 3, "per_contract", 4500000, 100000, 12, 30],
    [1, haram, users.rec2, "청라 리버뷰 시티 신입 교육생 모집, 교육비 지원", ["newbie", "counselor"], 20, "per_contract", 2500000, 30000, 7, 14],
    [1, haram, users.rec2, "하람 리버뷰 팀장급 상담사 모집", ["team_leader"], 5, "per_contract", 3500000, 70000, 7, 25],
    [2, gaon, users.rec1, "마곡 오피스텔 480실 상담사 모집, 일비 당일 지급", ["counselor"], 15, "per_unit", 2000000, 50000, 3, 10],
    [3, haram, users.rec2, "미사 지식산업센터 법인영업 팀장·본부장", ["team_leader", "director"], 6, "percent", null, 0, 20, 40],
    [4, gaon, users.rec1, "해운대 상가 분양 상담사 (경력 우대)", ["counselor"], 10, "per_contract", 5000000, 0, 15, 20],
    [5, haram, users.rec2, "천안 윤슬 레이크 파크 상담사 30명", ["counselor", "newbie"], 30, "per_contract", 2800000, 40000, 5, 18],
    [6, gaon, users.rec1, "속초 레지던스 숙소 제공 상담사 모집", ["counselor", "team_leader"], 12, "per_unit", 2200000, 60000, 10, 12],
    [7, haram, users.rec2, "수성구 별하 포레스트 오픈 멤버 모집", ["counselor", "team_leader", "director"], 25, "per_contract", 3200000, 50000, 2, 28],
    [7, haram, users.rec2, "별하 포레스트 신입 교육생 (일비 3만)", ["newbie"], 15, "per_contract", 2000000, 30000, 2, 9],
    [2, gaon, users.rec1, "마곡 오피스텔 팀장 모집, 팀 오버라이드 별도", ["team_leader"], 4, "per_unit", 2500000, 50000, 3, 3],
  ];
  const jobs = [];
  for (const [si, comp, author, title, ranks, hc, basis, rt, daily, pubAgo, dl] of jobDefs) {
    const s = sites[si];
    const j = await one(
      `INSERT INTO job_posts(company_id, author_id, site_id, region_code, title, ranks, headcount, rt_basis, rt_amount, rt_percent, rt_note,
         daily_pay, daily_pay_condition, settlement_schedule, start_date, deadline, contract_type, benefits, contact_name, contact_phone,
         description, status, published_at, created_at, view_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'commission',$17,$18,$19,$20,'published',$21,$21,$22) RETURNING id`,
      [comp, author, s.id, s.region_code, title, ranks, hc, basis, rt, basis === "percent" ? 1.5 : null, basis === "percent" ? "분양가 대비, 법인 계약 기준" : "계약금 입금 확인 기준",
       daily, daily ? "출근일 기준, 첫 2주 지급" : null, "계약 익월 10일 일괄 정산", ymd(days(3)), ymd(days(dl)),
       daily ? ["숙소 제공", "교육 지원"] : ["교육 지원"], "담당 실장", "010-0000-" + String(1000 + jobs.length).padStart(4, "0"),
       "시연용 가상 공고입니다.\n\n· 홍보관 근무, 오전 10시~오후 6시\n· 현장 교육 3일 진행 후 투입\n· 고객 DB 일부 지원\n\n자세한 조건은 담당자에게 문의해 주세요.",
       days(-pubAgo / 4), Math.floor(Math.random() * 300) + 20]);
    jobs.push(j.id);
  }
  // 심사 대기 공고 1건
  await c.query(
    `INSERT INTO job_posts(company_id, author_id, site_id, region_code, title, ranks, headcount, rt_basis, rt_amount, daily_pay, contract_type,
       contact_name, contact_phone, description, status)
     VALUES ($1,$2,$3,$4,'[심사 대기] 동탄 2차 상담사 추가 모집',$5,10,'per_contract',3000000,50000,'commission','담당 실장','010-0000-9999','시연용 심사 대기 공고입니다.','pending')`,
    [gaon, users.rec1, sites[0].id, sites[0].region_code, ["counselor"]]);

  // 광고 상품 (초기 테스트 요금 — 가설)
  const prod = {};
  for (const [code, name, type, d, price, sort, desc] of [
    ["premium_7d", "프리미엄", "premium_job", 7, 50000, 10, "목록·홈 상단 프리미엄 영역 노출 7일"],
    ["vip_30d", "VIP", "vip_job", 30, 150000, 20, "프리미엄 영역 최상단 고정 노출 30일"],
    ["main_banner", "메인 배너", "main_banner", 30, 0, 30, "별도 협의"],
  ]) {
    prod[code] = (await one("INSERT INTO ad_products(code, name, type, duration_days, price, sort, description) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id", [code, name, type, d, price, sort, desc])).id;
  }
  // 진행 중 광고: VIP 1, 프리미엄 2 (시연 결제)
  let n = 0;
  for (const [ji, code, comp, buyer] of [[0, "vip_30d", gaon, users.rec1], [3, "premium_7d", haram, users.rec2], [7, "premium_7d", haram, users.rec2]]) {
    const p = await one("SELECT * FROM ad_products WHERE code = $1", [code]);
    const o = await one(
      `INSERT INTO ad_orders(order_no, buyer_id, company_id, product_id, job_post_id, product_snapshot, amount, status, paid_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'paid',now() - interval '1 day',now() - interval '1 day') RETURNING id`,
      [`BTDEMO-${++n}`, buyer, comp, p.id, jobs[ji], { code: p.code, name: p.name, type: p.type, duration_days: p.duration_days, price: p.price }, p.price]);
    await c.query("INSERT INTO payments(order_id, provider, payment_key, amount, status, approved_at) VALUES ($1,'mock',$2,$3,'approved',now() - interval '1 day')", [o.id, `mock_seed_${n}`, p.price]);
    const camp = await one("INSERT INTO ad_campaigns(order_id, product_type, job_post_id, starts_at, ends_at) VALUES ($1,$2,$3,now() - interval '1 day', now() + make_interval(days => $4)) RETURNING id", [o.id, p.type, jobs[ji], p.duration_days - 1]);
    await c.query("INSERT INTO ad_events(campaign_id, event_type, created_at) SELECT $1, 'impression', now() - random() * interval '1 day' FROM generate_series(1, $2)", [camp.id, 120 + n * 40]);
    await c.query("INSERT INTO ad_events(campaign_id, event_type, created_at) SELECT $1, 'click', now() - random() * interval '1 day' FROM generate_series(1, $2)", [camp.id, 6 + n * 3]);
  }
  await c.query("INSERT INTO job_events(job_post_id, event_type, created_at) SELECT j, 'view', now() - random() * interval '6 days' FROM unnest($1::uuid[]) j, generate_series(1, 25)", [jobs]);
  await c.query("INSERT INTO job_events(job_post_id, event_type, created_at) SELECT j, 'contact_click', now() - random() * interval '6 days' FROM unnest($1::uuid[]) j, generate_series(1, 3)", [jobs]);

  // 채팅 (전국 자유채팅)
  const national = (await one("SELECT id FROM chat_rooms WHERE type = 'national'")).id;
  const chat = [
    ["s1", "다들 이번 주 현장 분위기 어때요?"], ["s2", "동탄 쪽은 주말 내방객 꽤 많았어요"], ["s3", "청라는 아직 조용한 편이에요. 오픈 2주 차라 그런가"],
    ["rec2", "청라 리버뷰 신입 교육 다음 주 월요일 시작합니다. 관심 있으면 공고 확인해 주세요"], ["s4", "일비 당일 지급하는 데 요즘 많지 않던데 마곡은 진짜인가요?"],
    ["s1", "작년에 마곡 쪽 있었는데 정산은 깔끔했어요"], ["s5", "신입인데 상담사 교육 보통 며칠 하나요?"], ["s2", "보통 3일, 길면 1주일이요. 롤플레이 많이 해요"],
    ["s3", "수수료 정산 익월 10일이면 괜찮은 편이죠"], ["s4", "천안 쪽 다녀오신 분 계세요?"], ["s5", "감사합니다! 공고부터 찬찬히 볼게요"],
  ];
  let t = 0;
  for (const [k, body] of chat) {
    const nick = (await one("SELECT nickname FROM profiles WHERE user_id = $1", [users[k]])).nickname;
    await c.query("INSERT INTO chat_messages(room_id, sender_id, sender_nickname, body, created_at) VALUES ($1,$2,$3,$4, now() - make_interval(mins => $5))", [national, users[k], nick, body, (chat.length - t++) * 7]);
    await c.query("INSERT INTO chat_room_members(room_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [national, users[k]]);
  }
  const seoulRoom = (await one("SELECT id FROM chat_rooms WHERE region_code = 'seoul'")).id;
  await c.query("INSERT INTO chat_messages(room_id, sender_id, sender_nickname, body) VALUES ($1,$2,'익명 판다331','서울 오피스텔 현장 요즘 어디가 괜찮나요?')", [seoulRoom, users.s3]);
  const spam = await one("INSERT INTO chat_messages(room_id, sender_id, sender_nickname, body) VALUES ($1,$2,'익명 여우742','고수익 리딩방 들어오실 분 개인톡 주세요') RETURNING id", [national, users.s4]);
  await c.query("INSERT INTO reports(reporter_id, target_type, target_id, target_user_id, reason, detail) VALUES ($1,'chat_message',$2,$3,'spam','분양과 무관한 홍보')", [users.s1, String(spam.id), users.s4]);

  // 게시판
  const posts = [
    ["s1", "settle", "수수료 정산 늦어질 때 다들 어떻게 하세요?", "계약 익월 정산이라고 했는데 2주째 소식이 없네요. 팀장님께 먼저 말하는 게 맞겠죠?", 0, 14, 6],
    ["s2", "site", "동탄 누리온 주말 분위기 공유", "토요일 내방객 꽤 많았고 대기 30분 정도. 모델하우스 동선이 좋아서 상담하기 편했어요.", 0, 9, 4],
    ["s5", "qna", "신입인데 첫 현장 고를 때 뭘 봐야 하나요?", "일비랑 교육 기간 말고 꼭 확인해야 할 게 있을까요?", null, 21, 8],
    ["s3", "free", "요즘 오피스텔 현장 체감 어떠세요", "작년보다 확실히 문의가 줄었는데 다른 분들도 비슷한가요?", 2, 5, 3],
    ["s4", "free", "분양 일 하면서 제일 뿌듯했던 순간", "첫 계약 때 고객님이 고맙다고 음료수 사 오셨던 거요. 다들 있으시죠?", null, 17, 5],
  ];
  for (const [k, cat, title, body, si, likes, cmts] of posts) {
    const nick = (await one("SELECT nickname FROM profiles WHERE user_id = $1", [users[k]])).nickname;
    const p = await one("INSERT INTO board_posts(author_id, author_nickname, category, site_id, title, body, like_count, view_count, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() - random() * interval '3 days') RETURNING id",
      [users[k], nick, cat, si === null ? null : sites[si].id, title, body, likes, likes * 9]);
    for (let i = 0; i < cmts; i++) {
      const [ck, cn] = seekers[(i + 1) % seekers.length];
      await c.query("INSERT INTO board_comments(post_id, author_id, author_nickname, body, created_at) VALUES ($1,$2,$3,$4, now() - random() * interval '2 days')",
        [p.id, users[ck], cn, ["공감합니다", "저도 같은 경험 있어요", "팀장님께 먼저 얘기해 보세요", "좋은 정보 감사해요", "응원합니다!"][i % 5]]);
    }
    await c.query("UPDATE board_posts SET comment_count = $2 WHERE id = $1", [p.id, cmts]);
  }
  await c.query("INSERT INTO notices(title, body, is_pinned, created_by) VALUES ('분양톡 베타 오픈 안내', '시연 환경입니다.', true, $1), ('허위 공고 신고 기능 안내', '공고 상세 하단에서 신고할 수 있습니다.', false, $1)", [users.admin]);
  await c.query("INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, detail) VALUES ($1,'seed','system','-', '{\"note\":\"시연 데이터 생성\"}')", [users.admin]);
  await c.query("COMMIT");
  console.log(`seed ok — 시연 계정 비밀번호: ${PW}`);
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  await c.end();
}
