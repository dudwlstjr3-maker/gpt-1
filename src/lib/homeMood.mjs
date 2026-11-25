// The app and the standalone preview use the same rounded score and type scale.
//
// 전일 변화는 화살표 한 글자가 아니라 **말로** 쓴다.
// "극단적 공포 · 전일 대비 ↑ 5.5점" 은 점수가 낮은데 오른 날 '공포가 커졌다' 로도 읽혔다.
// 점수가 오르면 공포는 풀리고 탐욕은 커진다 — 그 뜻을 그대로 적는다.
// 공포 쪽(0–39) · 중립(40–59) · 탐욕 쪽(60–100) 은 FNG_STAGES(src/types/index.ts) 경계와 같다.
// 어제와 오늘이 다른 쪽이면 '풀렸다/깊어졌다' 대신 어느 쪽으로 움직였는지만 말한다.

const side = (v) => (v < 40 ? 'fear' : v >= 60 ? 'greed' : 'neutral');

function sentence(up, step, was, now) {
  const m = step.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
  if (was === now && now === 'fear') return `어제보다 공포가 ${m}점 ${up ? '풀렸어요' : '깊어졌어요'}`;
  if (was === now && now === 'greed') return `어제보다 탐욕이 ${m}점 ${up ? '커졌어요' : '식었어요'}`;
  return `어제보다 ${up ? '탐욕' : '공포'} 쪽으로 ${m}점 움직였어요`;
}

export function homeMood(value, delta) {
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  const score = Math.round(value);
  const word = score < 20 ? '쫄?' : score >= 80 ? '탐?' : null;
  const size = 40 + Math.max(0, Math.abs(score - 50) - 30) * 1.8;
  const angle = (score - 50) * 1.8;

  let change = '어제와 비교할 수 없어요';
  let glyph = null;
  let yesterday = null;
  if (Number.isFinite(delta)) {
    const step = Math.round(Math.abs(delta) * 10) / 10;
    if (step === 0) {
      change = '어제와 같아요';
      glyph = '→';
    } else {
      const up = delta > 0;
      const before = Math.min(100, Math.max(0, value - delta));
      change = sentence(up, step, side(Math.round(before)), side(score));
      glyph = up ? '▲' : '▼';
      // 계기판의 어제 바늘 — 오늘 바늘과 같은 규칙(반올림한 점수)으로 각도를 잡는다.
      yesterday = { value: Math.round(before * 10) / 10, angle: (Math.round(before) - 50) * 1.8 };
    }
  }
  return { score, word, size, change, glyph, angle, yesterday };
}
