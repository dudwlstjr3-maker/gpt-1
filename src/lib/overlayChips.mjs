// 홈 쫄탐 카드의 계기판 아래 두 칩 — 추세(대표 지수 200일 평균선)와 VIX.
// 앱(HomeMoodCard)과 미리보기(template homeMoodCard)가 **같은 말**을 쓰도록 문구는 여기 한 곳에 둔다.
// 미리보기는 이 파일을 그대로 끼워 넣는다(tools/preview/build.mjs) — 그래서 내보내는 함수는 하나, import 는 없다.
//
// 둘 다 지금 상태를 적는 사실이지 사고팔 때를 알리는 신호가 아니다.
// 값이 없으면 '산출 불가' 로 적는다. 0 이나 '위' 로 채우지 않는다.
// 위/아래는 기호(▲▼)만이 아니라 말로도 적는다 — 색과 기호만으로 뜻을 전하지 않는다.

export function overlayChips(now) {
  if (!now) return null;
  const signed = (v) => (v > 0 ? '+' : v < 0 ? '-' : '') + Math.abs(v).toFixed(1);
  const t = now.trend;
  const trend = t && t.above !== null && Number.isFinite(t.gapPct)
    ? {
        id: 'trend',
        label: '추세',
        glyph: t.above ? '▲' : '▼',
        value: `${t.maDays}일선 ${t.above ? '위' : '아래'}`,
        sub: `${signed(t.gapPct)}%`,
        aria: `추세: ${t.name} 가격이 ${t.maDays}일 평균선보다 ${Math.abs(t.gapPct).toFixed(1)}% ${t.above ? '위' : '아래'}`,
      }
    : { id: 'trend', label: '추세', glyph: null, value: '산출 불가', sub: null, aria: '추세: 평균선을 계산할 자료가 부족해 산출하지 못했습니다' };
  const v = now.vix;
  const vix = v && v.high !== null && Number.isFinite(v.value)
    ? {
        id: 'vix',
        label: 'VIX',
        glyph: null,
        value: v.value.toFixed(1),
        sub: `${v.threshold} ${v.high ? '이상' : '아래'}`,
        aria: `VIX ${v.value.toFixed(1)}, 기준 ${v.threshold} ${v.high ? '이상' : '아래'}`,
      }
    : { id: 'vix', label: 'VIX', glyph: null, value: '산출 불가', sub: null, aria: 'VIX: 자료를 받지 못해 산출하지 못했습니다' };
  return [trend, vix];
}
