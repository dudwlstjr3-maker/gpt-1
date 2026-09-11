import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasFinalConsonant, subject, topic, object, conj } from '../src/lib/particle.mjs';

test('한글 받침을 가려낸다', () => {
  assert.equal(hasFinalConsonant('수수료'), false);
  assert.equal(hasFinalConsonant('금리차'), false);
  assert.equal(hasFinalConsonant('공포지수'), false);
  assert.equal(hasFinalConsonant('국면'), true);
  assert.equal(hasFinalConsonant('이자'), false);
  assert.equal(hasFinalConsonant('10년'), true);
});

test('실제로 틀렸던 문장을 바로잡는다', () => {
  assert.equal(`오르는 쪽에 선 사람이 무는 수수료${subject('오르는 쪽에 선 사람이 무는 수수료')}`,
    '오르는 쪽에 선 사람이 무는 수수료가');
  assert.equal(`미국 공포지수${subject('미국 공포지수')}`, '미국 공포지수가');
});

test('숫자는 읽는 소리로 판단한다', () => {
  assert.equal(subject('S&P 500'), '이'); // 오백
  assert.equal(subject('코스피 200'), '이'); // 이백
  assert.equal(subject('러셀 2000'), '이'); // 이천
  assert.equal(subject('나스닥 100'), '이'); // 백
  assert.equal(subject('니케이 225'), '가'); // 이백이십오
});

test('라틴 글자로 끝나면 받침이 없다고 본다', () => {
  assert.equal(subject('VIX'), '가');
  assert.equal(subject('DXY'), '가');
});

test('다른 조사도 같은 규칙을 쓴다', () => {
  assert.equal(topic('수수료'), '는');
  assert.equal(topic('국면'), '은');
  assert.equal(object('금리차'), '를');
  assert.equal(object('국면'), '을');
  assert.equal(conj('수수료'), '와');
  assert.equal(conj('국면'), '과');
});

test('빈 값에도 터지지 않는다', () => {
  assert.equal(hasFinalConsonant(''), false);
  assert.equal(hasFinalConsonant(null), false);
  assert.equal(subject(undefined), '가');
});
