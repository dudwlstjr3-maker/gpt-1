'use client';

/**
 * 시장 위험 신호등 — 전체 화면.
 * 구간 기준·현재 위치·해석을 모두 펼쳐 보여주고, 시장별로 묶어 읽을 수 있게 한다.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, EmptyState, Notice } from '@/components/ui/States';
import { SegmentedControl } from '@/components/ui/Controls';
import { Badge } from '@/components/ui/Badge';
import { SignalDot, SignalLegend, SignalLight, SignalTally } from '@/components/ui/Signal';
import { RiskCard, RISK_COLOR, formatRiskValue, tallyRisk } from '@/components/market/RiskSeven';
import { formatKstFull } from '@/lib/format';
import { riskSignal } from '@/lib/scale';
import { buildRiskHeadline } from '@/lib/riskHeadline';
import {
  MARKET_LABEL,
  RISK_LEVEL_GLYPH,
  RISK_LEVEL_LABEL,
  type MarketId,
  type RiskIndicator,
  type RiskLevel,
} from '@/types';

/**
 * 시장은 항상 하나만 고른다.
 * 미국 VIX 와 크립토 펀딩비를 한 줄에 섞어 세면 "빨간불 1개"가 무엇을 뜻하는지 알 수 없다.
 * 고른 시장의 지표와, 어느 한 시장에 묶이지 않는 글로벌 지표를 함께 본다.
 */
type ScopeFilter = MarketId;

const SCOPE_OPTIONS: { value: ScopeFilter; label: string }[] = [
  { value: 'us', label: MARKET_LABEL.us },
  { value: 'kr', label: MARKET_LABEL.kr },
  { value: 'crypto', label: MARKET_LABEL.crypto },
];

const LEVEL_ORDER: RiskLevel[] = ['alert', 'watch', 'normal', 'calm'];

export default function RiskPage() {
  const { snapshot, refresh } = useData();
  const [scope, setScope] = useState<ScopeFilter>('us');
  const section = snapshot?.sections.risk ?? null;

  const filter = useMemo(
    () => (list: RiskIndicator[]) => list.filter((i) => i.scope === scope || i.scope === 'global'),
    [scope],
  );

  return (
    <div className="pt-2 pb-4">
      <div className="flex items-center justify-between gap-2 px-3 pt-1">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-fg-strong">시장 위험 신호등</h1>
          <p className="mt-0.5 text-[11px] break-keep text-muted">
            시장별 핵심 위험 게이지입니다. 고른 시장의 지표와, 어느 한 시장에 묶이지 않는 글로벌 지표를 함께 봅니다.
            구간 기준은 그대로 공개합니다.
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
            // 요약도 고른 시장만 센다. 아래 카드와 위 숫자가 다른 집합이면 읽을 수가 없다.
            const items = filter(digest.indicators);
            const available = items.filter((i) => i.value !== null);
            const byLevel = LEVEL_ORDER.map((lv) => ({
              level: lv,
              items: available.filter((i) => i.level === lv),
            })).filter((g) => g.items.length > 0);
            const tally = tallyRisk({ ...digest, indicators: items });
            const alertCount = available.filter((i) => i.level === 'alert').length;
            const watchCount = available.filter((i) => i.level === 'watch').length;
            const headline = buildRiskHeadline(items);

            return (
              <>
                {/* 종합 요약 */}
                <div className="card p-3.5">
                  <div className="flex items-start gap-2">
                    <SignalLight
                      signal={alertCount > 0 ? 'red' : watchCount > 0 ? 'yellow' : 'green'}
                      size="lg"
                      label={`${MARKET_LABEL[scope]} 종합`}
                    />
                    <p className="min-w-0 flex-1 text-[13px] leading-relaxed break-keep text-fg">{headline}</p>
                  </div>

                  {/* 신호등 집계 */}
                  <div className="mt-3 border-t border-border pt-2.5">
                    <SignalTally items={tally.items} total={tally.total} />
                  </div>

                  {/* 단계별 분포 — 신호등을 4단계로 더 잘게 쪼갠 값 */}
                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-2.5">
                    {byLevel.map((g) => (
                      <div key={g.level} className="min-w-0">
                        <div
                          className="flex items-center gap-1.5 text-[11px] font-semibold"
                          style={{ color: RISK_COLOR[g.level] }}
                        >
                          <SignalDot signal={riskSignal(g.level)} size={7} />
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
                    산출 {formatKstFull(digest.generatedAt)} · {MARKET_LABEL[scope]} 관련 {items.length}개 중{' '}
                    {available.length}개 값 확보
                  </p>
                </div>

                {/* 헷갈리기 쉬운 지점 — 이름이 비슷한 다른 화면과 구분해 준다 */}
                <div className="mt-2.5">
                  <Notice tone="neutral">
                    이 지표들은 <strong>투자심리 점수의 구성요소가 아닙니다.</strong> 시장이 지금 얼마나 불안한지를
                    보는 별도의 게이지입니다. 심리 점수를 무엇으로 계산하는지는{' '}
                    <Link href={`/fng/${scope}`} className="font-semibold text-accent hover:underline">
                      투자심리 상세
                    </Link>{' '}
                    화면의 구성요소에서 볼 수 있습니다.
                  </Notice>
                </div>

                {/* 구간 기준 안내 */}
                <div className="mt-2.5">
                  <SignalLegend note="빨간불은 '위험하니 팔아라'가 아니라 '이 지표가 평소보다 크게 벗어나 있다'는 뜻입니다. 초록불도 안전을 보장하지 않습니다." />
                </div>
                <div className="mt-2">
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
                      <caption className="sr-only">{MARKET_LABEL[scope]} 위험 신호등 요약</caption>
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
                        {items.map((i) => (
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
                                tone={i.level === 'alert' ? 'danger' : i.level === 'watch' ? 'warn' : 'ok'}
                              >
                                <SignalDot signal={riskSignal(i.level)} size={6} />
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
