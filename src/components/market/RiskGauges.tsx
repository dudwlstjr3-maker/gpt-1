'use client';

/**
 * 시장 위험 신호등.
 *
 * 각 지표를 "지금 어느 구간에 있는가"로 보여준다. 숫자만으로는 20 이 높은지 낮은지
 * 알 수 없으므로 신호등 구간 막대 위에 현재 위치를 찍고, 구간 기준을 그대로 노출한다.
 *
 * 색은 빨/노/초 세 가지만 쓴다. 색맹 사용자와 흑백 화면을 위해
 * 켜진 램프의 '위치' · 기호(○ ● △ ▲) · 한국어 라벨을 항상 같이 낸다.
 */

import Link from 'next/link';
import { useState } from 'react';
import { buildRiskHeadline } from '@/lib/riskHeadline';
import { guideFor } from '@/lib/indicatorGuide';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, Skeleton, EmptyState } from '@/components/ui/States';
import { Badge, type Tone } from '@/components/ui/Badge';
import { SignalDot, SignalLegend, SignalLight, SignalTally, type SignalTallyItem } from '@/components/ui/Signal';
import { Sparkline } from '@/components/charts/Sparkline';
import { riskSignal, SIGNAL_ORDER, signalColor } from '@/lib/scale';
import { useChangeColor } from './useChangeColor';
import { formatNumber, formatSigned, formatKstTime, NO_VALUE } from '@/lib/format';
import {
  MARKET_LABEL,
  RISK_LEVEL_GLYPH,
  RISK_LEVEL_LABEL,
  type RiskDigest,
  type RiskIndicator,
  type RiskLevel,
} from '@/types';

/**
 * 위험 단계 색상 — 신호등 팔레트만 쓴다.
 * 안정·보통은 둘 다 초록불이고 진하기로만 구분한다(보통이 조금 더 연두).
 * 관찰은 노란불, 주의는 빨간불이다.
 */
export const RISK_COLOR: Record<RiskLevel, string> = {
  calm: 'var(--tl-green)',
  normal: 'var(--tl-lime)',
  watch: 'var(--tl-yellow)',
  alert: 'var(--tl-red)',
};

/** 막대·네모에 칠하는 색. 밝은 테마에서 노랑이 갈색으로 죽지 않게 채도를 유지한 값이다. */
export const RISK_FILL: Record<RiskLevel, string> = {
  calm: 'var(--tl-green-fill)',
  normal: 'var(--tl-lime-fill)',
  watch: 'var(--tl-yellow-fill)',
  alert: 'var(--tl-red-fill)',
};

const RISK_TONE: Record<RiskLevel, Tone> = {
  calm: 'ok',
  normal: 'ok',
  watch: 'warn',
  alert: 'danger',
};

/** 지표들을 신호등 3색으로 묶어 센다. */
export function tallyRisk(digest: RiskDigest): { items: SignalTallyItem[]; total: number } {
  const available = digest.indicators.filter((i) => i.value !== null);
  const items = SIGNAL_ORDER.map((s) => {
    const group = available.filter((i) => riskSignal(i.level) === s);
    return { signal: s, count: group.length, names: group.map((i) => i.shortName) };
  });
  return { items, total: available.length };
}

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

