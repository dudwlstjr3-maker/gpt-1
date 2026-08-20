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

/* ─────────── 몬스터 리그 상금 사다리 ─────────── */
group('상금 사다리');
{
  await tab('tour');
  // 리그 프리셋을 누르면 사다리가 켜진다
  const lg = page.locator('.tplb').filter({ hasText: '몬스터 리그' });
  ok(await lg.count() === 1, '몬스터 리그 버튼이 있다');
  await lg.click();
  await page.waitForTimeout(350);
  ok((await page.inputValue('#td-buyin')) === '3', '리그 프리셋이 바이인 3만원을 채운다',
    await page.inputValue('#td-buyin'));

  await page.click('#td-quick');
  await page.waitForTimeout(600);
  ok(await page.locator('.ladbox').count() === 1, '상금 사다리 카드가 뜬다');
  const on = await page.locator('#td-poolmode button.on').innerText();
  ok(/사다리/.test(on), '상금 방식이 사다리로 켜져 있다', on);

  // 세는 기준을 고르는 옵션은 없다 — 언제나 합산
  ok(await page.locator('#td-lad-basis').count() === 0, '«엔트리만» 선택지는 없다 (항상 합산)');
  ok(/엔트리\+리바이/.test(await txt('.ladbox')), '합산해서 센다고 화면에 쓰여 있다');

  // 9명 시작 → 9개 → 10만원
  let lad = await txt('.ladbox');
  ok(/9개/.test(lad), '엔트리+리바이 합계가 표시된다', lad.replace(/\n/g, ' | ').slice(0, 140));
  ok(/10만원/.test(lad), '9개면 상금 10만원', lad.replace(/\n/g, ' | ').slice(0, 200));

  // 구간표
  ok(await page.locator('.ladtbl tr.on').count() === 1, '지금 구간이 표에서 강조된다');
  const band = await txt('.ladtbl tr.on');
  ok(/9~13/.test(band), '지금 구간은 9~13개', band.replace(/\n/g, ' '));

  // 리바이를 늘리면 사다리가 올라간다
  for (let i = 0; i < 5; i++) { await page.click('.tdcounts [data-act="r+"]'); await page.waitForTimeout(120); }
  await page.waitForTimeout(300);
  lad = await txt('.ladbox');
  ok(/14개/.test(lad), '리바이 5개를 더하면 14개', lad.replace(/\n/g, ' | ').slice(0, 140));
  ok(/20만원/.test(lad), '14개면 상금 20만원', lad.replace(/\n/g, ' | ').slice(0, 200));

  // 운영 카드 상금도 따라간다 (전광판 총 상금은 레지 마감 전까지 가려져 있다)
  const ops = await txt('.tdcounts');
  ok(/20만원/.test(ops), '운영 카드 상금이 사다리를 따른다', ops.replace(/\n/g, ' | '));
  ok(/사다리 14개/.test(ops), '상금 라벨이 비율이 아니라 사다리라고 알려준다', ops.replace(/\n/g, ' | '));
  ok(/레지 마감 후 공개|PRIZE/.test(await txt('#td-screen')), '전광판은 레지 마감 전까지 상금을 가린다');

  // 설정을 바꾸면 반영된다
  await page.fill('#td-lad-amt', '5'); await page.dispatchEvent('#td-lad-amt', 'change');
  await page.waitForTimeout(320);
  ok(/10만원/.test(await txt('.ladbox')), '한 묶음을 5만원으로 바꾸면 14개는 10만원',
    (await txt('.ladbox')).replace(/\n/g, ' | ').slice(0, 200));
  await page.fill('#td-lad-amt', '10'); await page.dispatchEvent('#td-lad-amt', 'change');
  await page.waitForTimeout(300);

  // 비율 방식으로 되돌릴 수 있다
  await page.locator('#td-poolmode button').filter({ hasText: '모인 돈' }).click();
  await page.waitForTimeout(350);
  ok(await page.locator('.ladbox').count() === 0, '비율 방식으로 바꾸면 사다리 카드가 사라진다');
  ok(await page.locator('#td-poolpct').count() === 1, '비율 입력이 돌아온다');
  await page.locator('#td-poolmode button').filter({ hasText: '사다리' }).click();
  await page.waitForTimeout(300);

  // 새로고침해도 유지
  await page.reload({ waitUntil: 'networkidle' });
  await tab('tour');
  ok(await page.locator('.ladbox').count() === 1, '새로고침해도 사다리 설정이 남는다');

  // 다음 검사를 위해 설정 화면으로 되돌린다
  await page.evaluate(() => localStorage.removeItem('hb.td'));
  await page.reload({ waitUntil: 'networkidle' });
  await tab('tour');
}

