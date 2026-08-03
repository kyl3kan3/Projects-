/**
 * The reminder engine, against the real database.
 *
 * The unit tests prove the ladder's arithmetic in isolation. This proves what they
 * cannot: that the sweep, the ledger's unique index, per-organization timezones and
 * the exactly-once guarantee hold when real rows and real Postgres constraints are
 * involved — and specifically the two failure modes a missed grant deadline makes
 * unforgivable:
 *
 *   silent after one notice  →  checked by walking a clock across every rung
 *   mailing daily forever    →  checked by sweeping a year past the due date
 */
process.env.DRY_RUN = "1"; // a suppressed send still spends its rung — that is the point

const { getDb, closeDb } = await import("./src/db/index.ts");
const schema = await import("./src/db/schema.ts");
const { runSweep } = await import("./src/lib/sweep.ts");
const { addDays, todayIn } = await import("./src/lib/dates.ts");
const { OVERDUE_OFFSET } = await import("./src/lib/reminders.ts");
const { hashPassword } = await import("./src/lib/auth.ts");
const { eq, inArray } = await import("drizzle-orm");

const db = getDb();
const stamp = Date.now();
let failures = 0;
let seq = 0;
const orgs = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) {
    console.log(`      expected ${JSON.stringify(expected)}`);
    console.log(`      actual   ${JSON.stringify(actual)}`);
  }
}

async function makeOrg(timezone, label) {
  seq++;
  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: `${label} ${stamp}-${seq}`,
      timezone,
      plan: "grow",
      subscriptionStatus: "active",
    })
    .returning();
  const [user] = await db
    .insert(schema.users)
    .values({
      email: `deadlines-${stamp}-${seq}@example.org`,
      name: label,
      passwordHash: await hashPassword("verify-deadlines-password"),
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
      awardedAmountCents: 750_000,
      ownerUserId: user.id,
      stage: "applying",
    })
    .returning();
  orgs.push(org.id);
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

async function ledger(deadlineId) {
  const rows = await db
    .select()
    .from(schema.reminders)
    .where(eq(schema.reminders.deadlineId, deadlineId));
  return rows.sort((a, b) => b.offsetDays - a.offsetDays);
}

