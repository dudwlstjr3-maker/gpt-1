/**
 * 종목 차트의 지표 계산 (2026-11-27) — 순수 함수만. 앱(src/app/chart)과 미리보기(template.html)가 같은 파일을 쓴다.
 * 미리보기는 tools/preview/build.mjs 가 이 파일을 그대로 끼워 넣는다(__TA_LIB__) — 그래서 import 를 두지 않는다.
 *
 * 무엇을 그리나 — 공식이 공개된 것만
 *   슈퍼트렌드(ATR 10 · 3배), RSI(14) 와 RSI 다이버전스(좌우 5봉 피벗, 5~60봉 간격),
 *   OBV 오실레이터(OBV − OBV 의 20 지수평균), 20 · 60 이동평균, 추세선(1년 = 252거래일 평균선).
 *   유료 · 비공개 지표(SignalMaster Pro, AI Moving Average 등)는 공식을 알 수 없어 흉내 내지 않는다.
 *
 * 말투 (AGENTS.md 1절)
 *   매수 · 매도 지시를 하지 않는다. 그림의 'Buy/Sell' 자리에는 '상승 전환 ▲ / 하락 전환 ▼' 처럼
 *   지표가 바뀐 사실만 적는다. 지표가 한쪽으로 모였다는 것은 지금 상태이지 앞날이 아니다.
 *
 * 값이 없으면 0 이 아니라 null (AGENTS.md 3절). 거래량이 빠진 봉이 있으면 OBV 는 통째로 그리지 않는다 —
 * 빈 자리를 메우면 누적값 전체가 틀어진다.
 */

/** 기본 설정 — 트레이딩뷰 기본값과 같다. TA_TREND_DAYS 는 overlays.mjs 의 TREND_MA_DAYS 와 같아야 한다(테스트). */
export const TA_RSI = 14;
/* RSI 구간 — 운영자 기법의 기준(2026-11-27): 30 이하 침체 · 80 이상 과열, 20 이하 · 90 이상은 더 강하게 본다.
   흔한 기본값은 70 / 30 이지만, 이 화면은 운영자가 실제로 쓰는 값을 쓴다. */
export const TA_RSI_HIGH = 80;
export const TA_RSI_LOW = 30;
export const TA_RSI_STRONG_HIGH = 90;
export const TA_RSI_STRONG_LOW = 20;
export const TA_ST_ATR = 10;
export const TA_ST_MULT = 3;
export const TA_OBV_EMA = 20;
export const TA_MA = [20, 60];
export const TA_TREND_DAYS = 252;
export const TA_DIV = { left: 5, right: 5, min: 5, max: 60 };
/** 요약에서 '최근' 으로 보는 봉 수 — 다이버전스 · 전환 · 기법 조건 */
export const TA_RECENT = 30;

const fin = (x) => typeof x === 'number' && Number.isFinite(x);

/* ------------------------------ 평균 ------------------------------ */

/** 단순 이동평균. 앞 n−1 칸은 null */
export function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  let run = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (!fin(v)) { sum = 0; run = 0; continue; }
    sum += v;
    run += 1;
    if (run > n) { sum -= values[i - n]; run = n; }
    if (run === n) out[i] = sum / n;
  }
  return out;
}

/** 지수 이동평균 — 처음 n 개의 단순평균에서 시작. 앞 n−1 칸은 null */
export function ema(values, n) {
  return smooth(values, n, 2 / (n + 1));
}

/** 와일더 평균(RMA) — RSI · ATR 에 쓴다 */
export function rma(values, n) {
  return smooth(values, n, 1 / n);
}

function smooth(values, n, alpha) {
  const out = new Array(values.length).fill(null);
  let prev = null;
  let seed = [];
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (!fin(v)) { prev = null; seed = []; continue; }
    if (prev === null) {
      seed.push(v);
      if (seed.length === n) {
        prev = seed.reduce((a, b) => a + b, 0) / n;
        out[i] = prev;
      }
      continue;
    }
    prev = alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

/* ------------------------------ RSI ------------------------------ */

/** RSI(n) — 와일더 방식. 첫 n 칸은 null */
export function rsi(closes, n = TA_RSI) {
  const gains = new Array(closes.length).fill(null);
  const losses = new Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i += 1) {
    if (!fin(closes[i]) || !fin(closes[i - 1])) continue;
    const d = closes[i] - closes[i - 1];
    gains[i] = d > 0 ? d : 0;
    losses[i] = d < 0 ? -d : 0;
  }
  const up = rma(gains, n);
  const down = rma(losses, n);
  return closes.map((_, i) => {
    if (up[i] === null || down[i] === null) return null;
    if (down[i] === 0) return up[i] === 0 ? 50 : 100;
    if (up[i] === 0) return 0;
    return 100 - 100 / (1 + up[i] / down[i]);
  });
}

