/**
 * The invariants that only a real database can prove.
 *
 * BUILD.md names three that must fail loudly if violated:
 *   1. promotions are append-only — a correction appends, never edits;
 *   2. attendance is never blocked by billing state;
 *   3. kiosk sync is idempotent — a replayed offline queue inserts once.
 *
 * Each of those is a guarantee about *the database*: a unique index, a
 * transaction, an absence of an UPDATE. An in-memory fake would prove nothing, so
 * these run against Postgres and skip — rather than passing vacuously — when no
 * DATABASE_URL is set:
 *
 *   node --env-file=.env.local node_modules/.bin/tsx --test src/lib/db.test.ts
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { and, asc, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  checkins,
  classSchedule,
  enrollments,
  families,
  gradingCandidates,
  gradingEvents,
  membershipPlans,
  programs,
  promotions,
  ranks,
  retentionFlags,
  schools,
  students,
  subscriptions,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { applyStripeEvent, DUNNING_DAYS, dunning, persistWebhookEvent } from "@/lib/billing";
import { clearRecordedEmails, recordedEmails } from "@/lib/email";
import {
  assembleCandidates,
  completeEvent,
  listCandidates,
  matPromotion,
  promotionTimeline,
  reversePromotion,
} from "@/lib/gradings";
import { mintDeviceToken, recordCheckin, revokeDevice, searchStudents, verifyDeviceToken } from "@/lib/kiosk";
import { progressFor } from "@/lib/progression";
import { scanSchool } from "@/lib/retention";
import { createFamily, createStudent, enrollStudent, importStudents, loadRoster } from "@/lib/roster";

const hasDb = Boolean(process.env.DATABASE_URL);
const skip = hasDb ? false : "set DATABASE_URL to run";

/** A whole school, built from scratch, torn down afterwards. */
interface Fixture {
  schoolId: string;
  ownerId: string;
  programId: string;
  whiteId: string;
  blueId: string;
  purpleId: string;
  familyId: string;
  studentId: string;
  enrollmentId: string;
  classId: string;
}

const created: Fixture[] = [];
/** Unique per run, so a second run cannot collide with the first's rows. */
const RUN = Math.random().toString(36).slice(2, 10);
const webhookIds: string[] = [];
function evtId(name: string): string {
  const id = `evt_test_${RUN}_${name}`;
  webhookIds.push(id);
  return id;
}

async function buildSchool(name: string): Promise<Fixture> {
  const db = getDb();
  const [school] = await db
    .insert(schools)
    .values({ name, timezone: "America/Chicago", plan: "dojo", settings: {} })
    .returning();
  const [owner] = await db
    .insert(users)
    .values({
      schoolId: school.id,
      email: `owner-${school.id}@example.test`,
      name: "Prof. Reyes",
      passwordHash: await hashPassword("correct horse battery"),
      role: "owner",
    })
    .returning();
  const [program] = await db
    .insert(programs)
    .values({ schoolId: school.id, name: "BJJ Adults", status: "active" })
    .returning();
  const ladder = await db
    .insert(ranks)
    .values([
      {
        programId: program.id,
        name: "White belt",
        displayOrder: 0,
        beltColorHex: "#F2EFE6",
        stripes: 4,
        minClasses: 60,
        minDaysInRank: 180,
        requiresSignoff: false,
      },
      {
        programId: program.id,
        name: "Blue belt",
        displayOrder: 1,
        beltColorHex: "#2B4C7E",
        stripes: 4,
        minClasses: 100,
        minDaysInRank: 730,
        requiresSignoff: false,
      },
      {
        programId: program.id,
        name: "Purple belt",
        displayOrder: 2,
        beltColorHex: "#4B2E5A",
        stripes: 4,
        minClasses: 120,
        minDaysInRank: 540,
        requiresSignoff: true,
      },
    ])
    .returning();
  const [slot] = await db
    .insert(classSchedule)
    .values({
      programId: program.id,
      name: "Adults Gi 6pm",
      weekday: 2,
      startsAtMinutes: 18 * 60,
      durationMinutes: 60,
      status: "active",
    })
    .returning();

  const family = await createFamily({
    schoolId: school.id,
    name: "Okafor family",
    email: `okafor-${school.id}@example.test`,
    phone: "(512) 555-0148",
  });
  const student = await createStudent({
    schoolId: school.id,
    familyId: family.id,
    firstName: "Marcus",
    lastName: "Okafor",
    joinedOn: new Date("2024-02-14T12:00:00Z"),
  });
  const enrollment = await enrollStudent({
    studentId: student.id,
    programId: program.id,
    rankId: ladder[0].id,
    currentStripes: 3,
    promotedAt: new Date("2025-06-01T12:00:00Z"),
  });

  const fixture: Fixture = {
    schoolId: school.id,
    ownerId: owner.id,
    programId: program.id,
    whiteId: ladder[0].id,
    blueId: ladder[1].id,
    purpleId: ladder[2].id,
    familyId: family.id,
    studentId: student.id,
    enrollmentId: enrollment.id,
    classId: slot.id,
  };
  created.push(fixture);
  return fixture;
}

