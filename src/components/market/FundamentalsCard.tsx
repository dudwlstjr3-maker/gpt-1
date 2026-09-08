'use client';

/**
 * 재무제표 — SEC 공시로 채운 회사 쪽 화면.
 *
 * 왜 있나
 *   이 앱은 오랫동안 종목의 **가격**만 알았다. 가격만으로는 "왜 이 값인가" 를
 *   물을 수 없다. 매출이 늘고 있는지, 이익률이 유지되는지, 지금 주가가 이익의
 *   몇 배인지는 다른 자료이고, 그게 여기 있다.
 *
 * 무엇을 먼저 보여주나
 *   숫자를 늘어놓는 대신 **판단 재료 세 칸**을 맨 위에 둔다 —
 *   PER · 매출이 전년 동기 대비 얼마나 늘었나 · 영업이익률이 몇 %인가.
 *   그 아래에 항목별 막대와 표를 둔다. 표는 접어 두되 지우지 않는다.
 *
 * 지키는 것
 *   · 값이 없으면 0 으로 채우지 않고 왜 없는지 적는다.
 *   · 방향은 색이 아니라 기호(▲▼＝)와 글자로 먼저 말한다.
 *   · 어느 XBRL 태그를 썼는지, 어느 보고서에서 왔는지 밝힌다 — 회사마다 태그가
 *     달라서, 밝히지 않으면 서로 다른 것을 견주고 있는지 알 수 없다.
 *   · 4분기가 비는 회사가 있는데, 연간에서 빼서 채우지 않는다.
 */

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/Controls';
import { Notice } from '@/components/ui/States';
import { formatCompactEn, formatNumber, formatSigned, NO_VALUE } from '@/lib/format';
import { PERIOD_KEYS, PERIOD_LABEL, type PeriodKey } from '@/lib/companyCatalog';
import { ratio, trendWord, yoy } from '@/lib/fundamentals.mjs';
import type { FinancialLine, FinancialPoint, Fundamentals } from '@/types';

/** 값 하나를 사람이 읽는 문자열로. 주당 값은 달러, 나머지는 큰 수 표기. */
function fmt(v: number | null | undefined, unit: FinancialLine['unit']): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NO_VALUE;
  return unit === 'usd_per_share' ? `${formatNumber(v, 2)}$` : `${formatCompactEn(v, 2)}$`;
}

/** 기간 하나의 이름 — 2026-03-31 → 2026 1분기 끝 */
function periodLabel(p: FinancialPoint, period: PeriodKey): string {
  if (period === 'annual') return `${p.end.slice(0, 4)}년`;
  const m = Number(p.end.slice(5, 7));
  return `${p.end.slice(0, 4)}·${Math.min(4, Math.max(1, Math.ceil(m / 3)))}Q`;
}

const BAR_H = 56;
/** 한 칸이 며칠인가 — 막대를 날짜 자리에 놓기 위한 눈금 */
const STEP_DAYS: Record<PeriodKey, number> = { quarterly: 91, annual: 365 };

/**
 * 기간별 막대.
 *
 * 선이 아니라 막대인 이유
 *   분기 실적은 이어지는 흐름이 아니라 **기간마다 끊긴 값**이다. 선으로 이으면
 *   분기 사이에도 값이 있는 것처럼 읽힌다.
 *
 * 막대를 순서가 아니라 **날짜 자리**에 놓는 이유
 *   4분기를 공시하지 않는 회사가 있다. 순서대로 나란히 붙여 그리면 빠진 분기가
 *   안 보이고, 아홉 개의 막대가 아홉 분기 연속인 것처럼 읽힌다. 날짜 자리에 놓으면
 *   빠진 자리가 빈칸으로 남는다 — 빈 것은 비어 보여야 한다.
 *
 * 0 선을 늘 그린다. 적자 분기가 있으면 막대가 0 아래로 내려가야 하기 때문이다.
 */
function PeriodBars({ points, unit, period }: { points: FinancialPoint[]; unit: FinancialLine['unit']; period: PeriodKey }) {
  const vals = points.map((p) => p.value);
  const hi = Math.max(0, ...vals);
  const lo = Math.min(0, ...vals);
  const span = hi - lo || 1;
  const zero = ((hi - 0) / span) * BAR_H;

  const step = STEP_DAYS[period] * 86400_000;
  const t0 = Date.parse(`${points[0].end}T00:00:00Z`);
  const tN = Date.parse(`${points[points.length - 1].end}T00:00:00Z`);
  const slots = Math.max(1, Math.round((tN - t0) / step) + 1);
  const w = 100 / slots;
  const slotOf = (p: FinancialPoint) => Math.round((Date.parse(`${p.end}T00:00:00Z`) - t0) / step);
  const gaps = slots - points.length;

  return (
    <div className="mt-2">
      <svg viewBox={`0 0 100 ${BAR_H}`} preserveAspectRatio="none" className="block h-[56px] w-full" aria-hidden="true">
        {points.map((p, i) => {
          const y = ((hi - p.value) / span) * BAR_H;
          const top = Math.min(y, zero);
          const h = Math.max(0.8, Math.abs(zero - y));
          const last = i === points.length - 1;
          return (
            <rect
              key={p.end}
              x={slotOf(p) * w + w * 0.18}
              y={top}
              width={w * 0.64}
              height={h}
              fill={p.value < 0 ? 'var(--danger)' : 'var(--accent)'}
              /* 제일 최근 기간만 진하게 — 어디가 지금인지 눈으로 찾게 */
              opacity={last ? 0.95 : 0.42}
            />
          );
        })}
        <line x1="0" x2="100" y1={zero} y2={zero} stroke="var(--border-strong)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex items-baseline justify-between gap-2 text-[11.5px] text-subtle">
        <span className="shrink-0">{periodLabel(points[0], period)}</span>
        <span className="tnum shrink-0 font-semibold text-fg">
          {periodLabel(points[points.length - 1], period)} {fmt(points[points.length - 1].value, unit)}
        </span>
      </div>
      {gaps > 0 ? (
        <p className="mt-1 text-[11.5px] leading-relaxed break-keep text-subtle">
          가운데 빈 자리 {gaps}칸은 회사가 그 기간을 공시하지 않았다는 뜻입니다. 앞뒤 값으로 메우지 않습니다.
        </p>
      ) : null}
    </div>
  );
}

