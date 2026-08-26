/**
 * Fear & Greed 산출 엔진.
 *
 * 입력: 시장별 "원시 지표 시계열" (일 단위, 결측은 null)
 * 출력: 각 날짜의 0~100 점수 + 구성요소 점수 + 기여도 + 신뢰도
 *
 * 절대 규칙
 *  - 결측을 0 으로 대체하지 않는다.
 *  - 사용 가능한 가중치 합이 MIN_COVERAGE 미만이면 점수를 만들지 않는다.
 *  - 점수는 항상 0~100 범위 안에 있다.
 */

import { clamp, distributionScore, round } from '@/lib/stats';
import type {
  ComponentResult,
  Confidence,
  DataSource,
  FngDriver,
  FngHistoryPoint,
  FngScore,
  MarketId,
  Meta,
  SubMetricResult,
} from '@/types';
import { CONFIDENCE_LABEL } from '@/types';
import { stageOf } from '@/lib/scale';
import {
  COMPONENTS,
  FORMULA_VERSION,
  LOOKBACK,
  MIN_COVERAGE,
  WINSOR_TAIL,
  type ComponentDef,
} from './definitions';

/** 지표 하나의 일별 원시값. 값이 없는 날은 null. */
export type RawSeries = (number | null)[];

export interface EngineInput {
  market: MarketId;
  /** 각 인덱스에 대응하는 날짜(epoch ms), 오름차순 */
  dates: number[];
  /** metricId → 일별 원시값 (dates 와 길이 동일) */
  metrics: Record<string, RawSeries>;
  /** metricId → 결측 사유 (해당 지표를 강제로 사용 불가 처리) */
  forcedMissing?: Record<string, string>;
  /** metricId → 마지막 관측 시각(ISO). 신선도 판정에 쓴다. */
  metricAsOf?: Record<string, string>;
  /** componentId → 출처 목록 */
  sources: Record<string, DataSource[]>;
  /** 지표별 최대 허용 지연(시간). 초과하면 "오래됨"으로 본다. */
  freshnessLimitHours?: number;
}

export interface ComputedDay {
  t: number;
  score: number | null;
  coverage: number;
  componentScores: Record<string, number | null>;
  effectiveWeights: Record<string, number>;
}

/* ------------------------------------------------------------------ */

/** metricId 별 백분위 점수 시계열을 만든다. */
function scoreMetricSeries(
  values: RawSeries,
  invert: boolean,
  lookback: number,
  fromIndex: number,
): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = fromIndex; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) continue;
    const start = Math.max(0, i - lookback + 1);
    const window: number[] = [];
    for (let j = start; j <= i; j += 1) {
      const w = values[j];
      if (w !== null && Number.isFinite(w)) window.push(w);
    }
    out[i] = distributionScore(window, v, invert, WINSOR_TAIL);
  }
  return out;
}

interface ComponentSeries {
  def: ComponentDef;
  /** 인덱스별 구성요소 점수 */
  scores: (number | null)[];
  /** 인덱스별 하위 지표 점수 */
  subScores: Record<string, (number | null)[]>;
}

function buildComponentSeries(
  input: EngineInput,
  fromIndex: number,
): ComponentSeries[] {
  const lookback = LOOKBACK[input.market];
  const forced = input.forcedMissing ?? {};

  return COMPONENTS[input.market].map((def) => {
    const subScores: Record<string, (number | null)[]> = {};

    for (const sm of def.subMetrics) {
      if (forced[sm.id]) {
        subScores[sm.id] = new Array(input.dates.length).fill(null);
        continue;
      }
      const raw = input.metrics[sm.id];
      if (!raw) {
        subScores[sm.id] = new Array(input.dates.length).fill(null);
        continue;
      }
      subScores[sm.id] = scoreMetricSeries(raw, sm.invert, lookback, fromIndex);
    }

    const scores: (number | null)[] = new Array(input.dates.length).fill(null);
    for (let i = fromIndex; i < input.dates.length; i += 1) {
      let wsum = 0;
      let acc = 0;
      for (const sm of def.subMetrics) {
        const s = subScores[sm.id][i];
        if (s === null) continue;
        wsum += sm.weight;
        acc += s * sm.weight;
      }
      // 구성요소 내부에서도 결측은 0 이 아니라 "제외 후 재조정"이다.
      // 단, 절반 미만만 남으면 구성요소 자체를 결측 처리한다.
      scores[i] = wsum >= 50 ? clamp(round(acc / wsum, 2), 0, 100) : null;
    }

    return { def, scores, subScores };
  });
}

