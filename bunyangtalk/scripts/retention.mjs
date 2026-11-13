// 데이터 보존 정책 실행 (매일 1회 크론). 정책 근거는 docs/PLAN.md 5장
import "./env.mjs";
import pg from "pg";

const days = Number(process.env.CHAT_RETENTION_DAYS || 180);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const run = async (label, sql, params = []) => {
  const r = await client.query(sql, params);
  console.log(label, r.rowCount);
};
try {
  await run("expired sessions", "DELETE FROM sessions WHERE expires_at < now()");
  await run("stale presence", "DELETE FROM chat_presence WHERE last_seen < now() - interval '5 minutes'");
  await run("login attempts > 3 months", "DELETE FROM login_attempts WHERE created_at < now() - interval '3 months'");
  // 처리 중인 신고 대상은 보존, 처리 끝난 신고 대상은 처리 후 90일까지 보존
  await run(
    `chat messages > ${days}d`,
    `DELETE FROM chat_messages m
      WHERE m.created_at < now() - make_interval(days => $1)
        AND NOT EXISTS (
          SELECT 1 FROM reports r
           WHERE r.target_type = 'chat_message' AND r.target_id = m.id::text
             AND (r.status = 'open' OR r.handled_at > now() - interval '90 days'))`,
    [days],
  );
  await run("job events > 13 months", "DELETE FROM job_events WHERE created_at < now() - interval '13 months'");
  await run("ad events > 13 months", "DELETE FROM ad_events WHERE created_at < now() - interval '13 months'");
  await run("verification docs past purge date", "DELETE FROM company_verification_docs WHERE purge_after < now()");
} finally {
  await client.end();
}
