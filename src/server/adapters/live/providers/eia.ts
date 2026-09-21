/**
 * EIA (미국 에너지정보청) 공개 API — **진짜 선물 계약 정산가**.
 *
 * 왜 이곳인가
 *   이 앱의 선물 판은 대부분 값이 비어 있다. 지수·금속·농산물 선물 시세는
 *   거래소(CME·ICE)가 파는 데이터라 무료로 재배포할 수 없기 때문이다.
 *   그런데 **에너지 선물만은 예외**다 — 미국 정부 기관인 EIA 가 NYMEX 의
 *   인도월별 정산가를 공개 통계로 내고, 그것은 재배포 제한이 없다.
 *
 *   그래서 여기서만 "현물을 대신 쓴 값" 이 아니라 선물 계약 자체를 실을 수 있다.
 *   WTI 원유 · 천연가스 · 난방유 · 휘발유(RBOB) 네 개다.
 *
 * 인도월 1~4를 함께 받는 이유
 *   가격 하나만 보면 비싸다/싸다 밖에 못 읽는다. 인도월 1~4를 같이 받으면
 *   콘탱고 · 백워데이션(먼 달이 비싼가, 가까운 달이 비싼가)을 읽을 수 있고,
 *   그게 값 하나보다 판단 재료가 된다. 곡선 해석은 src/lib/futuresCurve.mjs 가 한다.
 *
 * 약관 (2026-09 기준 확인 필요)
 *   - 무료. 이메일만 넣으면 키가 나온다 (https://www.eia.gov/opendata/).
 *   - 미국 연방정부 저작물이라 재배포에 제한이 없다. 출처 표기를 권장한다 —
 *     화면에 "EIA" 를 그대로 노출한다.
 *   - 일별 정산가이며 당일치는 장 마감 뒤에 올라온다. 실시간이 아니다.
 *
 * ⚠ 응답 모양에 대한 정직한 표기
 *   아래 파서가 기대하는 모양과 계열 코드는 EIA 가 문서로 공개한 것을 따른 것이고,
 *   **이 컨테이너에서는 api.eia.gov 로 나갈 수 없어 실제 응답으로 확인하지 못했다.**
 *   그러니 여기서 증명되는 것은 "EIA 가 이 모양으로 답하면 우리가 읽어 낸다" 까지다.
 *   실제로 맞는지는 키를 넣고 `npm run check:live` 를 돌려야 알 수 있고,
 *   틀리면 해당 줄만 사유와 함께 비고 다른 줄은 그대로 나온다.
 *
 * 기대하는 응답 모양 (v2)
 *   GET {base}/petroleum/pri/fut/data/?api_key=…&frequency=daily&data[0]=value
 *       &facets[series][]=RCLC1&facets[series][]=RCLC2&…&sort[0][column]=period
 *       &sort[0][direction]=desc&length=…
 *   { "response": { "data": [
 *       { "period": "2026-09-04", "series": "RCLC1", "value": 63.45, "units": "$/BBL" }, … ] } }
 *   value 는 숫자로도 문자열로도 올 수 있어 둘 다 받는다. 결측(null)은 0 으로 바꾸지 않고 뺀다.
 */

import { fetchJson } from '@/server/http';
import type { SeriesPoint } from '@/types';

const DEFAULT_BASE = 'https://api.eia.gov/v2';

export interface EiaConfig {
  base: string;
  key: string;
}

export function eiaConfig(key: string, base: string | null): EiaConfig {
  return { base: base ?? DEFAULT_BASE, key };
}

/**
 * 선물 판 항목 → EIA 인도월 계열.
 *
 * `series` 는 근월물부터 순서대로 넷이다. 여기 없는 항목은 EIA 가 선물 정산가를
 * 내지 않는다는 뜻이고, 그런 항목은 거래소 유료 시세로 남는다.
 */
export const EIA_FUTURES: Record<
  string,
  { route: string; series: string[]; unit: string; what: string }
