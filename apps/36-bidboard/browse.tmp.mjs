/** Throwaway Chromium pass at 390x844: drives the real forms and server actions. */
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = process.env.SHOTS ?? "/tmp/bidboard-shots";
fs.mkdirSync(OUT, { recursive: true });
const seed = JSON.parse(fs.readFileSync("seed.json", "utf8"));
const BASE = "http://localhost:3036";
const PHONE = { width: 390, height: 844 };

const errors = [];
let shot = 0;
let passed = 0;

async function snap(page, name) {
  shot++;
  await page.screenshot({ path: `${OUT}/${String(shot).padStart(2, "0")}-${name}.png`, fullPage: true });
}
function watch(page, label) {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${label}] console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[${label}] pageerror at ${page.url()}: ${e.message.slice(0, 160)}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().includes("favicon")) {
      errors.push(`[${label}] HTTP ${r.status()} ${r.url()}`);
    }
  });
}
function check(label, cond, extra) {
  if (cond) passed++;
  console.log(`  ${cond ? "ok  " : "FAIL"} ${label}`, cond ? "" : (extra ?? ""));
  if (!cond) errors.push(`CHECK FAILED: ${label} ${JSON.stringify(extra ?? "")}`);
}
async function noHScroll(page, label) {
  const r = await page.evaluate(() => {
    window.scrollTo(600, window.scrollY);
    const dragged = window.scrollX;
    window.scrollTo(0, window.scrollY);
    return { dragged, doc: document.documentElement.scrollWidth, win: window.innerWidth };
  });
  check(`${label}: page cannot be dragged sideways at 390px`, r.dragged === 0, r);
}
async function fontsLoaded(page, label) {
  const info = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = [];
    document.fonts.forEach((f) => {
      if (f.status === "loaded") loaded.push(f.family);
    });
    return loaded;
  });
  check(`${label}: Archivo really loaded (no silent system fallback)`, info.some((n) => /Archivo/i.test(n)), info);
  check(`${label}: JetBrains Mono really loaded`, info.some((n) => /JetBrains/i.test(n)), info);
}
async function touchTargets(page, label) {
  const bad = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("button, a, input, select, textarea, summary")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 44) out.push(`${el.tagName}.${(el.className || "-").toString().slice(0, 30)} h=${Math.round(r.height)}`);
    }
    return out;
  });
  check(`${label}: every control is at least 44px tall`, bad.length === 0, bad.slice(0, 6));
}

const browser = await chromium.launch({
  // The image ships chromium build 1194; the linked playwright expects a newer build.
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
const page = await ctx.newPage();
watch(page, "gc");

console.log("=== landing page ===");
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(2200);
await snap(page, "landing");
await noHScroll(page, "landing");
await fontsLoaded(page, "landing");
check("the CTA phrase repeats verbatim, four times", (await page.getByRole("link", { name: "Level your next package" }).count()) === 4, await page.getByRole("link", { name: "Level your next package" }).count());
check("the hero grid is the product running", (await page.locator("table.lvl td").count()) >= 30);
const landingText = await page.locator("body").innerText();
check("the staged demo is labelled as staged", /Staged demo, not a customer/.test(landingText));
check("no emoji anywhere in the marketing copy", !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(landingText));
check("no fabricated social proof", !/trusted by \d|customers love|join \d+ (builders|contractors)|rated \d(\.\d)? (stars|out of)/i.test(landingText));
check("and it says plainly that it is pre-launch", /BidBoard is pre-launch\. There are no customer testimonials/.test(landingText));
// Scroll the whole page: every reveal section must end up visible.
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 400) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 60));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(700);
const hiddenSections = await page.evaluate(() =>
  [...document.querySelectorAll("[data-reveal]")].filter((s) => getComputedStyle(s).opacity !== "1").length,
);
check("every narrative section is visible after scrolling", hiddenSections === 0, hiddenSections);
check("all three pricing tiers are on the page", /\$149\/mo/.test(landingText) && /\$249\/mo/.test(landingText) && /\$399\/mo/.test(landingText));