/* ------------------------------ 슈퍼트렌드 ------------------------------ */

/** 진폭 평균(ATR) — 첫 봉의 진폭은 고가 − 저가 */
export function atr(high, low, close, n) {
  const tr = high.map((h, i) => {
    if (i === 0) return h - low[i];
    const pc = close[i - 1];
    return Math.max(h - low[i], Math.abs(h - pc), Math.abs(low[i] - pc));
  });
  return rma(tr, n);
}

/**
 * 슈퍼트렌드 — 트레이딩뷰 ta.supertrend 와 같은 계산.
 * dir: 'up'(선이 가격 아래 = 상승 추세) | 'down' | null(ATR 이 모이기 전)
 * flips: 방향이 바뀐 봉 — 화면의 '상승 전환 ▲ / 하락 전환 ▼'
 */
export function supertrend(high, low, close, atrLen = TA_ST_ATR, mult = TA_ST_MULT) {
  const a = atr(high, low, close, atrLen);
  const n = close.length;
  const line = new Array(n).fill(null);
  const dir = new Array(n).fill(null);
  const flips = [];
  let prevUpper = null;
  let prevLower = null;
  let prevLine = null;
  for (let i = 0; i < n; i += 1) {
    if (a[i] === null) continue;
    const mid = (high[i] + low[i]) / 2;
    let upper = mid + mult * a[i];
    let lower = mid - mult * a[i];
    const pc = i > 0 ? close[i - 1] : null;
    if (prevLower !== null && !(lower > prevLower || (pc !== null && pc < prevLower))) lower = prevLower;
    if (prevUpper !== null && !(upper < prevUpper || (pc !== null && pc > prevUpper))) upper = prevUpper;
    let d;
    if (prevLine === null) d = 'down';
    else if (prevLine === prevUpper) d = close[i] > upper ? 'up' : 'down';
    else d = close[i] < lower ? 'down' : 'up';
    line[i] = d === 'up' ? lower : upper;
    if (dir[i - 1] && dir[i - 1] !== d) flips.push({ i, dir: d });
    dir[i] = d;
    prevUpper = upper;
    prevLower = lower;
    prevLine = line[i];
  }
  return { line, dir, flips };
}

/* ------------------------------ OBV ------------------------------ */

/**
 * OBV 오실레이터 = OBV − EMA(OBV, 20).
 * 거래량이 하나라도 빠졌거나(null) 모두 0 이면(지수 중에는 거래량을 주지 않는 곳이 있다) 그리지 않고 까닭을 돌려준다.
 */
export function obvOsc(closes, volumes, n = TA_OBV_EMA) {
  if (!volumes || volumes.length !== closes.length) return { ok: false, reason: '거래량을 받지 못했습니다.' };
  const missing = volumes.filter((v) => !fin(v) || v < 0).length;
  if (missing) return { ok: false, reason: `거래량이 빠진 봉이 ${missing}개 있어 OBV 를 그리지 않습니다.` };
  if (volumes.every((v) => v === 0)) return { ok: false, reason: '이 항목은 제공처가 거래량을 주지 않습니다.' };
  const obv = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i += 1) {
    const d = closes[i] - closes[i - 1];
    obv[i] = obv[i - 1] + (d > 0 ? volumes[i] : d < 0 ? -volumes[i] : 0);
  }
  const e = ema(obv, n);
  return { ok: true, osc: obv.map((v, i) => (e[i] === null ? null : v - e[i])) };
}

/* ------------------------------ 다이버전스 ------------------------------ */

/** 좌우 left/right 봉보다 낮은(높은) 봉. 오른쪽 봉이 다 모여야 확인된다. */
export function pivots(values, kind, left = TA_DIV.left, right = TA_DIV.right) {
  const out = [];
  for (let i = left; i < values.length - right; i += 1) {
    const v = values[i];
    if (!fin(v)) continue;
    let ok = true;
    for (let k = i - left; k <= i + right && ok; k += 1) {
      if (k === i) continue;
      const w = values[k];
      if (!fin(w)) ok = false;
      else if (kind === 'low' ? w <= v : w >= v) ok = false;
    }
    if (ok) out.push(i);
  }
  return out;
}

/**
 * RSI 다이버전스 — 트레이딩뷰 'RSI Divergence Indicator' 의 정규 다이버전스와 같은 규칙.
 *   상승(bull): 가격 저점은 더 낮아졌는데 RSI 저점은 높아짐
 *   하락(bear): 가격 고점은 더 높아졌는데 RSI 고점은 낮아짐
 * 바로 앞 피벗과만 견주고, 두 피벗 사이가 5~60봉일 때만. i 는 피벗 봉, seenAt 은 확인된 봉(i + 5).
 */
