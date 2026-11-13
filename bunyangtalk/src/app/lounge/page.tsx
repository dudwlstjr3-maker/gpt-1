import Link from "next/link";
import { q } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { BOARD_CATEGORIES, label, keys } from "@/lib/constants";
import { ago } from "@/lib/format";
import { PageTitle, Empty, Pill, Avatar, RankBadge } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { Skyline } from "@/components/Brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "익명 라운지" };

export default async function Lounge({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tab = sp.tab === "board" ? "board" : "chat";
  const v = await getViewer();
  const tabs = (
    <div className="mb-5 grid grid-cols-2 rounded-xl bg-surface-2 p-1 text-[15px] font-semibold">
      <Link href="/lounge" className={`rounded-lg py-2.5 text-center ${tab === "chat" ? "bg-surface text-navy-900 shadow-sm" : "text-muted"}`}>실시간 채팅</Link>
      <Link href="/lounge?tab=board" className={`rounded-lg py-2.5 text-center ${tab === "board" ? "bg-surface text-navy-900 shadow-sm" : "text-muted"}`}>익명 게시판</Link>
    </div>
  );

  if (tab === "board") {
    const cat = keys(BOARD_CATEGORIES).includes(sp.cat ?? "") ? sp.cat! : null;
    const [hot, posts] = await Promise.all([
      q(`SELECT id, title, like_count, comment_count FROM board_posts WHERE status = 'visible' AND created_at > now() - interval '7 days'
          ORDER BY (like_count * 3 + comment_count * 2) DESC, created_at DESC LIMIT 3`),
      q(`SELECT p.id, p.title, p.category, p.author_nickname, p.author_badge, p.like_count, p.comment_count, p.view_count, p.created_at, s.name AS site_name
           FROM board_posts p LEFT JOIN sites s ON s.id = p.site_id
          WHERE p.status = 'visible' AND ($1::text IS NULL OR p.category = $1) ORDER BY p.created_at DESC LIMIT 50`, [cat]),
    ]);
    return (
      <div className="mx-auto max-w-3xl">
        <PageTitle title="익명 라운지" sub="닉네임으로만 활동합니다. 실명·연락처·소속은 공개되지 않습니다."
          right={<Link href={v ? "/lounge/board/new" : "/login?next=/lounge/board/new"} className="btn-primary btn-sm">글쓰기</Link>} />
        {tabs}
        {hot.length > 0 && (
          <section className="card mb-4 p-4">
            <p className="mb-2 text-[13px] font-bold text-brand-700">이번 주 인기글</p>
            <ul className="space-y-1.5">
              {hot.map((p) => (
                <li key={p.id}><Link href={`/lounge/board/${p.id}`} className="flex items-center gap-2 text-[15px] hover:underline">
                  <span className="truncate">{p.title}</span><span className="shrink-0 text-[12px] text-muted">공감 {p.like_count} · 댓글 {p.comment_count}</span>
                </Link></li>
              ))}
            </ul>
          </section>
        )}
        <div className="mb-3 flex gap-2 overflow-x-auto">
          <Link href="/lounge?tab=board" className={!cat ? "chip-on" : "chip"}>전체</Link>
          {BOARD_CATEGORIES.map(([k, l]) => <Link key={k} href={`/lounge?tab=board&cat=${k}`} className={cat === k ? "chip-on" : "chip"}>{l}</Link>)}
        </div>
        {posts.length ? (
          <ul className="card divide-y divide-line">
            {posts.map((p) => (
              <li key={p.id}>
                <Link href={`/lounge/board/${p.id}`} className="block px-4 py-3.5 hover:bg-surface-2">
                  <div className="flex items-center gap-1.5 text-[12px] text-muted">
                    <Pill tone="blue">{label(BOARD_CATEGORIES, p.category)}</Pill>{p.site_name && <span className="truncate">{p.site_name}</span>}
                  </div>
                  <p className="mt-1 line-clamp-1 text-[15px] font-semibold">{p.title}</p>
                  <p className="mt-1 flex gap-2 text-[12px] text-muted">
                    <span className="inline-flex items-center gap-1"><Avatar nickname={p.author_nickname} size={16} />{p.author_nickname}<RankBadge rank={p.author_badge} /></span><span>{ago(p.created_at)}</span><span>공감 {p.like_count}</span><span>댓글 {p.comment_count}</span><span>조회 {p.view_count}</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : <Empty>아직 글이 없습니다.</Empty>}
      </div>
    );
  }

  const rooms = await q(
    `SELECT r.id, r.name, r.type, rg.name AS region_name,
            (SELECT count(*)::int FROM chat_messages m WHERE m.room_id = r.id AND m.created_at > now() - interval '24 hours') AS today,
            (SELECT count(DISTINCT user_id)::int FROM chat_presence p WHERE p.room_id = r.id AND p.last_seen > now() - interval '45 seconds') AS online,
            (SELECT max(created_at) FROM chat_messages m WHERE m.room_id = r.id) AS last_at
       FROM chat_rooms r LEFT JOIN regions rg ON rg.code = r.region_code
      WHERE r.type <> 'dm' AND r.is_active ORDER BY r.sort, r.name`,
  );
  const national = rooms.find((r) => r.type === "national");
  const regional = rooms.filter((r) => r.type === "region");
  const sites = rooms.filter((r) => r.type === "site").sort((a, b) => b.today - a.today).slice(0, 10);
  const RoomRow = ({ r }: { r: (typeof rooms)[number] }) => (
    <li>
      <Link href={v ? `/lounge/chat/${r.id}` : `/login?next=/lounge/chat/${r.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-700"><Icon name={r.type === "site" ? "site" : "chat"} size={19} /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{r.name}</span>
          <span className="text-[12px] text-muted">오늘 {r.today}개 메시지{r.last_at ? ` · 마지막 ${ago(r.last_at)}` : ""}</span>
        </span>
        <span className="text-[13px] font-semibold text-emerald-600">{r.online}명</span>
      </Link>
    </li>
  );
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="익명 라운지" sub="닉네임으로만 대화합니다. 실명·연락처·소속은 공개되지 않습니다." />
      {tabs}
      {national && (
        <Link href={v ? `/lounge/chat/${national.id}` : `/login?next=/lounge/chat/${national.id}`} className="relative mb-6 block overflow-hidden rounded-[var(--radius-card)] bg-navy-900 p-5 text-white">
          <Skyline className="pointer-events-none absolute -bottom-1 right-0 h-16 w-56 text-white/[0.07]" />
          <p className="text-[13px] text-brand-200">{national.online}명 접속 중 · 오늘 {national.today}개 메시지</p>
          <p className="mt-1 text-xl font-bold">전국 자유채팅</p>
          <p className="mt-1 text-sm text-brand-100/80">처음이라면 여기서 시작하세요. 전국 분양인이 모두 모이는 방입니다.</p>
          <span className="mt-4 inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-bold text-navy-900">{v ? "입장하기" : "로그인하고 입장"}</span>
        </Link>
      )}
      <section className="mb-6">
        <h2 className="section-title mb-2">지역 채팅</h2>
        <ul className="card divide-y divide-line">{regional.map((r) => <RoomRow key={r.id} r={r} />)}</ul>
        <p className="mt-2 text-[12px] text-muted">이용자가 늘면 지역 채팅방을 순차적으로 엽니다.</p>
      </section>
      <section className="mb-6">
        <h2 className="section-title mb-2">현장 채팅</h2>
        {sites.length ? <ul className="card divide-y divide-line">{sites.map((r) => <RoomRow key={r.id} r={r} />)}</ul>
          : <Empty action={<Link href="/sites" className="btn-ghost btn-sm">분양현장 보기</Link>}>현장 페이지에서 현장 채팅을 시작할 수 있습니다.</Empty>}
      </section>
      {v && <Link href="/me#chats" className="btn-ghost w-full">내 1:1 대화 보기</Link>}
    </div>
  );
}
