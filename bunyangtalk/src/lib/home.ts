import { q } from "./db";
import { JOB_CARD_SELECT } from "./jobs";

const LIVE = "a.status = 'active' AND now() BETWEEN a.starts_at AND a.ends_at";

export async function homeData() {
  const [notices, banners, premium, latest, rooms, posts, sites] = await Promise.all([
    q("SELECT id, title, created_at FROM notices ORDER BY is_pinned DESC, created_at DESC LIMIT 3"),
    q(`SELECT a.id AS campaign_id, b.title, b.link_url, c.name AS company_name FROM ad_campaigns a
         JOIN banners b ON b.id = a.banner_id LEFT JOIN companies c ON c.id = b.company_id
        WHERE a.product_type = 'main_banner' AND b.placement = 'home_top' AND ${LIVE} ORDER BY random() LIMIT 1`),
    q(`SELECT ${JOB_CARD_SELECT} FROM ad_campaigns a0
         JOIN job_posts j ON j.id = a0.job_post_id AND j.status = 'published'
         JOIN sites s ON s.id = j.site_id JOIN regions r ON r.code = j.region_code JOIN companies c ON c.id = j.company_id
         JOIN LATERAL (SELECT a0.id, a0.product_type) ad ON true
        WHERE a0.product_type IN ('vip_job','premium_job') AND a0.status = 'active' AND now() BETWEEN a0.starts_at AND a0.ends_at
        ORDER BY (a0.product_type = 'vip_job') DESC, random() LIMIT 4`),
    q(`SELECT ${JOB_CARD_SELECT} FROM job_posts j JOIN sites s ON s.id = j.site_id JOIN regions r ON r.code = j.region_code
         JOIN companies c ON c.id = j.company_id
         LEFT JOIN LATERAL (SELECT NULL::uuid AS id, NULL::text AS product_type) ad ON true
        WHERE j.status = 'published' AND (j.deadline IS NULL OR j.deadline >= current_date)
        ORDER BY j.published_at DESC LIMIT 6`),
    q(`SELECT r.id, r.name, r.type,
              (SELECT count(*)::int FROM chat_messages m WHERE m.room_id = r.id AND m.created_at > now() - interval '24 hours') AS today,
              (SELECT count(DISTINCT user_id)::int FROM chat_presence p WHERE p.room_id = r.id AND p.last_seen > now() - interval '45 seconds') AS online
         FROM chat_rooms r WHERE r.type <> 'dm' AND r.is_active
        ORDER BY (r.type = 'national') DESC, today DESC, r.sort LIMIT 5`),
    q(`SELECT id, title, category, like_count, comment_count, created_at FROM board_posts
        WHERE status = 'visible' AND created_at > now() - interval '14 days'
        ORDER BY (like_count * 3 + comment_count * 2 + view_count / 10) DESC, created_at DESC LIMIT 5`),
    q(`SELECT s.id, s.name, s.property_type, s.status, r.name AS region_name,
              (SELECT count(*)::int FROM job_posts j WHERE j.site_id = s.id AND j.status = 'published') AS jobs
         FROM sites s JOIN regions r ON r.code = s.region_code
        ORDER BY s.created_at DESC LIMIT 6`),
  ]);
  return { notices, banners, premium, latest, rooms, posts, sites };
}
