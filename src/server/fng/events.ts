/**
 * 과거 위기 시점 표식.
 *
 * 사건의 날짜와 이름은 실제로 있었던 일이다. 이 앱이 만들어 낸 값이 아니다.
 * 반면 표식에 붙는 점수는 "그날 공식 공포지수가 얼마였다"가 아니라
 * **이 앱의 자체 산식이 그 시점 데이터로 계산한 값**이다. 둘은 다르다.
 *
 * DEMO 모드에서는 원본 데이터 자체가 합성이므로 점수도 합성이다.
 * 그래서 마커마다 synthetic 플래그를 달고, 화면에도 그대로 적는다.
 */

import { stageOf } from '@/lib/scale';
import type { EventMarker, FngEvents, FngHistoryPoint, MarketEvent, MarketId } from '@/types';

/**
 * 최근 10년 안에서 시장이 크게 흔들렸던 시점.
 * 날짜는 해당 국면에서 널리 인용되는 기준일을 썼고, 하루 이틀 차이는 있을 수 있다.
 * 목록을 늘리거나 줄이려면 여기만 고치면 된다.
 */
export const MARKET_EVENTS: MarketEvent[] = [
  {
    id: 'brexit_2016',
    date: '2016-06-24',
    label: '브렉시트 국민투표',
    note: '영국의 EU 탈퇴 결정이 알려지며 글로벌 증시가 이틀간 급락했습니다.',
    category: 'shock',
    markets: ['us', 'kr'],
  },
  {
    id: 'volmageddon_2018',
    date: '2018-02-05',
    label: '변동성 급등(볼마겟돈)',
    note: '변동성 매도 상품이 한꺼번에 청산되며 VIX 가 하루 만에 두 배 가까이 뛰었습니다.',
    category: 'shock',
    markets: ['us', 'kr'],
  },
  {
    id: 'q4_2018',
    date: '2018-12-24',
    label: '미중 무역분쟁·긴축 우려',
    note: '무역분쟁과 금리 인상 우려가 겹치며 4분기 내내 지수가 흘러내렸습니다.',
    category: 'policy',
    markets: ['us', 'kr'],
  },
  {
    id: 'covid_2020',
    date: '2020-03-16',
    label: '코로나19 팬데믹 충격',
    note: '팬데믹 선언 직후 주식·원자재·크립토가 동시에 급락했습니다.',
    category: 'crisis',
    markets: ['us', 'kr', 'crypto'],
  },
  {
    id: 'china_mining_2021',
    date: '2021-05-19',
    label: '중국 채굴 규제 · 크립토 급락',
    note: '중국의 채굴·거래 규제 발표 이후 비트코인이 단기간에 큰 폭으로 하락했습니다.',
    category: 'shock',
    markets: ['crypto'],
  },
  {
    id: 'terra_2022',
    date: '2022-05-11',
    label: '테라·루나 붕괴',
    note: '알고리즘 스테이블코인이 무너지며 크립토 전반으로 신용 불안이 번졌습니다.',
    category: 'crisis',
    markets: ['crypto'],
  },
  {
    id: 'inflation_2022',
    date: '2022-06-16',
    label: '인플레이션 · 급격한 금리 인상',
    note: '물가가 수십 년 만의 고점을 찍고 중앙은행이 인상 폭을 키우던 국면입니다.',
    category: 'policy',
    markets: ['us', 'kr', 'crypto'],
  },
  {
    id: 'ftx_2022',
    date: '2022-11-11',
    label: 'FTX 파산',
    note: '대형 거래소가 파산 신청을 하며 크립토 신뢰가 크게 흔들렸습니다.',
    category: 'crisis',
    markets: ['crypto'],
  },
  {
    id: 'svb_2023',
    date: '2023-03-13',
    label: '실리콘밸리은행 파산',
    note: '지역은행 연쇄 불안으로 금융 시스템 위험이 다시 거론됐습니다.',
    category: 'crisis',
    markets: ['us', 'kr'],
  },
  {
    id: 'yen_carry_2024',
    date: '2024-08-05',
    label: '엔 캐리 청산 · 글로벌 급락',
    note: '엔화 급등으로 차입 투자 포지션이 한꺼번에 정리되며 아시아·미국 증시가 급락했습니다.',
    category: 'shock',
    markets: ['us', 'kr', 'crypto'],
  },
  {
    // 4월 2일 발표 → 3~8일 급락 → 9일 유예 발표로 반등. 공포가 가장 심했던 날로 8일을 잡았다.
    id: 'tariff_2025',
    date: '2025-04-08',
    label: '미국 상호관세 발표 · 글로벌 급락',
    note: '전면적인 상호관세 발표 뒤 며칠 만에 전 세계 증시가 급락했고, 변동성지수는 2020년 이후 가장 높은 수준까지 뛰었습니다. 4월 9일 유예 발표로 반등했습니다.',
    category: 'policy',
    markets: ['us', 'kr', 'crypto'],
  },
];

