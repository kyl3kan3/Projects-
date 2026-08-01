/**
 * Throwaway browser verification. Drives the real forms in Chromium at 390x844,
 * because a Next 15 server action cannot be posted with curl.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

const BASE = "http://localhost:3048";
const OUT = "verify/shots";
mkdirSync(OUT, { recursive: true });

const consoleErrors = [];
let step = 0;
const log = (m) => console.log(m);

async function shot(p, name) {
  step += 1;
  const file = `${OUT}/${String(step).padStart(2, "0")}-${name}.png`;
  await p.screenshot({ path: file, fullPage: true });
}

const browser = await chromium.launch({
  // The pre-installed Chromium is revision 1194; the linked playwright wants a
  // newer one, so point it at the browser that is actually here.
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  extraHTTPHeaders: { "x-forwarded-for": "73.92.1.8" },
});
const page = await context.newPage();
const watch = (p, tag) => {
  p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`[${tag}] ${m.text()}`); });
  p.on("pageerror", (e) => consoleErrors.push(`[${tag} pageerror] ${e.message}`));
};
watch(page, "staff");


/** Server-action redirects are client-side transitions, so poll rather than wait for `load`. */
async function waitForPath(p, fragment, timeout = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (p.url().includes(fragment)) return;
    await p.waitForTimeout(200);
  }
  throw new Error(`FAIL never reached ${fragment} (still at ${p.url()})`);
}

async function expectText(target, text, label) {
  // innerText as well as textContent: several labels are uppercased by CSS, and
  // what the reader sees is the thing worth asserting.
  const raw = await target.textContent("body");
  const rendered = await target.innerText("body");
  if (!raw.includes(text) && !rendered.includes(text)) {
    throw new Error(`FAIL ${label}: expected "${text}"`);
  }
  log(`   ok  ${label}`);
}

async function noOverflow(p, label) {
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 1) throw new Error(`FAIL ${label} scrolls sideways by ${over}px`);
  log(`   ok  ${label} has no horizontal overflow`);
}

/* ------------------------------------------------------------- 1 landing */
log("1. landing");
await page.goto(BASE, { waitUntil: "networkidle" });
await expectText(page, "The clipboard, retired.", "hero headline");
await expectText(page, "Not HIPAA certified", "honest footer");
await page.waitForTimeout(2500);
await expectText(page, "SHA-256 9F3C", "hero stamp landed");
await shot(page, "landing");
await noOverflow(page, "landing");