/** 항목 한 줄 */
function LineBlock({ line, period }: { line: FinancialLine; period: PeriodKey }) {
  /* 시점 값(재무상태표)은 '3분기 부채' 같은 게 없다 — 그 날짜의 잔액이 있을 뿐이라
     분기/연간 토글을 따르지 않고 늘 같은 것을 보여준다. */
  const isInstant = line.kind === 'instant';
  const shown: PeriodKey = isInstant ? 'quarterly' : period;
  const points = isInstant ? line.annual : period === 'quarterly' ? line.quarterly : line.annual;
  const growth = useMemo(() => yoy(points), [points]);
  const word = growth ? trendWord(growth.pct) : null;
  const last = points[points.length - 1];

  if (points.length === 0) {
    return (
      <li className="card p-3">
        <p className="text-[13px] font-semibold text-fg">{line.label}</p>
        <p className="mt-1 text-[11.5px] leading-relaxed break-keep text-subtle">
          {line.unavailableReason ??
            (period === 'quarterly'
              ? '이 회사는 이 항목을 분기로 공시하지 않습니다. 연간 탭에서 보세요.'
              : '연간 값이 오지 않았습니다.')}
        </p>
      </li>
    );
  }

  return (
    <li className="card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-fg">{line.label}</p>
          <p className="mt-1 text-[11.5px] leading-relaxed break-keep text-subtle">{line.hint}</p>
        </div>
        <p className="tnum shrink-0 text-[15px] font-bold text-fg-strong">{fmt(last.value, line.unit)}</p>
      </div>

      {word && growth ? (
        <p className="mt-2 text-[12.5px] font-semibold text-fg">
          <span aria-hidden="true">{word.glyph} </span>
          <span className="tnum">{formatSigned(growth.pct, 1)}%</span>
          <span className="ml-2 font-normal text-muted">
            {isInstant ? '1년 전 같은 시점 대비' : period === 'quarterly' ? '전년 동기 대비' : '전년 대비'} {word.label}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-[12.5px] text-subtle">
          {isInstant ? '1년 전 같은 시점' : period === 'quarterly' ? '1년 전 같은 분기' : '전년'} 값이 없어 증감을 내지
          않습니다.
        </p>
      )}

      <PeriodBars points={points} unit={line.unit} period={shown} />

      <p className="mt-2 text-[11.5px] leading-relaxed break-keep text-subtle">
        {isInstant ? '분기말 잔액 · ' : ''}
        {last.form} · {last.filed} 접수
        {line.tag ? (
          <>
            {' · '}
            <span className="break-all">태그 {line.tag}</span>
          </>
        ) : null}
      </p>
    </li>
  );
}

