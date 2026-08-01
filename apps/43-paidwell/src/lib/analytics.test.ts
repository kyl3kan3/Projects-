import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agingReport,
  buildForecast,
  clientBehaviour,
  describeBehaviour,
  dsoAsOf,
  dsoDelta,
  dsoSeries,
  expectedReceipt,
  type ForecastInvoice,
} from "@/lib/analytics";

const TODAY = "2026-07-10";

describe("agingReport", () => {
  it("buckets by days past due, with 0–30 covering not-yet-due", () => {
    const report = agingReport(
      [
        { dueAt: "2026-07-31", balanceCents: 500_000 }, // not due
        { dueAt: "2026-07-01", balanceCents: 300_000 }, // 9 days
        { dueAt: "2026-06-01", balanceCents: 200_000 }, // 39 days
        { dueAt: "2026-05-01", balanceCents: 150_000 }, // 70 days
        { dueAt: "2026-01-01", balanceCents: 100_000 }, // 190 days
      ],
      TODAY,
    );
    assert.equal(report.buckets.current.amountCents, 800_000);
    assert.equal(report.buckets.current.count, 2);
    assert.equal(report.buckets.d31to60.amountCents, 200_000);
    assert.equal(report.buckets.d61to90.amountCents, 150_000);
    assert.equal(report.buckets.d90plus.amountCents, 100_000);
    assert.equal(report.outstandingCents, 1_250_000);
    assert.equal(report.overdueCents, 750_000);
    assert.equal(report.overdueCount, 4);
  });

  it("ignores settled invoices entirely", () => {
    const report = agingReport(
      [
        { dueAt: "2026-01-01", balanceCents: 0 },
        { dueAt: "2026-06-01", balanceCents: 100_000 },
      ],
      TODAY,
    );
    assert.equal(report.invoiceCount, 1);
    assert.equal(report.outstandingCents, 100_000);
  });

  it("handles an empty book without dividing by anything", () => {
    const report = agingReport([], TODAY);
    assert.equal(report.outstandingCents, 0);
    assert.equal(report.buckets.d90plus.count, 0);
  });

  it("bucket boundaries are exact", () => {
    // 30 days late is the last day of 0–30; 31 crosses.
    assert.equal(
      agingReport([{ dueAt: "2026-06-10", balanceCents: 100 }], TODAY).buckets.current.count,
      1,
    );
    assert.equal(
      agingReport([{ dueAt: "2026-06-09", balanceCents: 100 }], TODAY).buckets.d31to60.count,
      1,
    );
  });
});

describe("dsoAsOf", () => {
  /**
   * Hand-computed: three invoices of $10,000 each raised 10, 40 and 70 days
   * before today, one fully paid. Receivables = $20,000. Invoiced in the
   * trailing 90 days = $30,000. DSO = 20/30 × 90 = 60.
   */
  const invoices = [
    { id: "a", issuedAt: "2026-06-30", amountCents: 1_000_000 },
    { id: "b", issuedAt: "2026-05-31", amountCents: 1_000_000 },
    { id: "c", issuedAt: "2026-05-01", amountCents: 1_000_000 },
  ];
  const payments = [{ invoiceId: "c", paidAt: "2026-06-15", amountCents: 1_000_000 }];

  it("matches the hand calculation", () => {
    assert.equal(dsoAsOf(invoices, payments, TODAY, 90), 60);
  });

  it("counts a payment only once it has been received", () => {
    const future = [{ invoiceId: "a", paidAt: "2026-08-01", amountCents: 1_000_000 }];
    assert.equal(dsoAsOf(invoices, [...payments, ...future], TODAY, 90), 60);
  });

  it("returns null rather than a flattering zero when nothing was invoiced", () => {
    assert.equal(dsoAsOf([], [], TODAY), null);
    assert.equal(
      dsoAsOf([{ id: "old", issuedAt: "2025-01-01", amountCents: 500_000 }], [], TODAY, 90),
      null,
    );
  });

  it("reports a trend and its direction", () => {
    const series = dsoSeries(invoices, payments, TODAY, 3);
    assert.equal(series.length, 3);
    assert.equal(series[series.length - 1].dso, 60);
    const delta = dsoDelta(series);
    assert.ok(delta === null || Number.isInteger(delta));
  });
});

