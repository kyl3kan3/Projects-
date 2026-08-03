import { chromium } from "playwright";
const SP="/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/ss42";
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"});

console.log("=== reduced motion on the landing hero (always has a strike) ===");
for (const reduced of [null, "reduce"]) {
  const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:reduced ?? "no-preference"});
  const p=await c.newPage();
  await p.goto("http://localhost:3042",{waitUntil:"load"});
  await p.waitForTimeout(700);
  const s = await p.evaluate(() => {
    const strike = document.querySelector(".strike-draw");
    const stamp = document.querySelector(".stamp-animate");
    const card = document.querySelector(".settle");
    if (!strike) return { missing: true };
    const after = getComputedStyle(strike, "::after");
    return {
      strikeAnimation: after.animationName,
      strikeTransform: after.transform,
      strikeWidth: after.width,
      stampOpacity: getComputedStyle(stamp).opacity,
      stampAnimation: getComputedStyle(stamp).animationName,
      cardOpacity: getComputedStyle(card).opacity,
      cardAnimationDuration: getComputedStyle(card).animationDuration,
    };
  });
  console.log(`  reducedMotion=${reduced ?? "no"} ${JSON.stringify(s)}`);
  if (reduced === "reduce") {
    if (s.strikeAnimation !== "none") console.log("  !! strike still animates");
    if (s.stampOpacity !== "1") console.log("  !! stamp not fully visible");
    if (s.cardOpacity !== "1") console.log("  !! card not fully visible");
    if (s.strikeTransform !== "none" && !/matrix\(1, 0, 0, 1, 0, 0\)/.test(s.strikeTransform)) console.log(`  !! strike not fully drawn: ${s.strikeTransform}`);
    await p.screenshot({path:`${SP}/shots/41-reduced-motion.png`,fullPage:false});
  }
  await c.close();
}

console.log("\n=== focus ring across every interactive element on three screens ===");
const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,storageState:`${SP}/state.json`});
const p=await c.newPage();
for (const path of ["/apis/payments-api/consumers","/settings","/"]) {
  await p.goto(`http://localhost:3042${path}`,{waitUntil:"load"});
  await p.waitForTimeout(400);
  const report = await p.evaluate(() => {
    const els = [...document.querySelectorAll("a[href], button, input, textarea, select, [tabindex]:not([tabindex='-1'])")];
    const noRing = [];
    for (const el of els) {
      el.focus();
      const cs = getComputedStyle(el);
      const w = parseFloat(cs.outlineWidth || "0");
      if (!(el instanceof HTMLElement)) continue;
      if (el.offsetParent === null && cs.position !== "fixed") continue; // hidden
      if (w < 1) noRing.push(`${el.tagName.toLowerCase()}.${(el.className||"").toString().split(" ")[0]}`);
    }
    return { total: els.length, noRing };
  });
  console.log(`  ${path}: ${report.total} focusable, ${report.noRing.length} without a ring ${report.noRing.slice(0,4).join(", ")}`);
}
await b.close();
