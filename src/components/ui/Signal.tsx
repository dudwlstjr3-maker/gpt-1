'use client';

/**
 * 신호등 표시 부품.
 *
 * 구간을 나타내는 화면은 전부 빨/노/초 세 색만 쓴다. 색을 못 보는 사용자와
 * 흑백 인쇄를 위해 (1) 켜진 램프의 '위치', (2) 기호, (3) 한국어 라벨을 항상 같이 낸다.
 *
 * 신호등은 위험의 정도를 말할 뿐, 매수·매도를 말하지 않는다.
 */

import {
  SIGNAL_COLOR_LABEL,
  SIGNAL_MEANING,
  SIGNAL_ORDER,
  signalColor,
  signalFill,
  type Signal,
} from '@/lib/scale';

/* ------------------------------------------------------------------ */
/* 3구 램프                                                             */
/* ------------------------------------------------------------------ */

const LAMP_SIZE = { sm: 5, md: 7, lg: 9 } as const;

/**
 * 실제 신호등처럼 위에서부터 빨강·노랑·초록 세 칸을 그리고 하나만 켠다.
 * 켜진 칸의 '자리'가 곧 정보이므로 색맹 사용자도 구분할 수 있다.
 */
export function SignalLight({
  signal,
  size = 'md',
  label,
}: {
  signal: Signal;
  size?: keyof typeof LAMP_SIZE;
  label?: string;
}) {
  const d = LAMP_SIZE[size];
  return (
    <span
      className="tl-lamp shrink-0"
      role="img"
      aria-label={`${label ? `${label} ` : ''}${SIGNAL_COLOR_LABEL[signal]} — ${SIGNAL_MEANING[signal]}`}
    >
      {SIGNAL_ORDER.map((s) => {
        const on = s === signal;
        return (
          <i
            key={s}
            style={{
              width: d,
              height: d,
              background: on ? signalFill(s) : 'var(--surface-3)',
              opacity: on ? 1 : 0.55,
              boxShadow: on ? `0 0 0 1.5px color-mix(in srgb, ${signalColor(s)} 40%, transparent)` : 'none',
            }}
          />
        );
      })}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* 인라인 점 + 라벨                                                      */
/* ------------------------------------------------------------------ */

/** 램프를 그릴 자리가 없는 좁은 곳에서 쓰는 한 칸짜리 표시 */
export function SignalDot({ signal, size = 8 }: { signal: Signal; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: signalFill(signal),
        /* 밝은 배경에서 노란 점이 사라지지 않도록 같은 계열의 진한 색으로 테두리를 준다 */
        boxShadow: `0 0 0 1px color-mix(in srgb, ${signalColor(signal)} 55%, transparent)`,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* 집계 스트립                                                           */
/* ------------------------------------------------------------------ */

export interface SignalTallyItem {
  signal: Signal;
  count: number;
  /** 해당 색에 속한 항목 이름들 */
  names: string[];
}

/**
 * "초록 4 · 노랑 2 · 빨강 1" 를 큼직하게 보여 주는 요약 줄.
 * 숫자를 세는 것만으로도 전체 분위기를 10초 안에 읽을 수 있게 하는 것이 목적이다.
 */
export function SignalTally({ items, total }: { items: SignalTallyItem[]; total: number }) {
  return (
    <ul className="grid grid-cols-3 gap-1.5" aria-label={`전체 ${total}개 지표의 신호등 분포`}>
      {SIGNAL_ORDER.slice()
        .reverse()
        .map((s) => {
          const found = items.find((i) => i.signal === s);
          const count = found?.count ?? 0;
          const active = count > 0;
          return (
            <li
              key={s}
              className="rounded-xl border px-2 py-2 text-center"
              style={{
                borderColor: active
                  ? `color-mix(in srgb, ${signalColor(s)} 45%, var(--border))`
                  : 'var(--border)',
                background: active
                  ? `color-mix(in srgb, ${signalColor(s)} 10%, var(--surface))`
                  : 'var(--surface)',
              }}
            >
              <span className="flex items-center justify-center gap-1.5">
                <SignalDot signal={s} size={9} />
                <span className="text-[10.5px] font-semibold" style={{ color: signalColor(s) }}>
                  {SIGNAL_COLOR_LABEL[s]}
                </span>
              </span>
              <p className="tnum mt-0.5 text-[19px] leading-none font-bold" style={{ color: signalColor(s) }}>
                {count}
                <span className="ml-0.5 text-[10px] font-normal text-subtle">개</span>
              </p>
              <p className="mt-1 text-[9.5px] leading-tight break-keep text-subtle">
                {active ? found!.names.join(' · ') : SIGNAL_MEANING[s]}
              </p>
            </li>
          );
        })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* 범례                                                                */
/* ------------------------------------------------------------------ */

/**
 * 색이 무슨 뜻인지 한 줄로 알려 준다.
 * 신호등을 처음 보는 사람도 추가 설명 없이 화면을 읽을 수 있어야 한다.
 */
export function SignalLegend({ note }: { note?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-2.5 py-2">
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {SIGNAL_ORDER.slice()
          .reverse()
          .map((s) => (
            <li key={s} className="flex items-center gap-1.5 text-[10.5px]">
              <SignalDot signal={s} size={8} />
              <span className="font-semibold" style={{ color: signalColor(s) }}>
                {SIGNAL_COLOR_LABEL[s]}
              </span>
              <span className="text-subtle">{SIGNAL_MEANING[s]}</span>
            </li>
          ))}
      </ul>
      <p className="mt-1.5 text-[10px] leading-relaxed break-keep text-subtle">
        {note ?? '색은 지금 수치가 평소보다 얼마나 벗어나 있는지를 뜻합니다. 사라·팔라는 신호가 아닙니다.'}
      </p>
    </div>
  );
}
