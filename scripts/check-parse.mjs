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
  EIA_API_KEY: 'stub-key-not-real',
  EIA_BASE_URL: `${BASE}/eia`,
  SEC_BASE_URL: `${BASE}/sec`,
  SEC_USER_AGENT: 'MarketMood3-check-parse (stub)',
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
for (const key of ['quotes', 'macro', 'basics', 'calendar', 'regime', 'fng', 'futures']) {
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

console.log('\n[선물] EIA 인도월 정산가를 읽어 내는가');
const fut = snap.sections?.futures?.data;
const futRows = fut?.rows ?? [];
const byId = Object.fromEntries(futRows.map((r) => [r.id, r]));
check('선물 판이 항목을 다 실어 보냄', futRows.length >= 39, `${futRows.length}개`);
check('값을 채운 항목이 있음', (fut?.availableCount ?? 0) >= 18, `${fut?.availableCount}/${fut?.totalCount}`);

for (const id of ['cl', 'ng', 'ho', 'rb']) {
  const r = byId[id];
  const n = r?.curve?.length ?? 0;
  check(`${id} — EIA 인도월 ${n}개를 읽음`, n >= 2,
    r ? (r.last === null ? `값 없음 (${String(r.unavailableReason ?? '').slice(0, 60)})` : `근월 ${r.last}`) : '줄이 없음');
  // EIA 로 받았으면 '대신 쓴 값' 이 붙으면 안 된다 — 진짜 선물 정산가다
  check(`${id} — 선물 정산가라 '대신 쓴 값' 표시가 없음`, !!r && !r.proxyNote, r?.proxyNote ?? '없음');
  check(`${id} — 출처가 EIA 로 찍힘`, (r?.meta?.sources ?? []).some((x) => /EIA/.test(x?.name ?? '')),
    (r?.meta?.sources ?? []).map((x) => x.name).join(', ') || '없음');
}

// 곡선의 네 점은 **같은 날**이어야 한다. 날짜가 섞이면 그건 곡선이 아니라 시차다.
const clCurve = byId.cl?.curve ?? [];
check('곡선의 인도월이 모두 같은 날', clCurve.length >= 2 && new Set(clCurve.map((c) => c.at)).size === 1,
  `${new Set(clCurve.map((c) => c.at)).size}개 날짜`);

// 거래소 유료 항목은 EIA 를 붙였다고 채워지면 안 된다
const paid = ['es', 'gc', 'zc'].map((id) => byId[id]).filter(Boolean);
check('거래소 유료 항목은 여전히 비어 있고 사유가 있음',
  paid.length === 3 && paid.every((r) => r.last === null && !!r.unavailableReason),
  paid.map((r) => `${r.id}=${r.last === null ? '빔' : r.last}`).join(' '));

console.log('\n[재무제표] SEC 공시를 읽어 내는가');
{
  const res = await fetch(`http://localhost:${APP_PORT}/api/asset/aapl`, { signal: AbortSignal.timeout(120000) });
  const a = await res.json();
  const f = a?.fundamentals;
  check('종목 상세에 재무제표가 실려 옴', Boolean(f), f ? `${f.lines?.length}줄` : String(a?.fundamentalsUnavailable ?? '없음'));
  if (f) {
    const byId = Object.fromEntries((f.lines ?? []).map((l) => [l.id, l]));
    for (const id of ['revenue', 'operating_income', 'net_income', 'eps']) {
      const l = byId[id];
      check(`${id} — 분기 값을 읽음`, (l?.quarterly ?? []).length >= 4,
        l ? `${l.quarterly.length}분기 · 태그 ${l.tag ?? '없음'}` : '줄이 없음');
    }
    // ② 한 태그에 섞여 오는 9개월 누적을 분기로 잘못 담지 않았는가
    const rq = byId.revenue?.quarterly ?? [];
    const spans = rq.map((p) => Math.round((Date.parse(p.end) - Date.parse(p.start)) / 86400000));
    check('분기 칸에 3개월짜리만 들어감', spans.length > 0 && spans.every((d) => d >= 80 && d <= 100),
      spans.length ? `${Math.min(...spans)}~${Math.max(...spans)}일` : '없음');
    const ra = byId.revenue?.annual ?? [];
    const aspans = ra.map((p) => Math.round((Date.parse(p.end) - Date.parse(p.start)) / 86400000));
    check('연간 칸에 12개월짜리만 들어감', aspans.length > 0 && aspans.every((d) => d >= 340 && d <= 380),
      aspans.length ? `${Math.min(...aspans)}~${Math.max(...aspans)}일` : '없음');
    // ③ 수정 공시가 오면 나중 것을 썼는가 (같은 기간이 두 줄로 남으면 안 된다)
    const keys = rq.map((p) => `${p.start}|${p.end}`);
    check('같은 기간이 두 번 담기지 않음', new Set(keys).size === keys.length, `${keys.length}개`);
    // ④ 시점 값(재무상태표)은 기간이 없다
    const liab = byId.liabilities?.annual ?? [];
    check('재무상태표 항목은 시점 값으로 담김', liab.length > 0 && liab.every((p) => !p.start), `${liab.length}개`);
    // 회사가 안 쓰는 태그는 404 → 그 줄만 사유와 함께 빈다 (전체가 죽지 않는다)
    check('PER 을 냈거나 왜 못 냈는지 밝힘', typeof f.valuation?.note === 'string' && f.valuation.note.length > 0,
      f.valuation?.per === null ? f.valuation?.note?.slice(0, 50) : `${f.valuation.per?.toFixed(1)}배 (${f.valuation.basis})`);
  }
  // 공시가 없는 대상은 '없다' 고 말해야 한다 — 조용히 빈 상자를 두면 안 된다
  const idx = await (await fetch(`http://localhost:${APP_PORT}/api/asset/spx`, { signal: AbortSignal.timeout(120000) })).json();
  check('지수에는 재무제표가 없다고 밝힘', !idx?.fundamentals && /공시/.test(String(idx?.fundamentalsUnavailable ?? '')),
    String(idx?.fundamentalsUnavailable ?? '').slice(0, 50));
}

console.log('\n[결측] 없는 값을 지어내지 않는가');
const zeroed = (snap.sections?.macro?.data ?? []).filter((m) => m.value === 0 && m.unavailableReason);
check('산출 불가인데 0 으로 채운 지표가 없음', zeroed.length === 0, zeroed.map((m) => m.id).join(', ') || '없음');

console.log(`\n결과: ${pass}건 통과, ${fail}건 실패`);
console.log('이 점검은 **우리 코드가 읽어 내는가** 만 봅니다. 제공사가 살아 있는지는');
console.log('키를 넣고 `npm run check:live` 로 확인하세요.');
stop();
process.exit(fail > 0 ? 1 : 0);
