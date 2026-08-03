/**
 * Throwaway end-to-end browser drive at 390x844. Deleted before hand-off.
 */
import { chromium } from "playwright";
import { PDFDocument, StandardFonts } from "pdf-lib";
import fs from "node:fs";

async function main(): Promise<void> {
  const BASE = "http://localhost:3046";
  const OUT = "/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/shots";
  fs.mkdirSync(OUT, { recursive: true });

  const errors: string[] = [];
  const ok: string[] = [];
  function check(label: string, cond: boolean, extra = "") {
    (cond ? ok : errors).push(`${cond ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
    console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
  }

  const browser = await chromium.launch({
    // The pre-installed browser is build 1194; the installed playwright expects 1234, so
    // point it at the binary that is actually here.
    executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const consoleErrors: string[] = [];
  context.on("weberror", (e) => consoleErrors.push(`weberror: ${e.error().message}`));
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`console: ${msg.text()}`);
  });

  /* ---------------------------------------------------------------- landing */
  await page.goto(BASE, { waitUntil: "networkidle" });
  check("landing renders the one sentence", (await page.locator("h1").first().innerText()).includes("Know what you"));
  const fontFamily = await page.locator("h1").first().evaluate((el) => getComputedStyle(el).fontFamily);
  check("display face is IBM Plex Serif", /Plex Serif/i.test(fontFamily), fontFamily);
  const bodyFont = await page.locator("p.t-body").first().evaluate((el) => getComputedStyle(el).fontFamily);
  check("body face is IBM Plex Sans", /Plex Sans/i.test(bodyFont), bodyFont);
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check("no sideways scroll at 390px", bodyOverflow);
  await page.screenshot({ path: `${OUT}/01-landing.png`, fullPage: false });

  // The free clause checker: a real server action round trip.
  await page.getByRole("button", { name: "Check this clause" }).click();
  await page.waitForSelector("blockquote.quote", { timeout: 20000 });
  const checkerText = await page.locator("div.report-page").first().innerText();
  check("checker types the clause", checkerText.includes("Payment Terms"), checkerText.split("\n")[1] ?? "");
  check("checker flags net-60 as caution", /Caution/i.test(checkerText));
  check("checker quotes the pasted clause", checkerText.includes("sixty (60) days"));
  check("checker offers replacement wording", checkerText.includes("thirty (30) days"));
  await page.screenshot({ path: `${OUT}/02-checker.png`, fullPage: false });

  /* ----------------------------------------------------------------- signup */
  const email = `browser+${Date.now()}@example.com`;
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.fill('input[name="name"]', "Rae Whitcombe");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "correct-horse-battery");
  await page.getByRole("button", { name: "Create your account" }).click();
  await page.waitForSelector('p[role="alert"]', { timeout: 15000 });
  const ackError = await page.locator('p[role="alert"]').innerText();
  check("signup refuses without the acknowledgment", /acknowledg/i.test(ackError), ackError.slice(0, 60));
  await page.screenshot({ path: `${OUT}/03-signup-gate.png` });

  await page.check('input[name="acknowledged"]');
  await page.getByRole("button", { name: "Create your account" }).click();
  await page.waitForURL("**/contracts", { timeout: 20000 });
  check("signup with the acknowledgment lands on Contracts", page.url().endsWith("/contracts"));
  const emptyState = await page.locator("main").innerText();
  check("empty state is real content, not a placeholder", emptyState.includes("No contracts yet"));
  await page.screenshot({ path: `${OUT}/04-contracts-empty.png` });

  /* ------------------------------------------------- upload with no credits */
  await page.goto(`${BASE}/contracts/new`, { waitUntil: "networkidle" });
  const buttonLabel = await page.locator("#start-review").innerText();
  check("upload CTA states the price when there are no credits", buttonLabel.includes("$19"), buttonLabel);
  await page.getByRole("button", { name: "Review the demo contract instead" }).click();
  await page.waitForSelector('p[role="alert"]', { timeout: 20000 });
  const noCredits = await page.locator('p[role="alert"]').innerText();
  check("a review without credits is refused honestly", /no reviews left/i.test(noCredits), noCredits.slice(0, 70));

  /* ---------------------------------------------------------------- billing */
  await page.goto(`${BASE}/settings/billing`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Simulate a $19 purchase" }).click();
  await page.waitForSelector('p[role="status"]', { timeout: 20000 });
  await page.waitForTimeout(500);
  const billingText = await page.locator("main").innerText();
  check("the ledger shows the purchase", /Simulated \$19 checkout/.test(billingText));
  check("the balance reads one review", /1 REVIEW LEFT/.test(billingText), billingText.split("\n")[1] ?? "");
  await page.screenshot({ path: `${OUT}/05-billing.png`, fullPage: true });

  /* --------------------------------------------- a non-contract is refused */
  await page.goto(`${BASE}/contracts/new`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "or paste the text" }).click();
  await page.fill(
    'textarea[name="text"]',
    "LUNCH MENU. Soup of the day six dollars. Grilled cheese eight dollars. " +
      "Coffee three dollars. Daily specials are written on the board by the door and rotate weekly. ".repeat(4),
  );
  await page.locator("#start-review").click();
  await page.waitForSelector('p[role="alert"]', { timeout: 20000 });
  const menuError = await page.locator('p[role="alert"]').innerText();
  check("a menu is refused rather than reviewed", /does not read like a contract/i.test(menuError), menuError.slice(0, 70));
  await page.screenshot({ path: `${OUT}/06-non-contract.png` });

  /* -------------------------------------------------- upload a real PDF */
  // Build a genuine multi-page PDF of the fixture MSA and upload it through the form.
  const { FIXTURES } = await import("./src/fixtures/contracts.js");
  const fixture = FIXTURES[0];
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const lines: string[] = [];
  for (const para of fixture.text.split("\n")) {
    if (para.trim() === "") {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, 10) > 480 && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    lines.push("");
  }
  let page1 = doc.addPage([595, 842]);
  let y = 790;
  for (const line of lines) {
    if (y < 60) {
      page1 = doc.addPage([595, 842]);
      y = 790;
    }
    if (line) page1.drawText(line, { x: 56, y, size: 10, font });
    y -= 13.5;
  }
  const pdfPath = "/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/northgate-msa.pdf";
  fs.writeFileSync(pdfPath, await doc.save());
  console.log(`built a ${doc.getPageCount()}-page PDF fixture`);

  await page.goto(`${BASE}/contracts/new`, { waitUntil: "networkidle" });
  await page.setInputFiles('input[name="file"]', pdfPath);
  await page.waitForTimeout(300);
  await page.locator("#start-review").click();
  await page.waitForURL(/\/contracts\/[0-9a-f-]{36}$/, { timeout: 40000 });
  const contractUrl = page.url();
  check("a PDF upload starts a review", true, contractUrl.slice(-8));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/07-processing.png` });
  const processingText = await page.locator("main").innerText();
  const sectionLine = processingText.split("\n").find((l) => l.includes("SECTIONS")) ?? "";
  check(
    "processing (or the finished report) reports real page and section counts",
    /[1-9]\d* (PAGES|SECTIONS)/.test(sectionLine) && !/\b0 SECTIONS/.test(sectionLine),
    sectionLine,
  );

  // Wait for the pipeline to finish (the page advances it itself).
  await page.waitForSelector("text=The clause map", { timeout: 90000 });
  await page.waitForTimeout(400);
  const reportText = await page.locator("main").innerText();
  check("the report renders the flag summary", /\d+ HIGH · \d+ CAUTION · \d+ OK/.test(reportText));
  check("the coverage strip is visible", /SECTIONS · \d+ ANALYZED/.test(reportText));
  check("provenance names the playbook and the extractor", /Scored against .* v1 · extraction local-rules-v1/i.test(reportText));
  const pdfPageCount = /(\d+) PAGES/.exec(reportText)?.[1];
  check("the PDF's real page count is reported", Number(pdfPageCount) >= 4, `${pdfPageCount} pages`);
  await page.screenshot({ path: `${OUT}/08-report.png`, fullPage: false });

  // The first HIGH row is open by default: check quote, explanation, redline.
  const detail = await page.locator("div.expand").first().innerText();
  check("the open row shows the contract's own words", detail.includes("assigns to Client all right"));
  check("the explanation sections are present", /WHAT IT SAYS/i.test(detail) && /WHAT IT MEANS FOR YOU/i.test(detail) && /MARKET/i.test(detail));
  check("HIGH flags carry the lawyer pointer", /worth a lawyer/i.test(detail));
  check("the redline offers replacement language", detail.includes("receipt of payment in full"));

  // The signature: the strike draws once, on scroll-into-view, and the suggestion rises
  // in beneath it. Scroll it into view the way a reader would.
  await page.locator("span.strike-over").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const strikeWidth = await page.locator("span.strike-over").first().evaluate((el) => {
    const style = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      width: Math.round(r.width),
      height: Math.round(r.height),
      drawn: el.getAttribute("data-drawn"),
      clip: style.clipPath,
      decoration: style.textDecorationLine,
      lines: Math.round(r.height / parseFloat(style.lineHeight || "24")),
    };
  });
  check(
    "the redline strike covers the whole phrase, however many lines it wraps to",
    strikeWidth.drawn === "true" &&
      !strikeWidth.clip.includes("100%") &&
      strikeWidth.decoration === "line-through" &&
      strikeWidth.lines >= 2,
    JSON.stringify(strikeWidth),
  );
  const riseOpacity = await page.locator("div.rise").first().evaluate((el) => getComputedStyle(el).opacity);
  check("the suggested language is visible after the draw", Number(riseOpacity) > 0.9, riseOpacity);
  await page.screenshot({ path: `${OUT}/09-redline.png`, fullPage: false });

  // Touch targets and contrast on the report.
  const smallTargets = await page.evaluate(() => {
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll("a, button, input, select, textarea"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // A quiet action grows its hit area with a pseudo-element; measure its real inset.
      const after = getComputedStyle(el, "::after");
      const grown =
        after.content !== "none" && after.position === "absolute"
          ? Math.abs(parseFloat(after.top) || 0) + Math.abs(parseFloat(after.bottom) || 0)
          : 0;
      const effective = r.height + grown;
      if (effective < 44) {
        bad.push(`${el.tagName}.${(el as HTMLElement).className}:${Math.round(effective)}`);
      }
    }
    return bad;
  });
  check("every control meets the 44px touch target", smallTargets.length === 0, smallTargets.slice(0, 6).join(", "));

  /* --------------------------------------------------- coverage honesty note */
  await page.getByRole("button", { name: /NOT ANALYZED/ }).click();
  await page.waitForTimeout(300);
  const coverage = await page.locator("main").innerText();
  check("the coverage list accounts for every section", /not analyzed/i.test(coverage) && /boilerplate/i.test(coverage));
  await page.screenshot({ path: `${OUT}/10-coverage.png`, fullPage: true });

  /* ------------------------------------------------------------ the email */
  const contractId = contractUrl.split("/").pop()!;
  await page.goto(`${contractUrl}/email`, { waitUntil: "networkidle" });
  const draft = await page.locator("textarea").inputValue();
  check("the email draft is assembled from the accepted redlines", draft.includes("1. ") && /Suggested wording:/.test(draft));
  check("the draft is signed by the reader", draft.trim().endsWith("Rae Whitcombe"));
  check("the draft never tells anyone what to do", !/you should|we recommend|legal advice/i.test(draft));
  await page.screenshot({ path: `${OUT}/11-email.png`, fullPage: false });

  /* --------------------------------------------------------------- the PDF */
  const pdfResponse = await page.request.get(`${BASE}/api/reports/${contractId}/pdf`);
  const pdfBytes = await pdfResponse.body();
  check("the PDF export downloads", pdfResponse.ok() && pdfBytes.length > 5000, `${pdfBytes.length} bytes`);
  const pdfText = pdfBytes.toString("latin1");
  check("the PDF is a PDF", pdfText.startsWith("%PDF-"));
  fs.writeFileSync(`${OUT}/report.pdf`, pdfBytes);
  // Read it back and confirm the banner is on every page.
  const { getDocumentProxy, extractText } = await import("unpdf");
  const parsedPdf = await getDocumentProxy(new Uint8Array(pdfBytes));
  const extracted = await extractText(parsedPdf, { mergePages: false });
  const pages = extracted.text as string[];
  const bannerOnEvery = pages.every((p) => p.includes("NOT LEGAL ADVICE"));
  check("the not-legal-advice banner is on every PDF page", bannerOnEvery, `${pages.length} pages`);
  const pdfAllText = pages.join(" ").replace(/\s+/g, " ");
  check("the PDF quotes the contract", pdfAllText.includes("irrevocably assigns"), pdfAllText.slice(0, 0));
  check("the PDF carries page numbers", /\d+ \/ \d+/.test(pages.join(" ")));

  /* ------------------------------------------------------------ share link */
  await page.goto(contractUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Create a read-only link" }).click();
  await page.waitForSelector("text=Turn the link off", { timeout: 20000 });
  const shareUrl = (await page.locator("main").innerText()).match(/http:\/\/localhost:3046\/r\/[\w.-]+/)?.[0];
  check("a share link is minted", Boolean(shareUrl), shareUrl?.slice(0, 40));

  const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const anonPage = await anon.newPage();
  await anonPage.goto(shareUrl!, { waitUntil: "networkidle" });
  const sharedText = await anonPage.locator("main").innerText();
  check("the shared report opens for a stranger", /clause map/i.test(sharedText));
  check("the shared report carries the banner", /Not legal advice/i.test(sharedText));
  check("the shared report has no actions", !/Hold to delete/.test(sharedText));
  await anonPage.screenshot({ path: `${OUT}/12-shared.png`, fullPage: false });

  await page.getByRole("button", { name: "Turn the link off" }).click();
  await page.waitForTimeout(800);
  const revoked = await anonPage.goto(shareUrl!, { waitUntil: "networkidle" });
  check("a revoked link 404s", revoked?.status() === 404, String(revoked?.status()));
  await anon.close();

  /* --------------------------------------------------------- other screens */
  await page.goto(`${BASE}/flags`, { waitUntil: "networkidle" });
  const flagsText = await page.locator("main").innerText();
  check("the flags tab lists this contract's flags", /HIGH · \d+ CAUTION · ACROSS 1 CONTRACTS/.test(flagsText));
  await page.screenshot({ path: `${OUT}/13-flags.png`, fullPage: false });

  await page.goto(`${BASE}/redlines`, { waitUntil: "networkidle" });
  const redlinesText = await page.locator("main").innerText();
  check("the redlines tab lists paste-ready wording", redlinesText.includes("receipt of payment in full"));
  await page.screenshot({ path: `${OUT}/14-redlines.png`, fullPage: false });

  await page.goto(`${BASE}/playbook`, { waitUntil: "networkidle" });
  const playbookText = await page.locator("main").innerText();
  check("the playbook lists every rule", /\d+ RULES/.test(playbookText));
  check("custom rules are gated to Studio", /Custom rules are part of Studio/.test(playbookText));
  const forkVisible = await page.getByRole("button", { name: "Create my house rules" }).count();
  check("no fork button on a per-contract plan", forkVisible === 0);
  await page.screenshot({ path: `${OUT}/15-playbook.png`, fullPage: false });

  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  const settingsText = await page.locator("main").innerText();
  check("settings states the retention window", /Deleted after 90 days/.test(settingsText));
  check("settings states the no-training promise", /never used to train/i.test(settingsText));
  check("settings records the acknowledgment date", /You acknowledged this at signup on \d{4}-\d{2}-\d{2}/.test(settingsText));
  await page.screenshot({ path: `${OUT}/16-settings.png`, fullPage: true });

  /* ------------------------------------------------- reduced motion + print */
  const rmContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    storageState: await context.storageState(),
  });
  const rmPage = await rmContext.newPage();
  await rmPage.goto(contractUrl, { waitUntil: "networkidle" });
  await rmPage.waitForTimeout(500);
  await rmPage.locator("span.strike-over").first().scrollIntoViewIfNeeded();
  await rmPage.waitForTimeout(300);
  const rmStrike = await rmPage.locator("span.strike-over").first().evaluate((el) => ({
    clip: getComputedStyle(el).clipPath,
    animation: getComputedStyle(el).animationName,
  }));
  check(
    "reduced motion shows the strike without animating it",
    !rmStrike.clip.includes("100%") && rmStrike.animation === "none",
    JSON.stringify(rmStrike),
  );
  const rmRise = await rmPage.locator("div.rise").first().evaluate((el) => getComputedStyle(el).opacity);
  check("reduced motion still shows the suggestion", Number(rmRise) > 0.9, rmRise);
  await rmPage.screenshot({ path: `${OUT}/17-reduced-motion.png` });
  await rmContext.close();

  /* ------------------------------------------------------- desktop layout */
  const wide = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: await context.storageState() });
  const widePage = await wide.newPage();
  await widePage.goto(contractUrl, { waitUntil: "networkidle" });
  const tabbarVisible = await widePage.locator("nav.tabbar").isVisible();
  check("the tab bar is replaced by the rail at 1280px", !tabbarVisible);
  const railVisible = await widePage.locator("nav").first().isVisible();
  check("the side rail is visible at 1280px", railVisible);
  await widePage.screenshot({ path: `${OUT}/18-desktop.png`, fullPage: false });
  await widePage.goto(BASE, { waitUntil: "networkidle" });
  await widePage.screenshot({ path: `${OUT}/19-landing-desktop.png`, fullPage: false });
  await wide.close();

  /* ----------------------------------------------------------- delete flow */
  await page.goto(contractUrl, { waitUntil: "networkidle" });
  const holdButton = page.getByRole("button", { name: /Hold to delete/ });
  await holdButton.hover();
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await page.waitForURL("**/contracts", { timeout: 20000 });
  const afterDelete = await page.locator("main").innerText();
  check("hold-to-confirm deletes the contract", afterDelete.includes("No contracts yet"));

  /* ------------------------------------------------------------- wrap up */
  console.log("\nconsole errors:", consoleErrors.length ? consoleErrors : "none");
  console.log(`\n${ok.length} passed, ${errors.length} failed`);
  if (errors.length) console.log(errors.join("\n"));
  await browser.close();
  process.exit(errors.length === 0 && consoleErrors.length === 0 ? 0 : 1);

}

void main();
