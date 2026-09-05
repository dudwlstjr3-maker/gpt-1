'use client';

/** 오늘의 시장 요약 — 최대 3줄. 사실과 해석을 시각적으로 구분한다. */

import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { formatKstTime } from '@/lib/format';
import type { SummaryLine } from '@/types';

const KIND_META: Record<SummaryLine['kind'], { label: string; tone: 'neutral' | 'accent' | 'warn'; glyph: string }> = {
  fact: { label: '사실', tone: 'neutral', glyph: '▪' },
  interpretation: { label: '해석', tone: 'accent', glyph: '▸' },
  insufficient: { label: '근거 부족', tone: 'warn', glyph: '?' },
};

export function SummaryCard() {
  const { snapshot, refresh } = useData();
  const section = snapshot?.sections.summary ?? null;

  return (
    <section aria-labelledby="summary-title" className="mt-5 px-3">
      <h2 id="summary-title" className="mb-2 text-base font-bold text-fg-strong">
        오늘의 시장 요약
      </h2>

      <SectionGate section={section} onRetry={refresh} loading={<SkeletonCard height={60} lines={2} />}>
        {(summary) => (
          <div className="card p-3.5">
            <ul className="space-y-2.5">
              {summary.lines.map((line, i) => {
                const meta = KIND_META[line.kind];
                return (
                  <li key={i} className="flex items-start gap-2">
                    <Badge tone={meta.tone} size="xs">
                      <span aria-hidden="true">{meta.glyph}</span>
                      {meta.label}
                    </Badge>
                    <p className="min-w-0 flex-1 text-[13px] leading-relaxed break-keep text-fg">{line.text}</p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2.5 border-t border-border pt-2 text-[11.5px] text-subtle">
              생성 {formatKstTime(summary.generatedAt)} · 실제 가격·지표 값에 근거해 규칙 기반으로 작성되며, 근거가 없으면
              원인을 추정하지 않습니다.
            </p>
          </div>
        )}
      </SectionGate>
    </section>
  );
}
