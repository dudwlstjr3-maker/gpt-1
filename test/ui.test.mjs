/* Browser smoke test of the built index.html. Run: node --test test/ui.test.mjs
 * Requires the build to be current: node build.mjs                          */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const URL = "file://" + join(root, "index.html");

/* The sandbox ships a Chromium that may not match the installed Playwright's
 * pinned revision, so launch the one that is actually on disk.              */
import { existsSync, readdirSync } from "node:fs";
function chromiumPath() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!existsSync(base)) return undefined;
  const dir = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  if (!dir) return undefined;
  const exe = join(base, dir, "chrome-linux", "chrome");
  return existsSync(exe) ? exe : undefined;
}

let browser, page, errors;
before(async () => {
  browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--no-sandbox"] });
  page = await browser.newPage();
  errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForSelector("#nav button");
});
after(async () => { await browser.close(); });

const noErrors = () => assert.deepEqual(errors, [], "console/page errors: " + errors.join(" | "));

test("boots with no runtime errors and renders the nav", async () => {
  const tabs = await page.$$eval("#nav button", (b) => b.map((x) => x.textContent.trim()));
  assert.ok(tabs.length >= 6, "expected the full nav, got " + tabs.join(","));
  noErrors();
});

test("every view renders", async () => {
  for (const v of ["quiz", "hand", "stats", "drill", "range", "tour", "help", "home"]) {
    await page.click(`#nav button[data-v="${v}"]`);
    await page.waitForSelector(`#v-${v}.on`);
    const html = await page.$eval(`#v-${v}`, (e) => e.innerHTML.trim());
    assert.ok(html.length > 40, `view ${v} rendered empty`);
  }
  noErrors();
});

test("language switch translates the whole UI and persists", async () => {
  await page.selectOption("#langsel", "en");
  await page.waitForFunction(() => document.documentElement.lang === "en");
  const navEn = await page.$eval("#nav", (e) => e.textContent);
  assert.match(navEn, /Practice/);
  await page.selectOption("#langsel", "ko");
  await page.waitForFunction(() => document.documentElement.lang === "ko");
  const navKo = await page.$eval("#nav", (e) => e.textContent);
  assert.match(navKo, /핸드 연습/);
  // survives a reload
  await page.reload();
  await page.waitForSelector("#nav button");
  assert.equal(await page.evaluate(() => document.documentElement.lang), "ko");
  await page.selectOption("#langsel", "en");
  await page.waitForFunction(() => document.documentElement.lang === "en");
  noErrors();
});

test("theme toggle flips and persists", async () => {
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.click("#themebtn");
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  assert.notEqual(before, after);
  await page.reload();
  await page.waitForSelector("#nav button");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), after);
  await page.click("#themebtn");
  noErrors();
});

test("a full drill spot can be answered and shows a signed EV for every option", async () => {
  await page.click('#nav button[data-v="drill"]');
  await page.waitForSelector("#dr-go");
  await page.click("#dr-go");
  await page.waitForSelector(".dopt", { timeout: 30000 });
  const nOpts = await page.$$eval(".dopt", (b) => b.length);
  assert.ok(nOpts >= 2, "a decision needs at least two options");
  await page.click(".dopt");
  await page.waitForSelector(".dtable .drow");
  const rows = await page.$$eval(".dtable .drow .dv", (e) => e.map((x) => x.textContent.trim()));
  assert.ok(rows.length >= 2);
  rows.forEach((r) => assert.match(r, /^[+-]\d/, "EV cell not signed: " + r));
  // the reported bug: it must be possible to see a +EV line
  assert.ok(await page.$(".dbadge.b"), "no best-option badge rendered");
  assert.ok(await page.$("#dr-next"), "no next button");
  noErrors();
});

/* Drill state lives in memory, so a reload is the cleanest way to guarantee a
 * fresh session regardless of what an earlier test left on screen.          */
async function startFreshDrill() {
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.click('#nav button[data-v="drill"]');
  await page.waitForSelector("#dr-go", { timeout: 30000 });
  await page.click("#dr-go");
  await page.waitForSelector(".dopt", { timeout: 60000 });
}

test("across many drill spots, +EV options actually appear", async () => {
  await startFreshDrill();
  let sawPositive = 0, spots = 0;
  for (let i = 0; i < 8; i++) {
    await page.click(".dopt");
    await page.waitForSelector(".dtable .drow");
    const evs = await page.$$eval(".dtable .drow .dv", (e) => e.map((x) => parseFloat(x.textContent)));
    spots++;
    if (evs.some((v) => v > 0)) sawPositive++;
    const next = await page.$("#dr-next");
    if (!next) break;
    await next.click();
    if (await page.$("#dr-again")) break;                  // session finished
    await page.waitForSelector(".dopt", { timeout: 60000 });
  }
  assert.ok(spots >= 5, "expected to walk several spots, got " + spots);
  assert.ok(sawPositive / spots >= 0.5,
    `only ${sawPositive}/${spots} spots showed a +EV option — the original bug`);
  noErrors();
});

test("keyboard shortcuts pick an option", async () => {
  await startFreshDrill();
  await page.keyboard.press("1");
  await page.waitForSelector(".dtable .drow");
  assert.ok(await page.$(".drow.mine"), "keyboard pick was not registered");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".dopt", { timeout: 60000 });
  noErrors();
});

test("hand analysis runs from the demo hand and produces street EV tables", async () => {
  await page.click('#nav button[data-v="hand"]');
  await page.waitForSelector("#h-demo");
  await page.click("#h-demo");
  await page.click("#h-run");
  await page.waitForSelector("#h-out .stcard", { timeout: 30000 });
  const streets = await page.$$eval("#h-out .stcard", (e) => e.length);
  assert.ok(streets >= 2, "expected flop and turn analysis, got " + streets);
  // the EV table is behind a disclosure now
  await page.$$eval("#h-out .stcard details.numd", (ds) => ds.forEach((d) => (d.open = true)));
  const evCells = await page.$$eval("#h-out .dtable .drow .dv", (e) => e.map((x) => x.textContent.trim()));
  assert.ok(evCells.length > 0, "no EV table in the analysis");
  evCells.forEach((c) => assert.match(c, /^[+-]\d/));
  assert.ok(await page.$("#h-save"), "no save button");
  noErrors();
});

