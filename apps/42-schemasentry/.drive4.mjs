/** Throwaway harness, phase 4: landing page, reduced motion, keyboard, contrast. */
import { chromium } from "playwright";
const BASE = "http://localhost:3042";
const SP = "/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/ss42";
const SHOT = `${SP}/shots`;
const problems = [];
const consoleErrors = [];
const note = (s, m) => { problems.push(`${s}: ${m}`); console.log(`  !! ${s}: ${m}`); };
const text = async (p) => await p.locator("main").first().innerText();

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell" });

/* ------------------------------------------------------------ landing page */
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") { consoleErrors.push(`${page.url()} :: ${m.text()}`); console.log(`  [console.error] ${m.text()}`); } });
page.on("pageerror", (e) => { consoleErrors.push(`${page.url()} :: ${e}`); console.log(`  [pageerror] ${e}`); });
page.on("response", (r) => { if (r.status() >= 400) console.log(`  [http ${r.status()}] ${r.url()}`); });

console.log("\n=== 15. landing page ===");
await page.goto(BASE, { waitUntil: "load" });
await page.waitForTimeout(900);
await page.screenshot({ path: `${SHOT}/40-landing.png`, fullPage: true });
let t = await text(page);
if (!/A renamed field should fail the build/.test(t)) note("landing", "no hero claim");
if (!/BREAKING/.test(t)) note("landing", "the hero diff did not render a verdict");
if (!/Removed enum value `?cancelled/.test(t)) note("landing", "the hero diff shows no real finding");
if (!/run on this page by the same code/.test(t)) note("landing", "the live-engine claim is missing");
if (!/Staged demo, not a customer/.test(t)) note("landing", "the demo is not labelled as staged");
if (/trusted by|thousands of|\d{3,}\+? (teams|developers|companies)/i.test(t)) note("landing", "fabricated social proof");
const ctas = await page.locator('a:has-text("Catch the next one in CI")').count();
console.log(`  CTA repeats: ${ctas}`);
if (ctas < 4) note("landing", `the CTA phrase appears ${ctas} times; the playbook wants it at hero, post-proof, post-pricing and the sticky bar`);
const strikes = await page.locator(".strike-draw").count();
console.log(`  hero strike-draw lines: ${strikes}`);
if (strikes === 0) note("landing", "the signature detail is absent from the hero");
if (!/\d+ rules, every one of them arguable/.test(t)) note("landing", "no rule-count receipt");
if (!/\$49/.test(t) || !/\$99/.test(t) || !/\$199/.test(t)) note("landing", "pricing incomplete");

// no horizontal page scroll at 390
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log(`  horizontal overflow: ${overflow}px`);
if (overflow > 1) note("landing", `the page scrolls sideways by ${overflow}px at 390`);

/* ----------------------------------------------------- reduced motion pass */
console.log("\n=== 16. prefers-reduced-motion ===");
const rmCtx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  reducedMotion: "reduce", storageState: `${SP}/state.json`,
});
const rm = await rmCtx.newPage();
await rm.goto(`${BASE}/apis/payments-api/diffs/${process.argv[2]}`, { waitUntil: "load" });
await rm.waitForTimeout(400);
const state = await rm.evaluate(() => {
  const strike = document.querySelector(".strike-draw");
  const stamp = document.querySelector(".stamp-animate");
  const card = document.querySelector(".settle");
  const after = strike ? getComputedStyle(strike, "::after") : null;
  return {
    strikeAnimation: after?.animationName ?? null,
    strikeTransform: after?.transform ?? null,
    stampOpacity: stamp ? getComputedStyle(stamp).opacity : null,
    stampAnimation: stamp ? getComputedStyle(stamp).animationName : null,
    cardOpacity: card ? getComputedStyle(card).opacity : null,
  };
});
console.log(`  ${JSON.stringify(state)}`);
if (state.strikeAnimation !== "none") note("reduced-motion", `the strike still animates (${state.strikeAnimation})`);
if (state.stampOpacity !== "1") note("reduced-motion", `the verdict stamp is not fully visible (opacity ${state.stampOpacity})`);
if (state.cardOpacity !== "1") note("reduced-motion", `finding cards are not fully visible (opacity ${state.cardOpacity})`);
await rm.screenshot({ path: `${SHOT}/41-reduced-motion.png`, fullPage: true });

/* ------------------------------------------------------------- keyboard */
console.log("\n=== 17. keyboard reachability ===");
await rm.goto(`${BASE}/apis/payments-api/consumers`, { waitUntil: "load" });
await rm.waitForTimeout(400);
const focusables = [];
for (let i = 0; i < 14; i++) {
  await rm.keyboard.press("Tab");
  focusables.push(await rm.evaluate(() => {
    const el = document.activeElement;
    if (!el) return "none";
    const ring = getComputedStyle(el).outlineWidth;
    return `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""} outline=${ring}`;
  }));
}
const noRing = focusables.filter((f) => f.endsWith("outline=0px"));
console.log(`  tabbed through ${focusables.length}; ${noRing.length} without a visible ring`);
if (noRing.length > 2) note("keyboard", `${noRing.length} focused elements had no outline: ${noRing.slice(0, 3).join("; ")}`);

/* --------------------------------------------------------- desktop check */
console.log("\n=== 18. desktop at 1280 ===");
const wide = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: `${SP}/state.json` });
const wp = await wide.newPage();
wp.on("pageerror", (e) => { consoleErrors.push(`desktop :: ${e}`); });
await wp.goto(`${BASE}/apis/payments-api/diffs/${process.argv[2]}`, { waitUntil: "load" });
await wp.waitForTimeout 	&& await wp.waitForTimeout(600);
await wp.screenshot({ path: `${SHOT}/42-desktop-diff.png`, fullPage: false });
const tabbarVisible = await wp.locator("nav.tabbar").isVisible().catch(() => false);
if (tabbarVisible) note("desktop", "the mobile tab bar is still shown at 1280");
await wp.goto(BASE, { waitUntil: "load" });
await wp.waitForTimeout(600);
await wp.screenshot({ path: `${SHOT}/43-desktop-landing.png`, fullPage: false });

console.log("\n=== phase 4 summary ===");
console.log(`problems: ${problems.length}`);
for (const p of problems) console.log(`  - ${p}`);
console.log(`console errors: ${consoleErrors.length}`);
for (const e of consoleErrors) console.log(`  - ${e}`);
await browser.close();
