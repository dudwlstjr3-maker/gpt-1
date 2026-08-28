/**
 * 예전 위험 신호등 화면.
 *
 * 지표 화면과 시장 필터·지표 목록이 그대로 겹쳐서 그쪽 안의 한 보기로 합쳤다.
 * 바깥에 남아 있을 링크와 북마크가 깨지지 않도록 자리만 남겨 넘겨 준다.
 */

import { redirect } from 'next/navigation';

export default function RiskPage() {
  redirect('/indicators');
}
