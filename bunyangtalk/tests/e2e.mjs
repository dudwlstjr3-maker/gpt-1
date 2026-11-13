// 브라우저 E2E: 서로 다른 두 계정 간 실시간 채팅 + 모바일/PC 화면 캡처
// 실행: (서버 실행 중) node tests/e2e.mjs [스크린샷 폴더]
import { createRequire } from "node:module";
// 전역 설치된 playwright 사용 (CommonJS require는 NODE_PATH·전역 경로를 따른다)
const { chromium, devices } = createRequire(import.meta.url)("playwright");
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3100";
const PW = process.env.SEED_PASSWORD || "demo1234";
const OUT = process.argv[2] || "test-results/screens";
mkdirSync(OUT, { recursive: true });
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); console.log("ok -", msg); };

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click('button[type="submit"]')]);
}

const browser = await chromium.launch();
try {
  // ───── 1) 두 계정 실시간 채팅
  const ctxA = await browser.newContext({ ...devices["iPhone 13"] });
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await login(a, "s1@example.com");
  await login(b, "s3@example.com");
  await a.goto(`${BASE}/lounge`);
  await a.click("text=입장하기");
  await a.waitForURL(/\/lounge\/chat\//);
  const roomUrl = a.url();
  await b.goto(roomUrl);
  await a.waitForSelector("text=명 접속 중", { timeout: 10000 });
  await b.waitForSelector("text=명 접속 중", { timeout: 10000 });
  await b.waitForFunction(() => /([2-9]|\d{2,})명 접속 중/.test(document.body.innerText), null, { timeout: 10000 });
  ok(true, "접속 인원 2명 이상 실시간 표시");

  const msgA = `실시간 테스트 A→B ${Date.now()}`;
  await a.fill('textarea[aria-label="메시지 입력"]', msgA);
  await a.keyboard.press("Enter");
  const t0 = Date.now();
  await b.waitForSelector(`text=${msgA}`, { timeout: 5000 });
  ok(true, `B가 새로고침 없이 A의 메시지 수신 (${Date.now() - t0}ms)`);

  const msgB = `실시간 답장 B→A ${Date.now()}`;
  await b.fill('textarea[aria-label="메시지 입력"]', msgB);
  await b.click('button[aria-label="보내기"]');
  await a.waitForSelector(`text=${msgB}`, { timeout: 5000 });
  ok(true, "A가 B의 답장 실시간 수신");

  // 삭제 실시간 반영
  await a.click(`text=${msgA}`);
  a.once("dialog", (d) => d.accept());
  await a.click('button:text-is("삭제")'); // 메뉴 항목만 (삭제된 메시지 말풍선 제외)
  await b.waitForFunction((t) => !document.body.innerText.includes(t), msgA, { timeout: 5000 });
  ok(true, "A가 삭제한 메시지가 B 화면에서 실시간으로 사라짐");

  // 닉네임만 노출
  const bText = await b.locator("body").innerText();
  ok(!bText.includes("s1@example.com"), "상대 이메일 미노출");
  await a.screenshot({ path: `${OUT}/m-chat.png` });
  await b.screenshot({ path: `${OUT}/pc-chat.png` });

  // ───── 2) 화면 캡처 (모바일 390px / PC 1440px)
  const shots = [
    ["home", "/"], ["jobs", "/jobs?region=gyeonggi"], ["job", null], ["lounge", "/lounge"], ["board", "/lounge?tab=board"],
    ["sites", "/sites"], ["me", "/me"],
  ];
  const job = await a.evaluate(async (base) => {
    const html = await (await fetch(base + "/jobs")).text();
    return html.match(/\/jobs\/([0-9a-f-]{36})/)?.[1] ?? html.match(/\/api\/ads\/click\/[0-9a-f-]{36}/)?.[0];
  }, BASE);
  for (const [name, path] of shots) {
    const p = path ?? `/jobs/${job}`;
    await a.goto(BASE + p);
    await a.screenshot({ path: `${OUT}/m-${name}.png`, fullPage: name === "home" });
    await b.goto(BASE + p);
    await b.screenshot({ path: `${OUT}/pc-${name}.png`, fullPage: name === "home" });
  }
  // 가로 넘침 검사 (모바일)
  for (const [, path] of shots.filter(([, p]) => p)) {
    await a.goto(BASE + path);
    const overflow = await a.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 0, `모바일 가로 넘침 없음 ${path} (${overflow}px)`);
  }

  // 관리자·구인자 화면
  const adm = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(adm, "admin@example.com");
  for (const t of ["dashboard", "jobs", "reports", "ads", "sales"]) {
    await adm.goto(`${BASE}/admin?tab=${t}`);
    await adm.screenshot({ path: `${OUT}/pc-admin-${t}.png`, fullPage: true });
  }
  const rec = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();
  await login(rec, "recruiter1@example.com");
  await rec.goto(`${BASE}/recruiter`);
  await rec.screenshot({ path: `${OUT}/m-recruiter.png`, fullPage: true });
  await rec.goto(`${BASE}/jobs/new`);
  await rec.screenshot({ path: `${OUT}/m-job-new.png`, fullPage: true });
  console.log("screens →", OUT);
} finally {
  await browser.close();
}
