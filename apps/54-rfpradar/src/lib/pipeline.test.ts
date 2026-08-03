/**
 * The invariants BUILD.md names, exercised against real Postgres:
 * ingestion idempotency, the amendment trail, link-and-snapshot immutability,
 * exactly-once reminders, and one morning scan per firm per local day.
 *
 * These need a database. With no `DATABASE_URL` they skip rather than fail, so
 * `npm test` stays useful on a machine with nothing running — but they are the
 * tests that would have caught the two real bugs found while building this.
 *
 * Every test builds its own firm and its own private source row, and deletes
 * them afterwards, so a run leaves the database as it found it.
 */

import "@/lib/load-env";

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  answerBlocks,
  auditLog,
  blockUses,
  deadlines,
  firms,
  keywordProfiles,
  matches,
  notifications,
  opportunities,
  opportunityEvents,
  pursuits,
  reminders,
  requirements,
  scorecards,
  sources,
  users,
} from "@/db/schema";
import { upsertOpportunity, type RawNotice } from "@/lib/ingest";
import { rescoreProfile } from "@/lib/matching";
import { createBlock, linkBlock, listBlockUses, updateBlock } from "@/lib/library";
import { pursueMatch, recordDecision } from "@/lib/pursuits";
import { sweepDeadlineReminders } from "@/lib/deadlines";
import { sendScan } from "@/lib/scan";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const options = { skip: HAS_DB ? false : "no DATABASE_URL configured" };

let counter = 0;
const cleanup: Array<() => Promise<void>> = [];

after(async () => {
  for (const fn of cleanup.reverse()) await fn().catch(() => undefined);
  if (HAS_DB) await closeDb();
});

/**
 * A firm, a seat, a profile, and a private source — torn down after the test.
 *
 * `sources` and `opportunities` are shared across firms by design, so a test
 * that needs to count matches exactly narrows its profile until only its own
 * notices can match it.
 */
async function scaffold(
  label: string,
  profileOverrides: Partial<typeof keywordProfiles.$inferInsert> = {},
) {
  const db = getDb();
  counter += 1;
  const stamp = `${Date.now()}-${counter}`;

  const [source] = await db
    .insert(sources)
    .values({
      key: `test-${label}-${stamp}`,
      name: `Test source ${label}`,
      kind: "rss",
      pollIntervalMinutes: 240,
      config: { state: "VA" },
    })
    .returning();

  const [firm] = await db
    .insert(firms)
    .values({
      name: `Test firm ${label}`,
      plan: "trial",
      trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
      timezone: "America/New_York",
      settings: { scanHour: 6, scoreThreshold: 45 },
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      firmId: firm.id,
      email: `test-${label}-${stamp}@example.test`,
      name: "Test Admin",
      role: "admin",
      passwordHash: "x:y",
    })
    .returning();

  const [profile] = await db
    .insert(keywordProfiles)
    .values({
      firmId: firm.id,
      name: "Managed IT — VA",
      naicsCodes: ["541512"],
      pscCodes: ["D310"],
      keywords: ["managed detection"],
      negativeKeywords: ["janitorial"],
      states: ["VA"],
      agencies: [],
      valueBand: { minCents: 25_000_000, maxCents: 500_000_000 },
      ...profileOverrides,
    })
    .returning();

  cleanup.push(async () => {
    const db2 = getDb();
    const firmPursuits = await db2
      .select({ id: pursuits.id })
      .from(pursuits)
      .where(eq(pursuits.firmId, firm.id));
    const pursuitIds = firmPursuits.map((p) => p.id);
    const firmDeadlines = await db2
      .select({ id: deadlines.id })
      .from(deadlines)
      .where(eq(deadlines.firmId, firm.id));
    if (firmDeadlines.length) {
      await db2.delete(reminders).where(inArray(reminders.deadlineId, firmDeadlines.map((d) => d.id)));
    }
    if (pursuitIds.length) {
      await db2.delete(blockUses).where(inArray(blockUses.pursuitId, pursuitIds));
      await db2.delete(requirements).where(inArray(requirements.pursuitId, pursuitIds));
      await db2.delete(scorecards).where(inArray(scorecards.pursuitId, pursuitIds));
    }
    await db2.delete(deadlines).where(eq(deadlines.firmId, firm.id));
    await db2.delete(matches).where(eq(matches.firmId, firm.id));
    await db2.delete(pursuits).where(eq(pursuits.firmId, firm.id));
    await db2.delete(answerBlocks).where(eq(answerBlocks.firmId, firm.id));
    await db2.delete(notifications).where(eq(notifications.firmId, firm.id));
    await db2.delete(auditLog).where(eq(auditLog.firmId, firm.id));
    await db2.delete(keywordProfiles).where(eq(keywordProfiles.firmId, firm.id));
    await db2.delete(users).where(eq(users.firmId, firm.id));
    await db2.delete(firms).where(eq(firms.id, firm.id));

    const own = await db2
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(eq(opportunities.sourceId, source.id));
    if (own.length) {
      await db2
        .delete(opportunityEvents)
        .where(inArray(opportunityEvents.opportunityId, own.map((o) => o.id)));
      await db2.delete(opportunities).where(eq(opportunities.sourceId, source.id));
    }
    await db2.delete(sources).where(eq(sources.id, source.id));
  });

  return { source, firm, user, profile };
}

