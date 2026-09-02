/**
 * 빅맥지수 — 이코노미스트가 공개하는 원본 데이터.
 *
 * 왜 이곳인가
 *  - 이코노미스트가 1986년부터 발표하는 지수를 계산 원본째로 공개한다.
 *    2차 가공물이 아니라 발표 기관이 직접 낸 파일이다.
 *  - 키가 필요 없고, 2000년부터 반기별로 쌓여 있어 시계열 그래프를 그릴 수 있다.
 *
 * 약관 (2026-09 기준 확인 필요)
 *  - 저장소가 공개 라이선스로 공유하는 데이터다. 출처를 화면에 그대로 적는다.
 *
 * 열 설명 (원본 그대로)
 *  date, iso_a3, currency_code, name, local_price, dollar_ex, dollar_price,
 *  USD_raw, ... — USD_raw 가 "달러 대비 저평가/고평가 비율"(소수)이다.
 */

import { fetchText } from '@/server/http';
import type { SeriesPoint } from '@/types';

const DEFAULT_URL =
  'https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/output-data/big-mac-full-index.csv';

export interface BigMacConfig {
  url: string;
}

export function bigMacConfig(url: string | null): BigMacConfig {
  return { url: url ?? DEFAULT_URL };
}

export interface BigMacRow {
  date: string;
  iso: string;
  name: string;
  localPrice: number | null;
  currency: string;
  dollarPrice: number | null;
  /** 달러 대비 어긋난 비율(%). 음수면 저평가. */
  vsUsdPct: number | null;
}

/** 이 앱이 견주는 네 나라 */
export const BIGMAC_COUNTRIES: { iso: string; label: string }[] = [
  { iso: 'KOR', label: '한국' },
  { iso: 'CHN', label: '중국' },
  { iso: 'JPN', label: '일본' },
  { iso: 'USA', label: '미국' },
];

export interface BigMacData {
  /** 가장 최근 발표 회차 */
  latest: string;
  byCountry: Map<string, BigMacRow>;
  /** 나라별 시계열 (달러 대비 %) */
  historyByCountry: Map<string, SeriesPoint[]>;
}

export async function fetchBigMac(cfg: BigMacConfig): Promise<BigMacData | null> {
  const csv = await fetchText(cfg.url);
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return null;

  const head = lines[0].split(',').map((h) => h.trim());
  const col = (name: string) => head.indexOf(name);
  const iDate = col('date');
  const iIso = col('iso_a3');
  const iName = col('name');
  const iLocal = col('local_price');
  const iCur = col('currency_code');
  const iDollar = col('dollar_price');
  const iRaw = col('USD_raw');
  if ([iDate, iIso, iRaw].some((i) => i < 0)) return null;

  const wanted = new Set(BIGMAC_COUNTRIES.map((c) => c.iso));
  const rows: BigMacRow[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const iso = (c[iIso] ?? '').trim();
    if (!wanted.has(iso)) continue;
    rows.push({
      date: (c[iDate] ?? '').trim(),
      iso,
      name: (c[iName] ?? '').trim(),
      localPrice: num(c[iLocal]),
      currency: (c[iCur] ?? '').trim(),
      dollarPrice: num(c[iDollar]),
      // 원본은 소수(-0.383)로 준다. 화면은 % 로 읽으므로 100 을 곱한다.
      vsUsdPct: num(c[iRaw]) === null ? null : (num(c[iRaw]) as number) * 100,
    });
  }
  if (rows.length === 0) return null;

  const latest = rows.map((r) => r.date).sort().at(-1) as string;
  const byCountry = new Map<string, BigMacRow>();
  const historyByCountry = new Map<string, SeriesPoint[]>();

  for (const { iso } of BIGMAC_COUNTRIES) {
    const mine = rows.filter((r) => r.iso === iso).sort((a, b) => a.date.localeCompare(b.date));
    const last = mine.filter((r) => r.date === latest)[0] ?? mine.at(-1);
    if (last) byCountry.set(iso, last);
    historyByCountry.set(
      iso,
      mine
        .map((r) => ({ t: Date.parse(`${r.date}T00:00:00Z`), v: r.vsUsdPct ?? NaN }))
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v)),
    );
  }

  return { latest, byCountry, historyByCountry };
}

function num(v: string | undefined): number | null {
  if (v === undefined || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const BIGMAC_SOURCE = {
  name: '이코노미스트 빅맥지수',
  url: 'https://github.com/TheEconomist/big-mac-data',
  delayMinutes: 0,
  terms: '이코노미스트가 공개한 원본 데이터입니다. 1년에 두 번 발표됩니다.',
} as const;