async function teardown(): Promise<void> {
  const db = getDb();
  for (const fixture of created) {
    const studentIds = (
      await db.select({ id: students.id }).from(students).where(eq(students.schoolId, fixture.schoolId))
    ).map((s) => s.id);
    const enrollmentIds =
      studentIds.length > 0
        ? (
            await db
              .select({ id: enrollments.id })
              .from(enrollments)
              .where(inArray(enrollments.studentId, studentIds))
          ).map((e) => e.id)
        : [];
    const eventIds = (
      await db
        .select({ id: gradingEvents.id })
        .from(gradingEvents)
        .where(eq(gradingEvents.schoolId, fixture.schoolId))
    ).map((e) => e.id);

    if (enrollmentIds.length > 0) {
      await db.delete(promotions).where(inArray(promotions.enrollmentId, enrollmentIds));
      await db.delete(gradingCandidates).where(inArray(gradingCandidates.enrollmentId, enrollmentIds));
      await db.delete(checkins).where(inArray(checkins.enrollmentId, enrollmentIds));
    }
    if (eventIds.length > 0) {
      await db.delete(gradingCandidates).where(inArray(gradingCandidates.gradingEventId, eventIds));
      await db.delete(gradingEvents).where(inArray(gradingEvents.id, eventIds));
    }
    if (studentIds.length > 0) {
      await db.delete(retentionFlags).where(inArray(retentionFlags.studentId, studentIds));
      await db.delete(enrollments).where(inArray(enrollments.studentId, studentIds));
    }
    await db.delete(subscriptions).where(
      inArray(
        subscriptions.familyId,
        (
          await db.select({ id: families.id }).from(families).where(eq(families.schoolId, fixture.schoolId))
        ).map((f) => f.id),
      ),
    );
    await db.delete(students).where(eq(students.schoolId, fixture.schoolId));
    await db.delete(families).where(eq(families.schoolId, fixture.schoolId));
    await db.delete(membershipPlans).where(eq(membershipPlans.schoolId, fixture.schoolId));
    await db.delete(classSchedule).where(eq(classSchedule.programId, fixture.programId));
    await db.delete(ranks).where(eq(ranks.programId, fixture.programId));
    await db.delete(programs).where(eq(programs.schoolId, fixture.schoolId));
    const { kioskDevices, auditLog, locations } = await import("@/db/schema");
    await db.delete(kioskDevices).where(eq(kioskDevices.schoolId, fixture.schoolId));
    await db.delete(auditLog).where(eq(auditLog.schoolId, fixture.schoolId));
    await db.delete(locations).where(eq(locations.schoolId, fixture.schoolId));
    await db.delete(users).where(eq(users.schoolId, fixture.schoolId));
    await db.delete(schools).where(eq(schools.id, fixture.schoolId));
  }
  created.length = 0;
  if (webhookIds.length > 0) {
    const { webhookEvents } = await import("@/db/schema");
    await db.delete(webhookEvents).where(inArray(webhookEvents.externalId, webhookIds));
    webhookIds.length = 0;
  }
}

// ------------------------------------------------------------------------ 1

describe("promotions are append-only", { skip }, () => {
  let fx: Fixture;
  before(async () => {
    fx = await buildSchool("Append-Only Academy");
  });
  after(teardown);

  it("no code path in the promotion module updates or deletes the table", () => {
    // The strongest available guard against the invariant rotting: the source
    // itself. A future edit that reaches for `update(promotions)` fails here
    // before it can reach a review.
    const source = readFileSync(path.join(process.cwd(), "src/lib/gradings.ts"), "utf8");
    assert.equal(/\.update\(\s*promotions\s*\)/.test(source), false, "found update(promotions)");
    assert.equal(/\.delete\(\s*promotions\s*\)/.test(source), false, "found delete(promotions)");
    // And nowhere else in the app either — except the test teardown above.
    for (const file of ["src/lib/roster.ts", "src/lib/kiosk.ts", "src/lib/billing.ts"]) {
      const other = readFileSync(path.join(process.cwd(), file), "utf8");
      assert.equal(/\.update\(\s*promotions\s*\)/.test(other), false, `${file} updates promotions`);
      assert.equal(/\.delete\(\s*promotions\s*\)/.test(other), false, `${file} deletes promotions`);
    }
  });

  it("a mat promotion appends a row and moves the enrollment's clock", async () => {
    const db = getDb();
    const before = await db
      .select()
      .from(promotions)
      .where(eq(promotions.enrollmentId, fx.enrollmentId));
    assert.equal(before.length, 0);

    const result = await matPromotion({
      enrollmentId: fx.enrollmentId,
      schoolId: fx.schoolId,
      gradedBy: fx.ownerId,
      note: "Earned in Thursday's sparring round",
      promotedOn: new Date("2026-01-10T12:00:00Z"),
    });
    assert.equal(result.step, "stripe");
    assert.equal(result.toStripes, 4);

    const after = await db.select().from(promotions).where(eq(promotions.enrollmentId, fx.enrollmentId));
    assert.equal(after.length, 1);
    assert.equal(after[0].fromStripes, 3);
    assert.equal(after[0].toStripes, 4);
    assert.equal(after[0].gradedBy, fx.ownerId);

    const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.id, fx.enrollmentId));
    assert.equal(enrollment.currentStripes, 4);
    assert.equal(enrollment.promotedAt.toISOString(), "2026-01-10T12:00:00.000Z");
  });

  it("a correction APPENDS a reversal — the original row is untouched", async () => {
    const db = getDb();
    const [original] = await db
      .select()
      .from(promotions)
      .where(eq(promotions.enrollmentId, fx.enrollmentId));
    const snapshot = { ...original };

    await reversePromotion({
      promotionId: original.id,
      schoolId: fx.schoolId,
      actorId: fx.ownerId,
      reason: "wrong student — Marcus O., not Marcus A.",
    });

    const rows = await db
      .select()
      .from(promotions)
      .where(eq(promotions.enrollmentId, fx.enrollmentId))
      .orderBy(asc(promotions.createdAt));
    assert.equal(rows.length, 2, "a reversal must add a row, not change one");

    // Byte-for-byte identical: this is the invariant.
    const stillThere = rows.find((r) => r.id === snapshot.id);
    assert.ok(stillThere, "the original promotion vanished");
    assert.deepEqual(
      {
        fromRankId: stillThere.fromRankId,
        fromStripes: stillThere.fromStripes,
        toRankId: stillThere.toRankId,
        toStripes: stillThere.toStripes,
        promotedOn: stillThere.promotedOn.toISOString(),
        gradedBy: stillThere.gradedBy,
        note: stillThere.note,
      },
      {
        fromRankId: snapshot.fromRankId,
        fromStripes: snapshot.fromStripes,
        toRankId: snapshot.toRankId,
        toStripes: snapshot.toStripes,
        promotedOn: snapshot.promotedOn.toISOString(),
        gradedBy: snapshot.gradedBy,
        note: snapshot.note,
      },
    );

    // The reversal is the mirror image, and it explains itself.
    const reversal = rows.find((r) => r.id !== snapshot.id)!;
    assert.equal(reversal.fromStripes, snapshot.toStripes);
    assert.equal(reversal.toStripes, snapshot.fromStripes);
    assert.match(reversal.note, /Reversal of/);
    assert.match(reversal.note, /wrong student/);

    // And the enrollment is back where it was.
    const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.id, fx.enrollmentId));
    assert.equal(enrollment.currentStripes, 3);

    // The timeline shows both — the promotion and the correction.
    const timeline = await promotionTimeline([fx.enrollmentId]);
    assert.equal(timeline.length, 2);
  });

  it("refuses a reversal with no stated reason", async () => {
    const db = getDb();
    const [row] = await db
      .select()
      .from(promotions)
      .where(eq(promotions.enrollmentId, fx.enrollmentId));
    await assert.rejects(
      reversePromotion({
        promotionId: row.id,
        schoolId: fx.schoolId,
        actorId: fx.ownerId,
        reason: " ",
      }),
      /why this promotion is being reversed/,
    );
  });

  it("will not promote past the top of the ladder", async () => {
    const db = getDb();
    await db
      .update(enrollments)
      .set({ currentRankId: fx.purpleId, currentStripes: 4 })
      .where(eq(enrollments.id, fx.enrollmentId));
    await assert.rejects(
      matPromotion({ enrollmentId: fx.enrollmentId, schoolId: fx.schoolId, gradedBy: fx.ownerId }),
      /top of this ladder/,
    );
    await db
      .update(enrollments)
      .set({ currentRankId: fx.whiteId, currentStripes: 3 })
      .where(eq(enrollments.id, fx.enrollmentId));
  });

  it("scopes every promotion to its own school", async () => {
    const other = await buildSchool("Someone Else's Dojo");
    await assert.rejects(
      matPromotion({
        enrollmentId: fx.enrollmentId,
        schoolId: other.schoolId,
        gradedBy: other.ownerId,
      }),
      /not found/,
    );
  });
});

