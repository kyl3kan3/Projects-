/**
 * Scratch browser driver — deleted before the build is handed over.
 * Drives the real forms in Chromium at 390x844, the width DESIGN.md specifies.
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://localhost:3057";
const OUT = process.env.SHOT_DIR ?? "/tmp/matpass-shots";
mkdirSync(OUT, { recursive: true });

const errors = [];
const step = (n) => console.log(`\n=== ${n}`);

// The pre-installed Chromium is build 1194; this playwright expects a different
// revision, so point it at the binary that is actually here.
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`[console] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
page.on("requestfailed", (r) => {
  const f = r.failure();
  if (f && !/ERR_ABORTED/.test(f.errorText)) errors.push(`[net] ${r.url()} ${f.errorText}`);
});

/** Wait for a live-region message to actually have text before reading it. */
const msg = async (target, selector) => {
  await target.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return el && el.textContent && el.textContent.trim().length > 0;
    },
    selector,
    { timeout: 25000 },
  );
  return (await target.locator(selector).first().innerText()).trim();
};

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  shot: ${name}`);
};

const stamp = Date.now();
const EMAIL = `owner+${stamp}@northgate.test`;
const PASSWORD = "correct horse battery staple";

// ---------------------------------------------------------------- landing
step("landing page");
await page.goto(BASE, { waitUntil: "networkidle" });
console.log("  title:", await page.title());
const ctaCount = await page.getByRole("link", { name: "Start free — 14 days" }).count();
console.log("  CTA occurrences (want >= 4):", ctaCount);
await page.waitForTimeout(4200);
await shot("01-landing-hero");
const horizontalOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth + 1,
);
console.log("  body scrolls sideways (must be false):", horizontalOverflow);
const fonts = await page.evaluate(async () => {
  await document.fonts.ready;
  return {
    loaded: document.fonts.size,
    archivo: document.fonts.check("700 22px Archivo"),
    mono: document.fonts.check("400 13px 'Fragment Mono'"),
  };
});
console.log("  fonts:", JSON.stringify(fonts));

// ---------------------------------------------------------------- signup
step("signup");
await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
await page.fill("#schoolName", "Northgate Jiu-Jitsu");
await page.fill("#name", "Danielle Reyes");
await page.fill("#email", EMAIL);
await page.fill("#password", PASSWORD);
await page.selectOption("#timezone", "America/Chicago");
await shot("02-signup");
await page.getByRole("button", { name: "Start free — 14 days" }).click();
await page.waitForURL("**/setup", { timeout: 20000 });
console.log("  landed on:", page.url());

step("signup rejects a duplicate email");
const page2 = await context.newPage();
await page2.goto(`${BASE}/signup`);
await page2.fill("#schoolName", "Another Dojo");
await page2.fill("#name", "Someone Else");
await page2.fill("#email", EMAIL);
await page2.fill("#password", PASSWORD);
await page2.getByRole("button", { name: "Start free — 14 days" }).click();
console.log("  ", await msg(page2, '[role="alert"]'));
await page2.close();

// ----------------------------------------------------------------- setup
step("setup: curriculum template");
await page.selectOption("#template", "bjj-adult");
await page.getByRole("button", { name: "Load this curriculum" }).click();
console.log("  ", await msg(page, '[role="status"]'));

step("setup: import refuses a file with no name column");
await page.reload({ waitUntil: "networkidle" });
await page.fill("#csv", "Rank,Stripes\nBlue belt,2");
await page.getByRole("button", { name: "Import", exact: true }).click();
console.log("  ", await msg(page, '[role="alert"]'));

step("setup: import the roster");
await page.reload({ waitUntil: "networkidle" });
const CSV = [
  "Name,Family,Email,Phone,Rank,Stripes,Last promoted,Start date",
  "Marcus Okafor,Okafor,dayo.okafor@example.test,(512) 555-0148,White belt,3,2025-06-01,2023-02-14",
  "Amara Okafor,Okafor,dayo.okafor@example.test,,White belt,1,2026-01-17,2024-09-03",
  "Sofia Reyes,Reyes,c.reyes@example.test,(512) 555-0193,White belt,2,2025-09-20,2024-06-11",
  "Tomas Lindqvist,Lindqvist,t.lindqvist@example.test,,Blue belt,0,2024-04-04,2022-10-02",
  "Priya Raman,Raman,priya.raman@example.test,,White belt,0,2026-02-28,2025-08-19",
  "Ada Nwosu,Nwosu,,,Coral belt,0,not a date,2023-01-05",
].join("\n");
await page.fill("#csv", CSV);
await page.getByRole("button", { name: "Import", exact: true }).click();
console.log("  ", await msg(page, '[role="status"]'));
await shot("03-setup");

step("setup: mint a kiosk link");
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /kiosk link/i }).click();
const kioskMsg = await msg(page, '[role="status"]');
const kioskToken = kioskMsg.match(/\/kiosk\/([A-Za-z0-9._-]+)/)?.[1];
console.log("  kiosk token minted:", Boolean(kioskToken));
writeFileSync(`${OUT}/kiosk-token.txt`, kioskToken ?? "");

// ---------------------------------------------------------------- roster
step("roster");
await page.goto(`${BASE}/roster`, { waitUntil: "networkidle" });
await shot("04-roster");
const rosterText = await page.locator("main").innerText();
console.log("  students listed:", /(\d+) students/.exec(rosterText)?.[1]);
console.log("  has belt bars:", (await page.locator(".belt").count()) > 0);
console.log("  Marcus present:", rosterText.includes("Marcus Okafor"));

step("roster search");
await page.fill("#q", "Okafor");
await page.keyboard.press("Enter");
await page.waitForURL(/q=Okafor/, { timeout: 15000 });
const searched = await page.locator("main").innerText();
console.log(
  "  search found Okafors only:",
  searched.includes("Marcus Okafor") &&
    searched.includes("Amara Okafor") &&
    !searched.includes("Priya Raman"),
);

step("roster search with no results shows a real empty state");
await page.goto(`${BASE}/roster?q=zzzznobody`, { waitUntil: "networkidle" });
console.log(
  "  ",
  (await page.locator("main").innerText()).split("\n").filter(Boolean).slice(3, 7).join(" | "),
);
await shot("05-roster-empty-search");

// --------------------------------------------------------- desk check-in
step("desk check-in");
await page.goto(`${BASE}/roster/checkin?q=Marcus`, { waitUntil: "networkidle" });
await shot("06-desk-checkin");
await page.getByRole("button", { name: /^Check in/ }).first().click();
console.log("  ", await msg(page, '[role="status"]'));

// ------------------------------------------------------------ student page
step("student detail");
await page.goto(`${BASE}/roster?q=Marcus`, { waitUntil: "networkidle" });
await page.locator("a.row-block").first().click();
await page.waitForURL(/\/roster\/[0-9a-f-]{36}/, { timeout: 15000 });
const studentUrl = page.url();
await shot("07-student-detail");
const detail = await page.locator("main").innerText();
console.log("  shows requirement math:", /\d+ \/ \d+ classes/.test(detail));
console.log("  shows kiosk PIN:", /Kiosk PIN/.test(detail));
console.log("  shows sparkline:", (await page.locator(".spark").count()) > 0);

step("mat promotion");
await page.getByRole("button", { name: "Promote on the mat" }).click();
await page.getByRole("button", { name: "Record the promotion" }).click();
await page.waitForURL(/seated=/, { timeout: 20000 });
await page.waitForTimeout(600);
await shot("08-student-promoted");
const promoted = await page.locator("main").innerText();
console.log("  ledger line:", promoted.split("\n").find((l) => /Danielle/.test(l))?.trim());
console.log("  timeline has a row:", /on the mat/.test(promoted));

step("pause stops the clock");
await page.getByRole("button", { name: "Pause" }).first().click();
await page.getByRole("button", { name: "Pause", exact: true }).last().click();
console.log("  ", await msg(page, '[role="status"]'));
await page.goto(studentUrl, { waitUntil: "networkidle" });
console.log(
  "  clock paused shown:",
  (await page.locator("main").innerText()).includes("clock paused"),
);
await page.getByRole("button", { name: "Resume training" }).click();
await page.getByRole("button", { name: "Resume", exact: true }).last().click();
console.log("  resumed:", await msg(page, '[role="status"]'));

// ------------------------------------------------------------- curriculum
step("curriculum");
await page.goto(`${BASE}/curriculum`, { waitUntil: "networkidle" });
await shot("09-curriculum");
const curriculum = await page.locator("main").innerText();
console.log("  shows per-step math:", /classes \/ \d+ days per step/.test(curriculum));

step("curriculum refuses to erase an earned stripe");
await page.getByRole("button", { name: "Adjust requirements" }).first().click();
await page.locator('input[name="stripes"]').first().fill("1");
await page.getByRole("button", { name: "Save" }).first().click();
console.log("  ", await msg(page, '[role="alert"]'));

step("curriculum accepts a real change");
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: "Adjust requirements" }).first().click();
await page.locator('input[name="minClasses"]').first().fill("30");
await page.getByRole("button", { name: "Save" }).first().click();
console.log("  ", await msg(page, '[role="status"]'));

// --------------------------------------------------------------- schedule
step("schedule");
await page.goto(`${BASE}/schedule`, { waitUntil: "networkidle" });
await shot("10-schedule");
await page.getByRole("button", { name: "Add a class" }).click();
await page.fill("#cname", "Adults Gi 6pm");
await page.selectOption("#cday", "2");
await page.fill("#cstart", "18:00");
await page.getByRole("button", { name: "Add class" }).click();
console.log("  ", await msg(page, '[role="status"]'));

step("schedule rejects a bad time");
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: "Add a class" }).click();
await page.fill("#cname", "Nonsense");
await page.fill("#cstart", "6pm");
await page.getByRole("button", { name: "Add class" }).click();
console.log("  ", await msg(page, '[role="alert"]'));

console.log("\n--- console/page/network errors so far:", errors.length);
for (const e of errors) console.log("   ", e);

writeFileSync(`${OUT}/session.json`, JSON.stringify(await context.storageState()));
writeFileSync(`${OUT}/student-url.txt`, studentUrl);
writeFileSync(`${OUT}/email.txt`, EMAIL);
await browser.close();
console.log("\nPHASE 1 DONE");
