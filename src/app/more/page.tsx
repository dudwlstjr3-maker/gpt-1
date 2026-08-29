'use client';

/** 더보기 — 표시 설정, DEMO 시나리오, 홈 표시 항목, 데이터 진단. */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSettings } from '@/components/providers/SettingsProvider';
import { useData } from '@/components/providers/DataProvider';
import { SegmentedControl, Toggle } from '@/components/ui/Controls';
import { Badge, ModeBadge } from '@/components/ui/Badge';
import { Notice } from '@/components/ui/States';
import { CATALOG, catalogFor } from '@/lib/catalog';
import { formatKstFull } from '@/lib/format';
import { DEMO_SCENARIOS, MARKET_IDS, MARKET_LABEL } from '@/types';

interface Health {
  mode: string;
  modePreference: string;
  reason: string;
  missingEnv: string[];
  formulaVersion: string;
  serverTime: string;
}

function Section({ title, children, description }: { title: string; children: React.ReactNode; description?: string }) {
  return (
    <section className="mt-4 px-3">
      <h2 className="mb-1.5 text-[12px] font-bold text-muted">{title}</h2>
      {description ? <p className="mb-1.5 text-[11px] break-keep text-subtle">{description}</p> : null}
      <div className="card p-3">{children}</div>
    </section>
  );
}

