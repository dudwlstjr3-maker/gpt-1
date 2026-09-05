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
        <div className="flex min-w-0 items-center gap-2.5">
          {showStar ? (
            /*
             * 별표는 글자로는 작아야 맞지만 손가락에는 14px 이 너무 작았다.
             * 글리프는 그대로 두고 ::after 로 누를 자리만 36×44 로 넓힌다.
             * 가로로 넓힌 만큼은 옆 칸과의 간격(gap-2.5)이라, 이름 링크를 덮지 않는다.
             */
            <button
              type="button"
              onClick={() => toggleWatch(quote.id)}
              aria-pressed={watched}
              aria-label={watched ? `${quote.name} 관심목록에서 제거` : `${quote.name} 관심목록에 추가`}
              className="relative shrink-0 text-base leading-none after:absolute after:-inset-x-2.5 after:-inset-y-[14px] after:content-['']"
              style={{ color: watched ? 'var(--warn)' : 'var(--subtle-fg)' }}
            >
              {watched ? '★' : '☆'}
            </button>
          ) : null}
          <div className="min-w-0">
            <Link href={`/asset/${quote.id}`} className="block truncate text-sm font-semibold text-fg-strong hover:underline">
              {quote.name}
            </Link>
            {/* 기준 시각을 기호 옆에 붙인다. 예전에는 카드마다 아래에 구분선을 긋고
                시각 하나만 적은 줄이 따로 있었다 — 여덟 장이면 줄 여덟, 선 여덟이었다. */}
            <p className="truncate text-[11.5px] text-subtle">
              {quote.symbol} <span className="tnum">· {formatKstTime(quote.meta.asOf)}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SessionBadge phase={quote.session} />
          <FreshnessBadge freshness={quote.meta.freshness} delayMinutes={delay} />
        </div>
      </div>

      {/*
       * 값을 못 받아도 카드가 차지하는 자리는 그대로 둔다.
       * 값 줄(41px)과 거래량 줄(17px)이 통째로 빠지면 카드가 135px 에서 106px 로 줄어
       * 아래 카드들이 위로 딸려 올라온다. 목록에서 한 종목만 실패해도 화면이 흔들린다.
       */}
      {unavailable ? (
        <div
          className="mt-2 flex items-center rounded-lg px-2.5 py-2"
          style={{ background: 'color-mix(in srgb, var(--warn) 10%, transparent)', minHeight: 64 }}
        >
          <p className="text-[12.5px] break-keep" style={{ color: 'var(--warn)' }}>
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

      {/*
       * 아래 줄은 할 말이 있을 때만 그린다.
       * 출처는 카드마다 적지 않는다 — DEMO/LIVE 는 상단 상태바가, 자세한 출처와
       * 이용 조건은 종목 상세 화면이 말한다. 값을 잘못 읽게 만드는 것(환산 불가)만 띄운다.
       */}
      {quote.volume !== null || f.conversionUnavailable(quote) ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-subtle">
          {quote.volume !== null ? <span>거래량 {formatKoreanCompact(quote.volume, 1)}</span> : null}
          {f.conversionUnavailable(quote) ? (
            <span style={{ color: 'var(--warn)' }}>환율 없음 — 환산 불가</span>
          ) : null}
        </div>
      ) : null}
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
        <p className="text-[11.5px] text-subtle">
          {quote.symbol} · 기준 {formatKstTime(quote.meta.asOf)}
        </p>
      </div>
      <Sparkline points={quote.spark} width={56} height={22} fill={false} color={color === 'var(--muted-fg)' ? 'var(--accent)' : color} />
      <div className="shrink-0 text-right">
        <p className="tnum text-[13px] font-bold text-fg-strong">
          {quote.price === null ? NO_VALUE : f.price(quote)}
        </p>
        <p className="tnum text-[12.5px] font-semibold" style={{ color }}>
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
      <p className="truncate text-[11.5px] text-muted">{label}</p>
      <p className="tnum mt-0.5 truncate text-sm font-bold" style={{ color }}>
        {value}
      </p>
      {sub ? <p className="tnum truncate text-[11.5px] text-subtle">{sub}</p> : null}
      <p className="mt-1 flex items-center gap-1 text-[11.5px]" style={{ color: tone === 'normal' ? 'var(--subtle-fg)' : color }}>
        <span aria-hidden="true">{tone === 'alert' ? '▲' : tone === 'watch' ? '△' : '·'}</span>
        <span className="truncate">
          {toneLabel}
          {note ? ` · ${note}` : ''}
        </span>
      </p>
    </div>
  );
}

export function formatMacroValue(
  value: number | null,
  precision: number,
  unit: string,
  suffix?: string,
): string {
  if (value === null) return NO_VALUE;
  const n = formatNumber(value, precision);
  // 지표가 자기 단위를 직접 들고 오면(조원, 개, 잔 …) 그걸 그대로 쓴다.
  if (suffix) return `${n}${suffix}`;
  if (unit === 'percent') return `${n}%`;
  if (unit === 'bp') return `${n}bp`;
  if (unit === 'usd_bn') return `$${formatNumber(value / 1000, 2)}T`;
  if (unit === 'currency') return `$${n}`;
  if (unit === 'ratio') return `${n}배`;
  return n;
}
