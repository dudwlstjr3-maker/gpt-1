// The app and the standalone preview use the same rounded score and type scale.
export function homeMood(value, delta) {
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  const score = Math.round(value);
  const word = score < 20 ? '쫄?' : score >= 80 ? '탐?' : null;
  const size = 40 + Math.max(0, Math.abs(score - 50) - 30) * 1.8;
  let change = '전일 비교 불가';
  if (Number.isFinite(delta)) {
    const magnitude = Math.abs(delta).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
    change = delta === 0 ? '전일과 같음' : `전일 대비 ${delta > 0 ? '↑' : '↓'} ${magnitude}점`;
  }
  const angle = (score - 50) * 1.8;
  return { score, word, size, change, angle };
}
