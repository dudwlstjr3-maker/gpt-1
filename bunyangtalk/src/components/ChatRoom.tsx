"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { ReportButton } from "./client";

type Msg = { id: number; nickname: string; body: string | null; createdAt: string; mine: boolean; deleted: boolean };

const time = (iso: string) => {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "요청을 처리하지 못했습니다.");
  return d;
}

export function ChatRoom({ roomId, roomName, isDm, isOperator, reasons, myNickname }: {
  roomId: string; roomName: string; isDm: boolean; isOperator: boolean; reasons: [string, string][]; myNickname: string;
}) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [online, setOnline] = useState<number | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "retrying">("connecting");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [reconnectKey, setReconnectKey] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  const scrollDown = () => requestAnimationFrame(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; });

  const load = useCallback(async () => {
    const d = await call(`/api/chat/rooms/${roomId}/messages`, "GET");
    setMsgs(d.messages);
    setHasMore(d.hasMore);
    scrollDown();
  }, [roomId]);

  // 실시간 연결 (SSE). 끊기면 브라우저가 자동 재연결하고, 재연결 시 놓친 메시지를 다시 불러온다
  useEffect(() => {
    let first = true;
    load().catch((e) => setError(e.message));
    const es = new EventSource(`/api/chat/rooms/${roomId}/stream`);
    es.addEventListener("ready", () => {
      setStatus("live");
      if (!first) load().catch(() => {});
      first = false;
    });
    es.addEventListener("message", (e) => {
      const m: Msg = JSON.parse((e as MessageEvent).data);
      setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      if (atBottom.current || m.mine) scrollDown();
    });
    es.addEventListener("delete", (e) => {
      const { id } = JSON.parse((e as MessageEvent).data);
      setMsgs((prev) => prev.map((x) => (x.id === id ? { ...x, body: null, deleted: true } : x)));
    });
    es.addEventListener("presence", (e) => setOnline(JSON.parse((e as MessageEvent).data).count));
    es.onerror = () => setStatus("retrying");
    return () => es.close();
  }, [roomId, load, reconnectKey]);

  async function loadOlder() {
    if (!msgs.length) return;
    const el = listRef.current;
    const prevH = el?.scrollHeight ?? 0;
    const d = await call(`/api/chat/rooms/${roomId}/messages?before=${msgs[0].id}`, "GET");
    setMsgs((prev) => [...d.messages, ...prev]);
    setHasMore(d.hasMore);
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevH; });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const d = await call(`/api/chat/rooms/${roomId}/messages`, "POST", { body });
      setMsgs((prev) => (prev.some((x) => x.id === d.message.id) ? prev : [...prev, d.message]));
      setText("");
      scrollDown();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function act(kind: "block" | "dm" | "delete" | "adminDelete" | "mute", m: Msg) {
    setMenu(null);
    try {
      if (kind === "block") {
        if (!confirm(`'${m.nickname}'님을 차단할까요? 서로의 메시지가 보이지 않게 됩니다.`)) return;
        await call("/api/blocks", "POST", { targetType: "chat_message", targetId: String(m.id) });
        setReconnectKey((k) => k + 1); // 차단 목록을 반영하도록 다시 연결
      } else if (kind === "dm") {
        const d = await call("/api/chat/dm", "POST", { targetType: "chat_message", targetId: String(m.id) });
        router.push(d.redirect);
      } else if (kind === "delete") {
        if (!confirm("메시지를 삭제할까요?")) return;
        await call(`/api/chat/messages/${m.id}`, "DELETE");
      } else if (kind === "adminDelete") {
        await call("/api/admin/action", "POST", { action: "message.delete", id: String(m.id) });
      } else if (kind === "mute") {
        const reason = prompt(`'${m.nickname}'님 채팅 금지 7일 — 사유를 입력하세요`);
        if (!reason) return;
        await call("/api/admin/action", "POST", { action: "message.muteAuthor", id: String(m.id), days: 7, reason });
        alert("채팅 금지 7일을 적용했습니다.");
      }
    } catch (err) {
      alert((err as Error).message);
    }
  }

  let lastDay = "";
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg lg:static lg:z-auto lg:mt-6 lg:h-[calc(100dvh-9rem)] lg:overflow-hidden lg:rounded-[var(--radius-card)] lg:border lg:border-line">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
        <Link href={isDm ? "/me#chats" : "/lounge"} className="grid h-10 w-10 place-items-center rounded-full text-ink-2" aria-label="뒤로"><Icon name="back" /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[16px] font-bold">{roomName}</h1>
          <p className="flex items-center gap-1.5 text-[12px] text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${status === "live" ? "bg-emerald-500" : "bg-amber-500"}`} />
            {status === "live" ? `${online ?? "-"}명 접속 중` : status === "connecting" ? "연결 중…" : "재연결 중…"}
            <span className="text-line">|</span>내 닉네임 {myNickname}
          </p>
        </div>
        <Link href="/policy/anonymity" className="rounded-lg px-2 py-1 text-[12px] font-semibold text-brand-700 hover:bg-brand-50">익명성 안내</Link>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-4" onScroll={(e) => {
        const el = e.currentTarget;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }} onClick={() => setMenu(null)}>
        {hasMore && <button onClick={loadOlder} className="mx-auto mb-3 block rounded-full bg-surface px-4 py-1.5 text-[13px] text-muted shadow-sm">이전 메시지 더 보기</button>}
        {!msgs.length && <p className="mt-10 text-center text-sm text-muted">첫 메시지를 남겨 보세요. 닉네임만 표시됩니다.</p>}
        <ul className="space-y-2.5">
          {msgs.map((m, i) => {
            const day = dayKey(m.createdAt);
            const showDay = day !== lastDay;
            lastDay = day;
            const sameAuthor = i > 0 && msgs[i - 1].nickname === m.nickname && !showDay;
            return (
              <li key={m.id}>
                {showDay && <p className="my-3 text-center text-[12px] text-muted"><span className="rounded-full bg-surface px-3 py-1">{day}</span></p>}
                <div className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] ${m.mine ? "items-end" : "items-start"} flex flex-col`}>
                    {!m.mine && !sameAuthor && <span className="mb-1 ml-1 text-[12px] font-semibold text-ink-2">{m.nickname}</span>}
                    <div className={`relative flex items-end gap-1.5 ${m.mine ? "flex-row-reverse" : ""}`}>
                      <button type="button" disabled={m.deleted}
                        onClick={(e) => { e.stopPropagation(); setMenu(menu === m.id ? null : m.id); }}
                        className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-left text-[15px] leading-relaxed ${
                          m.deleted ? "bg-surface-2 italic text-muted" : m.mine ? "rounded-tr-md bg-brand-600 text-white" : "rounded-tl-md border border-line bg-surface text-ink"}`}>
                        {m.deleted ? "삭제된 메시지입니다." : m.body}
                      </button>
                      <span className="shrink-0 text-[11px] text-muted">{time(m.createdAt)}</span>
                      {menu === m.id && !m.deleted && (
                        <div className={`absolute top-full z-10 mt-1 w-40 overflow-hidden rounded-xl border border-line bg-surface text-sm shadow-lg ${m.mine ? "right-0" : "left-0"}`} onClick={(e) => e.stopPropagation()}>
                          {m.mine ? (
                            <button className="block w-full px-4 py-2.5 text-left text-red-600 hover:bg-surface-2" onClick={() => act("delete", m)}>삭제</button>
                          ) : (
                            <>
                              {!isDm && <button className="block w-full px-4 py-2.5 text-left hover:bg-surface-2" onClick={() => act("dm", m)}>익명 1:1 대화</button>}
                              <ReportButton targetType="chat_message" targetId={String(m.id)} reasons={reasons} className="block w-full px-4 py-2.5 text-left hover:bg-surface-2" label="신고" />
                              <button className="block w-full px-4 py-2.5 text-left hover:bg-surface-2" onClick={() => act("block", m)}>차단</button>
                              {isOperator && <button className="block w-full px-4 py-2.5 text-left text-red-600 hover:bg-surface-2" onClick={() => act("adminDelete", m)}>운영자 삭제</button>}
                              {isOperator && <button className="block w-full px-4 py-2.5 text-left text-red-600 hover:bg-surface-2" onClick={() => act("mute", m)}>채팅 금지 7일</button>}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <form onSubmit={submit} className="shrink-0 border-t border-line bg-surface px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-[13px] text-red-700">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={500} aria-label="메시지 입력"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(e); } }}
            placeholder="메시지 입력 (욕설·홍보는 제재됩니다)" className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-surface-2 px-4 py-2.5 text-[15px] outline-none focus:border-brand-500" />
          <button disabled={sending || !text.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-600 text-white disabled:opacity-40" aria-label="보내기">
            <Icon name="send" size={20} />
          </button>
        </div>
      </form>
    </div>
  );
}
