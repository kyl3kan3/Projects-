import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CSV_HEADERS,
  csvAmount,
  csvField,
  csvLine,
  derivedStatus,
  describeInvoiceState,
  formatInvoiceNumber,
  incomeCsv,
  type IncomeRow,
  type IncomeSummary,
} from "@/lib/invoices";
import { dueDateFor } from "@/lib/dates";

const at = (iso: string) => new Date(iso);

describe("formatInvoiceNumber", () => {
  it("pads to three digits and then grows", () => {
    assert.equal(formatInvoiceNumber(1), "INV-001");
    assert.equal(formatInvoiceNumber(23), "INV-023");
    assert.equal(formatInvoiceNumber(1042), "INV-1042");
  });

  it("never produces INV-000 from a bad counter", () => {
    assert.equal(formatInvoiceNumber(0), "INV-001");
    assert.equal(formatInvoiceNumber(-3), "INV-001");
    assert.equal(formatInvoiceNumber(Number.NaN), "INV-001");
  });
});

describe("derivedStatus", () => {
  const dueAt = dueDateFor(at("2026-07-04T09:00:00Z"), 14); // end of 18 July
  const invoice = { total: 3_360_00, amountPaid: 0, dueAt };

  it("keeps a sent invoice as sent inside its terms", () => {
    assert.equal(derivedStatus({ status: "sent" }, invoice, at("2026-07-10T00:00:00Z")), "sent");
  });

  it("derives overdue past the due day", () => {
    assert.equal(derivedStatus({ status: "sent" }, invoice, at("2026-07-19T00:01:00Z")), "overdue");
    assert.equal(derivedStatus({ status: "viewed" }, invoice, at("2026-07-25T00:00:00Z")), "overdue");
  });

  it("derives paid from the money, whatever the column says", () => {
    assert.equal(
      derivedStatus({ status: "overdue" }, { ...invoice, amountPaid: 3_360_00 }, at("2026-08-01T00:00:00Z")),
      "paid",
    );
  });

  it("still shows a part-paid invoice as overdue", () => {
    assert.equal(
      derivedStatus({ status: "sent" }, { ...invoice, amountPaid: 1_000_00 }, at("2026-07-25T00:00:00Z")),
      "overdue",
    );
  });

  it("leaves drafts and voided invoices alone", () => {
    assert.equal(derivedStatus({ status: "draft" }, invoice, at("2026-09-01T00:00:00Z")), "draft");
    assert.equal(derivedStatus({ status: "void" }, invoice, at("2026-09-01T00:00:00Z")), "void");
  });

  it("does not call an invoice overdue when it has no due date yet", () => {
    assert.equal(
      derivedStatus({ status: "sent" }, { ...invoice, dueAt: null }, at("2026-09-01T00:00:00Z")),
      "sent",
    );
  });
});

describe("CSV escaping", () => {
  it("quotes commas, quotes, and newlines", () => {
    assert.equal(csvField("Meridian Coffee"), "Meridian Coffee");
    assert.equal(csvField("Álvarez, Rosa"), '"Álvarez, Rosa"');
    assert.equal(csvField('He said "yes"'), '"He said ""yes"""');
    assert.equal(csvField("line one\nline two"), '"line one\nline two"');
  });

  it("renders empties rather than the word undefined", () => {
    assert.equal(csvField(null), "");
    assert.equal(csvField(undefined), "");
  });

  it("joins a line", () => {
    assert.equal(csvLine(["INV-001", "Rosa, Álvarez", 3]), 'INV-001,"Rosa, Álvarez",3');
  });

  it("writes amounts as plain decimals a spreadsheet will read", () => {
    assert.equal(csvAmount(4_800_00, "USD"), "4800.00");
    assert.equal(csvAmount(16_66, "USD"), "16.66");
    assert.equal(csvAmount(0, "USD"), "0.00");
    assert.equal(csvAmount(480_000, "JPY"), "480000");
  });
});

