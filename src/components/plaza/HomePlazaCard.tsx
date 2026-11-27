'use client';

/**
 * 홈의 광장 문 — 다음 판 두 개와 참여 수, 내가 고른 쪽. 누르면 /plaza.
 * 광장 화면과 같은 CSS(src/app/plaza.css)를 쓴다. 미리보기 homePlazaCard 와 같은 마크업.
 */

import Link from 'next/link';
import { usePlaza } from './usePlaza';
import { plazaDay, plazaPick } from '@/lib/plazaText.mjs';

export function HomePlazaCard() {
  const { state } = usePlaza();
  if (!state) return null;
  return (
    <section className="pz-card pz-home" aria-labelledby="home-plaza-title">
      <div className="pz-home-head">
        <h3 id="home-plaza-title">쫄탐광장 · 다음 거래일 맞히기</h3>
        <span>{state.me ? `${state.me.name} · ${state.me.rating.toLocaleString('ko-KR')}` : '카카오로 로그인하면 참여'}</span>
      </div>
      <ul>
        {state.markets.map((m) => (
          <li key={m.market}>
            <b>
              {m.name} {plazaDay(m.open.date)}
            </b>
            <span>{m.open.myPick ? `내 선택 ${plazaPick(m.open.myPick)}` : `${m.open.n.toLocaleString('ko-KR')}명 참여`}</span>
          </li>
        ))}
      </ul>
      <Link className="pz-go" href="/plaza">
        오를까 내릴까 맞히러 가기 →
      </Link>
    </section>
  );
}
