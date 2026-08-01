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
console.log("with grid:", await p.evaluate(() => {
  window.scrollTo(500, 0);
  const scrolled = window.scrollX;
  window.scrollTo(0, 0);
  const html = getComputedStyle(document.documentElement);
  return {
    canScrollSideways: scrolled,
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    htmlOverflowX: html.overflowX,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
  };
}));
console.log("hide tracks:", await p.evaluate(() => {
  document.querySelectorAll(".grid-track").forEach((t) => (t.style.display = "none"));
  window.scrollTo(500, 0);
  const s = window.scrollX;
  window.scrollTo(0, 0);
  return { canScrollSideways: s, docScrollWidth: document.documentElement.scrollWidth };
}));
console.log("restore + hide sticky-actions:", await p.evaluate(() => {
  document.querySelectorAll(".grid-track").forEach((t) => (t.style.display = ""));
  document.querySelectorAll(".sticky-actions, .tabbar").forEach((t) => (t.style.display = "none"));
  window.scrollTo(500, 0);
  const s = window.scrollX;
  window.scrollTo(0, 0);
  return { canScrollSideways: s, docScrollWidth: document.documentElement.scrollWidth };
}));
console.log("table width:max-content:", await p.evaluate(() => {
  document.querySelectorAll(".sticky-actions, .tabbar").forEach((t) => (t.style.display = ""));
  document.querySelectorAll(".grid-track").forEach((t) => { t.style.contain = "paint"; });
  window.scrollTo(500, 0);
  const s = window.scrollX;
  window.scrollTo(0, 0);
  return { canScrollSideways: s, docScrollWidth: document.documentElement.scrollWidth };
}));
await browser.close();