function notice(overrides: Partial<RawNotice> = {}): RawNotice {
  return {
    externalId: "VA-DGS-26-0412",
    title: "Enterprise Managed Detection and Response Platform",
    agency: "Virginia Department of General Services",
    state: "VA",
    naicsCodes: ["541512"],
    pscCodes: ["D310"],
    description:
      "Section 3.2 Scope of services. Managed detection and response for approximately 18,500 seats.",
    url: "https://eva.virginia.gov/notice/412",
    postedAt: new Date("2026-03-02T13:00:00Z"),
    questionsDueAt: new Date("2026-03-10T21:00:00Z"),
    responsesDueAt: new Date("2026-03-24T18:00:00Z"),
    estValueBand: { minCents: 40_000_000, maxCents: 90_000_000 },
    raw: { test: true },
    ...overrides,
  };
}

test("re-polling the same window creates zero duplicates", options, async () => {
  const { source } = await scaffold("idem");
  const db = getDb();

  const first = await upsertOpportunity(source.id, notice());
  assert.equal(first.outcome, "inserted");
  assert.equal(first.changed, true);

  // Three more identical polls, exactly as an hourly schedule would do.
  for (let i = 0; i < 3; i++) {
    const again = await upsertOpportunity(source.id, notice());
    assert.equal(again.outcome, "unchanged", "the content hash must short-circuit");
    assert.equal(again.changed, false);
    assert.equal(again.opportunityId, first.opportunityId);
  }

  const rows = await db.select().from(opportunities).where(eq(opportunities.sourceId, source.id));
  assert.equal(rows.length, 1);

  const events = await db
    .select()
    .from(opportunityEvents)
    .where(eq(opportunityEvents.opportunityId, first.opportunityId));
  assert.equal(events.length, 1, "one 'posted' event, and no churn from re-polls");
  assert.equal(events[0].kind, "posted");
});