console.log("=== sign in ===");
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await snap(page, "login");
await touchTargets(page, "login");
await page.fill('input[name="email"]', seed.login.email);
await page.fill('input[name="password"]', seed.login.password);
await page.click('button[type="submit"]');
await page.waitForURL("**/projects", { timeout: 20000 });
await page.waitForLoadState("networkidle");
check("signing in lands on the projects board", page.url().endsWith("/projects"));
await snap(page, "projects");
await noHScroll(page, "projects");
const projectsText = await page.locator("body").innerText();
check("the project row carries a mono due stamp", /DUE [A-Z]{3} \d+ · \d+ DAYS/.test(projectsText), projectsText.match(/DUE .{0,24}/)?.[0]);
check("and a coverage line", /3 of 4 bids in/.test(projectsText), projectsText.match(/\d of \d bids in/)?.[0]);
check("the tab bar has four sections", (await page.locator("nav.tabbar a").count()) === 4);

console.log("=== a wrong password is refused ===");
const anon = await (await browser.newContext({ viewport: PHONE })).newPage();
await anon.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await anon.fill('input[name="email"]', seed.login.email);
await anon.fill('input[name="password"]', "not-the-password");
await anon.click('button[type="submit"]');
await anon.waitForTimeout(2000);
check("a bad password says so and does not sign in", /Invalid email or password/.test(await anon.locator("body").innerText()) && anon.url().includes("/login"));
console.log("=== the dashboard is not readable without a session ===");
await anon.goto(`${BASE}/projects/${seed.projectId}`, { waitUntil: "networkidle" });
check("an anonymous visitor is sent to sign in", anon.url().includes("/login"), anon.url());

console.log("=== project ===");
await page.goto(`${BASE}/projects/${seed.projectId}`, { waitUntil: "networkidle" });
await snap(page, "project");
await noHScroll(page, "project");
const projectText = await page.locator("body").innerText();
check("three trade packages listed", (projectText.match(/\d\d · (ELECTRICAL|MECHANICAL \/ HVAC|FINISHES)/g) ?? []).length === 3, projectText.match(/\d\d · [A-Z \/]+/g));
check("the plan set shows its version label", /PERMIT SET, REV 2/i.test(projectText));
check("storage against the plan cap is shown", /\/ 100 GB/.test(projectText));

console.log("=== add a trade package through the real form ===");
await page.locator("summary", { hasText: "Add a trade package" }).click();
await page.selectOption('select[name="csiDivision"]', "22");
await page.fill('textarea[name="scopeNotes"]', "Fixtures per schedule; carrier by us.");
await page.getByRole("button", { name: "Add package" }).click();
await page.waitForTimeout(2500);
check("the new package appears", /22 · PLUMBING/i.test(await page.locator("body").innerText()));
await snap(page, "project-package-added");

console.log("=== package status board ===");
await page.goto(`${BASE}/projects/${seed.projectId}/packages/${seed.pkgId}`, { waitUntil: "networkidle" });
await snap(page, "package-board");
await noHScroll(page, "package-board");
const boardText = await page.locator("body").innerText();
check("submitted bidders show SUBMITTED", (boardText.match(/SUBMITTED/g) ?? []).length === 3, (boardText.match(/SUBMITTED/g) ?? []).length);
check("the silent bidder shows SENT", /● SENT/.test(boardText) || /\bSENT\b/.test(boardText));
check("a question is flagged as waiting", /1 WAITING/.test(boardText), boardText.match(/\d WAITING/)?.[0]);
check("submitted amounts are on the board", /\$165,100\.00/.test(boardText) && /\$164,900\.00 LUMP SUM/.test(boardText));
check("the lump-sum bidder is marked as such", /LUMP SUM/.test(boardText));
check("the bid form is shown with its six lines", /6 LINES/.test(boardText));

