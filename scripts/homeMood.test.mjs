/**
 * 홈 카드의 전일 변화 문장과 어제 바늘 — src/lib/homeMood.mjs
 *
 * 왜 있나: "극단적 공포 · 전일 대비 ↑ 5.5점" 은 점수가 낮은데 오른 날 '공포가 커졌다' 로도
 * 읽혔다. 이제 방향을 말로 쓴다. 이 검사는 그 말이 방향과 어긋나지 않는지,
 * 그리고 매매를 권하는 말이 끼지 않는지를 모든 점수·변화 조합에서 본다.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeMood } from '../src/lib/homeMood.mjs';

test('점수는 낮지만 어제보다 오른 날 — 공포가 풀렸다고 말한다', () => {
  const m = homeMood(16, 5.5);
  assert.equal(m.change, '어제보다 공포가 5.5점 풀렸어요');
  assert.equal(m.glyph, '▲');
  assert.equal(m.word, '쫄?');
});

test('점수가 낮고 더 내린 날 — 공포가 깊어졌다고 말한다', () => {
  const m = homeMood(16, -5.5);
  assert.equal(m.change, '어제보다 공포가 5.5점 깊어졌어요');
  assert.equal(m.glyph, '▼');
});

test('탐욕 쪽 — 오르면 커졌다, 내리면 식었다', () => {
  assert.equal(homeMood(84, 3).change, '어제보다 탐욕이 3점 커졌어요');
  assert.equal(homeMood(84, -6).change, '어제보다 탐욕이 6점 식었어요');
});

test('공포·중립·탐욕 쪽을 넘나들면 어느 쪽으로 움직였는지만 말한다', () => {
  assert.equal(homeMood(62, 27).change, '어제보다 탐욕 쪽으로 27점 움직였어요'); // 35 → 62
  assert.equal(homeMood(38, -5).change, '어제보다 공포 쪽으로 5점 움직였어요'); // 43 → 38
  assert.equal(homeMood(50, 3).change, '어제보다 탐욕 쪽으로 3점 움직였어요'); // 중립 안
});

test('경계는 기존 단계(FNG_STAGES)와 같다 — 39/40, 59/60', () => {
  assert.equal(homeMood(39, -1).change, '어제보다 공포 쪽으로 1점 움직였어요'); // 40(중립) → 39(공포)
  assert.equal(homeMood(39, 1).change, '어제보다 공포가 1점 풀렸어요'); // 38 → 39, 둘 다 공포 쪽
  assert.equal(homeMood(60, 1).change, '어제보다 탐욕 쪽으로 1점 움직였어요'); // 59(중립) → 60
  assert.equal(homeMood(61, 1).change, '어제보다 탐욕이 1점 커졌어요'); // 60 → 61
});

test('같거나 비교할 수 없으면 그렇게 말하고, 어제 바늘을 그리지 않는다', () => {
  for (const d of [0, 0.04, -0.04]) {
    const m = homeMood(50, d);
    assert.equal(m.change, '어제와 같아요');
    assert.equal(m.glyph, '→');
    assert.equal(m.yesterday, null);
  }
  for (const d of [null, undefined, Number.NaN]) {
    const m = homeMood(16, d);
    assert.equal(m.change, '어제와 비교할 수 없어요');
    assert.equal(m.glyph, null);
    assert.equal(m.yesterday, null);
  }
});

test('점수가 없으면 카드가 그릴 것이 없다 (산출 불가)', () => {
  for (const v of [null, undefined, Number.NaN, -1, 101]) assert.equal(homeMood(v, 3), null);
});

test('어제 바늘 — 오늘 바늘과 같은 규칙(반올림)으로 각도를 잡고, 0~100 밖으로 나가지 않는다', () => {
  const m = homeMood(16, 5.5);
  assert.deepEqual(m.yesterday, { value: 10.5, angle: (11 - 50) * 1.8 });
  assert.equal(m.angle, (16 - 50) * 1.8);
  assert.deepEqual(homeMood(3, 5).yesterday, { value: 0, angle: -90 }); // 3 - 5 = -2 → 0 에 붙인다
  assert.deepEqual(homeMood(98, -5).yesterday, { value: 100, angle: 90 });
});

test('모든 점수 × 변화 — 기호와 말의 방향이 늘 같고, 매매를 권하는 말이 없다', () => {
  const upOnly = /풀렸어요|커졌어요|탐욕 쪽으로/;
  const downOnly = /깊어졌어요|식었어요|공포 쪽으로/;
  const banned = /매수|매도|매집|분할|비중|현금|보유|물량|검토선|손절|익절|사세요|파세요|추천|유리|기회|대응|전망|예상|수익/;
  let n = 0;
  for (let v = 0; v <= 100; v += 1) {
    for (let d = -20; d <= 20; d += 0.5) {
      const m = homeMood(v, d);
      n += 1;
      assert.ok(!banned.test(m.change), `${v}, ${d}: ${m.change}`);
      if (d > 0) {
        assert.equal(m.glyph, '▲');
        assert.ok(upOnly.test(m.change) && !downOnly.test(m.change), `${v}, ${d}: ${m.change}`);
      } else if (d < 0) {
        assert.equal(m.glyph, '▼');
        assert.ok(downOnly.test(m.change) && !upOnly.test(m.change), `${v}, ${d}: ${m.change}`);
      } else {
        assert.equal(m.change, '어제와 같아요');
      }
    }
  }
  assert.equal(n, 101 * 81);
});
