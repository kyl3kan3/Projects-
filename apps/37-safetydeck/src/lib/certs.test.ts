/**
 * The cert ladder. Two failure modes are being tested against explicitly: a
 * ladder that never stops (an "expired" state that mails someone every morning
 * forever) and a ladder that goes silent (selecting the loosest crossed rung, so
 * the 60-day warning fires and nothing else ever does).
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { deriveStatus, dueRung, expiryLabel } from "./certs";

const today = "2026-08-03";

test("status is derived from today, not stored", () => {
  assert.equal(deriveStatus("2026-12-01", today), "valid");
  assert.equal(deriveStatus("2026-10-02", today), "expiring", "60 days out");
  assert.equal(deriveStatus("2026-08-03", today), "expiring", "expires today");
  assert.equal(deriveStatus("2026-08-02", today), "expired");
  assert.equal(deriveStatus(null, today), "valid", "no expiry means nothing to expire");
});

test("the boundary of the expiring window is inclusive at 60 days", () => {
  assert.equal(deriveStatus("2026-10-02", today), "expiring");
  assert.equal(deriveStatus("2026-10-03", today), "valid", "61 days out");
});

test("the tightest crossed rung wins, so the ladder keeps escalating", () => {
  assert.equal(dueRung("2026-10-02", today)?.rung, "60d");
  assert.equal(dueRung("2026-09-02", today)?.rung, "30d", "30 days out is not the 60-day rung");
  assert.equal(dueRung("2026-08-10", today)?.rung, "7d");
  assert.equal(dueRung("2026-08-03", today)?.rung, "7d", "expires today");
});

test("a cert outside the window is on no rung at all", () => {
  assert.equal(dueRung("2027-01-01", today), null);
  assert.equal(dueRung(null, today), null);
});

test("expiry produces exactly one overdue rung, not one a day forever", () => {
  const yesterday = dueRung("2026-08-02", today);
  const lastMonth = dueRung("2026-07-01", today);
  const lastYear = dueRung("2025-08-02", today);
  assert.equal(yesterday?.rung, "overdue");
  assert.equal(lastMonth?.rung, "overdue");
  assert.equal(lastYear?.rung, "overdue");
  // All three are the same (target, rung) pair, and the reminders table has a
  // unique index on it — which is what makes the notice fire once, ever.
  assert.equal(yesterday?.rung, lastYear?.rung);
});

test("the 7-day rung escalates to SMS; the loose rungs stay on email", () => {
  assert.deepEqual(dueRung("2026-10-02", today)?.channels, ["email"]);
  assert.deepEqual(dueRung("2026-09-02", today)?.channels, ["email"]);
  assert.deepEqual(dueRung("2026-08-06", today)?.channels, ["email", "sms"]);
  assert.deepEqual(dueRung("2026-07-06", today)?.channels, ["email", "sms"]);
});

test("expiry labels read as plain text, because a dot is not enough", () => {
  assert.equal(expiryLabel("2026-08-03", today), "EXPIRES TODAY");
  assert.equal(expiryLabel("2026-08-04", today), "EXPIRES IN 1 DAY");
  assert.equal(expiryLabel("2026-08-13", today), "EXPIRES IN 10 DAYS");
  assert.equal(expiryLabel("2026-08-02", today), "EXPIRED 1 DAY AGO");
  assert.equal(expiryLabel(null, today), "NO EXPIRY");
});
