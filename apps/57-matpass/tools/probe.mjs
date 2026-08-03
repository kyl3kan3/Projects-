import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const OUT="/tmp/matpass-shots";
const token = readFileSync(`${OUT}/kiosk-token.txt`,"utf8").trim();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: JSON.parse(readFileSync(`${OUT}/session.json`,"utf8")) });
const page = await ctx.newPage();
page.on("console", m => console.log("[console]", m.type(), m.text().slice(0,200)));
page.on("pageerror", e => console.log("[pageerror]", e.message));
// seed
await page.goto("http://localhost:3057/roster", { waitUntil: "networkidle" });
const seeded = await page.evaluate(async (token) => {
  let n=0;
  for (const name of ["Marcus","Amara","Sofia"]) {
    const s = await fetch("/api/kiosk/search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token,query:name})}).then(r=>r.json());
    const st = s.students?.[0]; if(!st) continue;
    const batch=[]; const count = name==="Sofia"?5:14;
    for(let i=0;i<count;i++) batch.push({studentId:st.studentId,enrollmentId:st.enrollments[0].enrollmentId,clientKey:`pseed:${name}:${i}`,at:new Date(Date.now()-(i+1)*3*86400000).toISOString()});
    const r = await fetch("/api/kiosk/checkin",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token,checkins:batch})}).then(r=>r.json());
    n += r.results.filter(x=>x.ok&&!x.duplicate).length;
  }
  return n;
}, token);
console.log("seeded", seeded);
await page.goto("http://localhost:3057/gradings", { waitUntil: "networkidle" });
await page.fill("#ename","Probe grading");
await page.getByRole("button", { name: "Assemble the list" }).click();
await page.waitForURL(/\/gradings\/[0-9a-f-]{36}/, { timeout: 25000 });
const invite = page.getByRole("button", { name: /^Invite \d/ });
console.log("invite label:", JSON.stringify(await invite.first().innerText()));
await invite.first().click();
for (const t of [800, 1600, 3000, 6000]) {
  await page.waitForTimeout(t === 800 ? 800 : 800);
  const st = await page.evaluate(() => [...document.querySelectorAll('[role="status"]')].map(e=>e.textContent));
  const al = await page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent));
  console.log(`  +${t}ms statuses=${JSON.stringify(st)} alerts=${JSON.stringify(al)}`);
}
console.log("buttons:", await page.evaluate(() => [...document.querySelectorAll("button")].map(b=>b.textContent.trim().slice(0,45))));
await browser.close();
