/**
 * 예전 시장 허브.
 *
 * 세 시장의 점수·대표 지수·위험 신호를 카드로 보여 주던 화면인데,
 * 홈의 심리 카드가 같은 내용을 이미 보여 주고 있어 한 번 더 고르게 하는
 * 단계일 뿐이었다. 홈의 카드에서 각 시장으로 바로 들어가도록 바꾸고
 * 이 화면은 홈으로 넘긴다.
 */

import { redirect } from 'next/navigation';

export default function MarketHubPage() {
  redirect('/');
}
