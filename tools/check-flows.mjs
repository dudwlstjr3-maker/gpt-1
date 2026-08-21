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
      const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
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

  // 「모인 돈의 %」 방식은 없앴다 — 상금은 엔트리 개수로만 정한다
  ok(await page.locator('#td-poolmode').count() === 0, '«모인 돈의 %» 방식 선택지가 없다');
  ok(await page.locator('#td-poolpct').count() === 0, '비율 입력 칸이 없다');
  ok(await page.locator('#td-lad-basis').count() === 0, '«엔트리만» 선택지도 없다 (항상 합산)');

  // 버튼은 둘 — 7엔트리당 10만원 / 3엔트리당 1만원
  const ladq = page.locator('#td-ladq button');
  ok(await ladq.count() === 2, '상금 버튼은 두 개', String(await ladq.count()));
  const labels = await ladq.allInnerTexts();
  ok(labels.some((t) => /7엔트리당 10만원/.test(t)), '「7엔트리당 10만원」 버튼', labels.join(' | '));
  ok(labels.some((t) => /3엔트리당 1만원/.test(t)), '「3엔트리당 1만원」 버튼', labels.join(' | '));
  ok(await page.locator('#td-ladq button.on').count() === 1, '지금 쓰는 값이 버튼에 표시된다');
  ok(/7엔트리당 10만원/.test(await page.locator('#td-ladq button.on').innerText()),
    '리그 프리셋은 7엔트리당 10만원으로 켜져 있다', await page.locator('#td-ladq button.on').innerText());

  ok(/바이인과 리바이를 합친/.test(await txt('.ladbox')), '엔트리가 바이인+리바이라고 화면에 쓰여 있다');

  // 9명 시작 → 9엔트리 → 10만원
  let lad = await txt('.ladbox');
  ok(/9엔트리/.test(lad), '바이인+리바이 합계가 엔트리로 표시된다', lad.replace(/\n/g, ' | ').slice(0, 140));
  ok(/10만원/.test(lad), '9엔트리면 상금 10만원', lad.replace(/\n/g, ' | ').slice(0, 200));

  // 구간표
  ok(await page.locator('.ladtbl tr.on').count() === 1, '지금 구간이 표에서 강조된다');
  const band = await txt('.ladtbl tr.on');
  ok(/9~13/.test(band), '지금 구간은 9~13엔트리', band.replace(/\n/g, ' '));

  // 리바이를 늘리면 사다리가 올라간다
  for (let i = 0; i < 5; i++) { await page.click('#td-ops [data-act="r+"]'); await page.waitForTimeout(120); }
  await page.waitForTimeout(300);
  lad = await txt('.ladbox');
  ok(/14엔트리/.test(lad), '리바이 5개를 더하면 14엔트리', lad.replace(/\n/g, ' | ').slice(0, 140));
  ok(/20만원/.test(lad), '14엔트리면 상금 20만원', lad.replace(/\n/g, ' | ').slice(0, 200));

  // 운영 카드 상금도 따라간다 (전광판 총 상금은 레지 마감 전까지 가려져 있다)
  const ops = await txt('#td-ops');
  ok(/20만원/.test(ops), '운영 카드 상금이 사다리를 따른다', ops.replace(/\n/g, ' | '));
  ok(/상금 \(14엔트리\)/.test(ops), '상금 라벨이 몇 엔트리 기준인지 알려준다', ops.replace(/\n/g, ' | '));
  ok(/레지 마감 후 공개|PRIZE/.test(await txt('#td-screen')), '전광판은 레지 마감 전까지 상금을 가린다');

  // 데일리 버튼 — 3엔트리당 1만원
  await ladq.filter({ hasText: '3엔트리당 1만원' }).click();
  await page.waitForTimeout(350);
  ok(/4만원/.test(await txt('.ladbox')), '데일리로 바꾸면 14엔트리는 4만원 (3개당 1만원)',
    (await txt('.ladbox')).replace(/\n/g, ' | ').slice(0, 200));
  await ladq.filter({ hasText: '7엔트리당 10만원' }).click();
  await page.waitForTimeout(350);
  ok(/20만원/.test(await txt('.ladbox')), '다시 몬스터로 돌아온다',
    (await txt('.ladbox')).replace(/\n/g, ' | ').slice(0, 200));

  // 직접 고칠 수도 있다
  await page.fill('#td-lad-amt', '5'); await page.dispatchEvent('#td-lad-amt', 'change');
  await page.waitForTimeout(320);
  ok(/10만원/.test(await txt('.ladbox')), '한 묶음을 5만원으로 바꾸면 14엔트리는 10만원',
    (await txt('.ladbox')).replace(/\n/g, ' | ').slice(0, 200));
  ok(await page.locator('#td-ladq button.on').count() === 0, '손으로 고치면 어느 버튼도 안 켜진다');
  await page.fill('#td-lad-amt', '10'); await page.dispatchEvent('#td-lad-amt', 'change');
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

