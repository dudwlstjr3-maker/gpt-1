/**
 * 심리 사이클과 구간별 과거 통계.
 *
 * 두 가지를 만든다.
 *  1) 사이클 — 기간별로 지금 심리가 어디쯤인지, 그리고 지금 국면이 무엇인지
 *  2) 구간별 과거 통계 — "이 점수 구간이던 날들 이후 지수가 어떻게 움직였나"
 *
 * 둘 다 **서술**이다. 앞으로의 방향을 예측하거나 매매를 권하지 않는다.
 * 국면은 (현재 수준 × 최근 방향) 조합을 이름 붙인 것일 뿐이고,
 * 구간 통계는 과거 표본의 분포일 뿐이다.
 */

import { clamp, finiteOnly, mean as avg, quantile, round } from '@/lib/stats';
import { stageOf } from '@/lib/scale';
import type {
  CyclePhase,
  CyclePhaseId,
  FngBandStat,
  FngBandStats,
  FngCycle,
  FngCycleHorizon,
  FngHistoryPoint,
  FngStageId,
  MarketId,
  SeriesPoint,
} from '@/types';
import { FNG_STAGES } from '@/types';

/* ------------------------------------------------------------------ */
/* 사이클                                                               */
/* ------------------------------------------------------------------ */

interface HorizonDef {
  id: 'short' | 'mid' | 'long';
  label: string;
  windowDays: number;
}

const HORIZONS: HorizonDef[] = [
  { id: 'short', label: '단기', windowDays: 20 },
  { id: 'mid', label: '중기', windowDays: 60 },
  { id: 'long', label: '장기', windowDays: 250 },
];

/** 점수 시계열을 최대 n 개로 줄인다 (미니 차트용) */
function downsample(points: FngHistoryPoint[], n: number): FngHistoryPoint[] {
  if (points.length <= n) return points;
  const step = (points.length - 1) / (n - 1);
  const out: FngHistoryPoint[] = [];
  for (let i = 0; i < n; i += 1) out.push(points[Math.round(i * step)]);
  return out;
}

/** 최소제곱 기울기 (점/일) */
function slopeOf(values: number[]): number | null {
  const n = values.length;
  if (n < 3) return null;
  const xMean = (n - 1) / 2;
  const yMean = avg(values);
  if (yMean === null) return null;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  if (den === 0) return null;
  return round(num / den, 4);
}

/** 국면 = 지금 수준 × 최근 방향 */
function phaseOf(score: number | null, slope: number | null): CyclePhase {
  if (score === null || slope === null) {
    return {
      id: 'unknown',
      label: '판단 불가',
      levelLabel: '수준 정보 없음',
      directionLabel: '방향 정보 없음',
      description: '점수 또는 추세를 계산할 데이터가 부족해 국면을 판단할 수 없습니다.',
    };
  }

  // 하루 0.15점 이상 변할 때만 방향이 있다고 본다. 그 이하는 횡보로 읽는다.
  const THRESHOLD = 0.15;
  const rising = slope > THRESHOLD;
  const falling = slope < -THRESHOLD;
  const directionLabel = rising ? '상승 중' : falling ? '하락 중' : '횡보';

  const levelLabel = score < 40 ? '공포 구간' : score < 60 ? '중립 구간' : '탐욕 구간';

  let id: CyclePhaseId;
  if (score < 40) id = rising ? 'recovery' : falling ? 'deepening' : 'deepening';
  else if (score < 60) id = rising ? 'improving' : falling ? 'weakening' : 'improving';
  else id = rising ? 'heating' : falling ? 'cooling' : 'heating';

  // 횡보일 때는 방향 기반 이름을 쓰지 않도록 서술을 조정한다
  const flat = !rising && !falling;
  const LABEL: Record<CyclePhaseId, string> = {
    recovery: '회복 시도',
    deepening: '공포 심화',
    improving: '개선',
    weakening: '약화',
    heating: '과열 진행',
    cooling: '탐욕 후퇴',
    unknown: '판단 불가',
  };
  const label = flat ? `${levelLabel} 횡보` : LABEL[id];

  const description = flat
    ? `점수가 ${levelLabel}에 머물며 뚜렷한 방향 없이 횡보하고 있습니다 (최근 10일 기울기 ${slope.toFixed(2)}점/일).`
    : `점수가 ${levelLabel}에 있고 최근 10일 동안 ${directionLabel}입니다 (기울기 ${slope.toFixed(2)}점/일).`;

  return { id: flat ? id : id, label, levelLabel, directionLabel, description };
}

