/**
 * DEMO 선물 판.
 *
 * 실제 시세가 아니다. 화면과 계산 경로를 확인하기 위한 고정 샘플이며,
 * 같은 날에는 언제 열어도 같은 값이 나온다 (id 로 seed 를 고정한다).
 *
 * 값을 못 넣는 항목(거래소 유료 시세)은 DEMO 에서도 **빈 채로** 둔다.
 * DEMO 에서만 값이 보이고 LIVE 에서 사라지면, 화면이 왜 비는지 알 수 없다.
 */

import { mulberry32, hashSeed } from '@/lib/rng';
import { FUTURES_ITEMS, type FuturesItem } from '@/lib/futuresCatalog';
import type { AdapterContext } from '@/server/adapters/types';
import type { FuturesBoard, FuturesQuote, Meta, SeriesPoint } from '@/types';

/** 그럴듯한 출발값. 실제 시세가 아니다. */
const BASE: Record<string, number> = {
  es: 5900, nq: 21000, ym: 44000, rty: 2300, vx: 15.2, k200f: 352,
  cl: 72.4, bz: 76.1, ng: 2.93, ho: 2.35, rb: 2.1,
  gc: 2650, si: 31.2, hg: 4.15, pl: 968, pa: 1030,
  zc: 430, zw: 560, zs: 1010, sb: 20.4, kc: 322, cc: 6800, ct: 68.2, le: 190, he: 85,
  dx: 104.2, '6e': 1.082, '6j': 152.4, '6b': 1.271, '6c': 1.392, '6a': 0.661, '6s': 0.883, krw: 1335,
  zt: 4.28, zf: 4.3, zn: 4.382, zb: 4.6,
  btcf: 96000, ethf: 3400,
};

/** 하루 변동폭 (표준편차, 비율). 묶음마다 성격이 다르다. */
const VOL: Record<string, number> = {
  index: 0.009, energy: 0.021, metal: 0.013, agri: 0.016, currency: 0.004, rate: 0.012, crypto: 0.031,
};

const DAYS = 190;

/**
 * 인도월 곡선의 기울기 (계약 한 칸당 비율).
 *
 * LIVE 에서는 EIA 가 인도월 1~4를 그대로 주지만, DEMO 에는 받아 올 곳이 없으니
 * 마지막 값에서 일정한 기울기로 만들어 낸다. **양수와 음수를 섞어 둔다** —
 * 화면이 콘탱고와 백워데이션을 둘 다 제대로 그리는지 DEMO 만으로 확인할 수 있어야
 * 한다. 값 자체는 실제 시세가 아니다.
 */
const CURVE_SLOPE: Record<string, number> = {
  cl: -0.009,  // 백워데이션
  ng: 0.021,   // 콘탱고
  ho: -0.004,  // 완만한 백워데이션
  rb: 0.012,   // 콘탱고
};

/** 인도월 1~4. LIVE 와 같은 모양으로 만든다 (같은 날짜, 근월물부터). */
function curveFor(item: FuturesItem, last: number, at: number) {
  const slope = CURVE_SLOPE[item.id];
  if (slope === undefined) return undefined;
  const iso = new Date(at).toISOString();
  return [1, 2, 3, 4].map((n) => ({
    n,
    value: Number((last * (1 + slope * (n - 1))).toFixed(item.precision)),
    at: iso,
  }));
}

/** 기간별로 며칠 전과 견줄 것인가 */
function lookback(range: string, now: Date): number {
  if (range === '1D') return 1;
  if (range === '1W') return 5;
  if (range === '1M') return 21;
  if (range === '3M') return 63;
  // 올해 — 1월 1일 이후 지난 날을 거래일로 어림한다
  const jan1 = Date.UTC(now.getUTCFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - jan1) / 86400_000);
  return Math.max(1, Math.min(DAYS - 1, Math.round(days * (5 / 7))));
}

/** 항목 하나의 지나온 값. 같은 날에는 늘 같은 선이 나온다. */
function seriesFor(item: FuturesItem, now: Date): SeriesPoint[] {
  const day = Math.floor(now.getTime() / 86400_000);
  const rnd = mulberry32(hashSeed(`futures:${item.id}:${day}`));
  const vol = VOL[item.group] ?? 0.012;
  const base = BASE[item.id] ?? 100;
  // 아주 느린 추세 하나 + 하루치 흔들림. 방향은 항목마다 다르게 고정한다.
  const drift = (mulberry32(hashSeed(item.id))() - 0.5) * vol * 0.35;
  const out: SeriesPoint[] = [];
  let v = base * (1 - drift * DAYS);
  for (let i = DAYS - 1; i >= 0; i -= 1) {
    const shock = (rnd() + rnd() + rnd() - 1.5) * 2 * vol; // 대충 정규분포
    v = v * (1 + drift + shock);
    // 기준값으로 조금씩 당긴다. 순수한 랜덤워크로 190일을 걸으면 브렌트가 76 에서
    // 113 까지 가 버려서, 값이 그럴듯하지 않으면 화면을 판단하는 데 방해가 된다.
    v += (base - v) * 0.02;
    v = Math.max(base * 0.5, Math.min(base * 1.6, v));
    out.push({ t: now.getTime() - i * 86400_000, v: Number(v.toFixed(6)) });
  }
  return out;
}

export function buildFutures(ctx: AdapterContext, range: string, meta: Meta): FuturesBoard {
  const back = lookback(range, ctx.now);
  // partial 시나리오에서 값이 비는 항목 — 제공사가 응답하지 않은 상황을 흉내 낸다
  const broken = ctx.scenario === 'partial' ? new Set(['cl', 'zn']) : new Set<string>();

  const rows: FuturesQuote[] = FUTURES_ITEMS.map((item) => {
    if (item.source === 'none') {
      return {
        id: item.id,
        last: null,
        change: null,
        changePct: null,
        spark: [],
        unavailableReason: item.reason,
        meta,
      };
    }
    if (broken.has(item.id)) {
      return {
        id: item.id,
        last: null,
        change: null,
        changePct: null,
        spark: [],
        unavailableReason: '이번 갱신에서 값을 받지 못했습니다. 빈 값을 임의로 채우지 않습니다.',
        meta,
      };
    }
    const s = seriesFor(item, ctx.now);
    const point = s[s.length - 1];
    const last = point.v;
    const prev = s[Math.max(0, s.length - 1 - back)].v;
    const rounded = Number(last.toFixed(item.precision));
    const curve = curveFor(item, rounded, point.t);
    return {
      id: item.id,
      last: rounded,
      change: Number((last - prev).toFixed(item.precision)),
      changePct: prev !== 0 ? Number((((last - prev) / prev) * 100).toFixed(2)) : null,
      // 화면이 기간을 바꿔 가며 계산하므로 넉넉히 준다 (YTD 까지 커버)
      spark: s.slice(-181),
      ...(curve ? { curve } : {}),
      ...(item.proxy ? { proxyNote: item.proxy } : {}),
      meta,
    };
  });

  const availableCount = rows.filter((r) => r.last !== null).length;
  return {
    range,
    rows,
    availableCount,
    totalCount: rows.length,
    generatedAt: ctx.now.toISOString(),
  };
}
