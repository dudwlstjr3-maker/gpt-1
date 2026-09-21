/**
 * 오늘 불타는 것과 얼어붙은 것 — 시장마다 하나씩 골라 낸다.
 *
 * 왜 '몇 %' 로 줄을 세우지 않나
 *   그러면 **크립토가 늘 이긴다.** 원래 많이 움직이는 것이라 하루 8% 가 평범할 수
 *   있고, 코스피가 8% 움직이면 사건이다. 같은 8% 라도 뜻이 전혀 다르다.
 *
 *   그래서 그 종목이 **평소 움직이던 폭에 견줘** 오늘이 얼마나 유별났는지로 잰다.
 *   지나온 30일의 하루치 변동에서 평소 폭(표준편차)을 내고, 오늘 움직임이 그 몇
 *   배인지를 본다. 이러면 삼성전자 +1.5% 가 리플 +8.8% 보다 유별난 일이 될 수 있고,
 *   실제로 그게 맞다.
 *
 * 말을 세게 쓰되 넘지 않는 선
 *   '불탄다' 는 **얼마나 크게 움직였는가**에 대한 말이다. 좋다·나쁘다가 아니고
 *   사라·팔라는 뜻은 더더욱 아니다. 대박·폭등·기회·물렸다 같은 낱말은 쓰지 않는다 —
 *   그건 움직임이 아니라 판단이고, 이 앱이 하지 않기로 한 것이다.
 *
 * 못 재면 재지 않는다
 *   지나온 값이 모자라면 배수를 지어내지 않고 null 을 준다. 화면은 그 자리에
 *   "얼마나 유별난지 잴 수 없습니다" 라고 적는다.
 *
 * 작은 종목은 후보에서 뺀다
 *   시총 순위가 300위 밖이면 고르지 않는다. 작은 종목은 하루 30% 씩도 움직여서,
 *   평소 폭으로 나눠도 배수가 크게 나오는 날이 잦다. 그것까지 후보에 넣으면
 *   '오늘 유별났던 것' 자리가 늘 그런 종목 차지가 되고, 정작 큰 시장에서 일어난
 *   일은 밀려난다.
 */

/** 배수를 재려면 하루치 변동이 최소 이만큼은 있어야 한다 */
export const MIN_SAMPLE = 7;

/** 시총 순위가 이 안에 드는 것만 고른다 */
export const CAP_RANK_MAX = 300;

/**
 * 후보로 볼 것인가.
 *
 * 순위를 **아는데** 300위 밖이면 뺀다. 모르면 그대로 둔다 — 지수처럼 애초에
 * 순위 개념이 없는 것도 있고, 지금 목록은 사람이 골라 담은 것이라 전부 각
 * 시장의 대형주·상위 코인이기 때문이다. 바깥에서 이름이 쏟아져 들어오는 날
 * (한국 전종목처럼) 제공사가 순위를 함께 주고, 그때 이 문이 일한다.
 */
export function withinCap(quote, maxRank = CAP_RANK_MAX) {
  const rank = quote?.capRank;
  if (rank === null || rank === undefined) return true;
  return Number.isFinite(rank) && rank <= maxRank;
}

/**
 * 이 종목이 평소 하루에 얼마나 움직이는가 (%, 표준편차).
 * 지나온 값에서 하루치 변동률을 뽑아 낸다. 표본이 모자라면 null.
 */
export function dailySigma(spark) {
  const v = (Array.isArray(spark) ? spark : []).map((p) => p?.v).filter(Number.isFinite);
  if (v.length < MIN_SAMPLE + 1) return null;
  const r = [];
  for (let i = 1; i < v.length; i += 1) if (v[i - 1] !== 0) r.push(((v[i] - v[i - 1]) / v[i - 1]) * 100);
  if (r.length < MIN_SAMPLE) return null;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
  return Number.isFinite(sd) && sd > 0 ? sd : null;
}

/** 단계별 말. 위는 불, 아래는 얼음. */
export const HEAT_WORD = {
  3: { up: '활활 타오릅니다', down: '꽁꽁 얼어붙었습니다' },
  2: { up: '불타오릅니다', down: '싸늘하게 식었습니다' },
  1: { up: '불이 붙었습니다', down: '차갑게 식었습니다' },
  0: { up: '불씨 정도입니다', down: '살짝 식었습니다' },
};

/**
 * 오늘 움직임이 평소의 몇 배인가, 그래서 뭐라고 부를 것인가.
 * @returns null 이면 잴 수 없다 (평소 폭을 모른다).
 */
export function heatOf(changePct, sigma) {
  if (!Number.isFinite(changePct) || !Number.isFinite(sigma) || !(sigma > 0)) return null;
  const z = changePct / sigma;
  const a = Math.abs(z);
  const up = changePct >= 0;
  const level = a >= 3 ? 3 : a >= 2 ? 2 : a >= 1 ? 1 : 0;
  return {
    z,
    /** 평소의 몇 배 (늘 양수) */
    times: a,
    level,
    up,
    word: HEAT_WORD[level][up ? 'up' : 'down'],
    /** 그림 세기 0~1 — 불길 크기와 번지는 빛에 쓴다 */
    strength: Math.min(1, a / 3),
  };
}

/**
 * 한 시장에서 가장 많이 오른 것과 가장 많이 내린 것.
 *
 * 하루 종일 다 오른 날이 있다. 그때 '가장 많이 내린 것' 이라고 적고 파랗게 칠하면
 * **오른 것을 내렸다고 말하는 셈**이라 거짓말이 된다. 그래서 자리 이름을 바꾼다 —
 * '가장 덜 오른 것'. 반대로 다 내린 날은 '가장 덜 내린 것' 이 된다.
 */
export function pickHeat(quotes, { maxCapRank = CAP_RANK_MAX } = {}) {
  const rows = (Array.isArray(quotes) ? quotes : [])
    .filter((q) => q && Number.isFinite(q.changePct) && q.price !== null && q.price !== undefined)
    .filter((q) => withinCap(q, maxCapRank))
    .map((q) => {
      const sigma = dailySigma(q.spark);
      return { quote: q, sigma, heat: heatOf(q.changePct, sigma) };
    });
  if (rows.length < 2) return null;

  rows.sort((a, b) => b.quote.changePct - a.quote.changePct);
  const top = rows[0];
  const bottom = rows[rows.length - 1];

  const nothingFell = bottom.quote.changePct >= 0;
  const nothingRose = top.quote.changePct < 0;

  return {
    count: rows.length,
    top: {
      ...top,
      slot: nothingRose ? '가장 덜 내린 것' : '가장 많이 오른 것',
      note: nothingRose ? '이 시장에서는 오른 것이 하나도 없습니다.' : null,
    },
    bottom: {
      ...bottom,
      slot: nothingFell ? '가장 덜 오른 것' : '가장 많이 내린 것',
      note: nothingFell ? '이 시장에서는 내린 것이 하나도 없습니다.' : null,
    },
  };
}
