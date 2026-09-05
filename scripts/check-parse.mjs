/**
 * LIVE 파싱 점검 — 키 없이, 네트워크 없이 돌아간다.
 *
 *   npm run check:parse
 *
 * 무엇을 확인하나
 *   제공사 응답과 **같은 모양**을 돌려주는 로컬 대역 서버(live-stub.mjs)를 띄우고,
 *   앱을 LIVE 모드로 그쪽에 붙여 스냅샷을 받아 본다. 그래서 확인되는 것은 하나다 —
 *   "제공사가 저 모양으로 답하면 우리 코드가 터지지 않고 읽어 낸다".
 *
 * 무엇을 확인하지 못하나
 *   제공사가 살아 있는지, 값이 맞는지, 응답 모양이 정말 저런지는 확인하지 못한다.
 *   그건 키를 넣고 `npm run check:live` 로 실제 제공사에 물어야 안다.
 *   둘은 짝이다 — 이 스크립트는 우리 코드를, 저 스크립트는 제공사를 본다.
 *
 * 왜 필요한가
 *   LIVE 경로는 DEMO 로 개발하는 동안 한 줄도 실행되지 않는다. 키를 넣는 순간
 *   처음 돌아가는 코드라, 그때 처음 터지면 원인을 찾기 어렵다.
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const STUB_PORT = Number(process.env.STUB_PORT ?? 4599);
const APP_PORT = Number(process.env.APP_PORT ?? 3111);
const BASE = `http://localhost:${STUB_PORT}`;

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const env = {
  ...process.env,
  MARKET_MOOD_MODE: 'live',
  MACRO_API_KEY: 'stub-key-not-real',
  MACRO_BASE_URL: `${BASE}/fred`,
  US_MARKET_BASE_URL: BASE,
  CRYPTO_BASE_URL: `${BASE}/cg`,
  CRYPTO_DERIV_BASE_URL: `${BASE}/bn`,
  WORLDBANK_BASE_URL: `${BASE}/wb`,
  BIGMAC_CSV_URL: `${BASE}/bigmac.csv`,
  CBOE_CSV_URL: `${BASE}/cboe.csv`,
  PORT: String(APP_PORT),
};

const procs = [];
function stop() {
  for (const p of procs) { try { p.kill('SIGTERM'); } catch { /* 이미 죽었으면 그만 */ } }
}
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

async function waitFor(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch { /* 아직 안 떴다 */ }
    await sleep(700);
  }
  return false;
}

console.log(`대역 서버 :${STUB_PORT} · 앱 :${APP_PORT} 을 띄웁니다 (값은 전부 가짜입니다)\n`);

procs.push(spawn('node', ['scripts/live-stub.mjs', String(STUB_PORT)], { stdio: 'ignore' }));
if (!(await waitFor(`${BASE}/cg/global`, 15000))) {
  console.log('대역 서버가 뜨지 않았습니다.');
  process.exit(1);
}

procs.push(spawn('npx', ['next', 'dev', '-p', String(APP_PORT)], { env, stdio: 'ignore' }));
const appUp = await waitFor(`http://localhost:${APP_PORT}/api/health`, 120000);
if (!appUp) {
  console.log('앱이 뜨지 않았습니다.');
  process.exit(1);
}

const health = await (await fetch(`http://localhost:${APP_PORT}/api/health`)).json();
console.log('[모드]');
check('LIVE 모드로 들어감', health.mode === 'LIVE', `mode=${health.mode}`);

const snap = await (await fetch(`http://localhost:${APP_PORT}/api/snapshot`, { signal: AbortSignal.timeout(240000) })).json();

console.log('\n[섹션] 제공사가 같은 모양으로 답할 때 읽어 내는가');
check('전체가 죽지 않음', !snap.fatalError, snap.fatalError ?? '');
check('모드가 LIVE', snap.mode === 'LIVE');