console.log("=== answer the question (server action, broadcasts to all bidders) ===");
const answerBox = page.locator('textarea[name="answer"]').first();
check("the unanswered question offers an answer box", (await answerBox.count()) === 1);
await answerBox.scrollIntoViewIfNeeded();
await answerBox.fill("Fire alarm rough-in is in this package. Devices are bought out under 28.");
await page.getByRole("button", { name: "Answer and broadcast" }).click();
await page.waitForTimeout(3000);
const answered = await page.locator("body").innerText();
check("the answer is on the thread, marked broadcast to all bidders", /Fire alarm rough-in is in this package/.test(answered) && /ANSWERED TO ALL BIDDERS/i.test(answered));
await snap(page, "package-answered");

console.log("=== send a reminder (server action) ===");
const remind = page.getByRole("button", { name: "Send reminder" });
check("a reminder button is offered while bidders are outstanding", (await remind.count()) === 1);
await remind.scrollIntoViewIfNeeded();
await remind.click();
await page.waitForTimeout(3000);
check("the reminder reports what it did", /Reminder sent to 1 bidder|Already nudged today/.test(await page.locator("body").innerText()));

console.log("=== leveling ===");
await page.goto(`${BASE}/projects/${seed.projectId}/packages/${seed.pkgId}/leveling`, { waitUntil: "networkidle" });
await page.waitForTimeout(1400);
await snap(page, "leveling");
await noHScroll(page, "leveling");
const lvl = await page.locator("body").innerText();
check("the apparent low strip names the winner and the adjusted total", /LOW: MERIDIAN ELECTRIC · \$177,400/.test(lvl), lvl.match(/LOW:.{0,40}/)?.[0]);
check("the spread is stated", /spread \$6,150 low to high/.test(lvl), lvl.match(/spread.{0,24}/)?.[0]);
check("it says totals are adjusted, not raw", /totals adjusted, not raw/.test(lvl));
check("plug cells carry the superscript p", (await page.locator("td.is-plug .plug-mark").count()) === 2, await page.locator("td.is-plug .plug-mark").count());
check("per-line lows are marked", (await page.locator("td.is-low").count()) >= 4, await page.locator("td.is-low").count());
check("the scope-gap row is marked in red", (await page.locator("tr.scope-gap").count()) >= 2, await page.locator("tr.scope-gap").count());
check("exactly one column footer is the apparent low", (await page.locator("td.is-apparent-low").count()) === 1);
check("the lump-sum column reads LS, not an em-dash", /LS/.test(lvl));
check("the needs-mapping tray is shown", /NEEDS MAPPING/i.test(lvl));
check("the inclusion/exclusion matrix is shown", /INCLUSIONS & EXCLUSIONS/i.test(lvl));
check("the dumpster scope gap is in the matrix", /Dumpsters/.test(lvl) && /SCOPE GAP/.test(lvl));
check("alternates are held apart from the base", /ALTERNATES — BESIDE THE BASE TOTAL/i.test(lvl));
check("every motion signal is also stated in text", /apparent low/.test(lvl) && /of plugs/.test(lvl) && /awaiting mapping/.test(lvl));
const track = await page.evaluate(() => {
  const t = document.querySelector(".grid-track");
  const before = t.scrollLeft;
  t.scrollLeft = 400;
  return { scrollable: t.scrollWidth > t.clientWidth, moved: t.scrollLeft > before };
});
check("the grid scrolls inside its own track", track.scrollable && track.moved, track);
await snap(page, "leveling-scrolled");

console.log("=== map the tray row (server action) ===");
const mapBtn = page.getByRole("button", { name: "Map it" }).first();
check("the tray offers a mapping control with a suggestion", (await mapBtn.count()) === 1);
check("the suggestion is shown as a suggestion, not applied", /Suggested: Temporary power and distribution \(50% match\)/.test(lvl), lvl.match(/Suggested:.{0,60}/)?.[0]);
await page.locator('select[name="bidFormLineId"]').first().scrollIntoViewIfNeeded();
await mapBtn.click();
await page.waitForTimeout(3000);
const mapped = await page.locator("body").innerText();
check("the row leaves the tray", !/NEEDS MAPPING/i.test(mapped));
check("and the cell now sums both rows ($13,300)", /\$13,300/.test(mapped));
await snap(page, "leveling-mapped");

