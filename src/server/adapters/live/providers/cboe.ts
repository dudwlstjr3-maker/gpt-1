/**
 * Cboe — 주식 풋/콜 비율 (무료 CSV, 키 불필요).
 *
 * 왜 이곳인가
 *  - 미국 심리 점수의 '풋/콜 옵션' 구성요소(14%)는 이것 없이는 채울 수 없다.
 *    이 하나가 빠지면 확보 가중치가 57% 에 머물러 70% 문턱을 못 넘고,
 *    미국 점수가 통째로 "산출 불가" 가 된다.
 *  - Cboe 가 거래소 당사자로서 일별 통계를 직접 공개한다. 2차 가공이 아니다.
 *
 * 지연
 *  - 일별 마감 통계다. 장중에 갱신되지 않는다. delayMinutes 로 표기하지 않고,
 *    asOf 를 관측일로 두어 화면이 신선도를 스스로 판단하게 한다.
 *
 * 약관 (2026-09 기준 확인 필요)
 *  - 공개 통계 파일. 대량 수집·재배포는 하지 않는다.
 */

import { fetchText } from '@/server/http';
import type { SeriesPoint } from '@/types';

const DEFAULT_URL =
  'https://cdn.cboe.com/api/global/us_indices/daily_statistics/Cboe_Volume_And_Put_Call_Ratios.csv';

export interface CboeConfig {
  url: string;
}

export function cboeConfig(url: string | null): CboeConfig {
  return { url: url ?? DEFAULT_URL };
}

/**
 * 주식 풋/콜 비율 일별 시계열.
 *
 * CSV 헤더가 제공사 사정으로 바뀔 수 있어, 이름으로 열을 찾는다.
 * 찾지 못하면 빈 배열을 돌려준다 — 다른 열을 넘겨짚어 엉뚱한 값을 쓰지 않는다.
 */
export async function fetchEquityPutCall(cfg: CboeConfig): Promise<SeriesPoint[]> {
  const csv = await fetchText(cfg.url);
  const lines = csv.trim().split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];

  // 헤더 줄을 찾는다 (파일 앞에 설명 줄이 붙는 경우가 있다)
  let headIdx = -1;
  let head: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 10); i += 1) {
    const cells = lines[i].split(',').map((c) => c.trim().toLowerCase());
    if (cells.some((c) => c.includes('date')) && cells.some((c) => c.includes('put/call') || c.includes('put call'))) {
      headIdx = i;
      head = cells;
      break;
    }
  }
  if (headIdx < 0) return [];

  const dateCol = head.findIndex((c) => c.includes('date'));
  // '주식' 풋/콜을 먼저 찾고, 없으면 전체(total) 를 쓴다.
  let ratioCol = head.findIndex((c) => c.includes('equity') && (c.includes('put/call') || c.includes('put call')));
  if (ratioCol < 0) ratioCol = head.findIndex((c) => c.includes('total') && (c.includes('put/call') || c.includes('put call')));
  if (dateCol < 0 || ratioCol < 0) return [];

  const out: SeriesPoint[] = [];
  for (const line of lines.slice(headIdx + 1)) {
    const cells = line.split(',');
    const t = Date.parse(`${(cells[dateCol] ?? '').trim()}T00:00:00Z`);
    const v = Number((cells[ratioCol] ?? '').trim());
    if (Number.isFinite(t) && Number.isFinite(v) && v > 0) out.push({ t, v });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

export const CBOE_SOURCE = {
  name: 'Cboe',
  url: 'https://www.cboe.com/us/options/market_statistics/',
  delayMinutes: 0,
  terms: '거래소가 공개하는 일별 마감 통계입니다. 장중에는 갱신되지 않습니다.',
} as const;
