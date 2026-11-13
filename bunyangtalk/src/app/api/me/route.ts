import { api, body, json, fail, oneOf } from "@/lib/http";
import { q1, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { validateNickname } from "@/lib/nickname";
import { SEEKING_STATUS, REGIONS, RANKS, keys } from "@/lib/constants";

export const PATCH = api(async (req) => {
  const v = await requireUser({ active: false });
  const b = await body(req);
  await tx(async (c) => {
    if (typeof b.nickname === "string" && b.nickname.trim() && b.nickname.trim() !== v.nickname) {
      const nick = validateNickname(b.nickname);
      const p = await q1<{ nickname_changed_at: Date | null }>("SELECT nickname_changed_at FROM profiles WHERE user_id = $1 FOR UPDATE", [v.id], c);
      // 사칭·세탁 방지: 닉네임은 30일에 한 번만 변경
      if (p?.nickname_changed_at && Date.now() - new Date(p.nickname_changed_at).getTime() < 30 * 86400000)
        fail(429, "닉네임은 30일에 한 번만 바꿀 수 있습니다.");
      if (await q1("SELECT 1 FROM profiles WHERE nickname = $1 AND user_id <> $2", [nick, v.id], c)) fail(409, "이미 쓰이는 닉네임입니다.");
      await c.query("UPDATE profiles SET nickname = $2, nickname_changed_at = now(), updated_at = now() WHERE user_id = $1", [v.id, nick]);
      await c.query("INSERT INTO nickname_history(user_id, nickname) VALUES ($1,$2)", [v.id, nick]);
    }
    if (b.jobSeekingStatus !== undefined) {
      const s = oneOf(b, "jobSeekingStatus", keys(SEEKING_STATUS), { name: "구직 상태" });
      await c.query("UPDATE profiles SET job_seeking_status = $2, updated_at = now() WHERE user_id = $1", [v.id, s]);
    }
    if (b.badgeRank !== undefined) {
      const badge = oneOf(b, "badgeRank", keys(RANKS), { optional: true, name: "직급 배지" });
      await c.query("UPDATE profiles SET badge_rank = $2, updated_at = now() WHERE user_id = $1", [v.id, badge]);
    }
    if (b.preferredRegion !== undefined) {
      const r = oneOf(b, "preferredRegion", keys(REGIONS), { optional: true, name: "희망 지역" });
      const rk = oneOf(b, "preferredRank", keys(RANKS), { optional: true, name: "희망 직급" });
      await c.query("UPDATE profiles SET preferred_region = $2, preferred_rank = $3, updated_at = now() WHERE user_id = $1", [v.id, r, rk]);
    }
  });
  return json({ ok: true });
});
