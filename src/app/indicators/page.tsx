'use client';

/** 경제·위험 지표 전체 — 홈에서 요약한 항목의 상세 화면. */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, EmptyState } from '@/components/ui/States';
import { SegmentedControl } from '@/components/ui/Controls';
import { Badge } from '@/components/ui/Badge';
import { SignalDot, SignalLegend } from '@/components/ui/Signal';
import { formatMacroValue } from '@/components/market/PriceCard';
import { formatNumber, formatRelative, NO_VALUE } from '@/lib/format';
import { guideFor } from '@/lib/indicatorGuide';
import { RiskBoard } from '@/components/market/RiskBoard';
import type { Signal } from '@/lib/scale';
import { MARKET_LABEL, type MacroIndicator, type MarketId } from '@/types';

/**
 * 시장은 항상 하나만 고른다.
 * 미국 CPI 와 BTC 도미넌스를 한 목록에 섞으면 무엇을 보고 있는지가 흐려진다.
 * 달러지수·금·유가처럼 어느 한 시장에 묶이지 않는 지표는 어느 시장을 골라도 함께 보여준다.
 */
type GroupFilter = MarketId;

const GROUP_OF: Record<GroupFilter, MacroIndicator['group']> = {
  us: '미국',
  kr: '한국',
  crypto: '크립토',
};

