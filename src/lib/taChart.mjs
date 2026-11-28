/**
 * 종목 차트 그림 (2026-11-27) — 봉 · 이동평균 · 1년선 · 슈퍼트렌드 · 최근 기법 조건(세로 점선) / RSI · 다이버전스 / OBV 오실레이터.
 * 순수 함수로 SVG 글을 만든다. 앱(src/app/chart)과 미리보기(template.html, __TA_CHART__)가 같은 그림을 그린다.
 * import 를 두지 않는다 — 미리보기에 그대로 끼워 넣기 때문이다. 모델은 ta.mjs 의 taModel.
 *
 * 색만으로 뜻을 전하지 않는다(AGENTS.md 4절): 조건은 꼬리표 글(▲ 상승 / ▼ 하락), 선은 범례 글, 상태는 '지금 상태' 의 말.
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
  const R = 68;
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
  // 가격 칸 위 24px 는 '최근 기법 조건' 꼬리표 자리. 가격 아래 종목 쫄탐(2026-11-28) → RSI → OBV
  const P = { top: 32, h: 220 };
  // 2026-11-28 사용자: "밑에 보조 지표가 너무 꼴보기 싫은데 … 아래에는 한칸에다가 신호 표시만"
  // → 종목 쫄탐 · RSI · OBV 칸을 걷고 가격 아래 신호 줄 하나. 숫자는 줄 제목 · 누른 봉 상자 · '지금 상태' 에 글로
  const SG = { top: P.top + P.h + 26, h: 30 };
  const H = SG.top + SG.h + 24;

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

  // 고른 성향(방어적 · 공격적)의 기법 조건 봉 — 상승 쪽은 봉 아래 ▲, 하락 쪽은 봉 위 ▼ (2026-11-28).
  // 점(●)은 읽기 어렵다는 의견(2026-11-27)이 있어 쓰지 않는다. 강함(RSI 20 이하 · 90 이상)은 테두리를 두른다.
  const counts = { up: 0, down: 0 };
  for (const sg of opt.signals ?? []) {
    if (sg.i < from || sg.i > to || !fin(m.l[sg.i]) || !fin(m.h[sg.i])) continue;
    counts[sg.side] += 1;
    const xc = r1(x(sg.i));
    const isUp = sg.side === 'up';
    const yy = r1(isUp ? Math.min(P.top + P.h + 10, py(m.l[sg.i]) + 6) : Math.max(P.top - 2, py(m.h[sg.i]) - 6));
    const d = isUp ? `M${xc} ${yy}l5 9h-10Z` : `M${xc} ${yy}l5 -9h-10Z`;
    parts.push(`<path d="${d}" class="ta-sig${sg.strong ? ' ta-sig-strong' : ''}" style="fill:${isUp ? up : down}"/>`);
  }

  // 가장 최근 기법 조건 — 세로 점선 + 글자 꼬리표.
  // 슈퍼트렌드 전환은 선 색이 바뀌는 자리로 보인다.
  let marked = false;
  {
    const mk = opt.mark;
    if (mk && mk.i >= from && mk.i <= to) {
      marked = true;
      const xc = r1(x(mk.i));
      const col = mk.side === 'up' ? up : down;
      parts.push(`<line x1="${xc}" x2="${xc}" y1="${P.top - 4}" y2="${SG.top + SG.h}" class="ta-mark" style="stroke:${col}"/>`);
      const tw = 104;
      const tx = Math.max(L + tw / 2, Math.min(L + plotW - tw / 2, xc));
      parts.push(`<rect x="${r1(tx - tw / 2)}" y="4" width="${tw}" height="22" rx="11" style="fill:${col}"/>`);
      parts.push(`<text x="${r1(tx)}" y="19.5" text-anchor="middle" class="ta-mark-tag">${mk.side === 'up' ? '▲ 상승' : '▼ 하락'} 쪽 조건</text>`);
    }
  }

  // 마지막 값 표
  {
    const last = m.c[to];
    const yy = r1(Math.min(P.top + P.h - 8, Math.max(P.top + 8, py(last))));
    const col = m.c[to] >= m.o[to] ? up : down;
    parts.push(`<line x1="${L}" x2="${L + plotW}" y1="${yy}" y2="${yy}" class="ta-lastline" style="stroke:${col}"/>`);
    parts.push(`<rect x="${L + plotW + 2}" y="${yy - 11}" width="${R - 4}" height="22" rx="4" style="fill:${col}"/>`);
    parts.push(`<text x="${W - 5}" y="${yy + 5}" text-anchor="end" class="ta-lastval">${esc(price(last))}</text>`);
  }

  /* ---------- 신호 줄 (2026-11-28) ---------- */
  // 칠한 곳: 종목 쫄탐 20 이하 · RSI 30 이하(상승 쪽 색), 종목 쫄탐 80 이상 · RSI 80 이상(하락 쪽 색).
  // 하나면 옅게, 둘 다면 진하게. ▲ ▼ 는 다이버전스(피벗 봉). 값이 없는 봉은 칠하지 않는다(0 으로 보지 않음).
  const sv = m.score?.v ?? [];
  const sLo = opt.scoreLow ?? 20;
  const sHi = opt.scoreHigh ?? 80;
  const rLo = opt.rsiLow ?? 30;
  const rHi = opt.rsiHigh ?? 80;
  const obvNow = m.obv.ok ? m.obv.osc[to] : null;
  parts.push(`<text x="${L}" y="${SG.top - 8}" class="ta-ptitle">${esc(taSignalTitle(sv[to], m.rsi[to], obvNow))}</text>`);
  parts.push(`<rect x="${L}" y="${SG.top}" width="${plotW}" height="${SG.h}" class="ta-strip"/>`);
  {
    const level = (i) => {
      const sc = sv[i];
      const r = m.rsi[i];
      const u = (fin(sc) && sc <= sLo ? 1 : 0) + (fin(r) && r <= rLo ? 1 : 0);
      const dn = (fin(sc) && sc >= sHi ? 1 : 0) + (fin(r) && r >= rHi ? 1 : 0);
      return u > 0 ? `up${u}` : dn > 0 ? `down${dn}` : '';
    };
    let runStart = from;
    let runKey = '';
    const flush = (end) => {
      if (!runKey) return;
      const isUp = runKey.startsWith('up');
      const x0 = Math.max(L, x(runStart) - step / 2);
      const x1 = Math.min(L + plotW, x(end) + step / 2);
      parts.push(`<rect x="${r1(x0)}" y="${SG.top}" width="${r1(Math.max(1, x1 - x0))}" height="${SG.h}" class="ta-strip-on${runKey.endsWith('2') ? ' both' : ''}" style="fill:${isUp ? up : down}"/>`);
    };
    for (let i = from; i <= to; i += 1) {
      const k = level(i);
      if (k !== runKey) { flush(i - 1); runStart = i; runKey = k; }
    }
    flush(to);
  }
  let divCount = 0;
  for (const dv of m.div) {
    if (dv.i < from || dv.i > to) continue;
    divCount += 1;
    const col = dv.kind === 'bull' ? up : down;
    parts.push(`<text x="${r1(x(dv.i))}" y="${r1(SG.top + SG.h / 2 + 5)}" text-anchor="middle" class="ta-flip" style="fill:${col}">${dv.kind === 'bull' ? '▲' : '▼'}</text>`);
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
  // 누른 자리 — 세로선 · 숫자 상자 · 축 꼬리표가 여기 들어간다(taCrossSvg). 처음에는 비어 있다
  parts.push('<g class="ta-crossg"></g>');

  const label = `${opt.title ?? '종목 차트'} — 봉 ${count}개. 기법 조건 상승 쪽 ${counts.up}번 · 하락 쪽 ${counts.down}번. 가격 아래 신호 줄은 종목 쫄탐 · RSI 가 기준에 닿은 구간을 칠함. RSI 다이버전스 ${divCount}번${marked ? ', 가장 최근 기법 조건 자리 표시' : ''}. 같은 내용을 '지금 상태' 에서 글로 볼 수 있습니다.`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}" class="ta-svg">${parts.join('')}</svg>`;

  const legend = [
    ['ta-k-candle', '봉'],
    ['ta-k-ma1', `${m.ma[0]?.p ?? 20}선`],
    ['ta-k-ma2', `${m.ma[1]?.p ?? 60}선`],
    ['ta-k-trend', '1년선(추세선)'],
    ['ta-k-st', '슈퍼트렌드'],
    ...(counts.up + counts.down ? [['ta-k-sig', `▲▼ = 기법 조건${opt.profileText ? ` (${opt.profileText})` : ''}`]] : []),
    ...(marked ? [['ta-k-mark', '세로 점선 = 최근 기법 조건']] : []),
  ].map(([k, t]) => `<li class="${k}"><i aria-hidden="true"></i>${esc(t)}</li>`).join('');
  const countLine = `<p class="ta-count">보이는 구간${opt.profileText ? ` · ${esc(opt.profileText)}` : ''} · 상승 쪽 조건 ${counts.up}번 · 하락 쪽 조건 ${counts.down}번</p>` +
    `<p class="ta-count ta-strip-key">신호 줄 — 옅게: 종목 쫄탐 ${sLo} 이하 · ${sHi} 이상 또는 RSI ${rLo} 이하 · ${rHi} 이상 하나, 진하게: 둘 다 · ▲▼ 다이버전스</p>`;

  return {
    html: `<ul class="ta-legend">${legend}</ul>${svg}${countLine}`,
    layout: { L, R, step, from, to, W, H, P, SG, lo, hi },
    counts,
  };
}

