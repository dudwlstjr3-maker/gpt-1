import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { RANKS, PROPERTY_TYPES, label } from "@/lib/constants";
import { rtText, won, dday } from "@/lib/format";
import type { Row } from "@/lib/db";

export function SectionHeader({ title, href, more = "전체보기", sub }: { title: string; href?: string; more?: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="section-title">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
      </div>
      {href && <Link href={href} className="flex items-center text-sm font-medium text-muted hover:text-ink shrink-0">{more}<Icon name="right" size={16} /></Link>}
    </div>
  );
}

export function AdLabel({ kind }: { kind?: string }) {
  return (
    <span className="tag bg-ad-100 text-ad-700" title="유료 광고">
      {kind === "vip_job" ? "VIP 광고" : kind === "premium_job" ? "프리미엄 광고" : "광고"}
    </span>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center text-sm text-muted">
      <p>{children}</p>
      {action}
    </div>
  );
}

// 구인공고 카드 — 광고 공고는 노란 배경·라벨로 일반 공고와 구분
export function JobCard({ j, compact = false }: { j: Row; compact?: boolean }) {
  const isAd = !!j.ad_type;
  const d = dday(j.deadline);
  const href = isAd ? `/api/ads/click/${j.campaign_id}` : `/jobs/${j.id}`;
  return (
    <Link href={href} prefetch={false}
      className={`block rounded-[var(--radius-card)] border p-4 transition-colors ${isAd ? "border-ad-100 bg-ad-50 hover:border-amber-300" : "border-line bg-surface hover:border-brand-200"}`}>
      <div className="flex items-center gap-1.5 text-[12px] text-muted">
        {isAd && <AdLabel kind={j.ad_type} />}
        <span className="tag bg-brand-50 text-brand-700">{j.region_name}</span>
        <span>{label(PROPERTY_TYPES, j.property_type)}</span>
        {d && <span className={`ml-auto font-semibold ${d === "오늘 마감" || d === "D-1" || d === "D-2" ? "text-red-600" : "text-ink-2"}`}>{d}</span>}
      </div>
      <h3 className={`mt-1.5 font-bold text-ink leading-snug ${compact ? "text-[15px] line-clamp-1" : "text-base line-clamp-2"}`}>{j.title}</h3>
      <p className="mt-0.5 text-[13px] text-muted line-clamp-1">{j.site_name} · {j.company_name}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px]">
        <span className="font-bold text-navy-900">{rtText(j as never)}</span>
        <span className="text-ink-2">일비 {j.daily_pay ? won(j.daily_pay) : "없음"}</span>
        <span className="text-muted">{(j.ranks as string[]).map((r) => label(RANKS, r)).join("·")}</span>
      </div>
    </Link>
  );
}

export function Pill({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "blue" | "green" | "red" | "amber" | "navy" }) {
  const t = {
    gray: "bg-slate-100 text-slate-700", blue: "bg-brand-50 text-brand-700", green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700", amber: "bg-ad-100 text-ad-700", navy: "bg-navy-900 text-white",
  }[tone];
  return <span className={`tag ${t}`}>{children}</span>;
}

export function Stat({ label: l, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-[13px] text-muted">{l}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 mt-5 flex items-end justify-between gap-3 lg:mt-8">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink lg:text-[26px]">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}
