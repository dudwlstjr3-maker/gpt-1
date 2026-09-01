/**
 * Stooq — 지수 · 종목 · 환율 시세 (CSV, 키 불필요).
 *
 * 왜 이곳인가
 *  - 가입도 키도 없이 S&P 500 · 나스닥 · 다우 · 러셀 · VIX · 환율을 한 형식으로 준다.
 *  - CSV 한 줄이라 응답 모양이 잘 바뀌지 않는다. 무료 소스 중 가장 덜 깨진다.
 *
 * 지연 (중요)
 *  - 무료 CSV 는 실시간이 아니다. 미국 지수·종목은 통상 15분 안팎 지연되고,
 *    일부 심볼은 전일 종가만 준다. 화면에는 이 지연을 그대로 배지로 띄운다.
 *  - "실시간"이라고 적지 않는다. 받은 기준 시각(asOf)을 그대로 쓰고,
 *    그 값이 오래됐으면 화면이 '오래됨'으로 표시한다.
 *
 * 약관 (2026-09 기준 확인 필요)
 *  - 개인적·비상업적 이용 범위에서 쓴다. 재배포·대량 수집은 하지 않는다.
 *  - 호출은 http.ts 의 호스트별 요청 제한을 거친다.
 */

import { fetchText } from '@/server/http';
import type { SeriesPoint } from '@/types';

const DEFAULT_BASE = 'https://stooq.com';

export interface StooqConfig {
  base: string;
}

export function stooqConfig(base: string | null): StooqConfig {
  return { base: base ?? DEFAULT_BASE };
}

/** 카탈로그 id → Stooq 심볼 */
export const STOOQ_SYMBOL: Record<string, string> = {
  /* 미국 지수 */
  spx: '^spx',
  ndx: '^ndx',
  dji: '^dji',
  rut: '^rut',
  vix: '^vix',
  dxy: '^dxy',
  /* 미국 종목 */
  nvda: 'nvda.us',
  aapl: 'aapl.us',
  msft: 'msft.us',
  amzn: 'amzn.us',
  tsla: 'tsla.us',
  /* 원자재 */
  gold: 'xauusd',
  wti: 'cl.f',
  /* 한국 지수 */
  kospi: '^kospi',
  kosdaq: '^kosdaq',
  /* 환율 */
  usdkrw: 'usdkrw',
};

export interface StooqQuote {
  symbol: string;
  /** 종가(또는 최종 체결가) */
  close: number | null;
  open: number | null;
  volume: number | null;
  /** 제공사가 준 기준 시각. 날짜만 오는 심볼도 있다. */
  asOf: string | null;
}

/**
 * 여러 심볼의 최신 시세를 한 번에.
 * Stooq 는 `s=a,b,c` 로 묶어 받을 수 있다.
 *
 * 응답 예:
 *   Symbol,Date,Time,Open,High,Low,Close,Volume
 *   ^SPX,2026-09-01,21:15:00,6510.2,6533.1,6498.7,6528.4,0
 *
 * 값이 'N/D' 로 오면 없는 것이다 — 0 으로 바꾸지 않고 null 로 둔다.
 */
export async function fetchQuotes(cfg: StooqConfig, ids: string[]): Promise<Map<string, StooqQuote>> {
  const symbols = ids.map((i) => STOOQ_SYMBOL[i]).filter(Boolean);
  if (symbols.length === 0) return new Map();

  const url = `${cfg.base}/q/l/?s=${symbols.join(',')}&f=sd2t2ohlcv&h&e=csv`;
  const csv = await fetchText(url);
  const rows = parseCsv(csv);

  const bySymbol = new Map<string, StooqQuote>();
  for (const row of rows) {
    const sym = (row.symbol ?? '').toLowerCase();
    if (!sym) continue;
    bySymbol.set(sym, {
      symbol: sym,
      close: num(row.close),
      open: num(row.open),
      volume: num(row.volume),
      asOf: isoFrom(row.date, row.time),
    });
  }

  const out = new Map<string, StooqQuote>();
  for (const id of ids) {
    const sym = STOOQ_SYMBOL[id];
    if (!sym) continue;
    const hit = bySymbol.get(sym.toLowerCase());
    if (hit) out.set(id, hit);
  }
  return out;
}

/**
 * 일별 종가 시계열.
 * 응답 예:
 *   Date,Open,High,Low,Close,Volume
 *   2026-08-29,6501.2,6520.0,6490.1,6512.7,0
 */
export async function fetchDailySeries(cfg: StooqConfig, id: string, days: number): Promise<SeriesPoint[]> {
  const sym = STOOQ_SYMBOL[id];
  if (!sym) return [];
  const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10).replace(/-/g, '');
  const to = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const url = `${cfg.base}/q/d/l/?s=${sym}&d1=${from}&d2=${to}&i=d`;
  const csv = await fetchText(url);

  return parseCsv(csv)
    .map((row) => {
      const t = row.date ? Date.parse(`${row.date}T00:00:00Z`) : NaN;
      const v = num(row.close);
      return { t, v: v ?? NaN };
    })
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
}

/* ------------------------------------------------------------------ */

type Row = Record<string, string>;

/** 헤더가 있는 단순 CSV. 값에 쉼표가 들어가지 않는 형식이라 따옴표 처리는 하지 않는다. */
function parseCsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: Row = {};
    head.forEach((h, i) => {
      row[h] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

function num(v: string | undefined): number | null {
  if (!v || v === 'N/D' || v === 'N/A') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Stooq 시각은 심볼이 거래되는 거래소 기준이다. 날짜만 오면 그날 자정으로 둔다. */
function isoFrom(date: string | undefined, time: string | undefined): string | null {
  if (!date || date === 'N/D') return null;
  const t = time && time !== 'N/D' ? time : '00:00:00';
  const parsed = Date.parse(`${date}T${t}Z`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export const STOOQ_SOURCE = {
  name: 'Stooq',
  url: 'https://stooq.com',
  /**
   * 무료 CSV 의 지연. 심볼마다 다르지만 미국 지수·종목은 15분 안팎이다.
   * 정확한 지연을 모를 때 0(실시간)이라고 적지 않는다 — 그게 더 위험한 거짓말이다.
   */
  delayMinutes: 15,
  terms: '무료 CSV. 실시간이 아니며 심볼에 따라 전일 종가만 제공될 수 있습니다.',
} as const;