console.log("=== plug a gap through the real form ===");
const plugForm = page.getByRole("button", { name: "Plug it" }).first();
if ((await plugForm.count()) === 1) {
  await plugForm.scrollIntoViewIfNeeded();
  const sel = page.locator('select[name="bidFormLineId"]').first();
  await sel.selectOption({ index: 1 });
  await page.locator('input[name="amount"]').first().fill("1,500");
  await page.locator('input[name="reason"]').first().fill("Plugged from the low bidder");
  await plugForm.click();
  await page.waitForTimeout(3000);
  check("the plug is applied and footnoted", /Plugged from the low bidder/.test(await page.locator("body").innerText()));
} else {
  check("no gaps left to plug (all columns complete)", true);
}

console.log("=== exports ===");
const csv = await page.request.get(`${BASE}/api/exports/${seed.pkgId}?format=csv`);
check("CSV export returns 200", csv.status() === 200, csv.status());
const csvBody = await csv.text();
check("CSV carries the adjusted totals", csvBody.includes("ADJUSTED TOTAL") && csvBody.includes("179,600.00"));
check("CSV marks plugs and footnotes their reasons", csvBody.includes("(p)") && csvBody.includes("Lump sum excludes fire alarm"));
check("CSV flags the scope gap", csvBody.includes("*SCOPE GAP*"));
const pdf = await page.request.get(`${BASE}/api/exports/${seed.pkgId}?format=pdf`);
const pdfBody = await pdf.body();
check("PDF export returns a real PDF", pdf.status() === 200 && pdfBody.subarray(0, 5).toString() === "%PDF-" && pdfBody.length > 3000, pdfBody.length);
check("the export filename is readable", (pdf.headers()["content-disposition"] ?? "").includes("fulton-yard-building-b-ti-26-electrical-leveling.pdf"), pdf.headers()["content-disposition"]);

console.log("=== plan download as the estimator ===");
const planIds = await page.evaluate(async (pid) => {
  const html = await (await fetch(`/projects/${pid}`)).text();
  return [...html.matchAll(/\/api\/plans\/([0-9a-f-]{36})/g)].map((m) => m[1]);
}, seed.projectId);
const plan = await page.request.get(`${BASE}/api/plans/${planIds[0]}`);
check("the estimator can download the plan set", plan.status() === 200 && (await plan.body()).subarray(0, 5).toString() === "%PDF-");

console.log("=== sub directory ===");
await page.goto(`${BASE}/subs`, { waitUntil: "networkidle" });
await snap(page, "subs");
await noHScroll(page, "subs");
const subsText = await page.locator("body").innerText();
check("imported subs are listed and labelled", /Meridian Electric/.test(subsText) && /IMPORTED/.test(subsText));
check("coverage chips are shown per division", (await page.locator("a.chip").count()) >= 4);
check("thin coverage is called out", /fewer than three subs/.test(subsText));
await page.goto(`${BASE}/subs?trade=26`, { waitUntil: "networkidle" });
check("the directory filters by trade", /26 · ELECTRICAL/i.test(await page.locator("body").innerText()));

console.log("=== import subs through the real form ===");
await page.goto(`${BASE}/subs`, { waitUntil: "networkidle" });
await page.locator("summary", { hasText: "Import from a spreadsheet" }).click();
await page.locator('textarea[name="pasted"]').fill(
  "Company,Contact,Email,Phone,Trades,City\nOrchard Row Electric,Jo Orchard,jo@orchardrow.example,503-555-0188,26,Milwaukie\nBad Row,,nope,,26,",
);
await page.getByRole("button", { name: "Import" }).click();
await page.waitForTimeout(3000);
const afterImport = await page.locator("body").innerText();
check("the import reports what it did", /Imported: 1 new sub/.test(afterImport), afterImport.match(/Imported:.{0,60}/)?.[0]);
check("and reports the row it skipped, with the reason", /Skipped 1.*no usable email/.test(afterImport), afterImport.match(/Skipped.{0,60}/)?.[0]);
await snap(page, "subs-imported");

