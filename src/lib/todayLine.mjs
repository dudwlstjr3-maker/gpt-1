/**
 * 오늘의 한 줄.
 *
 * 무엇인가
 *   홈 맨 위에 서는 한 문장이다. "오늘 무슨 일이 있었나" 를 한 번에 잡게 한다.
 *
 * 새 데이터는 쓰지 않는다
 *   이미 화면에 흩어져 있는 것 — 심리 점수의 어제 대비 변화, 오늘 유별나게
 *   움직인 종목, 경계 구간에 들어간 위험 지표 — 을 한 문장으로 묶을 뿐이다.
 *   그래서 이 줄이 하는 말은 아래로 내려가면 전부 그 자리에서 다시 확인된다.
 *
 * 지키는 것
 *  - 사라·팔라, 오를 것·내릴 것 같은 말은 쓰지 않는다. 있었던 일만 적는다.
 *  - 없는 것은 말하지 않는다. 셋 중 둘만 있으면 두 마디, 하나도 없으면
 *    아무 줄도 그리지 않는다. 빈 자리를 문장으로 메우지 않는다.
 *  - 최대 두 마디. 세 마디부터는 한 줄이 아니라 문단이 된다.
 */

import { subject } from './particle.mjs';

/** 몇 점부터 "눈에 띄게" 움직인 것으로 볼까 */
export const MOVE_MIN = 1.5;
/** 평소 폭의 몇 배부터 문장에 올릴까 */
export const HEAT_MIN = 1.6;

const MARKET_NAME = { us: '미국', kr: '한국', crypto: '크립토' };

function round1(v) {
  return Math.round(v * 10) / 10;
}

/**
 * 심리 점수가 어제와 견줘 가장 크게 움직인 시장.
 * 오르면 탐욕 쪽, 내리면 공포 쪽이라는 사실만 적는다.
 */
export function moodClause(scores) {
  const usable = (Array.isArray(scores) ? scores : []).filter(
    (s) => s && s.score !== null && Number.isFinite(s.deltaDay) && Math.abs(s.deltaDay) >= MOVE_MIN,
  );
  if (usable.length === 0) return null;
  const top = usable.reduce((a, b) => (Math.abs(b.deltaDay) > Math.abs(a.deltaDay) ? b : a));
  const name = MARKET_NAME[top.market] ?? top.market;
  const size = round1(Math.abs(top.deltaDay));
  return top.deltaDay > 0
    ? `${name} 투자심리가 어제보다 ${size}점 탐욕 쪽으로 갔고`
    : `${name} 투자심리가 어제보다 ${size}점 공포 쪽으로 갔고`;
}

/**
 * 평소 움직이던 폭에 견줘 오늘 가장 유별났던 것.
 * heatRank 가 고른 것을 그대로 받아 쓴다 — 두 곳이 다른 말을 하면 안 된다.
 */
export function heatClause(picks) {
  const usable = (Array.isArray(picks) ? picks : []).filter(
    (p) => p && p.heat && Number.isFinite(p.heat.times) && p.heat.times >= HEAT_MIN && p.quote,
  );
  if (usable.length === 0) return null;
  const top = usable.reduce((a, b) => (b.heat.times > a.heat.times ? b : a));
  const dir = (top.quote.changePct ?? 0) >= 0 ? '올라' : '내려';
  return `${top.quote.name}가 평소의 ${round1(top.heat.times)}배로 ${dir} 움직였습니다`;
}

/**
 * 경계 구간에 들어간 위험 지표.
 * 심리도 유별난 종목도 없을 때 쓰는 세 번째 마디다.
 */
export function riskClause(indicators) {
  const alert = (Array.isArray(indicators) ? indicators : []).filter((i) => i && i.level === 'alert');
  if (alert.length === 0) return null;
  const names = alert.slice(0, 2).map((i) => i.name).join(' · ');
  // 조사는 개수가 아니라 앞말의 받침이 정한다 — '수수료가', '금리차가', '국면이'
  return alert.length > 2
    ? `${names} 등 ${alert.length}개 지표가 경계 구간에 있습니다`
    : `${names}${subject(names)} 경계 구간에 있습니다`;
}

/**
 * 세 마디를 한 문장으로.
 * 앞 마디는 '~고' 로 끝나므로 뒤에 무엇이 오든 이어진다. 뒤가 없으면 '~습니다' 로 닫는다.
 */
export function todayLine({ scores, picks, indicators } = {}) {
  const mood = moodClause(scores);
  const heat = heatClause(picks);
  const risk = riskClause(indicators);

  if (mood && heat) return `${mood}, ${heat}.`;
  if (mood && risk) return `${mood}, ${risk}.`;
  if (mood) return `${mood.replace(/고$/, '습니다')}.`;
  if (heat) return `${heat}.`;
  if (risk) return `${risk}.`;
  return null;
}
