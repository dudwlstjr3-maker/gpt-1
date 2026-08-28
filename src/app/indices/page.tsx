'use client';

/** 지수 탭 — 시장 지수 보기. 생활 경제 지수는 /basics 가 같은 껍데기로 연다. */

import { IndexScreen } from '@/components/market/IndexScreen';

export default function IndicesPage() {
  return <IndexScreen view="market" />;
}
