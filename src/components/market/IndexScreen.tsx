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
 * 보기를 주소로 나눈다 (/indices · /basics). 어느 쪽을 보고 있는지가 주소에
 * 남아야 링크로 건네줄 수 있고, 바깥에서 들어온 링크도 제 보기로 열린다.
 */

import { useRouter } from 'next/navigation';
import { SegmentedControl } from '@/components/ui/Controls';
import { MarketIndexBoard } from './MarketIndexBoard';
import { BasicsBoard } from './BasicsBoard';

export type IndexView = 'market' | 'life';

const PATH: Record<IndexView, string> = { market: '/indices', life: '/basics' };

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

export function IndexScreen({ view }: { view: IndexView }) {
  const router = useRouter();
  const head = HEAD[view];

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
          onChange={(v: IndexView) => router.push(PATH[v])}
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
