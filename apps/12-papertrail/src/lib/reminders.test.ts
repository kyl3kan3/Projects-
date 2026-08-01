import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nextReminderStep,
  reminderCopy,
  reminderSteps,
  sequenceState,
  type ReminderSubject,
} from "@/lib/reminders";
import { dueDateFor } from "@/lib/dates";

const RULE = { enabled: true, step1Days: 1, step2Days: 7, step3Days: 14 };
const DUE = dueDateFor(new Date("2026-07-04T09:00:00Z"), 14); // end of 18 July

function invoice(overrides: Partial<ReminderSubject> = {}): ReminderSubject {
  return { status: "sent", dueAt: DUE, total: 3_360_00, amountPaid: 0, ...overrides };
}

/** `n` whole days after the due day, at 09:00 UTC. */
const day = (n: number) =>
  new Date(Date.UTC(2026, 6, 18 + n, 9, 0, 0));

describe("reminderSteps", () => {
  it("reads the account's cadence in order", () => {
    assert.deepEqual(reminderSteps(RULE), [
      { step: 1, offsetDays: 1, tone: "gentle" },
      { step: 2, offsetDays: 7, tone: "firm" },
      { step: 3, offsetDays: 14, tone: "final" },
    ]);
  });

  it("accepts a custom cadence", () => {
    const steps = reminderSteps({ step1Days: 3, step2Days: 10, step3Days: 21 });
    assert.deepEqual(steps.map((s) => s.offsetDays), [3, 10, 21]);
  });

  it("repairs an out-of-order cadence rather than making a step unreachable", () => {
    const steps = reminderSteps({ step1Days: 14, step2Days: 3, step3Days: 7 });
    assert.deepEqual(steps.map((s) => s.offsetDays), [3, 7, 14]);
  });

  it("forces distinct days so three notices cannot collapse into one", () => {
    const steps = reminderSteps({ step1Days: 5, step2Days: 5, step3Days: 5 });
    assert.deepEqual(steps.map((s) => s.offsetDays), [5, 6, 7]);
  });

  it("clamps zero and negative offsets to the day after due", () => {
    const steps = reminderSteps({ step1Days: 0, step2Days: -3, step3Days: 2 });
    assert.deepEqual(steps.map((s) => s.offsetDays), [1, 2, 3]);
  });
});

describe("nextReminderStep", () => {
  it("sends nothing while the invoice is inside its terms", () => {
    assert.equal(nextReminderStep(RULE, invoice(), [], day(0)), null);
  });

  it("sends the gentle notice the day after due", () => {
    const step = nextReminderStep(RULE, invoice(), [], day(1));
    assert.equal(step?.step, 1);
    assert.equal(step?.tone, "gentle");
  });

  it("does not send the same notice twice", () => {
    assert.equal(nextReminderStep(RULE, invoice(), [1], day(1)), null);
    assert.equal(nextReminderStep(RULE, invoice(), [1], day(3)), null);
  });

  it("carries on to the firm and final notices — the sequence does not stall", () => {
    assert.equal(nextReminderStep(RULE, invoice(), [1], day(7))?.step, 2);
    assert.equal(nextReminderStep(RULE, invoice(), [1, 2], day(8)), null);
    assert.equal(nextReminderStep(RULE, invoice(), [1, 2], day(14))?.step, 3);
  });

  it("goes quiet once all three have gone out", () => {
    assert.equal(nextReminderStep(RULE, invoice(), [1, 2, 3], day(30)), null);
  });

  it("skips forward when the sweep has not run for days", () => {
    // Ten days late with nothing sent: the firm notice is the honest one to
    // send, not a "quick nudge" about a deadline that passed last week.
    const step = nextReminderStep(RULE, invoice(), [], day(10));
    assert.equal(step?.step, 2);
    assert.equal(step?.tone, "firm");
  });

  it("jumps straight to the final notice if the invoice is very late", () => {
    assert.equal(nextReminderStep(RULE, invoice(), [], day(40))?.step, 3);
  });

  it("stops the moment the invoice is paid", () => {
    assert.equal(
      nextReminderStep(RULE, invoice({ amountPaid: 3_360_00, status: "paid" }), [1], day(14)),
      null,
    );
    // Even if the status column has not caught up yet, the money decides.
    assert.equal(
      nextReminderStep(RULE, invoice({ amountPaid: 3_360_00, status: "sent" }), [1], day(14)),
      null,
    );
  });

  it("keeps chasing a partial payment", () => {
    const step = nextReminderStep(RULE, invoice({ amountPaid: 1_000_00 }), [1], day(7));
    assert.equal(step?.step, 2);
  });

  it("never chases a draft or a voided invoice", () => {
    assert.equal(nextReminderStep(RULE, invoice({ status: "draft" }), [], day(20)), null);
    assert.equal(nextReminderStep(RULE, invoice({ status: "void" }), [], day(20)), null);
  });

  it("respects the account switching reminders off", () => {
    assert.equal(nextReminderStep({ ...RULE, enabled: false }, invoice(), [], day(20)), null);
  });

  it("does nothing without a due date", () => {
    assert.equal(nextReminderStep(RULE, invoice({ dueAt: null }), [], day(20)), null);
  });

  it("chases an overdue invoice on a custom cadence", () => {
    const rule = { enabled: true, step1Days: 3, step2Days: 10, step3Days: 21 };
    assert.equal(nextReminderStep(rule, invoice(), [], day(2)), null);
    assert.equal(nextReminderStep(rule, invoice(), [], day(3))?.step, 1);
    assert.equal(nextReminderStep(rule, invoice(), [1], day(9)), null);
    assert.equal(nextReminderStep(rule, invoice(), [1], day(10))?.step, 2);
  });

  it("walks a whole 30-day sequence and sends exactly three notices", () => {
    const sent: number[] = [];
    for (let d = 0; d <= 30; d++) {
      const step = nextReminderStep(RULE, invoice(), sent, day(d));
      if (step) sent.push(step.step);
    }
    assert.deepEqual(sent, [1, 2, 3]);
  });
});

