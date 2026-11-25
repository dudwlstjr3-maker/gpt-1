export function homeMood(value: number | null, delta: number | null): {
  score: number;
  angle: number;
  word: string | null;
  size: number;
  /** 전일 변화를 말로 — "어제보다 공포가 5.5점 풀렸어요" */
  change: string;
  /** ▲ 올랐다 · ▼ 내렸다 · → 같다 · 비교할 수 없으면 null */
  glyph: '▲' | '▼' | '→' | null;
  /** 어제 점수와 그 바늘 각도. 비교할 수 없거나 같으면 null */
  yesterday: { value: number; angle: number } | null;
} | null;