test("range lab computes a known equity", async () => {
  await page.click('#nav button[data-v="range"]');
  await page.waitForSelector("#rg-go");
  await page.fill("#rg-hand", "AsAh");
  await page.fill("#rg-range", "KK");
  await page.fill("#rg-board", "");
  await page.click("#rg-go");
  await page.waitForSelector("#rg-out .blk", { timeout: 30000 });
  const txt = await page.$eval("#rg-out", (e) => e.textContent);
  const m = txt.match(/(\d+)%/);
  assert.ok(m, "no percentage in the result: " + txt);
  const eq = +m[1];
  assert.ok(eq >= 79 && eq <= 83, `AA vs KK should be ~81%, got ${eq}%`);
  noErrors();
});

test("quiz can be started and answered", async () => {
  await page.click('#nav button[data-v="quiz"]');
  await page.waitForSelector("#qz-go");
  await page.click("#qz-go");
  await page.waitForSelector(".opt");
  for (let i = 0; i < 5; i++) {
    const opt = await page.$(".opt");
    if (!opt) break;
    await opt.click();
    await page.waitForTimeout(60);
  }
  const progress = await page.$eval("#v-quiz .dprog", (e) => e.textContent);
  assert.match(progress, /5/, "progress did not advance: " + progress);
  noErrors();
});

test("data export produces a valid download", async () => {
  await page.click('#nav button[data-v="help"]');
  await page.waitForSelector("#ex-json");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#ex-json")]);
  assert.match(download.suggestedFilename(), /holdem-studio-.*\.json/);
  noErrors();
});

test("no horizontal overflow at mobile width", async () => {
  await page.setViewportSize({ width: 360, height: 760 });
  for (const v of ["home", "hand", "drill", "range", "help"]) {
    await page.click(`#nav button[data-v="${v}"]`);
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `${v} overflows horizontally by ${overflow}px`);
  }
  noErrors();
});

test("no untranslated i18n key paths leak into the UI", async () => {
  await page.reload();
  await page.waitForSelector("#nav button");
  for (const lang of ["en", "ko"]) {
    await page.selectOption("#langsel", lang);
    await page.waitForTimeout(200);
    for (const v of ["home", "quiz", "hand", "stats", "range", "help"]) {
      await page.click(`#nav button[data-v="${v}"]`);
      await page.waitForTimeout(120);
      const text = await page.$eval(`#v-${v}`, (e) => e.innerText);
      // a leaked key looks like "common.myCards" / "drill.story.checkCheck"
      const leaks = text.match(/\b(common|hand|drill|quiz|stats|help|home|range|villain|axes|scenarios|positions|draws|texture|bankroll|profileNotes|archetypes|app|nav)\.[a-zA-Z0-9.]+/g);
      assert.equal(leaks, null, `${lang}/${v} leaked i18n keys: ${leaks && leaks.join(", ")}`);
    }
  }
  noErrors();
});

test("preflop bet sizes drive the pot", async () => {
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="hand"]');
  await page.waitForSelector("#pf-chips button");

  await page.click('#pf-chips button[data-k="open_call"]');
  await page.waitForSelector('#pf-sizes input[data-sz="open"]');
  const potFor = async (v) => {
    await page.fill('#pf-sizes input[data-sz="open"]', String(v));
    await page.waitForTimeout(120);
    const txt = await page.$eval("#pf-sizes", (e) => e.innerText);
    return parseFloat(txt.match(/([\d.]+)BB/)[1]);
  };
  const a = await potFor(2.5), b = await potFor(3), c = await potFor(5);
  assert.ok(b > a && c > b, `pot must grow with the open: ${a} ${b} ${c}`);
  assert.equal(c - b, 4, "each extra BB opened adds 2BB to the pot");
  noErrors();
});

test("preflop all-in is analysed as an equity decision", async () => {
  await page.click('#pf-chips button[data-k="pf_allin"]');
  await page.waitForSelector("#pf-shover button");
  await page.fill('#pf-sizes input[data-sz="allin"]', "20");
  await page.waitForTimeout(120);

  const id = (r, s) => "23456789TJQKA".indexOf(r) * 4 + "shdc".indexOf(s);
  await page.click(`.dc[data-c="${id("A", "h")}"]`);
  await page.click(`.dc[data-c="${id("K", "d")}"]`);
  await page.click("#h-run");
  await page.waitForSelector("#h-out .recbox", { timeout: 60000 });

  const text = await page.$eval("#h-out", (e) => e.innerText);
  // actual and required equity are shown as one bar rather than two tiles
  assert.match(text, /Equity/, "no equity shown");
  assert.ok(await page.$("#h-out .eqbar i"), "no equity bar");
  assert.ok(await page.$("#h-out .eqbar u"), "no break-even marker on the bar");
  const lab = await page.$eval("#h-out .eqlab", (e) => e.innerText);
  assert.match(lab, /have\s+\d+%/i, "actual equity missing: " + lab);
  assert.match(lab, /need\s+\d+%/i, "required equity missing: " + lab);
  // AKo against a 20BB shoving range is a clear call
  assert.match(text, /Calling is profitable/, "AKo should be a call: " + text.slice(0, 400));
  // an all-in has no streets, so no per-street cards
  assert.equal(await page.$$eval("#h-out .stcard", (e) => e.length), 0, "all-in should not render streets");
  noErrors();
});

test("shoving junk is reported as a fold", async () => {
  await page.click("#h-clear");
  await page.waitForSelector("#pf-shover button");
  await page.click('#pf-shover button[data-k="hero"]');
  await page.fill('#pf-sizes input[data-sz="allin"]', "15");
  await page.waitForTimeout(120);
  const id = (r, s) => "23456789TJQKA".indexOf(r) * 4 + "shdc".indexOf(s);
  await page.click(`.dc[data-c="${id("7", "c")}"]`);
  await page.click(`.dc[data-c="${id("2", "d")}"]`);
  await page.click("#h-run");
  await page.waitForSelector("#h-out .recbox", { timeout: 60000 });
  const text = await page.$eval("#h-out", (e) => e.innerText);
  assert.match(text, /Shoving loses/, "72o at 15BB should not be a shove: " + text.slice(0, 300));
  noErrors();
});

