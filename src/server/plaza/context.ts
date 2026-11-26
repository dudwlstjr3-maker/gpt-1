/** 광장 요청 하나의 바탕 — 저장소 · 모드 · 어댑터 · 로그인 가능 여부 */

import { getAdapter } from '@/server/adapters/registry';
import { getKakaoConfig } from '@/server/config';
import { getPlazaStore } from './store';
import { sessionSecret } from './session';
import type { PlazaCtx } from './service';

export function makePlazaCtx(): PlazaCtx {
  const { adapter } = getAdapter();
  const now = new Date();
  return {
    store: getPlazaStore(),
    mode: adapter.mode,
    now: now.getTime(),
    adapter,
    actx: { now, scenario: 'normal' },
    auth: {
      kakao: !!getKakaoConfig() && !!sessionSecret(adapter.mode),
      // DEMO 연습 로그인은 DEMO 에서만. LIVE 에서는 카카오 말고 들어올 길이 없다.
      demo: adapter.mode === 'DEMO',
    },
  };
}
