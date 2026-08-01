/**
 * End-to-end verification of the reminder engine against the real database.
 *
 * The unit tests prove the ladder's arithmetic. This proves the part they cannot:
 * that the sweep, the ledger's unique index, the timezone handling and the
 * exactly-once claim all hold when actual rows are involved. A throwaway script,
 * per the brief — the reusable parts already live in src/lib/*.test.ts.
 */
import { config } from "node:process";
void config;

process.env.DRY_RUN = "1"; // suppressed sends still spend a rung, which is what we check

const { getDb, closeDb } = await import("./src/db/index.ts");
const schema = await import("./src/db/schema.ts");
const { runSweep } = await import("./src/lib/sweep.ts");
const { addDays, todayIn } = await import("./src/lib/dates.ts");
const { OVERDUE_OFFSET } = await import("./src/lib/reminders.ts");
const { eq, inArray } = await import("drizzle-orm");
const { hashPassword } = await import("./src/lib/auth.ts");

const db = getDb();
const stamp = Date.now();
let failures = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
}

/** Build an org in a given timezone with one deadline at a given offset from today. */
async function makeOrg(name, timezone) {
  const [org] = await db
    .insert(schema.organizations)
    .values({ name, timezone, plan: "grow", subscriptionStatus: "active" })
    .returning();
  const [user] = await db
    .insert(schema.users)
    .values({
      email: `sweep-${stamp}-${name.replace(/\W/g, "")}@example.org`,
      name,
      passwordHash: await hashPassword("sweep-test-password"),
    })
    .returning();
  await db
    .insert(schema.memberships)
    .values({ organizationId: org.id, userId: user.id, role: "owner" });
  const [grant] = await db
    .insert(schema.grants)
    .values({
      organizationId: org.id,
      title: "Verification grant",
      funderName: "Sample Verification Foundation",
      askAmountCents: 1_000_000,
      ownerUserId: user.id,
      stage: "applying",
    })
    .returning();
  return { org, user, grant };
}

async function addDeadline(ctx, kind, dueOn) {
  const [row] = await db
    .insert(schema.deadlines)
    .values({
      organizationId: ctx.org.id,
      grantId: ctx.grant.id,
      kind,
      dueOn,
      label: `${kind} for verification`,
    })
    .returning();
  return row;
}

async function ledgerFor(deadlineId) {
  const rows = await db
    .select()
    .from(schema.reminders)
    .where(eq(schema.reminders.deadlineId, deadlineId));
  return rows.sort((a, b) => b.offsetDays - a.offsetDays);
}

const created = [];