/* ─────────── 파이널나인 블라인드 사다리 ─────────── */
group('블라인드 사다리');
{
  const WANT = [[100,200],[200,400],[300,600],[400,800],[500,1000],[600,1200],[700,1400],
    [800,1600],[900,1800],[1000,2000],[2000,4000],[3000,6000],[4000,8000],[5000,10000]];

  for (const [tpl, label, ante] of [['f9_daily', '싯앤고', false], ['f9_monster', '몬스터', true]]) {
    await page.evaluate(() => localStorage.removeItem('hb.td'));
    await page.reload({ waitUntil: 'networkidle' });
    await tab('tour');
    await page.evaluate((t) => {
      const b = [...document.querySelectorAll('.tplb')].find((x) => x.dataset.id === t);
      if (b) b.click();
    }, tpl);
    await page.waitForTimeout(400);

    const lv = await page.evaluate(() =>
      TD.levels.filter((l) => !l.brk).map((l) => [l.sb, l.bb, l.ante]));
    ok(lv.length === WANT.length, `${label}: 레벨이 ${WANT.length}개`, String(lv.length));
    ok(JSON.stringify(lv.map((x) => [x[0], x[1]])) === JSON.stringify(WANT),
      `${label}: 100/200 → 5000/10000 표 그대로`,
      lv.map((x) => x[0] + '/' + x[1]).join(' · '));

    if (ante) {
      ok(lv[0][2] === 0 && lv[1][2] === 0 && lv[2][2] === 600,
        `${label}: 앤티가 3레벨(300/600)부터 600`,
        lv.slice(0, 4).map((x) => x[2]).join(','));
      ok(lv.slice(2).every((x) => x[2] === x[1]), `${label}: 3레벨부터 앤티는 BB 와 같다`);
    } else {
      ok(lv.every((x) => x[2] === 0), `${label}: 앤티가 없다`);
    }

    // 화면(레벨 표)에도 그대로 나오는지
    await page.click('#td-quick');
    await page.waitForTimeout(600);
    if (!(await page.locator('.tdlevels .tdfold').evaluate((e) => e.open))) {
      await page.click('.tdlevels .tdfoldsum');
      await page.waitForTimeout(350);
    }
    // 값이 input 안에 있어서 innerText 로는 안 보인다 — 칸을 직접 읽는다
    const shown = await page.evaluate(() => {
      const sb = [...document.querySelectorAll('.tdlevels .lvin[data-f="sb"]')].map((e) => +e.value);
      const bb = [...document.querySelectorAll('.tdlevels .lvin[data-f="bb"]')].map((e) => +e.value);
      const an = [...document.querySelectorAll('.tdlevels .lvin[data-f="ante"]')].map((e) => +e.value);
      return sb.map((v, i) => [v, bb[i], an[i]]);
    });
    ok(JSON.stringify(shown.map((x) => [x[0], x[1]])) === JSON.stringify(WANT),
      `${label}: 레벨 표 화면에도 표 그대로 나온다`,
      shown.map((x) => x[0] + '/' + x[1]).join(' · '));
    ok(shown.length && shown[shown.length - 1][0] === 5000 && shown[shown.length - 1][1] === 10000,
      `${label}: 마지막 줄이 5000/10000`,
      shown.length ? shown[shown.length - 1].join('/') : '없음');
    if (ante) ok(shown[2][2] === 600, `${label}: 레벨 표 3레벨 앤티 칸이 600`, String(shown[2][2]));
    // 전광판에도
    ok(/100\s*\/\s*200/.test(await txt('.bba')), `${label}: 전광판 1레벨이 100/200`,
      (await txt('.bba')).replace(/\n/g, ' | ').slice(0, 100));
    ok(/ANTE/.test(await txt('.bba')), `${label}: BLINDS 옆에 ANTE 칸이 있다`,
      (await txt('.bba')).replace(/\n/g, ' | '));
  }

  await page.evaluate(() => localStorage.removeItem('hb.td'));
  await page.reload({ waitUntil: 'networkidle' });
  await tab('tour');
}

/* ─────────── 전광판 로고 ─────────── */
group('로고');
{
  await tab('tour');
  await page.evaluate(() => { DB.del('logo'); renderTour(); });
  await page.waitForTimeout(300);

  // 파이널나인 로고가 처음부터 들어 있다
  ok(await page.evaluate(() => tdLogo().startsWith('data:image/')),
    '아무것도 안 올려도 기본 로고가 들어 있다', (await page.evaluate(() => tdLogo())).slice(0, 30));
  ok(await page.evaluate(() => tdLogoIsDefault()) === true, '그게 파이널나인 기본 로고다');
  ok(await page.locator('.lgprev img').count() === 1, '설정 화면에 로고 미리보기가 뜬다');
  ok(await page.locator('#td-logo-def').count() === 0, '기본 로고 상태에서는 «기본으로» 버튼이 없다');

  // 지우면 진짜로 없어져야 한다 — 지웠는데 기본이 되살아나면 못 지운다
  await page.click('#td-logo-del');
  await page.waitForTimeout(350);
  ok(await page.evaluate(() => tdLogo()) === '', '지우면 로고가 없어진다');
  ok(await page.locator('.lgnone').count() === 1, '«로고 없음» 이 뜬다');
  await page.reload({ waitUntil: 'networkidle' });
  await tab('tour');
  ok(await page.evaluate(() => tdLogo()) === '', '새로고침해도 지운 상태가 유지된다 (기본이 되살아나지 않는다)');

  // 되돌리기
  ok(await page.locator('#td-logo-def').count() === 1, '지운 뒤엔 «파이널나인 기본 로고» 버튼이 나온다');
  await page.click('#td-logo-def');
  await page.waitForTimeout(350);
  ok(await page.evaluate(() => tdLogoIsDefault()) === true, '기본 로고로 되돌릴 수 있다');

  ok(await page.locator('#td-logo-url').count() === 1, '이미지 주소를 넣는 칸이 있다');
  ok(await page.locator('#td-logo-pick').count() === 1, '파일에서 고르는 버튼도 있다');
  ok(/Ctrl\+V|복사/.test(await txt('.logobox')), '복사한 이미지를 붙여넣는 방법이 적혀 있다',
    (await txt('.logobox')).replace(/\n/g, ' | ').slice(0, 160));

  // 아무 주소나 넣으면 안 된다
  await page.fill('#td-logo-url', '그냥 글자');
  await page.click('#td-logo-get');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => DB.get('logo', '')) === '', 'http 주소가 아니면 저장하지 않는다');

  // 진짜 주소에서 받아 «파일 안에» 굳히는지 — 같은 서버의 이미지로 확인한다
  await page.fill('#td-logo-url', `http://localhost:${PORT}/tools/fixtures/logo.png`);
  await page.click('#td-logo-get');
  await page.waitForFunction(() => DB.get('logo', '').length > 0, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() => DB.get('logo', ''));
  ok(/^data:image\//.test(saved), '주소로 받은 그림이 data URI 로 굳는다 (인터넷 끊겨도 뜬다)',
    saved.slice(0, 40));

  // 전광판에 실제로 뜨고, 로고가 있어도 대회명은 가운데 그대로
  await page.click('#td-quick');
  await page.waitForTimeout(700);
  ok(await page.locator('.blogo img').count() === 1, '전광판 왼쪽에 로고가 뜬다');
  {
    const c = await page.evaluate(() => {
      const g = document.querySelector('.bgame').getBoundingClientRect();
      const s = document.querySelector('#td-screen').getBoundingClientRect();
      return Math.round(g.left + g.width / 2) - Math.round(s.left + s.width / 2);
    });
    ok(Math.abs(c) < 24, '로고가 있어도 대회명은 화면 한가운데', `${c}px 어긋남`);
  }

  // 로고를 지워도 가운데 그대로여야 한다 (빈 값이 «없음», del 은 기본 로고로 되돌리기)
  await page.evaluate(() => { DB.set('logo', ''); renderTour(); });
  await page.waitForTimeout(400);
  ok(await page.locator('.blogo img').count() === 0, '지우면 로고가 사라진다');
  {
    const c = await page.evaluate(() => {
      const g = document.querySelector('.bgame').getBoundingClientRect();
      const s = document.querySelector('#td-screen').getBoundingClientRect();
      return Math.round(g.left + g.width / 2) - Math.round(s.left + s.width / 2);
    });
    ok(Math.abs(c) < 24, '로고가 없어도 대회명은 같은 자리 — 가운데', `${c}px 어긋남`);
  }

  // 다음 검사를 위해 기본 로고 상태로 되돌린다
  await page.evaluate(() => { DB.del('logo'); localStorage.removeItem('hb.td'); });
  await page.reload({ waitUntil: 'networkidle' });
  await tab('tour');
  ok(await page.evaluate(() => tdLogoIsDefault()) === true, '기본 로고 상태로 되돌아왔다');
}

