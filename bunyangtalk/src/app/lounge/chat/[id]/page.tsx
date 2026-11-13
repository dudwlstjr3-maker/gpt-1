import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { isUuid } from "@/lib/http";
import { q1 } from "@/lib/db";
import { roomForViewer } from "@/lib/chat";
import { ChatRoom } from "@/components/ChatRoom";
import { REPORT_REASONS } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "채팅" };

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const v = await requirePageUser(`/lounge/chat/${id}`);
  let room;
  try { room = await roomForViewer(id, v); } catch { notFound(); }
  let name = room.name;
  if (room.type === "dm") {
    // 1:1 대화방 이름 = 상대 닉네임 (상대 계정 정보는 전달하지 않음)
    const other = await q1<{ nickname: string }>(
      `SELECT p.nickname FROM dm_pairs d JOIN profiles p ON p.user_id = CASE WHEN d.user_a = $2 THEN d.user_b ELSE d.user_a END WHERE d.room_id = $1`,
      [id, v.id]);
    name = `${other?.nickname ?? "알 수 없음"} 님과 1:1 대화`;
  }
  return <ChatRoom roomId={id} roomName={name} isDm={room.type === "dm"} isOperator={v.isOperator} reasons={REPORT_REASONS} myNickname={v.nickname} />;
}
