'use client';

/**
 * 알림 엔진 — 스냅샷이 갱신될 때마다 규칙을 평가한다.
 *  - 중복 방지: 규칙 + 상태를 조합한 dedupeKey
 *  - 쿨다운: 규칙별 분 단위
 *  - 브라우저 알림 권한은 사용자가 "알림 사용"을 직접 켰을 때만 요청한다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useSettings } from '@/components/providers/SettingsProvider';
import { canFire, readStore, recordFire, writeStore } from './store';
import { formatNumber, formatPercent, formatScore, formatKstTime } from '@/lib/format';
import { stageOf } from '@/lib/scale';
import { MARKET_LABEL, type AlertEvent, type AlertRule, type MarketId, type Quote, type Snapshot } from '@/types';

interface Fired {
  title: string;
  body: string;
  dedupeKey: string;
}

function evaluate(rule: AlertRule, snapshot: Snapshot, prevStage: Record<string, string>, prevPrice: Record<string, number>): Fired | null {
  const quotes: Quote[] = snapshot.sections.quotes.data
    ? (['us', 'kr', 'crypto'] as MarketId[]).flatMap((m) => snapshot.sections.quotes.data?.[m] ?? [])
    : [];
  const findQuote = (id: string) => quotes.find((q) => q.id === id);
  const fng = snapshot.sections.fng.data ?? [];
  const findFng = (m: string) => fng.find((f) => f.market === m);

  switch (rule.type) {
    case 'fng_stage_change': {
      const f = findFng(rule.target);
      if (!f || f.score === null || !f.stage) return null;
      const prev = prevStage[rule.target];
      if (!prev || prev === f.stage.id) return null;
      return {
        title: `${MARKET_LABEL[f.market]} 투자심리 단계 변경`,
        body: `${f.stage.label} (${formatScore(f.score)}점) — 이전 단계에서 변경되었습니다.`,
        dedupeKey: `${rule.id}:${f.stage.id}`,
      };
    }
    case 'fng_threshold': {
      const f = findFng(rule.target);
      if (!f || f.score === null || rule.threshold === undefined) return null;
      const above = f.score >= rule.threshold;
      const below = f.score <= rule.threshold;
      const hit = rule.direction === 'below' ? below : rule.direction === 'above' ? above : above || below;
      if (!hit) return null;
      return {
        title: `${MARKET_LABEL[f.market]} 심리 점수 ${rule.threshold}점 ${rule.direction === 'below' ? '이하' : '이상'}`,
        body: `현재 ${formatScore(f.score)}점 (${f.stage?.label ?? ''})`,
        dedupeKey: `${rule.id}:${above ? 'above' : 'below'}`,
      };
    }
    case 'price_target': {
      const q = findQuote(rule.target);
      if (!q || q.price === null || rule.threshold === undefined) return null;
      const above = q.price >= rule.threshold;
      const below = q.price <= rule.threshold;
      const hit = rule.direction === 'below' ? below : rule.direction === 'above' ? above : above || below;
      if (!hit) return null;
      const prev = prevPrice[q.id];
      // 이미 조건을 만족한 상태에서 계속 울리지 않도록, 이전 값이 반대편일 때만 발생
      if (prev !== undefined) {
        const prevAbove = prev >= rule.threshold;
        if (prevAbove === above && rule.direction !== 'both') return null;
      }
      return {
        title: `${q.name} 목표가 도달`,
        body: `현재 ${formatNumber(q.price, q.precision)} · 목표 ${formatNumber(rule.threshold, q.precision)}`,
        dedupeKey: `${rule.id}:${above ? 'above' : 'below'}`,
      };
    }
    case 'price_move': {
      const q = findQuote(rule.target);
      if (!q || q.changePct === null || rule.threshold === undefined) return null;
      if (Math.abs(q.changePct) < rule.threshold) return null;
      return {
        title: `${q.name} 급등락`,
        body: `${formatPercent(q.changePct, 2)} 변동 (기준 ${rule.threshold}%)`,
        dedupeKey: `${rule.id}:${q.changePct > 0 ? 'up' : 'down'}:${Math.floor(Math.abs(q.changePct))}`,
      };
    }
    case 'risk_spike': {
      const q = findQuote(rule.target);
      if (!q || q.changePct === null || rule.threshold === undefined) return null;
      if (q.changePct < rule.threshold) return null;
      return {
        title: `${q.name} 급변`,
        body: `${formatPercent(q.changePct, 2)} 상승 · 현재 ${formatNumber(q.price, q.precision)}`,
        dedupeKey: `${rule.id}:${Math.floor(q.changePct)}`,
      };
    }
    case 'calendar_reminder': {
      const events = snapshot.sections.calendar.data ?? [];
      const minutes = rule.threshold ?? 60;
      const now = Date.now();
      const upcoming = events.find((e) => {
        if (e.importance !== 'high') return false;
        const t = Date.parse(e.scheduledAt);
        return t > now && t - now <= minutes * 60_000;
      });
      if (!upcoming) return null;
      return {
        title: '주요 경제지표 발표 예정',
        body: `${upcoming.title} · ${formatKstTime(upcoming.scheduledAt)} KST`,
        dedupeKey: `${rule.id}:${upcoming.id}`,
      };
    }
    default:
      return null;
  }
}

export function AlertsEngine() {
  const { snapshot } = useData();
  const { settings } = useSettings();
  const [toasts, setToasts] = useState<AlertEvent[]>([]);
  const lastSnapshotAt = useRef<string | null>(null);

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  useEffect(() => {
    if (!snapshot || !settings.alertsEnabled) return;
    if (snapshot.generatedAt === lastSnapshotAt.current) return;
    lastSnapshotAt.current = snapshot.generatedAt;

    let store = readStore();
    const now = Date.now();
    const newEvents: AlertEvent[] = [];

    for (const rule of settings.alertRules) {
      if (!rule.enabled) continue;
      const fired = evaluate(rule, snapshot, store.lastStage, store.lastPrice);
      if (!fired) continue;
      if (!canFire(store, fired.dedupeKey, rule.cooldownMinutes, now)) continue;

      const event: AlertEvent = {
        id: `${rule.id}-${now}-${Math.random().toString(36).slice(2, 7)}`,
        ruleId: rule.id,
        title: fired.title,
        body: fired.body,
        firedAt: now,
        dedupeKey: fired.dedupeKey,
        read: false,
      };
      store = recordFire(store, event);
      newEvents.push(event);
    }

    // 현재 상태 스냅샷 저장 (다음 평가의 "이전 값")
    const nextStage: Record<string, string> = { ...store.lastStage };
    for (const f of snapshot.sections.fng.data ?? []) {
      const s = stageOf(f.score);
      if (s) nextStage[f.market] = s.id;
    }
    const nextPrice: Record<string, number> = { ...store.lastPrice };
    for (const m of ['us', 'kr', 'crypto'] as MarketId[]) {
      for (const q of snapshot.sections.quotes.data?.[m] ?? []) {
        if (q.price !== null) nextPrice[q.id] = q.price;
      }
    }
    writeStore({ ...store, lastStage: nextStage, lastPrice: nextPrice });

    if (newEvents.length > 0) {
      setToasts((t) => [...newEvents, ...t].slice(0, 3));
      if (settings.notificationsGranted && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        for (const e of newEvents) {
          try {
            new Notification(e.title, { body: e.body, tag: e.dedupeKey });
          } catch {
            /* 일부 환경에서는 SW 없이 Notification 생성이 막힌다 */
          }
        }
      }
    }
  }, [snapshot, settings.alertsEnabled, settings.alertRules, settings.notificationsGranted]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed inset-x-3 top-3 z-50 flex flex-col gap-2 lg:left-auto lg:right-4 lg:w-80" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="card flex items-start gap-2 p-3" style={{ borderColor: 'var(--accent)' }}>
          <span aria-hidden="true" className="mt-0.5 text-sm">
            🔔
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-fg-strong">{t.title}</p>
            <p className="mt-0.5 text-[11px] break-keep text-muted">{t.body}</p>
          </div>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="알림 닫기"
            className="shrink-0 text-sm text-muted hover:text-fg"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
