/**
 * SEC EDGAR — 미국 상장사 재무제표.
 *
 * 왜 이곳인가
 *   미국 증권거래위원회가 상장사 공시를 **기계가 읽는 형태(XBRL)로 전부 공개**한다.
 *   무료이고 키가 없다. 연방정부 저작물이라 재배포 제한도 없다. 유료 벤더가 파는
 *   "재무 데이터" 의 원본이 대부분 이것이다 — 벤더는 정리해 주는 값을 받는다.
 *
 *   이 앱은 지금까지 종목의 **가격**만 알았다. 가격만으로는 "왜 이 값인가" 를
 *   물을 수 없다. 매출이 늘고 있는지, 이익률이 유지되는지, 지금 주가가 이익의
 *   몇 배인지는 여기서 온다.
 *
 * 약관 · 접속 조건 (2026-09 기준 확인 필요)
 *   - 무료. 키 없음. 재배포 제한 없음.
 *   - **연락처가 담긴 User-Agent 를 요구한다.** 없으면 403 으로 막는다.
 *     약관이라기보다 접속 조건이라 코드가 지킨다. SEC_USER_AGENT 로 바꿀 수 있다.
 *   - 초당 10건 제한. 이 앱의 호스트별 요청 제한(기본 초당 5건)이 이미 그 아래다.
 *   - 공시는 분기·연간 단위라 실시간이 아니다. asOf 는 보고서 접수일을 쓴다.
 *
 * ⚠ 응답 모양에 대한 정직한 표기
 *   아래 파서가 기대하는 모양은 SEC 가 문서로 공개한 companyconcept 응답을 따른
 *   것이고, **이 컨테이너에서 data.sec.gov 로 나갈 수 없어 실제 응답으로 확인하지
 *   못했다.** 여기서 증명되는 것은 "SEC 가 이 모양으로 답하면 우리가 읽어 낸다"
 *   까지다. 실제 모양은 `npm run check:live` 가 첫 줄의 열 이름을 그대로 찍어 준다.
 *
 * 기대하는 응답 모양
 *   GET {base}/api/xbrl/companyconcept/CIK0000320193/us-gaap/Revenues.json
 *   {
 *     "cik": 320193, "taxonomy": "us-gaap", "tag": "Revenues",
 *     "entityName": "Apple Inc.",
 *     "units": { "USD": [
 *       { "start": "2025-09-28", "end": "2025-12-27", "val": 124300000000,
 *         "fy": 2026, "fp": "Q1", "form": "10-Q", "filed": "2026-01-30" } ] }
 *   }
 *   태그가 그 회사에 없으면 404 를 준다 — 오류가 아니라 "그 태그는 안 쓴다" 는 뜻이라
 *   다음 태그로 넘어간다.
 */

import { fetchJson, UpstreamError } from '@/server/http';
import { envUrl } from '@/server/config';
import { FINANCIAL_LINES, type FinancialLineDef } from '@/lib/companyCatalog';
import { annual, instant, quarterly } from '@/lib/fundamentals.mjs';
import type { FinancialLine, FinancialPoint } from '@/types';

const DEFAULT_BASE = 'https://data.sec.gov';

/**
 * SEC 는 연락처가 담긴 User-Agent 를 요구한다. 이 값이 실제로 닿는 주소여야
 * 한다는 것이 SEC 의 요구이므로, 운영에 올릴 때는 SEC_USER_AGENT 로 바꾼다.
 */
const DEFAULT_UA = 'MarketMood3/1.0 (contact: set SEC_USER_AGENT env var)';

export interface SecConfig {
  base: string;
  userAgent: string;
}

export function secConfig(): SecConfig {
  return {
    base: envUrl('SEC_BASE_URL') ?? DEFAULT_BASE,
    userAgent: envUrl('SEC_USER_AGENT') ?? DEFAULT_UA,
  };
}

interface ConceptResponse {
  cik?: number;
  tag?: string;
  entityName?: string;
  units?: Record<string, unknown[]>;
}