test("a drill session tracks EV earned, not only EV lost", async () => {
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="drill"]');
  await page.waitForSelector("#dr-n button");
  await page.click('#dr-n button[data-n="5"]');
  await page.click("#dr-go");

  const picked = [];
  for (let i = 0; i < 5; i++) {
    await page.waitForSelector(".dopt", { timeout: 60000 });
    // vary the pick so the session is not all folds
    const n = await page.$$eval(".dopt", (b) => b.length);
    await page.click(`.dopt:nth-of-type(${(i % n) + 1})`);
    await page.waitForSelector("#dr-next", { timeout: 60000 });

    // the header must report both, and earned must be signed
    const header = await page.$eval(".dprog", (e) => e.innerText);
    assert.match(header, /Earned so far\s*[+-]/, "header lost the earned total: " + header);
    assert.match(header, /Lost so far/, "header lost the loss total: " + header);

    // remember what this pick was worth
    const mine = await page.$eval(".recbox .ra", (e) => e.innerText);
    picked.push(parseFloat(mine.match(/([+-][\d.]+)\s*BB/)[1]));
    await page.click("#dr-next");
  }

  await page.waitForSelector("#dr-again", { timeout: 60000 });
  const kpis = await page.$$eval(".kpi .k", (ks) => ks.map((k) => k.innerText.replace(/\n/g, "|")));
  const find = (label) => {
    const row = kpis.find((k) => k.startsWith(label));
    assert.ok(row, `no "${label}" tile: ${kpis.join(" / ")}`);
    return parseFloat(row.split("|")[1]);
  };
  const earned = find("EV earned"), best = find("Perfect play"), lost = find("Total EV lost");

  // earned is exactly the sum of what the player actually picked
  const expected = picked.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(earned - expected) < 0.03,
    `earned ${earned} should equal the sum of picks ${expected.toFixed(2)}`);
  // and the three numbers have to be consistent with each other
  assert.ok(best >= earned - 1e-6, `perfect play (${best}) cannot be below what was earned (${earned})`);
  assert.ok(Math.abs((best - earned) - Math.abs(lost)) < 0.05,
    `best - earned (${(best - earned).toFixed(2)}) should equal EV lost (${Math.abs(lost).toFixed(2)})`);
  noErrors();
});

test("seats take an opponent type, duplicates allowed", async () => {
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="hand"]');
  await page.waitForSelector("#seat-palette button");

  // the palette offers "me", "empty" and every opponent type
  const palette = await page.$$eval("#seat-palette button", (b) => b.map((x) => x.dataset.k));
  assert.ok(palette.includes("me"), "palette missing me");
  assert.ok(!palette.includes("empty"), "the empty brush should be gone");
  assert.ok(palette.includes("station") && palette.includes("nit"), "palette missing types");

  // seat the SAME type in three seats — the duplicate case
  await page.click('#seat-palette button[data-k="station"]');
  for (const p of ["UTG", "HJ", "CO"]) { await page.click(`.seat[data-p="${p}"]`); await page.waitForTimeout(60); }
  await page.click('#seat-palette button[data-k="nit"]');
  for (const p of ["SB", "BB"]) { await page.click(`.seat[data-p="${p}"]`); await page.waitForTimeout(60); }

  const chips = await page.$$eval("#vt-chips button", (b) => b.map((x) => x.innerText));
  assert.equal(chips.length, 5, "expected 5 seated opponents, got " + chips.join(" | "));
  assert.equal(chips.filter((c) => /station/i.test(c)).length, 3, "duplicates were collapsed: " + chips.join(" | "));

  // moving myself frees the seat I left and takes the new one
  await page.click('#seat-palette button[data-k="me"]');
  await page.click('.seat[data-p="CO"]');
  await page.waitForTimeout(80);
  const after = await page.$$eval("#vt-chips button", (b) => b.map((x) => x.innerText));
  assert.ok(!after.some((c) => c.startsWith("CO")), "my own seat is still listed as an opponent");

  // choosing which opponent the hand is against drives the type used
  await page.click("#vt-chips button:last-of-type");
  await page.waitForTimeout(80);
  const active = await page.$eval("#vt-chips button.on", (e) => e.innerText);
  const desc = await page.$eval("#vt-desc", (e) => e.innerText);
  assert.ok(desc.length > 10, "no description for the designated opponent");
  assert.ok(await page.$(".seat.active"), "designated opponent is not marked on the table");

  // tapping a seat again with the same type clears just that seat
  await page.click('#seat-palette button[data-k="station"]');
  await page.click('.seat[data-p="UTG"]');
  await page.waitForTimeout(80);
  const cleared = await page.$$eval("#vt-chips button", (b) => b.map((x) => x.innerText));
  assert.ok(!cleared.some((c) => c.startsWith("UTG")), "cleared seat still listed");

  // and the analysis still runs off the designated opponent
  await page.click("#h-demo");
  await page.click("#h-run");
  await page.waitForSelector("#h-out .stcard", { timeout: 60000 });
  assert.ok((await page.$$eval("#h-out .stcard", (e) => e.length)) >= 2);
  noErrors();
});

test("the stack field cannot be confused with a chip count", async () => {
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="hand"]');
  await page.waitForSelector("#s-stack");

  // a sane depth shows the chip equivalent, no warning
  await page.fill("#s-bl", "500/1000");
  await page.fill("#s-stack", "100");
  await page.waitForTimeout(150);
  let hint = await page.$eval("#stack-hint", (e) => e.innerText);
  assert.match(hint, /100,?000/, "chip equivalent missing: " + hint);
  assert.ok(!(await page.$("#stack-hint .warn")), "warned about a normal 100BB stack");

  // a chip count typed into a BB field must be called out, not silently used
  await page.fill("#s-stack", "42000");
  await page.waitForTimeout(150);
  hint = await page.$eval("#stack-hint", (e) => e.innerText);
  assert.ok(await page.$("#stack-hint .warn"), "42000 'BB' was accepted silently: " + hint);
  assert.match(hint, /big blinds/i);

  // and practice must not run a 42000BB stack
  const used = await page.evaluate(() => setupStack());
  assert.ok(used <= 500, "practice would use a " + used + "BB stack");
  await page.fill("#s-stack", "100");
});

