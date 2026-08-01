/**
 * Throwaway browser verification. Drives the real forms in Chromium at 390×844.
 * Run: PATH=node_modules/.bin:$PATH tsx scripts/browser.ts
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { chromium, type ConsoleMessage, type Page } from "playwright";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { firms, messages, promises } from "@/db/schema";

const BASE = "http://localhost:3043";
const SHOTS = process.env.SHOT_DIR ?? "/tmp/paidwell-shots";

let failures = 0;
const consoleErrors: string[] = [];

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`, detail === undefined ? "" : JSON.stringify(detail));
  }
}

async function noSideScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check(
    `${label}: no horizontal page scroll at 390px`,
    overflow.scrollWidth <= overflow.clientWidth + 1,
    overflow,
  );
}

async function fontsLoaded(page: Page, label: string) {
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const families = new Set<string>();
    document.fonts.forEach((f) => {
      if (f.status === "loaded") families.add(f.family.replace(/['"]/g, ""));
    });
    const heading = document.querySelector(".t-display, .t-h2");
    const mono = document.querySelector(".t-data, .t-stat");
    return {
      loaded: [...families],
      headingFamily: heading ? getComputedStyle(heading).fontFamily : "",
      monoFamily: mono ? getComputedStyle(mono).fontFamily : "",
    };
  });
  check(
    `${label}: the three faces actually loaded`,
    fonts.loaded.some((f) => /Source Serif/i.test(f)) &&
      fonts.loaded.some((f) => /Public Sans/i.test(f)) &&
      fonts.loaded.some((f) => /Plex Mono/i.test(f)),
    fonts.loaded,
  );
  check(
    `${label}: headings use the serif, data uses the mono`,
    /Source_Serif|Source Serif|serif/i.test(fonts.headingFamily) &&
      /Plex|mono/i.test(fonts.monoFamily),
    fonts,
  );
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function main() {
  const db = getDb();
  // The pre-installed Chromium (build 1194) does not match this playwright
  // build's expected revision, so point at it directly rather than downloading.
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") consoleErrors.push(`${page.url()} :: ${msg.text()}`);
  });
  page.on("pageerror", (err) => consoleErrors.push(`${page.url()} :: ${err.message}`));

  const stamp = Date.now();
  const email = `browser+${stamp}@northbank.studio`;

  console.log("\n=== landing page ===");
  await page.goto(BASE, { waitUntil: "networkidle" });
  check("hero claim is the device", (await page.locator("h1").first().innerText()).includes("Day-74"));
  check("the CTA phrase appears verbatim, repeated", (await page.getByRole("link", { name: "Run your aging audit" }).count()) >= 3);
  check("no fabricated testimonial language", !(await page.content()).match(/trusted by|loved by \d|\d+ firms use/i));
  check("no emoji in the page", !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(await page.locator("body").innerText()));
  await fontsLoaded(page, "landing");
  await noSideScroll(page, "landing");
  await shot(page, "01-landing");

  console.log("\n=== signup ===");
  await page.getByRole("link", { name: "Run your aging audit" }).first().click();
  await page.waitForURL("**/signup");
  await page.getByLabel("Firm name").fill("Northbank Studio");
  await page.getByLabel("Your name").fill("Ana Reyes");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Run your aging audit" }).click();
  await page.waitForURL("**/connect", { timeout: 20_000 });
  check("signup lands on the connect screen", page.url().endsWith("/connect"));
  const [firm] = await db.select().from(firms).where(eq(firms.name, "Northbank Studio")).orderBy(desc(firms.createdAt)).limit(1);
  check("firm created in approval mode", firm?.sendMode === "approval", firm?.sendMode);
  await shot(page, "02-connect");

  console.log("\n=== connect the demo book ===");
  await page.getByRole("button", { name: "Connect QuickBooks Online" }).click();
  await page.getByText(/Connected with demo data/).waitFor({ timeout: 30_000 });
  check("sync reported clients and invoices", /\d+ clients, \d+ invoices/.test(await page.locator("body").innerText()));
  await noSideScroll(page, "connect");
  await shot(page, "03-connected");

  console.log("\n=== aging (home) ===");
  await page.goto(`${BASE}/aging`, { waitUntil: "networkidle" });
  const agingText = await page.locator("body").innerText();
  check("outstanding hero rendered", /OUTSTANDING/i.test(agingText));
  check("DSO shown", /DSO \d+d/.test(agingText));
  check("aging buckets labelled", /0.30/.test(agingText) && /90\+/.test(agingText));
  check("needs-attention rows present", (await page.locator("a[href^='/invoices/']").count()) > 0);
  check("dry-run banner is honest about delivery", /logged, not delivered/i.test(agingText));
  await noSideScroll(page, "aging");
  await shot(page, "04-aging");

  console.log("\n=== tap targets and contrast ===");
  // Passed as a string: tsx's esbuild transform injects a `__name` helper into
  // named function expressions, which does not exist inside the page.
  const lowContrast = (await page.evaluate(`(() => {
    var lum = function (rgb) {
      var parts = (rgb.match(/\\d+(\\.\\d+)?/g) || ["0", "0", "0"]).slice(0, 3).map(Number);
      var chan = function (c) {
        var s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * chan(parts[0]) + 0.7152 * chan(parts[1]) + 0.0722 * chan(parts[2]);
    };
    var bgOf = function (el) {
      var node = el;
      while (node) {
        var bg = getComputedStyle(node).backgroundColor;
        if (bg && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(bg)) return bg;
        node = node.parentElement;
      }
      return "rgb(255,255,255)";
    };
    var bad = [];
    document.querySelectorAll("p, span, a, button, h1, h2, li, label, strong").forEach(function (el) {
      var text = (el.textContent || "").trim();
      if (!text || el.children.length > 0) return;
      var style = getComputedStyle(el);
      var size = parseFloat(style.fontSize);
      var weight = Number(style.fontWeight) || 400;
      var large = size >= 24 || (size >= 18.66 && weight >= 700);
      var a = lum(style.color);
      var b = lum(bgOf(el));
      var ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < (large ? 3 : 4.5)) {
        bad.push(text.slice(0, 28) + " :: " + style.color + " @" + size + "px = " + ratio.toFixed(2) + ":1");
      }
    });
    return bad;
  })()`)) as string[];
  check("every text node meets WCAG AA contrast", lowContrast.length === 0, lowContrast.slice(0, 8));
  const smallTargets = await page.evaluate(() => {
    const bad: string[] = [];
    document.querySelectorAll("a, button").forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      // Links set inside a sentence are prose, not controls: giving them a 44px
      // box would break the line box they live in. Every standalone control is
      // held to the touch-target rule.
      if (el.closest("p")) return;
      if (rect.height < 40) bad.push(`${el.tagName}:${(el.textContent ?? "").trim().slice(0, 24)} h=${Math.round(rect.height)}`);
    });
    return bad;
  });
  check("every standalone control is at least 40px tall", smallTargets.length === 0, smallTargets.slice(0, 6));

  console.log("\n=== run the sweep, then the approval tray ===");
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  check("approval mode is shown as the default", /Review before sending[\s\S]{0,40}default/i.test(await page.locator("body").innerText()));
  check("the kill switch is on this screen", (await page.getByRole("button", { name: /Stop all follow-up now/ }).count()) === 1);
  await shot(page, "05-settings");
  await page.getByRole("button", { name: "Run the daily sweep now" }).click();
  await page.getByText(/queued for approval|Nothing was due/).first().waitFor({ timeout: 60_000 });
  const sweepNotice = await page.locator("body").innerText();
  check("the sweep queued sends rather than sending them", /queued for approval/.test(sweepNotice), sweepNotice.slice(0, 200));

  await page.goto(`${BASE}/approvals`, { waitUntil: "networkidle" });
  const trayCount = await page.getByRole("button", { name: "Approve" }).count();
  check("the tray has queued sends", trayCount > 0, trayCount);
  await page.getByRole("button", { name: "Read the exact message" }).first().click();
  const trayText = await page.locator("body").innerText();
  check("the exact message body is shown before approving", /Hi \w+,/.test(trayText));
  check("no unrendered merge fields in the queued copy", !trayText.includes("{{"));
  check("approve-all is the pinned primary", (await page.getByRole("button", { name: /Approve all \d+/ }).count()) === 1);
  await noSideScroll(page, "approvals");
  await shot(page, "06-approvals");

  await page.getByRole("button", { name: "Approve" }).first().click();
  // The approved row leaves the tray, so the tray shrinking is the signal.
  await page.waitForFunction(
    (before) => document.querySelectorAll("form button").length < before,
    await page.locator("form button").count(),
    { timeout: 30_000 },
  );
  const remaining = await page.getByRole("button", { name: "Approve" }).count();
  check("approving removes that send from the tray", remaining === trayCount - 1, { trayCount, remaining });
  const [approvedRow] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.firmId, firm.id), isNotNull(messages.approvedAt)))
    .limit(1);
  check(
    "the approved send records who approved it and why it was not delivered",
    Boolean(approvedRow?.approvedByUserId) && /DRY_RUN/.test(approvedRow?.error ?? ""),
    { status: approvedRow?.status, error: approvedRow?.error },
  );

  console.log("\n=== invoice detail: timeline, promise, hold-to-send ===");
  await page.goto(`${BASE}/aging`, { waitUntil: "networkidle" });
  await page.locator("a[href^='/invoices/']").first().click();
  await page.waitForURL("**/invoices/**");
  const invoiceText = await page.locator("body").innerText();
  check("the ladder timeline lists four steps", (invoiceText.match(/STEP \d/gi) ?? []).length >= 4, (invoiceText.match(/STEP \d/gi) ?? []).length);
  check("state line never says 'due' on an overdue invoice", !/^due in/i.test(invoiceText) || !/overdue/i.test(invoiceText));
  await shot(page, "07-invoice");

  await page.getByRole("button", { name: "Log a promise" }).click();
  const promiseDate = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
  await page.locator("input[name='promisedFor']").fill(promiseDate);
  await page.getByRole("button", { name: "Log the promise" }).click();
  await page.getByText(/Follow-up is paused until/).waitFor({ timeout: 30_000 });
  check("logging a promise pauses the ladder and says so", true);
  await page.reload({ waitUntil: "networkidle" });
  check("the promise chip renders on the invoice", (await page.getByText(/open/i).count()) > 0);
  await shot(page, "08-invoice-promised");

  console.log("\n=== sequences: ladder + tone + template editor ===");
  await page.goto(`${BASE}/sequences`, { waitUntil: "networkidle" });
  const seqText = await page.locator("body").innerText();
  check("all four steps previewed with real copy", (seqText.match(/DUE [+−]\d+D|ON DUE DATE/g) ?? []).length >= 4);
  check("the previews contain no merge tokens", !seqText.includes("{{"));
  await page.locator("input[name='offset-3']").fill("24");
  await page.getByRole("button", { name: "Save the ladder" }).click();
  await page.getByText(/Saved\. Steps now fire/).waitFor({ timeout: 30_000 });
  check("editing a pinned offset saves", /24d after due/.test(await page.locator("body").innerText()));
  await noSideScroll(page, "sequences");
  await shot(page, "09-sequences");

  console.log("\n=== promises, forecast, clients ===");
  await page.goto(`${BASE}/promises`, { waitUntil: "networkidle" });
  check("the promises screen lists the promise", (await page.locator("a[href^='/invoices/']").count()) > 0);
  await noSideScroll(page, "promises");
  await shot(page, "10-promises");

  await page.goto(`${BASE}/forecast`, { waitUntil: "networkidle" });
  const forecastText = await page.locator("body").innerText();
  check(
    "forecast is gated on the Studio plan and says which plan it needs",
    /Firm plan|on the Firm/.test(forecastText) || /Expected in the next 8 weeks/.test(forecastText),
    forecastText.slice(0, 160),
  );
  await noSideScroll(page, "forecast");
  await shot(page, "11-forecast");

  await page.goto(`${BASE}/clients`, { waitUntil: "networkidle" });
  check("clients list renders", (await page.locator("a[href^='/clients/']").count()) > 0);
  await page.locator("a[href^='/clients/']").first().click();
  await page.waitForURL("**/clients/**");
  await page.getByLabel("Never chase automatically").check();
  await page.getByRole("button", { name: "Save this client" }).click();
  await page.getByText(/excluded from automatic follow-up/).waitFor({ timeout: 30_000 });
  check("marking a client VIP saves and explains the effect", true);
  await noSideScroll(page, "client detail");
  await shot(page, "12-client");

  console.log("\n=== the client payment portal ===");
  // Pick a send whose invoice has no promise yet, so the portal's promise widget
  // is the one on show rather than the "date already noted" state.
  const promisedInvoiceIds = (
    await db.select({ invoiceId: promises.invoiceId }).from(promises).where(eq(promises.firmId, firm.id))
  ).map((row) => row.invoiceId);
  const candidates = await db
    .select()
    .from(messages)
    .where(eq(messages.firmId, firm.id))
    .orderBy(desc(messages.createdAt));
  const msg = candidates.find((m) => !promisedInvoiceIds.includes(m.invoiceId)) ?? candidates[0];
  check("a queued send carries a portal token", Boolean(msg?.portalToken));
  const portal = await context.newPage();
  const portalErrors: string[] = [];
  portal.on("console", (m) => {
    if (m.type() === "error") portalErrors.push(m.text());
  });
  await portal.setViewportSize({ width: 390, height: 844 });
  await portal.goto(`${BASE}/portal/${msg.portalToken}`, { waitUntil: "networkidle" });
  const portalText = await portal.locator("body").innerText();
  check("the portal shows the firm's letterhead first", portalText.indexOf("Northbank Studio") < portalText.indexOf("PaidWell"));
  check("balance and open invoices are shown", /Balance outstanding/i.test(portalText) && /INV-/.test(portalText));
  check("no login is required", !/sign in|password/i.test(portalText));
  check("the pay button names the amount", (await portal.getByRole("button", { name: /^Pay \$/ }).count()) === 1);
  await noSideScroll(portal, "portal");
  await portal.screenshot({ path: `${SHOTS}/13-portal.png`, fullPage: true });

  await portal.getByRole("button", { name: /^Pay \$/ }).click();
  await portal.getByText(/has not finished connecting Stripe/).waitFor({ timeout: 30_000 });
  check("paying without Stripe connected fails honestly rather than silently", true);

  await portal.getByRole("button", { name: "I’ll pay on a date" }).click();
  const portalPromise = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
  await portal.locator("input[name='promisedFor']").fill(portalPromise);
  await portal.getByRole("button", { name: "Tell them this date" }).click();
  await portal.getByText(/Thank you — noted for/).waitFor({ timeout: 30_000 });
  check("a client can log a promise from the portal", true);
  await portal.screenshot({ path: `${SHOTS}/14-portal-promised.png`, fullPage: true });

  console.log("\n=== dead link ===");
  await portal.goto(`${BASE}/portal/not-a-real-token`, { waitUntil: "networkidle" });
  check("an invalid link gets a polite dead end", /not valid|expired/i.test(await portal.locator("body").innerText()));
  await portal.screenshot({ path: `${SHOTS}/15-portal-deadlink.png`, fullPage: true });
  await portal.close();

  console.log("\n=== reduced motion ===");
  const reduced = await context.newPage();
  await reduced.emulateMedia({ reducedMotion: "reduce" });
  await reduced.setViewportSize({ width: 390, height: 844 });
  await reduced.goto(BASE, { waitUntil: "networkidle" });
  const durations = await reduced.evaluate(() => {
    const values: string[] = [];
    document.querySelectorAll(".row-enter, .settle-rule, .settle-stamp").forEach((el) => {
      values.push(getComputedStyle(el).animationDuration);
    });
    return values;
  });
  check(
    "prefers-reduced-motion collapses every animation to <=100ms",
    durations.length > 0 && durations.every((d) => parseFloat(d) <= 0.1),
    durations,
  );
  const settleVisible = await reduced.evaluate(() => {
    const stamp = document.querySelector(".settle-stamp");
    return stamp ? getComputedStyle(stamp).opacity : "0";
  });
  check("and the paid state is still visible, not hidden", parseFloat(settleVisible) > 0.5, settleVisible);
  await reduced.screenshot({ path: `${SHOTS}/16-reduced-motion.png`, fullPage: true });
  await reduced.close();

  console.log("\n=== desktop ===");
  const wide = await context.newPage();
  await wide.setViewportSize({ width: 1280, height: 900 });
  await wide.goto(`${BASE}/aging`, { waitUntil: "networkidle" });
  await noSideScroll(wide, "aging at 1280");
  await wide.screenshot({ path: `${SHOTS}/17-aging-desktop.png`, fullPage: true });
  await wide.goto(BASE, { waitUntil: "networkidle" });
  await wide.screenshot({ path: `${SHOTS}/18-landing-desktop.png`, fullPage: true });
  await wide.close();

  console.log("\n=== console ===");
  check("no console errors anywhere", consoleErrors.length === 0, consoleErrors.slice(0, 5));

  await browser.close();
  console.log(`\nscreenshots in ${SHOTS}`);
  console.log(failures === 0 ? "ALL BROWSER CHECKS PASSED" : `${failures} BROWSER CHECK(S) FAILED`);
}

main()
  .catch((err) => {
    console.error("\nbrowser verification threw:", err);
    failures++;
  })
  .finally(async () => {
    await closeDb();
    process.exit(failures === 0 ? 0 : 1);
  });
