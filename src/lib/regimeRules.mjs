/**
 * 국면 전광판 — 지금이 지난 20년 중 어디쯤인지 계산하는 순수 로직.
 *
 * 홈의 공포·탐욕 점수와 무엇이 다른가
 *   공포·탐욕 점수는 **최근 1년(252거래일)** 분포와 비교한다. "요즘 분위기" 를 본다.
 *   국면 점수는 **최근 20년** 분포와 비교한다. "지금이 역사적으로 어디쯤인가" 를 본다.
 *   그래서 공포·탐욕이 20점이어도 국면은 45점일 수 있다. 둘은 다른 질문의 답이다.
 *
 * **이건 매매 신호가 아니다.**
 * 화면에 "매수" "매도" 라는 말을 쓰지 않는 건 이 앱의 규칙이기도 하지만,
 * 그 전에 **데이터가 그 말을 받쳐 주지 않기 때문**이다. 2000~2026년 월별 표본에서
 * 국면 점수가 10 아래로 내려간 적은 네 번뿐이고, 그중 두 번은 12개월 뒤에도
 * 손실이었다. n=4 로는 신호를 만들 수 없다. 자세한 기록은 regimeEvidence.mjs 에 있다.
 *
 * 그래서 이 파일이 내놓는 것은 판정이 아니라 **사실 세 가지**다.
 *   1. 지금 점수와 그 점수를 만든 축별 백분위
 *   2. 희소성 — 이보다 낮았던(높았던) 마지막 날이 언제인가
 *   3. 산출 근거 — 몇 개 축이 살아 있고 몇 년치를 봤는가
 *
 * .mjs 인 이유는 이 프로젝트가 새 의존성을 못 쓰고 node --test 가 TS 를 못 읽어서다.
 */

/**
 * 국면 점수를 만드는 축. 넷 다 20년 이상 공개 이력이 있는 것만 골랐다.
 *
 * short 가 따로 있는 이유: 320px 에서 막대 옆 이름표 칸이 70px 남짓이라
 * '신용 스프레드' 가 두 줄로 접힌다. 좁은 자리에는 short 를, 설명이 필요한
 * 자리에는 label 과 hint 를 쓴다.
 */
export const REGIME_AXES = [
  {
    id: 'vol',
    label: '변동성',
    short: '변동성',
    weight: 25,
    invert: true,
    unit: '',
    precision: 2,
    hint: 'VIX 종가. 높을수록 공포.',
  },
  {
    id: 'credit',
    label: '신용 스프레드',
    short: '신용',
    weight: 25,
    invert: true,
    unit: '%',
    precision: 2,
    hint: '하이일드 회사채가 국채보다 더 무는 금리. 벌어질수록 공포.',
  },
  {
    id: 'drawdown',
    label: '고점 대비 낙폭',
    short: '낙폭',
    weight: 25,
    invert: false,
    unit: '%',
    precision: 1,
    hint: '주가지수가 사상 최고가에서 얼마나 내려와 있는가. 0 이면 최고가.',
  },
  {
    id: 'trend',
    label: '추세',
    short: '추세',
    weight: 25,
    invert: false,
    unit: '%',
    precision: 1,
    hint: '주가지수가 1년 이동평균 위/아래 어디에 있는가.',
  },
];

/** 분포를 비교할 기간 */
export const LOOKBACK_YEARS = 20;
/**
 * 축의 마지막 관측치가 이보다 오래됐으면 그 축을 죽은 것으로 본다.
 *
 * 이게 없으면 제공사가 발표를 멈춰도 엔진이 옛 값을 오늘 값처럼 쓴다.
 * 그건 결측을 조용히 메우는 것과 같아서 이 앱이 하지 않기로 한 일이다.
 * 일별 시리즈(주말·공휴일 포함) 기준으로 10일을 기본값으로 둔다.
 */
export const MAX_STALE_DAYS = 10;
/** 이만큼도 안 쌓였으면 그 축은 쓰지 않는다 */
export const MIN_HISTORY_YEARS = 10;
/** 살아 있는 축의 가중치 합이 이 비율 미만이면 점수를 내지 않는다 */
export const MIN_COVERAGE = 0.7;

const DAY_MS = 86_400_000;

/**
 * 점수 구간.
 *
 * 이름은 전부 **시장의 상태**를 가리킨다. 사용자가 할 행동을 가리키는 이름
 * ('매수 구간' 같은 것)은 쓰지 않는다. glyph 는 색만으로 뜻을 전하지 않기 위한 것이다.
 */
export const BANDS = [
  { id: 'extreme_fear', max: 10,  label: '극단적 공포', glyph: '▼▼', tone: 'danger' },
  { id: 'fear',         max: 25,  label: '공포',        glyph: '▼',  tone: 'warn'   },
  { id: 'caution',      max: 45,  label: '경계',        glyph: '·',  tone: 'neutral'},
  { id: 'middle',       max: 55,  label: '중간',        glyph: '=',  tone: 'neutral'},
  { id: 'calm',         max: 75,  label: '안정',        glyph: '△',  tone: 'ok'     },
  { id: 'hot',          max: 90,  label: '과열',        glyph: '▲',  tone: 'warn'   },
  { id: 'extreme_hot',  max: 101, label: '극단적 과열', glyph: '▲▲', tone: 'danger' },
];

