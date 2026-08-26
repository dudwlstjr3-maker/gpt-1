'use client';

/**
 * 가격 카드 — 현재가·등락·통화/단위·장 상태·미니 차트·거래량·기준 시각·지연 여부·출처.
 * 값이 없으면 0 으로 채우지 않고 사유를 보여준다.
 */

import Link from 'next/link';
import { FreshnessBadge, SessionBadge } from '@/components/ui/Badge';
import { Sparkline } from '@/components/charts/Sparkline';
import { useSettings } from '@/components/providers/SettingsProvider';
import { useFormatter } from './useFormatter';
import { formatKoreanCompact, formatKstTime, formatNumber, NO_VALUE } from '@/lib/format';
import { DIRECTION_LABEL } from '@/lib/scale';
import type { Quote } from '@/types';

export function PriceCard({ quote, showStar = true }: { quote: Quote; showStar?: boolean }) {
  const f = useFormatter();
  const { isWatched, toggleWatch } = useSettings();
  const dir = f.direction(quote);
  const color = f.color(dir);
  const watched = isWatched(quote.id);
  const delay = quote.meta.sources[0]?.delayMinutes ?? null;
  const unavailable = quote.price === null;

  return (
    <article className="card relative p-3" aria-label={`${quote.name} 시세`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {showStar ? (
            <button
              type="button"
              onClick={() => toggleWatch(quote.id)}
              aria-pressed={watched}
              aria-label={watched ? `${quote.name} 관심목록에서 제거` : `${quote.name} 관심목록에 추가`}
              className="shrink-0 text-sm leading-none"
              style={{ color: watched ? 'var(--warn)' : 'var(--subtle-fg)' }}
            >
              {watched ? '★' : '☆'}
            </button>
          ) : null}
          <div className="min-w-0">
            <Link href={`/asset/${quote.id}`} className="block truncate text-sm font-semibold text-fg-strong hover:underline">
              {quote.name}
            </Link>
            <p className="truncate text-[10px] text-subtle">{quote.symbol}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SessionBadge phase={quote.session} />
          <FreshnessBadge freshness={quote.meta.freshness} delayMinutes={delay} />
        </div>
      </div>

      {unavailable ? (
        <div className="mt-2 rounded-lg px-2.5 py-2" style={{ background: 'color-mix(in srgb, var(--warn) 10%, transparent)' }}>
          <p className="text-[11px] break-keep" style={{ color: 'var(--warn)' }}>
            {quote.unavailableReason ?? '값을 받지 못했습니다.'}
          </p>
        </div>
      ) : (
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="tnum truncate text-lg leading-tight font-bold text-fg-strong">{f.price(quote)}</p>
            <p className="tnum mt-0.5 flex items-center gap-1 text-xs font-semibold" style={{ color }}>
              <span aria-hidden="true">{f.glyph(dir)}</span>
              <span>{f.change(quote)}</span>
              <span>({f.changePct(quote)})</span>
              <span className="sr-only">{DIRECTION_LABEL[dir]}</span>
            </p>
          </div>
          <Sparkline
            points={quote.spark}
            width={84}
            height={30}
            color={color === 'var(--muted-fg)' ? 'var(--accent)' : color}
            ariaLabel={`${quote.name} 최근 추이`}
          />
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-border pt-1.5 text-[10px] text-subtle">
        {quote.volume !== null ? <span>거래량 {formatKoreanCompact(quote.volume, 1)}</span> : null}
        <span>기준 {formatKstTime(quote.meta.asOf)}</span>
        <span className="truncate">출처 {quote.meta.sources[0]?.name ?? '알 수 없음'}</span>
        {f.conversionUnavailable(quote) ? (
          <span style={{ color: 'var(--warn)' }}>환율 없음 — 환산 불가</span>
        ) : null}
      </div>
    </article>
  );
}

/** 지수·환율처럼 한 줄로 빽빽하게 보여줄 때 쓰는 컴팩트 행 */
export function PriceRow({ quote }: { quote: Quote }) {
  const f = useFormatter();
  const dir = f.direction(quote);
  const color = f.color(dir);

  return (
    <Link
      href={`/asset/${quote.id}`}
      className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 hover:bg-surface-2"
    >
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-fg">{quote.name}</p>
        <p className="text-[10px] text-subtle">
          {quote.symbol} · 기준 {formatKstTime(quote.meta.asOf)}
        </p>
      </div>
      <Sparkline points={quote.spark} width={56} height={22} fill={false} color={color === 'var(--muted-fg)' ? 'var(--accent)' : color} />
      <div className="shrink-0 text-right">
        <p className="tnum text-[13px] font-bold text-fg-strong">
          {quote.price === null ? NO_VALUE : f.price(quote)}
        </p>
        <p className="tnum text-[11px] font-semibold" style={{ color }}>
          <span aria-hidden="true">{f.glyph(dir)}</span> {f.changePct(quote)}
        </p>
      </div>
    </Link>
  );
}

/** 지표 요약 타일 (금리·환율·변동성 등) */
export function StatTile({
  label,
  value,
  sub,
  tone,
  note,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'normal' | 'watch' | 'alert' | 'unknown';
  note?: string;
}) {
  const color =
    tone === 'alert' ? 'var(--danger)' : tone === 'watch' ? 'var(--warn)' : tone === 'unknown' ? 'var(--muted-fg)' : 'var(--fg-strong)';
  const toneLabel = tone === 'alert' ? '주의' : tone === 'watch' ? '관찰' : tone === 'unknown' ? '정보 없음' : '정상';
  return (
    <div className="card-flat min-w-0 p-2.5">
      <p className="truncate text-[10px] text-muted">{label}</p>
      <p className="tnum mt-0.5 truncate text-sm font-bold" style={{ color }}>
        {value}
      </p>
      {sub ? <p className="tnum truncate text-[10px] text-subtle">{sub}</p> : null}
      <p className="mt-1 flex items-center gap-1 text-[10px]" style={{ color: tone === 'normal' ? 'var(--subtle-fg)' : color }}>
        <span aria-hidden="true">{tone === 'alert' ? '▲' : tone === 'watch' ? '△' : '·'}</span>
        <span className="truncate">
          {toneLabel}
          {note ? ` · ${note}` : ''}
        </span>
      </p>
    </div>
  );
}

export function formatMacroValue(value: number | null, precision: number, unit: string): string {
  if (value === null) return NO_VALUE;
  const n = formatNumber(value, precision);
  if (unit === 'percent') return `${n}%`;
  if (unit === 'bp') return `${n}bp`;
  if (unit === 'usd_bn') return `$${formatNumber(value / 1000, 2)}T`;
  if (unit === 'currency') return `$${n}`;
  if (unit === 'ratio') return `${n}배`;
  return n;
}