// ------------------------------------------------------------------------ 2

describe("kiosk check-in is idempotent", { skip }, () => {
  let fx: Fixture;
  before(async () => {
    fx = await buildSchool("Idempotent Ippon");
  });
  after(teardown);

  it("replaying the same client key inserts exactly one row", async () => {
    const db = getDb();
    const clientKey = "kiosk:offline-queue-replay-0001";
    const at = new Date("2026-06-02T23:10:00Z"); // Tue 18:10 in Chicago

    const first = await recordCheckin({
      schoolId: fx.schoolId,
      studentId: fx.studentId,
      enrollmentId: fx.enrollmentId,
      clientKey,
      source: "kiosk",
      at,
    });
    assert.equal(first.duplicate, false);

    // The tablet came back online and replayed its whole queue — twice.
    const second = await recordCheckin({
      schoolId: fx.schoolId,
      studentId: fx.studentId,
      enrollmentId: fx.enrollmentId,
      clientKey,
      source: "kiosk",
      at,
    });
    const third = await recordCheckin({
      schoolId: fx.schoolId,
      studentId: fx.studentId,
      enrollmentId: fx.enrollmentId,
      clientKey,
      source: "kiosk",
      at,
    });
    assert.equal(second.duplicate, true);
    assert.equal(third.duplicate, true);
    assert.equal(second.checkinId, first.checkinId);
    assert.equal(third.checkinId, first.checkinId);

    const rows = await db.select().from(checkins).where(eq(checkins.clientKey, clientKey));
    assert.equal(rows.length, 1, "the unique index on client_key is the guarantee");
  });

  it("survives a simultaneous replay from two tablets", async () => {
    // The if-statement version of this passes serially and fails here.
    const db = getDb();
    const clientKey = "kiosk:offline-queue-replay-race";
    const at = new Date("2026-06-09T23:10:00Z");
    const attempt = () =>
      recordCheckin({
        schoolId: fx.schoolId,
        studentId: fx.studentId,
        enrollmentId: fx.enrollmentId,
        clientKey,
        source: "kiosk",
        at,
      });

    const results = await Promise.all([attempt(), attempt(), attempt(), attempt(), attempt()]);
    const rows = await db.select().from(checkins).where(eq(checkins.clientKey, clientKey));
    assert.equal(rows.length, 1, "a concurrent replay inserted more than once");
    const ids = new Set(results.map((r) => r.checkinId));
    assert.equal(ids.size, 1, "callers disagreed about which check-in is the real one");
    assert.equal(results.filter((r) => !r.duplicate).length, 1);
  });

  it("attaches the check-in to the class that was running", async () => {
    const db = getDb();
    const clientKey = "kiosk:class-attach-0001";
    await recordCheckin({
      schoolId: fx.schoolId,
      studentId: fx.studentId,
      enrollmentId: fx.enrollmentId,
      clientKey,
      source: "kiosk",
      at: new Date("2026-06-16T23:20:00Z"), // Tue 18:20 Chicago, mid-class
    });
    const [row] = await db.select().from(checkins).where(eq(checkins.clientKey, clientKey));
    assert.equal(row.classScheduleId, fx.classId);
  });

  it("records an out-of-hours drop-in as an open mat, not the wrong class", async () => {
    const db = getDb();
    const clientKey = "kiosk:open-mat-0001";
    await recordCheckin({
      schoolId: fx.schoolId,
      studentId: fx.studentId,
      enrollmentId: fx.enrollmentId,
      clientKey,
      source: "kiosk",
      at: new Date("2026-06-17T19:00:00Z"), // Wed 14:00 Chicago, nothing scheduled
    });
    const [row] = await db.select().from(checkins).where(eq(checkins.clientKey, clientKey));
    assert.equal(row.classScheduleId, null);
  });

  it("feeds the progression engine — the count the belt bar reads", async () => {
    const before = await progressFor(fx.enrollmentId, new Date("2026-07-01T12:00:00Z"));
    await recordCheckin({
      schoolId: fx.schoolId,
      studentId: fx.studentId,
      enrollmentId: fx.enrollmentId,
      clientKey: `kiosk:progress-${Date.now()}`,
      source: "kiosk",
      at: new Date("2026-06-23T23:10:00Z"),
    });
    const after = await progressFor(fx.enrollmentId, new Date("2026-07-01T12:00:00Z"));
    assert.equal(after.classesDone, before.classesDone + 1);
  });

  it("refuses a check-in for a student in another school", async () => {
    const other = await buildSchool("Not Your Dojo");
    await assert.rejects(
      recordCheckin({
        schoolId: other.schoolId,
        studentId: fx.studentId,
        enrollmentId: fx.enrollmentId,
        clientKey: "kiosk:cross-tenant",
        source: "kiosk",
      }),
      /not enrolled/,
    );
  });
});

