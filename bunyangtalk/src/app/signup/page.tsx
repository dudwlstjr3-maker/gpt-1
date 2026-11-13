import Link from "next/link";
import { JsonForm } from "@/components/client";

export const metadata = { title: "회원가입" };

export default function Signup() {
  return (
    <div className="mx-auto mt-8 max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight">회원가입</h1>
      <p className="mt-1 text-sm text-muted">닉네임을 비워 두면 &lsquo;익명 고양이123&rsquo; 같은 닉네임이 자동으로 만들어집니다.</p>
      <JsonForm endpoint="/api/auth/signup" submitLabel="가입하기" className="mt-6 space-y-3">
        <input name="email" type="email" autoComplete="email" className="input" placeholder="이메일" />
        <input name="password" type="password" autoComplete="new-password" className="input" placeholder="비밀번호 (영문·숫자 8자 이상)" />
        <input name="nickname" className="input" placeholder="익명 닉네임 (선택, 2~12자)" maxLength={12} />
        <div className="rounded-xl bg-surface-2 p-3.5 text-[13px] leading-relaxed text-ink-2">
          <b>익명성 안내</b> — 다른 회원에게는 닉네임만 보입니다. 이메일·연락처는 공개되지 않습니다. 단, 신고·법적 요청 대응을 위해 운영자는 계정과 활동 기록을 보관합니다. <Link href="/policy/anonymity" className="text-brand-700 underline">자세히</Link>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="agreeTerms" className="h-4 w-4 accent-brand-600" />[필수] <Link href="/policy/terms" className="underline">이용약관</Link> 동의</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="agreePrivacy" className="h-4 w-4 accent-brand-600" />[필수] <Link href="/policy/privacy" className="underline">개인정보 수집·이용</Link> 동의</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="agreeMarketing" className="h-4 w-4 accent-brand-600" />[선택] 신규 공고·이벤트 등 광고성 정보 수신 동의</label>
      </JsonForm>
      <p className="mt-5 text-center text-sm text-muted">이미 회원이신가요? <Link href="/login" className="font-semibold text-brand-700">로그인</Link></p>
    </div>
  );
}
