'use client';

/**
 * 시장별 투자심리 — 옆으로 미는 카드.
 *
 * 카드 폭은 이 화면의 다른 카드와 **같아야 한다**.
 *
 * 예전에는 85cqw(최대 340px)였다. 다음 카드가 살짝 보여 "옆에 더 있다" 를
 * 알리려던 것인데, 그 대가로 이 카드만 다른 카드보다 66px 좁았다. 홈을 위에서
 * 아래로 훑으면 카드 왼쪽 선은 맞는데 오른쪽 선만 혼자 들어가 있고, 게다가
 * 두 번째 카드는 틀 끝에서 잘려 조각으로 보였다. 같은 크기의 카드 둘이
 * 다른 크기로 보인 것이다.
 *
 * 이제 한 장이 칸을 꽉 채운다. "옆에 더 있다" 는 아래 점이 말한다.
 */

import { useCallback, useRef, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, Notice } from '@/components/ui/States';
import { FngCard } from './FngCard';
import { SCALE_WARNING_TEXT } from './constants';

/**
 * 옆으로 미는 줄과, 지금 몇 번째인지 알리는 점.
 *
 * 카드가 칸을 꽉 채우게 되면서 "옆에 더 있다" 를 알려 줄 것이 없어졌다.
 * 점은 그 일만 한다 — 누르는 것이 아니라 읽는 표시라, 스크롤 위치에서 얻는다.
 */
function Carousel({ count, children }: { count: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el || count < 2) return;
    // 한 칸의 폭 = 전체 스크롤 폭 / 장수. 반올림이 가장 가까운 카드를 고른다.
    const step = el.scrollWidth / count;
    setAt(Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / step))));
  }, [count]);

  return (
    <>
      <div ref={ref} onScroll={onScroll} className="snap-row px-3">
        {children}
      </div>
      {count > 1 ? (
        <div className="mt-1 flex justify-center gap-1" aria-hidden="true">
          {Array.from({ length: count }, (_, i) => (
            <span
              key={i}
              className="block h-1.5 w-1.5 rounded-full transition-colors"
              style={{ background: i === at ? 'var(--muted-fg)' : 'var(--surface-3)' }}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

export function FngSection() {
  const { snapshot, refresh } = useData();
  const section = snapshot?.sections.fng ?? null;
  const mode = snapshot?.mode ?? 'DEMO';
  const version = section?.data?.[0]?.formulaVersion ?? '';

  return (
    <section aria-labelledby="fng-section-title" className="mt-5">
      <div className="mb-2 flex items-baseline justify-between gap-2 px-3">
        <div className="min-w-0">
          <h2 id="fng-section-title" className="text-base font-bold text-fg-strong">
            시장별 투자심리
          </h2>
          {/* 카드마다 되풀이하던 줄. 셋이 같은 값이라 머리에 한 번만 적는다. */}
          <p className="mt-0.5 text-[11.5px] text-subtle">자체 산출 지수 · {version}</p>
        </div>
        <span className="shrink-0 text-[12.5px] text-subtle">0=극단적 공포 · 100=극단적 탐욕</span>
      </div>

      <SectionGate
        section={section}
        onRetry={refresh}
        loading={
          <div className="px-3">
            <SkeletonCard height={420} lines={2} />
          </div>
        }
      >
        {(scores) => (
          <>
            <Carousel count={scores.length}>
              {scores.map((s) => (
                <div key={s.market} className="snap-item w-[calc(100cqw-24px)]">
                  <FngCard score={s} mode={mode} standalone={false} />
                </div>
              ))}
            </Carousel>
          </>
        )}
      </SectionGate>

      <div className="mt-2 px-3">
        <Notice tone="neutral">{SCALE_WARNING_TEXT}</Notice>
      </div>
    </section>
  );
}
