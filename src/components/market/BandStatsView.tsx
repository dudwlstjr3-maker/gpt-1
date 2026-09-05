'use client';

/**
 * 구간별 과거 통계.
 *
 * "이 점수 구간이던 날들 이후 대표 지수가 어떻게 움직였는가"를 그대로 집계해 보여준다.
 * 매매 신호가 아니다. 과거 표본의 분포이며, 표본이 겹쳐 통계적 독립성도 없다.
 * 그 한계를 화면에 같이 적어 둔다.
 *
 * 평균만 막대로 그리지 않고 **상자그림**을 쓰는 이유
 *   평균 하나만 그리면 구간마다 답이 정해져 있는 것처럼 읽힌다. 실제로는
 *   구간끼리 범위가 거의 포개져 있고, 그게 이 표에서 제일 중요한 사실이다.
 *   그래서 최저~최고(수염), 가운데 절반(상자), 중앙값(굵은 눈금), 평균(동그라미)을
 *   **모든 구간이 같은 눈금 위에** 놓아 겹침이 눈에 보이게 한다.
 */

import { Notice } from '@/components/ui/States';
import { useChangeColor } from './useChangeColor';
import { formatNumber, formatSigned, NO_VALUE } from '@/lib/format';
import { stageColor, stageFill } from '@/lib/scale';
import type { FngBandStat, FngBandStats } from '@/types';

/** 상자그림 한 줄의 크기 (viewBox 좌표) */
const ROW_W = 300;
const ROW_H = 18;

interface Domain {
  lo: number;
  hi: number;
}

/** 모든 구간을 같은 눈금에 놓기 위한 공통 범위. 0 은 반드시 포함한다. */
function domainOf(bands: FngBandStat[]): Domain | null {
  const lows = bands.map((b) => b.worst).filter((v): v is number => v !== null);
  const highs = bands.map((b) => b.best).filter((v): v is number => v !== null);
  if (lows.length === 0 || highs.length === 0) return null;
  const lo = Math.min(0, ...lows);
  const hi = Math.max(0, ...highs);
  const pad = Math.max(1, (hi - lo) * 0.04);
  return { lo: lo - pad, hi: hi + pad };
}

/** 눈금 자리 — 0 을 반드시 포함하고 4~6개가 되도록 성긴 간격을 고른다. */
function ticksOf(d: Domain): number[] {
  const span = d.hi - d.lo;
  const step = [5, 10, 20, 25, 50, 100].find((s) => span / s <= 6) ?? 200;
  const out: number[] = [];
  for (let v = Math.ceil(d.lo / step) * step; v <= d.hi; v += step) out.push(v);
  if (!out.includes(0) && d.lo < 0 && d.hi > 0) out.push(0);
  return out.sort((a, b) => a - b);
}

/**
 * 구간 하나의 분포.
 * 색은 공포↔탐욕 단계 색 하나만 쓴다. 이 카드 안에서 색 규칙이 둘이 되면 안 된다.
 */
function BoxRow({ b, d }: { b: FngBandStat; d: Domain }) {
  const x = (v: number) => ((v - d.lo) / (d.hi - d.lo)) * ROW_W;
  const zero = x(0);
  const mid = ROW_H / 2;

  if (b.worst === null || b.best === null || b.p25 === null || b.p75 === null || b.medianForward === null) {
    return null;
  }

  const fill = stageFill(b.stageId);
  const line = stageColor(b.stageId);
  const boxX = x(b.p25);
  const boxW = Math.max(1.5, x(b.p75) - boxX);

  return (
    <svg
      viewBox={`0 0 ${ROW_W} ${ROW_H}`}
      className="h-[18px] w-full"
      role="img"
      aria-label={`${b.stageLabel}: 가운데 절반이 ${formatSigned(b.p25, 1)}%에서 ${formatSigned(
        b.p75,
        1,
      )}%, 중앙값 ${formatSigned(b.medianForward, 1)}%, 최저 ${formatSigned(b.worst, 1)}%, 최고 ${formatSigned(
        b.best,
        1,
      )}%`}
    >
      {/* 0% 선 — 이게 없으면 상자가 플러스 쪽인지 마이너스 쪽인지 읽을 수 없다 */}
      <line x1={zero} x2={zero} y1="0" y2={ROW_H} stroke="var(--border-strong)" strokeWidth="1" />
      {/* 수염: 최저~최고 */}
      <line
        x1={x(b.worst)}
        x2={x(b.best)}
        y1={mid}
        y2={mid}
        stroke={line}
        strokeWidth="1"
        opacity="0.5"
      />
      {[b.worst, b.best].map((v, i) => (
        <line key={i} x1={x(v)} x2={x(v)} y1={mid - 3.5} y2={mid + 3.5} stroke={line} strokeWidth="1" opacity="0.6" />
      ))}
      {/* 상자: 가운데 절반 */}
      <rect
        x={boxX}
        y={mid - 5.5}
        width={boxW}
        height="11"
        rx="1.5"
        fill={fill}
        fillOpacity="0.45"
        stroke={line}
        strokeWidth="1"
      />
      {/* 중앙값 */}
      <line
        x1={x(b.medianForward)}
        x2={x(b.medianForward)}
        y1={mid - 6.5}
        y2={mid + 6.5}
        stroke={line}
        strokeWidth="2"
      />
      {/* 평균 — 중앙값과 다르면 분포가 한쪽으로 쏠렸다는 뜻이다 */}
      {b.avgForward !== null ? (
        <circle cx={x(b.avgForward)} cy={mid} r="2.4" fill="var(--surface)" stroke={line} strokeWidth="1.4" />
      ) : null}
    </svg>
  );
}