describe("clientBehaviour", () => {
  it("separates 'predictable' from 'reliable'", () => {
    // Always 30 days late, but always exactly 30: perfectly predictable, 0% on time.
    const chronic = clientBehaviour([
      { issuedAt: "2026-01-01", dueAt: "2026-01-31", paidAt: "2026-03-02" },
      { issuedAt: "2026-02-01", dueAt: "2026-03-03", paidAt: "2026-04-02" },
    ]);
    assert.equal(chronic.reliabilityScore, 0);
    assert.equal(chronic.avgDaysLate, 30);
    assert.equal(chronic.paidInvoiceCount, 2);

    const good = clientBehaviour([
      { issuedAt: "2026-01-01", dueAt: "2026-01-31", paidAt: "2026-01-20" },
      { issuedAt: "2026-02-01", dueAt: "2026-03-03", paidAt: "2026-03-03" },
    ]);
    assert.equal(good.reliabilityScore, 100);
    assert.equal(good.avgDaysLate, 0);
  });

  it("computes average days to pay from the invoice date", () => {
    const behaviour = clientBehaviour([
      { issuedAt: "2026-01-01", dueAt: "2026-01-31", paidAt: "2026-02-10" }, // 40
      { issuedAt: "2026-03-01", dueAt: "2026-03-31", paidAt: "2026-04-04" }, // 34
    ]);
    assert.equal(behaviour.avgDaysToPay, 37);
  });

  it("says so when there is no history", () => {
    const behaviour = clientBehaviour([]);
    assert.equal(behaviour.avgDaysToPay, null);
    assert.equal(describeBehaviour(behaviour), "no payment history yet");
  });

  it("describes behaviour in the row's own words", () => {
    const behaviour = clientBehaviour([
      { issuedAt: "2026-01-01", dueAt: "2026-01-31", paidAt: "2026-02-17" },
    ]);
    assert.equal(describeBehaviour(behaviour), "pays in 47d · 0% on time · 1 paid");
  });
});

describe("expectedReceipt", () => {
  const base: ForecastInvoice = {
    id: "i1",
    number: "INV-2041",
    clientName: "Meridian Co",
    issuedAt: "2026-06-10",
    dueAt: "2026-07-31",
    balanceCents: 1_240_000,
  };

  it("uses an open promise first, weighted by the client's record", () => {
    const reliable = expectedReceipt(
      { ...base, promisedFor: "2026-07-17", reliabilityScore: 95 },
      TODAY,
    );
    assert.equal(reliable.expectedOn, "2026-07-17");
    assert.equal(reliable.basis, "promise");
    assert.equal(reliable.confidence, 95);

    const flaky = expectedReceipt(
      { ...base, promisedFor: "2026-07-17", reliabilityScore: 40 },
      TODAY,
    );
    assert.equal(flaky.confidence, 40);
  });

  it("falls back to how this client actually behaves", () => {
    const receipt = expectedReceipt(
      { ...base, avgDaysToPay: 47, paidInvoiceCount: 8, reliabilityScore: 50 },
      TODAY,
    );
    // 10 June + 47 days = 27 July.
    assert.equal(receipt.expectedOn, "2026-07-27");
    assert.equal(receipt.basis, "behaviour");
  });

  it("falls back to the terms for a client with no history", () => {
    const receipt = expectedReceipt(base, TODAY);
    assert.equal(receipt.expectedOn, "2026-07-31");
    assert.equal(receipt.basis, "terms");
    assert.equal(receipt.confidence, 50);
  });

  it("never forecasts money into the past", () => {
    const receipt = expectedReceipt({ ...base, dueAt: "2026-05-01" }, TODAY);
    assert.equal(receipt.expectedOn, "2026-07-17"); // a week out
    assert.ok(receipt.confidence < 50, "and it believes it less");
  });

  it("a promise for yesterday is expected today, not yesterday", () => {
    const receipt = expectedReceipt({ ...base, promisedFor: "2026-07-09" }, TODAY);
    assert.equal(receipt.expectedOn, TODAY);
  });
});

