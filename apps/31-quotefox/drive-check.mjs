/**
 * Drive the real forms in Chromium at 390x844.
 * Signup → onboarding → job → capture (fake mic) → estimate → send → homeowner accept.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3031";
const OUT = "/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/qf31/shots";
mkdirSync(OUT, { recursive: true });

const stamp = Date.now().toString(36);
const EMAIL = `ray-${stamp}@deleonmech.test`;
const PASSWORD = "driveway-quotes-2026";

const consoleErrors = [];
const pageErrors = [];

function shot(page, name) {
  return page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-capture",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  permissions: ["microphone"],
});

// This container has no audio input device, so getUserMedia("audio") fails with
// NotFoundError no matter which fake-device flag is passed. Patch it to return a
// real MediaStream synthesised from an oscillator: MediaRecorder then produces
// genuine webm chunks, so the chunking, upload, retry and confirm paths are all
// exercised for real — only the sound itself is synthetic.
await context.addInitScript(() => {
  const getUserMedia = async () => {
    const audio = new AudioContext();
    const destination = audio.createMediaStreamDestination();
    const oscillator = audio.createOscillator();
    oscillator.frequency.value = 220;
    oscillator.connect(destination);
    oscillator.start();
    return destination.stream;
  };
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia, enumerateDevices: async () => [] },
    configurable: true,
  });
});
const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(`[${page.url()}] ${msg.text()}`);
});
page.on("pageerror", (err) => pageErrors.push(`[${page.url()}] ${err.message}`));

const log = (...a) => console.log(...a);
let failures = 0;
function check(label, ok, detail) {
  if (ok) log(`  ok   ${label}`);
  else {
    failures++;
    log(`  FAIL ${label}`, detail ?? "");
  }
}

/* ---------------------------------------------------------------- signup --- */
log("== signup ==");
await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
await shot(page, "01-signup");
await page.fill('input[name="companyName"]', "Deleon Mechanical");
await page.fill('input[name="personName"]', "Ray Deleon");
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL("**/onboarding", { timeout: 30000 });
check("signup lands on onboarding", page.url().endsWith("/onboarding"));

/* ------------------------------------------------------------ onboarding --- */
log("== onboarding ==");
await shot(page, "02-onboarding");
await page.click('button.chip:has-text("HVAC")');
await page.fill('input[name="licenseNumber"]', "TACLA00281C");
await page.fill('input[name="phone"]', "(512) 555-0143");
await page.fill('input[name="address"]', "1804 Airport Blvd, Austin, TX 78702");
await page.fill('input[name="taxRatePct"]', "8.25");
await page.click('button[type="submit"]');
await page.waitForURL("**/jobs", { timeout: 30000 });
check("onboarding lands on jobs", page.url().includes("/jobs"));
await shot(page, "03-jobs-empty");
check(
  "empty state is real copy",
  (await page.textContent("main")).includes("Start a walkthrough at the next job"),
);

/* -------------------------------------------------------------- new job --- */
log("== new job ==");
await page.click('a:has-text("New walkthrough")');
await page.waitForURL("**/jobs/new");
await shot(page, "04-new-job");
await page.fill('input[name="customerName"]', "Marisol Vance");
await page.fill('input[name="address"]', "4412 Ramsey Ave, Austin, TX 78756");
await page.fill('input[name="title"]', "Condenser changeout");
await page.fill('input[name="customerEmail"]', `marisol-${stamp}@example.test`);
await page.click('button[type="submit"]');
await page.waitForURL("**/capture**", { timeout: 30000 });
check("capture screen opens", page.url().includes("/capture"));

/* -------------------------------------------------------------- capture --- */
log("== capture ==");
await shot(page, "05-capture-idle");

// Make the first upload PUT fail, to prove the per-asset retry actually retries
// rather than silently losing a chunk.
let killedOnce = false;
await page.route("**/api/uploads/blob**", async (route) => {
  if (!killedOnce && route.request().method() === "PUT") {
    killedOnce = true;
    await route.abort("connectionfailed");
    return;
  }
  await route.continue();
});
const capsule = page.locator("button.record-capsule");
await capsule.dispatchEvent("pointerdown");
await capsule.dispatchEvent("pointerup");
await page.waitForTimeout(2500);
check("tap starts recording", (await capsule.getAttribute("data-recording")) === "true");
await shot(page, "06-capture-recording");

await page.setInputFiles('input[type="file"]', {
  name: "condenser-pad.jpg",
  mimeType: "image/jpeg",
  buffer: Buffer.from("ffd8ffe000104a46494600010100000100010000ffdb004300ff", "hex"),
});
await page.waitForTimeout(2000);
const captionField = page.locator('input[aria-label^="Caption for photo"]').first();
check("photo thumbnail with caption field", await captionField.isVisible());
await captionField.fill("Rusted condenser pad sitting in standing water");
await captionField.blur();

