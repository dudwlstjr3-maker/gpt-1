import { api, body, json, fail, isUuid } from "@/lib/http";
import { q, q1, tx } from "@/lib/db";
import { requireUser, activeSanction } from "@/lib/auth";
import { roomForViewer, blockedIds, toPublic, publish } from "@/lib/chat";

const URL_RE = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|kr|io|me|ly|gg)(\/|\b))/i;

export const GET = api(async (req, ctx) => {
  const v = await requireUser({ active: false });
  const { id } = await ctx.params;
  if (!isUuid(id)) fail(404, "채팅방을 찾을 수 없습니다.");
  await roomForViewer(id, v);
  const before = Number(req.nextUrl.searchParams.get("before") || 0);
  const blocked = [...(await blockedIds(v.id))];
  const rows = await q(
    `SELECT id, sender_id, sender_nickname, sender_badge, body, created_at, deleted_at FROM chat_messages
      WHERE room_id = $1 AND ($2::bigint = 0 OR id < $2) AND NOT (sender_id = ANY($3::uuid[]))
      ORDER BY id DESC LIMIT 50`,
    [id, before, blocked],
  );
  const messages = rows.reverse().map((m) => toPublic(m as never, v.id));
  if (messages.length) {
    await q(
      `INSERT INTO chat_room_members(room_id, user_id, last_read_id) VALUES ($1,$2,$3)
       ON CONFLICT (room_id, user_id) DO UPDATE SET last_read_id = GREATEST(chat_room_members.last_read_id, EXCLUDED.last_read_id)`,
      [id, v.id, messages[messages.length - 1].id],
    );
  }
  return json({ messages, hasMore: rows.length === 50 });
});

export const POST = api(async (req, ctx) => {
  const v = await requireUser();
  const { id } = await ctx.params;
  if (!isUuid(id)) fail(404, "채팅방을 찾을 수 없습니다.");
  const room = await roomForViewer(id, v);
  const b = await body(req);
  const text = typeof b.body === "string" ? b.body.trim() : "";
  if (!text) fail(400, "메시지를 입력해 주세요.");
  if (text.length > 500) fail(400, "메시지는 500자까지 보낼 수 있습니다.");

  const mute = await activeSanction(v.id, "chat_mute");
  if (mute) fail(403, `채팅이 제한된 상태입니다${mute.ends_at ? ` (${new Date(mute.ends_at).toLocaleString("ko-KR")}까지)` : ""}.`);

  if (!v.isOperator) {
    // 도배 방지: 10초에 5개, 60초 안에 같은 내용 반복 금지
    const recent = await q<{ body: string | null; created_at: Date }>(
      "SELECT body, created_at FROM chat_messages WHERE sender_id = $1 AND created_at > now() - interval '60 seconds' ORDER BY id DESC LIMIT 20",
      [v.id],
    );
    const in10s = recent.filter((m) => Date.now() - new Date(m.created_at).getTime() < 10000).length;
    if (in10s >= 5) fail(429, "메시지를 너무 빠르게 보내고 있습니다. 잠시 후 다시 보내 주세요.");
    if (recent.some((m) => m.body === text)) fail(429, "같은 메시지를 반복해서 보낼 수 없습니다.");
    // 신규 가입 3일 이내 계정은 링크 금지 (홍보·스팸 계정 대응)
    if (URL_RE.test(text) && Date.now() - new Date(v.createdAt).getTime() < 3 * 86400000)
      fail(403, "가입 3일이 지나야 링크를 보낼 수 있습니다.");
  }

  if (room.type === "dm") {
    const other = await q1<{ id: string }>(
      "SELECT CASE WHEN user_a = $2 THEN user_b ELSE user_a END AS id FROM dm_pairs WHERE room_id = $1",
      [id, v.id],
    );
    if (other && (await blockedIds(v.id)).has(other.id)) fail(403, "차단 관계인 상대에게는 메시지를 보낼 수 없습니다.");
  }

  const msg = await tx(async (c) => {
    const m = await q1(
      "INSERT INTO chat_messages(room_id, sender_id, sender_nickname, sender_badge, body) VALUES ($1,$2,$3,$4,$5) RETURNING id, sender_id, sender_nickname, sender_badge, body, created_at",
      [id, v.id, v.nickname, v.badge, text],
      c,
    );
    await c.query(
      `INSERT INTO chat_room_members(room_id, user_id, last_read_id) VALUES ($1,$2,$3)
       ON CONFLICT (room_id, user_id) DO UPDATE SET last_read_id = EXCLUDED.last_read_id`,
      [id, v.id, m!.id],
    );
    // 실시간 전달용 내부 이벤트 (senderId는 서버 안에서 차단 필터에만 쓰고 클라이언트로 내보내지 않는다)
    await publish(
      { type: "message", roomId: id, m: { id: Number(m!.id), senderId: v.id, nickname: v.nickname, badge: v.badge, body: text, createdAt: new Date(m!.created_at).toISOString() } },
      c,
    );
    return m!;
  });
  return json({ message: toPublic(msg as never, v.id) }, 201);
});
