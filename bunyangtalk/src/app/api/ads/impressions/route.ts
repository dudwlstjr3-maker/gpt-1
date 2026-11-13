import { api, body, json } from "@/lib/http";
import { q } from "@/lib/db";
import { getViewer } from "@/lib/auth";

// 화면에 실제로 렌더된 광고만 노출로 센다 (브라우저에서 전송, 봇·프리페치 제외 효과)
export const POST = api(async (req) => {
  const b = await body(req);
  const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x): x is string => typeof x === "string").slice(0, 20);
  if (!ids.length) return json({ ok: true, n: 0 });
  const v = await getViewer();
  const r = await q(
    `INSERT INTO ad_events(campaign_id, event_type, user_id)
     SELECT a.id, 'impression', $2 FROM ad_campaigns a
      WHERE a.id::text = ANY($1) AND a.status = 'active' AND now() BETWEEN a.starts_at AND a.ends_at RETURNING 1`,
    [ids, v?.id ?? null],
  );
  return json({ ok: true, n: r.length });
});