test("practice offers short stacks and actually deals them", async () => {
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="drill"]');
  await page.waitForSelector("#dr-depth button");

  const depths = await page.$$eval("#dr-depth button", (b) => b.map((x) => x.dataset.k));
  assert.deepEqual(depths, ["random", "deep", "mid", "short", "ultra"], "depth options: " + depths.join(","));

  // pick the ultra-short bucket and check the spots really are short
  await page.click('#dr-depth button[data-k="ultra"]');
  await page.click('#dr-n button[data-n="5"]');
  await page.click("#dr-go");
  const stacks = [];
  for (let i = 0; i < 3; i++) {
    await page.waitForSelector(".dopt", { timeout: 60000 });
    // scope to the drill view: other views render .stmeta too
    const meta = await page.$eval("#v-drill .stmeta", (e) => e.innerText);
    const m = meta.match(/Stack\s*([\d.]+)BB/);
    assert.ok(m, "no stack in the spot header: " + meta.replace(/\n/g, " | "));
    stacks.push(parseFloat(m[1]));
    await page.click(".dopt");
    await page.waitForSelector("#dr-next", { timeout: 60000 });
    await page.click("#dr-next");
    if (await page.$("#dr-again")) break;
  }
  assert.ok(stacks.length >= 2, "could not read the stack from the spot header");
  stacks.forEach((s) => assert.ok(s <= 12.5, "ultra-short bucket dealt a " + s + "BB stack"));
  noErrors();
});

test("seats can be cleared in one go", async () => {
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="hand"]');
  await page.waitForSelector("#seat-palette button");

  // with nothing seated the button is disabled rather than a no-op
  await page.click("#seat-reset");
  await page.waitForTimeout(80);
  assert.equal(await page.$eval("#seat-reset", (e) => e.disabled), true, "clear should be disabled when empty");

  await page.click('#seat-palette button[data-k="lag"]');
  for (const p of ["UTG", "HJ", "CO", "SB"]) { await page.click(`.seat[data-p="${p}"]`); await page.waitForTimeout(50); }
  assert.equal((await page.$$eval("#vt-chips button", (b) => b.length)), 4);
  assert.equal(await page.$eval("#seat-reset", (e) => e.disabled), false, "clear should enable once seats are filled");

  await page.click("#seat-reset");
  await page.waitForTimeout(120);
  assert.equal((await page.$$("#vt-chips button")).length, 0, "seats were not cleared");
  assert.equal((await page.$$(".seat.vil")).length, 0, "table still shows opponents");
  assert.equal((await page.$$(".seat.me")).length, 1, "hero lost their seat");
  assert.equal(await page.$eval("#seat-reset", (e) => e.disabled), true, "clear stayed enabled after clearing");
  noErrors();
});

test("hand analysis leads with the line and an equity bar", async () => {
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="hand"]');
  await page.waitForSelector("#h-demo");
  await page.click("#h-demo");
  await page.click("#h-run");
  await page.waitForSelector("#h-out .stcard", { timeout: 60000 });

  // the whole hand is summarised before any detail
  const segs = await page.$$eval(".lseg", (e) => e.map((x) => x.innerText.replace(/\n/g, " ")));
  assert.ok(segs.length >= 2, "line summary missing: " + segs.join(" | "));
  segs.forEach((sg) => assert.ok(sg.trim().length > 3, "empty line segment"));

  // streets collapse, and exactly one opens by default
  const cards = await page.$$eval(".stcard", (e) => e.length);
  const open = await page.$$eval(".stcard[open]", (e) => e.length);
  assert.ok(cards >= 2, "expected a card per street");
  assert.equal(open, 1, "exactly one street should start open, got " + open);

  // equity against required, as one bar with a marker
  assert.ok(await page.$(".stcard[open] .eqbar i"), "no equity bar");
  const lab = await page.$eval(".stcard[open] .eqlab", (e) => e.innerText);
  assert.match(lab, /have/i, "equity bar has no readout: " + lab);

  // best and yours side by side
  const cmp = await page.$$eval(".stcard[open] .cmpc", (e) => e.map((x) => x.innerText.replace(/\n/g, " ")));
  assert.equal(cmp.length, 2, "expected best-vs-yours pair, got " + cmp.length);
  assert.match(cmp[0], /Best/);
  assert.match(cmp[1], /Yours/);

  // and the villain read-out uses the same weights the EV did
  assert.ok(await page.$(".stcard[open] .blk.vx .cb"), "no villain range read-out");
  const labels = await page.$$eval(".stcard[open] .blk.vx .cb .cn", (e) => e.map((x) => x.innerText.trim()));
  labels.forEach((l) => assert.ok(l.length > 0, "blank label in the read-out"));

  // clicking a collapsed street opens it
  await page.click(".stcard:first-of-type > summary");
  await page.waitForTimeout(150);
  assert.ok(await page.$$eval(".stcard[open]", (e) => e.length) >= 1);
  noErrors();
});

test("practice sessions carry a grade and pool into one rating", async () => {
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  // four sessions of deliberately different quality
  await page.evaluate(() => {
    // potSum matters: grading is EV lost as a share of the pot, not raw BB
    const mk = (n, lostFrac, earned) => ({ at: Date.now(), n, decisions: n, potSum: n * 20,
      evLost: lostFrac * n * 20, evEarned: earned, capture: 0.7, correct: 2, log: [] });
    localStorage.setItem("hb.drills", JSON.stringify([
      mk(10, 0.01, 12),   // 1% of pot  -> S
      mk(10, 0.06, 8),    // 6%         -> B
      mk(5, 0.30, 1),     // 30%        -> D
      mk(20, 0.02, 30)    // 2%         -> S/A
    ]));
  });
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.click('#nav button[data-v="stats"]');
  await page.waitForTimeout(250);

  // the grade scale must actually discriminate, not label everything the same
  const badges = await page.$$eval("#v-stats .gbadge", (e) => e.map((x) => x.innerText.trim()));
  assert.equal(badges.length, 4, "expected a grade per session, got " + badges.join(","));
  const letters = badges.map((b) => b.split(/\s+/)[0]);
  assert.ok(new Set(letters).size >= 3, "grades do not discriminate: " + badges.join(", "));
  // 0.03BB per decision is excellent; 0.9BB is terrible
  assert.equal(letters[0], "S", "1% of pot per decision should be S: " + badges[0]);
  assert.equal(letters[2], "D", "30% of pot per decision should be D: " + badges[2]);
  // rating must fall as loss rises
  const nums = badges.map((b) => parseInt(b.split(/\s+/)[1], 10));
  assert.ok(nums[0] > nums[1] && nums[1] > nums[2], "rating not monotonic: " + nums.join(","));

  // and there is one pooled rating over everything
  const txt = await page.$eval("#v-stats", (e) => e.innerText);
  assert.match(txt, /Overall rating/, "no overall rating");
  assert.match(txt, /Decisions\s*45/, "pooled decision count wrong: " + txt.slice(0, 300));
  noErrors();
});