function computeDay(comps: ComponentSeries[], i: number): ComputedDay & { t: number } {
  let availableWeight = 0;
  let acc = 0;
  const componentScores: Record<string, number | null> = {};
  for (const c of comps) {
    const s = c.scores[i];
    componentScores[c.def.id] = s;
    if (s === null) continue;
    availableWeight += c.def.weight;
    acc += s * c.def.weight;
  }
  const coverage = availableWeight / 100;
  const effectiveWeights: Record<string, number> = {};
  for (const c of comps) {
    effectiveWeights[c.def.id] =
      c.scores[i] === null || availableWeight === 0 ? 0 : round((c.def.weight / availableWeight) * 100, 2);
  }
  const score =
    coverage >= MIN_COVERAGE && availableWeight > 0 ? clamp(round(acc / availableWeight, 1), 0, 100) : null;
  return { t: 0, score, coverage, componentScores, effectiveWeights };
}

/* ------------------------------------------------------------------ */

export interface EngineResult {
  /** 최신 시점의 완성된 점수 객체 */
  latest: FngScore;
  /** 전체 히스토리 (fromIndex 이후) */
  history: FngHistoryPoint[];
}

export interface EngineOptions {
  /** 히스토리를 만들 최대 일수 */
  historyDays: number;
  /** 데이터 메타 */
  meta: Meta;
  /** 산출 시각 */
  computedAt: string;
}