/* ─────────── 전광판 테마 · 광고 슬라이드 ─────────── */
group('전광판 꾸미기');
{
  await tab('tour');
  ok(await page.locator('.tdboard').count() === 1, '전광판 꾸미기 카드가 있다');
  ok(await page.locator('.thcard').count() === 6, '테마 6종이 나온다', `${await page.locator('.thcard').count()}종`);
  ok((await txt('.tdboard')).includes('아직 슬라이드가 없습니다'), '처음엔 슬라이드가 없다');

  // 슬라이드 두 장 추가하고 문구를 넣는다
  await page.click('#td-ad-add'); await page.waitForTimeout(280);
  await page.click('#td-ad-add'); await page.waitForTimeout(280);
  ok(await page.locator('.adrow').count() === 2, '슬라이드 2장이 생긴다');
  await page.locator('.adrow').nth(0).locator('.adtitle').fill('다음 대회 — 금요일 몬스터');
  await page.locator('.adrow').nth(0).locator('.adbody').fill('매주 금요일 19:30');
  await page.locator('.adrow').nth(1).locator('.adtitle').fill('매장 공지');
  await page.waitForTimeout(250);

  // 대회를 열어 전광판에 실제로 뜨는지
  await page.click('#td-quick');
  await page.waitForTimeout(600);
  ok(await page.locator('#td-screen').count() === 1, '대회를 시작하면 전광판이 뜬다');
  ok(await page.locator('#td-ad .adslide').count() >= 1, '전광판에 광고 띠가 뜬다');
  const ad = await txt('#td-ad');
  ok(ad.includes('금요일 몬스터'), '첫 슬라이드 내용이 나온다', ad.replace(/\n/g, ' | '));

  // 전광판에는 운영 정보가 나가면 안 된다
  const board = await txt('#td-screen');
  ok(!/매출|하우스|모인 돈|바이인 합계/.test(board), '전광판에 매출·하우스 몫이 나가지 않는다');

  // 테마 전환
  const before = await page.getAttribute('#td-screen', 'data-btheme');
  await page.click('.thcard[data-bt="bright"]');
  await page.waitForTimeout(250);
  ok(await page.getAttribute('#td-screen', 'data-btheme') === 'bright', `테마를 누르면 전광판만 바뀐다 (${before} → bright)`);
  ok(await page.getAttribute('html', 'data-theme') === 'dark', '전광판 테마는 앱 테마를 건드리지 않는다');
  await page.reload({ waitUntil: 'networkidle' });
  await tab('tour');
  ok(await page.getAttribute('#td-screen', 'data-btheme') === 'bright', '새로고침해도 전광판 테마가 유지된다');

  // 광고 끄기
  await page.click('#td-ad-on button[data-on="0"]');
  await page.waitForTimeout(350);
  ok(await page.locator('#td-ad').count() === 0, '끄면 광고 띠가 사라진다');
  await page.click('#td-ad-on button[data-on="1"]');
  await page.waitForTimeout(350);
  ok(await page.locator('#td-ad').count() === 1, '다시 켜면 나타난다');

  // 순서 바꾸기 · 삭제
  await page.locator('.adrow').nth(1).locator('[data-act="up"]').click();
  await page.waitForTimeout(300);
  ok((await page.locator('.adrow').nth(0).locator('.adtitle').inputValue()) === '매장 공지', '↑ 로 순서가 바뀐다');
  await page.locator('.adrow').nth(0).locator('[data-act="del"]').click();
  await page.waitForTimeout(300);
  ok(await page.locator('.adrow').count() === 1, '삭제하면 한 장이 남는다');
}

