'use client';

/**
 * 시장 허브 — 미국 / 한국 / 크립토를 각각 독립된 화면으로 들어가는 입구.
 * 세 시장을 한 화면에서 비교하는 곳이 아니라, 어디로 들어갈지 고르는 곳이다.
 */

import Link from 'next/link';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard } from '@/components/ui/States';
import { Badge, SessionBadge } from '@/components/ui/Badge';
import { Gauge } from '@/components/charts/Gauge';
import { useFormatter } from '@/components/market/useFormatter';
import { SignalDot } from '@/components/ui/Signal';
import { RISK_COLOR } from '@/components/market/RiskSeven';
import { formatKstTime, NO_VALUE } from '@/lib/format';
import { confidenceGlyph, riskSignal } from '@/lib/scale';
import {
  CONFIDENCE_LABEL,
  MARKET_IDS,
  MARKET_LABEL,
  RISK_LEVEL_GLYPH,
  RISK_LEVEL_LABEL,
  type MarketId,
  type Quote,
} from '@/types';

/** 시장별 대표 지수 */
const HEADLINE: Record<MarketId, string[]> = {
  us: ['spx', 'ndx', 'vix'],
  kr: ['kospi', 'kosdaq', 'usdkrw'],
  crypto: ['btc', 'eth', 'btc_dom'],
};

const BLURB: Record<MarketId, string> = {
  us: 'S&P 500 · 나스닥 · 국채 금리 · 빅테크',
  kr: 'KOSPI · KOSDAQ · 환율 · 투자자 수급',
  crypto: 'BTC · ETH · 도미넌스 · 파생 · 24시간',
};

export default function MarketHubPage() {
  const { snapshot, refresh } = useData();
  const f = useFormatter();

  const quotes = snapshot?.sections.quotes.data ?? null;
  const fngList = snapshot?.sections.fng.data ?? [];
  const sessions = snapshot?.sections.sessions.data ?? [];
  const risk = snapshot?.sections.risk.data ?? null;

  return (
    <div className="pt-2 pb-4">
      <div className="px-3 pt-1">
        <h1 className="text-lg font-bold text-fg-strong">시장</h1>
        <p className="mt-0.5 text-[11px] text-muted">시장별로 화면이 나뉘어 있습니다. 들어갈 시장을 고르세요.</p>
      </div>

      <div className="mt-3 px-3">
        <SectionGate
          section={snapshot?.sections.quotes ?? null}
          onRetry={refresh}
          loading={
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
              {MARKET_IDS.map((m) => (
                <SkeletonCard key={m} height={110} lines={2} />
              ))}
            </div>
          }
        >
          {() => (
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
              {MARKET_IDS.map((market) => {
                const fng = fngList.find((x) => x.market === market) ?? null;
                const session = sessions.find((s) => s.market === market);
                const list = quotes?.[market] ?? [];
                const byId = new Map(list.map((q) => [q.id, q]));
                const headline = HEADLINE[market].map((id) => byId.get(id)).filter((q): q is Quote => Boolean(q));
                const marketRisk = (risk?.indicators ?? []).filter((i) => i.scope === market);
                const worst = marketRisk.reduce<(typeof marketRisk)[number] | null>((acc, i) => {
                  const rank = { alert: 3, watch: 2, normal: 1, calm: 0 };
                  if (!acc || rank[i.level] > rank[acc.level]) return i;
                  return acc;
                }, null);

                return (
                  <Link
                    key={market}
                    href={`/market/${market}`}
                    className="card block p-4 transition-colors hover:bg-surface-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-fg-strong">{MARKET_LABEL[market]} 시장</h2>
                        <p className="mt-0.5 truncate text-[10.5px] text-subtle">{BLURB[market]}</p>
                      </div>
                      {session ? <SessionBadge phase={session.phase} size="sm" /> : null}
                    </div>

                    <div className="mt-2 flex items-center gap-3">
                      <Gauge score={fng?.score ?? null} size={116} compact showScale={false} />
                      <div className="min-w-0 flex-1">
                        {fng ? (
                          <>
                            <p className="text-[11px] text-muted">
                              {fng.score === null ? '점수 산출 불가' : `${fng.stage?.label ?? ''} 구간`}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-subtle">
                              <span aria-hidden="true">{confidenceGlyph(fng.confidence)}</span>
                              신뢰도 {CONFIDENCE_LABEL[fng.confidence]} · 산출 {formatKstTime(fng.computedAt)}
                            </p>
                          </>
                        ) : null}
                        {worst ? (
                          <p
                            className="mt-1.5 flex items-center gap-1 text-[10.5px] font-semibold"
                            style={{ color: RISK_COLOR[worst.level] }}
                          >
                            <SignalDot signal={riskSignal(worst.level)} size={7} />
                            <span aria-hidden="true">{RISK_LEVEL_GLYPH[worst.level]}</span>
                            {worst.shortName} {RISK_LEVEL_LABEL[worst.level]}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <ul className="mt-2 space-y-1 border-t border-border pt-2">
                      {headline.map((q) => {
                        const dir = f.direction(q);
                        return (
                          <li key={q.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                            <span className="truncate text-muted">{q.name}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="tnum font-semibold text-fg-strong">
                                {q.price === null ? NO_VALUE : f.price(q)}
                              </span>
                              <span className="tnum" style={{ color: f.color(dir) }}>
                                {f.glyph(dir)} {f.changePct(q)}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2">
                      <Badge tone="neutral" size="xs">
                        종목 {list.length}개
                      </Badge>
                      <span className="text-[11px] font-semibold text-accent">
                        {MARKET_LABEL[market]} 시장 열기 →
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </SectionGate>
      </div>
    </div>
  );
}