/** 숫자면 그대로, 아니면 null. NaN·Infinity 도 null 이다. */
export function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function bandFor(score) {
  const s = numOrNull(score);
  if (s === null) return null;
  return BANDS.find((b) => s < b.max) ?? BANDS[BANDS.length - 1];
}

/**
 * 중간순위 백분위 — window 안에서 x 가 아래쪽 몇 %에 있는가.
 *
 * 같은 값이 여러 개일 때 0 이나 100 으로 튀지 않게 절반씩 나눠 센다.
 * winsorization 은 하지 않는다. 공포·탐욕 엔진은 극단치를 눌러야 하지만,
 * 여기서는 **극단 그 자체가 답**이라 누르면 2008년과 2020년을 구분하지 못한다.
 */
export function percentileOf(window, x) {
  if (!Array.isArray(window) || window.length === 0) return null;
  const v = numOrNull(x);
  if (v === null) return null;
  let below = 0;
  let equal = 0;
  for (const w of window) {
    const n = numOrNull(w);
    if (n === null) continue;
    if (n < v) below += 1;
    else if (n === v) equal += 1;
  }
  const total = window.reduce((c, w) => c + (numOrNull(w) === null ? 0 : 1), 0);
  if (total === 0) return null;
  return (100 * (below + equal / 2)) / total;
}

