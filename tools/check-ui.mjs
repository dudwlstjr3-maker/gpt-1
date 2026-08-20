// 2층 검증: 폴더를 정적 서버로 띄우고 실제 Chromium 으로 각 탭을 돌며
// undefined / NaN / 콘솔 오류 / 가로 넘침을 확인한다.
//   node tools/check-ui.mjs [index.html] [--shots]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const FILE = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'index.html';
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.join(ROOT, 'tools', '_shots');
const PORT = 8777;

const TABS = [
  { v: 'home', n: '홈' },
  { v: 'quiz', n: '성향 진단' },
  { v: 'hand', n: '핸드 분석' },
  { v: 'stats', n: '리크 · 기록' },
  { v: 'drill', n: '드릴' },
  { v: 'rec', n: '전적' },
  { v: 'tour', n: '토너먼트' },
  { v: 'help', n: '도움말' },
];
const WIDTHS = [
  { w: 1440, h: 900, n: '데스크톱' },
  { w: 1024, h: 768, n: '태블릿' },
  { w: 390, h: 844, n: '모바일' },
];

const MIME = { '.html': 'text/html; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };

function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rep) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || FILE;
      const f = path.join(ROOT, rel);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rep.writeHead(404); return rep.end('404'); }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    s.listen(PORT, () => res(s));
  });
}

const problems = [];
let checks = 0;
const add = (where, msg) => problems.push(`[${where}] ${msg}`);

// 화면에 보이는 텍스트에서 새는 값을 찾는다. 사람이 읽을 문구에 이런 게 뜨면 결함이다.
const LEAK = /\bundefined\b|\bNaN\b|\bnull\b|\[object Object\]|\bInfinity\b/;

async function scanText(page, where) {
  checks++;
  const hits = await page.evaluate(() => {
    const out = [];
    const bad = /\bundefined\b|\bNaN\b|\bnull\b|\[object Object\]|\bInfinity\b/;
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const t = n.nodeValue.trim();
      if (!t || !bad.test(t)) continue;
      const el = n.parentElement;
      if (!el || !el.offsetParent) continue;              // 안 보이면 넘어간다
      out.push({ text: t.slice(0, 120), tag: el.tagName.toLowerCase(), id: el.closest('[id]')?.id || '' });
    }
    // input 의 value 도 본다
    for (const i of document.querySelectorAll('input,textarea')) {
      if (i.offsetParent && bad.test(String(i.value))) out.push({ text: 'value=' + i.value, tag: 'input', id: i.id });
    }
    return out;
  });
  for (const h of hits) add(where, `노출 텍스트에 ${LEAK.exec(h.text)?.[0]}: "${h.text}" (${h.tag}${h.id ? '#' + h.id : ''})`);
}

async function scanOverflow(page, where, vw) {
  checks++;
  const res = await page.evaluate((vw) => {
    const out = { doc: 0, els: [] };
    const de = document.documentElement;
    out.doc = de.scrollWidth - de.clientWidth;
    for (const el of document.querySelectorAll('body *')) {
      if (!el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      // 스스로, 또는 조상 중 하나가 가로 스크롤을 갖는다면 넘쳐도 정상이다.
      // (넓은 표를 .scrollx 로 감싼 경우 — 표는 그 안에서 스크롤된다)
      let scrolled = false;
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const ox = getComputedStyle(e).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') { scrolled = true; break; }
      }
      if (scrolled) continue;
      if (r.right > vw + 1 || r.left < -1) {
        out.els.push({ tag: el.tagName.toLowerCase(), cls: el.className?.toString().slice(0, 40) || '', id: el.id || '', right: Math.round(r.right), left: Math.round(r.left) });
      }
    }
    out.els = out.els.slice(0, 6);
    return out;
  }, vw);
  if (res.doc > 1) add(where, `페이지가 가로로 ${res.doc}px 넘칩니다`);
  for (const e of res.els) add(where, `요소가 화면 밖: <${e.tag}${e.id ? '#' + e.id : ''}${e.cls ? '.' + e.cls.split(' ')[0] : ''}> left=${e.left} right=${e.right} (뷰포트 ${vw})`);
}

/* 자기 상자보다 내용이 넓은 요소 — 화면 밖으로 안 나가도 그 자리에서 잘리거나 옆을 침범한다.
   가운데 정렬이면 왼쪽으로도 넘쳐서 화면 기준 검사에는 안 걸린다. */
