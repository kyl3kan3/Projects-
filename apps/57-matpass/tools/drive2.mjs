/**
 * Scratch browser driver, phase 2 — the kiosk, gradings, retention, billing,
 * announcements and the plan. Reuses the session phase 1 saved.
 * Deleted before the build is handed over.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://localhost:3057";
const OUT = process.env.SHOT_DIR ?? "/tmp/matpass-shots";
mkdirSync(OUT, { recursive: true });

const errors = [];
const step = (n) => console.log(`\n=== ${n}`);
const kioskToken = readFileSync(`${OUT}/kiosk-token.txt`, "utf8").trim();
const studentUrl = readFileSync(`${OUT}/student-url.txt`, "utf8").trim();

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const track = (page) => {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[console] ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
  page.on("requestfailed", (r) => {
    const f = r.failure();
    if (f && !/ERR_ABORTED/.test(f.errorText)) errors.push(`[net] ${r.url()} ${f.errorText}`);
  });
  return page;
};

// ------------------------------------------------------ the kiosk (tablet)
step("kiosk at tablet size (820x1180), credential-free");
const tablet = await browser.newContext({ viewport: { width: 820, height: 1180 } });
const kiosk = track(await tablet.newPage());
await kiosk.goto(`${BASE}/kiosk/${kioskToken}`, { waitUntil: "networkidle" });
console.log("  device name shown:", (await kiosk.locator("header").innerText()).includes("Front door"));
console.log("  no tab bar on the kiosk:", (await kiosk.locator(".tabbar").count()) === 0);
console.log(
  "  no link into the console:",
  (await kiosk.locator('a[href^="/roster"], a[href^="/settings"], a[href^="/billing"]').count()) === 0,
);
await kiosk.screenshot({ path: `${OUT}/11-kiosk-search.png`, fullPage: true });

step("kiosk: two letters is not enough, three is");
await kiosk.fill("input", "Ma");
await kiosk.waitForTimeout(500);
console.log("  at 2 letters, results:", await kiosk.locator("button.card").count());
console.log("  hint shown:", (await kiosk.locator("main").innerText()).includes("Three letters is enough"));
await kiosk.fill("input", "Mar");
await kiosk.waitForSelector("button.card", { timeout: 10000 });
console.log("  at 3 letters, results:", await kiosk.locator("button.card").count());

step("kiosk: the five-second check-in");
const t0 = Date.now();
await kiosk.locator("button.card").first().click();
await kiosk.waitForSelector("text=Check in", { timeout: 10000 });
await kiosk.screenshot({ path: `${OUT}/12-kiosk-card.png`, fullPage: true });
await kiosk.getByRole("button", { name: /^Check in/ }).click();
await kiosk.waitForSelector("text=/\\d+ \\/ \\d+ classes/", { timeout: 10000 });
console.log(`  search -> confirmation in ${Date.now() - t0}ms`);
const confirmation = await kiosk.locator("main").innerText();
console.log("  confirmation:", confirmation.split("\n").slice(1, 5).join(" | "));
await kiosk.screenshot({ path: `${OUT}/13-kiosk-confirmed.png`, fullPage: true });

step("kiosk: auto-returns to search");
await kiosk.waitForSelector("input", { timeout: 6000 });
console.log("  back at search:", (await kiosk.locator("input").count()) === 1);

step("kiosk PIN entry");
const pin = "1000";
await kiosk.fill("input", pin);
await kiosk.waitForTimeout(600);
const pinResults = await kiosk.locator("button.card").count();
console.log(`  PIN ${pin} found ${pinResults} student(s)`);

// ------------------------------------------------- offline queue + replay
step("kiosk offline: the tap queues, and syncs exactly once");
await kiosk.fill("input", "Sofia");
await kiosk.waitForSelector("button.card", { timeout: 10000 });
await kiosk.locator("button.card").first().click();
await kiosk.waitForSelector("text=Check in", { timeout: 10000 });
await tablet.setOffline(true);
await kiosk.getByRole("button", { name: /^Check in/ }).click();
await kiosk.waitForSelector("text=/queued/", { timeout: 10000 });
console.log("  banner:", (await kiosk.locator('[role="status"]').first().innerText()).trim());
await kiosk.screenshot({ path: `${OUT}/14-kiosk-offline.png`, fullPage: true });
const queued = await kiosk.evaluate(() =>
  JSON.parse(localStorage.getItem("matpass.kiosk.queue.v1") ?? "[]"),
);
console.log("  queued locally:", queued.length, "key:", queued[0]?.clientKey?.slice(0, 14));

step("reconnect: the queue drains and does not double-record");
await tablet.setOffline(false);
await kiosk.evaluate(() => window.dispatchEvent(new Event("online")));
await kiosk.waitForFunction(
  () => JSON.parse(localStorage.getItem("matpass.kiosk.queue.v1") ?? "[]").length === 0,
  null,
  { timeout: 15000 },
);
console.log("  queue drained");
// Replay the identical payload by hand, twice, and count the rows.
const replay = await kiosk.evaluate(
  async ([token, entry]) => {
    const body = {
      token,
      checkins: [
        {
          studentId: entry.studentId,
          enrollmentId: entry.enrollmentId,
          classScheduleId: entry.classScheduleId,
          clientKey: entry.clientKey,
          at: entry.at,
        },
      ],
    };
    const one = await fetch("/api/kiosk/checkin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());
    const two = await fetch("/api/kiosk/checkin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());
    return [one.results[0], two.results[0]];
  },
  [kioskToken, queued[0]],
);
console.log("  replay 1 duplicate:", replay[0].duplicate, "classes:", replay[0].classesDone);
console.log("  replay 2 duplicate:", replay[1].duplicate, "classes:", replay[1].classesDone);

step("kiosk rejects a forged token");
const forged = await kiosk.evaluate(async () => {
  const r = await fetch("/api/kiosk/checkin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "forged.token.value", checkins: [] }),
  });
  return r.status;
});
console.log("  forged token status (want 400 or 403):", forged);

step("seed a term of attendance so the grading list has something to say");
const seeded = await kiosk.evaluate(async (token) => {
  // The kiosk we are about to seed with is the live one; every check-in goes
  // through the real endpoint with a real client key.
  const names = ["Marcus", "Amara", "Sofia", "Tomas", "Priya"];
  let inserted = 0;
  for (const name of names) {
    const search = await fetch("/api/kiosk/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, query: name }),
    }).then((r) => r.json());
    const student = search.students?.[0];
    if (!student || !student.enrollments[0]) continue;
    // Marcus and Amara get a full term; Sofia stops one short of the step.
    const count = name === "Sofia" ? 5 : name === "Priya" ? 2 : 14;
    const batch = [];
    for (let i = 0; i < count; i++) {
      batch.push({
        studentId: student.studentId,
        enrollmentId: student.enrollments[0].enrollmentId,
        clientKey: `seed:${name}:${i}`,
        at: new Date(Date.now() - (i + 1) * 3 * 86400000).toISOString(),
      });
    }
    const res = await fetch("/api/kiosk/checkin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, checkins: batch }),
    }).then((r) => r.json());
    inserted += res.results.filter((r) => r.ok && !r.duplicate).length;
  }
  return inserted;
}, kioskToken);
console.log("  check-ins seeded:", seeded);

// ------------------------------------------------- console: the rest of it
step("console session restored");
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  storageState: JSON.parse(readFileSync(`${OUT}/session.json`, "utf8")),
});
const page = track(await context.newPage());

step("grading event: create and let it assemble itself");
await page.goto(`${BASE}/gradings`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/15-gradings.png`, fullPage: true });
console.log("  eligible-now stat:", (await page.locator("main").innerText()).split("\n")[2]);
await page.fill("#ename", "Summer grading");
await page.getByRole("button", { name: "Assemble the list" }).click();
await page.waitForURL(/\/gradings\/[0-9a-f-]{36}/, { timeout: 25000 });
const eventUrl = page.url();
console.log("  landed on the event:", eventUrl.split("/").pop().slice(0, 8));
await page.screenshot({ path: `${OUT}/16-grading-event.png`, fullPage: true });
const eventText = await page.locator("main").innerText();
console.log("  ", eventText.split("\n").filter((l) => /candidate/.test(l)).join(" | "));
console.log("  near-miss deltas shown:", /classes short|days short/.test(eventText));
await page.getByRole("button", { name: /^Near miss/ }).click();
await page.waitForTimeout(400);
const nearText = await page.locator("main").innerText();
console.log("  near-miss tab deltas:", nearText.split("\n").filter((l) => /short/.test(l)).join(" | "));
console.log("  invite-anyway offered:", (await page.getByRole("button", { name: "Invite anyway" }).count()) > 0);
await page.getByRole("button", { name: /^Eligible/ }).click();

step("invite the eligible households");
const inviteBtn = page.getByRole("button", { name: /^Invite \d+ famil/ });
if ((await inviteBtn.count()) > 0) {
  await inviteBtn.first().click();
  console.log("  ", await msg(page, '[role="status"]'));
} else {
  console.log("  nobody eligible to invite yet");
}

step("record the event behind the review sheet");
await page.reload({ waitUntil: "networkidle" });
const reviewBtn = page.getByRole("button", { name: /review before recording|Nobody to promote/ });
console.log("  review button:", (await reviewBtn.first().innerText()).trim());
if (!(await reviewBtn.first().isDisabled())) {
  await reviewBtn.first().click();
  await page.waitForSelector("text=/review before recording/", { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/17-batch-review.png`, fullPage: true });
  await page.getByRole("button", { name: "Record the event" }).click();
  await page.waitForURL(/recorded=/, { timeout: 25000 });
  await page.waitForTimeout(500);
  console.log("  ", (await page.locator('[role="status"]').first().innerText()).trim());
  await page.screenshot({ path: `${OUT}/18-grading-recorded.png`, fullPage: true });
}

step("completing twice is refused");
await page.goto(eventUrl, { waitUntil: "networkidle" });
console.log("  status pill:", (await page.locator(".pill").first().innerText()).trim());
console.log(
  "  certificate export link present:",
  (await page.locator('a[href*="certificates"]').count()) > 0,
);

step("certificate export downloads real rows");
const csv = await page.evaluate(async (url) => {
  const r = await fetch(url);
  return { status: r.status, body: (await r.text()).slice(0, 300) };
}, `${eventUrl}/certificates`);
console.log("  status:", csv.status);
console.log("  ", csv.body.split("\r\n").slice(0, 3).join(" || "));

step("certificate PDF");
const pdf = await page.evaluate(async (url) => {
  const r = await fetch(url);
  const buf = await r.arrayBuffer();
  return { status: r.status, bytes: buf.byteLength, magic: new TextDecoder().decode(buf.slice(0, 5)) };
}, `${eventUrl}/certificates?format=pdf`);
console.log("  status:", pdf.status, "bytes:", pdf.bytes, "magic:", pdf.magic);

step("roster CSV export");
const roster = await page.evaluate(async () => {
  const r = await fetch("/roster/export");
  return { status: r.status, body: (await r.text()).slice(0, 260) };
});
console.log("  status:", roster.status);
console.log("  ", roster.body.split("\r\n").slice(0, 2).join(" || "));

// ---------------------------------------------------------------- billing
step("billing: plan, household, membership");
await page.goto(`${BASE}/billing`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/19-billing.png`, fullPage: true });
console.log("  simulated-Stripe notice:", (await page.locator('[role="alert"]').count()) > 0);
await page.getByRole("button", { name: "New plan" }).click();
await page.fill("#pname", "Family unlimited");
await page.fill("#pamount", "199");
await page.selectOption("#pkind", "family_flat");
await page.getByRole("button", { name: "Create plan" }).click();
console.log("  ", await msg(page, '[role="status"]'));

step("billing rejects a nonsense amount");
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: "New plan" }).click();
await page.fill("#pname", "Nonsense");
await page.fill("#pamount", "twenty quid");
await page.getByRole("button", { name: "Create plan" }).click();
console.log("  ", await msg(page, "form [role=alert]"));

step("subscribe a household without an email is refused");
await page.goto(`${BASE}/billing`, { waitUntil: "networkidle" });
const nwosuStart = page
  .locator(".row-block", { hasText: "Nwosu" })
  .getByRole("button", { name: /membership/ });
if ((await nwosuStart.count()) > 0) {
  await nwosuStart.first().click();
  await page.getByRole("button", { name: "Send the payment link" }).click();
  console.log("  ", await msg(page, "form [role=alert]"));
}

step("subscribe the Okafor household");
await page.goto(`${BASE}/billing`, { waitUntil: "networkidle" });
await page
  .locator(".row-block", { hasText: "Okafor" })
  .getByRole("button", { name: /membership/ })
  .first()
  .click();
await page.getByRole("button", { name: "Send the payment link" }).click();
const subMsg = await msg(page, '[role="status"]');
console.log("  ", subMsg);
const hostedUrl = subMsg.match(/(http:\/\/\S+)/)?.[1];

step("the parent completes the (simulated) hosted flow, and the card fails");
if (hostedUrl) {
  await page.goto(hostedUrl, { waitUntil: "networkidle" });
  console.log("  labelled a simulation:", (await page.locator("main").innerText()).includes("Simulated Stripe page"));
  console.log("  asks for no card number:", (await page.locator('input[type="text"], input[name*="card"]').count()) === 0);
  await page.screenshot({ path: `${OUT}/20-hosted-simulated.png`, fullPage: true });
  await page.getByRole("button", { name: "Card is declined" }).click();
  await page.waitForURL("**/billing", { timeout: 20000 });
  const billing = await page.locator("main").innerText();
  console.log("  past due at the desk:", /card failed/.test(billing));
  console.log("  ", billing.split("\n").filter((l) => /card failed|still training/.test(l)).join(" | "));
  await page.screenshot({ path: `${OUT}/21-billing-past-due.png`, fullPage: true });
}

