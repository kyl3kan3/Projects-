/** Throwaway harness, phase 3: policy override, contract tests, plan gate, cron. */
import { chromium } from "playwright";
const BASE = "http://localhost:3042";
const SP = "/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/ss42";
const SHOT = `${SP}/shots`;
const problems = [];
const consoleErrors = [];
const note = (s, m) => { problems.push(`${s}: ${m}`); console.log(`  !! ${s}: ${m}`); };
const shot = (p, n) => p.screenshot({ path: `${SHOT}/${n}.png`, fullPage: true });
const text = async (p) => (await p.locator("main").first().innerText());

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: `${SP}/state.json` });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") { consoleErrors.push(`${page.url()} :: ${m.text()}`); console.log(`  [console.error] ${m.text()}`); } });
page.on("pageerror", (e) => { consoleErrors.push(`${page.url()} :: ${e}`); console.log(`  [pageerror] ${e}`); });

console.log("\n=== 11. API settings: policy override ===");
await page.goto(`${BASE}/apis/payments-api/settings`, { waitUntil: "load" });

await page.waitForTimeout(500);
await shot(page, "30-api-settings");
let t = await text(page);
if (!/Breaking-change policy/.test(t)) note("settings", "no policy section");
if (!/\d+ rules, each with a default level/.test(t)) note("settings", "policy intro missing rule count");
if (!/Contract tests/.test(t)) note("settings", "no contract-tests section");
if (!/Acknowledgements/.test(t)) note("settings", "no acknowledgements section");
if (!/northwind\/payments/.test(t)) note("settings", "the recorded check run is not listed");

// filter rules then demote one
await page.fill('input[aria-label="Filter rules"]', "nullable");
await page.waitForTimeout(250);
await shot(page, "31-policy-filtered");
const selects = page.locator('select[name^="rule:"]');
const n = await selects.count();
console.log(`  ${n} rules match "nullable"`);
if (n === 0) note("policy", "filtering rules found nothing");
await page.selectOption('select[name="rule:response.nullable.added"]', "compatible");
await page.click('button:has-text("Save policy")');
await page.waitForLoadState("load");
await page.waitForTimeout(1200);
t = await text(page);
if (!/Policy saved/.test(t)) note("policy", `save gave no confirmation: ${t.slice(0, 200)}`);
else console.log(`  ${/Policy saved[^\n]*/.exec(t)?.[0]}`);
await shot(page, "32-policy-saved");

console.log("\n=== 12. contract suite generation + drift ===");
await page.goto(`${BASE}/apis/payments-api/settings`, { waitUntil: "load" });
await page.waitForTimeout(400);
await page.selectOption('select[name="consumerId"]', { index: 1 });
await page.click('button:has-text("Generate contract suite")');
await page.waitForLoadState("load");
await page.waitForTimeout(1400);
t = await text(page);
if (!/Generated .*\.contract\.test\.ts: \d+ assertions/.test(t)) note("suites", `generate gave: ${/(Generated|Replaced|Drift|No drift)[^\n]*/.exec(t)?.[0] ?? t.slice(0,200)}`);
else console.log(`  ${/Generated[^\n]*/.exec(t)[0]}`);
await shot(page, "33-suite-generated");

// regenerate without replace -> reports no drift (same spec)
await page.selectOption('select[name="consumerId"]', { index: 1 });
await page.click('button:has-text("Generate contract suite")');
await page.waitForLoadState("load");
await page.waitForTimeout(1200);
t = await text(page);
console.log(`  regenerate: ${/(No drift|Drift found)[^\n]*/.exec(t)?.[0] ?? "??"}`);
if (!/(No drift|Drift found)/.test(t)) note("suites", "regeneration did not report drift status");

// download it
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 15000 }).catch(() => null),
  page.click('a:has-text("Download")'),
]);
if (!download) note("suites", "download did not start");
else {
  const path = `${SP}/downloaded-suite.ts`;
  await download.saveAs(path);
  const src = (await import("node:fs")).readFileSync(path, "utf8");
  console.log(`  downloaded ${download.suggestedFilename()} (${src.length} bytes)`);
  if (!/expectOneOf/.test(src)) note("suites", "downloaded suite has no enum assertion");
  if (!/import \{ describe, it, expect \} from "vitest"/.test(src)) note("suites", "downloaded suite is not a vitest file");
}

console.log("\n=== 13. plan gate: 6th API on a trial (limit 5) ===");
for (let i = 2; i <= 6; i++) {
  await page.goto(`${BASE}/apis`, { waitUntil: "load" });
  await page.waitForTimeout(300);
  const blocked = (await text(page)).toUpperCase().includes("PLAN LIMIT");
  if (blocked) {
    console.log(`  blocked before adding API #${i}`);
    t = await text(page);
    console.log(`  message: ${/PLAN LIMIT[\s\S]{0,200}|Plan limit[\s\S]{0,160}/.exec(t)?.[0].replace(/\n/g, " ")}`);
    if (i !== 6) note("plan-gate", `blocked at API #${i}, expected #6 (trial limit is 5)`);
    await shot(page, "34-plan-limit");
    break;
  }
  if (i === 6) note("plan-gate", "a 6th API was allowed on a 5-API trial");
  await page.fill('input[name="name"]', `Service ${i}`);
  await page.fill('input[name="slug"]', `service-${i}`);
  await page.click('button:has-text("Add API")');
  await page.waitForURL(new RegExp(`/apis/service-${i}`), { timeout: 20000 }).catch(() => note("plan-gate", `could not add API #${i}`));
  await page.waitForTimeout(200);
}

console.log("\n=== 14. org settings render ===");
await page.goto(`${BASE}/settings`, { waitUntil: "load" });
await page.waitForTimeout(500);
await shot(page, "35-org-settings");
t = await text(page);
if (!/Solo/.test(t) || !/Team/.test(t) || !/Platform/.test(t)) note("settings", "plan table incomplete");
if (!/\$49/.test(t) || !/\$99/.test(t) || !/\$199/.test(t)) note("settings", "prices missing");
if (!/Billing is not configured/.test(t)) note("settings", "no honest note about billing being unconfigured");
if (!/Audit log/.test(t)) note("settings", "no audit log");
if (!/api\.create|policy\.update|changelog\.publish/.test(t)) note("settings", "audit log has no entries");

console.log("\n=== summary (phase 3) ===");
console.log(`problems: ${problems.length}`);
for (const p of problems) console.log(`  - ${p}`);
console.log(`console errors: ${consoleErrors.length}`);
for (const e of consoleErrors) console.log(`  - ${e}`);
await browser.close();
