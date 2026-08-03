import { chromium } from "playwright";
import { execSync } from "node:child_process";
const OUT = "/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/qf31/shots";
const psql = (sql) =>
  execSync(
    `su postgres -c "PATH=/usr/lib/postgresql/16/bin:\\$PATH psql -h /tmp -p 5433 -U postgres -d app_31_quotefox -t -A -c \\"${sql.replace(/"/g, '\\\\"')}\\""`,
    { encoding: "utf8" },
  ).trim();

let failures = 0;
const check = (l, ok, d) => { if (ok) console.log("  ok  ", l); else { failures++; console.log("  FAIL", l, d ?? ""); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// Sign in as the org we drove earlier.
const email = psql("select email from users order by created_at desc limit 1");
await page.goto("http://localhost:3031/login", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "driveway-quotes-2026");
await page.click('button[type="submit"]');
await page.waitForURL("**/jobs", { timeout: 30000 });

// The paid deposit should be visible on the proposals screen and the timeline.
await page.goto("http://localhost:3031/proposals", { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/28-deposit-paid-list.png`, fullPage: true });
const listText = await page.textContent("main");
check("proposals list shows the paid deposit", /deposit paid/i.test(listText), listText.slice(0, 200));
await page.locator("main a.row").first().click();
await page.waitForURL("**/proposals/**");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/29-deposit-paid-timeline.png`, fullPage: true });
const timeline = await page.textContent("main");
check("timeline shows the deposit", timeline.includes("Deposit paid"));
check("the timeline shows the acceptance record", timeline.includes("Acceptance record"));

// The homeowner's page should now be the receipt view.
const token = psql("select token_id from proposals where status = 'deposit_paid' order by sent_at desc limit 1");
check("a paid proposal exists", token.length > 0, token);

// Trial expiry → read-only, with data intact.
const orgId = psql("select organization_id from users where email = '" + email + "'");
psql(`update organizations set subscription_status = 'trial_expired' where id = '${orgId}'`);
await page.goto("http://localhost:3031/jobs", { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/30-trial-expired.png`, fullPage: true });
const expired = await page.textContent("main");
check("read-only banner appears", expired.includes("trial has ended"), expired.slice(0, 200));
check("sent work is explicitly still live", expired.includes("stays live"));
check("the job list is still readable", expired.includes("Marisol Vance"));

// Drafting is refused while read-only, and capture is not.
const jobId = psql(`select id from jobs where organization_id = '${orgId}' order by created_at desc limit 1`);
await page.goto(`http://localhost:3031/jobs/${jobId}/capture`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.fill("textarea", "Read-only test: replace the condenser pad.");
await page.click('button:has-text("End walkthrough")');
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/31-read-only-draft-refused.png`, fullPage: true });
const refused = await page.textContent("main");
check("drafting refused with the upgrade message", /trial has ended|read-only/i.test(refused), refused.slice(0, 300));
check("the walkthrough itself was not lost", refused.includes("Read-only test") || refused.includes("Try the draft again"));

psql(`update organizations set subscription_status = 'trialing' where id = '${orgId}'`);

console.log("errors:", errors.length ? errors : "none");
if (errors.length) failures += 1;
console.log(failures === 0 ? "\nSTATE CHECKS PASSED" : `\n${failures} STATE CHECK(S) FAILED`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