/* ─────────── 핸드 분석: 예시 ─────────── */
group('핸드 분석');
{
  await tab('hand');
  await page.click('#h-demo');
  await page.waitForTimeout(300);
  const seq = await txt('#acts2');
  ok(/프리플랍/.test(seq) && /레이즈/.test(seq), '예시가 액션 순서로 채워진다', seq.replace(/\n/g, ' | ').slice(0, 160));
  await page.click('#h-run');
  await page.waitForTimeout(800);
  const out = await txt('#h-out');
  ok(out.length > 200, '분석 결과가 나온다', `길이 ${out.length}`);
  ok(!/\bundefined\b|\bNaN\b/.test(out), '결과에 undefined/NaN 이 없다',
    (out.match(/.{0,40}(undefined|NaN).{0,40}/) || [])[0]);
  ok(/필요 승률|MDF/.test(out), '필요 승률·MDF 가 표시된다');
  await page.click('#h-clear');
  await page.waitForTimeout(250);
  ok((await txt('#h-out')).trim().length === 0, '초기화하면 결과가 지워진다');
  ok((await txt('#acts2')).includes('아직 없음'), '초기화하면 액션도 지워진다');
}

/* ─────────── 핸드 분석: 액션을 직접 쌓기 ─────────── */
group('액션 순서 입력');
{
  await tab('hand');
  await page.click('#h-clear');
  await page.waitForTimeout(250);

  const turn = () => txt('.turnbox .turnh');
  const doAct = async (label) => {
    const b = page.locator('.turnb .btn').filter({ hasText: label }).first();
    await b.click(); await page.waitForTimeout(180);
  };

  // 블라인드가 서 있고 UTG 차례
  ok((await turn()).includes('UTG'), '처음 차례는 UTG', (await turn()).replace(/\n/g, ' '));
  ok((await turn()).includes('1.5BB'), '블라인드만 있으면 팟 1.5BB', (await turn()).replace(/\n/g, ' '));

  // UTG·HJ·CO 폴드 → BTN(나) 차례
  await doAct('폴드'); await doAct('폴드'); await doAct('폴드');
  ok((await turn()).includes('BTN'), '세 명이 접으면 BTN 차례', (await turn()).replace(/\n/g, ' '));
  ok((await turn()).includes('(나)'), '내 차례라고 표시된다');

  // 2.5배 레이즈
  await doAct('2.5배');
  ok((await turn()).includes('SB'), '레이즈하면 SB 차례', (await turn()).replace(/\n/g, ' '));
  await doAct('폴드');
  ok((await turn()).includes('BB'), 'SB 가 접으면 BB 차례', (await turn()).replace(/\n/g, ' '));
  ok((await turn()).includes('1.5BB'), 'BB 는 1.5BB 만 더 내면 된다', (await turn()).replace(/\n/g, ' '));

  await doAct('콜');
  await page.waitForTimeout(220);
  const log = await txt('#acts2');
  ok(/UTG\s*폴드/.test(log) && /BTN\(나\)\s*레이즈\s*2\.5/.test(log) && /BB\s*콜/.test(log),
    '액션 로그가 순서대로 쌓인다', log.replace(/\n/g, ' | ').slice(0, 200));
  ok(/플랍 카드를 넣어주세요|플랍/.test(log), '프리플랍이 끝나면 플랍 카드를 요청한다');

  // 되돌리기
  await page.click('#seq-undo'); await page.waitForTimeout(220);
  ok((await turn()).includes('BB'), '되돌리면 BB 차례로 돌아온다', (await turn()).replace(/\n/g, ' '));
  await doAct('콜'); await page.waitForTimeout(220);

  // 홀카드 2장 + 플랍 3장
  const deck = page.locator('.deck .dc:not(.used)');
  for (let i = 0; i < 5; i++) { await deck.first().click(); await page.waitForTimeout(140); }
  await page.waitForTimeout(300);
  const log2 = await txt('#acts2');
  ok(!/카드를 넣어주세요/.test(log2), '플랍을 깔면 액션이 열린다', log2.replace(/\n/g, ' | ').slice(-140));
  ok((await turn()).includes('BB'), '플랍 첫 차례는 BB (포지션 없는 쪽)', (await turn()).replace(/\n/g, ' '));
  ok((await turn()).includes('앞에 벳 없음'), '플랍 첫 액션은 콜할 금액이 없다');

  // 체크 → 내가 ½팟 벳 → BB 콜
  await doAct('체크');
  ok((await turn()).includes('BTN'), '체크가 돌면 내 차례', (await turn()).replace(/\n/g, ' '));
  await doAct('½팟');
  ok((await turn()).includes('BB'), '내가 치면 BB 차례', (await turn()).replace(/\n/g, ' '));
  ok(/콜하려면/.test(await turn()), 'BB 는 콜할 금액이 생긴다');
  await doAct('콜');
  await page.waitForTimeout(250);
  ok(/턴 카드를 넣어주세요|턴/.test(await txt('#acts2')), '플랍이 끝나면 턴 카드를 요청한다');

  // 턴: 이번에는 상대가 치고 내가 받는다 — 필요 승률이 나오는 쪽
  await deck.first().click();
  await page.waitForTimeout(300);
  ok((await turn()).includes('BB'), '턴 첫 차례도 BB', (await turn()).replace(/\n/g, ' '));
  await doAct('⅔팟');
  ok((await turn()).includes('BTN'), '상대가 치면 내 차례', (await turn()).replace(/\n/g, ' '));
  ok(/콜하려면/.test(await turn()), '내가 콜할 금액이 표시된다', (await turn()).replace(/\n/g, ' '));
  await doAct('콜');
  await page.waitForTimeout(250);

  // 분석
  await page.click('#h-run');
  await page.waitForTimeout(900);
  const out = await txt('#h-out');
  ok(out.length > 200, '직접 쌓은 핸드도 분석된다', `길이 ${out.length}`);
  ok(!/\bundefined\b|\bNaN\b/.test(out), '결과에 undefined/NaN 이 없다',
    (out.match(/.{0,40}(undefined|NaN).{0,40}/) || [])[0]);
  ok(/필요 승률/.test(out), '상대 벳을 맞은 스트리트에 필요 승률이 나온다');
  ok(/MDF/.test(out), 'MDF 도 나온다');
  ok(/플랍/.test(out) && /턴/.test(out), '플랍·턴 두 스트리트가 모두 분석된다');

  // 액션을 지우면 분석이 막힌다
  await page.click('#seq-clear'); await page.waitForTimeout(250);
  await page.click('#h-run'); await page.waitForTimeout(400);
  ok(/액션을 하나 이상/.test(await txt('#h-out')) || (await txt('#h-out')).trim().length < 80,
    '액션이 없으면 무엇이 빠졌는지 알려준다', (await txt('#h-out')).slice(0, 120));
}

