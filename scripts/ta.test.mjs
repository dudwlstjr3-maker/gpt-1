/**
 * 종목 차트 지표 · 운영자 기법 · 찾기 — src/lib/ta.mjs
 * 공식이 공개된 지표만, 트레이딩뷰 기본값과 같은 계산인지 본다. 매수 · 매도 말이 섞이지 않는지도.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sma, ema, rsi, supertrend, obvOsc, pivots, rsiDivergence, toFourHour, trendForBars,
  taModel, taSummary, taTally, taTallyText, taReadout, rsiZone, taParseCode, techEvents, techNow, taSearch, taBoard,
  TA_TREND_DAYS, TA_TEXT, TA_RANGES, TA_DEFAULT_RANGE,
} from '../src/lib/ta.mjs';
import { TREND_MA_DAYS } from '../src/lib/overlays.mjs';

const close = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;

test('추세선 길이는 홈 칩과 같은 1년(252거래일)', () => {
  assert.equal(TA_TREND_DAYS, TREND_MA_DAYS);
});

test('평균은 n 개가 모인 뒤부터 — 앞자리를 0 으로 채우지 않는다', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  // EMA 는 첫 n 개 단순평균에서 시작, 그다음 2/(n+1)
  const e = ema([1, 2, 3, 4], 3);
  assert.deepEqual(e.slice(0, 3), [null, null, 2]);
  assert.equal(e[3], 0.5 * 4 + 0.5 * 2);
  // 중간에 값이 빠지면 거기서 다시 모은다 — 빈자리를 메우지 않는다
  assert.deepEqual(sma([1, 2, null, 4, 5], 2), [null, 1.5, null, null, 4.5]);
});

test('RSI(14) — 와일더 교재 예제와 같은 값', () => {
  // StockCharts 'RSI' 해설의 계산표 (첫 값 70.46, 이어서 66.25 · 66.48 · 69.35 · 66.29).
  // 본문에 적힌 70.53 은 평균을 0.24 · 0.10 으로 반올림한 뒤 낸 값이라 조금 다르다.
  const c = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28,
    46.00, 46.03, 46.41, 46.22];
  const r = rsi(c, 14);
  assert.equal(r[13], null);
  assert.ok(close(r[14], 70.46, 0.01), `첫 RSI ${r[14]}`);
  assert.ok(close(r[15], 66.25, 0.01), `${r[15]}`);
  assert.ok(close(r[16], 66.48, 0.01), `${r[16]}`);
  assert.ok(close(r[17], 69.35, 0.01), `${r[17]}`);
  assert.ok(close(r[18], 66.29, 0.01), `${r[18]}`);
});

test('RSI 끝값 — 오르기만 하면 100, 내리기만 하면 0, 그대로면 50', () => {
  const up = Array.from({ length: 20 }, (_, i) => 10 + i);
  assert.equal(rsi(up).at(-1), 100);
  assert.equal(rsi([...up].reverse()).at(-1), 0);
  assert.equal(rsi(new Array(20).fill(5)).at(-1), 50);
  // 운영자 기준 — 80 과열 · 30 침체, 90 · 20 은 강함. 흔한 기본값 70 은 아직 '중간'
  assert.equal(rsiZone(70), 'mid');
  assert.equal(rsiZone(80), 'high');
  assert.equal(rsiZone(90), 'strongHigh');
  assert.equal(rsiZone(30), 'low');
  assert.equal(rsiZone(20), 'strongLow');
  assert.equal(rsiZone(50), 'mid');
  assert.equal(rsiZone(null), null);
});

/** 오르다 내리는 가짜 봉 */
function wave(n, f) {
  const c = Array.from({ length: n }, (_, i) => f(i));
  return { h: c.map((x) => x + 1), l: c.map((x) => x - 1), c };
}

test('슈퍼트렌드 — 오르는 구간은 상승, 꺾이면 하락 전환, 다시 오르면 상승 전환', () => {
  const { h, l, c } = wave(120, (i) => (i < 40 ? 100 + i : i < 80 ? 140 - (i - 40) * 1.5 : 80 + (i - 80) * 1.5));
  const st = supertrend(h, l, c, 10, 3);
  assert.equal(st.dir[8], null, 'ATR 10 이 모이기 전에는 방향이 없다');
  assert.equal(st.dir[39], 'up');
  assert.equal(st.dir[79], 'down');
  assert.equal(st.dir[119], 'up');
  assert.deepEqual(st.flips.map((f) => f.dir).slice(-2), ['down', 'up']);
  // 상승일 때 선은 가격 아래, 하락일 때 위
  assert.ok(st.line[39] < c[39]);
  assert.ok(st.line[79] > c[79]);
  // 전환 봉은 방향이 실제로 바뀐 자리
  for (const f of st.flips) assert.notEqual(st.dir[f.i - 1], st.dir[f.i]);
});