describe("sequenceState", () => {
  it("counts down to the next notice", () => {
    assert.deepEqual(sequenceState(RULE, invoice(), [], day(0)), {
      label: "Gentle notice in 1 day",
      remaining: 3,
    });
    assert.deepEqual(sequenceState(RULE, invoice(), [1], day(2)), {
      label: "Firm notice in 5 days",
      remaining: 2,
    });
  });

  it("says a notice is due now", () => {
    assert.equal(sequenceState(RULE, invoice(), [], day(1)).label, "Gentle notice due now");
  });

  it("reports a settled invoice and a finished sequence", () => {
    assert.deepEqual(sequenceState(RULE, invoice({ amountPaid: 3_360_00 }), [1], day(9)), {
      label: "Settled — sequence stopped",
      remaining: 0,
    });
    assert.deepEqual(sequenceState(RULE, invoice(), [1, 2, 3], day(20)), {
      label: "All three notices sent",
      remaining: 0,
    });
  });

  it("says when reminders are switched off", () => {
    assert.equal(sequenceState({ ...RULE, enabled: false }, invoice(), [], day(3)).label, "Reminders off");
  });
});

describe("reminderCopy", () => {
  const ctx = {
    clientName: "Rosa",
    freelancerName: "Ada Mwangi",
    invoiceNumber: "INV-023",
    documentTitle: "Website redesign — Meridian Coffee",
    balance: 3_360_00,
    currency: "USD",
    daysLate: 7,
    link: "https://papertrail.app/d/abc123",
  };

  it("escalates in wording, not in volume", () => {
    const gentle = reminderCopy("gentle", ctx);
    const firm = reminderCopy("firm", ctx);
    const final = reminderCopy("final", ctx);

    assert.match(gentle.subject, /nudge/i);
    assert.match(firm.subject, /7 days overdue/);
    assert.match(final.subject, /Final notice/);

    for (const mail of [gentle, firm, final]) {
      assert.match(mail.body, /INV-023/);
      assert.match(mail.body, /\$3,360\.00/);
      assert.match(mail.body, /https:\/\/papertrail\.app\/d\/abc123/);
      assert.match(mail.body, /Ada Mwangi/);
      // Nothing threatening, nothing automated-sounding.
      assert.doesNotMatch(mail.body, /immediately|legal action|debt collect/i);
    }
  });

  it("gets the singular right", () => {
    const mail = reminderCopy("gentle", { ...ctx, daysLate: 1 });
    assert.match(mail.body, /1 day ago/);
  });
});
