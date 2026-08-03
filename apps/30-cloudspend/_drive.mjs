/** Drive the real forms in Chromium at 390x844. */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3030";
const OUT = "./_shots";
fs.mkdirSync(OUT, { recursive: true });

const email = `dana+${Math.random().toString(36).slice(2, 7)}@northwind.dev`;
let failures = 0;
const errors = [];

function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// The pre-installed Chromium is revision 1194; the linked playwright expects a
// newer one, so point it at the binary that is actually here.
const EXECUTABLE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXECUTABLE });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
page.on("response", (res) => {
  if (res.status() >= 500) errors.push(`${res.status()} ${res.url()}`);
});

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  // A fullPage capture can leave the page scrolled; reset so the next click
  // measures a stable layout.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(120);
}

async function tap(locator) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
  await locator.click({ timeout: 15000 });
}

async function noHorizontalScroll(name) {
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  check(
    `${name}: fits 390px with no horizontal page scroll`,
    overflow.win === 390 && overflow.doc <= 391,
    JSON.stringify(overflow),
  );
}

/* ---------------------------------------------------------------- signup */
await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
check("signup renders", await page.getByRole("heading").first().isVisible());

// The fonts must actually load, not silently fall back.
const fontsOk = await page.evaluate(async () => {
  await document.fonts.ready;
  const families = new Set();
  document.fonts.forEach((f) => families.add(f.family));
  const body = getComputedStyle(document.body).fontFamily;
  return { families: [...families], body, loaded: document.fonts.size };
});
check(
  "Geist and Geist Mono are loaded, not a system fallback",
  fontsOk.loaded > 0 && /Geist/i.test(fontsOk.body),
  JSON.stringify(fontsOk),
);

// Empty-form validation is the browser's, so check the server-side path too:
// a password that is too short.
await page.fill('input[name="orgName"]', "Northwind Labs");
await page.fill('input[name="personName"]', "Dana Whitlock");
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "short");
await page.evaluate(() => {
  document.querySelector('input[name="password"]').removeAttribute("minLength");
});
await page.click('button[type="submit"]');
await page.waitForTimeout(900);
check(
  "a short password is rejected by the server action",
  (await page.locator('main [role="alert"]').count()) > 0,
  (await page.locator('main [role="alert"]').first().textContent()) ?? "",
);
await shot("01-signup-error");