export function rsiDivergence(r, low, high, opt = TA_DIV) {
  const out = [];
  const scan = (idx, kind) => {
    for (let k = 1; k < idx.length; k += 1) {
      const p = idx[k];
      const q = idx[k - 1];
      const gap = p - q;
      if (gap < opt.min || gap > opt.max) continue;
      if (kind === 'bull' && r[p] > r[q] && low[p] < low[q]) out.push({ i: p, from: q, kind, seenAt: p + opt.right });
      if (kind === 'bear' && r[p] < r[q] && high[p] > high[q]) out.push({ i: p, from: q, kind, seenAt: p + opt.right });
    }
  };
  scan(pivots(r, 'low', opt.left, opt.right), 'bull');
  scan(pivots(r, 'high', opt.left, opt.right), 'bear');
  return out.sort((a, b) => a.i - b.i);
}

/* ------------------------------ 봉 묶기 ------------------------------ */

/**
 * 1시간봉 → 4시간봉. 거래소 현지 날짜마다 장 시작부터 4개씩 묶는다 — 트레이딩뷰와 같다.
 * 미국 9:30~13:30 · 13:30~16:00, 한국 9:00~13:00 · 13:00~15:30.
 * gmtoffsetSec 는 거래소 시간대(제공처 meta.gmtoffset). 날짜를 가르는 데만 쓴다.
 */
