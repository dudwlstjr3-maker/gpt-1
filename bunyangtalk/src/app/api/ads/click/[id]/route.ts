import { NextResponse, type NextRequest } from "next/server";
import { q, q1 } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { isUuid } from "@/lib/http";

// 광고 클릭 집계 후 이동. 목적지는 캠페인에서 서버가 정한다 (오픈 리다이렉트 방지)
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.redirect(new URL("/", req.url));
  const a = await q1<{ job_post_id: string | null; link_url: string | null }>(
    "SELECT a.job_post_id, b.link_url FROM ad_campaigns a LEFT JOIN banners b ON b.id = a.banner_id WHERE a.id = $1",
    [id],
  );
  if (!a) return NextResponse.redirect(new URL("/", req.url));
  const v = await getViewer();
  await q("INSERT INTO ad_events(campaign_id, event_type, user_id) VALUES ($1,'click',$2)", [id, v?.id ?? null]);
  const to = a.job_post_id ? new URL(`/jobs/${a.job_post_id}`, req.url) : a.link_url ? new URL(a.link_url) : new URL("/", req.url);
  return NextResponse.redirect(to, 302);
}
