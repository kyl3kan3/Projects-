import { chromium } from "playwright";
const SP="/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/ss42";
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"});
const c=await b.newContext({viewport:{width:390,height:844},storageState:`${SP}/state.json`});
const p=await c.newPage();
await p.goto("http://localhost:3042/settings",{waitUntil:"load"});
await p.waitForTimeout(400);
// Focus for real, via the page, not via evaluate.
await p.locator('input[name="label"]').focus();
await p.waitForTimeout(200);
console.log(await p.evaluate(() => {
  const el = document.activeElement;
  const cs = getComputedStyle(el);
  return { tag: el.tagName, name: el.getAttribute("name"), cls: el.className,
           isFocus: el.matches(":focus"), isFV: el.matches(":focus-visible"),
           border: cs.borderColor, shadow: cs.boxShadow };
}));
await b.close();
