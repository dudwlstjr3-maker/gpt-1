'use client';

/**
 * 구간별 과거 통계.
 *
 * "이 점수 구간이던 날들 이후 대표 지수가 어떻게 움직였는가"를 그대로 집계해 보여준다.
 * 매매 신호가 아니다. 과거 표본의 분포이며, 표본이 겹쳐 통계적 독립성도 없다.
 * 그 한계를 화면에 같이 적어 둔다.
 */

import { Notice } from '@/components/ui/States';
import { useChangeColor } from './useChangeColor';
import { formatNumber, formatSigned, NO_VALUE } from '@/lib/format';
import { stageColor, stageFill } from '@/lib/scale';
import type { FngBandStats } from '@/types';

export function BandStatsView({ stats }: { stats: FngBandStats }) {
  const c = useChangeColor();
  const withSamples = stats.bands.filter((b) => b.avgForward !== null);
  const maxAbs = Math.max(0.01, ...withSamples.map((b) => Math.abs(b.avgForward as number)));

  return (
    <div className="card p-3.5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-fg-strong">구간별 과거 통계</h3>
        <span className="tnum text-[10px] text-subtle">표본 {formatNumber(stats.totalDays, 0)}일</span>
      </div>
      <p className="mb-1.5 text-[11px] leading-relaxed break-keep text-muted">
        점수가 각 구간이던 날 이후 <strong className="text-fg">{stats.forwardDays}거래일</strong> 동안{' '}
        <strong className="text-fg">{stats.benchmarkName}</strong> 이 어떻게 움직였는지 집계한 값입니다.
      </p>
      {/* 화면 안에 색이 두 종류 섞여 있다. 무엇이 무슨 색인지 먼저 알려 준다. */}
      <p className="mb-3 text-[10px] leading-relaxed break-keep text-subtle">
        왼쪽 네모는 공포↔탐욕 구간 색, 아래 막대는 오르내림 색입니다. 신호등(위험 지표)과는 다른 색 규칙입니다.
      </p>

      <ul className="space-y-2.5">
        {stats.bands.map((b) => {
          const v = b.avgForward;
          const pct = v === null ? 0 : (Math.abs(v) / maxAbs) * 50;
          const positive = (v ?? 0) > 0;
          return (
            <li key={b.stageId}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {/* 단계 색은 공포↔탐욕 띠와 같은 색이다. 아래 막대의 색(등락)과 헷갈리지 않도록
                      점이 아니라 띠 조각 모양으로 그려 구분한다. */}
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-1.5 shrink-0 rounded-sm"
                    style={{
                      background: stageFill(b.stageId),
                      boxShadow: `0 0 0 1px color-mix(in srgb, ${stageColor(b.stageId)} 45%, transparent)`,
                    }}
                  />
                  <span className="truncate text-[11.5px] text-fg">{b.stageLabel}</span>
                  <span className="tnum shrink-0 text-[10px] text-subtle">{b.sampleDays}일</span>
                </span>
                <span className="tnum shrink-0 text-[11.5px] font-semibold" style={{ color: c.color(v) }}>
                  {v === null ? '표본 부족' : `평균 ${formatSigned(v, 2)}%`}
                </span>
              </div>

              {v !== null ? (
                <>
                  <div className="relative h-2 rounded-full" style={{ background: 'var(--surface-3)' }}>
                    <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px" style={{ background: 'var(--border-strong)' }} />
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 rounded-full"
                      style={{ background: c.color(v), left: positive ? '50%' : `${50 - pct}%`, width: `${pct}%` }}
                    />
                  </div>
                  <p className="tnum mt-1 flex flex-wrap gap-x-3 text-[10px] text-subtle">
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

      {/* 표 대안 */}
      <details className="mt-3">
        <summary className="cursor-pointer text-[11px] font-semibold text-muted hover:text-fg">표로 보기</summary>
        <div className="scroll-x mt-2 rounded-lg border border-border">
          <table className="data-table">
            <caption className="sr-only">구간별 이후 {stats.forwardDays}거래일 수익률 통계</caption>
            <thead>
              <tr>
                <th scope="col">구간</th>
                <th scope="col">표본</th>
                <th scope="col">평균</th>
                <th scope="col">중앙값</th>
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
