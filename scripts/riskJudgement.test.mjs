import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBoundary, recentPosition, positionWord } from '../src/lib/riskJudgement.mjs';

/** 값이 클수록 위험한 지표 (VIX) */
const vix = {
  value: 11.55,
  direction: 'higher_is_riskier',
  bands: [
    { level: 'calm', from: null, to: 15, label: '15 미만' },
    { level: 'normal', from: 15, to: 20, label: '15~20' },
    { level: 'watch', from: 20, to: 28, label: '20~28' },
    { level: 'alert', from: 28, to: null, label: '28 이상' },
  ],
};

test('다음 경계는 위험이 커지는 쪽에서 제일 가까운 것', () => {
  const b = nextBoundary(vix);
  assert.equal(b.at, 15);
  assert.equal(b.level, 'normal');
  assert.equal(b.dir, 'worse');
  assert.ok(Math.abs(b.delta - 3.45) < 1e-9);
});

test('이미 제일 위험한 구간이면 나아지는 쪽 경계를 말한다', () => {
  const b = nextBoundary({ ...vix, value: 33 });
  assert.equal(b.dir, 'better');
  assert.equal(b.at, 28);
  assert.equal(b.level, 'watch');
  assert.ok(b.delta < 0, '나아지려면 내려가야 하므로 음수');
});

test('낮을수록 위험한 지표는 방향이 뒤집힌다', () => {
  // 장단기 금리차 — 낮을수록(역전) 위험하다
  const spread = {
    value: 40,
    direction: 'lower_is_riskier',
    bands: [
      { level: 'alert', from: null, to: 0, label: '0 미만' },
      { level: 'watch', from: 0, to: 20, label: '0~20' },
      { level: 'normal', from: 20, to: 60, label: '20~60' },
      { level: 'calm', from: 60, to: null, label: '60 이상' },
    ],
  };
  const b = nextBoundary(spread);
  assert.equal(b.at, 20, '위험은 아래쪽이므로 20 이 다음 경계');
  assert.equal(b.dir, 'worse');
  assert.ok(b.delta < 0, '위험 쪽으로 가려면 내려가야 한다');
});

test('값이 없으면 아무 말도 지어내지 않는다', () => {
  assert.equal(nextBoundary({ ...vix, value: null }), null);
  assert.equal(nextBoundary(null), null);
  assert.equal(nextBoundary({ value: 5, bands: [] }), null);
});

test('최근 위치는 최저~최고 사이의 자리다', () => {
  const spark = [10, 12, 14, 16, 20].map((v, i) => ({ t: i, v }));
  const r = recentPosition(spark, 15);
  assert.equal(r.min, 10);
  assert.equal(r.max, 20);
  assert.equal(r.pct, 50);
  assert.equal(r.days, 5);
});

test('점이 다섯 개도 안 되면 범위를 말하지 않는다', () => {
  assert.equal(recentPosition([{ t: 1, v: 3 }, { t: 2, v: 4 }], 3.5), null);
});

test('움직이지 않은 구간에서는 위치가 뜻을 갖지 않는다', () => {
  const flat = [1, 1, 1, 1, 1, 1].map((v, i) => ({ t: i, v }));
  assert.equal(recentPosition(flat, 1), null);
});

test('범위를 벗어난 값도 0~100 안에 묶는다', () => {
  const spark = [10, 12, 14, 16, 20].map((v, i) => ({ t: i, v }));
  assert.equal(recentPosition(spark, 40).pct, 100);
  assert.equal(recentPosition(spark, 2).pct, 0);
});

test('위치를 사람 말로 옮긴다', () => {
  assert.equal(positionWord(5), '아래쪽 끝');
  assert.equal(positionWord(50), '가운데');
  assert.equal(positionWord(95), '위쪽 끝');
  assert.equal(positionWord(null), '');
});
