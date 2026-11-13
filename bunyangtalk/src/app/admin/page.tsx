import Link from "next/link";
import { notFound } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { requirePageUser, type Viewer } from "@/lib/auth";
import { JOB_STATUS, REPORT_REASONS, label } from "@/lib/constants";
import { won, ymd, ago, maskEmail } from "@/lib/format";
import { ActionButton, JsonForm } from "@/components/client";
import { Pill, Stat, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "관리자" };

const TABS: [string, string, boolean?][] = [
  ["dashboard", "대시보드"], ["users", "회원"], ["companies", "기업 인증"], ["jobs", "공고 심사"], ["reports", "신고"],
  ["community", "채팅·커뮤니티"], ["ads", "광고 상품", true], ["sales", "매출", true], ["audit", "감사 로그"],
];
type SP = Record<string, string | undefined>;
const A = (action: string, extra: Record<string, unknown> = {}) => ({ endpoint: "/api/admin/action", payload: { action, ...extra } });

export default async function Admin({ searchParams }: { searchParams: Promise<SP> }) {
  const v = await requirePageUser("/admin");
  if (!v.isOperator) notFound();
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "dashboard";
  const body = await ({ dashboard: Dashboard, users: Users, companies: Companies, jobs: Jobs, reports: Reports, community: Community, ads: Ads, sales: Sales, audit: Audit } as Record<string, (v: Viewer, sp: SP) => Promise<React.ReactNode>>)[tab](v, sp);
  return (
    <div className="mt-4 lg:mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">관리자</h1>
        <Pill tone="navy">{v.isSuperAdmin ? "최고 관리자" : "운영 관리자"}</Pill>
      </div>
      <nav className="mb-5 flex gap-1.5 overflow-x-auto pb-1" aria-label="관리 메뉴">
        {TABS.filter(([, , sa]) => !sa || v.isSuperAdmin).map(([k, l]) => <Link key={k} href={`/admin?tab=${k}`} className={tab === k ? "chip-on" : "chip"}>{l}</Link>)}
      </nav>
      {body}
    </div>
  );
}

function Table({ head, children, min = 720 }: { head: string[]; children: React.ReactNode; min?: number }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth: min }}>
        <thead className="bg-surface-2 text-[13px] text-muted"><tr>{head.map((h) => <th key={h} className="px-3 py-2.5 font-semibold first:pl-4">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line [&_td]:px-3 [&_td]:py-2.5 [&_td:first-child]:pl-4">{children}</tbody>
      </table>
    </div>
  );
}

