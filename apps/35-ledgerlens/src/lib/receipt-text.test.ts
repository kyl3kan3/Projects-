import assert from "node:assert/strict";
import { test } from "node:test";
import { detectCurrency, detectDocType, findDates, parseReceiptText, summarizeLines } from "./receipt-text";
import { CONFIDENCE_AUTO } from "./confidence";

const HOME_DEPOT = `THE HOME DEPOT #4412
1600 S COLORADO BLVD, DENVER CO
Date: 03/12/2026

2X4-8FT PRIME STUD           14.28
DECK SCREWS 5LB              38.97
PVC ELBOW 2IN                 6.44
CAULK GUN                    12.99

Subtotal                     72.68
Sales Tax (8.81%)             6.40
Total                        79.08

VISA ************4471
`;

const STRIPE_EMAIL = `Subject: Your receipt from Jobber
From: Jobber <billing@getjobber.com>

Receipt from Jobber
Invoice date: March 4, 2026
Amount paid: $129.00

Jobber Core — monthly            129.00
Total                            129.00
`;

test("a labelled total is read with high confidence and beats the subtotal", () => {
  const parsed = parseReceiptText(HOME_DEPOT);
  assert.equal(parsed.total?.value, 7908);
  assert.ok(parsed.total!.confidence >= CONFIDENCE_AUTO, "a printed TOTAL line should auto-apply");
  assert.equal(parsed.tax?.value, 640);
  assert.equal(parsed.docDate?.value, "2026-03-12");
  assert.ok(parsed.docDate!.confidence >= CONFIDENCE_AUTO);
  assert.equal(parsed.vendor?.value, "THE HOME DEPOT #4412");
  assert.equal(parsed.currency, "USD");
});

test("the line summary lists items and excludes the totals block", () => {
  const summary = summarizeLines(HOME_DEPOT) ?? "";
  assert.match(summary, /2X4-8FT PRIME STUD/);
  assert.match(summary, /DECK SCREWS 5LB/);
  assert.doesNotMatch(summary, /Subtotal/i);
  assert.doesNotMatch(summary, /Sales Tax/i);
  assert.doesNotMatch(summary, /Total/i);
});

test("an emailed invoice body parses from its header lines", () => {
  const parsed = parseReceiptText(STRIPE_EMAIL);
  assert.equal(parsed.total?.value, 12900);
  assert.equal(parsed.docDate?.value, "2026-03-04");
  assert.equal(parsed.docType, "invoice");
  assert.ok(parsed.vendor, "a vendor should be found from the body");
});

/**
 * The most important behaviour in this parser: when it has to guess, it says so with a
 * confidence the policy will always flag.
 */
test("a page with no labelled total falls back to the largest amount, flagged", () => {
  const parsed = parseReceiptText("SOME SHOP\n03/12/2026\nthing $12.00\nthing $48.75\n");
  assert.equal(parsed.total?.value, 4875);
  assert.ok(
    parsed.total!.confidence < CONFIDENCE_AUTO,
    "a guessed total must never clear the auto threshold",
  );
});

test("a field that cannot be found is absent, not zero", () => {
  const parsed = parseReceiptText("Hello, here is my newsletter about plumbing.\n");
  assert.equal(parsed.total, undefined);
  assert.equal(parsed.tax, undefined);
  assert.equal(parsed.docDate, undefined);
});

test("a tax larger than the total is discarded rather than believed", () => {
  const parsed = parseReceiptText("SHOP\nTotal 10.00\nTax 250.00\n");
  assert.equal(parsed.total?.value, 1000);
  assert.equal(parsed.tax, undefined);
});

test("findDates reads the formats US receipts print", () => {
  const dates = findDates(
    "2026-03-12 and 3/4/26 and March 12, 2026 and 12 March 2026 and 04/05/2026",
  ).map((d) => d.date);
  assert.ok(dates.includes("2026-03-12"));
  assert.ok(dates.includes("2026-03-04"));
  assert.ok(dates.includes("2026-04-05"), "a bare numeric date is read US-style: month first");
});

/**
 * Found by the end-to-end harness: a merchant line with a six-digit terminal number was
 * being judged "too numeric" to be a name, so the whole receipt was rejected as having no
 * vendor. The ratio is now measured on the name without its store number.
 */
test("a merchant line with a long terminal number is still read as the vendor", () => {
  for (const [header, expected] of [
    ["SHELL OIL 574288", "SHELL OIL 574288"],
    ["THE HOME DEPOT #4412", "THE HOME DEPOT #4412"],
    ["TRACTOR SUPPLY CO #2265", "TRACTOR SUPPLY CO #2265"],
  ] as const) {
    const parsed = parseReceiptText(`${header}\n1600 S Colorado Blvd, Denver CO\n\nInvoice date: 2026-03-12\n\nDIESEL   64.55\nTotal   64.55\n`);
    assert.equal(parsed.vendor?.value, expected, `failed on ${header}`);
    assert.equal(parsed.total?.value, 6455);
  }
});

test("a street address and a bare written date are never mistaken for a merchant", () => {
  const parsed = parseReceiptText("1600 S Colorado Blvd\nMarch 12, 2026\nAce Hardware Broadway\nTotal 31.40\n");
  assert.equal(parsed.vendor?.value, "Ace Hardware Broadway");
});

test("a labelled date outranks an unlabelled one earlier in the document", () => {
  const parsed = parseReceiptText("Order #2026-01-01\nSHOP\nTransaction date: 03/12/2026\nTotal 5.00\n");
  assert.equal(parsed.docDate?.value, "2026-03-12");
});

test("currency and doc type detection", () => {
  assert.equal(detectCurrency("Total $12.00"), "USD");
  assert.equal(detectCurrency("Total €12,00"), "EUR");
  assert.equal(detectCurrency("Total £12.00"), "GBP");
  assert.equal(detectDocType("INVOICE #4471 due on receipt"), "invoice");
  assert.equal(detectDocType("Thank you for your purchase — receipt"), "receipt");
  assert.equal(detectDocType("Statement period: opening balance 0.00"), "statement");
});
