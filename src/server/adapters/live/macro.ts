/**
 * FRED 로 거시·위험 지표를 만든다.
 *
 * 위험 단계(riskLevel)는 임의로 정하지 않고, 위험 신호등이 쓰는 구간(risk.ts 의 bands)과
 * 같은 기준을 쓴다. 기준이 없는 지표는 'unknown' 으로 두고 색을 칠하지 않는다 —
 * 근거 없이 빨간불을 켜지 않는다.
 */

import type { MacroIndicator, SeriesPoint } from '@/types';
import {
  FRED_SOURCE,
  fetchSeries,
  monthOverMonthDelta,
  yearOverYear,
  type FredConfig,
  type FredSeriesKey,
} from './providers/fred';

interface Spec {
  id: string;
  key: FredSeriesKey;
  name: string;
  group: MacroIndicator['group'];
  unit: MacroIndicator['unit'];
  precision: number;
  suffix?: string;
  featured: boolean;
  /** 지수로 오는 계열을 화면 값으로 바꾸는 방법 */
  transform?: 'yoy' | 'mom_delta';
}

/** 화면이 아는 지표 id 를 그대로 쓴다 — 해설(indicatorGuide)이 id 로 붙는다. */
const SPECS: Spec[] = [
  { id: 'us_policy_rate', key: 'us_policy_rate', name: '미국 기준금리', group: '미국', unit: 'percent', precision: 2, suffix: '%', featured: true },
  { id: 'us_cpi', key: 'us_cpi', name: '미국 소비자물가 (전년비)', group: '미국', unit: 'percent', precision: 1, suffix: '%', featured: true, transform: 'yoy' },
  { id: 'us_core_pce', key: 'us_core_pce', name: '미국 근원 PCE (전년비)', group: '미국', unit: 'percent', precision: 1, suffix: '%', featured: false, transform: 'yoy' },
  { id: 'us_unemployment', key: 'us_unemployment', name: '미국 실업률', group: '미국', unit: 'percent', precision: 1, suffix: '%', featured: true },
  { id: 'us_nfp', key: 'us_nfp', name: '미국 비농업 고용 (전월 증감)', group: '미국', unit: 'count', precision: 0, suffix: '천명', featured: false, transform: 'mom_delta' },
  { id: 'us_spread', key: 'us_spread', name: '미국 장단기 금리차 (10년-2년)', group: '미국', unit: 'percent', precision: 2, suffix: '%p', featured: true },
  { id: 'hy_oas', key: 'hy_oas', name: '하이일드 신용스프레드', group: '글로벌', unit: 'percent', precision: 2, suffix: '%p', featured: true },
  { id: 'vix', key: 'vix', name: '미국 공포지수 VIX', group: '미국', unit: 'point', precision: 2, featured: true },
  { id: 'usdkrw', key: 'usdkrw', name: 'USD/KRW', group: '한국', unit: 'point', precision: 2, suffix: '원', featured: true },
];

/**
 * 위험 구간. risk.ts 의 bands 와 같은 값을 쓴다.
 * 여기 없는 지표는 단계를 매기지 않는다.
 */
const BANDS: Record<string, { watch: number; alert: number; higherIsRiskier: boolean }> = {
  vix: { watch: 20, alert: 28, higherIsRiskier: true },
  hy_oas: { watch: 4.5, alert: 6, higherIsRiskier: true },
  us_spread: { watch: 0.2, alert: 0, higherIsRiskier: false },
};

function levelOf(id: string, v: number | null): { level: MacroIndicator['riskLevel']; note: string } {
  if (v === null) return { level: 'unknown', note: '값을 받지 못했습니다.' };
  const b = BANDS[id];
  if (!b) return { level: 'unknown', note: '위험 구간 기준이 정해진 지표가 아닙니다.' };
  if (b.higherIsRiskier) {
    if (v >= b.alert) return { level: 'alert', note: `${b.alert} 이상은 과거 불안했던 구간입니다.` };
    if (v >= b.watch) return { level: 'watch', note: `${b.watch} 이상은 평소보다 벗어난 구간입니다.` };
  } else {
    if (v <= b.alert) return { level: 'alert', note: `${b.alert} 이하는 과거 불안했던 구간입니다.` };
    if (v <= b.watch) return { level: 'watch', note: `${b.watch} 이하는 평소보다 벗어난 구간입니다.` };
  }
  return { level: 'normal', note: '평소 범위 안입니다.' };
}

function trendOf(v: number | null, prev: number | null): MacroIndicator['trend'] {
  if (v === null || prev === null) return 'unknown';
  if (v > prev) return 'up';
  if (v < prev) return 'down';
  return 'flat';
}

/** 관측일 기준 5년치를 받아 화면 값과 미니 차트를 만든다. */
export async function buildFredMacro(cfg: FredConfig, now: Date): Promise<MacroIndicator[]> {
  const start = new Date(now.getTime() - 6 * 365 * 86400_000).toISOString().slice(0, 10);
  const fetchedAt = now.toISOString();

  const results = await Promise.all(
    SPECS.map(async (spec) => {
      try {
        const points = await fetchSeries(cfg, spec.key, { start });
        return { spec, points, error: null as string | null };
      } catch (e) {
        return { spec, points: [] as SeriesPoint[], error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  return results.map(({ spec, points, error }) => {
    let value: number | null = null;
    let previous: number | null = null;
    let spark: SeriesPoint[] = [];

    if (points.length > 0) {
      if (spec.transform === 'yoy') {
        // 지수를 전년비로 바꾼다. 월별 계열이라 12개 전과 견준다.
        const yoy: SeriesPoint[] = [];
        for (let i = 12; i < points.length; i += 1) {
          const a = points[i - 12].v;
          if (a !== 0) yoy.push({ t: points[i].t, v: ((points[i].v - a) / Math.abs(a)) * 100 });
        }
        spark = yoy;
        value = yoy.length ? yoy[yoy.length - 1].v : yearOverYear(points);
        previous = yoy.length > 1 ? yoy[yoy.length - 2].v : null;
      } else if (spec.transform === 'mom_delta') {
        const d: SeriesPoint[] = [];
        for (let i = 1; i < points.length; i += 1) d.push({ t: points[i].t, v: points[i].v - points[i - 1].v });
        spark = d;
        value = d.length ? d[d.length - 1].v : monthOverMonthDelta(points);
        previous = d.length > 1 ? d[d.length - 2].v : null;
      } else {
        spark = points;
        value = points[points.length - 1].v;
        previous = points.length > 1 ? points[points.length - 2].v : null;
      }
    }

    const { level, note } = levelOf(spec.id, value);
    const lastT = spark.length ? spark[spark.length - 1].t : null;

    return {
      id: spec.id,
      name: spec.name,
      group: spec.group,
      value,
      previous,
      unit: spec.unit,
      precision: spec.precision,
      ...(spec.suffix ? { suffix: spec.suffix } : {}),
      trend: trendOf(value, previous),
      riskLevel: level,
      riskNote: error ? `받아오지 못했습니다: ${error}` : note,
      featured: spec.featured,
      releaseDate: lastT ? new Date(lastT).toISOString() : null,
      nextRelease: null,
      // 미니 차트는 최근 120개만 (관측 주기가 달라 개수로 자른다)
      spark: spark.slice(-120),
      meta: {
        asOf: lastT ? new Date(lastT).toISOString() : fetchedAt,
        fetchedAt,
        freshness: error ? 'stale' : 'live',
        sources: [{ ...FRED_SOURCE }],
        ...(error ? { notes: [error] } : {}),
      },
    } satisfies MacroIndicator;
  });
}
