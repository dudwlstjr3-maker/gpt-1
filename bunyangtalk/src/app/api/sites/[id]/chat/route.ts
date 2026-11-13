import { api, json, fail, isUuid } from "@/lib/http";
import { q1 } from "@/lib/db";
import { requireUser } from "@/lib/auth";

// 현장 채팅방은 처음 입장할 때 만든다 (빈 방이 쌓이지 않게)
export const POST = api(async (_req, ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  if (!isUuid(id)) fail(404, "현장을 찾을 수 없습니다.");
  const site = await q1<{ name: string; region_code: string }>("SELECT name, region_code FROM sites WHERE id = $1", [id]);
  if (!site) fail(404, "현장을 찾을 수 없습니다.");
  const room = await q1<{ id: string }>(
    `INSERT INTO chat_rooms(type, name, site_id, region_code) VALUES ('site', $2, $1, $3)
     ON CONFLICT (site_id) WHERE type = 'site' DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [id, `${site!.name} 현장 채팅`, site!.region_code],
  );
  return json({ ok: true, redirect: `/lounge/chat/${room!.id}` });
});
