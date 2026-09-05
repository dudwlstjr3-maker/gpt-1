'use client';

/**
 * 내 기준 — 사용자가 정한 조건이 지금 맞는지 확인하는 판.
 *
 * **이 화면은 매매 판단을 하지 않는다.**
 * 이 앱은 첫 줄부터 "투자 추천·매수/매도 지시를 하지 않는다" 를 지키고 있다.
 * 여기서 하는 일은 판단이 아니라 사실 확인이다 — 조건도 문턱도 사용자가 정하고,
 * 앱은 "지금 그 값이 얼마인가" 만 답한다.
 *
 * 그 선을 화면에서 지키는 방법
 *  - 요약이 "5개 중 3개 충족" 이라는 **개수**다. '매수 우위' 같은 판정을 만들지 않는다.
 *  - 조건을 앱이 제안하지 않는다. 처음 열면 비어 있고, 예시는 "이런 것도 만들 수
 *    있습니다" 수준으로만 보여준다.
 *  - 조건이 다 맞아도 그게 신호가 아니라는 말을 요약 바로 옆에 둔다.
 *    맨 아래 고지로 밀어 두면 아무도 안 읽는다.
 *  - **판정 불가를 충족으로 세지 않는다.** 값을 못 받은 줄은 왜 못 받았는지 적는다.
 */

import { useMemo, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useSettings } from '@/components/providers/SettingsProvider';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, Notice } from '@/components/ui/States';
import { SegmentedControl } from '@/components/ui/Controls';
import { formatNumber } from '@/lib/format';
import { COMPARATOR_LABEL, describe, summarize } from '@/lib/criteriaRules.mjs';
import {
  MARKET_IDS,
  MARKET_LABEL,
  RISK_LEVEL_LABEL,
  type Criterion,
  type CriterionComparator,
  type MarketId,
  type RiskLevel,
} from '@/types';

/* ------------------------------------------------------------------ */

const STATUS = {
  met: { glyph: '✓', label: '맞음', tone: 'ok' as const },
  unmet: { glyph: '✗', label: '아님', tone: 'neutral' as const },
  unknown: { glyph: '?', label: '판정 불가', tone: 'warn' as const },
};

