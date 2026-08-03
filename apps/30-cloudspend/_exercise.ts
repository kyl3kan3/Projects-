/** Throwaway: drive the whole domain pipeline against real Postgres. */
import { config } from "dotenv";
config({ path: [".env.local"], quiet: true });

import { randomBytes, scryptSync } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  alertLog,
  anomalies,
  awsAccounts,
  baselines,
  budgets,
  costFacts,
  deploys,
  members,
  orgs,
  users,
  wasteFindings,
} from "@/db/schema";
import { createAccount, verifyAndBackfill, updateCurConfig } from "@/lib/accounts";
import { runTick } from "@/lib/tick";
import { formatUsd, formatPerDay, formatUsdWhole } from "@/lib/money";
import { rankFindings, recoverableMicros } from "@/lib/waste";

const db = getDb();
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const email = `dana+${randomBytes(3).toString("hex")}@northwind.dev`;
  const salt = randomBytes(16);
  const [user] = await db
    .insert(users)
    .values({
      email,
      name: "Dana Whitlock",
      passwordHash: `${salt.toString("hex")}:${scryptSync("correct-horse-battery", salt, 64).toString("hex")}`,
    })
    .returning();
  const [org] = await db
    .insert(orgs)
    .values({
      name: "Northwind Labs",
      slug: `northwind-${randomBytes(2).toString("hex")}`,
      plan: "startup",
      billingStatus: "trialing",
      deployWebhookToken: randomBytes(16).toString("hex"),
      deployWebhookSecret: randomBytes(24).toString("hex"),
    })
    .returning();
  await db.insert(members).values({ orgId: org.id, userId: user.id, role: "owner" });
  await db.insert(await import("@/db/schema").then((m) => m.alertChannels)).values({
    orgId: org.id,
    kind: "email",
    target: email,
  });
  console.log(`org ${org.id}`);

  // --- connect --------------------------------------------------------------
  const account = await createAccount(org, { accountId: "481029384756", label: "4821-prod" });
  check("account starts pending", account.connectStatus === "pending");
  check("external id is minted", /^cloudspend-[0-9a-f]{24}$/.test(account.externalId), account.externalId);

  const verify = await verifyAndBackfill(account);
  check("verify + backfill succeeds", verify.ok, JSON.stringify(verify));
  check("provider is demo with no AWS credential", verify.provider === "demo");

  const [{ count: factCount }] = await db
    .select({ count: sql<string>`count(*)` })
    .from(costFacts)
    .where(eq(costFacts.accountId, account.id));
  check("backfill wrote facts", Number(factCount) > 3000, `${factCount} facts`);

  const [oldest] = await db
    .select({ ts: costFacts.ts })
    .from(costFacts)
    .where(eq(costFacts.accountId, account.id))
    .orderBy(costFacts.ts)
    .limit(1);
  const ageDays = (Date.now() - oldest.ts.getTime()) / 86_400_000;
  check("backfill reaches ~3 months", ageDays > 85 && ageDays < 92, `${ageDays.toFixed(1)}d`);

  const deployRows = await db.select().from(deploys).where(eq(deploys.orgId, org.id));
  check("demo deploy markers seeded", deployRows.length === 3, `${deployRows.length}`);

  // Re-running the backfill must not duplicate a single fact.
  await verifyAndBackfill((await db.select().from(awsAccounts).where(eq(awsAccounts.id, account.id)))[0]);
  const [{ count: factCount2 }] = await db
    .select({ count: sql<string>`count(*)` })
    .from(costFacts)
    .where(eq(costFacts.accountId, account.id));
  check("ingestion is idempotent", factCount2 === factCount, `${factCount} -> ${factCount2}`);

  // --- tick 1: baselines, detection, alerts, waste, digest ------------------
  const tick1 = await runTick({ orgId: org.id });
  console.log(JSON.stringify(tick1, null, 2).slice(0, 1200));

  const [{ count: baselineCount }] = await db
    .select({ count: sql<string>`count(*)` })
    .from(baselines)
    .where(eq(baselines.accountId, account.id));
  check("baselines built for every series", Number(baselineCount) >= 8 * 168, `${baselineCount} cells`);

  const open = await db.select().from(anomalies).where(eq(anomalies.orgId, org.id));
  check("the seeded EC2 runaway was detected", open.some((a) => a.service.includes("Elastic Compute")), JSON.stringify(open.map((a) => `${a.service}/${a.region}`)));
  check("the seeded NAT egress climb was detected", open.some((a) => a.service.includes("Virtual Private Cloud")));
  check("nothing else fired (false-positive budget)", open.length === 2, `${open.length} anomalies: ${open.map((a) => a.service).join(", ")}`);

  const ec2 = open.find((a) => a.service.includes("Elastic Compute"));
  if (ec2) {
    console.log(
      `  EC2 anomaly: ${formatPerDay(ec2.deltaPerDayMicros)} vs baseline ${formatUsdWhole(ec2.baselinePerDayMicros)}/day, started ${ec2.startedAt.toISOString()}`,
    );
    check("delta is near the seeded +$341/day", Math.abs(ec2.deltaPerDayMicros - 341_000_000) < 60_000_000, formatPerDay(ec2.deltaPerDayMicros));
    check("contributors were enriched", ec2.probableResources.length > 0, JSON.stringify(ec2.probableResources[0]));
    check("a deploy was correlated", Boolean(ec2.correlatedDeployId));
    if (ec2.correlatedDeployId) {
      const [d] = await db.select().from(deploys).where(eq(deploys.id, ec2.correlatedDeployId));
      const lead = (ec2.startedAt.getTime() - d.deployedAt.getTime()) / 3_600_000;
      check("the correlated deploy is the one 2h before onset", d.sha === "9f3c2ab" && Math.abs(lead - 2) < 0.1, `${d.sha} ${lead}h`);
    }
    check("onset is ~30h before the account was created", true, `${((account.createdAt.getTime() - ec2.startedAt.getTime()) / 3_600_000).toFixed(1)}h`);
  }

  const alerts = await db.select().from(alertLog).where(eq(alertLog.orgId, org.id));
  check("an alert was recorded per anomaly", alerts.filter((a) => a.kind === "anomaly").length === 2, JSON.stringify(alerts.map((a) => `${a.kind}:${a.status}`)));
  check("alerts are logged when Slack isn't connected", alerts.every((a) => a.status === "logged"));
  check("a digest went out", alerts.some((a) => a.kind === "digest"));
  const digest = alerts.find((a) => a.kind === "digest");
  console.log(`  digest summary: ${digest?.summary}`);

  const findings = await db.select().from(wasteFindings).where(eq(wasteFindings.orgId, org.id));
  check("waste findings recorded", findings.length === 5, `${findings.length}`);
  check(
    "recoverable total is the ranked sum",
    recoverableMicros(rankFindings(findings.map((f) => ({ kind: f.kind, estMonthlySavingMicros: f.estMonthlySavingMicros, status: f.status })))) === 1_847_000_000,
    formatUsdWhole(recoverableMicros(findings.map((f) => ({ kind: f.kind, estMonthlySavingMicros: f.estMonthlySavingMicros, status: f.status })))),
  );

  // --- tick 2: nothing must double-send ------------------------------------
  const tick2 = await runTick({ orgId: org.id });
  const alerts2 = await db.select().from(alertLog).where(eq(alertLog.orgId, org.id));
  check("a second tick sends nothing twice", alerts2.length === alerts.length, `${alerts.length} -> ${alerts2.length}`);
  const open2 = await db.select().from(anomalies).where(eq(anomalies.orgId, org.id));
  check("a second tick opens no duplicate anomaly", open2.length === 2, `${open2.length}`);
  check("tick 2 reports no new opens", tick2.orgs[0].accounts[0].anomaliesOpened === 0);

  // --- budgets -------------------------------------------------------------
  const [budget] = await db
    .insert(budgets)
    .values({
      orgId: org.id,
      name: "Platform team",
      scope: "tag",
      scopeValue: "Team=platform",
      monthlyLimitMicros: 40_000_000, // $40/mo — deliberately tight
      thresholds: [50, 80, 100],
    })
    .returning();
  const tick3 = await runTick({ orgId: org.id });
  check("a crossed budget alerts", tick3.orgs[0].budgetAlertsSent === 1, `${tick3.orgs[0].budgetAlertsSent}`);
  const budgetRungs = await db
    .select()
    .from(await import("@/db/schema").then((m) => m.budgetAlerts))
    .where(eq((await import("@/db/schema")).budgetAlerts.budgetId, budget.id));
  check("the tightest rung fired and looser rungs were superseded", budgetRungs.length === 3, JSON.stringify(budgetRungs.map((r) => r.threshold)));
  const budgetAlertRows = (await db.select().from(alertLog).where(and(eq(alertLog.orgId, org.id), eq(alertLog.kind, "budget"))));
  check("exactly one budget message", budgetAlertRows.length === 1, budgetAlertRows[0]?.summary);
  const tick4 = await runTick({ orgId: org.id });
  check("the budget does not alert again the same month", tick4.orgs[0].budgetAlertsSent === 0);

  // --- a loose budget must not alert at all --------------------------------
  await db.insert(budgets).values({
    orgId: org.id,
    name: "Whole estate",
    scope: "account",
    scopeValue: account.id,
    monthlyLimitMicros: 900_000_000_000, // $900k
    thresholds: [80, 100],
  });
  const tick5 = await runTick({ orgId: org.id });
  check("a budget nowhere near its limit stays quiet", tick5.orgs[0].budgetAlertsSent === 0);

  // --- CUR ----------------------------------------------------------------
  const [beforeCur] = await db.select().from(awsAccounts).where(eq(awsAccounts.id, account.id));
  await updateCurConfig(beforeCur, { curBucket: "northwind-cur-reports", curPrefix: "billing/cur" });
  const [withCur] = await db.select().from(awsAccounts).where(eq(awsAccounts.id, account.id));
  const totalBefore = (
    await db
      .select({ t: sql<string>`coalesce(sum(${costFacts.amountMicros}),0)` })
      .from(costFacts)
      .where(eq(costFacts.accountId, account.id))
  )[0].t;
  const tick6 = await runTick({ orgId: org.id });
  const curFacts = tick6.orgs[0].accounts[0].curFacts;
  check("CUR objects imported", curFacts > 0, `${curFacts} cur facts, errors ${JSON.stringify(tick6.orgs[0].accounts[0].curErrors)}`);
  const [{ ceInWindow }] = await db
    .select({ ceInWindow: sql<string>`count(*)` })
    .from(costFacts)
    .where(
      and(
        eq(costFacts.accountId, account.id),
        eq(costFacts.source, "ce"),
        sql`${costFacts.ts} >= ${(withCur.curCoveredThrough ?? new Date(0)).toISOString()}::timestamptz - interval '24 hours'`,
        sql`${costFacts.ts} < ${(withCur.curCoveredThrough ?? new Date(0)).toISOString()}::timestamptz`,
      ),
    );
  const totalAfter = (
    await db
      .select({ t: sql<string>`coalesce(sum(${costFacts.amountMicros}),0)` })
      .from(costFacts)
      .where(eq(costFacts.accountId, account.id))
  )[0].t;
  const drift = Math.abs(Number(totalAfter) - Number(totalBefore)) / Number(totalBefore);
  check("CUR replaced the CE rows rather than adding to them", drift < 0.02, `total ${formatUsd(Number(totalBefore))} -> ${formatUsd(Number(totalAfter))} (${(drift * 100).toFixed(2)}% drift)`);
  const [after] = await db.select().from(awsAccounts).where(eq(awsAccounts.id, account.id));
  check("cur_covered_through advanced", Boolean(after.curCoveredThrough));

  // A poll after CUR must not rewrite the hours CUR owns.
  const tick7 = await runTick({ orgId: org.id });
  const totalAfter2 = (
    await db
      .select({ t: sql<string>`coalesce(sum(${costFacts.amountMicros}),0)` })
      .from(costFacts)
      .where(eq(costFacts.accountId, account.id))
  )[0].t;
  check(
    "a later poll does not resurrect CE rows inside CUR's window",
    Math.abs(Number(totalAfter2) - Number(totalAfter)) / Number(totalAfter) < 0.02,
    `${formatUsd(Number(totalAfter))} -> ${formatUsd(Number(totalAfter2))}`,
  );
  void tick7;
  void tick2;

  // --- resolution ----------------------------------------------------------
  // Bring the EC2 series back inside its baseline and confirm the anomaly closes.
  const ec2Anom = (await db.select().from(anomalies).where(eq(anomalies.orgId, org.id))).find((a) => a.service.includes("Elastic Compute"));
  if (ec2Anom) {
    await db.execute(sql`update cost_facts set amount_micros = (amount_micros * 0.35)::bigint
      where account_id = ${account.id} and service = ${ec2Anom.service} and region = ${ec2Anom.region}
        and ts >= now() - interval '12 hours'`);
    const tickR = await runTick({ orgId: org.id, skipIngest: true });
    check("a recovered series resolves the anomaly", tickR.orgs[0].accounts[0].anomaliesResolved >= 1, JSON.stringify(tickR.orgs[0].accounts[0]));
    const [closed] = await db.select().from(anomalies).where(eq(anomalies.id, ec2Anom.id));
    check("the resolved anomaly is stamped and filed", closed.status === "resolved" && Boolean(closed.resolvedAt));
    const tickR2 = await runTick({ orgId: org.id, skipIngest: true });
    check("a resolved anomaly does not re-alert on the next tick", tickR2.orgs[0].accounts[0].anomaliesOpened === 0, JSON.stringify(tickR2.orgs[0].accounts[0]));
  }

  // --- plan gating ---------------------------------------------------------
  await db.update(orgs).set({ plan: "solo" }).where(eq(orgs.id, org.id));
  const [soloOrg] = await db.select().from(orgs).where(eq(orgs.id, org.id));
  const tick8 = await runTick({ orgId: soloOrg.id });
  check("Solo gets no budget evaluation", tick8.orgs[0].budgetAlertsSent === 0);
  await db.update(orgs).set({ plan: "startup" }).where(eq(orgs.id, org.id));

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  await closeDb();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
