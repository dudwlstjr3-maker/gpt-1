/**
 * 참고 차트 그림 (2026-11-27) — 봉 · 이동평균 · 1년선 · 슈퍼트렌드 · 전환 표시 / RSI · 다이버전스 / OBV 오실레이터.
 * 순수 함수로 SVG 글을 만든다. 앱(src/app/ref)과 미리보기(template.html, __TA_CHART__)가 같은 그림을 그린다.
 * import 를 두지 않는다 — 미리보기에 그대로 끼워 넣기 때문이다. 모델은 ta.mjs 의 taModel.
 *
 * 색만으로 뜻을 전하지 않는다(AGENTS.md 4절): 전환은 ▲ / ▼ 모양, 선은 범례 글, 상태는 '지금 상태' 표의 말.
 * 글자는 12px 아래로 내리지 않는다.
 */

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const r1 = (x) => Math.round(x * 10) / 10;

/** 보기 좋은 눈금 */
function ticks(min, max, count) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= raw) ?? 10 * pow;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(v);
  return out;
}

/** 값 배열 → 이어진 선(끊긴 자리는 새로 시작) */
function linePath(vals, from, to, x, y) {
  let d = '';
  let pen = false;
  for (let i = from; i <= to; i += 1) {
    const v = vals[i];
    if (!fin(v)) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${r1(x(i))} ${r1(y(v))}`;
    pen = true;
  }
  return d;
}

/**
 * m: taModel, opt: {
 *   from, to: 보이는 봉 구간(포함), width: 그림 폭(px),
 *   up, down: 오름 · 내림 색 (기본 var(--ta-up) · var(--ta-down) — 등락 색 설정을 따른다),
 *   price(x): 가격 글, date(t): 날짜 글,
 * }
 * 돌려주는 것: { html, layout } — layout 은 손가락으로 짚은 자리를 봉으로 바꿀 때 쓴다(taIndexAt).
 */
export function taChartHtml(m, opt) {
  const W = Math.max(280, Math.round(opt.width));
  const L = 8;
  const R = 62;
  const plotW = W - L - R;
  const from = Math.max(0, opt.from);
  const to = Math.min(m.n - 1, opt.to);
  const count = Math.max(1, to - from + 1);
  const step = plotW / count;
  const x = (i) => L + (i - from + 0.5) * step;
  // 오름 · 내림 색 — 화면 뿌리(.ta)에 등락 색 설정을 --ta-up / --ta-down 으로 걸어 둔다
  const up = opt.up ?? 'var(--ta-up)';
  const down = opt.down ?? 'var(--ta-down)';
  const price = opt.price ?? ((v) => String(v));
  const date = opt.date ?? ((t) => new Date(t).toISOString().slice(5, 10));

  // 패널 자리
  const P = { top: 8, h: 220 };
  const RS = { top: P.top + P.h + 26, h: 84 };
  const OB = { top: RS.top + RS.h + 26, h: 64 };
  const H = OB.top + OB.h + 24;

  /* ---------- 가격 패널 ---------- */
  let lo = Infinity;
  let hi = -Infinity;
  const take = (v) => { if (fin(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } };
  for (let i = from; i <= to; i += 1) {
    take(m.l[i]); take(m.h[i]);
    for (const a of m.ma) take(a.v[i]);
    take(m.trend[i]); take(m.st.line[i]);
  }
  if (!fin(lo)) { lo = 0; hi = 1; }
  const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.01 || 1;
  lo -= pad; hi += pad;
  const py = (v) => P.top + (1 - (v - lo) / (hi - lo)) * P.h;

  const parts = [];
  const tickVals = ticks(lo, hi, 4);
  // 눈금선 · 오른쪽 가격 글
  for (const v of tickVals) {
    const yy = r1(py(v));
    parts.push(`<line x1="${L}" x2="${L + plotW}" y1="${yy}" y2="${yy}" class="ta-grid"/>`);
    parts.push(`<text x="${W - 4}" y="${yy + 4}" text-anchor="end" class="ta-axis">${esc(price(v))}</text>`);
  }

  // 봉 — 오름 · 내림을 한 경로씩
  const bw = Math.max(1, step * 0.64);
  let bodyUp = '';
  let bodyDn = '';
  let wickUp = '';
  let wickDn = '';
  for (let i = from; i <= to; i += 1) {
    const isUp = m.c[i] >= m.o[i];
    const xc = r1(x(i));
    const top = py(Math.max(m.o[i], m.c[i]));
    const bot = py(Math.min(m.o[i], m.c[i]));
    const body = `M${r1(xc - bw / 2)} ${r1(top)}h${r1(bw)}v${r1(Math.max(1, bot - top))}h${r1(-bw)}Z`;
    const wick = `M${xc} ${r1(py(m.h[i]))}V${r1(py(m.l[i]))}`;
    if (isUp) { bodyUp += body; wickUp += wick; } else { bodyDn += body; wickDn += wick; }
  }
  parts.push(`<path d="${wickUp}" class="ta-wick" style="stroke:${up}"/>`);
  parts.push(`<path d="${wickDn}" class="ta-wick" style="stroke:${down}"/>`);
  parts.push(`<path d="${bodyUp}" style="fill:${up}"/>`);
  parts.push(`<path d="${bodyDn}" style="fill:${down}"/>`);

  // 이동평균 · 1년선
  const maCls = ['ta-ma1', 'ta-ma2'];
  m.ma.forEach((a, k) => {
    const d = linePath(a.v, from, to, x, py);
    if (d) parts.push(`<path d="${d}" class="ta-line ${maCls[k] ?? 'ta-ma2'}"/>`);
  });
  {
    const d = linePath(m.trend, from, to, x, py);
    if (d) parts.push(`<path d="${d}" class="ta-line ta-trend"/>`);
  }

  // 슈퍼트렌드 — 방향마다 끊어서 그린다
  {
    let dUp = '';
    let dDn = '';
    let prev = null;
    for (let i = from; i <= to; i += 1) {
      const v = m.st.line[i];
      const dir = m.st.dir[i];
      if (!fin(v) || !dir) { prev = null; continue; }
      const seg = `${prev === dir ? 'L' : 'M'}${r1(x(i))} ${r1(py(v))}`;
      if (dir === 'up') dUp += seg; else dDn += seg;
      prev = dir;
    }
    if (dUp) parts.push(`<path d="${dUp}" class="ta-line ta-st" style="stroke:${up}"/>`);
    if (dDn) parts.push(`<path d="${dDn}" class="ta-line ta-st" style="stroke:${down}"/>`);
  }

  // 전환 표시 ▲ / ▼ — 상승 전환은 봉 아래, 하락 전환은 봉 위
  let flipCount = 0;
  for (const f of m.st.flips) {
    if (f.i < from || f.i > to) continue;
    flipCount += 1;
    const xc = r1(x(f.i));
    if (f.dir === 'up') {
      const yy = r1(Math.min(P.top + P.h - 2, py(m.l[f.i]) + 14));
      parts.push(`<text x="${xc}" y="${yy}" text-anchor="middle" class="ta-flip" style="fill:${up}">▲</text>`);
    } else {
      const yy = r1(Math.max(P.top + 12, py(m.h[f.i]) - 5));
      parts.push(`<text x="${xc}" y="${yy}" text-anchor="middle" class="ta-flip" style="fill:${down}">▼</text>`);
    }
  }

  // 마지막 값 표
  {
    const last = m.c[to];
    const yy = r1(Math.min(P.top + P.h - 8, Math.max(P.top + 8, py(last))));
    const col = m.c[to] >= m.o[to] ? up : down;
    parts.push(`<line x1="${L}" x2="${L + plotW}" y1="${yy}" y2="${yy}" class="ta-lastline" style="stroke:${col}"/>`);
    parts.push(`<rect x="${L + plotW + 2}" y="${yy - 9}" width="${R - 4}" height="18" rx="3" style="fill:${col}"/>`);
    parts.push(`<text x="${W - 4}" y="${yy + 4}" text-anchor="end" class="ta-lastval">${esc(price(last))}</text>`);
  }

  /* ---------- RSI 패널 ---------- */
  const ry = (v) => RS.top + (1 - v / 100) * RS.h;
  parts.push(`<text x="${L}" y="${RS.top - 8}" class="ta-ptitle">RSI 14${fin(m.rsi[to]) ? ` · ${m.rsi[to].toFixed(1)}` : ''}</text>`);
  parts.push(`<rect x="${L}" y="${r1(ry(70))}" width="${plotW}" height="${r1(ry(30) - ry(70))}" class="ta-band"/>`);
  for (const v of [70, 30]) {
    parts.push(`<line x1="${L}" x2="${L + plotW}" y1="${r1(ry(v))}" y2="${r1(ry(v))}" class="ta-ref"/>`);
    parts.push(`<text x="${W - 4}" y="${r1(ry(v)) + 4}" text-anchor="end" class="ta-axis">${v}</text>`);
  }
  {
    const d = linePath(m.rsi, from, to, x, ry);
    if (d) parts.push(`<path d="${d}" class="ta-line ta-rsi"/>`);
  }
  // 다이버전스 — 두 피벗을 잇는 점선과 ▲ / ▼
  let divCount = 0;
  for (const dv of m.div) {
    if (dv.i < from || dv.from < from || dv.i > to) continue;
    divCount += 1;
    const col = dv.kind === 'bull' ? up : down;
    parts.push(`<line x1="${r1(x(dv.from))}" y1="${r1(ry(m.rsi[dv.from]))}" x2="${r1(x(dv.i))}" y2="${r1(ry(m.rsi[dv.i]))}" class="ta-div" style="stroke:${col}"/>`);
    const yy = dv.kind === 'bull' ? Math.min(RS.top + RS.h + 12, ry(m.rsi[dv.i]) + 14) : Math.max(RS.top - 1, ry(m.rsi[dv.i]) - 5);
    parts.push(`<text x="${r1(x(dv.i))}" y="${r1(yy)}" text-anchor="middle" class="ta-flip" style="fill:${col}">${dv.kind === 'bull' ? '▲' : '▼'}</text>`);
  }

  /* ---------- OBV 패널 ---------- */
  if (m.obv.ok) {
    let amax = 0;
    for (let i = from; i <= to; i += 1) { const v = m.obv.osc[i]; if (fin(v)) amax = Math.max(amax, Math.abs(v)); }
    const oy = (v) => OB.top + OB.h / 2 - (amax ? (v / amax) * (OB.h / 2) : 0);
    const now = m.obv.osc[to];
    parts.push(`<text x="${L}" y="${OB.top - 8}" class="ta-ptitle">OBV 오실레이터${fin(now) ? ` · ${now > 0 ? '＋' : now < 0 ? '－' : '0'}` : ''}</text>`);
    parts.push(`<line x1="${L}" x2="${L + plotW}" y1="${r1(oy(0))}" y2="${r1(oy(0))}" class="ta-ref"/>`);
    parts.push(`<text x="${W - 4}" y="${r1(oy(0)) + 4}" text-anchor="end" class="ta-axis">0</text>`);
    // 0 위 · 아래를 막대로 — 위는 오름 색, 아래는 내림 색. 부호는 제목의 ＋ / － 로도 적는다.
    let pos = '';
    let neg = '';
    const ow = Math.max(1, step * 0.8);
    for (let i = from; i <= to; i += 1) {
      const v = m.obv.osc[i];
      if (!fin(v) || v === 0) continue;
      const y0 = oy(0);
      const y1 = oy(v);
      const seg = `M${r1(x(i) - ow / 2)} ${r1(Math.min(y0, y1))}h${r1(ow)}v${r1(Math.max(0.5, Math.abs(y1 - y0)))}h${r1(-ow)}Z`;
      if (v > 0) pos += seg; else neg += seg;
    }
    if (pos) parts.push(`<path d="${pos}" style="fill:${up}" class="ta-obv"/>`);
    if (neg) parts.push(`<path d="${neg}" style="fill:${down}" class="ta-obv"/>`);
  } else {
    parts.push(`<text x="${L}" y="${OB.top - 8}" class="ta-ptitle">OBV 오실레이터</text>`);
    parts.push(`<text x="${L}" y="${OB.top + OB.h / 2 + 4}" class="ta-axis">${esc(m.obv.reason)}</text>`);
  }

  /* ---------- 날짜 ---------- */
  {
    const n = 4;
    for (let k = 0; k < n; k += 1) {
      const i = Math.round(from + ((count - 1) * (k + 0.5)) / n);
      parts.push(`<text x="${r1(x(i))}" y="${H - 6}" text-anchor="middle" class="ta-axis">${esc(date(m.t[i]))}</text>`);
    }
  }

  // 손가락으로 짚은 자리 — 처음에는 숨긴다
  parts.push(`<line x1="0" x2="0" y1="${P.top}" y2="${OB.top + OB.h}" class="ta-cross" visibility="hidden"/>`);

  const label = `${opt.title ?? '참고 차트'} — 봉 ${count}개. 슈퍼트렌드 전환 ${flipCount}번, RSI 다이버전스 ${divCount}번. 같은 내용을 아래 '지금 상태' 표에서 글로 볼 수 있습니다.`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}" class="ta-svg">${parts.join('')}</svg>`;

  const legend = [
    ['ta-k-candle', '봉'],
    ['ta-k-ma1', `${m.ma[0]?.p ?? 20}선`],
    ['ta-k-ma2', `${m.ma[1]?.p ?? 60}선`],
    ['ta-k-trend', '1년선(추세선)'],
    ['ta-k-st', '슈퍼트렌드'],
    ['ta-k-flip', '▲ 상승 전환 · ▼ 하락 전환'],
  ].map(([k, t]) => `<li class="${k}"><i aria-hidden="true"></i>${esc(t)}</li>`).join('');

  return {
    html: `<ul class="ta-legend">${legend}</ul>${svg}`,
    layout: { L, step, from, to, W, H },
  };
}

/** 그림 위 x(px, 그림 왼쪽 기준) → 봉 번호 */
export function taIndexAt(layout, px) {
  const k = Math.floor((px - layout.L) / layout.step);
  return Math.max(layout.from, Math.min(layout.to, layout.from + k));
}

/** 봉 번호 → 그림 위 x */
export function taXOf(layout, i) {
  return layout.L + (i - layout.from + 0.5) * layout.step;
}

/**
 * '지금 상태' 표 — rows 는 ta.mjs 의 taSummary, tally 는 taTallyText.
 * 방향 있는 줄은 값에 ▲ ▼ 와 말이 같이 있고, 색은 덧붙일 뿐이다.
 */
export function taSummaryHtml(rows, tally) {
  const li = rows.map((r) =>
    `<li data-k="${esc(r.key)}"><span class="ta-n">${esc(r.name)}</span>` +
    `<span class="ta-v"${r.dir ? ` style="color:var(--ta-${r.dir === 'up' ? 'up' : 'down'})"` : ''}>${esc(r.value)}</span>` +
    (r.note ? `<span class="ta-s">${esc(r.note)}</span>` : '') + '</li>').join('');
  return `<ul class="ta-sum">${li}</ul><p class="ta-tally">${esc(tally)}</p>`;
}

/* ------------------------------ 글 모양 ------------------------------ */

/** 가격 글 — 소수 자리를 고정한다 */
export function taPrice(precision) {
  const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision });
  return (v) => (fin(v) ? nf.format(v) : '—');
}

/** 거래소 시간대 — 날짜 · 시각은 거래소 기준으로 적는다(미국 동부 · 서울) */
function partsIn(market) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: market === 'kr' ? 'Asia/Seoul' : 'America/New_York',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return (t) => Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
}

/** 아래 축 날짜 — 1년이 넘으면 '26.3'(연.월), 아니면 '11.26'(월.일) */
export function taAxisDate(tf, spanBars, market) {
  const p = partsIn(market);
  return (t) => {
    const x = p(t);
    return tf === '1d' && spanBars > 300 ? `${x.year.slice(2)}.${x.month}` : `${x.month}.${x.day}`;
  };
}

/** 짚은 봉의 날짜 — 일봉 '2026.11.26', 4시간봉 '11.26 13:30' */
export function taStamp(tf, market) {
  const p = partsIn(market);
  return (t) => {
    const x = p(t);
    return tf === '1d' ? `${x.year}.${x.month}.${x.day}` : `${x.month}.${x.day} ${x.hour}:${x.minute}`;
  };
}