const families = await page.evaluate(async () => {
  await document.fonts.ready;
  const out = new Set();
  document.fonts.forEach((f) => out.add(f.family.replace(/"/g, "")));
  return [...out];
});
log(`   fonts loaded: ${families.join(", ")}`);
if (!families.some((f) => /Public Sans/i.test(f))) throw new Error("FAIL Public Sans not loaded");
if (!families.some((f) => /IBM Plex Mono/i.test(f))) throw new Error("FAIL IBM Plex Mono not loaded");

/* -------------------------------------------------------------- 2 signup */
log("2. signup + agreement");
const email = `owner+${Date.now()}@cedarhill.example`;
await page.goto(`${BASE}/signup`);
await page.fill('input[name="practiceName"]', "Cedar Hill Psychology");
await page.fill('input[name="name"]', "Rosa Iyer");
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "short");
await page.click('button[type="submit"]');
await page.waitForTimeout(1200);
await expectText(page, "at least 10 characters", "short password refused");
await shot(page, "signup-error");
await page.fill('input[name="password"]', "correct-horse-battery");
await page.click('button[type="submit"]');
await waitForPath(page, "/settings/agreement");
await expectText(page, "draft template", "agreement labelled a draft");
await expectText(page, "no Business Associate Agreement is in force", "no false BAA claim");
await shot(page, "agreement");
await page.fill('input[name="signerName"]', "Rosa");
await page.click('button[type="submit"]');
await page.waitForTimeout(1200);
await expectText(page, "first and last", "half a name refused");
await page.fill('input[name="signerName"]', "Rosa Iyer");
await page.click('button[type="submit"]');
await waitForPath(page, "/intakes");
await expectText(page, "No packets sent yet", "empty board");
await shot(page, "intakes-empty");

/* --------------------------------------------------- 3 template + publish */
log("3. copy template, publish");
await page.goto(`${BASE}/forms`);
await expectText(page, "Template gallery", "gallery");
await shot(page, "forms-gallery");
await page.click('form:has(input[value="behavioral_health_v1"]) button[type="submit"]');
await waitForPath(page, "/forms/");
await expectText(page, "NOT PUBLISHED", "draft state");
await shot(page, "builder");
await page.click('button:has-text("Publish version 1")');
await page.waitForTimeout(2000);
await page.reload({ waitUntil: "networkidle" });
await expectText(page, "INTACT", "version integrity");
await shot(page, "builder-published");

/* ------------------------------------------------- 4 validator blocks it */
log("4. validator");
await page.locator('form:has(input[value="consent_treatment"]) button[aria-label="Move down"]').first().click();
await page.waitForTimeout(1600);
await expectText(page, "Publishing is blocked", "publish blocked");
await expectText(page, "comes before the consent text it signs", "specific reason");
const disabled = await page.locator('button:has-text("Publish version 2")').isDisabled();
log(`   publish disabled: ${disabled}`);
if (!disabled) throw new Error("FAIL publish still clickable with a broken packet");
await shot(page, "builder-blocked");
await page.locator('form:has(input[value="consent_treatment"]) button[aria-label="Move up"]').first().click();
await page.waitForTimeout(1600);

/* ---------------------------------------------------------- 5 send intake */
log("5. send an intake");
await page.goto(`${BASE}/intakes/new`);
await page.fill('input[name="firstName"]', "Dana");
await page.fill('input[name="lastName"]', "Okonkwo");
await page.fill('input[name="dob"]', "1988-04-12");
await page.fill('input[name="email"]', "dana.okonkwo@example.com");
await page.fill('input[name="phone"]', "+1 303 555 0117");
await shot(page, "send-sheet");
await page.click('button[type="submit"]');
await waitForPath(page, "/intakes?sent=1");
await expectText(page, "Packet sent", "confirmation");
await expectText(page, "Dana Okonkwo", "patient on the board");
await shot(page, "intakes-board");

/* --------------------------------------------------------- 6 patient link */
log("6. mint the patient link");
const token = execSync(`PATH=node_modules/.bin:$PATH NODE_PATH=./node_modules tsx verify/mint-token.ts`).toString().trim().split("\n").pop();
log(`   token ${token.slice(0, 6)}…`);

/* ---------------------------------------------------------- 7 patient flow */
log("7. patient flow at 390px");
let pt = await context.newPage();
watch(pt, "patient");
await pt.goto(`${BASE}/intake/${token}`, { waitUntil: "networkidle" });
await expectText(pt, "SECTION 1 OF", "progress counter");
await expectText(pt, "Cedar Hill Psychology", "wordmark");
await expectText(pt, "Your answers save each time you continue", "resume note");
await shot(pt, "patient-section1");
await noOverflow(pt, "patient packet");

await pt.evaluate(() => document.querySelectorAll("[required]").forEach((el) => el.removeAttribute("required")));
await pt.click('button[type="submit"]');
await pt.waitForTimeout(1600);
await expectText(pt, "still need an answer", "server-side validation");
await shot(pt, "patient-validation");

const fill = async (p, name, value) => {
  const el = p.locator(`[name="${name}"]`);
  if ((await el.count()) === 0) return;
  await el.first().fill(value);
};
await fill(pt, "demographics.first_name", "Dana");
await fill(pt, "demographics.last_name", "Okonkwo");
await fill(pt, "demographics.dob", "1988-04-12");
await fill(pt, "demographics.phone", "+1 303 555 0117");
await fill(pt, "demographics.email", "dana.okonkwo@example.com");
await fill(pt, "demographics.emergency_name", "Ruth Okonkwo");
await fill(pt, "demographics.emergency_phone", "+1 303 555 0164");
await pt.click('button[type="submit"]');
await pt.waitForTimeout(2000);
log(`   after section 1: ${pt.url()}`);

/* resume after a browser kill */
await pt.close();
pt = await context.newPage();
watch(pt, "resumed");
await pt.goto(`${BASE}/intake/${token}`, { waitUntil: "networkidle" });
await expectText(pt, "SECTION 2 OF", "resumed at the next section after a browser kill");
await shot(pt, "patient-resumed");

let sigRefusalTested = false;
for (let guard = 0; guard < 14; guard += 1) {
  const body = await pt.textContent("body");
  if (body.includes("You're all set")) break;

  const groups = await pt.evaluate(() => {
    const n = new Set();
    document.querySelectorAll('input[type="radio"]').forEach((el) => n.add(el.name));
    return [...n];
  });
  for (const name of groups) {
    const radios = pt.locator(`input[type="radio"][name="${name}"]`);
    const count = await radios.count();
    if (count) await radios.nth(Math.min(1, count - 1)).check({ force: true });
  }

  const textNames = await pt.evaluate(() =>
    [...document.querySelectorAll("input[type=text],input[type=email],input[type=tel],input[type=date],textarea")]
      .map((el) => el.name).filter((n) => n && n.includes(".")));
  for (const name of textNames) {
    const el = pt.locator(`[name="${name}"]`).first();
    if (!(await el.count())) continue;
    const type = await el.getAttribute("type");
    if (type === "date") await el.fill("1988-04-12");
    else if (type === "email") await el.fill("dana.okonkwo@example.com");
    else if (type === "tel") await el.fill("+1 303 555 0117");
    else await el.fill("Panic attacks since March, worse before work");
  }

  const hasSig = (await pt.locator('input[name="signedName"]').count()) > 0;
  if (hasSig) {
    await shot(pt, `patient-consent-${guard}`);
    if (!sigRefusalTested) {
      sigRefusalTested = true;
      await pt.evaluate(() => document.querySelectorAll("[required]").forEach((el) => el.removeAttribute("required")));
      await pt.locator('input[name="signedName"]').fill("Dana Okonkwo");
      await pt.click('button[type="submit"]');
      await pt.waitForTimeout(1800);
      const after = await pt.textContent("body");
      if (!after.includes("Tick the box")) throw new Error("FAIL signing allowed without the disclosure");
      log("   ok  signing refused without the consent-to-sign disclosure");
      await shot(pt, "patient-sig-refused");
    }
    await pt.locator('input[name="signedName"]').fill("Dana Okonkwo");
    await pt.locator('input[name="disclosureAccepted"]').check({ force: true });
  }

  await pt.click('button[type="submit"]');
  await pt.waitForTimeout(1800);
}

await expectText(pt, "You're all set", "completion screen");
await expectText(pt, "SIGNED ·", "evidence stamp");
await expectText(pt, "SHA-256", "hash on the stamp");
await shot(pt, "patient-done");

/* ------------------------------------------------------ 8 reduced motion */
log("8. reduced motion");
const rm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const rp = await rm.newPage();
await rp.goto(`${BASE}/intake/${token}`, { waitUntil: "networkidle" });
const opacity = await rp.evaluate(() => {
  const el = document.querySelector(".stamp");
  return el ? getComputedStyle(el).opacity : "missing";
});
log(`   stamp opacity: ${opacity}`);
if (opacity !== "1") throw new Error(`FAIL stamp invisible under reduced motion (${opacity})`);
step += 1;
await rp.screenshot({ path: `${OUT}/${String(step).padStart(2, "0")}-reduced-motion.png`, fullPage: true });
await rm.close();

/* --------------------------------------------------- 9 practice review */
log("9. practice review + exports");
await page.goto(`${BASE}/intakes`, { waitUntil: "networkidle" });
await expectText(page, "100% COMPLETION", "completion stat");
await expectText(page, "PHQ-9", "screener score on the board");
const signedDot = await page.locator('span[aria-label="signed"]').count();
log(`   signed status dots on the board: ${signedDot}`);
if (signedDot < 1) throw new Error("FAIL no signed status dot on the board");
await shot(page, "intakes-signed");
await page.click('a:has-text("Dana Okonkwo")');
await waitForPath(page, "/intakes/");
await expectText(page, "Panic attacks since March", "answers decrypted for staff");
await expectText(page, "Signature evidence", "evidence summary");
await expectText(page, "Who touched this packet", "packet trail");
await expectText(page, "VIEWED", "this read is logged");
await shot(page, "intake-detail");
const intakeId = page.url().split("/").pop();

const pdf = await context.request.get(`${BASE}/api/exports/packet/${intakeId}`);
const pdfBody = await pdf.body();
log(`   pdf ${pdf.status()} ${pdfBody.length} bytes`);
if (pdf.status() !== 200 || pdfBody.subarray(0, 5).toString() !== "%PDF-") throw new Error("FAIL pdf export");

const csv = await context.request.get(`${BASE}/api/exports/intakes.csv`);
log(`   intakes csv ${csv.status()} (403 expected on Solo)`);
if (csv.status() !== 403) throw new Error("FAIL CSV not gated to Group+");

const acsv = await context.request.get(`${BASE}/api/exports/audit.csv`);
const atext = await acsv.text();
log(`   audit csv ${acsv.status()} ${atext.length} bytes`);
if (!atext.startsWith("timestamp_utc,action")) throw new Error("FAIL audit csv header");
if (atext.includes("Okonkwo")) throw new Error("FAIL audit csv leaked a patient name");
log("   ok  audit csv carries no patient name");

await page.goto(`${BASE}/audit`, { waitUntil: "networkidle" });
await expectText(page, "EXPORTED", "the export is in the ledger");
await expectText(page, "Append-only", "append-only stated");
await shot(page, "audit");
await page.click('a.chip:has-text("Exports")');
await page.waitForTimeout(1000);
await shot(page, "audit-filtered");

/* ------------------------------------------------------- 10 patient record */
log("10. patient record");
await page.goto(`${BASE}/patients`, { waitUntil: "networkidle" });
await expectText(page, "Dana Okonkwo", "directory");
await shot(page, "patients");
await page.click('a[href^="/patients/"]');
await page.waitForTimeout(1500);
await expectText(page, "Who has looked at this record", "disclosure list");
await shot(page, "patient-record");

/* --------------------------------------------------------- 11 cross-tenant */
log("11. cross-practice attack");
const foreign = execSync(`PATH=node_modules/.bin:$PATH NODE_PATH=./node_modules tsx verify/foreign-id.ts`).toString().trim().split("\n").pop();
const attack = await page.goto(`${BASE}/intakes/${foreign}`);
log(`   another practice's intake page: ${attack.status()}`);
if (attack.status() !== 404) throw new Error("FAIL cross-practice packet did not 404");
const attackPdf = await context.request.get(`${BASE}/api/exports/packet/${foreign}`);
log(`   another practice's PDF: ${attackPdf.status()}`);
if (attackPdf.status() !== 404) throw new Error("FAIL cross-practice PDF not refused");
await shot(page, "cross-tenant-404");

/* -------------------------------------------------------------- 12 cron */
log("12. cron route");
const open = await context.request.get(`${BASE}/api/cron/tick`);
log(`   no secret: ${open.status()}`);
if (open.status() !== 401) throw new Error("FAIL cron route is open");
const auth = await context.request.get(`${BASE}/api/cron/tick`, { headers: { authorization: "Bearer local-dev-cron-secret" } });
log(`   with secret: ${auth.status()} ${await auth.text()}`);
if (auth.status() !== 200) throw new Error("FAIL cron route failed with the secret");

/* --------------------------------------------------------- 13 dead link */
log("13. dead link");
const dead = await context.newPage();
await dead.goto(`${BASE}/intake/not-a-real-token-at-all`, { waitUntil: "networkidle" });
await expectText(dead, "no longer active", "dead link copy");
const db = await dead.textContent("body");
if (db.includes("Cedar Hill")) throw new Error("FAIL dead link named the practice");
log("   ok  dead link does not name the practice");
await shot(dead, "dead-link");

/* ---------------------------------------------------------- 14 desktop */
log("14. desktop");
const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const dp = await desk.newPage();
await dp.goto(`${BASE}/login`);
await dp.fill('input[name="email"]', email);
await dp.fill('input[name="password"]', "correct-horse-battery");
await dp.click('button[type="submit"]');
await waitForPath(dp, "/intakes");
step += 1;
await dp.screenshot({ path: `${OUT}/${String(step).padStart(2, "0")}-desktop.png`, fullPage: true });
const rail = await dp.locator('nav[aria-label="Main"]').first().isVisible();
log(`   left rail visible: ${rail}`);
await desk.close();

log("");
if (consoleErrors.length) {
  console.log(`CONSOLE ERRORS (${consoleErrors.length}):`);
  for (const e of [...new Set(consoleErrors)].slice(0, 20)) console.log(`  ${e}`);
} else console.log("No console errors.");
await browser.close();
console.log("\nALL BROWSER CHECKS PASSED");