export function RiskBandBar({
  indicator,
  showLabels = true,
  height = 12,
}: {
  indicator: RiskIndicator;
  showLabels?: boolean;
  height?: number;
}) {
  const span = indicator.scaleMax - indicator.scaleMin;
  if (span <= 0) return null;

  const segments = indicator.bands.map((b) => {
    const from = Math.max(indicator.scaleMin, b.from ?? indicator.scaleMin);
    const to = Math.min(indicator.scaleMax, b.to ?? indicator.scaleMax);
    return { ...b, width: Math.max(0, ((to - from) / span) * 100) };
  });

  const current = indicator.bands.find((b) => b.level === indicator.level);
  const tick = (v: number) => formatNumber(v, indicator.precision > 2 ? 2 : indicator.precision);

  return (
    <div>
      <div
        className="tl-band relative"
        style={{ height }}
        role="img"
        aria-label={`${indicator.name} 신호등 구간 막대. 왼쪽부터 ${indicator.bands
          .map((b) => `${RISK_LEVEL_LABEL[b.level]} ${b.label}`)
          .join(', ')}. 현재는 ${RISK_LEVEL_LABEL[indicator.level]} 구간.`}
      >
        {segments.map((s, idx) => (
          <span
            key={idx}
            data-on={s.level === indicator.level ? '1' : '0'}
            style={{ width: `${s.width}%`, background: RISK_FILL[s.level] }}
          />
        ))}
        {indicator.position !== null ? (
          <span
            aria-hidden="true"
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${indicator.position}%`,
              height: height + 6,
              width: 3,
              background: 'var(--fg-strong)',
              boxShadow: '0 0 0 2px var(--surface)',
            }}
          />
        ) : null}

        {/* 눈금을 벗어난 값을 조용히 가장자리에 붙여 두면 "더 갈 데가 없다"로 잘못 읽힌다.
            막대 밖으로 화살표를 내밀어 값이 눈금 너머에 있다는 사실을 보이게 한다. */}
        {indicator.offScale ? (
          <span
            aria-hidden="true"
            className="absolute top-1/2 -translate-y-1/2 text-[11px] leading-none font-bold"
            style={{
              [indicator.offScale === 'above' ? 'right' : 'left']: -11,
              color: RISK_COLOR[indicator.level],
            }}
          >
            {indicator.offScale === 'above' ? '›' : '‹'}
          </span>
        ) : null}
      </div>

      {showLabels ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
          <span className="tnum shrink-0 text-subtle">
            {indicator.offScale === 'below' ? '‹ ' : ''}
            {tick(indicator.scaleMin)}
          </span>
          <span
            className="inline-flex min-w-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold"
            style={{
              color: RISK_COLOR[indicator.level],
              background: `color-mix(in srgb, ${RISK_COLOR[indicator.level]} 14%, transparent)`,
            }}
          >
            <SignalDot signal={riskSignal(indicator.level)} size={6} />
            <span className="truncate">
              {indicator.offScale ? '눈금 밖 · ' : '지금 여기 · '}
              {RISK_LEVEL_LABEL[indicator.level]} {current?.label ?? ''}
            </span>
          </span>
          <span className="tnum shrink-0 text-subtle">
            {tick(indicator.scaleMax)}
            {indicator.offScale === 'above' ? ' ›' : ''}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 막대가 어디까지만 그려지는지 밝히는 한 줄.
 *
 * 눈금 끝을 "위험의 끝"으로 읽으면 VIX 40 과 VIX 80 이 같아 보인다.
 * 그래서 눈금이 평소 범위에 맞춘 것이라는 사실과, 과거엔 얼마나 더 갔는지를 같이 적는다.
 */
export function ScaleNote({ indicator }: { indicator: RiskIndicator }) {
  if (!indicator.scaleNote) return null;
  return (
    <p className="mt-1.5 text-[10px] leading-relaxed break-keep text-subtle">
      <span aria-hidden="true">※ </span>
      {indicator.scaleNote}
    </p>
  );
}

/**
 * "오르면 / 내리면 무슨 일이 벌어지는가".
 *
 * 지표 이름과 숫자만 봐서는 처음 보는 사람이 방향의 의미를 알 수 없다.
 * 화살표는 값의 방향일 뿐 좋고 나쁨이 아니므로, 등락 색(빨강·파랑)을 쓰지 않고
 * 중립적인 회색 계열로 그린다.
 */
function UpDownExplainer({ whenUp, whenDown }: { whenUp: string; whenDown: string }) {
  return (
    <dl className="mt-2.5 space-y-1.5 rounded-lg bg-surface-2 px-2.5 py-2">
      {[
        { glyph: '▲', label: '값이 오르면', text: whenUp },
        { glyph: '▼', label: '값이 내리면', text: whenDown },
      ].map((row) => (
        <div key={row.label} className="flex items-start gap-1.5">
          <span aria-hidden="true" className="mt-px shrink-0 text-[10px] text-muted">
            {row.glyph}
          </span>
          <dt className="sr-only">{row.label}</dt>
          <dd className="min-w-0 text-[11px] leading-relaxed break-keep text-muted">
            <span className="font-semibold text-fg">{row.label} · </span>
            {row.text}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 구간 기준을 그대로 펼쳐 보여주는 목록. 어디까지가 초록이고 어디부터 빨강인지 숨기지 않는다. */
function RiskZoneList({ indicator }: { indicator: RiskIndicator }) {
  return (
    <ul className="flex flex-wrap gap-x-2.5 gap-y-1">
      {indicator.bands.map((b, i) => {
        const active = b.level === indicator.level;
        return (
          <li key={i} className="flex items-center gap-1 text-[10px]">
            <span
              aria-hidden="true"
              className="inline-block shrink-0 rounded-sm"
              style={{
                width: 8,
                height: active ? 10 : 6,
                background: RISK_FILL[b.level],
                boxShadow: `0 0 0 1px color-mix(in srgb, ${RISK_COLOR[b.level]} 45%, transparent)`,
              }}
            />
            <span style={{ color: active ? RISK_COLOR[b.level] : 'var(--subtle-fg)', fontWeight: active ? 700 : 400 }}>
              {RISK_LEVEL_LABEL[b.level]} {b.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* 컴팩트 타일 (홈)                                                       */
/* ------------------------------------------------------------------ */

/**
 * 신호등 타일 — 누르면 **그 자리에서** 해설이 열린다.
 *
 * 예전에는 타일 여섯 장이 전부 /indicators 로 나갔다. 바로 위 '기준과 해설 →' 도
 * 같은 곳이라, 홈 한 화면에서 같은 데로 가는 링크가 일곱 개였다. 궁금해서 눌렀는데
 * 화면이 통째로 바뀌고 돌아올 길은 없으니, 몇 번 하면 여기가 어디인지 모르게 된다.
 *
 * 해설은 이미 indicatorGuide 에 있다. 다른 화면에 가서 읽을 이유가 없다.
 * 그래서 타일을 누르면 아래로 펼쳐지고, 다시 누르면 접힌다. 화면은 그대로다.
 */
export function RiskTile({ indicator }: { indicator: RiskIndicator }) {
  const c = useChangeColor();
  const unavailable = indicator.value === null;
  const [open, setOpen] = useState(false);
  const guide = guideFor(indicator.id);
  const panelId = `risk-tile-${indicator.id}`;

  return (
    <div className="card p-2.5">
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      aria-controls={guide ? panelId : undefined}
      className="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
    >
      <div className="flex items-start gap-1.5">
        <SignalLight signal={riskSignal(indicator.level)} size="sm" label={indicator.shortName} />
        {/* 시장과 단계를 한 줄에 붙인다. 세 줄로 쌓으면 타일이 그만큼 길어진다. */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-fg">{indicator.shortName}</p>
          <p className="flex items-center gap-1 text-[9.5px] text-subtle">
            <span className="truncate">{SCOPE_LABEL[indicator.scope]}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0 font-bold" style={{ color: RISK_COLOR[indicator.level] }}>
              <span aria-hidden="true">{RISK_LEVEL_GLYPH[indicator.level]}</span> {RISK_LEVEL_LABEL[indicator.level]}
            </span>
          </p>
        </div>
      </div>

      {unavailable ? (
        <p className="mt-1.5 text-[10px]" style={{ color: 'var(--warn)' }}>
          {indicator.unavailableReason ?? '값 없음'}
        </p>
      ) : (
        <div className="mt-1.5 flex items-baseline justify-between gap-1">
          <span className="tnum truncate text-[15px] font-bold text-fg-strong">
            {formatRiskValue(indicator.value, indicator)}
          </span>
          <span className="tnum shrink-0 text-[10px]" style={{ color: c.color(indicator.change) }}>
            {c.glyph(indicator.change)} {formatRiskChange(indicator.change, indicator)}
          </span>
        </div>
      )}

      <div className="mt-2">
        <RiskBandBar indicator={indicator} showLabels={false} height={10} />
      </div>

      <p className="mt-1.5 flex items-center justify-end gap-1 text-[9.5px] text-subtle">
        {open ? '접기' : '무슨 뜻인가요'}
        <span aria-hidden="true" className={open ? 'rotate-180 transition-transform' : 'transition-transform'}>
          ⌄
        </span>
      </p>
    </button>

    {open && guide ? (
      <div id={panelId} className="mt-2 border-t border-border pt-2">
        <p className="text-[11px] leading-relaxed break-keep text-fg">{guide.plain}</p>
        <dl className="mt-2 grid gap-1.5">
          <div>
            <dt className="text-[10px] font-semibold" style={{ color: 'var(--tl-red)' }}>
              올라가면
            </dt>
            <dd className="m-0 text-[10.5px] leading-relaxed break-keep text-muted">{guide.whenUp}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold" style={{ color: 'var(--tl-green)' }}>
              내려가면
            </dt>
            <dd className="m-0 text-[10.5px] leading-relaxed break-keep text-muted">{guide.whenDown}</dd>
          </div>
        </dl>
        {/* 구간 기준까지 보려면 그때 나가면 된다. 먼저 나가게 만들지는 않는다. */}
        <Link
          href="/indicators"
          className="mt-2 inline-block text-[10.5px] font-semibold text-accent hover:underline"
        >
          구간 기준과 다른 지표 보기 →
        </Link>
      </div>
    ) : null}

    {open && !guide ? (
      <p className="mt-2 border-t border-border pt-2 text-[10.5px] text-subtle">
        이 지표의 해설은 아직 준비되지 않았습니다.
      </p>
    ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 전체 카드 (지표 화면의 위험 신호등 보기)                                                     */
/* ------------------------------------------------------------------ */

export function RiskCard({ indicator }: { indicator: RiskIndicator }) {
  const c = useChangeColor();
  const unavailable = indicator.value === null;

  return (
    <article className="card p-3.5" aria-labelledby={`risk-${indicator.id}`}>
      <div className="flex items-start gap-2">
        <SignalLight signal={riskSignal(indicator.level)} size="lg" label={indicator.name} />
        <div className="min-w-0 flex-1">
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
        <ScaleNote indicator={indicator} />
      </div>

      {/* 구간 기준을 그대로 노출한다 */}
      <div className="mt-2.5">
        <RiskZoneList indicator={indicator} />
      </div>

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

      {/* 오르내리면 무슨 일이 생기는가 — 숫자만 보고는 알 수 없는 부분이다 */}
      <UpDownExplainer whenUp={indicator.whenUp} whenDown={indicator.whenDown} />

      <p className="mt-2 text-[10px] text-subtle">
        기준 {formatKstTime(indicator.meta.asOf)} · 출처 {indicator.meta.sources[0]?.name ?? '알 수 없음'}
      </p>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* 홈 섹션                                                              */
/* ------------------------------------------------------------------ */

export function RiskGaugesSection() {
  const { snapshot, refresh } = useData();
  const section = snapshot?.sections.risk ?? null;

  return (
    <section aria-labelledby="risk-seven-title" className="mt-5 px-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="risk-seven-title" className="text-base font-bold text-fg-strong">
          시장 위험 신호등
        </h2>
        <Link href="/indicators" className="text-[11px] font-semibold text-accent hover:underline">
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
        {(digest) => {
          const tally = tallyRisk(digest);
          const worst = digest.alertCount > 0 ? 'red' : digest.watchCount > 0 ? 'yellow' : 'green';
          return (
            <>
              {/* 신호등 집계 — 색깔별 개수만 세도 전체 분위기가 잡힌다 */}
              <div className="mb-2">
                <SignalTally items={tally.items} total={tally.total} />
              </div>

              <div
                className="mb-2 flex items-start gap-2 rounded-xl border px-3 py-2.5"
                style={{
                  borderColor: `color-mix(in srgb, ${signalColor(worst)} 38%, var(--border))`,
                  background: 'var(--surface)',
                }}
                role="status"
              >
                <SignalLight signal={worst} size="sm" label="종합" />
                {/* 이름은 아래 게이지들이 댄다. 문장은 개수만 말한다. */}
                <p className="min-w-0 flex-1 text-[12px] leading-relaxed break-keep text-fg">
                  {buildRiskHeadline(digest.indicators, false)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {digest.indicators.map((i) => (
                  <RiskTile key={i.id} indicator={i} />
                ))}
              </div>

              <div className="mt-2">
                {/* 범례의 세 칸이 이미 '평소 범위 / 살펴볼 수준 / 경계 수준' 이라고 말한다.
                    그 아래에 두 문장을 더 붙이면 같은 말을 길게 반복하는 것이 된다. */}
                <SignalLegend note="사라·팔라는 신호가 아닙니다." />
              </div>
            </>
          );
        }}
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
              <Link href="/indicators" className="text-[11px] font-semibold text-accent hover:underline">
                신호등 전체 →
              </Link>
            </div>
            <ul className="space-y-2.5">
              {items.map((i) => (
                <li key={i.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <SignalDot signal={riskSignal(i.level)} size={8} />
                      <span className="truncate text-[12px] text-fg">{i.shortName}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="tnum text-[12px] font-bold text-fg-strong">
                        {formatRiskValue(i.value, i)}
                      </span>
                      <span className="text-[10px] font-semibold" style={{ color: RISK_COLOR[i.level] }}>
                        {RISK_LEVEL_GLYPH[i.level]} {RISK_LEVEL_LABEL[i.level]}
                      </span>
                    </span>
                  </div>
                  <RiskBandBar indicator={i} showLabels={false} height={10} />
                </li>
              ))}
            </ul>
          </div>
        );
      }}
    </SectionGate>
  );
}
