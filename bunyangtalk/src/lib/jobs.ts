import { q, type Row } from "./db";

export type JobFilters = {
  region?: string; rank?: string; type?: string; rtMin?: number; dailyMin?: number;
  q?: string; newSites?: boolean; premiumOnly?: boolean; sort?: string; siteId?: string;
};

const LIVE_AD = `
  LEFT JOIN LATERAL (
    SELECT a.id, a.product_type FROM ad_campaigns a
     WHERE a.job_post_id = j.id AND a.status = 'active' AND now() BETWEEN a.starts_at AND a.ends_at
       AND a.product_type IN ('vip_job','premium_job')
     ORDER BY (a.product_type = 'vip_job') DESC, a.ends_at DESC LIMIT 1
  ) ad ON true`;

export const JOB_CARD_SELECT = `
  j.id, j.title, j.ranks, j.headcount, j.rt_basis, j.rt_amount, j.rt_percent, j.daily_pay, j.deadline,
  j.published_at, j.status, j.settlement_schedule, s.id AS site_id, s.name AS site_name, s.property_type, r.name AS region_name,
  c.name AS company_name, ad.product_type AS ad_type, ad.id AS campaign_id`;

export type JobCardRow = Row;

export async function searchJobs(f: JobFilters, limit = 20, offset = 0): Promise<{ rows: JobCardRow[]; total: number }> {
  const where = ["j.status = 'published'", "(j.deadline IS NULL OR j.deadline >= current_date)"];
  const p: unknown[] = [];
  const add = (sql: string, v: unknown) => { p.push(v); where.push(sql.replaceAll("?", `$${p.length}`)); };
  if (f.region) add("j.region_code = ?", f.region);
  if (f.rank) add("? = ANY(j.ranks)", f.rank);
  if (f.type) add("s.property_type = ?", f.type);
  if (f.rtMin) add("j.rt_amount >= ?", f.rtMin);
  if (f.dailyMin) add("j.daily_pay >= ?", f.dailyMin);
  if (f.siteId) add("j.site_id = ?", f.siteId);
  if (f.q) add("(j.title ILIKE ? OR s.name ILIKE ?)", `%${f.q}%`);
  if (f.newSites) where.push("s.created_at > now() - interval '30 days'");
  if (f.premiumOnly) where.push("ad.id IS NOT NULL");

  const order =
    f.sort === "deadline" ? "j.deadline ASC NULLS LAST, j.published_at DESC"
    : f.sort === "rt" ? "j.rt_amount DESC NULLS LAST, j.published_at DESC"
    : f.sort === "daily" ? "j.daily_pay DESC, j.published_at DESC"
    : f.premiumOnly ? "(ad.product_type = 'vip_job') DESC, j.published_at DESC"
    : "j.published_at DESC";

  const from = `FROM job_posts j JOIN sites s ON s.id = j.site_id JOIN regions r ON r.code = j.region_code
                JOIN companies c ON c.id = j.company_id ${LIVE_AD} WHERE ${where.join(" AND ")}`;
  const rows = await q(`SELECT ${JOB_CARD_SELECT} ${from} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, p);
  const total = (await q<{ n: number }>(`SELECT count(*)::int AS n ${from}`, p))[0].n;
  return { rows, total };
}

export async function jobCardsByIds(ids: string[]): Promise<JobCardRow[]> {
  if (!ids.length) return [];
  return q(
    `SELECT ${JOB_CARD_SELECT} FROM job_posts j JOIN sites s ON s.id = j.site_id JOIN regions r ON r.code = j.region_code
       JOIN companies c ON c.id = j.company_id ${LIVE_AD} WHERE j.id = ANY($1)`,
    [ids],
  );
}