// ------------------------------------------------------------------------ 3

describe("the kiosk's trust model", { skip }, () => {
  let fx: Fixture;
  before(async () => {
    fx = await buildSchool("Device Token Dojo");
  });
  after(teardown);

  it("mints a token that verifies, and revoking it bricks the device", async () => {
    const { token, device } = await mintDeviceToken({
      schoolId: fx.schoolId,
      name: "Front door iPad",
      actorId: fx.ownerId,
    });

    const verified = await verifyDeviceToken(token);
    assert.ok(verified, "a freshly minted token must verify");
    assert.equal(verified.schoolId, fx.schoolId);
    assert.equal(verified.deviceName, "Front door iPad");
    assert.equal(verified.timezone, "America/Chicago");

    await revokeDevice({ deviceId: device.id, schoolId: fx.schoolId, actorId: fx.ownerId });

    // The signature is still perfectly valid. The device is still dead.
    assert.equal(await verifyDeviceToken(token), null);
  });

  it("rejects a forged or truncated token", async () => {
    assert.equal(await verifyDeviceToken("not-a-token"), null);
    assert.equal(await verifyDeviceToken(""), null);
    const { token } = await mintDeviceToken({ schoolId: fx.schoolId, name: "Second tablet" });
    assert.equal(await verifyDeviceToken(`${token}x`), null);
  });

  it("leaks nothing about a minor beyond a name and a belt", async () => {
    const results = await searchStudents({
      schoolId: fx.schoolId,
      query: "Mar",
      timezone: "America/Chicago",
    });
    assert.equal(results.length, 1);
    const [student] = results;
    assert.equal(student.name, "Marcus Okafor");
    const keys = Object.keys(student).sort();
    assert.deepEqual(keys, ["enrollments", "name", "photoKey", "studentId"]);
    // No birthdate, no guardian contact, no billing state, no notes, no PIN.
    const serialised = JSON.stringify(results);
    assert.equal(serialised.includes("example.test"), false, "a guardian email leaked");
    assert.equal(serialised.includes("555-0148"), false, "a phone number leaked");
  });

  it("needs three letters, or a whole PIN", async () => {
    const db = getDb();
    const [student] = await db.select().from(students).where(eq(students.id, fx.studentId));
    assert.equal((await searchStudents({ schoolId: fx.schoolId, query: "Ma", timezone: "UTC" })).length, 0);
    assert.equal((await searchStudents({ schoolId: fx.schoolId, query: "Mar", timezone: "UTC" })).length, 1);
    const byPin = await searchStudents({
      schoolId: fx.schoolId,
      query: student.kioskPin!,
      timezone: "UTC",
    });
    assert.equal(byPin.length, 1);
    assert.equal(byPin[0].studentId, fx.studentId);
  });

  it("never returns a student from another school", async () => {
    const other = await buildSchool("Rival Dojo");
    const results = await searchStudents({
      schoolId: other.schoolId,
      query: "Mar",
      timezone: "UTC",
    });
    // Both schools have a "Marcus Okafor"; each sees only its own.
    assert.equal(results.length, 1);
    assert.notEqual(results[0].studentId, fx.studentId);
  });
});

// ------------------------------------------------------------------------ 4

