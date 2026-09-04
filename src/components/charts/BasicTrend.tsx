'use client';

/**
 * 생활 경제 지수의 지나온 값.
 *
 * 이 화면의 숫자는 1년에 한두 번만 바뀐다. 그래서 값 하나만 보면 그게 높은 건지
 * 낮은 건지 알 수가 없다 — "1인당 GDP 36,855달러" 는 오른 것인가 내린 것인가?
 * 지나온 선을 옆에 두면 그 물음이 한눈에 풀린다.
 *
 * 그리는 규칙
 *  - 한국만 굵게, 나머지 세 나라는 옅게. 비교선은 신호등 밖의 색(--series-2)을 써서
 *    '위험 구간'으로 오해하지 않게 한다.
 *  - **나라 이름은 선 끝에 직접 붙인다.** 처음에는 아래에 범례를 두고 비교선 셋을
 *    "중국 · 일본 · 미국" 한 칸에 묶었는데, 그러면 세 선이 똑같이 생긴 채로 서로
 *    교차해서 어느 선이 어느 나라인지 알 길이 없었다. 견주려고 그린 그림이 견줄 수
 *    없게 되는 셈이다. 이름을 끝점 옆에 붙이면 눈이 선을 따라가다 그대로 읽는다.
 *  - 왼쪽에 구간의 최댓값·최솟값을 적는다. 눈금이 없으면 선은 모양일 뿐이고,
 *    "미국 선이 위에 있다" 까지만 알 수 있지 얼마나 위인지는 알 수 없다.
 *  - 눈금을 두 개만 두는 것은 작은 그림에 촘촘히 넣으면 오히려 안 읽히기 때문이다.
 *  - 차트를 못 보는 사람을 위해 같은 내용을 표로도 제공한다 (이 앱의 모든 차트가 그렇다).
 *
 * 확대·축소·이동은 여기 붙이지 않는다. 104px 짜리 그림에 조작 버튼까지 넣으면
 * 정작 선 볼 자리가 없어진다. 대신 **누르면 큰 창으로 열리고**, 거기서 끌기·휠·핀치가
 * 다 된다. 큰 창은 이 앱의 상세용 차트를 그대로 쓴다.
 */

import { useId, useState } from 'react';
import { formatNumber } from '@/lib/format';
import type { SeriesPoint } from '@/types';
import { downsample, extent, linePath, linearScale } from './chartUtils';
import { ChartModal, ExpandTrigger } from './ChartModal';
import { InteractiveChart, type ChartSeries } from './InteractiveChart';

export interface TrendSeries {
  label: string;
  points: SeriesPoint[];
}

const HIGHLIGHT = '한국';

/** 눈금값 자리 · 나라 이름 자리. 카드마다 같아야 여러 장이 나란히 섰을 때 줄이 맞는다. */
const GUTTER_L = 52;
const GUTTER_R = 40;
const VIEW_W = 300;

function yearOf(t: number): number {
  return new Date(t).getUTCFullYear();
}

/**
 * 끝점 이름표는 괄호를 떼고 쓴다.
 * 비교표의 '미국 (기준)' 은 표에서는 필요한 말이지만 선 끝에 붙이면 자리를 넘겨
 * '미국 (기준' 처럼 잘린다. 어느 선인지만 알면 되는 자리라 나라 이름으로 충분하다.
 */
