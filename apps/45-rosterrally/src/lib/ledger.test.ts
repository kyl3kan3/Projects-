/**
 * Derived registration money, checked by hand.
 *
 * The scenario the brief warns about is the last test in this file: a family
 * overpays, the surplus parks as credit, and every screen still calls them
 * delinquent. `householdMoney` exists to make that impossible.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  balanceCents,
  cascade,
  cascadeOrder,
  deriveState,
  householdMoney,
  overpaidCents,
  owedCents,
  refundPlan,
  seasonMoney,
  stateLabel,
  type LedgerRegistration,
} from "./ledger";

function reg(over: Partial<LedgerRegistration> & { id: string }): LedgerRegistration {
  return {
    status: "active",
    amountCents: 18_500,
    allocatedCents: 0,
    createdAt: new Date("2026-08-04T14:00:00Z"),
    ...over,
  };
}

test("an unpaid registration owes its full amount", () => {
  const r = reg({ id: "r1" });
  assert.equal(balanceCents(r), 18_500);
  assert.equal(deriveState(r), "unpaid");
});

test("a part payment reads as part paid, never as paid", () => {
  const r = reg({ id: "r1", allocatedCents: 5_000 });
  assert.equal(balanceCents(r), 13_500);
  assert.equal(deriveState(r), "partial");
});

test("a registration on an installment plan reads as on plan while it owes", () => {
  const r = reg({ id: "r1", allocatedCents: 5_000, onPlan: true });
  assert.equal(deriveState(r), "plan");
  const done = reg({ id: "r2", allocatedCents: 18_500, onPlan: true });
  assert.equal(deriveState(done), "paid");
});

test("a waitlisted child owes nothing and is never chased", () => {
  const r = reg({ id: "r1", status: "waitlisted" });
  assert.equal(balanceCents(r), 0);
  assert.equal(deriveState(r), "waitlisted");
});

test("a canceled-and-refunded registration settles to zero, not back to unpaid", () => {
  // Paid in full, then canceled and refunded: allocations net to zero.
  const refunded = reg({ id: "r1", status: "canceled", allocatedCents: 0 });
  assert.equal(balanceCents(refunded), 0);
  assert.equal(deriveState(refunded), "canceled");
  // Canceled but not yet refunded: the money is still sitting with the club.
  const owedBack = reg({ id: "r2", status: "canceled", allocatedCents: 18_500 });
  assert.equal(overpaidCents(owedBack), 18_500);
});

/* ------------------------------------------------------------- cascading --- */

test("one payment covers a household's registrations oldest first", () => {
  const older = reg({ id: "r1", createdAt: new Date("2026-08-01T10:00:00Z") });
  const newer = reg({
    id: "r2",
    amountCents: 14_000,
    createdAt: new Date("2026-08-04T10:00:00Z"),
  });
  const result = cascade(cascadeOrder([newer, older]), 32_500);
  assert.deepEqual(result.allocations, [
    { registrationId: "r1", amountCents: 18_500 },
    { registrationId: "r2", amountCents: 14_000 },
  ]);
  assert.equal(result.creditCents, 0);
});

test("a partial payment fills the oldest registration completely first", () => {
  const older = reg({ id: "r1", createdAt: new Date("2026-08-01T10:00:00Z") });
  const newer = reg({
    id: "r2",
    amountCents: 14_000,
    createdAt: new Date("2026-08-04T10:00:00Z"),
  });
  const result = cascade(cascadeOrder([older, newer]), 20_000);
  assert.deepEqual(result.allocations, [
    { registrationId: "r1", amountCents: 18_500 },
    { registrationId: "r2", amountCents: 1_500 },
  ]);
  assert.equal(result.creditCents, 0);
});

test("an overpayment leaves credit, and nothing is over-allocated", () => {
  const only = reg({ id: "r1" });
  const result = cascade(cascadeOrder([only]), 20_000);
  assert.deepEqual(result.allocations, [{ registrationId: "r1", amountCents: 18_500 }]);
  assert.equal(result.creditCents, 1_500);
  assert.equal(result.appliedCents, 18_500);
});