/* ─────────── 진행 줄 ─────────── */
group('진행');
{
  await tab('tour');
  await page.click('#td-quick');
  await page.waitForTimeout(600);
  ok(await page.locator('#td-screen').count() === 1, '대회를 시작하면 전광판이 뜬다');

  // 전광판은 네모 칸 없이 한 화면으로 읽혀야 한다
  {
    const boxes = await page.evaluate(() => {
      const out = [];
      const scope = document.getElementById('td-screen');
      const check = (sel) => {
        for (const el of scope.querySelectorAll(sel)) {
          const cs = getComputedStyle(el);
          const w = ['Top', 'Right', 'Bottom', 'Left'].map((s) => parseFloat(cs['border' + s + 'Width']) || 0);
          // 구역을 나누는 세로선 하나(왼쪽만)는 테두리가 아니라 구분선으로 본다
          const onlyLeft = w[3] > 0 && w[0] === 0 && w[1] === 0 && w[2] === 0;
          const boxed = w.filter((x) => x > 0).length >= 2;
          if (boxed && !onlyLeft) out.push(el.className || el.tagName);
        }
      };
      check('.tdwrap, .bhead, .bbody, .bcol, .bcenter, .bregbox, .bba, .bb1');
      const wrap = getComputedStyle(scope);
      if ((parseFloat(wrap.borderTopWidth) || 0) > 0) out.push('전광판 바깥테두리');
      return out;
    });
    ok(boxes.length === 0, '전광판에 네모 테두리가 없다', boxes.join(', '));
  }
  ok(await page.locator('.blogo img').count() === 1, '전광판에 기본 로고가 뜬다');

  // 없앤 것들이 정말 없는지
  ok(await page.locator('.tdboard').count() === 0, '전광판 꾸미기 카드가 없다');
  ok(await page.locator('.thcard').count() === 0, '테마 고르개가 없다');
  ok(await page.locator('#td-ad').count() === 0, '광고 띠가 없다');
  ok(await page.locator('.tdmystack').count() === 0, '내 스택 카드가 없다');

  // 전광판에는 운영 정보가 나가면 안 된다
  const board = await txt('#td-screen');
  ok(!/매출|하우스|모인 돈|바이인 합계/.test(board), '전광판에 매출·하우스 몫이 나가지 않는다');

  // 진행 버튼 — 딱 일곱 개, 한 줄
  const btns = await page.locator('.tdrow1 > button').allInnerTexts();
  ok(btns.length === 7, '진행 버튼은 일곱 개', btns.join(' | '));
  ok(!/시간/.test(await txt('.tdrow1')), '「시간」 같은 그룹 라벨이 없다', btns.join(' | '));
  for (const want of ['◀ 이전 레벨', '다음 레벨 ▶', '−30초', '+30초', '전체화면', '종료 · 다음 대회 설정'])
    ok(btns.some((t) => t.trim() === want), `「${want}」 버튼이 있다`, btns.join(' | '));
  ok(/시작|일시정지|계속/.test(btns[0]), '첫 버튼은 시작·일시정지', btns[0]);

  // 한 줄에 다 들어가는지 — 1440px 에서 접히면 «한 줄로 깔끔하게»가 아니다.
  // 정렬 차이로 1~2px 어긋나는 건 줄바꿈이 아니므로 버튼 높이의 절반을 기준으로 본다.
  {
    const box = await page.locator('.tdrow1 > button').evaluateAll((es) => {
      const r = es.map((e) => e.getBoundingClientRect());
      return { spread: Math.max(...r.map((x) => x.top)) - Math.min(...r.map((x) => x.top)),
        h: Math.min(...r.map((x) => x.height)) };
    });
    ok(box.spread < box.h / 2, '데스크톱에서 버튼이 한 줄에 놓인다',
      `세로로 ${Math.round(box.spread)}px 벌어짐 (버튼 높이 ${Math.round(box.h)}px)`);
    ok(box.spread === 0, '버튼 높이가 서로 맞는다', `${Math.round(box.spread)}px 어긋남`);
  }

  // ±30초가 실제로 30초를 움직이는지
  {
    const remain = () => page.evaluate(() => TD.remain);
    const before = await remain();
    await page.click('#td-m30');
    await page.waitForTimeout(250);
    const after = await remain();
    ok(before - after === 30000, '−30초가 정확히 30초를 뺀다', `${before} → ${after}`);
    await page.click('#td-p30');
    await page.waitForTimeout(250);
    ok(await remain() === before, '+30초로 되돌아온다', String(await remain()));
  }

  // 시작 / 일시정지 — 글씨가 바뀌어도 칸 크기는 그대로여야 옆 버튼이 안 밀린다
  {
    const runBox = () => page.locator('#td-run').evaluate((e) => {
      const r = e.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), t: e.textContent.trim() };
    });
    const nextLeft = () => page.locator('#td-prev').evaluate((e) => Math.round(e.getBoundingClientRect().left));

    const a = await runBox(), aL = await nextLeft();
    ok(a.t === '시작', '처음엔 «시작»', a.t);

    await page.click('#td-run');
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => TD.running) === true, '시작을 누르면 시계가 간다');
    const b = await runBox(), bL = await nextLeft();
    ok(b.t === '일시정지', '버튼 글씨가 «일시정지» 로 바뀐다', b.t);
    ok(a.w === b.w, '시작 → 일시정지 로 바뀌어도 칸 너비가 같다', `${a.w}px → ${b.w}px`);
    ok(a.h === b.h, '높이도 같다', `${a.h}px → ${b.h}px`);
    ok(aL === bL, '옆 버튼이 밀리지 않는다', `${aL}px → ${bL}px`);

    await page.click('#td-run');
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => TD.running) === false, '다시 누르면 멈춘다');
    const c = await runBox(), cL = await nextLeft();
    ok(c.t === '계속', '멈추면 «계속»', c.t);
    ok(a.w === c.w && aL === cL, '«계속» 일 때도 칸 너비와 옆 버튼 자리가 같다',
      `${a.w}px vs ${c.w}px · ${aL}px vs ${cL}px`);
  }

  // 레벨 이동
  {
    const lv = () => page.evaluate(() => TD.lvl);
    await page.click('#td-next');
    await page.waitForTimeout(300);
    ok(await lv() === 1, '다음 레벨로 넘어간다', String(await lv()));
    await page.click('#td-prev');
    await page.waitForTimeout(300);
    ok(await lv() === 0, '이전 레벨로 돌아온다', String(await lv()));
  }

  // ── 전광판: 지금 무슨 게임인지가 제일 커야 한다
  {
    const size = (sel) => page.locator(sel).evaluate((e) => {
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      return { px: parseFloat(cs.fontSize), cx: Math.round(r.left + r.width / 2) };
    });
    // 대회마다 색이 달라야 «무슨 게임인지» 를 글씨 읽기 전에 안다
    {
      const hueOf = () => page.getAttribute('#td-screen', 'data-game');
      const gameColor = () => page.locator('.bgame').evaluate((e) => getComputedStyle(e).color);
      const seen = {};
      for (const tpl of ['f9_daily', 'f9_monster', 'f9_league']) {
        await page.evaluate(() => { localStorage.removeItem('hb.td'); });
        await page.reload({ waitUntil: 'networkidle' });
        await tab('tour');
        await page.evaluate((t) => {
          const btn = [...document.querySelectorAll('.tplb')].find((x) => x.dataset.id === t);
          if (btn) btn.click();
        }, tpl);
        await page.waitForTimeout(320);
        await page.click('#td-quick');
        await page.waitForTimeout(600);
        seen[tpl] = { hue: await hueOf(), color: await gameColor(), name: await txt('.bgame') };
      }
      ok(new Set(Object.values(seen).map((x) => x.hue)).size === 3,
        '싯앤고 · 몬스터 · 몬스터 리그가 서로 다른 색이다',
        Object.entries(seen).map(([k, v]) => `${k}=${v.hue}`).join(' · '));
      ok(new Set(Object.values(seen).map((x) => x.color)).size === 3,
        '대회명 글씨 색이 실제로 셋 다 다르다',
        Object.values(seen).map((v) => v.color).join(' · '));
      ok(seen.f9_daily.name === '싯앤고', '싯앤고 이름', seen.f9_daily.name);
      ok(seen.f9_monster.name === '몬스터', '몬스터 이름', seen.f9_monster.name);
      ok(seen.f9_league.name === '몬스터 리그',
        '몬스터 리그가 제 이름으로 뜬다 (예전엔 WEEKLY TOURNAMENT 였다)', seen.f9_league.name);

      // 레벨과 진행바도 같은 색을 쓴다 — 화면 전체가 그 게임의 색이 된다
      const lv = await page.locator('.lvrow').evaluate((e) => getComputedStyle(e).color);
      ok(lv === seen.f9_league.color, '레벨 표시도 대회 색을 따른다', `${lv} vs ${seen.f9_league.color}`);

      // 다시 기본 대회로
      await page.evaluate(() => { localStorage.removeItem('hb.td'); });
      await page.reload({ waitUntil: 'networkidle' });
      await tab('tour');
      await page.click('#td-quick');
      await page.waitForTimeout(600);
    }

    const game = await size('.bgame'), venue = await size('.bvenue');
    ok(game.px > venue.px * 2, '대회명이 매장명보다 두 배 넘게 크다',
      `대회명 ${game.px}px · 매장명 ${venue.px}px`);
    ok(/싯앤고/.test(await txt('.bgame')), '대회명이 «싯앤고» 다 (데일리 아님)', await txt('.bgame'));
    ok(!/데일리/.test(await txt('#td-screen')), '전광판 어디에도 «데일리» 가 없다');

    // 화면 한가운데인가
    const mid = await page.locator('#td-screen').evaluate((e) => {
      const r = e.getBoundingClientRect();
      return Math.round(r.left + r.width / 2);
    });
    ok(Math.abs(game.cx - mid) < 24, '대회명이 전광판 한가운데에 온다',
      `대회명 중심 ${game.cx}px · 전광판 중심 ${mid}px`);

    // 레지 마감은 머리 오른쪽에, 휴식은 오른쪽 정보 칸에 — 둘 다 멀리서 읽히게
    const reg = await page.locator('#td-toreg').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    ok(reg >= 24, '레지 마감 숫자가 24px 이상', `${reg}px`);
    const brk = await page.locator('#td-tobreak').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    ok(brk >= 20, '다음 휴식 숫자가 20px 이상', `${brk}px`);

    // 블라인드가 상자 한가운데에, 상자 밖으로 안 새고
    // 참고한 전광판처럼 BLINDS 와 ANTE 가 한 줄에 나란히, 가운데 칸 중심에 놓인다
    const bl = await page.evaluate(() => {
      const c = document.querySelector('.bcenter').getBoundingClientRect();
      const ba = document.querySelector('.bba').getBoundingClientRect();
      const cells = [...document.querySelectorAll('.bb1')].map((e) => {
        const r = e.getBoundingClientRect();
        return { top: Math.round(r.top), k: e.querySelector('.k').textContent.trim() };
      });
      const clk = document.getElementById('td-time').getBoundingClientRect();
      return { cCx: c.left + c.width / 2, baCx: ba.left + ba.width / 2, cells,
        clkCx: clk.left + clk.width / 2 };
    });
    ok(bl.cells.length === 2, 'BLINDS 와 ANTE 두 칸', bl.cells.map((x) => x.k).join(' · '));
    ok(bl.cells.length === 2 && bl.cells[0].top === bl.cells[1].top,
      'BLINDS 와 ANTE 가 한 줄에 나란히', bl.cells.map((x) => x.top).join(' vs '));
    ok(Math.abs(bl.baCx - bl.cCx) < 12, '블라인드 줄이 가운데 칸 중심에 온다',
      `${Math.round(bl.baCx)} vs ${Math.round(bl.cCx)}`);
    ok(Math.abs(bl.clkCx - bl.cCx) < 12, '시계도 가운데 칸 중심에 온다',
      `${Math.round(bl.clkCx)} vs ${Math.round(bl.cCx)}`);

    // 세 단 배치 — 상금(왼쪽) · 시계(가운데) · 정보(오른쪽)
    {
      const cols = await page.evaluate(() => {
        const g = (s) => { const e = document.querySelector(s); if (!e) return null;
          const r = e.getBoundingClientRect(); return Math.round(r.left + r.width / 2); };
        return { prize: g('.bprize'), center: g('.bcenter'), stat: g('.bstat') };
      });
      ok(cols.prize !== null && cols.center !== null && cols.stat !== null, '세 단이 다 있다');
      ok(cols.prize < cols.center && cols.center < cols.stat,
        '왼쪽 상금 · 가운데 시계 · 오른쪽 정보 순서다',
        `${cols.prize} < ${cols.center} < ${cols.stat}`);
    }
    // 오른쪽 정보 항목
    {
      const keys = await page.locator('.bstat .k').allInnerTexts();
      for (const want of ['PLAYERS', 'TOTAL TIME', 'TOTAL STACK', 'AVG STACK', 'NEXT BREAK'])
        ok(keys.some((k) => k.trim() === want), `오른쪽에 ${want} 가 있다`, keys.join(' · '));
    }
    // 경과 시간이 실제로 흐른다
    {
      const el = () => page.locator('#td-elapsed').innerText();
      // −30초 는 «남은 시간» 을 깎으므로 경과가 30초 늘어난다 (+30초 는 그 반대)
      const before = await el();
      await page.click('#td-m30');
      await page.waitForTimeout(300);
      ok(await el() !== before, '남은 시간을 깎으면 TOTAL TIME 이 그만큼 늘어난다',
        `${before} → ${await el()}`);
      await page.click('#td-p30');
      await page.waitForTimeout(300);
      ok(await el() === before, '되돌리면 원래대로', `${await el()} vs ${before}`);
    }
  }

  // ── 접기 / 펴기 — 상금 배분과 레벨 표가 같은 방식·같은 자리
  {
    const cards = [
      { sel: '.tdpayout', name: '상금 배분', inner: '#td-ladq', open0: true },
      { sel: '.tdlevels', name: '레벨 표', inner: '.lvtbl, table', open0: false },
    ];
    for (const c of cards) {
      ok(await page.locator(c.sel + ' .tdfold').count() === 1, `${c.name}이 접었다 폈다 하는 카드다`);
      ok(await page.locator(c.sel + ' .tdfoldsum').count() === 1, `${c.name}의 접기 손잡이가 제목 줄에 있다`);
      ok(await page.locator(c.sel + ' #td-lvtoggle2, ' + c.sel + ' .row > div > button.btn.sec').count() === 0
        || c.sel === '.tdpayout', `${c.name}에 예전 방식의 별도 토글 버튼이 없다`);
    }
    // 손잡이가 두 카드에서 같은 자리(오른쪽 끝)에 있는지
    {
      const pos = await page.evaluate(() => [...document.querySelectorAll('.tdfoldsum i')].map((e) => {
        const r = e.getBoundingClientRect(), card = e.closest('.card').getBoundingClientRect();
        return Math.round(card.right - r.right);
      }));
      ok(pos.length === 2, '접기 손잡이가 두 개다', String(pos.length));
      ok(pos.length === 2 && Math.abs(pos[0] - pos[1]) <= 1,
        '두 카드의 접기 손잡이가 같은 자리에 있다', pos.join(' vs ') + 'px (카드 오른쪽에서)');
    }
    ok(await page.locator('#td-lvtoggle2').count() === 0, '레벨 표의 예전 토글 버튼이 없어졌다');

    const fold = page.locator('.tdpayout .tdfold');
    ok(await fold.evaluate((e) => e.open) === true, '상금 배분은 처음엔 펴져 있다');
    ok(await page.locator('#td-ladq').isVisible(), '펴져 있으면 상금 버튼이 보인다');

    await page.click('.tdpayout .tdfoldsum');
    await page.waitForTimeout(300);
    ok(await fold.evaluate((e) => e.open) === false, '제목을 누르면 접힌다');
    ok(!(await page.locator('#td-ladq').isVisible()), '접으면 내용이 숨는다');
    ok(/상금/.test(await txt('.tdpayout .tdfoldsum')), '접혀 있어도 요약이 보인다',
      (await txt('.tdpayout .tdfoldsum')).replace(/\n/g, ' | '));

    // 레벨 표도 같은 방식으로 열린다
    const lvf = page.locator('.tdlevels .tdfold');
    ok(await lvf.evaluate((e) => e.open) === false, '레벨 표는 처음엔 접혀 있다');
    ok(/전체 \d+행/.test(await txt('.tdlevels .tdfoldsum')), '접혀 있어도 몇 행인지 보인다',
      (await txt('.tdlevels .tdfoldsum')).replace(/\n/g, ' | '));
    await page.click('.tdlevels .tdfoldsum');
    await page.waitForTimeout(350);
    ok(await lvf.evaluate((e) => e.open) === true, '제목을 누르면 레벨 표가 펴진다');
    ok(await page.locator('.tdlevels table').count() >= 1, '펴면 레벨 표가 보인다');

    // 시계가 1초마다 다시 그려도 접힘이 유지돼야 한다
    await page.click('#td-run');
    await page.waitForTimeout(1400);
    ok(await fold.evaluate((e) => e.open) === false, '시계가 도는 동안에도 상금 배분은 접힌 채로 있다');
    ok(await lvf.evaluate((e) => e.open) === true, '레벨 표도 펴진 채로 있다');
    await page.click('#td-run');
    await page.waitForTimeout(300);

    await page.reload({ waitUntil: 'networkidle' });
    await tab('tour');
    ok(await page.locator('.tdpayout .tdfold').evaluate((e) => e.open) === false,
      '새로고침해도 상금 배분 접힘이 남는다');
    ok(await page.locator('.tdlevels .tdfold').evaluate((e) => e.open) === true,
      '새로고침해도 레벨 표 펴짐이 남는다');
    await page.click('.tdpayout .tdfoldsum');
    await page.waitForTimeout(300);
    ok(await page.locator('.tdpayout .tdfold').evaluate((e) => e.open) === true, '다시 누르면 펴진다');
    await page.click('.tdlevels .tdfoldsum');
    await page.waitForTimeout(300);
  }

  // 종료 → 설정 화면
  page.once('dialog', (d) => d.accept());
  await page.click('#td-end');
  await page.waitForTimeout(450);
  ok(await page.locator('#td-screen').count() === 0, '종료하면 전광판이 닫힌다');
  ok(await page.locator('#td-quick').count() === 1, '다음 대회 설정 화면으로 돌아온다');
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

