import Link from "next/link";
import { searchJobs, type JobFilters } from "@/lib/jobs";
import { JobCard, Empty, PageTitle } from "@/components/ui";
import { ImpressionBeacon } from "@/components/client";
import { REGIONS, RANKS, PROPERTY_TYPES, RT_MIN_OPTIONS, DAILY_MIN_OPTIONS, keys } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "구인구직" };

type SP = Record<string, string | undefined>;
const pick = (v: string | undefined, allowed: string[]) => (v && allowed.includes(v) ? v : undefined);

function Select({ name, value, options, placeholder }: { name: string; value?: string; options: [string, string][]; placeholder: string }) {
  return (
    <select name={name} defaultValue={value ?? ""} className="input pr-8" aria-label={placeholder}>
      <option value="">{placeholder}</option>
      {options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = pick(sp.tab, ["all", "new", "premium"]) ?? "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const f: JobFilters = {
    region: pick(sp.region, keys(REGIONS)),
    rank: pick(sp.rank, keys(RANKS)),
    type: pick(sp.type, keys(PROPERTY_TYPES)),
    rtMin: Number(pick(sp.rt, keys(RT_MIN_OPTIONS))) || undefined,
    dailyMin: Number(pick(sp.daily, keys(DAILY_MIN_OPTIONS))) || undefined,
    q: sp.q?.trim().slice(0, 40) || undefined,
    sort: pick(sp.sort, ["latest", "deadline", "rt", "daily"]),
    newSites: tab === "new",
    premiumOnly: tab === "premium",
  };
  const [{ rows, total }, premium] = await Promise.all([
    searchJobs(f, 20, (page - 1) * 20),
    tab === "all" && page === 1 ? searchJobs({ ...f, premiumOnly: true }, 3) : Promise.resolve({ rows: [], total: 0 }),
  ]);
  const premiumIds = new Set(premium.rows.map((j) => j.id));
  const list = rows.filter((j) => !premiumIds.has(j.id));
  const qs = (patch: SP) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/jobs?${p.toString()}`;
  };
  const activeFilters = [f.region, f.rank, f.type, f.rtMin, f.dailyMin, f.q].filter(Boolean).length;

  return (
    <>
      <PageTitle title="구인구직" sub={`게시 중인 공고 ${total.toLocaleString()}건`}
        right={<Link href="/jobs/new" className="btn-primary btn-sm">공고 등록</Link>} />
      <ImpressionBeacon ids={[...premium.rows, ...rows].filter((j) => j.campaign_id).map((j) => j.campaign_id)} />

      <div className="mb-3 flex gap-2 overflow-x-auto">
        {[["all", "전체 공고"], ["new", "신규 현장"], ["premium", "프리미엄"]].map(([k, v]) => (
          <Link key={k} href={qs({ tab: k === "all" ? undefined : k, page: undefined })} className={tab === k ? "chip-on" : "chip"}>{v}</Link>
        ))}
        <Link href="/me#saved" className="chip">관심 공고</Link>
      </div>

      <details className="card mb-5 p-4 open:pb-5" open={activeFilters > 0 || undefined}>
        <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-semibold">
          <span>조건 검색 {activeFilters > 0 && <span className="ml-1 text-brand-600">{activeFilters}개 적용</span>}</span>
          <span className="text-sm font-normal text-muted">펼치기/접기</span>
        </summary>
        <form action="/jobs" className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
          <input name="q" defaultValue={f.q} placeholder="현장명·키워드" className="input col-span-2 md:col-span-3 lg:col-span-6" />
          <Select name="region" value={f.region} options={REGIONS} placeholder="전체 지역" />
          <Select name="rank" value={f.rank} options={RANKS} placeholder="전체 직급" />
          <Select name="type" value={f.type} options={PROPERTY_TYPES} placeholder="분양 유형" />
          <Select name="rt" value={sp.rt} options={RT_MIN_OPTIONS} placeholder="RT 금액" />
          <Select name="daily" value={sp.daily} options={DAILY_MIN_OPTIONS} placeholder="일비" />
          <Select name="sort" value={f.sort} options={[["latest", "최신순"], ["deadline", "마감 임박순"], ["rt", "RT 높은순"], ["daily", "일비 높은순"]]} placeholder="정렬: 최신순" />
          <div className="col-span-2 flex gap-2 md:col-span-3 lg:col-span-6">
            <button className="btn-navy flex-1">조건 적용</button>
            <Link href="/jobs" className="btn-ghost">초기화</Link>
          </div>
        </form>
      </details>

      {premium.rows.length > 0 && (
        <section className="mb-5">
          <p className="mb-2 text-[13px] font-semibold text-ad-700">프리미엄 광고 공고</p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{premium.rows.map((j) => <JobCard key={j.id} j={j} />)}</div>
        </section>
      )}

      {list.length ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{list.map((j) => <JobCard key={j.id} j={j} />)}</div>
      ) : (
        <Empty action={<Link href="/jobs" className="btn-ghost btn-sm">조건 초기화</Link>}>조건에 맞는 공고가 없습니다.</Empty>
      )}

      {total > 20 && (
        <nav className="mt-6 flex items-center justify-center gap-2" aria-label="페이지">
          {page > 1 && <Link href={qs({ page: String(page - 1) })} className="btn-ghost btn-sm">이전</Link>}
          <span className="px-3 text-sm text-muted">{page} / {Math.ceil(total / 20)}</span>
          {page * 20 < total && <Link href={qs({ page: String(page + 1) })} className="btn-ghost btn-sm">다음</Link>}
        </nav>
      )}
    </>
  );
}