/** 조건을 만드는 칸. 종류에 따라 두 번째 고르는 것이 달라진다. */
function CriterionForm({ onAdd, indicators }: { onAdd: (c: Criterion) => void; indicators: { id: string; label: string }[] }) {
  const [kind, setKind] = useState<Criterion['kind']>('fng');
  const [market, setMarket] = useState<MarketId>(MARKET_IDS[0]);
  const [level, setLevel] = useState<RiskLevel>('alert');
  const [indicatorId, setIndicatorId] = useState(indicators[0]?.id ?? 'vix');
  const [comparator, setComparator] = useState<CriterionComparator>('lte');
  const [value, setValue] = useState('30');

  const num = Number(value);
  const valid = Number.isFinite(num);

  const add = () => {
    if (!valid) return;
    const id = `c${Date.now().toString(36)}`;
    const base = { id, comparator, value: num };
    if (kind === 'fng') onAdd({ ...base, kind: 'fng', market });
    else if (kind === 'regime') onAdd({ ...base, kind: 'regime' });
    else if (kind === 'risk_count') onAdd({ ...base, kind: 'risk_count', level });
    else onAdd({ ...base, kind: 'risk_value', indicatorId });
    setValue('30');
  };

  const sel = 'w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[13px] text-fg';

  return (
    <div className="card p-3.5">
      <h3 className="text-[13px] font-bold text-fg-strong">조건 추가</h3>

      <div className="mt-2.5 space-y-2">
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-muted">무엇을 볼까요</span>
          <select className={sel} value={kind} onChange={(e) => setKind(e.target.value as Criterion['kind'])}>
            <option value="fng">시장 심리 점수</option>
            <option value="regime">국면 점수 (20년 기준)</option>
            <option value="risk_count">위험 신호등 개수</option>
            <option value="risk_value">개별 위험 지표 값</option>
          </select>
        </label>

        {kind === 'fng' ? (
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-muted">어느 시장</span>
            <select className={sel} value={market} onChange={(e) => setMarket(e.target.value as MarketId)}>
              {MARKET_IDS.map((m) => (
                <option key={m} value={m}>
                  {MARKET_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {kind === 'regime' ? (
          <p className="text-[11.5px] leading-relaxed break-keep text-subtle">
            변동성·신용 스프레드·낙폭·추세를 지난 20년 분포와 견준 0~100 점수입니다. 낮을수록 공포 쪽입니다.
          </p>
        ) : null}

        {kind === 'risk_count' ? (
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-muted">어느 단계를 셀까요</span>
            <select className={sel} value={level} onChange={(e) => setLevel(e.target.value as RiskLevel)}>
              {(['alert', 'watch', 'normal', 'calm'] as RiskLevel[]).map((l) => (
                <option key={l} value={l}>
                  {RISK_LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {kind === 'risk_value' ? (
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-muted">어느 지표</span>
            <select className={sel} value={indicatorId} onChange={(e) => setIndicatorId(e.target.value)}>
              {indicators.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[12.5px] text-muted">값</span>
            <input
              className={`${sel} tnum`}
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={!valid}
            />
          </label>
          <label className="w-24 shrink-0">
            <span className="mb-1 block text-[12.5px] text-muted">비교</span>
            <select
              className={sel}
              value={comparator}
              onChange={(e) => setComparator(e.target.value as CriterionComparator)}
            >
              <option value="lte">이하</option>
              <option value="gte">이상</option>
            </select>
          </label>
        </div>
      </div>

      {!valid ? <p className="mt-1.5 text-[12.5px] text-warn">숫자를 넣어 주세요.</p> : null}

      <button
        type="button"
        onClick={add}
        disabled={!valid}
        className="mt-3 w-full rounded-lg px-3 py-2 text-[13px] font-bold disabled:opacity-45"
        style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
      >
        이 조건 추가
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function CriteriaBoard() {
  const { snapshot } = useData();
  const { settings, update, hydrated } = useSettings();
  const [view, setView] = useState<'now' | 'edit'>('now');

  const indicators = useMemo(() => {
    const list = snapshot?.sections.risk?.data?.indicators ?? [];
    return list.map((i) => ({ id: i.id, label: i.name }));
  }, [snapshot]);

  const labelOf = useMemo(() => {
    const byId = new Map(indicators.map((i) => [i.id, i.label]));
    return (c: Criterion) => ({
      market: c.kind === 'fng' ? MARKET_LABEL[c.market] : undefined,
      level: c.kind === 'risk_count' ? RISK_LEVEL_LABEL[c.level] : undefined,
      indicator: c.kind === 'risk_value' ? (byId.get(c.indicatorId) ?? c.indicatorId) : undefined,
    });
  }, [indicators]);

  const sum = useMemo(() => summarize(settings.criteria, snapshot), [settings.criteria, snapshot]);

  const addCriterion = (c: Criterion) => update({ criteria: [...settings.criteria, c] });
  const removeCriterion = (id: string) =>
    update({ criteria: settings.criteria.filter((c) => c.id !== id) });

  if (!hydrated) {
    return (
      <div className="px-3">
        <div className="skeleton h-24 rounded-xl" />
      </div>
    );
  }

  return (
    <div>
      <div className="px-3">
        <Notice tone="neutral">
          여기 숫자는 <strong>사용자가 정한 조건이 지금 맞는지</strong>만 확인합니다. 조건이 다 맞아도{' '}
          <strong>사거나 팔라는 신호가 아닙니다.</strong> 이 앱은 매매 판단을 하지 않습니다 — 무엇을 볼지, 그래서
          어떻게 할지는 전부 사용자가 정합니다.
        </Notice>
      </div>

      <div className="mt-2.5 px-3">
        <SegmentedControl
          label="내 기준 보기"
          full
          value={view}
          onChange={setView}
          options={[
            { value: 'now', label: `지금 상태 (${sum.total})` },
            { value: 'edit', label: '조건 고치기' },
          ]}
        />
      </div>

      {view === 'now' ? (
        <div className="mt-3 px-3">
          {sum.total === 0 ? (
            <EmptyState
              title="아직 정한 조건이 없습니다"
              description="'조건 고치기' 에서 직접 만들어 주세요. 앱은 조건을 제안하지 않습니다 — 무엇을 중요하게 볼지는 사람마다 다르기 때문입니다."
            />
          ) : (
            <>
              {/* 요약은 개수다. 등급이나 판정을 만들지 않는다. */}
              <div className="card p-3.5">
                <p className="text-[13px] text-muted">내가 정한 조건</p>
                <p className="tnum mt-1 text-[26px] leading-none font-bold text-fg-strong">
                  {sum.total}개 중 {sum.met}개 맞음
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed break-keep text-muted">
                  아님 {sum.unmet}개
                  {sum.unknown > 0 ? ` · 판정 불가 ${sum.unknown}개` : ''}
                  {sum.unknown > 0 ? ' — 값을 받지 못한 조건은 맞음으로 세지 않습니다.' : ''}
                </p>
              </div>

              <ul className="mt-2.5 space-y-2">
                {sum.results.map((r, i) => {
                  const c = r.criterion as Criterion;
                  const st = STATUS[r.status];
                  return (
                    <li key={c.id ?? i} className="card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-[13px] leading-relaxed break-keep text-fg">
                          {describe(c, labelOf(c))}
                        </p>
                        <Badge tone={st.tone} size="xs">
                          <span aria-hidden="true">{st.glyph}</span>
                          {st.label}
                        </Badge>
                      </div>
                      <p className="tnum mt-1 text-[12.5px] text-muted">
                        지금 값{' '}
                        {r.actual === null ? (
                          <span className="text-warn">{r.reason ?? '받지 못했습니다.'}</span>
                        ) : (
                          <strong className="text-fg-strong">{formatNumber(r.actual, 2)}</strong>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2.5 px-3">
          <CriterionForm onAdd={addCriterion} indicators={indicators} />

          {settings.criteria.length > 0 ? (
            <ul className="space-y-2">
              {settings.criteria.map((c) => (
                <li key={c.id} className="card flex items-center justify-between gap-2 p-3">
                  <p className="min-w-0 text-[13px] leading-relaxed break-keep text-fg">
                    {describe(c, labelOf(c))}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeCriterion(c.id)}
                    className="shrink-0 rounded-md border border-border px-2 py-1 text-[12.5px] font-semibold text-muted hover:text-fg"
                    aria-label="이 조건 삭제"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] leading-relaxed break-keep text-subtle">
              예를 들면 이런 것들을 만들 수 있습니다 — &ldquo;미국 심리 점수가 25 {COMPARATOR_LABEL.lte}&rdquo;,
              &ldquo;위험 신호등에서 &lsquo;주의&rsquo; 인 지표가 1개 {COMPARATOR_LABEL.lte}&rdquo;. 어떤 조건을
              둘지는 앱이 정해 주지 않습니다.
            </p>
          )}
        </div>
      )}

      <p className="mt-4 px-3 text-[11.5px] leading-relaxed break-keep text-subtle">
        조건은 이 기기에만 저장됩니다. 과거에 이 조건이 맞았을 때 어떤 일이 있었는지는 알려주지 않습니다 — 지난
        결과가 다음을 보장하지 않고, 그런 표를 붙이면 이 화면이 매매 판단처럼 읽히기 때문입니다.
      </p>
    </div>
  );
}
