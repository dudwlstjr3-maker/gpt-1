export function homeMood(value: number | null, delta: number | null): {
  score: number;
  angle: number;
  word: string | null;
  size: number;
  change: string;
} | null;
