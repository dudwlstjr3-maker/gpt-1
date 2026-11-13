"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";

async function send(endpoint: string, method: string, payload?: unknown) {
  const r = await fetch(endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

// 버튼 하나로 API 호출 → 성공 시 새로고침 또는 이동
export function ActionButton({ endpoint, method = "POST", payload, confirm, prompt, children, className = "btn-ghost btn-sm", done }: {
  endpoint: string; method?: string; payload?: Record<string, unknown>; confirm?: string;
  prompt?: { key: string; message: string }; children: ReactNode; className?: string; done?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={className} disabled={busy} onClick={async () => {
      if (confirm && !window.confirm(confirm)) return;
      let body = payload;
      if (prompt) {
        const v = window.prompt(prompt.message);
        if (!v) return;
        body = { ...payload, [prompt.key]: v };
      }
      setBusy(true);
      try {
        const d = await send(endpoint, method, body);
        if (done) window.alert(done);
        if (d.redirect) router.push(d.redirect); else router.refresh();
      } catch (e) {
        window.alert((e as Error).message);
      } finally {
        setBusy(false);
      }
    }}>{children}</button>
  );
}

// 폼 → JSON. name이 []로 끝나면 배열, 체크박스는 체크된 값만
export function JsonForm({ endpoint, method = "POST", extra, children, className = "", submitLabel, submitClass = "btn-primary w-full", success, resetOnSuccess, onDone }: {
  endpoint: string; method?: string; extra?: Record<string, unknown>; children: ReactNode; className?: string;
  submitLabel?: string; submitClass?: string; success?: string; resetOnSuccess?: boolean; onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 스크립트가 붙기 전에는 제출 버튼을 잠근다. 잠그지 않으면 브라우저 기본 GET 전송으로
  // 비밀번호 같은 입력값이 URL에 실린다. (기본 버튼이 비활성이면 Enter 키 암묵 제출도 일어나지 않음)
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data: Record<string, unknown> = { ...extra };
    for (const el of Array.from(form.elements) as HTMLInputElement[]) {
      if (!el.name || el.disabled) continue;
      if (el.name.endsWith("[]")) {
        const k = el.name.slice(0, -2);
        const arr = (data[k] as string[]) ?? [];
        if ((el.type !== "checkbox" && el.type !== "radio") || el.checked) arr.push(el.value);
        data[k] = arr;
      } else if (el.type === "checkbox") {
        data[el.name] = el.checked;
      } else if (el.type === "radio") {
        if (el.checked) data[el.name] = el.value;
      } else {
        data[el.name] = el.value;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const d = await send(endpoint, method, data);
      if (success) window.alert(success);
      if (resetOnSuccess) form.reset();
      onDone?.();
      if (d.redirect) router.push(d.redirect); else router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={onSubmit} method="post" className={className} noValidate>
      {children}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {submitLabel && <button type="submit" disabled={busy || !ready} className={`${submitClass} mt-4`}>{busy ? "처리 중…" : submitLabel}</button>}
    </form>
  );
}

// 연락처 보기: 클릭 시 서버에서 받아 표시 (문의 클릭 집계)
export function ContactReveal({ jobId, loggedIn }: { jobId: string; loggedIn: boolean }) {
  const router = useRouter();
  const [c, setC] = useState<{ name: string; phone: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (c) {
    return (
      <a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`} className="btn-primary flex-1">
        {c.name} · {c.phone}
      </a>
    );
  }
  return (
    <button type="button" className="btn-primary flex-1" disabled={busy} onClick={async () => {
      if (!loggedIn) return router.push(`/login?next=/jobs/${jobId}`);
      setBusy(true);
      try { setC(await send(`/api/jobs/${jobId}/contact`, "POST")); }
      catch (e) { window.alert((e as Error).message); }
      finally { setBusy(false); }
    }}>
      담당자 연락처 보기
    </button>
  );
}

// 광고 노출 집계: 화면에 실제로 그려진 광고만 1회 전송
export function ImpressionBeacon({ ids }: { ids: string[] }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || !ids.length) return;
    sent.current = true;
    fetch("/api/ads/impressions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }), keepalive: true }).catch(() => {});
  }, [ids]);
  return null;
}

// 신고 사유 선택 다이얼로그
export function ReportButton({ targetType, targetId, reasons, className = "text-sm text-muted hover:text-ink", label = "신고" }: {
  targetType: string; targetId: string; reasons: [string, string][]; className?: string; label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-surface p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">신고하기</h3>
            <p className="mt-1 text-sm text-muted">신고자 정보는 신고 대상에게 공개되지 않습니다.</p>
            <JsonForm endpoint="/api/reports" extra={{ targetType, targetId }} submitLabel="신고 접수" success="신고가 접수되었습니다." className="mt-4" onDone={() => setOpen(false)}>
              <div className="grid grid-cols-2 gap-2">
                {reasons.map(([k, v], i) => (
                  <label key={k} className="flex items-center gap-2 rounded-xl border border-line px-3 h-11 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                    <input type="radio" name="reason" value={k} defaultChecked={i === 0} className="accent-brand-600" />{v}
                  </label>
                ))}
              </div>
              <textarea name="detail" className="textarea mt-3" rows={3} placeholder="상세 내용 (선택)" maxLength={1000} />
            </JsonForm>
            <button type="button" className="btn-ghost mt-2 w-full" onClick={() => setOpen(false)}>취소</button>
          </div>
        </div>
      )}
    </>
  );
}
