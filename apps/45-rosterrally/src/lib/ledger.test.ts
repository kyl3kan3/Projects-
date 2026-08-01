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
  refundPlan,
  seasonMoney,
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