export function FundamentalsCard({
  fundamentals,
  unavailable,
}: {
  fundamentals?: Fundamentals;
  unavailable?: string;
}) {
  const [period, setPeriod] = useState<PeriodKey>('quarterly');

  if (!fundamentals) {
    if (!unavailable) return null;
    return (
      <section className="mt-5 px-3">
        <h2 className="mb-2 text-[16px] font-bold tracking-tight text-fg-strong">재무제표</h2>
        <div className="card p-3">
          <p className="text-[12.5px] leading-relaxed break-keep text-muted">{unavailable}</p>
        </div>
      </section>
    );
  }

  const { lines, valuation: v } = fundamentals;
  const byId = (id: string) => lines.find((l) => l.id === id);
  const revenue = byId('revenue');
  const operating = byId('operating_income');

  const points = (l?: FinancialLine) => (l ? (period === 'quarterly' ? l.quarterly : l.annual) : []);
  const revGrowth = yoy(points(revenue));
  const margins = ratio(points(operating), points(revenue)) as FinancialPoint[];
  const margin = margins.length > 0 ? margins[margins.length - 1] : null;
  const marginPrev = margins.length > 1 ? margins[margins.length - 2] : null;

  // 4분기가 빠진 회사인지 — 분기 값이 연간 × 4 보다 확연히 모자라면 그렇다
  const hasGap =
    period === 'quarterly' &&
    lines.some((l) => l.annual.length >= 2 && l.quarterly.length > 0 && l.quarterly.length < l.annual.length * 4 - 1);

  const revWord = revGrowth ? trendWord(revGrowth.pct) : null;

  return (
    <section className="mt-5 px-3">
      <div className="mb-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold tracking-tight text-fg-strong">재무제표</h2>
          <p className="mt-1 text-[11.5px] break-keep text-subtle">
            {fundamentals.entityName ?? fundamentals.ticker} · SEC 공시 · CIK {fundamentals.cik}
          </p>
        </div>
        <SegmentedControl
          label="기간"
          size="xs"
          value={period}
          onChange={setPeriod}
          options={PERIOD_KEYS.map((k) => ({ value: k, label: PERIOD_LABEL[k] }))}
        />
      </div>

      {/* 판단 재료 세 칸 — 숫자를 늘어놓기 전에 읽을 것 셋 */}
      <div className="card grid grid-cols-3 divide-x divide-border p-0">
        <div className="p-3">
          <p className="text-[11.5px] text-muted">주가수익비율</p>
          <p className="tnum mt-1 text-[16px] font-bold text-fg-strong">
            {v.per === null ? NO_VALUE : `${formatNumber(v.per, 1)}배`}
          </p>
          <p className="mt-1 text-[11.5px] text-subtle">
            {/* 값이 없을 때 기준 기간을 적으면 마치 값이 있는 것처럼 읽힌다 */}
            {v.per === null ? '내지 않음' : v.basis === 'ttm' ? '최근 4분기' : '최근 1년'}
          </p>
        </div>
        <div className="p-3">
          <p className="text-[11.5px] text-muted">매출 성장</p>
          <p className="tnum mt-1 text-[16px] font-bold text-fg-strong">
            {revGrowth ? (
              <>
                <span aria-hidden="true" className="mr-1 text-[13px]">
                  {revWord?.glyph}
                </span>
                {formatSigned(revGrowth.pct, 1)}%
              </>
            ) : (
              NO_VALUE
            )}
          </p>
          <p className="mt-1 text-[11.5px] text-subtle">
            {revGrowth ? `${period === 'quarterly' ? '전년 동기' : '전년'} 대비` : '1년 전 값 없음'}
          </p>
        </div>
        <div className="p-3">
          <p className="text-[11.5px] text-muted">영업이익률</p>
          <p className="tnum mt-1 text-[16px] font-bold text-fg-strong">
            {margin ? `${formatNumber(margin.value, 1)}%` : NO_VALUE}
          </p>
          <p className="mt-1 text-[11.5px] text-subtle">
            {margin && marginPrev
              ? `직전 ${formatNumber(marginPrev.value, 1)}%`
              : margin
                ? '직전 기간 없음'
                : '매출·영업이익이 같은 기간에 없음'}
          </p>
        </div>
      </div>

      <p className="mt-2 text-[11.5px] leading-relaxed break-keep text-subtle">
        {v.note} 영업이익률은 같은 기간의 영업이익을 매출로 나눈 값입니다. 이 숫자들은 회사가 공시한 값으로 계산한
        것이며, 앞으로의 실적을 뜻하지 않습니다.
      </p>

      {hasGap ? (
        <div className="mt-2">
          <Notice tone="neutral">{fundamentals.quarterlyGapNote}</Notice>
        </div>
      ) : null}

      <ul className="mt-3 space-y-2">
        {lines.map((l) => (
          <LineBlock key={l.id} line={l} period={period} />
        ))}
      </ul>

      <details className="mt-3">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-muted hover:text-fg">표로 보기</summary>
        <div className="scroll-x mt-2 rounded-lg border border-border">
          <table className="data-table">
            <caption className="sr-only">
              {fundamentals.ticker} {PERIOD_LABEL[period]} 재무 항목
            </caption>
            <thead>
              <tr>
                <th scope="col">항목</th>
                {(points(revenue).length > 0 ? points(revenue) : points(lines[0])).map((p) => (
                  <th key={p.end} scope="col">
                    {periodLabel(p, period)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const cols = points(revenue).length > 0 ? points(revenue) : points(lines[0]);
                const mine = new Map((l.kind === 'instant' ? l.annual : points(l)).map((p) => [p.end, p]));
                return (
                  <tr key={l.id}>
                    <th scope="row" className="font-normal">
                      {l.label}
                    </th>
                    {cols.map((c) => (
                      <td key={c.end} className="tnum">
                        {fmt(mine.get(c.end)?.value, l.unit)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed break-keep text-subtle">
          빈칸은 그 기간에 회사가 공시하지 않았다는 뜻입니다. 다른 기간 값으로 메우지 않습니다.
        </p>
      </details>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone="neutral" size="xs">
          출처 SEC EDGAR
        </Badge>
        <span className="text-[11.5px] text-subtle">
          공시는 분기·연간 단위라 실시간이 아니며, 수정 공시가 나오면 값이 바뀝니다.
        </span>
      </div>
    </section>
  );
}
