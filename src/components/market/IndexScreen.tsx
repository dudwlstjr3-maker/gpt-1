'use client';

/**
 * '지수' 탭 — 두 가지 지수를 한 탭에 담는다.
 *
 *   시장 지수      KOSPI · S&P 500 · VIX …  시장을 재는 눈금
 *   생활 경제 지수  빅맥지수 · 1인당 GDP · 엥겔지수 …  살림살이를 재는 눈금
 *
 * 둘 다 '지수' 지만 재는 대상이 다르다. 하단 탭을 하나 더 늘리는 대신 보기를
 * 나눈 이유는 320px 에서 일곱 칸이면 글자가 뭉개지기 때문이고, 지표 화면에서
 * 이미 쓰고 있는 방식([위험 신호등 | 전체 지표])과도 같아서다.
 *
 * 두 주소가 각각의 보기로 열린다 (/indices · /basics). 바깥에서 들어온 링크는
 * 제 보기로 열리고, 하단 탭의 '지수' 는 두 주소 모두에서 활성으로 표시된다.
 *
 * **버튼을 누를 때는 주소를 건드리지 않는다.** 보기를 바꾸는 일은 화면을 옮기는
 * 일이 아니기 때문이다. 처음에는 router.push 로, 다음에는 history.replaceState 로
 * 주소를 갈아 끼워 봤는데 둘 다 같은 문제를 냈다 — Next 가 주소 변경을 화면
 * 이동으로 받아 맨 위로 스크롤하고, globals.css 의 scroll-behavior: smooth 때문에
 * 그 스크롤이 1.4초짜리 애니메이션으로 보였다. 누를 때마다 화면이 통째로 위로
 * 미끄러지니 다른 화면으로 넘어간 것처럼 읽혔다.
 *
 * 그래서 보기는 이 안에서만 들고 있는다. 누른 자리에서 내용만 바뀐다.
 * 잃는 것은 "지금 보기를 주소로 건네주기" 하나뿐이고, 두 주소가 그대로 살아 있어
 * 링크로 특정 보기를 여는 일은 여전히 된다.
 */

import { useEffect, useState } from 'react';
import { SegmentedControl } from '@/components/ui/Controls';
import { MarketIndexBoard } from './MarketIndexBoard';
import { BasicsBoard } from './BasicsBoard';

export type IndexView = 'market' | 'life';

const HEAD: Record<IndexView, { title: string; desc: string }> = {
  market: {
    title: '지수',
    desc: '시장 전체를 한 숫자로 재는 값입니다. 개별 종목은 각 시장 화면과 관심목록에 있습니다.',
  },
  life: {
    title: '생활 속 경제 이야기',
    desc: '시세가 아니라 살림살이의 크기를 재는 숫자들입니다. 지표마다 한국·중국·일본·미국 네 나라를 나란히 놓았으니, 우리 형편이 어느 쯤인지 편하게 견줘 보세요.',
  },
};

export function IndexScreen({ view: initial }: { view: IndexView }) {
  const [view, setView] = useState<IndexView>(initial);

  // 바깥에서 다른 주소로 들어오면(지수 탭 → /indices) 그쪽 보기로 맞춘다
  useEffect(() => setView(initial), [initial]);

  const head = HEAD[view];

  const choose = (v: IndexView) => setView(v);

  return (
    <div className="pt-2 pb-4">
      <header className="px-3 pt-1">
        <h1 className="text-lg font-bold text-fg-strong">{head.title}</h1>
        <p className="mt-1 text-[11.5px] leading-relaxed break-keep text-muted">{head.desc}</p>
      </header>

      <div className="mt-2.5 px-3">
        <SegmentedControl
          label="지수 보기"
          full
          value={view}
          onChange={choose}
          options={[
            { value: 'market', label: '시장 지수' },
            { value: 'life', label: '생활 경제 지수' },
          ]}
        />
      </div>

      <div className="mt-3">{view === 'market' ? <MarketIndexBoard /> : <BasicsBoard />}</div>
    </div>
  );
}
