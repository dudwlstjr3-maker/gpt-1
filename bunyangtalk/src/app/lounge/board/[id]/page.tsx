import Link from "next/link";
import { notFound } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { isUuid } from "@/lib/http";
import { BOARD_CATEGORIES, REPORT_REASONS, label } from "@/lib/constants";
import { ago } from "@/lib/format";
import { blockedIds } from "@/lib/chat";
import { ActionButton, JsonForm, ReportButton } from "@/components/client";
import { Pill } from "@/components/ui";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const v = await getViewer();
  const p = await q1(
    `SELECT p.id, p.author_id, p.author_nickname, p.category, p.title, p.body, p.like_count, p.comment_count, p.view_count, p.created_at,
            p.status, p.site_id, s.name AS site_name FROM board_posts p LEFT JOIN sites s ON s.id = p.site_id WHERE p.id = $1`, [id]);
  if (!p || (p.status !== "visible" && !v?.isOperator)) notFound();
  await q("UPDATE board_posts SET view_count = view_count + 1 WHERE id = $1", [id]);
  const blocked = v ? [...(await blockedIds(v.id))] : [];
  const comments = await q(
    `SELECT id, author_id, author_nickname, body, created_at FROM board_comments
      WHERE post_id = $1 AND status = 'visible' AND NOT (author_id = ANY($2::uuid[])) ORDER BY created_at`, [id, blocked]);
  const liked = v ? !!(await q1("SELECT 1 FROM board_likes WHERE post_id = $1 AND user_id = $2", [id, v.id])) : false;
  // 화면에는 작성자 ID 대신 '내 글 여부'만 넘긴다
  const mine = v?.id === p.author_id;

  return (
    <article className="mx-auto max-w-3xl">
      <Link href="/lounge?tab=board" className="mt-4 inline-flex items-center text-sm text-muted hover:text-ink"><Icon name="back" size={18} />게시판</Link>
      {p.status !== "visible" && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">운영 정책에 따라 숨겨진 글입니다 (운영자만 보임).</p>}
      <div className="card mt-3 p-5 lg:p-6">
        <div className="flex items-center gap-1.5 text-[12px]">
          <Pill tone="blue">{label(BOARD_CATEGORIES, p.category)}</Pill>
          {p.site_name && <Link href={`/sites/${p.site_id}`} className="text-muted hover:underline">{p.site_name}</Link>}
        </div>
        <h1 className="mt-2 text-xl font-bold leading-snug">{p.title}</h1>
        <p className="mt-2 flex flex-wrap gap-2 text-[13px] text-muted">
          <span className="font-semibold text-ink-2">{p.author_nickname}</span><span>{ago(p.created_at)}</span><span>조회 {p.view_count + 1}</span>
        </p>
        <div className="mt-5 whitespace-pre-wrap text-[15px] leading-7 text-ink">{p.body}</div>
        <div className="mt-6 flex items-center gap-2 border-t border-line pt-4">
          {v ? (
            <ActionButton endpoint={`/api/board/posts/${p.id}/like`} className={`btn-ghost btn-sm ${liked ? "border-brand-600 text-brand-600" : ""}`}>
              <Icon name="heart" size={17} fill={liked} />공감 {p.like_count}
            </ActionButton>
          ) : <Link href={`/login?next=/lounge/board/${p.id}`} className="btn-ghost btn-sm"><Icon name="heart" size={17} />공감 {p.like_count}</Link>}
          <span className="ml-auto flex items-center gap-3 text-sm">
            {mine && <ActionButton endpoint={`/api/board/posts/${p.id}`} method="DELETE" confirm="글을 삭제할까요?" className="text-sm text-muted hover:text-red-600">삭제</ActionButton>}
            {v && !mine && <ActionButton endpoint="/api/chat/dm" payload={{ targetType: "board_post", targetId: p.id }} className="text-sm text-muted hover:text-ink">1:1 대화</ActionButton>}
            {v && !mine && <ActionButton endpoint="/api/blocks" payload={{ targetType: "board_post", targetId: p.id }} confirm="작성자를 차단할까요? 서로의 글과 메시지가 보이지 않게 됩니다." done="차단했습니다." className="text-sm text-muted hover:text-ink">차단</ActionButton>}
            {v && !mine && <ReportButton targetType="board_post" targetId={p.id} reasons={REPORT_REASONS} />}
            {v?.isOperator && p.status === "visible" && <ActionButton endpoint="/api/admin/action" payload={{ action: "post.hide", id: p.id }} confirm="이 글을 숨길까요?" className="text-sm font-semibold text-red-600">숨김</ActionButton>}
          </span>
        </div>
      </div>

      <section className="card mt-3 p-5">
        <h2 className="section-title">댓글 {comments.length}</h2>
        <ul className="mt-3 divide-y divide-line">
          {comments.map((c) => (
            <li key={c.id} className="py-3">
              <p className="flex items-center gap-2 text-[13px]">
                <span className={`font-semibold ${c.author_id === p.author_id ? "text-brand-700" : "text-ink-2"}`}>{c.author_nickname}{c.author_id === p.author_id && " (글쓴이)"}</span>
                <span className="text-muted">{ago(c.created_at)}</span>
                <span className="ml-auto flex gap-3">
                  {v?.id === c.author_id && <ActionButton endpoint={`/api/board/comments/${c.id}`} method="DELETE" confirm="댓글을 삭제할까요?" className="text-[12px] text-muted">삭제</ActionButton>}
                  {v && v.id !== c.author_id && <ReportButton targetType="board_comment" targetId={c.id} reasons={REPORT_REASONS} className="text-[12px] text-muted" />}
                </span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">{c.body}</p>
            </li>
          ))}
        </ul>
        {v ? (
          <JsonForm endpoint={`/api/board/posts/${p.id}/comments`} submitLabel="댓글 등록" submitClass="btn-navy btn-sm" resetOnSuccess className="mt-3">
            <textarea name="body" rows={3} maxLength={1000} className="textarea" placeholder={`'${v.nickname}'(으)로 댓글 쓰기`} />
          </JsonForm>
        ) : <Link href={`/login?next=/lounge/board/${p.id}`} className="btn-ghost mt-3 w-full">로그인하고 댓글 쓰기</Link>}
      </section>
    </article>
  );
}
