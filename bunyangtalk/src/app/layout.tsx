import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { getViewer } from "@/lib/auth";
import { DesktopNav, BottomNav } from "@/components/Nav";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = {
  title: { default: "분양톡 — 분양인을 위한 구인구직·익명 라운지", template: "%s | 분양톡" },
  description: "분양상담사·팀장·본부장을 위한 현장 구인공고, 익명 채팅, 업계 커뮤니티",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b1d45" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const v = await getViewer();
  return (
    <html lang="ko" data-theme="light">
      <body className="min-h-dvh bg-bg font-sans text-ink antialiased">
        {process.env.DEMO_MODE === "1" && (
          <div className="bg-navy-950 px-4 py-1.5 text-center text-[12px] text-brand-100">
            시연 환경 · 공고·현장·게시글·대화는 시연용 데이터이며 결제는 실제로 청구되지 않습니다
          </div>
        )}
        <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 lg:h-16">
            <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="분양톡 홈">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-navy-900 text-[15px] font-black text-white">분</span>
              <span className="text-[19px] font-extrabold tracking-tight text-navy-900">분양톡</span>
            </Link>
            <DesktopNav />
            <form action="/jobs" className="ml-auto hidden md:block">
              <label className="relative block">
                <span className="sr-only">공고 검색</span>
                <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input name="q" placeholder="현장명·공고 검색" className="h-10 w-56 rounded-full border border-line bg-surface-2 pl-9 pr-4 text-sm outline-none focus:border-brand-500 lg:w-64" />
              </label>
            </form>
            <div className="ml-auto flex items-center gap-2 md:ml-0">
              <Link href="/jobs" className="grid h-10 w-10 place-items-center rounded-full text-ink-2 md:hidden" aria-label="검색"><Icon name="search" /></Link>
              {v ? (
                <>
                  {v.isOperator && <Link href="/admin" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 sm:block">관리자</Link>}
                  {v.companies.length > 0 && <Link href="/recruiter" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-surface-2 sm:block">구인자 관리</Link>}
                  <Link href="/me" className="hidden items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-sm font-semibold lg:flex">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-50 text-brand-700"><Icon name="user" size={16} /></span>
                    {v.nickname}
                  </Link>
                </>
              ) : (
                <Link href="/login" className="btn-navy btn-sm">로그인</Link>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-28 lg:pb-16">{children}</main>
        <footer className="border-t border-line bg-surface pb-24 lg:pb-0">
          <div className="mx-auto max-w-6xl px-4 py-8 text-[12px] leading-relaxed text-muted">
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-semibold text-ink-2">
              <Link href="/policy/anonymity">익명성 안내</Link>
              <Link href="/policy/terms">이용약관</Link>
              <Link href="/policy/privacy">개인정보처리방침</Link>
              <Link href="/policy/ads">광고 운영정책</Link>
            </div>
            <p className="mt-3">분양톡 · 상호/대표자/사업자등록번호/통신판매업 신고번호: 출시 전 기재 · 직업정보제공사업 신고번호: 신고 후 기재</p>
            <p>분양톡은 구인·구직 정보를 제공할 뿐 채용을 알선하지 않습니다. 근로·위촉 조건은 구인자에게 직접 확인하세요.</p>
          </div>
        </footer>
        <BottomNav />
      </body>
    </html>
  );
}
