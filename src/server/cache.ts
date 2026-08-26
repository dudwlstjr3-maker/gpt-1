/**
 * 서버 메모리 캐시 — stale-while-revalidate + 마지막 정상 데이터 fallback.
 *
 *  - TTL 이내: 캐시 즉시 반환
 *  - TTL 초과 ~ maxStale 이내: 캐시를 먼저 돌려주고 백그라운드에서 갱신
 *  - 갱신 실패: 마지막 정상 데이터를 stale 로 표시해 계속 제공 (화면이 비지 않게)
 *
 * 서버리스 환경에서는 인스턴스별 캐시이므로, 운영 시 Redis 등으로 교체 가능하도록
 * get/set 인터페이스를 단순하게 유지했다.
 */

interface Entry<T> {
  value: T;
  storedAt: number;
  /** 마지막으로 성공적으로 갱신된 시각 */
  freshAt: number;
  refreshing: boolean;
  lastError: string | null;
}

const store = new Map<string, Entry<unknown>>();

export interface SwrResult<T> {
  value: T;
  /** 이 값이 TTL 을 넘긴 값인가 */
  stale: boolean;
  /** 캐시에 저장된 시각 */
  fetchedAt: number;
  /** 마지막 갱신 실패 사유 */
  error: string | null;
  /** 캐시 적중 여부 */
  hit: boolean;
}

export interface SwrOptions {
  ttlMs: number;
  /** TTL 초과 후에도 fallback 으로 쓸 수 있는 최대 시간 */
  maxStaleMs?: number;
}

export async function swr<T>(
  key: string,
  loader: () => Promise<T>,
  { ttlMs, maxStaleMs = 24 * 3600_000 }: SwrOptions,
): Promise<SwrResult<T>> {
  const now = Date.now();
  const cached = store.get(key) as Entry<T> | undefined;

  if (cached && now - cached.freshAt < ttlMs) {
    return { value: cached.value, stale: false, fetchedAt: cached.freshAt, error: cached.lastError, hit: true };
  }

  // 캐시가 있고 아직 fallback 가능 범위 → 즉시 반환 + 백그라운드 갱신
  if (cached && now - cached.freshAt < maxStaleMs) {
    if (!cached.refreshing) {
      cached.refreshing = true;
      void loader()
        .then((v) => {
          store.set(key, { value: v, storedAt: Date.now(), freshAt: Date.now(), refreshing: false, lastError: null });
        })
        .catch((e: unknown) => {
          cached.refreshing = false;
          cached.lastError = e instanceof Error ? e.message : String(e);
        });
    }
    return { value: cached.value, stale: true, fetchedAt: cached.freshAt, error: cached.lastError, hit: true };
  }

  // 캐시 없음 → 동기 로드
  try {
    const v = await loader();
    store.set(key, { value: v, storedAt: now, freshAt: now, refreshing: false, lastError: null });
    return { value: v, stale: false, fetchedAt: now, error: null, hit: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (cached) {
      // 마지막 정상 데이터로 버틴다
      cached.lastError = message;
      return { value: cached.value, stale: true, fetchedAt: cached.freshAt, error: message, hit: true };
    }
    throw e;
  }
}

/** 캐시를 거치지 않는 단순 메모이즈 (프로세스 수명 동안 유지) */
const memoStore = new Map<string, unknown>();

export function memo<T>(key: string, factory: () => T): T {
  if (memoStore.has(key)) return memoStore.get(key) as T;
  const v = factory();
  memoStore.set(key, v);
  return v;
}

export function clearCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    memoStore.clear();
    return;
  }
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
  for (const k of [...memoStore.keys()]) if (k.startsWith(prefix)) memoStore.delete(k);
}

/* ---------------------- 클라이언트 요청 제한 ---------------------- */

const clientHits = new Map<string, { count: number; windowStart: number }>();

export function rateLimit(clientKey: string, maxPerMinute: number): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = clientHits.get(clientKey);
  if (!entry || now - entry.windowStart >= 60_000) {
    clientHits.set(clientKey, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSec: 0 };
  }
  entry.count += 1;
  if (entry.count > maxPerMinute) {
    return { allowed: false, retryAfterSec: Math.ceil((60_000 - (now - entry.windowStart)) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}
