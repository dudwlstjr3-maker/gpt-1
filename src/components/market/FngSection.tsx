'use client';

/**
 * 오늘의 쫄탐 — 1면.
 *
 * 쫄탐일보는 미국 신문이다 (2026-11-24 리밸런싱).
 *
 * 예전에는 미국·크립토 두 장을 옆으로 미는 줄이었다. 두 장이 같은 크기로 섰으니
 * 크립토가 1면의 절반을 차지했다. 이제 **미국 한 장이 칸을 꽉 채우고**, 크립토는
 * 카드가 아니라 **한 줄**로 내려왔다. 지우지는 않는다 — 점수·단계·어제 대비가 그
 * 줄에 다 있고, 누르면 크립토 상세로 간다.
 *
 * 한국은 여기 없다. 심리 점수를 낼 데이터가 없어서다(types/index.ts 의 MARKET_IDS
 * 주석). 한국의 자리는 아래 가격 지면에서 지수 · 환율 · 종목으로 키웠다.
 */

import Link from 'next/link';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, Notice } from '@/components/ui/States';
import { formatNumber, formatSigned } from '@/lib/format';
import { scoreColor, stageOf, STAGE_GLYPH } from '@/lib/scale';
import { MARKET_LABEL, type FngScore } from '@/types';
import { HomeMoodCard } from './HomeMoodCard';
import { SCALE_WARNING_TEXT } from './constants';

/**
 * 1면 카드 밑의 한 줄 — 크립토 쫄탐.
 *
 * 색만으로 단계를 말하지 않는다. 기호(▲▲ ▲ ■ ▼ ▼▼)와 단계 이름을 늘 함께 둔다.
 * 어제 대비는 부호가 방향을 말하므로 색을 입히지 않는다 — 한국식(상승=빨강)과
 * 해외식(상승=초록) 설정이 엇갈려도 한 줄이 다른 뜻으로 읽히지 않는다.
 */
function MarketLine({ score }: { score: FngScore }) {
  const stage = stageOf(score.score);
  const name = MARKET_LABEL[score.market];
  return (
    <Link
      href={`/fng/${score.market}`}
      className="tap flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 hover:bg-surface-3"
    >
      <span className="text-[13px] font-semibold text-fg">{name} 쫄탐</span>
      {score.score === null || !stage ? (
        <span className="text-[12.5px] text-muted">산출 불가</span>
      ) : (
        <>
          <span className="tnum text-[15px] font-bold" style={{ color: scoreColor(score.score) }}>
            {formatNumber(score.score, 0)}
          </span>
          <span className="text-[12.5px] font-semibold" style={{ color: scoreColor(score.score) }}>
            <span aria-hidden="true">{STAGE_GLYPH[stage.id]}</span> {stage.label}
          </span>
          {score.deltaDay !== null ? (
            <span className="tnum text-[12.5px] text-subtle">어제 {formatSigned(score.deltaDay, 1)}</span>
          ) : null}
        </>
      )}
      <span className="ml-auto shrink-0 text-[12.5px] text-subtle">
        상세 <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}

export function FngSection() {
  const { snapshot, refresh } = useData();
  const section = snapshot?.sections.fng ?? null;
  const mode = snapshot?.mode ?? 'DEMO';


  return (
    <section aria-labelledby="fng-section-title" className="mt-5">
      <h2 id="fng-section-title" className="sr-only">오늘의 쫄탐</h2>
      <SectionGate
        section={section}
        onRetry={refresh}
        loading={
          <div className="px-3">
            <SkeletonCard height={230} lines={2} />
          </div>
        }
      >
        {(scores) => {
          const lead = scores.find((s) => s.market === 'us');
          const rest = scores.filter((s) => s.market !== 'us');
          return (
            <>
              <div className="px-3">
                {lead ? <HomeMoodCard score={lead} mode={mode} /> : <Notice tone="neutral">미국 쫄탐지수 · 산출 불가</Notice>}
              </div>
              {rest.length > 0 ? (
                <ul className="mt-2 space-y-2 px-3">
                  {rest.map((s) => (
                    <li key={s.market}>
                      <MarketLine score={s} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          );
        }}
      </SectionGate>

      <div className="mt-2 px-3">
        <Notice tone="neutral">{SCALE_WARNING_TEXT}</Notice>
      </div>
    </section>
  );
}
