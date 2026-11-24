export function moodResponse(history) {
  const read = point => Number.isFinite(point?.v) && point.v >= 0 && point.v <= 100 ? Math.round(point.v) : null;
  const last = history.at(-1);
  const prior = history.at(-2);
  const now = read(last);
  const before = read(prior);
  const trail = history.slice(-3).map(read).map(n => n ?? '—').join(' → ');
  const result = (title, message) => ({ title, message, trail });
  if (now === null || before === null || last.formulaVersion !== prior.formulaVersion) {
    return result('방향 확인 대기', '같은 산식의 연속된 두 점수가 필요해요.');
  }
  if (now === before) return result('점수 유지', '같은 점수예요. 새로운 단계 신호가 없어요.');
  const rising = now > before;
  const bounds = [5, 10, 20, 39, 59, 79, 89, 94, 100];
  const band = n => bounds.findIndex(limit => n <= limit);
  const tier = band(now);
  if (tier <= 2 || tier >= 6) {
    const fear = tier <= 2;
    if (rising === fear) return fear
      ? result('공포 완화 ↑', '공포권에서 회복 중이에요. 추가 매집 단계 진입은 없어요.')
      : result('탐욕 완화 ↓', '탐욕권에서 열기가 식고 있어요. 확보한 현금을 점검할 구간이에요.');
    const stage = fear ? 3 - tier : tier - 5;
    const title = (fear ? '공포 ' : '탐욕 ') + stage + '단계 ' + (rising ? '↑' : '↓');
    return result(title, tier === band(before) ? '같은 단계가 이어지고 있어요.' :
      '설정한 ' + stage + '차 분할' + (fear ? '매수' : '매도') + ' 검토선에 진입했어요.');
  }
  if (tier === 3) return rising ? result('공포 완화 ↑', '기존 보유분을 점검하는 회복 구간이에요.') :
    result('공포 확대 ↓', '현금 여력을 점검할 구간이에요. 1차 검토선은 20점이에요.');
  if (tier === 4) return rising ? result('심리 회복 ↑', '보유분을 유지하며 회복 흐름을 살피는 구간이에요.') :
    result('회복 둔화 ↓', '추가 비중 확대를 보류하는 구간이에요.');
  if (rising) return result('탐욕 접근 ↑', '기존 물량을 보유하며 80점의 1차 검토선을 준비하는 구간이에요.');
  for (let i = history.length - 2; i >= 0; i--) {
    const point = history[i];
    const n = read(point);
    if (n === null || point.formulaVersion !== last.formulaVersion || n <= 20) break;
    if (n >= 80) return result('탐욕권 이탈 ↓', '80점 이상을 거쳐 내려왔어요. 확보한 현금을 유지하는 구간이에요.');
  }
  return result('상승세 둔화 ↓', '최근 확인된 흐름에서 탐욕권 진입 신호가 없어요. 기존 비중을 살필 구간이에요.');
}
