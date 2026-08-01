/**
 * Throwaway browser drive-through at 390x844.
 *
 * Server actions cannot be exercised from curl (Next 15 encrypts the action payload),
 * so this is the only way to check the client round trip: the real forms, the real
 * redirects, layout at the spec width, and console errors. Delete before shipping.
 */
import { chromium, type ConsoleMessage, type Page } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3047";
const EMAIL = `browser-${Date.now()}@shelfsense.test`;
const PASSWORD = "correct horse battery staple";
const SHOTS = process.env.SHOT_DIR ?? "/tmp/shelfsense-shots";

/**
 * The pre-installed Chromium. Its build number does not match the one this Playwright
 * would download, and downloading is not an option here, so the binary is named
 * explicitly.
 */
const CHROMIUM =
  process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const problems: string[] = [];
let step = 0;

async function shot(page: Page, name: string) {
  step += 1;
  const file = `${SHOTS}/${String(step).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  shot ${file}`);
}

function ok(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) problems.push(label);
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
  const badResponses: string[] = [];
  page.on("response", (res) => {
    if (res.status() >= 400) badResponses.push(`${res.status()} ${res.url()}`);
  });

  console.log("=== sign up");
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await shot(page, "signup");
  await page.fill('input[name="name"]', "Ruth Oyelaran");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/connect`, { timeout: 30_000 });
  ok("signup lands on the connect screen", page.url().endsWith("/connect"));
  await shot(page, "connect");

  const installDisabled = await page.isDisabled('button:has-text("Connect Shopify")');
  ok("Shopify install is disabled with no credentials, and says so", installDisabled);

  console.log("=== load the demo store (real backfill + forecast)");
  const started = Date.now();
  await page.click('button:has-text("Load the demo store instead")');
  await page.waitForURL(/\/reorder/, { timeout: 180_000 });
  console.log(`  took ${Math.round((Date.now() - started) / 1000)}s`);
  await page.waitForLoadState("networkidle");
  await shot(page, "reorder");

  const risk = await page.locator(".t-display").first().innerText();
  ok("the at-risk headline is a real dollar figure", /^\$[\d,]+$/.test(risk.trim()), risk.trim());

  const bodyText = await page.locator("main").innerText();
  ok("the ORDER NOW group is on screen", /ORDER NOW/i.test(bodyText));
  ok("a real SKU code is rendered", /OAK-[A-Z]+-\d+/.test(bodyText));
  ok("no lorem or placeholder copy", !/lorem|ipsum|placeholder/i.test(bodyText));
  ok("no emoji in the product UI", !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(bodyText));

  const draftCta = page.locator('a:has-text("Draft POs")');
  ok("the pinned Draft POs button is present", (await draftCta.count()) > 0);

  // Horizontal overflow at the spec width is a build failure.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  ok("the page does not scroll sideways at 390px", overflow <= 0, `overflow ${overflow}px`);

  // Fonts must actually load.
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family);
    const body = getComputedStyle(document.body).fontFamily;
    const mono = document.querySelector(".t-data")
      ? getComputedStyle(document.querySelector(".t-data")!).fontFamily
      : "";
    return { loaded: [...new Set(loaded)], body, mono };
  });
  console.log(`  fonts loaded: ${fonts.loaded.join(", ") || "(none)"}`);
  ok("Archivo is actually loaded, not a system fallback", fonts.loaded.some((f) => /Archivo/i.test(f)), fonts.body);
  ok("Spline Sans Mono is actually loaded", fonts.loaded.some((f) => /Spline/i.test(f)), fonts.mono);

  // Touch targets in the thumb zone.
  const cta = await draftCta.first().boundingBox();
  ok("the primary CTA is at least 44px tall", (cta?.height ?? 0) >= 44, `${cta?.height}px`);
  ok("the primary CTA is in the bottom third", (cta?.y ?? 0) > 844 * 0.6, `y=${cta?.y}`);

  console.log("=== chip filter");
  await page.locator('a.chip:has-text("Order now")').first().click();
  // Client-side navigation: wait for the URL, not for the network to go idle — it is
  // already idle when the click happens.
  await page.waitForURL(/status=order_now/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  const filtered = await page.locator("main").innerText();
  const groupHeadings = [...filtered.matchAll(/^(ORDER NOW|ORDER THIS WEEK|HEALTHY|OVERSTOCKED|DEAD STOCK) · \d+$/gim)].map((m) => m[1].toUpperCase());
  ok(
    "filtering to Order now shows only that group",
    groupHeadings.length === 1 && groupHeadings[0] === "ORDER NOW",
    groupHeadings.join(",") || "(no group headings found)",
  );
  await shot(page, "reorder-filtered");

  console.log("=== SKU detail: the runway and the math");
  await page.goto(`${BASE}/reorder`, { waitUntil: "networkidle" });
  await page.locator('a[href^="/reorder/"]').first().click();
  await page.waitForURL(/\/reorder\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await shot(page, "sku-detail");

  const detail = await page.locator("main").innerText();
  ok(
    "the math panel names every input",
    /VELOCITY · 7D/i.test(detail) &&
      /VELOCITY · 30D/i.test(detail) &&
      /VELOCITY · 90D/i.test(detail) &&
      /BLENDED VELOCITY/i.test(detail) &&
      /REORDER POINT/i.test(detail) &&
      /LEAD TIME/i.test(detail) &&
      /SAFETY/i.test(detail) &&
      /CASH TIED UP/i.test(detail),
    detail.slice(0, 80).replace(/\n/g, " | "),
  );
  ok("the math panel shows the divisor, not just the answer", /in-stock days/.test(detail));
  ok("the math panel says the numbers come from the run, not this render", /read back from that forecast/.test(detail));
  ok("the runway rendered", (await page.locator(".runway").count()) > 0);
  const notch = await page.locator(".runway-notch").count();
  ok("the reorder-point notch rendered", notch > 0);
  const detailOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  ok("SKU detail does not scroll sideways", detailOverflow <= 0, `overflow ${detailOverflow}px`);

  console.log("=== reduced motion");
  const reduced = await context.newPage();
  await reduced.emulateMedia({ reducedMotion: "reduce" });
  await reduced.setViewportSize({ width: 390, height: 844 });
  await reduced.goto(page.url(), { waitUntil: "networkidle" });
  const anim = await reduced.evaluate(() => {
    const fill = document.querySelector(".runway-fill");
    const sweep = document.querySelector(".sweep");
    return {
      fillTransition: fill ? getComputedStyle(fill).transitionDuration : null,
      sweepAnimation: sweep ? getComputedStyle(sweep).animationName : null,
      fillWidth: fill ? (fill as HTMLElement).style.width : null,
    };
  });
  console.log(`  reduced: ${JSON.stringify(anim)}`);
  const seconds = Number(String(anim.fillTransition ?? "").replace(/s$/, ""));
  ok(
    "prefers-reduced-motion collapses the runway transition to <=100ms",
    Number.isFinite(seconds) && seconds <= 0.1,
    String(anim.fillTransition),
  );
  await reduced.screenshot({ path: `${SHOTS}/reduced-motion.png`, fullPage: true });
  await reduced.close();

  console.log("=== PO drafts: build, edit a quantity, export, send");
  await page.goto(`${BASE}/po`, { waitUntil: "networkidle" });
  await shot(page, "po-empty");
  await page.click('button:has-text("Draft POs")');
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await shot(page, "po-drafts");
  const poText = await page.locator("main").innerText();
  ok("supplier-grouped drafts appeared", /D LEAD/.test(poText), poText.slice(0, 120).replace(/\n/g, " | "));
  ok("a lead time is shown on the card label", /18D LEAD|34D LEAD|7D LEAD/.test(poText));

  const qty = page.locator('input[name="finalQty"]').first();
  if ((await qty.count()) > 0) {
    const box = await qty.boundingBox();
    ok("the quantity field is at least 44px tall", (box?.height ?? 0) >= 44, `${box?.height}px`);
    await qty.fill("7");
    await page.locator("main").click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(2000);
    const afterEdit = await page.locator("main").innerText();
    ok("an invalid quantity is reported inline with the nearest acceptable one", /Nearest acceptable quantity/.test(afterEdit));
    await shot(page, "po-invalid-qty");
  } else {
    ok("a quantity field exists to edit", false);
  }

  // CSV download through the real route.
  const csvLink = page.locator('a:has-text("Export CSV")').first();
  if ((await csvLink.count()) > 0) {
    const download = await Promise.all([page.waitForEvent("download"), csvLink.click()]);
    const path = await download[0].path();
    const text = path ? await (await import("node:fs/promises")).readFile(path, "utf8") : "";
    ok("the CSV downloads with a BOM and a totals row", text.charCodeAt(0) === 0xfeff && /Total,,/.test(text));
    console.log(`  csv: ${download[0].suggestedFilename()} (${text.length} bytes)`);
  } else {
    ok("an Export CSV link exists", false);
  }

  const sendButton = page.locator('button:has-text("Send to")').first();
  if ((await sendButton.count()) > 0) {
    await sendButton.click();
    await page.waitForTimeout(2500);
    const afterSend = await page.locator("main").innerText();
    ok(
      "sending reports what happened, including that email is off here",
      /DRY_RUN|Sent to|SENT /i.test(afterSend),
      afterSend.slice(0, 200).replace(/\n/g, " | "),
    );
    await shot(page, "po-sent");
  }

  console.log("=== dead stock");
  await page.goto(`${BASE}/dead-stock`, { waitUntil: "networkidle" });
  await shot(page, "dead-stock");
  const deadText = await page.locator("main").innerText();
  ok("the dead-stock total is a dollar figure", /\$[\d,]+/.test(deadText));
  ok("a cost estimate is labelled as one", /COST ESTIMATED/.test(deadText));
  ok("each row suggests an action", /Discount|Bundle|Write-off/.test(deadText));

  console.log("=== suppliers and the CSV import");
  await page.goto(`${BASE}/suppliers`, { waitUntil: "networkidle" });
  await shot(page, "suppliers");
  const supText = await page.locator("main").innerText();
  ok("the three demo suppliers are listed with lead times", /Northbay Textiles/.test(supText) && /34D LEAD/.test(supText));

  await page.fill(
    'textarea[name="csv"]',
    "SKU,Supplier,Lead time days,Unit cost\nOAK-APRN-05C,Northbay Textiles,40,24.50\nOAK-NOPE-99,Ghost,7,1.00",
  );
  await page.click('button:has-text("Import")');
  await page.waitForTimeout(2500);
  const importText = await page.locator("main").innerText();
  ok("the import reports how many rows applied", /rows applied/.test(importText), importText.match(/\d+ of \d+ rows applied[^\n]*/)?.[0] ?? "");
  ok("a SKU that is not in the catalogue is named, not silently skipped", /OAK-NOPE-99/.test(importText));
  await shot(page, "suppliers-import");

  console.log("=== settings and digests");
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await shot(page, "settings");
  await page.click('button:has-text("Send the weekly summary now")');
  await page.waitForTimeout(2500);
  const settingsText = await page.locator("main").innerText();
  ok("sending a digest reports the period it covers", /period 20\d\d-W\d\d/.test(settingsText), settingsText.match(/period [^\s)]+/)?.[0] ?? "");
  await shot(page, "settings-digest");

  await page.goto(`${BASE}/settings/billing`, { waitUntil: "networkidle" });
  await shot(page, "billing");
  const billingText = await page.locator("main").innerText();
  ok("all three plans are priced", /Counter/.test(billingText) && /\$99\/MO/.test(billingText) && /\$199\/MO/.test(billingText));
  ok("the demo store cannot be billed, and says why", /demo store/i.test(billingText));

  console.log("=== auth guard");
  const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const anonPage = await anon.newPage();
  await anonPage.goto(`${BASE}/reorder`, { waitUntil: "networkidle" });
  ok("an anonymous request to /reorder redirects to /login", anonPage.url().includes("/login"), anonPage.url());
  const csvResponse = await anonPage.goto(`${BASE}/api/po/11111111-1111-4111-8111-111111111111/csv`);
  ok("an anonymous CSV request does not serve a PO", (csvResponse?.status() ?? 0) !== 200 || anonPage.url().includes("/login"));
  await anon.close();

  console.log("=== desktop enhancement");
  const wide = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const widePage = await wide.newPage();
  await widePage.context().addCookies(await context.cookies());
  await widePage.goto(`${BASE}/reorder`, { waitUntil: "networkidle" });
  const railVisible = await widePage.locator('nav[aria-label="Main"] a:has-text("Reorder")').first().isVisible();
  ok("the left rail replaces the tab bar at 1280px", railVisible);
  await widePage.screenshot({ path: `${SHOTS}/desktop-reorder.png`, fullPage: true });
  await wide.close();

  console.log("=== console");
  const realErrors = consoleErrors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  const realBad = badResponses.filter((r) => !/favicon/i.test(r));
  ok(
    "no console errors",
    realErrors.length === 0,
    `${realErrors.slice(0, 4).join(" | ")}${realBad.length ? ` [responses: ${realBad.slice(0, 4).join(", ")}]` : ""}`,
  );
  ok("no failing requests", realBad.length === 0, realBad.slice(0, 4).join(", "));

  await browser.close();
  console.log(`\n${problems.length === 0 ? "ALL BROWSER CHECKS PASSED" : `${problems.length} PROBLEM(S): ${problems.join("; ")}`}`);
  process.exit(problems.length === 0 ? 0 : 1);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
