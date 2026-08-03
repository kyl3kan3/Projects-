import { chromium } from "playwright";
const OUT = "/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/qf31/shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let failures = 0;
const check = (l, ok, d) => { if (ok) console.log("  ok  ", l); else { failures++; console.log("  FAIL", l, d ?? ""); } };

for (const [name, width, height, reduced] of [
  ["25-landing-mobile", 390, 844, false],
  ["26-landing-desktop", 1280, 900, false],
  ["27-landing-reduced", 390, 844, true],
]) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("http://localhost:3031/", { waitUntil: "networkidle" });
  await page.waitForTimeout(reduced ? 600 : 3600);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const text = await page.textContent("main");
  check(`${name}: no errors`, errors.length === 0, errors);
  const rows = await page.locator(".panel .t-title").count();
  check(`${name}: demo rows landed (${rows})`, rows >= 8, rows);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${name}: no sideways scroll`, overflow <= 0, overflow);
  if (name === "25-landing-mobile") {
    check("one CTA phrase repeated", (text.match(/Start quoting free/g) ?? []).length >= 3, (text.match(/Start quoting free/g) ?? []).length);
    check("no fabricated testimonials", !/trusted by|customers love|\d+,\d+ contractors/i.test(text));
    check("names the enemy", text.includes("10pm"));
    check("honest about being pre-launch", text.includes("pre-launch"));
    // The calculator must respond to input.
    const before = await page.textContent("main");
    await page.locator('input[type="range"]').nth(1).fill("20000");
    await page.waitForTimeout(400);
    const after = await page.textContent("main");
    check("the math recalculates from the visitor's own numbers", before !== after);
  }
  await ctx.close();
}
console.log(failures === 0 ? "\nLANDING CHECKS PASSED" : `\n${failures} LANDING CHECK(S) FAILED`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