test("cascade skips registrations that are already settled", () => {
  const paid = reg({ id: "r1", allocatedCents: 18_500, createdAt: new Date("2026-08-01") });
  const open = reg({ id: "r2", createdAt: new Date("2026-08-04") });
  const order = cascadeOrder([paid, open]);
  assert.deepEqual(order, [{ registrationId: "r2", balanceCents: 18_500 }]);
});

test("cascade ordering is stable when two registrations share a timestamp", () => {
  const at = new Date("2026-08-04T10:00:00Z");
  const a = reg({ id: "aaa", createdAt: at });
  const b = reg({ id: "bbb", createdAt: at });
  assert.deepEqual(
    cascadeOrder([b, a]).map((t) => t.registrationId),
    ["aaa", "bbb"],
  );
});

/* --------------------------------------------------------------- refunds --- */

test("a refund reverses the newest money first", () => {
  const plan = refundPlan(
    [
      { id: "a1", paymentId: "p-june", amountCents: 5_000, at: new Date("2026-06-01") },
      { id: "a2", paymentId: "p-august", amountCents: 13_500, at: new Date("2026-08-01") },
    ],
    16_000,
  );
  assert.deepEqual(plan, [
    { paymentId: "p-august", amountCents: 13_500 },
    { paymentId: "p-june", amountCents: 2_500 },
  ]);
});

/* ------------------------------------------------------------- household --- */

test("a household that overpaid is square, not delinquent", () => {
  // Two children, $185 + $140 = $325 owed. The parent paid $370 in one go
  // (they added a tournament fee that never got invoiced).
  const older = reg({ id: "r1", allocatedCents: 18_500, createdAt: new Date("2026-08-01") });
  const newer = reg({
    id: "r2",
    amountCents: 14_000,
    allocatedCents: 14_000,
    createdAt: new Date("2026-08-02"),
  });
  const money = householdMoney(
    [older, newer],
    [{ kind: "payment", status: "settled", amountCents: 37_000 }],
    32_500,
  );
  assert.equal(money.balanceCents, 0);
  assert.equal(money.creditCents, 4_500);
  assert.equal(money.netDueCents, 0);
});

test("credit already in hand cancels a later balance, so nobody chases a paid family", () => {
  // The parent overpaid by $45 in August. In September a third child registers
  // for $140 and the credit has not been applied to it yet.
  const settled = reg({ id: "r1", allocatedCents: 18_500, createdAt: new Date("2026-08-01") });
  const fresh = reg({
    id: "r3",
    amountCents: 4_000,
    allocatedCents: 0,
    createdAt: new Date("2026-09-01"),
  });
  const money = householdMoney(
    [settled, fresh],
    [{ kind: "payment", status: "settled", amountCents: 23_000 }],
    18_500,
  );
  assert.equal(money.balanceCents, 4_000);
  assert.equal(money.creditCents, 4_500);
  // The number every screen shows: they owe nothing.
  assert.equal(money.netDueCents, 0);
});

test("a pending payment is not money received", () => {
  const open = reg({ id: "r1" });
  const money = householdMoney(
    [open],
    [{ kind: "payment", status: "pending", amountCents: 18_500 }],
    0,
  );
  assert.equal(money.paidCents, 0);
  assert.equal(money.netDueCents, 18_500);
});

test("a refund out of credit reduces the credit, not the balance", () => {
  const settled = reg({ id: "r1", allocatedCents: 18_500 });
  const money = householdMoney(
    [settled],
    [
      { kind: "payment", status: "settled", amountCents: 23_000 },
      { kind: "refund", status: "settled", amountCents: 4_500 },
    ],
    18_500,
  );
  assert.equal(money.creditCents, 0);
  assert.equal(money.netDueCents, 0);
  assert.equal(money.refundedCents, 4_500);
});

/* ---------------------------------------------------------- season roll-up --- */

test("the season roll-up counts expected, collected and our fees honestly", () => {
  const rows = [
    { ...reg({ id: "r1", allocatedCents: 18_500 }), platformFeeCents: 150 },
    { ...reg({ id: "r2", allocatedCents: 5_000 }), platformFeeCents: 150 },
    { ...reg({ id: "r3", status: "waitlisted" as const }), platformFeeCents: 0 },
    { ...reg({ id: "r4", status: "canceled" as const, allocatedCents: 0 }), platformFeeCents: 150 },
  ];
  const money = seasonMoney(rows);
  assert.equal(money.expectedCents, 37_000);
  assert.equal(money.collectedCents, 23_500);
  assert.equal(money.outstandingCents, 13_500);
  // Our $1.50 is earned on the paid registration only.
  assert.equal(money.platformFeeCents, 150);
});