describe("attendance is never blocked by billing state", { skip }, () => {
  let fx: Fixture;
  before(async () => {
    fx = await buildSchool("Past Due Dojo");
  });
  after(teardown);

  it("a past-due family's student still checks in", async () => {
    const db = getDb();
    const [plan] = await db
      .insert(membershipPlans)
      .values({
        schoolId: fx.schoolId,
        name: "Family unlimited",
        amountCents: 24900,
        interval: "month",
        kind: "family_flat",
        stripePriceId: "price_test",
        status: "active",
      })
      .returning();
    await db.insert(subscriptions).values({
      familyId: fx.familyId,
      membershipPlanId: plan.id,
      studentIds: [fx.studentId],
      status: "past_due",
      pastDueSince: new Date("2026-07-03T12:00:00Z"),
      failedPayments: 3,
    });

    const result = await recordCheckin({
      schoolId: fx.schoolId,
      studentId: fx.studentId,
      enrollmentId: fx.enrollmentId,
      clientKey: "kiosk:past-due-still-trains",
      source: "kiosk",
      at: new Date("2026-07-07T23:10:00Z"),
    });
    assert.equal(result.duplicate, false);
    assert.equal(result.studentName, "Marcus Okafor");

    const rows = await db.select().from(checkins).where(eq(checkins.clientKey, "kiosk:past-due-still-trains"));
    assert.equal(rows.length, 1, "billing state blocked a check-in");
  });

  it("a cancelled subscription does not block one either", async () => {
    const db = getDb();
    await db
      .update(subscriptions)
      .set({ status: "canceled" })
      .where(eq(subscriptions.familyId, fx.familyId));
    const result = await recordCheckin({
      schoolId: fx.schoolId,
      studentId: fx.studentId,
      enrollmentId: fx.enrollmentId,
      clientKey: "kiosk:cancelled-still-trains",
      source: "kiosk",
      at: new Date("2026-07-14T23:10:00Z"),
    });
    assert.equal(result.duplicate, false);
  });

  it("nothing on the check-in path even reads a subscription", () => {
    // The structural version of the same promise: the kiosk module has no
    // reference to the billing tables at all.
    const source = readFileSync(path.join(process.cwd(), "src/lib/kiosk.ts"), "utf8");
    for (const token of ["subscriptions", "membershipPlans", "stripe"]) {
      assert.equal(
        new RegExp(`\\b${token}\\b`).test(source),
        false,
        `the check-in path references ${token}`,
      );
    }
  });

  it("shows the past-due state at the desk without touching progression", async () => {
    const db = getDb();
    await db
      .update(subscriptions)
      .set({ status: "past_due", pastDueSince: new Date("2026-07-03T12:00:00Z") })
      .where(eq(subscriptions.familyId, fx.familyId));
    const roster = await loadRoster({
      schoolId: fx.schoolId,
      timezone: "America/Chicago",
      now: new Date("2026-07-20T12:00:00Z"),
    });
    const entry = roster.find((r) => r.studentId === fx.studentId)!;
    assert.equal(entry.billingState, "past_due");
    assert.ok(entry.programs[0].progress.classesDone > 0, "progression still counts");
  });
});

// ------------------------------------------------------------------------ 5

describe("the grading event assembles itself", { skip }, () => {
  let fx: Fixture;
  before(async () => {
    fx = await buildSchool("Self Assembling Dojo");
  });
  after(teardown);

  it("splits eligible from near-miss with the exact deltas", async () => {
    const db = getDb();
    // White belt: 60 classes / 5 steps = 12 per step, 180 days / 5 = 36 per step.
    // Marcus is on 3 stripes, promoted 2025-06-01. Give him 12 check-ins.
    for (let i = 0; i < 12; i++) {
      await recordCheckin({
        schoolId: fx.schoolId,
        studentId: fx.studentId,
        enrollmentId: fx.enrollmentId,
        clientKey: `kiosk:assemble-marcus-${i}`,
        source: "kiosk",
        at: new Date(Date.parse("2025-07-01T23:10:00Z") + i * 7 * 86_400_000),
      });
    }

    // A second student, two classes short.
    const sofia = await createStudent({
      schoolId: fx.schoolId,
      familyId: fx.familyId,
      firstName: "Sofia",
      lastName: "Reyes",
      joinedOn: new Date("2024-06-11T12:00:00Z"),
    });
    const sofiaEnrollment = await enrollStudent({
      studentId: sofia.id,
      programId: fx.programId,
      rankId: fx.whiteId,
      currentStripes: 1,
      promotedAt: new Date("2025-06-01T12:00:00Z"),
    });
    for (let i = 0; i < 10; i++) {
      await recordCheckin({
        schoolId: fx.schoolId,
        studentId: sofia.id,
        enrollmentId: sofiaEnrollment.id,
        clientKey: `kiosk:assemble-sofia-${i}`,
        source: "kiosk",
        at: new Date(Date.parse("2025-07-01T23:10:00Z") + i * 7 * 86_400_000),
      });
    }

    const [event] = await db
      .insert(gradingEvents)
      .values({
        schoolId: fx.schoolId,
        name: "Summer grading",
        heldOn: new Date("2026-08-15T12:00:00Z"),
        programIds: [fx.programId],
        status: "draft",
      })
      .returning();

    const counts = await assembleCandidates(event.id, { now: new Date("2026-08-03T12:00:00Z") });
    assert.equal(counts.eligible, 1, "Marcus met 12 classes and 36 days");
    assert.equal(counts.nearMiss, 1, "Sofia is two classes short");

    const candidates = await listCandidates(event.id);
    const marcus = candidates.find((c) => c.studentName === "Marcus Okafor")!;
    const sofiaRow = candidates.find((c) => c.studentName === "Sofia Reyes")!;
    assert.equal(marcus.status, "eligible");
    assert.deepEqual(marcus.eligibility.missing, []);
    assert.equal(marcus.nextLabel, "4th stripe");
    assert.equal(sofiaRow.status, "near_miss");
    assert.deepEqual(sofiaRow.eligibility.missing, ["2 classes short"]);
    assert.equal(sofiaRow.eligibility.classesDone, 10);
    assert.equal(sofiaRow.eligibility.classesRequired, 12);

    // Re-running is idempotent: no duplicate candidates.
    const again = await assembleCandidates(event.id, { now: new Date("2026-08-03T12:00:00Z") });
    assert.deepEqual(again, counts);
    assert.equal((await listCandidates(event.id)).length, 2);
  });

  it("batch-promotes behind the review, and records everything", async () => {
    const db = getDb();
    const [event] = await db
      .select()
      .from(gradingEvents)
      .where(eq(gradingEvents.schoolId, fx.schoolId));
    const candidates = await listCandidates(event.id);
    const marcus = candidates.find((c) => c.studentName === "Marcus Okafor")!;
    const sofia = candidates.find((c) => c.studentName === "Sofia Reyes")!;

    const result = await completeEvent({
      gradingEventId: event.id,
      schoolId: fx.schoolId,
      gradedBy: fx.ownerId,
      decisions: [
        { candidateId: marcus.candidateId, decision: "promote" },
        { candidateId: sofia.candidateId, decision: "hold_back" },
      ],
      promotedOn: new Date("2026-08-15T12:00:00Z"),
    });
    assert.deepEqual(result, { promotions: 1, heldBack: 1, noShows: 0 });

    const marcusPromotions = await db
      .select()
      .from(promotions)
      .where(eq(promotions.enrollmentId, marcus.enrollmentId));
    assert.equal(marcusPromotions.length, 1);
    assert.equal(marcusPromotions[0].gradingEventId, event.id);
    assert.equal(marcusPromotions[0].gradedBy, fx.ownerId);
    assert.equal(marcusPromotions[0].toStripes, 4);

    // The held-back student has no promotion row at all.
    const sofiaPromotions = await db
      .select()
      .from(promotions)
      .where(eq(promotions.enrollmentId, sofia.enrollmentId));
    assert.equal(sofiaPromotions.length, 0);

    // The clock reset, so the next step is measured from the event.
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, marcus.enrollmentId));
    assert.equal(enrollment.currentStripes, 4);
    assert.equal(enrollment.promotedAt.toISOString(), "2026-08-15T12:00:00.000Z");

    // Completing twice is refused rather than doubling the record.
    await assert.rejects(
      completeEvent({
        gradingEventId: event.id,
        schoolId: fx.schoolId,
        gradedBy: fx.ownerId,
        decisions: [{ candidateId: marcus.candidateId, decision: "promote" }],
      }),
      /already completed/,
    );
  });

  it("crosses a rank boundary at the last stripe, resetting stripes to zero", async () => {
    const db = getDb();
    const promoted = await matPromotion({
      enrollmentId: fx.enrollmentId,
      schoolId: fx.schoolId,
      gradedBy: fx.ownerId,
      promotedOn: new Date("2026-08-20T12:00:00Z"),
    });
    assert.equal(promoted.step, "rank");
    assert.equal(promoted.toRankName, "Blue belt");
    assert.equal(promoted.toStripes, 0);
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, fx.enrollmentId));
    assert.equal(enrollment.currentRankId, fx.blueId);
    assert.equal(enrollment.currentStripes, 0);
  });
});