/* ─────────── 핸드 기록 찾기 ─────────── */
group('핸드 찾기');
{
  await page.evaluate(() => {
    const hand = (cls, pos, vpos, tag, loss) => ({
      at: Date.now(), cls, pos, vpos, pf: 'open', vt: '스테이션',
      hole: [], board: [24, 33, 40],
      streets: [{ n: '플랍', rec: '벳', my: 'check', eq: 0.55, evLoss: loss, tags: [tag] }],
    });
    DB.set('hands', [
      hand('AQs', 'BTN', 'BB', '소극적', 0.4),
      hand('72o', 'SB', 'BB', '과공격', 1.2),
      hand('QQ', 'UTG', 'CO', '사이즈', 0.8),
    ]);
  });
  await tab('stats');
  const bodyRows = () => page.locator('#hf-tbl tr').count();

  ok(await bodyRows() === 4, '머리글 + 핸드 3줄', String(await bodyRows()));

  // 검색어
  await page.fill('#hf-q', 'QQ');
  await page.waitForTimeout(250);
  ok(await bodyRows() === 2, '검색어를 넣으면 한 줄만 남는다', String(await bodyRows()));
  ok(/UTG vs CO/.test(await txt('#hf-tbl')), '남은 줄이 찾던 핸드다', (await txt('#hf-tbl')).replace(/\n/g, ' | '));
  ok(/3개 중 1개/.test(await txt('#v-stats')), '몇 개 중 몇 개인지 알려준다',
    (await txt('#v-stats')).slice(0, 200).replace(/\n/g, ' | '));

  // 두 글자 이상 이어서 칠 수 있어야 한다 — 다시 그릴 때 포커스가 날아가면 못 친다
  await page.fill('#hf-q', '');
  await page.click('#hf-q');
  await page.keyboard.type('BTN');
  await page.waitForTimeout(250);
  ok(await page.inputValue('#hf-q') === 'BTN', '검색어를 이어서 칠 수 있다 (포커스 유지)',
    await page.inputValue('#hf-q'));
  ok(await bodyRows() === 2, 'BTN 핸드 하나만 남는다', String(await bodyRows()));

  // 조건 지우기
  await page.click('#hf-clear');
  await page.waitForTimeout(250);
  ok(await bodyRows() === 4, '조건을 지우면 전부 돌아온다', String(await bodyRows()));
  ok(await page.inputValue('#hf-q') === '', '검색 칸도 비워진다');

  // 포지션 · 리크 고르기
  await page.selectOption('#hf-pos', 'SB');
  await page.waitForTimeout(250);
  ok(await bodyRows() === 2 && /SB vs BB/.test(await txt('#hf-tbl')), '포지션으로 거른다',
    (await txt('#hf-tbl')).replace(/\n/g, ' | '));
  await page.click('#hf-clear');
  await page.waitForTimeout(200);
  await page.selectOption('#hf-tag', '사이즈');
  await page.waitForTimeout(250);
  ok(await bodyRows() === 2 && /UTG vs CO/.test(await txt('#hf-tbl')), '리크로 거른다',
    (await txt('#hf-tbl')).replace(/\n/g, ' | '));
  await page.click('#hf-clear');
  await page.waitForTimeout(200);

  // 정렬 뒤에 지워도 «그 줄»이 지워져야 한다 (순번으로 지우면 엉뚱한 핸드가 사라진다)
  await page.selectOption('#hf-sort', 'loss');
  await page.waitForTimeout(250);
  ok(/1\.2 BB/.test(await txt('#hf-tbl tr:nth-child(2)')), '손실 큰 순이면 72o(1.2BB) 가 맨 위',
    (await txt('#hf-tbl tr:nth-child(2)')).replace(/\n/g, ' | '));
  await page.click('#hf-tbl tr:nth-child(2) [data-del]');
  await page.waitForTimeout(300);
  const left = await page.evaluate(() => DB.get('hands', []).map((x) => x.cls).join(','));
  ok(left === 'AQs,QQ', '정렬 뒤에 지워도 누른 줄(72o)이 지워진다', left);

  await page.evaluate(() => DB.del('hands'));
  await tab('home');
}

