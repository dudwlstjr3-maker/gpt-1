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
import { formatKstFull, formatNumber, formatSigned, NO_VALUE } from '@/lib/format';
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

/**
 * 가중치 막대.
 *
 * 이 화면의 제목이 '구성요소와 **가중치**' 인데, 정작 가중치가 제일 안 보이는
 * 값이었다. '가중치 25%' 와 '가중치 10%' 가 똑같이 생긴 작은 배지로 나란히
 * 놓여 있어서, 무엇이 점수를 많이 끌고 가는지 알려면 여섯 줄을 하나씩 읽고
 * 머릿속에서 견줘야 했다. 길이로 그리면 한 번에 보인다.
 *
 * 색은 심리의 색(빨강·초록)을 쓰지 않는다. 가중치는 좋고 나쁨이 아니라 양이고,
 * 이 화면에서 빨강·초록은 이미 '공포·탐욕' 이라는 뜻을 갖고 있다. 같은 색에
 * 두 가지 뜻을 얹으면 둘 다 흐려진다. 길이만으로 뜻이 가지 않게 숫자도 옆에 둔다.
 *
 * 채운 길이는 **실제로 적용된** 가중치다. 결측이 생기면 남은 것들의 적용
 * 가중치가 커지는데, 그때 기준 가중치 자리에 세워 둔 눈금보다 막대가 길어져서
 * 재조정이 일어났다는 사실이 눈에 들어온다. 결측인 줄은 아예 비어 있다.
 *
 * 칸 전체의 길이는 **합계 100%** 다. 제일 큰 가중치에 맞추는 방법도 있는데,
 * 그러면 미국처럼 가중치가 15·15·14·14·14·14·14 로 고른 시장에서 막대가 전부
 * 칸을 꽉 채운다 — 14% 짜리가 '거의 전부' 로 보인다. 이 구역의 머리말이
 * '합계 100%' 라고 적고 있으니, 눈금도 거기에 맞춰야 머리말과 막대가 같은 말을
 * 한다. 길이가 곧 그 숫자다.
 */
