const moodBands = [
  [5, '쫄 3단'], [10, '쫄 2단'], [19, '쫄 1단'],
  [39, '공포'], [59, '중립'], [79, '탐욕'],
  [89, '탐 1단'], [94, '탐 2단'], [100, '탐 3단'],
];

function roundedMoodScore(point) {
  const value = point?.v;
  return Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value) : null;
}

function moodBandLabel(score) {
  return moodBands.find(([max]) => score <= max)[1];
}

export function moodResponse(history) {
  const current = history.at(-1);
  const previous = history.at(-2);
  const now = roundedMoodScore(current);
  const before = roundedMoodScore(previous);
  const trail = history.slice(-3).map(point => roundedMoodScore(point) ?? '—').join(' → ');

  if (now === null || before === null || !current.formulaVersion || current.formulaVersion !== previous.formulaVersion) {
    return { title: '방향 확인 대기', message: '같은 산식의 연속된 두 점수가 필요해요.', trail };
  }

  const label = moodBandLabel(now);
  const delta = now - before;
  if (delta === 0) return { title: label + ' →', message: '직전 점수와 같아요.', trail };

  const stageChange = label === moodBandLabel(before) ? '같은 단계가 이어져요.' : label + ' 구간에 들어섰어요.';
  const direction = delta > 0 ? '올랐어요.' : '내렸어요.';
  return {
    title: label + (delta > 0 ? ' ↑' : ' ↓'),
    message: stageChange + ' 직전보다 ' + Math.abs(delta) + '점 ' + direction,
    trail,
  };
}