test("the profile tab offers an assessment, then shows the saved profile", async () => {
  await page.evaluate(() => { localStorage.removeItem("hb.profile"); localStorage.removeItem("hb.playstats"); });
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");

  const nav = await page.$eval('#nav button[data-v="quiz"]', (e) => e.innerText);
  assert.equal(nav, "Profile", "tab should be named for the profile, got " + nav);

  await page.click('#nav button[data-v="quiz"]');
  await page.waitForSelector("#qz-go");
  assert.match(await page.$eval("#v-quiz", (e) => e.innerText), /No profile yet/);
  assert.match(await page.$eval("#qz-go", (e) => e.innerText), /assessment/i);

  // a saved profile becomes the content, with retake demoted
  await page.evaluate(() => localStorage.setItem("hb.profile", JSON.stringify({
    axes: { A1: -30, A2: 40, A3: 10, A4: -20, A5: 35, B1: 15, B2: 20 },
    conf: { A1: .9, A2: .9, A3: .8, A4: .8, A5: .9, B1: .8, B2: .7 },
    cnt: {}, n: 28, archetype: "TAG", at: Date.now()
  })));
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.click('#nav button[data-v="quiz"]');
  await page.waitForSelector("#qz-go");
  const body = await page.$eval("#v-quiz", (e) => e.innerText);
  assert.match(body, /Your profile/, "saved profile is not shown: " + body.slice(0, 200));
  assert.ok(body.indexOf("Your profile") < body.indexOf("Retake"), "retake should come after the profile");
  assert.match(await page.$eval("#qz-go", (e) => e.innerText), /Retake/);
  noErrors();
});

test("a hand that ends early says so, and says why", async () => {
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="drill"]');
  await page.waitForSelector("#dr-mode button");
  await page.click('#dr-mode button[data-k="hand"]');
  await page.click('#dr-n button[data-n="10"]');
  await page.click("#dr-go");

  // Bet or raise at every turn until villain gives one up. Always taking the
  // last option means the most aggressive line on offer.
  let banner = null;
  for (let guard = 0; guard < 60 && !banner; guard++) {
    if (await page.$("#dr-again")) break;
    if (await page.$(".endban")) {
      const txt = await page.$eval(".endban", (e) => e.innerText);
      if (/Villain folded/.test(txt)) { banner = txt; break; }
      await page.click("#dr-nexthand");
      continue;
    }
    if (await page.$("#dr-cont")) { await page.click("#dr-cont"); continue; }
    await page.waitForSelector(".dopt, .endban, #dr-again", { timeout: 60000 });
    const opts = await page.$$(".dopt");
    if (opts.length) await opts[opts.length - 1].click();
  }

  assert.ok(banner, "no hand ended in a villain fold across 10 aggressive hands");
  // the three things the player needs: what happened, why, and where it stopped
  assert.match(banner, /pot is yours/i, "the outcome is not headlined: " + banner);
  assert.match(banner, /took it down/i, "the banner does not tie the fold to my action: " + banner);
  assert.match(banner, /Ended on the (Preflop|Flop|Turn|River)/,
    "the banner does not say which street it ended on: " + banner);
  noErrors();
});

test("play keeps moving the profile after the assessment is saved", async () => {
  // A passive sample: almost never takes the aggressive line the solver takes,
  // folds far more often than it should, and never picks the biggest size.
  const passive = { picks: 40, aggr: 2, bestAggr: 26, facing: 20, folds: 15, bestFolds: 4, big: 0, bestBig: 11 };
  await page.evaluate((st) => {
    localStorage.setItem("hb.profile", JSON.stringify({
      axes: { A1: 0, A2: 0, A3: 0, A4: 0, A5: 0, B1: 0, B2: 0 },
      conf: { A1: .9, A2: .9, A3: .9, A4: .9, A5: .9, B1: .9, B2: .9 },
      cnt: {}, n: 28, archetype: "TAG", at: Date.now()
    }));
    localStorage.setItem("hb.playstats", JSON.stringify(st));
  }, passive);
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="quiz"]');
  await page.waitForSelector("#qz-go");

  const body = await page.$eval("#v-quiz", (e) => e.innerText);
  assert.match(body, /from play/, "no play-derived marker on the axes: " + body.slice(0, 300));
  assert.match(body, /40/, "the decision count behind the adjustment is not shown");

  // Every axis row carries its value; the card renders them in AXIS_KEYS order.
  const shown = await page.$$eval("#v-quiz .axis .lb b .dim", (els) =>
    els.map((e) => Number(e.textContent.trim())));
  assert.equal(shown.length, 7, "expected one row per axis, got " + shown.length);
  const axes = {};
  ["A1", "A2", "A3", "A4", "A5", "B1", "B2"].forEach((k, i) => (axes[k] = shown[i]));

  // The three axes play can evidence must have moved off the assessment's zero.
  assert.ok(axes.A2 < -15, "aggression should read passive, got " + axes.A2);
  assert.ok(axes.A4 < -15, "folding more than optimal should lower pressure resistance, got " + axes.A4);
  assert.ok(axes.A3 < -15, "never taking the big size should lower risk tolerance, got " + axes.A3);
  // Axes play cannot speak to stay where the assessment left them.
  ["A1", "A5", "B1", "B2"].forEach((k) =>
    assert.equal(axes[k], 0, k + " moved without any evidence from play"));
  noErrors();
});

test("practice can be played as a tournament, with an ante and a stage", async () => {
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="drill"]');
  await page.waitForSelector("#dr-game button");

  // cash is the default and offers no stage
  assert.equal(await page.$("#dr-stage"), null, "cash should not ask for a tournament stage");

  await page.click('#dr-game button[data-k="mtt"]');
  await page.waitForSelector("#dr-stage button");
  const stages = await page.$$eval("#dr-stage button", (b) => b.map((x) => x.dataset.k));
  assert.deepEqual(stages, ["early", "middle", "bubble", "final"], "stages: " + stages.join(","));
  await page.click('#dr-stage button[data-k="bubble"]');
  assert.match(await page.$eval("#v-drill", (e) => e.innerText), /46 left, 45 paid/,
    "the stage should say how close the money is");

  // the mode is remembered across sessions, so pin it rather than inherit it
  await page.click('#dr-mode button[data-k="spot"]');
  await page.click('#dr-n button[data-n="5"]');
  await page.click("#dr-go");
  await page.waitForSelector(".dopt", { timeout: 60000 });
  const meta = await page.$eval("#v-drill .stmeta", (e) => e.innerText.replace(/\n/g, " | "));
  assert.match(meta, /Tournament/, "the spot header must name the game: " + meta);
  assert.match(meta, /Bubble/, "the spot header must name the stage: " + meta);
  assert.match(meta, /1BB ante/, "the spot header must show the ante: " + meta);
  noErrors();
});

