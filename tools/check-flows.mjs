// 3층 검증: 실제로 눌러 본다.
// 로직 검증은 함수를, 화면 검증은 정적인 상태를 본다. 이건 그 사이 — DOM 배선이 실제로 이어져 있는지.
//   node tools/check-flows.mjs [index.html]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const FILE = process.argv[2] || 'index.html';
const PORT = 8778;

function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rep) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || FILE;
      const f = path.join(ROOT, rel);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rep.writeHead(404); return rep.end('404'); }
      rep.writeHead(200, { 'Content-Type': /\.html$/.test(f) ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    s.listen(PORT, () => res(s));
  });
}

let pass = 0;
const fails = [];
let cur = '-';
const group = (n) => { cur = n; };
const ok = (cond, label, detail) => {
  if (cond) { pass++; return true; }
  fails.push(`[${cur}] ${label}` + (detail ? `\n      ${detail}` : ''));
  return false;
};

const PREINSTALLED = '/opt/pw-browsers/chromium';
const server = await serve();
const browser = await chromium.launch(fs.existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });

const URL_ = `http://localhost:${PORT}/${FILE}`;
await page.goto(URL_, { waitUntil: 'networkidle' });

const tab = async (v) => { await page.click(`nav button[data-v="${v}"]`); await page.waitForTimeout(250); };
const txt = (sel) => page.locator(sel).innerText();

/* ─────────── 대회 프로필 · 주간 일정 ─────────── */
group('대회 프로필');
{
  await tab('tour');
  ok(await page.locator('.tdsched').count() === 1, '일정표 카드가 렌더된다');
  ok((await txt('.tdsched')).includes('아직 저장한 대회가 없습니다'), '처음엔 빈 상태 안내가 나온다');

  // 이름 + 요일(월·금) + 시각을 넣고 저장
  await page.fill('#td-pr-name', '금요일 몬스터');
  await page.fill('#td-pr-time', '19:30');
  await page.click('#td-pr-days .dbtn[data-day="1"]');
  await page.click('#td-pr-days .dbtn[data-day="5"]');
  await page.click('#td-pr-save');
  await page.waitForTimeout(320);

  ok(await page.locator('.wkgrid').count() === 1, '저장하면 주간 표가 나타난다');
  const mon = await page.locator('.wkday').nth(1).innerText();
  const fri = await page.locator('.wkday').nth(5).innerText();
  const wed = await page.locator('.wkday').nth(3).innerText();
  ok(mon.includes('금요일 몬스터') && mon.includes('19:30'), '월요일 칸에 이름·시각이 뜬다', mon.replace(/\n/g, ' | '));
  ok(fri.includes('금요일 몬스터'), '금요일 칸에도 뜬다 (요일 복수 선택)', fri.replace(/\n/g, ' | '));
  ok(!wed.includes('금요일 몬스터'), '고르지 않은 수요일에는 안 뜬다', wed.replace(/\n/g, ' | '));

  const row = await txt('.prtbl tr[data-id]');
  ok(row.includes('금요일 몬스터'), '목록에 행이 생긴다');
  ok(row.includes('만원'), '바이인이 만원 단위로 표시된다', row.replace(/\n/g, ' | '));

  // 목록에서 요일 하나 추가 → 주간 표에 반영
  await page.click('.prtbl tr[data-id] .dbtn[data-day="3"]');
  await page.waitForTimeout(300);
  ok((await page.locator('.wkday').nth(3).innerText()).includes('금요일 몬스터'), '목록에서 요일을 켜면 주간 표에 바로 반영된다');

  // 주간 표에서 바로 열기
  await page.click('.wkday .wkitem');
  await page.waitForTimeout(320);
  ok(await page.locator('.tdsched').count() === 1, '열기 후에도 설정 화면이 유지된다');
  const nm = await page.inputValue('#td-name');
  ok(typeof nm === 'string' && nm.length > 0, '열기 후 대회명이 채워져 있다', `"${nm}"`);

  // 새로고침해도 남아 있는다
  await page.reload({ waitUntil: 'networkidle' });
  await tab('tour');
  ok((await txt('.tdsched')).includes('금요일 몬스터'), '새로고침해도 저장한 대회가 남아 있다');

  // 삭제
  page.once('dialog', (d) => d.accept());
  await page.click('.prtbl tr[data-id] [data-act="del"]');
  await page.waitForTimeout(320);
  ok((await txt('.tdsched')).includes('아직 저장한 대회가 없습니다'), '삭제하면 빈 상태로 돌아간다');
}

