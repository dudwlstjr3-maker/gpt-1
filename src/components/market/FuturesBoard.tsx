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
 *
 * 인도월 곡선
 *   에너지 넷(원유·천연가스·난방유·휘발유)만 인도월 1~4를 함께 받는다 —
 *   EIA(미국 에너지정보청)가 NYMEX 정산가를 공개 통계로 내기 때문이다.
 *   가격 하나는 "비싸다/싸다" 밖에 못 읽지만, 곡선을 같이 놓으면 시장이 앞을
 *   어떻게 보고 있는지(콘탱고·백워데이션)가 한 줄 더 붙는다. 그 줄이 이 화면에서
 *   드물게 **판단 재료**가 되는 자리라 접어 두지 않고 그대로 편다.
 */

import { useMemo, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, EmptyState, Notice } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/Controls';
import { Sparkline } from '@/components/charts/Sparkline';
import { curveShape, contractLabel } from '@/lib/futuresCurve.mjs';
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
import type { FuturesCurvePoint, FuturesQuote } from '@/types';

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

/** 인도월 곡선 미니 그림. 네 점뿐이라 축은 두지 않고 모양만 보여준다. */
function CurveShape({ curve }: { curve: FuturesCurvePoint[] }) {
  const W = 62;
  const H = 18;
  const pts = [...curve].sort((a, b) => a.n - b.n);
  const vals = pts.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const xy = pts.map((p, i) => ({
    x: 3 + (i / Math.max(1, pts.length - 1)) * (W - 6),
    // 위가 비싼 쪽. 값 차이가 작아도 모양이 보이도록 세로를 꽉 채운다
    y: H - 4 - ((p.value - lo) / span) * (H - 8),
  }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[18px] w-[62px] shrink-0" aria-hidden="true">
      <polyline
        points={xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
        fill="none"
        stroke="var(--muted-fg)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {xy.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 2.6 : 1.8} fill="var(--muted-fg)" />
      ))}
    </svg>
  );
}

/**
 * 인도월 곡선 한 줄.
 *
 * 모양(콘탱고·백워데이션)은 **글자와 기호로** 먼저 말한다. 색은 거들 뿐이고,
 * 색만으로 뜻을 전하지 않는다.
 */
function CurveStrip({
  curve,
  precision,
  suffix,
}: {
  curve: FuturesCurvePoint[];
  precision: number;
  suffix: string;
}) {
  const read = curveShape(curve);
  if (!read) return null;
  const far = [...curve].sort((a, b) => a.n - b.n)[curve.length - 1];
  return (
    <div className="mt-2 rounded-lg bg-surface-2 px-2 py-2">
      <div className="flex items-center gap-2">
        <CurveShape curve={curve} />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-fg">
            <span aria-hidden="true">{read.glyph} </span>
            {read.label}
            <span className="tnum ml-2 font-normal text-muted">
              {formatSigned(read.spreadPct, 1)}%
            </span>
          </p>
          <p className="tnum mt-0.5 text-[11.5px] text-subtle">
            근월 {formatNumber(read.near, precision)}
            {suffix} → {contractLabel(far.n)} {formatNumber(read.far, precision)}
            {suffix}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed break-keep text-muted">{read.meaning}</p>
    </div>
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

      {/* 인도월 곡선은 줄 전체 너비를 쓴다 — 오른쪽 숫자 칸에 끼우면 세 줄로 접힌다 */}
      {!missing && row.curve && row.curve.length >= 2 ? (
        <div className="col-span-2">
          <CurveStrip curve={row.curve} precision={item.precision} suffix={item.suffix} />
        </div>
      ) : null}
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
          현물·기준 가격이며, 그 경우 <strong>대신 쓴 값</strong> 표시가 붙습니다. 에너지 넷(원유·천연가스·난방유·휘발유)은
          미국 에너지정보청(EIA)이 <strong>인도월 정산가</strong>를 공개해, 받아진 항목에는 인도월 곡선(콘탱고·백워데이션)까지
          함께 놓습니다.
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
