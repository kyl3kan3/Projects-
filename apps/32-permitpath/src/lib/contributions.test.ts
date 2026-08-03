/**
 * Contribution validation and triage. A crowdsourcing loop that pays cash needs a
 * hard edge: structured proposals only, evidence required, and the fee corrections
 * at the front of the queue.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  contributionImpact,
  contributionSummary,
  proposedChangesSchema,
} from "./contributions";

test("a structured fee correction validates", () => {
  const parsed = proposedChangesSchema.safeParse({
    fees: [{ label: "Plumbing permit fee", amountCents: 6_000, notes: "Counter receipt 6/12" }],
  });
  assert.equal(parsed.success, true);
});

test("an empty proposal is refused with a usable message", () => {
  const parsed = proposedChangesSchema.safeParse({});
  assert.equal(parsed.success, false);
  assert.match(parsed.error?.issues[0]?.message ?? "", /at least one thing/);
});

test("fees must be integer cents — no floats sneaking into money", () => {
  const parsed = proposedChangesSchema.safeParse({
    fees: [{ label: "Plumbing permit fee", amountCents: 60.5 }],
  });
  assert.equal(parsed.success, false);
});

test("unknown keys are dropped rather than trusted", () => {
  const parsed = proposedChangesSchema.safeParse({
    quirks: "Counter now asks for the gas isometric on every tankless conversion.",
    permitValidDays: 999,
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(Object.keys(parsed.data ?? {}), ["quirks"]);
});

test("triage puts money and permits ahead of process, and process ahead of wording", () => {
  assert.equal(contributionImpact({ fees: [{ label: "Fee", amountCents: 100 }] }), "fee_or_permit");
  assert.equal(contributionImpact({ permitsRequired: ["Mechanical permit"] }), "fee_or_permit");
  assert.equal(contributionImpact({ reviewTimeline: "3 business days" }), "process");
  assert.equal(
    contributionImpact({
      submittalRequirements: [{ title: "Load calc", detail: "Above 5 tons", required: true }],
    }),
    "process",
  );
  assert.equal(contributionImpact({ quirks: "Friday counter closes at noon." }), "wording");
  assert.equal(contributionImpact({ inspectionLeadTimeDays: 2 }), "wording");
});

test("the version-history summary says what the contributor changed", () => {
  assert.equal(
    contributionSummary({ fees: [{ label: "Fee", amountCents: 100 }], quirks: "New note" }),
    "Contributor correction: fee schedule corrected, local quirk added",
  );
  assert.equal(
    contributionSummary({ inspectionLeadTimeDays: 3 }),
    "Contributor correction: inspection scheduling notes updated",
  );
});
