'use client';

/** 종목·지수 상세 — 기간별 차트와 해당 시장 Fear & Greed 점수 겹쳐보기. */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSettings } from '@/components/providers/SettingsProvider';
import { useFormatter } from '@/components/market/useFormatter';
import { InteractiveChart, type ChartSeries } from '@/components/charts/InteractiveChart';
import { FreshnessBadge, ModeBadge, SessionBadge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/Controls';
import { ErrorState, SkeletonCard } from '@/components/ui/States';
import { convertCurrency, formatKoreanCompact, formatKstFull, NO_VALUE } from '@/lib/format';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { DIRECTION_LABEL } from '@/lib/scale';
import { ASSET_RANGES, MARKET_LABEL, type AssetDetail, type RangeKey } from '@/types';

// API 가 채우는 구간과 같아야 한다. 한 곳(@/types)에서 정한다.
const RANGES = ASSET_RANGES;
const RANGE_LABEL: Record<RangeKey, string> = {
  '1D': '1일',
  '1W': '1주',
  '1M': '1개월',
  '3M': '3개월',
  '1Y': '1년',
  '3Y': '3년',
};

export default function AssetPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { settings, hydrated, isWatched, toggleWatch } = useSettings();
  const f = useFormatter();

  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>('1M');
  const [overlay, setOverlay] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/asset/${encodeURIComponent(id)}?scenario=${encodeURIComponent(settings.scenario)}`);
      const body = await res.json();
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      setDetail(body as AssetDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id, settings.scenario]);

  useEffect(() => {
    if (!hydrated) return;
    void load();
  }, [hydrated, load]);

  const series = useMemo<ChartSeries[]>(() => {
    if (!detail) return [];
    const q = detail.quote;

    // 차트도 상단 현재가와 같은 통화로 그린다. 환율이 없으면 환산하지 않고 원래 통화를 유지한다.
    const converted = (detail.ranges[range] ?? [])
      .map((p) => ({ t: p.t, v: convertCurrency(p.v, q.currency, f.currency, f.usdKrw) }))
      .filter((p): p is { t: number; v: number } => p.v !== null);
    const points = converted.length > 0 ? converted : (detail.ranges[range] ?? []);
    const displayCurrency = q.currency === null ? null : converted.length > 0 ? f.currency : q.currency;

    const out: ChartSeries[] = [
      {
        id: 'price',
        name: displayCurrency ? `${q.name} (${displayCurrency === 'KRW' ? '원' : '달러'})` : q.name,
        points,
        color: 'var(--accent)',
        axis: 'left',
        precision: displayCurrency === 'KRW' ? 0 : q.precision,
        ...(displayCurrency ? { suffix: displayCurrency === 'KRW' ? '원' : '$' } : {}),
        area: true,
      },
    ];
    if (overlay) {
      const pts = (detail.fngOverlay[range] ?? [])
        .filter((p) => p.v !== null)
        .map((p) => ({ t: p.t, v: p.v as number }));
      if (pts.length >= 2) {
        out.push({
          id: 'fng',
          name: `${MARKET_LABEL[q.market]} 심리 점수`,
          points: pts,
          color: 'var(--series-2)',
          axis: 'right',
          precision: 1,
          fixed0to100: true,
          dashed: true,
        });
      }
    }
    return out;
  }, [detail, range, overlay, f.currency, f.usdKrw]);

  if (loading && !detail) {
    return (
      <div className="space-y-3 px-3 pt-3">
        <SkeletonCard height={80} lines={2} />
        <SkeletonCard height={220} lines={1} />
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="px-3 pt-3">
        <ErrorState title="종목 상세를 불러오지 못했습니다" message={error} onRetry={load} />
        <Link href="/" className="mt-3 inline-block text-[13px] font-semibold text-accent">
          ← 시장으로
        </Link>
      </div>
    );
  }

  if (!detail) return null;

  const q = detail.quote;
  const dir = f.direction(q);
  const color = f.color(dir);
  const watched = isWatched(q.id);
  const delay = q.meta.sources[0]?.delayMinutes ?? null;

  return (
    <div className="pt-2 pb-4">
      <div className="flex items-center justify-between gap-2 px-3 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={`/market/${q.market}`} aria-label="뒤로" className="text-muted">
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-fg-strong">{q.name}</h1>
            <p className="truncate text-[12.5px] text-subtle">
              {q.symbol} · {MARKET_LABEL[q.market]}
            </p>
            {/* 지수는 기준점을 모르면 숫자 자체를 읽을 수 없다 */}
            {CATALOG_BY_ID.get(q.id)?.baseline ? (
              <p className="mt-0.5 text-[11.5px] break-keep text-muted">
                기준 {CATALOG_BY_ID.get(q.id)!.baseline}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ModeBadge mode={detail.mode} size="xs" />
          <button
            type="button"
            onClick={() => toggleWatch(q.id)}
            aria-pressed={watched}
            aria-label={watched ? '관심목록에서 제거' : '관심목록에 추가'}
            className="h-8 w-8 rounded-lg border border-border text-sm"
            style={{ color: watched ? 'var(--warn)' : 'var(--muted-fg)' }}
          >
            {watched ? '★' : '☆'}
          </button>
        </div>
      </div>

      {/* 현재가 */}
      <section className="mt-3 px-3" aria-label="현재 시세">
        <div className="card p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="tnum text-2xl leading-tight font-bold text-fg-strong">
                {q.price === null ? NO_VALUE : f.price(q)}
              </p>
              <p className="tnum mt-1 flex items-center gap-1.5 text-[13px] font-semibold" style={{ color }}>
                <span aria-hidden="true">{f.glyph(dir)}</span>
                {f.change(q)} ({f.changePct(q)})
                <span className="sr-only">{DIRECTION_LABEL[dir]}</span>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <SessionBadge phase={q.session} />
              <FreshnessBadge freshness={q.meta.freshness} delayMinutes={delay} />
            </div>
          </div>

          {q.unavailableReason ? (
            <p className="mt-2 text-[12.5px]" style={{ color: 'var(--warn)' }}>
              {q.unavailableReason}
            </p>
          ) : null}

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border pt-2.5 text-[12.5px]">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">거래량</dt>
              <dd className="tnum text-fg">{q.volume === null ? NO_VALUE : formatKoreanCompact(q.volume, 1)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">통화·단위</dt>
              <dd className="text-right text-fg">
                {q.currency ?? '지수/비율'}
                {q.currency && q.currency !== f.currency ? (
                  <span className="block text-[11.5px] text-subtle">
                    {f.usdKrw === null ? '환율 없음 — 환산 불가' : `${f.currency === 'KRW' ? '원' : '달러'}화 환산 표시`}
                  </span>
                ) : null}
              </dd>
            </div>
            <div className="col-span-2 flex justify-between gap-2">
              <dt className="shrink-0 text-muted">기준 시각</dt>
              <dd className="tnum text-right text-fg">{formatKstFull(q.meta.asOf)}</dd>
            </div>
            <div className="col-span-2 flex justify-between gap-2">
              <dt className="shrink-0 text-muted">출처</dt>
              <dd className="text-right break-keep text-fg">
                {q.meta.sources[0]?.name ?? '알 수 없음'}
                {q.meta.sources[0]?.terms ? ` · ${q.meta.sources[0].terms}` : ''}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* 차트 */}
      <section className="mt-4 px-3" aria-labelledby="asset-chart-title">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id="asset-chart-title" className="text-base font-bold text-fg-strong">
            가격 추이
          </h2>
          <div className="flex items-center gap-1.5">
            <SegmentedControl
              label="기간"
              size="xs"
              value={range}
              onChange={setRange}
              options={RANGES.map((r) => ({ value: r, label: RANGE_LABEL[r] }))}
            />
          </div>
        </div>

        <div className="card p-3">
          <div className="mb-2 flex items-center justify-end">
            <button
              type="button"
              onClick={() => setOverlay((v) => !v)}
              aria-pressed={overlay}
              className="rounded-md border border-border px-2 py-1 text-[12.5px] font-semibold"
              style={{
                background: overlay ? 'var(--surface-3)' : 'var(--surface-2)',
                color: overlay ? 'var(--accent)' : 'var(--muted-fg)',
              }}
            >
              {overlay ? '✓ 심리 점수 겹쳐 보기' : '심리 점수 겹쳐 보기'}
            </button>
          </div>
          <InteractiveChart
            series={series}
            height={250}
            label={`${q.name} ${RANGE_LABEL[range]} 가격 추이${overlay ? ` 및 ${MARKET_LABEL[q.market]} 심리 점수` : ''}`}
            emptyMessage={detail.unavailable?.[range] ?? '해당 기간의 시계열 데이터가 없습니다.'}
          />
          {overlay ? (
            <p className="mt-2 text-[11.5px] break-keep text-subtle">
              아래 칸은 0~100 심리 점수입니다. 단위가 다른 두 값이라 눈금을 겹치지 않고 시간축만 맞춰 두었습니다. 심리
              점수는 일 단위로 산출되므로 1일·1주 구간에서는 표본이 적을 수 있습니다.
            </p>
          ) : null}
        </div>
      </section>

      <div className="mt-4 px-3">
        <Link
          href={`/fng/${q.market}`}
          className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] font-semibold text-fg hover:bg-surface-3"
        >
          {MARKET_LABEL[q.market]} 투자심리 상세 보기
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
