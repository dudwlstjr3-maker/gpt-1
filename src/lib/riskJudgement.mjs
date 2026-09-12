/**
 * 지표 하나를 놓고 "그래서 지금 이걸 어떻게 읽어야 하나" 에 필요한 재료를 뽑는다.
 *
 * 왜 필요한가
 *   화면에는 값(11.55), 방향(▼ -1.39), 색 띠, 구간 목록(안정 15 미만 / 보통 15~20 …)
 *   이 다 있었다. 그런데 정작 사람이 알고 싶은 두 가지는 직접 계산해야 했다.
 *     ① "다음 단계까지 얼마나 남았나" — 15에서 11.55를 빼야 나온다
 *     ② "요즘 값들 중에서는 어디쯤인가" — 스파크라인 모양만 보고 짐작해야 했다
 *   숫자를 보고 판단하려면 이 둘이 있어야 한다. 둘 다 이미 있는 데이터로 계산된다.
 *
 * 무엇이 아닌가
 *   사거나 팔라는 말이 아니다. 여기서 나오는 것은 전부 **뺄셈과 순위**다.
 *   경계값은 이 앱이 정한 구간이고 공식 기준이 아니라는 사실은 화면이 따로 밝힌다.
 */

/**
 * 위험이 커지는 쪽으로 다음 경계가 어디인지.
 *
 * 이미 제일 위험한 구간에 있으면 반대로 "여기서 얼마나 내려가야 한 단계 나아지는가"
 * 를 돌려준다 — 그때는 그게 사람이 궁금해하는 값이다.
 *
 * @returns {{level: string, label: string, at: number, delta: number, dir: 'worse'|'better'} | null}
 */
export function nextBoundary(indicator) {
  const v = indicator?.value;
  const bands = indicator?.bands;
  if (typeof v !== 'number' || !Number.isFinite(v) || !Array.isArray(bands) || bands.length === 0) return null;

  const riskUp = indicator.direction !== 'lower_is_riskier';
  // 구간을 위험이 커지는 순서로 세운다. 낮을수록 위험한 지표는 뒤집는다.
  const ordered = riskUp ? bands.slice() : bands.slice().reverse();

  // 지금 값보다 위험 쪽에 있는 첫 경계
  for (const b of ordered) {
    const edge = riskUp ? b.from : b.to;
    if (typeof edge !== 'number') continue;
    if (riskUp ? edge > v : edge < v) {
      return { level: b.level, label: b.label, at: edge, delta: edge - v, dir: 'worse' };
    }
  }

  // 제일 위험한 구간 안이다. 한 단계 나아지는 경계를 돌려준다.
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const b = ordered[i];
    const edge = riskUp ? b.from : b.to;
    if (typeof edge !== 'number') continue;
    if (riskUp ? edge <= v : edge >= v) {
      // 그 경계를 만든 구간(= 한 단계 아래)
      const safer = ordered[i - 1];
      return {
        level: safer ? safer.level : b.level,
        label: safer ? safer.label : b.label,
        at: edge,
        delta: edge - v,
        dir: 'better',
      };
    }
  }
  return null;
}

/**
 * 최근 구간 안에서 지금 값이 어디에 서 있는지.
 *
 * 백분위가 아니라 **최저~최고 사이의 위치**다. 표본이 30일뿐이라 백분위라고
 * 부르면 실제보다 센 말이 된다. 여기서 말하는 것은 "요즘 오르내린 폭 안에서
 * 지금이 아래쪽인가 위쪽인가" 하나뿐이다.
 *
 * @returns {{min: number, max: number, pct: number, days: number} | null}
 */
export function recentPosition(spark, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Array.isArray(spark)) return null;
  const vals = spark.map((p) => (p && typeof p.v === 'number' ? p.v : NaN)).filter((x) => Number.isFinite(x));
  if (vals.length < 5) return null; // 점 몇 개로 '범위' 를 말하면 안 된다
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (!(max > min)) return null; // 움직이지 않은 구간에서는 위치가 뜻을 갖지 않는다
  const pct = ((value - min) / (max - min)) * 100;
  return { min, max, pct: Math.max(0, Math.min(100, pct)), days: vals.length };
}

/** 위치를 사람 말로. 숫자는 화면이 따로 보여주므로 여기서는 방향만 말한다. */
export function positionWord(pct) {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return '';
  if (pct <= 15) return '아래쪽 끝';
  if (pct <= 40) return '아래쪽';
  if (pct < 60) return '가운데';
  if (pct < 85) return '위쪽';
  return '위쪽 끝';
}
