/**
 * 쫄탐광장 — 규칙 한 곳 (2026-11-26).
 *
 * 사용자 요청: "커뮤니티도 넣어 놓고, 내일의 주식이 어떨지 모의투자할 수 있게 간단한 게임,
 * 상승 or 하락 맞추는 걸로 순위표나 elo 형식으로 만들어서 커뮤니티에서 활성화할 수 있게".
 * 정한 것: 가입 없이 닉네임만 · 한 줄 토론(140자) · 맞히기는 S&P 500 과 KOSPI.
 *
 * 이 파일은 순수 함수만 둔다 — 서버(src/server/plaza)와 단위 검사가 같은 계산을 본다.
 *
 * 게임이지 투자가 아니다.
 *  - 상금 · 실제 돈 · 경품이 없다. 점수는 투자 실력을 뜻하지 않는다.
 *  - 단추 말은 "오른다 / 내린다" 다. "사라 / 팔라" 같은 지시를 쓰지 않는다.
 */

/* ------------------------------ 숫자 규칙 ------------------------------ */

export const NICK_MIN = 2;
export const NICK_MAX = 12;
export const POST_MAX = 140;
export const POST_MIN = 2;
/** 처음 레이팅 */
export const RATING_START = 1000;
/** 한 판에 움직일 수 있는 최대 폭 (Elo 의 K) */
export const RATING_K = 32;
/** 사람이 적은 날 한두 명의 선택에 기대치가 휘둘리지 않게 양쪽에 미리 깔아 두는 표 */
export const CROWD_PRIOR = 5;
/** 순위표에 오르려면 결과가 난 판이 이만큼 있어야 한다 — 한 판 맞힌 사람이 1등이 되지 않게 */
export const LEADER_MIN_PLAYED = 5;
/** 서로 다른 회원 신고가 이만큼 쌓이면 글을 가린다 */
export const HIDE_AFTER_REPORTS = 3;

/* ------------------------------ 닉네임 · 글 ------------------------------ */

/**
 * 운영자로 보이게 하는 이름, 흔한 욕설, 외부 채팅방 · 리딩방 홍보.
 * 완벽한 거름망이 아니다 — 신고(HIDE_AFTER_REPORTS)와 관리자 삭제가 뒤를 받친다.
 */
const RESERVED_NICK = /(관리자|운영자|운영진|쫄탐일보|admin|moderator|system)/i;
const BAD_WORDS = /(시발|씨발|ㅅㅂ|ㅆㅂ|병신|ㅂㅅ|개새|좆|존나|미친놈|미친년|지랄|느금|니애미|애미|애비)/;
const SPAM = /(리딩방|리딩\s*방|오픈\s*채팅|오픈톡|카톡방|텔레그램|텔레\s*방|수익\s*보장|원금\s*보장|무료\s*추천|급등주\s*추천|vip\s*방)/i;
const LINK = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|kr|io|me|ly|gg|co)\b|t\.me\/|open\.kakao)/i;

/** 공백 정리 — 앞뒤를 자르고, 줄바꿈 · 연속 공백을 하나로 */
const squash = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * 닉네임 — 2~12자, 한글 · 영문 · 숫자 · 밑줄만.
 * @returns {{ ok: true, value: string } | { ok: false, reason: string }}
 */
export function checkNickname(raw) {
  const value = squash(raw);
  if (value.length < NICK_MIN || value.length > NICK_MAX) {
    return { ok: false, reason: `닉네임은 ${NICK_MIN}~${NICK_MAX}자로 정해 주세요.` };
  }
  if (!/^[0-9A-Za-z_가-힣]+$/.test(value)) {
    return { ok: false, reason: '닉네임에는 한글 · 영문 · 숫자 · 밑줄(_)만 쓸 수 있어요.' };
  }
  if (RESERVED_NICK.test(value)) return { ok: false, reason: '운영자로 보일 수 있는 이름은 쓸 수 없어요.' };
  if (BAD_WORDS.test(value)) return { ok: false, reason: '쓸 수 없는 말이 들어 있어요.' };
  return { ok: true, value };
}

