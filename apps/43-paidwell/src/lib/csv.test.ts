import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SAMPLE_CSV, detectColumns, parseCsv, parseDateCell, planImport } from "@/lib/csv";

describe("parseCsv", () => {
  it("reads quoted fields, doubled quotes and CRLF", () => {
    const parsed = parseCsv(
      'Customer,Note\r\n"Fable & Vine, Ltd","They said ""next week"""\r\nHarbourline,Fine\r\n',
    );
    assert.deepEqual(parsed.headers, ["Customer", "Note"]);
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[0].Customer, "Fable & Vine, Ltd");
    assert.equal(parsed.rows[0].Note, 'They said "next week"');
  });

  it("strips a BOM and blank lines Excel leaves behind", () => {
    const parsed = parseCsv("﻿a,b\n1,2\n\n\n");
    assert.deepEqual(parsed.headers, ["a", "b"]);
    assert.equal(parsed.rows.length, 1);
  });

  it("returns nothing for an empty file rather than throwing", () => {
    assert.deepEqual(parseCsv(""), { headers: [], rows: [] });
  });
});

describe("detectColumns", () => {
  it("recognises the names real exports use", () => {
    const columns = detectColumns([
      "Customer Name",
      "Billing Email",
      "Invoice No",
      "Issue Date",
      "Due Date",
      "Amount Due",
      "Currency",
    ]);
    assert.equal(columns.clientName, "Customer Name");
    assert.equal(columns.clientEmail, "Billing Email");
    assert.equal(columns.number, "Invoice No");
    assert.equal(columns.issuedAt, "Issue Date");
    assert.equal(columns.dueAt, "Due Date");
    assert.equal(columns.balanceCents, "Amount Due");
  });

  it("tolerates snake_case and odd spacing", () => {
    const columns = detectColumns(["client_name", "invoice  number", "TOTAL"]);
    assert.equal(columns.clientName, "client_name");
    assert.equal(columns.number, "invoice  number");
    assert.equal(columns.amountCents, "TOTAL");
  });
});

describe("parseDateCell", () => {
  it("prefers ISO", () => {
    assert.equal(parseDateCell("2026-07-10"), "2026-07-10");
  });

  it("reads slash dates US-style, and D/M when the first part cannot be a month", () => {
    assert.equal(parseDateCell("7/10/2026"), "2026-07-10");
    assert.equal(parseDateCell("13/07/2026"), "2026-07-13");
    assert.equal(parseDateCell("7/4/26"), "2026-07-04");
  });

  it("reads written months both ways round", () => {
    assert.equal(parseDateCell("10 Jul 2026"), "2026-07-10");
    assert.equal(parseDateCell("July 10, 2026"), "2026-07-10");
  });

  it("refuses an impossible date instead of rolling it over", () => {
    assert.equal(parseDateCell("2026-02-30"), null);
    assert.equal(parseDateCell("31/02/2026"), null);
    assert.equal(parseDateCell("sometime soon"), null);
    assert.equal(parseDateCell(""), null);
  });
});

describe("planImport", () => {
  it("imports the sample file cleanly", () => {
    const plan = planImport(parseCsv(SAMPLE_CSV));
    assert.deepEqual(plan.problems, []);
    assert.equal(plan.rows.length, 3);
    const [first] = plan.rows;
    assert.equal(first.clientName, "Meridian Co");
    assert.equal(first.clientEmail, "ap@meridian.co");
    assert.equal(first.number, "INV-2041");
    assert.equal(first.issuedAt, "2026-05-20");
    assert.equal(first.dueAt, "2026-06-19");
    assert.equal(first.amountCents, 1_240_000);
    assert.equal(first.balanceCents, 1_240_000);
    // The partially paid row keeps its real balance.
    assert.equal(plan.rows[1].amountCents, 485_000);
    assert.equal(plan.rows[1].balanceCents, 200_000);
  });

  it("reports a missing required column instead of importing half a file", () => {
    const plan = planImport(parseCsv("Customer,Due Date\nMeridian Co,2026-07-10"));
    assert.equal(plan.rows.length, 0);
    assert.ok(plan.problems.some((p) => /invoice number/.test(p.message)));
    assert.ok(plan.problems.some((p) => /amount/.test(p.message)));
  });

  it("names the line for every bad row and keeps the good ones", () => {
    const plan = planImport(
      parseCsv(
        [
          "Customer,Invoice Number,Due Date,Total",
          "Meridian Co,INV-1,2026-07-10,1200.00",
          ",INV-2,2026-07-10,900.00",
          "Harbourline,INV-3,2026-07-10,n/a",
          "Fable & Vine,INV-4,not a date,500.00",
          "Northgate,INV-5,2026-07-10,0",
        ].join("\n"),
      ),
    );
    assert.equal(plan.rows.length, 1);
    assert.equal(plan.rows[0].number, "INV-1");
    assert.deepEqual(
      plan.problems.map((p) => p.line),
      [3, 4, 5, 6],
    );
    assert.ok(plan.problems.some((p) => /Missing client name/.test(p.message)));
    assert.ok(plan.problems.some((p) => /Could not read the amount/.test(p.message)));
    assert.ok(plan.problems.some((p) => /no readable issue or due date/.test(p.message)));
    assert.ok(plan.problems.some((p) => /zero or negative/.test(p.message)));
  });

  it("derives a due date from the terms when the file has only an issue date", () => {
    const plan = planImport(
      parseCsv("Customer,Invoice Number,Invoice Date,Total\nMeridian Co,INV-9,2026-06-01,1000.00"),
      45,
    );
    assert.equal(plan.rows[0].dueAt, "2026-07-16");
  });

  it("derives an issue date backwards when the file has only a due date", () => {
    const plan = planImport(
      parseCsv("Customer,Invoice Number,Due Date,Total\nMeridian Co,INV-9,2026-07-16,1000.00"),
      45,
    );
    assert.equal(plan.rows[0].issuedAt, "2026-06-01");
  });

  it("catches a duplicate inside one file", () => {
    const plan = planImport(
      parseCsv(
        [
          "Customer,Invoice Number,Due Date,Total",
          "Meridian Co,INV-1,2026-07-10,1200.00",
          "meridian co,inv-1,2026-07-10,1200.00",
        ].join("\n"),
      ),
    );
    assert.equal(plan.rows.length, 1);
    assert.ok(plan.problems.some((p) => /Duplicate invoice/.test(p.message)));
  });

  it("rejects a malformed email rather than mailing into the void", () => {
    const plan = planImport(
      parseCsv(
        "Customer,Email,Invoice Number,Due Date,Total\nMeridian Co,dana at meridian,INV-1,2026-07-10,10.00",
      ),
    );
    assert.equal(plan.rows.length, 0);
    assert.ok(plan.problems.some((p) => /email address/.test(p.message)));
  });

  it("clamps a balance above the invoice total", () => {
    const plan = planImport(
      parseCsv(
        "Customer,Invoice Number,Due Date,Total,Balance\nMeridian Co,INV-1,2026-07-10,1000.00,5000.00",
      ),
    );
    assert.equal(plan.rows[0].balanceCents, 100_000);
  });

  it("lists columns it ignored so nothing looks silently dropped", () => {
    const plan = planImport(
      parseCsv("Customer,Invoice Number,Due Date,Total,Project Code\nMeridian Co,INV-1,2026-07-10,10.00,PRJ-4"),
    );
    assert.deepEqual(plan.ignored, ["Project Code"]);
  });
});