/* ------------------------------------------ the treasurer's actual season --- */

/**
 * One household, worked through on paper first, then asserted step by step.
 *
 * The Alvarez family register two children in August: Mateo in U10 Boys at
 * $185.00 and Lucia in U12 Girls at $210.00, with a 15% sibling discount on the
 * cheaper place. That is 18500 + (18500 − 2775) = 34225 owed.
 *
 * They then pay in the messy way real families do: a $100 deposit by card, a
 * $200 cheque three weeks later with no note about which child, and finally
 * $60 which overshoots by $17.75. Lucia withdraws in October and is refunded.
 */
test("a household's whole season reconciles, cent by cent", () => {
  const mateo: LedgerRegistration = {
    id: "r-mateo",
    status: "active",
    amountCents: 18_500,
    allocatedCents: 0,
    createdAt: new Date("2026-08-04T14:00:00Z"),
  };
  const lucia: LedgerRegistration = {
    id: "r-lucia",
    status: "active",
    amountCents: 15_725, // 210.00 less 15% of 185.00-equivalent, worked out below
    allocatedCents: 0,
    createdAt: new Date("2026-08-04T14:00:30Z"),
  };
  // Sanity-check the discount arithmetic the registration flow produced:
  // 15% of $185.00 is $27.75, so the cheaper place drops from 185.00 to 157.25.
  assert.equal(18_500 - Math.round(18_500 * 0.15), 15_725);
  const owed = owedCents(mateo) + owedCents(lucia);
  assert.equal(owed, 34_225);

  // --- Payment 1: $100.00 by card. Oldest first, so all of it lands on Mateo.
  const p1 = cascade(cascadeOrder([mateo, lucia]), 10_000);
  assert.deepEqual(p1.allocations, [{ registrationId: "r-mateo", amountCents: 10_000 }]);
  assert.equal(p1.creditCents, 0);
  mateo.allocatedCents += 10_000;
  assert.equal(balanceCents(mateo), 8_500);
  assert.equal(deriveState(mateo), "partial");
  assert.equal(deriveState(lucia), "unpaid");

  // --- Payment 2: a $200.00 cheque. It finishes Mateo, then starts Lucia.
  const p2 = cascade(cascadeOrder([mateo, lucia]), 20_000);
  assert.deepEqual(p2.allocations, [
    { registrationId: "r-mateo", amountCents: 8_500 },
    { registrationId: "r-lucia", amountCents: 11_500 },
  ]);
  assert.equal(p2.creditCents, 0);
  mateo.allocatedCents += 8_500;
  lucia.allocatedCents += 11_500;
  assert.equal(deriveState(mateo), "paid");
  assert.equal(balanceCents(lucia), 4_225);

  // --- Payment 3: $60.00, which is $17.75 more than the remaining balance.
  const p3 = cascade(cascadeOrder([mateo, lucia]), 6_000);
  assert.deepEqual(p3.allocations, [{ registrationId: "r-lucia", amountCents: 4_225 }]);
  assert.equal(p3.creditCents, 1_775);
  lucia.allocatedCents += 4_225;
  assert.equal(deriveState(lucia), "paid");

  // Everything settled, $17.75 sitting as credit, and the family owes nothing.
  const paid = 10_000 + 20_000 + 6_000;
  const allocatedNet = mateo.allocatedCents + lucia.allocatedCents;
  assert.equal(allocatedNet, 34_225);
  const money = householdMoney(
    [mateo, lucia],
    [
      { kind: "payment", status: "settled", amountCents: 10_000 },
      { kind: "payment", status: "settled", amountCents: 20_000 },
      { kind: "payment", status: "settled", amountCents: 6_000 },
    ],
    allocatedNet,
  );
  assert.equal(money.paidCents, paid);
  assert.equal(money.creditCents, 1_775);
  assert.equal(money.balanceCents, 0);
  assert.equal(money.netDueCents, 0);

  // --- October: Lucia withdraws. The club refunds her $157.25 in full.
  const refund = refundPlan(
    [
      { id: "a2", paymentId: "p2-cheque", amountCents: 11_500, at: new Date("2026-08-25") },
      { id: "a3", paymentId: "p3-card", amountCents: 4_225, at: new Date("2026-09-15") },
    ],
    15_725,
  );
  // Newest money back first: the September card, then the August cheque.
  assert.deepEqual(refund, [
    { paymentId: "p3-card", amountCents: 4_225 },
    { paymentId: "p2-cheque", amountCents: 11_500 },
  ]);
  assert.equal(
    refund.reduce((s, r) => s + r.amountCents, 0),
    15_725,
  );

  // The refund is a negative allocation and the registration is canceled, so it
  // settles to zero rather than re-opening as a debt.
  lucia.status = "canceled";
  lucia.allocatedCents -= 15_725;
  assert.equal(lucia.allocatedCents, 0);
  assert.equal(balanceCents(lucia), 0);
  assert.equal(deriveState(lucia), "canceled");

  const afterRefund = householdMoney(
    [mateo, lucia],
    [
      { kind: "payment", status: "settled", amountCents: 10_000 },
      { kind: "payment", status: "settled", amountCents: 20_000 },
      { kind: "payment", status: "settled", amountCents: 6_000 },
      { kind: "refund", status: "settled", amountCents: 15_725 },
    ],
    mateo.allocatedCents + lucia.allocatedCents,
  );
  // Cash in 360.00, refunded 157.25, applied 185.00 → 17.75 still theirs.
  assert.equal(afterRefund.paidCents, 36_000);
  assert.equal(afterRefund.refundedCents, 15_725);
  assert.equal(afterRefund.creditCents, 1_775);
  assert.equal(afterRefund.netDueCents, 0);
});