/** 시계열을 시간순으로 정리하고 쓸 수 없는 점을 버린다. */
function cleanSeries(points) {
  if (!Array.isArray(points)) return [];
  const out = [];
  for (const p of points) {
    if (p === null || typeof p !== 'object') continue;
    const t = numOrNull(p.t);
    const v = numOrNull(p.v);
    if (t === null || v === null) continue;
    out.push({ t, v });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * 한 시점의 국면 점수.
 *
 * @param {Record<string, {t:number,v:number}[]>} series 축 id → 시계열
 * @param {number} at  기준 시각(epoch ms)
 */
export function scoreAt(series, at, options) {
  const now = numOrNull(at);
  if (now === null) return { score: null, coverage: 0, axes: [], reason: '기준 시각이 올바르지 않습니다.' };

  const from = now - LOOKBACK_YEARS * 365.25 * DAY_MS;
  const minSpan = MIN_HISTORY_YEARS * 365.25 * DAY_MS;
  const maxStale = (numOrNull(options?.maxStaleDays) ?? MAX_STALE_DAYS) * DAY_MS;

  const axes = [];
  let live = 0;
  let total = 0;

  for (const axis of REGIME_AXES) {
    total += axis.weight;
    const points = cleanSeries(series?.[axis.id]);
    const window = points.filter((p) => p.t >= from && p.t <= now);
    const current = window.length > 0 ? window[window.length - 1] : null;

    if (current === null) {
      axes.push({ ...axisMeta(axis), percentile: null, value: null, years: 0, reason: '자료가 없습니다.' });
      continue;
    }
    if (now - current.t > maxStale) {
      axes.push({
        ...axisMeta(axis),
        percentile: null,
        value: current.v,
        years: 0,
        asOf: current.t,
        reason: `마지막 값이 ${Math.round((now - current.t) / DAY_MS)}일 전이라 오늘 값으로 쓰지 않습니다.`,
      });
      continue;
    }

    const span = current.t - window[0].t;
    if (span < minSpan) {
      axes.push({
        ...axisMeta(axis),
        percentile: null,
        value: current.v,
        years: +(span / (365.25 * DAY_MS)).toFixed(1),
        reason: `분포를 만들려면 ${MIN_HISTORY_YEARS}년치가 필요합니다.`,
      });
      continue;
    }

    let pct = percentileOf(window.map((p) => p.v), current.v);
    if (pct === null) {
      axes.push({ ...axisMeta(axis), percentile: null, value: current.v, years: 0, reason: '분포를 만들지 못했습니다.' });
      continue;
    }
    if (axis.invert) pct = 100 - pct;

    axes.push({
      ...axisMeta(axis),
      percentile: pct,
      value: current.v,
      years: +(span / (365.25 * DAY_MS)).toFixed(1),
      asOf: current.t,
    });
    live += axis.weight;
  }

  const coverage = total === 0 ? 0 : live / total;
  if (coverage < MIN_COVERAGE) {
    return {
      score: null,
      coverage,
      axes,
      reason: `구성 축의 ${Math.round(MIN_COVERAGE * 100)}% 이상이 있어야 점수를 냅니다. 지금은 ${Math.round(
        coverage * 100,
      )}% 입니다.`,
    };
  }

  const score =
    axes.filter((a) => a.percentile !== null).reduce((s, a) => s + a.percentile * a.weight, 0) / live;

  return { score, coverage, axes };
}

function axisMeta(axis) {
  return {
    id: axis.id,
    label: axis.label,
    short: axis.short,
    weight: axis.weight,
    invert: axis.invert,
    unit: axis.unit,
    precision: axis.precision,
    hint: axis.hint,
  };
}

/**
 * 희소성 — 이 점수가 얼마 만인가.
 *
 * 정의를 좁게 잡는다. "N년 만" 은 **이보다 더 극단이었던 마지막 날이 N년 전**이라는
 * 뜻이고, 그것뿐이다. 그런 날이 아예 없으면 "N년 만" 이라고 쓰지 않고
 * "자료가 있는 N년 중 가장 낮다" 라고 쓴다. 20년치밖에 없는데 "20년 만" 이라고
 * 쓰면 20년 전에 있었다는 뜻이 되어 버린다.
 *
 * @param {{t:number,score:number}[]} history 과거 국면 점수(오름차순)
 * @param {number} score 지금 점수
 * @param {number} at 지금 시각
 */
export function rarity(history, score, at) {
  const s = numOrNull(score);
  const now = numOrNull(at);
  if (s === null || now === null || !Array.isArray(history) || history.length === 0) return null;

  const band = bandFor(s);
  // 가운데 구간은 희소할 것이 없다. 억지로 "N년 만" 을 붙이지 않는다.
  const side = s < 45 ? 'low' : s >= 55 ? 'high' : null;
  if (side === null) return { side: null, band, text: null, notable: false };

  const past = history
    .map((h) => ({ t: numOrNull(h?.t), score: numOrNull(h?.score) }))
    .filter((h) => h.t !== null && h.score !== null && h.t < now)
    .sort((a, b) => a.t - b.t);
  if (past.length === 0) return { side, band, text: null, notable: false };

  const spanYears = (now - past[0].t) / (365.25 * DAY_MS);
  const matches = (h) => (side === 'low' ? h.score <= s : h.score >= s);

  let last = null;
  for (let i = past.length - 1; i >= 0; i -= 1) {
    if (matches(past[i])) { last = past[i]; break; }
  }

  if (last === null) {
    return {
      side,
      band,
      recordYears: +spanYears.toFixed(1),
      sinceT: null,
      months: null,
      text: `자료가 있는 ${Math.floor(spanYears)}년 중 가장 ${side === 'low' ? '낮습니다' : '높습니다'}`,
      headline: `${Math.floor(spanYears)}년 최${side === 'low' ? '저' : '고'}`,
      notable: true,
    };
  }

  const months = Math.floor((now - last.t) / (365.25 / 12) / DAY_MS);
  return {
    side,
    band,
    recordYears: +spanYears.toFixed(1),
    sinceT: last.t,
    months,
    text: `이보다 ${side === 'low' ? '낮았던' : '높았던'} 마지막 날은 ${formatMonth(last.t)} 입니다`,
    headline: headlineFor(months, side),
    notable: months >= 12,
  };
}

/**
 * "N년 만" 이라는 말은 아무 때나 붙이지 않는다.
 *
 * 1년이 안 되는 간격은 흔한 일이라 이걸 크게 띄우면 매달 "몇 개월 만의 공포" 가
 * 뜬다. 그건 정보가 아니라 소음이고, 알림으로 나가면 더 나쁘다.
 * 그래서 1년 이상일 때만 notable 로 표시하고, 화면은 그때만 이 문장을 크게 쓴다.
 */
function headlineFor(months, side) {
  const what = side === 'low' ? '공포' : '과열';
  if (months < 12) return `${Math.max(months, 1)}개월 만의 ${what} 수준`;
  return `${Math.floor(months / 12)}년 만의 ${what} 수준`;
}

function formatMonth(t) {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '알 수 없음';
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월`;
}

/**
 * 전광판 하나를 통째로 만든다.
 *
 * @param {Record<string, {t:number,v:number}[]>} series
 * @param {number} at
 * @param {{t:number,score:number}[]} history 미리 계산해 둔 과거 점수
 */
export function buildBoard(series, at, history, options) {
  const now = scoreAt(series, at, options);
  const band = bandFor(now.score);
  return {
    asOf: numOrNull(at),
    score: now.score,
    coverage: now.coverage,
    axes: now.axes,
    band,
    unavailableReason: now.score === null ? (now.reason ?? '점수를 낼 수 없습니다.') : undefined,
    rarity: now.score === null ? null : rarity(history, now.score, at),
    lookbackYears: LOOKBACK_YEARS,
  };
}

/**
 * 과거 점수 곡선 — 화면의 20년 그래프와 희소성 계산에 함께 쓴다.
 *
 * 매 시점의 분포를 그 시점까지의 자료로만 만든다(미래를 보지 않는다).
 * 앞으로 값이 촘촘히 들어와도 계산량이 터지지 않게 step 으로 솎아낸다.
 */
export function buildHistory(series, from, to, stepDays = 7, options) {
  const start = numOrNull(from);
  const end = numOrNull(to);
  if (start === null || end === null || end <= start) return [];
  const step = Math.max(1, Math.floor(stepDays)) * DAY_MS;
  const out = [];
  for (let t = start; t <= end; t += step) {
    const r = scoreAt(series, t, options);
    if (r.score !== null) out.push({ t, score: r.score });
  }
  return out;
}
