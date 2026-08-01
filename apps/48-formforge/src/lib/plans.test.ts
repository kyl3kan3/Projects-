/**
 * Plan gating.
 *
 * The rule under test is the one from ROADMAP.md: being over cap or out of trial
 * blocks a *new send* and nothing else. A practice must never be locked out of
 * reading or exporting its own patient records over a billing state — that would
 * turn a missed invoice into a records-retention failure.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PLANS,
  canExportCsv,
  canCustomiseBranding,
  clinicianCap,
  perClinicianCents,
  planDefinition,
  priceLabel,
  sendGate,
} from "@/lib/plans";

const now = new Date("2026-08-01T12:00:00Z");

describe("plan definitions", () => {
  it("matches the README pricing table", () => {
    assert.deepEqual(
      PLANS.map((p) => [p.id, p.priceCents, p.clinicianCap]),
      [
        ["solo", 4900, 1],
        ["group", 9900, 5],
        ["clinic", 14900, 12],
      ],
    );
    assert.equal(priceLabel("group"), "$99/mo");
    assert.equal(clinicianCap("clinic"), 12);
  });

  it("throws on an unknown plan rather than defaulting to the cheapest", () => {
    // @ts-expect-error deliberately wrong
    assert.throws(() => planDefinition("enterprise"), /Unknown plan/);
  });

  it("computes the per-clinician anchor against per-seat pricing", () => {
    assert.equal(perClinicianCents("group", 4), 2475); // $24.75 vs $29-99 per seat
    assert.equal(perClinicianCents("group", 1), 9900);
    // Over cap, the anchor is computed at the cap, not at the real headcount.
    assert.equal(perClinicianCents("group", 40), perClinicianCents("group", 5));
    assert.equal(perClinicianCents("solo", 0), 4900);
  });

  it("gates branding to Clinic and CSV to Group and up", () => {
    assert.equal(canCustomiseBranding("clinic"), true);
    assert.equal(canCustomiseBranding("group"), false);
    assert.equal(canExportCsv("group"), true);
    assert.equal(canExportCsv("solo"), false);
  });
});

describe("sendGate", () => {
  it("lets a practice inside its trial send", () => {
    const gate = sendGate({
      plan: "solo",
      clinicians: 1,
      trialEndsAt: new Date("2026-08-10T12:00:00Z"),
      subscriptionStatus: null,
      now,
    });
    assert.equal(gate.canSend, true);
    assert.equal(gate.trialDaysLeft, 9);
    assert.equal(gate.reason, null);
  });

  it("blocks new sends when the trial has ended with no subscription", () => {
    const gate = sendGate({
      plan: "solo",
      clinicians: 1,
      trialEndsAt: new Date("2026-07-20T12:00:00Z"),
      subscriptionStatus: null,
      now,
    });
    assert.equal(gate.canSend, false);
    assert.match(gate.reason!, /trial has ended/);
    // The message has to say the records still open, because that is the fear.
    assert.match(gate.reason!, /records stay readable/);
    assert.equal(gate.trialDaysLeft, 0);
  });

  it("lets an active subscription send after the trial date has passed", () => {
    const gate = sendGate({
      plan: "group",
      clinicians: 4,
      trialEndsAt: new Date("2026-07-20T12:00:00Z"),
      subscriptionStatus: "active",
      now,
    });
    assert.equal(gate.canSend, true);
  });

  it("blocks over the clinician cap and says reading is unaffected", () => {
    const gate = sendGate({
      plan: "group",
      clinicians: 6,
      trialEndsAt: null,
      subscriptionStatus: "active",
      now,
    });
    assert.equal(gate.canSend, false);
    assert.match(gate.reason!, /covers 5 clinicians and this practice has 6/);
    assert.match(gate.reason!, /Reading and exporting are unaffected/);
    assert.equal(gate.cap, 5);
  });

  it("allows exactly the cap", () => {
    assert.equal(
      sendGate({ plan: "group", clinicians: 5, trialEndsAt: null, subscriptionStatus: "active", now }).canSend,
      true,
    );
  });

  it("keeps a past_due subscription sending — dunning is not a lockout", () => {
    assert.equal(
      sendGate({ plan: "solo", clinicians: 1, trialEndsAt: null, subscriptionStatus: "past_due", now }).canSend,
      true,
    );
  });

  it("blocks a cancelled or unpaid subscription", () => {
    for (const status of ["canceled", "unpaid"]) {
      const gate = sendGate({ plan: "solo", clinicians: 1, trialEndsAt: null, subscriptionStatus: status, now });
      assert.equal(gate.canSend, false, status);
      assert.match(gate.reason!, /still open/);
    }
  });

  it("puts the cap check ahead of the billing check, so the message is the fixable one", () => {
    const gate = sendGate({
      plan: "solo",
      clinicians: 4,
      trialEndsAt: new Date("2026-07-01T12:00:00Z"),
      subscriptionStatus: null,
      now,
    });
    assert.match(gate.reason!, /clinician/);
  });

  it("uses the singular for a one-clinician cap", () => {
    const gate = sendGate({ plan: "solo", clinicians: 2, trialEndsAt: null, subscriptionStatus: "active", now });
    assert.match(gate.reason!, /covers 1 clinician and/);
  });
});