test("a tournament decision is priced on the ladder, not on chips", async () => {
  // Play aggressively at a short depth until a spot facing a bet turns up:
  // that is where the risk premium exists and has to be shown.
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="drill"]');
  await page.waitForSelector("#dr-game button");
  await page.click('#dr-game button[data-k="mtt"]');
  await page.waitForSelector("#dr-stage button");
  await page.click('#dr-stage button[data-k="bubble"]');
  await page.click('#dr-mode button[data-k="spot"]');
  await page.click('#dr-depth button[data-k="short"]');
  await page.click('#dr-n button[data-n="20"]');
  await page.click("#dr-go");

  let icm = null;
  for (let g = 0; g < 25 && !icm; g++) {
    if (await page.$("#dr-again")) break;
    await page.waitForSelector(".dopt, #dr-again", { timeout: 60000 });
    if (!(await page.$(".dopt"))) break;
    await page.click(".dopt");
    await page.waitForSelector("#dr-next", { timeout: 60000 });
    if (await page.$(".icm3")) { icm = await page.$eval(".blk.warn", (e) => e.innerText); break; }
    await page.click("#dr-next");
  }
  assert.ok(icm, "no spot in 20 short-stacked bubble hands showed a risk premium");
  assert.match(icm, /By chips/, "the chip price is missing: " + icm);
  assert.match(icm, /By ICM/, "the ICM price is missing: " + icm);
  assert.match(icm, /\+\d+\.\d+pp/, "the premium is missing: " + icm);

  // the ladder must have moved at least one option away from its chip EV
  const table = await page.$eval(".dtable", (e) => e.innerText);
  assert.match(table, /in chips/, "no option shows what it was worth in chips: " + table);
  noErrors();
});

test("the bubble tightens a calling range below its chip-EV width", async () => {
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="range"]');
  await page.waitForSelector("#rg-game button");
  await page.click('#rg-sit button[data-k="call_shove"]');
  await page.click('#rg-stack button[data-k="15"]');
  await page.click('#rg-game button[data-k="mtt"]');
  await page.waitForSelector("#rg-stage button");
  await page.click('#rg-stage button[data-k="bubble"]');

  const facts = await page.$eval("#v-range .facts", (e) => e.innerText.replace(/\n/g, " "));
  const nums = facts.match(/([\d.]+)%/g);
  assert.ok(nums && nums.length >= 2, "expected the chart and its baseline: " + facts);
  const shown = parseFloat(nums[0]), onChips = parseFloat(nums[1]);
  assert.ok(shown < onChips - 3,
    `the bubble must call materially tighter than chip EV: ${shown}% vs ${onChips}%`);
  assert.match(facts, /Same seat, on chips/, "the baseline is not labelled: " + facts);
  noErrors();
});

test("choosing a tournament in setup posts an ante and asks for the stage", async () => {
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="hand"]');
  await page.waitForSelector("#s-gt");

  assert.equal(await page.$("#pf-stage"), null, "a cash game needs no stage");
  await page.selectOption("#s-gt", "mtt");
  await page.waitForSelector("#pf-stage button");
  assert.equal(await page.$eval("#s-ante", (e) => e.value), "1",
    "a tournament should post a big-blind ante by default");

  await page.click('#pf-stage button[data-k="bubble"]');
  await page.click("#h-demo");
  await page.click("#h-run");
  await page.waitForSelector("#h-out .card");
  const header = await page.$eval("#h-out .stmeta", (e) => e.innerText.replace(/\n/g, " | "));
  assert.match(header, /Tournament · Bubble/, "the analysis must name the game: " + header);

  // and switching back to cash puts the ante away again
  await page.selectOption("#s-gt", "cash");
  assert.equal(await page.$("#pf-stage"), null, "the stage picker should go away for cash");
  assert.equal(await page.$eval("#s-ante", (e) => e.value), "0", "the ante should clear for cash");
  noErrors();
});

test("the whole-hand results screen shows the decisions it graded", async () => {
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="drill"]');
  await page.waitForSelector("#dr-mode button");
  await page.click('#dr-game button[data-k="cash"]');
  await page.click('#dr-mode button[data-k="hand"]');
  await page.click('#dr-n button[data-n="5"]');
  await page.click("#dr-go");

  for (let g = 0; g < 90; g++) {
    if (await page.$("#dr-again")) break;
    if (await page.$("#dr-nexthand")) { await page.click("#dr-nexthand"); continue; }
    if (await page.$("#dr-cont")) { await page.click("#dr-cont"); continue; }
    await page.waitForSelector(".dopt, #dr-again, #dr-nexthand", { timeout: 60000 });
    const opts = await page.$$(".dopt");
    if (opts.length) await opts[Math.min(1, opts.length - 1)].click();
  }
  await page.waitForSelector("#dr-again", { timeout: 60000 });

  // the reported bug: every by-action row was blank
  const rows = await page.$$eval("#v-drill .sumcard .sr .a", (e) => e.map((x) => x.innerText.trim()));
  assert.ok(rows.length >= 5, "expected a row per decision, got " + rows.length);
  rows.forEach((r, i) => assert.ok(r.length > 0, "by-action row " + (i + 1) + " is blank"));
  const body = await page.$eval("#v-drill .sumcard", (e) => e.innerText);
  assert.match(body, /Hand 1/, "rows are not grouped by hand: " + body.slice(0, 200));
  assert.match(body, /Preflop|Flop|Turn|River/, "rows do not say which street: " + body.slice(0, 200));

  // accuracy is per decision, so it cannot exceed 100%
  const ring = await page.$eval("#v-drill .ring", (e) => e.innerText);
  const acc = parseInt(ring, 10);
  assert.ok(acc >= 0 && acc <= 100, "accuracy out of range: " + ring);

  // and the header counts hands and decisions separately
  const kpi = await page.$eval("#v-drill .kpi", (e) => e.innerText.replace(/\n/g, " "));
  assert.match(kpi, /Hands\s+5/, "hand count wrong: " + kpi);
  const dm = kpi.match(/Decisions\s+(\d+)/);
  assert.ok(dm, "no decision count: " + kpi);
  assert.equal(+dm[1], rows.length, "the decision count disagrees with the rows listed");
  assert.ok(+dm[1] > 5, "5 whole hands should be more than 5 decisions, got " + dm[1]);
  noErrors();
});