step("a past-due family's student still checks in (the rule)");
const stillTrains = await kiosk.evaluate(async (token) => {
  const search = await fetch("/api/kiosk/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, query: "Marcus" }),
  }).then((r) => r.json());
  const s = search.students[0];
  const r = await fetch("/api/kiosk/checkin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token,
      checkins: [
        {
          studentId: s.studentId,
          enrollmentId: s.enrollments[0].enrollmentId,
          clientKey: `kiosk:pastdue-${Date.now()}`,
        },
      ],
    }),
  }).then((r) => r.json());
  return r.results[0];
}, kioskToken);
console.log("  check-in ok:", stillTrains.ok, "duplicate:", stillTrains.duplicate);

// -------------------------------------------------------------- retention
step("retention: empty state, then the sweep");
await page.goto(`${BASE}/retention`, { waitUntil: "networkidle" });
console.log("  ", (await page.locator("main").innerText()).split("\n").slice(2, 5).join(" | "));
await page.screenshot({ path: `${OUT}/22-retention-empty.png`, fullPage: true });

step("the cron route refuses without the secret, and runs with it");
const cron = await page.evaluate(async () => {
  const bad = await fetch("/api/cron/tick");
  const good = await fetch("/api/cron/tick?secret=local-dev-cron-secret-3057");
  return { badStatus: bad.status, goodStatus: good.status, body: await good.text() };
});
console.log("  no secret:", cron.badStatus, " with secret:", cron.goodStatus);
console.log("  ", cron.body.slice(0, 200));