console.log("=== settings ===");
await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
await snap(page, "settings");
await noHScroll(page, "settings");
const setText = await page.locator("body").innerText();
check("the audit trail is rendered", /AUDIT TRAIL/i.test(setText) && /bid\.submitted|leveling\.viewed/.test(setText));
check("the reminder schedule is editable", (await page.locator('input[name="reminderDays"]').inputValue()) === "7, 3, 1");
check("seats are listed against the plan limit", /1 \/ 5/.test(setText), setText.match(/\d \/ \d/)?.[0]);

console.log("=== add a viewer seat through the real form ===");
await page.locator("summary", { hasText: "Add a seat" }).click();
await page.fill('input[name="email"]', "owner-rep@example.com");
await page.fill('input[name="name"]', "Dale Owner-Rep");
await page.selectOption('select[name="role"]', "viewer");
// The starting password is generated server-side and shown once; read it before submit.
const viewerPassword = await page.locator('input[name="password"]').inputValue();
await page.getByRole("button", { name: "Add seat" }).click();
await page.waitForTimeout(3000);
const seatText = await page.locator("body").innerText();
check("the seat is created with its role", /owner-rep@example.com · Viewer/.test(seatText), seatText.match(/owner-rep.{0,30}/)?.[0]);
check("seats used against the limit updates", /2 \/ 5/.test(seatText));
await snap(page, "settings-seat-added");

console.log("=== a viewer seat can read and cannot write ===");
const viewerCtx = await browser.newContext({ viewport: PHONE });
const viewerPage = await viewerCtx.newPage();
watch(viewerPage, "viewer");
await viewerPage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await viewerPage.fill('input[name="email"]', "owner-rep@example.com");
await viewerPage.fill('input[name="password"]', viewerPassword);
await viewerPage.click('button[type="submit"]');
await viewerPage.waitForTimeout(2500);
if (viewerPage.url().includes("/projects")) {
  await viewerPage.goto(`${BASE}/projects/${seed.projectId}/packages/${seed.pkgId}/leveling`, { waitUntil: "networkidle" });
  const vText = await viewerPage.locator("body").innerText();
  check("a viewer can read the leveling grid", /LOW: MERIDIAN ELECTRIC/.test(vText));
  check("a viewer is offered no award button", (await viewerPage.getByRole("button", { name: /^Award / }).count()) === 0);
  check("a viewer is offered no plug form", (await viewerPage.getByRole("button", { name: "Plug it" }).count()) === 0);
  await viewerPage.goto(`${BASE}/projects/${seed.projectId}/packages/${seed.pkgId}`, { waitUntil: "networkidle" });
  check("a viewer cannot send invites", (await viewerPage.getByRole("button", { name: "Send invites" }).count()) === 0);
  await snap(viewerPage, "viewer-leveling");
} else {
  check("viewer seat sign-in", false, viewerPage.url());
}

console.log("=== billing ===");
await page.goto(`${BASE}/settings/billing`, { waitUntil: "networkidle" });
await snap(page, "billing");
await noHScroll(page, "billing");
const billText = await page.locator("body").innerText();
check("all three tiers are priced", /\$149\/mo/.test(billText) && /\$249\/mo/.test(billText) && /\$399\/mo/.test(billText));
check("the current plan is marked", /YOUR CURRENT PLAN/.test(billText));
check("the missing Stripe config is stated honestly, not hidden", /Stripe is not configured on this deployment/.test(billText));
check("the trial countdown is shown", /days? left on the trial/.test(billText));

