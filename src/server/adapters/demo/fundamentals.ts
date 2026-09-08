/**
 * DEMO 재무제표.
 *
 * 실제 공시가 아니다. 화면과 계산 경로를 확인하기 위한 고정 샘플이며, 같은 날에는
 * 언제 열어도 같은 값이 나온다 (회사 id 로 seed 를 고정한다).
 *
 * 일부러 재현해 두는 것들 — 이게 없으면 화면이 진짜 공시를 만났을 때 처음 터진다
 *   ① 4분기가 빈다. 실제로 10-K 만 내고 4분기를 따로 안 담는 회사가 있고,
 *      그때 화면이 "연간 탭을 보라" 고 안내하는지 여기서 확인한다.
 *   ② 회사마다 이익률·성장률의 방향이 다르다 (성장·정체·적자).
 *      적자 회사는 PER 이 안 나오는데, 그 자리를 비우고 이유를 적는지 본다.
 *   ③ 줄 하나가 통째로 빈다 (그 태그를 안 쓰는 회사).
 */

import { mulberry32, hashSeed } from '@/lib/rng';
import { COMPANY_BY_ASSET, FINANCIAL_LINES, MAX_PERIODS } from '@/lib/companyCatalog';
import { valuation } from '@/lib/fundamentals.mjs';
import { SeriesUnavailableError } from '@/server/http';
import type { AdapterContext } from '@/server/adapters/types';
import type { FinancialLine, FinancialPoint, Fundamentals, Meta } from '@/types';

/** 회사마다의 성격. 실제 회사의 실적이 아니다. */
const SHAPE: Record<
  string,
  { revenue: number; margin: number; growth: number; shares: number; missingQ4: boolean; skip?: string[] }
> = {
  //            분기 매출(달러)   영업이익률  분기 성장률  주식 수(억주)  4분기 빔
  nvda: { revenue: 3.5e10, margin: 0.62, growth: 0.09, shares: 2.45e10, missingQ4: false },
  aapl: { revenue: 9.5e10, margin: 0.31, growth: 0.01, shares: 1.5e10, missingQ4: true },
  msft: { revenue: 6.5e10, margin: 0.45, growth: 0.04, shares: 7.4e9, missingQ4: false },
  amzn: { revenue: 1.6e11, margin: 0.11, growth: 0.03, shares: 1.07e10, missingQ4: false, skip: ['liabilities'] },
  // 적자 회사 — PER 이 안 나오는 자리를 확인하기 위해 일부러 둔다
  tsla: { revenue: 2.5e10, margin: -0.03, growth: -0.02, shares: 3.2e9, missingQ4: false },
};

const QUARTERS = MAX_PERIODS;

