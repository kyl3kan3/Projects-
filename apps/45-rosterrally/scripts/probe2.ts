import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log("pageerror:", e.message));
  p.on("response", (r) => { if (r.status() >= 400) console.log("HTTP", r.status(), r.url()); });
  await p.goto(`http://localhost:3045/p/${process.argv[2]}`, { waitUntil: "networkidle" });
  const body = await p.locator("body").innerText();
  console.log(body.replace(/\n+/g, " | "));
  await b.close();
}
main();
