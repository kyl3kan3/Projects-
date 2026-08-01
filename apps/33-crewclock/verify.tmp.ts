/**
 * Throwaway end-to-end verification against the real database and the running
 * production server. Deleted when the build report is written.
 */
import "./src/worker/load-env";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { and, eq, gte, isNull } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  crewAssignments,
  jobSites,
  jobs,
  organizations,
  overtimeAlerts,
  timeEntries,
  timeEntryEdits,
  users,
} from "@/db/schema";
import { generateCrewCode, hashPassword, hashPin, verifyPassword } from "@/lib/auth";
import { checkJobBudget, projectFor, runTick } from "@/lib/tick";
import {
  EntryEditError,
  approvePeriod,
  editEntry,
  entrySeconds,
  flagStaleOpenEntries,
  openEntryFor,
} from "@/lib/time-entries";
import { ExportBlocked, generateExport } from "@/lib/payroll-export";
import { jobCost } from "@/lib/jobs";
import { addDaysToDateKey, fromZonedWallTime, localDateKey, weekStartKey } from "@/lib/time";

const BASE = "http://localhost:3033";
const TZ = "America/Chicago";
const SITE = { lat: 30.29471, lng: -97.74052 };

function ok(msg: string) {
  console.log(`  ok  ${msg}`);
}

