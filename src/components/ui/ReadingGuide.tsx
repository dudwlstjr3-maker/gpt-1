'use client';

/**
 * 화면 읽는 법 — 한 줄만 남기고 접어 둔다.
 *
 * 왜 필요한가
 *   경제·위험 지표 화면은 첫 지표 카드가 나오기 전에 안내 상자가 넷이었다.
 *   화면 소개 한 문단, "심리 점수의 구성요소가 아니다", 색 범례, "구간 기준은
 *   이 앱이 정한 값이다". 390px 에서 재 보니 250자가 넘어서, 값을 보러 온 사람은
 *   한 화면을 통째로 넘겨야 첫 숫자를 만났다. 매번 읽는 글도 아니다.
 *
 *   그렇다고 지울 수는 없다. 오해를 막으려고 쓴 문장들이고, 처음 온 사람에게는
 *   그 넷이 다 필요하다. 그래서 **지우지 않고 접는다** — 제일 중요한 한 줄만
 *   남기고 나머지는 눌러서 편다.
 *
 * 접힌 상태에서도 남는 것
 *   lead 한 줄. 이 화면에서 가장 오해하기 쉬운 지점을 여기에 적는다.
 *   법적으로 늘 보여야 하는 문구(투자 조언 아님)는 화면 아래 고지문에 따로 있고,
 *   여기서 접는 것은 그 문구가 아니다.
 */

import { useState } from 'react';

export function ReadingGuide({
  lead,
  label = '이 화면 읽는 법',
  children,
}: {
  /** 접혀 있어도 보이는 한 줄 */
  lead: React.ReactNode;
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface-2 px-2.5 py-2">
      {/* 여는 버튼은 문장 옆이 아니라 아래에 둔다. 390px 에서 옆에 두면 한 줄이
          55% 폭으로 눌려 네 줄로 쪼개졌다 — 읽으라고 남긴 한 줄이 제일 안 읽혔다. */}
      <p className="text-[12.5px] leading-relaxed break-keep text-muted">
        <span aria-hidden="true" className="mr-1 text-subtle">
          ⓘ
        </span>
        {lead}
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="-mb-1 -ml-1 mt-1 rounded-md px-1 py-1 text-[12.5px] font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]"
      >
        {open ? '접기 ▴' : `${label} ▾`}
      </button>
      {open ? <div className="mt-2.5 space-y-2.5 border-t border-border pt-2.5">{children}</div> : null}
    </div>
  );
}