/* ─────────── 포지션별 레인지 표 ─────────── */
group('포지션별 레인지');
{
  await tab('hand');
  ok(await page.locator('#rng-ref .rngtbl').count() === 1, '레인지 표가 렌더된다');
  const t = await txt('#rng-ref');
  ok(/UTG/.test(t) && /BTN/.test(t), '자리별 행이 나온다');
  ok(/솔버 출력이 아닙니다/.test(t), '솔버가 아니라 근사라고 밝힌다');
  ok(/뒤에 아무도 없어/.test(t), 'BB 는 먼저 들어올 자리가 아니라고 설명한다');

  // 자리가 늦을수록 넓어진다
  const readPcts = (sel) => page.evaluate((s) =>
    [...document.querySelectorAll(s)].map((e) => parseFloat(e.textContent)), sel);
  const vil = await readPcts('#rng-ref .rngtbl .rpc:not(.rme)');
  const mine = await readPcts('#rng-ref .rngtbl .rpc.rme');
  ok(vil.length >= 4, '상대 레인지 %가 자리마다 표시된다', vil.join(', '));
  ok(mine.length === vil.length, '내가 들어갈 폭도 자리마다 표시된다', mine.join(', '));
  const rising = (a) => a.slice(0, 4).every((v, i, arr) => i === 0 || v > arr[i - 1]);
  ok(rising(vil), '상대 레인지: 자리가 늦을수록 % 가 커진다', vil.join(' → '));
  ok(rising(mine), '내 레인지: 자리가 늦을수록 % 가 커진다', mine.join(' → '));
  ok(mine.every((m, i) => m < vil[i]), '기본 스타일(타이트)에서는 내 폭이 상대 표준보다 좁다',
    mine.map((m, i) => `${m}<${vil[i]}`).join(' '));

  // 그리드 펼치기
  await page.click('[data-grid="BTN"]');
  await page.waitForTimeout(250);
  ok(await page.locator('#rng-ref .g13').count() === 1, 'BTN 그리드가 펼쳐진다');
  ok(await page.locator('#rng-ref .g13 .in').count() > 20, '그리드에 레인지가 칠해진다',
    `${await page.locator('#rng-ref .g13 .in').count()}칸`);
  await page.click('[data-grid="BTN"]');
  await page.waitForTimeout(220);
  ok(await page.locator('#rng-ref .g13').count() === 0, '다시 누르면 접힌다');

  // 성향을 바꾸면 폭이 움직인다
  const before = (await page.evaluate(() =>
    parseFloat(document.querySelector('#rng-ref .rngtbl .rpc').textContent)));
  await page.selectOption('#rng-vt', 'nit');
  await page.waitForTimeout(280);
  const after = (await page.evaluate(() =>
    parseFloat(document.querySelector('#rng-ref .rngtbl .rpc').textContent)));
  ok(after < before, `타이트한 상대를 고르면 좁아진다 (${before}% → ${after}%)`);
  await page.selectOption('#rng-vt', 'unknown');
  await page.waitForTimeout(250);

  // 권장 스타일을 바꾸면 «내가 들어갈 폭»만 움직이고 상대 읽기는 그대로
  const styleBtns = page.locator('#rng-ref [data-stylepick] button');
  ok(await styleBtns.count() === 3, '레인지 표에도 스타일 고르개가 있다');
  const vilBefore = await readPcts('#rng-ref .rngtbl .rpc:not(.rme)');
  const mineBefore = await readPcts('#rng-ref .rngtbl .rpc.rme');
  await styleBtns.filter({ hasText: '넓게' }).click();
  await page.waitForTimeout(320);
  const vilAfter = await readPcts('#rng-ref .rngtbl .rpc:not(.rme)');
  const mineAfter = await readPcts('#rng-ref .rngtbl .rpc.rme');
  ok(mineAfter[0] > mineBefore[0], `넓게로 바꾸면 내 폭이 넓어진다 (${mineBefore[0]}% → ${mineAfter[0]}%)`);
  ok(JSON.stringify(vilAfter) === JSON.stringify(vilBefore),
    '스타일을 바꿔도 상대 레인지 읽기는 그대로다', `${vilBefore.join(',')} vs ${vilAfter.join(',')}`);
  await styleBtns.filter({ hasText: '타이트' }).click();
  await page.waitForTimeout(300);

  // 콜 · 3벳은 자리별로 나누지 않는다
  await page.locator('#rng-sit button').filter({ hasText: '3벳' }).click();
  await page.waitForTimeout(280);
  ok(await page.locator('#rng-ref .rngtbl').count() === 0, '3벳은 자리별 표를 만들지 않는다');
  ok(await page.locator('#rng-ref .g13').count() === 1, '3벳은 레인지 하나를 그리드로 보여준다');
  ok(/자리에 따라 나누지 않습니다/.test(await txt('#rng-ref')), '왜 자리별이 아닌지 설명한다');
  await page.locator('#rng-sit button').filter({ hasText: '먼저' }).click();
  await page.waitForTimeout(250);

  // 인원을 바꾸면 자리도 따라간다
  await page.evaluate(() => { document.getElementById('sess-d').open = true; });
  await page.selectOption('#s-seats', '9');
  await page.waitForTimeout(320);
  ok(/UTG\+1/.test(await txt('#rng-ref')), '9맥스로 바꾸면 자리가 늘어난다');
  await page.selectOption('#s-seats', '6');
  await page.waitForTimeout(280);
  await page.evaluate(() => { document.getElementById('sess-d').open = false; });
}

