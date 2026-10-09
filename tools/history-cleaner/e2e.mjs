/**
 * 기록 지우개를 실제 Chromium 에 올려서 기능을 하나씩 확인한다.
 *
 *   npm i --no-save playwright && npx playwright install chromium
 *   node tools/history-cleaner/e2e.mjs [스크린숏 저장 폴더]
 *
 * 매번 빈 프로필을 새로 만들어 쓰므로 평소 쓰는 브라우저 기록에는 손대지 않는다.
 *
 * --load-extension 으로 올리면 Chrome 이 켤 때마다 '새로 설치'로 보고 onStartup 을 쏘지 않는다.
 * 그래서 chrome://extensions 의 '압축해제된 확장 프로그램 로드'와 같은 경로(CDP Extensions.loadUnpacked)로 한 번만 설치한다.
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT = resolve(dirname(fileURLToPath(import.meta.url)), '../../extensions/history-cleaner');
const SHOTS = process.argv[2];

const server = createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (req.url.startsWith('/cookie')) res.setHeader('set-cookie', 'session=1; Max-Age=3600');
  res.end(`<!doctype html><title>page ${req.url}</title><h1>${req.url}</h1>`);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const PORT = server.address().port;
const A = (path) => `http://127.0.0.1:${PORT}${path}`;
const L = (path) => `http://localhost:${PORT}${path}`;

const profile = mkdtempSync(join(tmpdir(), 'history-cleaner-'));
const launch = () =>
  chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: ['--enable-unsafe-extension-debugging'],
    ignoreDefaultArgs: ['--disable-extensions'],
  });

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failed += 1;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(100);
  }
  return v;
}

let ctx = await launch();
const { id: extId } = await (await ctx.browser().newBrowserCDPSession()).send('Extensions.loadUnpacked', { path: EXT });
const POPUP = `chrome-extension://${extId}/popup.html`;
const findWorker = () => until(() => ctx.serviceWorkers().find((w) => w.url().includes(extId)), 5000);
let sw = await findWorker();

const urls = () => sw.evaluate(async () => (await chrome.history.search({ text: '', startTime: 0, maxResults: 0 })).map((i) => i.url));
const alarm = () => sw.evaluate(() => chrome.alarms.get('auto-clear'));
const last = () => sw.evaluate(async () => (await chrome.storage.local.get('last')).last);
const setSettings = (patch) =>
  sw.evaluate(async (patch) => {
    const { settings = {} } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, ...patch } });
  }, patch);

async function visit(...list) {
  const page = await ctx.newPage();
  for (const u of list) await page.goto(u);
  await page.close();
  await sleep(300);
}

/* 1. 설치하면 설정 화면이 열린다 */
const options = await until(() => ctx.pages().find((p) => p.url().startsWith(POPUP)), 5000);
check('설치하면 설정 탭이 열린다', Boolean(options));
const pageErrors = [];
options.on('pageerror', (e) => pageErrors.push(e.message));
await options.reload();

/* 2. 기본값: 1시간마다 */
check('기본 알람 1시간', (await until(alarm))?.periodInMinutes === 60);

/* 3. 지금 지우기 — 두 번 눌러야 지운다 */
await visit(A('/one'), A('/two'));
check('방문하면 기록이 쌓인다', (await urls()).length >= 2);
await options.click('#clear');
await sleep(300);
check('한 번 누르면 아직 안 지운다', (await urls()).length >= 2);
await options.click('#clear');
await options.waitForFunction(() => document.querySelector('#clear').textContent === '지웠습니다');
check('두 번 누르면 기록이 0개', (await urls()).length === 0);
check('마지막 삭제 = 직접', (await last())?.reason === 'manual');
check('화면에 마지막 삭제 시각 표시', (await options.textContent('#last')).includes('직접'));

/* 4. 최근 N분은 남기기 — 0.02분(1.2초)으로 줄여서 확인 */
await setSettings({ keepMinutes: 0.02 });
await visit(A('/old'));
await sleep(2000);
await visit(A('/new'));
await options.evaluate(() => chrome.runtime.sendMessage({ type: 'clear-now' }));
const kept = await urls();
check('오래된 기록만 지운다', !kept.includes(A('/old')) && kept.includes(A('/new')), kept.join(', '));
await setSettings({ keepMinutes: 0 });

