export function won(n: number | null | undefined): string {
  if (n == null) return "-";
  if (n >= 10000) {
    const man = n / 10000;
    return `${Number.isInteger(man) ? man.toLocaleString("ko-KR") : man.toFixed(1)}만원`;
  }
  return `${n.toLocaleString("ko-KR")}원`;
}

export function rtText(j: { rt_basis: string; rt_amount: number | null; rt_percent: string | number | null }): string {
  if (j.rt_basis === "negotiable") return "RT 협의";
  if (j.rt_basis === "percent") return `RT ${Number(j.rt_percent ?? 0)}%`;
  const unit = j.rt_basis === "per_unit" ? "호실당" : "건당";
  return `RT ${unit} ${won(j.rt_amount)}`;
}

export function dday(deadline: string | Date | null | undefined): string | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  const today = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((a - b) / 86400000);
  if (diff < 0) return "마감";
  if (diff === 0) return "오늘 마감";
  return `D-${diff}`;
}

export function ago(t: string | Date): string {
  const s = Math.floor((Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  return ymd(t);
}

export function ymd(t: string | Date | null | undefined): string {
  if (!t) return "-";
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function hm(t: string | Date): string {
  const d = new Date(t);
  const h = d.getHours();
  return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function maskEmail(email: string): string {
  const [id, domain] = email.split("@");
  return `${id.slice(0, 2)}${"*".repeat(Math.max(1, id.length - 2))}@${domain}`;
}
