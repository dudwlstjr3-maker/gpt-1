'use client';

/**
 * 시장 지수 판 — 미국 · 한국 · 크립토의 시장 전체를 재는 값들.
 *
 * '지수' 탭의 두 보기 가운데 하나로 들어간다 (/indices). 머리와 보기 전환은
 * IndexScreen 이 그리고, 여기서는 본문만 그린다.
 *
 * 왜 따로 떼어 놨나.
 *  - 지수는 종목과 성격이 다르다. 살 수 있는 물건이 아니라 시장의 온도계다.
 *    홈의 "관심 가격과 주요 지수" 안에서는 삼성전자 옆에 KOSPI 가 붙어 섞였다.
 *  - 시장 탭을 없앤 뒤로 지수 목록을 찾아 들어갈 자리가 마땅치 않았다.
 *
 * 세 시장을 한 화면에 나란히 쌓는다. 고르게 하지 않는다 — 지수는 다 합쳐도
 * 열네 개라 한 번에 훑는 편이 빠르고, 미국이 빠졌는지 한국이 빠졌는지도 바로 보인다.
 *
 * 어떤 지수가 있는지는 카탈로그에 적혀 있고 값만 받아 온다. 그래서 목록·이름·기준점은
 * 값이 오기 전에도 그대로 서 있고, 값 자리에만 빈 칸이 뜬다. 통째로 회색 덩어리가
 * 됐다가 갑자기 바뀌면 무엇을 기다리는지 알 수 없다.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { Notice, Skeleton } from '@/components/ui/States';
import { Badge, FreshnessBadge } from '@/components/ui/Badge';
import { Sparkline } from '@/components/charts/Sparkline';
import { useFormatter } from '@/components/market/useFormatter';
import { indicesFor, type CatalogItem } from '@/lib/catalog';
import { marketColor } from '@/lib/scale';
import { formatKstTime, NO_VALUE } from '@/lib/format';
import { MARKET_IDS, MARKET_LABEL, type MarketId, type Quote } from '@/types';

/** 시장마다 "이 목록이 무엇인지" 한 줄. 크립토는 공식 지수가 없다는 사실을 밝힌다. */
const GROUP_NOTE: Record<MarketId, string> = {
  us: '뉴욕 증시 전체를 재는 지수와 변동성 · 달러 지수입니다.',
  kr: '유가증권 · 코스닥 시장을 재는 지수와 변동성 지수입니다.',
  crypto:
    'KOSPI 나 S&P 500 같은 공식 지수는 크립토에 없습니다. 대신 시장 전체 크기를 재는 값들을 놓았습니다.',
};

/** 지수 한 줄. 값이 아직 없으면 이름과 기준점만 세워 두고 숫자 자리를 비운다. */
function IndexRow({
  item,
  quote,
  loading,
}: {
  item: CatalogItem;
  quote: Quote | null;
  loading: boolean;
}) {
  const f = useFormatter();
  const dir = quote ? f.direction(quote) : 'none';
  const color = f.color(dir);
  const hasValue = quote !== null && quote.price !== null;
  const delay = quote?.meta.sources[0]?.delayMinutes ?? null;

  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-fg-strong">{item.name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-subtle">
          <span className="tnum">{item.symbol}</span>
          {quote ? (
            <>
              <span aria-hidden="true">·</span>
              <span>기준 {formatKstTime(quote.meta.asOf)}</span>
            </>
          ) : null}
        </p>
      </div>

      {hasValue ? (
        <Sparkline
          points={quote.spark}
          width={56}
          height={22}
          fill={false}
          color={color === 'var(--muted-fg)' ? 'var(--accent)' : color}
          ariaLabel={`${item.name} 최근 추이`}
        />
      ) : null}

      <div className="shrink-0 text-right">
        {loading && !quote ? (
          <Skeleton className="h-[30px] w-[62px] rounded-md" />
        ) : hasValue ? (
          <>
            <p className="tnum text-[13.5px] leading-tight font-bold text-fg-strong">{f.price(quote)}</p>
            <p className="tnum mt-0.5 text-[11px] font-semibold" style={{ color }}>
              <span aria-hidden="true">{f.glyph(dir)}</span> {f.changePct(quote)}
            </p>
          </>
        ) : (
          <p className="text-[12px] font-semibold" style={{ color: 'var(--warn)' }}>
            {NO_VALUE}
          </p>
        )}
      </div>

      {quote ? <FreshnessBadge freshness={quote.meta.freshness} delayMinutes={delay} /> : null}
    </>
  );

  return (
    <li className="border-b border-border last:border-b-0">
      {quote ? (
        <Link
          href={`/asset/${item.id}`}
          className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface-2"
          aria-label={`${item.name} ${hasValue ? `${f.price(quote)} ${f.srChange(quote)}` : '값 없음'}`}
        >
          {inner}
        </Link>
      ) : (
        <div className="flex items-center gap-2.5 px-3 py-2.5">{inner}</div>
      )}

      {/* 기준점 — "3,714" 라는 숫자는 언제를 100 으로 놓았는지 알아야 읽힌다 */}
      {item.baseline ? (
        <p className="px-3 pb-2 text-[10.5px] leading-relaxed break-keep text-subtle">
          <span className="font-semibold text-muted">기준 · </span>
          {item.baseline}
        </p>
      ) : null}
      {/* 값을 못 받은 이유는 그 줄에서 밝힌다. 0 으로 채우거나 줄을 지우지 않는다. */}
      {!loading && !hasValue ? (
        <p className="px-3 pb-2 text-[10.5px] leading-relaxed break-keep" style={{ color: 'var(--warn)' }}>
          {quote?.unavailableReason ?? '값을 받지 못했습니다.'}
        </p>
      ) : null}
    </li>
  );
}