await page.waitForTimeout(1500);
await page.fill(
  "textarea",
  "Static pressure is high on the return, add a filter-back return grille.",
);
await shot(page, "07-capture-with-photo");

await capsule.dispatchEvent("pointerdown");
await capsule.dispatchEvent("pointerup");
await page.waitForTimeout(700);
check("tap pauses", (await capsule.getAttribute("data-paused")) === "true");

check("audio chunks landed after the forced failure", /[1-9]\d*\/[1-9]/.test(await page.textContent("main")), await page.textContent("main"));

// Hold the capsule for 600ms: that is the gesture that ends a walkthrough.
await capsule.dispatchEvent("pointerdown");
await page.waitForTimeout(750);
await capsule.dispatchEvent("pointerup");
await page.waitForURL("**/estimates/**", { timeout: 180000 });
check("pipeline produced an estimate", page.url().includes("/estimates/"));
const estimateUrl = page.url();

/* ------------------------------------------------------------- estimate --- */
log("== estimate ==");
await page.waitForTimeout(1500);
await shot(page, "08-estimate-draft");
const estimateText = await page.textContent("main");
check("running total rendered", /\$\d/.test(estimateText));
check("needs-pricing row is flagged", estimateText.includes("need pricing"));
check("a row cites its narration moment", /from \d\d:\d\d in the walkthrough/.test(estimateText));
check("demo transcript is labelled", estimateText.includes("demo transcript"));

const sendButton = page.locator('button:has-text("Send proposal")');
check("send is disabled while a row needs pricing", await sendButton.isDisabled());

await page.locator('button[aria-label^="Edit "]').first().click();
await page.waitForTimeout(400);
await shot(page, "09-estimate-editing");
await page.locator('label:has-text("Unit price") input').first().fill("1450.00");
await page.click('button:has-text("Price this line")');
await page.waitForTimeout(3000);
await shot(page, "10-estimate-priced");
const afterPricing = await page.textContent("main");
check("flag cleared after pricing", !afterPricing.includes("need pricing"));
check("send is enabled once nothing is flagged", await sendButton.isEnabled());

await page.locator('button[aria-label="Show the narration behind this line"]').first().click();
await page.waitForTimeout(400);
check("transcript excerpt reveals", (await page.textContent("main")).includes("\u201C"));
await shot(page, "11-estimate-transcript");

/* ----------------------------------------------------------------- send --- */
log("== send ==");
await sendButton.click();
await page.waitForSelector("text=The bid is out", { timeout: 60000 });
await shot(page, "12-sent");
const proposalUrl = await page
  .locator('a:has-text("Open what the homeowner sees")')
  .getAttribute("href");
check("proposal link shown", Boolean(proposalUrl && proposalUrl.includes("/p/")), proposalUrl);

/* ------------------------------------------------------- homeowner page --- */
log("== homeowner ==");
const homeowner = await context.newPage();
homeowner.on("pageerror", (err) => pageErrors.push(`[homeowner] ${err.message}`));
homeowner.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(`[homeowner] ${msg.text()}`);
});
await homeowner.goto(proposalUrl, { waitUntil: "networkidle" });
await homeowner.screenshot({ path: `${OUT}/13-proposal.png`, fullPage: true });
const proposalText = await homeowner.textContent("main");
check("proposal shows the license block", proposalText.includes("TACLA00281C"));
check("proposal lists line items", proposalText.includes("Condenser"));
check("proposal shows a total", /Total/.test(proposalText));
check("photo strip rendered", (await homeowner.locator("main img").count()) > 0);

const acceptButton = homeowner.locator('button:has-text("Accept")').first();
check("accept disabled before signing", await acceptButton.isDisabled());
await homeowner.fill('input[autocomplete="name"]', "Marisol Vance");
await homeowner.check('input[type="checkbox"]');
check("accept enabled once signed", await acceptButton.isEnabled());
await acceptButton.click();
await homeowner.waitForSelector("text=Accepted", { timeout: 30000 });
await homeowner.screenshot({ path: `${OUT}/14-accepted.png`, fullPage: true });
const acceptedText = await homeowner.textContent("main");
check("acceptance names the signer", acceptedText.includes("Marisol Vance"));