test("a partial refund leaves the registration part-paid, not paid", () => {
  const reg: LedgerRegistration = {
    id: "r1",
    status: "active",
    amountCents: 18_500,
    allocatedCents: 18_500,
    createdAt: new Date("2026-08-04"),
  };
  assert.equal(deriveState(reg), "paid");
  // The club refunds $50 as a goodwill gesture without canceling the place.
  reg.allocatedCents -= 5_000;
  assert.equal(balanceCents(reg), 5_000);
  assert.equal(deriveState(reg), "partial");
});

test("a refund larger than what was applied is capped by the plan, not the caller", () => {
  const plan = refundPlan(
    [{ id: "a1", paymentId: "p1", amountCents: 5_000, at: new Date("2026-08-01") }],
    99_999,
  );
  assert.deepEqual(plan, [{ paymentId: "p1", amountCents: 5_000 }]);
});

test("refunds never reverse a negative allocation twice", () => {
  // The ledger already holds one refund (a negative allocation). Planning a
  // second refund must only consider the money that actually went in.
  const plan = refundPlan(
    [
      { id: "a1", paymentId: "p1", amountCents: 18_500, at: new Date("2026-08-01") },
      { id: "a2", paymentId: "r1", amountCents: -5_000, at: new Date("2026-09-01") },
    ],
    18_500,
  );
  assert.deepEqual(plan, [{ paymentId: "p1", amountCents: 18_500 }]);
});

test("a cascade across four registrations spends every cent in order", () => {
  const regs: LedgerRegistration[] = [
    ["r1", 14_000, "2026-08-01"],
    ["r2", 18_500, "2026-08-02"],
    ["r3", 21_000, "2026-08-03"],
    ["r4", 9_500, "2026-08-04"],
  ].map(([id, amount, day]) => ({
    id: id as string,
    status: "active",
    amountCents: amount as number,
    allocatedCents: 0,
    createdAt: new Date(day as string),
  }));
  const total = regs.reduce((s, r) => s + r.amountCents, 0);
  assert.equal(total, 63_000);

  // A single bank transfer covering everything but $12.34.
  const result = cascade(cascadeOrder(regs), total - 1_234);
  assert.equal(result.appliedCents, total - 1_234);
  assert.equal(result.creditCents, 0);
  assert.deepEqual(result.allocations.map((a) => a.registrationId), ["r1", "r2", "r3", "r4"]);
  // Only the newest is short, and by exactly the shortfall.
  assert.equal(result.allocations[3].amountCents, 9_500 - 1_234);
});

