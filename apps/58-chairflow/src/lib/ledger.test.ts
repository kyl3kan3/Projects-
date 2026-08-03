import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  feeTotalCents,
  ledgerLine,
  matchesFilter,
  summarizeLedger,
  summarySentence,
  type LedgerRow,
} from "@/lib/ledger";

function row(over: Partial<LedgerRow>): LedgerRow {
  return {
    id: "c1",
    kind: "no_show_fee",
    status: "charged",
    amountCents: 2250,
    depositAppliedCents: 0,
    policyVersion: 1,
    policyAgreedOn: "2026-06-12",
    occurredOn: "2026-07-17",
    clientName: "Marcus Ollet",
    serviceName: "Skin fade",
    failureReason: null,
    simulated: false,
    ...over,
  };
}

test("protected money is fees charged plus deposits kept, minus refunds", () => {
  const summary = summarizeLedger([
    row({ amountCents: 2250 }),
    row({ id: "c2", kind: "late_cancel_fee", amountCents: 1125 }),
    row({ id: "c3", kind: "deposit", status: "captured", amountCents: 2000 }),
    row({ id: "c4", status: "waived", amountCents: 3000 }),
    row({ id: "c5", status: "failed", amountCents: 4000 }),
    row({ id: "c6", kind: "refund", status: "refunded", amountCents: 500 }),
  ]);
  assert.equal(summary.feesCollectedCents, 3375);
  assert.equal(summary.depositsKeptCents, 2000);
  assert.equal(summary.waivedCents, 3000);
  assert.equal(summary.failedCents, 4000);
  assert.equal(summary.refundedCents, 500);
  assert.equal(summary.protectedCents, 4875);
});

test("a deposit applied to a fee is counted once, not twice", () => {
  // The DESIGN.md example: $45 service, 50% no-show, $10 deposit already held.
  // Two rows: the deposit kept ($10) and the cash charged ($12.50). The stylist
  // protected $22.50 — the fee — not $32.50.
  const summary = summarizeLedger([
    row({ kind: "deposit", status: "captured", amountCents: 1000 }),
    row({ id: "c2", amountCents: 1250, depositAppliedCents: 1000 }),
  ]);
  assert.equal(summary.protectedCents, 2250);
  assert.equal(summary.feeCount, 1);
  assert.equal(summary.depositCount, 1);
  assert.equal(feeTotalCents(row({ amountCents: 1250, depositAppliedCents: 1000 })), 2250);
});

test("a deposit bigger than the fee leaves the fee protected, with the rest refunded", () => {
  // $40 service, 25% late cancel = $10, deposit $30: keep $10, hand back $20.
  const summary = summarizeLedger([
    row({ kind: "deposit", status: "captured", amountCents: 3000 }),
    row({
      id: "c2",
      kind: "late_cancel_fee",
      status: "captured",
      amountCents: 0,
      depositAppliedCents: 1000,
    }),
    row({ id: "c3", kind: "refund", status: "refunded", amountCents: 2000 }),
  ]);
  assert.equal(summary.protectedCents, 1000, "exactly the fee the policy named");
  assert.equal(summary.feeCount, 1);
});

test("a deposit going towards a service that happened is not protection", () => {
  // status `charged` = money taken at booking, spent on the haircut.
  const summary = summarizeLedger([
    row({ kind: "deposit", status: "charged", amountCents: 2000 }),
  ]);
  assert.equal(summary.protectedCents, 0);
  assert.equal(summary.depositsKeptCents, 0);
  // `held` (authorised, not taken) is not money either.
  assert.equal(
    summarizeLedger([row({ kind: "deposit", status: "held", amountCents: 2000 })]).protectedCents,
    0,
  );
});

test("a declined fee is never counted as money collected", () => {
  const summary = summarizeLedger([row({ status: "failed", amountCents: 9999 })]);
  assert.equal(summary.feesCollectedCents, 0);
  assert.equal(summary.protectedCents, 0);
  assert.equal(summary.failedCount, 1);
});

test("a declined remainder still counts the deposit that was kept", () => {
  const summary = summarizeLedger([
    row({ kind: "deposit", status: "captured", amountCents: 1000 }),
    row({ id: "c2", status: "failed", amountCents: 1250, depositAppliedCents: 1000 }),
  ]);
  assert.equal(summary.protectedCents, 1000, "the $10 was kept even though the card refused");
  assert.equal(summary.failedCents, 1250);
});

test("a waived fee reports the whole fee, including the deposit part", () => {
  const summary = summarizeLedger([
    row({ status: "waived", amountCents: 1250, depositAppliedCents: 1000 }),
  ]);
  assert.equal(summary.waivedCents, 2250);
  assert.equal(summary.protectedCents, 0);
});

test("the ledger line is the product's sentence, typeset like a receipt", () => {
  assert.equal(ledgerLine(row({})), "no-show fee · per policy agreed Jun 12 · +$22.50");
  assert.equal(
    ledgerLine(row({ amountCents: 1250, depositAppliedCents: 1000 })),
    "no-show fee · deposit kept $10.00 · per policy agreed Jun 12 · +$12.50",
  );
  assert.equal(
    ledgerLine(row({ status: "waived", amountCents: 2250 })),
    "no-show fee · per policy agreed Jun 12 · $22.50 waived",
  );
  assert.equal(
    ledgerLine(row({ status: "failed", amountCents: 2250 })),
    "no-show fee · per policy agreed Jun 12 · $22.50 declined",
  );
  assert.equal(
    ledgerLine(row({ kind: "deposit", status: "captured", amountCents: 2000 })),
    "deposit kept · per policy agreed Jun 12 · +$20.00",
  );
  assert.equal(
    ledgerLine(row({ kind: "refund", status: "refunded", amountCents: 2000 })),
    "deposit refund · per policy agreed Jun 12 · -$20.00",
  );
});

test("the summary sentence counts, and says something honest when empty", () => {
  const summary = summarizeLedger([
    row({}),
    row({ id: "c2" }),
    row({ id: "c3" }),
    row({ id: "c4", kind: "deposit", status: "captured", amountCents: 1000 }),
    row({ id: "c5", kind: "deposit", status: "captured", amountCents: 1000 }),
    row({ id: "c6", status: "waived" }),
  ]);
  assert.equal(summarySentence(summary), "3 fees · 2 deposits kept · 1 waived");
  assert.equal(
    summarySentence(summarizeLedger([])),
    "Nothing to protect against yet this month.",
  );
  assert.equal(summarySentence(summarizeLedger([row({})])), "1 fee");
});

test("filters select what their chip says", () => {
  const charged = row({});
  const waived = row({ status: "waived" });
  const deposit = row({ kind: "deposit", status: "captured" });
  const failed = row({ status: "failed" });

  assert.equal(matchesFilter(charged, "fees"), true);
  assert.equal(matchesFilter(waived, "fees"), false, "a waived fee is not collected");
  assert.equal(matchesFilter(deposit, "deposits"), true);
  assert.equal(matchesFilter(waived, "waived"), true);
  assert.equal(matchesFilter(failed, "failed"), true);
  assert.equal(matchesFilter(row({ status: "disputed" }), "failed"), true);
  for (const r of [charged, waived, deposit, failed]) {
    assert.equal(matchesFilter(r, "all"), true);
  }
});