await homeowner.locator('button:has-text("Pay the")').click();
await homeowner.waitForTimeout(2000);
await homeowner.screenshot({ path: `${OUT}/15-deposit-notice.png`, fullPage: true });
const depositText = (await homeowner.textContent("main")).toLowerCase();
check(
  "no fake payment: says why a card cannot be taken",
  depositText.includes("not switched on") || depositText.includes("has not connected"),
  depositText.slice(0, 240),
);

/* ------------------------------------------------- contractor timeline --- */
log("== timeline ==");
await page.goto(`${BASE}/proposals`, { waitUntil: "networkidle" });
await shot(page, "16-proposals");
check("proposal listed as accepted", /accepted/i.test(await page.textContent("main")));
await page.locator("main a.row").first().click();
await page.waitForURL("**/proposals/**");
await page.waitForTimeout(600);
await shot(page, "17-timeline");
const timelineText = await page.textContent("main");
check("timeline records the view", timelineText.includes("Homeowner opened it"));
check("timeline records the acceptance", timelineText.includes("Accepted"));
check("acceptance record shows the IP", /from \d/.test(timelineText));

const proposalId = page.url().split("/proposals/")[1];
const pdfResponse = await page.request.get(`${BASE}/api/proposals/${proposalId}/pdf`);
check("PDF snapshot downloads", pdfResponse.ok(), pdfResponse.status());
const pdfBody = await pdfResponse.body();
check("PDF is a real PDF", pdfBody.subarray(0, 5).toString() === "%PDF-");
check("PDF is a sensible size", pdfBody.length > 1500, pdfBody.length);

/* ----------------------------------------------------------- price book --- */
log("== price book ==");
await page.goto(`${BASE}/price-book`, { waitUntil: "networkidle" });
await shot(page, "18-price-book");
check("starter book seeded", (await page.textContent("main")).includes("Condenser"));
await page.goto(`${BASE}/price-book/import`, { waitUntil: "networkidle" });
await page.fill(
  "textarea",
  [
    "Category,Name,Kind,Unit,Unit Cost",
    "Materials,Crane mat set,Material,each,180.00",
    "Materials,,Material,each,10",
  ].join("\n"),
);
await page.click('button:has-text("Import")');
await page.waitForSelector("text=added", { timeout: 30000 });
await shot(page, "19-import-result");
const importText = await page.textContent("main");
check("import reports what landed", /1 added/.test(importText), importText.slice(0, 200));
check("import reports the skipped row with its line", importText.includes("line 3"));

/* --------------------------------------------------------------- others --- */
log("== other screens ==");
for (const [name, path] of [
  ["20-settings", "/settings"],
  ["21-billing", "/settings/billing"],
  ["22-audit", "/settings/audit"],
  ["23-jobs-populated", "/jobs"],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await shot(page, name);
}
await page.goto(`${BASE}/settings/audit`, { waitUntil: "networkidle" });
const auditText = await page.textContent("main");
check("audit log records the AI draft", auditText.includes("AI draft created"));
check("audit log records the send", auditText.includes("Proposal sent"));
check("audit log names the drafter", auditText.includes("quotefox-lexical-v1"));

/* ------------------------------------------------ reduced motion + width --- */
log("== reduced motion and layout ==");
const rm = await context.newPage();
await rm.emulateMedia({ reducedMotion: "reduce" });
await rm.goto(`${estimateUrl.split("?")[0]}?reveal=1`, { waitUntil: "networkidle" });
await rm.waitForTimeout(900);
await rm.screenshot({ path: `${OUT}/24-reduced-motion.png`, fullPage: true });
const rowOpacity = await rm
  .locator(".type-in")
  .first()
  .evaluate((el) => getComputedStyle(el).opacity);
check("reduced motion leaves rows fully visible", Number(rowOpacity) === 1, rowOpacity);

for (const path of ["/jobs", "/price-book", "/proposals", "/settings", "/settings/billing"]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check(`no sideways scroll on ${path}`, overflow <= 0, overflow);
}
await homeowner.goto(proposalUrl, { waitUntil: "networkidle" });
const proposalOverflow = await homeowner.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check("no sideways scroll on the proposal page", proposalOverflow <= 0, proposalOverflow);

const realConsoleErrors = consoleErrors.filter(
  (message) => !message.includes("ERR_CONNECTION_FAILED"),
);
log("\nconsole errors:", realConsoleErrors.length ? realConsoleErrors : "none (the aborted PUT was injected on purpose)");
log("page errors:", pageErrors.length ? pageErrors : "none");
if (realConsoleErrors.length || pageErrors.length) failures += 1;
log(failures === 0 ? "\nALL BROWSER CHECKS PASSED" : `\n${failures} BROWSER CHECK(S) FAILED`);

await browser.close();
process.exit(failures === 0 ? 0 : 1);
