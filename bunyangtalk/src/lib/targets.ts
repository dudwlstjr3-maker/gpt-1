import { q1, type Db } from "./db";
import { fail, isUuid } from "./http";

export type TargetType = "chat_message" | "board_post" | "board_comment" | "job_post";
export const TARGET_TYPES: TargetType[] = ["chat_message", "board_post", "board_comment", "job_post"];

// 신고·차단·1:1 대화 대상의 작성자를 서버에서만 찾는다 (클라이언트는 user_id를 모른다)
export async function resolveAuthor(type: TargetType, id: string, db?: Db): Promise<{ userId: string; nickname: string }> {
  let row: { user_id: string; nickname: string } | null = null;
  if (type === "chat_message") {
    if (!/^\d+$/.test(id)) fail(400, "잘못된 대상입니다.");
    row = await q1("SELECT sender_id AS user_id, sender_nickname AS nickname FROM chat_messages WHERE id = $1", [id], db);
  } else if (!isUuid(id)) {
    fail(400, "잘못된 대상입니다.");
  } else if (type === "board_post") {
    row = await q1("SELECT author_id AS user_id, author_nickname AS nickname FROM board_posts WHERE id = $1", [id], db);
  } else if (type === "board_comment") {
    row = await q1("SELECT author_id AS user_id, author_nickname AS nickname FROM board_comments WHERE id = $1", [id], db);
  } else if (type === "job_post") {
    row = await q1(
      "SELECT j.author_id AS user_id, p.nickname FROM job_posts j JOIN profiles p ON p.user_id = j.author_id WHERE j.id = $1",
      [id],
      db,
    );
  }
  if (!row) return fail(404, "대상을 찾을 수 없습니다.");
  return { userId: row.user_id, nickname: row.nickname };
}