describe("incomeCsv", () => {
  function row(overrides: Partial<IncomeRow> = {}): IncomeRow {
    return {
      documentId: "11111111-1111-1111-1111-111111111111",
      number: "INV-023",
      title: "Website redesign — Meridian Coffee",
      clientName: "Meridian Coffee",
      currency: "USD",
      subtotal: 4_800_00,
      tax: 0,
      total: 4_800_00,
      amountPaid: 1_440_00,
      balance: 3_360_00,
      status: "overdue",
      issuedAt: at("2026-07-04T09:00:00Z"),
      dueAt: dueDateFor(at("2026-07-04T09:00:00Z"), 14),
      paidAt: null,
      daysLate: 7,
      ...overrides,
    };
  }

  const summary = (rows: IncomeRow[]): IncomeSummary => ({
    paid: 0,
    outstanding: 0,
    overdue: 0,
    currency: "USD",
    rows,
    byMonth: new Map(),
  });

  it("writes a header and one line per invoice", () => {
    const csv = incomeCsv(summary([row(), row({ number: "INV-024" })]));
    const lines = csv.trim().split("\n");
    assert.equal(lines.length, 3);
    assert.equal(lines[0], CSV_HEADERS.join(","));
    assert.ok(lines[1].startsWith("INV-023,2026-07-04,2026-07-18,"));
  });

  it("quotes a client name containing a comma", () => {
    const csv = incomeCsv(summary([row({ clientName: "Álvarez, Rosa" })]));
    assert.match(csv, /"Álvarez, Rosa"/);
  });

  it("leaves the paid-on column empty until it is paid", () => {
    const unpaid = incomeCsv(summary([row()])).trim().split("\n")[1];
    assert.ok(unpaid.endsWith("overdue,"));
    const paid = incomeCsv(
      summary([row({ status: "paid", amountPaid: 4_800_00, balance: 0, paidAt: at("2026-07-22T10:00:00Z") })]),
    )
      .trim()
      .split("\n")[1];
    assert.ok(paid.endsWith("paid,2026-07-22"));
  });

  it("ends with a newline so the last row is not truncated by a reader", () => {
    assert.ok(incomeCsv(summary([row()])).endsWith("\n"));
  });

  it("writes just the header when there is nothing to export", () => {
    assert.equal(incomeCsv(summary([])), `${CSV_HEADERS.join(",")}\n`);
  });
});

describe("describeInvoiceState", () => {
  const issued = at("2026-07-04T09:00:00Z");
  const dueAt = dueDateFor(issued, 14);
  const base = { total: 3_360_00, amountPaid: 0, issuedAt: issued, dueAt, paidAt: null };

  it("counts down inside the terms", () => {
    assert.equal(describeInvoiceState("sent", base, at("2026-07-10T09:00:00Z")), "due Jul 18");
  });

  it("says how late it is once the due day passes", () => {
    assert.equal(describeInvoiceState("overdue", base, at("2026-07-26T09:00:00Z")), "8 days overdue");
  });

  it("never calls a paid invoice overdue, however late it was paid", () => {
    const paid = { ...base, amountPaid: 3_360_00, paidAt: at("2026-08-09T10:00:00Z") };
    assert.equal(describeInvoiceState("paid", paid, at("2026-08-20T09:00:00Z")), "paid Aug 9");
  });

  it("marks a part payment while still showing the clock", () => {
    const part = { ...base, amountPaid: 1_000_00 };
    assert.equal(
      describeInvoiceState("overdue", part, at("2026-07-26T09:00:00Z")),
      "part paid · 8 days overdue",
    );
  });

  it("says so before an invoice is issued", () => {
    assert.equal(
      describeInvoiceState("draft", { ...base, issuedAt: null, dueAt: null }, at("2026-07-10T09:00:00Z")),
      "not issued",
    );
  });

  it("says voided, whatever the dates say", () => {
    assert.equal(describeInvoiceState("void", base, at("2026-09-01T09:00:00Z")), "voided");
  });
});
