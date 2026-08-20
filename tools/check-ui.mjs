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
      const cs = getComputedStyle(el);
      // 스스로 가로 스크롤을 갖는 컨테이너는 넘쳐도 정상이다
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden') continue;
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

async function scanContrast(page, where) {
  checks++;
  // 작은 글씨의 대비비가 4.5:1 미만이면 가독성 문제로 본다 (WCAG AA)
  const low = await page.evaluate(() => {
    const lum = (c) => {
      const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const bgOf = (el) => {
      let e = el;
      while (e && e !== document.documentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return parse(c);
        e = e.parentElement;
      }
      return parse(getComputedStyle(document.body).backgroundColor || 'rgb(255,255,255)');
    };
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('body *')) {
      if (!el.offsetParent) continue;
      const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue.trim()).join('');
      if (!txt) continue;
      const cs = getComputedStyle(el);
      const fg = parse(cs.color), bg = bgOf(el);
      if (fg.length < 3 || bg.length < 3) continue;
      const L1 = lum(fg), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
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
  });
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
    if (vp.w === 1440) await scanContrast(page, where);

    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `${vp.w}-${tab.v}.png`), fullPage: vp.w === 1440 });
  }

  if (consoleErrs.length) [...new Set(consoleErrs)].forEach((e) => add(`${vp.n} ${vp.w}px`, '콘솔 ' + e));
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
console.log(`✓ 화면 검증 통과 — 문제 0건 / 점검 ${checks}회 (${TABS.length}탭 × ${WIDTHS.length}폭)\n`);