// ------------------------------------------------------------------------ 6

describe("the retention scan", { skip }, () => {
  let fx: Fixture;
  before(async () => {
    fx = await buildSchool("Quiet Quit Dojo");
    clearRecordedEmails();
  });
  after(teardown);

  const NOW = new Date("2026-08-03T18:00:00Z");

  it("flags a 3x/week student gone two weeks, and only once", async () => {
    const db = getDb();
    // Twenty weeks of 3x/week, ending 18 days ago.
    for (let week = 0; week < 20; week++) {
      for (let n = 0; n < 3; n++) {
        const daysAgo = 18 + week * 7 + n * 2;
        await recordCheckin({
          schoolId: fx.schoolId,
          studentId: fx.studentId,
          enrollmentId: fx.enrollmentId,
          clientKey: `kiosk:retention-${week}-${n}`,
          source: "kiosk",
          at: new Date(NOW.getTime() - daysAgo * 86_400_000),
        });
      }
    }

    const first = await scanSchool(fx.schoolId, NOW);
    assert.equal(first.flagged, 1);

    // The nightly job runs again. And again. The alarm must not re-fire.
    const second = await scanSchool(fx.schoolId, NOW);
    const third = await scanSchool(fx.schoolId, new Date(NOW.getTime() + 86_400_000));
    assert.equal(second.flagged, 0, "the scan raised the same alarm twice");
    assert.equal(third.flagged, 0, "the scan raised the same alarm the next night");

    const flags = await db
      .select()
      .from(retentionFlags)
      .where(eq(retentionFlags.studentId, fx.studentId));
    assert.equal(flags.length, 1);
    assert.equal(flags[0].status, "open");
    assert.ok(Number(flags[0].baselinePerWeek) >= 2.5);
  });

  it("closes the flag by itself when the student comes back", async () => {
    const db = getDb();
    // Two weeks of training again, right up to today.
    for (let i = 0; i < 6; i++) {
      await recordCheckin({
        schoolId: fx.schoolId,
        studentId: fx.studentId,
        enrollmentId: fx.enrollmentId,
        clientKey: `kiosk:recovered-${i}`,
        source: "kiosk",
        at: new Date(NOW.getTime() - i * 2 * 86_400_000),
      });
    }
    // recordCheckin already auto-recovers on the way in; the scan agrees.
    const flags = await db
      .select()
      .from(retentionFlags)
      .where(eq(retentionFlags.studentId, fx.studentId));
    assert.equal(flags[0].status, "recovered", "a returning student must close their own flag");

    const scan = await scanSchool(fx.schoolId, NOW);
    assert.equal(scan.flagged, 0, "a recovered student must not be immediately re-flagged");
  });

  it("does not flag a paused student, however long they are away", async () => {
    const db = getDb();
    const paused = await createStudent({
      schoolId: fx.schoolId,
      familyId: fx.familyId,
      firstName: "Tomas",
      lastName: "Lindqvist",
      joinedOn: new Date("2024-01-01T12:00:00Z"),
    });
    const pausedEnrollment = await enrollStudent({
      studentId: paused.id,
      programId: fx.programId,
      rankId: fx.whiteId,
      promotedAt: new Date("2025-01-01T12:00:00Z"),
    });
    for (let week = 0; week < 20; week++) {
      for (let n = 0; n < 3; n++) {
        await recordCheckin({
          schoolId: fx.schoolId,
          studentId: paused.id,
          enrollmentId: pausedEnrollment.id,
          clientKey: `kiosk:paused-${week}-${n}`,
          source: "kiosk",
          at: new Date(NOW.getTime() - (40 + week * 7 + n * 2) * 86_400_000),
        });
      }
    }
    await db.update(students).set({ status: "paused" }).where(eq(students.id, paused.id));

    const scan = await scanSchool(fx.schoolId, NOW);
    const flags = await db
      .select()
      .from(retentionFlags)
      .where(eq(retentionFlags.studentId, paused.id));
    assert.equal(flags.length, 0, "a pause is not a quiet quit");
    assert.equal(scan.flagged, 0);
  });

  it("does not flag a stable 1x/week adult", async () => {
    const db = getDb();
    const steady = await createStudent({
      schoolId: fx.schoolId,
      familyId: fx.familyId,
      firstName: "Priya",
      lastName: "Raman",
      joinedOn: new Date("2024-01-01T12:00:00Z"),
    });
    const steadyEnrollment = await enrollStudent({
      studentId: steady.id,
      programId: fx.programId,
      rankId: fx.whiteId,
      promotedAt: new Date("2025-01-01T12:00:00Z"),
    });
    for (let week = 0; week < 20; week++) {
      await recordCheckin({
        schoolId: fx.schoolId,
        studentId: steady.id,
        enrollmentId: steadyEnrollment.id,
        clientKey: `kiosk:steady-${week}`,
        source: "kiosk",
        at: new Date(NOW.getTime() - week * 7 * 86_400_000),
      });
    }

    await scanSchool(fx.schoolId, NOW);
    const flags = await db
      .select()
      .from(retentionFlags)
      .where(eq(retentionFlags.studentId, steady.id));
    assert.equal(flags.length, 0, "a steady 1x/week adult is not a churn signal");
  });
});

