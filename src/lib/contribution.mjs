// 기여도를 '몫(%)' 으로 — 오늘 움직인 크기 가운데 이 지표가 맡은 비율. 미리보기 template.html 에 글자 그대로 같은 함수가 있다.
// 몫 = |이 지표의 점수 변화| ÷ (모든 지표의 |점수 변화| 합) × 100. 오른 쪽(▲)과 내린 쪽(▼)을 같은 저울에 올려 합이 100% 다.
// 순변화(합)로 나누면 오르내림이 섞인 날 120% · −20% 같은 숫자가 나와 오히려 못 읽는다. 결측(null)은 분모에도 넣지 않는다.
export function contributionShares(values) {
  const ok = (v) => typeof v === 'number' && Number.isFinite(v);
  const gross = values.reduce((a, v) => a + (ok(v) ? Math.abs(v) : 0), 0);
  const net = values.reduce((a, v) => a + (ok(v) ? v : 0), 0);
  const rows = values.map((v) => {
    if (!ok(v)) return { share: null, text: '결측', dir: 0 };
    if (gross === 0 || v === 0) return { share: 0, text: '0%', dir: 0 };
    const share = (Math.abs(v) / gross) * 100;
    return { share, text: share < 0.5 ? '<1%' : Math.round(share) + '%', dir: v > 0 ? 1 : -1 };
  });
  return { net: Math.round(net * 10) / 10, moved: gross > 0, rows };
}