async function scanClipped(page, where, root) {
  checks++;
  const hits = await page.evaluate((root) => {
    const scope = root ? document.querySelector(root) : document.body;
    if (!scope) return [];
    const out = [];
    for (const el of scope.querySelectorAll('*')) {
      if (!el.offsetParent) continue;
      const cs = getComputedStyle(el);
      if (/auto|scroll|hidden/.test(cs.overflowX)) continue;   // 스스로 감당하는 컨테이너는 제외
      const over = el.scrollWidth - el.clientWidth;
      if (over <= 1 || el.clientWidth === 0) continue;
      const txt = (el.textContent || '').trim().slice(0, 40);
      if (!txt) continue;
      out.push({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 30),
        id: el.id || '', over, w: el.clientWidth, txt });
    }
    return out.slice(0, 8);
  }, root);
  for (const h of hits)
    add(where, `내용이 상자보다 ${h.over}px 넓어 잘립니다: <${h.tag}${h.id ? '#' + h.id : ''}` +
      `${h.cls ? '.' + h.cls.split(' ')[0] : ''}> 상자 ${h.w}px · "${h.txt}"`);
}

async function scanContrast(page, where, root) {
  checks++;
  // 작은 글씨의 대비비가 4.5:1 미만이면 가독성 문제로 본다 (WCAG AA)
  const low = await page.evaluate((root) => {
    const lum = (c) => {
      const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    // Chromium 은 color-mix() 를 `color(srgb 0.93 0.95 0.97 / 0.88)` 로 돌려준다 (0~1 스케일).
    // rgb()/rgba() 는 0~255. 둘 다 [r,g,b,a] 0~255 로 맞춘다.
    const parse = (s) => {
      if (!s) return null;
      const nums = (s.match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number);
      if (nums.length < 3) return null;
      const unit = /^color\(/i.test(s.trim()) ? 255 : 1;    // color() 은 0~1 이라 255 를 곱한다
      const a = nums.length >= 4 ? nums[3] : 1;
      return [nums[0] * unit, nums[1] * unit, nums[2] * unit, a];
    };
    // 반투명 배경은 뒤 배경 위에 실제로 합성해야 진짜 색이 나온다
    const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
    // 그라데이션은 backgroundColor 가 투명으로 나온다. 색 정지점을 모두 뽑아
    // «가장 불리한 정지점» 으로 검사한다 — 버튼 배경이 대개 그라데이션이라 이게 없으면 검사가 눈을 감는다.
    const gradStops = (el) => {
      const bi = getComputedStyle(el).backgroundImage || '';
      if (!/gradient/i.test(bi)) return [];
      const out = [];
      const re = /(?:rgba?|color)\([^)]*\)/gi;
      let m;
      while ((m = re.exec(bi)) !== null) { const c = parse(m[0]); if (c) out.push(c); }
      return out;
    };
    const bgOf = (el) => {
      const stack = [];
      let e = el;
      while (e && e !== document.documentElement) {
        const cs = getComputedStyle(e);
        const c = parse(cs.backgroundColor);
        if (c && c[3] > 0) { stack.push(c); if (c[3] >= 0.999) break; }
        if (/gradient/i.test(cs.backgroundImage || '')) break;   // 그라데이션은 따로 본다
        e = e.parentElement;
      }
      const root = parse(getComputedStyle(document.documentElement).backgroundColor);
      let base = (root && root[3] >= 0.999) ? root.slice(0, 3) : [255, 255, 255];
      for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
      return base;
    };
    /* 이 요소 뒤에 실제로 깔리는 색 후보들 — 그라데이션이면 정지점마다 하나씩 */
    const bgCandidates = (el) => {
      const under = bgOf(el);
      const out = [];
      for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
        const st = gradStops(e);
        if (st.length) { st.forEach((c) => out.push(c[3] >= 0.999 ? c.slice(0, 3) : over(c, under))); break; }
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c[3] >= 0.999) break;
      }
      return out.length ? out : [under];
    };
    const out = [];
    const seen = new Set();
    const scope = root ? document.querySelector(root) : document.body;
    if (!scope) return [];
    for (const el of scope.querySelectorAll('*')) {
      if (!el.offsetParent) continue;
      const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue.trim()).join('');
      if (!txt) continue;
      const cs = getComputedStyle(el);
      const fgp = parse(cs.color);
      if (!fgp) continue;
      const cands = bgCandidates(el);
      let ratio = Infinity, bg = cands[0];
      for (const c of cands) {
        const fg = fgp[3] >= 0.999 ? fgp.slice(0, 3) : over(fgp, c);
        const L1 = lum(fg), L2 = lum(c);
        const r = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        if (r < ratio) { ratio = r; bg = c; }        // 가장 불리한 정지점 기준
      }
      const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
      const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
      if (ratio < need) {
        const key = cs.color + '|' + bg.join(',') + '|' + Math.round(size);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ratio: +ratio.toFixed(2), need, size, color: cs.color, txt: txt.slice(0, 40), cls: el.className?.toString().slice(0, 30) || '' });
      }
    }
    return out.slice(0, 12);
  }, root);
  for (const l of low) add(where, `대비 ${l.ratio}:1 < ${l.need}:1 · ${l.size}px ${l.color} · "${l.txt}" (.${l.cls.split(' ')[0]})`);
}