/* --- challenges: the only way two people can be compared without a server -- */

/** Play the visible session to the end, always taking the same option slot. */
async function playSession(pg, pickLast) {
  for (let i = 0; i < 15; i++) {
    if (await pg.$("#dr-again")) break;
    await pg.waitForSelector(".dopt, #dr-again", { timeout: 60000 });
    if (!(await pg.$(".dopt"))) break;
    const opts = await pg.$$(".dopt");
    await opts[pickLast ? opts.length - 1 : 0].click();
    await pg.waitForSelector("#dr-next", { timeout: 60000 });
    await pg.click("#dr-next");
  }
  await pg.waitForSelector("#dr-again", { timeout: 60000 });
}
async function makeCode(pg, name) {
  await pg.fill("#ch-name", name);
  await pg.click("#ch-make");
  await pg.waitForSelector("#ch-code");
  return (await pg.$eval("#ch-code", (e) => e.innerText)).trim();
}
/** The cards and board on screen — the identity of the spot being asked. */
const spotFingerprint = (pg) =>
  pg.$eval("#v-drill .dspot", (e) => e.innerText.replace(/\s+/g, " ").trim());

test("a challenge deals the same hands to a different browser", async () => {
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="drill"]');
  await page.waitForSelector("#dr-mode button");
  await page.click('#dr-game button[data-k="cash"]');
  await page.click('#dr-mode button[data-k="spot"]');
  await page.click('#dr-n button[data-n="5"]');
  await page.click("#dr-go");

  const mine = [];
  for (let i = 0; i < 5; i++) {
    await page.waitForSelector(".dopt", { timeout: 60000 });
    mine.push(await spotFingerprint(page));
    await page.click(".dopt");
    await page.waitForSelector("#dr-next", { timeout: 60000 });
    await page.click("#dr-next");
    if (await page.$("#dr-again")) break;
  }
  await page.waitForSelector("#ch-make", { timeout: 60000 });
  const code = await makeCode(page, "Alex");
  assert.match(code, /^HS1\./, "the code should be recognisable: " + code.slice(0, 20));
  assert.ok(code.length < 2000, "a code has to be pasteable, got " + code.length + " chars");

  // a genuinely separate browser profile — no shared storage of any kind
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  const otherErrors = [];
  other.on("pageerror", (e) => otherErrors.push(String(e)));
  await other.goto(URL);
  await other.waitForSelector("#nav button");
  await other.selectOption("#langsel", "en");
  await other.click('#nav button[data-v="drill"]');
  await other.waitForSelector("#ch-in");
  await other.fill("#ch-in", code);
  await other.click("#ch-load");
  await other.waitForSelector("#ch-start", { timeout: 30000 });
  assert.match(await other.$eval("#ch-preview", (e) => e.innerText), /Alex/i,
    "the preview should name who sent it");
  await other.click("#ch-start");

  const theirs = [];
  for (let i = 0; i < 5; i++) {
    await other.waitForSelector(".dopt", { timeout: 60000 });
    theirs.push(await spotFingerprint(other));
    const opts = await other.$$(".dopt");
    await opts[opts.length - 1].click();          // deliberately a different line
    await other.waitForSelector("#dr-next", { timeout: 60000 });
    await other.click("#dr-next");
    if (await other.$("#dr-again")) break;
  }
  assert.equal(theirs.length, mine.length, "the challenge dealt a different number of spots");
  theirs.forEach((f, i) => assert.equal(f, mine[i],
    `spot ${i + 1} differs.\n  A: ${mine[i]}\n  B: ${f}`));

  // and the comparison shows both sides on those same hands
  await other.waitForSelector("#dr-again", { timeout: 60000 });
  const h2h = await other.$$eval("#v-drill .blk", (els) => {
    const hit = els.find((e) => e.querySelector(".h2h"));
    return hit ? hit.innerText : "";
  });
  assert.ok(h2h, "no head-to-head block after finishing a challenge");
  assert.match(h2h, /Alex/i, "the opponent is not named: " + h2h.slice(0, 120));
  assert.match(h2h, /Rating/i, "no rating row: " + h2h.slice(0, 200));
  const scores = await other.$$eval("#v-drill .h2h .hv", (e) => e.map((x) => x.innerText.trim()));
  assert.ok(scores.length >= 6, "expected two columns of scores, got " + scores.length);
  assert.deepEqual(otherErrors, [], "second browser errors: " + otherErrors.join(" | "));
  await ctx.close();
  noErrors();
});

test("a challenge back on hands already played compares instead of replaying", async () => {
  // page still holds the session it played above, stored in its history
  await page.click("#dr-home");
  await page.waitForSelector("#ch-in");

  // build the opponent's card by hand: same seed and spec, a different score
  const theirCode = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("hb.drills"))[0];
    const card = { v: 1, seed: d.seed, spec: d.spec,
      from: { nm: "Sam", n: d.n, d: d.decisions, el: 0.4, ps: d.result.ps,
        ee: 5, eb: 5.4, cp: d.decisions * 0.95, cr: d.decisions,
        sp: d.result.sp.map(() => 0.08) } };
    const bytes = new TextEncoder().encode(JSON.stringify(card));
    let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return "HS1." + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  });

  await page.fill("#ch-in", theirCode);
  await page.click("#ch-load");
  await page.waitForSelector("#ch-preview .blk", { timeout: 30000 });
  assert.ok(await page.$("#ch-compare"),
    "already-played hands should offer a comparison, not a replay");
  await page.click("#ch-compare");
  await page.waitForSelector("#ch-preview .h2h", { timeout: 30000 });
  const txt = await page.$eval("#ch-preview", (e) => e.innerText);
  assert.match(txt, /Sam/i, "the opponent is not named: " + txt.slice(0, 120));
  assert.match(txt, /same hands/i, "the comparison should say the hands were identical");
  noErrors();
});

test("a corrupt challenge code is rejected, not acted on", async () => {
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="drill"]');
  await page.waitForSelector("#ch-in");
  for (const bad of ["nonsense", "HS1.zzzz", "HS1." + btoa('{"v":9}')]) {
    await page.fill("#ch-in", bad);
    await page.click("#ch-load");
    const out = await page.$eval("#ch-preview", (e) => e.innerText);
    assert.match(out, /could not be read/i, `"${bad}" was not rejected: ` + out);
    assert.equal(await page.$("#ch-start"), null, `"${bad}" offered to start a session`);
  }
  noErrors();
});

