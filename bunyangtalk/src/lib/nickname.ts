import { q1, type Db } from "./db";
import { fail } from "./http";

const ANIMALS = ["고양이", "토끼", "판다", "여우", "수달", "펭귄", "다람쥐", "코알라", "부엉이", "돌고래", "고래", "사슴", "너구리", "알파카", "햄스터"];
const RESERVED = ["운영자", "관리자", "분양톡", "공식", "admin", "operator", "manager", "운영팀", "탈퇴한"];

export function validateNickname(raw: string): string {
  const n = raw.trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 12) fail(400, "닉네임은 2~12자로 입력해 주세요.");
  if (!/^[가-힣a-zA-Z0-9 ]+$/.test(n)) fail(400, "닉네임은 한글·영문·숫자만 쓸 수 있습니다.");
  const lower = n.toLowerCase().replace(/\s/g, "");
  if (RESERVED.some((w) => lower.includes(w))) fail(400, "운영자를 사칭할 수 있는 단어는 쓸 수 없습니다.");
  return n;
}

export async function randomNickname(db?: Db): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const a = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const n = `익명 ${a}${Math.floor(100 + Math.random() * 900)}`;
    if (!(await q1("SELECT 1 FROM profiles WHERE nickname = $1", [n], db))) return n;
  }
  return `익명 ${Date.now().toString(36).slice(-6)}`;
}
