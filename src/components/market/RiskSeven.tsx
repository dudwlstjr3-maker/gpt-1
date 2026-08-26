'use client';

/**
 * 위험 지표 7선.
 *
 * 각 지표를 "지금 어느 구간에 있는가"로 보여준다. 숫자만으로는 20 이 높은지 낮은지
 * 알 수 없으므로 구간 막대 위에 현재 위치를 찍고, 구간 기준을 그대로 노출한다.
 * 색상만으로 단계를 전달하지 않도록 기호(○ ● △ ▲)와 라벨을 항상 함께 쓴다.
 */

import Link from 'next/link';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, Skeleton, EmptyState } from '@/components/ui/States';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Sparkline } from '@/components/charts/Sparkline';
import { useChangeColor } from './useChangeColor';
import { formatNumber, formatSigned, formatKstTime, NO_VALUE } from '@/lib/format';
import {
  MARKET_LABEL,
  RISK_LEVEL_GLYPH,
  RISK_LEVEL_LABEL,
  type RiskIndicator,
  type RiskLevel,
} from '@/types';

/** 위험 단계 색상 — Fear→Greed 척도와 구분되는 의미 색상 */
export const RISK_COLOR: Record<RiskLevel, string> = {
  calm: 'var(--ok)',
  // '보통'은 강조하지 않되 선·막대로 그렸을 때 읽히긴 해야 한다.
  // 배지는 별도로 muted 톤을 쓰므로 여기서 밝게 잡아도 과하게 튀지 않는다.
  normal: 'var(--fg)',
  watch: 'var(--warn)',
  alert: 'var(--danger)',
};

const RISK_TONE: Record<RiskLevel, Tone> = {
  calm: 'ok',
  normal: 'neutral',
  watch: 'warn',
  alert: 'danger',
};

const SCOPE_LABEL: Record<RiskIndicator['scope'], string> = {
  us: MARKET_LABEL.us,
  kr: MARKET_LABEL.kr,
  crypto: MARKET_LABEL.crypto,
  global: '글로벌',
};

export function formatRiskValue(v: number | null, i: RiskIndicator): string {
  if (v === null) return NO_VALUE;
  return `${formatNumber(v, i.precision)}${i.suffix}`;
}

function formatRiskChange(v: number | null, i: RiskIndicator): string {
  if (v === null) return NO_VALUE;
  return `${formatSigned(v, i.precision)}${i.suffix}`;
}

/* ------------------------------------------------------------------ */
/* 구간 막대                                                             */
/* ------------------------------------------------------------------ */

