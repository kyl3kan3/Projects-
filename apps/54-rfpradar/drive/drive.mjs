import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3054";
const OUT = "/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/shots";
mkdirSync(OUT, { recursive: true });

const email = `partner+${Date.now()}@northgate.example`;
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

function log(...args) {
  console.log(...args);
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

// The pre-installed Chromium at PLAYWRIGHT_BROWSERS_PATH is build 1194; the
// playwright version resolved here expects a different build number, so point it
// at the binary that actually exists rather than downloading anything.
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(`${page.url()} :: ${msg.text()}`);
});
page.on("pageerror", (err) => pageErrors.push(`${page.url()} :: ${err.message}`));
page.on("requestfailed", (req) => failedRequests.push(`${req.url()} :: ${req.failure()?.errorText}`));

/* ---------------------------------------------------------------- signup */
log("== signup");
await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
await shot(page, "01-signup");
await page.fill('input[name="firmName"]', "Northgate IT Services");
await page.fill('input[name="name"]', "M. Torres");
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "correct-horse-9");
await page.click('button[type="submit"]');
await page.waitForURL("**/radar", { timeout: 20000 });
log("  -> at", page.url());
await shot(page, "02-radar-firstrun");
log("  first-run heading:", await page.locator("h1").first().innerText());

/* ------------------------------------------------------------- profile */
log("== keyword profile");
await page.goto(`${BASE}/profiles`, { waitUntil: "networkidle" });
await page.fill('input[name="name"]', "Managed IT — VA/MD");
await page.fill('textarea[name="keywords"]', "managed detection, endpoint detection, security operations");
await page.fill('textarea[name="negativeKeywords"]', "staffing, janitorial");
await page.fill('input[name="naicsCodes"]', "541512");
await page.fill('input[name="pscCodes"]', "D310");
await page.fill('input[name="states"]', "VA, MD, US");
await page.fill('input[name="agencies"]', "Department of the Army");
await page.fill('input[name="minValue"]', "250000");
await page.fill('input[name="maxValue"]', "5000000");
await page.click('button[type="submit"]:has-text("Create profile")');
await page.waitForSelector('[role="status"]', { timeout: 30000 });
log("  ->", (await page.locator('[role="status"]').first().innerText()).trim());
await shot(page, "03-profiles");

/* --------------------------------------------------------------- radar */
log("== radar");
await page.goto(`${BASE}/radar`, { waitUntil: "networkidle" });
await page.waitForTimeout(1400);
log("  stamp:", (await page.locator(".t-mono").first().innerText()).trim());
log("  hero:", (await page.locator("h1.t-stat").innerText()).replace(/\n/g, " "));
log("  secondary:", (await page.locator("main p.t-secondary").first().innerText()).trim());
const cards = page.locator("article.card:has(.t-score)");
log("  match cards:", await cards.count());
const first = cards.first();
log("  top card score:", (await first.locator(".t-score").innerText()).trim());
log("  top card title:", (await first.locator("h3").innerText()).trim());
log("  top reasons:", (await first.locator("ul li.t-secondary").allInnerTexts()).join(" | "));
await shot(page, "04-radar");

// expand the factor list
await first.locator("summary:has-text('more')").click();
await page.waitForTimeout(200);
log("  expanded factor rows:", await first.locator("details ul.rows li").count());
await shot(page, "05-radar-factors");

// source health
await page.locator("summary:has-text('Source health')").click();
await page.waitForTimeout(200);
await shot(page, "06-source-health");
log("  source rows:", await page.locator("details:has(summary:has-text('Source health')) .rows > div").count());

// document scroll width check at 390
const overflow = await page.evaluate(() => ({
  doc: document.documentElement.scrollWidth,
  win: window.innerWidth,
}));
log("  horizontal overflow:", JSON.stringify(overflow));

/* ------------------------------------------------------- notice reader */
log("== notice reader");
await page.goto(`${BASE}/radar`, { waitUntil: "networkidle" });
await page.locator("a:has-text('Read the notice')").first().click();
await page.waitForURL(/\/radar\/[0-9a-f-]{36}/, { timeout: 20000 });
log("  title:", (await page.locator("h1").innerText()).trim());
log("  factor rows:", await page.locator("section:has(h2:has-text('Why it scored')) ul.rows li").count());
log("  keyword hits underlined:", await page.locator("mark.hit").count());
log("  amendment rows:", await page.locator("section:has(h2:has-text('Amendment trail')) .rows > div").count());
await shot(page, "07-notice-reader");