test("an amendment updates in place and appends exactly one event", options, async () => {
  const { source } = await scaffold("amend");
  const db = getDb();
  const first = await upsertOpportunity(source.id, notice());

  const moved = await upsertOpportunity(
    source.id,
    notice({ responsesDueAt: new Date("2026-04-07T18:00:00Z") }),
  );
  assert.equal(moved.opportunityId, first.opportunityId, "updated in place, not re-inserted");
  assert.equal(moved.outcome, "date_changed");

  const rows = await db.select().from(opportunities).where(eq(opportunities.sourceId, source.id));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].responsesDueAt?.toISOString(), "2026-04-07T18:00:00.000Z");
  assert.equal(rows[0].oppStatus, "amended");

  const events = await db
    .select()
    .from(opportunityEvents)
    .where(eq(opportunityEvents.opportunityId, first.opportunityId));
  assert.equal(events.length, 2, "posted + exactly one date_changed");
  const change = events.find((e) => e.kind === "date_changed");
  const detail = change?.detail as { changes: Array<{ field: string; old: string; new: string }> };
  assert.equal(detail.changes[0].field, "responsesDueAt");
  assert.equal(detail.changes[0].old, "2026-03-24T18:00:00.000Z");
  assert.equal(detail.changes[0].new, "2026-04-07T18:00:00.000Z");

  // A text-only change is an amendment, not a date change.
  const retexted = await upsertOpportunity(
    source.id,
    notice({
      responsesDueAt: new Date("2026-04-07T18:00:00Z"),
      description: "Section 3.2 Scope of services. Managed detection and response, now 21,000 seats.",
    }),
  );
  assert.equal(retexted.outcome, "amended");
  const after3 = await db
    .select()
    .from(opportunityEvents)
    .where(eq(opportunityEvents.opportunityId, first.opportunityId));
  assert.equal(after3.length, 3);
});

test("a cancelled notice is recorded as cancelled, not just amended", options, async () => {
  const { source } = await scaffold("cancel");
  const first = await upsertOpportunity(source.id, notice());
  const cancelled = await upsertOpportunity(
    source.id,
    notice({ title: "CANCELLED — Enterprise Managed Detection and Response Platform" }),
  );
  assert.equal(cancelled.outcome, "cancelled");
  const [row] = await getDb()
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, first.opportunityId));
  assert.equal(row.oppStatus, "cancelled");
});

test("below-threshold matches are suppressed, stored, and still queryable", options, async () => {
  const { source, firm, profile } = await scaffold("suppress");
  const db = getDb();
  await upsertOpportunity(source.id, notice());
  // Same industry code (so it is a candidate the firm asked about), none of the
  // keywords, and a value far below the band: exactly the notice a firm wants to
  // see in the audit view when it asks what was filtered out.
  await upsertOpportunity(
    source.id,
    notice({
      externalId: "VA-DGS-26-0455",
      title: "Desktop Hardware Refresh, Two Regional Offices",
      naicsCodes: ["541512"],
      pscCodes: ["F999"],
      description: "Section 1. Supply and install 120 desktop workstations.",
      estValueBand: { minCents: 5_000_000, maxCents: 8_000_000 },
    }),
  );

  await rescoreProfile(profile.id, { now: new Date("2026-03-05T12:00:00Z") });

  // `opportunities` is a shared store, so scope the assertions to this test's
  // own source rather than assuming the register is empty.
  const rows = await db
    .select({ match: matches })
    .from(matches)
    .innerJoin(opportunities, eq(matches.opportunityId, opportunities.id))
    .where(and(eq(matches.firmId, firm.id), eq(opportunities.sourceId, source.id)))
    .then((result) => result.map((row) => row.match));
  const surfaced = rows.filter((row) => row.state === "new");
  const suppressed = rows.filter((row) => row.state === "suppressed");
  assert.equal(surfaced.length, 1);
  assert.equal(suppressed.length, 1, "the vegetation notice is filtered, not deleted");

  // The invariant: no stored match may carry a score without factors.
  for (const row of rows) {
    const factors = row.factors as Array<{ reason: string }>;
    assert.ok(Array.isArray(factors) && factors.length > 0, `match ${row.id} has no factors`);
    for (const factor of factors) assert.ok(factor.reason.trim().length > 0);
  }
});