test('OBV 오실레이터 — 오른 봉 거래량은 더하고 내린 봉은 뺀다, 빠진 거래량은 메우지 않는다', () => {
  const c = [10, 11, 10, 10, 12];
  const v = [100, 50, 30, 999, 20];
  const o = obvOsc(c, v, 2);
  assert.ok(o.ok);
  // OBV = 0, 50, 20, 20, 40 · EMA(2) 는 [_, 25, 21.67, 20.56, 33.52]
  assert.equal(o.osc[0], null);
  assert.ok(close(o.osc[1], 25, 1e-9));
  assert.ok(close(o.osc[4], 40 - (2 / 3 * 40 + 1 / 3 * (2 / 3 * 20 + 1 / 3 * (2 / 3 * 20 + 1 / 3 * 25))), 1e-9));

  const gap = obvOsc(c, [100, null, 30, 1, 2], 2);
  assert.equal(gap.ok, false);
  assert.match(gap.reason, /빠진 봉이 1개/);
  const zero = obvOsc(c, [0, 0, 0, 0, 0], 2);
  assert.equal(zero.ok, false);
  assert.match(zero.reason, /거래량을 주지 않습니다/);
});

test('피벗은 좌우 n 봉보다 낮은(높은) 봉 — 오른쪽이 다 모이지 않으면 아직 아니다', () => {
  const v = [5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5, 4, 3];
  assert.deepEqual(pivots(v, 'low', 5, 5), [5]);
  assert.deepEqual(pivots(v, 'high', 5, 5), []);
  assert.deepEqual(pivots([5, 4, 3, 2, 1, 0, 1, 2, 3], 'low', 5, 5), [], '오른쪽 5봉이 모자라면 확인 전');
});

test('RSI 다이버전스 — 가격 저점은 낮아지고 RSI 저점은 높아지면 상승, 고점은 그 반대면 하락', () => {
  const n = 40;
  const r = new Array(n).fill(50);
  const low = new Array(n).fill(100);
  const high = new Array(n).fill(110);
  // 상승: 저점 10 → 25, RSI 30 → 35, 가격 90 → 85
  r[10] = 30; low[10] = 90;
  r[25] = 35; low[25] = 85;
  const d = rsiDivergence(r, low, high);
  assert.deepEqual(d, [{ i: 25, from: 10, kind: 'bull', seenAt: 30 }]);

  // 가격도 높은 저점이면 다이버전스가 아니다
  low[25] = 95;
  assert.deepEqual(rsiDivergence(r, low, high), []);

  // 하락: RSI 고점 75 → 70, 가격 고점 120 → 125
  const r2 = new Array(n).fill(50);
  const h2 = new Array(n).fill(110);
  r2[8] = 75; h2[8] = 120;
  r2[20] = 70; h2[20] = 125;
  assert.deepEqual(rsiDivergence(r2, new Array(n).fill(100), h2), [{ i: 20, from: 8, kind: 'bear', seenAt: 25 }]);

  // 간격이 60봉을 넘으면 견주지 않는다
  const r3 = new Array(100).fill(50);
  const l3 = new Array(100).fill(100);
  r3[10] = 30; l3[10] = 90; r3[80] = 35; l3[80] = 85;
  assert.deepEqual(rsiDivergence(r3, l3, new Array(100).fill(110)), []);
});

