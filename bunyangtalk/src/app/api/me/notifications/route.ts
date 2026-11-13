import { api, body, json } from "@/lib/http";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";

const on = (x: unknown) => x === true || x === "on";

export const PATCH = api(async (req) => {
  const v = await requireUser({ active: false });
  const b = await body(req);
  const marketing = on(b.marketingOptIn);
  // 광고성 정보 수신 동의·철회 일시를 기록 (정보통신망법)
  await q(
    `INSERT INTO notification_settings(user_id, job_alerts, chat_alerts, marketing_opt_in, marketing_opt_in_at, marketing_opt_out_at, updated_at)
     VALUES ($1,$2,$3,$4, CASE WHEN $4 THEN now() END, CASE WHEN NOT $4 THEN now() END, now())
     ON CONFLICT (user_id) DO UPDATE SET
       job_alerts = EXCLUDED.job_alerts, chat_alerts = EXCLUDED.chat_alerts, updated_at = now(),
       marketing_opt_in_at  = CASE WHEN EXCLUDED.marketing_opt_in AND NOT notification_settings.marketing_opt_in THEN now() ELSE notification_settings.marketing_opt_in_at END,
       marketing_opt_out_at = CASE WHEN NOT EXCLUDED.marketing_opt_in AND notification_settings.marketing_opt_in THEN now() ELSE notification_settings.marketing_opt_out_at END,
       marketing_opt_in = EXCLUDED.marketing_opt_in`,
    [v.id, on(b.jobAlerts), on(b.chatAlerts), marketing],
  );
  return json({ ok: true });
});