export function toFourHour(bars, gmtoffsetSec) {
  const out = [];
  let day = null;
  let k = 0;
  for (const b of bars) {
    const d = Math.floor((b.t / 1000 + gmtoffsetSec) / 86400);
    if (d !== day) { day = d; k = 0; }
    if (k % 4 === 0) {
      out.push({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
    } else {
      const cur = out[out.length - 1];
      cur.h = Math.max(cur.h, b.h);
      cur.l = Math.min(cur.l, b.l);
      cur.c = b.c;
      cur.v = fin(cur.v) && fin(b.v) ? cur.v + b.v : null;
    }
    k += 1;
  }
  return out;
}

/**
 * 봉마다 추세선(1년선) 값.
 * 일봉이면 그 봉까지의 252일 평균. 4시간봉이면 **전날까지** 일봉의 252일 평균 — 그날 종가는 장중에 아직 모른다.
 */
export function trendForBars(bars, daily, n = TA_TREND_DAYS, gmtoffsetSec = 0) {
  const src = daily ?? bars;
  const ma = sma(src.map((b) => b.c), n);
  if (!daily) return ma;
  const dayOf = (t) => Math.floor((t / 1000 + gmtoffsetSec) / 86400);
  const out = new Array(bars.length).fill(null);
  let j = -1;
  for (let i = 0; i < bars.length; i += 1) {
    const d = dayOf(bars[i].t);
    while (j + 1 < daily.length && dayOf(daily[j + 1].t) < d) j += 1;
    out[i] = j >= 0 ? ma[j] : null;
  }
  return out;
}

/* ------------------------------ 종목 코드 ------------------------------ */

/**
 * 목록에 없는 종목을 코드로 찾을 때. 모양만 본다 — 실제로 있는지는 서버가 제공처에 물어본다.
 *   미국: 영문 1~5자 (TSLA), 우선주 · 종류주는 BRK-B / BRK.B
 *   한국: 숫자 6자리 (005930) — 코스피(.KS)에 없으면 코스닥(.KQ)
 * 모양이 아니면 null. 서버는 이 모양을 지난 것만 바깥 주소에 넣는다.
 */
export function taParseCode(raw) {
  const s = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const kr = s.match(/^(\d{6})(?:\.(KS|KQ))?$/);
  if (kr) return { code: kr[1], market: 'kr', candidates: kr[2] ? [`${kr[1]}.${kr[2]}`] : [`${kr[1]}.KS`, `${kr[1]}.KQ`] };
  const us = s.match(/^([A-Z]{1,5})(?:[.-]([A-Z]{1,2}))?$/);
  if (us) {
    const code = us[2] ? `${us[1]}-${us[2]}` : us[1];
    return { code, market: 'us', candidates: [code] };
  }
  return null;
}

/* ------------------------------ 모아서 ------------------------------ */

/**
 * 화면이 쓰는 모든 값을 한 번에.
 * input: { tf: '1d' | '4h', bars: [{t,o,h,l,c,v}], daily?: [{t,c}], gmtoffset?: 초 }
 */
export function taModel(input) {
  const bars = (input.bars ?? []).filter((b) => [b.t, b.o, b.h, b.l, b.c].every(fin));
  const t = bars.map((b) => b.t);
  const o = bars.map((b) => b.o);
  const h = bars.map((b) => b.h);
  const l = bars.map((b) => b.l);
  const c = bars.map((b) => b.c);
  const v = bars.map((b) => (fin(b.v) ? b.v : null));
  const r = rsi(c);
  return {
    tf: input.tf,
    n: bars.length,
    t, o, h, l, c, v,
    ma: TA_MA.map((p) => ({ p, v: sma(c, p) })),
    trend: trendForBars(bars, input.tf === '4h' ? input.daily ?? null : null, TA_TREND_DAYS, input.gmtoffset ?? 0),
    st: supertrend(h, l, c),
    rsi: r,
    div: rsiDivergence(r, l, h),
    obv: obvOsc(c, v),
  };
}

/* ------------------------------ 말 ------------------------------ */

const sign = (x, d = 1) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`;

/** RSI 구간 — 강한 과열(90 이상) · 과열(80 이상) · 중간 · 침체(30 이하) · 강한 침체(20 이하) */
export function rsiZone(x) {
  if (!fin(x)) return null;
  if (x >= TA_RSI_STRONG_HIGH) return 'strongHigh';
  if (x >= TA_RSI_HIGH) return 'high';
  if (x <= TA_RSI_STRONG_LOW) return 'strongLow';
  if (x <= TA_RSI_LOW) return 'low';
  return 'mid';
}

export const TA_ZONE_TEXT = {
  strongHigh: `강한 과열 (${TA_RSI_STRONG_HIGH} 이상)`,
  high: `과열 (${TA_RSI_HIGH} 이상)`,
  mid: `중간 (${TA_RSI_LOW}~${TA_RSI_HIGH})`,
  low: `침체 (${TA_RSI_LOW} 이하)`,
  strongLow: `강한 침체 (${TA_RSI_STRONG_LOW} 이하)`,
};
export const TA_DIR_TEXT = { up: '상승 추세 ▲', down: '하락 추세 ▼' };
export const TA_FLIP_TEXT = { up: '상승 전환 ▲', down: '하락 전환 ▼' };
export const TA_DIV_TEXT = { bull: '상승 다이버전스', bear: '하락 다이버전스' };

/** 봉 단위 이름 */
export function taBarUnit(tf) {
  return tf === '4h' ? '4시간봉' : '일봉';
}

/**
 * '지금 상태' 표의 줄들. i 를 주면 그 봉 기준(기본은 마지막 봉).
 * 각 줄: { key, name, value, dir: 'up' | 'down' | null, note }
 * dir 은 기호(▲▼)와 말로도 같이 적는다 — 색만으로 뜻을 전하지 않는다(AGENTS.md 4절).
 */
export function taSummary(m, i = m.n - 1) {
  const rows = [];
  const ago = (k) => (i - k === 0 ? '이번 봉' : `${i - k}봉 전`);
  const unit = taBarUnit(m.tf);

  // 슈퍼트렌드
  {
    const d = m.st.dir[i];
    const last = [...m.st.flips].reverse().find((f) => f.i <= i);
    rows.push({
      key: 'st',
      name: '슈퍼트렌드',
      value: d ? TA_DIR_TEXT[d] : '아직 없음',
      dir: d,
      note: d && last ? `${ago(last.i)} ${TA_FLIP_TEXT[last.dir]}` : d ? '' : `${unit} ${TA_ST_ATR}개가 모여야 계산합니다`,
    });
  }
  // 20 · 60
  {
    const a = m.ma[0].v[i];
    const b = m.ma[1].v[i];
    const ok = fin(a) && fin(b);
    const dir = ok ? (a > b ? 'up' : a < b ? 'down' : null) : null;
    rows.push({
      key: 'ma',
      name: `이동평균 ${m.ma[0].p}·${m.ma[1].p}`,
      value: ok ? (a > b ? `${m.ma[0].p}선이 ${m.ma[1].p}선 위 ▲` : a < b ? `${m.ma[0].p}선이 ${m.ma[1].p}선 아래 ▼` : '두 선이 같음') : '아직 없음',
      dir,
      note: ok ? '' : `${unit} ${m.ma[1].p}개가 모여야 계산합니다`,
    });
  }
  // 추세선(1년선)
  {
    const ma = m.trend[i];
    const px = m.c[i];
    const ok = fin(ma) && fin(px) && ma > 0;
    const gap = ok ? ((px - ma) / ma) * 100 : null;
    rows.push({
      key: 'trend',
      name: '추세선 (1년선)',
      value: ok ? `${px >= ma ? '1년선 위 ▲' : '1년선 아래 ▼'} ${sign(gap)}%` : '아직 없음',
      dir: ok ? (px >= ma ? 'up' : 'down') : null,
      note: ok ? '' : `일봉 ${TA_TREND_DAYS}개(1년)가 모여야 계산합니다`,
    });
  }
  // OBV
  {
    const x = m.obv.ok ? m.obv.osc[i] : null;
    rows.push({
      key: 'obv',
      name: 'OBV 오실레이터',
      value: !m.obv.ok ? '그리지 않음' : !fin(x) ? '아직 없음' : x > 0 ? '＋ 오른 봉 쪽 거래량 우세 ▲' : x < 0 ? '－ 내린 봉 쪽 거래량 우세 ▼' : '0',
      dir: m.obv.ok && fin(x) && x !== 0 ? (x > 0 ? 'up' : 'down') : null,
      note: m.obv.ok ? '' : m.obv.reason,
    });
  }
  // RSI
  {
    const x = m.rsi[i];
    const z = rsiZone(x);
    rows.push({
      key: 'rsi',
      name: `RSI (${TA_RSI})`,
      value: z ? `${x.toFixed(1)} · ${TA_ZONE_TEXT[z]}` : '아직 없음',
      dir: null,
      note: z ? '' : `${unit} ${TA_RSI + 1}개가 모여야 계산합니다`,
    });
  }
  // 다이버전스 — 확인된 것 중 최근
  {
    const seen = m.div.filter((d) => d.seenAt <= i && i - d.i <= TA_RECENT);
    const d = seen[seen.length - 1];
    rows.push({
      key: 'div',
      name: 'RSI 다이버전스',
      value: d ? `${TA_DIV_TEXT[d.kind]} ${d.kind === 'bull' ? '▲' : '▼'}` : `최근 ${TA_RECENT}봉 안에 없음`,
      dir: d ? (d.kind === 'bull' ? 'up' : 'down') : null,
      note: d ? `${ago(d.i)} ${d.kind === 'bull' ? '저점' : '고점'} · ${TA_DIV.right}봉 뒤 확인` : '',
    });
  }
  return rows;
}

/** 방향이 있는 줄만 세어 '상승 쪽 n · 하락 쪽 n' */
export function taTally(rows) {
  const up = rows.filter((r) => r.dir === 'up').length;
  const down = rows.filter((r) => r.dir === 'down').length;
  const counted = rows.filter((r) => r.key !== 'rsi').length;
  return { up, down, none: counted - up - down, counted };
}

export function taTallyText(t) {
  return `${t.counted}개 중 상승 쪽 ${t.up} · 하락 쪽 ${t.down}${t.none ? ` · 없음 ${t.none}` : ''}`;
}

/** 마지막 봉과 그 앞 봉의 종가 차이 — 일봉이면 전일 대비, 4시간봉이면 앞 봉 대비 */
export function taLastChange(m) {
  if (m.n < 2) return null;
  const a = m.c[m.n - 2];
  const b = m.c[m.n - 1];
  if (!fin(a) || !fin(b) || a === 0) return null;
  return { abs: b - a, pct: ((b - a) / a) * 100, label: m.tf === '4h' ? '앞 봉 대비' : '전일 대비' };
}

/** 손가락으로 짚은 봉 한 줄 — 날짜 · 시고저종 · RSI · 슈퍼트렌드 */
export function taReadout(m, i, fmt) {
  if (i < 0 || i >= m.n) return '';
  const f = fmt ?? ((x) => String(x));
  const parts = [`시 ${f(m.o[i])}`, `고 ${f(m.h[i])}`, `저 ${f(m.l[i])}`, `종 ${f(m.c[i])}`];
  if (fin(m.rsi[i])) parts.push(`RSI ${m.rsi[i].toFixed(1)}`);
  if (m.st.dir[i]) parts.push(`슈퍼트렌드 ${m.st.dir[i] === 'up' ? '상승 ▲' : '하락 ▼'}`);
  return parts.join(' · ');
}


/* ------------------------------ 운영자 기법 (2026-11-27) ------------------------------ */

/*
 * 운영자가 4시간봉에서 보는 순서를 그대로 계산한다.
 *   ① RSI 다이버전스가 먼저
 *   ② RSI 30 이하(침체)면 상승 쪽, 80 이상(과열)이면 하락 쪽 조건
 *   ③ RSI 20 이하 · 90 이상이면 더 강하게 본다
 *   ④ 슈퍼트렌드 전환은 그 뒤에 확인하는 후순위
 * 화면에는 '조건 충족' 이라고만 적는다 — 사고팔라는 말이 아니다(AGENTS.md 1절).
 */

/**
 * 기법 조건이 생긴 봉들.
 *   kind 'rsi' — RSI 가 30 이하(80 이상)로 들어간 첫 봉, 그 안에서 20 이하(90 이상)로 더 들어간 첫 봉(strong)
 *   kind 'div' — 다이버전스 피벗 봉. 오른쪽 5봉이 지나야 확인되므로 seenAt 이 따로 있다.
 * side 'up' 상승 쪽 · 'down' 하락 쪽. strong 은 그때 RSI 가 20 이하 · 90 이상.
 */
export function techEvents(m) {
  const ev = [];
  let low = false;
  let lowS = false;
  let high = false;
  let highS = false;
  for (let i = 0; i < m.n; i += 1) {
    const r = m.rsi[i];
    if (!fin(r)) { low = lowS = high = highS = false; continue; }
    const nLow = r <= TA_RSI_LOW;
    const nLowS = r <= TA_RSI_STRONG_LOW;
    const nHigh = r >= TA_RSI_HIGH;
    const nHighS = r >= TA_RSI_STRONG_HIGH;
    if (nLow && !low) ev.push({ i, seenAt: i, side: 'up', kind: 'rsi', strong: nLowS, rsi: r });
    else if (nLowS && !lowS) ev.push({ i, seenAt: i, side: 'up', kind: 'rsi', strong: true, rsi: r });
    if (nHigh && !high) ev.push({ i, seenAt: i, side: 'down', kind: 'rsi', strong: nHighS, rsi: r });
    else if (nHighS && !highS) ev.push({ i, seenAt: i, side: 'down', kind: 'rsi', strong: true, rsi: r });
    low = nLow; lowS = nLowS; high = nHigh; highS = nHighS;
  }
  for (const d of m.div) {
    const r = m.rsi[d.i];
    const up = d.kind === 'bull';
    ev.push({ i: d.i, seenAt: d.seenAt, side: up ? 'up' : 'down', kind: 'div', strong: up ? r <= TA_RSI_STRONG_LOW : r >= TA_RSI_STRONG_HIGH, rsi: r });
  }
  return ev.sort((a, b) => a.i - b.i || (a.kind === b.kind ? 0 : a.kind === 'div' ? 1 : -1));
}

const SIDE_TEXT = { up: '상승 쪽', down: '하락 쪽' };
const SIDE_GLYPH = { up: '▲', down: '▼' };

/**
 * 기법으로 본 지금(i 봉 기준, 기본은 마지막 봉).
 * 최근 TA_RECENT 봉 안에서 확인된 조건 중 가장 늦은 것을 고르고, 같은 쪽 조건이 겹치면 함께 적는다.
 * 그 뒤 같은 방향 슈퍼트렌드 전환이 있었는지를 후순위로 붙인다.
 */
export function techNow(m, i = m.n - 1) {
  const ev = techEvents(m).filter((e) => e.seenAt <= i && i - e.i <= TA_RECENT);
  const last = ev[ev.length - 1] ?? null;
  const ago = (k) => (i - k === 0 ? '이번 봉' : `${i - k}봉 전`);
  const r = m.rsi[i];
  const z = rsiZone(r);

  // ① 다이버전스
  const divs = ev.filter((e) => e.kind === 'div');
  const dv = divs[divs.length - 1];
  const rowDiv = {
    key: 'tdiv',
    name: '① RSI 다이버전스',
    value: dv ? `${TA_DIV_TEXT[dv.side === 'up' ? 'bull' : 'bear']} ${SIDE_GLYPH[dv.side]}` : `최근 ${TA_RECENT}봉 안에 없음`,
    dir: dv ? dv.side : null,
    note: dv ? `${ago(dv.i)} ${dv.side === 'up' ? '저점' : '고점'} · RSI ${dv.rsi.toFixed(1)} · ${TA_DIV.right}봉 뒤 확인` : '',
  };
  // ② RSI 구간
  const zDir = z === 'low' || z === 'strongLow' ? 'up' : z === 'high' || z === 'strongHigh' ? 'down' : null;
  const rowRsi = {
    key: 'trsi',
    name: `② RSI (${TA_RSI})`,
    value: z ? `${r.toFixed(1)} · ${TA_ZONE_TEXT[z]}${zDir ? ` ${SIDE_GLYPH[zDir]}` : ''}` : '아직 없음',
    dir: zDir,
    note: z ? '' : `${taBarUnit(m.tf)} ${TA_RSI + 1}개가 모여야 계산합니다`,
  };
  // ③ 슈퍼트렌드 — 후순위
  const stNow = m.st.dir[i];
  let stNote = '';
  let stValue = stNow ? TA_DIR_TEXT[stNow] : '아직 없음';
  let stDir = null;
  if (last) {
    const want = last.side;
    const f = m.st.flips.find((x) => x.i > last.i && x.i <= i && x.dir === want);
    if (f) {
      stValue = `조건 뒤 ${TA_FLIP_TEXT[want]}`;
      stDir = want;
      stNote = `조건에서 ${f.i - last.i}봉 뒤 · ${ago(f.i)}`;
    } else {
      stValue = `조건 뒤 아직 ${want === 'up' ? '상승' : '하락'} 전환 없음`;
      stNote = stNow ? `지금 ${TA_DIR_TEXT[stNow]}` : '';
    }
  }
  const rowSt = { key: 'tst', name: '③ 슈퍼트렌드 (후순위)', value: stValue, dir: stDir, note: stNote };

  // 결론 줄
  let head;
  let sub;
  if (last) {
    const same = ev.filter((e) => e.side === last.side);
    const kinds = [];
    if (same.some((e) => e.kind === 'rsi')) kinds.push(last.side === 'up' ? `RSI ${TA_RSI_LOW} 이하` : `RSI ${TA_RSI_HIGH} 이상`);
    if (same.some((e) => e.kind === 'div')) kinds.push(TA_DIV_TEXT[last.side === 'up' ? 'bull' : 'bear']);
    const strong = same.some((e) => e.strong);
    head = { side: last.side, text: `${SIDE_TEXT[last.side]} 조건 충족 ${SIDE_GLYPH[last.side]}`, strong };
    sub = `${kinds.join(' + ')} · ${ago(last.i)}${strong ? ` · RSI 가 ${last.side === 'up' ? `${TA_RSI_STRONG_LOW} 이하` : `${TA_RSI_STRONG_HIGH} 이상`}까지 가 강함` : ''}`;
  } else {
    head = { side: null, text: '기법 조건 없음', strong: false };
    sub = `최근 ${TA_RECENT}봉 안에 RSI ${TA_RSI_LOW} 이하 · ${TA_RSI_HIGH} 이상 · 다이버전스가 없습니다`;
  }
  return { head, sub, rows: [rowDiv, rowRsi, rowSt], last };
}

/* ------------------------------ 종목 찾기 ------------------------------ */

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
function chosung(text) {
  let out = '';
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    out += c >= 0xac00 && c <= 0xd7a3 ? CHO[Math.floor((c - 0xac00) / 588)] : ch;
  }
  return out;
}

/**
 * 이름 · 초성 · 코드로 찾기. assets: [{ id, name, code }]
 * 코드가 똑같으면 맨 위, 이름 앞부분 > 코드 앞부분 > 초성 앞부분 > 이름 가운데 > 초성 가운데. 같으면 짧은 이름이 위.
 */
export function taSearch(query, assets, limit = 8) {
  const raw = String(query ?? '').replace(/\s+/g, '');
  if (!raw) return [];
  const lc = raw.toLowerCase();
  const up = raw.toUpperCase();
  const onlyCho = /^[ㄱ-ㅎ]+$/.test(raw);
  const out = [];
  for (const a of assets) {
    const name = String(a.name).replace(/\s+/g, '').toLowerCase();
    const ini = chosung(String(a.name).replace(/\s+/g, ''));
    const code = String(a.code ?? '').toUpperCase();
    let sc = -1;
    if (code && code === up) sc = 100;
    else if (name.startsWith(lc)) sc = 80;
    else if (code && code.startsWith(up)) sc = 70;
    else if (onlyCho && ini.startsWith(raw)) sc = 60;
    else if (name.includes(lc)) sc = 40;
    else if (onlyCho && ini.includes(raw)) sc = 30;
    if (sc >= 0) out.push([sc - name.length / 1000, a]);
  }
  return out.sort((x, y) => y[0] - x[0]).slice(0, limit).map((x) => x[1]);
}

/** 보이는 구간 고르기 — [키, 이름, 봉 수] */
export const TA_RANGES = {
  '1d': [['3m', '3개월', 63], ['6m', '6개월', 126], ['1y', '1년', 252], ['2y', '2년', 504]],
  '4h': [['1m', '1개월', 44], ['3m', '3개월', 130], ['6m', '6개월', 260], ['1y', '1년', 504]],
};
export const TA_DEFAULT_RANGE = { '1d': '6m', '4h': '3m' };

/** 처음 여는 봉 단위 — 운영자는 4시간봉을 많이 본다 */
export const TA_DEFAULT_TF = '4h';

/** 차트 화면의 고정 문구 — 앱 · 미리보기가 같은 글을 쓴다 */
export const TA_TEXT = {
  title: '종목 차트',
  lede: '종목을 찾아 RSI · 다이버전스 · 슈퍼트렌드 · OBV · 이동평균 · 추세선을 한 화면에서 봅니다. 운영자 기법으로 지금 상태를 함께 적습니다. 지표의 상태를 보여 줄 뿐, 사고팔 때를 알려 주지 않습니다.',
  markNote: `● 는 운영자 기법 조건이 생긴 봉입니다 — 봉 아래는 상승 쪽(RSI ${TA_RSI_LOW} 이하 · 상승 다이버전스), 봉 위는 하락 쪽(RSI ${TA_RSI_HIGH} 이상 · 하락 다이버전스). 큰 원은 RSI ${TA_RSI_STRONG_LOW} 이하 · ${TA_RSI_STRONG_HIGH} 이상. 흐린 ▲ ▼ 는 슈퍼트렌드 전환(후순위). 지난 값으로 계산한 것이라 앞날을 말하지 않습니다.`,
  tallyNote: '지표가 한쪽으로 모였다는 것은 지금 상태일 뿐, 앞으로의 방향을 말하지 않습니다.',
  techTitle: '운영자 기법',
  techSteps: [
    `4시간봉을 주로 봅니다.`,
    `① RSI 다이버전스를 먼저 봅니다 — 가격 저점은 낮아졌는데 RSI 저점은 높아지면 상승 쪽, 반대면 하락 쪽.`,
    `② RSI 가 ${TA_RSI_LOW} 이하(침체)면 상승 쪽, ${TA_RSI_HIGH} 이상(과열)이면 하락 쪽으로 봅니다.`,
    `③ RSI 가 ${TA_RSI_STRONG_LOW} 아래나 ${TA_RSI_STRONG_HIGH} 위로 가면 더 강하게 봅니다.`,
    `④ 슈퍼트렌드 전환은 그 뒤에 확인하는 후순위입니다.`,
  ],
  techNote: '운영자가 차트를 읽는 순서를 그대로 계산했을 뿐, 사고팔 때를 알려 주거나 결과를 보장하지 않습니다. 조건이 맞아도 반대로 가는 일이 흔합니다.',
  searchHint: '이름 · 초성 · 코드로 찾습니다 — 테슬라, ㅌㅅㄹ, TSLA, 005930',
  codeHint: '목록에 없는 종목은 코드로 찾습니다 — 미국 TSLA, 한국 005930',
  methods: [
    ['슈퍼트렌드', `ATR(${TA_ST_ATR}) × ${TA_ST_MULT} 띠. 종가가 띠를 넘으면 방향이 바뀝니다. 선이 가격 아래면 상승 추세, 위면 하락 추세.`],
    ['이동평균', `최근 ${TA_MA.join(' · ')}봉 종가의 단순평균.`],
    ['추세선 (1년선)', `일봉 ${TA_TREND_DAYS}개(1년) 종가 평균 — 쫄탐지수가 지표를 견주는 기간과 같은 길이. 4시간봉에서는 전날까지의 1년선을 씁니다.`],
    ['RSI', `${TA_RSI}봉 동안 오른 폭과 내린 폭의 비율(와일더 방식). 운영자 기준으로 ${TA_RSI_HIGH} 이상을 과열, ${TA_RSI_LOW} 이하를 침체, ${TA_RSI_STRONG_HIGH} 이상 · ${TA_RSI_STRONG_LOW} 이하를 강한 과열 · 강한 침체로 부릅니다(흔한 기본값은 70 / 30).`],
    ['RSI 다이버전스', `RSI 저점(고점)을 좌우 ${TA_DIV.left}봉으로 찾고, 바로 앞 저점(고점)과 견줍니다(${TA_DIV.min}~${TA_DIV.max}봉 간격). 가격은 더 낮은 저점인데 RSI 는 더 높은 저점이면 상승 다이버전스, 반대면 하락 다이버전스. 오른쪽 ${TA_DIV.right}봉이 지나야 확인됩니다.`],
    ['OBV 오실레이터', `오른 봉의 거래량은 더하고 내린 봉의 거래량은 빼서 쌓은 OBV 에서, 그 ${TA_OBV_EMA}봉 지수평균을 뺀 값. 0 위면 최근 거래량이 오른 봉 쪽에 더 실렸다는 뜻.`],
  ],
  notIncluded: 'SignalMaster Pro · AI Moving Average 같은 유료 · 비공개 지표는 공식을 알 수 없어 넣지 않았습니다.',
};
