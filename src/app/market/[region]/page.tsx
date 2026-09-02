'use client';

/**
 * 시장별 전용 화면 — /market/us, /market/kr, /market/crypto
 *
 * 세 시장을 탭으로 겹쳐 두지 않고 각각 독립된 화면으로 분리했다.
 * 각 화면에는 그 시장의 심리 점수 · 위험 지표 · 고유 지표 · 시세 · 일정 · 뉴스만 들어간다.
 */

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useSettings } from '@/components/providers/SettingsProvider';
import { SegmentedControl } from '@/components/ui/Controls';
import { SectionGate, SkeletonCard, EmptyState, Notice } from '@/components/ui/States';
import { Badge, SessionBadge } from '@/components/ui/Badge';
import { PriceCard } from '@/components/market/PriceCard';
import { FngCard } from '@/components/market/FngCard';
import { RiskForMarket } from '@/components/market/RiskSeven';
import { EventRow } from '@/components/market/CalendarList';
import { useChangeColor } from '@/components/market/useChangeColor';
import { useFormatter } from '@/components/market/useFormatter';
import { useNow } from '@/lib/useNow';
import { formatKoreanCompact, formatNumber, formatRelative, NO_VALUE } from '@/lib/format';
import { sessionHint } from '@/lib/marketHours';
import { MARKET_IDS, MARKET_LABEL, type MarketId, type Quote } from '@/types';

type SortKey = 'default' | 'gain' | 'loss' | 'name';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'default', label: '기본' },
  { value: 'gain', label: '상승순' },
  { value: 'loss', label: '하락순' },
  { value: 'name', label: '이름순' },
];

/** 시장별 화면 부제 */
const SUBTITLE: Record<MarketId, string> = {
  us: '뉴욕 증시 · 국채 · 원자재 · 빅테크',
  kr: '유가증권 · 코스닥 · 환율 · 투자자 수급',
  crypto: '24시간 거래 · 도미넌스 · 파생 · 온체인',
};

/** 시장별 "고유 지표" — 그 시장에만 있는 것 */
const SPECIAL_IDS: Record<MarketId, string[]> = {
  us: ['ust2', 'ust10', 'us_spread_10_2', 'dxy', 'gold', 'wti'],
  kr: ['kospi200', 'ktb3', 'ktb10'],
  crypto: ['total_mcap', 'total_vol', 'btc_dom', 'stable_mcap', 'funding', 'open_interest', 'liquidations'],
};

function sortQuotes(list: Quote[], key: SortKey): Quote[] {
  const copy = [...list];
  if (key === 'name') return copy.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  if (key === 'gain') return copy.sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));
  if (key === 'loss') return copy.sort((a, b) => (a.changePct ?? Infinity) - (b.changePct ?? Infinity));
  return copy;
}

