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

/**
 * 제공사 주소 갈아 끼우기용 환경변수.
 *
 * 비워 두면 각 provider 의 기본 주소를 쓴다. 대역 서버(scripts/live-stub.mjs)나
 * 사내 미러를 붙일 때 이 값만 바꾸면 코드는 그대로다.
 */
export function envUrl(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : null;
}

export type ModePreference = 'auto' | 'demo' | 'live';

export function getModePreference(): ModePreference {
  const v = (env('MARKET_MOOD_MODE') ?? 'auto').toLowerCase();
  if (v === 'demo' || v === 'live') return v;
  return 'auto';
}

/**
 * LIVE 모드로 들어가는 데 **실제로 필요한** 키.
 *
 * 예전에는 네 개(US·KR·CRYPTO·MACRO)를 다 요구했다. 그런데 코드가 실제로 읽는 키는
 * MACRO 하나뿐이다 — 미국·한국 시세는 Stooq 라 키가 없고, 크립토는 CoinGecko 무료
 * 티어라 키 없이 돈다. 그래서 FRED 무료 키를 발급받아 넣어도 LIVE 로 안 들어가고,
 * 쓰지도 않는 변수 세 개에 아무 값이나 채워 넣어야 켜지는 상태였다.
 *
 * 켜지지 않는 이유가 거짓이면 그건 그냥 버그다. 필요한 것만 요구한다.
 * 이 목록이 코드가 읽는 키와 어긋나지 않는지는 검증 스크립트가 대조한다.
 */
export const REQUIRED_KEYS = ['MACRO_API_KEY'] as const;

/**
 * 없어도 돌지만 있으면 나아지는 키.
 * 없다고 해서 LIVE 를 막지 않는다 — 대신 무엇이 아쉬운지는 알려 준다.
 */
export const OPTIONAL_KEYS: { name: string; why: string }[] = [
  { name: 'CRYPTO_API_KEY', why: 'CoinGecko 무료 Demo 키. 없어도 되지만 넣으면 분당 요청 한도가 올라갑니다.' },
];

/**
 * 실제 데이터 모드를 결정한다.
 *
 *  - MARKET_MOOD_MODE=demo  → 항상 DEMO
 *  - MARKET_MOOD_MODE=live  → 항상 LIVE (키가 없으면 해당 섹션이 오류로 표시된다)
 *  - auto(기본)             → REQUIRED_KEYS 가 다 있으면 LIVE, 하나라도 없으면 DEMO
 *
 * DEMO 와 LIVE 는 한 응답 안에서 섞이지 않는다. 모드는 스냅샷 단위로 하나다.
 */
export function resolveMode(): { mode: DataMode; reason: string; missing: string[] } {
  const pref = getModePreference();
  const env = getKeys();
  const has: Record<string, string | null> = {
    MACRO_API_KEY: env.macro,
    CRYPTO_API_KEY: env.crypto,
  };
  const missing = REQUIRED_KEYS.filter((k) => !has[k]);

  if (pref === 'demo') {
    return { mode: 'DEMO', reason: 'MARKET_MOOD_MODE=demo 로 고정되었습니다.', missing };
  }
  if (pref === 'live') {
    return { mode: 'LIVE', reason: 'MARKET_MOOD_MODE=live 로 고정되었습니다.', missing };
  }
  if (missing.length > 0) {
    return {
      mode: 'DEMO',
      reason:
        `${missing.join(', ')} 가 없어 DEMO 모드로 동작합니다. ` +
        'FRED 무료 키 하나면 LIVE 로 켜집니다 (https://fred.stlouisfed.org/docs/api/api_key.html). ' +
        '미국·한국 시세(Stooq)와 크립토(CoinGecko 무료)는 키가 필요 없습니다.',
      missing: [...missing],
    };
  }

  // 아직 붙이지 못한 것을 LIVE 라고 뭉뚱그리지 않는다. 무엇이 비는지 그대로 적는다.
  const wanted = OPTIONAL_KEYS.filter((k) => !has[k.name]).map((k) => k.name);
  return {
    mode: 'LIVE',
    reason:
      'LIVE 모드로 동작합니다. 한국 투자자 수급과 뉴스는 아직 붙인 제공사가 없어 해당 칸만 오류로 표시됩니다.' +
      (wanted.length > 0 ? ` (선택 키 없음: ${wanted.join(', ')})` : ''),
    missing: [],
  };
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