test('1시간봉 → 4시간봉: 미국은 9:30~13:30 · 13:30~16:00, 날이 바뀌면 다시 센다', () => {
  // 미국 동부 표준시(UTC−5) 9:30 = 14:30Z. 하루 7개.
  const off = -5 * 3600;
  const day = (d) => Date.UTC(2026, 10, d, 14, 30);
  const hours = [];
  for (const d of [24, 25]) {
    for (let k = 0; k < 7; k += 1) {
      const p = 100 + k;
      hours.push({ t: day(d) + k * 3600_000, o: p, h: p + 2, l: p - 2, c: p + 1, v: 10 });
    }
  }
  const four = toFourHour(hours, off);
  assert.equal(four.length, 4);
  assert.equal(four[0].t, day(24));
  assert.equal(four[1].t, day(24) + 4 * 3600_000, '두 번째 봉은 13:30');
  assert.deepEqual([four[0].o, four[0].h, four[0].l, four[0].c, four[0].v], [100, 105, 98, 104, 40]);
  assert.deepEqual([four[1].o, four[1].h, four[1].l, four[1].c, four[1].v], [104, 108, 102, 107, 30]);
  assert.equal(four[2].t, day(25));
  // 거래량이 하나라도 빠지면 그 4시간봉 거래량도 모른다
  hours[1].v = null;
  assert.equal(toFourHour(hours, off)[0].v, null);
});

test('4시간봉의 1년선은 전날까지의 일봉 평균 — 그날 종가를 미리 쓰지 않는다', () => {
  const D = 86_400_000;
  const daily = [1, 2, 3, 4].map((c, i) => ({ t: i * D, c }));
  const bars = [{ t: 2 * D + 3600_000 }, { t: 3 * D + 3600_000 }];
  // 2일 평균: [_, 1.5, 2.5, 3.5]. 2일째 봉은 1일까지 → 1.5, 3일째 봉은 2일까지 → 2.5
  assert.deepEqual(trendForBars(bars, daily, 2, 0), [1.5, 2.5]);
  // 일봉이면 그 봉까지
  assert.deepEqual(trendForBars(daily, null, 2), [null, 1.5, 2.5, 3.5]);
});

function demoBars(n, f, v = 1000) {
  return Array.from({ length: n }, (_, i) => {
    const c = f(i);
    return { t: i * 86_400_000, o: c - 0.5, h: c + 1, l: c - 1, c, v };
  });
}

test('모델 — 값이 빠진 봉은 버리고, 요약 줄과 세기가 맞다', () => {
  const bars = demoBars(300, (i) => 100 + i * 0.5 + Math.sin(i / 5) * 3);
  bars.splice(10, 0, { t: 9.5 * 86_400_000, o: null, h: 1, l: 1, c: 1, v: 1 });
  const m = taModel({ tf: '1d', bars });
  assert.equal(m.n, 300);
  const rows = taSummary(m);
  assert.deepEqual(rows.map((r) => r.key), ['st', 'ma', 'trend', 'obv', 'rsi', 'div']);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(by.st.dir, 'up');
  assert.match(by.st.value, /상승 추세 ▲/);
  assert.equal(by.ma.dir, 'up');
  assert.match(by.trend.value, /^1년선 위 ▲ \+\d+\.\d%$/);
  assert.equal(by.rsi.dir, null, 'RSI 는 방향으로 세지 않는다');
  const t = taTally(rows);
  assert.equal(t.counted, 5);
  assert.equal(t.up + t.down + t.none, 5);
  assert.match(taTallyText(t), /^5개 중 상승 쪽 \d · 하락 쪽 \d/);
  assert.match(taReadout(m, m.n - 1, (x) => x.toFixed(2)), /^시 [\d.]+ · 고 [\d.]+ · 저 [\d.]+ · 종 [\d.]+ · RSI [\d.]+ · 슈퍼트렌드 상승 ▲$/);
});

test('날이 모자라면 "아직 없음" — 0 이나 지어낸 값을 쓰지 않는다', () => {
  const m = taModel({ tf: '1d', bars: demoBars(30, (i) => 100 + i) });
  const by = Object.fromEntries(taSummary(m).map((r) => [r.key, r]));
  assert.equal(by.trend.value, '아직 없음');
  assert.match(by.trend.note, /252개/);
  assert.equal(by.ma.value, '아직 없음');
  assert.equal(by.trend.dir, null);
});

test('거래량이 없는 지수는 OBV 를 그리지 않고 까닭을 적는다', () => {
  const m = taModel({ tf: '1d', bars: demoBars(80, (i) => 100 + i, 0) });
  const obv = taSummary(m).find((r) => r.key === 'obv');
  assert.equal(obv.value, '그리지 않음');
  assert.equal(obv.dir, null);
  assert.match(obv.note, /거래량/);
});