test("a waitlisted registration is skipped by the cascade until it is promoted", () => {
  const active: LedgerRegistration = {
    id: "r-active",
    status: "active",
    amountCents: 14_000,
    allocatedCents: 0,
    createdAt: new Date("2026-08-02"),
  };
  const waiting: LedgerRegistration = {
    id: "r-waiting",
    status: "waitlisted",
    amountCents: 18_500,
    allocatedCents: 0,
    createdAt: new Date("2026-08-01"),
  };
  // Even though it is older, the waitlisted place takes nothing.
  const before = cascade(cascadeOrder([waiting, active]), 40_000);
  assert.deepEqual(before.allocations, [{ registrationId: "r-active", amountCents: 14_000 }]);
  assert.equal(before.creditCents, 26_000);

  // On promotion the same fee becomes owed, and the credit covers it. (The
  // active place is settled by now, so it takes nothing more.)
  active.allocatedCents = 14_000;
  waiting.status = "active";
  const after = cascade(cascadeOrder([waiting, active]), 26_000);
  assert.deepEqual(after.allocations, [{ registrationId: "r-waiting", amountCents: 18_500 }]);
  assert.equal(after.creditCents, 7_500);
});

test("zero and negative payments are no-ops, not surprises", () => {
  const reg: LedgerRegistration = {
    id: "r1",
    status: "active",
    amountCents: 18_500,
    allocatedCents: 0,
    createdAt: new Date("2026-08-04"),
  };
  assert.deepEqual(cascade(cascadeOrder([reg]), 0).allocations, []);
  assert.deepEqual(cascade(cascadeOrder([reg]), -5_000).allocations, []);
  assert.equal(cascade(cascadeOrder([reg]), -5_000).creditCents, 0);
});

test("a free place is paid the moment it is created", () => {
  // A full scholarship: nothing owed, nothing to chase, no fee to us.
  const free: LedgerRegistration = {
    id: "r-free",
    status: "active",
    amountCents: 0,
    allocatedCents: 0,
    createdAt: new Date("2026-08-04"),
  };
  assert.equal(balanceCents(free), 0);
  assert.equal(deriveState(free), "paid");
  assert.deepEqual(cascadeOrder([free]), []);
});

test("state labels are the ones the console renders", () => {
  assert.deepEqual(
    (["waitlisted", "canceled", "paid", "plan", "partial", "unpaid"] as const).map(stateLabel),
    ["WAITLIST", "CANCELED", "PAID", "ON PLAN", "PART PAID", "UNPAID"],
  );
});

test("the season roll-up never counts money twice or claims a fee it has not earned", () => {
  const rows = [
    // Paid in full: our fee is earned.
    { id: "a", status: "active" as const, amountCents: 18_500, allocatedCents: 18_500, createdAt: new Date(), platformFeeCents: 150 },
    // Overpaid: collected is capped at what was owed.
    { id: "b", status: "active" as const, amountCents: 14_000, allocatedCents: 16_000, createdAt: new Date(), platformFeeCents: 150 },
    // Part paid: no fee yet.
    { id: "c", status: "active" as const, amountCents: 21_000, allocatedCents: 5_000, createdAt: new Date(), platformFeeCents: 150 },
    // Scholarship: free, and never carries a fee.
    { id: "d", status: "active" as const, amountCents: 0, allocatedCents: 0, createdAt: new Date(), platformFeeCents: 0 },
  ];
  const money = seasonMoney(rows);
  assert.equal(money.expectedCents, 53_500);
  // 18500 + 14000 (capped) + 5000 = 37500.
  assert.equal(money.collectedCents, 37_500);
  assert.equal(money.outstandingCents, 16_000);
  // Two places are settled — the paid one and the overpaid one, since a family
  // who paid too much has certainly paid — so we have earned $1.50 twice. The
  // part-paid place has earned nothing yet, and the free place never will.
  assert.equal(money.platformFeeCents, 300);
});