export function MarketIndexBoard() {
  const { snapshot, refresh } = useData();
  const section = snapshot?.sections.quotes ?? null;
  const loading = section === null || section.status === 'loading';
  const failed = section !== null && (section.status === 'error' || section.data === null);

  /** 목록은 카탈로그가 정하고, 값은 받아 온 것을 붙인다 */
  const groups = useMemo(() => {
    const data = section?.data ?? null;
    return MARKET_IDS.map((m) => {
      const byId = new Map((data?.[m] ?? []).map((q) => [q.id, q]));
      return {
        market: m,
        rows: indicesFor(m).map((c) => ({ item: c, quote: byId.get(c.id) ?? null })),
      };
    });
  }, [section]);

  return (
    <>
      {failed ? (
        <div className="px-3">
          <Notice tone="danger">
            {section?.error ?? '지수 값을 받지 못했습니다.'}{' '}
            <button type="button" onClick={refresh} className="font-semibold underline">
              다시 시도
            </button>
          </Notice>
        </div>
      ) : null}

      <div className={failed ? 'mt-3 px-3' : 'px-3'}>
        <div className="space-y-3 lg:grid lg:grid-cols-3 lg:items-start lg:gap-3 lg:space-y-0">
          {groups.map((g) => (
            <section key={g.market} aria-labelledby={`idx-${g.market}`} className="card overflow-hidden">
              <div
                className="flex items-center justify-between gap-2 border-b border-border px-3 py-2"
                style={{ background: `color-mix(in srgb, ${marketColor(g.market)} 8%, transparent)` }}
              >
                <h2 id={`idx-${g.market}`} className="flex items-center gap-1.5 text-[13px] font-bold">
                  {/* 색은 훑기용 표식일 뿐이고, 어느 시장인지는 옆의 글자가 말한다 */}
                  <span
                    aria-hidden="true"
                    className="block h-2 w-2 rounded-full"
                    style={{ background: marketColor(g.market) }}
                  />
                  <span style={{ color: marketColor(g.market) }}>{MARKET_LABEL[g.market]}</span>
                </h2>
                <Link
                  href={`/market/${g.market}`}
                  className="shrink-0 text-[11px] font-semibold text-accent hover:underline"
                >
                  시장 화면 →
                </Link>
              </div>

              <p className="px-3 py-2 text-[10.5px] leading-relaxed break-keep text-subtle">
                {GROUP_NOTE[g.market]}
              </p>

              <ul className="border-t border-border">
                {g.rows.map((r) => (
                  <IndexRow key={r.item.id} item={r.item} quote={r.quote} loading={loading} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <section aria-labelledby="idx-help" className="mt-4 px-3">
        <div className="card p-3">
          <h2 id="idx-help" className="text-[13px] font-bold text-fg-strong">
            지수 숫자를 읽는 법
          </h2>
          <ul className="mt-2 space-y-2 text-[11.5px] leading-relaxed break-keep text-muted">
            <li>
              <span className="font-semibold text-fg">기준점부터 봅니다. </span>
              KOSPI 는 1980년 1월 4일의 한국 증시를 100 으로 놓고 잰 값입니다. 지금 3,700 이라면 그때의 37배라는
              뜻입니다. 기준이 다른 지수끼리 숫자를 직접 견주는 것은 뜻이 없습니다.
            </li>
            <li>
              <span className="font-semibold text-fg">변동성 지수는 방향이 반대입니다. </span>
              VIX · VKOSPI 는 오를수록 시장이 불안하다는 뜻입니다. 기준 시점 없이 예상 변동폭을 연율 % 로 나타냅니다.
            </li>
            <li>
              <span className="font-semibold text-fg">지수는 살 수 있는 물건이 아닙니다. </span>
              시장을 재는 눈금이라서, 실제로 사고파는 것은 그 지수를 따라가도록 만든 상품입니다.
            </li>
          </ul>
          <p className="mt-2.5 border-t border-border pt-2 text-[10.5px] leading-relaxed break-keep text-subtle">
            지수마다 산출 기관과 방식이 다릅니다. 이 화면은 값을 받아 그대로 보여줄 뿐, 다시 계산하지 않습니다.
          </p>
        </div>
      </section>

      {snapshot?.mode === 'DEMO' ? (
        <div className="mt-3 px-3">
          <Badge tone="demo" size="xs">
            DEMO 샘플 값
          </Badge>
        </div>
      ) : null}
    </>
  );
}
