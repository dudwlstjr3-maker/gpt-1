'use client';

/**
 * Fear & Greed 상세.
 * 점수 추이(1M/3M/1Y/3Y/10Y) · 과거 위기 시점 표식 · 대표 시장 가격과의 비교 ·
 * 구성요소 점수와 가중치 ·
 * 기여도 · 산출 방법 · 출처와 업데이트 시각 · 결측/신뢰도 설명.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSettings } from '@/components/providers/SettingsProvider';
import { Gauge, StageLegend } from '@/components/charts/Gauge';
import { InteractiveChart, type ChartMarker, type ChartSeries } from '@/components/charts/InteractiveChart';
import { ContributionBars } from '@/components/charts/ContributionBars';
import { CrisisMarkers } from '@/components/market/CrisisMarkers';
import { FngCycleView } from '@/components/market/FngCycleView';
import { BandStatsView } from '@/components/market/BandStatsView';
import { Badge, ModeBadge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/Controls';
import { ErrorState, Notice, SkeletonCard } from '@/components/ui/States';
import { formatKstFull, formatNumber, formatPercentPlain, formatSigned, NO_VALUE } from '@/lib/format';
import { confidenceGlyph, scoreColor, scoreFill } from '@/lib/scale';
import { useChangeColor } from '@/components/market/useChangeColor';
import {
  CONFIDENCE_LABEL,
  MARKET_IDS,
  MARKET_LABEL,
  type DataMode,
  type FngDetail,
  type MarketId,
} from '@/types';

type RangeKey = '1M' | '3M' | '1Y' | '3Y' | '10Y';
const RANGE_MS: Record<RangeKey, number> = {
  '1M': 31 * 86400_000,
  '3M': 92 * 86400_000,
  '1Y': 366 * 86400_000,
  '3Y': 1096 * 86400_000,
  '10Y': 3660 * 86400_000,
};

interface ApiResponse {
  mode: DataMode;
  scenario: string | null;
  detail: FngDetail;
}

function DeltaBox({ label, value }: { label: string; value: number | null }) {
  const c = useChangeColor();
  return (
    <div className="flex-1 rounded-lg bg-surface-2 px-2 py-2 text-center">
      <p className="text-[11.5px] text-muted">{label}</p>
      <p className="tnum mt-0.5 flex items-center justify-center gap-0.5 text-[13px] font-bold" style={{ color: c.color(value) }}>
        <span aria-hidden="true">{c.glyph(value)}</span>
        {value === null ? NO_VALUE : formatSigned(value, 1)}
        <span className="sr-only">{c.label(value)}</span>
      </p>
    </div>
  );
}

export default function FngDetailPage() {
  const params = useParams<{ market: string }>();
  const market = (MARKET_IDS.includes(params.market as MarketId) ? params.market : 'us') as MarketId;
  const { settings, hydrated } = useSettings();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>('3M');
  const [expanded, setExpanded] = useState<string | null>(null);
  /** 위기 목록에서 고른 시점 — 차트에서 강조한다 */
  const [focusT, setFocusT] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fng/${market}?scenario=${encodeURIComponent(settings.scenario)}`);
      const body = await res.json();
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      setData(body as ApiResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [market, settings.scenario]);

  useEffect(() => {
    if (!hydrated) return;
    void load();
  }, [hydrated, load]);

  const detail = data?.detail ?? null;

  /** 긴 구간에서만 쓰는 평활 — 하루치 점수는 진폭이 커서 10년을 그리면 형태가 안 보인다. */
  const SMOOTH_DAYS = 20;
  const smoothed = (pts: { t: number; v: number }[]) => {
    if (pts.length < SMOOTH_DAYS) return pts;
    const out: { t: number; v: number }[] = [];
    let sum = 0;
    for (let i = 0; i < pts.length; i += 1) {
      sum += pts[i].v;
      if (i >= SMOOTH_DAYS) sum -= pts[i - SMOOTH_DAYS].v;
      if (i >= SMOOTH_DAYS - 1) out.push({ t: pts[i].t, v: sum / SMOOTH_DAYS });
    }
    return out;
  };

  const chartSeries = useMemo<ChartSeries[]>(() => {
    if (!detail) return [];
    const cutoff = Date.now() - RANGE_MS[range];
    const scorePoints = detail.history
      .filter((p) => p.t >= cutoff && p.v !== null)
      .map((p) => ({ t: p.t, v: p.v as number }));
    // 3년·10년은 하루 단위로 그리면 세로줄 뭉치가 되어 흐름이 보이지 않는다
    const smooth = range === '3Y' || range === '10Y';
    const series: ChartSeries[] = [
      {
        id: 'score',
        name: smooth ? `심리 점수 (${SMOOTH_DAYS}일 평균)` : '심리 점수',
        points: smooth ? smoothed(scorePoints) : scorePoints,
        color: 'var(--accent)',
        axis: 'left',
        precision: 1,
        // 긴 구간에서 면을 채우면 급락 구간이 통짜 막대처럼 보여 선의 형태가 묻힌다
        area: !smooth,
      },
    ];
    if (detail.benchmark) {
      series.push({
        id: 'benchmark',
        name: detail.benchmark.name,
        points: detail.benchmark.series.filter((p) => p.t >= cutoff),
        color: 'var(--series-2)',
        axis: 'right',
        precision: detail.benchmark.precision,
        dashed: true,
      });
    }
    return series;
  }, [detail, range]);

  /** 보고 있는 기간 안에 들어오는 사건만 차트에 찍는다 */
  const chartMarkers = useMemo<ChartMarker[]>(() => {
    if (!detail) return [];
    const cutoff = Date.now() - RANGE_MS[range];
    return detail.events.markers
      .map((m, i) => ({ m, index: i + 1 }))
      .filter(({ m }) => m.t >= cutoff)
      .map(({ m, index }) => ({
        id: m.id,
        t: m.t,
        index,
        label: m.label,
        color: scoreFill(m.score),
      }));
  }, [detail, range]);

  if (loading && !detail) {
    return (
      <div className="space-y-3 px-3 pt-3">
        <SkeletonCard height={160} lines={2} />
        <SkeletonCard height={200} lines={1} />
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="px-3 pt-3">
        <ErrorState title="점수 상세를 불러오지 못했습니다" message={error} onRetry={load} />
        <Link href="/" className="mt-3 inline-block text-[13px] font-semibold text-accent">
          ← 홈으로
        </Link>
      </div>
    );
  }

  if (!detail || !data) return null;

  const unavailable = detail.score === null;

  return (
    <div className="pt-2 pb-4">
      <div className="flex items-center justify-between gap-2 px-3 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/" aria-label="뒤로" className="text-muted">
            ←
          </Link>
          <h1 className="truncate text-lg font-bold text-fg-strong">{MARKET_LABEL[market]} 투자심리 상세</h1>
        </div>
        <ModeBadge mode={data.mode} />
      </div>

      {/* 시장 전환 */}
      <div className="mt-2 px-3">
        <SegmentedControl
          label="시장 선택"
          full
          value={market}
          onChange={(v) => {
            window.location.href = `/fng/${v}`;
          }}
          options={MARKET_IDS.map((m) => ({ value: m, label: MARKET_LABEL[m] }))}
        />
      </div>

      {/* 요약 */}
      <section className="mt-3 px-3" aria-label="점수 요약">
        <div className="card p-4">
          <div className="flex flex-col items-center gap-2 lg:flex-row lg:items-center lg:gap-6">
            <Gauge score={detail.score} size={200} />
            <div className="w-full flex-1">
              {unavailable ? (
                <Notice tone="warn">{detail.unavailableReason}</Notice>
              ) : (
                <div className="flex gap-2">
                  <DeltaBox label="전일 대비" value={detail.deltaDay} />
                  <DeltaBox label="1주 대비" value={detail.deltaWeek} />
                  <DeltaBox label="1개월 대비" value={detail.deltaMonth} />
                </div>
              )}
              <dl className="mt-3 space-y-1 text-[13px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">신뢰도</dt>
                  <dd className="flex items-center gap-1 font-semibold text-fg">
                    <span aria-hidden="true">{confidenceGlyph(detail.confidence)}</span>
                    {CONFIDENCE_LABEL[detail.confidence]}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">데이터 충족률</dt>
                  <dd className="tnum text-fg">{formatPercentPlain(detail.coverage * 100, 0)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">신선도</dt>
                  <dd className="tnum text-fg">{formatPercentPlain(detail.freshnessScore * 100, 0)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">역사적 분포</dt>
                  <dd className="tnum text-fg">최근 {detail.lookbackDays}일</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">산식 버전</dt>
                  <dd className="tnum text-fg">{detail.formulaVersion}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="shrink-0 text-muted">산출 시각</dt>
                  <dd className="tnum text-right text-fg">{formatKstFull(detail.computedAt)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-[12.5px] break-keep text-subtle">{detail.confidenceReason}</p>
            </div>
          </div>
          <div className="mt-3 border-t border-border pt-2.5">
            <StageLegend score={detail.score} />
          </div>
        </div>
      </section>

      {/* 추이 차트 */}
      <section className="mt-4 px-3" aria-labelledby="fng-chart-title">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="fng-chart-title" className="text-base font-bold text-fg-strong">
            점수 추이
          </h2>
          <SegmentedControl
            label="기간"
            size="xs"
            value={range}
            onChange={setRange}
            options={[
              { value: '1M', label: '1개월' },
              { value: '3M', label: '3개월' },
              { value: '1Y', label: '1년' },
              { value: '3Y', label: '3년' },
              { value: '10Y', label: '10년' },
            ]}
          />
        </div>
        <div className="card p-3">
          <InteractiveChart
            series={chartSeries}
            height={240}
            label={`${MARKET_LABEL[market]} 심리 점수와 ${detail.benchmark?.name ?? '대표 지수'} 비교 (${range})`}
            emptyMessage="해당 기간에 산출된 점수가 없습니다."
            markers={chartMarkers}
            focusT={focusT}
          />
          <p className="mt-2 text-[11.5px] break-keep text-subtle">
            좌축은 0~100 심리 점수, 우축은 {detail.benchmark?.name ?? '대표 지수'} 가격입니다. 점수가 산출되지 않은 날은
            선이 이어지지 않습니다.
            {chartMarkers.length > 0
              ? ` 세로 점선은 과거 사건 ${chartMarkers.length}건이며, 번호는 아래 목록과 같습니다.`
              : ' 기간을 10년으로 바꾸면 과거 위기 시점이 표시됩니다.'}
            {range === '3Y' || range === '10Y'
              ? ` 이 구간의 선은 하루치 점수를 ${SMOOTH_DAYS}일로 평균한 값입니다. 하루 단위 점수는 진폭이 커서 몇 년을 한 화면에 그리면 흐름이 보이지 않기 때문입니다. 아래 목록의 숫자는 평균이 아니라 그날의 실제 점수입니다.`
              : ''}
          </p>
        </div>

        {/* 과거 위기 표식 */}
        <div className="mt-2.5">
          <CrisisMarkers
            events={detail.events}
            selected={focusT}
            currentScore={detail.score}
            onSelect={(t) => {
              setFocusT(t);
              // 고른 시점이 지금 기간 밖이면 10년으로 넓혀 준다
              if (t !== null && t < Date.now() - RANGE_MS[range]) setRange('10Y');
            }}
          />
        </div>
      </section>

      {/* 사이클 · 구간 통계 */}
      <section className="mt-4 px-3" aria-labelledby="fng-cycle-title">
        <h2 id="fng-cycle-title" className="mb-2 text-base font-bold text-fg-strong">
          사이클과 구간 통계
        </h2>
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          <FngCycleView cycle={detail.cycle} />
          {detail.bandStats ? (
            <BandStatsView stats={detail.bandStats} />
          ) : (
            <div className="card p-3.5">
              <h3 className="text-sm font-bold text-fg-strong">구간별 과거 통계</h3>
              <p className="mt-2 text-[12.5px] break-keep text-muted">
                통계를 낼 만큼 히스토리가 쌓이지 않았거나 비교할 대표 지수가 없습니다.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 기여도 */}
      <section className="mt-4 px-3" aria-labelledby="fng-contrib-title">
        <h2 id="fng-contrib-title" className="mb-2 text-base font-bold text-fg-strong">
          점수 상승·하락 기여도
        </h2>
        <div className="card p-3.5">
          <ContributionBars
            caption={`${MARKET_LABEL[market]} 구성요소별 전일 대비 기여도`}
            items={detail.components.map((c) => ({
              id: c.id,
              label: c.label,
              value: c.contributionDay,
            }))}
          />
          <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border pt-2.5 sm:grid-cols-2">
            <div className="rounded-lg bg-surface-2 p-2.5">
              <p className="text-[11.5px] text-muted">가장 큰 상승 요인</p>
              <p className="mt-0.5 text-[13px] font-semibold break-keep text-fg">
                {detail.topPositive?.label ?? '해당 없음'}
              </p>
              {detail.topPositive ? <p className="text-[11.5px] text-subtle">{detail.topPositive.detail}</p> : null}
            </div>
            <div className="rounded-lg bg-surface-2 p-2.5">
              <p className="text-[11.5px] text-muted">가장 큰 하락 요인</p>
              <p className="mt-0.5 text-[13px] font-semibold break-keep text-fg">
                {detail.topNegative?.label ?? '해당 없음'}
              </p>
              {detail.topNegative ? <p className="text-[11.5px] text-subtle">{detail.topNegative.detail}</p> : null}
            </div>
          </div>
        </div>
      </section>

      {/* 구성요소 */}
      <section className="mt-4 px-3" aria-labelledby="fng-comp-title">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 id="fng-comp-title" className="text-base font-bold text-fg-strong">
            구성요소와 가중치
          </h2>
          <span className="tnum text-[12.5px] text-subtle">
            합계 {formatNumber(detail.components.reduce((a, c) => a + c.weight, 0), 0)}%
          </span>
        </div>
        {/* 다른 공포·탐욕 지수를 참고해 무엇을 넣고 뺐는지 시장마다 적어 둔다.
            어느 지수의 값도 가져오지 않는다는 점을 같이 밝힌다. */}
        <div className="mb-2">
          <Notice tone="neutral">
            <strong className="font-semibold">이 목록은 이렇게 정했습니다.</strong> {detail.methodology.compositionNote}{' '}
            점수는 다른 서비스의 값을 가져오는 게 아니라 같은 성격의 데이터를 받아 이 앱이 직접 계산합니다(역사적 분포
            백분위 → 가중평균). 그래서 같은 날 두 숫자가 다를 수 있고, 그게 정상입니다.
          </Notice>
        </div>

        <div className="card overflow-hidden">
          <ul className="divide-y divide-[var(--border)]">
            {detail.components.map((c) => {
              const open = expanded === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : c.id)}
                    aria-expanded={open}
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13px] font-semibold break-keep text-fg">{c.label}</span>
                        <Badge tone="neutral" size="xs">
                          가중치 {c.weight}%
                        </Badge>
                        {c.available && c.effectiveWeight !== c.weight ? (
                          <Badge tone="accent" size="xs" title="결측 재조정 후 실제 적용된 가중치">
                            적용 {formatNumber(c.effectiveWeight, 1)}%
                          </Badge>
                        ) : null}
                        {!c.available ? (
                          <Badge tone="warn" size="xs" title={c.missingReason ?? '값을 받지 못했습니다.'}>
                            결측
                          </Badge>
                        ) : null}
                      </div>
                      {/*
                       * 결측 사유는 여기 적지 않고 펼친 자리로 내렸다.
                       * 여기 적으면 결측이 생기는 순간 이 줄만 63px 에서 84px 로 자라
                       * 목록 전체가 밀린다. 사유는 눌러서 보는 쪽이 맞고, 무엇이 빠졌는지는
                       * 옆의 '결측' 배지가 이미 말한다.
                       */}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tnum text-[15px] font-bold" style={{ color: scoreColor(c.score) }}>
                        {c.score === null ? NO_VALUE : formatNumber(c.score, 1)}
                      </p>
                      <p className="tnum text-[11.5px] text-muted">
                        전일 {c.deltaDay === null ? NO_VALUE : formatSigned(c.deltaDay, 1)}
                      </p>
                    </div>
                    <span aria-hidden="true" className="ml-1 mt-1 shrink-0 text-muted">
                      {open ? '▾' : '▸'}
                    </span>
                  </button>

                  {open ? (
                    <div className="border-t border-border bg-surface-2 px-3 py-2.5">
                      {/* 목록 줄에서 내려온 결측 사유. 여기서는 줄이 늘어도 목록이 밀리지 않는다. */}
                      {!c.available && c.missingReason ? (
                        <p className="mb-2 text-[12.5px] leading-relaxed break-keep" style={{ color: 'var(--warn)' }}>
                          <span aria-hidden="true">△ </span>
                          {c.missingReason}
                        </p>
                      ) : null}
                      <p className="text-[12.5px] leading-relaxed break-keep text-muted">{c.description}</p>

                      <div className="scroll-x mt-2 rounded-lg border border-border bg-surface">
                        <table className="data-table">
                          <caption className="sr-only">{c.label} 하위 지표</caption>
                          <thead>
                            <tr>
                              <th scope="col">하위 지표</th>
                              <th scope="col">내부 가중치</th>
                              <th scope="col">원시값</th>
                              <th scope="col">점수</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.subMetrics.map((s) => (
                              <tr key={s.id}>
                                <th scope="row" className="font-normal">
                                  <span className="text-fg">{s.label}</span>
                                  {s.inverted ? (
                                    <span className="ml-1 text-[11.5px] text-subtle" title="값이 클수록 공포 → 점수 반전">
                                      (반전)
                                    </span>
                                  ) : null}
                                  {s.missingReason ? (
                                    <span className="block text-[11.5px]" style={{ color: 'var(--warn)' }}>
                                      {s.missingReason}
                                    </span>
                                  ) : null}
                                </th>
                                <td className="tnum">{s.weight}%</td>
                                <td className="tnum">{s.raw === null ? NO_VALUE : formatNumber(s.raw, 3)}</td>
                                <td className="tnum font-semibold" style={{ color: scoreColor(s.score) }}>
                                  {s.score === null ? NO_VALUE : formatNumber(s.score, 1)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <p className="mt-2 text-[11.5px] text-subtle">
                        출처: {c.sources.map((s) => s.name).join(', ') || '알 수 없음'}
                        {c.asOf ? ` · 기준 ${formatKstFull(c.asOf)}` : ''}
                      </p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* 산출 방법 */}
      <section className="mt-4 px-3" aria-labelledby="fng-method-title">
        <h2 id="fng-method-title" className="mb-2 text-base font-bold text-fg-strong">
          산출 방법
        </h2>
        <div className="card space-y-2.5 p-3.5">
          <p className="text-[13px] leading-relaxed break-keep text-fg">{detail.methodology.summary}</p>
          <ol className="space-y-1.5">
            {detail.methodology.steps.map((s, i) => (
              <li key={i} className="text-[12.5px] leading-relaxed break-keep text-muted">
                {s}
              </li>
            ))}
          </ol>
          <div className="space-y-1.5 border-t border-border pt-2.5">
            <p className="text-[12.5px] leading-relaxed break-keep text-muted">
              <span className="font-semibold text-fg">극단치 처리 · </span>
              {detail.methodology.winsorization}
            </p>
            <p className="text-[12.5px] leading-relaxed break-keep text-muted">
              <span className="font-semibold text-fg">결측 처리 · </span>
              {detail.methodology.coverageRule}
            </p>
          </div>
          <Notice tone="neutral">{detail.methodology.scaleWarning}</Notice>
        </div>
      </section>

      {/* 출처 */}
      <section className="mt-4 px-3" aria-labelledby="fng-source-title">
        <h2 id="fng-source-title" className="mb-2 text-base font-bold text-fg-strong">
          데이터 출처와 업데이트
        </h2>
        <div className="card p-3.5">
          <ul className="space-y-2">
            {detail.meta.sources.map((s, i) => (
              <li key={i} className="text-[13px]">
                <p className="font-semibold text-fg">{s.name}</p>
                <p className="text-[11.5px] break-keep text-subtle">
                  {s.delayMinutes === null ? '지연 정보 없음' : s.delayMinutes === 0 ? '실시간' : `${s.delayMinutes}분 지연`}
                  {s.terms ? ` · ${s.terms}` : ''}
                </p>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[11.5px] text-accent hover:underline">
                    {s.url}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 border-t border-border pt-2 text-[11.5px] text-subtle">
            데이터 기준 시각 {formatKstFull(detail.meta.asOf)} · 수집 {formatKstFull(detail.meta.fetchedAt)}
          </p>
        </div>
      </section>
    </div>
  );
}
