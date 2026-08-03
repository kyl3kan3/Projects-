/**
 * The 390px audit: touch-target sizes, overlapping interactive elements,
 * horizontal overflow, rendered text contrast, and — the one reading CSS never
 * catches — what every screen looks like before JavaScript runs.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3049";
const OUT = "/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/audit";
fs.mkdirSync(OUT, { recursive: true });

const { getDb, closeDb } = await import("./src/db/index.ts");
const schema = await import("./src/db/schema.ts");
const { eq } = await import("drizzle-orm");
const db = getDb();

const email = `audit+${Date.now()}@riversideyouth.org`;
const problems = [];

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

/* ------------------------------------------------- set up a real, full org --- */
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
await page.fill('input[name="orgName"]', "Riverside Youth Collective");
await page.fill('input[name="name"]', "Dana Whitfield");
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "cuyahoga-2026");
await page.click('button[type="submit"]');
await page.waitForURL("**/onboarding", { timeout: 20000 });

const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
const [membership] = await db.select().from(schema.memberships).where(eq(schema.memberships.userId, user.id));
const orgId = membership.organizationId;

// Give it a real profile and a real pipeline, so the audit runs on populated
// screens rather than on empty states.
await db.update(schema.organizations).set({
  timezone: "America/New_York",
  profile: {
    mission: "Riverside Youth Collective runs after-school tutoring and a summer literacy camp for 240 students in Cuyahoga County.",
    programs: "After-school tutoring, summer literacy camp, family reading nights",
    budgetBand: "100k_500k",
    serviceStates: ["OH"],
    causeCodes: ["youth", "education"],
    ein: "34-1234567",
    typicalAskCents: 1_000_000,
  },
  profileVersion: 2,
}).where(eq(schema.organizations.id, orgId));

const [funder] = await db.select().from(schema.funders).limit(1);
const [grant] = await db.insert(schema.grants).values({
  organizationId: orgId,
  funderId: funder.id,
  title: "Summer literacy camp, 2027",
  funderName: funder.name,
  askAmountCents: 1_000_000,
  awardedAmountCents: 750_000,
  awardRestrictions: "Restricted to the summer camp. No indirect costs.",
  stage: "reporting",
  ownerUserId: user.id,
  fitScoreAtAdd: 92,
  notes: "Program officer suggested the autumn cycle. Cap is $25k.",
}).returning();
const [declined] = await db.insert(schema.grants).values({
  organizationId: orgId,
  title: "General operating, 2027",
  funderName: "Sample Ohio Valley Family Trust",
  askAmountCents: 2_500_000,
  stage: "declined",
  ownerUserId: user.id,
}).returning();
await db.insert(schema.deadlines).values([
  // One overdue, one imminent, one report — every visual state on one screen.
  { organizationId: orgId, grantId: grant.id, kind: "report", dueOn: "2026-07-15", label: "Interim report to Sample Community Foundation" },
  { organizationId: orgId, grantId: grant.id, kind: "report", dueOn: "2027-02-01", label: "Final report to Sample Community Foundation" },
  { organizationId: orgId, grantId: declined.id, kind: "application", dueOn: "2026-08-06", label: "Application to Sample Ohio Valley Family Trust" },
]);

const SCREENS = [
  ["landing", "/"],
  ["pipeline", "/pipeline"],
  ["grant", `/pipeline/${grant.id}`],
  ["discovery", "/discovery"],
  ["calendar", "/calendar"],
  ["calendar-month", "/calendar?view=month"],
  ["library", "/library"],
  ["settings", "/settings"],
  ["profile", "/settings/profile"],
  ["billing", "/settings/billing"],
  ["onboarding", "/onboarding"],
  ["login", "/login"],
  ["signup", "/signup"],
];

