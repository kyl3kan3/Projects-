import assert from "node:assert/strict";
import { test } from "node:test";
import { STALE_EXTRACTING_MS, displayStatus, sourceLabel, type DisplayStatusInput } from "./documents";

const BASE: DisplayStatusInput = {
  status: "confirmed",
  duplicateOfId: null,
  extractingSince: null,
  openReviewCount: 0,
  hasLineItem: true,
  lineItemConfirmed: true,
  atCap: false,
};

/**
 * The bug this guards against: rendering a stored status column that background work
 * maintains, so the screen shows "Due" on an invoice 212 days late. Status is derived at
 * read time from the facts.
 */
test("an unresolved review item wins over a stale 'confirmed' column", () => {
  assert.equal(
    displayStatus({ ...BASE, status: "confirmed", openReviewCount: 1 }),
    "needs_review",
  );
});

test("a confirmed line item wins over a stale 'needs_review' column", () => {
  assert.equal(
    displayStatus({ ...BASE, status: "needs_review", openReviewCount: 0, lineItemConfirmed: true }),
    "confirmed",
  );
});

test("a duplicate is a duplicate however the column reads", () => {
  assert.equal(displayStatus({ ...BASE, duplicateOfId: "abc" }), "duplicate");
  assert.equal(
    displayStatus({ ...BASE, status: "duplicate", duplicateOfId: null }),
    "duplicate",
  );
  // Even a document with an open review item, once merged, stops asking.
  assert.equal(
    displayStatus({ ...BASE, duplicateOfId: "abc", openReviewCount: 3 }),
    "duplicate",
  );
});

test("a rejected document is never shown as reviewable", () => {
  assert.equal(
    displayStatus({ ...BASE, status: "rejected", hasLineItem: false, lineItemConfirmed: false }),
    "rejected",
  );
});

/**
 * A process that died mid-extraction must not strand a document in "extracting" forever;
 * after the stale window it reads as queued again, which is exactly what the sweep will
 * treat it as.
 */
test("an extraction that has been running too long reads as queued again", () => {
  const now = Date.UTC(2026, 2, 12, 12, 0, 0);
  const fresh: DisplayStatusInput = {
    ...BASE,
    status: "extracting",
    hasLineItem: false,
    lineItemConfirmed: false,
    extractingSince: new Date(now - 30_000),
    now,
  };
  assert.equal(displayStatus(fresh), "extracting");
  assert.equal(
    displayStatus({ ...fresh, extractingSince: new Date(now - STALE_EXTRACTING_MS - 1_000) }),
    "queued",
  );
  // A null timestamp is treated as ancient rather than as "just started".
  assert.equal(displayStatus({ ...fresh, extractingSince: null }), "queued");
});

/** The cap is derived from the live counter, so an upgrade un-parks documents instantly. */
test("a queued document reads as parked only while the org is over its cap", () => {
  const queued: DisplayStatusInput = {
    ...BASE,
    status: "queued",
    hasLineItem: false,
    lineItemConfirmed: false,
  };
  assert.equal(displayStatus(queued), "queued");
  assert.equal(displayStatus({ ...queued, atCap: true }), "parked");
});

test("an extracted-but-never-vouched-for entry is a review, not a confirmation", () => {
  assert.equal(
    displayStatus({
      ...BASE,
      status: "needs_review",
      openReviewCount: 0,
      hasLineItem: true,
      lineItemConfirmed: false,
    }),
    "needs_review",
  );
  assert.equal(
    displayStatus({
      ...BASE,
      status: "needs_review",
      openReviewCount: 0,
      hasLineItem: false,
      lineItemConfirmed: false,
    }),
    "queued",
  );
});

test("source labels read the way the inbox row needs them", () => {
  assert.equal(sourceLabel("email"), "forwarded");
  assert.equal(sourceLabel("photo"), "photo");
  assert.equal(sourceLabel("upload"), "uploaded");
});