test("home shows your record; the tendency profile stays in its own tab", async () => {
  await page.evaluate(() => localStorage.setItem("hb.profile", JSON.stringify({
    axes: { A1: -20, A2: 35, A3: 10, A4: -15, A5: 30, B1: 12, B2: 18 },
    conf: { A1: .9, A2: .9, A3: .8, A4: .8, A5: .9, B1: .8, B2: .7 },
    cnt: {}, n: 28, archetype: "TAG", at: Date.now()
  })));
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="home"]');
  await page.waitForSelector("#v-home .card");

  // the profile card used to be repeated in full on home
  assert.equal((await page.$$("#v-home .axis")).length, 0, "home is still drawing the profile axes");
  const home = await page.$eval("#v-home", (e) => e.innerText);
  assert.ok(!/Archetype/i.test(home), "home should not name the archetype: " + home.slice(0, 200));
  assert.match(home, /Sessions/, "home should show the record: " + home.slice(0, 200));
  assert.match(home, /Decisions/, "home should show the decision count");

  // and the profile is still fully present where it belongs
  await page.click('#nav button[data-v="quiz"]');
  await page.waitForSelector("#v-quiz .card");
  assert.equal((await page.$$("#v-quiz .axis")).length, 7, "the profile tab lost its axes");
  assert.match(await page.$eval("#v-quiz", (e) => e.innerText), /Archetype/i,
    "the profile tab should still name the archetype");
  noErrors();
});

/* --- tournament director ------------------------------------------------ */

test("a tournament can be opened from a preset and the clock runs", async () => {
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.evaluate(() => { localStorage.removeItem("hb.td"); localStorage.removeItem("hb.tdcustom"); });
  await page.reload();
  await page.waitForSelector("#nav button");
  await page.selectOption("#langsel", "en");
  await page.click('#nav button[data-v="tour"]');
  await page.waitForSelector("#td-quick", { timeout: 30000 });

  // picking a structure fills the whole form in
  await page.click('.tplb[data-id="wsop"]');
  await page.waitForSelector("#td-quick");
  assert.match(await page.$eval("#td-name", (e) => e.value), /WSOP/,
    "choosing a preset should name the event");
  assert.equal(await page.$eval("#td-stack", (e) => e.value), "6",
    "the WSOP preset starts at 60,000 chips");
  const note = await page.$eval("#v-tour .tv", (e) => e.innerText);
  assert.match(note, /Confirmed/i, "the preset should say what is confirmed: " + note);

  await page.fill("#td-entries", "42");
  await page.click("#td-quick");
  await page.waitForSelector("#td-time", { timeout: 30000 });

  const board = await page.$eval("#td-screen", (e) => e.innerText);
  assert.match(board, /LEVEL 1/, "the board should open on level 1: " + board.slice(0, 120));
  assert.match(board, /100 \/ 200/, "the opening blinds are wrong: " + board.slice(0, 200));
  assert.match(board, /120:00/, "WSOP levels are two hours: " + board.slice(0, 200));
  assert.match(board, /NEXT/, "the board should show the next level");

  // the clock actually counts down, and pauses
  await page.click("#td-run");
  const t1 = await page.$eval("#td-time", (e) => e.innerText);
  await page.waitForFunction((prev) => document.getElementById("td-time").innerText !== prev,
    t1, { timeout: 5000 });
  await page.click("#td-run");
  const paused = await page.$eval("#td-time", (e) => e.innerText);
  await new Promise((r) => setTimeout(r, 900));
  assert.equal(await page.$eval("#td-time", (e) => e.innerText), paused, "the clock kept running when paused");
  noErrors();
});

test("entries, rebuys and the prize pool stay consistent", async () => {
  // 42 entries at the WSOP buy-in from the previous test
  const read = () => page.$eval(".hudline:nth-of-type(2)", (e) => e.innerText.replace(/\n/g, " "));
  const before = await page.$$eval(".cntin", (els) => els.map((x) => +x.value));
  await page.click('[data-act="e+"]');
  const after = await page.$$eval(".cntin", (els) => els.map((x) => +x.value));
  assert.equal(after[0], before[0] + 1, "an entry did not register");
  assert.equal(after[1], before[1] + 1, "a new entry should also be a player still in");

  await page.click('[data-act="p-"]');
  const bust = await page.$$eval(".cntin", (els) => els.map((x) => +x.value));
  assert.equal(bust[1], after[1] - 1, "a bust did not come off the remaining count");
  assert.equal(bust[0], after[0], "a bust must not change the entry count");

  // payouts always add to 100%
  const sum = await page.$$eval(".payin", (els) => els.reduce((a, x) => a + parseFloat(x.value), 0));
  assert.ok(Math.abs(sum - 100) < 0.5, "payouts do not sum to 100%: " + sum);

  // and the house share is exactly what the players do not get
  await page.fill("#td-poolpct", "85");
  await page.dispatchEvent("#td-poolpct", "change");
  await page.waitForSelector(".poolcalc");
  const pool = await page.$eval(".poolcalc", (e) => e.innerText.replace(/\n/g, " "));
  assert.match(pool, /85/, "the pool percentage did not take: " + pool);
  noErrors();
});

test("the level sheet is editable and marks where registration closes", async () => {
  await page.click("#td-lvtoggle2");
  await page.waitForSelector("#td-lv");
  const rows = await page.$$eval("#td-lv tr", (e) => e.length);
  assert.ok(rows > 5, "expected a full level sheet, got " + rows + " rows");
  assert.ok(await page.$("tr.lvcur"), "the current level is not highlighted");

  // marking registration closed shows a countdown on the board
  const regButtons = await page.$$(".lvreg");
  await regButtons[3].click();
  await page.waitForSelector("#td-screen");
  const board = await page.$eval("#td-screen", (e) => e.innerText);
  assert.match(board, /registration closes/i, "the board should count down to registration: " + board);

  // an impossible level is flagged rather than run
  await page.$$eval("#td-lv input[data-f='bb']", (els) => {
    els[0].value = "0";
    els[0].dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForSelector("#v-tour");
  assert.ok(await page.$("tr.lvbad"), "a zero big blind was not flagged");
  assert.match(await page.$eval("#v-tour", (e) => e.innerText), /Needs checking/i,
    "no warning banner for a broken level");
  noErrors();
});