// 이 컨테이너에 미리 깔린 Chromium 을 쓴다 (playwright 버전과 브라우저 빌드 번호가 어긋나도 동작)
const PREINSTALLED = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {};

const server = await serve();
const browser = await chromium.launch(launchOpts);
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });

for (const vp of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
  const consoleErrs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrs.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => consoleErrs.push('pageerror: ' + e.message.slice(0, 200)));

  await page.goto(`http://localhost:${PORT}/${FILE}`, { waitUntil: 'networkidle' });

  for (const tab of TABS) {
    const where = `${vp.n} ${vp.w}px · ${tab.n}`;
    const btn = page.locator(`nav button[data-v="${tab.v}"]`);
    if (await btn.count() === 0) { add(where, '탭 버튼을 찾을 수 없습니다'); continue; }
    await btn.click();
    await page.waitForTimeout(220);

    checks++;
    const on = await page.locator(`#v-${tab.v}`).isVisible();
    if (!on) { add(where, '탭을 눌렀는데 화면이 보이지 않습니다'); continue; }

    checks++;
    const empty = await page.locator(`#v-${tab.v}`).evaluate((el) => el.textContent.trim().length);
    if (empty < 20) add(where, `내용이 비어 있습니다 (텍스트 ${empty}자)`);

    await scanText(page, where);
    await scanOverflow(page, where, vp.w);
    await scanClipped(page, where);

    // 레이아웃은 테마와 무관하니 대비만 라이트·다크 양쪽으로 본다
    if (vp.w === 1440) {
      for (const th of ['dark', 'light']) {
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), th);
        await page.waitForTimeout(400);   // CSS 트랜지션이 끝나야 최종 색이 읽힌다
        await scanContrast(page, `${where} · ${th === 'light' ? '밝게' : '어둡게'}`);
        if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `${th}-${tab.v}.png`), fullPage: true });
      }
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    } else if (SHOTS) {
      await page.screenshot({ path: path.join(SHOT_DIR, `${vp.w}-${tab.v}.png`) });
    }
  }

  if (consoleErrs.length) [...new Set(consoleErrs)].forEach((e) => add(`${vp.n} ${vp.w}px`, '콘솔 ' + e));
  await page.close();
}

/* ── 전광판: 테마 6종 × (진행 중 · 휴식 중) ──
   TV 에 걸리는 화면이라 멀리서 읽힌다. 어느 테마에서도 대비가 무너지면 안 된다.
   전광판은 앱 테마와 무관하게 자기 색을 쓰므로 따로 돌린다. */