/* ─────────── 홈: 오늘 대회 ─────────── */
group('오늘 대회');
{
  await tab('home');
  ok(await page.locator('.todaylist').count() === 0, '저장한 대회가 없으면 오늘 대회 카드가 안 뜬다');

  await page.evaluate(() => {
    const D = tdNew(), day = new Date().getDay();
    tdProfilesSet([
      tdProfileFrom(D, '밤 대회', [day], '23:59', ''),
      tdProfileFrom(D, '아침 대회', [day], '00:01', ''),
      tdProfileFrom(D, '내일 대회', [(day + 1) % 7], '19:30', ''),
    ]);
    renderHome();
  });
  await page.waitForTimeout(250);

  ok(await page.locator('.todayrow').count() === 2, '오늘 것만 뜬다 — 내일 대회는 빠진다',
    String(await page.locator('.todayrow').count()));
  const rows = await page.locator('.todayrow').allInnerTexts();
  ok(/아침 대회/.test(rows[0]) && /밤 대회/.test(rows[1]), '시각 순으로 줄 선다', rows.join(' | '));

  // 홈에서 바로 그 대회를 연다
  await page.click('.todayrow:nth-child(2) [data-open]');
  await page.waitForTimeout(450);
  ok(await page.evaluate(() => curView()) === 'tour', '열기를 누르면 토너먼트 탭으로 넘어간다',
    await page.evaluate(() => curView()));
  ok(await page.inputValue('#td-name') === '밤 대회', '누른 대회가 실제로 열린다',
    await page.inputValue('#td-name'));

  await page.evaluate(() => { tdProfilesSet([]); DB.del('td'); });
  await page.reload({ waitUntil: 'networkidle' });
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

  let row = await txt('#rc-tbl tr:nth-child(2)');
  ok(row.includes('금요일 몬스터'), '기록이 표에 한 줄로 남는다', row.replace(/\n/g, ' | '));
  ok(row.includes('3위') && row.includes('42명'), '순위와 참가자 수가 함께 나온다', row.replace(/\n/g, ' | '));
  ok(row.includes('3회'), '바이인 횟수가 나온다', row.replace(/\n/g, ' | '));
  ok(/\+16만원/.test(row), '손익은 상금 − 지출 (25 − 9 = +16만원)', row.replace(/\n/g, ' | '));

  ok((await view()).includes('출전'), '요약에 출전 수가 나온다');

  // 대회가 열려 있으면 바이인 횟수에서 지출을 계산해 주되, 손으로 고친 값을 덮지 않는다.
  // (예전엔 blur 에 걸려 있어서 바이인 → 지출로 넘어가는 순간 칸을 덮어썼다)
  {
    await page.evaluate(() => { go('tour'); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { go('rec'); });
    await page.waitForTimeout(300);
    await page.fill('#rc-buyins', '3');
    const auto = await page.inputValue('#rc-spent');
    ok(auto !== '' && auto !== '0', '바이인을 바꾸면 지출이 대회 값으로 채워진다', auto);
    await page.fill('#rc-spent', '9');
    ok(await page.inputValue('#rc-spent') === '9', '지출에 친 값이 그대로 남는다',
      await page.inputValue('#rc-spent'));
    await page.fill('#rc-buyins', '5');
    ok(await page.inputValue('#rc-spent') === '9', '손으로 고친 뒤엔 바이인을 바꿔도 지출을 안 덮는다',
      await page.inputValue('#rc-spent'));
    await page.evaluate(() => { DB.del('td'); TD = null; renderRec(); });
    await page.waitForTimeout(250);
  }
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
  ok(/우승/.test(await txt('#rc-tbl')), '표에 우승이 표시된다');
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

  // 두 줄이 쌓였으니 묶어 보기가 나온다
  ok(/묶어 보기/.test(await view()), '기록이 둘 이상이면 묶어 보기가 나온다');
  ok(/대회별/.test(await view()) && /달별/.test(await view()), '대회별·달별 표가 둘 다 있다');
  {
    const grp = await txt('#rc-byname');
    ok(/금요일 몬스터/.test(grp) && /데일리/.test(grp), '두 대회가 모두 묶여 나온다', grp.replace(/\n/g, ' | ').slice(0, 160));
    ok((await page.locator('#rc-byname tr').count()) === 3, '대회별은 머리글 + 두 대회', String(await page.locator('#rc-byname tr').count()));
    ok((await page.locator('#rc-bymonth tr').count()) === 2, '같은 달이면 달별은 한 줄로 묶인다', String(await page.locator('#rc-bymonth tr').count()));
  }

  // CSV — 실제로 내려받아 내용을 본다
  {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
      page.click('#rc-csv'),
    ]);
    ok(!!dl, 'CSV 내보내기 버튼이 파일을 만든다');
    if (dl) {
      // 크로미움은 이름에 한글이 하나라도 있으면 이름을 통째로 버리고 «download» 로 저장한다.
      // 확장자가 사라지면 더블클릭으로 안 열리니, ASCII 로만 짓는지 확인한다.
      ok(/\.csv$/.test(dl.suggestedFilename()), '파일 이름이 .csv 로 끝난다', dl.suggestedFilename());
      ok(/^[\x20-\x7e]+$/.test(dl.suggestedFilename()), '파일 이름이 ASCII 라 브라우저가 안 버린다',
        dl.suggestedFilename());
      const p = await dl.path();
      const body = p ? fs.readFileSync(p, 'utf8') : '';
      ok(body.charCodeAt(0) === 0xfeff, '엑셀용 BOM 이 붙어 있다');
      ok(body.split('\r\n').length === 3, '머리글 + 기록 2줄', String(body.split('\r\n').length));
      ok(body.includes('금요일 몬스터') && body.includes('데일리'), '두 대회가 다 담긴다');
    }
  }

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