/* ─────────── 세션 세팅 접기 ─────────── */
group('세션 세팅');
{
  await tab('hand');
  ok(!(await page.locator('#s-stack').isVisible()), '세션 세팅은 기본으로 접혀 있다');
  const line = await txt('#sess-line');
  ok(/6맥스/.test(line) && /100BB/.test(line), '접힌 줄에 지금 값이 요약된다', line);
  // 좌석표 안내에서 바로 펼 수 있다
  await page.click('#open-sess'); await page.waitForTimeout(250);
  ok(await page.locator('#s-stack').isVisible(), '좌석표 안내를 누르면 세션 세팅이 펴진다');
  await page.fill('#s-stack', '40'); await page.dispatchEvent('#s-stack', 'change');
  await page.waitForTimeout(300);
  ok((await txt('#sess-line')).includes('40BB'), '값을 바꾸면 요약 줄도 따라 바뀐다', await txt('#sess-line'));
  ok((await txt('.turnbox .turnh')).includes('40BB'), '스택을 바꾸면 액션 패널에도 반영된다',
    (await txt('.turnbox .turnh')).replace(/\n/g, ' '));
  await page.fill('#s-stack', '100'); await page.dispatchEvent('#s-stack', 'change');
  await page.waitForTimeout(250);
  await page.evaluate(() => { document.getElementById('sess-d').open = false; });
}

