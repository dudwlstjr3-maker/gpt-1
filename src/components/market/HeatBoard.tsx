'use client';

/**
 * 오늘 불타는 것과 얼어붙은 것.
 *
 * 무엇을 보여주나
 *   미국 · 한국 · 크립토에서 **가장 많이 오른 것 하나와 가장 많이 내린 것 하나**씩,
 *   모두 여섯 개. 홈에서 "오늘 무슨 일이 있었나" 를 한눈에 잡는 자리다.
 *
 * 왜 '몇 %' 로 줄을 세우지 않나
 *   그러면 크립토가 늘 이긴다. 원래 많이 움직이는 것이라 하루 8% 가 평범할 수 있고,
 *   코스피가 8% 움직이면 사건이다. 그래서 그 종목이 **평소 움직이던 폭에 견줘**
 *   오늘이 얼마나 유별났는지로 잰다. 계산은 src/lib/heatRank.mjs 가 한다.
 *
 * 말을 세게 쓰되 넘지 않는 선
 *   '불탄다' 는 얼마나 크게 움직였는가에 대한 말이다. 좋다·나쁘다가 아니고,
 *   사라·팔라는 뜻은 더더욱 아니다. 그 사실을 화면 아래에 적어 둔다.
 *
 * 색만으로 뜻을 전하지 않는다
 *   불꽃·눈결정과 붉은빛·푸른빛은 거들 뿐이고, 방향은 늘 기호(▲▼)와 글자가 말한다.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, EmptyState } from '@/components/ui/States';
import { Sparkline } from '@/components/charts/Sparkline';
import { useFormatter } from './useFormatter';
import { formatNumber, NO_VALUE } from '@/lib/format';
import { pickHeat } from '@/lib/heatRank.mjs';
import type { HeatPick } from '@/lib/heatRank.d.mts';
import { MARKET_LABEL, INDEX_MARKET_IDS, type MarketId } from '@/types';

/** 값이 있는 것만 고른다. 지표·통계(펀딩비·청산 규모)는 '종목' 이 아니라 뺀다. */
const TRADABLE = new Set(['equity', 'index', 'crypto', 'commodity']);

const MARKET_NOTE: Record<string, string> = {
  us: '지수와 개별주',
  kr: '지수와 개별주',
  crypto: '24시간 거래',
};

/** 불꽃 — 세기에 따라 심지가 자라고 불똥이 튄다. 좌우 대칭이면 물방울로 보인다. */
function Flame({ t }: { t: number }) {
  return (
    <svg viewBox="0 0 24 24" className="heat-flame size-8 shrink-0" aria-hidden="true">
      <path
        d="M13.4 1.8c-.3 2.6.4 4.3 1.7 5.9 1.6 2 3.1 3.6 3.1 6.4a6.3 6.3 0 0 1-12.6 0c0-2 .7-3.5 1.8-4.8.1 1.1.6 1.9 1.4 2.4.2-3.8 1.7-6.9 4.6-9.9Z"
        fill="currentColor"
        opacity={0.2 + 0.45 * t}
      />
      <path
        d="M12.6 10.4c-.2 1.5.2 2.3.9 3.2.8 1 1.4 1.7 1.4 2.9a2.9 2.9 0 0 1-5.8 0c0-1.3.7-2 1.4-2.9.6-.8 1.6-1.9 2.1-3.2Z"
        fill="currentColor"
        opacity={0.55 + 0.45 * t}
      />
      {t > 0.55 ? <circle cx="6.4" cy="6.6" r="1.15" fill="currentColor" opacity={0.35 * t} /> : null}
    </svg>
  );
}

