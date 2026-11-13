import Link from "next/link";
import { notFound } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { isUuid } from "@/lib/http";
import { searchJobs } from "@/lib/jobs";
import { PROPERTY_TYPES, SITE_STATUS, BOARD_CATEGORIES, RANKS, label } from "@/lib/constants";
import { ago, won } from "@/lib/format";
import { JobCard, Pill, Empty, SectionHeader } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const v = await getViewer();
  const s = await q1("SELECT s.*, r.name AS region_name FROM sites s JOIN regions r ON r.code = s.region_code WHERE s.id = $1", [id]);
  if (!s) notFound();
  const [{ rows: jobs }, posts, agg, saved] = await Promise.all([
    searchJobs({ siteId: id }, 20),
    q("SELECT id, title, category, comment_count, like_count, created_at FROM board_posts WHERE site_id = $1 AND status = 'visible' ORDER BY created_at DESC LIMIT 10", [id]),
    q1(`SELECT min(rt_amount) AS rt_min, max(rt_amount) AS rt_max, max(daily_pay) AS daily_max,
               (SELECT array_agg(DISTINCT x) FROM job_posts j2, unnest(j2.ranks) x WHERE j2.site_id = $1 AND j2.status = 'published') AS ranks
          FROM job_posts WHERE site_id = $1 AND status = 'published'`, [id]),
    v ? q1("SELECT 1 FROM saved_sites WHERE user_id = $1 AND site_id = $2", [v.id, id]) : Promise.resolve(null),
  ]);
  const mapUrl = `https://map.kakao.com/?q=${encodeURIComponent(s.address ?? s.name)}`;
  const facts: [string, string][] = [
    ["현장 위치", s.address ?? s.region_name],
    ["분양 유형", label(PROPERTY_TYPES, s.property_type)],
    ["모집 상태", label(SITE_STATUS, s.status)],
    ["RT", agg?.rt_max ? (agg.rt_min === agg.rt_max ? won(agg.rt_max) : `${won(agg.rt_min)} ~ ${won(agg.rt_max)}`) : "공고별 상이"],
    ["일비", agg?.daily_max ? `최고 ${won(agg.daily_max)}` : "-"],
    ["모집 직급", agg?.ranks?.length ? (agg.ranks as string[]).map((r) => label(RANKS, r)).join(", ") : "-"],
    ["시행·시공", [s.developer, s.builder].filter(Boolean).join(" / ") || "-"],
  ];
  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/sites" className="mt-4 inline-flex items-center text-sm text-muted hover:text-ink"><Icon name="back" size={18} />분양현장</Link>
      <header className="card mt-3 p-5 lg:p-6">
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <Pill tone="blue">{s.region_name}</Pill><Pill>{label(PROPERTY_TYPES, s.property_type)}</Pill>
          <Pill tone={s.status === "recruiting" ? "green" : "gray"}>{label(SITE_STATUS, s.status)}</Pill>
        </div>
        <h1 className="mt-2 text-[22px] font-bold tracking-tight">{s.name}</h1>
        {s.description && <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.description}</p>}
        <dl className="mt-4 grid gap-x-6 sm:grid-cols-2">
          {facts.map(([k, val]) => (
            <div key={k} className="flex gap-3 border-b border-line py-2.5 text-[15px]"><dt className="w-20 shrink-0 text-muted">{k}</dt><dd className="font-medium">{val}</dd></div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {v ? <ActionButton endpoint={`/api/sites/${id}/chat`} className="btn-primary btn-sm"><Icon name="chat" size={17} />현장 채팅 입장</ActionButton>
            : <Link href={`/login?next=/sites/${id}`} className="btn-primary btn-sm">현장 채팅 입장</Link>}
          {v && <ActionButton endpoint={`/api/sites/${id}/save`} className={`btn-ghost btn-sm ${saved ? "text-brand-600" : ""}`}><Icon name="bookmark" size={17} fill={!!saved} />{saved ? "관심 현장" : "관심 저장"}</ActionButton>}
          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm"><Icon name="pin" size={17} />지도에서 보기</a>
        </div>
      </header>
      <section className="mt-6">
        <SectionHeader title={`현재 구인공고 ${jobs.length}건`} />
        {jobs.length ? <div className="grid gap-3 md:grid-cols-2">{jobs.map((j) => <JobCard key={j.id} j={j} />)}</div> : <Empty>게시 중인 공고가 없습니다.</Empty>}
      </section>
      <section className="mt-6">
        <SectionHeader title="현장 관련 게시글" href={`/lounge/board/new?site=${id}`} more="글쓰기" />
        {posts.length ? (
          <ul className="card divide-y divide-line">
            {posts.map((p) => (
              <li key={p.id}><Link href={`/lounge/board/${p.id}`} className="block px-4 py-3 hover:bg-surface-2">
                <p className="truncate text-[15px] font-medium">{p.title}</p>
                <p className="text-[12px] text-muted">{label(BOARD_CATEGORIES, p.category)} · 공감 {p.like_count} · 댓글 {p.comment_count} · {ago(p.created_at)}</p>
              </Link></li>
            ))}
          </ul>
        ) : <Empty>아직 이 현장에 대한 글이 없습니다.</Empty>}
      </section>
    </div>
  );
}
