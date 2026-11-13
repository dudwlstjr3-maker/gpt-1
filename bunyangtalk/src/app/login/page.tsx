import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { JsonForm } from "@/components/client";
import { BrandMark } from "@/components/Brand";

export const metadata = { title: "로그인" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (await getViewer()) redirect(safeNext);
  return (
    <div className="mx-auto mt-10 max-w-sm">
      <BrandMark size={44} className="mb-4" />
      <h1 className="text-2xl font-bold tracking-tight">로그인</h1>
      <p className="mt-1 text-sm text-muted">분양인 커뮤니티 분양톡</p>
      <JsonForm endpoint="/api/auth/login" extra={{ next: safeNext }} submitLabel="로그인" className="mt-6 space-y-3">
        <input name="email" type="email" autoComplete="email" className="input" placeholder="이메일" />
        <input name="password" type="password" autoComplete="current-password" className="input" placeholder="비밀번호" />
      </JsonForm>
      <p className="mt-5 text-center text-sm text-muted">처음이신가요? <Link href={`/signup${safeNext !== "/" ? `?next=${encodeURIComponent(safeNext)}` : ""}`} className="font-semibold text-brand-700">30초 회원가입</Link></p>
    </div>
  );
}