test("a rescore never overwrites a human decision", options, async () => {
  const { source, firm, profile } = await scaffold("decision");
  const db = getDb();
  await upsertOpportunity(source.id, notice());
  await rescoreProfile(profile.id, { now: new Date("2026-03-05T12:00:00Z") });

  const [match] = await db.select().from(matches).where(eq(matches.firmId, firm.id));
  await db
    .update(matches)
    .set({ state: "dismissed", dismissReason: "Wrong vehicle" })
    .where(eq(matches.id, match.id));

  await rescoreProfile(profile.id, { now: new Date("2026-03-06T12:00:00Z") });
  const [after] = await db.select().from(matches).where(eq(matches.id, match.id));
  assert.equal(after.state, "dismissed", "a rescore must not resurrect a dismissed match");
  assert.equal(after.dismissReason, "Wrong vehicle", "and the tuning signal survives");
});

test("linking a block snapshots it: library edits never rewrite the pursuit", options, async () => {
  const { source, firm, user, profile } = await scaffold("snapshot");
  const db = getDb();
  await upsertOpportunity(source.id, notice());
  await rescoreProfile(profile.id, { now: new Date("2026-03-05T12:00:00Z") });
  const [match] = await db
    .select()
    .from(matches)
    .where(and(eq(matches.firmId, firm.id), eq(matches.state, "new")));

  const { pursuit } = await pursueMatch({
    firmId: firm.id,
    actorUserId: user.id,
    matchId: match.id,
  });

  const block = await createBlock({
    firmId: firm.id,
    actorUserId: user.id,
    block: {
      kind: "past_performance",
      title: "SOC monitoring for a state agency",
      body: "We monitored 12,000 endpoints for the Commonwealth from 2023 to 2025.",
      tags: ["soc"],
    },
  });

  const link = await linkBlock({
    firmId: firm.id,
    timezone: firm.timezone,
    pursuitId: pursuit.id,
    answerBlockId: block.id,
    requirementLabel: "Past performance §4.2",
    linkedByUserId: user.id,
  });
  assert.equal(link.snapshotVersion, 1);
  assert.equal(link.staleWarning, null, "a block reviewed today is not stale");

  await updateBlock({
    firmId: firm.id,
    actorUserId: user.id,
    blockId: block.id,
    block: {
      kind: "past_performance",
      title: "SOC monitoring for a state agency",
      body: "COMPLETELY REWRITTEN for a different client.",
      tags: ["soc"],
    },
  });

  const uses = await listBlockUses(pursuit.id);
  assert.equal(uses.length, 1);
  assert.equal(
    uses[0].use.snapshotBody,
    "We monitored 12,000 endpoints for the Commonwealth from 2023 to 2025.",
    "the pursuit's content is frozen",
  );
  assert.equal(uses[0].block?.version, 2, "the library moved on");
  assert.equal(uses[0].use.snapshotVersion, 1);
  assert.equal(uses[0].drifted, true, "and the pursuit says so rather than hiding it");
});

test("a submitted pursuit is immutable", options, async () => {
  const { firm, user } = await scaffold("immutable");
  const db = getDb();
  const [pursuit] = await db
    .insert(pursuits)
    .values({ firmId: firm.id, title: "Enterprise RFP", stage: "submitted", ownerUserId: user.id })
    .returning();
  const block = await createBlock({
    firmId: firm.id,
    actorUserId: user.id,
    block: { kind: "boilerplate", title: "Company overview", body: "Founded 2011.", tags: [] },
  });
  await assert.rejects(
    () =>
      linkBlock({
        firmId: firm.id,
        timezone: firm.timezone,
        pursuitId: pursuit.id,
        answerBlockId: block.id,
        requirementLabel: "Overview",
        linkedByUserId: user.id,
      }),
    /history now/,
  );
});

