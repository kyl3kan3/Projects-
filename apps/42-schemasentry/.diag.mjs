import { chromium } from "playwright";
const SP="/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/ss42";
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"});
const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const p=await c.newPage();
await p.goto("http://localhost:3042",{waitUntil:"load"});
await p.waitForTimeout(600);
const wide = await p.evaluate(() => {
  const docW = document.documentElement.clientWidth;
  const bad = [];
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width > docW + 1 || r.right > docW + 1) {
      bad.push({ tag: el.tagName.toLowerCase(), cls: el.className?.toString().slice(0,60), w: Math.round(r.width), right: Math.round(r.right), text: (el.textContent||"").slice(0,50) });
    }
  }
  return { docW, bad: bad.slice(0, 12) };
});
console.log("doc width", wide.docW);
for (const x of wide.bad) console.log(" ", JSON.stringify(x));

console.log("\n--- focus-visible probe ---");
await p.keyboard.press("Tab");
console.log(await p.evaluate(() => {
  const el = document.activeElement;
  const cs = getComputedStyle(el);
  return { tag: el.tagName, matchesFV: el.matches(":focus-visible"), matchesFocus: el.matches(":focus"), outline: cs.outline, outlineWidth: cs.outlineWidth };
}));
await b.close();
