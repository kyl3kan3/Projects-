import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  daysOverdue,
  daysUntilDue,
  describeDue,
  dueDateFor,
  formatAuditTimestamp,
  formatDocumentDate,
  formatShortDate,
  isOverdue,
  monthSpine,
  utcMonthKey,
} from "@/lib/dates";

const at = (iso: string) => new Date(iso);

describe("dueDateFor", () => {
  it("puts net-14 at the end of the fourteenth day after issue", () => {
    const due = dueDateFor(at("2026-07-04T09:12:00Z"), 14);
    assert.equal(due.toISOString(), "2026-07-18T23:59:59.999Z");
  });

  it("makes net-0 due on receipt — the end of the issue day", () => {
    const due = dueDateFor(at("2026-07-04T23:10:00Z"), 0);
    assert.equal(due.toISOString(), "2026-07-04T23:59:59.999Z");
  });

  it("ignores the time of day the invoice went out", () => {
    const early = dueDateFor(at("2026-07-04T00:00:01Z"), 7);
    const late = dueDateFor(at("2026-07-04T23:59:58Z"), 7);
    assert.equal(early.getTime(), late.getTime());
  });

  it("crosses month and year ends", () => {
    assert.equal(dueDateFor(at("2026-01-25T10:00:00Z"), 14).toISOString(), "2026-02-08T23:59:59.999Z");
    assert.equal(dueDateFor(at("2026-12-28T10:00:00Z"), 7).toISOString(), "2027-01-04T23:59:59.999Z");
    // 2028 is a leap year: 14 days from 20 Feb is 5 March, not 6.
    assert.equal(dueDateFor(at("2028-02-20T10:00:00Z"), 14).toISOString(), "2028-03-05T23:59:59.999Z");
  });

  it("treats a negative or junk term as due on receipt", () => {
    assert.equal(dueDateFor(at("2026-07-04T10:00:00Z"), -5).toISOString(), "2026-07-04T23:59:59.999Z");
    assert.equal(
      dueDateFor(at("2026-07-04T10:00:00Z"), Number.NaN).toISOString(),
      "2026-07-04T23:59:59.999Z",
    );
  });
});

describe("daysOverdue", () => {
  const due = dueDateFor(at("2026-07-04T09:00:00Z"), 14); // end of 18 July

  it("is zero right up to the last second of the due day", () => {
    assert.equal(daysOverdue(due, at("2026-07-18T00:00:00Z")), 0);
    assert.equal(daysOverdue(due, at("2026-07-18T23:59:59Z")), 0);
  });

  it("is one from the first minute of the following day", () => {
    assert.equal(daysOverdue(due, at("2026-07-19T00:00:30Z")), 1);
    assert.equal(daysOverdue(due, at("2026-07-19T23:00:00Z")), 1);
  });

  it("counts whole days after that", () => {
    assert.equal(daysOverdue(due, at("2026-07-25T08:00:00Z")), 7);
    assert.equal(daysOverdue(due, at("2026-08-01T08:00:00Z")), 14);
  });

  it("is never negative before the due date", () => {
    assert.equal(daysOverdue(due, at("2026-07-01T08:00:00Z")), 0);
  });

  it("is zero without a due date", () => {
    assert.equal(daysOverdue(null, at("2026-07-19T00:00:00Z")), 0);
  });
});

describe("daysUntilDue", () => {
  const due = dueDateFor(at("2026-07-04T09:00:00Z"), 14);
  it("counts down to the due day and goes negative after", () => {
    assert.equal(daysUntilDue(due, at("2026-07-17T12:00:00Z")), 1);
    assert.equal(daysUntilDue(due, at("2026-07-18T12:00:00Z")), 0);
    assert.equal(daysUntilDue(due, at("2026-07-20T12:00:00Z")), -2);
  });
});

describe("isOverdue", () => {
  const due = dueDateFor(at("2026-07-04T09:00:00Z"), 14);
  const base = { dueAt: due, total: 4_800_00, amountPaid: 0, status: "sent" };

  it("is true once the due day has passed with money owing", () => {
    assert.equal(isOverdue(base, at("2026-07-19T01:00:00Z")), true);
  });

  it("is false inside the terms", () => {
    assert.equal(isOverdue(base, at("2026-07-18T23:00:00Z")), false);
  });

  it("is false once paid in full, however late", () => {
    assert.equal(
      isOverdue({ ...base, amountPaid: 4_800_00 }, at("2026-09-01T00:00:00Z")),
      false,
    );
  });

  it("is still true on a partial payment", () => {
    assert.equal(
      isOverdue({ ...base, amountPaid: 1_440_00 }, at("2026-07-25T00:00:00Z")),
      true,
    );
  });

  it("never applies to drafts or voided invoices", () => {
    assert.equal(isOverdue({ ...base, status: "draft" }, at("2026-09-01T00:00:00Z")), false);
    assert.equal(isOverdue({ ...base, status: "void" }, at("2026-09-01T00:00:00Z")), false);
  });
});

describe("describeDue", () => {
  const due = dueDateFor(at("2026-07-04T09:00:00Z"), 14);
  it("reads the way a row should", () => {
    assert.equal(describeDue(due, at("2026-07-10T10:00:00Z")), "due Jul 18");
    assert.equal(describeDue(due, at("2026-07-17T10:00:00Z")), "due tomorrow");
    assert.equal(describeDue(due, at("2026-07-18T10:00:00Z")), "due today");
    assert.equal(describeDue(due, at("2026-07-19T10:00:00Z")), "1 day overdue");
    assert.equal(describeDue(due, at("2026-07-26T10:00:00Z")), "8 days overdue");
    assert.equal(describeDue(null, at("2026-07-26T10:00:00Z")), "no due date");
  });
});

describe("display helpers", () => {
  it("formats dates in UTC, not the machine's zone", () => {
    assert.equal(formatShortDate(at("2026-07-18T23:30:00Z")), "Jul 18");
    assert.equal(formatDocumentDate(at("2026-07-18T00:00:00Z")), "18 July 2026");
  });

  it("stamps an audit line to the minute", () => {
    assert.equal(formatAuditTimestamp(at("2026-07-14T14:32:09Z")), "Jul 14, 2026 · 14:32 UTC");
  });

  it("keys months in UTC", () => {
    assert.equal(utcMonthKey(at("2026-01-31T23:59:00Z")), "2026-01");
    assert.equal(utcMonthKey(at("2026-12-01T00:00:00Z")), "2026-12");
  });

  it("builds a twelve-month spine ending in the current month", () => {
    const spine = monthSpine(at("2026-07-15T00:00:00Z"));
    assert.equal(spine.length, 12);
    assert.equal(spine[0].key, "2025-08");
    assert.equal(spine[11].key, "2026-07");
  });
});