/** 눈 결정 — 세기에 따라 가지가 굵어진다 */
function Frost({ t }: { t: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-8 shrink-0"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth={1.1 + 1.1 * t}
      strokeLinecap="round"
      fill="none"
      opacity={0.45 + 0.5 * t}
    >
      {[0, 60, 120].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 12 12)`}>
          <line x1="12" y1="2.5" x2="12" y2="21.5" />
          <line x1="12" y1="5.5" x2="9" y2="8" />
          <line x1="12" y1="5.5" x2="15" y2="8" />
          <line x1="12" y1="18.5" x2="9" y2="16" />
          <line x1="12" y1="18.5" x2="15" y2="16" />
        </g>
      ))}
    </svg>
  );
}

function HeatCard({ pick }: { pick: HeatPick }) {
  const f = useFormatter();
  const q = pick.quote;
  const up = (q.changePct ?? 0) >= 0;
  const t = pick.heat?.strength ?? 0;
  const dir = f.direction(q);

  return (
    <article
      className="heat-card card relative isolate overflow-hidden p-3"
      data-hot={up ? 'true' : 'false'}
      /* 등락 색은 토큰이 아니라 설정(한국식/글로벌)에 따라 JS 가 정한다.
         카드 전체를 그 색으로 물들이고, 안쪽은 currentColor 로 받는다. */
      style={{ '--t': t.toFixed(2), color: f.color(dir) } as React.CSSProperties}
      aria-label={`${q.name} ${pick.slot}`}
    >
      <div className="heat-glow" aria-hidden="true" />

      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="text-[11.5px] leading-snug font-bold break-keep text-current">{pick.slot}</p>
          <Link
            href={`/asset/${q.id}`}
            className="mt-1 block text-[15px] leading-snug font-bold break-keep text-fg-strong hover:underline"
          >
            {q.name}
          </Link>
          <p className="mt-0.5 text-[11.5px] text-subtle">{q.symbol}</p>
        </div>
        {up ? <Flame t={t} /> : <Frost t={t} />}
      </div>

      {pick.note ? <p className="mt-2 text-[11.5px] break-keep text-warn">{pick.note}</p> : null}

      <p className="tnum mt-2 text-[22px] leading-none font-bold tracking-tight text-current">
        <span aria-hidden="true">{f.glyph(dir)}</span> {f.changePct(q)}
        <span className="sr-only">{up ? '상승' : '하락'}</span>
      </p>
      <p className="tnum mt-1 text-[12.5px] whitespace-nowrap text-fg">{f.price(q)}</p>

      <div className="mt-2 border-t border-border pt-2">
        {pick.heat ? (
          <>
            <p className="text-[15px] leading-snug font-bold break-keep text-current">{pick.heat.word}</p>
            <p className="tnum mt-1 text-[11.5px] leading-relaxed break-keep text-muted">
              평소 하루 {formatNumber(pick.sigma, 2)}% 움직이던 것이 오늘 {formatNumber(pick.heat.times, 1)}배로
            </p>
          </>
        ) : (
          <>
            <p className="text-[13px] font-bold break-keep text-muted">얼마나 유별난지 잴 수 없습니다</p>
            <p className="mt-1 text-[11.5px] leading-relaxed break-keep text-subtle">
              평소 움직이던 폭을 낼 만큼 지나온 값이 오지 않았습니다.
            </p>
          </>
        )}
      </div>

      {q.spark.length > 1 ? (
        <div className="mt-2">
          <Sparkline points={q.spark} width={160} height={32} color="currentColor" ariaLabel={`${q.name} 최근 흐름`} />
        </div>
      ) : (
        <p className="mt-2 text-[11.5px] break-keep text-subtle">지나온 값을 받지 못해 선을 그리지 않습니다.</p>
      )}
    </article>
  );
}

export function HeatBoard() {
  const { snapshot, refresh } = useData();
  const section = snapshot?.sections.quotes ?? null;

  const boards = useMemo(() => {
    const data = section?.data;
    if (!data) return [];
    return INDEX_MARKET_IDS.map((m: MarketId) => ({
      market: m,
      board: pickHeat((data[m] ?? []).filter((q) => TRADABLE.has(q.kind))),
    })).filter((x) => x.board !== null);
  }, [section]);

  return (
    <section aria-labelledby="heat-title" className="mt-5 px-3">
      <div className="mb-2">
        <h2 id="heat-title" className="text-base font-bold text-fg-strong">
          오늘 불타는 것과 얼어붙은 것
        </h2>
        <p className="mt-1 text-[11.5px] leading-relaxed break-keep text-subtle">
          시장마다 가장 많이 오른 것 하나와 가장 많이 내린 것 하나씩입니다. 몇 % 움직였는지가 아니라{' '}
          <strong className="font-semibold text-muted">그 종목이 평소 움직이던 폭에 견줘</strong> 오늘이 얼마나
          유별났는지로 골랐습니다 — 그냥 % 로 줄을 세우면 원래 많이 움직이는 크립토가 늘 이깁니다.
        </p>
      </div>

      <SectionGate
        section={section}
        onRetry={refresh}
        loading={
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <SkeletonCard key={i} height={150} lines={3} />
            ))}
          </div>
        }
        empty={<EmptyState title="시세를 받지 못했습니다" />}
      >
        {() =>
          boards.length === 0 ? (
            <EmptyState title="고를 만한 종목이 없습니다" />
          ) : (
            <div className="space-y-4">
              {boards.map(({ market, board }) => (
                <div key={market}>
                  <div className="mb-2 flex items-baseline gap-2">
                    <h3 className="text-[13px] font-bold text-fg">{MARKET_LABEL[market]}</h3>
                    <p className="text-[11.5px] text-subtle">
                      {MARKET_NOTE[market] ?? ''} {board!.count}개 중에서
                    </p>
                  </div>
                  {/* 좁은 화면에서도 두 장을 나란히 둔다. 세로로 쌓으면 여섯 장이
                      화면 여섯 개 분량이 되어 홈에서 훑을 수가 없다. */}
                  <div className="grid grid-cols-2 gap-2">
                    <HeatCard pick={board!.top} />
                    <HeatCard pick={board!.bottom} />
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </SectionGate>

      <p className="mt-3 text-[11.5px] leading-relaxed break-keep text-subtle">
        평소의 1배 미만이면 불씨 정도·살짝 식음, 1~2배면 불이 붙음·차갑게 식음, 2~3배면 불타오름·싸늘하게 식음, 3배
        이상이면 활활 타오름·꽁꽁 얼어붙음입니다. <strong className="font-semibold text-muted">말은 세게 썼지만 뜻은
        하나입니다 — 얼마나 크게 움직였는가.</strong> 좋다·나쁘다가 아니고, 사라거나 팔라는 뜻은 더더욱 아닙니다.
        크게 오른 뒤에 더 오를지 내릴지는 이 숫자가 말해 주지 않습니다.
      </p>
    </section>
  );
}
