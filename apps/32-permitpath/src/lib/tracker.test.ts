/**
 * The application state machine and the permit-expiry rule.
 *
 * The derived-status test is the important one: a stored status column reconciled
 * by a nightly sweep is how an invoice ends up reading "Due" 212 days late, and a
 * permit reading "Issued" two months after it lapsed is the same bug wearing a
 * hard hat.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedTransitions, canTransition, computeExpiry, displayStatus, expiryRuleLabel } from "./tracker";

const DAY = 86_400_000;
const NOW = new Date("2026-08-03T12:00:00.000Z");

test("the timeline only moves the way a permit actually moves", () => {
  assert.deepEqual(allowedTransitions("not_submitted"), ["in_review"]);
  assert.ok(canTransition("in_review", "issued"));
  assert.ok(canTransition("issued", "stop_work"));
  assert.ok(canTransition("stop_work", "issued"));
  // No shortcut from the counter to issued, and nobody "sets" expired.
  assert.equal(canTransition("not_submitted", "issued"), false);
  assert.equal(canTransition("issued", "expired"), false);
  assert.equal(canTransition("in_review", "stop_work"), false);
});

test("an issued permit past its expiry reads expired without any sweep running", () => {
  const lapsed = { status: "issued" as const, expiresAt: new Date(NOW.getTime() - 3 * DAY) };
  assert.equal(displayStatus(lapsed, NOW), "expired");

  const live = { status: "issued" as const, expiresAt: new Date(NOW.getTime() + 3 * DAY) };
  assert.equal(displayStatus(live, NOW), "issued");
});

test("a stop-work order outranks the calendar", () => {
  const stopped = { status: "stop_work" as const, expiresAt: new Date(NOW.getTime() - 30 * DAY) };
  assert.equal(displayStatus(stopped, NOW), "stop_work");
});

test("statuses with no expiry are left alone", () => {
  assert.equal(displayStatus({ status: "in_review", expiresAt: null }, NOW), "in_review");
  assert.equal(displayStatus({ status: "not_submitted", expiresAt: null }, NOW), "not_submitted");
});

test("issuance-basis jurisdictions expire a fixed number of days after issuance", () => {
  const issued = new Date("2026-03-01T00:00:00.000Z");
  const expiry = computeExpiry("issuance", 180, issued, new Date("2026-06-01T00:00:00.000Z"));
  // Even with a passed inspection in June, the clock never restarted.
  assert.equal(expiry.toISOString(), "2026-08-28T00:00:00.000Z");
});

test("last-inspection jurisdictions restart the clock on every passed inspection", () => {
  const issued = new Date("2026-03-01T00:00:00.000Z");
  const withoutInspection = computeExpiry("last_inspection", 180, issued, null);
  assert.equal(withoutInspection.toISOString(), "2026-08-28T00:00:00.000Z");

  const inspected = computeExpiry(
    "last_inspection",
    180,
    issued,
    new Date("2026-06-01T00:00:00.000Z"),
  );
  assert.equal(inspected.toISOString(), "2026-11-28T00:00:00.000Z");
});

test("an inspection dated before issuance cannot pull the expiry backwards", () => {
  const issued = new Date("2026-03-01T00:00:00.000Z");
  const expiry = computeExpiry("last_inspection", 180, issued, new Date("2026-01-15T00:00:00.000Z"));
  assert.equal(expiry.toISOString(), "2026-08-28T00:00:00.000Z");
});

test("the rule is stated in words next to the date, so the date is believable", () => {
  assert.equal(
    expiryRuleLabel({ permitValidDays: 180, permitExpiryBasis: "last_inspection" }),
    "180 days after the last passed inspection",
  );
  assert.equal(
    expiryRuleLabel({ permitValidDays: 180, permitExpiryBasis: "issuance" }),
    "180 days from issuance",
  );
});