async function session(userId: string, organizationId: string, role: string) {
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const token = await new SignJWT({ userId, organizationId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
  return `crewclock_session=${token}`;
}

function north(m: number) {
  return { lat: SITE.lat + m / ((Math.PI * 6371008.8) / 180), lng: SITE.lng };
}

async function main() {
  const db = getDb();
  await db.delete(organizations).where(eq(organizations.name, "Hendricks Concrete"));

  /* ------------------------------------------------------------- 1. setup */
  const [org] = await db
    .insert(organizations)
    .values({
      name: "Hendricks Concrete",
      plan: "company",
      timezone: TZ,
      weekStartsOn: 0,
      payPeriod: "weekly",
      alertEmail: "dale@hendricksconcrete.test",
      autoBreakMinutes: 30,
      autoBreakAfterHours: 6,
      trialEndsAt: new Date(Date.now() + 30 * 86400000),
    })
    .returning();

  const [owner] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      name: "Dale Hendricks",
      email: `dale-${Date.now()}@hendricksconcrete.test`,
      role: "owner",
      hourlyCostCents: 4500,
      passwordHash: await hashPassword("concrete-forever"),
      crewCode: generateCrewCode(),
      payrollFileNumber: "1001",
    })
    .returning();

  assert.equal(await verifyPassword("concrete-forever", owner.passwordHash!), true);
  assert.equal(await verifyPassword("wrong-password", owner.passwordHash!), false);
  ok("owner password hashing verifies, and rejects a wrong password");

  const [miguel] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      name: "Miguel Ángel Ríos Vega",
      role: "crew",
      locale: "es",
      hourlyCostCents: 2800,
      overtimeRule: "weekly_40",
      crewCode: generateCrewCode(),
      pinHash: await hashPin("4417"),
      claimedAt: new Date(),
      payrollFileNumber: "1042",
      email: "miguel@hendricksconcrete.test",
    })
    .returning();

  const [tasha] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      name: "Tasha Boone",
      role: "crew",
      hourlyCostCents: 3200,
      overtimeRule: "daily_8_weekly_40",
      crewCode: generateCrewCode(),
      pinHash: await hashPin("9082"),
      claimedAt: new Date(),
      email: "tasha@hendricksconcrete.test",
    })
    .returning();

  const [site] = await db
    .insert(jobSites)
    .values({
      organizationId: org.id,
      label: "Hendricks Patio",
      address: "1104 Cedar Ln, Austin TX",
      lat: SITE.lat,
      lng: SITE.lng,
      radiusM: 150,
    })
    .returning();

  const [job] = await db
    .insert(jobs)
    .values({
      organizationId: org.id,
      jobSiteId: site.id,
      name: "Hendricks Patio",
      clientName: "Dale & Marta Hendricks",
      bidLaborMinutes: 120 * 60,
      bidLaborCostCents: 1_120_000,
      status: "active",
      startedAt: new Date(),
    })
    .returning();

  const [smallJob] = await db
    .insert(jobs)
    .values({
      organizationId: org.id,
      jobSiteId: site.id,
      name: "Oakmont Fence Line",
      clientName: "Oakmont HOA",
      bidLaborMinutes: 10 * 60,
      bidLaborCostCents: 30_000,
      status: "active",
      startedAt: new Date(),
    })
    .returning();

  for (const u of [miguel, tasha]) {
    for (const j of [job, smallJob]) {
      await db.insert(crewAssignments).values({ jobId: j.id, userId: u.id });
    }
  }
  ok("org, owner, two crew, a fenced site and two bid jobs created");

  const miguelCookie = await session(miguel.id, org.id, "crew");
  const tashaCookie = await session(tasha.id, org.id, "crew");
  const ownerCookie = await session(owner.id, org.id, "owner");

  /* ------------------------------------------------- 2. geofenced punches */
  async function punch(cookie: string, body: unknown) {
    const res = await fetch(`${BASE}/api/punches/sync`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, never[]> as never };
  }

  const inId = `ev-in-${Date.now()}`;
  let r = await punch(miguelCookie, {
    punches: [
      {
        clientEventId: inId,
        jobId: job.id,
        kind: "in",
        occurredAt: new Date().toISOString(),
        lat: SITE.lat,
        lng: SITE.lng,
        accuracyM: 8,
        deviceFingerprint: "device-miguel",
      },
    ],
  });
  let res0 = (r.body as { results: Record<string, unknown>[] }).results[0];
  assert.equal(r.status, 200);
  assert.equal(res0.status, "opened");
  assert.equal(res0.fenceStatus, "inside");
  ok("clock-in at the site is recorded and verified inside the fence");

  r = await punch(miguelCookie, {
    punches: [
      {
        clientEventId: inId,
        jobId: job.id,
        kind: "in",
        occurredAt: new Date().toISOString(),
        lat: SITE.lat,
        lng: SITE.lng,
        accuracyM: 8,
      },
    ],
  });
  res0 = (r.body as { results: Record<string, unknown>[] }).results[0];
  assert.equal(res0.status, "duplicate");
  const openRows = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, miguel.id), isNull(timeEntries.clockOutAt)));
  assert.equal(openRows.length, 1);
  ok("the same punch synced twice produces exactly one open entry");

  r = await punch(miguelCookie, {
    punches: [
      {
        clientEventId: `ev-out-${Date.now()}`,
        jobId: job.id,
        kind: "out",
        occurredAt: new Date().toISOString(),
        ...north(260),
        accuracyM: 40,
        deviceFingerprint: "device-miguel",
      },
    ],
  });
  res0 = (r.body as { results: Record<string, unknown>[] }).results[0];
  assert.equal(res0.status, "closed");
  assert.equal(res0.fenceStatus, "outside");
  assert.ok((res0.flags as string[]).includes("outside_fence"));
  ok("an out-of-fence clock-out is recorded, never rejected, and flagged");

  r = await punch(miguelCookie, {
    punches: [
      {
        clientEventId: `ev-nogps-${Date.now()}`,
        jobId: job.id,
        kind: "in",
        occurredAt: new Date().toISOString(),
        lat: null,
        lng: null,
        accuracyM: null,
      },
    ],
  });
  res0 = (r.body as { results: Record<string, unknown>[] }).results[0];
  assert.equal(res0.fenceStatus, "unavailable");
  assert.ok((res0.flags as string[]).includes("no_gps"));
  ok("a punch with no GPS fix is recorded and flagged no_gps, not blocked");

  await punch(miguelCookie, {
    punches: [
      {
        clientEventId: `ev-nogps-out-${Date.now()}`,
        jobId: job.id,
        kind: "out",
        occurredAt: new Date().toISOString(),
        lat: SITE.lat,
        lng: SITE.lng,
        accuracyM: 12,
      },
    ],
  });

  /* ------------------------------------- 3. the offline batch, out before in */
  // A full 9-hour day, punched offline, so the org's unpaid-meal rule applies.
  const base = Date.now() - 12 * 3600_000;
  const batchIn = `ev-batch-in-${Date.now()}`;
  const batchOut = `ev-batch-out-${Date.now()}`;
  const batchBody = {
    punches: [
      {
        clientEventId: batchOut,
        jobId: smallJob.id,
        kind: "out",
        occurredAt: new Date(base + 9 * 3600_000).toISOString(),
        lat: SITE.lat,
        lng: SITE.lng,
        accuracyM: 15,
      },
      {
        clientEventId: batchIn,
        jobId: smallJob.id,
        kind: "in",
        occurredAt: new Date(base).toISOString(),
        lat: SITE.lat,
        lng: SITE.lng,
        accuracyM: 15,
      },
    ],
  };
  r = await punch(miguelCookie, batchBody);
  const batchStatuses = (r.body as { results: { status: string }[] }).results
    .map((x) => x.status)
    .sort();
  assert.deepEqual(batchStatuses, ["closed", "opened"]);
  const batchEntry = (
    await db.select().from(timeEntries).where(eq(timeEntries.clientEventId, batchIn))
  )[0];
  assert.ok(batchEntry.clockOutAt, "the out paired with the in");
  assert.equal(entrySeconds(batchEntry), 9 * 3600 - 1800, "auto-break deducted 30 min");
  ok("an offline batch arriving out-before-in pairs correctly, with the meal deducted");

  r = await punch(miguelCookie, batchBody);
  const resendStatuses = (r.body as { results: { status: string }[] }).results.map((x) => x.status);
  console.log(`      resend statuses: ${JSON.stringify(resendStatuses)}`);
  assert.ok(resendStatuses.every((s) => s === "duplicate"), JSON.stringify(resendStatuses));
  assert.equal(
    (await db.select().from(timeEntries).where(eq(timeEntries.jobId, smallJob.id))).length,
    1,
  );
  ok("re-syncing the whole batch inserts nothing new");

  /* --------------------------------------------- 4. spoof + shared device */
  r = await punch(miguelCookie, {
    punches: [
      {
        clientEventId: `ev-spoof-${Date.now()}`,
        jobId: job.id,
        kind: "in",
        occurredAt: new Date().toISOString(),
        ...north(80_000),
        accuracyM: 10,
        deviceFingerprint: "device-miguel",
      },
    ],
  });
  res0 = (r.body as { results: Record<string, unknown>[] }).results[0];
  assert.ok((res0.flags as string[]).includes("implausible_speed"));
  ok("a punch 80 km from the previous one minutes later is flagged implausible_speed");

  r = await punch(tashaCookie, {
    punches: [
      {
        clientEventId: `ev-shared-${Date.now()}`,
        jobId: job.id,
        kind: "in",
        occurredAt: new Date().toISOString(),
        lat: SITE.lat,
        lng: SITE.lng,
        accuracyM: 10,
        deviceFingerprint: "device-miguel",
      },
    ],
  });
  res0 = (r.body as { results: Record<string, unknown>[] }).results[0];
  assert.ok((res0.flags as string[]).includes("shared_device"));
  ok("a second worker punching from the same phone is flagged shared_device");

  /* ----------------------------------------------- 5. forgotten clock-out */
  const staleOpen = await openEntryFor(miguel.id);
  assert.ok(staleOpen);
  await db
    .update(timeEntries)
    .set({ clockInAt: new Date(Date.now() - 20 * 3600_000) })
    .where(eq(timeEntries.id, staleOpen!.id));
  assert.ok((await flagStaleOpenEntries(org, new Date())) >= 1);
  const staleAfter = (
    await db.select().from(timeEntries).where(eq(timeEntries.id, staleOpen!.id))
  )[0];
  assert.ok(staleAfter.flags.includes("stale_open"));
  assert.equal(staleAfter.clockOutAt, null);
  ok("a shift open past the org max is flagged for review and left open, never truncated");
  assert.equal(await flagStaleOpenEntries(org, new Date()), 0);
  ok("re-running the stale sweep flags nothing twice");

  for (const u of [miguel, tasha]) {
    const open = await openEntryFor(u.id);
    if (open) {
      await db
        .update(timeEntries)
        .set({ clockOutAt: new Date(open.clockInAt.getTime() + 3600_000) })
        .where(eq(timeEntries.id, open.id));
    }
  }

  /* -------------------------------------------- 6. a real payroll week */
  const todayKey = localDateKey(new Date(), TZ);
  const thisWeek = weekStartKey(new Date(), TZ, 0);
  const lastWeek = addDaysToDateKey(thisWeek, -7);
  await db.delete(timeEntries).where(eq(timeEntries.userId, tasha.id));

  for (let d = 1; d <= 5; d++) {
    const dayKey = addDaysToDateKey(lastWeek, d);
    const [y, m, dd] = dayKey.split("-").map(Number);
    const start = fromZonedWallTime({ year: y, month: m, day: dd, hour: 7 }, TZ);
    await db.insert(timeEntries).values({
      organizationId: org.id,
      userId: miguel.id,
      jobId: job.id,
      clockInAt: start,
      clockOutAt: new Date(start.getTime() + 9 * 3600_000),
      breakSeconds: 0,
      inLat: SITE.lat,
      inLng: SITE.lng,
      inAccuracyM: 9,
      inDistanceM: 0,
      geofenceStatusIn: "inside",
      geofenceStatusOut: "inside",
      source: "live",
      clientEventId: `seed-m-${dayKey}`,
      rateCentsPerHour: 2800,
      flags: [],
    });
    if (d <= 4) {
      const tStart = fromZonedWallTime({ year: y, month: m, day: dd, hour: 6 }, TZ);
      await db.insert(timeEntries).values({
        organizationId: org.id,
        userId: tasha.id,
        jobId: job.id,
        clockInAt: tStart,
        clockOutAt: new Date(tStart.getTime() + 10 * 3600_000),
        breakSeconds: 0,
        inLat: SITE.lat,
        inLng: SITE.lng,
        inAccuracyM: 9,
        inDistanceM: 0,
        geofenceStatusIn: "inside",
        geofenceStatusOut: "inside",
        source: "live",
        clientEventId: `seed-t-${dayKey}`,
        rateCentsPerHour: 3200,
        flags: [],
      });
    }
  }
  ok("seeded a full previous payroll week (Miguel 5x9h, Tasha 4x10h)");

  /* ------------------------------------------------- 7. mid-week OT alert */
  // A deterministic Wednesday: clear this week and seed Sun/Mon/Tue at 10.5h
  // (31.5h to date), then run the sweep as if it were Wednesday evening.
  const weekStartUtc = fromZonedWallTime(
    {
      year: Number(thisWeek.slice(0, 4)),
      month: Number(thisWeek.slice(5, 7)),
      day: Number(thisWeek.slice(8, 10)),
      hour: 0,
    },
    TZ,
  );
  await db
    .delete(timeEntries)
    .where(and(eq(timeEntries.userId, miguel.id), gte(timeEntries.clockInAt, weekStartUtc)));

  for (let d = 0; d <= 2; d++) {
    const dayKey = addDaysToDateKey(thisWeek, d);
    const [y, m, dd] = dayKey.split("-").map(Number);
    const start = fromZonedWallTime({ year: y, month: m, day: dd, hour: 7 }, TZ);
    await db.insert(timeEntries).values({
      organizationId: org.id,
      userId: miguel.id,
      jobId: job.id,
      clockInAt: start,
      clockOutAt: new Date(start.getTime() + 10.5 * 3600_000),
      breakSeconds: 0,
      inLat: SITE.lat,
      inLng: SITE.lng,
      inAccuracyM: 9,
      inDistanceM: 0,
      geofenceStatusIn: "inside",
      geofenceStatusOut: "inside",
      source: "live",
      clientEventId: `cur-m-${dayKey}`,
      rateCentsPerHour: 2800,
      flags: [],
    });
  }

  const wednesdayKey = addDaysToDateKey(thisWeek, 3);
  const wednesdayEvening = fromZonedWallTime(
    {
      year: Number(wednesdayKey.slice(0, 4)),
      month: Number(wednesdayKey.slice(5, 7)),
      day: Number(wednesdayKey.slice(8, 10)),
      hour: 18,
    },
    TZ,
  );

  const projection = await projectFor(
    org,
    miguel,
    thisWeek,
    addDaysToDateKey(thisWeek, 6),
    wednesdayKey,
    wednesdayEvening,
  );
  console.log(
    `      Wednesday projection: ${projection.hoursToDate}h to date → ${projection.projectedHours}h projected, threshold ${projection.thresholdHours} (${projection.reason})`,
  );
  assert.equal(projection.hoursToDate, 31.5);
  assert.ok(projection.projectedHours > 40, "projects past the threshold");
  assert.equal(projection.shouldAlert, true);

  const tick1 = await runTick(wednesdayEvening);
  const alerts1 = await db
    .select()
    .from(overtimeAlerts)
    .where(eq(overtimeAlerts.organizationId, org.id));
  const tick2 = await runTick(wednesdayEvening);
  const alerts2 = await db
    .select()
    .from(overtimeAlerts)
    .where(eq(overtimeAlerts.organizationId, org.id));
  console.log(`      tick1 ${JSON.stringify(tick1)}`);
  console.log(`      tick2 ${JSON.stringify(tick2)}`);
  assert.equal(alerts1.length, 1, "exactly one alert for the worker/week");
  assert.equal(alerts2.length, 1, "a second sweep sends no second alert");
  assert.ok(alerts1[0].sentAt, "the alert was dispatched and stamped");
  assert.equal(alerts1[0].userId, miguel.id);
  assert.equal(alerts1[0].weekStart, thisWeek);
  ok(
    `31.5h by Wednesday projected ${alerts1[0].projectedHours}h and produced exactly one owner alert, before the line was crossed`,
  );

  /* -------------------------------------------- 8. budget thresholds */
  const cost = await jobCost(job, org, new Date());
  console.log(
    `      Hendricks Patio: ${cost.rollup.actualHours.toFixed(1)}h · $${(cost.rollup.actualCostCents / 100).toFixed(0)} of $11,200 = ${cost.rollup.percentOfBid?.toFixed(0)}% · projected $${((cost.projection.projectedCostCents ?? 0) / 100).toFixed(0)}`,
  );

  // A job with no hours on it yet, so the two thresholds are crossed in order.
  const [budgetJob] = await db
    .insert(jobs)
    .values({
      organizationId: org.id,
      jobSiteId: site.id,
      name: "Ridgeview Driveway",
      clientName: "Ridgeview Property Co",
      bidLaborMinutes: 10 * 60,
      bidLaborCostCents: 30_000,
      status: "active",
      startedAt: new Date(),
    })
    .returning();

  const [y2, m2, d2] = addDaysToDateKey(thisWeek, 1).split("-").map(Number);
  const s1 = fromZonedWallTime({ year: y2, month: m2, day: d2, hour: 7 }, TZ);
  await db.insert(timeEntries).values({
    organizationId: org.id,
    userId: tasha.id,
    jobId: budgetJob.id,
    clockInAt: s1,
    clockOutAt: new Date(s1.getTime() + 8 * 3600_000),
    breakSeconds: 0,
    geofenceStatusIn: "inside",
    source: "manual",
    clientEventId: `budget-1-${Date.now()}`,
    rateCentsPerHour: 3200,
    flags: [],
  });
  const reload = async () => (await db.select().from(jobs).where(eq(jobs.id, budgetJob.id)))[0];
  assert.equal(await checkJobBudget(org, await reload()), true);
  assert.equal(await checkJobBudget(org, await reload()), false);
  ok("crossing 80% of the labor bid fires one alert, and only one");

  await db.insert(timeEntries).values({
    organizationId: org.id,
    userId: tasha.id,
    jobId: budgetJob.id,
    clockInAt: new Date(s1.getTime() + 9 * 3600_000),
    clockOutAt: new Date(s1.getTime() + 12 * 3600_000),
    breakSeconds: 0,
    geofenceStatusIn: "inside",
    source: "manual",
    clientEventId: `budget-2-${Date.now()}`,
    rateCentsPerHour: 3200,
    flags: [],
  });
  assert.equal(await checkJobBudget(org, await reload()), true);
  assert.equal(await checkJobBudget(org, await reload()), false);
  const jobAfter = await reload();
  assert.ok(jobAfter.budgetAlert80SentAt && jobAfter.budgetAlert100SentAt);
  ok("crossing 100% fires one more; re-running rollups fires neither again");

  /* --------------------------------------------------- 9. edits + audit */
  const target = (
    await db
      .select()
      .from(timeEntries)
      .where(eq(timeEntries.clientEventId, `seed-m-${addDaysToDateKey(lastWeek, 1)}`))
  )[0];

  await assert.rejects(
    () => editEntry(target.id, { breakSeconds: 1800 }, owner, "   "),
    (err: unknown) => err instanceof EntryEditError && err.message === "REASON_REQUIRED",
  );
  ok("an edit with no reason is refused");

  await assert.rejects(
    () =>
      editEntry(
        target.id,
        { clockOutAt: new Date(target.clockInAt.getTime() - 3600_000) },
        owner,
        "typo",
      ),
    (err: unknown) => err instanceof EntryEditError && err.message === "OUT_BEFORE_IN",
  );
  ok("an edit that would put clock-out before clock-in is refused");

  const edited = await editEntry(
    target.id,
    { breakSeconds: 1800, clockOutAt: new Date(target.clockInAt.getTime() + 8 * 3600_000) },
    owner,
    "Miguel took lunch and forgot to punch back in; foreman confirmed 8h.",
  );
  assert.equal(edited.breakSeconds, 1800);
  assert.equal(edited.edited, true);
  assert.ok(edited.flags.includes("edited"));
  const audit = await db
    .select()
    .from(timeEntryEdits)
    .where(eq(timeEntryEdits.timeEntryId, target.id));
  assert.equal(audit.length, 2);
  assert.ok(
    audit.some((a) => a.field === "break_seconds" && a.oldValue === "0" && a.newValue === "1800"),
  );
  assert.ok(audit.every((a) => a.reason.startsWith("Miguel took lunch")));
  ok("an accepted edit writes one immutable audit row per field, with old and new values");

  /* ----------------------------------------------- 10. approve and lock */
  const lastWeekEnd = addDaysToDateKey(lastWeek, 6);
  const approvedCount = await approvePeriod(org, lastWeek, lastWeekEnd, owner);
  await assert.rejects(
    () => editEntry(target.id, { breakSeconds: 3600 }, owner, "second thoughts"),
    (err: unknown) => err instanceof EntryEditError && err.message === "PERIOD_LOCKED",
  );
  ok(`approving stamped ${approvedCount} entries and locked the period against edits`);

  /* ------------------------------------------------------ 11. the exports */
  let blocked: unknown = null;
  try {
    await generateExport(org, "adp", lastWeek, lastWeekEnd, owner);
  } catch (err) {
    blocked = err;
  }
  assert.ok(blocked instanceof ExportBlocked);
  const codes = [...new Set((blocked as ExportBlocked).issues.map((i) => i.code))];
  assert.ok(codes.includes("missing_company_code"));
  assert.ok(codes.includes("missing_file_number"));
  ok(`the ADP export is blocked before a file is written: ${codes.join(", ")}`);

  await db.update(organizations).set({ adpCompanyCode: "H4K" }).where(eq(organizations.id, org.id));
  await db.update(users).set({ payrollFileNumber: "1078" }).where(eq(users.id, tasha.id));
  const [freshOrg] = await db.select().from(organizations).where(eq(organizations.id, org.id));

  const adp = await generateExport(freshOrg, "adp", lastWeek, lastWeekEnd, owner);
  console.log(
    "      ADP:\n" +
      adp.csv
        .split("\r\n")
        .filter(Boolean)
        .map((l) => `        ${l}`)
        .join("\n"),
  );
  assert.ok(adp.csv.startsWith("Co Code,Batch ID,File #,Reg Hours,O/T Hours,Pay Date\r\n"));
  assert.equal(adp.rowCount, 2);
  ok(`ADP CSV generated: ${adp.rowCount} workers, checksum ${adp.checksum}`);

  const gusto = await generateExport(freshOrg, "gusto", lastWeek, lastWeekEnd, owner);
  console.log(
    "      Gusto:\n" +
      gusto.csv
        .split("\r\n")
        .filter(Boolean)
        .map((l) => `        ${l}`)
        .join("\n"),
  );
  assert.ok(
    gusto.csv.startsWith("last_name,first_name,employee_email,regular_hours,overtime_hours\r\n"),
  );
  assert.ok(gusto.csv.includes("Vega,Miguel Ángel Ríos,miguel@hendricksconcrete.test"));
  ok("Gusto CSV splits a four-part Spanish name into first and last correctly");

  const adpAgain = await generateExport(freshOrg, "adp", lastWeek, lastWeekEnd, owner);
  assert.equal(adpAgain.checksum, adp.checksum);
  assert.equal(adpAgain.csv, adp.csv);
  ok("re-exporting the same period reproduces the identical file and checksum");

  const miguelRow = adp.rows.find((row) => row.userId === miguel.id)!;
  const tashaRow = adp.rows.find((row) => row.userId === tasha.id)!;
  assert.equal(miguelRow.regularCentihours, 4000);
  // 4 x 9h + one day edited to 8h with a 30-minute unpaid lunch = 43.5h.
  assert.equal(miguelRow.overtimeCentihours, 350);
  ok("Miguel's 43.5h week (after the edit) splits 40.00 regular + 3.50 OT on the weekly-40 rule");
  assert.equal(tashaRow.regularCentihours, 3200);
  assert.equal(tashaRow.overtimeCentihours, 800);
  ok("Tasha's 4x10h week splits 32.00 + 8.00 on the daily-8 rule, at exactly 40 hours");

  const dl = await fetch(`${BASE}/api/exports/${adp.id}`, { headers: { cookie: ownerCookie } });
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(await dl.text(), adp.csv);
  ok("the office downloads the exact bytes over HTTP");

  const dlAsCrew = await fetch(`${BASE}/api/exports/${adp.id}`, {
    headers: { cookie: miguelCookie },
  });
  assert.equal(dlAsCrew.status, 403);
  ok("a crew session cannot download payroll files");

  /* ---------------------------------------------------- 12. cron auth */
  assert.equal((await fetch(`${BASE}/api/cron/tick`)).status, 401);
  assert.equal(
    (
      await fetch(`${BASE}/api/cron/tick`, {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
    ).status,
    200,
  );
  ok("the cron route refuses an unauthenticated call and accepts the secret");

  /* --------------------------------------------------- 13. every screen */
  const pages: [string, string][] = [
    ["/", ""],
    ["/login", ""],
    ["/signup", ""],
    ["/join", ""],
    ["/manifest.webmanifest", ""],
    ["/clock", miguelCookie],
    ["/hours", miguelCookie],
    ["/profile", miguelCookie],
    ["/jobs", ownerCookie],
    [`/jobs/${job.id}`, ownerCookie],
    ["/jobs/new", ownerCookie],
    ["/sites", ownerCookie],
    ["/crew", ownerCookie],
    ["/review", ownerCookie],
    [`/review?period=${lastWeek}`, ownerCookie],
    ["/export", ownerCookie],
    ["/export?format=adp", ownerCookie],
    ["/settings", ownerCookie],
    ["/settings/billing", ownerCookie],
  ];
  for (const [path, cookie] of pages) {
    const res = await fetch(`${BASE}${path}`, {
      headers: cookie ? { cookie } : {},
      redirect: "manual",
    });
    assert.equal(res.status, 200, `${path} returned ${res.status}`);
  }
  ok(`all ${pages.length} routes render 200 with real data`);

  const forbidden = await fetch(`${BASE}/export`, {
    headers: { cookie: miguelCookie },
    redirect: "manual",
  });
  assert.equal(new URL(forbidden.headers.get("location")!, BASE).pathname, "/clock");
  ok("a crew session is redirected away from the office screens");

  const anon = await fetch(`${BASE}/clock`, { redirect: "manual" });
  assert.equal(new URL(anon.headers.get("location")!, BASE).pathname, "/join");
  ok("an anonymous visit to /clock goes to the crew door, not the email login");

  /* ------------------------------------------------------ 14. bilingual */
  const es = await (await fetch(`${BASE}/clock`, { headers: { cookie: miguelCookie } })).text();
  assert.ok(es.includes("MARCAR ENTRADA") || es.includes("MARCAR SALIDA"));
  assert.ok(es.includes("Jornada") || es.includes("Hoy"));
  assert.ok(!es.includes("CLOCK IN"));
  ok("Miguel's clock screen renders entirely in Spanish");

  const enHours = await (await fetch(`${BASE}/hours`, { headers: { cookie: tashaCookie } })).text();
  assert.ok(enHours.includes("Week total"));
  const esHours = await (
    await fetch(`${BASE}/hours`, { headers: { cookie: miguelCookie } })
  ).text();
  assert.ok(esHours.includes("Total de la semana"));
  assert.ok(esHours.includes("Solo lectura"));
  ok("a mixed-language crew each sees their own language on the same screen");

  console.log("\n--- all checks passed ---");
  await closeDb();
}

main().catch(async (err) => {
  console.error("\nFAILED:", err);
  await closeDb();
  process.exit(1);
});
