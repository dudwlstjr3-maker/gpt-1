'use client';

/**
 * 값 하나를 크게 보여주는 자리.
 *
 * 이 앱에서 숫자는 곁들이는 것이 아니라 주인공이다. 그런데 지금까지는 그냥
 * 굵은 글씨였다. 세 가지를 손본다.
 *
 *  ① 소수점 이하를 한 단 연하게.
 *     '1,335.78원' 에서 사람이 먼저 잡는 것은 1,335 다. .78 은 확인하는 값이지
 *     읽는 값이 아니다. 같은 밝기로 서 있으면 눈이 여섯 자리를 다 훑어야 한다.
 *  ② 붙는 단위(원·달러·%·bp)를 한 호 작게.
 *     단위는 숫자가 무엇인지 말해 주지만, 자릿수만큼 무겁지는 않다.
 *  ③ 값이 바뀌면 잠깐 물든다.
 *     30초마다 갱신되는 화면에서 어느 숫자가 움직였는지 알 길이 없었다.
 *     오르면 오름 색, 내리면 내림 색으로 0.6초 — 거래 단말이 하는 그 표시다.
 *
 * 숫자를 0 부터 세어 올리는 연출은 넣지 않는다. 이 앱은 값이 없을 때 0 으로
 * 채우지 않기로 되어 있는데, 0 에서 시작하는 애니메이션은 짧게나마 그 약속을
 * 어긴다 — 없는 값과 올라가는 중인 값이 같아 보인다.
 */

import { useEffect, useRef, useState } from 'react';

/** [앞에 붙는 것][정수부][소수부][뒤에 붙는 단위] */
const SHAPE = /^([^\d.-]*)(-?[\d,]+)(\.\d+)?(.*)$/;

export function Figure({
  text,
  className,
  /** 값이 바뀌었을 때 물들일 색. 없으면 물들이지 않는다. */
  flashColor,
}: {
  text: string;
  className?: string;
  flashColor?: string;
}) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(text);

  useEffect(() => {
    if (prev.current === text) return;
    prev.current = text;
    if (!flashColor) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 620);
    return () => clearTimeout(t);
  }, [text, flashColor]);

  const m = SHAPE.exec(text);
  // 숫자가 아닌 것(— · 산출 불가)은 손대지 않고 그대로 내보낸다
  if (!m) return <span className={className}>{text}</span>;

  const [, lead, whole, dec, unit] = m;

  return (
    <span
      className={`figure${flash ? ' figure-flash' : ''}${className ? ` ${className}` : ''}`}
      style={flash && flashColor ? ({ '--flash': flashColor } as React.CSSProperties) : undefined}
    >
      {lead}
      {whole}
      {dec ? <span className="figure-dec">{dec}</span> : null}
      {unit ? <span className="figure-unit">{unit}</span> : null}
    </span>
  );
}
