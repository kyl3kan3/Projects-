/**
 * Damage settlement. The rule that matters: Stripe allows one capture per
 * authorisation, so all charged claims settle in a single partial capture and the
 * shortfall above the hold is reported rather than quietly swallowed.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  claimTotals,
  draftsFromCheck,
  feeOptions,
  planSettlement,
  type ClaimLike,
} from "@/lib/claims-core";

const claim = (id: string, amountCents: number, status: ClaimLike["status"] = "draft"): ClaimLike => ({
  id,
  amountCents,
  status,
});

test("nothing claimed means release the whole hold", () => {
  const plan = planSettlement([], 9_500);
  assert.equal(plan.releaseOnly, true);
  assert.equal(plan.captureCents, 0);
  assert.equal(plan.releasedCents, 9_500);
  assert.equal(plan.shortfallCents, 0);
});

test("one claim captures exactly the claim and releases the rest", () => {
  const plan = planSettlement([claim("a", 3_600)], 9_500);
  assert.equal(plan.captureCents, 3_600);
  assert.equal(plan.releasedCents, 5_900);
  assert.equal(plan.shortfallCents, 0);
  assert.deepEqual(plan.chargeIds, ["a"]);
});

test("several claims settle in one capture, not one each", () => {
  const plan = planSettlement([claim("a", 3_600), claim("b", 1_800), claim("c", 2_200)], 9_500);
  assert.equal(plan.captureCents, 7_600);
  assert.deepEqual(plan.chargeIds, ["a", "b", "c"]);
});

test("claims above the hold capture the hold and report the shortfall", () => {
  const plan = planSettlement([claim("a", 18_000)], 9_500);
  assert.equal(plan.captureCents, 9_500);
  assert.equal(plan.claimedCents, 18_000);
  assert.equal(plan.shortfallCents, 8_500);
  assert.equal(plan.releasedCents, 0);
});

test("waived and already-charged claims do not settle again", () => {
  const plan = planSettlement(
    [claim("a", 3_600, "waived"), claim("b", 2_000, "charged"), claim("c", 1_000)],
    9_500,
  );
  assert.deepEqual(plan.chargeIds, ["c"]);
  assert.equal(plan.captureCents, 1_000);
});

test("a disputed claim waits for a person", () => {
  const plan = planSettlement([claim("a", 3_600, "disputed")], 9_500);
  assert.equal(plan.releaseOnly, true);
  assert.equal(plan.captureCents, 0);
});

test("a zero-value draft is not a capture", () => {
  const plan = planSettlement([claim("a", 0)], 9_500);
  assert.equal(plan.releaseOnly, true);
  assert.deepEqual(plan.chargeIds, []);
});

test("no hold means nothing can be captured, whatever is claimed", () => {
  const plan = planSettlement([claim("a", 18_000)], 0);
  assert.equal(plan.captureCents, 0);
  assert.equal(plan.shortfallCents, 18_000);
  assert.equal(plan.releaseOnly, true);
});

test("claim totals split by status", () => {
  const totals = claimTotals([
    claim("a", 3_600),
    claim("b", 2_000, "charged"),
    claim("c", 1_000, "waived"),
    claim("d", 500, "disputed"),
  ]);
  assert.equal(totals.draftCents, 3_600);
  assert.equal(totals.chargedCents, 2_000);
  assert.equal(totals.waivedCents, 1_000);
  assert.equal(totals.disputedCents, 500);
});

test("fee options: item schedule first, then account defaults, deduped", () => {
  const options = feeOptions(
    [{ label: "Torn seat fabric", amountCents: 1_500 }],
    [
      { label: "Returned muddy — cleaning", amountCents: 4_500 },
      { label: "torn seat fabric", amountCents: 9_999 },
    ],
    2_400,
  );
  assert.deepEqual(options, [
    { label: "Torn seat fabric", amountCents: 1_500 },
    { label: "Returned muddy — cleaning", amountCents: 4_500 },
    { label: "Replacement", amountCents: 2_400 },
  ]);
});

test("fee options: replacement is offered even with no schedule at all", () => {
  assert.deepEqual(feeOptions([], [], 2_400), [{ label: "Replacement", amountCents: 2_400 }]);
  assert.deepEqual(feeOptions([], [], null), []);
});

const item = {
  name: "White folding chair",
  replacementCents: 2_400,
  damageFees: [{ label: "Torn seat fabric", amountCents: 1_500 }],
};

test("a check with damage drafts a claim priced from the schedule", () => {
  const drafts = draftsFromCheck({ quantityDamaged: 2, quantityMissing: 0 }, item);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].kind, "damage");
  assert.equal(drafts[0].amountCents, 3_000);
  assert.match(drafts[0].description, /Torn seat fabric/);
});

test("a check with missing units drafts at replacement cost", () => {
  const drafts = draftsFromCheck({ quantityDamaged: 0, quantityMissing: 3 }, item);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].kind, "missing");
  assert.equal(drafts[0].amountCents, 7_200);
});

test("both damaged and missing draft two separate claims", () => {
  const drafts = draftsFromCheck({ quantityDamaged: 1, quantityMissing: 1 }, item);
  assert.equal(drafts.length, 2);
  assert.deepEqual(
    drafts.map((d) => d.kind),
    ["missing", "damage"],
  );
});

test("a clean check drafts nothing", () => {
  assert.deepEqual(draftsFromCheck({ quantityDamaged: 0, quantityMissing: 0 }, item), []);
});

test("an item with no schedule and no replacement cost drafts a zero for a human to price", () => {
  const drafts = draftsFromCheck(
    { quantityDamaged: 2, quantityMissing: 0 },
    { name: "Pipe and drape", replacementCents: null, damageFees: [] },
  );
  assert.equal(drafts[0].amountCents, 0);
  // The wording must not imply a price was found.
  assert.match(drafts[0].description, /came back damaged/);
});
