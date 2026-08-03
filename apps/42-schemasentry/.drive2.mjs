/** Throwaway harness, phase 2: diff screen, ack, changelog publish, public page. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3042";
const SP = "/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/ss42";
const SHOT = `${SP}/shots`;
mkdirSync(SHOT, { recursive: true });
const BREAKING_DIFF = process.argv[2];

const problems = [];
const consoleErrors = [];
const note = (s, m) => { problems.push(`${s}: ${m}`); console.log(`  !! ${s}: ${m}`); };
const shot = (p, n) => p.screenshot({ path: `${SHOT}/${n}.png`, fullPage: true });
/** Visible text only — `body` also contains Next's inlined RSC flight payload. */
const text = async (p) => (await p.locator("main").first().innerText()) + "\n" + (await p.locator("header").first().innerText().catch(() => ""));

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell" });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  storageState: `${SP}/state.json`,
});
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") { consoleErrors.push(`${page.url()} :: ${m.text()}`); console.log(`  [console.error] ${m.text()}`); } });
page.on("pageerror", (e) => { consoleErrors.push(`${page.url()} :: ${e}`); console.log(`  [pageerror] ${e}`); });

console.log("\n=== 5. timeline ===");
await page.goto(`${BASE}/apis/payments-api`, { waitUntil: "load" });
await page.waitForTimeout(400);
await shot(page, "10-timeline");
let t = await text(page);
for (const label of ["9f3c2ab", "4d81e07", "7ab9c31", "pr-42-head"]) if (!t.includes(label)) note("timeline", `missing ${label}`);
if (!/BREAKING/.test(t)) note("timeline", "no BREAKING verdict word");
if (!/COMPATIBLE/.test(t)) note("timeline", "no COMPATIBLE verdict word");
if (!/BASELINE/i.test(t)) note("timeline", "no BASELINE chip");

await page.goto(`${BASE}/apis/payments-api?env=pr`, { waitUntil: "load" });
await page.waitForTimeout(300);
t = await text(page);
if (!t.includes("pr-42-head")) note("timeline-pr", "PR filter hides the PR deploy");
if (t.includes("9f3c2ab")) note("timeline-pr", "PR filter still shows a prod deploy");
await shot(page, "11-timeline-pr");

console.log("\n=== 7. breaking diff screen ===");
await page.goto(`${BASE}/apis/payments-api/diffs/${BREAKING_DIFF}`, { waitUntil: "load" });
await page.waitForTimeout(900);
await shot(page, "15-diff-breaking");
t = await text(page);
if (!/DEPLOY .+ VS /.test(t)) note("diff", "no verdict-stamp label");
if (!/8 BREAKING · 0 RISKY · 1 COMPATIBLE/.test(t)) note("diff", `count line: ${/\d+ BREAKING[^\n]*/.exec(t)?.[0]}`);
if (!/Removed enum value `cancelled`/.test(t)) note("diff", "flagship finding missing");
if (!/BREAKS:/i.test(t)) note("diff", "no consumer impact row on any finding");
if (!/Acme webhooks/.test(t)) note("diff", "impacted consumer not named");
if (!/Publish changelog draft/.test(t)) note("diff", "no publish-draft primary in the thumb zone");
if (!/1 compatible change/.test(t)) note("diff", "compatible not collapsed behind a count");
if (!/fails your CI policy/.test(t)) note("diff", "does not say whether CI fails");

const strikes = await page.locator(".strike-draw").count();
console.log(`  strike-draw elements: ${strikes}`);
if (strikes === 0) note("diff", "no strike-draw on any removed mini-diff line");
if (strikes > 3) note("diff", `strike-draw on ${strikes} lines; DESIGN.md caps it at three`);

const cards = await page.locator("article.card").count();
console.log(`  finding cards: ${cards}`);
await page.click('button:has-text("compatible change")');
await page.waitForTimeout(250);
t = await text(page);
if (!/Added operation GET \/v1\/disputes/.test(t)) note("diff", "expanding compatible shows nothing");
await shot(page, "16-diff-compatible-open");

// copy a pointer
await page.locator('button[aria-label^="JSON pointer"]').first().click();
await page.waitForTimeout(250);
t = await text(page);
if (!/Copied/.test(t)) note("diff", "tapping a pointer gives no copy confirmation");

