'use client';

/** 알림 설정 — 규칙 관리, 권한 요청, 발생 이력. */

import { useCallback, useEffect, useState } from 'react';
import { useSettings } from '@/components/providers/SettingsProvider';
import { Toggle } from '@/components/ui/Controls';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, Notice } from '@/components/ui/States';
import { clearEvents, markAllRead, readStore } from '@/components/alerts/store';
import { CATALOG, CATALOG_BY_ID } from '@/lib/catalog';
import { formatRelative } from '@/lib/format';
import { MARKET_IDS, MARKET_LABEL, type AlertEvent, type AlertRule, type AlertRuleType } from '@/types';

const RULE_META: Record<AlertRuleType, { label: string; desc: string; needsTargetQuote: boolean; unit: string }> = {
  fng_stage_change: { label: 'Fear & Greed 단계 변경', desc: '공포↔중립↔탐욕 단계가 바뀌면 알립니다.', needsTargetQuote: false, unit: '' },
  fng_threshold: { label: '점수 돌파', desc: '지정한 점수를 넘거나 밑돌면 알립니다.', needsTargetQuote: false, unit: '점' },
  regime_rarity: { label: '국면이 1년 이상 만의 극단에 들어갈 때', desc: '국면 점수가 최소 1년 만의 공포·과열 수준에 닿으면 알립니다. 몇 개월 만인 정도로는 울리지 않습니다.', needsTargetQuote: false, unit: '' },
  price_target: { label: '목표 가격 도달', desc: '지정한 가격에 도달하면 알립니다.', needsTargetQuote: true, unit: '' },
  price_move: { label: '급등락', desc: '당일 등락률이 기준을 넘으면 알립니다.', needsTargetQuote: true, unit: '%' },
  risk_spike: { label: '위험 지표 급변', desc: 'VIX·VKOSPI·환율이 기준 이상 상승하면 알립니다.', needsTargetQuote: true, unit: '%' },
  calendar_reminder: { label: '주요 지표 발표 전 알림', desc: '중요도 높음 일정 전에 미리 알립니다.', needsTargetQuote: false, unit: '분 전' },
};

const RISK_TARGETS = ['vix', 'vkospi', 'usdkrw'];

