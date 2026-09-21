'use client';

/**
 * 선물 탭.
 *
 * 지수·에너지·금속·농산물·통화·금리·크립토를 한 화면에 놓고 등락률을 막대로 함께
 * 그린다. 선물은 정규장이 닫혀 있어도 움직여서 "내일 분위기" 를 미리 보여주는데,
 * 이 앱은 그동안 그 자리를 비워 두고 있었다.
 */

import { BackBar } from '@/components/nav/BackBar';
import { FuturesBoardView } from '@/components/market/FuturesBoard';

export default function FuturesPage() {
  return (
    <div className="pt-2 pb-4">
      <BackBar />
      <header className="px-3 pt-1">
        <h1 className="text-lg font-bold text-fg-strong">선물 시장</h1>
        <p className="mt-1 text-[12.5px] leading-relaxed break-keep text-muted">
          앞으로 정해진 날짜에 사고팔기로 미리 약속한 값입니다. 정규장이 닫혀 있어도 움직이기 때문에, 다음 장의
          분위기를 먼저 보여주는 자리로 씁니다.
        </p>
      </header>

      <div className="mt-3">
        <FuturesBoardView />
      </div>
    </div>
  );
}
