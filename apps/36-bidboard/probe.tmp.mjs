import { chromium } from "playwright";
import fs from "node:fs";
const seed = JSON.parse(fs.readFileSync("seed.json", "utf8"));
const B = "http://localhost:3036";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
await p.goto(`${B}/login`);
await p.fill('input[name="email"]', seed.login.email);
await p.fill('input[name="password"]', seed.login.password);
await p.click('button[type="submit"]');
await p.waitForURL("**/projects");

await p.goto(`${B}/projects/${seed.projectId}`, { waitUntil: "networkidle" });
console.log("--- PROJECT PAGE TEXT ---");
console.log((await p.locator("body").innerText()).slice(0, 1400));

await p.goto(`${B}/projects/${seed.projectId}/packages/${seed.pkgId}/leveling`, { waitUntil: "networkidle" });
console.log("\n--- LEVELING TEXT ---");
console.log((await p.locator("body").innerText()).slice(0, 2500));
console.log("\n--- OVERFLOW CULPRITS ---");
console.log(await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth + 1 || r.left < -1) {
      out.push(`${el.tagName}.${(el.className||"").toString().slice(0,40)} left=${Math.round(r.left)} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
    }
    if (out.length > 12) break;
  }
  return out;
}));

await p.goto(`${B}/settings`, { waitUntil: "networkidle" });
console.log("\n--- SETTINGS TEXT ---");
console.log((await p.locator("body").innerText()).slice(0, 900));

const sp = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await sp.goto(seed.pikePortal, { waitUntil: "networkidle" });
console.log("\n--- PORTAL COLORS ---");
console.log(await sp.evaluate(() => {
  const m = document.querySelector("main.portal");
  return {
    mainBg: getComputedStyle(m).backgroundColor,
    mainColor: getComputedStyle(m).color,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    varBg: getComputedStyle(m).getPropertyValue("--bg"),
  };
}));
await browser.close();