/* 5. 바로 지울 사이트 */
await visit(L('/before'));
check('저장 전 localhost 기록 있음', (await urls()).includes(L('/before')));
await options.fill('#domains', 'https://www.LOCALHOST/whatever\n\n');
await options.click('#saveDomains');
await sleep(300);
check('입력한 주소를 사이트로 정리', (await options.inputValue('#domains')) === 'localhost');
check('저장하면 이미 남은 기록도 지운다', (await until(async () => !(await urls()).includes(L('/before')))) === true);
await visit(L('/after'), A('/keep-me'));
const afterDomains = await urls();
check('목록 사이트는 방문 즉시 지운다', !afterDomains.includes(L('/after')), afterDomains.join(', '));
check('다른 사이트는 남긴다', afterDomains.includes(A('/keep-me')));

/* 6. 함께 지울 것 — 쿠키로 확인 */
await options.reload();
for (const k of ['downloads', 'cache', 'cookies', 'formData']) await options.check(`[data-extra="${k}"]`);
await visit(A('/cookie'));
check('쿠키가 생겼다', (await ctx.cookies(A('/'))).length === 1);
await options.evaluate(() => chrome.runtime.sendMessage({ type: 'clear-now' }));
check('쿠키도 지웠다', (await ctx.cookies(A('/'))).length === 0);
check('오류 없이 끝남', !(await last())?.error, (await last())?.error);
check('요약에 함께 지울 것 표시', (await options.textContent('#summary')).includes('쿠키'));

/* 7. 주기 바꾸기 / 끄기 */
await options.selectOption('#interval', '15');
check('주기 15분으로 바뀜', (await until(async () => (await alarm())?.periodInMinutes === 15)) === true);
await options.uncheck('#enabled');
check('전체 끄면 알람 없음', (await until(async () => !(await alarm()))) === true);
check('끄면 화면에 꺼짐 표시', (await options.textContent('#next')) === '자동 삭제 꺼짐');
await visit(L('/while-off'));
check('끄면 사이트 즉시 삭제도 쉰다', (await urls()).includes(L('/while-off')));
await options.check('#enabled');
check('다시 켜면 알람 복구', (await until(async () => (await alarm())?.periodInMinutes === 15)) === true);
check('다시 켜면 남은 목록 사이트 기록 지움', (await until(async () => !(await urls()).includes(L('/while-off')))) === true);
await options.selectOption('#interval', '0');
check('주기 끄면 알람 없음', (await until(async () => !(await alarm()))) === true);
check('주기 없으면 다음 = 닫을 때', (await options.textContent('#next')) === '브라우저를 닫을 때');

/* 8. 화면 */
await options.selectOption('#interval', '60');
await options.uncheck('[data-extra="cookies"]');
await options.uncheck('[data-extra="formData"]');
await options.uncheck('[data-extra="downloads"]');
if (SHOTS) {
  for (const scheme of ['light', 'dark']) {
    const p = await ctx.newPage();
    await p.emulateMedia({ colorScheme: scheme });
    await p.setViewportSize({ width: 340, height: 800 });
    await p.goto(POPUP);
    await p.waitForTimeout(300);
    await p.screenshot({ path: join(SHOTS, `popup-${scheme}.png`), fullPage: true });
    await p.close();
  }
}
check('설정 화면 스크립트 오류 없음', pageErrors.length === 0, pageErrors.join(' / '));

/* 9. 마지막 창을 닫으면 지운다 */
await setSettings({ domains: [] });
await visit(A('/session'));
check('닫기 전 기록 있음', (await urls()).includes(A('/session')));
for (const p of ctx.pages()) await p.close();
check('창을 모두 닫으면 지운다', (await until(async () => (await last())?.reason === 'close', 5000)) === true);
check('닫은 뒤 기록 0개', (await urls()).length === 0);

/* 10. 다시 켜면 한 번 더 지운다 — 창이 없을 때 남긴 기록이라 닫을 때 지우기로는 안 지워진다 */
await sw.evaluate((url) => chrome.history.addUrl({ url }), A('/before-restart'));
check('재시작 전 기록 있음', (await urls()).includes(A('/before-restart')));
await ctx.close();
ctx = await launch();
sw = await findWorker();
check('브라우저를 켜면 지운다', (await until(async () => (await last())?.reason === 'startup', 5000)) === true);
check('켠 뒤 기록이 사라짐', !(await urls()).includes(A('/before-restart')));
check('설정은 그대로', (await alarm())?.periodInMinutes === 60);
check('다시 켤 때는 설정 탭을 열지 않는다', !ctx.pages().some((p) => p.url().startsWith(POPUP)));

await ctx.close();
server.close();
rmSync(profile, { recursive: true, force: true });
console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
process.exit(failed ? 1 : 0);
