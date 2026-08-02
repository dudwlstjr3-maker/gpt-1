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
  for (const v of ["quiz", "hand", "stats", "drill", "range", "help", "home"]) {
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