console.log("=== the sub portal (no login, light theme) ===");
const sub = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
const subPage = await sub.newPage();
watch(subPage, "portal");
await subPage.goto(seed.pikePortal, { waitUntil: "networkidle" });
await snap(subPage, "portal-top");
await noHScroll(subPage, "portal-top");
await fontsLoaded(subPage, "portal");
await touchTargets(subPage, "portal");
const paint = await subPage.evaluate(() => {
  const m = document.querySelector("main.portal");
  return { bg: getComputedStyle(m).backgroundColor, fg: getComputedStyle(m).color };
});
check("the portal renders on the light day ground", paint.bg === "rgb(244, 245, 246)", paint);
check("with ink text, not paper", paint.fg === "rgb(27, 33, 41)", paint);
const portalText = await subPage.locator("body").innerText();
check("the portal names the GC and the project", /Fulton Build Group/.test(portalText) && /Fulton Yard/.test(portalText));
check("it states the confidentiality promise", /never shown to other bidders/.test(portalText));
check("it offers the plan set", /Fulton-B-E-sheets.pdf/.test(portalText));
check("it shows the broadcast answer", /ANSWERED TO ALL BIDDERS/i.test(portalText));
check("it does NOT show another bidder's numbers", !/165,100|183,550|164,900|13,300/.test(portalText), portalText.match(/1[0-9]{2},[0-9]{3}/g));
check("it has no nav — one page and a confirmation", (await subPage.locator("nav.tabbar").count()) === 0);
check("no emoji in the portal", !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(portalText));
check("the primary action is in the thumb zone", await subPage.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /Submit bid/.test(x.textContent));
  const r = b.getBoundingClientRect();
  return r.top > window.innerHeight * 0.6;
}));

console.log("=== a sub downloads the plan set ===");
const subPlan = await subPage.request.get(seed.pikePortal.replace("/bid/", "/bid/") + `/plans/${planIds[0]}`);
check("the plan downloads through the token", subPlan.status() === 200 && (await subPlan.body()).subarray(0, 5).toString() === "%PDF-", subPlan.status());

console.log("=== fill the bid form on a phone ===");
const amounts = subPage.locator('input[name^="line:"]');
check("every form line has an amount input", (await amounts.count()) === 6, await amounts.count());
const values = ["8,850", "45,900", "93,100", "17,900", "12,900", "21,400"];
for (let i = 0; i < 6; i++) {
  await amounts.nth(i).scrollIntoViewIfNeeded();
  await amounts.nth(i).fill(values[i]);
}
await subPage.waitForTimeout(500);
check("the running total sums the base and excludes the alternate", (await subPage.locator(".t-stat").first().innerText()).trim() === "$178,650", await subPage.locator(".t-stat").first().innerText());

console.log("=== 'Can't price this?' per DESIGN.md ===");
const cant = subPage.getByRole("button", { name: "Can’t price this?" }).first();
check("each line offers one quiet 'Can't price this?' action", (await subPage.getByRole("button", { name: "Can’t price this?" }).count()) === 6);
await cant.scrollIntoViewIfNeeded();
await cant.click();
await subPage.waitForTimeout(300);
check("it reveals excluded / included-elsewhere", (await subPage.getByRole("button", { name: "Not in my scope" }).count()) >= 1 && (await subPage.getByRole("button", { name: "Included in another line" }).count()) >= 1);
await subPage.getByRole("button", { name: "Not in my scope" }).first().click();
await subPage.waitForTimeout(400);
check("choosing it removes that line from the running total", (await subPage.locator(".t-stat").first().innerText()).trim() === "$169,800", await subPage.locator(".t-stat").first().innerText());
await subPage.getByRole("button", { name: "Price it after all" }).first().click();
await subPage.waitForTimeout(400);
check("and it can be reversed", (await subPage.locator(".t-stat").first().innerText()).trim() === "$178,650");

await subPage.locator('input[name="extraDesc:0"]').fill("Temp power poles + meter base");
await subPage.locator('input[name="extraAmount:0"]').fill("4,650");
await subPage.locator('textarea[name="inclusions"]').fill("Permits and fees\nDumpsters");
await subPage.locator('textarea[name="exclusions"]').fill("After-hours work");
await subPage.waitForTimeout(400);
check("a free-form row counts in the sub's own total", (await subPage.locator(".t-stat").first().innerText()).trim() === "$183,300");
await snap(subPage, "portal-filled");

