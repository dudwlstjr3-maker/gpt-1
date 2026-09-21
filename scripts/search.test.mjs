import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initials, isInitialQuery, searchEntries, score } from '../src/lib/search.mjs';

const e = (name, extra = {}) => ({ id: name, kind: 'quote', name, href: '/x', ...extra });

test('초성을 뽑는다', () => {
  assert.equal(initials('삼성전자'), 'ㅅㅅㅈㅈ');
  assert.equal(initials('S&P 500'), 'S&P 500');
  assert.equal(initials('코스피 200'), 'ㅋㅅㅍ 200');
});

test('자음만 쳤는지 가려낸다', () => {
  assert.equal(isInitialQuery('ㅅㅅ'), true);
  assert.equal(isInitialQuery('삼성'), false);
  assert.equal(isInitialQuery(''), false);
});

test('초성으로 찾는다', () => {
  const r = searchEntries([e('삼성전자'), e('SK하이닉스'), e('카카오')], 'ㅅㅅㅈㅈ');
  assert.equal(r.length, 1);
  assert.equal(r[0].name, '삼성전자');
});

test('앞에서 맞은 것이 먼저 온다', () => {
  const r = searchEntries([e('미국 국채 10년'), e('국고채 3년')], '국');
  assert.equal(r[0].name, '국고채 3년');
});

test('같은 자리면 짧은 이름이 위다', () => {
  const r = searchEntries([e('코스피 200'), e('코스피')], '코스피');
  assert.equal(r[0].name, '코스피');
});

test('기호로도 찾는다', () => {
  const r = searchEntries([e('엔비디아', { symbol: 'NVDA' })], 'nvda');
  assert.equal(r[0].name, '엔비디아');
});

test('띄어쓰기와 가운뎃점은 무시한다', () => {
  assert.ok(score(e('다우존스 산업평균'), '다우존스산업') >= 0);
  assert.ok(score(e('지니계수 · Gini coefficient'), 'gini') >= 0);
});

test('없는 것은 내놓지 않는다', () => {
  assert.deepEqual(searchEntries([e('삼성전자')], 'zzz'), []);
  assert.deepEqual(searchEntries([e('삼성전자')], ''), []);
});

test('개수를 넘기지 않는다', () => {
  const many = Array.from({ length: 30 }, (_, i) => e(`코스피 ${i}`));
  assert.equal(searchEntries(many, '코스피', 5).length, 5);
});