function WeightBar({
  weight,
  effective,
  total,
  available,
}: {
  weight: number;
  effective: number;
  total: number;
  available: boolean;
}) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / total) * 100))}%`;
  // 0.05%p 미만 차이는 반올림하면 같은 숫자라 눈금을 세우지 않는다
  const shifted = available && Math.abs(effective - weight) >= 0.05;
  return (
    <div className="mt-1 flex items-center gap-2">
      {/* 숫자가 막대 **왼쪽**에 있다. 오른쪽에 두면 칸 끝에 붙어 옆 줄의 '전일 +4.8'
          과 나란히 놓이고, 막대의 채워진 끝에서 숫자까지 눈이 먼 길을 간다.
          왼쪽에 고정하면 줄마다 막대가 같은 자리에서 시작해 세로로 견주기도 쉽다. */}
      {/* 오른쪽 맞춤 + 최소 너비 36px. '7%' 와 '20%' 의 글자 폭이 달라서
          그냥 두면 줄마다 막대가 다른 자리에서 시작한다 — 길이를 견주라고 그린
          막대가 시작점부터 어긋나면 견줄 수가 없다. */}
      <span className="tnum min-w-9 shrink-0 text-right text-[11.5px] text-muted">
        {formatNumber(weight, 0)}%
        {shifted ? <span className="text-accent"> → {formatNumber(effective, 1)}%</span> : null}
      </span>
      <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: available ? pct(effective) : '0%',
            background: 'color-mix(in srgb, var(--fg) 42%, transparent)',
          }}
        />
        {shifted ? (
          <span className="absolute inset-y-0 w-0.5 bg-muted" style={{ left: pct(weight) }} />
        ) : null}
      </span>
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
        // 0~100 로 못박는다. 자동 눈금은 값 범위에 맞춰 -5.9 나 103.8 같은
        // 있을 수 없는 눈금을 그려서, 점수가 무엇인지 모르게 만든다.
        fixed0to100: true,
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
  /* 가중치 막대의 칸 길이 = 가중치 합계. 머리말의 '합계 100%' 와 같은 눈금이다. */
  const totalWeight = Math.max(1, detail.components.reduce((a, c) => a + c.weight, 0));

  return (
    <div className="pt-2 pb-4">
      <div className="flex items-center justify-between gap-2 px-3 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/" aria-label="뒤로" className="tap min-w-[24px] justify-center text-muted">
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
      <section className="mt-5 px-3" aria-label="점수 요약">
        <div className="card p-3">
          <div className="flex flex-col items-center gap-2 @min-[1024px]:flex-row @min-[1024px]:items-center @min-[1024px]:gap-6">
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
              {/*
                * 여섯 줄짜리 표를 두 줄로 접었다.
                *
                * 신뢰도 · 충족률 · 신선도 · 분포 · 산식 버전 · 산출 시각이 점수와
                * 같은 비중으로 깔려 있었는데, 그 바로 아래 문장이 **그중 셋을 그대로
                * 되풀이**하고 있었다 — "데이터 충족률 100% · 신선도 100% → 신뢰도 높음".
                * 같은 말을 두 번 읽히면 둘 다 안 읽힌다.
                *
                * 남긴 기준은 하나다. **점수를 얼마나 믿을지 판단하는 데 쓰이는가.**
                *   신뢰도   → 배지로 올렸다. 색만으로 뜻이 가지 않게 기호(●●●)와 글자를 함께 둔다.
                *   충족률·신선도 → 아래 문장이 이미 말한다. 줄을 지웠다.
                *   분포·산식·시각 → 지우지는 않는다. 숫자의 출처라 따져 볼 사람에게는
                *                   필요하다. 다만 작은 글씨 한 줄로 내렸다.
                */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone={detail.confidence === 'low' ? 'warn' : 'neutral'} size="sm">
                  <span aria-hidden="true">{confidenceGlyph(detail.confidence)}</span>
                  신뢰도 {CONFIDENCE_LABEL[detail.confidence]}
                </Badge>
                <span className="text-[12.5px] break-keep text-subtle">{detail.confidenceReason}</span>
              </div>
              <p className="tnum mt-2 text-[11.5px] text-subtle">
                최근 {detail.lookbackDays}일 분포 기준 · 산식 {detail.formulaVersion} ·{' '}
                {formatKstFull(detail.computedAt)} 산출
              </p>
            </div>
          </div>
          <div className="mt-3 border-t border-border pt-2">
            <StageLegend score={detail.score} />
          </div>
        </div>
      </section>

      {/* 추이 차트 */}
      <section className="mt-5 px-3" aria-labelledby="fng-chart-title">
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
            {detail.benchmark
              ? `위 칸은 0~100 심리 점수, 아래 칸은 ${detail.benchmark.name} 가격입니다. 단위가 다른 두 값이라 눈금을 겹치지 않고 시간축만 맞춰 두었습니다 — 한 눈금에 겹쳐 그리면 눈금을 어디에 두느냐에 따라 없던 상관관계가 보입니다.`
              : '세로축은 0~100 심리 점수입니다.'}{' '}
            점수가 산출되지 않은 날은 선이 이어지지 않습니다.
            {chartMarkers.length > 0
              ? ` 세로 점선은 과거 사건 ${chartMarkers.length}건이며, 번호는 아래 목록과 같습니다.`
              : ' 기간을 10년으로 바꾸면 과거 위기 시점이 표시됩니다.'}
            {range === '3Y' || range === '10Y'
              ? ` 이 구간의 선은 하루치 점수를 ${SMOOTH_DAYS}일로 평균한 값입니다. 하루 단위 점수는 진폭이 커서 몇 년을 한 화면에 그리면 흐름이 보이지 않기 때문입니다. 아래 목록의 숫자는 평균이 아니라 그날의 실제 점수입니다.`
              : ''}
          </p>
        </div>

        {/* 과거 위기 표식 */}
        <div className="mt-2">
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
      <section className="mt-5 px-3" aria-labelledby="fng-cycle-title">
        <h2 id="fng-cycle-title" className="mb-2 text-base font-bold text-fg-strong">
          사이클과 구간 통계
        </h2>
        <div className="grid grid-cols-1 gap-2 @min-[1024px]:grid-cols-2">
          <FngCycleView cycle={detail.cycle} />
          {detail.bandStats ? (
            <BandStatsView stats={detail.bandStats} />
          ) : (
            <div className="card p-3">
              <h3 className="text-sm font-bold text-fg-strong">구간별 과거 통계</h3>
              <p className="mt-2 text-[12.5px] break-keep text-muted">
                통계를 낼 만큼 히스토리가 쌓이지 않았거나 비교할 대표 지수가 없습니다.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 기여도 */}
      <section className="mt-5 px-3" aria-labelledby="fng-contrib-title">
        <h2 id="fng-contrib-title" className="mb-2 text-base font-bold text-fg-strong">
          점수 상승·하락 기여도
        </h2>
        <div className="card p-3">
          <ContributionBars
            caption={`${MARKET_LABEL[market]} 구성요소별 전일 대비 기여도`}
            items={detail.components.map((c) => ({
              id: c.id,
              label: c.label,
              value: c.contributionDay,
            }))}
          />
          <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border pt-2 @min-[640px]:grid-cols-2">
            <div className="rounded-lg bg-surface-2 p-2">
              <p className="text-[11.5px] text-muted">가장 큰 상승 요인</p>
              <p className="mt-0.5 text-[13px] font-semibold break-keep text-fg">
                {detail.topPositive?.label ?? '해당 없음'}
              </p>
              {detail.topPositive ? <p className="text-[11.5px] text-subtle">{detail.topPositive.detail}</p> : null}
            </div>
            <div className="rounded-lg bg-surface-2 p-2">
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
      <section className="mt-5 px-3" aria-labelledby="fng-comp-title">
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
                  {/*
                   * 가중치 배지 둘(기준 · 적용)을 막대 한 줄로 바꿨다.
                   *
                   * 배지로 두면 20% 와 7% 가 똑같이 생긴 알약이라 크기 차이가 안 보이고,
                   * 이름 옆에 배지가 둘셋 붙어서 긴 이름이 두 줄로 접히기도 했다.
                   *
                   * 막대는 이름 바로 아래, 왼쪽 칸 안에 둔다. 숫자를 막대 오른쪽에
                   * 두었을 때는 그 숫자가 옆 칸의 '전일 +4.8' 과 8px 간격으로 나란히
                   * 놓여 '15% 전일 +4.8' 한 덩어리로 읽혔다 — 서로 아무 상관이 없는
                   * 두 값이다. 줄을 통째로 하나 더 내주는 방법도 써 봤는데 줄마다
                   * 16px 씩, 일곱 줄이면 112px 이 더 들었다. 숫자를 막대 **왼쪽**으로
                   * 옮기니 겹침도 사라지고 높이도 그대로다.
                   */}
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : c.id)}
                    aria-expanded={open}
                    className="block w-full px-3 py-2 text-left hover:bg-surface-2"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold break-keep text-fg">{c.label}</span>
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
                        <WeightBar
                          weight={c.weight}
                          effective={c.effectiveWeight}
                          total={totalWeight}
                          available={c.available}
                        />
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
                    </div>
                  </button>

                  {open ? (
                    <div className="border-t border-border bg-surface-2 px-3 py-2">
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
      <section className="mt-5 px-3" aria-labelledby="fng-method-title">
        <h2 id="fng-method-title" className="mb-2 text-base font-bold text-fg-strong">
          산출 방법
        </h2>
        <div className="card space-y-2 p-3">
          <p className="text-[13px] leading-relaxed break-keep text-fg">{detail.methodology.summary}</p>
          {/*
            * <ol> 인데 번호가 안 보였다.
            *
            * Tailwind 가 목록 표식을 지우기 때문에, 순서가 있는 목록이 그냥 문단
            * 네 개로 보였다. 이 네 줄은 실제로 **차례**다 — 원시값을 모으고,
            * 역사적 분포에서 백분위를 내고, 가중평균하고, 구간을 붙인다. 한 단계가
            * 앞 단계의 결과를 받는다. 순서가 뜻을 가지는 목록이라 번호를 되살렸다.
            * (반대로 순서가 뜻이 없는 곳에는 번호를 붙이지 않는다.)
            */}
          <ol className="space-y-2">
            {detail.methodology.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="tnum mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11.5px] font-bold text-fg"
                >
                  {i + 1}
                </span>
                <span className="text-[12.5px] leading-relaxed break-keep text-muted">{s}</span>
              </li>
            ))}
          </ol>
          <div className="space-y-2 border-t border-border pt-2">
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
      <section className="mt-5 px-3" aria-labelledby="fng-source-title">
        <h2 id="fng-source-title" className="mb-2 text-base font-bold text-fg-strong">
          데이터 출처와 업데이트
        </h2>
        <div className="card p-3">
          <ul className="space-y-2">
            {detail.meta.sources.map((s, i) => (
              <li key={i} className="text-[13px]">
                <p className="font-semibold text-fg">{s.name}</p>
                <p className="text-[11.5px] break-keep text-subtle">
                  {s.delayMinutes === null ? '지연 정보 없음' : s.delayMinutes === 0 ? '실시간' : `${s.delayMinutes}분 지연`}
                  {s.terms ? ` · ${s.terms}` : ''}
                </p>
                {/* 날 URL(https://… 뒤에 슬래시까지)을 그대로 깔면 한 줄이 주소로 꽉 찬다.
                    읽는 사람에게 필요한 건 '어디' 라서 호스트만 남기고, 새 창으로 열린다는
                    것은 기호(↗)와 화면 낭독용 글자로 함께 알린다 — 기호 하나만으로 두지 않는다. */}
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[11.5px] text-accent hover:underline">
                    {s.url.replace(/^https?:\/\//, '').replace(/\/+$/, '')}
                    <span aria-hidden="true"> ↗</span>
                    <span className="sr-only"> (새 창에서 열림)</span>
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-border pt-2 text-[11.5px] text-subtle">
            데이터 기준 시각 {formatKstFull(detail.meta.asOf)} · 수집 {formatKstFull(detail.meta.fetchedAt)}
          </p>
        </div>
      </section>
    </div>
  );
}
