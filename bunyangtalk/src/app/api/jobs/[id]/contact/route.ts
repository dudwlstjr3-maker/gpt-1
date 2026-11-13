import { api, json, fail, isUuid } from "@/lib/http";
import { q, q1 } from "@/lib/db";
import { requireUser } from "@/lib/auth";

// 담당자 연락처는 로그인 회원이 '연락처 보기'를 누를 때만 내려준다 (무단 수집 방지 + 문의 클릭 집계)
export const POST = api(async (_req, ctx) => {
  const v = await requireUser({ active: false });
  const { id } = await ctx.params;
  if (!isUuid(id)) fail(404, "공고를 찾을 수 없습니다.");
  const j = await q1<{ contact_name: string; contact_phone: string }>(
    "SELECT contact_name, contact_phone FROM job_posts WHERE id = $1 AND status = 'published'",
    [id],
  );
  if (!j) fail(404, "게시 중인 공고가 아닙니다.");
  await q("INSERT INTO job_events(job_post_id, event_type, user_id) VALUES ($1,'contact_click',$2)", [id, v.id]);
  return json({ name: j!.contact_name, phone: j!.contact_phone });
});
