/**
 * 위험 지표 묶음을 한 줄로 요약한다.
 *
 * 서버(전체 산출)와 화면(고른 시장만)이 같은 문장 규칙을 써야 하므로 여기 한 곳에 둔다.
 * 사실만 적는다 — 몇 개가 어느 단계인지, 값이 없어 제외한 게 몇 개인지.
 */

import type { RiskIndicator } from '@/types';

/**
 * @param withNames 어느 지표인지 괄호로 함께 적을지.
 *   문장만 홀로 서는 자리(홈의 신호등 요약)에서는 이름이 있어야 쓸모가 있고,
 *   바로 아래에 단계별 분포가 같은 이름을 늘어놓는 자리(지표 화면)에서는 뺀다.
 */
export function buildRiskHeadline(indicators: RiskIndicator[], withNames = true): string {
  const available = indicators.filter((i) => i.value !== null);
  const alerts = available.filter((i) => i.level === 'alert');
  const watches = available.filter((i) => i.level === 'watch');

  let headline: string;
  if (available.length === 0) {
    headline = '위험 지표를 산출할 데이터가 없습니다.';
  } else if (alerts.length > 0) {
    const names = withNames ? ` (${alerts.map((i) => i.shortName).join(' · ')})` : '';
    headline = `${indicators.length}개 중 ${alerts.length}개가 주의 단계입니다${names}.`;
  } else if (watches.length > 0) {
    const names = withNames ? ` (${watches.map((i) => i.shortName).join(' · ')})` : '';
    headline = `주의 단계는 없고, ${watches.length}개가 관찰 단계입니다${names}.`;
  } else {
    headline = `산출된 ${available.length}개 지표가 모두 안정·보통 구간에 있습니다.`;
  }

  if (available.length < indicators.length) {
    headline += ` ${indicators.length - available.length}개는 값이 없어 제외했습니다.`;
  }
  return headline;
}
