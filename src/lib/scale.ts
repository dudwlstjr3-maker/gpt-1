/**
 * 점수 단계 · 등락 색상 · Fear→Greed 그라데이션.
 * 색상만으로 의미를 전달하지 않도록, 모든 헬퍼는 텍스트/아이콘 라벨을 함께 반환한다.
 */

import { FNG_STAGES, type FngStage, type FngStageId, type RiskLevel } from '@/types';

/* --------------------------- 신호등 --------------------------- */

/**
 * 구간을 나타내는 모든 그래픽은 신호등 3색만 쓴다.
 * 일반 투자자가 색만 보고도 "지금 어느 칸인가"를 바로 읽게 하려는 것이다.
 *
 * 주의: 신호등은 '위험 수준'을 뜻하지 '사라' 또는 '팔라'를 뜻하지 않는다.
 * 화면에도 항상 그 문장을 함께 적는다.
 */
export type Signal = 'green' | 'yellow' | 'red';

/** 신호등 색 순서 — 위에서 아래로 빨강·노랑·초록 (실제 신호등과 같다) */
export const SIGNAL_ORDER: Signal[] = ['red', 'yellow', 'green'];

export const SIGNAL_COLOR_LABEL: Record<Signal, string> = {
  green: '초록불',
  yellow: '노란불',
  red: '빨간불',
};

/** 색이 아니라 말로 읽는 뜻 */
export const SIGNAL_MEANING: Record<Signal, string> = {
  green: '평소 범위',
  yellow: '살펴볼 수준',
  red: '경계 수준',
};

/** 글자·선에 쓰는 색 (배경 대비 4.5:1) */
export function signalColor(s: Signal): string {
  return s === 'green' ? 'var(--tl-green)' : s === 'yellow' ? 'var(--tl-yellow)' : 'var(--tl-red)';
}

/** 막대·램프에 쓰는 색. 밝은 테마에서도 '노랑은 노랗게' 보이도록 채도를 유지한다. */
export function signalFill(s: Signal): string {
  return s === 'green' ? 'var(--tl-green-fill)' : s === 'yellow' ? 'var(--tl-yellow-fill)' : 'var(--tl-red-fill)';
}

/** 위험 4단계를 신호등 3색으로 접는다. 안정·보통은 같은 초록불이다. */
export function riskSignal(level: RiskLevel): Signal {
  if (level === 'alert') return 'red';
  if (level === 'watch') return 'yellow';
  return 'green';
}

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

/**
 * 단계별 CSS 변수 이름 (globals.css 에 정의).
 * 값은 신호등 램프(빨-주-노-연두-초)를 5칸으로 나눈 것이라 위험 지표와 팔레트가 같다.
 * 다만 뜻은 다르다 — 여기서 빨강은 '위험'이 아니라 '공포', 초록은 '안전'이 아니라 '탐욕'이다.
 * 화면에서는 반드시 그 차이를 글로 적어 준다.
 */
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

/** 막대·띠에 쓰는 단계 색 (채도 유지본) */
export function stageFill(stageId: FngStageId | null | undefined): string {
  if (!stageId) return 'var(--surface-3)';
  return `var(${STAGE_VAR[stageId]}-fill)`;
}

/** 0~100 점수를 Fear→Greed 연속 색상으로 변환 (게이지 그라데이션용). */
export function scoreColor(score: number | null | undefined): string {
  const stage = stageOf(score);
  return stageColor(stage?.id ?? null);
}

/** 막대·띠용 점수 색 */
export function scoreFill(score: number | null | undefined): string {
  const stage = stageOf(score);
  return stageFill(stage?.id ?? null);
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