// ---------------------------------------------------------- announcements
step("announcements");
await page.goto(`${BASE}/announce`, { waitUntil: "networkidle" });
await page.fill("#subject", "Summer grading — Saturday 15 August");
await page.fill(
  "#body",
  "Doors at 9:30, gradings start at 10. Full gi, belts washed. Parents welcome on the mat edge.",
);
await page.getByRole("button", { name: "Send", exact: true }).click();
console.log("  ", await msg(page, '[role="status"]'));
await page.screenshot({ path: `${OUT}/23-announce.png`, fullPage: true });

step("per-household delivery status");
await page.goto(`${BASE}/announce`, { waitUntil: "networkidle" });
await page.locator("a.row").first().click();
await page.waitForURL(/\/announce\/[0-9a-f-]{36}/, { timeout: 15000 });
const delivery = await page.locator("main").innerText();
console.log("  households listed:", /(\d+) households/i.exec(delivery)?.[1]);
console.log("  failure called out:", /could not be reached/.test(delivery));
await page.screenshot({ path: `${OUT}/24-delivery.png`, fullPage: true });

// -------------------------------------------------------------- settings
step("settings, staff and plan");
await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/25-settings.png`, fullPage: true });
console.log("  redis line:", (await page.locator("main").innerText()).split("\n").find((l) => /Redis/.test(l))?.trim());

await page.goto(`${BASE}/settings/staff`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Add someone" }).click();
await page.fill("#stname", "Ana Duarte");
await page.fill("#stemail", `desk+${Date.now()}@northgate.test`);
await page.fill("#stpass", "front desk password");
await page.selectOption("#strole", "front_desk");
await page.getByRole("button", { name: "Add staff member" }).click();
console.log("  ", await msg(page, '[role="status"]'));
const deskEmail = await page.locator("main").innerText();
writeFileSync(`${OUT}/desk.txt`, /desk\+\d+@northgate\.test/.exec(deskEmail)?.[0] ?? "");

await page.goto(`${BASE}/settings/plan`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/26-plan.png`, fullPage: true });
await page.selectOption("#tier", "academy");
await page.getByRole("button", { name: "Continue to checkout" }).click();
console.log("  ", await msg(page, '[role="status"]'));