/* ─────────── 탭 이동 · 단축키 ─────────── */
group('탭 이동');
{
  const onTab = () => page.evaluate(() => curView());

  // 탭에 적힌 번호가 그대로 단축키여야 한다
  const printed = await page.evaluate(() =>
    [...document.querySelectorAll('#nav button')].map((b) => {
      const i = b.querySelector('i');
      return { v: b.dataset.v, num: i ? (i.textContent.match(/\d+/) || [null])[0] : null };
    }));
  let mismatch = null;
  for (const t of printed) {
    if (!t.num) continue;
    await page.click('body');
    await page.keyboard.press(t.num);
    await page.waitForTimeout(180);
    const got = await onTab();
    if (got !== t.v) { mismatch = `${t.num} 를 눌렀더니 ${t.v} 가 아니라 ${got}`; break; }
  }
  ok(!mismatch, '탭에 적힌 번호를 누르면 그 탭이 열린다', mismatch);

  await page.keyboard.press('0');
  await page.waitForTimeout(180);
  ok(await onTab() === 'home', '0 은 홈', await onTab());

  // 입력 칸에서는 숫자가 탭을 옮기지 않아야 한다 — 금액을 치다가 화면이 튀면 못 쓴다
  await tab('rec');
  await page.fill('#rc-place', '');
  await page.click('#rc-place');
  await page.keyboard.type('3');
  await page.waitForTimeout(200);
  ok(await onTab() === 'rec', '입력 칸에 숫자를 쳐도 탭이 안 바뀐다', await onTab());
  ok(await page.inputValue('#rc-place') === '3', '친 숫자는 칸에 그대로 들어간다',
    await page.inputValue('#rc-place'));

  // 계정 창이 떠 있을 때도 뒤 탭이 안 바뀌어야 한다
  await page.click('#acct-b');
  await page.waitForTimeout(200);
  await page.keyboard.press('4');
  await page.waitForTimeout(200);
  ok(await onTab() === 'rec', '계정 창이 열려 있으면 숫자 키가 안 먹는다', await onTab());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // 마지막에 보던 탭에서 이어서 열린다
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  ok(await onTab() === 'rec', '새로고침하면 마지막에 보던 탭이 열린다', await onTab());

  // 없는 탭 이름이 저장돼 있어도 홈으로 떨어진다
  await page.evaluate(() => DB.set('tab', '없는탭'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  ok(await onTab() === 'home', '저장된 탭 이름이 이상하면 홈으로 연다', await onTab());
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

  // 내보내기 버튼이 실제로 쓸 수 있는 파일을 주는지 — 이름이 한글이면 브라우저가 버린다
  await tab('help');
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
    page.click('#ex-json'),
  ]);
  ok(!!dl, '데이터 내보내기가 파일을 만든다');
  if (dl) {
    ok(/\.json$/.test(dl.suggestedFilename()), '백업 파일 이름이 .json 으로 끝난다', dl.suggestedFilename());
    ok(/^[\x20-\x7e]+$/.test(dl.suggestedFilename()), '백업 파일 이름도 ASCII 다', dl.suggestedFilename());
    const p = await dl.path();
    const body = p ? fs.readFileSync(p, 'utf8') : '';
    let parsed = null;
    try { parsed = JSON.parse(body); } catch (e) { /* 아래에서 잡힌다 */ }
    ok(!!parsed && !!parsed.data, '백업 파일이 읽을 수 있는 JSON 이다', body.slice(0, 80));
    if (parsed && parsed.data)
      ok(Object.keys(parsed.data).length > 0, '백업에 내용이 담긴다',
        Object.keys(parsed.data).join(', ').slice(0, 120));
  }
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
