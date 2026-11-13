import { NextResponse, type NextRequest } from "next/server";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

type Ctx = { params: Promise<Record<string, string>> };
type Handler = (req: NextRequest, ctx: Ctx) => Promise<Response>;

// 모든 API 공통: 변경 요청은 같은 출처(Origin)만 허용(CSRF 방어), 오류를 JSON으로 통일
export function api(fn: Handler): Handler {
  return async (req, ctx) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.get("origin");
        const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
        if (!origin || !host || new URL(origin).host !== host) fail(403, "허용되지 않은 요청 출처입니다.");
      }
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      const pgCode = (e as { code?: string }).code;
      if (pgCode === "23505") return json({ error: "이미 존재하는 값입니다." }, 409);
      if (pgCode === "23514" || pgCode === "22P02" || pgCode === "23503") return json({ error: "입력값을 확인해 주세요." }, 400);
      console.error(e);
      return json({ error: "서버 오류가 발생했습니다." }, 500);
    }
  };
}

export async function body(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function clientIp(req: NextRequest): string | null {
  const xf = req.headers.get("x-forwarded-for");
  const ip = xf ? xf.split(",")[0].trim() : req.headers.get("x-real-ip");
  return ip && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null;
}

// ───── 입력 검증
type StrOpt = { min?: number; max?: number; optional?: boolean; name?: string };
export function str(b: Record<string, unknown>, key: string, o: StrOpt = {}): string | null {
  const v = b[key];
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  const name = o.name ?? key;
  if (!s) {
    if (o.optional) return null;
    fail(400, `${name}을(를) 입력해 주세요.`);
  }
  if (o.min && s.length < o.min) fail(400, `${name}은(는) ${o.min}자 이상이어야 합니다.`);
  if (o.max && s.length > o.max) fail(400, `${name}은(는) ${o.max}자 이하여야 합니다.`);
  return s;
}

export function int(b: Record<string, unknown>, key: string, o: { min?: number; max?: number; optional?: boolean; name?: string } = {}): number | null {
  const v = b[key];
  const name = o.name ?? key;
  if (v === undefined || v === null || v === "") {
    if (o.optional) return null;
    fail(400, `${name}을(를) 입력해 주세요.`);
  }
  const n = Number(v);
  if (!Number.isFinite(n)) fail(400, `${name}은(는) 숫자여야 합니다.`);
  if (o.min !== undefined && n < o.min) fail(400, `${name} 값이 너무 작습니다.`);
  if (o.max !== undefined && n > o.max) fail(400, `${name} 값이 너무 큽니다.`);
  return n;
}

export function oneOf(b: Record<string, unknown>, key: string, allowed: string[], o: { optional?: boolean; name?: string } = {}): string | null {
  const v = b[key];
  if ((v === undefined || v === null || v === "") && o.optional) return null;
  if (typeof v !== "string" || !allowed.includes(v)) fail(400, `${o.name ?? key} 값이 올바르지 않습니다.`);
  return v as string;
}

export function list(b: Record<string, unknown>, key: string, allowed?: string[]): string[] {
  const v = b[key];
  const arr = Array.isArray(v) ? v : v == null || v === "" ? [] : [v];
  const out = arr.map((x) => String(x).trim()).filter(Boolean);
  if (allowed && out.some((x) => !allowed.includes(x))) fail(400, `${key} 값이 올바르지 않습니다.`);
  return Array.from(new Set(out));
}

export const isUuid = (s: unknown): s is string =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
