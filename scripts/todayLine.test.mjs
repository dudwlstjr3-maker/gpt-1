import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayLine, moodClause, heatClause, riskClause, MOVE_MIN, HEAT_MIN } from '../src/lib/todayLine.mjs';

const score = (market, s, d) => ({ market, score: s, deltaDay: d });
const pick = (name, times, changePct) => ({ quote: { name, changePct }, heat: { times } });

test('작게 움직인 심리는 문장에 올리지 않는다', () => {
  assert.equal(moodClause([score('us', 50, MOVE_MIN - 0.1)]), null);
});

test('가장 크게 움직인 시장 하나만 고른다', () => {
  const line = moodClause([score('us', 50, 2), score('crypto', 70, -6)]);
  assert.match(line, /크립토/);
  assert.match(line, /6점 공포/);
});

test('오르면 탐욕 쪽이라고 적는다', () => {
  assert.match(moodClause([score('us', 50, 4.94)]), /4\.9점 탐욕 쪽/);
});

test('산출 불가인 시장은 세지 않는다', () => {
  assert.equal(moodClause([{ market: 'kr', score: null, deltaDay: 9 }]), null);
});

test('평소 폭에 못 미치면 유별난 것으로 보지 않는다', () => {
  assert.equal(heatClause([pick('엔비디아', HEAT_MIN - 0.1, 3)]), null);
});

test('가장 유별난 것 하나와 방향을 적는다', () => {
  assert.match(heatClause([pick('엔비디아', 2.2, 3), pick('애플', 1.9, -1)]), /엔비디아가 평소의 2\.2배로 올라/);
  assert.match(heatClause([pick('카카오', 3.1, -2)]), /내려 움직였습니다/);
});

test('경계 구간 지표를 두 개까지 이름으로 적는다', () => {
  assert.match(riskClause([{ level: 'alert', name: 'VIX' }]), /VIX이 경계 구간/);
  assert.match(riskClause([{ level: 'alert', name: 'A' }, { level: 'alert', name: 'B' }]), /A · B가 경계 구간/);
  assert.match(
    riskClause([{ level: 'alert', name: 'A' }, { level: 'alert', name: 'B' }, { level: 'alert', name: 'C' }]),
    /A · B 등 3개 지표/,
  );
});

test('경계 구간이 없으면 아무 말도 하지 않는다', () => {
  assert.equal(riskClause([{ level: 'watch', name: 'A' }]), null);
});

test('둘이 있으면 두 마디로 잇는다', () => {
  const line = todayLine({ scores: [score('us', 25, 4.9)], picks: [pick('엔비디아', 2.2, 3)] });
  assert.equal(line, '미국 투자심리가 어제보다 4.9점 탐욕 쪽으로 갔고, 엔비디아가 평소의 2.2배로 올라 움직였습니다.');
});

test('심리만 있으면 그 마디로 문장을 닫는다', () => {
  assert.equal(todayLine({ scores: [score('us', 25, 4.9)] }), '미국 투자심리가 어제보다 4.9점 탐욕 쪽으로 갔습니다.');
});

test('아무것도 없으면 줄을 그리지 않는다', () => {
  assert.equal(todayLine({}), null);
  assert.equal(todayLine({ scores: [], picks: [], indicators: [] }), null);
});

test('세 마디를 한꺼번에 늘어놓지 않는다', () => {
  const line = todayLine({
    scores: [score('us', 25, 4.9)],
    picks: [pick('엔비디아', 2.2, 3)],
    indicators: [{ level: 'alert', name: 'VIX' }],
  });
  assert.equal(line.split(',').length, 2);
});

test('사라·팔라 같은 말을 쓰지 않는다', () => {
  const line = todayLine({ scores: [score('us', 25, -9)], picks: [pick('비트코인', 4, -8)] });
  assert.doesNotMatch(line, /매수|매도|사세|파세|기회|추천|전망|예상/);
});