/** us-gaap 개념 하나를 가져온다. 그 회사가 안 쓰는 태그면 null. */
async function fetchConcept(
  cfg: SecConfig,
  cik: string,
  tag: string,
): Promise<{ entityName: string | null; facts: unknown[] } | null> {
  const url = `${cfg.base}/api/xbrl/companyconcept/CIK${cik}/us-gaap/${tag}.json`;
  try {
    const raw = await fetchJson<ConceptResponse>(url, {
      headers: { 'user-agent': cfg.userAgent },
      // 404 는 "그 태그를 안 쓴다" 는 뜻이라 다시 물어도 소용없다
      noRetryStatus: [404, 403],
    });
    const units = raw.units ?? {};
    // 금액은 USD, 주당 값은 USD/shares 로 온다. 둘 중 있는 쪽을 쓴다.
    const facts = (units.USD ?? units['USD/shares'] ?? []) as unknown[];
    if (!Array.isArray(facts) || facts.length === 0) return null;
    return { entityName: typeof raw.entityName === 'string' ? raw.entityName : null, facts };
  } catch (e) {
    if (e instanceof UpstreamError && e.status === 404) return null;
    throw e;
  }
}

/**
 * 한 줄(매출·영업이익·…)을 채운다.
 *
 * 태그를 앞에서부터 시도해 **값이 오는 첫 태그**를 쓴다. 회사마다 쓰는 태그가
 * 다르기 때문이다. 어느 태그를 썼는지는 그대로 올려보낸다.
 */
export async function fetchLine(
  cfg: SecConfig,
  cik: string,
  def: FinancialLineDef,
  max: number,
): Promise<{ line: FinancialLine; entityName: string | null }> {
  const base = { id: def.id, label: def.label, hint: def.hint, unit: def.unit, kind: def.kind };
  let lastError: string | null = null;

  for (const tag of def.tags) {
    let got: { entityName: string | null; facts: unknown[] } | null = null;
    try {
      got = await fetchConcept(cfg, cik, tag);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      continue;
    }
    if (!got) continue;

    const qs = def.kind === 'instant' ? [] : (quarterly(got.facts) as FinancialPoint[]);
    // 시점 값(재무상태표)은 '연간' 칸에 분기말 잔액을 그대로 놓는다 —
    // 기간이 없는 값이라 분기/연간으로 나눌 수 있는 성질이 아니다.
    const as = def.kind === 'instant' ? (instant(got.facts) as FinancialPoint[]) : (annual(got.facts) as FinancialPoint[]);
    if (qs.length === 0 && as.length === 0) continue;

    return {
      entityName: got.entityName,
      line: { ...base, tag, quarterly: qs.slice(-max), annual: as.slice(-max) },
    };
  }

  return {
    entityName: null,
    line: {
      ...base,
      tag: null,
      quarterly: [],
      annual: [],
      unavailableReason:
        lastError ??
        `이 회사의 공시에서 ${def.label} 에 해당하는 항목을 찾지 못했습니다 ` +
          `(찾아본 태그: ${def.tags.join(', ')}).`,
    },
  };
}

/** 한 회사의 모든 줄. 줄 하나가 비어도 나머지는 그대로 나온다. */
export async function fetchFundamentals(
  cfg: SecConfig,
  cik: string,
  max: number,
): Promise<{ lines: FinancialLine[]; entityName: string | null }> {
  const lines: FinancialLine[] = [];
  let entityName: string | null = null;
  for (const def of FINANCIAL_LINES) {
    const got = await fetchLine(cfg, cik, def, max);
    if (!entityName && got.entityName) entityName = got.entityName;
    lines.push(got.line);
  }
  return { lines, entityName };
}

export const SEC_SOURCE = {
  name: 'SEC EDGAR (미국 증권거래위원회)',
  url: 'https://www.sec.gov/edgar',
  delayMinutes: 0,
  terms: '무료 공개 공시(미국 연방정부 저작물). 분기·연간 보고서라 실시간이 아니며, 수정 공시가 나오면 값이 바뀝니다.',
} as const;
