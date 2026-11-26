// 쫄탐광장 화면 문구 — 앱(src/app/plaza)과 미리보기(tools/preview/template.html)가 같은 말을 쓰도록 한 곳에 둔다.
// 미리보기는 이 파일을 그대로 끼워 넣는다(tools/preview/build.mjs 가 'export ' 만 걷어 낸다) — 그래서 import 가 없다.
// 단추 말은 "오른다 / 내린다". 사고팔라는 말을 쓰지 않는다. 위/아래는 기호와 말로 함께 적는다.

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** '2026-11-27' → '11월 27일(금)' */
export function plazaDay(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}월 ${d}일(${WEEK[wd]})`;
}

/** ISO → 한국시간 '11월 27일 23:30' */
export function plazaKst(iso) {
  const t = new Date(new Date(iso).getTime() + 9 * 3600_000);
  const hh = String(t.getUTCHours()).padStart(2, '0');
  const mm = String(t.getUTCMinutes()).padStart(2, '0');
  return `${t.getUTCMonth() + 1}월 ${t.getUTCDate()}일 ${hh}:${mm}`;
}

export function plazaPick(pick) {
  return pick === 'up' ? '▲ 오른다' : '▼ 내린다';
}

export function plazaResult(result) {
  if (result === 'up') return '▲ 올랐어요';
  if (result === 'down') return '▼ 내렸어요';
  if (result === 'flat') return '■ 보합 — 점수 변동 없음';
  return '– 자료가 없어 무효';
}

export function plazaSigned(v) {
  if (!Number.isFinite(v)) return '–';
  const s = Math.abs(v).toFixed(1);
  return v > 0 ? `+${s}` : v < 0 ? `-${s}` : s;
}

/** 지수 하루 변화 — 0.01% 가 '+0.0%' 로 뭉개지지 않게 소수 둘째 자리 */
export function plazaChange(pct) {
  if (!Number.isFinite(pct)) return '';
  const s = Math.abs(pct).toFixed(2);
  return pct > 0 ? `+${s}%` : pct < 0 ? `-${s}%` : `${s}%`;
}

/** 사람들 몫 — 두 칸 합이 100 이 되게 */
export function plazaCrowd(ups, downs) {
  const n = (ups || 0) + (downs || 0);
  if (!n) return { up: 0, down: 0, n: 0 };
  const up = Math.round(((ups || 0) / n) * 100);
  return { up, down: 100 - up, n };
}

export function plazaAccuracy(correct, played) {
  if (!played) return '아직 결과 없음';
  return `${played}판 ${correct}번 맞힘 · ${Math.round((correct / played) * 100)}%`;
}

export function plazaAgo(iso, nowMs) {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  if (diff < 60_000) return '방금';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  const t = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${t.getUTCMonth() + 1}월 ${t.getUTCDate()}일`;
}

/** 순위표 아래 '레이팅은 어떻게 오르나요?' */
export function plazaRatingHelp(rules) {
  return [
    `모두 ${rules.ratingStart.toLocaleString('ko-KR')}점에서 시작해요.`,
    `남들과 반대로 골라 맞히면 크게 오르고(한 판 최대 +${rules.k}), 남들 따라 골랐다 틀리면 크게 깎여요.`,
    '그날 모인 사람들의 선택을 상대로 한 Elo 방식이라, 아무렇게나 찍어서는 오르지 않아요.',
    `보합인 날은 점수가 그대로예요. 결과가 ${rules.minPlayed}판 이상 나면 순위표에 올라요.`,
  ];
}

export const PLAZA_LEDE = '다음 거래일에 장이 오를지 내릴지 맞히고, 한 줄로 이야기해요. 상금이나 실제 돈은 없어요.';
export const PLAZA_POST_NOTE = '회원 글은 개인 의견이며 투자 조언이 아니에요. 링크 · 리딩방 홍보 · 욕설은 올릴 수 없어요.';
export const PLAZA_FOOT = '게임 점수는 투자 실력을 뜻하지 않아요. 닉네임 말고는 아무 개인정보도 받지 않아요.';
export const PLAZA_MEMORY_NOTE = '지금은 기록이 서버 메모리에만 있어서, 서버가 다시 뜨면 사라져요.';
