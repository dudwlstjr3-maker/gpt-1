/**
 * 조사 고르기 — 이/가, 은/는, 을/를.
 *
 * 왜 필요한가
 *   화면의 문장 대부분은 지표 이름을 받아 조립한다. 그런데 이름이 무엇이냐에
 *   따라 뒤에 붙는 조사가 달라진다. '수수료가' 는 맞지만 '금리차가' 는 틀리고
 *   '금리차이' 도 틀린다 — 앞말의 받침이 정한다.
 *
 *   붙여 쓰고 있던 곳이 두 군데 있었는데 둘 다 틀렸다. 하나는 '이' 로 못박아
 *   두어 '수수료이 평소 범위를 벗어났습니다' 가 나왔고, 다른 하나는 **개수**로
 *   골라서(하나면 '이', 둘이면 '가') 이름과 아무 상관이 없었다.
 *
 * 한글이 아닌 말로 끝나면
 *   읽는 소리로 판단한다. 'VIX' 는 '빅스' 라 받침이 없고, 'S&P 500' 은 '오백'
 *   이라 받침이 없다. 숫자는 읽는 소리에 받침이 있는 것(0·1·3·6·7·8)과 없는
 *   것(2·4·5·9)이 갈린다. 라틴 글자로 끝나면 대체로 받침이 없다고 본다 —
 *   틀릴 수 있지만, 틀려도 '가' 쪽이 덜 어색하다.
 */

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

/** 읽는 소리에 받침이 있는 숫자 — 영·일·삼·육·칠·팔 */
const DIGIT_HAS_FINAL = new Set(['0', '1', '3', '6', '7', '8']);

/** 앞말이 받침으로 끝나는가 */
export function hasFinalConsonant(word) {
  const text = String(word ?? '').trim();
  if (!text) return false;
  const last = [...text].pop();
  const code = last.codePointAt(0);

  if (code >= HANGUL_START && code <= HANGUL_END) return (code - HANGUL_START) % 28 !== 0;
  if (/[0-9]/.test(last)) return DIGIT_HAS_FINAL.has(last);
  // 라틴 글자·기호로 끝나면 받침이 없다고 본다
  return false;
}

/** 받침이 있으면 앞엣것, 없으면 뒤엣것 */
function pick(word, withFinal, withoutFinal) {
  return hasFinalConsonant(word) ? withFinal : withoutFinal;
}

/** 이 / 가 */
export function subject(word) {
  return pick(word, '이', '가');
}

/** 은 / 는 */
export function topic(word) {
  return pick(word, '은', '는');
}

/** 을 / 를 */
export function object(word) {
  return pick(word, '을', '를');
}

/** 과 / 와 */
export function conj(word) {
  return pick(word, '과', '와');
}
