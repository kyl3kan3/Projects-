import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const email = `dbg+${Math.random().toString(36).slice(2,7)}@northwind.dev`;
await page.goto("http://localhost:3030/signup", { waitUntil: "networkidle" });
await page.fill('input[name="orgName"]', "Dbg Co");
await page.fill('input[name="personName"]', "Dbg");
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "correct-horse-battery");
await page.click('button[type="submit"]');
await page.waitForURL("**/connect", { timeout: 20000 });
await page.fill('input[name="accountId"]', "481029384756");
await page.fill('input[name="label"]', "4821-prod");
await page.getByRole("button", { name: /Add account/i }).click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /I created the stack/i }).click();
await page.waitForSelector("text=/cost rows backfilled/", { timeout: 60000 });
await fetch("http://localhost:3030/api/cron/tick", { headers: { authorization: "Bearer 4f1c8a2e6b0d4f7a9c3e5b1d7f9a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6a" } });
await page.goto("http://localhost:3030/anomalies", { waitUntil: "networkidle" });
await page.getByRole("link", { name: /Investigate/i }).first().click();
await page.waitForURL(/anomalies\/[0-9a-f-]+$/);
await page.waitForTimeout(2000);
console.log(await page.evaluate(() => {
  const s = document.querySelector(".survey-line");
  if (!s) return "no survey line in the DOM";
  const cs = getComputedStyle(s);
  return {
    attrs: { x1: s.getAttribute("x1"), y1: s.getAttribute("y1"), x2: s.getAttribute("x2"), y2: s.getAttribute("y2") },
    dasharray: cs.strokeDasharray, dashoffset: cs.strokeDashoffset, animation: cs.animationName, stroke: cs.stroke,
  };
}));
console.log(await page.evaluate(() => [...document.querySelectorAll(".pennant line")].map(l => l.getAttribute("stroke"))));
await browser.close();
