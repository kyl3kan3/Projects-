/**
 * Check-off counts and the return outcome. "38 of 40 accounted for" is not an
 * answer, so the validator refuses it.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isClean,
  loadOutProgress,
  returnOutcome,
  validateCounts,
} from "@/lib/checkin-core";

test("counts must add up to the line quantity exactly", () => {
  assert.equal(validateCounts({ quantityOk: 40, quantityDamaged: 0, quantityMissing: 0 }, 40).ok, true);
  assert.equal(validateCounts({ quantityOk: 38, quantityDamaged: 2, quantityMissing: 0 }, 40).ok, true);
  assert.equal(validateCounts({ quantityOk: 38, quantityDamaged: 0, quantityMissing: 0 }, 40).ok, false);
  assert.equal(validateCounts({ quantityOk: 41, quantityDamaged: 0, quantityMissing: 0 }, 40).ok, false);
});

test("the error says what it adds up to and what it should", () => {
  const result = validateCounts({ quantityOk: 38, quantityDamaged: 0, quantityMissing: 0 }, 40);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /38/);
    assert.match(result.error, /40/);
  }
});

test("negative and fractional counts are refused", () => {
  assert.equal(validateCounts({ quantityOk: -1, quantityDamaged: 41, quantityMissing: 0 }, 40).ok, false);
  assert.equal(validateCounts({ quantityOk: 39.5, quantityDamaged: 0.5, quantityMissing: 0 }, 40).ok, false);
});

test("isClean", () => {
  assert.equal(isClean({ quantityOk: 40, quantityDamaged: 0, quantityMissing: 0 }), true);
  assert.equal(isClean({ quantityOk: 39, quantityDamaged: 1, quantityMissing: 0 }), false);
  assert.equal(isClean({ quantityOk: 39, quantityDamaged: 0, quantityMissing: 1 }), false);
});

const lines = [
  { orderLineId: "a", quantity: 40 },
  { orderLineId: "b", quantity: 10 },
];

test("a return is incomplete until every line is checked", () => {
  const partial = returnOutcome(lines, [
    { orderLineId: "a", quantityOk: 40, quantityDamaged: 0, quantityMissing: 0 },
  ]);
  assert.equal(partial.complete, false);
  assert.equal(partial.clean, false); // not "clean" — unknown
  assert.equal(partial.linesChecked, 1);
});

test("all lines clean is a clean return", () => {
  const outcome = returnOutcome(lines, [
    { orderLineId: "a", quantityOk: 40, quantityDamaged: 0, quantityMissing: 0 },
    { orderLineId: "b", quantityOk: 10, quantityDamaged: 0, quantityMissing: 0 },
  ]);
  assert.equal(outcome.complete, true);
  assert.equal(outcome.clean, true);
  assert.equal(outcome.damagedTotal, 0);
});

test("one damaged unit anywhere means the return is not clean", () => {
  const outcome = returnOutcome(lines, [
    { orderLineId: "a", quantityOk: 40, quantityDamaged: 0, quantityMissing: 0 },
    { orderLineId: "b", quantityOk: 8, quantityDamaged: 2, quantityMissing: 0 },
  ]);
  assert.equal(outcome.complete, true);
  assert.equal(outcome.clean, false);
  assert.equal(outcome.damagedTotal, 2);
});

test("missing units are counted separately from damaged", () => {
  const outcome = returnOutcome(lines, [
    { orderLineId: "a", quantityOk: 38, quantityDamaged: 1, quantityMissing: 1 },
    { orderLineId: "b", quantityOk: 10, quantityDamaged: 0, quantityMissing: 0 },
  ]);
  assert.equal(outcome.damagedTotal, 1);
  assert.equal(outcome.missingTotal, 1);
});

test("checks for lines that are not on the order are ignored", () => {
  const outcome = returnOutcome(lines, [
    { orderLineId: "a", quantityOk: 40, quantityDamaged: 0, quantityMissing: 0 },
    { orderLineId: "b", quantityOk: 10, quantityDamaged: 0, quantityMissing: 0 },
    { orderLineId: "ghost", quantityOk: 5, quantityDamaged: 5, quantityMissing: 0 },
  ]);
  assert.equal(outcome.clean, true);
  assert.equal(outcome.damagedTotal, 0);
});

test("an order with no lines is never complete", () => {
  const outcome = returnOutcome([], []);
  assert.equal(outcome.complete, false);
  assert.equal(outcome.clean, false);
});

test("load-out progress counts checks against lines", () => {
  assert.deepEqual(loadOutProgress(lines, []), { checked: 0, total: 2, complete: false });
  assert.deepEqual(loadOutProgress(lines, [{ orderLineId: "a" }]), {
    checked: 1,
    total: 2,
    complete: false,
  });
  assert.deepEqual(loadOutProgress(lines, [{ orderLineId: "a" }, { orderLineId: "b" }]), {
    checked: 2,
    total: 2,
    complete: true,
  });
});
