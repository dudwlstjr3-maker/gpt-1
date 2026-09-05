'use client';

/**
 * 생활 탭 — 생활 경제 지수 (빅맥지수 · 1인당 GDP · 지니계수 …).
 *
 * 처음에는 홈의 '경제 이야기' 칸과 사이드바에서만 들어갈 수 있어 찾기 어려웠고,
 * 다음에는 지수 탭의 두 번째 보기였다. 지금은 제 탭이다. 시세를 보러 온 사람과
 * 살림살이를 견줘 보러 온 사람은 애초에 다른 걸 찾으러 온 사람이기 때문이다.
 */

import { BackBar } from '@/components/nav/BackBar';
import { BasicsBoard } from '@/components/market/BasicsBoard';

export default function BasicsPage() {
  return (
    <div className="pt-2 pb-4">
      <BackBar />
      <header className="px-3 pt-1">
        <h1 className="text-lg font-bold text-fg-strong">생활 경제 지수</h1>
        <p className="mt-1 text-[12.5px] leading-relaxed break-keep text-muted">
          시세가 아니라 살림살이의 크기를 재는 숫자들입니다. 한국·중국·일본·미국을 나란히 놓았습니다.
        </p>
      </header>

      <div className="mt-3">
        <BasicsBoard />
      </div>
    </div>
  );
}