test('화면 글에 매매를 권하는 말이 없다', () => {
  const banned = /(매수|매도|사세요|파세요|추천|기회|진입|청산|매매 신호|목표가|손절|익절|수익)/;
  const texts = [
    TA_TEXT.title, TA_TEXT.lede, TA_TEXT.markNote, TA_TEXT.tallyNote, TA_TEXT.codeHint, TA_TEXT.notIncluded,
    TA_TEXT.techTitle, TA_TEXT.techNote, TA_TEXT.searchHint, ...TA_TEXT.techSteps,
    ...TA_TEXT.methods.flat(),
  ];
  const ups = demoBars(300, (i) => 100 + i * 0.5 + Math.sin(i / 5) * 3);
  const downs = demoBars(300, (i) => 300 - i * 0.5 + Math.sin(i / 5) * 3);
  for (const bars of [ups, downs]) {
    const m = taModel({ tf: '1d', bars });
    for (const r of taSummary(m)) texts.push(r.name, r.value, r.note);
    const t = techNow(m);
    texts.push(t.head.text, t.sub);
    for (const r of t.rows) texts.push(r.name, r.value, r.note);
  }
  for (const s of texts) assert.ok(!banned.test(s), `"${s}"`);
});

test('구간 단추 — 일봉 · 4시간봉마다 기본값이 목록에 있다', () => {
  for (const tf of ['1d', '4h']) {
    assert.ok(TA_RANGES[tf].some(([k]) => k === TA_DEFAULT_RANGE[tf]));
  }
});

test('그림 — 보이는 구간의 봉만, 전환 ▲ ▼ 를 그 자리에, 이름은 글로 이스케이프', async () => {
  const { taChartHtml, taIndexAt, taXOf } = await import('../src/lib/taChart.mjs');
  const bars = Array.from({ length: 200 }, (_, i) => {
    const c = i < 100 ? 100 + i : 200 - (i - 100) * 1.5;
    return { t: i * 86_400_000, o: c - 0.5, h: c + 1, l: c - 1, c, v: 1000 };
  });
  const m = taModel({ tf: '1d', bars });
  const { html, layout } = taChartHtml(m, { from: 50, to: 199, width: 360, title: '<b>&' });
  assert.match(html, /^<ul class="ta-legend">/);
  assert.match(html, /<svg viewBox="0 0 360 \d+" width="360"/);
  assert.ok(!html.includes('<b>&'), '제목은 이스케이프');
  const flips = m.st.flips.filter((f) => f.i >= 50).length;
  assert.equal((html.match(/class="ta-flip ta-flip-st"[^>]*>[▲▼]</g) ?? []).length, flips, '슈퍼트렌드 전환은 흐린 ▲ ▼');
  assert.match(html, new RegExp(`슈퍼트렌드 전환 ${flips}번`));
  // 기법 조건 ● — 상승 쪽은 봉 아래(저가보다 아래), 강함은 큰 원
  const tech = [{ i: 120, seenAt: 120, side: 'up', kind: 'rsi', strong: false, rsi: 28 }, { i: 150, seenAt: 155, side: 'down', kind: 'div', strong: true, rsi: 91 }];
  const withTech = taChartHtml(m, { from: 50, to: 199, width: 360, tech }).html;
  assert.equal((withTech.match(/<circle [^>]*class="ta-tech"/g) ?? []).length, 1);
  assert.equal((withTech.match(/<circle [^>]*class="ta-tech ta-tech-strong"/g) ?? []).length, 1);
  assert.match(withTech, /기법 조건 2번/);
  assert.equal((taChartHtml(m, { from: 130, to: 199, width: 360, tech }).html.match(/<circle /g) ?? []).length, 1, '구간 밖은 그리지 않음');
  // 짚은 자리 ↔ 봉 번호
  assert.equal(taIndexAt(layout, taXOf(layout, 120)), 120);
  assert.equal(taIndexAt(layout, -50), 50);
  assert.equal(taIndexAt(layout, 9999), 199);
  // 거래량이 없으면 OBV 칸에 까닭을 적는다
  const noVol = taModel({ tf: '1d', bars: bars.map((b) => ({ ...b, v: 0 })) });
  assert.match(taChartHtml(noVol, { from: 0, to: 199, width: 360 }).html, /제공처가 거래량을 주지 않습니다/);
});

test('미리보기에 끼워 넣을 수 있게 — 두 파일 모두 import 가 없다', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const f of ['src/lib/ta.mjs', 'src/lib/taChart.mjs']) {
    assert.ok(!/^import /m.test(await readFile(f, 'utf8')), f);
  }
});

