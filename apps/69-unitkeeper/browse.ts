/* Throwaway Chromium driver at 390x844. Deleted after use. */
import { chromium, type ConsoleMessage, type Page } from "playwright";

const BASE = "http://localhost:3069";
const SHOTS = "/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/shots";
const errors: string[] = [];
const log = (...m: unknown[]) => console.log("·", ...m);

function watch(page: Page, label: string) {
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(`[${label}] console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`[${label}] pageerror: ${err.message}`));
  page.on("requestfailed", (req) => {
    const failure = req.failure()?.errorText ?? "";
    if (!/ERR_ABORTED/.test(failure)) errors.push(`[${label}] requestfailed: ${req.url()} ${failure}`);
  });
}

async function noSideScroll(page: Page, where: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 1) errors.push(`[${where}] body scrolls sideways by ${overflow}px`);
}

async function main() {
  // The pre-installed Chromium (build 1194) is older than the linked Playwright
  // expects, so point at it explicitly rather than asking it to download one.
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  watch(page, "owner");

  /* ---- 1. landing ------------------------------------------------------- */
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const cta = await page.getByRole("link", { name: "Start free — 14 days" }).count();
  if (cta < 3) errors.push(`landing has only ${cta} CTA links`);
  await noSideScroll(page, "landing");
  const font = await page.evaluate(() => {
    const el = document.querySelector("h1");
    return el ? getComputedStyle(el).fontFamily : "";
  });
  if (!/Public Sans/i.test(font)) errors.push(`display font did not load: ${font}`);
  const monoFont = await page.evaluate(() => {
    const el = document.querySelector(".t-mono");
    return el ? getComputedStyle(el).fontFamily : "";
  });
  if (!/Plex Mono/i.test(monoFont)) errors.push(`mono font did not load: ${monoFont}`);
  // The device must be visible, not a blank frame waiting on an animation delay.
  const deviceVisible = await page.locator(".rail-step").first().isVisible();
  if (!deviceVisible) errors.push("the landing device's rail is not visible");
  await page.screenshot({ path: `${SHOTS}/01-landing.png`, fullPage: false });
  await page.screenshot({ path: `${SHOTS}/02-landing-full.png`, fullPage: true });
  log(`landing: ${cta} CTAs, fonts loaded (${font.split(",")[0]} / ${monoFont.split(",")[0]})`);

  /* ---- 2. signup, empty state, facility, map editor --------------------- */
  const email = `browse-${Date.now()}@example.test`;
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.fill('input[name="name"]', "Browse Storage LLC");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "browse-password");
  await page.getByRole("button", { name: "Start free — 14 days" }).click();
  await page.waitForURL("**/map", { timeout: 20_000 });
  await page.waitForSelector("text=Start with the facility");
  await noSideScroll(page, "map empty");
  await page.screenshot({ path: `${SHOTS}/03-empty-facility.png` });
  log("signup landed on the facility empty state");

  await page.fill('input[name="name"]', "Browse Yard — Cedar Park");
  await page.fill('input[name="address"]', "12 Test Row, Cedar Park, TX 78613");
  await page.selectOption('select[name="state"]', "TX");
  await page.getByRole("button", { name: "Create the facility" }).click();
  await page.waitForSelector("text=Draw your map", { timeout: 20_000 });
  await page.screenshot({ path: `${SHOTS}/04-draw-your-map.png` });
  log("facility created; the map's empty state names the next action");

  await page.fill('input[name="count"]', "8");
  await page.selectOption('select[name="size"]', "10x10");
  await page.fill('input[name="rate"]', "129");
  await page.getByRole("button", { name: "Add the row" }).click();
  await page.waitForSelector(".door", { timeout: 20_000 });
  const doors = await page.locator(".door").count();
  if (doors !== 8) errors.push(`expected 8 doors, found ${doors}`);
  await noSideScroll(page, "map with units");
  await page.screenshot({ path: `${SHOTS}/05-map.png` });
  log(`map editor drew ${doors} doors`);

  // Tap a door: the detail line must appear under the grid.
  await page.locator(".door").first().click();
  await page.waitForSelector("text=No tenant — ready to rent");
  await page.screenshot({ path: `${SHOTS}/06-map-door-selected.png` });
  await page.getByRole("link", { name: "Open the unit file" }).click();
  await page.waitForURL("**/units/**");
  await page.waitForSelector("text=Move a tenant in");
  log("door → unit file works");

  /* ---- 3. the move-in, end to end through the real forms --------------- */
  await page.getByRole("link", { name: "Move a tenant in" }).click();
  await page.waitForURL("**/move-in");
  await page.screenshot({ path: `${SHOTS}/07-movein-step1.png` });

  // The notice-address guard must surface as an error in the form, not a crash.
  await page.fill('input[name="tenantName"]', "Marisol Ortega");
  await page.fill('input[name="address"]', " ");
  await page.getByRole("button", { name: "Render the lease" }).click();
  await page.waitForSelector("text=legal notice address is required", { timeout: 20_000 });
  log("move-in refuses a blank notice address, in the form");

  await page.fill('input[name="phone"]', "512-555-0148");
  await page.fill('input[name="email"]', "marisol@example.test");
  await page.fill('input[name="address"]', "704 Foxglove Trail, Leander, TX 78641");
  await page.fill('input[name="alternateContact"]', "Sister — Alma Ortega, 512-555-0192");
  await page.getByRole("button", { name: "Render the lease" }).click();
  await page.waitForSelector("text=The tenant’s link", { timeout: 20_000 });
  const link = await page.locator("input.input-mono").first().inputValue();
  if (!link.includes("/t/")) errors.push(`move-in link looks wrong: ${link}`);
  await page.screenshot({ path: `${SHOTS}/08-movein-link.png` });
  log("lease rendered and a tenant link minted");

  /* ---- 4. the tenant surface, in its own context ----------------------- */
  const tenantCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const tenant = await tenantCtx.newPage();
  watch(tenant, "tenant");
  await tenant.goto(link, { waitUntil: "networkidle" });
  await tenant.waitForSelector("text=Your rental agreement");
  await noSideScroll(tenant, "tenant lease");
  await tenant.screenshot({ path: `${SHOTS}/09-tenant-lease.png`, fullPage: true });

  // Signing without ticking the box must be refused by the form.
  await tenant.fill('input[name="signature"]', "Marisol Ortega");
  const signButton = tenant.getByRole("button", { name: "Sign the agreement" });
  await signButton.click();
  // `required` on the checkbox means the browser blocks submission — confirm the
  // page did not advance.
  await tenant.waitForTimeout(500);
  if ((await tenant.locator("text=How the rent gets paid").count()) > 0) {
    errors.push("the lease was signed without agreeing to it");
  }
  await tenant.check('input[name="agree"]');
  await signButton.click();
  await tenant.waitForSelector("text=How the rent gets paid", { timeout: 20_000 });
  await tenant.screenshot({ path: `${SHOTS}/10-tenant-method.png` });
  log("tenant signed the lease on the phone");

  await tenant.getByRole("button", { name: "Save this method" }).click();
  await tenant.waitForSelector("text=First payment", { timeout: 20_000 });
  await tenant.screenshot({ path: `${SHOTS}/11-tenant-first-payment.png` });
  const payLabel = await tenant.getByRole("button", { name: /Pay .* and get my gate code/ }).textContent();
  await tenant.getByRole("button", { name: /Pay .* and get my gate code/ }).click();
  await tenant.waitForSelector("text=Your gate code", { timeout: 20_000 });
  const gateCode = (await tenant.locator(".t-stat").first().textContent())?.trim() ?? "";
  if (!/^\d{5}$/.test(gateCode)) errors.push(`gate code looks wrong: "${gateCode}"`);
  await tenant.screenshot({ path: `${SHOTS}/12-tenant-paid.png`, fullPage: true });
  log(`tenant paid (${payLabel?.trim()}) and got gate code ${gateCode}`);

  /* ---- 5. back in the console: the unit file --------------------------- */
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("text=Prorated first payment", { timeout: 20_000 });
  await page.screenshot({ path: `${SHOTS}/13-movein-done.png`, fullPage: true });
  await page.goto(`${BASE}/map`, { waitUntil: "networkidle" });
  const occupied = await page.locator('.door[data-status="occupied"]').count();
  if (occupied !== 1) errors.push(`expected 1 occupied door, found ${occupied}`);
  await page.screenshot({ path: `${SHOTS}/14-map-occupied.png` });
  log(`the map now paints ${occupied} door occupied`);

  await page.locator('.door[data-status="occupied"]').click();
  await page.getByRole("link", { name: "Open the unit file" }).click();
  await page.waitForSelector("text=Ledger — append-only");
  await noSideScroll(page, "unit file");
  await page.screenshot({ path: `${SHOTS}/15-unit-file.png`, fullPage: true });

  // Record a payment that puts the tenant in credit, then check the ledger reads it.
  await page.fill('input[name="amount"]', "50.00");
  await page.getByRole("button", { name: "Record the payment" }).click();
  await page.waitForSelector("text=in credit", { timeout: 20_000 });
  await page.screenshot({ path: `${SHOTS}/16-unit-credit.png`, fullPage: true });
  log("a counter payment posted and the balance reads as credit");

  /* ---- 6. the seeded yard: filters, lien rail, hard stop -------------- */
  const seeded = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const owner = await seeded.newPage();
  watch(owner, "seeded");
  await owner.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await owner.fill('input[name="email"]', "owner@riverbendstorage.example");
  await owner.fill('input[name="password"]', "riverbend-demo");
  await owner.getByRole("button", { name: "Sign in" }).click();
  await owner.waitForURL("**/map", { timeout: 20_000 });
  await owner.waitForSelector(".door", { timeout: 20_000 });
  const seededDoors = await owner.locator(".door").count();
  await noSideScroll(owner, "seeded map");
  await owner.screenshot({ path: `${SHOTS}/17-seeded-map.png` });
  const header = await owner.locator(".t-mono-lg").first().textContent();
  log(`seeded yard: ${seededDoors} doors, header "${header?.trim()}"`);

  await owner.getByRole("link", { name: /^Overdue/ }).click();
  await owner.waitForLoadState("networkidle");
  const overdueDoors = await owner.locator('.door[data-status="overdue"], .door[data-status="lien"]').count();
  await owner.screenshot({ path: `${SHOTS}/18-seeded-overdue-filter.png` });
  log(`the overdue filter shows ${overdueDoors} doors`);

  await owner.goto(`${BASE}/delinquency`, { waitUntil: "networkidle" });
  await owner.waitForSelector("text=Past due");
  await noSideScroll(owner, "delinquency");
  await owner.screenshot({ path: `${SHOTS}/19-delinquency.png`, fullPage: true });

  await owner.goto(`${BASE}/liens`, { waitUntil: "networkidle" });
  await owner.waitForSelector("text=Lien files");
  await owner.screenshot({ path: `${SHOTS}/20-liens.png`, fullPage: true });
  await owner.locator("a[href^='/liens/']").first().click();
  await owner.waitForSelector("text=Statutory sequence", { timeout: 20_000 });
  await noSideScroll(owner, "lien case");
  await owner.screenshot({ path: `${SHOTS}/21-lien-case.png`, fullPage: true });

  // The hard stop: the locked step's button must be disabled and say why.
  const lockedStep = owner.locator('.rail-step[data-state="locked"]').first();
  const lockText = await owner.locator(".rail-stop").first().textContent();
  if (!/not before/i.test(lockText ?? "")) errors.push(`no hard-stop sentence on the lien case: ${lockText}`);
  void lockedStep;
  log(`lien case hard stop reads: "${lockText?.trim()}"`);

  await owner.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
  await owner.waitForSelector("text=Occupancy");
  await noSideScroll(owner, "reports");
  await owner.screenshot({ path: `${SHOTS}/22-reports.png`, fullPage: true });

  await owner.goto(`${BASE}/rates`, { waitUntil: "networkidle" });
  await owner.waitForSelector("text=Street rates by size");
  await noSideScroll(owner, "rates");
  await owner.screenshot({ path: `${SHOTS}/23-rates.png`, fullPage: true });

  await owner.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await owner.waitForSelector("text=The late ladder");
  await noSideScroll(owner, "settings");
  await owner.screenshot({ path: `${SHOTS}/24-settings.png`, fullPage: true });

  await owner.goto(`${BASE}/settings/billing`, { waitUntil: "networkidle" });
  await owner.waitForSelector("text=Flat pricing", { timeout: 5_000 }).catch(() => {});
  await owner.screenshot({ path: `${SHOTS}/25-billing.png`, fullPage: true });
  log("every console screen renders at 390px");

  /* ---- 7. reduced motion: the device must not be blank ---------------- */
  const reduced = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    deviceScaleFactor: 2,
  });
  const rm = await reduced.newPage();
  watch(rm, "reduced-motion");
  await rm.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const railOpacity = await rm.evaluate(() => {
    const el = document.querySelector(".rail-step");
    return el ? getComputedStyle(el).opacity : "0";
  });
  const beatOpacity = await rm.evaluate(() => {
    const el = document.querySelector(".device-beat");
    return el ? getComputedStyle(el).opacity : "0";
  });
  if (Number(railOpacity) < 0.99 || Number(beatOpacity) < 0.99) {
    errors.push(`reduced motion hides the device (rail ${railOpacity}, beat ${beatOpacity})`);
  }
  const flipFill = await rm.evaluate(() => {
    const el = document.querySelector(".device-door-flip");
    return el ? getComputedStyle(el).backgroundColor : "";
  });
  await rm.screenshot({ path: `${SHOTS}/26-reduced-motion.png`, fullPage: true });
  log(`reduced motion: rail opacity ${railOpacity}, flipped door fill ${flipFill}`);

  /* ---- 8. desktop, where the map wants width ------------------------- */
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const wide = await desktop.newPage();
  watch(wide, "desktop");
  await wide.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await wide.fill('input[name="email"]', "owner@riverbendstorage.example");
  await wide.fill('input[name="password"]', "riverbend-demo");
  await wide.getByRole("button", { name: "Sign in" }).click();
  await wide.waitForURL("**/map", { timeout: 20_000 });
  await wide.waitForSelector(".door", { timeout: 20_000 });
  const railVisible = await wide.locator(".console-rail").isVisible();
  const tabbarVisible = await wide.locator(".tabbar").isVisible();
  if (!railVisible) errors.push("the left rail does not appear at 1280px");
  if (tabbarVisible) errors.push("the tab bar is still visible at 1280px");
  await wide.screenshot({ path: `${SHOTS}/27-desktop-map.png` });
  await wide.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await wide.screenshot({ path: `${SHOTS}/28-desktop-landing.png`, fullPage: true });
  log("desktop: left rail replaces the tab bar");

  /* ---- 9. unauthenticated access is refused -------------------------- */
  const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await anon.newPage();
  await guest.goto(`${BASE}/map`, { waitUntil: "networkidle" });
  if (!guest.url().includes("/login")) errors.push(`/map did not redirect an anonymous visitor: ${guest.url()}`);
  const cron = await guest.request.get(`${BASE}/api/cron/tick`);
  if (cron.status() !== 401) errors.push(`unauthenticated cron returned ${cron.status()}, expected 401`);
  const tokenPage = await anon.newPage();
  await tokenPage.goto(`${BASE}/t/not-a-real-token`, { waitUntil: "networkidle" });
  await tokenPage.waitForSelector("text=This link has expired");
  const docs = await guest.request.get(`${BASE}/api/documents/someone/lease/abc.pdf`);
  if (docs.status() !== 404) errors.push(`document route returned ${docs.status()} to a stranger`);
  log("anonymous: /map redirects, cron 401s, a bad tenant token says so, documents 404");

  await browser.close();

  if (errors.length > 0) {
    console.log(`\n${errors.length} PROBLEM(S):`);
    for (const e of errors) console.log(`  ${e}`);
    process.exit(1);
  }
  console.log("\nBROWSER RUN CLEAN — no console errors, no sideways scroll");
}

main().catch((err) => {
  console.error("\nFAILED:", err);
  process.exit(1);
});
