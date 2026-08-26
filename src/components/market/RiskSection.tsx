'use client';

/** 홈 — 금리·환율·변동성 요약. 전체 지표는 별도 상세 화면으로 넘긴다. */

import Link from 'next/link';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, Skeleton } from '@/components/ui/States';
import { StatTile, formatMacroValue } from './PriceCard';
import { formatNumber } from '@/lib/format';

/** 홈에 노출할 핵심 위험 지표 순서 */
const FEATURED_ORDER = ['vix', 'vkospi', 'usdkrw', 'us_spread', 'hy_oas', 'us_policy_rate', 'kr_policy_rate', 'us_cpi'];

export function RiskSection() {
  const { snapshot, refresh } = useData();
  const section = snapshot?.sections.macro ?? null;

  return (
    <section aria-labelledby="risk-title" className="mt-5 px-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="risk-title" className="text-base font-bold text-fg-strong">
          금리 · 환율 · 변동성
        </h2>
        <Link href="/indicators" className="text-[11px] font-semibold text-accent hover:underline">
          전체 지표 →
        </Link>
      </div>

      <SectionGate
        section={section}
        onRetry={refresh}
        loading={
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-[72px]" />
            ))}
          </div>
        }
      >
        {(macro) => {
          const byId = new Map(macro.map((m) => [m.id, m]));
          const items = FEATURED_ORDER.map((id) => byId.get(id)).filter((m) => m !== undefined);
          return (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {items.map((m) => (
                <StatTile
                  key={m.id}
                  label={m.name}
                  value={formatMacroValue(m.value, m.precision, m.unit)}
                  sub={
                    m.previous !== null && m.value !== null
                      ? `이전 ${formatNumber(m.previous, m.precision)} · ${
                          m.trend === 'up' ? '▲ 상승' : m.trend === 'down' ? '▼ 하락' : '― 보합'
                        }`
                      : '이전값 없음'
                  }
                  tone={m.riskLevel}
                  note={m.riskNote || undefined}
                />
              ))}
            </div>
          );
        }}
      </SectionGate>
    </section>
  );
}
