/**
 * Viewport-accurate checks at 390x844: fixed bars must never cover the control a
 * user needs, and the signature must fire only on resolution.
 * Throwaway.
 */
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3045";
const OUT = "/tmp/rr-shots";
mkdirSync(OUT, { recursive: true });

async function covered(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return "missing";
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cy < 0 || cy > window.innerHeight) return "off-screen";
    const top = document.elementFromPoint(cx, cy);
    return top === el || el.contains(top) ? "clickable" : `covered by <${top?.tagName.toLowerCase()} class="${(top as HTMLElement)?.className}">`;
  }, selector);
}

async function main() {
  const token = process.argv[2];
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  // --- the registration form's last control, under the fixed CTA ----------
  await page.goto(`${BASE}/register/millbrook-fall-2026`, { waitUntil: "networkidle" });
  await page.fill("#contactName", "Viewport Check");
  await page.fill("#email", "viewport.check@example.com");
  await page.click('button:has-text("Continue")');
  await page.waitForTimeout(300);
  await page.fill("#child-0-firstName", "Vee");
  await page.fill("#child-0-lastName", "Check");
  await page.fill("#child-0-birthdate", "2017-03-03");
  await page.click('button:has-text("Continue")');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  console.log("waiver checkbox:", await covered(page, 'input[name="waiverAccepted"]'));
  console.log("scholarship code input:", await covered(page, "#scholarshipCode"));
  console.log("pay button:", await covered(page, ".thumb-cta-plain button[type=submit]"));
  await page.screenshot({ path: `${OUT}/v1-register-bottom.png` });

  // --- the console: tab bar must not cover the last row -------------------
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", "dana@millbrooksoccer.org");
  await page.fill("#password", "fall2026season");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/season");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  console.log("season: last row on screen:", await covered(page, ".row:last-of-type"));
  console.log("season: thumb CTA:", await covered(page, ".thumb-cta a"));
  await page.screenshot({ path: `${OUT}/v2-season-bottom.png` });

  // --- the schedule: no permanent turf underline on clean rows -----------
  await page.goto(`${BASE}/schedule`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const underlines = await page.evaluate(
    () => document.querySelectorAll("[data-game-row].row-clear").length,
  );
  console.log("rows wearing the turf sweep on a plain visit:", underlines, "(want 0)");
  const turfPixels = await page.evaluate(() => {
    // A crude accent budget: how many elements paint turf as text or background.
    const turf = ["rgb(74, 138, 60)", "rgb(61, 117, 49)"];
    let area = 0;
    let total = 0;
    for (const el of Array.from(document.querySelectorAll("*")) as HTMLElement[]) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.top > window.innerHeight) continue;
      const box = r.width * r.height;
      const style = getComputedStyle(el);
      total = Math.max(total, box);
      if (turf.includes(style.backgroundColor)) area += box;
    }
    return { turfArea: Math.round(area), viewport: window.innerWidth * window.innerHeight };
  });
  console.log("turf-filled area in the first screen:", turfPixels);
  await page.screenshot({ path: `${OUT}/v3-schedule-top.png` });

  // The signature: create a clash, then fix it, and watch the row sweep once.
  await page.locator("summary", { hasText: "Add a game or practice" }).click();
  const firstDate = await page.locator('input[name="localDate"]').nth(1).inputValue();
  const firstTime = await page.locator('input[name="localTime"]').nth(1).inputValue();
  console.log("cloning the first game's slot:", firstDate, firstTime);
  await page.selectOption("#kind", "practice");
  await page.selectOption("#homeTeamId", { index: 1 });
  await page.selectOption("#venueId", { label: "Miller Park" });
  await page.fill("#field", "Field 2");
  await page.fill("#localDate", firstDate);
  await page.fill("#localTime", firstTime);
  await page.click('form:has(#localTime) button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/schedule`, { waitUntil: "networkidle" });
  const banner = await page.locator(".panel .t-label").first().textContent();
  console.log("gate after cloning a slot:", banner?.trim());
  console.log("pennants shown:", await page.locator(".pennant[data-severity='hard']").count());
  await page.screenshot({ path: `${OUT}/v4-schedule-blocked.png` });

  // Publish must be refused while it is blocked.
  const publish = page.locator('button:has-text("Publish")');
  console.log("publish button disabled:", await publish.first().isDisabled());

  // Now move the clashing game away and confirm the sweep fires exactly once.
  const rows = page.locator("[data-game-row]");
  const count = await rows.count();
  let movedFrom = "";
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    if ((await row.locator(".pennant[data-severity='hard']").count()) > 0) {
      movedFrom = (await row.getAttribute("data-game-row")) ?? "";
      await row.locator("summary", { hasText: "Edit or move" }).click();
      await row.locator('input[name="localTime"]').fill("19:45");
      await row.locator('button:has-text("Move it")').click();
      break;
    }
  }
  // The server action revalidates in place, so the sweep fires on that re-render.
  // Poll for it rather than navigating away and looking too late.
  let sweeping = 0;
  for (let i = 0; i < 40; i++) {
    sweeping = await page.evaluate(
      () => document.querySelectorAll("[data-game-row].row-clear").length,
    );
    if (sweeping > 0) break;
    await page.waitForTimeout(100);
  }
  console.log(`after fixing ${movedFrom.slice(0, 8)}: rows sweeping =`, sweeping, "(want >0)");
  await page.waitForTimeout(1500);
  console.log(
    "a moment later, rows still sweeping:",
    await page.evaluate(() => document.querySelectorAll("[data-game-row].row-clear").length),
    "(want 0 — a moment, not a decoration)",
  );
  await page.goto(`${BASE}/schedule`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  console.log("gate now:", (await page.locator(".panel .t-label").first().textContent())?.trim());
  await page.screenshot({ path: `${OUT}/v5-schedule-cleared.png` });
  console.log(
    "on a later visit, rows sweeping:",
    await page.evaluate(() => document.querySelectorAll("[data-game-row].row-clear").length),
    "(want 0 — it fired once)",
  );

  // --- the family page: claiming shows in the claimed list ---------------
  if (token) {
    const fam = await ctx.newPage();
    fam.on("pageerror", (e) => errors.push(`family pageerror: ${e.message}`));
    await fam.goto(`${BASE}/p/${token}`, { waitUntil: "networkidle" });
    const claim = fam.locator('button:has-text("Claim")').first();
    if (await claim.count()) {
      const label = ((await claim.textContent()) ?? "").replace("Claim ", "").trim();
      await claim.click();
      await fam.waitForTimeout(3000);
      const text = await fam.locator("body").innerText();
      const claimedSection = text.slice(text.indexOf("VOLUNTEER SLOTS"));
      console.log(`claimed "${label}" — now shows "Give it up":`, claimedSection.includes("Give it up"));
      await fam.screenshot({ path: `${OUT}/v6-family-claim.png`, fullPage: true });
    } else {
      console.log("no open slots left to claim on this family's page");
    }
    // The pay button must be reachable under the fixed nothing (no tab bar here).
    console.log("family: pay/claim control:", await covered(fam, "form button[type=submit]"));
    await fam.close();
  }

  await b.close();
  console.log("\nerrors:", errors.length === 0 ? "none" : errors.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
