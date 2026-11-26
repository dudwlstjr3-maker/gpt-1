/**
 * 쫄탐광장 — 회원(닉네임) · 내일 맞히기 · 한 줄 토론 (2026-11-26).
 *
 * 규칙과 계산은 src/lib/plazaRules.mjs, 저장은 ./store.ts. 여기는 그 둘을 잇는다.
 *
 * 지키는 것
 *  - 가입 없이 닉네임만. 개인정보를 받지 않는다. 계정은 '복구 코드' 하나로 옮긴다 —
 *    코드는 해시로만 저장하고, 응답에는 만든 사람에게 한 번 돌려줄 때만 담는다.
 *  - IP 는 저장하지 않는다. 가입 횟수 제한에 쓰는 표는 IP + 날짜를 해시한 값이고 하루 뒤 사라진다.
 *  - DEMO 와 LIVE 는 이름공간이 다르다(zt:demo: / zt:live:). 서로의 판 · 순위 · 글이 섞이지 않는다.
 *  - DEMO 예시 회원 · 글은 메모리 저장소의 DEMO 에서만 만든다. 화면에 '예시' 로 적는다. LIVE 에는 없다.
 *  - 채점은 따로 도는 작업 없이, 누군가 광장을 열 때 밀린 판을 채점한다(잠금으로 한 번만).
 */

import { createHash, randomBytes } from 'node:crypto';
import {
  checkNickname, checkPost, ratingDelta, outcome, roundsAt, roundTimes, prevTradingDay, closesByDate,
  GAME_MARKETS, GAME_MARKET_IDS, RATING_START, RATING_K, LEADER_MIN_PLAYED, HIDE_AFTER_REPORTS,
  NICK_MIN, NICK_MAX, POST_MAX, type GameMarketId,
} from '@/lib/plazaRules.mjs';
import { US_HOLIDAYS, KR_HOLIDAYS } from '@/lib/marketHours';
import { mulberry32, hashSeed } from '@/lib/rng';
import { swr } from '@/server/cache';
import type { MarketAdapter, AdapterContext } from '@/server/adapters/types';
import type {
  DataMode, PlazaHistoryItem, PlazaLeader, PlazaMarketRounds, PlazaMe, PlazaPick, PlazaPost, PlazaResult, PlazaState,
} from '@/types';
import type { Cmd, PlazaStore, Reply } from './store';

const HOLIDAYS: Record<GameMarketId, Record<string, string>> = { spx: US_HOLIDAYS, kospi: KR_HOLIDAYS };
/** 하루에 한 곳(IP)에서 만들 수 있는 닉네임 수. DEMO 는 연습용이라 넉넉하게 */
const JOIN_PER_DAY: Record<DataMode, number> = { LIVE: 3, DEMO: 100 };
const POST_GAP_SEC = 20;
const POST_PER_DAY = 50;
const FEED_SIZE = 30;
const FEED_KEEP = 500;
/** 자료가 이만큼 지나도 없으면 그 판은 무효 */
const VOID_AFTER_MS = 7 * 86_400_000;

export class PlazaError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface PlazaCtx {
  store: PlazaStore;
  mode: DataMode;
  now: number;
  adapter: MarketAdapter;
  actx: AdapterContext;
}

const ns = (ctx: PlazaCtx) => `zt:${ctx.mode.toLowerCase()}:`;
const K = (ctx: PlazaCtx, ...parts: (string | number)[]) => ns(ctx) + parts.join(':');
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const asStr = (r: Reply | undefined): string | null => (typeof r === 'string' ? r : typeof r === 'number' ? String(r) : null);
const asNum = (r: Reply | undefined, d = 0): number => {
  const n = Number(asStr(r) ?? NaN);
  return Number.isFinite(n) ? n : d;
};
const pairs = (r: Reply | undefined): [string, string][] => {
  const a = Array.isArray(r) ? r.map((x) => asStr(x) ?? '') : [];
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < a.length; i += 2) out.push([a[i], a[i + 1]]);
  return out;
};
const r1 = (x: number) => Math.round(x * 10) / 10;

/* ------------------------------ 복구 코드 ------------------------------ */

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 80비트 무작위 → ZT-XXXX-XXXX-XXXX-XXXX */
function newKey(): string {
  const bytes = randomBytes(10);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < 80; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return `ZT-${out.match(/.{4}/g)!.join('-')}`;
}

