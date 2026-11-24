import test from 'node:test';
import assert from 'node:assert/strict';
import { moodResponse } from '../src/lib/moodResponse.mjs';

const forbidden = /매수|매도|매집|분할|비중|현금|보유|물량|검토선|손절|익절|사세요|파세요|추천|유리|기회|대응/;
const point = (v, formulaVersion = 'v2') => ({ v, formulaVersion });

function checkCopy(card) {
  assert.doesNotMatch(card.title + ' ' + card.message, forbidden);
}

test('모든 정수 점수 쌍에서 방향과 문구를 확인한다', () => {
  for (let before = 0; before <= 100; before++) {
    for (let now = 0; now <= 100; now++) {
      const card = moodResponse([point(before), point(now)]);
      checkCopy(card);
      const arrow = now > before ? '↑' : now < before ? '↓' : '→';
      assert.ok(card.title.endsWith(arrow));
    }
  }
});

test('반올림과 단계 경계가 일치한다', () => {
  const groups = [[0,5,'쫄 3단'],[6,10,'쫄 2단'],[11,19,'쫄 1단'],[20,39,'공포'],
    [40,59,'중립'],[60,79,'탐욕'],[80,89,'탐 1단'],[90,94,'탐 2단'],[95,100,'탐 3단']];
  for (const [low, high, label] of groups) {
    for (const v of [low, high]) assert.equal(moodResponse([point(v),point(v)]).title, label + ' →');
  }
  const card = moodResponse([point(24), point(20), point(19.49)]);
  assert.equal(card.title, '쫄 1단 ↓');
  assert.equal(card.trail, '24 → 20 → 19');
  assert.equal(moodResponse([point(19),point(19.5)]).title, '공포 ↑');
});

test('두 점수와 같은 산식이 확인될 때까지 방향을 비운다', () => {
  const gaps = [[], [point(30)], [point(10,'v1'),point(30)], [{v:10},{v:30}]];
  for (const v of [null, undefined, '20', NaN, Infinity, -0.1, 100.1]) {
    gaps.push([point(v),point(30)], [point(30),point(v)]);
  }
  for (const history of gaps) {
    const card = moodResponse(history);
    checkCopy(card);
    assert.equal(card.title, '방향 확인 대기');
  }
});
