import { chromium } from "playwright";

const BASE = "http://localhost:3054";
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on("console", (m) => console.log("[console]", m.type(), m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

const email = `dbg+${Date.now()}@northgate.example`;
await page.goto(`${BASE}/signup`);
await page.fill('input[name="firmName"]', "Debug Firm");
await page.fill('input[name="name"]', "D. Bug");
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "correct-horse-9");
await page.click('button[type="submit"]');
await page.waitForURL("**/radar");

await page.goto(`${BASE}/profiles`);
await page.fill('input[name="name"]', "Managed IT");
await page.fill('textarea[name="keywords"]', "managed detection");
await page.fill('input[name="naicsCodes"]', "541512");
await page.fill('input[name="states"]', "VA, MD, US");
await page.click('button[type="submit"]:has-text("Create profile")');
await page.waitForSelector('[role="status"]', { timeout: 30000 });

await page.goto(`${BASE}/radar`);
await page.locator("a:has-text('Read the notice')").first().click();
await page.waitForURL(/\/radar\/[0-9a-f-]{36}/);
await page.click('button:has-text("Pursue")');
await page.waitForURL(/\/pursuits\/[0-9a-f-]{36}/);
console.log("pursuit:", page.url());

for (const [key, value] of Object.entries({
  incumbent: 4, vehicle: 5, capacity: 4, price: 3, relationship: 2,
})) {
  await page.locator(`input[name="score_${key}"][value="${value}"]`).click({ force: true });
}
await page.waitForTimeout(300);

const hold = page.locator('button:has-text("Hold to record")');
console.log("hold text:", await hold.innerText());
console.log("hold disabled:", await hold.isDisabled());

// Instrument the hold button and its form.
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Hold to record"),
  );
  const form = btn?.closest("form");
  console.log("BTN found", Boolean(btn), "form found", Boolean(form));
  console.log("form action attr:", form?.getAttribute("action"));
  console.log("hidden inputs:", form ? form.querySelectorAll("input[type=hidden]").length : -1);
  btn?.addEventListener("pointerdown", () => console.log("EVT pointerdown"));
  form?.addEventListener("submit", () => console.log("EVT submit"));
  window.__form = form;
});

const box = await hold.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(1200);
await page.mouse.up();
await page.waitForTimeout(2500);

console.log("button after hold:", await hold.innerText().catch(() => "gone"));
await page.reload();
console.log("stage after reload:", await page.locator(".pill").first().innerText());

await browser.close();