test("a recorded no-bid closes the pursuit and keeps its reason", options, async () => {
  const { firm, user } = await scaffold("nobid");
  const db = getDb();
  const [pursuit] = await db
    .insert(pursuits)
    .values({ firmId: firm.id, title: "Statewide staffing RFP", stage: "go_no_go", ownerUserId: user.id })
    .returning();

  const result = await recordDecision({
    firmId: firm.id,
    actorUserId: user.id,
    pursuitId: pursuit.id,
    criteria: [
      { key: "incumbent", score1to5: 1, note: "Incumbent has held it nine years." },
      { key: "vehicle", score1to5: 2, note: "We would have to team." },
      { key: "capacity", score1to5: 2, note: "Two proposals already in flight." },
      { key: "price", score1to5: 1, note: "Lowest price technically acceptable." },
      { key: "relationship", score1to5: 1, note: "No contact." },
    ],
    note: "No-bid: entrenched incumbent, price-only evaluation.",
  });

  assert.equal(result.verdict, "no_go");
  assert.equal(result.pursuit.stage, "no_bid");
  assert.ok(result.pursuit.closedAt, "a no-bid closes then and there");
  assert.match(result.pursuit.outcomeNote ?? "", /entrenched incumbent/);
  assert.ok(result.scorecard.decidedAt);
  assert.equal(result.scorecard.decidedByUserId, user.id);

  // A decided scorecard is permanent.
  await assert.rejects(
    () =>
      recordDecision({
        firmId: firm.id,
        actorUserId: user.id,
        pursuitId: pursuit.id,
        criteria: [{ key: "incumbent", score1to5: 5, note: "changed my mind" }],
      }),
    /decided/,
  );
});

test("the reminder ladder sends each rung exactly once and then stops", options, async () => {
  const { firm, user } = await scaffold("ladder");
  const db = getDb();
  const [pursuit] = await db
    .insert(pursuits)
    .values({ firmId: firm.id, title: "Ladder pursuit", stage: "drafting", ownerUserId: user.id })
    .returning();

  // A proposal due at 17:00 New York time, seven calendar days out.
  const base = new Date("2026-03-12T12:00:00Z");
  const dueAt = new Date("2026-03-19T21:00:00Z");
  const [deadline] = await db
    .insert(deadlines)
    .values({
      firmId: firm.id,
      pursuitId: pursuit.id,
      kind: "proposal",
      label: "Proposal due — Ladder pursuit",
      dueAt,
    })
    .returning();

  const sweeps: Array<{ day: number; sent: number }> = [];
  for (let offsetDays = 9; offsetDays >= 0; offsetDays--) {
    const now = new Date(dueAt.getTime() - offsetDays * 86_400_000);
    if (now < base) continue;
    // Two sweeps the same day, the way an hourly tick would.
    const first = await sweepDeadlineReminders(now, { firmId: firm.id });
    const second = await sweepDeadlineReminders(now, { firmId: firm.id });
    assert.equal(second.sent, 0, `a second sweep on day T-${offsetDays} must send nothing`);
    if (first.sent > 0) sweeps.push({ day: offsetDays, sent: first.sent });
  }

  assert.deepEqual(
    sweeps.map((s) => s.day),
    [7, 3, 1],
    "one send at each rung, on the right day",
  );

  const ledger = await db
    .select()
    .from(reminders)
    .where(eq(reminders.deadlineId, deadline.id));
  assert.equal(ledger.length, 3);
  assert.deepEqual(ledger.map((r) => r.offsetDays).sort(), [1, 3, 7]);

  // Long past due: nothing more, ever.
  for (const days of [1, 5, 30, 212]) {
    const late = await sweepDeadlineReminders(
      new Date(dueAt.getTime() + days * 86_400_000),
      { firmId: firm.id },
    );
    assert.equal(late.sent, 0, `${days} days overdue must not mail anyone`);
  }
});

test("completing a deadline stops its ladder", options, async () => {
  const { firm, user } = await scaffold("stopped");
  const db = getDb();
  const [pursuit] = await db
    .insert(pursuits)
    .values({ firmId: firm.id, title: "Stopped pursuit", stage: "drafting", ownerUserId: user.id })
    .returning();
  const dueAt = new Date("2026-03-19T21:00:00Z");
  await db.insert(deadlines).values({
    firmId: firm.id,
    pursuitId: pursuit.id,
    kind: "proposal",
    label: "Proposal due — Stopped pursuit",
    dueAt,
    completedAt: new Date("2026-03-13T12:00:00Z"),
  });

  const swept = await sweepDeadlineReminders(new Date("2026-03-18T12:00:00Z"), { firmId: firm.id });
  assert.equal(swept.considered, 0, "a completed deadline is not considered at all");
  assert.equal(swept.sent, 0);
});

