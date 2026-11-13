import "server-only";
import { Client } from "pg";
import { q, q1, type Db } from "./db";
import type { Viewer } from "./auth";
import { fail } from "./http";

// ───── Postgres LISTEN/NOTIFY 기반 실시간 중계
// 서버 인스턴스마다 LISTEN 연결 1개 → 프로세스 안에서 방별 구독자에게 분배.
// 여러 인스턴스로 늘려도 NOTIFY가 모든 인스턴스에 전달되므로 그대로 동작한다.
export type ChatEvent =
  | { type: "message"; roomId: string; m: { id: number; senderId: string; nickname: string; badge: string | null; body: string; createdAt: string } }
  | { type: "delete"; roomId: string; id: number }
  | { type: "presence"; roomId: string };

type Listener = (e: ChatEvent) => void;
type Hub = { client: Client | null; ready: Promise<void> | null; rooms: Map<string, Set<Listener>> };
const g = globalThis as unknown as { __btChatHub?: Hub };
const hub: Hub = (g.__btChatHub ??= { client: null, ready: null, rooms: new Map() });

function ensureListener(): Promise<void> {
  if (hub.ready) return hub.ready;
  hub.ready = (async () => {
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    c.on("notification", (n) => {
      if (n.channel !== "chat_events" || !n.payload) return;
      let e: ChatEvent;
      try { e = JSON.parse(n.payload); } catch { return; }
      hub.rooms.get(e.roomId)?.forEach((fn) => { try { fn(e); } catch { /* 연결별 오류 격리 */ } });
    });
    const reset = () => { hub.client = null; hub.ready = null; c.end().catch(() => {}); };
    c.on("error", reset);
    c.on("end", () => { if (hub.client === c) { hub.client = null; hub.ready = null; } });
    await c.connect();
    await c.query("LISTEN chat_events");
    hub.client = c;
  })().catch((e) => { hub.ready = null; throw e; });
  return hub.ready;
}

export async function subscribe(roomId: string, fn: Listener): Promise<() => void> {
  await ensureListener();
  let set = hub.rooms.get(roomId);
  if (!set) hub.rooms.set(roomId, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) hub.rooms.delete(roomId);
  };
}

export async function publish(e: ChatEvent, db?: Db) {
  // 트랜잭션 안에서 호출하면 COMMIT 시점에 전달된다
  await q("SELECT pg_notify('chat_events', $1)", [JSON.stringify(e)], db);
}

// ───── 접근 권한
export type Room = { id: string; type: string; name: string; is_active: boolean; region_code: string | null; site_id: string | null };

export async function roomForViewer(roomId: string, v: Viewer, db?: Db): Promise<Room> {
  const room = await q1<Room>("SELECT id, type, name, is_active, region_code, site_id FROM chat_rooms WHERE id = $1", [roomId], db);
  if (!room) return fail(404, "채팅방을 찾을 수 없습니다.");
  if (room.type === "dm") {
    const ok = await q1("SELECT 1 FROM dm_pairs WHERE room_id = $1 AND (user_a = $2 OR user_b = $2)", [roomId, v.id], db);
    if (!ok) fail(403, "참여하지 않은 대화방입니다.");
  } else if (!room.is_active && !v.isOperator) {
    fail(403, "운영이 중단된 채팅방입니다.");
  }
  return room;
}

export async function blockedIds(userId: string, db?: Db): Promise<Set<string>> {
  const rows = await q<{ id: string }>(
    // 내가 차단한 사람 + 나를 차단한 사람 모두 서로 보이지 않게
    `SELECT blocked_id AS id FROM user_blocks WHERE blocker_id = $1
     UNION SELECT blocker_id FROM user_blocks WHERE blocked_id = $1`,
    [userId],
    db,
  );
  return new Set(rows.map((r) => r.id));
}

// 다른 회원에게 내려가는 메시지 형태: sender_id 없음
export type PublicMessage = { id: number; nickname: string; badge: string | null; body: string | null; createdAt: string; mine: boolean; deleted: boolean };

export function toPublic(m: { id: number | string; sender_id?: string; senderId?: string; sender_nickname?: string; nickname?: string; sender_badge?: string | null; badge?: string | null; body: string | null; created_at?: Date | string; createdAt?: string; deleted_at?: Date | null }, viewerId: string): PublicMessage {
  const sender = m.sender_id ?? m.senderId;
  const deleted = !!m.deleted_at || m.body === null;
  return {
    id: Number(m.id),
    nickname: (m.sender_nickname ?? m.nickname) as string,
    badge: m.sender_badge ?? m.badge ?? null,
    body: deleted ? null : m.body,
    createdAt: new Date((m.created_at ?? m.createdAt) as string).toISOString(),
    mine: sender === viewerId,
    deleted,
  };
}

export async function presenceCount(roomId: string, db?: Db): Promise<number> {
  const r = await q1<{ n: number }>(
    "SELECT count(DISTINCT user_id)::int AS n FROM chat_presence WHERE room_id = $1 AND last_seen > now() - interval '45 seconds'",
    [roomId],
    db,
  );
  return r?.n ?? 0;
}