/* ---------------------------------------------------------- pursue flow */
log("== pursue");
await page.click('button:has-text("Pursue — start the go/no-go")');
await page.waitForURL(/\/pursuits\/[0-9a-f-]{36}/, { timeout: 20000 });
const pursuitUrl = page.url();
log("  -> at", pursuitUrl);
log("  stage pill:", (await page.locator(".pill").first().innerText()).trim());
log("  deadline rows:", await page.locator("section:has(h2:has-text('Dates on this pursuit')) .rows > div").count());
await shot(page, "08-pursuit");

/* ------------------------------------------------------------ scorecard */
log("== scorecard");
const scoreSets = { incumbent: 4, vehicle: 5, capacity: 4, price: 3, relationship: 2 };
for (const [key, value] of Object.entries(scoreSets)) {
  await page.locator(`input[name="score_${key}"][value="${value}"]`).click({ force: true });
}
await page.fill('input[name="note_incumbent"]', "No named incumbent in the market survey.");
await page.waitForTimeout(200);
log("  live verdict:", (await page.locator("form .t-stat").innerText()).trim(), "/",
  (await page.locator("form .hair-t .t-mono").first().innerText()).trim());
log("  explanation:", (await page.locator("form .hair-t p.t-secondary").first().innerText()).trim());
await shot(page, "09-scorecard");

// hold-to-confirm
const hold = page.locator('button:has-text("Hold to record")');
log("  hold button:", (await hold.innerText()).trim());
await hold.hover();
await page.mouse.down();
await page.waitForTimeout(900);
await page.mouse.up();
await page.waitForTimeout(2500);
await page.reload({ waitUntil: "networkidle" });
log("  after decision, stage:", (await page.locator(".pill").first().innerText()).trim());
log("  recorded line:", (await page.locator("p").filter({ hasText: "Recorded decision" }).first().innerText().catch(() => "MISSING")).trim());
await shot(page, "10-scorecard-decided");

/* ------------------------------------------------------------ checklist */
log("== requirements");
await page.fill('input[name="label"]', "Volume II — Past performance, three references");
await page.fill('input[name="dueAt"]', "2026-04-10");
await page.click('button:has-text("Add item")');
await page.waitForTimeout(1500);
log("  checklist rows:", await page.locator("section:has(h2:has-text('Requirement checklist')) .rows > div").count());

/* --------------------------------------------------------------- library */
log("== library");
await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
await page.selectOption('select[name="kind"]', "past_performance");
await page.fill('input[name="title"]', "SOC monitoring for a state agency");
await page.fill('input[name="tags"]', "soc, virginia");
await page.fill('textarea[name="body"]', "Commonwealth of Virginia, DSS (2023-2025). 12,000 endpoints monitored 24x7 with a 15-minute containment SLA.");
await page.click('button:has-text("Add block")');
await page.waitForSelector('[role="status"]', { timeout: 20000 });
log("  ->", (await page.locator('[role="status"]').first().innerText()).trim());
await shot(page, "11-library");

log("== link and snapshot");
await page.goto(pursuitUrl, { waitUntil: "networkidle" });
await page.selectOption('select[name="answerBlockId"]', { index: 1 });
await page.fill('input[name="requirementLabel"]', "Past performance §4.2");
await page.click('button:has-text("Link and snapshot")');
await page.waitForTimeout(1800);
const snapshotNote = await page.locator("section:has(h2:has-text('Linked from the library')) article p.t-secondary").first().innerText();
log("  snapshot note:", snapshotNote.trim());
await shot(page, "12-linked-block");

// edit the library block, then confirm the pursuit copy is unchanged
await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
await page.click("a:has-text('Edit')");
await page.waitForTimeout(600);
await page.fill('textarea[name="body"]', "REWRITTEN for a different client entirely.");
await page.click('button:has-text("Save as v")');
await page.waitForSelector('[role="status"]', { timeout: 20000 });
log("  library edit ->", (await page.locator('[role="status"]').first().innerText()).trim());
await page.goto(pursuitUrl, { waitUntil: "networkidle" });
const frozen = await page.locator("section:has(h2:has-text('Linked from the library')) article p.t-body").first().innerText();
log("  pursuit copy after library edit:", frozen.trim().slice(0, 80));
const drift = await page.locator("section:has(h2:has-text('Linked from the library')) article p.t-secondary").first().innerText();
log("  drift note:", drift.trim());

/* ------------------------------------------------------- submit and win */
log("== submit and win");
await page.click('button:has-text("Move to Submitted")');
await page.waitForTimeout(1500);
await page.locator('form:has(h3:has-text("Won")) textarea[name="note"]').fill("Won on technical score; incumbent priced high.");
await page.locator('form:has(h3:has-text("Won")) button:has-text("Record won")').click();
await page.waitForTimeout(2000);
log("  stage:", (await page.locator(".pill").first().innerText()).trim());
await shot(page, "13-pursuit-won");
await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
log("  won-with flags:", await page.locator("text=won with").count());

