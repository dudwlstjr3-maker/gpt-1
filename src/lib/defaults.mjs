/**
 * 기본값이 바뀌었을 때, 저장된 설정을 어떻게 옮길까.
 *
 * 설정은 브라우저(localStorage)에 통째로 저장된다. 그래서 앱의 기본값을 바꿔도
 * 이미 한 번 저장한 사람에게는 **옛 기본값이 그대로 남는다** — 새 기본값은 처음 여는
 * 사람에게만 간다. 쫄탐일보 리밸런싱(2026-11-24)에서 홈 항목과 관심목록 기본값을
 * 바꿨는데, 이걸 그냥 두면 정작 앱을 써 온 사람은 아무 변화도 못 본다.
 *
 * 그렇다고 저장된 값을 덮어쓰면 안 된다. 직접 고른 관심목록을 앱이 말없이 바꾸면
 * 그건 업데이트가 아니라 데이터를 지운 것이다.
 *
 * 가르는 기준은 하나 — **저장된 값이 옛 기본값과 글자 하나, 순서 하나까지 같은가.**
 *   같다  → 한 번도 손대지 않은 것이다. 새 기본값으로 옮긴다.
 *   다르다 → 사용자가 고른 것이다. 항목을 뺐든, 더했든, 순서만 바꿨든 그대로 둔다.
 * 비워 둔 것도 고른 것이다. 빈 목록은 옛 기본값과 다르니 그대로 빈 채로 둔다.
 */

/**
 * @param {string[]} saved    저장돼 있던 값
 * @param {readonly string[]} previous  바로 앞의 기본값
 * @param {string[]} current  지금의 기본값
 * @returns {string[]}
 */
export function upgradeDefault(saved, previous, current) {
  const untouched = saved.length === previous.length && saved.every((x, i) => x === previous[i]);
  return untouched ? [...current] : saved;
}

/**
 * 앱에서 뺀 항목을 저장된 목록에서 덜어낸다 (2026-11-26 — 크립토를 뺐다).
 *
 * 관심목록에 비트코인을 넣어 둔 사람이 있다. 앱이 더는 비트코인 값을 받지 않으니 그대로 두면
 * 그 자리는 영영 빈 칸이 된다. 그래서 **뺀 것만** 덜어내고, 사용자가 고른 나머지는 순서까지 그대로 둔다.
 * 앱에 없는 것을 지울 뿐 사용자가 고른 것을 바꾸지는 않는다 — upgradeDefault 와 같은 원칙이다.
 *
 * @param {string[]} saved    저장돼 있던 값
 * @param {readonly string[]} removed  앱에서 뺀 id
 * @returns {string[]}
 */
export function dropRemoved(saved, removed) {
  const gone = new Set(removed);
  return saved.filter((x) => !gone.has(x));
}
