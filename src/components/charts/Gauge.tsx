'use client';

/**
 * 0~100 반원형 게이지 — 이제 **홈 카드와 같은 계기판(MoodGauge)** 을 그린다.
 *
 * 예전에는 여기만 따로 그린 얇은 무지개 반원이었다. 홈은 유리 계기판 · 바늘 · 다섯 칸이라
 * 같은 점수가 화면마다 다른 물건으로 보였다 (2026-11-25 사용자: "홈과 심리 상세의 지수를 똑같이").
 * 심리 상세와 시장 화면의 쫄탐 카드가 이 Gauge 를 거쳐 같은 것을 쓴다.
 *
 * deltaDay 를 주면 어제 바늘과 전일 변화 문장까지 그린다(심리 상세). 안 주면 없다 —
 * 시장 화면 카드는 어제 대비를 바로 아래 따로 적기 때문이다.
 * 색만으로 뜻을 전하지 않는다: 점수 · 단계 이름 · 기호가 계기판 아래 글자로 함께 있다.
 */

import { FNG_STAGES } from '@/types';
import { stageFill, stageOf } from '@/lib/scale';
import { MoodGauge } from './MoodGauge';

export function Gauge({ score, deltaDay }: { score: number | null; deltaDay?: number | null }) {
  return <MoodGauge score={score} deltaDay={deltaDay} />;
}

/**
 * 게이지 아래에 놓는 단계 띠.
 *
 * 0~100 을 다섯 칸으로 나눠 신호등 램프(빨-주-노-연두-초) 그대로 칠하고,
 * 현재 점수 자리에 표식을 찍는다. 점 다섯 개를 늘어놓는 것보다
 * "지금 어느 칸에 있는가"가 한눈에 들어온다.
 *
 * 여기서 색은 위험이 아니라 심리다. 빨강은 공포, 초록은 탐욕이다.
 * 오해하기 쉬운 부분이라 띠 아래에 그대로 적어 둔다.
 */
export function StageLegend({ score }: { score?: number | null }) {
  const clamped = score === null || score === undefined || !Number.isFinite(score)
    ? null
    : Math.min(100, Math.max(0, score));
  const current = stageOf(clamped);

  return (
    <div>
      <div
        className="tl-band relative"
        style={{ height: 14 }}
        role="img"
        aria-label={`공포에서 탐욕까지 5단계 띠. ${FNG_STAGES.map((s) => `${s.label} ${s.min}부터 ${s.max}`).join(', ')}.${
          current ? ` 현재는 ${current.label} 단계.` : ''
        }`}
      >
        {FNG_STAGES.map((s) => (
          <span
            key={s.id}
            data-on={!current || current.id === s.id ? '1' : '0'}
            style={{ width: '20%', background: stageFill(s.id) }}
          />
        ))}
        {clamped !== null ? (
          <span
            aria-hidden="true"
            className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `${clamped}%`, background: 'var(--fg-strong)', boxShadow: '0 0 0 2px var(--surface)' }}
          />
        ) : null}
      </div>

      <ul className="mt-2 flex text-[10.5px] leading-tight">
        {FNG_STAGES.map((s) => {
          const active = current?.id === s.id;
          return (
            <li key={s.id} className="w-1/5 px-0.5 text-center">
              <span
                className="block break-keep"
                style={{
                  color: active ? `var(--stage-${s.id.replace('_', '-')})` : 'var(--subtle-fg)',
                  fontWeight: active ? 700 : 400,
                }}
              >
                {s.label}
              </span>
              <span className="tnum block text-subtle">
                {s.min}–{s.max}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[11.5px] leading-relaxed break-keep text-subtle">
        이 띠의 색은 <strong className="text-muted">위험도가 아니라 심리</strong>입니다. 빨강은 공포가 심한 쪽,
        초록은 탐욕이 강한 쪽이라는 뜻이며 어느 쪽이 좋다·나쁘다는 뜻이 아닙니다. 시장 위험 신호등(빨=경계)과는
        다른 의미이니 함께 볼 때 주의하세요.
      </p>
    </div>
  );
}