function shortLabel(label: string): string {
  return label.replace(/\s*[(（].*$/, '');
}

/**
 * 끝점 이름표가 서로 겹치지 않게 위아래로 밀어낸다.
 * 값이 비슷한 두 나라는 선 끝도 붙어 있어서, 그대로 두면 이름이 포개져 둘 다 못 읽는다.
 */
function spread(rows: { y: number }[], min: number, lo: number, hi: number): number[] {
  const order = rows.map((r, i) => ({ i, y: r.y })).sort((a, b) => a.y - b.y);
  const out = new Array<number>(rows.length);
  let prev = -Infinity;
  for (const o of order) {
    const y = Math.max(o.y, prev + min);
    out[o.i] = y;
    prev = y;
  }
  // 아래로 밀린 만큼 전체를 도로 올려서 그림 밖으로 나가지 않게 한다
  const over = out.length ? Math.max(...out) - hi : 0;
  if (over > 0) for (let i = 0; i < out.length; i += 1) out[i] = Math.max(lo, out[i] - over);
  return out;
}

export function BasicTrend({
  series,
  precision,
  suffix,
  height = 104,
  label,
}: {
  series: TrendSeries[];
  precision: number;
  suffix: string;
  height?: number;
  label: string;
}) {
  const id = useId();
  const [showTable, setShowTable] = useState(false);
  const [big, setBig] = useState(false);

  const clean = series
    .map((s) => ({ ...s, points: downsample(s.points.filter((p) => Number.isFinite(p.v)), 80) }))
    .filter((s) => s.points.length >= 2);

  const mine = clean.find((s) => s.label === HIGHLIGHT) ?? clean[0];
  if (!mine || mine.points.length < 2) return null;

  const all = clean.flatMap((s) => s.points);
  const [t0, t1] = extent(all.map((p) => p.t));
  const [v0, v1] = extent(all.map((p) => p.v));
  const top = 9;
  const bottom = height - 17;
  const xs = linearScale([t0, t1], [GUTTER_L, VIEW_W - GUTTER_R]);
  const ys = linearScale([v0, v1], [bottom, top]);

  const last = mine.points[mine.points.length - 1];
  const fmt = (v: number) => `${formatNumber(v, precision)}${suffix}`;

  // 선 끝의 이름표 — 값 순서는 지키되 겹치지 않을 만큼만 벌린다.
  // 눈금선 사이(top~bottom)에 가둬 두어야 아래쪽 연도 글자를 덮지 않는다.
  const ends = clean.map((s) => {
    const p = s.points[s.points.length - 1];
    return { label: s.label, x: xs(p.t), y: ys(p.v), mine: s.label === mine.label };
  });
  const endY = spread(ends, 11, top, bottom);

  /**
   * 큰 창에서 쓸 시리즈.
   *
   * 작은 그림에서는 비교 나라를 전부 같은 옅은 색으로 두고 이름을 선 끝에 붙여
   * 구분했다. 큰 창은 범례가 위에 서므로 **나라마다 색이 달라야** 범례가 일을 한다.
   * 같은 색 셋에 이름만 다르게 적어 두면 범례가 오히려 거짓말이 된다.
   */
  const COMPARE = ['var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'];
  let ci = 0;
  const bigSeries: ChartSeries[] = clean.map((s) => ({
    id: s.label,
    name: shortLabel(s.label),
    points: s.points,
    color: s.label === mine.label ? 'var(--accent)' : COMPARE[ci++ % COMPARE.length],
    axis: 'left',
    precision,
    suffix,
  }));

  return (
    <div>
      <ExpandTrigger label={label} onClick={() => setBig(true)}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-labelledby={`${id}-t`}
      >
        <title id={`${id}-t`}>
          {label} — {yearOf(t0)}년부터 {yearOf(t1)}년까지, {mine.label} 마지막 값 {fmt(last.v)}
        </title>

        {/* 위아래 눈금선. 선이 어느 높이에 있는지 재는 자다. */}
        {[
          { y: top, v: v1 },
          { y: bottom, v: v0 },
        ].map((g) => (
          <g key={g.y}>
            <line
              x1={GUTTER_L}
              x2={VIEW_W - GUTTER_R}
              y1={g.y}
              y2={g.y}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text x={GUTTER_L - 6} y={g.y + 3.2} fontSize="9" fill="var(--subtle-fg)" textAnchor="end">
              {fmt(g.v)}
            </text>
          </g>
        ))}

        {/* 0 선이 구간 안에 있으면 그어 준다. 부호가 바뀌는 지표는 그 선이 기준이 된다. */}
        {v0 < 0 && v1 > 0 ? (
          <line
            x1={GUTTER_L}
            x2={VIEW_W - GUTTER_R}
            y1={ys(0)}
            y2={ys(0)}
            stroke="var(--border-strong)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        ) : null}

        {/* 비교 나라 — 옅게 */}
        {clean
          .filter((s) => s.label !== mine.label)
          .map((s) => (
            <path
              key={s.label}
              d={linePath(s.points.map((p) => ({ x: xs(p.t), y: ys(p.v) })))}
              fill="none"
              stroke="var(--series-2)"
              strokeWidth="1.2"
              opacity="0.55"
            />
          ))}

        {/* 한국 — 굵게 */}
        <path
          d={linePath(mine.points.map((p) => ({ x: xs(p.t), y: ys(p.v) })))}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={xs(last.t)} cy={ys(last.v)} r="3" fill="var(--accent)" />

        {/* 선 끝의 나라 이름 — 범례 대신 */}
        {ends.map((e, i) => (
          <g key={e.label}>
            {Math.abs(endY[i] - e.y) > 1.5 ? (
              <line
                x1={e.x + 2}
                x2={VIEW_W - GUTTER_R + 4}
                y1={e.y}
                y2={endY[i]}
                stroke={e.mine ? 'var(--accent)' : 'var(--series-2)'}
                strokeWidth="0.8"
                opacity="0.45"
              />
            ) : null}
            <text
              x={VIEW_W - GUTTER_R + 6}
              y={endY[i] + 3.2}
              fontSize="9.5"
              fontWeight={e.mine ? 700 : 400}
              fill={e.mine ? 'var(--accent)' : 'var(--subtle-fg)'}
            >
              {shortLabel(e.label)}
            </text>
          </g>
        ))}

        {/* 양 끝 연도 */}
        <text x={GUTTER_L} y={height - 1} fontSize="9" fill="var(--subtle-fg)">
          {yearOf(t0)}
        </text>
        <text x={VIEW_W - GUTTER_R} y={height - 1} fontSize="9" fill="var(--subtle-fg)" textAnchor="end">
          {yearOf(t1)}
        </text>
      </svg>
      </ExpandTrigger>

      <ChartModal
        open={big}
        onClose={() => setBig(false)}
        title={label}
        subtitle="끌어서 이동 · 휠이나 두 손가락으로 확대·축소 · 두 번 누르면 전체로"
      >
        <InteractiveChart series={bigSeries} height={340} label={label} expandable={false} />
      </ChartModal>

      <div className="mt-0.5 text-right">
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-[10px] font-semibold text-muted hover:text-fg"
          aria-expanded={showTable}
        >
          {showTable ? '그래프로 보기' : '표로 보기'}
        </button>
      </div>

      {showTable ? (
        <div className="scroll-x mt-1.5 rounded-lg border border-border">
          <table className="data-table">
            <caption className="sr-only">{label} 연도별 값</caption>
            <thead>
              <tr>
                <th scope="col">연도</th>
                {clean.map((s) => (
                  <th key={s.label} scope="col">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* 한국 관측 연도를 기준으로 줄을 세운다 */}
              {mine.points
                .slice(-12)
                .reverse()
                .map((p) => (
                  <tr key={p.t}>
                    <th scope="row" className="tnum font-normal">
                      {yearOf(p.t)}
                    </th>
                    {clean.map((s) => {
                      const hit = s.points.find((q) => yearOf(q.t) === yearOf(p.t));
                      return (
                        <td key={s.label} className="tnum">
                          {hit ? fmt(hit.v) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
