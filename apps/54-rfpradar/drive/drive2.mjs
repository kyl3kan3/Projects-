/**
 * Second verification pass: the paths the first driver did not reach —
 * the ICS feed with open deadlines, the T-7/3/1 reminder ladder through the real
 * cron route, the Watching filter, seat invite + accept, plan gating on Scout,
 * and read-only mode after a lapsed trial.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = "http://localhost:3054";
const DB = "postgres://postgres@localhost:5433/app_54_rfpradar";
const OUT = "/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/shots";
mkdirSync(OUT, { recursive: true });

function sql(query) {
  return execFileSync("psql", [DB, "-tA", "-c", query], { encoding: "utf8" }).trim();
}

const log = (...a) => console.log(...a);
const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`${page.url()} :: ${m.text()}`); });
page.on("pageerror", (e) => pageErrors.push(`${page.url()} :: ${e.message}`));

const email = `lead+${Date.now()}@bramble.example`;

/* --------------------------------------------------------------- signup */
log("== signup + profile");
await page.goto(`${BASE}/signup`);
await page.fill('input[name="firmName"]', "Bramble & Co Consulting");
await page.fill('input[name="name"]', "R. Okonjo");
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "correct-horse-9");
await page.click('button[type="submit"]');
await page.waitForURL("**/radar");
const firmId = sql(`select id from firms order by created_at desc limit 1`);
log("  firm:", firmId);

await page.goto(`${BASE}/profiles`);
await page.fill('input[name="name"]', "Security services — mid-Atlantic");
await page.fill('textarea[name="keywords"]', "managed detection, security operations");
await page.fill('input[name="naicsCodes"]', "541512");
await page.fill('input[name="states"]', "VA, MD, US");
await page.click('button[type="submit"]:has-text("Create profile")');
await page.waitForSelector('[role="status"]', { timeout: 30000 });
log("  ", (await page.locator('[role="status"]').first().innerText()).trim());

/* --------------------------------------------------------- watch filter */
log("== watch a match, then the Watching filter");
await page.goto(`${BASE}/radar`);
await page.locator('button:has-text("Watch")').first().click();
await page.waitForTimeout(1800);
await page.goto(`${BASE}/radar?filter=watching`);
log("  watching cards:", await page.locator("article.card:has(.t-score)").count());
log("  chip active:", await page.locator('.chip[aria-current="true"]').innerText());
await page.screenshot({ path: `${OUT}/22-watching.png`, fullPage: true });

/* ---------------------------------------------------- ICS with open dates */
log("== ICS feed with open deadlines");
await page.goto(`${BASE}/settings`);
await page.click('button:has-text("Create the feed URL")');
await page.waitForTimeout(2000);
const feedUrl = (await page.locator("p.t-mono").filter({ hasText: "/api/ics/" }).first().innerText()).trim();
let res = await page.request.get(feedUrl);
let body = await res.text();
log("  status:", res.status(), "VEVENTs:", (body.match(/BEGIN:VEVENT/g) ?? []).length);
log("  CRLF only:", !/[^\r]\n/.test(body));
const summaries = [...body.matchAll(/SUMMARY:(.*)/g)].map((m) => m[1]);
log("  summaries:", summaries.slice(0, 3));
log("  escaped commas present:", summaries.some((s) => s.includes("\\,")) || "none needed");

/* rotate kills the old URL */
await page.click('button:has-text("Rotate")');
await page.waitForTimeout(2000);
const shownUrls = await page.locator("p.t-mono").filter({ hasText: "/api/ics/" }).allInnerTexts();
log("  feed URLs shown on the page after rotate:", shownUrls.length);
const oldRes = await page.request.get(feedUrl);
log("  old URL after rotate ->", oldRes.status());
const newFeed = shownUrls[shownUrls.length - 1].trim();
log("  new URL ->", (await page.request.get(newFeed)).status(), newFeed === feedUrl ? "SAME (bug)" : "different");

/* ------------------------------------------------- the reminder ladder */
log("== reminder ladder through the cron route");
const pursuitId = sql(`select id from pursuits where firm_id='${firmId}' limit 1`);
log("  pursuit:", pursuitId || "(none)");
// Put the proposal deadline exactly 7 calendar days out in the firm's zone.
sql(`update deadlines set due_at = (now() + interval '7 days') where firm_id='${firmId}'`);
sql(`delete from reminders`);
async function tick() {
  const r = await page.request.get(`${BASE}/api/cron/tick`, {
    headers: { authorization: "Bearer local-dev-only-cron-secret" },
  });
  return (await r.json()).reminders;
}
log("  tick 1:", JSON.stringify(await tick()));
log("  tick 2:", JSON.stringify(await tick()));
log("  ledger:", sql(`select offset_days from reminders order by offset_days`).split("\n").join(","));
sql(`update deadlines set due_at = (now() + interval '3 days') where firm_id='${firmId}'`);
log("  tick at T-3:", JSON.stringify(await tick()));
sql(`update deadlines set due_at = (now() + interval '1 day') where firm_id='${firmId}'`);
log("  tick at T-1:", JSON.stringify(await tick()));
sql(`update deadlines set due_at = (now() - interval '30 days') where firm_id='${firmId}'`);
log("  tick 30 days overdue:", JSON.stringify(await tick()));
log("  final ledger:", sql(`select offset_days from reminders order by offset_days`).split("\n").join(","));
log("  deadline notifications sent:",
  sql(`select count(*) from notifications where firm_id='${firmId}' and kind='deadline'`));

