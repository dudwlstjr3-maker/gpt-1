'use client';

/**
 * 홈의 '내 기준' 탭 — 개수만 보여주고 자세한 건 전용 화면으로 넘긴다.
 *
 * 홈은 "10초 안에 파악" 이 목적이라 여기서 조건을 편집하게 만들지 않았다.
 * 그리고 요약은 끝까지 **개수**다 — '매수 우위' 같은 판정을 만들지 않는다.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useSettings } from '@/components/providers/SettingsProvider';
import { EmptyState } from '@/components/ui/States';
import { summarize } from '@/lib/criteriaRules.mjs';

export function CriteriaSummaryCard() {
  const { snapshot } = useData();
  const { settings, hydrated } = useSettings();

  const sum = useMemo(() => summarize(settings.criteria, snapshot), [settings.criteria, snapshot]);

  if (!hydrated) {
    return (
      <div className="mt-3 px-3">
        <div className="skeleton h-20 rounded-xl" />
      </div>
    );
  }

  return (
    <section className="mt-3 px-3" aria-labelledby="home-criteria-title">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 id="home-criteria-title" className="text-[13px] font-bold text-fg-strong">
          내 기준
        </h3>
        <Link href="/criteria" className="shrink-0 text-[11px] font-semibold text-accent hover:underline">
          {sum.total === 0 ? '조건 만들기 →' : '자세히 보기 →'}
        </Link>
      </div>

      {sum.total === 0 ? (
        <EmptyState
          title="아직 정한 조건이 없습니다"
          description="무엇을 볼지 직접 정해 두면 지금 그 조건이 맞는지 여기서 바로 확인할 수 있습니다."
        />
      ) : (
        <div className="card p-3.5">
          <p className="tnum text-[22px] leading-none font-bold text-fg-strong">
            {sum.total}개 중 {sum.met}개 맞음
          </p>
          <p className="tnum mt-1.5 text-[11px] text-muted">
            아님 {sum.unmet}개{sum.unknown > 0 ? ` · 판정 불가 ${sum.unknown}개` : ''}
          </p>
          {/* 조건이 다 맞아도 신호가 아니라는 말은 요약 옆에 둔다. 아래로 밀면 안 읽힌다. */}
          <p className="mt-2 border-t border-border pt-2 text-[10.5px] leading-relaxed break-keep text-subtle">
            사용자가 정한 조건이 맞는지만 확인한 것입니다. 사거나 팔라는 신호가 아닙니다.
          </p>
        </div>
      )}
    </section>
  );
}
