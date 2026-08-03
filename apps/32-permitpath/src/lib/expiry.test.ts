/**
 * The expiry ladder is the feature most likely to fail silently in production, so
 * it is the feature with the most tests. Both directions are covered: the ladder
 * that mails forever, and the ladder that fires once and goes quiet.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { escalationRecipients, planRungs, TIER_DAYS } from "./expiry";

const DAY = 86_400_000;
const NOW = new Date("2026-08-03T12:00:00.000Z");

function at(daysFromNow: number): Date {
  return new Date(NOW.getTime() + daysFromNow * DAY);
}

test("a licence 61 days out gets the full T-60/T-30/T-7/T-1 sequence, all scheduled", () => {
  const rungs = planRungs("license", at(61), NOW);
  assert.equal(rungs.length, 4);
  assert.deepEqual(
    rungs.map((r) => r.tier),
    ["t60", "t30", "t7", "t1"],
  );
  assert.ok(rungs.every((r) => r.state === "scheduled"));
  assert.ok(rungs.every((r) => !r.catchUp));
  // Each rung sits exactly its tier's distance before the expiry.
  for (const rung of rungs) {
    assert.equal(rung.scheduledFor.getTime(), at(61).getTime() - TIER_DAYS[rung.tier] * DAY);
  }
});

test("a licence 11 days out fires the tightest crossed rung, not the loosest", () => {
  const rungs = planRungs("license", at(11), NOW);
  const byTier = Object.fromEntries(rungs.map((r) => [r.tier, r]));

  // T-60 is long past: sending it would say "60 days" about something due in 11.
  assert.equal(byTier.t60.state, "skipped");
  // T-30 is the tightest rung already behind us — one catch-up notice, now.
  assert.equal(byTier.t30.state, "scheduled");
  assert.equal(byTier.t30.catchUp, true);
  assert.equal(byTier.t30.scheduledFor.getTime(), NOW.getTime());
  // The rest still run on their own dates.
  assert.equal(byTier.t7.state, "scheduled");
  assert.equal(byTier.t7.catchUp, false);
  assert.equal(byTier.t1.state, "scheduled");
});

test("a licence 2 days out catches up at T-7 and still sends T-1", () => {
  const rungs = planRungs("license", at(2), NOW);
  const byTier = Object.fromEntries(rungs.map((r) => [r.tier, r]));
  assert.equal(byTier.t60.state, "skipped");
  assert.equal(byTier.t30.state, "skipped");
  assert.equal(byTier.t7.state, "scheduled");
  assert.equal(byTier.t7.catchUp, true);
  assert.equal(byTier.t1.state, "scheduled");
  assert.equal(byTier.t1.catchUp, false);
});

test("an already-expired subject schedules nothing — no daily mail forever", () => {
  for (const daysPast of [1, 30, 400]) {
    const rungs = planRungs("license", at(-daysPast), NOW);
    assert.ok(
      rungs.every((r) => r.state === "skipped"),
      `expected every rung skipped ${daysPast} days after expiry`,
    );
  }
});

test("a subject expiring in exactly one day still gets its T-1", () => {
  const rungs = planRungs("license", at(1), NOW);
  const t1 = rungs.find((r) => r.tier === "t1");
  assert.ok(t1);
  assert.equal(t1.state, "scheduled");
  // Exactly at the boundary the rung's own date is now, so it goes out this pass.
  assert.equal(t1.catchUp, true);
});

test("permits start at T-30: their windows are shorter than a licence year", () => {
  const rungs = planRungs("permit_application", at(45), NOW);
  assert.deepEqual(
    rungs.map((r) => r.tier),
    ["t30", "t7", "t1"],
  );
  assert.ok(rungs.every((r) => r.state === "scheduled"));
});

test("escalation adds the owner and cc list only at the tight rungs", () => {
  const input = {
    assignedEmail: "field@ridgelinemechanical.com",
    ownerEmail: "owner@ridgelinemechanical.com",
    ccEmails: ["office@ridgelinemechanical.com"],
  };
  assert.deepEqual(escalationRecipients("t60", input), ["field@ridgelinemechanical.com"]);
  assert.deepEqual(escalationRecipients("t30", input), ["field@ridgelinemechanical.com"]);
  assert.deepEqual(escalationRecipients("t7", input), [
    "field@ridgelinemechanical.com",
    "owner@ridgelinemechanical.com",
    "office@ridgelinemechanical.com",
  ]);
  assert.deepEqual(escalationRecipients("t1", input), [
    "field@ridgelinemechanical.com",
    "owner@ridgelinemechanical.com",
    "office@ridgelinemechanical.com",
  ]);
});

test("an unassigned subject escalates to the owner without duplicating them", () => {
  const recipients = escalationRecipients("t7", {
    assignedEmail: null,
    ownerEmail: "owner@ridgelinemechanical.com",
  });
  assert.deepEqual(recipients, ["owner@ridgelinemechanical.com"]);
});

test("renewal produces a fresh ladder against the new date", () => {
  // What the licence looked like the day before it lapsed...
  const before = planRungs("license", at(1), NOW);
  assert.ok(before.find((r) => r.tier === "t1")?.state === "scheduled");
  // ...and after a two-year renewal: every rung is in the future again.
  const after = planRungs("license", at(730), NOW);
  assert.ok(after.every((r) => r.state === "scheduled" && !r.catchUp));
  assert.ok(after.every((r) => r.scheduledFor.getTime() > NOW.getTime()));
});
