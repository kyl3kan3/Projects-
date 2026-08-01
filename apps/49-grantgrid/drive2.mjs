/**
 * Second browser pass: plan gating, the over-cap upgrade prompt, the thin-profile
 * discovery state, and the reduced-motion rendering — all at 390x844.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3049";
const OUT = "/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/shots2";
fs.mkdirSync(OUT, { recursive: true });

const { getDb, closeDb } = await import("./src/db/index.ts");
const schema = await import("./src/db/schema.ts");
const { eq } = await import("drizzle-orm");
const db = getDb();

const errors = [];
const email = `seed+${Date.now()}@riversideyouth.org`;

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(e.message));

/* ---- sign up, then force the org onto Seed the way a lapsed trial would ---- */
await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
await page.fill('input[name="orgName"]', "Seed Plan Test Org");
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "seed-plan-test-1");
await page.click('button[type="submit"]');
await page.waitForURL("**/onboarding", { timeout: 20000 });

const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
const [membership] = await db
  .select()
  .from(schema.memberships)
  .where(eq(schema.memberships.userId, user.id));
const orgId = membership.organizationId;

await db
  .update(schema.organizations)
  .set({ plan: "seed", subscriptionStatus: "trial_expired", trialEndsAt: new Date(Date.now() - 86400000) })
  .where(eq(schema.organizations.id, orgId));

/* ---- Seed: discovery is gated, and says nothing was taken away ---- */
await page.goto(`${BASE}/discovery`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/01-discovery-gated.png`, fullPage: true });
const gated = await page.getByText("Discovery is part of Grow.").isVisible();
const reassured = await page.getByText(/nothing has been hidden/i).isVisible();
console.log("· Seed sees the discovery gate:", gated);
console.log("· and is told nothing was hidden:", reassured);

/* ---- Seed pipeline shows the trial-ended banner, not a wall ---- */
await page.goto(`${BASE}/pipeline`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/02-pipeline-seed.png`, fullPage: true });
console.log(
  "· trial-ended banner:",
  await page.getByText(/Your trial has ended/).isVisible(),
);

/* ---- fill to the cap, then check the upgrade prompt in the real sheet ---- */
const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId));
await db.insert(schema.grants).values(
  Array.from({ length: 25 }, (_, i) => ({
    organizationId: orgId,
    title: `Backfilled request ${i + 1}`,
    funderName: `Sample Backfill Funder ${i + 1}`,
    askAmountCents: 250_000,
    ownerUserId: user.id,
  })),
);
void org;

await page.goto(`${BASE}/pipeline`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Add grant" }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/03-cap-reached.png`, fullPage: true });
const capMessage = await page.getByLabel("Add a grant").getByText(/Nothing has been removed/).isVisible();
console.log("· over-cap sheet offers an upgrade, not data loss:", capMessage);
console.log(
  "· and the 25 rows are all still listed:",
  (await page.locator("a.row").count()) >= 25,
);

/* ---- the workspace is gated on Seed too, without hiding the grant ---- */
const firstGrant = await page.locator("a.row").first().getAttribute("href");
await page.keyboard.press("Escape");
await page.goto(`${BASE}${firstGrant}`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/04-grant-seed.png`, fullPage: true });
console.log(
  "· workspace gated on Seed:",
  await page.getByText(/application workspace is part of Grow/i).isVisible(),
);
console.log(
  "· but dates and reminders are still there:",
  await page.getByText("Dates").first().isVisible(),
);

/* ---- thin profile: discovery on Grow with no profile shows no scores ---- */
await db
  .update(schema.organizations)
  .set({ plan: "grow", subscriptionStatus: "active" })
  .where(eq(schema.organizations.id, orgId));
await page.goto(`${BASE}/discovery`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/05-discovery-no-profile.png`, fullPage: true });
console.log(
  "· thin profile explains itself rather than scoring:",
  await page.getByText(/No fit scores yet/).isVisible(),
);
console.log(
  "· every card shows a dash instead of a number:",
  (await page.getByText("Complete your profile to score.").count()) >= 10,
);

/* ---- reduced motion on a real funder card ---- */
const rm = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
  storageState: await context.storageState(),
});
const rmPage = await rm.newPage();
await db
  .update(schema.organizations)
  .set({
    profile: {
      mission: "After-school tutoring in Cuyahoga County.",
      programs: "Tutoring",
      budgetBand: "100k_500k",
      serviceStates: ["OH"],
      causeCodes: ["youth", "education"],
      ein: "34-1234567",
      typicalAskCents: 1_000_000,
    },
    profileVersion: 2,
  })
  .where(eq(schema.organizations.id, orgId));
await rmPage.goto(`${BASE}/discovery`, { waitUntil: "networkidle" });
await rmPage.waitForTimeout(400);
const arc = await rmPage.evaluate(() => {
  const el = document.querySelector(".fit-arc-value");
  if (!el) return null;
  const cs = getComputedStyle(el);
  return {
    dashoffset: cs.strokeDashoffset,
    duration: cs.animationDuration,
    sweepWidth: getComputedStyle(document.querySelector(".name-sweep"), "::after").width,
  };
});
console.log("· reduced-motion arc:", JSON.stringify(arc));
await rmPage.screenshot({ path: `${OUT}/06-reduced-motion-discovery.png`, fullPage: true });

/* ---- keyboard focus is visible on the profile chips ---- */
await rmPage.goto(`${BASE}/settings/profile`, { waitUntil: "networkidle" });
await rmPage.locator('input[name="serviceStates"][value="OH"]').focus();
const outline = await rmPage.evaluate(() => {
  const input = document.querySelector('input[name="serviceStates"][value="OH"]');
  const chip = input?.closest("label");
  return chip ? getComputedStyle(chip).outlineColor + " " + getComputedStyle(chip).outlineWidth : null;
});
console.log("· focused chip outline:", outline);
await rmPage.screenshot({ path: `${OUT}/07-profile-focus.png`, fullPage: true });
await rm.close();

console.log("\nconsole errors:", errors.length ? errors.join("\n") : "none");

await browser.close();
await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
await db.delete(schema.users).where(eq(schema.users.id, user.id));
await closeDb();
