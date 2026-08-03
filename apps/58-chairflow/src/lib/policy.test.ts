import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  cancellationOutcome,
  computeFee,
  defaultPolicyText,
  depositFor,
  feeMetadata,
  parseDepositRule,
  policySummary,
  type PolicyTerms,
} from "@/lib/policy";

const STANDARD: PolicyTerms = {
  version: 1,
  cancelWindowHours: 24,
  lateCancelFeePercent: 25,
  noShowFeePercent: 50,
};

test("deposit rules resolve to cents, capped at the service price", () => {
  assert.equal(depositFor({ kind: "none" }, 4500), 0);
  assert.equal(depositFor({ kind: "flat", cents: 2000 }, 4500), 2000);
  assert.equal(depositFor({ kind: "percent", percent: 20 }, 4500), 900);
  // A rule that would exceed the price is a prepaid service, not a windfall.
  assert.equal(depositFor({ kind: "flat", cents: 9000 }, 4500), 4500);
  assert.equal(depositFor({ kind: "percent", percent: 100 }, 4500), 4500);
});

test("percent deposits round to whole cents once", () => {
  // 33% of $45.05 = 1486.65 cents. One rounding, at the edge.
  assert.equal(depositFor({ kind: "percent", percent: 33 }, 4505), 1487);
});

test("deposit rule parsing rejects nonsense and defaults to none", () => {
  assert.deepEqual(parseDepositRule(null), { kind: "none" });
  assert.deepEqual(parseDepositRule({ kind: "flat" }), { kind: "none" });
  assert.deepEqual(parseDepositRule({ kind: "flat", cents: 0 }), { kind: "none" });
  assert.deepEqual(parseDepositRule({ kind: "percent", percent: 250 }), {
    kind: "percent",
    percent: 100,
  });
  assert.deepEqual(parseDepositRule({ kind: "flat", cents: 1500.4 }), {
    kind: "flat",
    cents: 1500,
  });
});

test("the DESIGN.md worked example: $45 service, 50% no-show, $10 deposit", () => {
  const fee = computeFee({
    priceCents: 4500,
    depositCents: 1000,
    terms: STANDARD,
    kind: "no_show_fee",
  });
  assert.equal(fee.feeCents, 2250);
  assert.equal(fee.depositAppliedCents, 1000);
  assert.equal(fee.chargeCents, 1250);
  assert.equal(fee.depositRefundCents, 0);
});

test("a deposit larger than the fee leaves money owed back, not kept", () => {
  const fee = computeFee({
    priceCents: 4000,
    depositCents: 3000,
    terms: STANDARD,
    kind: "late_cancel_fee",
  });
  assert.equal(fee.feeCents, 1000);
  assert.equal(fee.depositAppliedCents, 1000);
  assert.equal(fee.chargeCents, 0, "nothing more to charge");
  assert.equal(fee.depositRefundCents, 2000, "the excess is owed back to the client");
});

test("a zero-percent rung produces no fee at all", () => {
  const gentle: PolicyTerms = { ...STANDARD, lateCancelFeePercent: 0 };
  const fee = computeFee({
    priceCents: 8000,
    depositCents: 0,
    terms: gentle,
    kind: "late_cancel_fee",
  });
  assert.equal(fee.feeCents, 0);
  assert.equal(fee.chargeCents, 0);
});

test("the fee is rounded once, so half-cents cannot compound", () => {
  // 25% of $45.01 = 1125.25 cents.
  const fee = computeFee({
    priceCents: 4501,
    depositCents: 0,
    terms: STANDARD,
    kind: "late_cancel_fee",
  });
  assert.equal(fee.feeCents, 1125);
  assert.equal(Number.isInteger(fee.feeCents), true);
  assert.equal(Number.isInteger(fee.chargeCents), true);
});

test("a fee is computed from the agreed policy version, not today's", () => {
  const agreed: PolicyTerms = { ...STANDARD, version: 3, noShowFeePercent: 25 };
  const fee = computeFee({
    priceCents: 6000,
    depositCents: 0,
    terms: agreed,
    kind: "no_show_fee",
  });
  assert.equal(fee.policyVersion, 3);
  assert.equal(fee.feeCents, 1500, "25% because that is what the client agreed to");
});

test("a percent above 100 or below 0 cannot escape the fee math", () => {
  const broken: PolicyTerms = { ...STANDARD, noShowFeePercent: 400 };
  const high = computeFee({
    priceCents: 5000,
    depositCents: 0,
    terms: broken,
    kind: "no_show_fee",
  });
  assert.equal(high.feeCents, 5000, "capped at the service price");
  const negative = computeFee({
    priceCents: 5000,
    depositCents: 0,
    terms: { ...STANDARD, noShowFeePercent: -30 },
    kind: "no_show_fee",
  });
  assert.equal(negative.feeCents, 0);
});

test("the cancellation window is measured from the appointment, boundary inclusive", () => {
  const startsAt = new Date("2026-08-06T18:00:00.000Z");
  const dayBefore = new Date("2026-08-05T12:00:00.000Z");
  assert.equal(
    cancellationOutcome({ startsAt, now: dayBefore, cancelWindowHours: 24 }),
    "free",
  );
  // Exactly 24h out: the client who read the policy and acted on it wins.
  assert.equal(
    cancellationOutcome({
      startsAt,
      now: new Date("2026-08-05T18:00:00.000Z"),
      cancelWindowHours: 24,
    }),
    "free",
  );
  assert.equal(
    cancellationOutcome({
      startsAt,
      now: new Date("2026-08-05T18:00:01.000Z"),
      cancelWindowHours: 24,
    }),
    "late_cancel",
  );
  assert.equal(
    cancellationOutcome({
      startsAt,
      now: new Date("2026-08-06T17:00:00.000Z"),
      cancelWindowHours: 24,
    }),
    "late_cancel",
  );
});

test("policy prose states the numbers it is generated from", () => {
  const text = defaultPolicyText({
    cancelWindowHours: 48,
    lateCancelFeePercent: 50,
    noShowFeePercent: 100,
  });
  assert.match(text, /48 hours/);
  assert.match(text, /50%/);
  assert.match(text, /100%/);
  assert.equal(
    policySummary({ ...STANDARD, lateCancelFeePercent: 0 }),
    "Cancel free until 24h before. No-show 50%.",
  );
});

test("fee metadata carries the whole dispute answer", () => {
  const computation = computeFee({
    priceCents: 4500,
    depositCents: 1000,
    terms: STANDARD,
    kind: "no_show_fee",
  });
  const meta = feeMetadata({
    appointmentId: "appt-1",
    clientName: "Marcus Ollet",
    serviceName: "Skin fade",
    startsAtIso: "2026-08-06T22:00:00.000Z",
    policyVersion: 1,
    policyAgreedAtIso: "2026-06-12T14:03:00.000Z",
    computation,
  });
  assert.equal(meta.chairflow_policy_version, "1");
  assert.equal(meta.chairflow_policy_agreed_at, "2026-06-12T14:03:00.000Z");
  assert.equal(meta.chairflow_fee_cents, "2250");
  assert.equal(meta.chairflow_deposit_applied_cents, "1000");
  // Every value must be a string: Stripe metadata rejects anything else.
  for (const value of Object.values(meta)) assert.equal(typeof value, "string");
});