export default function MarketRegionPage() {
  const params = useParams<{ region: string }>();
  // 한국은 심리 점수를 낼 수 없어 시장에서 뺐다. 옛 링크로 들어오면 조용히 미국으로
  // 튀지 않고 지수 화면으로 보낸다 — 거기에 KOSPI·KOSDAQ 이 그대로 있다.
  const router = useRouter();
  const isKorea = params.region === 'kr';
  useEffect(() => {
    if (isKorea) router.replace('/indices');
  }, [isKorea, router]);

  const region = (MARKET_IDS.includes(params.region as MarketId) ? params.region : 'us') as MarketId;

  const { snapshot, refresh } = useData();
  const { settings } = useSettings();
  const flowColor = useChangeColor();
  const f = useFormatter();
  const now = useNow(30_000);

  const [sort, setSort] = useState<SortKey>('default');
  const [onlyWatched, setOnlyWatched] = useState(false);

  const quotesSection = snapshot?.sections.quotes ?? null;
  const fng = snapshot?.sections.fng.data?.find((x) => x.market === region) ?? null;
  const flows = snapshot?.sections.flows.data ?? null;
  const session = snapshot?.sections.sessions.data?.find((s) => s.market === region) ?? null;

  const all = useMemo(() => quotesSection?.data?.[region] ?? [], [quotesSection, region]);

  const special = useMemo(() => {
    const byId = new Map(all.map((q) => [q.id, q]));
    return SPECIAL_IDS[region].map((id) => byId.get(id)).filter((q): q is Quote => Boolean(q));
  }, [all, region]);

  const list = useMemo(() => {
    const filtered = onlyWatched ? all.filter((q) => settings.watchlist.includes(q.id)) : all;
    return sortQuotes(filtered, sort);
  }, [all, sort, onlyWatched, settings.watchlist]);

  const news = useMemo(
    () => (snapshot?.sections.news.data ?? []).filter((n) => n.markets.includes(region)).slice(0, 4),
    [snapshot, region],
  );

  const events = useMemo(() => {
    const country = region === 'us' ? 'US' : region === 'kr' ? 'KR' : 'GLOBAL';
    const ref = now ?? Date.now();
    return (snapshot?.sections.calendar.data ?? [])
      .filter((e) => e.country === country && Date.parse(e.scheduledAt) >= ref - 6 * 3600_000)
      .slice(0, 3);
  }, [snapshot, region, now]);

  return (
    <div className="pt-2 pb-4">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-2 px-3 pt-1">
        <div className="flex min-w-0 items-start gap-2">
          {/* /market 은 없앤 화면이라 지수 탭으로 돌려보낸다 */}
          <Link href="/indices" aria-label="지수 목록으로" className="mt-0.5 text-muted">
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-fg-strong">{MARKET_LABEL[region]} 시장</h1>
            <p className="mt-0.5 truncate text-[11px] text-subtle">{SUBTITLE[region]}</p>
          </div>
        </div>
        {session ? (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <SessionBadge phase={session.phase} size="sm" />
            <span className="text-[10px] text-subtle">{sessionHint(session)}</span>
          </div>
        ) : null}
      </div>

      {/* 시장 전환 */}
      <div className="mt-2.5 px-3">
        <SegmentedControl
          label="시장 전환"
          full
          value={region}
          onChange={(v) => {
            window.location.href = `/market/${v}`;
          }}
          options={MARKET_IDS.map((m) => ({ value: m, label: MARKET_LABEL[m] }))}
        />
      </div>

      <div className="mt-3 px-3 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-4">
        {/* 좌측: 심리 · 위험 · 시장 고유 정보 */}
        <div className="space-y-2.5 lg:sticky lg:top-32">
          {fng && snapshot ? <FngCard score={fng} mode={snapshot.mode} /> : <SkeletonCard height={140} lines={2} />}

          <RiskForMarket market={region} />

          {/* 한국 전용: 투자자별 수급 */}
          {region === 'kr' ? (
            <div className="card p-3">
              <h2 className="mb-2 text-sm font-bold text-fg-strong">투자자별 당일 순매수</h2>
              {flows && (flows.foreign !== null || flows.institution !== null || flows.individual !== null) ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ['외국인', flows.foreign],
                        ['기관', flows.institution],
                        ['개인', flows.individual],
                      ] as const
                    ).map(([label, v]) => (
                      <div key={label} className="rounded-lg bg-surface-2 p-2 text-center">
                        <p className="text-[10px] text-muted">{label}</p>
                        <p className="tnum mt-0.5 text-[13px] font-bold" style={{ color: flowColor.color(v) }}>
                          {v === null ? NO_VALUE : `${v > 0 ? '+' : '-'}${formatKoreanCompact(Math.abs(v) * 1e8, 1)}원`}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-subtle">
                    기준 {formatRelative(flows.meta.asOf)} · 외국인 순매수는 원화 강세·지수 방어와 함께 나타나는 경우가 많습니다.
                  </p>
                </>
              ) : (
                <Notice tone="warn">투자자별 매매동향 데이터를 받지 못했습니다. 값을 0으로 표시하지 않습니다.</Notice>
              )}
            </div>
          ) : null}

          {/* 시장 고유 지표 */}
          {special.length > 0 ? (
            <div className="card p-3">
              <h2 className="mb-2 text-sm font-bold text-fg-strong">
                {region === 'us' ? '금리 · 달러 · 원자재' : region === 'kr' ? '지수 · 국고채' : '시장 규모 · 파생'}
              </h2>
              <ul className="divide-y divide-[var(--border)]">
                {special.map((q) => {
                  const dir = f.direction(q);
                  return (
                    <li key={q.id}>
                      <Link href={`/asset/${q.id}`} className="flex items-center justify-between gap-2 py-1.5 hover:opacity-80">
                        <span className="truncate text-[12px] text-fg">{q.name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="tnum text-[12px] font-semibold text-fg-strong">
                            {q.price === null ? NO_VALUE : f.price(q)}
                          </span>
                          <span className="tnum text-[11px]" style={{ color: f.color(dir) }}>
                            {f.glyph(dir)} {f.changePct(q)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>

        {/* 우측: 시세 목록 + 일정 + 뉴스 */}
        <div className="mt-4 lg:mt-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentedControl label="정렬" size="xs" value={sort} onChange={setSort} options={SORT_OPTIONS} />
            <button
              type="button"
              onClick={() => setOnlyWatched((v) => !v)}
              aria-pressed={onlyWatched}
              className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold"
              style={{
                background: onlyWatched ? 'var(--surface-3)' : 'var(--surface-2)',
                color: onlyWatched ? 'var(--accent)' : 'var(--muted-fg)',
              }}
            >
              {onlyWatched ? '★ 관심만 보는 중' : '☆ 관심만 보기'}
            </button>
          </div>

          <div className="mt-2">
            <SectionGate
              section={quotesSection}
              onRetry={refresh}
              loading={
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {[0, 1, 2, 3].map((i) => (
                    <SkeletonCard key={i} height={44} lines={1} />
                  ))}
                </div>
              }
              empty={<EmptyState title="시세 데이터가 없습니다" />}
            >
              {() =>
                list.length === 0 ? (
                  <EmptyState
                    title={onlyWatched ? '관심목록에 담긴 항목이 없습니다' : '표시할 항목이 없습니다'}
                    description={onlyWatched ? '카드의 ☆ 를 눌러 관심목록에 추가하세요.' : undefined}
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {list.map((q) => (
                      <PriceCard key={q.id} quote={q} />
                    ))}
                  </div>
                )
              }
            </SectionGate>
          </div>

          {/* 이 시장의 일정 */}
          {events.length > 0 ? (
            <section className="mt-4" aria-labelledby={`cal-${region}`}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h2 id={`cal-${region}`} className="text-[12px] font-bold text-muted">
                  {MARKET_LABEL[region]} 관련 일정
                </h2>
                <Link href="/calendar" className="text-[11px] font-semibold text-accent hover:underline">
                  전체 캘린더 →
                </Link>
              </div>
              <div className="card overflow-hidden">
                <ul>
                  {events.map((e) => (
                    <EventRow key={e.id} event={e} now={now} />
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          {/* 이 시장의 뉴스 */}
          {news.length > 0 ? (
            <section className="mt-4" aria-labelledby={`news-${region}`}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h2 id={`news-${region}`} className="text-[12px] font-bold text-muted">
                  {MARKET_LABEL[region]} 관련 뉴스
                </h2>
                {snapshot?.mode === 'DEMO' ? (
                  <Badge tone="demo" size="xs">
                    DEMO 샘플
                  </Badge>
                ) : null}
              </div>
              <div className="card p-3.5">
                <ul className="space-y-2.5">
                  {news.map((n) => (
                    <li key={n.id} className="border-b border-border pb-2.5 last:border-b-0 last:pb-0">
                      <p className="text-[12px] leading-relaxed break-keep text-fg">{n.summaryKo}</p>
                      <p className="mt-1 truncate text-[10px] text-subtle">{n.titleOriginal}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-subtle">
                        <span>{n.outlet}</span>
                        <span>{formatRelative(n.publishedAt)}</span>
                        {n.url ? (
                          <a href={n.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">
                            원문 보기 ↗
                          </a>
                        ) : (
                          <span>원문 링크 없음</span>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          <p className="mt-4 text-[10px] text-subtle">
            표시 종목 {formatNumber(list.length, 0)}개 · 기준 시각과 지연 여부는 각 카드에 표시됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
