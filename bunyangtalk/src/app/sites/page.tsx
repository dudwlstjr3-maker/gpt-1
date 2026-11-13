import Link from "next/link";
import { q } from "@/lib/db";
import { REGIONS, PROPERTY_TYPES, SITE_STATUS, label, keys } from "@/lib/constants";
import { won } from "@/lib/format";
import { PageTitle, Pill, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "분양현장" };

export default async function Sites({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const region = keys(REGIONS).includes(sp.region ?? "") ? sp.region! : null;
  const type = keys(PROPERTY_TYPES).includes(sp.type ?? "") ? sp.type! : null;
  const status = keys(SITE_STATUS).includes(sp.status ?? "") ? sp.status! : null;
  const sites = await q(
    `SELECT s.id, s.name, s.address, s.property_type, s.status, s.created_at, r.name AS region_name,
            count(j.id)::int AS jobs, max(j.rt_amount) AS rt_max, max(j.daily_pay) AS daily_max,
            (SELECT array_agg(DISTINCT x) FROM job_posts j2, unnest(j2.ranks) x WHERE j2.site_id = s.id AND j2.status = 'published') AS ranks
       FROM sites s JOIN regions r ON r.code = s.region_code
       LEFT JOIN job_posts j ON j.site_id = s.id AND j.status = 'published'
      WHERE ($1::text IS NULL OR s.region_code = $1) AND ($2::text IS NULL OR s.property_type = $2) AND ($3::text IS NULL OR s.status = $3)
      GROUP BY s.id, r.name ORDER BY count(j.id) DESC, s.created_at DESC LIMIT 60`,
    [region, type, status],
  );
  const chip = (key: string, val: string | null, cur: string | null, text: string) => {
    const p = new URLSearchParams(Object.entries({ region, type, status, [key]: val }).filter(([, x]) => x) as [string, string][]);
    return <Link key={`${key}-${val}`} href={`/sites?${p}`} className={cur === val ? "chip-on" : "chip"}>{text}</Link>;
  };
  return (
    <>
      <PageTitle title="분양현장" sub="현장별 모집 조건과 공고, 현장 이야기를 한곳에서" />
      <div className="mb-2 flex gap-2 overflow-x-auto pb-1">{chip("region", null, region, "전국")}{REGIONS.map(([k, v]) => chip("region", k, region, v))}</div>
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {chip("type", null, type, "전체 유형")}{PROPERTY_TYPES.map(([k, v]) => chip("type", k, type, v))}
        <span className="mx-1 w-px shrink-0 bg-line" />
        {chip("status", null, status, "전체 상태")}{SITE_STATUS.map(([k, v]) => chip("status", k, status, v))}
      </div>
      {sites.length ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {sites.map((s) => (
            <Link key={s.id} href={`/sites/${s.id}`} className="card p-4 hover:border-brand-200">
              <div className="flex items-center gap-1.5 text-[12px]">
                <Pill tone="blue">{s.region_name}</Pill><Pill>{label(PROPERTY_TYPES, s.property_type)}</Pill>
                <Pill tone={s.status === "recruiting" ? "green" : s.status === "closed" ? "gray" : "amber"}>{label(SITE_STATUS, s.status)}</Pill>
              </div>
              <p className="mt-2 font-bold">{s.name}</p>
              <p className="mt-0.5 truncate text-[13px] text-muted">{s.address ?? "주소 미등록"}</p>
              <p className="mt-2.5 text-[14px] text-ink-2">
                공고 <b className="text-navy-900">{s.jobs}</b>건
                {s.rt_max ? <> · RT 최고 <b className="text-navy-900">{won(s.rt_max)}</b></> : null}
                {s.daily_max ? <> · 일비 최고 {won(s.daily_max)}</> : null}
              </p>
            </Link>
          ))}
        </div>
      ) : <Empty>조건에 맞는 현장이 없습니다.</Empty>}
    </>
  );
}
