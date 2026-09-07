'use client';

/**
 * 선물 시장 판.
 *
 * 무엇을 보여주나
 *   지수·에너지·금속·농산물·통화·금리·크립토를 한 화면에 놓고, 고른 기간의
 *   등락률을 **가로 막대**로 함께 그린다. 숫자만 늘어놓으면 마흔 개 중 무엇이
 *   크게 움직였는지 눈으로 못 찾는다. 막대는 그 하나를 위해 있다.
 *
 * 막대를 어떻게 그리나
 *   0 을 가운데 두고 좌우로 벌어지는 막대다(발산형). 오르면 오른쪽, 내리면 왼쪽.
 *   길이는 **묶음 안에서 제일 크게 움직인 값**을 기준으로 잡는다 — 전체 기준으로
 *   잡으면 크립토가 하루에 5% 움직이는 통에 통화(0.2%)는 선 하나로 뭉갠다.
 *   기준이 묶음마다 다르므로 그 사실을 묶음 머리에 적는다.
 *
 * 값이 없는 항목을 지우지 않는 이유
 *   지수·금속·농산물 선물은 거래소가 파는 시세다. 조용히 빼면 목록이 왜 짧은지
 *   알 수 없다. 자리를 두고 **왜 비었는지**를 적는다.
 */

import { useMemo, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, EmptyState, Notice } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/Controls';
import { Sparkline } from '@/components/charts/Sparkline';
import { useChangeColor } from './useChangeColor';
import { formatNumber, formatSigned, NO_VALUE } from '@/lib/format';
import {
  FUTURES_LOOKBACK,
  FUTURES_RANGES,
  FUTURES_RANGE_LABEL,
  changeOver,
  groupedFutures,
  type FuturesRange,
} from '@/lib/futuresCatalog';
import type { FuturesQuote } from '@/types';

/** 막대 한 줄의 크기 (viewBox 좌표) */
const BAR_W = 200;
const BAR_H = 14;

/**
 * 0 을 가운데 둔 발산형 막대.
 * 색은 등락 색을 그대로 쓴다 — 이 화면 안에서 색 규칙이 둘이 되면 안 된다.
 */
function ChangeBar({ pct, max, color }: { pct: number; max: number; color: string }) {
  const half = BAR_W / 2;
  const w = max > 0 ? Math.min(half, (Math.abs(pct) / max) * half) : 0;
  return (
    <svg viewBox={`0 0 ${BAR_W} ${BAR_H}`} className="h-[14px] w-full" aria-hidden="true">
      {/* 0 선 — 이게 없으면 막대가 어느 쪽인지 읽을 수 없다 */}
      <line x1={half} x2={half} y1="0" y2={BAR_H} stroke="var(--border-strong)" strokeWidth="1" />
      <rect
        x={pct >= 0 ? half : half - w}
        y={BAR_H / 2 - 4}
        width={Math.max(1, w)}
        height="8"
        rx="1.5"
        fill={color}
        opacity="0.85"
      />
    </svg>
  );
}