describe("buildForecast", () => {
  /**
   * Hand-computed. Today is Friday 10 July 2026, so the first column is Monday
   * 6 July and the eight columns run to 30 August.
   *
   *   INV-1  promised 17 Jul (Fri)  $ 8,000  -> week of 13 Jul
   *   INV-2  promised 17 Jul (Fri)  $ 2,000  -> week of 13 Jul
   *   INV-3  terms, due 31 Jul     $12,000  -> week of 27 Jul
   *   INV-4  behaviour, 10 Jun + 47 = 27 Jul  $ 5,000 -> week of 27 Jul
   *   INV-5  terms, due 15 Nov     $ 9,000  -> beyond the horizon
   */
  const invoices: ForecastInvoice[] = [
    {
      id: "1", number: "INV-1", clientName: "Meridian Co",
      issuedAt: "2026-06-01", dueAt: "2026-07-01", balanceCents: 800_000,
      promisedFor: "2026-07-17", reliabilityScore: 90,
    },
    {
      id: "2", number: "INV-2", clientName: "Harbourline",
      issuedAt: "2026-06-05", dueAt: "2026-07-05", balanceCents: 200_000,
      promisedFor: "2026-07-17", reliabilityScore: 50,
    },
    {
      id: "3", number: "INV-3", clientName: "Fable & Vine",
      issuedAt: "2026-07-01", dueAt: "2026-07-31", balanceCents: 1_200_000,
    },
    {
      id: "4", number: "INV-4", clientName: "Meridian Co",
      issuedAt: "2026-06-10", dueAt: "2026-07-10", balanceCents: 500_000,
      avgDaysToPay: 47, paidInvoiceCount: 8, reliabilityScore: 60,
    },
    {
      id: "5", number: "INV-5", clientName: "Northgate",
      issuedAt: "2026-10-16", dueAt: "2026-11-15", balanceCents: 900_000,
    },
  ];

  const forecast = buildForecast(invoices, TODAY, 8);

  it("opens on the Monday of the current week and runs eight columns", () => {
    assert.equal(forecast.weeks.length, 8);
    assert.equal(forecast.weeks[0].weekStart, "2026-07-06");
    assert.equal(forecast.weeks[7].weekStart, "2026-08-24");
  });

  it("lands each receipt in the hand-computed week", () => {
    const byWeek = new Map(forecast.weeks.map((w) => [w.weekStart, w.expectedCents]));
    assert.equal(byWeek.get("2026-07-06"), 0);
    assert.equal(byWeek.get("2026-07-13"), 1_000_000); // the two promises
    assert.equal(byWeek.get("2026-07-27"), 1_700_000); // terms + behaviour
    assert.equal(byWeek.get("2026-08-03"), 0);
  });

  it("totals to the hand-computed figure and keeps the far invoice out of it", () => {
    assert.equal(forecast.totalCents, 2_700_000);
    assert.equal(forecast.beyondHorizonCents, 900_000);
    assert.equal(forecast.promiseCount, 2);
    assert.equal(forecast.invoiceCount, 5);
  });

  it("weights the total by confidence — the number to plan around", () => {
    // 8,000 × 90% + 2,000 × 50% + 12,000 × 50% + 5,000 × (avg of 64 and 60 = 62)
    //  = 7,200 + 1,000 + 6,000 + 3,100 = 17,300
    assert.equal(forecast.weightedCents, 1_730_000);
    assert.ok(forecast.weightedCents < forecast.totalCents);
  });

  it("reports a per-column confidence that is amount-weighted", () => {
    const promiseWeek = forecast.weeks.find((w) => w.weekStart === "2026-07-13")!;
    // (8,000 × 90 + 2,000 × 50) / 10,000 = 82
    assert.equal(promiseWeek.confidence, 82);
  });

  it("carries the basis of every dollar so the screen can explain itself", () => {
    const bases = forecast.weeks.flatMap((w) => w.receipts.map((r) => r.basis));
    assert.deepEqual([...new Set(bases)].sort(), ["behaviour", "promise", "terms"]);
  });

  it("returns empty columns rather than nothing when the book is empty", () => {
    const empty = buildForecast([], TODAY, 8);
    assert.equal(empty.weeks.length, 8);
    assert.equal(empty.totalCents, 0);
  });

  it("skips settled invoices", () => {
    const withPaid = buildForecast(
      [...invoices, { ...invoices[2], id: "6", number: "INV-6", balanceCents: 0 }],
      TODAY,
      8,
    );
    assert.equal(withPaid.totalCents, forecast.totalCents);
  });
});