/** 모든 줄이 공유하는 가로 눈금 */
function Axis({ d }: { d: Domain }) {
  const x = (v: number) => ((v - d.lo) / (d.hi - d.lo)) * ROW_W;
  return (
    <svg viewBox={`0 0 ${ROW_W} 14`} className="h-[14px] w-full" aria-hidden="true">
      <line x1="0" x2={ROW_W} y1="1" y2="1" stroke="var(--border)" strokeWidth="1" />
      {ticksOf(d).map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1="1" y2="4" stroke={v === 0 ? 'var(--border-strong)' : 'var(--border)'} strokeWidth="1" />
          <text
            x={Math.min(ROW_W - 10, Math.max(10, x(v)))}
            y="12"
            textAnchor="middle"
            fontSize="8"
            fill={v === 0 ? 'var(--muted-fg)' : 'var(--subtle-fg)'}
          >
            {v > 0 ? `+${v}` : v}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function BandStatsView({ stats }: { stats: FngBandStats }) {
  const c = useChangeColor();
  const domain = domainOf(stats.bands);
  const months = Math.round((stats.forwardDays / 21) * 10) / 10;

  return (
    <div className="card p-3.5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-fg-strong">구간별 과거 통계</h3>
        <span className="tnum text-[11.5px] text-subtle">표본 {formatNumber(stats.totalDays, 0)}일</span>
      </div>
      <p className="mb-1.5 text-[12.5px] leading-relaxed break-keep text-muted">
        점수가 각 구간이던 날 이후{' '}
        <strong className="text-fg">
          약 {months}개월({stats.forwardDays}거래일)
        </strong>{' '}
        동안 <strong className="text-fg">{stats.benchmarkName}</strong> 이 어떻게 움직였는지 집계한 값입니다.
      </p>
      {/* 그림을 어떻게 읽는지 먼저 알려 준다. 상자그림은 설명 없이는 못 읽는다. */}
      <p className="mb-3 text-[11.5px] leading-relaxed break-keep text-subtle">
        가로선은 최저~최고, 상자는 가운데 절반, 굵은 세로선은 중앙값, 동그라미는 평균입니다. 다섯 구간이 모두 같은
        눈금 위에 있으므로 <strong className="text-muted">범위가 서로 얼마나 겹치는지</strong>를 함께 보세요.
      </p>

      <ul className="space-y-3">
        {stats.bands.map((b) => {
          const v = b.avgForward;
          return (
            <li key={b.stageId}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {/* 단계 색은 공포↔탐욕 띠와 같은 색이다. 아래 상자그림도 같은 색을 쓴다. */}
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-1.5 shrink-0 rounded-sm"
                    style={{
                      background: stageFill(b.stageId),
                      boxShadow: `0 0 0 1px color-mix(in srgb, ${stageColor(b.stageId)} 45%, transparent)`,
                    }}
                  />
                  <span className="truncate text-[12.5px] text-fg">{b.stageLabel}</span>
                  <span className="tnum shrink-0 text-[11.5px] text-subtle">{b.sampleDays}일</span>
                </span>
                <span className="tnum shrink-0 text-[12.5px] font-semibold" style={{ color: c.color(v) }}>
                  {v === null ? '표본 부족' : `평균 ${formatSigned(v, 2)}%`}
                </span>
              </div>

              {v !== null && domain ? (
                <>
                  <BoxRow b={b} d={domain} />
                  <p className="tnum mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-subtle">
                    <span>중앙값 {formatSigned(b.medianForward, 2)}%</span>
                    <span>플러스 비율 {formatNumber(b.positiveShare, 0)}%</span>
                    <span>
                      최저 {formatSigned(b.worst, 1)}% · 최고 {formatSigned(b.best, 1)}%
                    </span>
                  </p>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>

      {domain ? (
        <div className="mt-1.5">
          <Axis d={domain} />
          <p className="mt-0.5 text-center text-[10.5px] text-subtle">
            이후 약 {months}개월 수익률 (%)
          </p>
        </div>
      ) : null}

      {/* 표 대안 */}
      <details className="mt-3">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-muted hover:text-fg">표로 보기</summary>
        <div className="scroll-x mt-2 rounded-lg border border-border">
          <table className="data-table">
            <caption className="sr-only">구간별 이후 {stats.forwardDays}거래일 수익률 통계</caption>
            <thead>
              <tr>
                <th scope="col">구간</th>
                <th scope="col">표본</th>
                <th scope="col">평균</th>
                <th scope="col">중앙값</th>
                <th scope="col">가운데 절반</th>
                <th scope="col">플러스</th>
              </tr>
            </thead>
            <tbody>
              {stats.bands.map((b) => (
                <tr key={b.stageId}>
                  <th scope="row" className="font-normal">
                    {b.stageLabel}
                  </th>
                  <td className="tnum">{b.sampleDays}일</td>
                  <td className="tnum">{b.avgForward === null ? NO_VALUE : `${formatSigned(b.avgForward, 2)}%`}</td>
                  <td className="tnum">{b.medianForward === null ? NO_VALUE : `${formatSigned(b.medianForward, 2)}%`}</td>
                  <td className="tnum">
                    {b.p25 === null || b.p75 === null
                      ? NO_VALUE
                      : `${formatSigned(b.p25, 1)}% ~ ${formatSigned(b.p75, 1)}%`}
                  </td>
                  <td className="tnum">{b.positiveShare === null ? NO_VALUE : `${formatNumber(b.positiveShare, 0)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="mt-3">
        <Notice tone="warn">
          {stats.caveat} 지나간 분포일 뿐이라, 다음에도 같으리라는 보장은 없습니다.
        </Notice>
      </div>
    </div>
  );
}