async function Dashboard() {
  const s = await q1(`SELECT
    (SELECT count(*)::int FROM users WHERE status <> 'withdrawn') AS users,
    (SELECT count(DISTINCT id)::int FROM (
        SELECT id FROM users WHERE last_login_at > now() - interval '7 days'
        UNION SELECT sender_id FROM chat_messages WHERE created_at > now() - interval '7 days'
        UNION SELECT author_id FROM board_posts WHERE created_at > now() - interval '7 days') x) AS active7,
    (SELECT count(*)::int FROM users WHERE created_at > current_date) AS new_today,
    (SELECT count(*)::int FROM users WHERE created_at > now() - interval '7 days') AS new7,
    (SELECT count(*)::int FROM job_posts WHERE status = 'published' AND (deadline IS NULL OR deadline >= current_date)) AS active_jobs,
    (SELECT count(DISTINCT sender_id)::int FROM chat_messages WHERE created_at > now() - interval '7 days') AS chat_users7,
    (SELECT count(*)::int FROM job_events WHERE event_type = 'view' AND created_at > now() - interval '7 days') AS views7,
    (SELECT count(*)::int FROM job_events WHERE event_type = 'contact_click' AND created_at > now() - interval '7 days') AS contacts7,
    (SELECT count(*)::int FROM ad_events WHERE event_type = 'click' AND created_at > now() - interval '7 days') AS ad_clicks7,
    (SELECT count(*)::int FROM ad_events WHERE event_type = 'impression' AND created_at > now() - interval '7 days') AS ad_imp7,
    (SELECT COALESCE(sum(amount),0)::int FROM payments WHERE status = 'approved' AND approved_at > current_date) AS rev_today,
    (SELECT COALESCE(sum(amount),0)::int FROM payments WHERE status = 'approved' AND approved_at > date_trunc('month', now())) AS rev_month,
    (SELECT count(*)::int FROM companies WHERE verification_status = 'pending') AS q_companies,
    (SELECT count(*)::int FROM job_posts WHERE status = 'pending') AS q_jobs,
    (SELECT count(*)::int FROM reports WHERE status = 'open') AS q_reports`);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[["기업 인증 대기", s!.q_companies, "companies"], ["공고 심사 대기", s!.q_jobs, "jobs"], ["처리할 신고", s!.q_reports, "reports"]].map(([l, n, t]) => (
          <Link key={t as string} href={`/admin?tab=${t}`} className={`card flex items-center justify-between p-4 ${Number(n) > 0 ? "border-brand-200 bg-brand-50" : ""}`}>
            <span className="text-[15px] font-semibold">{l}</span><span className="text-2xl font-bold text-navy-900">{n}</span>
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="전체 회원" value={s!.users.toLocaleString()} sub={`오늘 +${s!.new_today} · 7일 +${s!.new7}`} />
        <Stat label="활성 회원 (7일)" value={s!.active7.toLocaleString()} sub="로그인·채팅·글쓰기 기준" />
        <Stat label="채팅 이용자 (7일)" value={s!.chat_users7.toLocaleString()} />
        <Stat label="활성 구인공고" value={s!.active_jobs.toLocaleString()} />
        <Stat label="공고 조회 (7일)" value={s!.views7.toLocaleString()} />
        <Stat label="문의 전환율 (7일)" value={s!.views7 ? `${((s!.contacts7 / s!.views7) * 100).toFixed(1)}%` : "-"} sub={`연락처 보기 ${s!.contacts7}회`} />
        <Stat label="광고 클릭 (7일)" value={s!.ad_clicks7.toLocaleString()} sub={`노출 ${s!.ad_imp7.toLocaleString()} · CTR ${s!.ad_imp7 ? ((s!.ad_clicks7 / s!.ad_imp7) * 100).toFixed(1) : "-"}%`} />
        <Stat label="매출" value={won(s!.rev_month)} sub={`이번 달 · 오늘 ${won(s!.rev_today)}`} />
      </div>
    </div>
  );
}

async function Users(v: Viewer, sp: SP) {
  const term = sp.q?.trim().slice(0, 60) || null;
  const rows = await q(
    `SELECT u.id, u.email, u.status, u.created_at, u.last_login_at, p.nickname,
            COALESCE((SELECT array_agg(role) FROM user_roles r WHERE r.user_id = u.id), '{}') AS roles,
            (SELECT max(ends_at) FROM user_sanctions s WHERE s.user_id = u.id AND s.type = 'chat_mute' AND s.ends_at > now()) AS muted_until
       FROM users u JOIN profiles p ON p.user_id = u.id
      WHERE u.status <> 'withdrawn' AND ($1::text IS NULL OR u.email ILIKE '%'||$1||'%' OR p.nickname ILIKE '%'||$1||'%')
      ORDER BY u.created_at DESC LIMIT 50`, [term]);
  return (
    <>
      <form className="mb-3 flex gap-2"><input type="hidden" name="tab" value="users" /><input name="q" defaultValue={term ?? ""} className="input max-w-sm" placeholder="이메일·닉네임 검색" /><button className="btn-navy">검색</button></form>
      <p className="mb-3 text-[13px] text-muted">{v.isSuperAdmin ? "최고 관리자는 이메일 전체를 봅니다." : "개인정보 최소 열람 원칙에 따라 이메일 일부를 가려 표시합니다."}</p>
      <Table head={["닉네임", "이메일", "상태", "권한", "가입", "최근 로그인", "조치"]} min={900}>
        {rows.map((u) => (
          <tr key={u.id}>
            <td className="font-semibold">{u.nickname}</td>
            <td className="text-muted">{v.isSuperAdmin ? u.email : maskEmail(u.email)}</td>
            <td><Pill tone={u.status === "active" ? "green" : "red"}>{u.status === "active" ? "정상" : "정지"}</Pill>{u.muted_until && <span className="ml-1 text-[12px] text-red-600">채팅 금지 ~{ymd(u.muted_until)}</span>}</td>
            <td className="text-[12px]">{(u.roles as string[]).join(", ") || "-"}</td>
            <td className="text-[12px] text-muted">{ymd(u.created_at)}</td>
            <td className="text-[12px] text-muted">{u.last_login_at ? ago(u.last_login_at) : "-"}</td>
            <td className="whitespace-nowrap space-x-1">
              {u.status === "active"
                ? <ActionButton {...A("user.suspend", { id: u.id })} prompt={{ key: "reason", message: "정지 사유" }}>정지</ActionButton>
                : <ActionButton {...A("user.activate", { id: u.id })}>해제</ActionButton>}
              <ActionButton {...A("user.mute", { id: u.id, days: 7 })} prompt={{ key: "reason", message: "채팅 금지 7일 사유" }}>채팅 금지</ActionButton>
              {v.isSuperAdmin && ((u.roles as string[]).includes("operator")
                ? <ActionButton {...A("user.revokeRole", { id: u.id, role: "operator" })} confirm="운영 관리자 권한을 회수할까요?">운영자 해제</ActionButton>
                : <ActionButton {...A("user.grantRole", { id: u.id, role: "operator" })} confirm="운영 관리자 권한을 줄까요?">운영자 지정</ActionButton>)}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

async function Companies() {
  const rows = await q(
    `SELECT c.*, p.nickname AS requester, (SELECT count(*)::int FROM company_members m WHERE m.company_id = c.id) AS members
       FROM companies c JOIN profiles p ON p.user_id = c.created_by ORDER BY (c.verification_status = 'pending') DESC, c.created_at DESC LIMIT 100`);
  return (
    <>
      <p className="mb-3 rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-muted">확인 절차: 사업자등록번호 상태(국세청 조회) → 사업자등록증명원 대조 → 승인. 국세청 상태조회 API 자동 연동은 출시 전 작업입니다.</p>
      <Table head={["회사명", "사업자번호", "대표자", "신청자", "신청일", "상태", "조치"]}>
        {rows.map((c) => (
          <tr key={c.id}>
            <td className="font-semibold">{c.name}</td>
            <td className="font-mono text-[13px]">{c.business_number.replace(/(\d{3})(\d{2})(\d{5})/, "$1-$2-$3")}</td>
            <td>{c.representative}</td><td>{c.requester}</td><td className="text-[12px] text-muted">{ymd(c.created_at)}</td>
            <td><Pill tone={c.verification_status === "verified" ? "green" : c.verification_status === "rejected" ? "red" : "amber"}>{c.verification_status === "verified" ? "인증" : c.verification_status === "rejected" ? "반려" : "대기"}</Pill></td>
            <td className="whitespace-nowrap space-x-1">
              {c.verification_status !== "verified" && <ActionButton {...A("company.verify", { id: c.id })} className="btn-primary btn-sm" confirm={`${c.name}을(를) 인증할까요?`}>승인</ActionButton>}
              {c.verification_status !== "rejected" && <ActionButton {...A("company.reject", { id: c.id })} prompt={{ key: "reason", message: "반려 사유" }}>반려</ActionButton>}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

async function Jobs(_v: Viewer, sp: SP) {
  const status = ["pending", "published", "rejected", "closed"].includes(sp.status ?? "") ? sp.status! : "pending";
  const rows = await q(
    `SELECT j.id, j.title, j.status, j.created_at, j.updated_at, j.description, c.name AS company, c.verification_status, s.name AS site,
            (SELECT count(*)::int FROM job_post_revisions r WHERE r.job_post_id = j.id) AS revisions,
            (SELECT count(*)::int FROM reports r WHERE r.target_type = 'job_post' AND r.target_id = j.id::text AND r.status = 'open') AS reports
       FROM job_posts j JOIN companies c ON c.id = j.company_id JOIN sites s ON s.id = j.site_id
      WHERE j.status = $1 ORDER BY j.created_at ${status === "pending" ? "ASC" : "DESC"} LIMIT 100`, [status]);
  const revs = rows.length ? await q(
    `SELECT r.job_post_id, r.created_at, r.snapshot->>'title' AS title, r.snapshot->>'rt_amount' AS rt, r.snapshot->>'daily_pay' AS daily, p.nickname
       FROM job_post_revisions r JOIN profiles p ON p.user_id = r.editor_id WHERE r.job_post_id = ANY($1) ORDER BY r.created_at DESC`, [rows.map((r) => r.id)]) : [];
  return (
    <>
      <div className="mb-3 flex gap-1.5">{Object.entries(JOB_STATUS).map(([k, l]) => <Link key={k} href={`/admin?tab=jobs&status=${k}`} className={status === k ? "chip-on" : "chip"}>{l}</Link>)}</div>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((j) => (
            <li key={j.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/jobs/${j.id}`} target="_blank" className="font-semibold hover:underline">{j.title}</Link>
                {j.reports > 0 && <Pill tone="red">신고 {j.reports}</Pill>}
                {j.revisions > 0 && <Pill tone="amber">수정 {j.revisions}회</Pill>}
              </div>
              <p className="mt-1 text-[13px] text-muted">{j.company} {j.verification_status === "verified" ? "(인증)" : "(미인증)"} · {j.site} · 등록 {ymd(j.created_at)} · 최근 수정 {ago(j.updated_at)}</p>
              <p className="mt-2 line-clamp-2 text-[13px] text-ink-2">{j.description}</p>
              {j.revisions > 0 && (
                <details className="mt-2 text-[13px]">
                  <summary className="cursor-pointer text-brand-700">수정 이력</summary>
                  <ul className="mt-1 space-y-1 text-muted">
                    {revs.filter((r) => r.job_post_id === j.id).map((r, i) => <li key={i}>{ymd(r.created_at)} {r.nickname} 수정 — 이전 제목 &ldquo;{r.title}&rdquo;, RT {won(Number(r.rt) || null)}, 일비 {won(Number(r.daily))}</li>)}
                  </ul>
                </details>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(j.status === "pending" || j.status === "rejected") && <ActionButton {...A("job.approve", { id: j.id })} className="btn-primary btn-sm">승인·게시</ActionButton>}
                {(j.status === "pending" || j.status === "published") && <ActionButton {...A("job.reject", { id: j.id })} prompt={{ key: "reason", message: "반려 사유 (구인자에게 표시)" }}>반려</ActionButton>}
                {j.status !== "closed" && <ActionButton {...A("job.close", { id: j.id })} confirm="공고를 마감 처리할까요?">마감</ActionButton>}
              </div>
            </li>
          ))}
        </ul>
      ) : <Empty>해당 상태의 공고가 없습니다.</Empty>}
    </>
  );
}

async function Reports() {
  const rows = await q(
    `SELECT r.id, r.target_type, r.target_id, r.reason, r.detail, r.created_at, p.nickname AS reporter, tp.nickname AS target_nick,
            (SELECT count(*)::int FROM reports x WHERE x.target_type = r.target_type AND x.target_id = r.target_id AND x.status = 'open') AS same,
            CASE r.target_type
              WHEN 'chat_message' THEN (SELECT COALESCE(body, '(삭제됨)') FROM chat_messages WHERE id::text = r.target_id)
              WHEN 'board_post' THEN (SELECT title || ' — ' || left(body, 80) FROM board_posts WHERE id::text = r.target_id)
              WHEN 'board_comment' THEN (SELECT body FROM board_comments WHERE id::text = r.target_id)
              WHEN 'job_post' THEN (SELECT title FROM job_posts WHERE id::text = r.target_id) END AS preview
       FROM reports r JOIN profiles p ON p.user_id = r.reporter_id LEFT JOIN profiles tp ON tp.user_id = r.target_user_id
      WHERE r.status = 'open' ORDER BY same DESC, r.created_at LIMIT 100`);
  const TT: Record<string, string> = { chat_message: "채팅", board_post: "게시글", board_comment: "댓글", job_post: "공고" };
  return rows.length ? (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className={`card p-4 ${r.reason === "rights" ? "border-red-200" : ""}`}>
          <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
            <Pill>{TT[r.target_type]}</Pill><Pill tone={r.reason === "rights" ? "red" : "amber"}>{label(REPORT_REASONS, r.reason)}</Pill>
            {r.same > 1 && <Pill tone="red">같은 대상 신고 {r.same}건</Pill>}
            <span className="text-muted">작성자 {r.target_nick} · 신고자 {r.reporter} · {ago(r.created_at)}</span>
          </div>
          <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[14px]">{r.preview ?? "(대상 없음)"}</p>
          {r.detail && <p className="mt-1 text-[13px] text-muted">신고 내용: {r.detail}</p>}
          {r.reason === "rights" && <p className="mt-1 text-[12px] text-red-700">권리침해 신고: 확인 후 임시조치(숨김)하고 처리 결과를 기록하세요.</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <ActionButton {...A("report.action", { id: r.id, sanction: "none" })} className="btn-primary btn-sm">숨김 처리</ActionButton>
            <ActionButton {...A("report.action", { id: r.id, sanction: "chat_mute" })} confirm="숨김 + 작성자 채팅 금지 7일?">숨김 + 채팅 금지 7일</ActionButton>
            <ActionButton {...A("report.action", { id: r.id, sanction: "post_ban" })} confirm="숨김 + 작성자 게시 금지 7일?">숨김 + 게시 금지 7일</ActionButton>
            <ActionButton {...A("report.dismiss", { id: r.id })}>기각</ActionButton>
          </div>
        </li>
      ))}
    </ul>
  ) : <Empty>처리할 신고가 없습니다.</Empty>;
}

async function Community() {
  const [rooms, hidden] = await Promise.all([
    q(`SELECT r.id, r.name, r.type, r.is_active, (SELECT count(*)::int FROM chat_messages m WHERE m.room_id = r.id AND m.created_at > now() - interval '7 days') AS week
         FROM chat_rooms r WHERE r.type <> 'dm' ORDER BY r.sort, r.name`),
    q("SELECT id, title, author_nickname, updated_at FROM board_posts WHERE status = 'hidden' ORDER BY updated_at DESC LIMIT 50"),
  ]);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section>
        <h2 className="section-title mb-2">채팅방 운영</h2>
        <Table head={["채팅방", "7일 메시지", "상태", ""]} min={420}>
          {rooms.map((r) => (
            <tr key={r.id}><td>{r.name}</td><td>{r.week}</td><td><Pill tone={r.is_active ? "green" : "gray"}>{r.is_active ? "운영" : "중단"}</Pill></td>
              <td><ActionButton {...A("room.toggle", { id: r.id })}>{r.is_active ? "중단" : "열기"}</ActionButton></td></tr>
          ))}
        </Table>
      </section>
      <div className="space-y-5">
        <section className="card p-5">
          <h2 className="section-title">공지 등록</h2>
          <JsonForm endpoint="/api/admin/action" extra={{ action: "notice.create" }} submitLabel="등록" submitClass="btn-navy btn-sm" resetOnSuccess className="mt-3 space-y-2">
            <input name="title" className="input" placeholder="제목" />
            <textarea name="body" rows={3} className="textarea" placeholder="내용" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pinned" className="accent-brand-600" />상단 고정</label>
          </JsonForm>
        </section>
        <section>
          <h2 className="section-title mb-2">숨긴 게시글</h2>
          {hidden.length ? (
            <ul className="card divide-y divide-line">{hidden.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                <Link href={`/lounge/board/${p.id}`} className="flex-1 truncate hover:underline">{p.title}</Link><span className="text-muted">{p.author_nickname}</span>
                <ActionButton {...A("post.restore", { id: p.id })}>복구</ActionButton>
              </li>
            ))}</ul>
          ) : <Empty>숨긴 글이 없습니다.</Empty>}
        </section>
      </div>
    </div>
  );
}

async function Ads(v: Viewer) {
  if (!v.isSuperAdmin) notFound();
  const [products, companies, campaigns] = await Promise.all([
    q("SELECT * FROM ad_products ORDER BY sort, price"),
    q("SELECT id, name FROM companies WHERE verification_status = 'verified' ORDER BY name"),
    q(`SELECT a.id, a.product_type, a.starts_at, a.ends_at, a.status, c.name AS company, COALESCE(j.title, b.title) AS target,
              (SELECT count(*)::int FROM ad_events e WHERE e.campaign_id = a.id AND e.event_type = 'impression') AS imp,
              (SELECT count(*)::int FROM ad_events e WHERE e.campaign_id = a.id AND e.event_type = 'click') AS clk
         FROM ad_campaigns a JOIN ad_orders o ON o.id = a.order_id JOIN companies c ON c.id = o.company_id
         LEFT JOIN job_posts j ON j.id = a.job_post_id LEFT JOIN banners b ON b.id = a.banner_id
        ORDER BY a.created_at DESC LIMIT 50`),
  ]);
  return (
    <div className="space-y-6">
      <section>
        <h2 className="section-title mb-2">광고 상품</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {products.map((p) => (
            <div key={p.id} className="card p-4">
              <p className="font-semibold">{p.name} <span className="font-mono text-[12px] text-muted">{p.code} · {p.type}</span></p>
              <JsonForm endpoint="/api/admin/action" extra={{ action: "product.update", id: p.id }} submitLabel="저장" submitClass="btn-navy btn-sm" className="mt-2 flex flex-wrap items-end gap-2 [&>button]:mt-0">
                <label className="text-[12px] text-muted">가격(원)<input name="price" type="number" defaultValue={p.price} className="input h-9 w-32" /></label>
                <label className="text-[12px] text-muted">기간(일)<input name="durationDays" type="number" defaultValue={p.duration_days} className="input h-9 w-20" /></label>
                <label className="flex h-9 items-center gap-1.5 text-sm"><input type="checkbox" name="isActive" defaultChecked={p.is_active} className="accent-brand-600" />판매</label>
              </JsonForm>
            </div>
          ))}
        </div>
        <details className="card mt-2 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-brand-700">새 상품 만들기</summary>
          <JsonForm endpoint="/api/admin/action" extra={{ action: "product.create" }} submitLabel="생성" submitClass="btn-navy btn-sm" className="mt-3 grid gap-2 sm:grid-cols-3">
            <input name="code" className="input" placeholder="코드 (premium_14d)" /><input name="name" className="input" placeholder="상품명" />
            <select name="type" className="input"><option value="premium_job">프리미엄 공고</option><option value="vip_job">VIP 공고</option><option value="main_banner">메인 배너</option><option value="partner">협력업체</option></select>
            <input name="durationDays" type="number" className="input" placeholder="기간(일)" /><input name="price" type="number" className="input" placeholder="가격(원)" /><input name="description" className="input" placeholder="설명" />
          </JsonForm>
        </details>
      </section>
      <section className="card p-5">
        <h2 className="section-title">메인 배너 등록 (별도 협의 계약)</h2>
        <p className="mt-1 text-[13px] text-muted">계약 금액은 수기 결제로 기록되고 매출에 포함됩니다. 배너 이미지 업로드는 다음 버전입니다 (현재는 문구형 배너).</p>
        <JsonForm endpoint="/api/admin/action" extra={{ action: "banner.create" }} submitLabel="배너 시작" submitClass="btn-navy btn-sm" className="mt-3 grid gap-2 sm:grid-cols-3">
          <select name="companyId" className="input">{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input name="title" className="input sm:col-span-2" placeholder="배너 문구" />
          <input name="linkUrl" className="input" placeholder="https:// 링크 (선택)" />
          <select name="placement" className="input"><option value="home_top">홈 상단</option></select>
          <div className="flex gap-2"><input name="days" type="number" className="input" placeholder="기간(일)" /><input name="amount" type="number" className="input" placeholder="금액(원)" /></div>
        </JsonForm>
      </section>
      <section>
        <h2 className="section-title mb-2">광고 캠페인 성과</h2>
        <Table head={["유형", "광고주", "대상", "기간", "상태", "노출", "클릭", "CTR"]}>
          {campaigns.map((a) => {
            const live = a.status === "active" && new Date(a.ends_at) > new Date() && new Date(a.starts_at) <= new Date();
            return (
              <tr key={a.id}><td>{a.product_type}</td><td>{a.company}</td><td className="max-w-56 truncate">{a.target}</td>
                <td className="text-[12px]">{ymd(a.starts_at)} ~ {ymd(a.ends_at)}</td>
                <td><Pill tone={live ? "green" : "gray"}>{a.status === "cancelled" ? "취소" : live ? "노출 중" : new Date(a.ends_at) <= new Date() ? "만료" : "예약"}</Pill></td>
                <td>{a.imp}</td><td>{a.clk}</td><td>{a.imp ? `${((a.clk / a.imp) * 100).toFixed(1)}%` : "-"}</td></tr>
            );
          })}
        </Table>
      </section>
    </div>
  );
}

async function Sales(v: Viewer) {
  if (!v.isSuperAdmin) notFound();
  const [daily, monthly, orders] = await Promise.all([
    q(`SELECT to_char(d, 'MM.DD') AS day, COALESCE(sum(p.amount) FILTER (WHERE p.status = 'approved'), 0)::int AS rev,
              COALESCE(sum(p.amount) FILTER (WHERE p.status = 'cancelled'), 0)::int AS refund
         FROM generate_series(current_date - 13, current_date, interval '1 day') d
         LEFT JOIN payments p ON p.approved_at >= d AND p.approved_at < d + interval '1 day' GROUP BY d ORDER BY d`),
    q(`SELECT to_char(date_trunc('month', approved_at), 'YYYY.MM') AS month, sum(amount) FILTER (WHERE status = 'approved')::int AS rev,
              COALESCE(sum(amount) FILTER (WHERE status = 'cancelled'), 0)::int AS refund, count(*)::int AS n
         FROM payments GROUP BY 1 ORDER BY 1 DESC LIMIT 12`),
    q(`SELECT o.id, o.order_no, o.amount, o.status, o.created_at, o.paid_at, o.product_snapshot->>'name' AS product, c.name AS company, p.provider
         FROM ad_orders o JOIN companies c ON c.id = o.company_id LEFT JOIN payments p ON p.order_id = o.id
        ORDER BY o.created_at DESC LIMIT 100`),
  ]);
  const max = Math.max(1, ...daily.map((d) => d.rev));
  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="section-title">최근 14일 매출</h2>
        <div className="mt-4 flex h-40 items-end gap-1.5">
          {daily.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t bg-brand-500" style={{ height: `${(d.rev / max) * 100}%`, minHeight: d.rev ? 4 : 1 }} title={`${d.day} ${won(d.rev)}`} />
              <span className="text-[10px] text-muted">{d.day}</span>
            </div>
          ))}
        </div>
      </section>
      <Table head={["월", "매출(승인)", "환불", "건수"]} min={420}>
        {monthly.map((m) => <tr key={m.month}><td>{m.month}</td><td className="font-semibold">{won(m.rev ?? 0)}</td><td className="text-red-600">{won(m.refund)}</td><td>{m.n}</td></tr>)}
      </Table>
      <Table head={["주문번호", "광고주", "상품", "금액", "결제", "상태", "일시", ""]} min={900}>
        {orders.map((o) => (
          <tr key={o.id}>
            <td className="font-mono text-[12px]">{o.order_no}</td><td>{o.company}</td><td>{o.product}</td><td>{won(o.amount)}</td><td className="text-[12px]">{o.provider ?? "-"}</td>
            <td><Pill tone={o.status === "paid" ? "green" : o.status === "refunded" ? "red" : "gray"}>{o.status}</Pill></td>
            <td className="text-[12px] text-muted">{ymd(o.paid_at ?? o.created_at)}</td>
            <td>{o.status === "paid" && <ActionButton {...A("order.refund", { id: o.id })} prompt={{ key: "reason", message: "환불 사유 (광고는 즉시 중단됩니다)" }}>환불</ActionButton>}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

async function Audit() {
  const rows = await q(
    `SELECT l.id, l.action, l.target_type, l.target_id, l.detail, l.ip, l.created_at, p.nickname
       FROM admin_audit_logs l JOIN profiles p ON p.user_id = l.actor_id ORDER BY l.id DESC LIMIT 200`);
  return (
    <Table head={["일시", "관리자", "작업", "대상", "내용", "IP"]} min={900}>
      {rows.map((l) => (
        <tr key={l.id}><td className="whitespace-nowrap text-[12px]">{new Date(l.created_at).toLocaleString("ko-KR")}</td><td>{l.nickname}</td>
          <td className="font-mono text-[12px]">{l.action}</td><td className="text-[12px]">{l.target_type} {String(l.target_id).slice(0, 8)}</td>
          <td className="max-w-80 truncate text-[12px] text-muted">{l.detail ? JSON.stringify(l.detail) : ""}</td><td className="text-[12px] text-muted">{l.ip ?? "-"}</td></tr>
      ))}
    </Table>
  );
}
