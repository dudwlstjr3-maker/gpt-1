'use client';

/** 홈 — 시장별 자금 흐름(한국 투자자 수급)과 뉴스. */

import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, EmptyState, Notice } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { formatKoreanCompact, formatRelative, NO_VALUE } from '@/lib/format';
import { MARKET_LABEL, type FlowSummary } from '@/types';
import { useChangeColor } from './useChangeColor';

function FlowBar({ label, value }: { label: string; value: number | null }) {
  const c = useChangeColor();
  const dir = c.direction(value);
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-[12px] text-fg">{label}</span>
      <span className="tnum flex items-center gap-1 text-[13px] font-bold" style={{ color: c.color(value) }}>
        <span aria-hidden="true">{c.glyph(value)}</span>
        {value === null ? NO_VALUE : `${formatKoreanCompact(Math.abs(value) * 1e8, 1)}원`}
        <span className="sr-only">{dir === 'up' ? '순매수' : dir === 'down' ? '순매도' : ''}</span>
      </span>
    </div>
  );
}

function FlowsCard({ flows }: { flows: FlowSummary }) {
  const allMissing = flows.foreign === null && flows.institution === null && flows.individual === null;
  return (
    <div className="card p-3.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-fg-strong">한국 투자자별 당일 순매수</h3>
        <Badge tone="neutral" size="xs">
          KOSPI
        </Badge>
      </div>
      {allMissing ? (
        <Notice tone="warn">
          {flows.meta.notes?.[0] ?? '투자자별 매매동향 데이터를 받지 못했습니다.'} 값을 0으로 표시하지 않습니다.
        </Notice>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          <FlowBar label="외국인" value={flows.foreign} />
          <FlowBar label="기관" value={flows.institution} />
          <FlowBar label="개인" value={flows.individual} />
        </div>
      )}
      <p className="mt-2 border-t border-border pt-1.5 text-[10px] text-subtle">
        기준 {formatRelative(flows.meta.asOf)} · 출처 {flows.meta.sources[0]?.name ?? '알 수 없음'}
      </p>
    </div>
  );
}

export function FlowsNewsSection() {
  const { snapshot, refresh } = useData();
  const flows = snapshot?.sections.flows ?? null;
  const news = snapshot?.sections.news ?? null;
  const isDemo = snapshot?.mode === 'DEMO';

  return (
    <section aria-labelledby="flows-news-title" className="mt-5 px-3">
      <h2 id="flows-news-title" className="mb-2 text-base font-bold text-fg-strong">
        자금 흐름과 뉴스
      </h2>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-1">
        <SectionGate section={flows} onRetry={refresh} loading={<SkeletonCard height={90} lines={1} />}>
          {(f) => <FlowsCard flows={f} />}
        </SectionGate>

        <SectionGate
          section={news}
          onRetry={refresh}
          loading={<SkeletonCard height={90} lines={3} />}
          empty={<EmptyState title="뉴스가 없습니다" />}
        >
          {(items) => (
            <div className="card p-3.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-fg-strong">주요 뉴스</h3>
                {isDemo ? (
                  <Badge tone="demo" size="xs">
                    DEMO 샘플
                  </Badge>
                ) : null}
              </div>
              {isDemo ? (
                <p className="mb-2 text-[10px] text-subtle">
                  DEMO 모드에서는 실제 기사가 아닌 가상의 샘플 매체·헤드라인을 보여줍니다.
                </p>
              ) : null}
              <ul className="space-y-2.5">
                {items.slice(0, 5).map((n) => (
                  <li key={n.id} className="border-b border-border pb-2.5 last:border-b-0 last:pb-0">
                    <p className="text-[12px] leading-relaxed break-keep text-fg">{n.summaryKo}</p>
                    <p className="mt-1 truncate text-[10px] text-subtle">{n.titleOriginal}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-subtle">
                      <span>{n.outlet}</span>
                      <span>{formatRelative(n.publishedAt)}</span>
                      {n.markets.map((m) => (
                        <span key={m} className="text-muted">
                          #{MARKET_LABEL[m]}
                        </span>
                      ))}
                      {n.url ? (
                        <a
                          href={n.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-accent hover:underline"
                        >
                          원문 보기 ↗
                        </a>
                      ) : (
                        <span className="text-subtle">원문 링크 없음</span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionGate>
      </div>
    </section>
  );
}
