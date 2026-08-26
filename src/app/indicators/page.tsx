'use client';

/** 경제·위험 지표 전체 — 홈에서 요약한 항목의 상세 화면. */

import { useMemo, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, EmptyState } from '@/components/ui/States';
import { SegmentedControl } from '@/components/ui/Controls';
import { Badge } from '@/components/ui/Badge';
import { formatMacroValue } from '@/components/market/PriceCard';
import { formatNumber, formatRelative, NO_VALUE } from '@/lib/format';
import type { MacroIndicator } from '@/types';

type GroupFilter = 'all' | '미국' | '한국' | '글로벌' | '크립토';

const RISK_META: Record<MacroIndicator['riskLevel'], { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral'; glyph: string }> = {
  normal: { label: '정상', tone: 'ok', glyph: '·' },
  watch: { label: '관찰', tone: 'warn', glyph: '△' },
  alert: { label: '주의', tone: 'danger', glyph: '▲' },
  unknown: { label: '정보 없음', tone: 'neutral', glyph: '—' },
};

const TREND_GLYPH: Record<MacroIndicator['trend'], string> = { up: '▲', down: '▼', flat: '―', unknown: '—' };
const TREND_LABEL: Record<MacroIndicator['trend'], string> = {
  up: '상승',
  down: '하락',
  flat: '보합',
  unknown: '알 수 없음',
};

export default function IndicatorsPage() {
  const { snapshot, refresh } = useData();
  const [group, setGroup] = useState<GroupFilter>('all');
  const section = snapshot?.sections.macro ?? null;

  const list = useMemo(() => {
    const items = section?.data ?? [];
    return group === 'all' ? items : items.filter((m) => m.group === group);
  }, [section, group]);

  const alerts = (section?.data ?? []).filter((m) => m.riskLevel === 'alert');

  return (
    <div className="pt-2 pb-4">
      <h1 className="px-3 pt-1 text-lg font-bold text-fg-strong">경제 · 위험 지표</h1>
      <p className="mt-0.5 px-3 text-[11px] text-muted">
        각 지표의 위험 단계는 색상뿐 아니라 기호·텍스트로도 표시됩니다.
      </p>

      {alerts.length > 0 ? (
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

      <div className="mt-3 px-3">
        <SegmentedControl
          label="지표 그룹"
          size="xs"
          full
          value={group}
          onChange={setGroup}
          options={[
            { value: 'all', label: '전체' },
            { value: '미국', label: '미국' },
            { value: '한국', label: '한국' },
            { value: '글로벌', label: '글로벌' },
            { value: '크립토', label: '크립토' },
          ]}
        />
      </div>

      <div className="mt-3 px-3">
        <SectionGate
          section={section}
          onRetry={refresh}
          loading={<SkeletonCard height={40} lines={6} />}
          empty={<EmptyState title="지표 데이터가 없습니다" />}
        >
          {() =>
            list.length === 0 ? (
              <EmptyState title="해당 그룹의 지표가 없습니다" />
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
                              {formatMacroValue(m.value, m.precision, m.unit)}
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
                            <span aria-hidden="true">{risk.glyph}</span>
                            {risk.label}
                          </Badge>
                          {m.riskNote ? <span className="text-[11px] break-keep text-muted">{m.riskNote}</span> : null}
                        </div>
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