/** 시장 위험 신호등과 같은 색 규칙을 쓴다. 화면이 달라도 색의 뜻은 같아야 한다. */
const RISK_META: Record<
  MacroIndicator['riskLevel'],
  { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral'; glyph: string; signal: Signal | null }
> = {
  normal: { label: '정상', tone: 'ok', glyph: '·', signal: 'green' },
  watch: { label: '관찰', tone: 'warn', glyph: '△', signal: 'yellow' },
  alert: { label: '주의', tone: 'danger', glyph: '▲', signal: 'red' },
  unknown: { label: '정보 없음', tone: 'neutral', glyph: '—', signal: null },
};

const TREND_GLYPH: Record<MacroIndicator['trend'], string> = { up: '▲', down: '▼', flat: '―', unknown: '—' };
const TREND_LABEL: Record<MacroIndicator['trend'], string> = {
  up: '상승',
  down: '하락',
  flat: '보합',
  unknown: '알 수 없음',
};

/**
 * "이게 뭔가 / 오르면 · 내리면 무슨 일이 생기나".
 *
 * 목록을 스캔하는 데 방해되지 않도록 접어 두고, 누른 지표만 펼친다.
 * 화살표는 값의 방향일 뿐 좋고 나쁨이 아니므로 등락 색을 쓰지 않는다.
 */
function GuidePanel({ id }: { id: string }) {
  const g = guideFor(id);
  if (!g) return null;
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer list-none text-[11px] font-semibold text-accent hover:underline">
        이게 무슨 지표인가요? ▾
      </summary>
      <div className="mt-1.5 rounded-lg bg-surface-2 px-2.5 py-2">
        <p className="text-[11.5px] leading-relaxed break-keep text-fg">{g.plain}</p>
        {/* 기준점이 있는 지수는 그것부터 알려 준다. 기준을 모르면 숫자를 읽을 수 없다. */}
        {g.baseline ? (
          <p className="mt-1.5 rounded-md bg-surface-3 px-2 py-1.5 text-[10.5px] leading-relaxed break-keep text-muted">
            <span className="font-semibold text-fg">기준 · </span>
            {g.baseline}
          </p>
        ) : null}
        <dl className="mt-2 space-y-1.5 border-t border-border pt-2">
          {[
            { glyph: '▲', label: '오르면', text: g.whenUp },
            { glyph: '▼', label: '내리면', text: g.whenDown },
          ].map((row) => (
            <div key={row.label} className="flex items-start gap-1.5">
              <span aria-hidden="true" className="mt-px shrink-0 text-[10px] text-muted">
                {row.glyph}
              </span>
              <dt className="sr-only">값이 {row.label}</dt>
              <dd className="min-w-0 text-[11px] leading-relaxed break-keep text-muted">
                <span className="font-semibold text-fg">{row.label} · </span>
                {row.text}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}

/**
 * 보기 전환.
 *
 * 위험 신호등은 예전에 /risk 라는 별도 화면이었다. 시장 필터도 같고 지표도
 * 겹쳐서, 같은 VIX 를 두 화면에서 보게 되는 문제가 있었다. 화면을 하나로 합치고
 * 안에서 보기만 바꾸도록 했다.
 */
type ViewMode = 'risk' | 'all';

export default function IndicatorsPage() {
  const { snapshot, refresh } = useData();
  const [group, setGroup] = useState<GroupFilter>('us');
  const [view, setView] = useState<ViewMode>('risk');
  const section = snapshot?.sections.macro ?? null;

  const list = useMemo(() => {
    const items = section?.data ?? [];
    const g = GROUP_OF[group];
    return items.filter((m) => m.group === g || m.group === '글로벌');
  }, [section, group]);

  // 주의 단계 요약도 고른 시장만 센다
  const alerts = list.filter((m) => m.riskLevel === 'alert');

  return (
    <div className="pt-2 pb-4">
      <div className="flex items-center justify-between gap-2 px-3 pt-1">
        <h1 className="text-lg font-bold text-fg-strong">경제 · 위험 지표</h1>
        <Link href="/basics" className="shrink-0 text-[11px] font-semibold text-accent hover:underline">
          생활 속 경제 이야기 →
        </Link>
      </div>
      <p className="mt-0.5 px-3 text-[11px] break-keep text-muted">
        고른 시장의 지표와, 어느 한 시장에 묶이지 않는 글로벌 지표를 함께 보여줍니다. 각 지표의 위험 단계는 색상뿐
        아니라 기호·텍스트로도 표시됩니다. 1인당 GDP·빅맥지수처럼 시세가 아닌 이야기는{' '}
        <Link href="/basics" className="font-semibold text-accent hover:underline">
          생활 속 경제 이야기
        </Link>{' '}
        화면에 따로 모았습니다.
      </p>

      {view === 'all' ? (
        <div className="mt-2 px-3">
          <SignalLegend note="위험 신호등과 같은 색 규칙입니다. 색은 평소 범위에서 얼마나 벗어났는지만 나타내며 매매 신호가 아닙니다." />
        </div>
      ) : null}

      {view === 'all' && alerts.length > 0 ? (
        <div className="mt-3 px-3">
          <div className="card p-3" style={{ borderColor: 'color-mix(in srgb, var(--danger) 40%, var(--border))' }}>
            <p className="mb-1.5 text-[12px] font-bold" style={{ color: 'var(--danger)' }}>
              ▲ 주의 단계 지표 {alerts.length}건
            </p>
            <ul className="space-y-1">
              {alerts.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-2 text-[12px]">
                  <span className="min-w-0 truncate text-fg">{m.name}</span>
                  <span className="shrink-0 text-right text-[11px] break-keep text-muted">{m.riskNote}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-2 px-3">
        <SegmentedControl
          label="시장"
          size="sm"
          full
          value={group}
          onChange={setGroup}
          options={[
            { value: 'us', label: MARKET_LABEL.us },
            { value: 'kr', label: MARKET_LABEL.kr },
            { value: 'crypto', label: MARKET_LABEL.crypto },
          ]}
        />
        <SegmentedControl
          label="보기"
          size="xs"
          full
          value={view}
          onChange={setView}
          options={[
            { value: 'risk', label: '위험 신호등' },
            { value: 'all', label: '전체 지표' },
          ]}
        />
      </div>

      {view === 'risk' ? <RiskBoard market={group} /> : null}

      <div className="mt-3 px-3" hidden={view !== 'all'}>
        <SectionGate
          section={section}
          onRetry={refresh}
          loading={<SkeletonCard height={40} lines={6} />}
          empty={<EmptyState title="지표 데이터가 없습니다" />}
        >
          {() =>
            list.length === 0 ? (
              <EmptyState title="해당 시장의 지표가 없습니다" />
            ) : (
              <div className="card overflow-hidden">
                <ul className="divide-y divide-[var(--border)]">
                  {list.map((m) => {
                    const risk = RISK_META[m.riskLevel];
                    return (
                      <li key={m.id} className="px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-fg">{m.name}</p>
                            <p className="mt-0.5 text-[10px] text-subtle">
                              {m.group} · 기준 {formatRelative(m.meta.asOf)} · 출처 {m.meta.sources[0]?.name ?? '알 수 없음'}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="tnum text-[15px] font-bold text-fg-strong">
                              {formatMacroValue(m.value, m.precision, m.unit, m.suffix)}
                            </p>
                            <p className="tnum text-[10px] text-muted">
                              <span aria-hidden="true">{TREND_GLYPH[m.trend]}</span>{' '}
                              <span className="sr-only">{TREND_LABEL[m.trend]}</span>
                              이전 {m.previous === null ? NO_VALUE : formatNumber(m.previous, m.precision)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <Badge tone={risk.tone} size="xs">
                            {risk.signal ? <SignalDot signal={risk.signal} size={6} /> : null}
                            <span aria-hidden="true">{risk.glyph}</span>
                            {risk.label}
                          </Badge>
                          {m.riskNote ? <span className="text-[11px] break-keep text-muted">{m.riskNote}</span> : null}
                        </div>

                        <GuidePanel id={m.id} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          }
        </SectionGate>
      </div>
    </div>
  );
}
