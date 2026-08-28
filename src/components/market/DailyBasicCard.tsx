'use client';

/**
 * 오늘의 경제 이야기 — 홈에 하루 한 가지씩.
 *
 * 열세 개를 한 번에 읽으라고 하면 아무도 안 읽는다. 날짜로 하나를 정해
 * 그날치만 보여주고, 더 보고 싶으면 전체 목록으로 넘긴다.
 *
 * 무작위가 아니라 날짜(KST)로 정해지므로 같은 날 몇 번을 열어도 같은 항목이고,
 * 하루가 지나면 다음 항목으로 넘어가 결국 열세 개를 전부 한 번씩 돈다.
 */

import Link from 'next/link';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { formatNumber, kstDateKey, NO_VALUE } from '@/lib/format';
import { basicGuideFor, dailyBasicId, groupOfBasic } from '@/lib/economyBasics';
import type { EconomyBasic } from '@/types';

export function DailyBasicCard() {
  const { snapshot, refresh } = useData();
  const section = snapshot?.sections.basics ?? null;

  return (
    <section aria-labelledby="daily-basic-title" className="mt-5 px-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="daily-basic-title" className="text-base font-bold text-fg-strong">
          오늘의 경제 이야기
        </h2>
        <Link href="/basics" className="shrink-0 text-[11px] font-semibold text-accent hover:underline">
          전체 보기 →
        </Link>
      </div>

      <SectionGate section={section} onRetry={refresh} loading={<SkeletonCard height={54} lines={2} />}>
        {(list) => {
          // 스냅샷이 내려준 항목 중에서만 고른다. 목록이 바뀌어도 빈 카드가 나오지 않는다.
          const ids = list.map((b) => b.id);
          const todayId = dailyBasicId(kstDateKey(new Date()), ids);
          const item: EconomyBasic | undefined = list.find((b) => b.id === todayId) ?? list[0];
          if (!item) return null;

          const guide = basicGuideFor(item.id);
          const group = groupOfBasic(item.id);

          return (
            <div className="card p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-fg-strong">{item.name}</p>
                  <p className="mt-0.5 text-[10px] text-subtle">
                    {item.englishName}
                    {group ? ` · ${group.label}` : ''}
                  </p>
                </div>
                <Badge tone={item.official ? 'neutral' : 'warn'} size="xs">
                  <span aria-hidden="true">{item.official ? '◎' : '△'}</span>
                  {item.official ? '공식 통계' : '비공식 개념'}
                </Badge>
              </div>

              {guide ? (
                <p className="mt-2 text-[12.5px] leading-relaxed break-keep text-fg">{guide.headline}</p>
              ) : null}

              <div className="mt-2.5 flex items-baseline justify-between gap-2 border-t border-border pt-2.5">
                <p className="tnum text-[20px] leading-none font-bold text-fg-strong">
                  {item.value === null ? NO_VALUE : `${formatNumber(item.value, item.precision)}${item.suffix}`}
                </p>
                <Link href="/basics" className="shrink-0 text-[11px] font-semibold text-accent hover:underline">
                  읽는 법 보기 →
                </Link>
              </div>

              <p className="mt-2 text-[10.5px] leading-relaxed break-keep text-subtle">
                하루에 한 가지씩, 날짜에 따라 순서대로 돌아갑니다. 전체 {list.length}가지는 지수 탭의 생활 경제 지수
                보기에 있습니다.
              </p>
            </div>
          );
        }}
      </SectionGate>
    </section>
  );
}