/** 신호 줄 제목 — "신호 · 쫄탐 31 · RSI 53.8 · OBV ＋". 값이 없으면 '—' */
export function taSignalTitle(score, rsiV, obvV) {
  return `신호 · 쫄탐 ${fin(score) ? Math.round(score) : '—'} · RSI ${fin(rsiV) ? rsiV.toFixed(1) : '—'} · OBV ${fin(obvV) ? (obvV > 0 ? '＋' : obvV < 0 ? '－' : '0') : '—'}`;
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


/**
 * 검색 추천 — list 는 ta.mjs 의 taSearch 결과, code 는 목록에 없을 때 코드로 찾기(없으면 null).
 * 단추마다 data-ta-pick(목록 id) 또는 data-ta-code(코드).
 */
export function taSuggestHtml(list, code) {
  const items = list.map((a) =>
    `<li><button type="button" data-ta-pick="${esc(a.id)}"><b>${esc(a.name)}</b><span>${esc(a.code ?? '')}</span></button></li>`);
  if (code) items.push(`<li><button type="button" data-ta-code="${esc(code)}"><b>코드 ${esc(code)} 로 찾기</b><span>목록에 없는 종목</span></button></li>`);
  return items.length ? `<ul class="ta-sug" role="list">${items.join('')}</ul>` : '';
}

/** 자주 보는 종목 단추 — items: [{ id, name }], current: 지금 고른 id */
export function taQuickHtml(items, current) {
  return `<div class="ta-quick" role="group" aria-label="자주 보는 종목">${items.map((a) =>
    `<button type="button" data-ta-pick="${esc(a.id)}" aria-pressed="${a.id === current}">${esc(a.name)}</button>`).join('')}</div>`;
}

/**
 * '지금 상태' 판 — board 는 ta.mjs 의 taBoard. 결론 한 줄과 큰 숫자 칸 여섯(2열).
 * 결론은 '조건 충족' 으로만 적는다 — 사고팔라는 말이 아니다. 칸마다 ▲ ▼ 와 말이 같이 있고, 색은 덧붙일 뿐이다.
 */
export function taBoardHtml(board) {
  const v = board.verdict;
  const vc = v.side ? ` style="color:var(--ta-${v.side === 'up' ? 'up' : 'down'})"` : '';
  const tile = (t) => {
    const col = t.dir ? ` style="color:var(--ta-${t.dir === 'up' ? 'up' : 'down'})"` : '';
    const sub = t.sub;
    const scol = sub && sub.dir ? ` style="color:var(--ta-${sub.dir === 'up' ? 'up' : 'down'})"` : '';
    const aria = `${t.label}: ${t.big}, ${t.cap}${sub ? `. ${sub.big}, ${sub.cap}` : ''}${t.note ? `. 재료 ${t.note}` : ''}`;
    return `<div class="ta-tile" data-k="${esc(t.key)}" role="group" aria-label="${esc(aria)}">` +
      `<span class="ta-tl">${esc(t.label)}</span><b class="ta-big"${col}>${esc(t.big)}</b>` +
      (fin(t.rsi) && t.bands ? rsiBar(t.rsi, t.bands) : '') +
      `<span class="ta-cap">${esc(t.cap)}</span>` +
      (sub ? `<b class="ta-sub"${scol}>${esc(sub.big)}</b><span class="ta-cap">${esc(sub.cap)}</span>` : '') +
      (t.note ? `<span class="ta-parts">${esc(t.note)}</span>` : '') + '</div>';
  };
  return `<div class="ta-board"><div class="ta-verdict" data-side="${v.side ?? 'none'}">` +
    `<p class="ta-vhead"><b${vc}>${esc(v.text)}</b>${v.strong ? '<span class="ta-strong">강함</span>' : ''}</p>` +
    `<p class="ta-vsub">${esc(v.sub)}</p></div>` +
    `<div class="ta-tiles">${board.tiles.map(tile).join('')}</div></div>`;
}

/** RSI 막대 — 0 · 강한 침체 · 침체 · 중간 · 과열 · 강한 과열 · 100, 지금 값에 눈금. 종목 쫄탐은 20 · 80 두 경계만 쓴다 */
function rsiBar(r, bands) {
  const [sl, l, h, sh] = bands;
  const seg = [['sl', sl], ['l', l - sl], ['m', h - l], ['h', sh - h], ['sh', 100 - sh]];
  const pos = Math.max(0, Math.min(100, r));
  return `<div class="ta-rsibar" aria-hidden="true">${seg.map(([c, w]) => `<i class="${c}" style="width:${w}%"></i>`).join('')}` +
    `<em style="left:${r1(pos)}%"></em></div>`;
}

/**
 * 누른 봉의 숫자 — 세로선, 종가 자리의 작은 점과 오른쪽 축 꼬리표, 숫자 상자(손가락 반대쪽).
 * 2026-11-28 보조 칸을 신호 줄 하나로 줄이면서 종목 쫄탐 · RSI · OBV 는 상자의 줄로만 보인다.
 * 2026-11-27 사용자: "차트에서 그래프나 누르는 곳에 숫자 나오게". 앱 · 미리보기가 '.ta-crossg' 에 그대로 넣는다.
 * 값이 없으면 0 이 아니라 '없음'.
 */
export function taCrossSvg(m, layout, i, opt = {}) {
  if (!layout || !(i >= layout.from && i <= layout.to && i >= 0 && i < m.n)) return '';
  const { L, R, step, from, W, P, SG, lo, hi } = layout;
  const plotW = W - L - R;
  const x = r1(L + (i - from + 0.5) * step);
  const py = (v) => P.top + (1 - (v - lo) / (hi - lo)) * P.h;
  const clampY = (y, top, h) => Math.max(top + 11, Math.min(top + h - 11, y));
  const price = opt.price ?? ((v) => String(v));
  const up = opt.up ?? 'var(--ta-up)';
  const down = opt.down ?? 'var(--ta-down)';
  const none = '없음';
  const parts = [];

  parts.push(`<line x1="${x}" x2="${x}" y1="${P.top}" y2="${SG.top + SG.h}" class="ta-cross"/>`);

  // 종가 — 점과 오른쪽 축 꼬리표
  const c = m.c[i];
  if (fin(c)) {
    parts.push(`<circle cx="${x}" cy="${r1(py(c))}" r="3.5" class="ta-cross-dot"/>`);
    const yy = r1(clampY(py(c), P.top, P.h));
    parts.push(`<rect x="${L + plotW + 2}" y="${yy - 11}" width="${R - 4}" height="22" rx="4" class="ta-cross-tag"/>`);
    parts.push(`<text x="${W - 5}" y="${yy + 5}" text-anchor="end" class="ta-cross-tagt">${esc(price(c))}</text>`);
  }
  const sc = m.score?.v[i];
  const r = m.rsi[i];
  const ob = m.obv.ok ? m.obv.osc[i] : null;

  // 숫자 상자
  const pc = i > 0 ? m.c[i - 1] : null;
  const chg = fin(c) && fin(pc) && pc !== 0 ? ((c - pc) / pc) * 100 : null;
  const chgText = chg === null ? '' : ` ${chg > 0 ? '▲' : chg < 0 ? '▼' : ''}${Math.abs(chg).toFixed(2)}%`;
  const st = m.st.dir[i];
  const val = (v) => (fin(v) ? price(v) : none);
  const rows = [
    ['종가', `${val(c)}${chgText}`, chg > 0 ? up : chg < 0 ? down : null],
    ['시가', val(m.o[i]), null],
    ['고 · 저', `${val(m.h[i])} · ${val(m.l[i])}`, null],
    ['종목 쫄탐', fin(sc) ? String(Math.round(sc)) : none, null],
    ['RSI', fin(r) ? r.toFixed(1) : none, null],
    ['OBV', fin(ob) ? (ob > 0 ? '＋ 우세' : ob < 0 ? '－ 우세' : '0') : none, null],
    ['슈퍼트렌드', st ? `${st === 'up' ? '▲' : '▼'} ${val(m.st.line[i])}` : none, st === 'up' ? up : st === 'down' ? down : null],
    [`${m.ma[0]?.p ?? 20}선`, val(m.ma[0]?.v[i]), null],
    [`${m.ma[1]?.p ?? 60}선`, val(m.ma[1]?.v[i]), null],
    ['1년선', val(m.trend[i]), null],
  ];
  const bw = Math.min(200, plotW - 12);
  const rh = 18;
  const bh = 12 + 20 + rows.length * rh;
  const bx = r1(x > L + plotW / 2 ? L + 6 : L + plotW - 6 - bw);
  const by = P.top + 4;
  parts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="8" class="ta-tip"/>`);
  parts.push(`<text x="${r1(bx + 10)}" y="${by + 20}" class="ta-tip-h">${esc(opt.stamp ? opt.stamp(m.t[i]) : '')}</text>`);
  rows.forEach(([k, v, col], n) => {
    const yy = by + 20 + (n + 1) * rh;
    parts.push(`<text x="${r1(bx + 10)}" y="${yy}" class="ta-tip-l">${esc(k)}</text>`);
    parts.push(`<text x="${r1(bx + bw - 10)}" y="${yy}" text-anchor="end" class="ta-tip-v"${col ? ` style="fill:${col}"` : ''}>${esc(v)}</text>`);
  });
  return parts.join('');
}
