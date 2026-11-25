export function contributionShares(values: ReadonlyArray<number | null | undefined>): {
  /** 순변화 = 기여도 합 (소수 한 자리) — 전일 대비 점수 변화와 같다 */
  net: number;
  /** 하나라도 움직였나 */
  moved: boolean;
  rows: {
    /** 0~100 몫. 결측이면 null */
    share: number | null;
    /** '38%' · '<1%' · '0%' · '결측' */
    text: string;
    /** 1 올림 · -1 내림 · 0 그대로/결측 */
    dir: 1 | -1 | 0;
  }[];
};
