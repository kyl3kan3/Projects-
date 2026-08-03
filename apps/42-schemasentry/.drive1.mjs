/** Throwaway browser harness, phase 1: signup -> API -> token -> consumer. */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://localhost:3042";
const SP = "/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/ss42";
const SHOT = `${SP}/shots`;
mkdirSync(SHOT, { recursive: true });

const EMAIL = `dana+${Date.now()}@northwind.dev`;
const PASSWORD = "correct-horse-battery";

const problems = [];
const consoleErrors = [];
const note = (step, msg) => { problems.push(`${step}: ${msg}`); console.log(`  !! ${step}: ${msg}`); };
const shot = (page, name) => page.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell" });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") { consoleErrors.push(m.text()); console.log(`  [console.error] ${m.text()}`); } });
page.on("pageerror", (e) => { consoleErrors.push(String(e)); console.log(`  [pageerror] ${e}`); });

console.log("\n=== 1. sign up ===");
await page.goto(`${BASE}/signup`, { waitUntil: "load" });
await shot(page, "01-signup");
await page.fill('input[name="organization"]', "Northwind Platform");
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/apis$/, { timeout: 25000 }).catch(() => note("signup", `did not reach /apis, at ${page.url()}`));
await page.waitForLoadState("load");
console.log(`  at ${page.url()}`);
await shot(page, "02-apis-empty");
let body = await page.textContent("body");
if (!/Nothing is being watched yet/.test(body ?? "")) note("apis-empty", "no empty-state copy");
if (!/days? of trial/.test(body ?? "")) note("apis-empty", "no trial note in header");

console.log("\n=== 2. add an API ===");
await page.fill('input[name="name"]', "Payments API");
await page.fill('input[name="slug"]', "payments-api");
await page.click('button:has-text("Add API")');
await page.waitForURL(/\/apis\/payments-api/, { timeout: 25000 }).catch(() => note("add-api", `stayed at ${page.url()}`));
await page.waitForLoadState("load");
await shot(page, "03-timeline-empty");
body = await page.textContent("body");
if (!/first diff appears here/i.test(body ?? "")) note("timeline-empty", "no first-run copy");
if (!/npx schemasentry push/.test(body ?? "")) note("timeline-empty", "no copyable push command");

console.log("\n=== 3. create a CI token ===");
await page.goto(`${BASE}/settings`, { waitUntil: "load" });
await shot(page, "04-settings");
await page.fill('input[name="label"]', "github-actions");
await page.click('button:has-text("Create token")');
await page.waitForSelector("text=Copy this now", { timeout: 25000 }).catch(() => note("token", "no once-only notice"));
await page.waitForLoadState("load");
body = await page.textContent("body");
const tokenMatch = /ss_[A-Za-z0-9_-]{20,}/.exec(body ?? "");
if (!tokenMatch) note("token", "no token rendered");
else { console.log(`  token ${tokenMatch[0].slice(0, 12)}…`); writeFileSync(`${SP}/token.txt`, tokenMatch[0]); }
await shot(page, "05-token");

console.log("\n=== 4. register a consumer ===");
await page.goto(`${BASE}/apis/payments-api/consumers`, { waitUntil: "load" });
await shot(page, "06-consumers-empty");
await page.click('button:has-text("Add consumer")');
await page.waitForSelector('input[name="name"]');
await page.fill('input[name="name"]', "Acme webhooks");
await page.fill('input[name="contact"]', "platform@acme.example");
await page.fill('textarea[name="fields"]', "status\ninvoice_url");
await page.fill('textarea[name="enumValues"]', "cancelled");
body = await page.textContent("body");
if (!/Push a spec first/.test(body ?? "")) note("consumers", "no explanation when there is no spec to pick endpoints from");
await page.click('form button:has-text("Add consumer")');
await page.waitForLoadState("load");
await page.waitForTimeout(1000);
await shot(page, "07-consumer-saved");
body = await page.textContent("body");
if (!/Acme webhooks/.test(body ?? "")) note("consumers", "consumer not listed after save");

await context.storageState({ path: `${SP}/state.json` });
writeFileSync(`${SP}/email.txt`, EMAIL);

console.log("\n=== phase 1 summary ===");
console.log(`problems: ${problems.length}`);
for (const p of problems) console.log(`  - ${p}`);
console.log(`console errors: ${consoleErrors.length}`);
await browser.close();
