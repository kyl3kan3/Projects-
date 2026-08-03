/**
 * The curation console's line parsers. A curator typing a fee schedule at speed is
 * the last place a float should be able to sneak into money.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFeeLines, parseSubmittals } from "./curation-parse";

test("fee lines become integer cents", () => {
  const { fees, error } = parseFeeLines(
    "Mechanical permit fee | 96.50 | Flat residential rate\nState construction technology fee | 2.00",
  );
  assert.equal(error, null);
  assert.deepEqual(fees, [
    { label: "Mechanical permit fee", amountCents: 9_650, notes: "Flat residential rate" },
    { label: "State construction technology fee", amountCents: 200 },
  ]);
});

test("a fraction of a cent rounds once, at the edge", () => {
  const { fees } = parseFeeLines("Plan review | 32.005");
  assert.equal(fees[0].amountCents, 3_201);
});

test("a malformed fee line is refused with the line quoted back", () => {
  const missingAmount = parseFeeLines("Mechanical permit fee");
  assert.match(missingAmount.error ?? "", /Could not read fee line: "Mechanical permit fee"/);

  const notANumber = parseFeeLines("Mechanical permit fee | ninety-six");
  assert.match(notANumber.error ?? "", /not an amount in dollars/);

  const negative = parseFeeLines("Refund | -20");
  assert.match(negative.error ?? "", /not an amount in dollars/);
});

test("blank lines are ignored rather than treated as errors", () => {
  const { fees, error } = parseFeeLines("\n  \nBuilding permit fee | 124.00\n\n");
  assert.equal(error, null);
  assert.equal(fees.length, 1);
});

test("submittals default to required and honour the conditional flag", () => {
  const { submittals, error } = parseSubmittals(
    "Equipment cut sheets | Model numbers and rated capacity | required\nManual J load calculation | Required above 5 tons | conditional\nContractor licence | Current at submittal",
  );
  assert.equal(error, null);
  assert.deepEqual(
    submittals.map((s) => [s.title, s.required]),
    [
      ["Equipment cut sheets", true],
      ["Manual J load calculation", false],
      ["Contractor licence", true],
    ],
  );
});

test("a submittal with no detail is refused", () => {
  const { error } = parseSubmittals("Structural letter");
  assert.match(error ?? "", /Could not read submittal line/);
});
