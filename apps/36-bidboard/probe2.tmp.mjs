import { chromium } from "playwright";
import fs from "node:fs";
const seed = JSON.parse(fs.readFileSync("seed.json", "utf8"));
const B = "http://localhost:3036";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await p.goto(`${B}/login`);
await p.fill('input[name="email"]', seed.login.email);
await p.fill('input[name="password"]', seed.login.password);
await p.click('button[type="submit"]');
await p.waitForURL("**/projects");
await p.goto(`${B}/projects/${seed.projectId}/packages/${seed.pkgId}/leveling`, { waitUntil: "networkidle" });
console.log(await p.evaluate(() => {
  const res = { doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, win: window.innerWidth, offenders: [] };
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest(".grid-track")) continue;
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth + 1) {
      res.offenders.push(`${el.tagName}.${(el.className||"").toString().slice(0,50)} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
    }
  }
  const t = document.querySelector(".grid-track");
  res.track = { w: t.clientWidth, sw: t.scrollWidth, ox: getComputedStyle(t).overflowX, oy: getComputedStyle(t).overflowY };
  res.bodyOverflow = getComputedStyle(document.body).overflowX;
  return res;
}));
await browser.close();