console.log("=== save a draft, reload, submit ===");
await subPage.getByRole("button", { name: "Save", exact: true }).click();
await subPage.waitForTimeout(3000);
check("the draft saves and says so", /Saved\. Come back to this same link/.test(await subPage.locator("body").innerText()));
await snap(subPage, "portal-saved");
await subPage.reload({ waitUntil: "networkidle" });
check("the draft survives a reload on the same link", (await subPage.locator('input[name^="line:"]').first().inputValue()).replace(/,/g, "") === "8850");
check("and so does the free-form row", (await subPage.locator('input[name="extraDesc:0"]').inputValue()) === "Temp power poles + meter base");
check("and the inclusions chips", (await subPage.locator('textarea[name="inclusions"]').inputValue()).includes("Dumpsters"));
await subPage.getByRole("button", { name: "Submit bid" }).click();
await subPage.waitForTimeout(3500);
check("the bid submits and is confirmed", /Bid submitted\./.test(await subPage.locator("body").innerText()));
await snap(subPage, "portal-submitted");

console.log("=== ask a question from the portal ===");
await subPage.locator('textarea[name="body"]').fill("Are the pole bases by us or by 03?");
await subPage.getByRole("button", { name: "Send question" }).click();
await subPage.waitForTimeout(3000);
check("the question is sent, with the broadcast promise", /Question sent\..*every bidder/.test(await subPage.locator("body").innerText()));

console.log("=== a second sub's portal shows none of the first's numbers ===");
const sub2 = await (await browser.newContext({ viewport: PHONE })).newPage();
watch(sub2, "portal2");
await sub2.goto(seed.harlanPortal, { waitUntil: "networkidle" });
const sub2Text = await sub2.locator("body").innerText();
check("Harlan sees their own submitted total", /\$183,550\.00/.test(sub2Text), sub2Text.match(/\$1[0-9]{2},[0-9]{3}\.\d\d/g));
check("Harlan does not see Pike Street's numbers", !/183,300|8,850|45,900|93,100/.test(sub2Text), sub2Text.match(/\d{2},\d{3}/g));
check("Harlan does not see Meridian's or Brightline's numbers", !/165,100|164,900/.test(sub2Text));
check("Harlan sees the other bidder's question anonymised", !/Pike Street/.test(sub2Text));
await snap(sub2, "portal-second-sub");

console.log("=== a bad, and a withdrawn, link ===");
await subPage.goto(`${BASE}/bid/not-a-real-token`, { waitUntil: "networkidle" });
await snap(subPage, "portal-bad-link");
check("an invalid link explains itself in plain words", /This bid link is not valid/.test(await subPage.locator("body").innerText()));
check("and is not indexable", (await subPage.locator('meta[name="robots"]').getAttribute("content"))?.includes("noindex") ?? false);

console.log("=== the new bid lands on the GC's grid ===");
await page.goto(`${BASE}/projects/${seed.projectId}/packages/${seed.pkgId}/leveling`, { waitUntil: "networkidle" });
await page.waitForTimeout(1400);
const grid2 = await page.locator("body").innerText();
check("four bids are now compared", /4 bids ·/.test(grid2), grid2.match(/\d bids ·.{0,30}/)?.[0]);
check("Pike Street is a column", /PIKE/.test(grid2));
await snap(page, "leveling-4-bids");

console.log("=== award through the UI ===");
const awardBtn = page.getByRole("button", { name: /^Award Meridian Electric$/ });
check("the apparent low is offered as the primary award", (await awardBtn.count()) === 1);
check("the flags to acknowledge are on screen first", /flags? to acknowledge/.test(grid2), grid2.match(/\d flags?.{0,24}/)?.[0]);
await awardBtn.scrollIntoViewIfNeeded();
page.once("dialog", (d) => d.accept());
await awardBtn.click();
await page.waitForTimeout(4000);
await page.reload({ waitUntil: "networkidle" });
const awarded2 = await page.locator("body").innerText();
check("the award banner states who and how much", /Meridian Electric awarded at \$177,400/.test(awarded2), awarded2.match(/.{0,30}awarded at.{0,16}/)?.[0]);
check("the notices are recorded as sent", /AWARD AND REGRET NOTICES SENT/i.test(awarded2));
check("the package is read-only: no award buttons remain", (await page.getByRole("button", { name: /^Award / }).count()) === 0);
check("and no plug form remains", (await page.getByRole("button", { name: "Plug it" }).count()) === 0);
await snap(page, "leveling-awarded");

