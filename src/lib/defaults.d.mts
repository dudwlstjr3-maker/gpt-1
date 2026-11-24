/** 저장된 값이 바로 앞의 기본값과 정확히 같을 때만 새 기본값으로 옮긴다. 아니면 그대로. */
export function upgradeDefault(saved: string[], previous: readonly string[], current: string[]): string[];