/* ─────────── 핸드 분석 ─────────── */
group('핸드 분석');
{
  await tab('hand');
  await page.click('#h-demo');
  await page.waitForTimeout(200);
  await page.click('#h-run');
  await page.waitForTimeout(700);
  const out = await txt('#h-out');
  ok(out.length > 200, '분석 결과가 나온다', `길이 ${out.length}`);
  ok(!/\bundefined\b|\bNaN\b/.test(out), '결과에 undefined/NaN 이 없다',
    (out.match(/.{0,40}(undefined|NaN).{0,40}/) || [])[0]);
  ok(/필요 승률|MDF/.test(out), '필요 승률·MDF 가 표시된다');
  await page.click('#h-clear');
  await page.waitForTimeout(200);
  ok((await txt('#h-out')).trim().length === 0, '초기화하면 결과가 지워진다');
}

/* ─────────── 성향 진단 ─────────── */
group('성향 진단');
{
  await tab('quiz');
  const start = page.locator('#v-quiz button').first();
  if (await start.count()) { await start.click(); await page.waitForTimeout(250); }
  const opts = page.locator('#v-quiz .opt');
  const n0 = await opts.count();
  ok(n0 >= 2, '문항 선택지가 나온다', `${n0}개`);
  if (n0 >= 2) {
    const q1 = await txt('#v-quiz');
    await opts.first().click();
    await page.waitForTimeout(280);
    const q2 = await txt('#v-quiz');
    ok(q1 !== q2, '답하면 다음 문항으로 넘어간다');
    ok(!/\bundefined\b|\bNaN\b/.test(q2), '진단 화면에 undefined/NaN 이 없다');
    // 답한 내용이 남는지
    await page.reload({ waitUntil: 'networkidle' });
    await tab('quiz');
    ok(/이어서|1\s*문항|문항/.test(await txt('#v-quiz')), '중간에 그만둬도 진행이 남는다');
  }
}

/* ─────────── 실전 드릴 ─────────── */
group('실전 드릴');
{
  await tab('drill');
  const go = page.locator('#v-drill button').filter({ hasText: /시작/ }).first();
  ok(await go.count() > 0, '시작 버튼이 있다');
  if (await go.count()) {
    await go.click();
    await page.waitForTimeout(600);
    const opts = page.locator('#v-drill .dopt');
    const n = await opts.count();
    ok(n >= 2, '스팟 선택지가 나온다', `${n}개`);
    const body = await txt('#v-drill');
    ok(!/\bundefined\b|\bNaN\b/.test(body), '드릴 화면에 undefined/NaN 이 없다',
      (body.match(/.{0,40}(undefined|NaN).{0,40}/) || [])[0]);
    if (n >= 2) {
      await opts.first().click();
      await page.waitForTimeout(600);
      const after = await txt('#v-drill');
      ok(after !== body, '액션을 고르면 화면이 진행된다');
      ok(!/\bundefined\b|\bNaN\b/.test(after), '채점 결과에 undefined/NaN 이 없다',
        (after.match(/.{0,40}(undefined|NaN).{0,40}/) || [])[0]);
      ok(/EV|팟|승률/.test(after), '채점에 EV·팟·승률이 나온다');
    }
  }
}

/* ─────────── 테마 ─────────── */
group('테마');
{
  const before = await page.getAttribute('html', 'data-theme');
  await page.click('#theme-t');
  await page.waitForTimeout(200);
  const after = await page.getAttribute('html', 'data-theme');
  ok(before !== after, `버튼을 누르면 테마가 바뀐다 (${before} → ${after})`);
  await page.reload({ waitUntil: 'networkidle' });
  ok(await page.getAttribute('html', 'data-theme') === after, '새로고침해도 고른 테마가 유지된다');
  // 전광판은 테마와 무관하게 어두워야 한다
  const bBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--b-bg').trim());
  ok(/^#0/.test(bBg), `전광판 바탕은 테마와 무관하게 어둡다 (${bBg})`);
}

/* ─────────── 백업 왕복 ─────────── */
group('백업');
{
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('hb.')));
  ok(keys.length > 0, 'hb. 접두사로 저장된다', keys.join(', '));
  ok(keys.every((k) => k.startsWith('hb.')), 'hb. 밖의 키를 만들지 않는다');
}

if (errs.length) fails.push(`[콘솔] 페이지 오류 ${errs.length}건\n      ` + [...new Set(errs)].slice(0, 5).join('\n      '));

await browser.close();
server.close();

const total = pass + fails.length;
console.log('');
if (fails.length) {
  console.log(`✗ 흐름 검증 실패 ${fails.length} / ${total}\n`);
  fails.forEach((f) => console.log('  ✗ ' + f));
  console.log('');
  process.exit(1);
}
console.log(`✓ 흐름 검증 통과 ${pass} / ${total}\n`);
