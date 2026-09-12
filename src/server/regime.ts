/**
 * 국면 전광판 조립 — 어댑터가 준 20년치 원자료를 점수와 곡선으로 바꾼다.
 *
 * 계산이 무겁다(20년 × 4축 × 매 주). 그래서 스냅샷 캐시 TTL 을 6시간으로 두고,
 * 곡선은 주 단위로 솎아낸다. 어차피 하루 사이에 20년 분포가 달라지지 않는다.
 */

import { buildBoard, buildHistory } from '@/lib/regimeRules.mjs';
import type { RegimeSeriesPoint } from '@/lib/regimeRules.d.mts';
import type { DataSource, Meta, RegimeAxisId, RegimeDigest } from '@/types';

export type RegimeSeries = Partial<Record<RegimeAxisId, RegimeSeriesPoint[]>>;

const DAY_MS = 86_400_000;
/** 곡선을 몇 일 간격으로 찍을지 — 20년이면 약 1,040개 */
const HISTORY_STEP_DAYS = 7;

export function buildRegimeDigest(
  series: RegimeSeries,
  sources: DataSource[],
  now: Date,
  options?: { maxStaleDays?: number },
): RegimeDigest {
  const at = now.getTime();
  const from = at - 20 * 365.25 * DAY_MS;

  // 곡선을 먼저 만든다. 희소성("N년 만") 은 이 곡선 위에서 찾는다.
  const history = buildHistory(series, from, at, HISTORY_STEP_DAYS, options);
  // 오늘 값이 자기 자신과 비교되지 않도록 마지막 점은 뺀다.
  const past = history.filter((h) => h.t < at - DAY_MS);
  const board = buildBoard(series, at, past, options);

  return { board, history, sources, generatedAt: now.toISOString() };
}

/** 섹션 상태 판정에 쓰는 값 */
export function regimeMeta(digest: RegimeDigest, now: Date): Meta {
  const asOf = digest.board.axes
    .map((a) => a.asOf)
    .filter((t): t is number => typeof t === 'number');
  const notes: string[] = [];
  for (const a of digest.board.axes) {
    if (a.percentile === null && a.reason) notes.push(`${a.label}: ${a.reason}`);
  }
  return {
    asOf: asOf.length ? new Date(Math.max(...asOf)).toISOString() : now.toISOString(),
    fetchedAt: now.toISOString(),
    freshness: 'live',
    sources: digest.sources,
    ...(notes.length ? { notes } : {}),
  };
}
