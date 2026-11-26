import type { FngOverlayNow } from '@/types';

export interface OverlayChip {
  id: 'trend' | 'vix';
  label: string;
  /** ▲ · ▼ — 말(value)과 함께 쓴다. 없으면 null */
  glyph: string | null;
  value: string;
  sub: string | null;
  /** 화면 낭독기가 읽는 한 문장 */
  aria: string;
}

/** 홈 카드 두 칩. 지금 값 묶음이 없으면 null (칩 줄을 그리지 않는다) */
export function overlayChips(now: FngOverlayNow | null | undefined): OverlayChip[] | null;