/**
 * 한 줄 토론 글 — 2~140자. 링크 · 외부 채팅방 홍보 · 욕설은 받지 않는다.
 * @returns {{ ok: true, value: string } | { ok: false, reason: string }}
 */
export function checkPost(raw) {
  const value = squash(raw);
  if (value.length < POST_MIN) return { ok: false, reason: '두 글자 이상 적어 주세요.' };
  if (value.length > POST_MAX) return { ok: false, reason: `${POST_MAX}자까지 쓸 수 있어요.` };
  if (LINK.test(value)) return { ok: false, reason: '링크는 올릴 수 없어요.' };
  if (SPAM.test(value)) return { ok: false, reason: '리딩방 · 외부 채팅방 · 수익 보장 홍보는 올릴 수 없어요.' };
  if (BAD_WORDS.test(value)) return { ok: false, reason: '욕설은 올릴 수 없어요.' };
  return { ok: true, value };
}

/**
 * 화면에 보일 이름 — 가운데를 가린다 (2026-11-26 사용자 결정: 카카오 실명, 가운데 가림).
 *   김민수 → 김*수 · 남궁민수 → 남**수 · 김수 → 김* · 한 글자 → *
 * 서버는 가린 이름만 저장한다. 가리기 전 이름은 저장하지 않는다(필요 없는 개인정보를 쥐지 않는다).
 */
export function maskName(raw) {
  const s = String(raw ?? '').replace(/\s+/g, '').slice(0, 20);
  const chars = [...s];
  if (chars.length === 0) return '';
  if (chars.length === 1) return '*';
  if (chars.length === 2) return `${chars[0]}*`;
  return chars[0] + '*'.repeat(chars.length - 2) + chars[chars.length - 1];
}

/* ------------------------------ 레이팅 ------------------------------ */

/**
 * 고른 쪽에 함께 선 사람의 몫 — 이 판에서 "맞힐 것으로 기대되는 정도" 로 쓴다.
 * 양쪽에 CROWD_PRIOR 표씩 깔아 두어, 혼자 참여한 판이 0% / 100% 로 튀지 않는다.
 */
export function crowdShare(ups, downs, pick) {
  const u = Math.max(0, Number(ups) || 0);
  const d = Math.max(0, Number(downs) || 0);
  const same = pick === 'up' ? u : d;
  return (same + CROWD_PRIOR) / (u + d + 2 * CROWD_PRIOR);
}

/**
 * Elo 방식 응용 — 상대는 '그날 모인 사람들' 이다.
 *   맞히면 +K × (1 − 기대), 틀리면 −K × 기대.
 * 남들과 반대로 골라 맞히면 크게 오르고, 남들 따라 골랐다가 틀리면 크게 깎인다.
 * (남들 따라 맞히면 조금 오르고, 반대로 골랐다 틀리면 조금 깎인다.)
 * 사람들의 몫이 실제 확률과 같다면 어느 쪽을 골라도 기대 변화는 0 이다 — 찍기로 오르지 않는다.
 * 보합(flat)이나 무효(void)는 0.
 * @returns {number} 소수 첫째 자리까지
 */
export function ratingDelta(pick, result, ups, downs) {
  if (result !== 'up' && result !== 'down') return 0;
  const e = crowdShare(ups, downs, pick);
  const raw = pick === result ? RATING_K * (1 - e) : -RATING_K * e;
  return Math.round(raw * 10) / 10;
}

/** 직전 거래일 종가 대비 */
export function outcome(close, prevClose) {
  if (!Number.isFinite(close) || !Number.isFinite(prevClose)) return null;
  if (close > prevClose) return 'up';
  if (close < prevClose) return 'down';
  return 'flat';
}

/* ------------------------------ 판(라운드) 일정 ------------------------------ */

