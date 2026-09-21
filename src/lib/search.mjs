/**
 * 찾기.
 *
 * 왜 필요한가
 *   지금까지 이 앱을 돌아다니는 길은 탭 일곱 개와 화면 안의 링크뿐이었다.
 *   '엔비디아' 를 보려면 홈 → 관심 가격 → 목록에서 찾기, 아니면 시장 화면으로
 *   들어가 목록을 훑어야 한다. 이름을 아는 사람에게는 그게 제일 먼 길이다.
 *
 * 무엇을 찾나
 *   종목·지수(카탈로그), 위험 지표, 생활 경제 지수, 용어, 그리고 화면 자체.
 *   바깥에 물어보지 않는다 — 전부 이미 앱 안에 있는 것들이다.
 *
 * 초성으로도 찾는다
 *   'ㅅㅅㅈㅈ' 로 삼성전자가 나와야 한다. 한글을 쓰는 사람은 이름 전체를 치지
 *   않는다. 자음만 눌러도 후보가 좁혀지는 것이 한국어 검색의 기본값이다.
 *
 * 줄 세우는 법
 *   앞에서 맞은 것 > 가운데서 맞은 것, 그리고 같은 자리면 짧은 이름이 위다.
 *   '코스피' 를 치면 '코스피' 가 '코스피 200' 보다 먼저 나와야 한다.
 */

/** 한글 음절에서 첫 자음을 뽑을 때 쓰는 표 */
const CHO = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

/** '삼성전자' → 'ㅅㅅㅈㅈ'. 한글이 아닌 글자는 그대로 둔다. */
export function initials(text) {
  let out = '';
  for (const ch of String(text ?? '')) {
    const code = ch.codePointAt(0);
    if (code >= HANGUL_START && code <= HANGUL_END) {
      out += CHO[Math.floor((code - HANGUL_START) / 588)];
    } else {
      out += ch;
    }
  }
  return out;
}

/** 대소문자·공백·가운뎃점을 지운 비교용 문자열 */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\s·・.,()[\]{}/-]/g, '');
}

/** 친 글자가 전부 자음뿐인가 (초성으로 찾는 중인가) */
export function isInitialQuery(query) {
  const q = normalize(query);
  return q.length > 0 && [...q].every((c) => CHO.includes(c));
}

/**
 * 한 항목이 질의에 맞는지, 맞으면 얼마나 잘 맞는지.
 * 못 맞으면 -1. 작을수록 위에 선다.
 */
export function score(entry, query) {
  const q = normalize(query);
  if (!q) return -1;

  const fields = [entry.name, entry.symbol, entry.sub].filter(Boolean).map(normalize);
  const initialFields = isInitialQuery(query) ? [initials(entry.name)].map(normalize) : [];

  let best = -1;
  const consider = (hay, penalty) => {
    const at = hay.indexOf(q);
    if (at < 0) return;
    // 앞에서 맞으면 0점대, 가운데서 맞으면 100점대. 같은 자리면 짧은 이름이 위.
    const s = (at === 0 ? 0 : 100) + at + penalty + hay.length * 0.01;
    if (best < 0 || s < best) best = s;
  };

  consider(fields[0] ?? '', 0);
  for (const f of fields.slice(1)) consider(f, 10);
  for (const f of initialFields) consider(f, 5);
  return best;
}

/**
 * 찾은 것들을 줄 세워 돌려준다.
 * @param {Array} entries 찾을 것들 — { id, kind, name, symbol?, sub?, href }
 * @param {string} query 친 글자
 * @param {number} limit 몇 개까지
 */
export function searchEntries(entries, query, limit = 12) {
  const list = Array.isArray(entries) ? entries : [];
  const hits = [];
  for (const e of list) {
    const s = score(e, query);
    if (s >= 0) hits.push({ entry: e, score: s });
  }
  hits.sort((a, b) => a.score - b.score);
  return hits.slice(0, limit).map((h) => h.entry);
}
