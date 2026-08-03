import "@/lib/load-env";
import { getDb, closeDb } from "@/db";
import { accounts, users, contracts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";
import { grantCredits, creditBalance } from "@/lib/billing";
import { createReview, assembleReport } from "@/lib/contracts";
import { runToCompletion } from "@/lib/pipeline";
import { ensureDefaultPlaybook } from "@/lib/playbook-store";
import { FIXTURES } from "@/fixtures/contracts";

const db = getDb();
console.log("step: db ready");
await ensureDefaultPlaybook();
console.log("step: playbook seeded");

// clean slate for the probe account
const email = "probe@example.com";
const [existingUser] = await db.select().from(users).where(eq(users.email, email));
if (existingUser) await db.delete(accounts).where(eq(accounts.id, existingUser.accountId));

const [account] = await db.insert(accounts).values({ name: "Probe Studio", plan: "freelancer", disclaimerAckAt: new Date() }).returning();
await db.insert(users).values({ accountId: account.id, email, name: "Probe", passwordHash: await hashPassword("password12345") });
await grantCredits({ accountId: account.id, kind: "subscription_grant", credits: 5, amountCents: 2900, stripeRef: "probe-grant-1", expiresAt: new Date(Date.now()+30*86400000) });
console.log("step: account", account.id);
console.log("balance before:", await creditBalance(account.id));

for (const f of FIXTURES) {
  console.log("step: creating", f.key);
  const res = await createReview({ account, actor: "probe", source: { kind: "text", text: f.text } });
  console.log("step: created", res.contractId);
  const progress = await runToCompletion(res.contractId);
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, res.contractId));
  const view = await assembleReport(contract);
  console.log(`\n=== ${f.key} → ${progress.status} (${contract.title} / ${contract.counterparty})`);
  console.log(`   coverage: ${JSON.stringify(view.coverageCounts)} summary: ${JSON.stringify(view.summary)}`);
  const firedKeys = view.rows.flatMap(r => r.flags.map(fl => fl.flag.ruleKey)).sort();
  console.log(`   fired: ${firedKeys.join(", ") || "(none)"}`);
  const missing = f.expectedFlags.filter(k => !firedKeys.includes(k));
  const extra = firedKeys.filter(k => !f.expectedFlags.includes(k));
  console.log(`   expected-missing: ${missing.join(", ") || "none"} | unexpected: ${extra.join(", ") || "none"}`);
  for (const r of view.rows.slice(0, 4)) {
    console.log(`   [${r.severity}] ${r.label} ${r.citation ?? ""} — ${r.summary}`);
    for (const fl of r.flags) console.log(`       ${fl.flag.ruleKey}: ${fl.flag.firedBecause} | src=${fl.flag.explanationSource} | redline=${fl.redline ? fl.redline.suggestedText.slice(0,50) : "NONE"}`);
  }
}
console.log("\nbalance after:", await creditBalance(account.id));
await closeDb();