// ------------------------------------------------------------------------ 7

describe("billing state and the dunning ladder", { skip }, () => {
  let fx: Fixture;
  let subscriptionId: string;
  before(async () => {
    fx = await buildSchool("Dunning Dojo");
    clearRecordedEmails();
    const db = getDb();
    const [plan] = await db
      .insert(membershipPlans)
      .values({
        schoolId: fx.schoolId,
        name: "Two kids",
        amountCents: 19900,
        interval: "month",
        kind: "family_flat",
        stripePriceId: `price_test_${RUN}`,
        status: "active",
      })
      .returning();
    const [sub] = await db
      .insert(subscriptions)
      .values({
        familyId: fx.familyId,
        membershipPlanId: plan.id,
        studentIds: [fx.studentId],
        stripeSubscriptionId: `sub_test_${RUN}_dunning`,
        status: "active",
      })
      .returning();
    subscriptionId = sub.id;
    await db
      .update(families)
      .set({ stripeCustomerId: `cus_test_${RUN}_dunning` })
      .where(eq(families.id, fx.familyId));
  });
  after(teardown);

  it("a duplicate webhook delivery is stored once and applied once", async () => {
    const payload = {
      id: evtId("dunning_1"),
      type: "invoice.payment_failed",
      data: { object: { id: "in_1", subscription: `sub_test_${RUN}_dunning` } },
    };
    const first = await persistWebhookEvent({
      externalId: payload.id,
      type: payload.type,
      payload,
    });
    assert.equal(first.fresh, true);
    const second = await persistWebhookEvent({
      externalId: payload.id,
      type: payload.type,
      payload,
    });
    assert.equal(second.fresh, false, "the unique index on (provider, external_id) is the guard");
    assert.equal(second.id, first.id);

    const applied = await applyStripeEvent(first.id);
    assert.equal(applied.applied, "past_due");
    // Re-applying is a no-op: the failure count must not climb on a Stripe retry.
    const again = await applyStripeEvent(first.id);
    assert.equal(again.applied, "already-processed");

    const db = getDb();
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId));
    assert.equal(sub.status, "past_due");
    assert.equal(sub.failedPayments, 1);
    assert.ok(sub.pastDueSince);
  });

  it("mails the family once per rung and then falls silent", async () => {
    const db = getDb();
    const since = new Date("2026-07-03T12:00:00Z");
    await db
      .update(subscriptions)
      .set({ pastDueSince: since, failedPayments: 1, lastDunningOn: null, escalatedAt: null })
      .where(eq(subscriptions.id, subscriptionId));

    clearRecordedEmails();
    const sent: number[] = [];
    // Walk 21 days forward, one sweep per day, as a nightly cron would.
    for (let day = 0; day <= 21; day++) {
      const before = recordedEmails().length;
      await dunning({ schoolId: fx.schoolId, now: new Date(since.getTime() + day * 86_400_000) });
      if (recordedEmails().length > before) sent.push(day);
    }

    assert.deepEqual(
      sent,
      [...DUNNING_DAYS],
      "dunning must fire on its fixed rungs and then stop — not every night forever",
    );
    assert.equal(recordedEmails().length, DUNNING_DAYS.length);
    assert.match(recordedEmails()[0].text, /nobody is turned away at the door/);
  });

  it("escalates to a desk task after the second failure, once", async () => {
    const db = getDb();
    const since = new Date("2026-07-03T12:00:00Z");
    await db
      .update(subscriptions)
      .set({ failedPayments: 2, lastDunningOn: null, escalatedAt: null, pastDueSince: since })
      .where(eq(subscriptions.id, subscriptionId));

    const first = await dunning({
      schoolId: fx.schoolId,
      now: new Date(since.getTime() + 3 * 86_400_000),
    });
    assert.equal(first.escalated, 1);
    const second = await dunning({
      schoolId: fx.schoolId,
      now: new Date(since.getTime() + 7 * 86_400_000),
    });
    assert.equal(second.escalated, 0, "escalation must happen once, not on every rung");
  });

  it("a successful payment clears past-due AND the whole dunning ladder", async () => {
    const payload = {
      id: evtId("dunning_paid"),
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_2",
          subscription: `sub_test_${RUN}_dunning`,
          period_end: Math.floor(Date.parse("2026-09-03T12:00:00Z") / 1000),
        },
      },
    };
    const stored = await persistWebhookEvent({
      externalId: payload.id,
      type: payload.type,
      payload,
    });
    await applyStripeEvent(stored.id);

    const db = getDb();
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId));
    assert.equal(sub.status, "active");
    assert.equal(sub.pastDueSince, null);
    assert.equal(sub.failedPayments, 0);
    assert.equal(sub.lastDunningOn, null);
    assert.equal(sub.escalatedAt, null);
    assert.equal(sub.currentPeriodEnd?.toISOString(), "2026-09-03T12:00:00.000Z");

    // And a sweep now sends nothing at all.
    clearRecordedEmails();
    const result = await dunning({ schoolId: fx.schoolId, now: new Date("2026-09-01T12:00:00Z") });
    assert.equal(result.emailed, 0);
    assert.equal(recordedEmails().length, 0);
  });

  it("ignores an event for a subscription it does not know", async () => {
    const payload = {
      id: evtId("unknown"),
      type: "invoice.payment_failed",
      data: { object: { id: "in_x", subscription: "sub_does_not_exist" } },
    };
    const stored = await persistWebhookEvent({
      externalId: payload.id,
      type: payload.type,
      payload,
    });
    const applied = await applyStripeEvent(stored.id);
    assert.equal(applied.applied, "no-matching-subscription");
  });
});

