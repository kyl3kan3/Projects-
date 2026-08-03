import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allocate,
  balanceOf,
  delinquency,
  statement,
  withRunningBalance,
  type CoreEntry,
} from "@/lib/ledger-core";

let seq = 0;
function entry(
  kind: CoreEntry["kind"],
  amountCents: number,
  occurredOn: string,
  description: string = kind,
  period?: string,
): CoreEntry {
  seq += 1;
  return { id: `e${seq}`, kind, amountCents, occurredOn, description, period, sequence: seq };
}

test("the running balance follows the chronology, not the insertion order", () => {
  const rows = withRunningBalance([
    entry("payment", -12900, "2026-08-02"),
    entry("rent", 12900, "2026-08-01", "Rent 2026-08", "2026-08"),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.entry.occurredOn, r.balanceAfterCents]),
    [
      ["2026-08-01", 12900],
      ["2026-08-02", 0],
    ],
  );
});

test("a payment cascades over open charges oldest-first", () => {
  // June rent unpaid, a June late fee, then July rent. One $14,900 payment.
  const entries = [
    entry("rent", 12900, "2026-06-01", "Rent 2026-06", "2026-06"),
    entry("late_fee", 2000, "2026-06-06", "Late fee", "2026-06"),
    entry("rent", 12900, "2026-07-01", "Rent 2026-07", "2026-07"),
    entry("payment", -14900, "2026-07-03"),
  ];
  const { charges, creditCents, outstandingCents } = allocate(entries);
  assert.equal(charges[0].outstandingCents, 0, "June rent cleared");
  assert.equal(charges[1].outstandingCents, 0, "June late fee cleared");
  assert.equal(charges[2].outstandingCents, 12900, "July still open");
  assert.equal(creditCents, 0);
  assert.equal(outstandingCents, 12900);
});

test("an overpayment becomes credit and pays the next charge, so nobody looks late", () => {
  const entries = [
    entry("rent", 12900, "2026-06-01", "Rent 2026-06", "2026-06"),
    entry("payment", -25800, "2026-06-01", "Paid two months up front"),
    entry("rent", 12900, "2026-07-01", "Rent 2026-07", "2026-07"),
  ];
  const allocation = allocate(entries);
  assert.equal(allocation.outstandingCents, 0);
  assert.equal(allocation.creditCents, 0, "the credit was consumed by July");

  const delq = delinquency(entries, "2026-07-15");
  assert.equal(delq.since, null, "not delinquent — this is the bug being prevented");
  assert.equal(delq.daysLate, 0);
});

test("delinquency is measured from the oldest still-open charge, not the first charge ever", () => {
  const entries = [
    entry("rent", 12900, "2026-05-01", "Rent 2026-05", "2026-05"),
    entry("payment", -12900, "2026-05-01"),
    entry("rent", 12900, "2026-06-01", "Rent 2026-06", "2026-06"),
    entry("payment", -12900, "2026-06-02"),
    entry("rent", 12900, "2026-07-01", "Rent 2026-07", "2026-07"),
  ];
  const delq = delinquency(entries, "2026-07-08");
  assert.equal(delq.since, "2026-07-01");
  assert.equal(delq.daysLate, 7);
  assert.equal(delq.cycleKey, "2026-07");
  assert.equal(delq.outstandingCents, 12900);
});

test("a charge dated in the future does not make anyone late today", () => {
  const entries = [
    entry("rent", 12900, "2026-09-01", "Rent 2026-09", "2026-09"),
  ];
  const delq = delinquency(entries, "2026-08-20");
  assert.equal(delq.since, null);
  assert.equal(delq.daysLate, 0);
});

test("partial payment leaves the cycle open at the same start date", () => {
  const entries = [
    entry("rent", 12900, "2026-07-01", "Rent 2026-07", "2026-07"),
    entry("payment", -5000, "2026-07-10"),
  ];
  const delq = delinquency(entries, "2026-07-20");
  assert.equal(delq.since, "2026-07-01");
  assert.equal(delq.outstandingCents, 7900);
  assert.equal(delq.daysLate, 19);
});

test("a credit row clears the balance and the delinquency", () => {
  const entries = [
    entry("rent", 12900, "2026-07-01", "Rent 2026-07", "2026-07"),
    entry("credit", -12900, "2026-07-05", "Move-out credit"),
  ];
  assert.equal(balanceOf(entries), 0);
  assert.equal(delinquency(entries, "2026-07-31").since, null);
});

test("a refund consumes credit rather than reading as a new unpaid charge", () => {
  const entries = [
    entry("rent", 12900, "2026-07-01", "Rent 2026-07", "2026-07"),
    entry("payment", -20000, "2026-07-01"),
    entry("refund", 7100, "2026-07-20", "Check 2214 mailed"),
  ];
  assert.equal(balanceOf(entries), 0);
  const delq = delinquency(entries, "2026-07-31");
  assert.equal(delq.since, null, "refunding a credit must not make the tenant delinquent");
});

test("a balance-forward statement opens with everything before the window", () => {
  const entries = [
    entry("rent", 12900, "2026-05-01", "Rent 2026-05", "2026-05"),
    entry("rent", 12900, "2026-06-01", "Rent 2026-06", "2026-06"),
    entry("payment", -12900, "2026-06-03"),
    entry("rent", 12900, "2026-07-01", "Rent 2026-07", "2026-07"),
  ];
  const stmt = statement(entries, "2026-06-01", "2026-06-30");
  assert.equal(stmt.openingBalanceCents, 12900, "May's unpaid rent carries forward");
  assert.equal(stmt.rows.length, 2);
  assert.equal(stmt.closingBalanceCents, 12900);
  assert.equal(stmt.rows[0].chargeCents, 12900);
  assert.equal(stmt.rows[1].receiptCents, 12900);
});
