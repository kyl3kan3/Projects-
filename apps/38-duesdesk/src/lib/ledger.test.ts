import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allocate,
  amountDueNow,
  assessmentTotal,
  balanceCents,
  DEFAULT_REMINDER_LADDER,
  deriveStatus,
  invoiceTotal,
  isPartlyPaid,
  lateFeeCents,
  netLateFee,
  nextReminderRung,
  pendingCents,
  settledCents,
  type LedgerLine,
  type LedgerPayment,
} from "@/lib/ledger";
import { DEFAULT_LATE_FEE, NO_LATE_FEE } from "@/lib/dues";
import type { LateFeePolicy } from "@/db/schema";

/** The canonical invoice: $180.00 quarterly dues, due Apr 1 2026. */
const dues: LedgerLine = {
  kind: "assessment",
  amountCents: 18000,
};
const lateFee: LedgerLine = { kind: "late_fee", amountCents: 1500 };
const waiver: LedgerLine = { kind: "late_fee_waiver", amountCents: -1500 };

const settled = (cents: number): LedgerPayment => ({ status: "settled", appliedCents: cents });
const pending = (cents: number): LedgerPayment => ({ status: "pending", appliedCents: cents });
const failed = (cents: number): LedgerPayment => ({ status: "failed", appliedCents: cents });

describe("invoice arithmetic", () => {
  it("totals lines including a negative waiver", () => {
    assert.equal(invoiceTotal([dues]), 18000);
    assert.equal(invoiceTotal([dues, lateFee]), 19500);
    assert.equal(invoiceTotal([dues, lateFee, waiver]), 18000);
  });

  it("keeps the waived fee on the record instead of erasing it", () => {
    const lines = [dues, lateFee, waiver];
    assert.equal(netLateFee(lines), 0);
    assert.equal(assessmentTotal(lines), 18000);
    // Both fee rows survive: the board can show what it charged and what it waived.
    assert.equal(lines.filter((l) => l.kind === "late_fee").length, 1);
    assert.equal(lines.filter((l) => l.kind === "late_fee_waiver").length, 1);
  });

  it("never reports a negative net late fee if a waiver over-corrects", () => {
    assert.equal(netLateFee([lateFee, { kind: "late_fee_waiver", amountCents: -5000 }]), 0);
  });

  it("counts only settled payments toward the balance", () => {
    const payments = [settled(5000), pending(6000), failed(7000)];
    assert.equal(settledCents(payments), 5000);
    assert.equal(pendingCents(payments), 6000);
    assert.equal(balanceCents([dues], payments), 13000);
  });

  it("a failed ACH leaves the balance exactly where it was", () => {
    assert.equal(balanceCents([dues], [failed(18000)]), 18000);
  });

  it("clamps the balance at zero on an overpayment", () => {
    assert.equal(balanceCents([dues], [settled(20000)]), 0);
  });

  it("stops asking for money that is already in flight", () => {
    // $180 owed, $180 ACH debit processing: balance is still 180 (nothing has
    // settled) but there is nothing left to ask the member to pay.
    assert.equal(balanceCents([dues], [pending(18000)]), 18000);
    assert.equal(amountDueNow([dues], [pending(18000)]), 0);
    // Half in flight: only the other half is payable now.
    assert.equal(amountDueNow([dues], [pending(9000)]), 9000);
  });
});