test('종목 코드 — 미국 영문, 한국 6자리(코스피 다음 코스닥), 그 밖은 거절', () => {
  assert.deepEqual(taParseCode(' tsla '), { code: 'TSLA', market: 'us', candidates: ['TSLA'] });
  assert.deepEqual(taParseCode('brk.b'), { code: 'BRK-B', market: 'us', candidates: ['BRK-B'] });
  assert.deepEqual(taParseCode('005930'), { code: '005930', market: 'kr', candidates: ['005930.KS', '005930.KQ'] });
  assert.deepEqual(taParseCode('035720.kq'), { code: '035720', market: 'kr', candidates: ['035720.KQ'] });
  // 가운데 띄어 쓴 것은 붙여 읽는다 ('005 930')
  assert.equal(taParseCode('005 930')?.code, '005930');
  for (const bad of ['', '../x', 'BTC-USD', 'TOOLONG', '12345', '^GSPC', 'TSLA?x=1', null]) assert.equal(taParseCode(bad), null, String(bad));
});

/** RSI 값을 직접 넣은 가짜 모델 — 기법 규칙만 본다 */
function fakeModel(rsiVals, extra = {}) {
  const n = rsiVals.length;
  return {
    tf: '4h', n, rsi: rsiVals, div: [], st: { dir: new Array(n).fill('down'), flips: [], line: new Array(n).fill(null) },
    ...extra,
  };
}

test('기법 — RSI 30 이하로 들어간 첫 봉, 그 안에서 20 이하로 더 들어간 첫 봉(강함)', () => {
  const r = [50, 40, 29, 25, 19, 18, 35, 28, 50];
  const ev = techEvents(fakeModel(r));
  assert.deepEqual(ev.map((e) => [e.i, e.side, e.kind, e.strong]), [
    [2, 'up', 'rsi', false],
    [4, 'up', 'rsi', true],
    [7, 'up', 'rsi', false],
  ]);
});

test('기법 — RSI 80 이상은 하락 쪽, 90 이상은 강함 · 값이 없으면 끊는다', () => {
  const r = [50, 81, 85, 92, null, 83, 60];
  const ev = techEvents(fakeModel(r));
  assert.deepEqual(ev.map((e) => [e.i, e.side, e.strong]), [[1, 'down', false], [3, 'down', true], [5, 'down', false]]);
});

test('기법 — 다이버전스는 피벗 봉에, 확인은 5봉 뒤. 확인 전에는 지금 상태에 안 잡힌다', () => {
  const n = 40;
  const r = new Array(n).fill(50);
  r[20] = 35;
  const m = fakeModel(r, { div: [{ i: 20, from: 8, kind: 'bull', seenAt: 25 }] });
  assert.deepEqual(techEvents(m).map((e) => [e.i, e.kind, e.side, e.seenAt]), [[20, 'div', 'up', 25]]);
  assert.equal(techNow(m, 24).head.side, null, '확인 전');
  const t = techNow(m, 26);
  assert.equal(t.head.side, 'up');
  assert.equal(t.head.text, '상승 쪽 조건 충족 ▲');
  assert.match(t.sub, /^상승 다이버전스 · 6봉 전$/);
  assert.equal(t.rows[0].dir, 'up');
});

test('기법 — 같은 쪽 조건이 겹치면 함께 적고, 20 이하까지 갔으면 강함', () => {
  const r = new Array(40).fill(50);
  r[10] = 28; r[11] = 18; r[12] = 40;
  const m = fakeModel(r, { div: [{ i: 11, from: 3, kind: 'bull', seenAt: 16 }] });
  const t = techNow(m, 20);
  assert.equal(t.head.strong, true);
  assert.equal(t.sub, 'RSI 30 이하 + 상승 다이버전스 · 9봉 전 · RSI 가 20 이하까지 가 강함');
});

test('기법 — 슈퍼트렌드는 조건 뒤 같은 방향 전환만 본다(후순위)', () => {
  const r = new Array(40).fill(50);
  r[10] = 25;
  const dir = new Array(40).fill('down');
  for (let k = 14; k < 40; k += 1) dir[k] = 'up';
  const m = fakeModel(r, { st: { dir, flips: [{ i: 5, dir: 'down' }, { i: 14, dir: 'up' }], line: [] } });
  const st = techNow(m, 20).rows[2];
  assert.equal(st.value, '조건 뒤 상승 전환 ▲');
  assert.equal(st.note, '조건에서 4봉 뒤 · 6봉 전');
  const before = techNow(m, 12).rows[2];
  assert.equal(before.value, '조건 뒤 아직 상승 전환 없음');
});