> = {
  cl: {
    route: 'petroleum/pri/fut',
    series: ['RCLC1', 'RCLC2', 'RCLC3', 'RCLC4'],
    unit: '$/배럴',
    what: '쿠싱 WTI 원유 선물 (NYMEX)',
  },
  ng: {
    route: 'natural-gas/pri/fut',
    series: ['RNGC1', 'RNGC2', 'RNGC3', 'RNGC4'],
    unit: '$/MMBtu',
    what: '헨리허브 천연가스 선물 (NYMEX)',
  },
  ho: {
    route: 'petroleum/pri/fut',
    series: ['RHOC1', 'RHOC2', 'RHOC3', 'RHOC4'],
    unit: '$/갤런',
    what: '뉴욕항 2호 난방유 선물 (NYMEX)',
  },
  rb: {
    route: 'petroleum/pri/fut',
    series: [
      'EER_EPMRR_PE1_Y35NY_DPG',
      'EER_EPMRR_PE2_Y35NY_DPG',
      'EER_EPMRR_PE3_Y35NY_DPG',
      'EER_EPMRR_PE4_Y35NY_DPG',
    ],
    unit: '$/갤런',
    what: '뉴욕항 RBOB 휘발유 선물 (NYMEX)',
  },
};

export type EiaFuturesId = keyof typeof EIA_FUTURES;

interface EiaRow {
  period?: string;
  series?: string;
  value?: number | string | null;
}

interface EiaResponse {
  response?: { data?: EiaRow[] };
  /** 키가 틀리거나 경로가 없을 때 EIA 가 돌려주는 모양 */
  error?: string;
}

/**
 * 인도월 1~4를 **한 번의 요청으로** 받는다.
 *
 * 계약마다 따로 부르면 상품 하나에 네 번 나간다. EIA 는 facets 를 여러 개 붙이면
 * 한 응답에 섞어 주고 각 줄에 `series` 가 들어 있으므로, 그걸로 갈라 담는다.
 *
 * @returns 계열 코드 → 날짜순 정렬된 관측값. 값이 하나도 없는 계열은 빈 배열로 남는다.
 */
export async function fetchFuturesChain(
  cfg: EiaConfig,
  id: string,
  opts: { days?: number } = {},
): Promise<Map<string, SeriesPoint[]>> {
  const spec = EIA_FUTURES[id];
  const out = new Map<string, SeriesPoint[]>();
  if (!spec) return out;
  for (const s of spec.series) out.set(s, []);

  const days = opts.days ?? 260;
  const params = new URLSearchParams({
    api_key: cfg.key,
    frequency: 'daily',
    'data[0]': 'value',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    offset: '0',
    // 계열이 넷이므로 줄 수도 넷 배로 잡는다
    length: String(Math.min(5000, days * spec.series.length)),
  });
  for (const s of spec.series) params.append('facets[series][]', s);

  const raw = await fetchJson<EiaResponse>(`${cfg.base}/${spec.route}/data/?${params.toString()}`);
  const rows = Array.isArray(raw.response?.data) ? (raw.response?.data ?? []) : [];

  for (const row of rows) {
    const list = row.series ? out.get(row.series) : undefined;
    if (!list) continue;
    const v = typeof row.value === 'string' ? Number(row.value) : row.value;
    const t = row.period ? Date.parse(`${row.period}T00:00:00Z`) : NaN;
    // 결측을 0 으로 바꾸면 값이 통째로 거짓이 된다. 아예 뺀다.
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isFinite(t)) continue;
    list.push({ t, v });
  }

  for (const list of out.values()) list.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * 받은 인도월들에서 곡선 한 벌을 만든다.
 *
 * **같은 날짜의 값끼리만** 견준다. 근월물은 오늘 값이고 원월물은 사흘 전 값이면
 * 그 차이는 곡선이 아니라 그냥 시차다 — 그런 걸 콘탱고라고 부르면 거짓말이다.
 * 그래서 모든 계약이 값을 가진 가장 최근 날짜를 찾아 그 날로 맞춘다.
 */
export function curveFrom(
  chain: Map<string, SeriesPoint[]>,
  series: string[],
): { n: number; value: number; at: number }[] {
  const first = chain.get(series[0]) ?? [];
  for (let i = first.length - 1; i >= 0; i -= 1) {
    const t = first[i].t;
    const picked: { n: number; value: number; at: number }[] = [];
    for (const [n, code] of series.entries()) {
      const hit = (chain.get(code) ?? []).find((p) => p.t === t);
      if (!hit) break;
      picked.push({ n: n + 1, value: hit.v, at: t });
    }
    // 둘 이상 모여야 모양을 읽을 수 있다. 하나뿐이면 곡선이 아니다.
    if (picked.length >= 2) return picked;
  }
  return [];
}

export const EIA_SOURCE = {
  name: 'EIA (미국 에너지정보청)',
  url: 'https://www.eia.gov/opendata/',
  delayMinutes: 0,
  terms: '무료 공개 통계(미국 연방정부 저작물). 일별 정산가이며 당일치는 장 마감 뒤에 올라옵니다.',
} as const;