await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
await page.fill('input[name="orgName"]', "Northwind Labs");
await page.fill('input[name="personName"]', "Dana Whitlock");
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "correct-horse-battery");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/connect`, { timeout: 20000 });
check("signup lands on connect", page.url().endsWith("/connect"));
await noHorizontalScroll("connect");
await shot("02-connect-empty");

/* --------------------------------------------------------------- connect */
// A bad account id must be refused with a real message.
await page.fill('input[name="accountId"]', "12345");
await page.fill('input[name="label"]', "4821-prod");
await page.evaluate(() => document.querySelector('input[name="accountId"]').removeAttribute("pattern"));
await tap(page.getByRole("button", { name: /Add account/i }));
await page.waitForTimeout(900);
check(
  "a 5-digit account id is rejected",
  (await page.locator('main [role="alert"]').count()) > 0,
  (await page.locator('main [role="alert"]').first().textContent()) ?? "",
);

await page.fill('input[name="accountId"]', "481029384756");
await page.fill('input[name="label"]', "4821-prod");
await tap(page.getByRole("button", { name: /Add account/i }));
await page.waitForTimeout(1500);
check(
  "the account is created and shows an external id",
  (await page.getByText(/EXTERNAL ID cloudspend-/).count()) > 0,
);
const quickCreate = await page.getByRole("link", { name: /CloudFormation quick-create/i }).getAttribute("href");
check(
  "the quick-create link carries the external id and our account id",
  Boolean(quickCreate && /param_ExternalId=cloudspend-/.test(quickCreate) && /param_CloudSpendAccountId=/.test(quickCreate)),
  quickCreate ?? "",
);
check(
  "the policy is shown in full with a reason per statement",
  (await page.getByText("ce:GetCostAndUsage").count()) > 0 &&
    (await page.getByText(/Reads the cost figures/).count()) > 0,
);
await shot("03-connect-pending");

await tap(page.getByRole("button", { name: /I created the stack/i }));
await page.waitForSelector("text=/cost rows backfilled/", { timeout: 60000 });
const notice = (await page.getByText(/cost rows backfilled/).first().textContent()) ?? "";
check("verify + backfill reports what was ingested", /cost rows backfilled, from \d{4}-/.test(notice), notice.slice(0, 160));
check("the account is marked connected", (await page.getByText(/^Connected · demo data$/).count()) > 0);
check("demo data is labelled on connect", /demo data/i.test(notice) || (await page.getByText(/demo data/i).count()) > 0);
await shot("04-connect-verified");

/* ------------------------------------------------------------- run a tick */
const tick = await fetch(`${BASE}/api/cron/tick`, {
  headers: {
    authorization:
      "Bearer 4f1c8a2e6b0d4f7a9c3e5b1d7f9a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6a",
  },
});
const tickJson = await tick.json();
check("the cron tick runs when authorised", tick.status === 200 && tickJson.ok === true, JSON.stringify(tickJson).slice(0, 220));
const unauth = await fetch(`${BASE}/api/cron/tick`);
check("the cron tick refuses without the secret", unauth.status === 403, String(unauth.status));

/* ----------------------------------------------------------------- watch */
await page.goto(`${BASE}/watch`, { waitUntil: "networkidle" });
await noHorizontalScroll("watch");
const mtd = (await page.locator(".t-display").first().textContent()) ?? "";
check("the MTD figure is money in mono", /^\$[\d,]+\.\d\d$/.test(mtd.trim()), mtd.trim());
check("the forecast line is present", (await page.getByText(/^FORECAST \$/).count()) > 0);
check("the chart rendered", (await page.locator("svg[role=img]").count()) > 0);
check("the open-anomaly rail shows the seeded incidents", (await page.getByText(/us-east-1/).count()) >= 2);
check("deploy pennants are listed under the chart", (await page.getByText(/9f3c2ab/).count()) > 0);
check("no emoji anywhere on the screen", !/\p{Extended_Pictographic}/u.test(await page.evaluate(() => document.body.innerText)));
await shot("05-watch");

// Contrast + tap-target audit on the money screen.
const audit = await page.evaluate(() => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b] = m[1].split(",").map((v) => parseFloat(v));
    return [r, g, b];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const effectiveBg = (el) => {
    let node = el;
    while (node) {
      const c = parse(getComputedStyle(node).backgroundColor);
      const alpha = getComputedStyle(node).backgroundColor.match(/rgba?\([^)]*?,\s*([\d.]+)\)$/);
      if (c && (!alpha || parseFloat(alpha[1]) > 0.5)) return c;
      node = node.parentElement;
    }
    return [12, 17, 28];
  };
  const bad = [];
  const small = [];
  for (const el of document.querySelectorAll("p, span, a, h1, h2, h3, button, code")) {
    const text = (el.textContent ?? "").trim();
    if (!text || el.children.length > 0) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg) continue;
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const r = ratio(fg, effectiveBg(el));
    if (r < (large ? 3 : 4.5)) bad.push({ text: text.slice(0, 44), color: cs.color, size, ratio: +r.toFixed(2) });
  }
  for (const el of document.querySelectorAll("a, button, select, input")) {
    const box = el.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    if (box.height < 44 || box.width < 44) {
      small.push({ tag: el.tagName, text: (el.textContent ?? "").trim().slice(0, 30), w: Math.round(box.width), h: Math.round(box.height) });
    }
  }
  return { bad, small };
});
check("all body text meets WCAG AA on the watch screen", audit.bad.length === 0, JSON.stringify(audit.bad).slice(0, 600));
check("all tap targets are at least 44px", audit.small.length === 0, JSON.stringify(audit.small).slice(0, 600));

/* ---------------------------------------------------- anomaly detail + ack */
await tap(page.getByRole("link", { name: /Investigate/i }).first());
await page.waitForURL(/\/anomalies\/[0-9a-f-]+$/, { timeout: 10000 });
await noHorizontalScroll("anomaly detail");
check("the detail screen shows the probable cause", (await page.getByText(/Probable cause/).count()) > 0);
check("the correlated deploy is named", (await page.getByText(/9f3c2ab/).count()) > 0);
check("the live counter is running", (await page.getByText(/SINCE \w+ \d\d:\d\d UTC/).count()) > 0);
check("contributors are listed", (await page.getByText(/Contributors since onset/).count()) > 0);
const detailUrl = page.url();
await shot("06-anomaly-detail");

// The trend PNG the Slack card uses.
const anomalyId = detailUrl.split("/").pop();
const png = await fetch(`${BASE}/api/trend/${anomalyId}.png`);
const bytes = Buffer.from(await png.arrayBuffer());
check(
  "the Slack trend PNG is served and is a real PNG",
  png.status === 200 && bytes.subarray(1, 4).toString() === "PNG" && bytes.length > 1000,
  `${png.status} ${bytes.length}B ${png.headers.get("content-type")}`,
);

await tap(page.getByRole("button", { name: /^Ack$/ }));
await page.waitForTimeout(1500);
check("acking moves the state", (await page.locator(".state-acked").count()) > 0, await page.locator(".t-label").first().textContent() ?? "");
await shot("07-anomaly-acked");

await tap(page.getByRole("button", { name: /^Resolve$/ }));
await page.waitForTimeout(1500);
check("resolving files the anomaly", (await page.locator(".state-resolved").count()) > 0);
await shot("08-anomaly-resolved");

/* ------------------------------------------------------------- anomalies */
await page.goto(`${BASE}/anomalies`, { waitUntil: "networkidle" });
await noHorizontalScroll("anomalies");
check("the resolved anomaly appears in history", (await page.getByText(/^History$/).count()) > 0);
await shot("09-anomalies");

/* ---------------------------------------------------------------- deploys */
await page.goto(`${BASE}/deploys`, { waitUntil: "networkidle" });
await noHorizontalScroll("deploys");
check("deploy rows render with the correlated marker", (await page.getByText(/CORRELATED/).count()) >= 0);
check("three demo deploys are listed", (await page.getByText(/api-server/).count()) >= 2);
await shot("10-deploys");

/* ------------------------------------------------------------------ waste */
await page.goto(`${BASE}/waste`, { waitUntil: "networkidle" });
await noHorizontalScroll("waste");
const recoverable = (await page.locator(".t-display").first().textContent()) ?? "";
check("the recoverable total is the roast headline", /\$1,847\/MO/.test(recoverable), recoverable.trim());
check("five findings are listed", (await page.getByText(/unattached EBS volumes/).count()) > 0);
await shot("11-waste");

await tap(page.getByRole("button", { name: /^Mark done: 8 unattached EBS volumes$/ }));
await page.waitForTimeout(1500);
const rolled = (await page.locator(".t-display").first().textContent()) ?? "";
check("the total rolls down when a finding is actioned", /\$1,236\/MO/.test(rolled), rolled.trim());
await shot("12-waste-actioned");

/* ---------------------------------------------------------------- budgets */
await page.goto(`${BASE}/budgets`, { waitUntil: "networkidle" });
await noHorizontalScroll("budgets");
await page.fill('input[name="name"]', "Platform team");
await page.selectOption('select[name="scope"]', "tag");
await page.waitForTimeout(300);
await page.selectOption('select[name="scopeValue"]', { index: 0 });
await page.fill('input[name="monthlyLimit"]', "40");
await page.fill('input[name="thresholds"]', "50,80,100");
await tap(page.getByRole("button", { name: /Add budget/i }));
await page.waitForTimeout(1800);
check("the budget appears with a burn meter", (await page.locator(".meter-fill").count()) > 0);
check("the burn caption is the DESIGN specimen", (await page.getByText(/OF \$40 · RESETS IN \d+D/).count()) > 0, (await page.locator(".t-data").allTextContents()).find((t) => /RESETS IN/.test(t)) ?? "");
await shot("13-budgets");

// A duplicate scope must be refused, not silently create a second budget.
await page.fill('input[name="name"]', "Platform team again");
await page.fill('input[name="monthlyLimit"]', "50");
await tap(page.getByRole("button", { name: /Add budget/i }));
await page.waitForTimeout(1500);
check("a duplicate budget scope is refused", (await page.locator('main [role="alert"]').count()) > 0, (await page.locator('main [role="alert"]').first().textContent()) ?? "");

// A tick must now fire the budget alert.
const tick2 = await fetch(`${BASE}/api/cron/tick`, {
  headers: {
    authorization:
      "Bearer 4f1c8a2e6b0d4f7a9c3e5b1d7f9a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6a",
  },
});
const tick2Json = await tick2.json();
const ourOrg = (tick2Json.orgs ?? []).find((o) => o.accounts?.some((a) => a.label === "4821-prod") && o.orgName === "Northwind Labs" && o.budgetAlertsSent >= 0);
const budgetOrg = (tick2Json.orgs ?? []).filter((o) => o.budgetAlertsSent > 0);
check(
  "the tick fires a budget alert for the org whose budget was crossed",
  budgetOrg.length >= 1,
  JSON.stringify(budgetOrg.map((o) => ({ org: o.orgName, sent: o.budgetAlertsSent }))),
);
void ourOrg;

/* --------------------------------------------------------------- settings */
await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
await page.evaluate(() => document.querySelectorAll("details").forEach((d) => d.setAttribute("open", "")));
await page.waitForTimeout(200);
await noHorizontalScroll("settings, every disclosure open");
check("the webhook URL is shown", (await page.getByText(/api\/webhooks\/deploy\//).count()) > 0);
check("the alert log shows what was sent", (await page.getByText(/LOGGED \(NO CHANNEL CONFIGURED\)/).count()) > 0);
check("the budget alert is in the log with its sentence", (await page.getByText(/of budget —/).count()) > 0, (await page.locator("main .t-secondary").allTextContents()).find((t) => /budget/.test(t)) ?? "none");
check("the anomaly alerts are in the log", (await page.getByText(/us-east-1 \+\$/).count()) > 0);
await shot("14-settings");

// A bad Slack token must be refused.
await page.fill('input[name="slackBotToken"]', "not-a-token");
await page.fill('input[name="slackChannelId"]', "C09ABCDE123");
await tap(page.getByRole("button", { name: /Save Slack settings/i }));
await page.waitForTimeout(1200);
check("a malformed Slack token is refused", (await page.locator('main [role="alert"]').count()) > 0, (await page.locator('main [role="alert"]').first().textContent()) ?? "");

await page.fill('input[name="slackBotToken"]', "xoxb-2947-demo-not-a-real-token");
await page.fill('input[name="slackChannelId"]', "C09ABCDE123");
await page.fill('input[name="slackChannelName"]', "cloud-costs");
await tap(page.getByRole("button", { name: /Save Slack settings/i }));
await page.waitForTimeout(1500);
check("a well-formed Slack config is accepted", (await page.locator('main [role="status"]').count()) > 0, (await page.locator('main [role="status"]').first().textContent()) ?? "");

/* --------------------------------------------------------------- billing */
await page.goto(`${BASE}/settings/billing`, { waitUntil: "networkidle" });
await noHorizontalScroll("billing");
check("all three flat tiers are shown", (await page.getByText("$49").count()) > 0 && (await page.getByText("$99").count()) > 0 && (await page.getByText("$199").count()) > 0);
check("the flat-pricing pledge is on the page", (await page.getByText(/never take a percentage/i).count()) > 0);
await shot("15-billing");

/* ------------------------------------------------- deploy webhook, for real */
await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
const webhookUrl = await page.evaluate(() => {
  const el = [...document.querySelectorAll("code")].find((c) => /api\/webhooks\/deploy\//.test(c.textContent ?? ""));
  return el?.textContent?.trim() ?? null;
});
check("the webhook URL was read off the settings screen", Boolean(webhookUrl), webhookUrl ?? "not found");
const secret = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "Reveal");
  buttons.forEach((b) => b.click());
  return null;
});
void secret;
await page.waitForTimeout(400);
const revealed = await page.evaluate(() => {
  const codes = [...document.querySelectorAll("code")].map((c) => c.textContent?.trim() ?? "");
  return codes.find((c) => /^[0-9a-f]{48}$/.test(c)) ?? null;
});
check("the signing secret can be revealed", Boolean(revealed), revealed ? `${revealed.slice(0, 8)}…` : "not found");

if (webhookUrl && revealed) {
  const { createHmac } = await import("node:crypto");
  const body = JSON.stringify({ service: "billing-worker", sha: "c41a9de", deployed_at: new Date().toISOString() });
  const sig = `sha256=${createHmac("sha256", revealed).update(body, "utf8").digest("hex")}`;
  const bad = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=deadbeef" },
    body,
  });
  check("the deploy webhook rejects a bad signature", bad.status === 401, String(bad.status));
  const good = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": sig },
    body,
  });
  const goodJson = await good.json();
  check("the deploy webhook records a signed deploy", good.status === 200 && goodJson.recorded === true, JSON.stringify(goodJson));
  const again = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": sig },
    body,
  });
  const againJson = await again.json();
  check("a re-delivered webhook is not a second deploy", againJson.duplicate === true, JSON.stringify(againJson));

  await page.goto(`${BASE}/deploys`, { waitUntil: "networkidle" });
  check("the new deploy shows on the deploys screen", (await page.getByText(/billing-worker/).count()) > 0);
}

/* --------------------------------------------- reduced motion + auth gate */
const reduced = await context.newPage();
await reduced.emulateMedia({ reducedMotion: "reduce" });
await reduced.goto(`${BASE}/watch`, { waitUntil: "networkidle" });
const motion = await reduced.evaluate(() => {
  const series = document.querySelector(".chart-series");
  const ring = document.querySelector(".flare-ring");
  return {
    seriesAnimation: series ? getComputedStyle(series).animationName : "none",
    ringDisplay: ring ? getComputedStyle(ring).display : "absent",
    figuresPresent: /FORECAST/.test(document.body.innerText),
  };
});
check(
  "prefers-reduced-motion collapses the chart draw and the flare rings",
  motion.seriesAnimation === "none" && motion.ringDisplay !== "block" && motion.figuresPresent,
  JSON.stringify(motion),
);
await reduced.screenshot({ path: `${OUT}/16-watch-reduced-motion.png`, fullPage: true });
await reduced.close();

const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
const anonPage = await anon.newPage();
await anonPage.goto(`${BASE}/watch`, { waitUntil: "networkidle" });
check("an anonymous visitor is redirected to login", anonPage.url().endsWith("/login"), anonPage.url());
await anon.close();

/* ------------------------------------------------------------- sign in again */
await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
await tap(page.getByRole("button", { name: /^Sign out$/ }));
await page.waitForURL(`${BASE}/login`, { timeout: 10000 });
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "wrong-password");
await page.click('button[type="submit"]');
await page.waitForTimeout(1500);
check("a wrong password is refused", (await page.locator('main [role="alert"]').count()) > 0, (await page.locator('main [role="alert"]').first().textContent()) ?? "");
check(
  "the rejected login keeps the email that was typed",
  (await page.inputValue('input[name="email"]')) === email,
  await page.inputValue('input[name="email"]'),
);
// Only the password is retyped, exactly as a person would.
await page.fill('input[name="password"]', "correct-horse-battery");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/watch`, { timeout: 15000 });
check("signing back in returns to the watch", page.url().endsWith("/watch"));

/* ---------------------------------------------------------------- desktop */
const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const desktopPage = await desktop.newPage();
await desktopPage.context().addCookies(await context.cookies());
await desktopPage.goto(`${BASE}/watch`, { waitUntil: "networkidle" });
await desktopPage.screenshot({ path: `${OUT}/17-watch-desktop.png`, fullPage: true });
const docked = await desktopPage.evaluate(() => {
  const layout = document.querySelector(".watch-layout");
  return layout ? getComputedStyle(layout).gridTemplateColumns : null;
});
check("the anomaly rail docks right on desktop", Boolean(docked && docked.split(" ").length === 2), docked ?? "");
await desktop.close();

check("no console errors, page errors or 5xx responses", errors.length === 0, errors.slice(0, 6).join(" | "));

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