test("a closed pursuit's deadlines stop reminding", options, async () => {
  const { firm, user } = await scaffold("closedladder");
  const db = getDb();
  const [pursuit] = await db
    .insert(pursuits)
    .values({
      firmId: firm.id,
      title: "No-bid pursuit",
      stage: "no_bid",
      ownerUserId: user.id,
      closedAt: new Date("2026-03-13T12:00:00Z"),
    })
    .returning();
  await db.insert(deadlines).values({
    firmId: firm.id,
    pursuitId: pursuit.id,
    kind: "proposal",
    label: "Proposal due — No-bid pursuit",
    dueAt: new Date("2026-03-19T21:00:00Z"),
  });

  const swept = await sweepDeadlineReminders(new Date("2026-03-18T12:00:00Z"), { firmId: firm.id });
  assert.equal(swept.sent, 0, "nobody is reminded about a tender the firm already declined");
});

test("one morning scan per firm per local day, and the quiet line when empty", options, async () => {
  const { firm } = await scaffold("scan");
  const db = getDb();

  // No matches at all: the scan still sends, with the quiet line.
  const morning = new Date("2026-03-21T11:00:00Z"); // 07:00 in New York
  const first = await sendScan(firm.id, morning);
  assert.equal(first.skipped, false);
  assert.equal(first.email, true);
  assert.equal(first.quiet, true, "silence must be distinguishable from breakage");

  const secondSameDay = await sendScan(firm.id, new Date("2026-03-21T16:00:00Z"));
  assert.equal(secondSameDay.skipped, true, "a second sweep the same local day sends nothing");

  const nextDay = await sendScan(firm.id, new Date("2026-03-22T11:00:00Z"));
  assert.equal(nextDay.skipped, false, "tomorrow is a different scan");

  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.firmId, firm.id), eq(notifications.kind, "morning_scan")));
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.dedupeKey).sort(),
    [
      `morning_scan:${firm.id}:2026-03-21:email`,
      `morning_scan:${firm.id}:2026-03-22:email`,
    ].sort(),
  );
});

test("a match is announced once, not every morning until someone looks", options, async () => {
  // A deliberately singular profile: one phrase that appears in one notice in
  // the whole shared register, so the counts below mean what they say.
  const { source, firm, profile } = await scaffold("announce", {
    keywords: ["quantum-resistant tunnelling"],
    naicsCodes: [],
    pscCodes: [],
    states: [],
    negativeKeywords: [],
    valueBand: null,
  });
  const db = getDb();
  await upsertOpportunity(
    source.id,
    notice({
      externalId: "VA-DGS-26-0499",
      title: "Quantum-Resistant Tunnelling Pilot",
      description: "Section 2. Evaluate quantum-resistant tunnelling across two data centres.",
      responsesDueAt: new Date("2026-04-24T18:00:00Z"),
    }),
  );
  await rescoreProfile(profile.id, { now: new Date("2026-03-20T12:00:00Z") });

  const day1 = await sendScan(firm.id, new Date("2026-03-21T11:00:00Z"));
  assert.equal(day1.quiet, false);
  assert.equal(day1.matchCount, 1);

  const [match] = await db.select().from(matches).where(eq(matches.firmId, firm.id));
  assert.equal(match.state, "new", "still unread — the human has not looked yet");
  assert.ok(match.notifiedAt, "but it has been announced");

  // The bug this pins down: state stays "new" forever, so a scan keyed off state
  // alone re-announces the same tender every morning until the firm mutes it.
  const day2 = await sendScan(firm.id, new Date("2026-03-22T11:00:00Z"));
  assert.equal(day2.matchCount, 0);
  assert.equal(day2.quiet, true);
  const day3 = await sendScan(firm.id, new Date("2026-03-23T11:00:00Z"));
  assert.equal(day3.quiet, true);
});