/* --------------------------------------------------------- seat invite */
log("== seat invite and accept");
await page.goto(`${BASE}/settings`);
await page.fill('input[name="name"]', "J. Whitfield");
await page.fill('input[name="email"]', `seat+${Date.now()}@bramble.example`);
await page.click('button:has-text("Invite to a seat")');
await page.waitForSelector('[role="status"]', { timeout: 20000 });
const inviteNotice = (await page.locator('[role="status"]').first().innerText()).trim();
log("  ", inviteNotice.slice(0, 120));
const inviteUrl = inviteNotice.match(/https?:\/\/\S+/)?.[0];
log("  invite url:", inviteUrl ? "found" : "MISSING");
if (inviteUrl) {
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guestPage = await guest.newPage();
  await guestPage.goto(inviteUrl);
  log("  invite page heading:", (await guestPage.locator("h1").innerText()).trim());
  await guestPage.fill('input[name="name"]', "J. Whitfield");
  await guestPage.fill('input[name="password"]', "another-good-pass");
  await guestPage.click('button[type="submit"]');
  await guestPage.waitForURL("**/radar", { timeout: 20000 });
  log("  accepted ->", guestPage.url());
  await guestPage.screenshot({ path: `${OUT}/23-invited-seat-radar.png`, fullPage: true });
  // reuse of a single-use link
  const reuse = await guest.newPage();
  await reuse.goto(inviteUrl);
  log("  link reuse ->", (await reuse.locator("h1").innerText()).trim());
  await guest.close();
}

/* -------------------------------------------------- Scout plan gating */
log("== Scout gating");
sql(`update firms set plan='scout', stripe_subscription_id='sub_test', trial_ends_at=null where id='${firmId}'`);
await page.goto(`${BASE}/pursuits`);
log("  pursuits on Scout:", (await page.locator("main .card p.t-body").first().innerText()).slice(0, 90));
await page.goto(`${BASE}/library`);
log("  library on Scout:", (await page.locator("main .card p.t-body").first().innerText()).slice(0, 90));
await page.goto(`${BASE}/radar`);
log("  radar still works:", (await page.locator("h1.t-stat").innerText()).replace(/\n/g, " "));
await page.screenshot({ path: `${OUT}/24-scout-gated.png`, fullPage: true });
// seat 3 on Scout must prompt an upgrade, not fail silently
await page.goto(`${BASE}/settings`);
const seatBlock = await page.locator("main .card p.t-body").first().innerText().catch(() => "");
log("  seat 3 on Scout:", seatBlock.slice(0, 120));

/* ------------------------------------------------------- read-only mode */
log("== read-only after a lapsed trial");
sql(`update firms set plan='trial', stripe_subscription_id=null, trial_ends_at=(now() - interval '2 days') where id='${firmId}'`);
await page.goto(`${BASE}/radar`);
const banner = await page.locator('[role="status"]').first().innerText();
log("  banner:", banner.trim().slice(0, 110));
await page.screenshot({ path: `${OUT}/25-readonly.png`, fullPage: true });
const exportRes = await page.request.get(`${BASE}/api/library/export`);
log("  library export still available in read-only:", exportRes.status());
// a write must be refused
await page.goto(`${BASE}/profiles`);
const beforeCount = sql(`select count(*) from keyword_profiles where firm_id='${firmId}'`);
await page.fill('input[name="name"]', "Should not save");
await page.fill('textarea[name="keywords"]', "anything");
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);
const afterCount = sql(`select count(*) from keyword_profiles where firm_id='${firmId}'`);
log(`  profile writes blocked: before=${beforeCount} after=${afterCount}`,
  beforeCount === afterCount ? "OK" : "LEAKED");

/* -------------------------------------------------------------- landing */
log("== landing page");
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1400);
log("  h1:", (await page.locator("h1").first().innerText()).trim());
log("  hero score:", (await page.locator(".t-score").first().innerText()).trim());
log("  CTA count:", await page.locator('a:has-text("Start free — 14 days")').count());
const overflow = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
log("  overflow:", JSON.stringify(overflow));
await page.screenshot({ path: `${OUT}/26-landing-hero.png`, clip: { x: 0, y: 0, width: 390, height: 900 } });
await page.screenshot({ path: `${OUT}/27-landing-full.png`, fullPage: true });

const rm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const rmPage = await rm.newPage();
await rmPage.goto(`${BASE}/`);
await rmPage.waitForTimeout(150);
const opacity = await rmPage.locator(".beat-chip").first().evaluate((el) => getComputedStyle(el).opacity);
log("  reduced-motion deadline chip opacity after 150ms:", opacity);
await rmPage.screenshot({ path: `${OUT}/28-landing-reduced-motion.png`, clip: { x: 0, y: 0, width: 390, height: 900 } });

log("\n== console errors:", consoleErrors.length);
for (const e of consoleErrors.slice(0, 10)) log("  ", e);
log("== page errors:", pageErrors.length);
for (const e of pageErrors.slice(0, 10)) log("  ", e);

await browser.close();
