import { chromium } from "playwright";
import fs from "node:fs";

const OUT = process.env.SHOTS ?? "/tmp/bidboard-shots";
fs.mkdirSync(OUT, { recursive: true });
const seed = JSON.parse(fs.readFileSync("seed.json", "utf8"));
const BASE = "http://localhost:3036";

const errors = [];
let shot = 0;
async function snap(page, name) {
  shot++;
  await page.screenshot({ path: `${OUT}/${String(shot).padStart(2, "0")}-${name}.png`, fullPage: true });
  console.log(`  shot ${name}`);
}
function watch(page, label) {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${label}] console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on("requestfailed", (r) => {
    // Next aborts in-flight RSC prefetches on navigation; that is not a failure.
    const benign = r.url().includes("favicon") || r.url().includes("_rsc=") ||
      (r.failure()?.errorText === "net::ERR_ABORTED");
    if (!benign) errors.push(`[${label}] requestfailed: ${r.url()} ${r.failure()?.errorText}`);
  });
}
function check(label, cond, extra) {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${label}`, cond ? "" : (extra ?? ""));
  if (!cond) errors.push(`CHECK FAILED: ${label} ${extra ?? ""}`);
}
async function noHScroll(page, label) {
  const r = await page.evaluate(() => {
    window.scrollTo(600, window.scrollY);
    const dragged = window.scrollX;
    window.scrollTo(0, window.scrollY);
    return {
      dragged,
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
      body: document.body.scrollWidth,
    };
  });
  check(`${label}: page cannot be dragged sideways`, r.dragged === 0, JSON.stringify(r));
}
async function fontsLoaded(page, label) {
  const info = await page.evaluate(async () => {
    await document.fonts.ready;
    const names = new Set();
    document.fonts.forEach((f) => { if (f.status === "loaded") names.add(f.family); });
    const probe = document.createElement("span");
    probe.style.font = "16px var(--font-sans)";
    probe.textContent = "BidBoard";
    document.body.appendChild(probe);
    const used = getComputedStyle(probe).fontFamily;
    probe.remove();
    return { loaded: [...names], used, count: document.fonts.size };
  });
  check(`${label}: Archivo actually loaded`, info.loaded.some((n) => /Archivo/i.test(n)), JSON.stringify(info));
  check(`${label}: JetBrains Mono actually loaded`, info.loaded.some((n) => /JetBrains/i.test(n)), JSON.stringify(info.loaded));
}

const browser = await chromium.launch({
  // The shared image ships chromium build 1194; the linked playwright expects a
  // newer build number, so point it at the browser that is actually here.
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
watch(page, "gc");

console.log("=== landing ===");
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await snap(page, "landing");
await noHScroll(page, "landing");
await fontsLoaded(page, "landing");
check("landing repeats the CTA verbatim", (await page.getByRole("link", { name: "Level your next package" }).count()) >= 3, await page.getByRole("link", { name: "Level your next package" }).count());
check("landing shows the grid", (await page.locator("table.lvl td").count()) > 20);
check("no emoji in the landing copy", !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(await page.locator("body").innerText()));

console.log("=== login ===");
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await snap(page, "login");
await page.fill('input[name="email"]', seed.login.email);
await page.fill('input[name="password"]', seed.login.password);
await page.click('button[type="submit"]');
await page.waitForURL("**/projects", { timeout: 15000 });
await page.waitForLoadState("networkidle");
check("logged in and landed on /projects", page.url().endsWith("/projects"));
await snap(page, "projects");
await noHScroll(page, "projects");
check("project row shows the due stamp", /DUE [A-Z]{3} \d+/.test(await page.locator("body").innerText()));
check("coverage line present", /bids in/.test(await page.locator("body").innerText()));
check("tab bar rendered", (await page.locator("nav.tabbar a").count()) === 4);

console.log("=== project ===");
await page.goto(`${BASE}/projects/${seed.projectId}`, { waitUntil: "networkidle" });
await snap(page, "project");
await noHScroll(page, "project");
const projectText = await page.locator("body").innerText();
check("three packages listed", (projectText.match(/\d\d · (ELECTRICAL|MECHANICAL \/ HVAC|FINISHES)/g) ?? []).length === 3, projectText.match(/\d\d · [A-Z \/]+/g));
check("plan file listed with version", /PERMIT SET, REV 2/i.test(projectText));

console.log("=== package board ===");
await page.goto(`${BASE}/projects/${seed.projectId}/packages/${seed.pkgId}`, { waitUntil: "networkidle" });
await snap(page, "package-board");
await noHScroll(page, "package-board");
const boardText = await page.locator("body").innerText();
check("board shows SUBMITTED pills", /SUBMITTED/.test(boardText));
check("board shows a silent bidder as SENT", /SENT/.test(boardText));
check("board shows the question waiting", /WAITING/.test(boardText));
check("board shows submitted amounts", /\$165,100/.test(boardText), boardText.slice(0, 400));

// Answer the question through the real UI.
console.log("=== answer the question (server action) ===");
const answerBox = page.locator('textarea[name="answer"]').first();
check("an unanswered question is waiting for an answer", (await answerBox.count()) === 1);
if ((await answerBox.count()) === 1) {
  await answerBox.scrollIntoViewIfNeeded();
  await answerBox.fill("Fire alarm rough-in is in this package. Devices are bought out under 28.");
  await page.getByRole("button", { name: "Answer and broadcast" }).first().click();
  await page.waitForTimeout(2500);
}
const afterAnswer = await page.locator("body").innerText();
check(
  "the answer is on the thread, marked as broadcast to all bidders",
  /Fire alarm rough-in is in this package/.test(afterAnswer) &&
    /ANSWERED TO ALL BIDDERS/i.test(afterAnswer),
  afterAnswer.match(/.{0,60}ANSWERED.{0,40}/i)?.[0],
);
await snap(page, "package-answered");

console.log("=== send a reminder (server action) ===");
const remind = page.getByRole("button", { name: "Send reminder" });
if (await remind.count()) {
  await remind.first().scrollIntoViewIfNeeded();
  await remind.first().click();
  await page.waitForTimeout(2500);
  const afterRemind = await page.locator("body").innerText();
  check("reminder reported sent", /Reminder sent to \d+ bidder|Already nudged today|Nobody left/.test(afterRemind));
}

console.log("=== leveling ===");
await page.goto(`${BASE}/projects/${seed.projectId}/packages/${seed.pkgId}/leveling`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await snap(page, "leveling");
await noHScroll(page, "leveling");
const lvl = await page.locator("body").innerText();
check("apparent low strip present", /LOW: MERIDIAN ELECTRIC · \$177,400/.test(lvl), lvl.match(/LOW:.{0,40}/)?.[0]);
check("spread shown", /spread \$6,150/.test(lvl), lvl.match(/spread.{0,20}/)?.[0]);
check("plug rendered with the superscript p", (await page.locator("td.is-plug .plug-mark").count()) >= 2, await page.locator("td.is-plug").count());
check("a per-row low cell is marked", (await page.locator("td.is-low").count()) >= 4, await page.locator("td.is-low").count());
check("scope gap row marked", (await page.locator("tr.scope-gap").count()) >= 2, await page.locator("tr.scope-gap").count());
check("apparent-low footer underlined", (await page.locator("td.is-apparent-low").count()) === 1);
check("needs-mapping tray shown", /NEEDS MAPPING/i.test(lvl));
check("matrix shown with a dumpster gap", /INCLUSIONS & EXCLUSIONS/i.test(lvl) && /Dumpsters/.test(lvl));
check("grid scrolls inside its own track", await page.evaluate(() => {
  const t = document.querySelector(".grid-track");
  return !!t && t.scrollWidth > t.clientWidth;
}));
const trackScroll = await page.evaluate(() => {
  const t = document.querySelector(".grid-track");
  t.scrollLeft = 400;
  return t.scrollLeft;
});
check("grid track actually scrolls horizontally", trackScroll > 0, trackScroll);
await snap(page, "leveling-scrolled");

console.log("=== map a tray row (server action) ===");
const mapBtn = page.getByRole("button", { name: "Map it" }).first();
check("a tray row offers a mapping control", (await mapBtn.count()) === 1);
if ((await mapBtn.count()) === 1) {
  await page.locator('select[name="bidFormLineId"]').first().scrollIntoViewIfNeeded();
  await mapBtn.click();
  await page.waitForTimeout(2500);
}
const afterMap = await page.locator("body").innerText();
check(
  "the mapped row left the tray",
  !/NEEDS MAPPING/i.test(afterMap),
  afterMap.match(/.{0,50}NEEDS MAPPING.{0,60}/i)?.[0],
);
check(
  "the mapped amount is now summed into the cell",
  /\$13,300/.test(afterMap),
  afterMap.match(/Temporary power[^\n]*/)?.[0],
);
await snap(page, "leveling-mapped");

console.log("=== export ===");
const csv = await page.request.get(`${BASE}/api/exports/${seed.pkgId}?format=csv`);
check("CSV export 200", csv.status() === 200, csv.status());
const csvBody = await csv.text();
check("CSV has the adjusted totals", csvBody.includes("ADJUSTED TOTAL") && csvBody.includes("179,600.00"), csvBody.split("\n").find((l) => l.startsWith("ADJUSTED")));
const pdf = await page.request.get(`${BASE}/api/exports/${seed.pkgId}?format=pdf`);
check("PDF export 200 and is a PDF", pdf.status() === 200 && (await pdf.body()).subarray(0, 5).toString() === "%PDF-");

console.log("=== subs ===");
await page.goto(`${BASE}/subs`, { waitUntil: "networkidle" });
await snap(page, "subs");
await noHScroll(page, "subs");
const subsText = await page.locator("body").innerText();
check("directory lists imported subs", /Meridian Electric/.test(subsText) && /IMPORTED/.test(subsText));
check("coverage chips shown", (await page.locator("a.chip").count()) >= 3);

console.log("=== settings ===");
await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
await snap(page, "settings");
await noHScroll(page, "settings");
const setText = await page.locator("body").innerText();
check("audit trail rendered", /AUDIT TRAIL/i.test(setText) && /leveling\.viewed|bid\.submitted/.test(setText));
check(
  "reminder schedule shown",
  (await page.locator('input[name="reminderDays"]').inputValue()) === "7, 3, 1",
  await page.locator('input[name="reminderDays"]').inputValue(),
);

await page.goto(`${BASE}/settings/billing`, { waitUntil: "networkidle" });
await snap(page, "billing");
await noHScroll(page, "billing");
check("three plans priced", /\$149\/mo/.test(await page.locator("body").innerText()));

console.log("=== plan download ===");
const planRes = await page.request.get(`${BASE}/projects/${seed.projectId}`);
check("project page serves 200", planRes.status() === 200);

console.log("=== the sub portal (no login) ===");
const sub = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const subPage = await sub.newPage();
watch(subPage, "portal");
await subPage.goto(seed.pikePortal, { waitUntil: "networkidle" });
await snap(subPage, "portal-top");
await noHScroll(subPage, "portal-top");
await fontsLoaded(subPage, "portal");
const portalText = await subPage.locator("body").innerText();
const portalPaint = await subPage.evaluate(() => {
  const m = document.querySelector("main.portal");
  return { bg: getComputedStyle(m).backgroundColor, fg: getComputedStyle(m).color };
});
check("portal renders on the light day ground", portalPaint.bg === "rgb(244, 245, 246)", portalPaint);
check("portal text is ink, not paper", portalPaint.fg === "rgb(27, 33, 41)", portalPaint);
check("portal shows the GC and project", /Fulton Build Group/.test(portalText) && /Fulton Yard/.test(portalText));
check("portal shows the confidentiality promise", /never shown to other bidders/.test(portalText));
check("portal shows the plan set", /Fulton-B-E-sheets.pdf/.test(portalText));
check("portal shows the answered Q&A", /ANSWERED TO ALL BIDDERS/.test(portalText));
check("portal does NOT show another bidder's numbers", !/165,100|183,550|164,900/.test(portalText), portalText.match(/1\d\d,\d\d\d/g));
check("portal has no nav", (await subPage.locator("nav.tabbar").count()) === 0);
check("no emoji in the portal", !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(portalText));

console.log("=== fill and submit a bid on a phone ===");
const amounts = subPage.locator('input[name^="line:"]');
const n = await amounts.count();
check("bid form renders every line", n === 6, n);
const values = ["8,850", "45,900", "93,100", "17,900", "12,900", "21,400"];
for (let i = 0; i < n; i++) {
  await amounts.nth(i).scrollIntoViewIfNeeded();
  await amounts.nth(i).fill(values[i]);
}
await subPage.waitForTimeout(400);
const runningTotal = await subPage.locator(".t-stat").first().innerText();
check("running total sums the base only (excludes the alternate)", runningTotal.trim() === "$178,650", runningTotal);

// A touch target audit on the portal.
const smallTargets = await subPage.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll("button, a, input, select, textarea, summary")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height < 44) bad.push(`${el.tagName}.${el.className || "-"} h=${Math.round(r.height)}`);
  }
  return bad;
});
check("every portal control is >=44px tall", smallTargets.length === 0, smallTargets.slice(0, 6));

await subPage.locator('input[name="extraDesc:0"]').fill("Temp power poles + meter base");
await subPage.locator('input[name="extraAmount:0"]').fill("4,650");
await subPage.locator('textarea[name="inclusions"]').fill("Permits and fees\nDumpsters");
await subPage.locator('textarea[name="exclusions"]').fill("After-hours work");
await snap(subPage, "portal-filled");

// Save first, then submit — the two-intent form.
await subPage.getByRole("button", { name: "Save", exact: true }).click();
await subPage.waitForTimeout(2500);
check("draft saved via the real form", /Saved\./.test(await subPage.locator("body").innerText()));
await snap(subPage, "portal-saved");

await subPage.reload({ waitUntil: "networkidle" });
const reloaded = await subPage.locator('input[name^="line:"]').first().inputValue();
check("draft survives a reload", reloaded.replace(/,/g, "") === "8850", reloaded);
const reloadedExtra = await subPage.locator('input[name="extraDesc:0"]').inputValue();
check("the free-form row survives too", reloadedExtra === "Temp power poles + meter base", reloadedExtra);

await subPage.getByRole("button", { name: "Submit bid" }).click();
await subPage.waitForTimeout(3000);
const afterSubmit = await subPage.locator("body").innerText();
check("bid submitted via the real form", /Bid submitted\./.test(afterSubmit), afterSubmit.match(/.{0,50}submitted.{0,50}/)?.[0]);
await snap(subPage, "portal-submitted");

console.log("=== ask a question from the portal ===");
await subPage.locator('textarea[name="body"]').fill("Are the site lighting pole bases by us or by 03?");
await subPage.getByRole("button", { name: "Send question" }).click();
await subPage.waitForTimeout(2500);
check("question sent", /Question sent/.test(await subPage.locator("body").innerText()));

console.log("=== a bad link ===");
await subPage.goto(`${BASE}/bid/not-a-real-token`, { waitUntil: "networkidle" });
await snap(subPage, "portal-bad-link");
check("an invalid link explains itself", /not valid/.test(await subPage.locator("body").innerText()));

console.log("=== the new bid appears on the GC's grid ===");
await page.goto(`${BASE}/projects/${seed.projectId}/packages/${seed.pkgId}/leveling`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const grid2 = await page.locator("body").innerText();
check("4 bids now compared", /4 bids/.test(grid2), grid2.match(/\d bids ·.{0,40}/)?.[0]);
check("Pike Street is a column", /PIKE/.test(grid2));
await snap(page, "leveling-4-bids");

console.log("=== award through the UI ===");
const awardBtn = page.getByRole("button", { name: /^Award Meridian Electric$/ });
await awardBtn.scrollIntoViewIfNeeded();
page.once("dialog", (d) => d.accept());
await awardBtn.click();
await page.waitForTimeout(3500);
await page.reload({ waitUntil: "networkidle" });
const afterAward = await page.locator("body").innerText();
check("award banner shown", /awarded at \$177,400/.test(afterAward), afterAward.match(/.{0,40}awarded at.{0,20}/)?.[0]);
check("notices recorded as sent", /AWARD AND REGRET NOTICES SENT/i.test(afterAward));
check("the package is read-only after the award", (await page.getByRole("button", { name: /^Award / }).count()) === 0);
await snap(page, "leveling-awarded");

console.log("=== the portal is read-only after the award ===");
await subPage.goto(seed.pikePortal, { waitUntil: "networkidle" });
const lockedText = await subPage.locator("body").innerText();
check("portal says the package is closed to changes", /no longer accepting changes/.test(lockedText), lockedText.slice(0, 300));
await snap(subPage, "portal-after-award");

console.log("=== reduced motion ===");
const rm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const rmPage = await rm.newPage();
watch(rmPage, "reduced-motion");
await rmPage.goto(BASE, { waitUntil: "networkidle" });
await rmPage.waitForTimeout(900);
const heroVisible = await rmPage.evaluate(() => {
  const cells = [...document.querySelectorAll("table.lvl td")];
  return cells.length > 0 && cells.every((c) => getComputedStyle(c).opacity === "1");
});
check("reduced motion: the hero grid is complete on first paint", heroVisible);
await snap(rmPage, "landing-reduced-motion");

console.log("=== desktop ===");
const wide = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const widePage = await wide.newPage();
watch(widePage, "desktop");
await widePage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await widePage.fill('input[name="email"]', seed.login.email);
await widePage.fill('input[name="password"]', seed.login.password);
await widePage.click('button[type="submit"]');
await widePage.waitForURL("**/projects");
await widePage.goto(`${BASE}/projects/${seed.projectId}/packages/${seed.pkgId}/leveling`, { waitUntil: "networkidle" });
await widePage.waitForTimeout(900);
await snap(widePage, "leveling-desktop");
await noHScroll(widePage, "leveling-desktop");

await browser.close();

console.log("\n" + (errors.length === 0 ? "NO ERRORS" : `${errors.length} PROBLEM(S):`));
for (const e of errors) console.log("  - " + e);
process.exit(errors.length === 0 ? 0 : 1);