step("kiosk revocation bricks the device immediately");
await page.goto(`${BASE}/settings/kiosk`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/27-kiosk-devices.png`, fullPage: true });
const revoke = page.getByRole("button", { name: "Revoke this device" });
await revoke.click(); // arms
console.log("  armed label:", (await revoke.innerText()).trim());
await revoke.click(); // confirms
console.log("  ", await msg(page, '[role="status"]'));

const afterRevoke = await kiosk.evaluate(async (token) => {
  const r = await fetch("/api/kiosk/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, query: "Marcus" }),
  });
  return r.status;
}, kioskToken);
console.log("  kiosk API after revocation (want 403):", afterRevoke);
await kiosk.goto(`${BASE}/kiosk/${kioskToken}`, { waitUntil: "networkidle" });
console.log("  kiosk page says:", (await kiosk.locator("h1").innerText()).trim());
await kiosk.screenshot({ path: `${OUT}/28-kiosk-revoked.png`, fullPage: true });

// --------------------------------------------------------- role gating
step("front-desk role cannot record a promotion");
const desk = await browser.newContext({ viewport: { width: 390, height: 844 } });
const deskPage = track(await desk.newPage());
const deskAddr = readFileSync(`${OUT}/desk.txt`, "utf8").trim();
await deskPage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await deskPage.fill("#email", deskAddr);
await deskPage.fill("#password", "front desk password");
await deskPage.getByRole("button", { name: "Sign in" }).click();
await deskPage.waitForURL("**/roster", { timeout: 20000 });
await deskPage.goto(studentUrl, { waitUntil: "networkidle" });
console.log(
  "  'Promote on the mat' hidden for front desk:",
  (await deskPage.getByRole("button", { name: "Promote on the mat" }).count()) === 0,
);
await deskPage.goto(`${BASE}/curriculum`, { waitUntil: "networkidle" });
console.log(
  "  curriculum read-only for front desk:",
  (await deskPage.getByRole("button", { name: "Adjust requirements" }).count()) === 0,
);
console.log("  can still check in:", (await deskPage.goto(`${BASE}/roster/checkin`)).status() === 200);

step("signed-out visitors are redirected to login");
const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
const anonPage = track(await anon.newPage());
await anonPage.goto(`${BASE}/roster`, { waitUntil: "networkidle" });
console.log("  /roster ->", anonPage.url().replace(BASE, ""));
await anonPage.goto(`${BASE}/billing`, { waitUntil: "networkidle" });
console.log("  /billing ->", anonPage.url().replace(BASE, ""));

console.log("\n--- console/page/network errors:", errors.length);
for (const e of errors) console.log("   ", e);
await browser.close();
console.log("\nPHASE 2 DONE");