/* ─────────── 헤즈업 포지션 ─────────── */
group('헤즈업');
{
  await tab('hand');
  await page.click('#h-clear'); await page.waitForTimeout(200);
  // 인원은 세션 세팅 안에 있다 — 접혀 있으면 펴고 고른다
  await page.evaluate(() => { document.getElementById('sess-d').open = true; });
  await page.waitForTimeout(150);
  ok(await page.locator('#s-seats').isVisible(), '세션 세팅을 펴면 인원을 고를 수 있다');
  await page.selectOption('#s-seats', '2');
  await page.waitForTimeout(350);
  const turn = await txt('.turnbox .turnh');
  ok(turn.includes('BTN(SB)'), '헤즈업 프리플랍은 버튼부터', turn.replace(/\n/g, ' '));
  await page.selectOption('#s-seats', '6');
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('sess-d').open = false; });
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

/* ─────────── 전적 ─────────── */
group('전적');
{
  await page.evaluate(() => { DB.del('stats'); DB.del('drills'); });
  await tab('rec');
  const view = () => txt('#v-rec');

  ok((await view()).includes('아직 기록이 없습니다'), '처음엔 빈 상태 안내가 나온다');
  ok(/판단 30개부터|드릴을 돌리지 않았습니다/.test(await view()), '표본이 없으면 등급을 매기지 않는다고 알려준다');
  ok(/추정값/.test(await view()), '드릴 등급이 추정값이라고 표시된다');

  // 한 줄 남기기
  await page.fill('#rc-name', '금요일 몬스터');
  await page.fill('#rc-place', '3');
  await page.fill('#rc-field', '42');
  await page.fill('#rc-buyins', '3');
  await page.fill('#rc-spent', '9');
  await page.fill('#rc-prize', '25');
  await page.click('#rc-add');
  await page.waitForTimeout(350);

  let row = await txt('#v-rec table tr:nth-child(2)');
  ok(row.includes('금요일 몬스터'), '기록이 표에 한 줄로 남는다', row.replace(/\n/g, ' | '));
  ok(row.includes('3위') && row.includes('42명'), '순위와 참가자 수가 함께 나온다', row.replace(/\n/g, ' | '));
  ok(row.includes('3회'), '바이인 횟수가 나온다', row.replace(/\n/g, ' | '));
  ok(/\+16만원/.test(row), '손익은 상금 − 지출 (25 − 9 = +16만원)', row.replace(/\n/g, ' | '));

  ok((await view()).includes('출전'), '요약에 출전 수가 나온다');
  ok(/바이인[\s\S]{0,40}3회/.test(await view()), '요약 바이인이 3회', (await view()).slice(0, 200).replace(/\n/g, ' | '));

  // 우승으로 기록 — 순위 칸을 안 건드려도 1위로 들어간다
  await page.fill('#rc-name', '데일리');
  await page.fill('#rc-place', '9');
  await page.fill('#rc-field', '30');
  await page.fill('#rc-buyins', '1');
  await page.fill('#rc-spent', '1');
  await page.fill('#rc-prize', '12');
  await page.click('#rc-win');
  await page.waitForTimeout(350);

  ok(await page.evaluate(() => recTotals().wins) === 1, '«우승으로 기록»은 순위 칸과 무관하게 1위로 넣는다',
    String(await page.evaluate(() => recTotals().wins)));
  ok(/우승/.test(await txt('#v-rec table')), '표에 우승이 표시된다');
  ok(await page.evaluate(() => recTotals().buyins) === 4, '바이인 합계가 4회로 늘어난다',
    String(await page.evaluate(() => recTotals().buyins)));

  // 새로고침해도 남는다
  await page.reload({ waitUntil: 'networkidle' });
  await tab('rec');
  ok((await view()).includes('금요일 몬스터') && (await view()).includes('데일리'),
    '새로고침해도 전적이 남는다');

  // 드릴 표본이 쌓이면 등급이 매겨진다
  await page.evaluate(() => {
    DB.set('drills', [{ at: Date.now(), n: 80, ok: 56, loss: 20, passive: 8, aggro: 5 }]);
    renderRec();
  });
  await page.waitForTimeout(250);
  ok(!/측정 중/.test(await view()), '표본이 차면 등급이 나온다');
  ok(await page.locator('#v-rec .tag.g').count() >= 1, '등급표에서 지금 등급이 강조된다');

  // 삭제
  await page.click('#v-rec [data-rc="0"]');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => recAll().length) === 1, '한 줄을 지우면 하나만 남는다',
    String(await page.evaluate(() => recAll().length)));

  // 홈에도 요약이 뜬다
  await tab('home');
  ok(/전적/.test(await txt('#v-home')), '홈에 전적 요약이 나온다');

  await page.evaluate(() => { DB.del('stats'); DB.del('drills'); });
}

