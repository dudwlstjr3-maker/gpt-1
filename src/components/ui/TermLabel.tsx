/**
 * 용어 이름표 — 큰 글씨는 쉬운 우리말, 작은 글씨는 원래 이름.
 *
 * 이름은 src/lib/terms.ts 한 곳에서만 정한다. 화면마다 손으로 적으면 같은 용어가
 * 화면마다 다르게 불린다.
 *
 * 소리로 읽을 때는 둘을 한 번에 읽어 준다 — 눈으로는 두 줄이지만 뜻은 하나다.
 */

import { termOf } from '@/lib/terms';

/** 두 줄 — 목록·카드 제목처럼 세로로 여유가 있는 자리 */
export function TermLabel({
  id,
  size = 'md',
  className = '',
}: {
  id: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const t = termOf(id);
  if (!t) return null;
  return (
    <span className={`block ${className}`}>
      <span
        className={`block font-semibold text-fg ${size === 'sm' ? 'text-[12.5px]' : 'text-[13px]'}`}
        aria-label={`${t.plain} (${t.term})`}
      >
        {t.plain}
      </span>
      <span className="mt-0.5 block text-[11.5px] font-normal text-subtle" aria-hidden="true">
        {t.term}
      </span>
    </span>
  );
}

/** 한 줄 — 통계 칸 머리말처럼 세로가 좁은 자리. 원어를 뒤에 작게 붙인다. */
export function TermInline({ id, className = '' }: { id: string; className?: string }) {
  const t = termOf(id);
  if (!t) return null;
  return (
    <span className={className} aria-label={`${t.plain} (${t.term})`}>
      <span className="text-muted">{t.plain}</span>
      {/* 크기가 아니라 색으로 낮춘다 — 이 앱의 글자 최소 크기는 11.5px 이다 */}
      <span className="ml-1 text-subtle" aria-hidden="true">
        {t.term.split(' · ').pop()}
      </span>
    </span>
  );
}