/* ------------------------------------------------------------ the measures --- */
const AUDIT = () => {
  const out = { overflow: 0, small: [], overlaps: [], tooClose: [], lowContrast: [] };
  out.overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;

  const label = (el) => {
    const text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("name") || "")
      .trim().replace(/\s+/g, " ").slice(0, 42);
    const cls = typeof el.className === "string" && el.className ? "." + el.className.split(" ")[0] : "";
    return el.tagName.toLowerCase() + (text ? ' "' + text + '"' : "") + cls;
  };

  const interactive = [...document.querySelectorAll('a, button, input, select, textarea, summary, [role="button"]')]
    .filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      if (el.disabled) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });

  const boxes = [];
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const hidden = cs.opacity === "0" || (r.width <= 2 && r.height <= 2);
    if (hidden) continue;
    const inlineInProse = el.tagName === "A" && el.closest("p") !== null;
    // The *effective* hit area, not the element box: a control may extend its
    // target with a pseudo-element (chips do, to reach 44px while staying 36px
    // tall visually), and getBoundingClientRect cannot see that. Probe outwards
    // and ask the document what is actually at each point.
    const cx = (r.left + r.right) / 2;
    const hits = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      return hit === el || el.contains(hit) || hit?.contains(el);
    };
    const offscreen = cx < 0 || cx > window.innerWidth || r.bottom < 0 || r.top > window.innerHeight;
    let up = 0, down = 0;
    for (let d = 1; d <= 10; d++) { if (hits(cx, r.top - d)) up = d; else break; }
    for (let d = 1; d <= 10; d++) { if (hits(cx, r.bottom + d)) down = d; else break; }
    const effectiveH = offscreen ? null : r.height + up + down;
    if (!offscreen && !inlineInProse && (effectiveH < 44 || r.width < 24)) {
      out.small.push({
        el: label(el), w: Math.round(r.width), h: Math.round(r.height),
        effectiveH: Math.round(effectiveH),
      });
    }
    boxes.push({ el, r, label: label(el) });
  }

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ox > 1 && oy > 1) {
        out.overlaps.push({ a: a.label, b: b.label, ox: Math.round(ox), oy: Math.round(oy) });
      } else if (ox > 0 && oy > -8 && oy <= 0) {
        const gap = -oy;
        if (gap < 8) out.tooClose.push({ a: a.label, b: b.label, gap: Math.round(gap) });
      }
    }
  }

  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(",").map(Number);
    return parts.length >= 3 ? parts : null;
  };
  const bgOf = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && (c[3] === undefined || c[3] > 0.5)) return c;
      node = node.parentElement;
    }
    return [246, 243, 234];
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const l1 = lum(fg), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const px = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      out.lowContrast.push({
        el: label(el), text: t.textContent.trim().slice(0, 40),
        ratio: Math.round(ratio * 100) / 100, need, px, color: cs.color,
      });
    }
  }
  return out;
};

for (const [name, path] of SCREENS) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900); // let the arc draw settle
  const r = await page.evaluate(AUDIT);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(350);
  const bottom = await page.evaluate(AUDIT);
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const o of bottom.overlaps) {
    problems.push(`${name}: STILL OVERLAPPING AT PAGE BOTTOM ${o.ox}x${o.oy}px — ${o.a} / ${o.b}`);
  }

  if (r.overflow > 0) problems.push(`${name}: body scrolls sideways by ${r.overflow}px`);
  for (const s of r.small) problems.push(`${name}: target ${s.w}x${s.h} (hit area ${s.effectiveH}px tall) — ${s.el}`);
  for (const o of r.overlaps) problems.push(`${name}: OVERLAP ${o.ox}x${o.oy}px — ${o.a} / ${o.b}`);
  for (const c of r.tooClose) problems.push(`${name}: only ${c.gap}px apart — ${c.a} / ${c.b}`);
  for (const c of r.lowContrast) problems.push(`${name}: contrast ${c.ratio} (needs ${c.need}) ${c.px}px ${c.color} "${c.text}"`);
  console.log(`· ${name}: overflow ${r.overflow}px, ${r.small.length} small, ${r.overlaps.length} overlaps, ${r.tooClose.length} close, ${r.lowContrast.length} low-contrast`);
}

/* ------------------------------------------- what it looks like without JS --- */
const noJs = await browser.newContext({
  viewport: { width: 390, height: 844 },
  javaScriptEnabled: false,
  storageState: await ctx.storageState(),
});
const noJsPage = await noJs.newPage();
for (const [name, path] of [["landing", "/"], ["discovery", "/discovery"], ["pipeline", "/pipeline"], ["grant", `/pipeline/${grant.id}`]]) {
  await noJsPage.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await noJsPage.screenshot({ path: `${OUT}/nojs-${name}.png`, fullPage: true });
}
// The number in the middle of every fit arc, as the server sent it.
await noJsPage.goto(`${BASE}/discovery`, { waitUntil: "domcontentloaded" });
const html = await noJsPage.content();
const serverScores = [...html.matchAll(/class="t-data absolute" style="font-size:11px;letter-spacing:-0\.02em">([^<]*)</g)].map((m) => m[1]);
console.log("· fit numbers in the no-JS HTML:", JSON.stringify(serverScores.slice(0, 12)));
if (serverScores.length && serverScores.every((v) => v === "0")) {
  problems.push("no-JS: every fit arc renders 0 — the score is wrong until hydration");
} else if (serverScores.some((v) => v === "0")) {
  problems.push(`no-JS: some fit arcs render 0 (${serverScores.join(",")})`);
}
await noJs.close();

console.log("\n=== findings ===");
console.log(problems.length ? problems.join("\n") : "none");

await browser.close();
await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
await db.delete(schema.users).where(eq(schema.users.id, user.id));
await closeDb();
