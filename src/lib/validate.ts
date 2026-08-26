/**
 * 런타임 검증 — 어댑터가 만든 값이 UI 계약을 지키는지 서버에서 먼저 확인한다.
 *
 * 원칙: 잘못된 값은 "임의로 보정하지 않는다".
 *  - 범위를 벗어난 점수는 clamp 하지 않고 null 로 만들고 사유를 남긴다.
 *  - 숫자가 아닌 값은 0 이 아니라 null 이 된다.
 *  - 검증 실패는 해당 항목/카드만 오류로 처리하고 전체를 죽이지 않는다.
 */

export interface ValidationIssue {
  path: string;
  message: string;
}

export class ValidationCollector {
  readonly issues: ValidationIssue[] = [];

  add(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  get ok(): boolean {
    return this.issues.length === 0;
  }

  messages(): string[] {
    return this.issues.map((i) => `${i.path}: ${i.message}`);
  }
}

/** 유한한 숫자만 통과. 그 외에는 null(=값 없음). */
export function num(v: unknown, path: string, c?: ValidationCollector): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v === null || v === undefined) return null;
  c?.add(path, `숫자가 아님 (${String(v)})`);
  return null;
}

/** 지정 범위를 벗어나면 보정하지 않고 null 처리. */
export function numInRange(
  v: unknown,
  min: number,
  max: number,
  path: string,
  c?: ValidationCollector,
): number | null {
  const n = num(v, path, c);
  if (n === null) return null;
  if (n < min || n > max) {
    c?.add(path, `허용 범위(${min}~${max})를 벗어남: ${n}`);
    return null;
  }
  return n;
}

/** 0~100 점수 검증 */
export function score100(v: unknown, path: string, c?: ValidationCollector): number | null {
  return numInRange(v, 0, 100, path, c);
}

/** 양수만 허용 (가격 등) */
export function positive(v: unknown, path: string, c?: ValidationCollector): number | null {
  const n = num(v, path, c);
  if (n === null) return null;
  if (n <= 0) {
    c?.add(path, `양수가 아님: ${n}`);
    return null;
  }
  return n;
}

/** ISO 시각 문자열 검증 */
export function isoTime(v: unknown, path: string, c?: ValidationCollector): string | null {
  if (typeof v !== 'string') {
    if (v !== null && v !== undefined) c?.add(path, '시각 문자열이 아님');
    return null;
  }
  const t = Date.parse(v);
  if (Number.isNaN(t)) {
    c?.add(path, `시각 파싱 실패: ${v}`);
    return null;
  }
  return new Date(t).toISOString();
}

export type Currency = 'KRW' | 'USD';

export function currency(v: unknown, path: string, c?: ValidationCollector): Currency | null {
  if (v === 'KRW' || v === 'USD') return v;
  if (v === null || v === undefined) return null;
  c?.add(path, `알 수 없는 통화: ${String(v)}`);
  return null;
}

/** 가중치 합이 100 인지 검증 (부동소수 오차 허용) */
export function assertWeightsSum100(
  weights: readonly number[],
  path: string,
  c?: ValidationCollector,
): boolean {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 0.001) {
    c?.add(path, `가중치 합이 100이 아님: ${sum}`);
    return false;
  }
  return true;
}

/** 시계열 정합성: 시간 오름차순 + 유한값 */
export function sanitizeSeries(
  points: readonly { t: unknown; v: unknown }[],
  path: string,
  c?: ValidationCollector,
): { t: number; v: number }[] {
  const out: { t: number; v: number }[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const t = typeof p.t === 'number' && Number.isFinite(p.t) ? p.t : null;
    const v = typeof p.v === 'number' && Number.isFinite(p.v) ? p.v : null;
    if (t === null || v === null) {
      c?.add(`${path}[${i}]`, '시계열 포인트 결측 — 제외됨');
      continue;
    }
    out.push({ t, v });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}
