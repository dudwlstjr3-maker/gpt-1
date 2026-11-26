/** 저장된 값이 바로 앞의 기본값과 정확히 같을 때만 새 기본값으로 옮긴다. 아니면 그대로. */
export function upgradeDefault(saved: string[], previous: readonly string[], current: string[]): string[];

/** 앱에서 뺀 id 만 덜어낸다. 나머지는 순서까지 그대로. */
export function dropRemoved(saved: string[], removed: readonly string[]): string[];
