import Link from "next/link";
import { homeData } from "@/lib/home";
import { JobCard, SectionHeader, AdLabel, Empty, Pill } from "@/components/ui";
import { ImpressionBeacon } from "@/components/client";
import { Icon } from "@/components/Icon";
import { PROPERTY_TYPES, SITE_STATUS, BOARD_CATEGORIES, label } from "@/lib/constants";
import { ago } from "@/lib/format";

export const dynamic = "force-dynamic";

const QUICK = [["seoul", "서울"], ["gyeonggi", "경기"], ["incheon", "인천"], ["busan", "부산"], ["daegu", "대구"], ["chungnam", "충남"]];

export default async function Home() {
  const d = await homeData();
  const national = d.rooms.find((r) => r.type === "national");
  const adIds = [...d.premium.map((j) => j.campaign_id), ...d.banners.map((b) => b.campaign_id)];

  const chatCard = national && (
    <Link href={`/lounge/chat/${national.id}`} className="block overflow-hidden rounded-[var(--radius-card)] bg-navy-900 p-5 text-white">
      <div className="flex items-center gap-2 text-[13px] text-brand-200">
        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>
        지금 {national.online}명 접속 중 · 오늘 메시지 {national.today}개
      </div>
      <p className="mt-2 text-lg font-bold leading-snug">전국 분양인 익명 채팅</p>
      <p className="mt-1 text-sm text-brand-100/80">닉네임만 보입니다. 현장 분위기, 수수료 정산, 이동 고민까지.</p>
      <span className="mt-4 inline-flex h-10 items-center gap-1 rounded-xl bg-white px-4 text-sm font-bold text-navy-900">채팅 입장 <Icon name="right" size={16} /></span>
    </Link>
  );

  const side = (
    <>
      <section>
        <SectionHeader title="인기 채팅방" href="/lounge" more="라운지" />
        <ul className="card divide-y divide-line">
          {d.rooms.map((r) => (
            <li key={r.id}>
              <Link href={`/lounge/chat/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-brand-700"><Icon name="chat" size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{r.name}</span>
                  <span className="text-[12px] text-muted">오늘 {r.today}개 메시지</span>
                </span>
                <span className="text-[12px] font-semibold text-emerald-600">{r.online}명</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <SectionHeader title="업계 인기글" href="/lounge?tab=board" />
        {d.posts.length ? (
          <ol className="card divide-y divide-line">
            {d.posts.map((p, i) => (
              <li key={p.id}>
                <Link href={`/lounge/board/${p.id}`} className="flex gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="w-4 shrink-0 text-[15px] font-bold text-brand-600">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{p.title}</span>
                    <span className="flex gap-2 text-[12px] text-muted">
                      <span>{label(BOARD_CATEGORIES, p.category)}</span><span>공감 {p.like_count}</span><span>댓글 {p.comment_count}</span><span>{ago(p.created_at)}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        ) : <Empty>아직 인기글이 없습니다.</Empty>}
      </section>
      <section>
        <SectionHeader title="공지사항" />
        <ul className="card divide-y divide-line">
          {d.notices.length ? d.notices.map((n) => (
            <li key={n.id} className="flex items-center gap-2 px-4 py-3 text-sm">
              <Pill tone="navy">공지</Pill><span className="truncate">{n.title}</span>
            </li>
          )) : <li className="px-4 py-3 text-sm text-muted">공지사항이 없습니다.</li>}
        </ul>
      </section>
    </>
  );

  return (
    <div className="mt-4 grid gap-6 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
      <ImpressionBeacon ids={adIds} />
      <div className="space-y-7 min-w-0">
        <section className="card p-5 lg:p-6">
          <h1 className="text-[21px] font-bold leading-snug tracking-tight lg:text-[26px]">다음 현장, <span className="text-brand-600">조건으로</span> 찾으세요</h1>
          <p className="mt-1 text-sm text-muted">지역·직급·RT·일비로 전국 분양현장 구인공고를 비교합니다.</p>
          <form action="/jobs" className="mt-4 flex gap-2">
            <input name="q" className="input" placeholder="현장명, 지역, 키워드" aria-label="공고 검색" />
            <button className="btn-navy shrink-0">검색</button>
          </form>
          <div className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {QUICK.map(([k, v]) => <Link key={k} href={`/jobs?region=${k}`} className="chip hover:border-brand-500">{v}</Link>)}
            <Link href="/jobs?rank=director" className="chip hover:border-brand-500">본부장</Link>
            <Link href="/jobs?rank=team_leader" className="chip hover:border-brand-500">팀장</Link>
            <Link href="/jobs?rank=newbie" className="chip hover:border-brand-500">신입 가능</Link>
          </div>
        </section>

        {d.banners[0] ? (
          <a href={`/api/ads/click/${d.banners[0].campaign_id}`} className="relative block rounded-[var(--radius-card)] border border-ad-100 bg-gradient-to-r from-ad-50 to-white p-5">
            <AdLabel /><p className="mt-2 text-lg font-bold text-ink">{d.banners[0].title}</p>
            <p className="text-sm text-muted">{d.banners[0].company_name}</p>
          </a>
        ) : (
          <Link href="/policy/ads" className="flex items-center justify-between rounded-[var(--radius-card)] border border-dashed border-ad-100 bg-ad-50/60 px-5 py-4 text-sm">
            <span><AdLabel /> <span className="ml-1 font-semibold text-ad-700">메인 배너 광고 문의</span></span>
            <Icon name="right" size={18} className="text-ad-700" />
          </Link>
        )}

        {d.premium.length > 0 && (
          <section>
            <SectionHeader title="프리미엄 구인공고" href="/jobs?tab=premium" sub="유료 광고 공고입니다" />
            <div className="grid gap-3 md:grid-cols-2">{d.premium.map((j) => <JobCard key={j.id} j={j} />)}</div>
          </section>
        )}

        <section>
          <SectionHeader title="최신 구인공고" href="/jobs" />
          {d.latest.length ? <div className="grid gap-3 md:grid-cols-2">{d.latest.map((j) => <JobCard key={j.id} j={j} />)}</div>
            : <Empty>게시 중인 공고가 없습니다.</Empty>}
        </section>

        <div className="lg:hidden">{chatCard}</div>

        <section>
          <SectionHeader title="신규 분양현장" href="/sites" />
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:px-0">
            {d.sites.map((s) => (
              <Link key={s.id} href={`/sites/${s.id}`} className="card w-60 shrink-0 snap-start p-4 hover:border-brand-200 md:w-auto">
                <div className="flex items-center gap-1.5 text-[12px]">
                  <Pill tone="blue">{s.region_name}</Pill><span className="text-muted">{label(PROPERTY_TYPES, s.property_type)}</span>
                </div>
                <p className="mt-2 line-clamp-1 font-bold">{s.name}</p>
                <p className="mt-1 text-[13px] text-muted">{label(SITE_STATUS, s.status)} · 공고 {s.jobs}건</p>
              </Link>
            ))}
          </div>
        </section>

        <div className="space-y-7 lg:hidden">{side}</div>
      </div>
      <aside className="hidden space-y-7 lg:block">
        {chatCard}
        {side}
      </aside>
    </div>
  );
}
