'use client';

/**
 * 국면 전광판 화면.
 *
 * 하단 탭에 세우지 않은 이유는 내 기준과 같다 — 320px 에서 이미 일곱 칸이라
 * 여덟 칸은 넘친다. 홈 맨 위 카드와 더보기에서 들어간다.
 */

import { RegimeDetail } from '@/components/market/RegimeDetail';

export default function RegimePage() {
  return (
    <div className="pt-2 pb-4">
      <header className="px-3 pt-1">
        <h1 className="text-lg font-bold text-fg-strong">국면 전광판</h1>
        <p className="mt-1 text-[11.5px] leading-relaxed break-keep text-muted">
          변동성·신용 스프레드·고점 대비 낙폭·추세 네 가지를 지난 20년 분포와 견줘, 지금이 역사적으로 어디쯤인지 한 숫자로
          보여 줍니다. 홈의 공포·탐욕 점수가 &quot;요즘 분위기&quot;라면 이건 &quot;지금이 20년 중 어디인가&quot;입니다.
        </p>
      </header>

      <div className="mt-4">
        <RegimeDetail />
      </div>
    </div>
  );
}
