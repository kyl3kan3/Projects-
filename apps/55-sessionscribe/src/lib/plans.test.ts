/**
 * Plans, the meter, and read-only mode. These are the decisions that decide
 * whether a clinician can work, so the tests are the boundaries: the last day of
 * a trial, note 40 against note 41, a failed payment inside and outside its grace
 * window, and a cancelled subscription with signed notes that must stay
 * exportable.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCapture,
  canUseModality,
  entitlement,
  GRACE_DAYS,
  meter,
  PLANS,
  TRIAL_DAYS,
  type BillingFacts,
} from "@/lib/plans";

const NOW = new Date("2026-07-17T15:00:00.000Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const solo: BillingFacts = {
  plan: "solo",
  trialEndsAt: null,
  stripeSubscriptionId: "sub_1",
  billingState: "active",
};

describe("published prices and limits", () => {
  it("matches the README's pricing table", () => {
    assert.equal(PLANS.solo.priceCents, 3900);
    assert.equal(PLANS.solo.noteLimit, 40);
    assert.equal(PLANS.caseload.priceCents, 6900);
    assert.equal(PLANS.caseload.noteLimit, null);
    assert.equal(PLANS.group.priceCents, 9900);
    assert.equal(PLANS.group.minSeats, 2);
    assert.equal(TRIAL_DAYS, 14);
  });
});

describe("the trial is the product, not a teaser", () => {
  it("unlocks every feature while it runs", () => {
    const ent = entitlement({ ...solo, trialEndsAt: days(3), stripeSubscriptionId: null }, NOW);
    assert.equal(ent.state, "trialing");
    assert.equal(ent.noteLimit, null, "no meter during the trial");
    assert.equal(ent.modalityTemplates, true);
    assert.equal(ent.amendments, true);
    assert.equal(ent.readOnly, false);
  });

  it("warns in the last three days and not before", () => {
    assert.ok(entitlement({ ...solo, trialEndsAt: days(2) }, NOW).notice);
    assert.equal(entitlement({ ...solo, trialEndsAt: days(9) }, NOW).notice, null);
  });

  it("falls back to the plan's own limits the moment it ends", () => {
    const ent = entitlement(
      { plan: "solo", trialEndsAt: days(-1), stripeSubscriptionId: null },
      NOW,
    );
    assert.equal(ent.state, "canceled");
    assert.equal(ent.readOnly, true);
    assert.match(ent.notice ?? "", /remain readable and exportable/);
  });
});

describe("the Solo meter", () => {
  it("counts to the limit and refuses the note after it", () => {
    const ent = entitlement(solo, NOW);
    assert.equal(canCapture(ent, 39).allowed, true);
    const at40 = canCapture(ent, 40);
    assert.equal(at40.allowed, false, "note 41 is the one that is refused");
    assert.equal(at40.reason, "note_limit");
    assert.match(at40.message ?? "", /Upgrade to Caseload/);
    assert.match(at40.message ?? "", /already have stays reviewable/);
  });

  it("labels the meter and flags the last five notes", () => {
    assert.equal(meter(35, 40).nearLimit, true);
    assert.equal(meter(34, 40).nearLimit, false);
    assert.equal(meter(41, 40).remaining, 0);
    assert.equal(meter(12, null).label, "12 notes this period · unlimited");
    assert.equal(meter(1, null).label, "1 note this period · unlimited");
  });

  it("never meters an unlimited plan", () => {
    const ent = entitlement({ ...solo, plan: "caseload" }, NOW);
    assert.equal(canCapture(ent, 4_000).allowed, true);
  });
});

describe("a failed payment", () => {
  const pastDue: BillingFacts = {
    ...solo,
    billingState: "past_due",
    graceEndsAt: days(GRACE_DAYS),
  };

  it("does not lock anything inside the grace window", () => {
    const ent = entitlement(pastDue, NOW);
    assert.equal(ent.state, "past_due");
    assert.equal(ent.readOnly, false);
    assert.match(ent.notice ?? "", /Nothing is locked yet/);
    assert.equal(canCapture(ent, 3).allowed, true);
  });

  it("pauses capture once the stamped date passes", () => {
    const ent = entitlement({ ...pastDue, graceEndsAt: days(-1) }, NOW);
    assert.equal(ent.readOnly, true);
    const gate = canCapture(ent, 3);
    assert.equal(gate.allowed, false);
    assert.equal(gate.reason, "read_only");
    assert.match(gate.message ?? "", /reviewable, signable and exportable/);
  });

  it("uses the stamped date rather than recomputing, so it cannot drift", () => {
    // The same facts a week later must still resolve against the same deadline.
    const later = new Date(NOW.getTime() + 7 * 86_400_000);
    const stamped = { ...pastDue, graceEndsAt: days(3) };
    assert.equal(entitlement(stamped, NOW).readOnly, false);
    assert.equal(entitlement(stamped, later).readOnly, true);
  });
});

describe("modality templates are a plan feature", () => {
  it("gates them on Solo and allows general always", () => {
    const soloEnt = entitlement(solo, NOW);
    assert.equal(canUseModality(soloEnt, "general"), true);
    assert.equal(canUseModality(soloEnt, "emdr"), false);
  });

  it("allows them on Caseload and during the trial", () => {
    assert.equal(canUseModality(entitlement({ ...solo, plan: "caseload" }, NOW), "emdr"), true);
    assert.equal(
      canUseModality(entitlement({ ...solo, trialEndsAt: days(5) }, NOW), "couples"),
      true,
    );
  });
});