/** 붙여 넣을 때 섞이는 공백 · 대시 · 소문자를 걷어 낸다 */
function normKey(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^ZT/, '');
}

export function ipTag(ip: string, now: number): string {
  return sha(`${ip}|${dayKey(now)}`).slice(0, 16);
}

/* ------------------------------ 회원 ------------------------------ */

export async function authenticate(ctx: PlazaCtx, rawKey: string | null): Promise<string | null> {
  if (!rawKey) return null;
  const nk = normKey(rawKey);
  if (nk.length !== 16) return null;
  const [uid] = await ctx.store.exec([['GET', K(ctx, 'key', sha(nk))]]);
  const id = asStr(uid);
  if (!id) return null;
  const [nick] = await ctx.store.exec([['HGET', K(ctx, 'u', id), 'nick']]);
  return asStr(nick) ? id : null;
}

export async function join(ctx: PlazaCtx, nickRaw: unknown, tag: string): Promise<{ nick: string; key: string }> {
  const c = checkNickname(nickRaw);
  if (!c.ok) throw new PlazaError(400, c.reason);
  const rl = K(ctx, 'rl', 'join', tag, dayKey(ctx.now));
  const [count] = await ctx.store.exec([['INCR', rl], ['EXPIRE', rl, 86_400]], { write: true });
  if (asNum(count) > JOIN_PER_DAY[ctx.mode]) throw new PlazaError(429, '오늘은 이곳에서 닉네임을 더 만들 수 없어요. 내일 다시 해 주세요.');
  const uid = randomBytes(8).toString('hex');
  const [taken] = await ctx.store.exec([['SET', K(ctx, 'nick', c.value.toLowerCase()), uid, 'NX']], { write: true });
  if (taken !== 'OK') throw new PlazaError(409, '이미 쓰는 닉네임이에요. 다른 이름을 골라 주세요.');
  const key = newKey();
  await ctx.store.exec(
    [
      ['SET', K(ctx, 'key', sha(normKey(key))), uid],
      ['HSET', K(ctx, 'u', uid), 'nick', c.value, 'created', ctx.now, 'rating', RATING_START, 'played', 0, 'correct', 0, 'streak', 0, 'best', 0, 'ex', 0],
    ],
    { write: true },
  );
  return { nick: c.value, key };
}

export async function restore(ctx: PlazaCtx, rawKey: unknown): Promise<{ nick: string; key: string }> {
  const key = typeof rawKey === 'string' ? rawKey : '';
  const uid = await authenticate(ctx, key);
  if (!uid) throw new PlazaError(404, '복구 코드를 찾지 못했어요. 다시 확인해 주세요.');
  const [nick] = await ctx.store.exec([['HGET', K(ctx, 'u', uid), 'nick']]);
  const n = normKey(key);
  return { nick: asStr(nick) ?? '', key: `ZT-${n.match(/.{4}/g)!.join('-')}` };
}

/* ------------------------------ 맞히기 ------------------------------ */

export async function predict(ctx: PlazaCtx, uid: string, market: unknown, pick: unknown, date: unknown): Promise<void> {
  if (!GAME_MARKET_IDS.includes(market as GameMarketId)) throw new PlazaError(400, '알 수 없는 시장이에요.');
  if (pick !== 'up' && pick !== 'down') throw new PlazaError(400, '오른다 또는 내린다를 골라 주세요.');
  const m = market as GameMarketId;
  const { open } = roundsAt(ctx.now, m, HOLIDAYS[m]);
  if (date !== open) throw new PlazaError(409, '그 판은 마감됐어요. 새로고침하면 다음 판이 보여요.');
  await ctx.store.exec(
    [
      ['HSET', K(ctx, 'r', m, open), uid, pick],
      ['SADD', K(ctx, 'pending'), `${m}:${open}`],
    ],
    { write: true },
  );
}