/* ------------------------------------------------------------ deadlines */
log("== deadlines");
await page.goto(`${BASE}/deadlines?show=all`, { waitUntil: "networkidle" });
log("  rows:", await page.locator("section.rows > div").count());
log("  header:", (await page.locator("p.t-secondary").first().innerText()).trim());
await shot(page, "14-deadlines");

/* -------------------------------------------------------------- settings */
log("== settings");
await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
await shot(page, "15-settings");
await page.click('button:has-text("Create the feed URL")');
await page.waitForTimeout(2000);
const feedUrl = await page.locator("p.t-mono").filter({ hasText: "/api/ics/" }).first().innerText().catch(() => "");
log("  feed url:", feedUrl.trim().slice(0, 60), "…");
await page.click('button:has-text("Send today\'s scan now")');
await page.waitForTimeout(2500);
log("  scan:", (await page.locator('[role="status"]').first().innerText().catch(() => "none")).trim());
await shot(page, "16-settings-feed");

/* ------------------------------------------------------------ suppressed */
log("== suppressed audit");
await page.goto(`${BASE}/radar/suppressed`, { waitUntil: "networkidle" });
log("  heading:", (await page.locator("h1").innerText()).trim());
log("  suppressed cards:", await page.locator("article.card").count());
await shot(page, "17-suppressed");

/* --------------------------------------------------------------- reports */
log("== reports");
await page.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
log("  win rate:", (await page.locator(".card .t-stat").first().innerText()).trim());
await shot(page, "18-reports");

/* ------------------------------------------------------------- desktop */
log("== desktop 1280");
const wide = await context.newPage();
await wide.setViewportSize({ width: 1280, height: 900 });
await wide.goto(`${BASE}/radar`, { waitUntil: "networkidle" });
await wide.screenshot({ path: `${OUT}/19-radar-desktop.png`, fullPage: true });
log("  side rail visible:", await wide.locator("nav[aria-label='Main'] a:has-text('Radar')").nth(1).isVisible().catch(() => false));

/* --------------------------------------------------- reduced motion pass */
log("== reduced motion");
const rm = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
  storageState: await context.storageState(),
});
const rmPage = await rm.newPage();
await rmPage.goto(`${BASE}/radar`, { waitUntil: "networkidle" });
await rmPage.waitForTimeout(300);
const scoreText = await rmPage.locator(".t-score").first().innerText();
log("  score renders immediately under reduced motion:", scoreText.trim());
await rmPage.screenshot({ path: `${OUT}/20-radar-reduced-motion.png`, fullPage: true });

/* ---------------------------------------------------------- ICS + export */
if (feedUrl.includes("/api/ics/")) {
  const res = await page.request.get(feedUrl.trim());
  const body = await res.text();
  log("== ICS feed:", res.status(), res.headers()["content-type"]);
  log(body.split("\r\n").slice(0, 8).join(" | "));
  log("  VEVENT count:", (body.match(/BEGIN:VEVENT/g) ?? []).length);
  const bad = await page.request.get(feedUrl.trim().replace(/.$/, "x"));
  log("  tampered token ->", bad.status());
}
const exp = await page.request.get(`${BASE}/api/library/export`);
log("== library export:", exp.status(), (await exp.text()).length, "bytes");
const csv = await page.request.get(`${BASE}/api/pursuits?format=csv`);
log("== pursuits csv:", csv.status(), (await csv.text()).split("\r\n")[0]);

/* -------------------------------------------------------------- cron */
const cronNoSecret = await page.request.get(`${BASE}/api/cron/tick`);
log("== cron without secret:", cronNoSecret.status(), (await cronNoSecret.text()).slice(0, 80));
const cronOk = await page.request.get(`${BASE}/api/cron/tick`, {
  headers: { authorization: "Bearer local-dev-only-cron-secret" },
});
log("== cron with secret:", cronOk.status(), (await cronOk.text()).slice(0, 240));

/* ------------------------------------------------------------- landing */
log("== landing");
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await shot(page, "21-landing");
log("  h1:", (await page.locator("h1").first().innerText()).trim().slice(0, 80));

log("\n== console errors:", consoleErrors.length);
for (const e of consoleErrors.slice(0, 12)) log("  ", e);
log("== page errors:", pageErrors.length);
for (const e of pageErrors.slice(0, 12)) log("  ", e);
log("== failed requests:", failedRequests.length);
for (const e of failedRequests.slice(0, 12)) log("  ", e);

await browser.close();