export function RiskBandBar({ indicator, showLabels = true }: { indicator: RiskIndicator; showLabels?: boolean }) {
  const span = indicator.scaleMax - indicator.scaleMin;
  if (span <= 0) return null;

  const segments = indicator.bands.map((b) => {
    const from = Math.max(indicator.scaleMin, b.from ?? indicator.scaleMin);
    const to = Math.min(indicator.scaleMax, b.to ?? indicator.scaleMax);
    return { ...b, width: Math.max(0, ((to - from) / span) * 100) };
  });

  const current = indicator.bands.find((b) => b.level === indicator.level);

  return (
    <div>
      <div
        className="relative flex h-2.5 overflow-hidden rounded-full"
        role="img"
        aria-label={`${indicator.name} 구간 막대. 현재 ${RISK_LEVEL_LABEL[indicator.level]} 구간.`}
      >
        {segments.map((s, idx) => (
          <span
            key={idx}
            className="h-full"
            style={{
              width: `${s.width}%`,
              background: RISK_COLOR[s.level],
              opacity: s.level === indicator.level ? 0.95 : 0.28,
            }}
          />
        ))}
        {indicator.position !== null ? (
          <span
            aria-hidden="true"
            className="absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${indicator.position}%`,
              background: 'var(--fg-strong)',
              boxShadow: '0 0 0 2px var(--surface)',
            }}
          />
        ) : null}
      </div>
      {showLabels ? (
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-subtle">
          <span className="tnum">{formatNumber(indicator.scaleMin, indicator.precision > 2 ? 2 : indicator.precision)}</span>
          <span style={{ color: RISK_COLOR[indicator.level] }}>
            현재 구간 {current?.label ?? '—'}
          </span>
          <span className="tnum">{formatNumber(indicator.scaleMax, indicator.precision > 2 ? 2 : indicator.precision)}</span>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 컴팩트 타일 (홈)                                                       */
/* ------------------------------------------------------------------ */

export function RiskTile({ indicator }: { indicator: RiskIndicator }) {
  const c = useChangeColor();
  const unavailable = indicator.value === null;

  return (
    <Link
      href="/risk"
      className="card block p-2.5 transition-colors hover:bg-surface-2"
      aria-label={`${indicator.name} 상세 보기`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-fg">{indicator.shortName}</p>
          <p className="text-[9.5px] text-subtle">{SCOPE_LABEL[indicator.scope]}</p>
        </div>
        <Badge tone={RISK_TONE[indicator.level]} size="xs">
          <span aria-hidden="true">{RISK_LEVEL_GLYPH[indicator.level]}</span>
          {RISK_LEVEL_LABEL[indicator.level]}
        </Badge>
      </div>

      {unavailable ? (
        <p className="mt-1.5 text-[10px]" style={{ color: 'var(--warn)' }}>
          {indicator.unavailableReason ?? '값 없음'}
        </p>
      ) : (
        <>
          <p className="tnum mt-1 truncate text-[15px] font-bold text-fg-strong">
            {formatRiskValue(indicator.value, indicator)}
          </p>
          <p className="tnum truncate text-[10px]" style={{ color: c.color(indicator.change) }}>
            {c.glyph(indicator.change)} {formatRiskChange(indicator.change, indicator)}
          </p>
        </>
      )}

      <div className="mt-2">
        <RiskBandBar indicator={indicator} showLabels={false} />
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* 전체 카드 (/risk)                                                     */
/* ------------------------------------------------------------------ */

export function RiskCard({ indicator }: { indicator: RiskIndicator }) {
  const c = useChangeColor();
  const unavailable = indicator.value === null;

  return (
    <article className="card p-3.5" aria-labelledby={`risk-${indicator.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`risk-${indicator.id}`} className="text-[13.5px] font-bold break-keep text-fg-strong">
            {indicator.name}
          </h3>
          <p className="mt-0.5 text-[10px] text-subtle">
            {SCOPE_LABEL[indicator.scope]} · {indicator.direction === 'higher_is_riskier' ? '값이 클수록 위험' : '값이 작을수록 위험'}
          </p>
        </div>
        <Badge tone={RISK_TONE[indicator.level]}>
          <span aria-hidden="true">{RISK_LEVEL_GLYPH[indicator.level]}</span>
          {RISK_LEVEL_LABEL[indicator.level]}
        </Badge>
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {unavailable ? (
            <p className="text-[12px]" style={{ color: 'var(--warn)' }}>
              {indicator.unavailableReason ?? '값을 받지 못했습니다.'}
            </p>
          ) : (
            <>
              <p className="tnum text-xl leading-tight font-bold text-fg-strong">
                {formatRiskValue(indicator.value, indicator)}
              </p>
              <p className="tnum mt-0.5 text-[11.5px] font-semibold" style={{ color: c.color(indicator.change) }}>
                <span aria-hidden="true">{c.glyph(indicator.change)}</span> {formatRiskChange(indicator.change, indicator)}
                <span className="ml-1 font-normal text-subtle">
                  이전 {formatRiskValue(indicator.previous, indicator)}
                </span>
              </p>
            </>
          )}
        </div>
        <Sparkline
          points={indicator.spark}
          width={92}
          height={32}
          color={RISK_COLOR[indicator.level]}
          ariaLabel={`${indicator.name} 최근 추이`}
        />
      </div>

      <div className="mt-3">
        <RiskBandBar indicator={indicator} />
      </div>

      {/* 구간 기준을 그대로 노출한다 */}
      <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
        {indicator.bands.map((b, i) => (
          <li key={i} className="flex items-center gap-1 text-[10px]">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: RISK_COLOR[b.level], opacity: b.level === indicator.level ? 1 : 0.4 }}
            />
            <span style={{ color: b.level === indicator.level ? 'var(--fg)' : 'var(--subtle-fg)' }}>
              {RISK_LEVEL_LABEL[b.level]} {b.label}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-1.5 border-t border-border pt-2.5">
        <p className="text-[11px] leading-relaxed break-keep text-muted">
          <span className="font-semibold text-fg">무슨 지표인가 · </span>
          {indicator.why}
        </p>
        <p className="text-[11px] leading-relaxed break-keep" style={{ color: RISK_COLOR[indicator.level] }}>
          <span className="font-semibold">지금 읽는 법 · </span>
          {indicator.reading}
        </p>
      </div>

      <p className="mt-2 text-[10px] text-subtle">
        기준 {formatKstTime(indicator.meta.asOf)} · 출처 {indicator.meta.sources[0]?.name ?? '알 수 없음'}
      </p>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* 홈 섹션                                                              */
/* ------------------------------------------------------------------ */

export function RiskSevenSection() {
  const { snapshot, refresh } = useData();
  const section = snapshot?.sections.risk ?? null;

  return (
    <section aria-labelledby="risk-seven-title" className="mt-5 px-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="risk-seven-title" className="text-base font-bold text-fg-strong">
          위험 지표 7선
        </h2>
        <Link href="/risk" className="text-[11px] font-semibold text-accent hover:underline">
          기준과 해설 →
        </Link>
      </div>

      <SectionGate
        section={section}
        onRetry={refresh}
        loading={
          <>
            <Skeleton className="mb-2 h-9" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-[104px]" />
              ))}
            </div>
          </>
        }
        empty={<EmptyState title="위험 지표를 산출할 데이터가 없습니다" />}
      >
        {(digest) => (
          <>
            <div
              className="mb-2 flex items-start gap-2 rounded-xl border px-3 py-2.5"
              style={{
                borderColor:
                  digest.alertCount > 0
                    ? 'color-mix(in srgb, var(--danger) 40%, var(--border))'
                    : digest.watchCount > 0
                      ? 'color-mix(in srgb, var(--warn) 36%, var(--border))'
                      : 'var(--border)',
                background: 'var(--surface)',
              }}
              role="status"
            >
              <span
                aria-hidden="true"
                className="mt-px text-[13px]"
                style={{
                  color:
                    digest.alertCount > 0 ? 'var(--danger)' : digest.watchCount > 0 ? 'var(--warn)' : 'var(--ok)',
                }}
              >
                {digest.alertCount > 0 ? '▲' : digest.watchCount > 0 ? '△' : '○'}
              </span>
              <p className="min-w-0 flex-1 text-[12px] leading-relaxed break-keep text-fg">{digest.headline}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {digest.indicators.map((i) => (
                <RiskTile key={i.id} indicator={i} />
              ))}
            </div>
          </>
        )}
      </SectionGate>
    </section>
  );
}

/** 시장별 화면에서 해당 시장 관련 지표만 추린 소형 패널 */
export function RiskForMarket({ market }: { market: 'us' | 'kr' | 'crypto' }) {
  const { snapshot, refresh } = useData();
  const section = snapshot?.sections.risk ?? null;

  return (
    <SectionGate section={section} onRetry={refresh} loading={<SkeletonCard height={70} lines={1} />}>
      {(digest) => {
        const items = digest.indicators.filter((i) => i.scope === market || i.scope === 'global');
        if (items.length === 0) return <></>;
        return (
          <div className="card p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-fg-strong">{MARKET_LABEL[market]} 관련 위험 지표</h2>
              <Link href="/risk" className="text-[11px] font-semibold text-accent hover:underline">
                7선 전체 →
              </Link>
            </div>
            <ul className="space-y-2.5">
              {items.map((i) => (
                <li key={i.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12px] text-fg">{i.shortName}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="tnum text-[12px] font-bold text-fg-strong">
                        {formatRiskValue(i.value, i)}
                      </span>
                      <span className="text-[10px]" style={{ color: RISK_COLOR[i.level] }}>
                        {RISK_LEVEL_GLYPH[i.level]} {RISK_LEVEL_LABEL[i.level]}
                      </span>
                    </span>
                  </div>
                  <RiskBandBar indicator={i} showLabels={false} />
                </li>
              ))}
            </ul>
          </div>
        );
      }}
    </SectionGate>
  );
}
