'use client';

/**
 * 지수 탭 — 생활 경제 지수 보기 (빅맥지수 · 1인당 GDP · 엥겔지수 …).
 *
 * 예전에는 홈의 '경제 이야기' 칸과 사이드바에서만 들어갈 수 있어 찾기 어려웠다.
 * 지금은 지수 탭의 두 보기 가운데 하나다. 주소는 그대로 두어 바깥 링크가 깨지지 않는다.
 */

import { IndexScreen } from '@/components/market/IndexScreen';

export default function BasicsPage() {
  return <IndexScreen view="life" />;
}
