/**
 * 어댑터 선택. 모드는 스냅샷 단위로 하나이며, DEMO 와 LIVE 는 섞이지 않는다.
 */

import { resolveMode } from '@/server/config';
import type { MarketAdapter } from './types';
import { demoAdapter } from './demo';
import { liveAdapter } from './live';

export interface ResolvedAdapter {
  adapter: MarketAdapter;
  reason: string;
  missingEnv: string[];
}

export function getAdapter(): ResolvedAdapter {
  const { mode, reason, missing } = resolveMode();
  return {
    adapter: mode === 'LIVE' ? liveAdapter : demoAdapter,
    reason,
    missingEnv: missing,
  };
}