// ------------------------------------------------------------------------ 8

describe("the roster import", { skip }, () => {
  let fx: Fixture;
  before(async () => {
    fx = await buildSchool("Import Evening Dojo");
  });
  after(teardown);

  it("collapses siblings into one household with one guardian email", async () => {
    const summary = await importStudents({
      schoolId: fx.schoolId,
      csv: [
        "Name,Family,Email,Rank,Stripes,Last promoted",
        "Amara Okafor,Okafor,dayo@example.test,White belt,4,2026-01-17",
        "Chidi Okafor,Okafor,,Blue belt,1,2025-03-02",
        "Tomas Lindqvist,Lindqvist,t.l@example.test,Coral belt,0,2024-10-02",
      ].join("\n"),
      defaultProgramId: fx.programId,
      actorId: fx.ownerId,
    });

    assert.equal(summary.studentsCreated, 3);
    assert.equal(summary.familiesCreated, 2, "two siblings must share one household");
    assert.deepEqual(summary.unmatchedRanks, ["Coral belt"], "an unknown rank must be reported");

    const db = getDb();
    const okafor = await db
      .select()
      .from(families)
      .where(and(eq(families.schoolId, fx.schoolId), eq(families.name, "Okafor")));
    assert.equal(okafor.length, 1);
    assert.equal(okafor[0].email, "dayo@example.test");

    const roster = await loadRoster({ schoolId: fx.schoolId, timezone: "America/Chicago" });
    const amara = roster.find((r) => r.name === "Amara Okafor")!;
    assert.equal(amara.programs[0].rankName, "White belt");
    assert.equal(amara.programs[0].stripesEarned, 4);
    const tomas = roster.find((r) => r.name === "Tomas Lindqvist")!;
    assert.equal(tomas.programs[0].rankName, "White belt", "an unmatched rank goes to the bottom");
  });

  it("honours the imported promotion date, so eligibility is right on day one", async () => {
    const db = getDb();
    const [chidi] = await db
      .select()
      .from(students)
      .where(and(eq(students.schoolId, fx.schoolId), eq(students.firstName, "Chidi")));
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.studentId, chidi.id));
    assert.equal(enrollment.promotedAt.toISOString().slice(0, 10), "2025-03-02");
    assert.equal(enrollment.currentStripes, 1);
  });

  it("gives everybody a distinct kiosk PIN", async () => {
    const db = getDb();
    const rows = await db
      .select({ pin: students.kioskPin })
      .from(students)
      .where(eq(students.schoolId, fx.schoolId));
    const pins = rows.map((r) => r.pin);
    assert.equal(pins.every((p) => p && /^\d{4,6}$/.test(p)), true);
    assert.equal(new Set(pins).size, pins.length, "PINs must be unique within a school");
  });

  it("skips a student already on the roster rather than duplicating them", async () => {
    const summary = await importStudents({
      schoolId: fx.schoolId,
      csv: ["Name,Family,Rank", "Amara Okafor,Okafor,White belt"].join("\n"),
      defaultProgramId: fx.programId,
      actorId: fx.ownerId,
    });
    assert.equal(summary.studentsCreated, 0);
    assert.equal(summary.skipped.length, 1);
    assert.match(summary.skipped[0].message, /already on the roster/);
  });

  it("refuses to import into a program with no ladder", async () => {
    const db = getDb();
    const [empty] = await db
      .insert(programs)
      .values({ schoolId: fx.schoolId, name: "Empty program", status: "active" })
      .returning();
    await assert.rejects(
      importStudents({
        schoolId: fx.schoolId,
        csv: "Name\nSomebody New",
        defaultProgramId: empty.id,
        actorId: fx.ownerId,
      }),
      /no rank ladder/,
    );
    await db.delete(programs).where(eq(programs.id, empty.id));
  });
});

after(async () => {
  if (hasDb) await closeDb();
});
