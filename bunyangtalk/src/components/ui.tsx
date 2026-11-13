import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { BrandMark } from "./Brand";
import { RANKS, PROPERTY_TYPES, label } from "@/lib/constants";
import { rtText, won, dday, rtParts, manShort, settleShort } from "@/lib/format";
import { avatarOf, BADGE_LABEL } from "@/lib/avatar";
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
      <BrandMark size={34} className="opacity-25 grayscale" />
      <p>{children}</p>
      {action}
    </div>
  );
}

// ───── 조건 바: 분양인이 공고에서 가장 먼저 비교하는 4가지(RT·일비·정산·마감)를 고정 칸에 숫자 위주로
export function ConditionBar({ j, size = "sm", tone = "plain" }: { j: Row; size?: "sm" | "lg"; tone?: "plain" | "ad" }) {
  const rt = rtParts(j as never);
  const d = dday(j.deadline);
  const urgent = d === "오늘 마감" || d === "D-1" || d === "D-2" || d === "D-3";
  const cells: { label: string; value: string; strong?: boolean; alert?: boolean }[] = [
    { label: rt.label, value: rt.value, strong: true },
    { label: "일비", value: manShort(j.daily_pay) },
    { label: "정산", value: settleShort(j.settlement_schedule) },
    { label: "마감", value: d === "오늘 마감" ? "오늘" : d ?? "상시", alert: urgent },
  ];
  const lg = size === "lg";
  return (
    // 칸 너비는 값 길이에 맞춰 가중치(정산이 가장 넓게) — 375px 화면에서도 잘리지 않게
    <dl className={`grid grid-cols-[1.1fr_0.8fr_1.25fr_0.85fr] overflow-hidden rounded-xl border ${tone === "ad" ? "border-ad-100 bg-white/70" : "border-line bg-surface-2"} ${lg ? "divide-x divide-line" : ""}`}>
      {cells.map((c, i) => (
        <div key={c.label} className={`min-w-0 ${lg ? "px-2.5 py-3 sm:px-3.5" : "px-2 py-2 sm:px-2.5"} ${!lg && i > 0 ? "border-l border-line" : ""}`}>
          <dt className={`truncate text-muted ${lg ? "text-[12px]" : "text-[11px]"}`}>{c.label}</dt>
          <dd className={`mt-0.5 truncate font-bold tabular-nums tracking-tight ${
            // 긴 값(예: 익월 10일)은 한 단계 작게 — 좁은 모바일 칸에서도 잘리지 않게
            c.value.length >= 5 ? (lg ? "text-[14px] sm:text-[17px]" : "text-[13px]") : lg ? "text-[16px] sm:text-[19px]" : "text-[15px]"} ${
            c.alert ? "text-red-600" : c.strong ? "text-brand-700" : "text-ink"}`}>{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// 구인공고 카드 — 광고 공고는 노란 배경·라벨로 일반 공고와 구분
export function JobCard({ j, compact = false }: { j: Row; compact?: boolean }) {
  const isAd = !!j.ad_type;
  const href = isAd ? `/api/ads/click/${j.campaign_id}` : `/jobs/${j.id}`;
  return (
    <Link href={href} prefetch={false}
      className={`group block rounded-[var(--radius-card)] border p-4 transition-colors ${isAd ? "border-ad-100 bg-ad-50 hover:border-amber-300" : "border-line bg-surface hover:border-brand-200"}`}>
      <div className="flex items-center gap-1.5 text-[12px] text-muted">
        {isAd && <AdLabel kind={j.ad_type} />}
        <span className="font-semibold text-navy-800">{j.region_name}</span>
        <span className="text-line">|</span>
        <span>{label(PROPERTY_TYPES, j.property_type)}</span>
        <span className="ml-auto truncate">{(j.ranks as string[]).map((r) => label(RANKS, r)).join(" · ")}</span>
      </div>
      <h3 className={`mt-1.5 font-bold leading-snug text-ink group-hover:text-navy-900 ${compact ? "line-clamp-1 text-[15px]" : "line-clamp-2 text-[16px]"}`}>{j.title}</h3>
      <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{j.site_name} · {j.company_name}</p>
      {!compact && <div className="mt-3"><ConditionBar j={j} tone={isAd ? "ad" : "plain"} /></div>}
      {compact && <p className="mt-1.5 text-[13px] font-semibold text-brand-700">{rtText(j as never)} · 일비 {won(j.daily_pay)}</p>}
    </Link>
  );
}

// ───── 익명 아바타·직급 배지
export function Avatar({ nickname, size = 32 }: { nickname: string; size?: number }) {
  const a = avatarOf(nickname);
  return (
    <span aria-hidden className="inline-grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, background: a.bg, fontSize: size * 0.55, lineHeight: 1 }}>
      {a.emoji}
    </span>
  );
}

export function RankBadge({ rank }: { rank?: string | null }) {
  if (!rank || !BADGE_LABEL[rank]) return null;
  return <span className="tag border border-navy-800/15 bg-navy-900/[0.06] text-navy-800" title="본인이 선택한 직급 (자기 신고)">{BADGE_LABEL[rank]}</span>;
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
