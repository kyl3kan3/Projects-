import { chromium } from "playwright";
const url = process.argv[2];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const msgs = [];
page.on("console", (m) => { if (m.type() === "error") msgs.push(m.text()); });
page.on("pageerror", (e) => msgs.push(`pageerror: ${e.message}`));
// Snapshot the DOM before React hydrates.
await page.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    window.__preHydration = document.body.innerHTML;
  });
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
const diff = await page.evaluate(() => {
  const before = window.__preHydration ?? "";
  const after = document.body.innerHTML;
  if (before === after) return "identical";
  let i = 0;
  while (i < Math.min(before.length, after.length) && before[i] === after[i]) i++;
  return {
    at: i,
    server: before.slice(Math.max(0, i - 160), i + 220),
    client: after.slice(Math.max(0, i - 160), i + 220),
  };
});
console.log("errors:", msgs);
console.log("diff:", typeof diff === "string" ? diff : JSON.stringify(diff, null, 2));
await browser.close();