describe("allocate", () => {
  it("applies what the invoice can absorb and parks the rest as credit", () => {
    assert.deepEqual(allocate(18000, 18000), { appliedCents: 18000, creditCents: 0 });
    assert.deepEqual(allocate(18000, 5000), { appliedCents: 5000, creditCents: 0 });
    assert.deepEqual(allocate(18000, 20000), { appliedCents: 18000, creditCents: 2000 });
  });

  it("turns a payment against a settled invoice entirely into credit", () => {
    assert.deepEqual(allocate(0, 18000), { appliedCents: 0, creditCents: 18000 });
    assert.deepEqual(allocate(-500, 18000), { appliedCents: 0, creditCents: 18000 });
  });

  it("partial payments compose to the exact balance", () => {
    // $180 paid as $60 + $60 + $60 leaves nothing and creates no credit.
    let balance = 18000;
    let credit = 0;
    for (const amount of [6000, 6000, 6000]) {
      const a = allocate(balance, amount);
      balance -= a.appliedCents;
      credit += a.creditCents;
    }
    assert.equal(balance, 0);
    assert.equal(credit, 0);
  });

  it("an over-large final payment credits only the excess", () => {
    // $180 invoice, $100 already settled, member sends $100: $80 applied, $20 credit.
    const a = allocate(balanceCents([dues], [settled(10000)]), 10000);
    assert.deepEqual(a, { appliedCents: 8000, creditCents: 2000 });
  });
});

describe("deriveStatus", () => {
  const base = {
    dueOn: "2026-04-01",
    policy: DEFAULT_LATE_FEE, // 10 grace days
    sent: true,
  };

  it("is sent before the due date and overdue after grace", () => {
    assert.equal(deriveStatus({ ...base, lines: [dues], payments: [], asOf: "2026-03-25" }), "sent");
    assert.equal(deriveStatus({ ...base, lines: [dues], payments: [], asOf: "2026-04-11" }), "sent");
    assert.equal(
      deriveStatus({ ...base, lines: [dues], payments: [], asOf: "2026-04-12" }),
      "overdue",
    );
  });

  it("is draft until it has been sent", () => {
    assert.equal(
      deriveStatus({ ...base, sent: false, lines: [dues], payments: [], asOf: "2026-05-01" }),
      "draft",
    );
  });

  it("reads processing while an ACH debit is in flight, never paid", () => {
    assert.equal(
      deriveStatus({ ...base, lines: [dues], payments: [pending(18000)], asOf: "2026-04-02" }),
      "processing",
    );
    // Still processing after grace: the member did their part on time.
    assert.equal(
      deriveStatus({ ...base, lines: [dues], payments: [pending(18000)], asOf: "2026-04-20" }),
      "processing",
    );
  });

  it("flips to paid only when money has settled", () => {
    assert.equal(
      deriveStatus({ ...base, lines: [dues], payments: [settled(18000)], asOf: "2026-04-20" }),
      "paid",
    );
  });

  it("goes back to overdue — not paid — when an ACH debit fails", () => {
    // The exact sequence ROADMAP forbids getting wrong: processing, then failed.
    const processing = deriveStatus({
      ...base,
      lines: [dues],
      payments: [pending(18000)],
      asOf: "2026-04-20",
    });
    const afterFailure = deriveStatus({
      ...base,
      lines: [dues],
      payments: [failed(18000)],
      asOf: "2026-04-20",
    });
    assert.equal(processing, "processing");
    assert.equal(afterFailure, "overdue");
  });

  it("prefers overdue over partial, and still reports partly paid separately", () => {
    const args = { ...base, lines: [dues], payments: [settled(5000)] };
    assert.equal(deriveStatus({ ...args, asOf: "2026-04-05" }), "partial");
    assert.equal(deriveStatus({ ...args, asOf: "2026-05-05" }), "overdue");
    assert.equal(isPartlyPaid([dues], [settled(5000)]), true);
    assert.equal(isPartlyPaid([dues], [settled(18000)]), false);
    assert.equal(isPartlyPaid([dues], []), false);
  });

  it("treats a fully waived invoice as settled", () => {
    const lines: LedgerLine[] = [
      { kind: "assessment", amountCents: 18000 },
      { kind: "adjustment", amountCents: -18000 },
    ];
    assert.equal(deriveStatus({ ...base, lines, payments: [], asOf: "2026-06-01" }), "paid");
  });

  it("a written-off invoice says so regardless of anything else", () => {
    assert.equal(
      deriveStatus({
        ...base,
        lines: [dues],
        payments: [settled(5000)],
        asOf: "2026-09-01",
        writtenOff: true,
      }),
      "written_off",
    );
  });
});