test('기법 — 최근 30봉 안에 아무 조건도 없으면 그렇다고 적는다', () => {
  const t = techNow(fakeModel(new Array(60).fill(55)));
  assert.equal(t.head.side, null);
  assert.equal(t.head.text, '기법 조건 없음');
  assert.match(t.sub, /최근 30봉 안에 RSI 30 이하 · 80 이상 · 다이버전스가 없습니다/);
});

test('종목 찾기 — 코드 · 이름 앞부분 · 초성 · 이름 가운데', () => {
  const list = [
    { id: 'tsla', name: '테슬라', code: 'TSLA' },
    { id: 'samsung', name: '삼성전자', code: '005930' },
    { id: 'kospi', name: '코스피', code: 'KOSPI' },
    { id: 'kospi200', name: '코스피 200', code: 'KOSPI200' },
    { id: 'hynix', name: 'SK하이닉스', code: '000660' },
  ];
  assert.deepEqual(taSearch('tsla', list).map((a) => a.id), ['tsla']);
  assert.deepEqual(taSearch('005930', list).map((a) => a.id), ['samsung']);
  assert.deepEqual(taSearch('ㅌㅅㄹ', list).map((a) => a.id), ['tsla']);
  assert.deepEqual(taSearch('ㅅㅅ', list).map((a) => a.id), ['samsung']);
  assert.deepEqual(taSearch('코스피', list).map((a) => a.id), ['kospi', 'kospi200'], '짧은 이름이 위');
  assert.deepEqual(taSearch('하이닉스', list).map((a) => a.id), ['hynix']);
  assert.deepEqual(taSearch('  ', list), []);
  assert.deepEqual(taSearch('없는것', list), []);
});

test('한눈에 — 결론 한 줄 + 큰 숫자 칸 여섯, 방향은 ▲ ▼ 와 말로', async () => {
  const { taBoardHtml } = await import('../src/lib/taChart.mjs');
  const bars = Array.from({ length: 300 }, (_, i) => {
    const c = 100 + i * 0.3 + Math.sin(i / 6) * 6;
    return { t: i * 86_400_000, o: c - 0.5, h: c + 1, l: c - 1, c, v: 1000 + i };
  });
  const m = taModel({ tf: '4h', bars });
  const b = taBoard(m);
  assert.deepEqual(b.tiles.map((t) => t.key), ['tdiv', 'trsi', 'st', 'ma', 'trend', 'obv']);
  const rsi = b.tiles[1];
  assert.equal(rsi.big, m.rsi[m.n - 1].toFixed(1), 'RSI 는 숫자를 크게');
  assert.deepEqual(rsi.bands, [20, 30, 80, 90]);
  for (const t of b.tiles) {
    if (t.dir) assert.match(t.big + t.cap, t.dir === 'up' ? /▲|＋/ : /▼|－/, `${t.key}: ${t.big} ${t.cap}`);
    assert.ok(t.big.length <= 8, `큰 값은 짧게 — ${t.key}: ${t.big}`);
  }
  assert.match(b.tiles[4].big, /^[+−]?\d+\.\d%$/);
  const html = taBoardHtml(b);
  assert.match(html, /^<div class="ta-board"><div class="ta-verdict" data-side="(up|down|none)">/);
  assert.equal((html.match(/class="ta-tile"/g) ?? []).length, 6);
  assert.match(html, /<div class="ta-rsibar" aria-hidden="true">(<i class="(sl|l|m|h|sh)" style="width:\d+%"><\/i>){5}<em style="left:[\d.]+%"><\/em><\/div>/);
  assert.match(html, /aria-label="② RSI 14: [\d.]+, /);
});

test('한눈에 — 값이 모자라면 "없음" 과 까닭, 지어내지 않는다', () => {
  const bars = Array.from({ length: 12 }, (_, i) => ({ t: i * 864e5, o: 10, h: 11, l: 9, c: 10 + i * 0.1, v: 0 }));
  const b = taBoard(taModel({ tf: '1d', bars }));
  const by = Object.fromEntries(b.tiles.map((t) => [t.key, t]));
  assert.equal(by.trsi.big, '없음');
  assert.equal(by.trsi.rsi, null);
  assert.equal(by.trend.big, '없음');
  assert.match(by.trend.cap, /252개/);
  assert.equal(by.obv.big, '없음');
  assert.match(by.obv.cap, /거래량/);
});
