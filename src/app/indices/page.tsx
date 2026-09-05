'use client';

/**
 * 지수 탭 — 시장 지수.
 *
 * 예전에는 이 화면이 생활 경제 지수와 한 탭을 나눠 쓰면서 위에 [시장 지수 |
 * 생활 경제 지수] 전환 단추를 달고 있었다. 지금은 각자 탭을 갖는다. 둘 다
 * '지수' 라고 불리지만 재는 대상이 아예 달라서 — 한쪽은 오늘의 시장, 다른
 * 쪽은 한 해의 살림 — 같은 자리에 두면 무엇을 보고 있는지가 흐려졌다.
 */

import { BackBar } from '@/components/nav/BackBar';
import { MarketIndexBoard } from '@/components/market/MarketIndexBoard';

export default function IndicesPage() {
  return (
    <div className="pt-2 pb-4">
      <BackBar />
      <header className="px-3 pt-1">
        <h1 className="text-lg font-bold text-fg-strong">시장 지수</h1>
        <p className="mt-1 text-[12.5px] leading-relaxed break-keep text-muted">
          시장 전체를 한 숫자로 재는 값입니다. 개별 종목은 각 시장 화면과 관심목록에 있습니다.
        </p>
      </header>

      <div className="mt-3">
        <MarketIndexBoard />
      </div>
    </div>
  );
}
