/** Scratch: final smoke over every screen after the last round of edits. */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3057";
const OUT = "/tmp/matpass-shots/final";
mkdirSync(OUT, { recursive: true });
const errors = [];

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`[console] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

const stamp = Date.now();
const EMAIL = `owner+${stamp}@final.test`;
const msg = async (sel) => {
  await page.waitForFunction(
    (s) => {
      const el = document.querySelector(s);
      return el && el.textContent.trim().length > 0;
    },
    sel,
    { timeout: 25000 },
  );
  return (await page.locator(sel).first().innerText()).trim();
};

console.log("signup + setup");
await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
await page.fill("#schoolName", "Riverbend Karate");
await page.fill("#name", "Sensei Nakamura");
await page.fill("#email", EMAIL);
await page.fill("#password", "a good long password");
await page.getByRole("button", { name: "Start free — 14 days" }).click();
await page.waitForURL("**/setup", { timeout: 20000 });

await page.selectOption("#template", "karate-10kyu");
await page.getByRole("button", { name: "Load this curriculum" }).click();
console.log(" ", await msg('[role="status"]'));

await page.reload({ waitUntil: "networkidle" });
await page.fill(
  "#csv",
  [
    "Name,Family,Email,Rank,Stripes,Last promoted,Start date",
    "Kenji Watanabe,Watanabe,h.watanabe@example.test,9th kyu — Yellow,1,2025-10-04,2023-05-12",
    "Hana Watanabe,Watanabe,h.watanabe@example.test,10th kyu — White,2,2026-03-01,2024-11-08",
    "Leo Marchetti,Marchetti,l.marchetti@example.test,8th kyu — Orange,0,2025-04-19,2022-09-30",
  ].join("\n"),
);
await page.getByRole("button", { name: "Import", exact: true }).click();
console.log(" ", await msg('[role="status"]'));

await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /kiosk link/i }).click();
const kioskMsg = await msg('[role="status"]');
const token = kioskMsg.match(/\/kiosk\/([A-Za-z0-9._-]+)/)?.[1];
writeFileSync(`${OUT}/token.txt`, token ?? "");
console.log("  kiosk token:", Boolean(token));

console.log("\nevery screen renders, at 390px, with no console error");
const screens = [
  ["/roster", "roster"],
  ["/roster/checkin", "desk-checkin"],
  ["/gradings", "gradings"],
  ["/retention", "retention"],
  ["/billing", "billing"],
  ["/curriculum", "curriculum"],
  ["/schedule", "schedule"],
  ["/announce", "announce"],
  ["/settings", "settings"],
  ["/settings/staff", "staff"],
  ["/settings/kiosk", "kiosk-devices"],
  ["/settings/plan", "plan"],
  ["/setup", "setup"],
  ["/", "landing"],
];
for (const [path, name] of screens) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const h1 = (await page.locator("h1").first().innerText().catch(() => "")).trim();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  console.log(
    `  ${String(res.status()).padEnd(3)} ${path.padEnd(18)} ${overflow ? "OVERFLOWS " : ""}${JSON.stringify(h1.slice(0, 42))}`,
  );
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

console.log("\n404 and the kiosk");
const missing = await page.goto(`${BASE}/roster/00000000-0000-0000-0000-000000000000`);
console.log("  unknown student:", missing.status(), (await page.locator("h1").innerText()).trim());
await page.goto(`${BASE}/kiosk/${token}`, { waitUntil: "networkidle" });
await page.fill("input", "Ken");
await page.waitForSelector("button.card", { timeout: 10000 });
await page.locator("button.card").first().click();
await page.getByRole("button", { name: /^Check in/ }).click();
await page.waitForSelector("text=/classes/", { timeout: 10000 });
console.log("  kiosk check-in at 390px:", (await page.locator("main").innerText()).split("\n")[1]);
await page.screenshot({ path: `${OUT}/kiosk-phone.png`, fullPage: true });

console.log("\nconsole/page errors:", errors.length);
for (const e of errors) console.log("   ", e);
await browser.close();
