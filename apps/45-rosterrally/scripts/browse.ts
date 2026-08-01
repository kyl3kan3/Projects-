/**
 * Browser pass at 390×844. Throwaway: deleted before the tree is handed over.
 */

import { chromium, type ConsoleMessage, type Page } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3045";
const OUT = process.env.OUT ?? "/tmp/rr-shots";
mkdirSync(OUT, { recursive: true });

const errors: string[] = [];

function watch(page: Page, label: string) {
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(`[${label}] console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`[${label}] pageerror: ${err.message}`));
  page.on("requestfailed", (req) => {
    const failure = req.failure()?.errorText ?? "";
    if (!failure.includes("ERR_ABORTED")) {
      errors.push(`[${label}] requestfailed: ${req.url()} ${failure}`);
    }
  });
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  shot ${name}`);
}

async function main() {
  const familyToken = process.argv[2];
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  watch(page, "console");

  // --- landing + auth -----------------------------------------------------
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  console.log("landing title:", await page.title());
  await shot(page, "01-landing");

  await page.goto(`${BASE}/season`, { waitUntil: "networkidle" });
  console.log("unauthenticated /season lands on:", new URL(page.url()).pathname);

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", "dana@millbrooksoccer.org");
  await page.fill("#password", "wrongpassword");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(900);
  console.log("bad password message:", (await page.locator('[role="alert"]').first().textContent())?.trim());

  await page.fill("#password", "fall2026season");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/season`, { timeout: 15000 });
  console.log("signed in, at", new URL(page.url()).pathname);
  await shot(page, "02-season");

  const fontUsed = await page.evaluate(() => {
    const el = document.querySelector("h1");
    return el ? getComputedStyle(el).fontFamily : "";
  });
  console.log("h1 font-family:", fontUsed);
  const fontsLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`).slice(0, 6);
  });
  console.log("fonts:", fontsLoaded);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  console.log("horizontal overflow px:", overflow);

  // --- schedule: the conflict gate ---------------------------------------
  await page.goto(`${BASE}/schedule`, { waitUntil: "networkidle" });
  console.log("gate banner:", (await page.locator(".panel .t-label").first().textContent())?.trim());
  console.log("pennants on rows:", await page.locator(".pennant").count());
  await shot(page, "03-schedule");

  // Add a game that clashes, through the real form, and watch the gate change.
  await page.locator("summary", { hasText: "Add a game or practice" }).click();
  await page.selectOption("#kind", "practice");
  const teamOptions = await page.locator("#homeTeamId option").allTextContents();
  console.log("team options:", teamOptions.slice(1, 4));
  await page.selectOption("#homeTeamId", { index: 1 });
  await page.selectOption("#venueId", { index: 1 });
  const existingDate = await page
    .locator(".t-data")
    .filter({ hasText: /^\d+:\d+[AP]$/ })
    .first()
    .textContent();
  console.log("first scheduled time on screen:", existingDate?.trim());
  await page.fill("#field", "Field 2");
  await page.fill("#localTime", "09:30");
  const firstDay = await page.locator("#localDate").inputValue();
  await page.fill("#localDate", firstDay);
  await page.click('form:has(#localTime) button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/schedule`, { waitUntil: "networkidle" });
  console.log("gate after adding a clash:", (await page.locator(".panel .t-label").first().textContent())?.trim());
  await shot(page, "04-schedule-conflict");

  // --- rosters -----------------------------------------------------------
  await page.goto(`${BASE}/rosters`, { waitUntil: "networkidle" });
  console.log("roster teams shown:", await page.locator("section.panel h3").allTextContents());
  console.log("pool selects:", await page.locator('select[aria-label^="Place"]').count());
  await shot(page, "05-rosters");

  // --- comms -------------------------------------------------------------
  await page.goto(`${BASE}/comms`, { waitUntil: "networkidle" });
  await page.fill("#subject", "Rain plan for Saturday");
  await page.fill(
    "#body",
    "If it is raining before 8am, U10 games move indoors to the middle school gym.\n\nWe will text and email by 7:30am either way.",
  );
  await page.locator(".chip", { hasText: "Teams" }).click();
  await page.waitForTimeout(300);
  // Pick a team that actually has rostered players, so the audience is real.
  await page.locator(".chip-row").last().locator(".chip", { hasText: "Thunder" }).click();
  await shot(page, "06-comms-compose");
  const sendButton = page.locator('button[type="submit"]', { hasText: "Send it" });
  await sendButton.click();
  await page.waitForTimeout(300);
  await sendButton.click(); // hold-to-confirm: second press commits
  await page.waitForTimeout(3000);
  const sendResult = await page.locator('[role="status"], [role="alert"]').first().textContent();
  console.log("send result:", sendResult?.trim());
  await shot(page, "07-comms-sent");

  const firstSent = page.locator('a.row[href^="/comms/"]').first();
  if (await firstSent.count()) {
    await firstSent.click();
    await page.waitForURL(/\/comms\/[0-9a-f-]{36}/, { timeout: 15000 });
    await page.waitForTimeout(600);
    console.log("receipt page heading:", (await page.locator("h1").textContent())?.trim());
    console.log("receipt statuses:", (await page.locator(".panel .t-data").allTextContents()).slice(0, 6));
    await shot(page, "08-receipts");
  }

  // --- volunteers --------------------------------------------------------
  await page.goto(`${BASE}/volunteers`, { waitUntil: "networkidle" });
  console.log("volunteer rows:", await page.locator(".row").count());
  await shot(page, "09-volunteers");

  // --- registrations -----------------------------------------------------
  await page.goto(`${BASE}/registrations`, { waitUntil: "networkidle" });
  console.log("registration rows:", await page.locator("a.row").count());
  await shot(page, "10-registrations");
  const firstReg = page.locator('a.row[href^="/registrations/"]').first();
  await firstReg.click();
  await page.waitForURL(/\/registrations\/[0-9a-f-]{36}/, { timeout: 15000 });
  await page.waitForTimeout(600);
  console.log("detail heading:", (await page.locator("h1").textContent())?.trim());
  const medicalVisible = await page.getByText("Medical notes", { exact: false }).count();
  console.log("medical section present for admin:", medicalVisible > 0);
  await shot(page, "11-registration-detail");

  // --- the public registration flow, driven for real ---------------------
  const parent = await context.newPage();
  watch(parent, "register");
  await parent.goto(`${BASE}/register/millbrook-fall-2026`, { waitUntil: "networkidle" });
  console.log("register page heading:", (await parent.locator("h1").textContent())?.trim());
  await shot(parent, "12-register-step1");

  const started = Date.now();
  await parent.fill("#contactName", "Nadia Farouk");
  await parent.fill("#email", "nadia.farouk@example.com");
  await parent.fill("#phone", "+15550125");
  await parent.check('input[name="smsConsent"]');
  await parent.selectOption("#childCount", "2");
  await parent.click('button:has-text("Continue")');
  await parent.waitForTimeout(400);

  await parent.fill("#child-0-firstName", "Amir");
  await parent.fill("#child-0-lastName", "Farouk");
  await parent.fill("#child-0-birthdate", "2018-05-14");
  await parent.selectOption("#child-0-divisionId", { index: 0 });
  await parent.fill("#child-0-medicalNotes", "Wears glasses; spare pair in bag");
  await parent.fill("#child-0-emergencyName", "Yasmin Farouk");
  await parent.fill("#child-0-emergencyPhone", "+15550126");
  await parent.fill("#child-0-emergencyRelationship", "Aunt");
  await shot(parent, "13-register-child");
  await parent.click('button:has-text("Continue")');
  await parent.waitForTimeout(400);

  await parent.fill("#child-1-firstName", "Layla");
  await parent.fill("#child-1-lastName", "Farouk");
  await parent.fill("#child-1-birthdate", "2014-07-02");
  const divisionCount = await parent.locator("#child-1-divisionId option").count();
  await parent.selectOption("#child-1-divisionId", { index: Math.min(1, divisionCount - 1) });
  await parent.click('button:has-text("Continue")');
  await parent.waitForTimeout(400);

  console.log("fee summary lines:", await parent.locator(".panel .t-data").allTextContents());
  await shot(parent, "14-register-pay");
  await parent.check('input[name="waiverAccepted"]');
  // Deliberately mistype a code first: the error must not wipe what was typed.
  await parent.fill("#scholarshipCode", "NOPE-NOT-A-CODE");
  await parent.click('button:has-text("Check the fees again")');
  await parent.waitForTimeout(2000);
  console.log("bad code message:", (await parent.locator('[role="alert"]').first().textContent())?.trim());
  console.log(
    "fields kept after the error:",
    JSON.stringify({
      contact: await parent.locator("#contactName").inputValue(),
      child0: await parent.locator("#child-0-firstName").inputValue(),
      child1: await parent.locator("#child-1-firstName").inputValue(),
      waiver: await parent.locator('input[name="waiverAccepted"]').isChecked(),
    }),
  );
  await parent.fill("#scholarshipCode", "");
  await parent.click('button:has-text("Pay")');
  await parent.waitForTimeout(3500);
  console.log("after submit at:", new URL(parent.url()).pathname);
  await shot(parent, "15-checkout");

  if (parent.url().includes("/checkout/")) {
    await parent.click('button:has-text("Confirm")');
    await parent.waitForURL(/\/p\//, { timeout: 20000 });
    await parent.waitForTimeout(600);
    console.log("after confirming at:", new URL(parent.url()).pathname);
    const elapsed = Math.round((Date.now() - started) / 1000);
    console.log(`registration flow took ${elapsed}s of scripted clicking`);
    await shot(parent, "16-family-page");
  }

  // --- the family page ---------------------------------------------------
  if (familyToken) {
    const family = await context.newPage();
    watch(family, "family");
    await family.goto(`${BASE}/p/${familyToken}`, { waitUntil: "networkidle" });
    console.log("family heading:", (await family.locator("h1").textContent())?.trim());
    const text = await family.locator("body").innerText();
    const leaks = [
      "thu.nguyen@example.com",
      "ada.okonkwo@example.com",
      "sean.brennan@example.com",
      "+15550199",
      "Peanut allergy",
    ].filter((s) => text.includes(s));
    console.log("family page leaks:", leaks.length === 0 ? "none" : leaks.join(", "));
    await shot(family, "17-family");

    // Claim a volunteer slot from the page, with no login.
    const claim = family.locator('button:has-text("Claim")').first();
    if (await claim.count()) {
      await claim.click();
      await family.waitForTimeout(2500);
      const status = await family.locator('[role="status"], [role="alert"]').first().textContent();
      console.log("claim result:", status?.trim());
      await shot(family, "18-family-claimed");
    } else {
      console.log("claim result: no open slots on the page");
    }

    // A tampered token must not open anything.
    const bad = await context.newPage();
    await bad.goto(`${BASE}/p/${familyToken.slice(0, -4)}zzzz`, { waitUntil: "networkidle" });
    console.log("tampered link heading:", (await bad.locator("h1").textContent())?.trim());
    await bad.close();

    // iCal feed is served and holds no names.
    const feed = await context.request.get(`${BASE}/api/ical/${familyToken}`);
    console.log("ical with a household token (must 404):", feed.status());
  }

  // --- reduced motion ----------------------------------------------------
  const reduced = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const rpage = await reduced.newPage();
  watch(rpage, "reduced");
  await rpage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await rpage.fill("#email", "dana@millbrooksoccer.org");
  await rpage.fill("#password", "fall2026season");
  await rpage.click('button[type="submit"]');
  await rpage.waitForURL(`${BASE}/season`);
  const durations = await rpage.evaluate(() =>
    [...document.querySelectorAll(".stagger > *")]
      .slice(0, 3)
      .map((el) => getComputedStyle(el).animationDuration),
  );
  console.log("reduced-motion animation durations:", durations);
  await shot(rpage, "19-reduced-motion");

  // --- desktop -----------------------------------------------------------
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const dpage = await desktop.newPage();
  watch(dpage, "desktop");
  await dpage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await dpage.fill("#email", "dana@millbrooksoccer.org");
  await dpage.fill("#password", "fall2026season");
  await dpage.click('button[type="submit"]');
  await dpage.waitForURL(`${BASE}/season`);
  console.log("desktop rail visible:", await dpage.locator("nav[aria-label='Main'] >> visible=true").count());
  await shot(dpage, "20-desktop-season");
  await dpage.goto(`${BASE}/schedule`, { waitUntil: "networkidle" });
  await shot(dpage, "21-desktop-schedule");

  await browser.close();

  console.log("\n--- console/page errors ---");
  console.log(errors.length === 0 ? "none" : errors.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
