/**
 * The MVP items that have console UI I had not yet driven in a browser:
 * plan switching, waitlist promotion, schedule CSV import, and the exports.
 * Throwaway.
 */
import { chromium, type Page } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3045";

async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", "dana@millbrooksoccer.org");
  await page.fill("#password", "fall2026season");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/season");
}

async function main() {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await login(page);

  // --- our own billing: switch plan, and back ----------------------------
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  console.log("plan before:", (await page.locator(".panel .t-title").first().textContent())?.trim());
  await page.locator('button:has-text("Switch to $49/mo flat")').click();
  await page.waitForTimeout(2500);
  console.log("switch message:", (await page.locator('[role="status"]').first().textContent())?.trim().slice(0, 120));
  await page.reload({ waitUntil: "networkidle" });
  console.log("plan after:", (await page.locator(".panel .t-title").first().textContent())?.trim());
  // A flat-plan club must stop charging parents our fee.
  const parent = await ctx.newPage();
  await parent.goto(`${BASE}/register/millbrook-fall-2026`, { waitUntil: "networkidle" });
  await parent.fill("#contactName", "Flat Plan Check");
  await parent.fill("#email", "flat.plan@example.com");
  await parent.click('button:has-text("Continue")');
  await parent.waitForTimeout(300);
  await parent.fill("#child-0-firstName", "Flat");
  await parent.fill("#child-0-lastName", "Check");
  await parent.fill("#child-0-birthdate", "2018-01-01");
  await parent.click('button:has-text("Continue")');
  await parent.waitForTimeout(400);
  const feeLines = await parent.locator(".panel .t-data").allTextContents();
  console.log("fee lines on the flat plan (no RosterRally fee expected):", feeLines);
  console.log("mentions our fee:", (await parent.locator("body").innerText()).includes("RosterRally fee"));
  await parent.close();
  // Put it back.
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.locator('button:has-text("Switch to $1.50 per paid registration")').click();
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "networkidle" });
  console.log("plan restored:", (await page.locator(".panel .t-title").first().textContent())?.trim());

  // --- staff invite (multi-admin, the turnover story) --------------------
  await page
    .locator("details:has(#invite-email)")
    .evaluate((d) => ((d as HTMLDetailsElement).open = true));
  await page.fill("#invite-name", "Sam Whitlock");
  await page.fill("#invite-email", `sam.${Date.now()}@millbrooksoccer.org`);
  await page.selectOption("#invite-role", "registrar");
  await page.locator('form:has(#invite-email) button[type="submit"]').click();
  await page.waitForTimeout(2500);
  const invite = (await page.locator('[role="status"]').first().textContent())?.trim() ?? "";
  console.log("invite result:", invite.slice(0, 90));
  console.log("one-time password issued:", /rally-[0-9a-f]{8}/.test(invite));

  // --- waitlist: fill it, free a place, promote, all through the UI -------
  // 1. A parent registers into the full division and is waitlisted.
  const waitParent = await ctx.newPage();
  await waitParent.goto(`${BASE}/register/millbrook-fall-2026`, { waitUntil: "networkidle" });
  await waitParent.fill("#contactName", "Wanda Waitlist");
  await waitParent.fill("#email", `wanda.${Date.now()}@example.com`);
  await waitParent.click('button:has-text("Continue")');
  await waitParent.waitForTimeout(300);
  await waitParent.fill("#child-0-firstName", "Wren");
  await waitParent.fill("#child-0-lastName", "Waitlist");
  await waitParent.fill("#child-0-birthdate", "2016-06-06");
  const fullOption = (await waitParent.locator("#child-0-divisionId option").allTextContents()).findIndex(
    (t) => t.includes("full"),
  );
  console.log("a division shown as full on the public form:", fullOption >= 0);
  if (fullOption >= 0) await waitParent.selectOption("#child-0-divisionId", { index: fullOption });
  await waitParent.click('button:has-text("Continue")');
  await waitParent.waitForTimeout(400);
  console.log("waitlisted child is charged:", (await waitParent.locator(".panel .t-data").allTextContents()).join(" "));
  await waitParent.check('input[name="waiverAccepted"]');
  await waitParent.locator(".thumb-cta-plain button[type=submit]").click();
  await waitParent.waitForTimeout(3000);
  console.log("waitlist registration landed on:", new URL(waitParent.url()).pathname.slice(0, 24));
  await waitParent.close();

  // 2. The registrar frees a place in the FULL division by cancelling one.
  await page.goto(`${BASE}/registrations`, { waitUntil: "networkidle" });
  await page.locator(".chip", { hasText: "U10 Boys" }).first().click();
  await page.waitForTimeout(1200);
  // "UNPAID" and "PART PAID" both contain "PAID", so match the pill exactly.
  const paidRow = page
    .locator('a.row[href^="/registrations/"]')
    .filter({ has: page.locator(".pill", { hasText: /^PAID$/ }) })
    .first();
  if (await paidRow.count()) {
    await paidRow.click();
    await page.waitForURL(/\/registrations\/[0-9a-f-]{36}/);
    await page.waitForTimeout(600);
    console.log("withdrawing:", (await page.locator("h1").textContent())?.trim());
    const withdraw = page.locator("details:has(summary:has-text('Withdraw this registration'))");
    await withdraw.evaluate((d) => ((d as HTMLDetailsElement).open = true));
    console.log("withdraw note:", (await withdraw.locator(".t-secondary").first().textContent())?.trim().slice(0, 90));
    const withdrawBtn = withdraw.locator('button[type="submit"]');
    await withdrawBtn.click();
    await page.waitForTimeout(300);
    await withdrawBtn.click(); // hold-to-confirm: the second press commits
    await page.waitForTimeout(3500);
    // The form removes itself once the place is withdrawn, so the resulting
    // state is the confirmation: the pill flips and the history shows the reversal.
    await page.reload({ waitUntil: "networkidle" });
    console.log("state after withdrawing:", (await page.locator(".pill").first().textContent())?.trim());
    console.log(
      "withdraw form gone:",
      (await page.locator("summary:has-text('Withdraw this registration')").count()) === 0,
    );
  }

  // 3. Promote from the console.
  await page.goto(`${BASE}/season`, { waitUntil: "networkidle" });
  const promote = page.locator('button:has-text("Promote from waitlist")');
  if (await promote.count()) {
    await promote.first().click();
    await page.waitForTimeout(3000);
    const msg = await page.locator('[role="status"], [role="alert"]').first().textContent();
    console.log("promote result:", msg?.trim().slice(0, 150));
  } else {
    console.log("promote button absent — cancelling a place moves the queue itself");
  }
  // Either way, prove the waitlisted child actually got in and now owes the fee
  // that was agreed when they joined the queue.
  await page.goto(`${BASE}/registrations`, { waitUntil: "networkidle" });
  const wren = page.locator("a.row").filter({ hasText: "Wren Waitlist" }).first();
  console.log("Wren's state now:", (await wren.locator(".pill").first().textContent())?.trim());
  console.log("Wren owes:", (await wren.locator(".t-data").last().textContent())?.trim());
  await page.goto(`${BASE}/season`, { waitUntil: "networkidle" });
  const u10 = page.locator(".row").filter({ hasText: "U10 BOYS" }).first();
  console.log("U10 after the shuffle:", (await u10.innerText()).replace(/\n/g, " "));

  // --- schedule CSV import, previewed then committed ---------------------
  await page.goto(`${BASE}/schedule`, { waitUntil: "networkidle" });
  await page.locator("details:has(#csv)").evaluate((d) => ((d as HTMLDetailsElement).open = true));
  const good = "U10 Boys,Thunder,Rapids,Riverside Complex,Field A,2026-10-17,09:00,90";
  const bad = "U10 Boys,Nope,Rapids,Riverside Complex,Field A,2026-10-17,09:00,90";
  await page.fill("#csv", `division,home,away,venue,field,date,time,minutes\n${good}\n${bad}`);
  await page.locator('form:has(#csv) button[type="submit"]').click();
  await page.waitForTimeout(2500);
  console.log("csv preview:", (await page.locator('[role="status"], [role="alert"]').first().textContent())?.trim().slice(0, 160));
  await page.locator("details:has(#csv)").evaluate((d) => ((d as HTMLDetailsElement).open = true));
  await page.fill("#csv", `division,home,away,venue,field,date,time,minutes\n${good}`);
  await page.check('input[name="commit"]');
  await page.locator('form:has(#csv) button[type="submit"]').click();
  await page.waitForTimeout(3000);
  console.log("csv commit:", (await page.locator('[role="status"], [role="alert"]').first().textContent())?.trim().slice(0, 160));

  // --- exports actually download -----------------------------------------
  await page.goto(`${BASE}/registrations`, { waitUntil: "networkidle" });
  const csvLink = await page.locator('a:has-text("CSV")').first().getAttribute("href");
  const res = await ctx.request.get(`${BASE}${csvLink}`);
  const text = await res.text();
  console.log("registrations CSV:", res.status(), `${text.split("\n").length - 1} rows`, `attachment: ${(res.headers()["content-disposition"] ?? "").includes("attachment")}`);
  console.log("CSV header:", text.split("\n")[0].slice(0, 80));

  // --- the printable/iCal path from a parent's page ----------------------
  await page.goto(`${BASE}/rosters`, { waitUntil: "networkidle" });
  // Pick a division that actually has teams.
  for (const chip of await page.locator(".chip-row .chip").all()) {
    await chip.click();
    await page.waitForTimeout(900);
    if ((await page.locator('a:has-text("Sideline CSV")').count()) > 0) break;
  }
  const rosterCsv = await page.locator('a:has-text("Sideline CSV")').first().getAttribute("href");
  if (rosterCsv) {
    const r2 = await ctx.request.get(`${BASE}${rosterCsv}`);
    console.log("roster CSV:", r2.status(), JSON.stringify((await r2.text()).split("\n")[0]));
  }

  await b.close();
  console.log("\nerrors:", errors.length === 0 ? "none" : errors.join("\n"));
}
main().catch((e) => { console.error(e); process.exit(1); });