try {
  /* ---- 1. the ladder walks inward, one rung per sweep day, and then stops ---- */
  const ctx = await makeOrg(`Sweep NY ${stamp}`, "America/New_York");
  created.push(ctx.org.id);
  const today = todayIn("America/New_York");
  const due = addDays(today, 20);
  const deadline = await addDeadline(ctx, "application", due);

  // 20 days out: nothing is due yet.
  let summary = await runSweep(new Date());
  check("nothing sent 20 days out", (await ledgerFor(deadline.id)).length, 0);

  // Walk a simulated clock forward one day at a time by moving the due date closer.
  const seen = [];
  for (const daysOut of [14, 13, 7, 5, 1, 0, -1, -2, -30]) {
    await db
      .update(schema.deadlines)
      .set({ dueOn: addDays(today, daysOut) })
      .where(eq(schema.deadlines.id, deadline.id));
    await runSweep(new Date());
    const rows = await ledgerFor(deadline.id);
    seen.push([daysOut, rows.length]);
  }
  check(
    "one rung per crossing, four in total, then silence",
    seen,
    [
      [14, 1],
      [13, 1],
      [7, 2],
      [5, 2],
      [1, 3],
      [0, 3],
      [-1, 4],
      [-2, 4],
      [-30, 4],
    ],
  );
  const finalLedger = await ledgerFor(deadline.id);
  check(
    "the four rungs are 14, 7, 1 and the single overdue notice",
    finalLedger.map((r) => r.offsetDays),
    [14, 7, 1, OVERDUE_OFFSET],
  );
  check(
    "suppressed, not falsely recorded as delivered",
    Array.from(new Set(finalLedger.map((r) => r.status))),
    ["suppressed"],
  );

  /* ---- 2. re-running the sweep sends nothing twice ---- */
  const before = (await ledgerFor(deadline.id)).length;
  await runSweep(new Date());
  await runSweep(new Date());
  check("two extra sweeps add no rows", (await ledgerFor(deadline.id)).length, before);

  /* ---- 3. the unique index is the actual guarantee ---- */
  let duplicateRejected = false;
  try {
    await db.insert(schema.reminders).values({
      organizationId: ctx.org.id,
      deadlineId: deadline.id,
      offsetDays: 14,
      scheduledFor: today,
      status: "sent",
    });
  } catch {
    duplicateRejected = true;
  }
  check("the database refuses a duplicate (deadline, rung)", duplicateRejected, true);

  /* ---- 4. marking a deadline done stops the ladder ---- */
  const ctx2 = await makeOrg(`Sweep done ${stamp}`, "America/New_York");
  created.push(ctx2.org.id);
  const d2 = await addDeadline(ctx2, "application", addDays(today, 3));
  await db
    .update(schema.deadlines)
    .set({ completedAt: new Date() })
    .where(eq(schema.deadlines.id, d2.id));
  await runSweep(new Date());
  check("a completed deadline is never mailed about", (await ledgerFor(d2.id)).length, 0);

  /* ---- 5. report last calls escalate to every user in the org ---- */
  const ctx3 = await makeOrg(`Sweep report ${stamp}`, "America/New_York");
  created.push(ctx3.org.id);
  const [second] = await db
    .insert(schema.users)
    .values({
      email: `sweep-${stamp}-second@example.org`,
      name: "Second member",
      passwordHash: await hashPassword("sweep-test-password"),
    })
    .returning();
  await db
    .insert(schema.memberships)
    .values({ organizationId: ctx3.org.id, userId: second.id, role: "member" });

  const report = await addDeadline(ctx3, "report", addDays(today, 14));
  await runSweep(new Date()); // rung 14 → owner only
  await db
    .update(schema.deadlines)
    .set({ dueOn: addDays(today, 1) })
    .where(eq(schema.deadlines.id, report.id));
  await runSweep(new Date()); // rung 7 → owner only
  await db
    .update(schema.deadlines)
    .set({ dueOn: addDays(today, 0) })
    .where(eq(schema.deadlines.id, report.id));
  await runSweep(new Date()); // rung 1 → the whole org

  const reportLedger = await ledgerFor(report.id);
  const byRung = Object.fromEntries(
    reportLedger.map((r) => [r.offsetDays, r.recipients.length]),
  );
  check("the 14-day report notice goes to the owner only", byRung[14], 1);
  check("the last-call report notice goes to both members", byRung[1], 2);

  /* ---- 6. an application deadline does not escalate ---- */
  const ctx4 = await makeOrg(`Sweep app ${stamp}`, "America/New_York");
  created.push(ctx4.org.id);
  const [alsoMember] = await db
    .insert(schema.users)
    .values({
      email: `sweep-${stamp}-third@example.org`,
      passwordHash: await hashPassword("sweep-test-password"),
    })
    .returning();
  await db
    .insert(schema.memberships)
    .values({ organizationId: ctx4.org.id, userId: alsoMember.id, role: "member" });
  const app = await addDeadline(ctx4, "application", addDays(today, 0));
  await runSweep(new Date());
  const appLedger = await ledgerFor(app.id);
  check("an application last call stays with the owner", appLedger[0]?.recipients.length, 1);

  /* ---- 7. timezone: an org a day behind is not warned early ---- */
  // At 2025-12-31 06:00 UTC it is already 31 December in New York but still the
  // 30th in Honolulu. A deadline dated 14 January is therefore 14 days out for the
  // New York org (its rung fires) and 15 for the Honolulu one (it does not). A
  // sweep that used the UTC date would warn both, a day early for one of them.
  const instant = new Date("2025-12-31T06:00:00Z");
  const ny = await makeOrg(`TZ NY ${stamp}`, "America/New_York");
  const hi = await makeOrg(`TZ HI ${stamp}`, "Pacific/Honolulu");
  created.push(ny.org.id, hi.org.id);
  const nyDeadline = await addDeadline(ny, "application", "2026-01-14");
  const hiDeadline = await addDeadline(hi, "application", "2026-01-14");
  await runSweep(instant);
  check(
    "the org whose local date is 31 Dec is not warned a day early",
    [(await ledgerFor(nyDeadline.id)).length, (await ledgerFor(hiDeadline.id)).length],
    [1, 0],
  );
  // Twelve hours on it is the 31st in Honolulu too, and it is warned.
  await runSweep(new Date("2025-12-31T18:00:00Z"));
  check(
    "and it is warned on its own 14th day",
    (await ledgerFor(hiDeadline.id)).length,
    1,
  );

  /* ---- 8. DST: 14 days before 22 March 2026 is 8 March, the clock-change day ---- */
  const dst = await makeOrg(`TZ DST ${stamp}`, "America/New_York");
  created.push(dst.org.id);
  const dstDeadline = await addDeadline(dst, "application", "2026-03-22");
  // 7 March local: not yet.
  await runSweep(new Date("2026-03-07T18:00:00Z"));
  const beforeDst = (await ledgerFor(dstDeadline.id)).length;
  // 8 March local, after the 2am jump: exactly the 14-day rung.
  await runSweep(new Date("2026-03-08T18:00:00Z"));
  const afterDst = await ledgerFor(dstDeadline.id);
  check(
    "the 14-day rung lands on the DST boundary day, not the day before",
    [beforeDst, afterDst.length, afterDst[0]?.scheduledFor],
    [0, 1, "2026-03-08"],
  );

  /* ---- 9. a trial that has run out is reconciled to Seed ---- */
  const expired = await makeOrg(`Trial ${stamp}`, "America/New_York");
  created.push(expired.org.id);
  await db
    .update(schema.organizations)
    .set({
      plan: "grow",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(Date.now() - 86_400_000),
    })
    .where(eq(schema.organizations.id, expired.org.id));
  await runSweep(new Date());
  const [reconciled] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, expired.org.id));
  check(
    "an expired trial drops to Seed",
    [reconciled.plan, reconciled.subscriptionStatus],
    ["seed", "trial_expired"],
  );

  /* ---- 10. the activity log records what was sent ---- */
  const logs = await db
    .select()
    .from(schema.activityLog)
    .where(eq(schema.activityLog.organizationId, ctx.org.id));
  check(
    "every notice left an activity entry",
    logs.filter((l) => l.event === "reminder_sent").length,
    4,
  );

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
} finally {
  if (created.length) {
    await db.delete(schema.organizations).where(inArray(schema.organizations.id, created));
    await db
      .delete(schema.users)
      .where(inArray(schema.users.email, [
        `sweep-${stamp}-second@example.org`,
        `sweep-${stamp}-third@example.org`,
      ]));
    const leftover = await db.select().from(schema.users);
    for (const u of leftover) {
      if (u.email.startsWith(`sweep-${stamp}-`)) {
        await db.delete(schema.users).where(eq(schema.users.id, u.id));
      }
    }
  }
  await closeDb();
}

process.exit(failures === 0 ? 0 : 1);
