import { chromium } from "playwright";
const SP="/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/ss42";
const BD=process.argv[2];
const pages=["/","/login","/signup","/apis","/settings",
 "/apis/payments-api","/apis/payments-api?env=pr","/apis/payments-api/diff",
 `/apis/payments-api/diffs/${BD}`,"/apis/payments-api/consumers",
 "/apis/payments-api/changelog","/apis/payments-api/settings",
 "/c/northwind-platform/payments-api"];
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"});
const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,storageState:`${SP}/state.json`});
const p=await c.newPage();
const errs=[];
p.on("pageerror",e=>errs.push(String(e)));
p.on("console",m=>{if(m.type()==="error")errs.push(m.text())});
let bad=0;
for (const path of pages) {
  await p.goto(`http://localhost:3042${path}`,{waitUntil:"load"});
  await p.waitForTimeout(450);
  const o = await p.evaluate(() => {
    const docW = document.documentElement.clientWidth;
    const over = document.documentElement.scrollWidth - docW;
    const worst = [];
    for (const el of document.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.right > docW + 1) worst.push(`${el.tagName.toLowerCase()}.${(el.className||"").toString().split(" ")[0]}@${Math.round(r.right)}`);
    }
    return { over, worst: worst.slice(0,3) };
  });
  const flag = o.over > 1 ? "  << OVERFLOW" : "";
  if (o.over > 1) bad++;
  console.log(`${String(o.over).padStart(4)}px  ${path}${flag} ${o.worst.join(" ")}`);
}
console.log(`\npages with horizontal overflow: ${bad}`);
console.log(`console/page errors: ${errs.length}`);
for (const e of [...new Set(errs)]) console.log("  -", e);
await b.close();