describe("lateFeeCents", () => {
  it("charges a flat fee", () => {
    assert.equal(lateFeeCents(DEFAULT_LATE_FEE, 18000), 1500);
  });

  it("charges nothing under a none policy", () => {
    assert.equal(lateFeeCents(NO_LATE_FEE, 18000), 0);
  });

  it("charges nothing when nothing is outstanding", () => {
    assert.equal(lateFeeCents(DEFAULT_LATE_FEE, 0), 0);
    assert.equal(lateFeeCents(DEFAULT_LATE_FEE, -100), 0);
  });

  it("charges a percentage of the outstanding balance, not the original", () => {
    const policy: LateFeePolicy = {
      graceDays: 10,
      kind: "percent",
      flatCents: 0,
      percentBps: 150, // 1.5% monthly, a common CC&R figure
      maxCents: 0,
    };
    // 1.5% of the full $180 is $2.70.
    assert.equal(lateFeeCents(policy, 18000), 270);
    // Household paid $150 late; the fee is on the remaining $30, not the $180.
    assert.equal(lateFeeCents(policy, 3000), 45);
  });

  it("respects a cap", () => {
    const policy: LateFeePolicy = {
      graceDays: 10,
      kind: "percent",
      flatCents: 0,
      percentBps: 1000,
      maxCents: 2500,
    };
    assert.equal(lateFeeCents(policy, 100000), 2500); // 10% would be $100
    assert.equal(lateFeeCents(policy, 10000), 1000); // under the cap
  });

  it("never fines a household more than it owes", () => {
    // $15 flat fee against a $4.10 remainder would be absurd and quotable.
    assert.equal(lateFeeCents(DEFAULT_LATE_FEE, 410), 410);
  });
});

describe("nextReminderRung", () => {
  const ladder = DEFAULT_REMINDER_LADDER; // +3 gentle, +14 firm, +30 board/SMS
  const dueOn = "2026-04-01";

  it("sends nothing before the first rung is crossed", () => {
    assert.equal(nextReminderRung(ladder, { dueOn, asOf: "2026-04-03", rungSent: -1 }), null);
  });

  it("sends the gentle nudge on day three", () => {
    assert.equal(nextReminderRung(ladder, { dueOn, asOf: "2026-04-04", rungSent: -1 }), 0);
  });

  it("skips straight to the highest crossed rung when nothing was sent", () => {
    // 20 days late with no reminders sent: the firm one, not a fake day-three nudge.
    assert.equal(nextReminderRung(ladder, { dueOn, asOf: "2026-04-21", rungSent: -1 }), 1);
    // 40 days late: the board rung.
    assert.equal(nextReminderRung(ladder, { dueOn, asOf: "2026-05-11", rungSent: -1 }), 2);
  });

  it("advances one rung at a time once the ladder is running", () => {
    assert.equal(nextReminderRung(ladder, { dueOn, asOf: "2026-04-16", rungSent: 0 }), 1);
    assert.equal(nextReminderRung(ladder, { dueOn, asOf: "2026-05-02", rungSent: 1 }), 2);
  });

  it("goes silent once the ladder is exhausted — no repeat nagging", () => {
    // This is the failure mode the reference app shipped in reverse: a `find`
    // that keeps returning the same rung forever, or one that never fires again.
    assert.equal(nextReminderRung(ladder, { dueOn, asOf: "2026-06-01", rungSent: 2 }), null);
    assert.equal(nextReminderRung(ladder, { dueOn, asOf: "2027-01-01", rungSent: 2 }), null);
  });

  it("is a no-op for an empty ladder", () => {
    assert.equal(nextReminderRung([], { dueOn, asOf: "2026-09-01", rungSent: -1 }), null);
  });

  it("is idempotent across a double-fired sweep on the same day", () => {
    // First sweep sends rung 0 and records it; the second must send nothing.
    const first = nextReminderRung(ladder, { dueOn, asOf: "2026-04-05", rungSent: -1 });
    assert.equal(first, 0);
    const second = nextReminderRung(ladder, { dueOn, asOf: "2026-04-05", rungSent: first! });
    assert.equal(second, null);
  });
});
