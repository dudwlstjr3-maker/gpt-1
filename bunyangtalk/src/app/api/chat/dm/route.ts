import { api, body, json, fail } from "@/lib/http";
import { q1, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { blockedIds } from "@/lib/chat";
import { resolveAuthor, TARGET_TYPES, type TargetType } from "@/lib/targets";

// 메시지·글·댓글 작성자와 익명 1:1 대화 시작. 상대의 계정 정보는 어느 쪽에도 공개되지 않는다
export const POST = api(async (req) => {
  const v = await requireUser();
  const b = await body(req);
  const type = String(b.targetType ?? "chat_message") as TargetType;
  if (!TARGET_TYPES.includes(type) || type === "job_post") fail(400, "1:1 대화를 시작할 수 없는 대상입니다.");
  const author = await resolveAuthor(type, String(b.targetId ?? ""));
  if (author.userId === v.id) fail(400, "자기 자신과는 대화할 수 없습니다.");
  if ((await blockedIds(v.id)).has(author.userId)) fail(403, "차단 관계인 상대와는 대화할 수 없습니다.");
  const [a, bb] = [v.id, author.userId].sort();
  const roomId = await tx(async (c) => {
    const ex = await q1<{ room_id: string }>("SELECT room_id FROM dm_pairs WHERE user_a = $1 AND user_b = $2", [a, bb], c);
    if (ex) return ex.room_id;
    const r = await q1<{ id: string }>("INSERT INTO chat_rooms(type, name) VALUES ('dm', '1:1 대화') RETURNING id", [], c);
    await c.query("INSERT INTO dm_pairs(room_id, user_a, user_b, created_by) VALUES ($1,$2,$3,$4)", [r!.id, a, bb, v.id]);
    await c.query("INSERT INTO chat_room_members(room_id, user_id) VALUES ($1,$2),($1,$3)", [r!.id, a, bb]);
    return r!.id;
  });
  return json({ ok: true, roomId, redirect: `/lounge/chat/${roomId}` });
});
