import Link from "next/link";
import { q, q1 } from "@/lib/db";
import { requirePageUser } from "@/lib/auth";
import { jobCardsByIds } from "@/lib/jobs";
import { SEEKING_STATUS, REGIONS, RANKS, label } from "@/lib/constants";
import { ago, ymd } from "@/lib/format";
import { ActionButton, JsonForm } from "@/components/client";
import { JobCard, PageTitle, Pill, Empty, Avatar, RankBadge } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "마이페이지" };

function Card({ id, title, children, sub }: { id?: string; title: string; children: React.ReactNode; sub?: string }) {
  return (
    <section id={id} className="card scroll-mt-20 p-5">
      <h2 className="section-title">{title}</h2>
      {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function Me() {
  const v = await requirePageUser("/me");
  const [profile, savedIds, savedSites, chats, blocks, notif] = await Promise.all([
    q1("SELECT nickname, nickname_changed_at, job_seeking_status, preferred_region, preferred_rank, badge_rank FROM profiles WHERE user_id = $1", [v.id]),
    q<{ job_post_id: string }>("SELECT job_post_id FROM saved_jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30", [v.id]),
    q("SELECT s.id, s.name, r.name AS region_name FROM saved_sites ss JOIN sites s ON s.id = ss.site_id JOIN regions r ON r.code = s.region_code WHERE ss.user_id = $1 ORDER BY ss.created_at DESC", [v.id]),
    q(`SELECT r.id, r.type, r.name,
              CASE WHEN r.type = 'dm' THEN (SELECT p.nickname FROM dm_pairs d JOIN profiles p ON p.user_id = CASE WHEN d.user_a = $1 THEN d.user_b ELSE d.user_a END WHERE d.room_id = r.id) END AS partner,
              (SELECT max(id) FROM chat_messages m WHERE m.room_id = r.id) AS last_id,
              (SELECT max(created_at) FROM chat_messages m WHERE m.room_id = r.id) AS last_at, cm.last_read_id
         FROM chat_room_members cm JOIN chat_rooms r ON r.id = cm.room_id
        WHERE cm.user_id = $1 ORDER BY last_at DESC NULLS LAST LIMIT 30`, [v.id]),
    q("SELECT id, blocked_nickname, created_at FROM user_blocks WHERE blocker_id = $1 ORDER BY created_at DESC", [v.id]),
    q1("SELECT job_alerts, chat_alerts, marketing_opt_in, marketing_opt_in_at FROM notification_settings WHERE user_id = $1", [v.id]),
  ]);
  const savedJobs = await jobCardsByIds(savedIds.map((s) => s.job_post_id));
  const canChangeNick = !profile?.nickname_changed_at || Date.now() - new Date(profile.nickname_changed_at).getTime() > 30 * 86400000;

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="마이페이지" />
      <section className="card flex items-center gap-4 p-5">
        <Avatar nickname={v.nickname} size={56} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-lg font-bold">{v.nickname}<RankBadge rank={profile?.badge_rank} /></p>
          <p className="truncate text-[13px] text-muted">{v.email} · 가입 {ymd(v.createdAt)} <span className="text-[11px]">(이메일은 나에게만 보입니다)</span></p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Pill tone="blue">{label(SEEKING_STATUS, v.jobSeekingStatus)}</Pill>
            {v.companies.map((c) => <Pill key={c.id} tone={c.status === "verified" ? "green" : "gray"}>{c.name} {c.status === "verified" ? "인증 구인자" : "인증 대기"}{c.role === "owner" ? "·관리자" : ""}</Pill>)}
            {v.isOperator && <Pill tone="navy">{v.isSuperAdmin ? "최고 관리자" : "운영 관리자"}</Pill>}
          </div>
        </div>
      </section>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[13px] font-semibold">
        <Link href="/recruiter" className="card py-3 hover:border-brand-200">구인자 관리</Link>
        <Link href="#chats" className="card py-3 hover:border-brand-200">채팅 목록</Link>
        {v.isOperator ? <Link href="/admin" className="card py-3 text-brand-700 hover:border-brand-200">관리자</Link>
          : <Link href="/policy/anonymity" className="card py-3 hover:border-brand-200">익명성 안내</Link>}
      </div>

      <div className="mt-3 space-y-3">
        <Card title="익명 프로필" sub="닉네임은 30일에 한 번 바꿀 수 있습니다.">
          <JsonForm endpoint="/api/me" method="PATCH" submitLabel="저장" submitClass="btn-navy btn-sm" success="저장했습니다.">
            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className="label">익명 닉네임</span>
                <input name="nickname" className="input" defaultValue={profile?.nickname} maxLength={12} disabled={!canChangeNick} />
                {!canChangeNick && <span className="mt-1 block text-xs text-muted">최근 변경: {ymd(profile?.nickname_changed_at)}</span>}
              </label>
              <label><span className="label">구직 상태</span>
                <select name="jobSeekingStatus" className="input" defaultValue={profile?.job_seeking_status}>
                  {SEEKING_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="sm:col-span-2"><span className="label">직급 배지 (선택)</span>
                <select name="badgeRank" className="input" defaultValue={profile?.badge_rank ?? ""}>
                  <option value="">표시 안 함 (기본)</option>{RANKS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <span className="mt-1 block text-xs leading-relaxed text-muted">닉네임 옆에 직급만 표시됩니다(자기 신고, 운영자가 확인하지 않음). 켜면 다른 사람이 나를 추정할 단서가 늘어날 수 있습니다. 바꾼 뒤 새로 쓰는 글·메시지부터 적용됩니다.</span>
              </label>
              <label><span className="label">희망 지역</span>
                <select name="preferredRegion" className="input" defaultValue={profile?.preferred_region ?? ""}>
                  <option value="">선택 안 함</option>{REGIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label><span className="label">희망 직급</span>
                <select name="preferredRank" className="input" defaultValue={profile?.preferred_rank ?? ""}>
                  <option value="">선택 안 함</option>{RANKS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
            </div>
          </JsonForm>
        </Card>

        <Card id="saved" title={`관심 공고 ${savedJobs.length}`}>
          {savedJobs.length ? <div className="grid gap-2">{savedJobs.map((j) => <JobCard key={j.id} j={j} compact />)}</div> : <Empty>공고 상세에서 북마크를 눌러 저장하세요.</Empty>}
        </Card>

        <Card title={`관심 현장 ${savedSites.length}`}>
          {savedSites.length ? (
            <ul className="divide-y divide-line">{savedSites.map((s) => (
              <li key={s.id}><Link href={`/sites/${s.id}`} className="flex justify-between py-2.5 text-[15px] hover:underline"><span>{s.name}</span><span className="text-muted">{s.region_name}</span></Link></li>
            ))}</ul>
          ) : <Empty>현장 페이지에서 관심 저장을 눌러 보세요.</Empty>}
        </Card>

        <Card id="chats" title="채팅 목록" sub="참여한 채팅방과 익명 1:1 대화">
          {chats.length ? (
            <ul className="divide-y divide-line">{chats.map((c) => (
              <li key={c.id}><Link href={`/lounge/chat/${c.id}`} className="flex items-center gap-2 py-3 hover:underline">
                <Pill tone={c.type === "dm" ? "navy" : "blue"}>{c.type === "dm" ? "1:1" : "채팅방"}</Pill>
                <span className="flex-1 truncate text-[15px]">{c.type === "dm" ? `${c.partner} 님` : c.name}</span>
                {c.last_id && Number(c.last_id) > Number(c.last_read_id) && <span className="h-2 w-2 rounded-full bg-red-500" aria-label="새 메시지" />}
                <span className="text-[12px] text-muted">{c.last_at ? ago(c.last_at) : ""}</span>
              </Link></li>
            ))}</ul>
          ) : <Empty>아직 참여한 대화가 없습니다.</Empty>}
        </Card>

        <Card title="차단 목록" sub="차단한 회원과는 서로의 글·메시지가 보이지 않습니다.">
          {blocks.length ? (
            <ul className="divide-y divide-line">{blocks.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2.5 text-[15px]">
                <span>{b.blocked_nickname} <span className="text-[12px] text-muted">({ymd(b.created_at)})</span></span>
                <ActionButton endpoint={`/api/blocks/${b.id}`} method="DELETE" confirm="차단을 해제할까요?">해제</ActionButton>
              </li>
            ))}</ul>
          ) : <p className="text-sm text-muted">차단한 회원이 없습니다.</p>}
        </Card>

        <Card title="알림 설정" sub="알림 발송은 다음 버전에서 시작됩니다. 지금은 수신 동의만 저장합니다.">
          <JsonForm endpoint="/api/me/notifications" method="PATCH" submitLabel="저장" submitClass="btn-navy btn-sm" success="저장했습니다.">
            <div className="space-y-2.5 text-[15px]">
              <label className="flex items-center gap-2"><input type="checkbox" name="jobAlerts" defaultChecked={notif?.job_alerts ?? true} className="h-4 w-4 accent-brand-600" />관심 조건 신규 공고 알림</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="chatAlerts" defaultChecked={notif?.chat_alerts ?? true} className="h-4 w-4 accent-brand-600" />1:1 대화 알림</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="marketingOptIn" defaultChecked={notif?.marketing_opt_in ?? false} className="h-4 w-4 accent-brand-600" />광고성 정보 수신 동의 {notif?.marketing_opt_in_at && <span className="text-[12px] text-muted">({ymd(notif.marketing_opt_in_at)} 동의)</span>}</label>
            </div>
          </JsonForm>
        </Card>

        <Card title="개인정보 설정">
          <p className="text-sm leading-relaxed text-muted">탈퇴하면 이메일과 닉네임이 즉시 비식별 처리되고 다시 로그인할 수 없습니다. 작성한 글은 &lsquo;탈퇴한 회원&rsquo;으로 남으며, 결제 기록은 전자상거래법에 따라 5년간 보관됩니다.</p>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-red-600">회원 탈퇴</summary>
            <JsonForm endpoint="/api/me/withdraw" submitLabel="탈퇴하기" submitClass="btn btn-sm bg-red-600 text-white" className="mt-3">
              <input name="password" type="password" className="input" placeholder="비밀번호 확인" autoComplete="current-password" />
            </JsonForm>
          </details>
        </Card>

        <ActionButton endpoint="/api/auth/logout" className="btn-ghost w-full">로그아웃</ActionButton>
      </div>
    </div>
  );
}
