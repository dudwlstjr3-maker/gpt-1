/**
 * 서버 전용 설정. 이 파일은 절대 클라이언트 번들에 들어가면 안 된다.
 * (API 키는 route handler / server component 에서만 읽는다.)
 */

import type { DataMode, SectionKey } from '@/types';

export interface ProviderKeys {
  usMarket: string | null;
  krMarket: string | null;
  crypto: string | null;
  macro: string | null;
  calendar: string | null;
  news: string | null;
}

function env(name: string): string | null {
  const v = process.env[name];
  if (!v || v.trim() === '' || v.trim().toLowerCase() === 'undefined') return null;
  return v.trim();
}

export function getKeys(): ProviderKeys {
  return {
    usMarket: env('US_MARKET_API_KEY'),
    krMarket: env('KR_MARKET_API_KEY'),
    crypto: env('CRYPTO_API_KEY'),
    macro: env('MACRO_API_KEY'),
    calendar: env('CALENDAR_API_KEY'),
    news: env('NEWS_API_KEY'),
  };
}

export type ModePreference = 'auto' | 'demo' | 'live';

export function getModePreference(): ModePreference {
  const v = (env('MARKET_MOOD_MODE') ?? 'auto').toLowerCase();
  if (v === 'demo' || v === 'live') return v;
  return 'auto';
}

/**
 * 실제 데이터 모드를 결정한다.
 *
 *  - MARKET_MOOD_MODE=demo  → 항상 DEMO
 *  - MARKET_MOOD_MODE=live  → 항상 LIVE (키가 없으면 해당 섹션이 오류로 표시된다)
 *  - auto(기본)             → 필수 키가 모두 있으면 LIVE, 하나라도 없으면 DEMO
 *
 * DEMO 와 LIVE 는 한 응답 안에서 섞이지 않는다. 모드는 스냅샷 단위로 하나다.
 */
export function resolveMode(): { mode: DataMode; reason: string; missing: string[] } {
  const pref = getModePreference();
  const keys = getKeys();
  const missing: string[] = [];
  if (!keys.usMarket) missing.push('US_MARKET_API_KEY');
  if (!keys.krMarket) missing.push('KR_MARKET_API_KEY');
  if (!keys.crypto) missing.push('CRYPTO_API_KEY');
  if (!keys.macro) missing.push('MACRO_API_KEY');

  if (pref === 'demo') {
    return { mode: 'DEMO', reason: 'MARKET_MOOD_MODE=demo 로 고정되었습니다.', missing };
  }
  if (pref === 'live') {
    return { mode: 'LIVE', reason: 'MARKET_MOOD_MODE=live 로 고정되었습니다.', missing };
  }
  if (missing.length > 0) {
    return {
      mode: 'DEMO',
      reason: `필수 API 키가 없어 DEMO 모드로 동작합니다 (${missing.join(', ')}).`,
      missing,
    };
  }
  return { mode: 'LIVE', reason: '모든 필수 API 키가 설정되어 LIVE 모드로 동작합니다.', missing };
}

/** 섹션별 캐시 TTL(ms) — 데이터마다 갱신 주기를 분리한다. */
export const SECTION_TTL: Record<SectionKey, number> = {
  sessions: 10_000,
  quotes: 30_000,
  flows: 120_000,
  fng: 300_000,
  macro: 6 * 3600_000,
  basics: 12 * 3600_000,
  // 예측시장은 계속 바뀐다. 다른 섹션보다 짧게 잡는다
  prediction: 60_000,
  risk: 120_000,
  // 20년 분포를 다시 만드는 계산이라 자주 돌릴 이유가 없다
  regime: 6 * 3600_000,
  calendar: 900_000,
  news: 300_000,
  summary: 300_000,
};

/** 섹션별 "이 시간이 지나면 오래된 데이터" 기준(ms) */
export const SECTION_STALE_AFTER: Record<SectionKey, number> = {
  sessions: 60_000,
  quotes: 300_000,
  flows: 900_000,
  fng: 3 * 3600_000,
  macro: 48 * 3600_000,
  // 연 단위로 발표되는 값이 섞여 있어 오래됐다고 판정하는 기준을 길게 둔다
  basics: 30 * 24 * 3600_000,
  prediction: 20 * 60_000,
  risk: 900_000,
  regime: 48 * 3600_000,
  calendar: 6 * 3600_000,
  news: 3 * 3600_000,
  summary: 3 * 3600_000,
};

export const HTTP_TIMEOUT_MS = Number(env('UPSTREAM_TIMEOUT_MS') ?? 6000);
export const HTTP_MAX_RETRIES = Number(env('UPSTREAM_MAX_RETRIES') ?? 2);
/** 업스트림 호스트당 초당 최대 요청 수 */
export const RATE_LIMIT_PER_SEC = Number(env('UPSTREAM_RATE_LIMIT_PER_SEC') ?? 5);
/** 클라이언트 IP 당 분당 최대 API 요청 수 */
export const CLIENT_RATE_LIMIT_PER_MIN = Number(env('CLIENT_RATE_LIMIT_PER_MIN') ?? 120);