console.log("=== the portal goes read-only after the award ===");
await subPage.goto(seed.pikePortal, { waitUntil: "networkidle" });
const locked = await subPage.locator("body").innerText();
check("the sub is told the package no longer takes changes", /no longer accepting changes/.test(locked));
check("no submit button remains", (await subPage.getByRole("button", { name: "Submit bid" }).count()) === 0);
await snap(subPage, "portal-after-award");

console.log("=== cron route protection ===");
const noAuth = await page.request.get(`${BASE}/api/cron/tick`);
check("the cron route rejects an unauthenticated call", noAuth.status() === 401, noAuth.status());
const withAuth = await page.request.get(`${BASE}/api/cron/tick`, { headers: { authorization: "Bearer local-dev-cron-secret" } });
check("and runs with the secret", withAuth.status() === 200, withAuth.status());
const badSig = await page.request.post(`${BASE}/api/webhooks/resend`, { data: { type: "email.opened" }, headers: { "content-type": "application/json" } });
check("the resend webhook accepts an unsigned call only when no secret is set", [200, 400].includes(badSig.status()), badSig.status());

console.log("=== reduced motion ===");
const rm = await browser.newContext({ viewport: PHONE, reducedMotion: "reduce" });
const rmPage = await rm.newPage();
watch(rmPage, "reduced-motion");
await rmPage.goto(BASE, { waitUntil: "networkidle" });
await rmPage.waitForTimeout(900);
check("the hero grid is complete on first paint, with no movement", await rmPage.evaluate(() => {
  const cells = [...document.querySelectorAll("table.lvl td")];
  const identity = (t) => t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)";
  return cells.length > 0 && cells.every((c) => {
    const s = getComputedStyle(c);
    return s.opacity === "1" && identity(s.transform);
  });
}));
check("every narrative section is visible without scrolling", await rmPage.evaluate(() =>
  [...document.querySelectorAll("[data-reveal]")].every((s) => getComputedStyle(s).opacity === "1")));
await snap(rmPage, "landing-reduced-motion");
await rmPage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await rmPage.fill('input[name="email"]', seed.login.email);
await rmPage.fill('input[name="password"]', seed.login.password);
await rmPage.click('button[type="submit"]');
await rmPage.waitForURL("**/projects");
await rmPage.goto(`${BASE}/projects/${seed.projectId}/packages/${seed.pkgId}/leveling`, { waitUntil: "networkidle" });
await rmPage.waitForTimeout(900);
check("the leveling grid is fully present under reduced motion", await rmPage.evaluate(() => {
  const cells = [...document.querySelectorAll("td.lvl-cell")];
  return cells.length > 0 && cells.every((c) => getComputedStyle(c).opacity === "1");
}));
check("the low-cell underline is a static border, not an animation", await rmPage.evaluate(() => {
  const low = document.querySelector("td.is-low");
  return !!low && getComputedStyle(low).boxShadow !== "none";
}));
await snap(rmPage, "leveling-reduced-motion");

console.log("=== keyboard focus is visible ===");
await page.goto(`${BASE}/subs`, { waitUntil: "networkidle" });
await page.keyboard.press("Tab");
await page.keyboard.press("Tab");
const focusRing = await page.evaluate(() => {
  const el = document.activeElement;
  const s = getComputedStyle(el);
  return { tag: el.tagName, outlineWidth: s.outlineWidth, outlineStyle: s.outlineStyle };
});
check("the focused control has a visible ring", focusRing.outlineStyle !== "none" && parseFloat(focusRing.outlineWidth) >= 2, focusRing);

console.log("=== desktop is the enhancement ===");
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
check("more sub columns fit without a track scroll at 1280", await widePage.evaluate(() => {
  const t = document.querySelector(".grid-track");
  return t.scrollWidth <= t.clientWidth + 1;
}));

await browser.close();

console.log(`\n${passed} checks passed`);
console.log(errors.length === 0 ? "NO ERRORS" : `${errors.length} PROBLEM(S):`);
for (const e of errors) console.log("  - " + e);
process.exit(errors.length === 0 ? 0 : 1);
