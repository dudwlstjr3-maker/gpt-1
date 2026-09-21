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

/**
 * 받을 수 있는 길이 아예 없는 값.
 *
 * '아직 안 붙였다'(NotWiredError)와 다르다. 이건 무료로는 존재하지 않는 데이터라
 * 나중에 누가 와서 구현해도 안 되는 것이고, 그래서 화면이 "잠시 후 다시" 라고
 * 말하면 거짓말이 된다. 이유를 그대로 들고 다니다가 그 자리에 찍는다.
 */
export class SeriesUnavailableError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = 'SeriesUnavailableError';
    this.reason = reason;
  }
}

/* ---------------------- 호스트별 토큰 버킷 ---------------------- */

const buckets = new Map<string, { tokens: number; last: number; queue: Promise<void> }>();

/**
 * 호스트당 초당 요청 수를 지킨다.
 *
 * 예전에는 제 구실을 못 했다. 토큰이 없으면 기다리게 했는데, **기다리는 쪽이
 * 여럿이면 모두 같은 시간을 자고 한꺼번에 깨어났다.** 각자 텅 빈 같은 통을 보고
 * 같은 대기 시간을 계산했기 때문이다. 40건이 몰리면 40건이 함께 나갔다 —
 * 초당 5건을 약속해 놓고 지키지 않은 셈이라, 제공사가 막아도 할 말이 없었다.
 *
 * 이제 호스트마다 줄을 하나 두고 그 줄에 이어 붙인다. 앞사람이 통에서 토큰을
 * 빼고 나야 뒷사람이 통을 본다. 대기 시간은 남은 토큰에서 다시 계산되므로
 * 줄이 길수록 뒷사람이 더 기다린다 — 그게 제한이 해야 할 일이다.
 */
function acquire(host: string): Promise<void> {
  const capacity = Math.max(1, RATE_LIMIT_PER_SEC);
  let b = buckets.get(host);
  if (!b) {
    b = { tokens: capacity, last: Date.now(), queue: Promise.resolve() };
    buckets.set(host, b);
  }
  const bucket = b;

  const next = bucket.queue.then(async () => {
    const now = Date.now();
    bucket.tokens = Math.min(capacity, bucket.tokens + ((now - bucket.last) / 1000) * capacity);
    bucket.last = now;

    if (bucket.tokens < 1) {
      const waitMs = Math.ceil(((1 - bucket.tokens) / capacity) * 1000);
      await new Promise((r) => setTimeout(r, waitMs));
      const after = Date.now();
      bucket.tokens = Math.min(capacity, bucket.tokens + ((after - bucket.last) / 1000) * capacity);
      bucket.last = after;
    }
    bucket.tokens -= 1;
  });

  // 줄은 실패해도 끊기지 않아야 한다 — 한 건이 터지면 뒤가 전부 막힌다
  bucket.queue = next.catch(() => undefined);
  return next;
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