/** UTC 자정 기준 타임스탬프 */
export function eventTimestamp(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 0, 0, 0);
}

export function eventsForMarket(market: MarketId): MarketEvent[] {
  return MARKET_EVENTS.filter((e) => e.markets.includes(market)).sort(
    (a, b) => eventTimestamp(a.date) - eventTimestamp(b.date),
  );
}

/** 사건일과 가장 가까운 히스토리 지점을 찾는다. 너무 멀면 붙이지 않는다. */
const MAX_OFFSET_DAYS = 7;

/**
 * 히스토리에 사건 표식을 붙인다.
 *
 * 히스토리 범위 밖의 사건은 억지로 끌어오지 않고 개수만 알린다.
 * 값이 결측인 날에 걸리면 점수를 지어내지 않고 사유를 남긴다.
 */
export function buildEventMarkers(
  market: MarketId,
  history: FngHistoryPoint[],
  synthetic: boolean,
): FngEvents {
  const caveat = synthetic
    ? 'DEMO 모드입니다. 사건의 날짜와 이름은 실제이지만, 표식에 붙은 점수는 합성 데이터로 계산한 값이라 그날의 실제 수치가 아닙니다.'
    : '사건의 날짜와 이름은 실제입니다. 표식의 점수는 이 앱이 그 시점 데이터로 직접 산출한 값이며, 외부 기관이 발표한 공식 지수가 아닙니다.';

  const list = eventsForMarket(market);
  if (history.length === 0) {
    return { markers: [], outOfRange: list.length, caveat };
  }

  const first = history[0].t;
  const last = history[history.length - 1].t;
  const markers: EventMarker[] = [];
  let outOfRange = 0;

  for (const e of list) {
    const target = eventTimestamp(e.date);
    if (target < first - MAX_OFFSET_DAYS * 86400000 || target > last) {
      outOfRange += 1;
      continue;
    }

    // 가장 가까운 지점 하나만 고른다 (거래일이 아닌 날에 걸리는 사건이 있다)
    let best: FngHistoryPoint | null = null;
    let bestGap = Infinity;
    for (const p of history) {
      const gap = Math.abs(p.t - target);
      if (gap < bestGap) {
        bestGap = gap;
        best = p;
      }
      // 히스토리는 오름차순이므로 지나치면 더 볼 필요가 없다
      if (p.t > target && gap > bestGap) break;
    }

    if (!best || bestGap > MAX_OFFSET_DAYS * 86400000) {
      outOfRange += 1;
      continue;
    }

    const stage = stageOf(best.v);
    markers.push({
      id: e.id,
      date: e.date,
      label: e.label,
      note: e.note,
      category: e.category,
      t: best.t,
      offsetDays: Math.round(bestGap / 86400000),
      score: best.v,
      stageId: stage?.id ?? null,
      stageLabel: stage?.label ?? null,
      unavailableReason: best.v === null ? '해당 시점 점수가 산출되지 않았습니다.' : undefined,
      synthetic,
    });
  }

  return { markers, outOfRange, caveat };
}
