import { api, json, fail } from "@/lib/http";
import { q1, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { publish } from "@/lib/chat";

// 본인 메시지 삭제 (운영자 삭제는 /api/admin/action)
export const DELETE = api(async (_req, ctx) => {
  const v = await requireUser({ active: false });
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) fail(404, "메시지를 찾을 수 없습니다.");
  const m = await q1<{ room_id: string; sender_id: string }>("SELECT room_id, sender_id FROM chat_messages WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!m) fail(404, "메시지를 찾을 수 없습니다.");
  if (m!.sender_id !== v.id) fail(403, "본인 메시지만 삭제할 수 있습니다.");
  await tx(async (c) => {
    await c.query("UPDATE chat_messages SET body = NULL, deleted_at = now(), deleted_by = $2 WHERE id = $1", [id, v.id]);
    await publish({ type: "delete", roomId: m!.room_id, id: Number(id) }, c);
  });
  return json({ ok: true });
});