function ymd(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/** 분기 끝 날짜들 — 최근 것부터 91일 간격으로 거슬러 올라간다 */
function quarterEnds(now: Date, n: number): number[] {
  const out: number[] = [];
  // 가장 최근 분기말은 공시 시차를 감안해 45일쯤 전으로 둔다
  let t = now.getTime() - 45 * 86400_000;
  for (let i = 0; i < n; i += 1) {
    out.unshift(t);
    t -= 91 * 86400_000;
  }
  return out;
}

function point(startT: number, endT: number, value: number, form: string, i: number): FinancialPoint {
  return {
    start: ymd(startT),
    end: ymd(endT),
    value: Number(value.toFixed(2)),
    form,
    // 보고서는 분기말에서 30일쯤 뒤에 접수된다
    filed: ymd(endT + 30 * 86400_000),
    fy: new Date(endT).getUTCFullYear(),
    fp: form === '10-K' ? 'FY' : `Q${(i % 4) + 1}`,
  };
}

export function buildFundamentals(
  assetId: string,
  price: number | null,
  ctx: AdapterContext,
  meta: Meta,
): Fundamentals {
  const company = COMPANY_BY_ASSET.get(assetId);
  const shape = SHAPE[assetId];
  if (!company || !shape) {
    throw new SeriesUnavailableError(
      'SEC 공시가 있는 미국 상장사만 재무제표를 보여줍니다. 지수·원자재·환율·코인에는 공시가 없습니다.',
    );
  }

  const day = Math.floor(ctx.now.getTime() / 86400_000);
  const rnd = mulberry32(hashSeed(`fund:${assetId}:${day}`));
  const ends = quarterEnds(ctx.now, QUARTERS);
  // partial 시나리오에서는 줄 하나가 비는 상황을 흉내 낸다
  const broken = new Set(ctx.scenario === 'partial' ? ['operating_cash_flow'] : []);

  /* 분기 매출을 먼저 만들고, 나머지는 거기서 파생시킨다 —
     그래야 이익률과 성장률이 서로 앞뒤가 맞는다. */
  const revQ: number[] = [];
  let rev = shape.revenue / (1 + shape.growth) ** QUARTERS;
  for (let i = 0; i < QUARTERS; i += 1) {
    // 계절성 — 12월 분기가 크다. 실제 회사가 그렇고, 그래야 전년 동기 비교가 뜻을 갖는다
    const season = 1 + 0.12 * Math.cos(((i % 4) / 4) * 2 * Math.PI);
    rev = rev * (1 + shape.growth) * (1 + (rnd() - 0.5) * 0.05);
    revQ.push(rev * season);
  }
  const marginQ = revQ.map(() => shape.margin * (1 + (rnd() - 0.5) * 0.14));

  const lines: FinancialLine[] = FINANCIAL_LINES.map((def) => {
    const base = { id: def.id, label: def.label, hint: def.hint, unit: def.unit, kind: def.kind };
    if (shape.skip?.includes(def.id) || broken.has(def.id)) {
      return {
        ...base,
        tag: null,
        quarterly: [],
        annual: [],
        unavailableReason: broken.has(def.id)
          ? '이번 갱신에서 값을 받지 못했습니다. 빈 값을 임의로 채우지 않습니다.'
          : `이 회사의 공시에서 ${def.label} 에 해당하는 항목을 찾지 못했습니다.`,
      };
    }

    const valueAt = (i: number): number => {
      const r = revQ[i];
      const op = r * marginQ[i];
      switch (def.id) {
        case 'revenue': return r;
        case 'operating_income': return op;
        case 'net_income': return op * 0.82;
        case 'eps': return (op * 0.82) / shape.shares;
        case 'operating_cash_flow': return op * 1.15;
        case 'liabilities': return r * 3.1;
        case 'equity': return r * 2.4;
        default: return r;
      }
    };

    /* 시점 값(재무상태표)은 기간이 없다 — 분기말 잔액을 '연간' 칸에 그대로 놓는다 */
    if (def.kind === 'instant') {
      const pts = ends.map((endT, i) => {
        const p = point(endT, endT, valueAt(i), '10-Q', i);
        delete (p as { start?: string }).start;
        return p;
      });
      return { ...base, tag: def.tags[0], quarterly: [], annual: pts };
    }

    const qs: FinancialPoint[] = [];
    for (let i = 0; i < QUARTERS; i += 1) {
      // ① 4분기가 빈다 — 10-K 에만 담기고 분기로는 안 나오는 회사를 재현한다
      if (shape.missingQ4 && i % 4 === 3) continue;
      qs.push(point(ends[i] - 91 * 86400_000, ends[i], valueAt(i), '10-Q', i));
    }

    /* 연간은 네 분기를 더한 값이 아니라 **회사가 연간으로 보고한 값**의 자리다.
       DEMO 에서는 같은 규칙으로 만들되, 분기에서 더해 만들지 않는다는 점을 지킨다. */
    const as: FinancialPoint[] = [];
    for (let k = 3; k < QUARTERS; k += 4) {
      const sum = [0, 1, 2, 3].reduce((a, j) => a + valueAt(k - j), 0);
      // 주당 값은 더하는 게 맞지만 잔액성 값은 아니다 — 여기 오는 건 기간 값뿐이다
      as.push(point(ends[k] - 364 * 86400_000, ends[k], sum, '10-K', 3));
    }

    return { ...base, tag: def.tags[0], quarterly: qs.slice(-MAX_PERIODS), annual: as.slice(-MAX_PERIODS) };
  });

  const eps = lines.find((l) => l.id === 'eps');
  return {
    cik: company.cik,
    ticker: company.ticker,
    entityName: `${company.name} (DEMO 샘플)`,
    lines,
    valuation: valuation(price, eps?.quarterly ?? [], eps?.annual ?? []),
    quarterlyGapNote:
      '4분기 값은 연간보고서(10-K)에만 담기고 분기로는 공시되지 않는 회사가 있습니다. ' +
      '그런 분기는 표에서 비워 둡니다 — 연간에서 1~3분기를 빼서 채우면 회사가 보고한 값이 아니게 됩니다. ' +
      '그 회사는 연간 탭에서 보세요.',
    meta,
  };
}
