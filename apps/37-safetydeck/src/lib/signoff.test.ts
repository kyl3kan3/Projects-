/**
 * Absentee reconciliation.
 *
 * This exists because of a real defect: the first version filtered signers out
 * of the absent list and then fell back to the *stored* list when the filtered
 * one came out empty — so a person who was marked absent and then signed from a
 * second phone stayed marked absent, beside their own signature, forever.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { reconcileAbsentees } from "./signoff";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const C = "cccccccc-0000-0000-0000-000000000003";
const OFF_ROSTER = "dddddddd-0000-0000-0000-000000000004";
const roster = [A, B, C];

test("a close-out records everyone without a signature", () => {
  assert.deepEqual(
    reconcileAbsentees({ reported: [B, C], stored: null, rosterIds: roster, signedIds: [A] }),
    [B, C],
  );
});

test("someone who has signed is never absent, even if the device says so", () => {
  assert.deepEqual(
    reconcileAbsentees({ reported: [A, B], stored: null, rosterIds: roster, signedIds: [A] }),
    [B],
  );
});

test("a late signature clears a stored absence", () => {
  // The huddle was closed with B absent; B then signed from another phone. The
  // sync that carries B's signature reports no absentees at all.
  assert.deepEqual(
    reconcileAbsentees({ reported: undefined, stored: [B], rosterIds: roster, signedIds: [A, B] }),
    [],
    "an empty result must be written, not swapped back for the stale list",
  );
});

test("a stored absence survives a sync that says nothing about absentees", () => {
  assert.deepEqual(
    reconcileAbsentees({ reported: undefined, stored: [C], rosterIds: roster, signedIds: [A] }),
    [C],
  );
});

test("a fresh close-out replaces the stored list rather than merging with it", () => {
  assert.deepEqual(
    reconcileAbsentees({ reported: [C], stored: [B, C], rosterIds: roster, signedIds: [A, B] }),
    [C],
  );
});

test("ids that are not on the roster are dropped", () => {
  assert.deepEqual(
    reconcileAbsentees({ reported: [B, OFF_ROSTER], stored: null, rosterIds: roster, signedIds: [] }),
    [B],
  );
});

test("duplicates collapse", () => {
  assert.deepEqual(
    reconcileAbsentees({ reported: [B, B, C], stored: null, rosterIds: roster, signedIds: [] }),
    [B, C],
  );
});

test("a fully signed crew has no absentees", () => {
  assert.deepEqual(
    reconcileAbsentees({ reported: [], stored: [B], rosterIds: roster, signedIds: roster }),
    [],
  );
});