function Row({
  row,
  item,
  max,
  pct,
}: {
  row: FuturesQuote;
  item: { name: string; symbol: string; precision: number; suffix: string };
  max: number;
  pct: number | null;
}) {
  const c = useChangeColor();
  const missing = row.last === null;

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2">
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[13px] font-semibold text-fg">{item.name}</span>
          <span className="shrink-0 text-[11.5px] text-subtle">{item.symbol}</span>
        </div>
        {missing ? (
          /* 사유는 묶음 머리에 한 번만 적는다 — 줄마다 되풀이하면 같은 문장이 네 번
             쌓여서 정작 값이 있는 줄이 묻힌다. 줄에는 짧은 표시만 남긴다. */
          <p className="mt-1 text-[11.5px] text-subtle">값 없음</p>
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <span className="w-[92px] shrink-0">
              <ChangeBar pct={pct ?? 0} max={max} color={c.color(pct)} />
            </span>
            {row.spark.length > 1 ? (
              <Sparkline points={row.spark} width={56} height={16} color={c.color(pct)} ariaLabel={`${item.name} 추이`} />
            ) : null}
            {row.proxyNote ? (
              <Badge tone="warn" size="2xs" title={row.proxyNote}>
                대신 쓴 값
              </Badge>
            ) : null}
          </div>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p className="tnum text-[13px] font-bold text-fg-strong">
          {missing ? NO_VALUE : `${formatNumber(row.last, item.precision)}${item.suffix}`}
        </p>
        <p className="tnum mt-1 text-[12.5px] font-semibold" style={{ color: c.color(pct) }}>
          {pct === null ? NO_VALUE : `${formatSigned(pct, 2)}%`}
        </p>
      </div>
    </li>
  );
}

export function FuturesBoardView() {
  const { snapshot, refresh } = useData();
  const [range, setRange] = useState<FuturesRange>('1D');
  const section = snapshot?.sections.futures ?? null;

  const groups = useMemo(() => groupedFutures(section?.data?.rows ?? []), [section?.data?.rows]);
  const back = FUTURES_LOOKBACK[range];

  return (
    <>
      <div className="px-3">
        <Notice tone="neutral">
          지수·금속·농산물 <strong>선물 시세는 거래소(CME·ICE)가 파는 데이터</strong>라 무료로 재배포할 수 있는
          소스가 없습니다. 그런 항목은 값을 비우고 사유를 적어 두었습니다. 채워진 값 중 상당수는 선물 계약이 아니라
          현물·기준 가격이며, 그 경우 <strong>대신 쓴 값</strong> 표시가 붙습니다.
        </Notice>
      </div>

      <div className="mt-2 px-3">
        <SegmentedControl
          label="기간"
          size="sm"
          full
          value={range}
          onChange={setRange}
          options={FUTURES_RANGES.map((r) => ({ value: r, label: FUTURES_RANGE_LABEL[r] }))}
        />
      </div>

      <div className="mt-3 px-3">
        <SectionGate
          section={section}
          onRetry={refresh}
          loading={
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <SkeletonCard key={i} height={120} lines={4} />
              ))}
            </div>
          }
          empty={<EmptyState title="선물 값을 받지 못했습니다" />}
        >
          {(board) =>
            groups.length === 0 ? (
              <EmptyState title="표시할 항목이 없습니다" />
            ) : (
              <div className="space-y-5">
                {groups.map(({ group, items }) => {
                  // 막대 길이의 기준은 묶음 안에서 제일 크게 움직인 값이다
                  // 기간은 화면에서 고르고, 계산도 화면이 한다 — 단추가 즉시 반응한다
                  const withPct = items.map((r) => ({ r, pct: changeOver(r.spark, back)?.pct ?? null }));
                  const max = Math.max(
                    0.01,
                    ...withPct.map((x) => Math.abs(x.pct ?? 0)).filter((v) => Number.isFinite(v)),
                  );
                  const shown = items.filter((r) => r.last !== null).length;
                  // 같은 사유가 여러 줄에 걸치면 묶음 머리에 한 번만 적는다
                  const reasons = [...new Set(items.filter((r) => r.last === null).map((r) => r.unavailableReason))]
                    .filter((x): x is string => Boolean(x));
                  return (
                    <section key={group.id} aria-labelledby={`fut-${group.id}`}>
                      <div className="mb-2">
                        <h2 id={`fut-${group.id}`} className="text-[12.5px] font-bold text-muted">
                          {group.label}
                          <span className="tnum ml-2 font-normal text-subtle">
                            {shown}/{items.length}
                          </span>
                        </h2>
                        <p className="mt-1 text-[11.5px] leading-relaxed break-keep text-subtle">
                          {group.note} 막대 길이는 이 묶음에서 제일 크게 움직인 값(
                          <span className="tnum">{formatNumber(max, 2)}%</span>) 기준입니다 — 묶음끼리는 길이를 견주지
                          마세요.
                        </p>
                        {reasons.map((r) => (
                          <p key={r} className="mt-1 text-[11.5px] leading-relaxed break-keep text-subtle">
                            <span aria-hidden="true">※ </span>
                            {r}
                          </p>
                        ))}
                      </div>
                      <ul className="card divide-y divide-border p-3">
                        {withPct.map(({ r, pct }) => (
                          <Row key={r.id} row={r} item={r.item} max={max} pct={pct} />
                        ))}
                      </ul>
                    </section>
                  );
                })}

                <p className="text-[11.5px] leading-relaxed break-keep text-subtle">
                  기준 기간 {FUTURES_RANGE_LABEL[range]} · 값을 채운 항목 {board.availableCount}/{board.totalCount}.
                  등락률은 고른 기간의 처음과 마지막을 견준 값이며, 장중 고가·저가는 반영하지 않습니다.
                </p>
              </div>
            )
          }
        </SectionGate>
      </div>
    </>
  );
}
