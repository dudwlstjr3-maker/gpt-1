import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { getViewer } from "@/lib/auth";
import { q } from "@/lib/db";
import { isUuid, HttpError } from "@/lib/http";
import { roomForViewer, blockedIds, subscribe, publish, presenceCount, toPublic, type ChatEvent } from "@/lib/chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Server-Sent Events: 방의 새 메시지·삭제·접속 인원을 실시간으로 내려준다
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("not found", { status: 404 });
  try {
    await roomForViewer(id, v);
  } catch (e) {
    return new Response("forbidden", { status: e instanceof HttpError ? e.status : 403 });
  }
  const blocked = await blockedIds(v.id);
  const connId = randomUUID();
  const enc = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { cleanup(); }
      };
      const sendPresence = async () => send("presence", { count: await presenceCount(id) });

      const cleanup = async () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        if (timer) clearInterval(timer);
        try { controller.close(); } catch { /* 이미 닫힘 */ }
        await q("DELETE FROM chat_presence WHERE room_id = $1 AND conn_id = $2", [id, connId]).catch(() => {});
        await publish({ type: "presence", roomId: id }).catch(() => {});
      };
      req.signal.addEventListener("abort", () => void cleanup());

      unsubscribe = await subscribe(id, (e: ChatEvent) => {
        if (e.type === "message") {
          if (blocked.has(e.m.senderId)) return;
          send("message", toPublic(e.m, v.id));
        } else if (e.type === "delete") {
          send("delete", { id: e.id });
        } else if (e.type === "presence") {
          void sendPresence();
        }
      });
      await q(
        "INSERT INTO chat_presence(room_id, conn_id, user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [id, connId, v.id],
      );
      send("ready", { ok: true });
      await publish({ type: "presence", roomId: id });
      timer = setInterval(async () => {
        await q("UPDATE chat_presence SET last_seen = now() WHERE room_id = $1 AND conn_id = $2", [id, connId]).catch(() => {});
        if (!closed) {
          try { controller.enqueue(enc.encode(`: ping\n\n`)); } catch { void cleanup(); }
          void sendPresence();
        }
      }, 20000);
    },
    cancel() {
      closed = true;
      unsubscribe?.();
      if (timer) clearInterval(timer);
      void q("DELETE FROM chat_presence WHERE room_id = $1 AND conn_id = $2", [id, connId]).catch(() => {});
      void publish({ type: "presence", roomId: id }).catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
