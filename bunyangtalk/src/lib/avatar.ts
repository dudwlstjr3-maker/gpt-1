// 닉네임 → 고정 아바타(동물 이모지 + 배경색). 서버·클라이언트 공용, 계정 정보 없이 닉네임만으로 계산
const ANIMALS: [string, string][] = [
  ["돌고래", "🐬"], ["고양이", "🐱"], ["토끼", "🐰"], ["판다", "🐼"], ["여우", "🦊"], ["수달", "🦦"], ["펭귄", "🐧"],
  ["다람쥐", "🐿️"], ["코알라", "🐨"], ["부엉이", "🦉"], ["고래", "🐳"], ["사슴", "🦌"], ["너구리", "🦝"], ["알파카", "🦙"], ["햄스터", "🐹"],
];
const TONES = ["#E7EEFF", "#FFEFE3", "#E4F6EC", "#F0EAFF", "#FFE9EF", "#E2F5F7", "#FFF5D6", "#EDEFF3"];

export function avatarOf(nickname: string): { emoji: string; bg: string } {
  if (nickname.startsWith("탈퇴한")) return { emoji: "·", bg: "#EDEFF3" };
  let h = 0;
  for (const ch of nickname) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  const hit = ANIMALS.find(([k]) => nickname.includes(k));
  return { emoji: hit ? hit[1] : ANIMALS[h % ANIMALS.length][1], bg: TONES[h % TONES.length] };
}

export const BADGE_LABEL: Record<string, string> = { counselor: "상담사", team_leader: "팀장", director: "본부장", newbie: "신입" };