function newId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function AlertsPage() {
  const { settings, update, addAlertRule, removeAlertRule, updateAlertRule } = useSettings();
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');

  const [type, setType] = useState<AlertRuleType>('fng_stage_change');
  const [target, setTarget] = useState<string>('us');
  const [threshold, setThreshold] = useState<string>('');
  const [direction, setDirection] = useState<'above' | 'below' | 'both'>('above');
  const [cooldown, setCooldown] = useState<string>('60');

  const refreshEvents = useCallback(() => setEvents(readStore().events), []);

  useEffect(() => {
    refreshEvents();
    const handler = () => refreshEvents();
    window.addEventListener('mm3:alerts-changed', handler);
    return () => window.removeEventListener('mm3:alerts-changed', handler);
  }, [refreshEvents]);

  useEffect(() => {
    if (typeof Notification === 'undefined') setPermission('unsupported');
    else setPermission(Notification.permission);
  }, []);

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
    update({ notificationsGranted: result === 'granted' });
  };

  const meta = RULE_META[type];

  const targetOptions = meta.needsTargetQuote
    ? type === 'risk_spike'
      ? CATALOG.filter((c) => RISK_TARGETS.includes(c.id))
      : CATALOG
    : [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = threshold.trim() === '' ? undefined : Number(threshold);
    if (type !== 'fng_stage_change' && (num === undefined || !Number.isFinite(num))) return;

    const resolvedTarget = meta.needsTargetQuote ? target : MARKET_IDS.includes(target as never) ? target : 'us';
    const item = CATALOG_BY_ID.get(resolvedTarget);
    const label =
      type === 'calendar_reminder'
        ? `${RULE_META[type].label} (${num}분 전)`
        : meta.needsTargetQuote
          ? `${item?.name ?? resolvedTarget} · ${meta.label}${num !== undefined ? ` ${num}${meta.unit}` : ''}`
          : `${MARKET_LABEL[resolvedTarget as 'us']} · ${meta.label}${num !== undefined ? ` ${num}${meta.unit}` : ''}`;

    const rule: AlertRule = {
      id: newId(),
      type,
      enabled: true,
      label,
      target: resolvedTarget,
      ...(num !== undefined ? { threshold: num } : {}),
      ...(type === 'fng_threshold' || type === 'price_target' ? { direction } : {}),
      cooldownMinutes: Math.max(5, Number(cooldown) || 60),
      createdAt: Date.now(),
    };
    addAlertRule(rule);
    setThreshold('');
  };

  return (
    <div className="pt-2 pb-6">
      <h1 className="px-3 pt-1 text-lg font-bold text-fg-strong">알림</h1>

      <section className="mt-3 px-3">
        <div className="card p-3">
          <Toggle
            checked={settings.alertsEnabled}
            onChange={(v) => update({ alertsEnabled: v })}
            label="알림 사용"
            description="데이터가 갱신될 때마다 규칙을 확인합니다. 앱이 열려 있을 때만 동작합니다."
          />
          {settings.alertsEnabled ? (
            <div className="mt-2 border-t border-border pt-2.5">
              {permission === 'unsupported' ? (
                <Notice tone="neutral">이 브라우저는 시스템 알림을 지원하지 않습니다. 앱 내 알림만 표시됩니다.</Notice>
              ) : permission === 'granted' ? (
                <p className="text-[12.5px]" style={{ color: 'var(--ok)' }}>
                  ✓ 시스템 알림 권한이 허용되었습니다.
                </p>
              ) : permission === 'denied' ? (
                <Notice tone="warn">
                  브라우저에서 알림이 차단되어 있습니다. 사이트 설정에서 허용하면 시스템 알림을 받을 수 있습니다. 앱 내
                  알림은 계속 표시됩니다.
                </Notice>
              ) : (
                <div>
                  <p className="mb-1.5 text-[12.5px] break-keep text-muted">
                    시스템 알림을 받으려면 권한이 필요합니다. 권한 요청은 이 버튼을 눌렀을 때만 발생합니다.
                  </p>
                  <button
                    type="button"
                    onClick={requestPermission}
                    className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-fg"
                  >
                    알림 권한 요청
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </section>

      {/* 규칙 추가 */}
      <section className="mt-4 px-3" aria-labelledby="alert-add-title">
        <h2 id="alert-add-title" className="mb-1.5 text-[13px] font-bold text-muted">
          알림 규칙 추가
        </h2>
        <form onSubmit={submit} className="card space-y-2.5 p-3">
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-muted">알림 종류</span>
            <select
              value={type}
              onChange={(e) => {
                const t = e.target.value as AlertRuleType;
                setType(t);
                setTarget(RULE_META[t].needsTargetQuote ? (t === 'risk_spike' ? 'vix' : 'spx') : 'us');
                setThreshold(t === 'calendar_reminder' ? '60' : t === 'fng_threshold' ? '25' : t === 'price_move' ? '3' : '');
              }}
              className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[13px] text-fg"
            >
              {(Object.keys(RULE_META) as AlertRuleType[]).map((t) => (
                <option key={t} value={t}>
                  {RULE_META[t].label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11.5px] break-keep text-subtle">{meta.desc}</span>
          </label>

          {/* 국면 알림은 대상도 기준값도 없다 — 시장 하나가 아니라 전체 국면 하나뿐이고,
              문턱은 '1년 이상 만' 이라는 희소성으로 고정돼 있다. */}
          {type !== 'calendar_reminder' && type !== 'regime_rarity' ? (
            <label className="block">
              <span className="mb-1 block text-[12.5px] text-muted">대상</span>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[13px] text-fg"
              >
                {meta.needsTargetQuote
                  ? targetOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {MARKET_LABEL[c.market]} · {c.name}
                      </option>
                    ))
                  : MARKET_IDS.map((m) => (
                      <option key={m} value={m}>
                        {MARKET_LABEL[m]}
                      </option>
                    ))}
              </select>
            </label>
          ) : null}

          {type !== 'fng_stage_change' && type !== 'regime_rarity' ? (
            <div className="flex gap-2">
              <label className="flex-1">
                <span className="mb-1 block text-[12.5px] text-muted">기준값 ({meta.unit || '값'})</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  required
                  className="tnum w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[13px] text-fg"
                />
              </label>
              {type === 'fng_threshold' || type === 'price_target' ? (
                <label className="flex-1">
                  <span className="mb-1 block text-[12.5px] text-muted">조건</span>
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as 'above' | 'below' | 'both')}
                    className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[13px] text-fg"
                  >
                    <option value="above">이상일 때</option>
                    <option value="below">이하일 때</option>
                    <option value="both">양방향</option>
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-[12.5px] text-muted">쿨다운 (분) — 같은 조건의 반복 알림을 막습니다</span>
            <input
              type="number"
              min={5}
              step={5}
              value={cooldown}
              onChange={(e) => setCooldown(e.target.value)}
              className="tnum w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[13px] text-fg"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-[13px] font-bold"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            규칙 추가
          </button>
        </form>
      </section>

      {/* 규칙 목록 */}
      <section className="mt-4 px-3" aria-labelledby="alert-rules-title">
        <h2 id="alert-rules-title" className="mb-1.5 text-[13px] font-bold text-muted">
          등록된 규칙 ({settings.alertRules.length})
        </h2>
        {settings.alertRules.length === 0 ? (
          <EmptyState title="등록된 알림 규칙이 없습니다" description="위에서 규칙을 추가해 보세요." />
        ) : (
          <ul className="card divide-y divide-[var(--border)] overflow-hidden">
            {settings.alertRules.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-fg">{r.label}</p>
                  <p className="text-[11.5px] text-subtle">
                    {RULE_META[r.type].label} · 쿨다운 {r.cooldownMinutes}분
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={r.enabled}
                  onClick={() => updateAlertRule(r.id, { enabled: !r.enabled })}
                  className="shrink-0 rounded-md border border-border px-2 py-1 text-[12.5px] font-semibold"
                  style={{ color: r.enabled ? 'var(--ok)' : 'var(--muted-fg)' }}
                >
                  {r.enabled ? '켜짐' : '꺼짐'}
                </button>
                <button
                  type="button"
                  onClick={() => removeAlertRule(r.id)}
                  aria-label={`${r.label} 삭제`}
                  className="h-7 w-7 shrink-0 rounded-md border border-border text-xs"
                  style={{ color: 'var(--danger)' }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 발생 이력 */}
      <section className="mt-4 px-3" aria-labelledby="alert-log-title">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h2 id="alert-log-title" className="text-[13px] font-bold text-muted">
            발생 이력
          </h2>
          {events.length > 0 ? (
            <div className="flex gap-1.5">
              <button type="button" onClick={markAllRead} className="text-[12.5px] font-semibold text-accent">
                모두 읽음
              </button>
              <button type="button" onClick={clearEvents} className="text-[12.5px] font-semibold" style={{ color: 'var(--danger)' }}>
                기록 삭제
              </button>
            </div>
          ) : null}
        </div>
        {events.length === 0 ? (
          <EmptyState title="발생한 알림이 없습니다" description="조건을 만족하면 여기에 기록됩니다." />
        ) : (
          <ul className="card divide-y divide-[var(--border)] overflow-hidden">
            {events.map((e) => (
              <li key={e.id} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-semibold text-fg">{e.title}</p>
                  <div className="flex shrink-0 items-center gap-1">
                    {!e.read ? (
                      <Badge tone="accent" size="xs">
                        새 알림
                      </Badge>
                    ) : null}
                    <span className="text-[11.5px] text-subtle">{formatRelative(e.firedAt)}</span>
                  </div>
                </div>
                <p className="mt-0.5 text-[12.5px] break-keep text-muted">{e.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