export function buildCycle(
  market: MarketId,
  history: FngHistoryPoint[],
  latestScore: number | null,
): FngCycle {
  const scored = history.filter((p): p is FngHistoryPoint & { v: number } => p.v !== null);
  const values = scored.map((p) => p.v);

  const last20 = values.slice(-20);
  const ma20 = last20.length >= 10 ? round(avg(last20) ?? Number.NaN, 1) : null;
  const slope = slopeOf(values.slice(-10));

  const horizons: FngCycleHorizon[] = HORIZONS.map((h) => {
    const slice = scored.slice(-h.windowDays);
    const vals = finiteOnly(slice.map((p) => p.v));
    // 창의 절반도 못 채우면 산출하지 않는다
    if (vals.length < Math.max(5, Math.floor(h.windowDays * 0.5))) {
      return {
        id: h.id,
        label: `${h.label} (${h.windowDays}일)`,
        windowDays: h.windowDays,
        percentile: null,
        mean: null,
        min: null,
        max: null,
        change: null,
        direction: 'unknown' as const,
        averageStage: null,
        points: downsample(slice, 40),
        unavailableReason: `표본이 ${vals.length}일뿐이라 ${h.windowDays}일 구간을 판단할 수 없습니다.`,
      };
    }

    const m = avg(vals);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const first = vals[0];
    const change = latestScore === null ? null : round(latestScore - first, 1);

    // 현재 점수가 이 기간 분포 안에서 어디쯤인가
    let percentile: number | null = null;
    if (latestScore !== null) {
      let below = 0;
      let equal = 0;
      for (const v of vals) {
        if (v < latestScore) below += 1;
        else if (v === latestScore) equal += 1;
      }
      percentile = round(clamp(((below + equal / 2) / vals.length) * 100, 0, 100), 1);
    }

    const direction: 'up' | 'down' | 'flat' =
      change === null ? 'flat' : change > 1 ? 'up' : change < -1 ? 'down' : 'flat';

    return {
      id: h.id,
      label: `${h.label} (${h.windowDays}일)`,
      windowDays: h.windowDays,
      percentile,
      mean: m === null ? null : round(m, 1),
      min: round(min, 1),
      max: round(max, 1),
      change,
      direction,
      averageStage: stageOf(m),
      points: downsample(slice, 40),
    };
  });

  return {
    market,
    score: latestScore,
    ma20: ma20 !== null && Number.isFinite(ma20) ? ma20 : null,
    slope,
    phase: phaseOf(latestScore, slope),
    horizons,
  };
}

/* ------------------------------------------------------------------ */
/* 구간별 과거 통계                                                       */
/* ------------------------------------------------------------------ */

/** 6개월 ≈ 126 거래일. 한 달(20일)로는 계절성·잡음에 묻혀 구간 차이가 보이지 않는다. */
export const BAND_FORWARD_DAYS = 126;

/**
 * 점수 구간별로 "그 뒤 N거래일 동안 대표 지수가 어떻게 움직였는지"를 집계한다.
 *
 * 평균·중앙값만 내지 않고 **사분위수까지 낸다.** 화면이 상자그림을 그려야
 * 구간끼리 범위가 얼마나 겹치는지가 보이기 때문이다. 평균만 막대로 그리면
 * 구간마다 답이 정해져 있는 것처럼 읽히는데, 실제로는 범위가 거의 포개진다.
 *
 * 주의: 과거 표본의 서술일 뿐이며 미래 수익을 예측하지 않는다.
 * 표본이 겹치는(overlapping) 구간이라 통계적 독립성이 없다는 점도 화면에 표기한다.
 */
export function buildBandStats(
  history: FngHistoryPoint[],
  benchmark: SeriesPoint[],
  benchmarkName: string,
  caveat: string,
  forwardDays = BAND_FORWARD_DAYS,
): FngBandStats | null {
  if (history.length < forwardDays * 3 || benchmark.length < forwardDays * 3) return null;

  // 벤치마크를 날짜로 조회할 수 있게 정렬된 배열로 둔다
  const bench = [...benchmark].sort((a, b) => a.t - b.t);
  const benchAt = (t: number): number | null => {
    // 이진 탐색으로 t 이하 가장 가까운 값
    let lo = 0;
    let hi = bench.length - 1;
    let best: number | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bench[mid].t <= t) {
        best = bench[mid].v;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  };

  const buckets = new Map<FngStageId, number[]>();
  for (const s of FNG_STAGES) buckets.set(s.id, []);

  const scored = history.filter((p): p is FngHistoryPoint & { v: number } => p.v !== null);
  let total = 0;

  for (let i = 0; i + forwardDays < scored.length; i += 1) {
    const stage = stageOf(scored[i].v);
    if (!stage) continue;
    const p0 = benchAt(scored[i].t);
    const p1 = benchAt(scored[i + forwardDays].t);
    if (p0 === null || p1 === null || p0 <= 0) continue;
    buckets.get(stage.id)?.push(((p1 - p0) / p0) * 100);
    total += 1;
  }

  if (total < forwardDays * 2) return null;

  const bands: FngBandStat[] = FNG_STAGES.map((s) => {
    const vals = buckets.get(s.id) ?? [];
    if (vals.length < 5) {
      return {
        stageId: s.id,
        stageLabel: s.label,
        sampleDays: vals.length,
        avgForward: null,
        medianForward: null,
        p25: null,
        p75: null,
        positiveShare: null,
        worst: null,
        best: null,
      };
    }
    const m = avg(vals);
    const med = quantile(vals, 0.5);
    const q1 = quantile(vals, 0.25);
    const q3 = quantile(vals, 0.75);
    return {
      stageId: s.id,
      stageLabel: s.label,
      sampleDays: vals.length,
      avgForward: m === null ? null : round(m, 2),
      medianForward: med === null ? null : round(med, 2),
      p25: q1 === null ? null : round(q1, 2),
      p75: q3 === null ? null : round(q3, 2),
      positiveShare: round((vals.filter((v) => v > 0).length / vals.length) * 100, 1),
      worst: round(Math.min(...vals), 2),
      best: round(Math.max(...vals), 2),
    };
  });

  return { forwardDays, benchmarkName, totalDays: total, bands, caveat };
}