export function computeFng(input: EngineInput, options: EngineOptions): EngineResult {
  const n = input.dates.length;
  const lookback = LOOKBACK[input.market];
  const fromIndex = Math.max(0, Math.min(n - options.historyDays, n - 1));
  const usableFrom = Math.max(fromIndex, Math.min(lookback, n - 1));

  const comps = buildComponentSeries(input, Math.max(0, usableFrom - 40));

  const history: FngHistoryPoint[] = [];
  const days: ComputedDay[] = [];
  for (let i = usableFrom; i < n; i += 1) {
    const d = computeDay(comps, i);
    d.t = input.dates[i];
    days.push(d);
    history.push({ t: input.dates[i], v: d.score, formulaVersion: FORMULA_VERSION });
  }

  const lastIdx = n - 1;
  const last = days[days.length - 1];
  const prev = days[days.length - 2] ?? null;

  const scoreAtOffset = (offsetDays: number): number | null => {
    const idx = days.length - 1 - offsetDays;
    if (idx < 0) return null;
    return days[idx].score;
  };

  const deltaFrom = (offsetDays: number): number | null => {
    if (last.score === null) return null;
    const past = scoreAtOffset(offsetDays);
    if (past === null) return null;
    return round(last.score - past, 1);
  };

  /* ---------------- 구성요소 결과 ---------------- */
  const forced = input.forcedMissing ?? {};
  const asOfMap = input.metricAsOf ?? {};
  const freshLimitMs = (input.freshnessLimitHours ?? 30) * 3600_000;
  const nowMs = Date.parse(options.computedAt);

  let freshWeightOk = 0;
  let totalAvailableWeight = 0;

  const components: ComponentResult[] = comps.map((c) => {
    const score = c.scores[lastIdx];
    const prevScore = prev ? c.scores[lastIdx - 1] ?? null : null;
    const deltaDay = score !== null && prevScore !== null ? round(score - prevScore, 2) : null;

    const subMetrics: SubMetricResult[] = c.def.subMetrics.map((sm) => {
      const rawArr = input.metrics[sm.id];
      const rawValue = rawArr ? rawArr[lastIdx] ?? null : null;
      const missingReason = forced[sm.id]
        ? forced[sm.id]
        : !rawArr
          ? '데이터 소스 미연결'
          : rawValue === null
            ? '최신 관측치 없음'
            : c.subScores[sm.id][lastIdx] === null
              ? '역사적 분포 표본 부족'
              : undefined;
      return {
        id: sm.id,
        label: sm.label,
        weight: sm.weight,
        score: c.subScores[sm.id][lastIdx],
        raw: forced[sm.id] ? null : rawValue,
        rawLabel: sm.hint,
        inverted: sm.invert,
        ...(missingReason ? { missingReason } : {}),
        asOf: asOfMap[sm.id] ?? null,
      };
    });

    const available = score !== null;
    if (available) {
      totalAvailableWeight += c.def.weight;
      const componentAsOf = subMetrics
        .filter((s) => s.score !== null && s.asOf)
        .map((s) => Date.parse(s.asOf as string))
        .filter((t) => Number.isFinite(t));
      const oldest = componentAsOf.length ? Math.min(...componentAsOf) : nowMs;
      if (nowMs - oldest <= freshLimitMs) freshWeightOk += c.def.weight;
    }

    const missingReason = available
      ? undefined
      : subMetrics.find((s) => s.missingReason)?.missingReason ?? '구성 지표 부족';

    return {
      id: c.def.id,
      label: c.def.label,
      weight: c.def.weight,
      effectiveWeight: last.effectiveWeights[c.def.id] ?? 0,
      score,
      deltaDay,
      contributionDay: null, // 아래에서 채움
      description: c.def.description,
      sources: input.sources[c.def.id] ?? c.def.plannedSources,
      subMetrics,
      available,
      ...(missingReason ? { missingReason } : {}),
      asOf: subMetrics.map((s) => s.asOf).find((a) => a) ?? null,
    };
  });

  /* ---------------- 기여도 ---------------- */
  for (const comp of components) {
    if (comp.deltaDay === null || comp.effectiveWeight === 0) {
      comp.contributionDay = null;
      continue;
    }
    comp.contributionDay = round((comp.effectiveWeight / 100) * comp.deltaDay, 2);
  }

  const contributors = components.filter(
    (c): c is ComponentResult & { contributionDay: number } => c.contributionDay !== null && c.contributionDay !== 0,
  );
  const sorted = [...contributors].sort((a, b) => b.contributionDay - a.contributionDay);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  const toDriver = (c: (ComponentResult & { contributionDay: number }) | undefined, positive: boolean): FngDriver | null => {
    if (!c) return null;
    if (positive && c.contributionDay <= 0) return null;
    if (!positive && c.contributionDay >= 0) return null;
    return {
      componentId: c.id,
      label: c.label,
      contribution: c.contributionDay,
      detail: `구성요소 점수 ${c.deltaDay !== null && c.deltaDay > 0 ? '+' : ''}${c.deltaDay?.toFixed(1) ?? '—'}점 · 적용 가중치 ${c.effectiveWeight.toFixed(0)}%`,
    };
  };

  /* ---------------- 신뢰도 ---------------- */
  const coverage = last.coverage;
  const freshnessScore = totalAvailableWeight > 0 ? freshWeightOk / totalAvailableWeight : 0;

  let confidence: Confidence;
  if (coverage >= 0.9 && freshnessScore >= 0.9) confidence = 'high';
  else if (coverage >= 0.8 && freshnessScore >= 0.6) confidence = 'medium';
  else confidence = 'low';

  const confidenceReason = `데이터 충족률 ${Math.round(coverage * 100)}% · 신선도 ${Math.round(
    freshnessScore * 100,
  )}% → 신뢰도 ${CONFIDENCE_LABEL[confidence]}`;

  const unavailableReason =
    last.score === null
      ? `사용 가능한 구성요소 가중치가 ${Math.round(coverage * 100)}% 로 최소 기준 ${Math.round(
          MIN_COVERAGE * 100,
        )}% 에 미치지 못해 산출할 수 없습니다.`
      : undefined;

  const spark = history.slice(-30);

  const latest: FngScore = {
    market: input.market,
    score: last.score,
    stage: stageOf(last.score),
    ...(unavailableReason ? { unavailableReason } : {}),
    deltaDay: deltaFrom(1),
    deltaWeek: deltaFrom(5),
    deltaMonth: deltaFrom(21),
    spark,
    coverage: round(coverage, 4),
    freshnessScore: round(freshnessScore, 4),
    confidence,
    confidenceReason,
    formulaVersion: FORMULA_VERSION,
    computedAt: options.computedAt,
    lookbackDays: lookback,
    components,
    topPositive: toDriver(best, true),
    topNegative: toDriver(worst, false),
    meta: options.meta,
  };

  return { latest, history };
}