/**
 * 맞히기 대상. 장이 열리기 전까지 받고, 장이 닫히고 resolveAfterMin 분 뒤에 채점한다
 * (마감 직후의 시세는 아직 확정 전일 수 있다).
 */
export const GAME_MARKETS = {
  spx: { id: 'spx', name: 'S&P 500', region: '미국', bench: 'us', tz: 'America/New_York', open: [9, 30], close: [16, 0], resolveAfterMin: 30 },
  kospi: { id: 'kospi', name: 'KOSPI', region: '한국', bench: 'kr', tz: 'Asia/Seoul', open: [9, 0], close: [15, 30], resolveAfterMin: 30 },
};
export const GAME_MARKET_IDS = ['spx', 'kospi'];

const fmtCache = new Map();
function partsOf(t, tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** 그 시각이 그 도시 달력으로 며칠인가 — 'YYYY-MM-DD' */
export function dateKeyIn(t, tz) {
  const p = partsOf(t, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** 그 도시의 벽시계 시각 → 실제 순간(ms). 서머타임도 Intl 이 안다. */
export function zonedToUtc(dateKey, h, m, tz) {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, m, 0);
  let guess = wall;
  for (let i = 0; i < 3; i += 1) {
    const p = partsOf(guess, tz);
    const seen = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
    const next = guess + (wall - seen);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

function shiftKey(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d + days);
  return new Date(t).toISOString().slice(0, 10);
}

/** 주말 · 휴장일이 아니면 거래일 */
export function isTradingDay(dateKey, holidays = {}) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd !== 0 && wd !== 6 && !Object.prototype.hasOwnProperty.call(holidays, dateKey);
}

export function nextTradingDay(dateKey, holidays = {}) {
  let k = shiftKey(dateKey, 1);
  for (let i = 0; i < 20 && !isTradingDay(k, holidays); i += 1) k = shiftKey(k, 1);
  return k;
}

export function prevTradingDay(dateKey, holidays = {}) {
  let k = shiftKey(dateKey, -1);
  for (let i = 0; i < 20 && !isTradingDay(k, holidays); i += 1) k = shiftKey(k, -1);
  return k;
}

/** 한 판의 시각들 — cutoff(장 시작 = 마감), resolveAt(채점 가능) */
export function roundTimes(marketId, dateKey) {
  const g = GAME_MARKETS[marketId];
  const cutoff = zonedToUtc(dateKey, g.open[0], g.open[1], g.tz);
  const closeAt = zonedToUtc(dateKey, g.close[0], g.close[1], g.tz);
  return { cutoff, closeAt, resolveAt: closeAt + g.resolveAfterMin * 60_000 };
}

/**
 * 지금 받는 판(open)과, 마감됐지만 아직 결과가 안 난 판(running).
 * open = 장 시작이 아직 오지 않은 가장 가까운 거래일.
 * running = 장은 시작했고 채점 시각은 아직인 거래일 (없으면 null).
 */
export function roundsAt(now, marketId, holidays = {}) {
  const g = GAME_MARKETS[marketId];
  const today = dateKeyIn(now, g.tz);
  let openKey = isTradingDay(today, holidays) ? today : nextTradingDay(today, holidays);
  if (roundTimes(marketId, openKey).cutoff <= now) openKey = nextTradingDay(openKey, holidays);
  const last = prevTradingDay(openKey, holidays);
  const lt = roundTimes(marketId, last);
  const running = lt.cutoff <= now && now < lt.resolveAt ? last : null;
  return { open: openKey, running };
}

/**
 * 일별 시계열 → 그 도시 날짜별 종가. 같은 날 점이 여럿이면 마지막 것.
 * @returns {Map<string, number>}
 */
export function closesByDate(series, tz) {
  const out = new Map();
  for (const p of series ?? []) {
    if (p && Number.isFinite(p.t) && Number.isFinite(p.v)) out.set(dateKeyIn(p.t, tz), p.v);
  }
  return out;
}