/** 그 시장 종가 표 — 같은 날 여러 번 부르지 않게 10분 기억한다 */
async function closesFor(ctx: PlazaCtx, m: GameMarketId): Promise<Map<string, number>> {
  const g = GAME_MARKETS[m];
  const res = await swr(
    `${ctx.mode}:plaza-closes:${m}:${dayKey(ctx.now)}`,
    async () => {
      const b = await ctx.adapter.getBenchmark(g.bench, ctx.actx);
      return [...closesByDate(b?.series ?? [], g.tz)];
    },
    { ttlMs: 10 * 60_000, maxStaleMs: 60 * 60_000 },
  );
  return new Map(res.value);
}

function lastBefore(closes: Map<string, number>, date: string): number | null {
  let best: string | null = null;
  for (const k of closes.keys()) if (k < date && (best === null || k > best)) best = k;
  return best === null ? null : (closes.get(best) ?? null);
}

/**
 * 채점 시각이 지난 판을 오래된 것부터 채점한다. 잠금으로 동시에 한 곳만 돈다.
 * 자료가 아직 없으면 두고, 7일이 지나도 없으면 무효로 닫는다(0 으로 채우지 않는다).
 */
export async function resolvePending(ctx: PlazaCtx): Promise<number> {
  const lock = K(ctx, 'lock', 'resolve');
  const [got] = await ctx.store.exec([['SET', lock, '1', 'NX', 'EX', 60]], { write: true });
  if (got !== 'OK') return 0;
  let resolved = 0;
  try {
    const [pend] = await ctx.store.exec([['SMEMBERS', K(ctx, 'pending')]]);
    const due = (Array.isArray(pend) ? pend.map((x) => asStr(x) ?? '') : [])
      .map((s) => {
        const [m, date] = s.split(':');
        return { m: m as GameMarketId, date, raw: s };
      })
      .filter((r) => GAME_MARKET_IDS.includes(r.m) && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
      .filter((r) => roundTimes(r.m, r.date).resolveAt <= ctx.now)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (!due.length) return 0;

    const closes: Partial<Record<GameMarketId, Map<string, number>>> = {};
    for (const r of due) {
      closes[r.m] ??= await closesFor(ctx, r.m).catch(() => new Map<string, number>());
      const table = closes[r.m]!;
      const c = table.get(r.date) ?? null;
      const p = table.get(prevTradingDay(r.date, HOLIDAYS[r.m])) ?? lastBefore(table, r.date);
      let result: PlazaResult;
      if (c === null || p === null) {
        if (ctx.now - roundTimes(r.m, r.date).resolveAt < VOID_AFTER_MS) continue;
        result = 'void';
      } else {
        result = outcome(c, p) ?? 'void';
      }
      await settle(ctx, r.m, r.date, r.raw, result, c, p);
      resolved += 1;
    }
  } finally {
    await ctx.store.exec([['DEL', lock]], { write: true });
  }
  return resolved;
}

async function settle(
  ctx: PlazaCtx, m: GameMarketId, date: string, raw: string, result: PlazaResult, close: number | null, prev: number | null,
): Promise<void> {
  const [all] = await ctx.store.exec([['HGETALL', K(ctx, 'r', m, date)]]);
  const preds = pairs(all).filter(([, v]) => v === 'up' || v === 'down') as [string, PlazaPick][];
  const ups = preds.filter(([, v]) => v === 'up').length;
  const downs = preds.length - ups;
  const users = preds.length
    ? await ctx.store.exec(preds.map(([uid]) => ['HMGET', K(ctx, 'u', uid), 'rating', 'played', 'correct', 'streak', 'best', 'nick', 'ex']))
    : [];
  const counted = result === 'up' || result === 'down';
  const writes: Cmd[] = [];
  preds.forEach(([uid, pick], i) => {
    const u = Array.isArray(users[i]) ? (users[i] as Reply[]) : [];
    if (!asStr(u[5])) return; // 사라진 회원
    const delta = ratingDelta(pick, result, ups, downs);
    let rating = asNum(u[0], RATING_START);
    let played = asNum(u[1]);
    let correct = asNum(u[2]);
    let streak = asNum(u[3]);
    let best = asNum(u[4]);
    if (counted) {
      const hit = pick === result;
      rating = r1(rating + delta);
      played += 1;
      correct += hit ? 1 : 0;
      streak = hit ? streak + 1 : 0;
      best = Math.max(best, streak);
    }
    writes.push(['HSET', K(ctx, 'u', uid), 'rating', rating, 'played', played, 'correct', correct, 'streak', streak, 'best', best]);
    const item: PlazaHistoryItem = { market: m, date, pick, result, delta: counted ? delta : 0 };
    writes.push(['LPUSH', K(ctx, 'h', uid), JSON.stringify(item)], ['LTRIM', K(ctx, 'h', uid), 0, 29]);
    if (played >= LEADER_MIN_PLAYED) {
      writes.push(
        ['ZADD', K(ctx, 'lb'), rating, uid],
        ['HSET', K(ctx, 'lbinfo'), uid, JSON.stringify({ nick: asStr(u[5]), played, correct, ex: asStr(u[6]) === '1' })],
      );
    }
  });
  const changePct = close !== null && prev !== null && prev !== 0 ? Math.round((close / prev - 1) * 10000) / 100 : null;
  writes.push(
    ['HSET', K(ctx, 'rm', m, date), 'result', result, 'ups', ups, 'downs', downs, 'n', preds.length, 'changePct', changePct ?? '', 'at', ctx.now],
    ['LPUSH', K(ctx, 'done', m), date],
    ['LTRIM', K(ctx, 'done', m), 0, 29],
    ['SREM', K(ctx, 'pending'), raw],
  );
  await ctx.store.exec(writes, { write: true });
}

/* ------------------------------ 한 줄 토론 ------------------------------ */

export async function addPost(ctx: PlazaCtx, uid: string, textRaw: unknown): Promise<void> {
  const c = checkPost(textRaw);
  if (!c.ok) throw new PlazaError(400, c.reason);
  const gap = K(ctx, 'rl', 'post', uid);
  const daily = K(ctx, 'rl', 'postday', uid, dayKey(ctx.now));
  const [okGap] = await ctx.store.exec([['SET', gap, '1', 'NX', 'EX', POST_GAP_SEC]], { write: true });
  if (okGap !== 'OK') throw new PlazaError(429, `글은 ${POST_GAP_SEC}초에 하나씩 올릴 수 있어요.`);
  const [n] = await ctx.store.exec([['INCR', daily], ['EXPIRE', daily, 86_400]], { write: true });
  if (asNum(n) > POST_PER_DAY) throw new PlazaError(429, `하루에 ${POST_PER_DAY}개까지 올릴 수 있어요.`);
  const [id, nick] = await ctx.store.exec([['INCR', K(ctx, 'seq', 'post')], ['HGET', K(ctx, 'u', uid), 'nick']], { write: true });
  const pid = String(asNum(id));
  await ctx.store.exec(
    [
      ['HSET', K(ctx, 'posts'), pid, JSON.stringify({ id: pid, uid, nick: asStr(nick), text: c.value, t: ctx.now, ex: 0 })],
      ['LPUSH', K(ctx, 'posts', 'ids'), pid],
      ['LTRIM', K(ctx, 'posts', 'ids'), 0, FEED_KEEP - 1],
    ],
    { write: true },
  );
}

async function postAuthor(ctx: PlazaCtx, id: unknown): Promise<{ pid: string; uid: string }> {
  const pid = typeof id === 'string' && /^\d{1,12}$/.test(id) ? id : '';
  const [raw] = pid ? await ctx.store.exec([['HGET', K(ctx, 'posts'), pid]]) : [null];
  const s = asStr(raw);
  if (!s) throw new PlazaError(404, '없는 글이에요.');
  return { pid, uid: String(JSON.parse(s).uid) };
}

/** 공감 — 한 번 더 누르면 취소 */
export async function toggleLike(ctx: PlazaCtx, uid: string, id: unknown): Promise<void> {
  const { pid } = await postAuthor(ctx, id);
  const [added] = await ctx.store.exec([['SADD', K(ctx, 'lk', pid), uid]], { write: true });
  if (asNum(added) === 1) {
    await ctx.store.exec([['HINCRBY', K(ctx, 'likes'), pid, 1], ['SADD', K(ctx, 'ul', uid), pid]], { write: true });
  } else {
    await ctx.store.exec(
      [['SREM', K(ctx, 'lk', pid), uid], ['HINCRBY', K(ctx, 'likes'), pid, -1], ['SREM', K(ctx, 'ul', uid), pid]],
      { write: true },
    );
  }
}

/** 신고 — 사람마다 한 번. HIDE_AFTER_REPORTS 명이 신고하면 가린다 */
export async function report(ctx: PlazaCtx, uid: string, id: unknown): Promise<void> {
  const { pid, uid: author } = await postAuthor(ctx, id);
  if (author === uid) throw new PlazaError(400, '내 글은 신고할 수 없어요.');
  const [added] = await ctx.store.exec([['SADD', K(ctx, 'rp', pid), uid]], { write: true });
  if (asNum(added) === 1) {
    await ctx.store.exec([['HINCRBY', K(ctx, 'reports'), pid, 1], ['SADD', K(ctx, 'ur', uid), pid]], { write: true });
  }
}

export async function adminDelete(ctx: PlazaCtx, id: unknown): Promise<void> {
  const { pid } = await postAuthor(ctx, id);
  await ctx.store.exec([['HDEL', K(ctx, 'posts'), pid], ['LREM', K(ctx, 'posts', 'ids'), 0, pid]], { write: true });
}

/* ------------------------------ DEMO 예시 ------------------------------ */

const EXAMPLE_NICKS = ['예시_황소', '예시_곰', '예시_거북이', '예시_다람쥐', '예시_올빼미', '예시_고래', '예시_치타', '예시_판다', '예시_펭귄', '예시_여우', '예시_수달', '예시_너구리'];
/** 오른다를 고를 확률 — 낙관 · 비관 · 반반이 섞이게 */
const EXAMPLE_BIAS = [0.75, 0.25, 0.5, 0.6, 0.4, 0.55, 0.7, 0.45, 0.5, 0.35, 0.65, 0.5];
const EXAMPLE_POSTS = [
  '다음 판은 일단 오른다에 걸어 봄. 게임이니까 가볍게',
  'VIX 가 낮으면 평온한 편이라던데 체감은 꼭 그렇진 않네요',
  '쫄탐지수랑 추세 칩이 서로 다른 말을 할 때가 제일 헷갈려요',
  '코스피 내일은 내린다에 한 표. 틀리면 레이팅 조금만 깎이길',
  '순위 1등 분 비결 좀 알려 주세요 ㅋㅋ',
  '남들 따라 골랐다 틀리면 크게 깎이는 거 알고 나서 생각이 많아짐',
];

/**
 * DEMO + 메모리 저장소일 때만, 한 번만. 예시 회원 12명이 지난 30거래일을 골랐다고 두고
 * 실제 채점 경로(resolvePending)로 DEMO 종가에 맞춰 채점한다 — 순위표 · 지난 결과가 비어 있지 않게.
 */
export async function seedExamples(ctx: PlazaCtx): Promise<void> {
  if (ctx.mode !== 'DEMO' || ctx.store.kind !== 'memory') return;
  const [first] = await ctx.store.exec([['SET', K(ctx, 'seeded'), '1', 'NX']], { write: true });
  if (first !== 'OK') return;
  const rand = mulberry32(hashSeed(`plaza-examples:${dayKey(ctx.now)}`));
  const uids = EXAMPLE_NICKS.map((_, i) => `ex${String(i).padStart(2, '0')}`);
  const cmds: Cmd[] = uids.map((uid, i) => [
    'HSET', K(ctx, 'u', uid), 'nick', EXAMPLE_NICKS[i], 'created', ctx.now, 'rating', RATING_START,
    'played', 0, 'correct', 0, 'streak', 0, 'best', 0, 'ex', 1,
  ]);
  for (const m of GAME_MARKET_IDS) {
    const { open } = roundsAt(ctx.now, m, HOLIDAYS[m]);
    let d = open;
    const past: string[] = [];
    for (let i = 0; i < 30; i += 1) {
      d = prevTradingDay(d, HOLIDAYS[m]);
      if (roundTimes(m, d).resolveAt <= ctx.now) past.push(d);
    }
    for (const date of [...past, open]) {
      const votes: (string | number)[] = [];
      uids.forEach((uid, i) => {
        if (rand() < (date === open ? 0.6 : 0.85)) votes.push(uid, rand() < EXAMPLE_BIAS[i] ? 'up' : 'down');
      });
      if (votes.length) cmds.push(['HSET', K(ctx, 'r', m, date), ...votes], ['SADD', K(ctx, 'pending'), `${m}:${date}`]);
    }
  }
  EXAMPLE_POSTS.forEach((text, i) => {
    const pid = `${900000 + i}`;
    const uid = uids[(i * 5) % uids.length];
    cmds.push(
      ['HSET', K(ctx, 'posts'), pid, JSON.stringify({ id: pid, uid, nick: EXAMPLE_NICKS[(i * 5) % uids.length], text, t: ctx.now - (EXAMPLE_POSTS.length - i) * 23 * 60_000, ex: 1 })],
      ['LPUSH', K(ctx, 'posts', 'ids'), pid],
      ['HSET', K(ctx, 'likes'), pid, Math.floor(rand() * 9)],
    );
  });
  await ctx.store.exec(cmds, { write: true });
}

/* ------------------------------ 화면이 읽는 모양 ------------------------------ */

export async function getState(ctx: PlazaCtx, uid: string | null): Promise<PlazaState> {
  await seedExamples(ctx);
  // 채점이 실패해도 광장은 열린다 — 판은 다음에 다시 채점한다
  await resolvePending(ctx).catch(() => 0);

  const markets: PlazaMarketRounds[] = [];
  for (const m of GAME_MARKET_IDS) {
    const g = GAME_MARKETS[m];
    const { open, running } = roundsAt(ctx.now, m, HOLIDAYS[m]);
    const [openAll, runAll, doneList] = await ctx.store.exec([
      ['HGETALL', K(ctx, 'r', m, open)],
      running ? ['HGETALL', K(ctx, 'r', m, running)] : ['HGETALL', K(ctx, 'none')],
      ['LRANGE', K(ctx, 'done', m), 0, 4],
    ]);
    const tally = (r: Reply) => {
      const p = pairs(r);
      const ups = p.filter(([, v]) => v === 'up').length;
      return { n: p.length, ups, downs: p.length - ups, mine: (uid ? (p.find(([k]) => k === uid)?.[1] ?? null) : null) as PlazaPick | null };
    };
    const o = tally(openAll);
    const rn = tally(runAll);
    const dates = Array.isArray(doneList) ? doneList.map((x) => asStr(x) ?? '').filter(Boolean) : [];
    const metas = dates.length
      ? await ctx.store.exec(dates.flatMap((d) => [['HGETALL', K(ctx, 'rm', m, d)], uid ? ['HGET', K(ctx, 'r', m, d), uid] : ['GET', K(ctx, 'none')]] as Cmd[]))
      : [];
    const recent = dates.map((date, i) => {
      const meta = Object.fromEntries(pairs(metas[i * 2]));
      const myPick = (asStr(metas[i * 2 + 1]) as PlazaPick | null) ?? null;
      const result = (meta.result ?? 'void') as PlazaResult;
      const ups = Number(meta.ups ?? 0);
      const downs = Number(meta.downs ?? 0);
      return {
        date,
        result,
        changePct: meta.changePct ? Number(meta.changePct) : null,
        n: Number(meta.n ?? 0),
        ups,
        downs,
        myPick,
        myDelta: myPick ? ratingDelta(myPick, result, ups, downs) : null,
      };
    });
    markets.push({
      market: m,
      name: g.name,
      region: g.region,
      open: {
        date: open,
        cutoff: new Date(roundTimes(m, open).cutoff).toISOString(),
        n: o.n,
        ups: o.mine ? o.ups : null,
        downs: o.mine ? o.downs : null,
        myPick: o.mine,
      },
      running: running
        ? { date: running, resolveAt: new Date(roundTimes(m, running).resolveAt).toISOString(), n: rn.n, ups: rn.ups, downs: rn.downs, myPick: rn.mine }
        : null,
      recent,
    });
  }

  /* 순위표 */
  const [top, ranked] = await ctx.store.exec([['ZREVRANGE', K(ctx, 'lb'), 0, 19, 'WITHSCORES'], ['ZCARD', K(ctx, 'lb')]]);
  const topPairs = pairs(top);
  const [infos] = topPairs.length
    ? await ctx.store.exec([['HMGET', K(ctx, 'lbinfo'), ...topPairs.map(([u]) => u)]])
    : [[]];
  const leaderboard: PlazaLeader[] = topPairs.map(([u, score], i) => {
    const info = JSON.parse(asStr((infos as Reply[])[i]) ?? '{}');
    return {
      rank: i + 1,
      nick: String(info.nick ?? ''),
      rating: Math.round(Number(score)),
      played: Number(info.played ?? 0),
      correct: Number(info.correct ?? 0),
      me: u === uid,
      example: !!info.ex,
    };
  });

  /* 나 */
  let me: PlazaMe | null = null;
  let likedSet = new Set<string>();
  let reportedSet = new Set<string>();
  if (uid) {
    const [u, rank, hist, ul, ur] = await ctx.store.exec([
      ['HGETALL', K(ctx, 'u', uid)],
      ['ZREVRANK', K(ctx, 'lb'), uid],
      ['LRANGE', K(ctx, 'h', uid), 0, 9],
      ['SMEMBERS', K(ctx, 'ul', uid)],
      ['SMEMBERS', K(ctx, 'ur', uid)],
    ]);
    const f = Object.fromEntries(pairs(u));
    me = {
      nick: f.nick ?? '',
      rating: Math.round(Number(f.rating ?? RATING_START)),
      played: Number(f.played ?? 0),
      correct: Number(f.correct ?? 0),
      streak: Number(f.streak ?? 0),
      best: Number(f.best ?? 0),
      rank: rank === null || rank === undefined ? null : asNum(rank) + 1,
      history: (Array.isArray(hist) ? hist : []).map((x) => JSON.parse(asStr(x) ?? '{}') as PlazaHistoryItem),
    };
    likedSet = new Set((Array.isArray(ul) ? ul : []).map((x) => asStr(x) ?? ''));
    reportedSet = new Set((Array.isArray(ur) ? ur : []).map((x) => asStr(x) ?? ''));
  }

  /* 한 줄 토론 */
  const [ids] = await ctx.store.exec([['LRANGE', K(ctx, 'posts', 'ids'), 0, FEED_SIZE - 1]]);
  const idList = Array.isArray(ids) ? ids.map((x) => asStr(x) ?? '').filter(Boolean) : [];
  let posts: PlazaPost[] = [];
  if (idList.length) {
    const [raws, likes, reps] = await ctx.store.exec([
      ['HMGET', K(ctx, 'posts'), ...idList],
      ['HMGET', K(ctx, 'likes'), ...idList],
      ['HMGET', K(ctx, 'reports'), ...idList],
    ]);
    const items = idList
      .map((id, i) => ({ id, raw: asStr((raws as Reply[])[i]), likes: asNum((likes as Reply[])[i]), reports: asNum((reps as Reply[])[i]) }))
      .filter((x) => x.raw);
    const parsed = items.map((x) => ({ ...x, p: JSON.parse(x.raw as string) as { id: string; uid: string; nick: string; text: string; t: number; ex: number } }));
    const authors = [...new Set(parsed.map((x) => x.p.uid))];
    const scores = authors.length ? await ctx.store.exec(authors.map((a) => ['ZSCORE', K(ctx, 'lb'), a] as Cmd)) : [];
    const scoreOf = new Map(authors.map((a, i) => [a, asStr(scores[i])]));
    posts = parsed.map(({ p, likes: lk, reports: rp }) => {
      const mine = !!uid && p.uid === uid;
      const hidden = rp >= HIDE_AFTER_REPORTS;
      const sc = scoreOf.get(p.uid);
      return {
        id: p.id,
        nick: p.nick,
        rating: sc ? Math.round(Number(sc)) : null,
        text: hidden && !mine ? null : p.text,
        t: new Date(p.t).toISOString(),
        likes: Math.max(0, lk),
        liked: likedSet.has(p.id),
        reported: reportedSet.has(p.id),
        hidden,
        mine,
        example: p.ex === 1,
      };
    });
  }

  return {
    mode: ctx.mode,
    storage: ctx.store.kind,
    asOf: new Date(ctx.now).toISOString(),
    me,
    markets,
    leaderboard,
    ranked: asNum(ranked),
    posts,
    rules: { nickMin: NICK_MIN, nickMax: NICK_MAX, postMax: POST_MAX, minPlayed: LEADER_MIN_PLAYED, hideAfter: HIDE_AFTER_REPORTS, ratingStart: RATING_START, k: RATING_K },
  };
}
