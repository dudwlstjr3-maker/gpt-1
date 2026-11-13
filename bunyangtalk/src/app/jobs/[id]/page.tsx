import Link from "next/link";
import { notFound } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { isUuid } from "@/lib/http";
import { RANKS, PROPERTY_TYPES, CONTRACT_TYPES, JOB_STATUS, REPORT_REASONS, label } from "@/lib/constants";
import { rtText, won, ymd, dday } from "@/lib/format";
import { ActionButton, ContactReveal, ReportButton } from "@/components/client";
import { Pill, ConditionBar } from "@/components/ui";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const v = await getViewer();
  const j = await q1(
    `SELECT j.*, s.name AS site_name, s.address, s.property_type, s.developer, s.builder, r.name AS region_name,
            c.name AS company_name, c.verification_status,
            (SELECT count(*)::int FROM job_events e WHERE e.job_post_id = j.id AND e.event_type = 'contact_click') AS contacts
       FROM job_posts j JOIN sites s ON s.id = j.site_id JOIN regions r ON r.code = j.region_code JOIN companies c ON c.id = j.company_id
      WHERE j.id = $1`,
    [id],
  );
  if (!j) notFound();
  const isOwner = !!v && v.verifiedCompanyIds.includes(j.company_id);
  // 게시 전·반려 공고는 작성 기업과 운영자만 볼 수 있다
  if (j.status !== "published" && j.status !== "closed" && !isOwner && !v?.isOperator) notFound();
  if (j.status === "published" && !isOwner) {
    await q("UPDATE job_posts SET view_count = view_count + 1 WHERE id = $1", [id]);
    await q("INSERT INTO job_events(job_post_id, event_type, user_id) VALUES ($1,'view',$2)", [id, v?.id ?? null]);
  }
  const saved = v ? !!(await q1("SELECT 1 FROM saved_jobs WHERE user_id = $1 AND job_post_id = $2", [v.id, id])) : false;
  const d = dday(j.deadline);

  const facts: [string, string][] = [
    ["RT", `${rtText(j as never).replace(/^RT /, "")}${j.rt_note ? ` (${j.rt_note})` : ""}`],
    ["일비", j.daily_pay ? `${won(j.daily_pay)}${j.daily_pay_condition ? ` · ${j.daily_pay_condition}` : ""}` : "없음"],
    ["정산 일정", j.settlement_schedule ?? "-"],
    ["모집 직급", (j.ranks as string[]).map((r) => label(RANKS, r)).join(", ")],
    ["모집 인원", j.headcount ? `${j.headcount}명` : "-"],
    ["투입 예정일", ymd(j.start_date)],
    ["모집 마감일", j.deadline ? `${ymd(j.deadline)}${d ? ` (${d})` : ""}` : "채용 시 마감"],
    ["계약 형태", label(CONTRACT_TYPES, j.contract_type)],
  ];

  return (
    <article className="mx-auto max-w-3xl pb-24 lg:pb-0">{/* 모바일: 하단 고정 버튼 + 하단 탭 높이만큼 여백 */}
      <Link href="/jobs" className="mt-4 inline-flex items-center text-sm text-muted hover:text-ink"><Icon name="back" size={18} />공고 목록</Link>
      {j.status !== "published" && (
        <div className={`mt-3 rounded-xl px-4 py-3 text-sm ${j.status === "rejected" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"}`}>
          이 공고는 <b>{JOB_STATUS[j.status]}</b> 상태입니다.{j.reject_reason && ` 사유: ${j.reject_reason}`}
          {j.status === "pending" && " 운영자 검토 후 게시됩니다."}
        </div>
      )}
      <header className="card mt-3 p-5 lg:p-6">
        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
          <Pill tone="blue">{j.region_name}</Pill>
          <Pill>{label(PROPERTY_TYPES, j.property_type)}</Pill>
          {d && <Pill tone={d === "마감" ? "gray" : "red"}>{d}</Pill>}
        </div>
        <h1 className="mt-2 text-[21px] font-bold leading-snug tracking-tight lg:text-2xl">{j.title}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-ink-2">
          {j.company_name}
          {j.verification_status === "verified" && <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-emerald-700"><Icon name="shield" size={14} />기업 확인</span>}
        </p>
        <p className="mt-1 text-[13px] text-muted">게시 {ymd(j.published_at ?? j.created_at)} · 조회 {j.view_count.toLocaleString()}</p>
        <div className="mt-4"><ConditionBar j={j} size="lg" /></div>
      </header>

      <section className="card mt-3 p-5 lg:p-6">
        <h2 className="section-title">모집 조건</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {facts.map(([k, val]) => (
            <div key={k} className="flex gap-3 border-b border-line py-2.5 text-[15px] last:border-0 sm:[&:nth-last-child(2)]:border-0">
              <dt className="w-24 shrink-0 text-muted">{k}</dt><dd className="font-medium text-ink">{val}</dd>
            </div>
          ))}
        </dl>
        {j.benefits.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">{(j.benefits as string[]).map((b) => <span key={b} className="chip h-7 text-[13px]">{b}</span>)}</div>
        )}
      </section>

      <section className="card mt-3 p-5 lg:p-6">
        <h2 className="section-title">상세 모집 내용</h2>
        <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-ink-2">{j.description}</p>
      </section>

      <Link href={`/sites/${j.site_id}`} className="card mt-3 flex items-center gap-3 p-5 hover:border-brand-200">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon name="site" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{j.site_name}</span>
          <span className="block truncate text-[13px] text-muted">{j.address ?? j.region_name}{j.developer ? ` · 시행 ${j.developer}` : ""}</span>
        </span>
        <span className="text-sm text-muted">현장 정보</span><Icon name="right" size={18} className="text-muted" />
      </Link>

      <div className="mt-3 flex items-center justify-between px-1 text-sm">
        <span className="text-muted">허위·과장 공고라면 알려 주세요.</span>
        {v ? <ReportButton targetType="job_post" targetId={j.id} reasons={REPORT_REASONS} label="허위 공고 신고" className="font-semibold text-red-600" />
          : <Link href={`/login?next=/jobs/${j.id}`} className="font-semibold text-red-600">허위 공고 신고</Link>}
      </div>

      {isOwner && (
        <div className="card mt-3 flex flex-wrap items-center gap-2 p-4">
          <span className="mr-auto text-sm text-muted">우리 기업 공고 · 문의 클릭 {j.contacts}회</span>
          {j.status !== "closed" && <Link href={`/jobs/${j.id}/edit`} className="btn-ghost btn-sm">수정</Link>}
          {j.status !== "closed" && <ActionButton endpoint={`/api/jobs/${j.id}/close`} confirm="공고를 마감할까요? 마감 후에는 다시 열 수 없습니다.">마감</ActionButton>}
        </div>
      )}

      {j.status === "published" && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface p-3 lg:static lg:mt-4 lg:rounded-[var(--radius-card)] lg:border">
          <div className="mx-auto flex max-w-3xl gap-2">
            {v ? (
              <ActionButton endpoint={`/api/jobs/${j.id}/save`} className={`btn-ghost w-14 px-0 ${saved ? "text-brand-600" : ""}`}>
                <Icon name="bookmark" fill={saved} /><span className="sr-only">{saved ? "관심 해제" : "관심 저장"}</span>
              </ActionButton>
            ) : (
              <Link href={`/login?next=/jobs/${j.id}`} className="btn-ghost w-14 px-0" aria-label="관심 저장"><Icon name="bookmark" /></Link>
            )}
            <ContactReveal jobId={j.id} loggedIn={!!v} />
          </div>
        </div>
      )}
    </article>
  );
}