/* ─────────── 선수 계정 ─────────── */
group('선수 계정');
{
  // 다음 dialog(prompt/confirm) 한 번을 이렇게 답하겠다고 미리 걸어 둔다
  const answer = (v) => page.once('dialog', (d) => (v === false ? d.dismiss() : d.accept(v === true ? '' : v)));
  const chip = () => txt('#acct-b');
  const rows = () => page.locator('#acct-body .acrow');

  // 이 계정에 기록을 심어 둔다 — 계정을 바꿨을 때 사라지는지 보려고.
  // 화면이 실제로 그리는 모양이어야 하므로 저장 코드가 만드는 형태 그대로 넣는다.
  const seedHand = (mark) => ({
    at: 1700000000000, cls: 'AQs', pos: 'BTN', vpos: 'BB', pf: 'open', vt: '스테이션',
    hole: ['As', 'Qs'], board: ['Ks', '7h', '2d'], mark,
    streets: [{ n: '플랍', rec: '벳', my: '체크', eq: 0.55, evLoss: 0.4, tags: ['소극적'] }]
  });
  await page.evaluate((h) => DB.set('hands', h), [seedHand('A'), seedHand('A2')]);
  const myHands = () => page.evaluate(() => DB.get('hands', []).map((h) => h.mark).join(','));

  ok((await chip()).trim().length > 0, '헤더에 지금 계정 이름이 뜬다', (await chip()).replace(/\n/g, ' '));
  ok(await page.locator('#acct-m').isHidden(), '계정 창은 처음엔 닫혀 있다');

  await page.click('#acct-b');
  await page.waitForTimeout(200);
  ok(await page.locator('#acct-m').isVisible(), '헤더 칩을 누르면 계정 창이 열린다');
  ok(await rows().count() === 1, '처음엔 계정이 하나다', String(await rows().count()));
  ok((await txt('#acct-body')).includes('핸드 2'), '계정 줄에 그 계정의 기록 수가 보인다',
    (await rows().first().innerText()).replace(/\n/g, ' | '));
  ok(/PIN 은 보안이 아닙니다/.test(await txt('#acct-body')), 'PIN 이 보안이 아니라는 경고가 화면에 있다');

  // 새 계정 만들기 → 곧바로 그쪽으로 전환된다
  await page.fill('#ac-new', '테스터');
  await page.click('#acct-body [data-ac="add"]');
  await page.waitForTimeout(300);
  ok(await rows().count() === 2, '계정이 하나 늘어난다', String(await rows().count()));
  ok((await chip()).includes('테스터'), '만들자마자 새 계정으로 전환된다', (await chip()).replace(/\n/g, ' '));
  ok((await rows().nth(1).innerText()).includes('지금'), '두 번째 줄에 «지금» 표시가 붙는다',
    (await rows().nth(1).innerText()).replace(/\n/g, ' | '));
  ok(await page.evaluate(() => DB.get('hands', []).length) === 0,
    '새 계정에는 앞 사람 핸드가 안 보인다');
  ok((await rows().nth(1).innerText()).includes('핸드 0'), '새 계정 요약은 0에서 시작한다',
    (await rows().nth(1).innerText()).replace(/\n/g, ' | '));

  // 이름 바꾸기 (prompt)
  answer('테스터2');
  await page.click('#acct-body .acrow:nth-of-type(2) [data-ac="nm"]');
  await page.waitForTimeout(250);
  ok((await chip()).includes('테스터2'), '이름을 바꾸면 헤더 칩도 따라 바뀐다', (await chip()).replace(/\n/g, ' '));

  // PIN 걸기 (prompt)
  answer('1357');
  await page.click('#acct-body .acrow:nth-of-type(2) [data-ac="pin"]');
  await page.waitForTimeout(250);
  ok((await rows().nth(1).innerText()).includes('🔒'), 'PIN 을 걸면 자물쇠가 표시된다',
    (await rows().nth(1).innerText()).replace(/\n/g, ' | '));

  // 첫 계정으로 돌아가면 심어 둔 기록이 그대로 있다
  await page.click('#acct-body .acrow:nth-of-type(1) [data-ac="go"]');
  await page.waitForTimeout(300);
  ok(await myHands() === 'A,A2', '계정을 되돌리면 그 계정 기록이 그대로 돌아온다', await myHands());

  // PIN 건 계정으로 가려면 PIN 을 물어본다
  await page.click('#acct-body .acrow:nth-of-type(2) [data-ac="go"]');
  await page.waitForTimeout(250);
  ok(await page.locator('#ac-pin-in').count() === 1, 'PIN 이 걸린 계정은 바로 안 들어가고 PIN 을 묻는다');
  ok(!(await chip()).includes('테스터2'), '아직 전환되지 않았다', (await chip()).replace(/\n/g, ' '));

  await page.fill('#ac-pin-in', '0000');
  await page.click('#acct-body [data-ac="pinok"]');
  await page.waitForTimeout(250);
  ok(!(await chip()).includes('테스터2'), '틀린 PIN 으로는 안 들어간다', (await chip()).replace(/\n/g, ' '));

  await page.fill('#ac-pin-in', '1357');
  await page.click('#acct-body [data-ac="pinok"]');
  await page.waitForTimeout(300);
  ok((await chip()).includes('테스터2'), '맞는 PIN 이면 전환된다', (await chip()).replace(/\n/g, ' '));

  // 새로고침해도 고른 계정이 유지된다
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  ok((await chip()).includes('테스터2'), '새로고침해도 고른 계정이 유지된다', (await chip()).replace(/\n/g, ' '));

  // 계정 삭제 (confirm) — 그 계정 기록도 함께 사라진다
  await page.click('#acct-b');
  await page.waitForTimeout(200);
  answer(true);
  await page.click('#acct-body .acrow:nth-of-type(2) [data-ac="del"]');
  await page.waitForTimeout(300);
  ok(await rows().count() === 1, '지우면 줄이 하나 남는다', String(await rows().count()));
  ok(await page.evaluate(() => Object.keys(localStorage).filter((k) => /^hb\.u.*\.hands$/.test(k)).length) === 1,
    '지운 계정의 저장 키까지 함께 사라진다');
  ok(await myHands() === 'A,A2', '지운 뒤 남은 계정으로 자동 전환된다', await myHands());
  ok(await page.locator('#acct-body [data-ac="del"]').count() === 0, '마지막 하나 남으면 삭제 버튼이 없다');

  // ESC 로 닫힌다
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok(await page.locator('#acct-m').isHidden(), 'ESC 로 계정 창이 닫힌다');

  await page.evaluate(() => DB.del('hands'));
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