try {
  /* ============ 1. the ladder walks inward, then stops for good ============ */
  const ctx = await makeOrg("America/New_York", "Ladder");
  const today = todayIn("America/New_York");
  const deadline = await addDeadline(ctx, "application", addDays(today, 20));

  await runSweep(new Date());
  check("20 days out: nothing sent yet", (await ledger(deadline.id)).length, 0);

  // Walk a clock towards the deadline (and past it) by moving the due date in,
  // sweeping on each simulated day exactly as the nightly cron would.
  const walk = [];
  for (const daysOut of [15, 14, 13, 8, 7, 5, 2, 1, 0, -1, -2, -7, -30, -200, -365]) {
    await db
      .update(schema.deadlines)
      .set({ dueOn: addDays(today, daysOut) })
      .where(eq(schema.deadlines.id, deadline.id));
    await runSweep(new Date());
    walk.push([daysOut, (await ledger(deadline.id)).length]);
  }
  check(
    "one notice per rung crossed, and never a second for the same rung",
    walk,
    [
      [15, 0], [14, 1], [13, 1], [8, 1], [7, 2], [5, 2], [2, 2],
      [1, 3], [0, 3], [-1, 4], [-2, 4], [-7, 4], [-30, 4], [-200, 4], [-365, 4],
    ],
  );

  const rungs = await ledger(deadline.id);
  check(
    "the four rungs are 14, 7, 1 and one pinned overdue notice",
    rungs.map((r) => r.offsetDays),
    [14, 7, 1, OVERDUE_OFFSET],
  );
  check(
    "NOT SILENT: all three warnings fired, not just the first",
    rungs.filter((r) => r.offsetDays > 0).length,
    3,
  );
  check(
    "NOT FOREVER: a year of daily sweeps past the date added nothing",
    rungs.length,
    4,
  );
  check(
    "recorded as suppressed, never as delivered, when email is off",
    [...new Set(rungs.map((r) => r.status))],
    ["suppressed"],
  );
  check(
    "each rung records the org-local date it belonged to",
    rungs.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.scheduledFor)),
    true,
  );

  /* ============ 2. idempotency, enforced by the database ============ */
  const before = (await ledger(deadline.id)).length;
  await Promise.all([runSweep(new Date()), runSweep(new Date())]); // deliberately racing
  await runSweep(new Date());
  check("three more sweeps, two of them concurrent, add nothing", (await ledger(deadline.id)).length, before);

  let rejected = false;
  try {
    await db.insert(schema.reminders).values({
      organizationId: ctx.org.id,
      deadlineId: deadline.id,
      offsetDays: 14,
      scheduledFor: today,
      status: "sent",
    });
  } catch {
    rejected = true;
  }
  check("the unique index refuses a duplicate (deadline, rung)", rejected, true);

  /* ============ 3. completing a deadline stops the ladder ============ */
  const doneCtx = await makeOrg("America/New_York", "Completed");
  const doneDeadline = await addDeadline(doneCtx, "application", addDays(today, 3));
  await db
    .update(schema.deadlines)
    .set({ completedAt: new Date() })
    .where(eq(schema.deadlines.id, doneDeadline.id));
  for (const daysOut of [3, 1, 0, -1, -20]) {
    await db
      .update(schema.deadlines)
      .set({ dueOn: addDays(today, daysOut) })
      .where(eq(schema.deadlines.id, doneDeadline.id));
    await runSweep(new Date());
  }
  check("a deadline marked done is never mailed about", (await ledger(doneDeadline.id)).length, 0);

  /* ============ 4. a deadline added late is warned, not skipped ============ */
  const lateCtx = await makeOrg("America/New_York", "Late add");
  const lateDeadline = await addDeadline(lateCtx, "application", addDays(today, 4));
  const lateWalk = [];
  for (const daysOut of [4, 1, -1, -60]) {
    await db
      .update(schema.deadlines)
      .set({ dueOn: addDays(today, daysOut) })
      .where(eq(schema.deadlines.id, lateDeadline.id));
    await runSweep(new Date());
    lateWalk.push((await ledger(lateDeadline.id)).map((r) => r.offsetDays));
  }
  check(
    "added inside its own window: the tightest crossed rung fires, not a stale one",
    lateWalk,
    [[7], [7, 1], [7, 1, OVERDUE_OFFSET], [7, 1, OVERDUE_OFFSET]],
  );

  const backdatedCtx = await makeOrg("America/New_York", "Backdated");
  const backdated = await addDeadline(backdatedCtx, "application", addDays(today, -3));
  await runSweep(new Date());
  await runSweep(new Date());
  check(
    "added after it was already due: exactly one notice, ever",
    (await ledger(backdated.id)).map((r) => r.offsetDays),
    [OVERDUE_OFFSET],
  );

  /* ============ 5. report last calls escalate to the whole org ============ */
  const reportCtx = await makeOrg("America/New_York", "Report");
  const [second] = await db
    .insert(schema.users)
    .values({
      email: `deadlines-${stamp}-escalate@example.org`,
      name: "Second member",
      passwordHash: await hashPassword("verify-deadlines-password"),
    })
    .returning();
  await db
    .insert(schema.memberships)
    .values({ organizationId: reportCtx.org.id, userId: second.id, role: "member" });

  const report = await addDeadline(reportCtx, "report", addDays(today, 14));
  await runSweep(new Date()); // rung 14
  for (const daysOut of [7, 1, -1]) {
    await db
      .update(schema.deadlines)
      .set({ dueOn: addDays(today, daysOut) })
      .where(eq(schema.deadlines.id, report.id));
    await runSweep(new Date());
  }
  const reportRungs = await ledger(report.id);
  check(
    "the two early report notices go to the grant owner only",
    reportRungs.filter((r) => r.offsetDays >= 7).map((r) => r.recipients.length),
    [1, 1],
  );
  check(
    "the last call and the overdue notice go to everyone on the account",
    reportRungs.filter((r) => r.offsetDays <= 1).map((r) => r.recipients.length),
    [2, 2],
  );

  const appCtx = await makeOrg("America/New_York", "Application escalation");
  const [alsoMember] = await db
    .insert(schema.users)
    .values({
      email: `deadlines-${stamp}-app@example.org`,
      passwordHash: await hashPassword("verify-deadlines-password"),
    })
    .returning();
  await db
    .insert(schema.memberships)
    .values({ organizationId: appCtx.org.id, userId: alsoMember.id, role: "member" });
  const app = await addDeadline(appCtx, "application", addDays(today, 0));
  await runSweep(new Date());
  check(
    "an application last call stays with the owner — only reports escalate",
    (await ledger(app.id))[0]?.recipients.length,
    1,
  );

  /* ============ 6. deadlines are dates in the org's timezone ============ */
  // At 06:00 UTC on 31 December it is already the 31st in New York but still the
  // 30th in Honolulu. A deadline dated 14 January is 14 days out for one and 15 for
  // the other, so exactly one of them should be warned. A sweep keyed on the UTC
  // date warns both — a day early for one, every single time.
  const ny = await makeOrg("America/New_York", "TZ New York");
  const hi = await makeOrg("Pacific/Honolulu", "TZ Honolulu");
  const nyDeadline = await addDeadline(ny, "application", "2026-01-14");
  const hiDeadline = await addDeadline(hi, "application", "2026-01-14");

  await runSweep(new Date("2025-12-31T06:00:00Z"));
  check(
    "the org whose local date is still the 30th is not warned early",
    [(await ledger(nyDeadline.id)).length, (await ledger(hiDeadline.id)).length],
    [1, 0],
  );
  await runSweep(new Date("2025-12-31T18:00:00Z"));
  check(
    "and it is warned on its own 14th day, twelve hours later",
    (await ledger(hiDeadline.id)).length,
    1,
  );
  check(
    "both rungs are stamped with the same local calendar date",
    [
      (await ledger(nyDeadline.id))[0].scheduledFor,
      (await ledger(hiDeadline.id))[0].scheduledFor,
    ],
    ["2025-12-31", "2025-12-31"],
  );

  /* ============ 7. across a DST boundary, in both directions ============ */
  // US clocks moved forward on 8 March 2026. Fourteen days before 22 March is the
  // 8th — the 23-hour day itself. Millisecond arithmetic on a local Date lands on
  // the 7th here and fires a day early, once a year, invisibly.
  const spring = await makeOrg("America/New_York", "TZ spring forward");
  const springDeadline = await addDeadline(spring, "application", "2026-03-22");
  await runSweep(new Date("2026-03-07T18:00:00Z"));
  const springBefore = (await ledger(springDeadline.id)).length;
  await runSweep(new Date("2026-03-08T18:00:00Z"));
  const springAfter = await ledger(springDeadline.id);
  check(
    "spring forward: the 14-day rung lands on the boundary day, not the day before",
    [springBefore, springAfter.length, springAfter[0]?.scheduledFor],
    [0, 1, "2026-03-08"],
  );

  // Clocks moved back on 1 November 2026 (a 25-hour day). Fourteen days before
  // 15 November is the 1st.
  const autumn = await makeOrg("America/New_York", "TZ fall back");
  const autumnDeadline = await addDeadline(autumn, "application", "2026-11-15");
  await runSweep(new Date("2026-10-31T18:00:00Z"));
  const autumnBefore = (await ledger(autumnDeadline.id)).length;
  await runSweep(new Date("2026-11-01T18:00:00Z"));
  const autumnAfter = await ledger(autumnDeadline.id);
  check(
    "fall back: the 14-day rung lands on the 25-hour day itself",
    [autumnBefore, autumnAfter.length, autumnAfter[0]?.scheduledFor],
    [0, 1, "2026-11-01"],
  );

  // A zone with no DST at all, and a half-hour zone, on the same dates.
  const noDst = await makeOrg("America/Phoenix", "TZ Phoenix");
  const halfHour = await makeOrg("Asia/Kolkata", "TZ Kolkata");
  const phx = await addDeadline(noDst, "application", "2026-03-22");
  const kol = await addDeadline(halfHour, "application", "2026-03-22");
  await runSweep(new Date("2026-03-08T18:00:00Z"));
  check(
    "a no-DST zone and a half-hour zone both land on 8 March",
    [
      (await ledger(phx.id))[0]?.scheduledFor,
      (await ledger(kol.id))[0]?.scheduledFor,
    ],
    ["2026-03-08", "2026-03-08"],
  );

  /* ============ 8. the activity log records every notice ============ */
  const logs = await db
    .select()
    .from(schema.activityLog)
    .where(eq(schema.activityLog.organizationId, ctx.org.id));
  check(
    "every notice left an activity entry someone can audit",
    logs.filter((l) => l.event === "reminder_sent").length,
    4,
  );

  /* ============ 9. a lapsed trial is reconciled, not left stale ============ */
  const trial = await makeOrg("America/New_York", "Trial");
  await db
    .update(schema.organizations)
    .set({
      plan: "grow",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(Date.now() - 86_400_000),
    })
    .where(eq(schema.organizations.id, trial.org.id));
  await runSweep(new Date());
  const [reconciled] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, trial.org.id));
  check(
    "an expired trial drops to Seed",
    [reconciled.plan, reconciled.subscriptionStatus],
    ["seed", "trial_expired"],
  );

  console.log(`\n${failures === 0 ? "ALL DEADLINE CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
} finally {
  if (orgs.length) {
    await db.delete(schema.organizations).where(inArray(schema.organizations.id, orgs));
  }
  const leftover = await db.select().from(schema.users);
  const mine = leftover.filter((u) => u.email.startsWith(`deadlines-${stamp}-`)).map((u) => u.id);
  if (mine.length) await db.delete(schema.users).where(inArray(schema.users.id, mine));
  await closeDb();
}

process.exit(failures === 0 ? 0 : 1);