console.log("\n=== 8. acknowledge ===");
await page.goto(`${BASE}/apis/payments-api/diffs/${BREAKING_DIFF}`, { waitUntil: "load" });
await page.waitForTimeout(800);
await page.locator('button:has-text("Acknowledge")').first().click();
await page.waitForSelector('textarea[name="note"]');
await shot(page, "17-ack-open");
await page.fill('textarea[name="note"]', "nope");
await page.waitForTimeout(150);
if (!(await page.locator('button:has-text("Write a note first")').first().isVisible().catch(() => false))) {
  note("ack", "a too-short note does not block the hold button");
}
await page.fill('textarea[name="note"]', "Deliberate: cancelled orders now report refunded. Acme were told on 2 Aug and shipped a handler.");
await page.waitForTimeout(150);
const hold = page.locator('button:has-text("Hold to acknowledge")').first();
if (!(await hold.isVisible())) note("ack", "hold button hidden with a valid note");
const box = await hold.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(750);
await page.mouse.up();
await page.waitForTimeout(250);
await shot(page, "18-ack-held");
// The completed hold IS the confirmation, so the form has already submitted.
await page.waitForLoadState("load");
await page.waitForTimeout(1800);
await shot(page, "19-ack-done");
t = await text(page);
if (!/ACKNOWLEDGED/.test(t)) note("ack", "finding not shown as acknowledged");
if (!/Withdraw acknowledgement/.test(t)) note("ack", "no way to withdraw");
if (!/7 BREAKING/.test(t)) note("ack", `counts did not drop: ${/\d+ BREAKING[^\n]*/.exec(t)?.[0]}`);
if (!/cancelled orders now report refunded/.test(t)) note("ack", "note not visible on the finding");

console.log("\n=== 9. changelog ===");
await page.goto(`${BASE}/apis/payments-api/changelog`, { waitUntil: "load" });
await page.waitForTimeout(500);
await shot(page, "20-changelog-draft");
t = await text(page);
if (!/DRAFT/i.test(t)) note("changelog", "no draft shown");
// The placeholder lives in a textarea value, which innerText does not expose;
// it is asserted on `ta.inputValue()` below instead.
if (/pr-42-head/.test(t)) note("changelog", "a PR candidate was drafted as a changelog entry");
const publishBtn = page.locator('button:has-text("Publish")').first();
if (!(await publishBtn.isDisabled())) note("changelog", "publish is not blocked by the unfilled migration note");
else console.log("  publish correctly disabled while the placeholder remains");

const ta = page.locator("textarea").first();
let draft = await ta.inputValue();
if (!draft.includes("Migration note needed")) note("changelog", "textarea does not hold the drafted body");
draft = draft.replaceAll(
  "_Migration note needed — describe what consumers should do instead._",
  "**Migration:** treat `refunded` as the terminal state you previously matched on `cancelled`. `invoice_url` may be absent on orders created after 1 Aug; fall back to `GET /v1/orders/{id}`.",
);
await ta.fill(draft);
await page.waitForTimeout(200);
await page.click('button:has-text("Preview as a consumer")');
await page.waitForTimeout(300);
await shot(page, "21-changelog-preview");
t = await text(page);
if (!/Migration:/.test(t)) note("changelog", "preview does not render the migration note");
await page.click('button:has-text("Edit")');
await page.waitForTimeout(200);
await page.locator('button:has-text("Publish")').first().click();
await page.waitForLoadState("load");
await page.waitForTimeout(1800);
await shot(page, "22-changelog-published");
t = await text(page);
if (!/Published\./.test(t)) note("changelog", `publish did not confirm: ${t.slice(0, 400)}`);
if (!/PUBLISHED/i.test(t)) note("changelog", "entry not marked published");

console.log("\n=== 10. public changelog ===");
await page.goto(`${BASE}/c/northwind-platform/payments-api`, { waitUntil: "load" });
await page.waitForTimeout(400);
await shot(page, "23-public-changelog");
t = await text(page);
if (!/Payments API changelog/.test(t)) note("public", "no changelog heading");
if (!/Watched by/.test(t)) note("public", "no footer mark");
if (!/Migration:/.test(t)) note("public", "the migration note did not render");
if (/Migration note needed/.test(t)) note("public", "an unfilled placeholder reached the public page");
if (!/Breaking/.test(t)) note("public", "breaking entry not marked");
if (!/Email me changes/.test(t)) note("public", "no subscribe form");

await page.fill('input[name="email"]', "consumer@acme.example");
await page.click('button:has-text("Email me changes")');
await page.waitForLoadState("load");
await page.waitForTimeout(1400);
await shot(page, "24-public-subscribed");
t = await text(page);
if (!/(Recorded|Check your inbox|already subscribed)/.test(t)) note("public", "subscribing gave no feedback");
else console.log(`  subscribe said: ${/(Recorded[^\n]*|Check your inbox[^\n]*|already subscribed[^\n]*)/.exec(t)?.[0]}`);

console.log("\n=== phase 2 summary ===");
console.log(`problems: ${problems.length}`);
for (const p of problems) console.log(`  - ${p}`);
console.log(`console errors: ${consoleErrors.length}`);
for (const e of consoleErrors) console.log(`  - ${e}`);
await browser.close();
