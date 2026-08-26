'use client';

/**
 * 위험 지표 7선 — 전체 화면.
 * 구간 기준·현재 위치·해석을 모두 펼쳐 보여주고, 시장별로 묶어 읽을 수 있게 한다.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, EmptyState, Notice } from '@/components/ui/States';
import { SegmentedControl } from '@/components/ui/Controls';
import { Badge } from '@/components/ui/Badge';
import { RiskCard, RISK_COLOR, formatRiskValue } from '@/components/market/RiskSeven';
import { formatKstFull } from '@/lib/format';
import {
  RISK_LEVEL_GLYPH,
  RISK_LEVEL_LABEL,
  type RiskIndicator,
  type RiskLevel,
} from '@/types';

type ScopeFilter = 'all' | 'us' | 'kr' | 'crypto';

const SCOPE_OPTIONS: { value: ScopeFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'us', label: '미국' },
  { value: 'kr', label: '한국' },
  { value: 'crypto', label: '크립토' },
];

const LEVEL_ORDER: RiskLevel[] = ['alert', 'watch', 'normal', 'calm'];

export default function RiskPage() {
  const { snapshot, refresh } = useData();
  const [scope, setScope] = useState<ScopeFilter>('all');
  const section = snapshot?.sections.risk ?? null;

  const filter = useMemo(
    () => (list: RiskIndicator[]) =>
      scope === 'all' ? list : list.filter((i) => i.scope === scope || i.scope === 'global'),
    [scope],
  );

  return (
    <div className="pt-2 pb-4">
      <div className="flex items-center justify-between gap-2 px-3 pt-1">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-fg-strong">위험 지표 7선</h1>
          <p className="mt-0.5 text-[11px] break-keep text-muted">
            공포지수 · 정크본드 · 국채 금리를 포함한 핵심 위험 게이지 7개입니다. 구간 기준을 그대로 공개합니다.
          </p>
        </div>
        <Link href="/indicators" className="shrink-0 text-[11px] font-semibold text-accent hover:underline">
          전체 지표 →
        </Link>
      </div>

      <div className="mt-3 px-3">
        <SegmentedControl label="시장" size="sm" full value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
      </div>

      <div className="mt-3 px-3">
        <SectionGate
          section={section}
          onRetry={refresh}
          loading={
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <SkeletonCard key={i} height={70} lines={2} />
              ))}
            </div>
          }
          empty={<EmptyState title="위험 지표를 산출할 데이터가 없습니다" />}
        >
          {(digest) => {
            const items = filter(digest.indicators);
            const available = digest.indicators.filter((i) => i.value !== null);
            const byLevel = LEVEL_ORDER.map((lv) => ({
              level: lv,
              items: available.filter((i) => i.level === lv),
            })).filter((g) => g.items.length > 0);

            return (
              <>
                {/* 종합 요약 */}
                <div className="card p-3.5">
                  <div className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-px text-base"
                      style={{
                        color:
                          digest.alertCount > 0
                            ? 'var(--danger)'
                            : digest.watchCount > 0
                              ? 'var(--warn)'
                              : 'var(--ok)',
                      }}
                    >
                      {digest.alertCount > 0 ? '▲' : digest.watchCount > 0 ? '△' : '○'}
                    </span>
                    <p className="min-w-0 flex-1 text-[13px] leading-relaxed break-keep text-fg">{digest.headline}</p>
                  </div>

                  {/* 단계별 분포 */}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-2.5">
                    {byLevel.map((g) => (
                      <div key={g.level} className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: RISK_COLOR[g.level] }}>
                          <span aria-hidden="true">{RISK_LEVEL_GLYPH[g.level]}</span>
                          {RISK_LEVEL_LABEL[g.level]} {g.items.length}
                        </div>
                        <p className="mt-0.5 text-[10px] break-keep text-subtle">
                          {g.items.map((i) => i.shortName).join(' · ')}
                        </p>
                      </div>
                    ))}
                  </div>

                  <p className="mt-2.5 border-t border-border pt-2 text-[10px] text-subtle">
                    산출 {formatKstFull(digest.generatedAt)} · 7개 중 {digest.availableCount}개 값 확보
                  </p>
                </div>

                {/* 구간 기준 안내 */}
                <div className="mt-2.5">
                  <Notice tone="neutral">
                    구간 기준은 이 앱이 정한 값이며 공식 기준이 아닙니다. 각 지표 카드에 구간 경계를 그대로 표시했으니
                    직접 확인하고 판단하세요. 단계 표시는 위험의 방향을 읽는 참고이며 매매 신호가 아닙니다.
                  </Notice>
                </div>

                {/* 지표 카드 */}
                {items.length === 0 ? (
                  <div className="mt-2.5">
                    <EmptyState title="해당 시장의 지표가 없습니다" description="필터를 바꿔 보세요." />
                  </div>
                ) : (
                  <div className="mt-2.5 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                    {items.map((i) => (
                      <RiskCard key={i.id} indicator={i} />
                    ))}
                  </div>
                )}

                {/* 표 대안 */}
                <div className="mt-4">
                  <h2 className="mb-1.5 text-[12px] font-bold text-muted">표로 보기</h2>
                  <div className="scroll-x card">
                    <table className="data-table">
                      <caption className="sr-only">위험 지표 7선 요약</caption>
                      <thead>
                        <tr>
                          <th scope="col">지표</th>
                          <th scope="col">시장</th>
                          <th scope="col">현재</th>
                          <th scope="col">이전</th>
                          <th scope="col">단계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {digest.indicators.map((i) => (
                          <tr key={i.id}>
                            <th scope="row" className="font-normal">
                              {i.name}
                            </th>
                            <td>{i.scope === 'global' ? '글로벌' : i.scope === 'us' ? '미국' : i.scope === 'kr' ? '한국' : '크립토'}</td>
                            <td className="tnum">{formatRiskValue(i.value, i)}</td>
                            <td className="tnum">{formatRiskValue(i.previous, i)}</td>
                            <td>
                              <Badge
                                size="xs"
                                tone={i.level === 'alert' ? 'danger' : i.level === 'watch' ? 'warn' : i.level === 'calm' ? 'ok' : 'neutral'}
                              >
                                <span aria-hidden="true">{RISK_LEVEL_GLYPH[i.level]}</span>
                                {RISK_LEVEL_LABEL[i.level]}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          }}
        </SectionGate>
      </div>
    </div>
  );
}
