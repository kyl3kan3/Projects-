import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log("pageerror:", e.message));
  await p.goto("http://localhost:3045/register/millbrook-fall-2026", { waitUntil: "networkidle" });
  await p.fill("#contactName", "Nadia Farouk");
  await p.fill("#email", "nadia.farouk@example.com");
  await p.fill("#phone", "+15550125");
  await p.check('input[name="smsConsent"]');
  await p.selectOption("#childCount", "2");
  await p.click('button:has-text("Continue")');
  await p.waitForTimeout(400);
  await p.fill("#child-0-firstName", "Amir");
  await p.fill("#child-0-lastName", "Farouk");
  await p.fill("#child-0-birthdate", "2018-05-14");
  console.log("before select, medicalNotes visible:", await p.locator("#child-0-medicalNotes").isVisible());
  await p.selectOption("#child-0-divisionId", { index: 0 });
  await p.waitForTimeout(500);
  console.log("after select, count:", await p.locator("#child-0-medicalNotes").count(), "visible:", await p.locator("#child-0-medicalNotes").count() ? await p.locator("#child-0-medicalNotes").isVisible() : "n/a");
  console.log("body text:", (await p.locator("body").innerText()).slice(0, 300));
  await b.close();
}
main();