/* 붙인 것은 살아야 한다 */
for (const key of ['quotes', 'macro', 'basics', 'calendar', 'regime', 'fng']) {
  const sec = snap.sections?.[key];
  const ok = sec && sec.status !== 'error' && sec.data !== null;
  check(`${key} 를 읽어 냄`, ok, sec ? `status=${sec.status}${sec.error ? ` (${String(sec.error).slice(0, 60)})` : ''}` : '섹션 없음');
}

/* 아직 안 붙인 것은 '안 붙었다' 고 말해야 한다 — 조용히 빈 값을 만들면 안 된다 */
for (const key of ['flows', 'news']) {
  const sec = snap.sections?.[key];
  check(`${key} 는 미연결이라고 밝힘`, sec?.status === 'error' && /구현되지 않았습니다/.test(String(sec.error ?? '')));
}

console.log('\n[값] 숫자가 실제로 뽑혀 나오는가');
const quotes = snap.sections?.quotes?.data ?? {};
const priced = ['us', 'kr', 'crypto'].flatMap((m) => quotes[m] ?? []).filter((q) => q.price !== null);
check('가격이 붙은 종목이 있음', priced.length >= 20, `${priced.length}개`);

const macro = (snap.sections?.macro?.data ?? []).filter((m) => m.value !== null);
check('거시 지표 값이 있음', macro.length >= 5, `${macro.length}개`);

const cal = snap.sections?.calendar?.data ?? [];
check('발표 일정을 골라냄', cal.length > 0, `${cal.length}건`);

const board = snap.sections?.regime?.data?.board;
check('국면 점수가 나옴', typeof board?.score === 'number', board ? `score=${board.score?.toFixed?.(1)} coverage=${Math.round((board.coverage ?? 0) * 100)}%` : '없음');
check('국면 축 네 개가 다 살아 있음', (board?.axes ?? []).every((a) => a.percentile !== null),
  (board?.axes ?? []).map((a) => `${a.short}${a.percentile === null ? '✗' : '✓'}`).join(' '));

console.log('\n[커버리지] 무료 소스로 문턱(70%)을 넘는 시장');
for (const f of snap.sections?.fng?.data ?? []) {
  const pct = Math.round((f.coverage ?? 0) * 100);
  const scored = f.score !== null;
  console.log(`  · ${f.market.padEnd(7)} ${String(pct).padStart(3)}%  ${scored ? `산출 ${f.score}` : '산출 불가'}`);
}
const us = (snap.sections?.fng?.data ?? []).find((f) => f.market === 'us');
check('미국은 문턱을 넘어 점수가 나옴', us?.score !== null && us?.score !== undefined,
  us ? `coverage=${Math.round((us.coverage ?? 0) * 100)}%` : '없음');
// 크립토는 무료 소스로 63% 라 넘지 못하는 것이 정상이다. 넘었다면 없는 값을 채웠다는 뜻이라 더 나쁘다.
const cr = (snap.sections?.fng?.data ?? []).find((f) => f.market === 'crypto');
check('크립토는 문턱을 못 넘고 사유를 밝힘', cr?.score === null && !!cr?.unavailableReason,
  cr ? `coverage=${Math.round((cr.coverage ?? 0) * 100)}%` : '없음');

console.log('\n[결측] 없는 값을 지어내지 않는가');
const zeroed = (snap.sections?.macro?.data ?? []).filter((m) => m.value === 0 && m.unavailableReason);
check('산출 불가인데 0 으로 채운 지표가 없음', zeroed.length === 0, zeroed.map((m) => m.id).join(', ') || '없음');

console.log(`\n결과: ${pass}건 통과, ${fail}건 실패`);
console.log('이 점검은 **우리 코드가 읽어 내는가** 만 봅니다. 제공사가 살아 있는지는');
console.log('키를 넣고 `npm run check:live` 로 확인하세요.');
stop();
process.exit(fail > 0 ? 1 : 0);
