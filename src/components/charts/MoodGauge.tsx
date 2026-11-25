import type { CSSProperties } from 'react';
import { homeMood } from '@/lib/homeMood.mjs';
import { scoreColor, stageOf } from '@/lib/scale';

/**
 * 쫄탐 계기판 — **홈 카드와 심리 상세가 같은 것을 쓴다** (2026-11-25, "홈과 심리 상세의 지수를 똑같이").
 * 시장 화면의 쫄탐 카드도 Gauge 를 거쳐 이것을 쓴다. 미리보기(tools/preview/template.html 의
 * moodGauge)도 같은 마크업 · 같은 좌표 · 같은 CSS(src/app/home-mood.css)다.
 *
 * - 다섯 단계 칸은 여기서 그린다. mood-dial.svg 에는 유리 · 눈금 · 숫자만 있다.
 *   지금 점수가 있는 칸만 굵고 밝게, 나머지는 흐리게 — "어느 구간인가" 가 바늘보다 먼저 보인다.
 * - 바늘 가운데 선은 단계 색(--ink). 예전에는 늘 주황이라 탐욕 쪽에서 색이 따로 놀았다.
 * - deltaDay 를 **주면** 어제 바늘(점선)과 전일 변화 문장을 그린다. 안 주면(undefined) 둘 다 없다 —
 *   어제 대비를 따로 적는 카드(FngCard)가 같은 말을 두 번 하지 않게.
 * - 점수가 없으면 칸을 모두 흐리게, 바늘 없이 '산출 불가'. 0 으로 그리지 않는다.
 */

/** 다섯 단계 칸 — 반지름 106 · 중심 (160,144) · 칸 사이 0.9° 틈. 미리보기의 DIAL_BANDS 와 글자까지 같다 */
export const DIAL_BANDS = [
  ['M54.01 142.50 A106 106 0 0 1 73.37 82.91', '#ff6e74'],
  ['M75.13 80.49 A106 106 0 0 1 125.82 43.66', '#ffab68'],
  ['M128.67 42.74 A106 106 0 0 1 191.33 42.74', '#eed177'],
  ['M194.18 43.66 A106 106 0 0 1 244.87 80.49', '#a6d285'],
  ['M246.63 82.91 A106 106 0 0 1 265.99 142.50', '#55cdae'],
] as const;

const oneDecimal = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 1 });

export function MoodGauge({ score, deltaDay }: { score: number | null; deltaDay?: number | null }) {
  const compare = deltaDay !== undefined;
  const mood = homeMood(score, compare ? deltaDay : null);
  const stage = stageOf(mood?.score);
  const style = { '--ink': scoreColor(mood?.score) } as CSSProperties;
  return (
    <div className="mood-gauge" style={style}>
      <svg className="mood-dial" viewBox="0 0 320 168" aria-hidden="true">
        <image href="/mood-dial.svg" width="320" height="168" />
        {DIAL_BANDS.map(([d, color], i) => (
          <path key={d} d={d} stroke={color} className={mood && i === mood.band ? 'mood-band on' : 'mood-band'} />
        ))}
        {/* 어제 위치 — 점선 바늘. 오늘 바늘 밑에 깐다 */}
        {mood && compare && mood.yesterday && (
          <g transform={`rotate(${mood.yesterday.angle} 160 144)`}>
            <path className="mood-ghost" d="M160 140 L160 46" />
          </g>
        )}
        {mood && (
          <g transform={`rotate(${mood.angle} 160 144)`}>
            <path d="M156 148 L159 40 Q160 36 161 40 L164 148Z" fill="#fff5d6" stroke="#442f28" />
            <path className="mood-needle-line" d="M160 43 L160 141" strokeWidth="1.5" />
          </g>
        )}
        <circle cx="160" cy="144" r="8" fill="#202b38" stroke="#d4dedc" strokeWidth="2" />
      </svg>
      {mood && stage ? (
        <>
          {compare && mood.yesterday && (
            <p className="mood-ghost-key">
              <svg width="18" height="6" aria-hidden="true"><line x1="1" y1="3" x2="17" y2="3" /></svg>
              어제 {oneDecimal(mood.yesterday.value)}
            </p>
          )}
          <div className="mood-reading">
            {/* '쫄?' '탐?' 은 말투라 낭독기는 건너뛴다 — 단계 이름이 바로 아래에서 읽힌다 */}
            <strong style={{ fontSize: mood.word ? mood.size : undefined }} aria-hidden={mood.word ? true : undefined}>
              {mood.word ?? stage.label}
            </strong>
            <span className="mood-score">{mood.score}<small> / 100</small></span>
          </div>
          {(mood.word || compare) && (
            <p className="mood-change">
              {mood.word && <b>{stage.label}</b>}
              {compare && (
                <span className="mood-delta">
                  {mood.glyph && <span aria-hidden="true">{mood.glyph}</span>}
                  {mood.change}
                </span>
              )}
            </p>
          )}
        </>
      ) : (
        <p className="mood-na" role="status"><b>산출 불가</b></p>
      )}
    </div>
  );
}
