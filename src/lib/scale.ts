/**
 * 점수 단계 · 등락 색상 · Fear→Greed 그라데이션.
 * 색상만으로 의미를 전달하지 않도록, 모든 헬퍼는 텍스트/아이콘 라벨을 함께 반환한다.
 */

import { FNG_STAGES, type FngStage, type FngStageId } from '@/types';

/**
 * 점수 → 단계.
 * 단계 경계는 정수(0~19, 20~39 …)로 표기하지만 점수는 소수점을 가질 수 있다.
 * 39.5 같은 값이 경계 사이로 빠지지 않도록 "다음 단계의 시작점 미만" 기준으로 판정한다.
 */
export function stageOf(score: number | null | undefined): FngStage | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  const s = Math.min(100, Math.max(0, score));
  for (let i = 0; i < FNG_STAGES.length; i += 1) {
    const next = FNG_STAGES[i + 1];
    if (!next || s < next.min) return FNG_STAGES[i];
  }
  return FNG_STAGES[FNG_STAGES.length - 1];
}

/** 단계별 CSS 변수 이름 (globals.css 에 정의) */
export const STAGE_VAR: Record<FngStageId, string> = {
  extreme_fear: '--stage-extreme-fear',
  fear: '--stage-fear',
  neutral: '--stage-neutral',
  greed: '--stage-greed',
  extreme_greed: '--stage-extreme-greed',
};

export function stageColor(stageId: FngStageId | null | undefined): string {
  if (!stageId) return 'var(--muted-fg)';
  return `var(${STAGE_VAR[stageId]})`;
}

/** 0~100 점수를 Fear→Greed 연속 색상으로 변환 (게이지 그라데이션용). */
export function scoreColor(score: number | null | undefined): string {
  const stage = stageOf(score);
  return stageColor(stage?.id ?? null);
}

/** 점수 단계에 대응하는 아이콘 문자 (색맹 사용자를 위한 비색상 신호) */
export const STAGE_GLYPH: Record<FngStageId, string> = {
  extreme_fear: '▼▼',
  fear: '▼',
  neutral: '■',
  greed: '▲',
  extreme_greed: '▲▲',
};

/* --------------------------- 등락 색상 --------------------------- */

export type ChangeColorMode = 'korean' | 'global';

export type Direction = 'up' | 'down' | 'flat' | 'none';

export function directionOf(v: number | null | undefined): Direction {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'none';
  if (v > 0) return 'up';
  if (v < 0) return 'down';
  return 'flat';
}

/**
 * 한국식: 상승=빨강, 하락=파랑 / 글로벌식: 상승=초록, 하락=빨강
 */
export function changeColor(dir: Direction, mode: ChangeColorMode): string {
  if (dir === 'none') return 'var(--muted-fg)';
  if (dir === 'flat') return 'var(--flat-fg)';
  if (mode === 'korean') return dir === 'up' ? 'var(--kr-up)' : 'var(--kr-down)';
  return dir === 'up' ? 'var(--gl-up)' : 'var(--gl-down)';
}

export const DIRECTION_GLYPH: Record<Direction, string> = {
  up: '▲',
  down: '▼',
  flat: '―',
  none: '—',
};

export const DIRECTION_LABEL: Record<Direction, string> = {
  up: '상승',
  down: '하락',
  flat: '보합',
  none: '정보 없음',
};

/* --------------------------- 신뢰도 --------------------------- */

export function confidenceGlyph(c: 'high' | 'medium' | 'low'): string {
  return c === 'high' ? '●●●' : c === 'medium' ? '●●○' : '●○○';
}
