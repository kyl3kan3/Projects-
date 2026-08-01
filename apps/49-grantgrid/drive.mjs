/**
 * Drive the real forms in Chromium at 390x844. Server actions cannot be posted by
 * curl, so this is the only way to exercise the client round trip.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3049";
const OUT = "/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/shots";
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const email = `dana+${Date.now()}@riversideyouth.org`;

function log(...m) {
  console.log("·", ...m);
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
page.on("response", (res) => {
  if (res.status() >= 500) errors.push(`${res.status()} ${res.url()}`);
});

/* ---------------------------------------------------------------- landing --- */
await page.goto(BASE, { waitUntil: "networkidle" });
log("landing title:", await page.title());
const fontFamily = await page.evaluate(() =>
  getComputedStyle(document.querySelector("h1")).fontFamily,
);
log("h1 font-family:", fontFamily);
const fontsLoaded = await page.evaluate(async () => {
  await document.fonts.ready;
  return [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`);
});
log("fonts:", fontsLoaded.join(" | "));
await page.waitForTimeout(5200); // let the apply→skip flip happen
await shot(page, "01-landing");
const skipVisible = await page.getByText("long shot").first().isVisible().catch(() => false);
log("hero flipped to the long-shot card:", skipVisible);

// Horizontal overflow check at 390px.
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
log("landing horizontal overflow px:", overflow);

/* ----------------------------------------------------------------- signup --- */
await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
await page.fill('input[name="orgName"]', "Riverside Youth Collective");
await page.fill('input[name="name"]', "Dana Whitfield");
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "cuyahoga-2026");
await shot(page, "02-signup");
await page.click('button[type="submit"]');
await page.waitForURL("**/onboarding", { timeout: 20000 });
log("signed up ->", page.url());
await shot(page, "03-onboarding");

/* --------------------------------------------------------------- profile --- */
await page.fill('textarea[name="mission"]',
  "Riverside Youth Collective runs after-school tutoring and a summer literacy camp for 240 students in Cuyahoga County.");
// Click the chip labels, exactly as a person would.
await page.locator('label.chip', { hasText: /^OH$/ }).click();
await page.locator('label.chip', { hasText: "Youth development" }).click();
await page.locator('label.chip', { hasText: "Education & literacy" }).click();
await page.selectOption('select[name="budgetBand"]', "100k_500k");
await page.fill('input[name="typicalAsk"]', "10,000");
await page.fill('input[name="ein"]', "34-1234567");
await page.click('button[type="submit"]');
await page.waitForURL("**/pipeline", { timeout: 20000 });
log("profile saved ->", page.url());
await shot(page, "04-pipeline-empty");

/* ------------------------------------------------------------- discovery --- */
await page.goto(`${BASE}/discovery`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await shot(page, "05-discovery");
const cardNames = await page.locator("article h3").allTextContents();
log("discovery cards:", cardNames.length, "first:", cardNames[0]);
const arcNumbers = await page.locator("article .t-data").first().textContent();
log("first card fit label:", (await page.locator("article").first().textContent()).slice(0, 160).replace(/\s+/g, " "));

// Expand the reasons on the top card.
await page.locator("article").first().getByRole("button", { expanded: false }).first().click();
await page.waitForTimeout(600);
await shot(page, "06-discovery-reasons");
const reasonRows = await page.locator("article").first().locator("text=/Recent giving includes/").count();
log("geography reason visible:", reasonRows > 0);

// Add the top-scoring funder to the pipeline.
await page.locator("article").first().getByRole("button", { name: "Add to pipeline" }).click();
await page.waitForTimeout(400);
await page.fill('input[name="title"]', "Summer literacy camp, 2027");
const soon = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
await page.fill('input[name="dueOn"]', soon);
await shot(page, "07-add-sheet");
await page.getByRole("button", { name: /Add at Researching/ }).click();
await page.waitForURL(/\/pipeline\/[0-9a-f-]{36}/, { timeout: 20000 });
const grantUrl = page.url();
log("added from discovery ->", grantUrl);
await shot(page, "08-grant-detail");

/* ----------------------------------------------- deadlines and the ladder --- */
const ladderText = await page.locator("section", { hasText: "Dates" }).first().textContent();
log("ladder text:", ladderText.replace(/\s+/g, " ").slice(0, 320));

/* -------------------------------------------------------------- workspace --- */
await page.locator('button.row:has-text("Organization background")').click();
await page.waitForTimeout(400);
await page.selectOption('select[name="answerId"]', { index: 2 });
await page.getByRole("button", { name: /Copy the block into this draft/ }).click();
await page.waitForTimeout(1500);
await shot(page, "09-workspace-linked");

/* ------------------------------------------------------------------ award --- */
await page.goto(grantUrl, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Enter an award/ }).click();
await page.waitForTimeout(400);
await page.fill('input[name="awardedAmount"]', "7,500");
await page.selectOption('select[name="schedule"]', "interim_final");
await page.fill('textarea[name="restrictions"]', "Restricted to the summer camp. No indirect costs.");
await shot(page, "10-award-sheet");
await page.getByRole("button", { name: /Save award and schedule reports/ }).click();
await page.waitForTimeout(2000);
await page.goto(grantUrl, { waitUntil: "networkidle" });
await shot(page, "11-after-award");
const reportsVisible = await page.locator("text=/month report to/").count();
log("report deadlines created:", reportsVisible);

/* --------------------------------------------------------------- calendar --- */
await page.goto(`${BASE}/calendar`, { waitUntil: "networkidle" });
await shot(page, "12-calendar-week");
await page.locator('a.chip:has-text("Month")').click();
await page.waitForTimeout(800);
await shot(page, "13-calendar-month");
const agenda = await page.locator(".row").allTextContents();
log("calendar rows:", agenda.length);

/* ---------------------------------------------------------------- library --- */
await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
await shot(page, "14-library");
const blocks = await page.locator(".t-title").allTextContents();
log("library blocks:", blocks.length, blocks.slice(0, 3).join(" / "));

/* --------------------------------------------------------------- settings --- */
await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
await shot(page, "15-settings");
await page.getByRole("button", { name: /Generate a calendar URL/ }).click();
await page.waitForTimeout(2000);
const icsUrl = await page.locator("code").first().textContent().catch(() => null);
log("ICS url issued:", icsUrl);
await shot(page, "16-settings-ics");

await page.goto(`${BASE}/settings/billing`, { waitUntil: "networkidle" });
await shot(page, "17-billing");

/* ------------------------------------------------------- reduced motion --- */
const rmContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const rmPage = await rmContext.newPage();
await rmPage.goto(BASE, { waitUntil: "networkidle" });
await rmPage.waitForTimeout(300);
const arcOffset = await rmPage.evaluate(() => {
  const el = document.querySelector(".fit-arc-value");
  if (!el) return "no arc";
  const cs = getComputedStyle(el);
  return `${cs.strokeDashoffset} / duration ${cs.animationDuration}`;
});
console.log("· reduced-motion arc:", arcOffset);
const rmNumber = await rmPage.locator(".fit-arc-value").first().isVisible();
console.log("· reduced-motion arc visible:", rmNumber);
await rmPage.screenshot({ path: `${OUT}/18-reduced-motion.png`, fullPage: true });
await rmContext.close();

/* ----------------------------------------------------- desktop enhancement --- */
const wide = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const widePage = await wide.newPage();
await widePage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await wide.addCookies(await context.cookies());
await widePage.goto(`${BASE}/pipeline`, { waitUntil: "networkidle" });
await widePage.screenshot({ path: `${OUT}/19-pipeline-desktop.png`, fullPage: true });
await wide.close();

console.log("\n--- console/page errors ---");
console.log(errors.length ? errors.join("\n") : "none");
console.log("\nemail used:", email);
console.log("grant url:", grantUrl);
console.log("ics url:", icsUrl);

await browser.close();