export default function MorePage() {
  const { settings, update, reset, toggleHomeItem, moveHomeItem } = useSettings();
  const { snapshot } = useData();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Health) => setHealth(d))
      .catch((e: Error) => setHealthError(e.message));
  }, []);

  const isDemo = snapshot?.mode === 'DEMO';

  return (
    <div className="pt-2 pb-6">
      <h1 className="px-3 pt-1 text-lg font-bold text-fg-strong">더보기</h1>

      <Section title="화면">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-fg">테마</span>
            <SegmentedControl
              label="테마"
              value={settings.theme}
              onChange={(v) => update({ theme: v })}
              options={[
                { value: 'dark', label: '다크' },
                { value: 'light', label: '라이트' },
                { value: 'system', label: '시스템' },
              ]}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-fg">표시 통화</span>
            <SegmentedControl
              label="표시 통화"
              value={settings.currency}
              onChange={(v) => update({ currency: v })}
              options={[
                { value: 'KRW', label: '원 (₩)' },
                { value: 'USD', label: '달러 ($)' },
              ]}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-fg">등락 색상</span>
            <SegmentedControl
              label="등락 색상"
              value={settings.colorMode}
              onChange={(v) => update({ colorMode: v })}
              options={[
                { value: 'korean', label: '한국식 ▲빨강' },
                { value: 'global', label: '글로벌 ▲초록' },
              ]}
            />
          </div>
          <div className="border-t border-border pt-1">
            <Toggle
              checked={settings.autoRefresh}
              onChange={(v) => update({ autoRefresh: v })}
              label="자동 갱신"
              description="30초마다 새 데이터를 확인합니다. 화면이 보이지 않을 때는 요청하지 않습니다."
            />
          </div>
        </div>
      </Section>

      <Section
        title="DEMO 시나리오"
        description="API 키 없이도 정상·로딩·빈값·부분 실패·오래된 데이터·전체 오류 화면을 그대로 재현할 수 있습니다."
      >
        {!isDemo ? (
          <Notice tone="neutral">
            현재 LIVE 모드입니다. 시나리오 전환은 DEMO 모드에서만 동작합니다. (MARKET_MOOD_MODE=demo 로 전환 가능)
          </Notice>
        ) : null}
        <ul className="mt-2 space-y-1.5">
          {DEMO_SCENARIOS.map((s) => {
            const active = settings.scenario === s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => update({ scenario: s.id })}
                  aria-pressed={active}
                  className="flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left"
                  style={{
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--surface-2)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: active ? 'var(--accent)' : 'var(--border-strong)' }}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-fg">{s.label}</span>
                    <span className="block text-[11px] break-keep text-subtle">{s.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="홈 표시 항목" description="홈 화면 '관심 가격과 주요 지수'에 노출할 항목과 순서를 정합니다.">
        <ul className="divide-y divide-[var(--border)]">
          {settings.homeItems.map((id, idx) => {
            const item = CATALOG.find((c) => c.id === id);
            if (!item) return null;
            return (
              <li key={id} className="flex items-center gap-2 py-2">
                <span className="tnum w-5 shrink-0 text-[11px] text-subtle">{idx + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-fg">{item.name}</p>
                  <p className="text-[10px] text-subtle">{MARKET_LABEL[item.market]}</p>
                </div>
                <button
                  type="button"
                  onClick={() => moveHomeItem(id, -1)}
                  disabled={idx === 0}
                  aria-label={`${item.name} 위로`}
                  className="h-7 w-7 rounded-md border border-border text-xs text-muted disabled:opacity-35"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveHomeItem(id, 1)}
                  disabled={idx === settings.homeItems.length - 1}
                  aria-label={`${item.name} 아래로`}
                  className="h-7 w-7 rounded-md border border-border text-xs text-muted disabled:opacity-35"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => toggleHomeItem(id)}
                  aria-label={`${item.name} 홈에서 숨기기`}
                  className="h-7 w-7 rounded-md border border-border text-xs"
                  style={{ color: 'var(--danger)' }}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 border-t border-border pt-2">
          <p className="mb-1.5 text-[11px] text-muted">추가할 항목</p>
          <div className="space-y-2">
            {MARKET_IDS.map((m) => {
              const candidates = catalogFor(m).filter((c) => !settings.homeItems.includes(c.id));
              if (candidates.length === 0) return null;
              return (
                <div key={m}>
                  <p className="mb-1 text-[10px] text-subtle">{MARKET_LABEL[m]}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {candidates.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleHomeItem(c.id)}
                        className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] text-muted hover:text-fg"
                      >
                        + {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      <Section title="바로가기">
        <ul className="divide-y divide-[var(--border)]">
          {[
            { href: '/risk', label: '시장 위험 신호등', desc: '공포지수·정크본드·국채·환율·펀딩비 구간과 해설' },
            { href: '/market/us', label: '미국 시장', desc: 'S&P 500 · 나스닥 · 국채 · 빅테크' },
            { href: '/market/kr', label: '한국 시장', desc: 'KOSPI · KOSDAQ · 환율 · 투자자 수급' },
            { href: '/market/crypto', label: '크립토 시장', desc: 'BTC · ETH · 도미넌스 · 파생' },
            { href: '/indicators', label: '경제·위험 지표 전체', desc: '기준금리·물가·고용·PMI·스프레드·밸류에이션' },
            { href: '/basics', label: '생활 속 경제 이야기', desc: '1인당 GDP·빅맥지수·라떼지수·PPP 환율·엥겔계수·소비자심리' },
            { href: '/alerts', label: '알림 설정', desc: '단계 변경·점수 돌파·목표가·급등락·지표 발표 전' },
            { href: '/calendar', label: '경제 캘린더', desc: 'FOMC·금통위·CPI·고용보고서·만기·실적' },
          ].map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="flex items-center justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-fg">{l.label}</span>
                  <span className="block truncate text-[11px] text-subtle">{l.desc}</span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-muted">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="데이터 진단">
        <dl className="space-y-1.5 text-[12px]">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted">현재 모드</dt>
            <dd>{snapshot ? <ModeBadge mode={snapshot.mode} /> : '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted">산식 버전</dt>
            <dd className="tnum text-fg">{snapshot?.formulaVersion ?? health?.formulaVersion ?? '—'}</dd>
          </div>
          <div className="flex items-start justify-between gap-2">
            <dt className="shrink-0 text-muted">마지막 전체 업데이트</dt>
            <dd className="tnum text-right text-fg">{snapshot ? formatKstFull(snapshot.lastFullUpdate) : '—'}</dd>
          </div>
          <div className="flex items-start justify-between gap-2">
            <dt className="shrink-0 text-muted">모드 사유</dt>
            <dd className="text-right break-keep text-fg">{health?.reason ?? (healthError ? `진단 실패: ${healthError}` : '확인 중…')}</dd>
          </div>
          {health && health.missingEnv.length > 0 ? (
            <div className="flex items-start justify-between gap-2">
              <dt className="shrink-0 text-muted">누락 환경변수</dt>
              <dd className="flex flex-wrap justify-end gap-1">
                {health.missingEnv.map((k) => (
                  <Badge key={k} tone="warn" size="xs">
                    {k}
                  </Badge>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
        {snapshot ? (
          <div className="mt-3 border-t border-border pt-2">
            <p className="mb-1.5 text-[11px] text-muted">섹션별 상태</p>
            <ul className="grid grid-cols-2 gap-1.5">
              {Object.entries(snapshot.sections).map(([key, s]) => (
                <li key={key} className="flex items-center justify-between gap-1 rounded-md bg-surface-2 px-2 py-1">
                  <span className="truncate text-[11px] text-muted">{key}</span>
                  <Badge
                    size="xs"
                    tone={s.status === 'ok' ? 'ok' : s.status === 'error' ? 'danger' : s.status === 'loading' ? 'accent' : 'warn'}
                  >
                    {s.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      <Section title="초기화">
        <button
          type="button"
          onClick={() => {
            if (window.confirm('모든 설정(관심목록·홈 표시 항목·알림 규칙 포함)을 기본값으로 되돌릴까요?')) reset();
          }}
          className="w-full rounded-lg border px-3 py-2 text-[13px] font-semibold"
          style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
        >
          설정 초기화
        </button>
      </Section>
    </div>
  );
}
