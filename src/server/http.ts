/**
 * 업스트림 호출 공통 래퍼 — 타임아웃 / 제한적 재시도 / 호스트별 요청 제한.
 * 실데이터 어댑터는 반드시 이 함수를 통해 외부 API 를 호출한다.
 * (브라우저에서 직접 외부 API 를 부르지 않는다. 키가 노출되기 때문이다.)
 */

import { HTTP_MAX_RETRIES, HTTP_TIMEOUT_MS, RATE_LIMIT_PER_SEC } from './config';

export class UpstreamError extends Error {
  readonly status: number | null;
  readonly host: string;
  constructor(message: string, host: string, status: number | null = null) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.host = host;
  }
}

export class AdapterNotConfiguredError extends Error {
  readonly missingEnv: string[];
  constructor(adapter: string, missingEnv: string[]) {
    super(`${adapter} 어댑터가 설정되지 않았습니다. 필요한 환경변수: ${missingEnv.join(', ')}`);
    this.name = 'AdapterNotConfiguredError';
    this.missingEnv = missingEnv;
  }
}

/* ---------------------- 호스트별 토큰 버킷 ---------------------- */

const buckets = new Map<string, { tokens: number; last: number }>();

async function acquire(host: string): Promise<void> {
  const capacity = Math.max(1, RATE_LIMIT_PER_SEC);
  const now = Date.now();
  let b = buckets.get(host);
  if (!b) {
    b = { tokens: capacity, last: now };
    buckets.set(host, b);
  }
  const elapsed = (now - b.last) / 1000;
  b.tokens = Math.min(capacity, b.tokens + elapsed * capacity);
  b.last = now;

  if (b.tokens >= 1) {
    b.tokens -= 1;
    return;
  }
  const waitMs = Math.ceil(((1 - b.tokens) / capacity) * 1000);
  await new Promise((r) => setTimeout(r, waitMs));
  b.tokens = 0;
  b.last = Date.now();
}

/* ---------------------------- fetch ---------------------------- */

export interface FetchOptions {
  headers?: Record<string, string>;
  /** 재시도 횟수 (기본 HTTP_MAX_RETRIES) */
  retries?: number;
  timeoutMs?: number;
  /** 재시도해도 소용없는 상태코드 */
  noRetryStatus?: number[];
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  return fetchWith(url, options, 'application/json', (res) => res.json() as Promise<T>);
}

/**
 * CSV 처럼 JSON 이 아닌 응답용.
 * 타임아웃·재시도·호스트별 요청 제한은 fetchJson 과 똑같이 적용된다.
 */
export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  return fetchWith(url, options, 'text/csv, text/plain, */*', (res) => res.text());
}

async function fetchWith<T>(
  url: string,
  options: FetchOptions,
  accept: string,
  read: (res: Response) => Promise<T>,
): Promise<T> {
  const host = safeHost(url);
  const retries = options.retries ?? HTTP_MAX_RETRIES;
  const timeoutMs = options.timeoutMs ?? HTTP_TIMEOUT_MS;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await acquire(host);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept, ...(options.headers ?? {}) },
        // 캐시는 우리 SWR 레이어가 담당한다.
        cache: 'no-store',
      });
      if (!res.ok) {
        const retryable = RETRYABLE.has(res.status) && !(options.noRetryStatus ?? []).includes(res.status);
        const err = new UpstreamError(`HTTP ${res.status} ${res.statusText}`, host, res.status);
        if (!retryable || attempt === retries) throw err;
        lastError = err;
      } else {
        return await read(res);
      }
    } catch (e) {
      const err =
        e instanceof UpstreamError
          ? e
          : e instanceof Error && e.name === 'AbortError'
            ? new UpstreamError(`요청 시간 초과 (${timeoutMs}ms)`, host)
            : new UpstreamError(e instanceof Error ? e.message : String(e), host);
      lastError = err;
      if (attempt === retries) throw err;
    } finally {
      clearTimeout(timer);
    }
    // 지수 백오프 + 지터
    const backoff = 250 * 2 ** attempt + Math.random() * 150;
    await new Promise((r) => setTimeout(r, backoff));
  }

  throw lastError ?? new UpstreamError('알 수 없는 오류', host);
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'unknown';
  }
}