const BTHEMES = ['night', 'black', 'felt', 'wine', 'steel', 'bright'];
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await page.goto(`http://localhost:${PORT}/${FILE}`, { waitUntil: 'networkidle' });

  // 광고 슬라이드를 켜 둔 상태로 검사한다 (아래띠도 전광판의 일부다)
  await page.evaluate(() => {
    localStorage.setItem('hb.tdslides', JSON.stringify([
      { id: 's1', title: '다음 대회 — 금요일 몬스터', body: '매주 금요일 19:30 · 바이인 3만원 · 500만 스택' },
      { id: 's2', title: '매장 공지', body: '주차는 건물 뒤편 공영주차장을 이용해 주세요' },
    ]));
    localStorage.setItem('hb.adcfg', JSON.stringify({ on: true, sec: 60, bigOnBreak: true }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('nav button[data-v="tour"]');
  await page.waitForTimeout(300);
  await page.click('#td-quick');                       // 대회를 열어 전광판을 띄운다
  await page.waitForTimeout(500);

  checks++;
  if (await page.locator('#td-screen').count() === 0) {
    add('전광판', '대회를 시작했는데 전광판이 렌더되지 않습니다');
  } else {
    checks++;
    if (await page.locator('#td-ad .adslide').count() === 0) add('전광판', '광고 띠가 렌더되지 않습니다');

    for (const bt of BTHEMES) {
      await page.evaluate((t) => {
        localStorage.setItem('hb.btheme', JSON.stringify(t));
        document.getElementById('td-screen').setAttribute('data-btheme', t);
      }, bt);
      await page.waitForTimeout(250);

      await scanContrast(page, `전광판 · ${bt}`, '#td-screen');
      await scanText(page, `전광판 · ${bt}`);
      await scanClipped(page, `전광판 · ${bt}`, '#td-screen');

      // 전광판이 가로로 넘치면 TV 에서 잘린다
      checks++;
      const spill = await page.evaluate(() => {
        const el = document.getElementById('td-screen');
        return el ? el.scrollWidth - el.clientWidth : 0;
      });
      if (spill > 1) add(`전광판 · ${bt}`, `전광판이 가로로 ${spill}px 넘칩니다`);

      if (SHOTS) await page.locator('#td-screen').screenshot({ path: path.join(SHOT_DIR, `board-${bt}.png`) });
    }

    // 휴식 중 화면 — 광고가 크게 뜨고 레이아웃이 바뀐다
    await page.evaluate(() => {
      const td = JSON.parse(localStorage.getItem('hb.td'));
      const i = td.levels.findIndex((l) => l.brk);
      if (i >= 0) { td.lvl = i; td.remain = (td.levels[i].min || 1) * 60000; localStorage.setItem('hb.td', JSON.stringify(td)); }
      return i;
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('nav button[data-v="tour"]');
    await page.waitForTimeout(450);
    checks++;
    if (await page.locator('#td-screen .lvrow.brkc').count() === 0) {
      add('전광판 · 휴식', '휴식 레벨인데 휴식 표시가 없습니다');
    }
    checks++;
    if (await page.locator('#td-ad.big').count() === 0) add('전광판 · 휴식', '휴식 중 광고가 크게 뜨지 않습니다');
    await scanContrast(page, '전광판 · 휴식', '#td-screen');
    await scanText(page, '전광판 · 휴식');
    await scanClipped(page, '전광판 · 휴식', '#td-screen');
    if (SHOTS) await page.locator('#td-screen').screenshot({ path: path.join(SHOT_DIR, 'board-break.png') });
  }

  if (errs.length) [...new Set(errs)].forEach((e) => add('전광판', '콘솔 ' + e));
  await page.close();
}

/* ── 전적: 기록이 쌓인 상태 ──
   탭 순회 때는 비어 있어서 표도 등급표도 안 그려진다. 채워 놓고 한 번 더 본다. */
for (const vp of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await page.goto(`http://localhost:${PORT}/${FILE}`, { waitUntil: 'networkidle' });

  await page.evaluate(() => {
    // 우승 · 인더머니 · 꼴찌 · 순위 미기입을 한 줄씩 — 표의 모든 갈래를 그리게
    recAdd({ at: Date.parse('2026-01-09T12:00'), name: '금요일 몬스터 리그', place: 1, field: 42, buyins: 3, spent: 90000, prize: 700000 });
    recAdd({ at: Date.parse('2026-02-13T12:00'), name: '데일리', place: 6, field: 30, buyins: 1, spent: 10000, prize: 40000 });
    recAdd({ at: Date.parse('2026-03-06T12:00'), name: '데일리', place: 28, field: 30, buyins: 4, spent: 40000, prize: 0 });
    recAdd({ at: Date.parse('2026-04-03T12:00'), name: '이름이 아주아주 긴 대회 이름입니다', place: 0, field: 0, buyins: 1, spent: 10000, prize: 0 });
    // 등급이 매겨질 만큼의 드릴 표본
    DB.set('drills', [{ at: Date.now(), n: 60, ok: 39, loss: 22, passive: 9, aggro: 4 }]);
    // 연습 누적 카드가 그려지도록 핸드도 (저장 코드가 만드는 모양 그대로)
    DB.set('hands', [{
      at: Date.now(), cls: 'AQs', pos: 'BTN', vpos: 'BB', pf: 'open', vt: '스테이션',
      hole: ['As', 'Qs'], board: ['Ks', '7h', '2d'],
      streets: [{ n: '플랍', rec: '벳', my: '체크', eq: 0.55, evLoss: 0.4, tags: ['소극적'] }]
    }]);
    go('rec');
  });
  await page.waitForTimeout(300);

  const where = `${vp.n} ${vp.w}px · 전적(기록 있음)`;
  checks++;
  if (await page.locator('#v-rec tbody tr, #v-rec table tr').count() < 5) add(where, '출전 기록 표가 그려지지 않았습니다');
  checks++;
  if (!(await page.locator('#v-rec').innerText()).includes('우승')) add(where, '우승 표시가 없습니다');
  checks++;
  {
    const t = await page.locator('#v-rec').innerText();
    if (/측정 중/.test(t)) add(where, `드릴 표본을 넣었는데 등급이 «측정 중» 입니다`);
  }

  await scanText(page, where);
  await scanOverflow(page, where, vp.w);
  await scanClipped(page, where);
  if (vp.w === 1440) {
    for (const th of ['dark', 'light']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), th);
      await page.waitForTimeout(400);
      await scanContrast(page, `${where} · ${th === 'light' ? '밝게' : '어둡게'}`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `${th}-rec-full.png`), fullPage: true });
    }
  }

  if (errs.length) [...new Set(errs)].forEach((e) => add(where, '콘솔 ' + e));
  await page.close();
}

/* ── 계정 창 ──
   평소엔 hidden 이라 탭 순회에 안 걸린다. 열어 둔 상태로 따로 본다.
   PIN 입력 줄까지 펼쳐야 좁은 폭에서 눌리는지 확인된다. */
for (const vp of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await page.goto(`http://localhost:${PORT}/${FILE}`, { waitUntil: 'networkidle' });

  // 아바타 색은 5종을 돌려쓰므로 5개를 다 띄워야 전부 검사된다.
  // 하나는 PIN 이 걸려 있고, PIN 입력 줄까지 펼친 상태로 본다.
  await page.evaluate(() => {
    ['둘', '셋', '넷', '아주아주긴이름의선수'].forEach((n) => acctAdd(n));
    const l = acctList();
    acctSetPin(l[0].id, '1234');
    openAcct();
    ACPIN = l[0].id;
    renderAcct();
  });
  await page.waitForTimeout(250);

  const where = `${vp.n} ${vp.w}px · 계정 창`;
  checks++;
  if (!(await page.locator('#acct-m').isVisible())) { add(where, '계정 창이 열리지 않습니다'); }
  else {
    checks++;
    if (await page.locator('#acct-body .acrow').count() !== 5) add(where, '계정 줄이 5개가 아닙니다');
    checks++;
    {
      const cls = await page.locator('#acct-body .acav').evaluateAll((es) =>
        [...new Set(es.map((e) => e.className.replace('acav big', '').trim() || 'n0'))].sort());
      if (cls.length !== 5) add(where, `아바타 색이 5종 다 안 나옵니다 (${cls.join(',')})`);
    }
    checks++;
    if (await page.locator('#ac-pin-in').count() !== 1) add(where, 'PIN 입력 줄이 펼쳐지지 않았습니다');

    await scanText(page, where);
    await scanOverflow(page, where, vp.w);
    await scanClipped(page, where, '#acct-m');

    if (vp.w === 1440) {
      for (const th of ['dark', 'light']) {
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), th);
        await page.waitForTimeout(400);
        await scanContrast(page, `${where} · ${th === 'light' ? '밝게' : '어둡게'}`, '#acct-m');
        if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `${th}-acct.png`) });
      }
    }
  }

  if (errs.length) [...new Set(errs)].forEach((e) => add(where, '콘솔 ' + e));
  await page.close();
}

await browser.close();
server.close();

console.log('');
if (problems.length) {
  console.log(`✗ 화면 검증 문제 ${problems.length}건 / 점검 ${checks}회\n`);
  problems.forEach((p) => console.log('  ✗ ' + p));
  console.log('');
  process.exit(1);
}
console.log(`✓ 화면 검증 통과 — 문제 0건 / 점검 ${checks}회 ` +
  `(${TABS.length}탭 × ${WIDTHS.length}폭 + 전광판 테마 ${BTHEMES.length}종 · 휴식 + 전적 · 계정 창)\n`);
