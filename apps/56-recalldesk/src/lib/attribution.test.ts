/**
 * The conservatism invariant, tested before it got any UI (BUILD.md's first
 * ground rule). If any of these ever go green-to-red, the product's central claim
 * is broken and the ledger is worthless.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  pickQualifyingTouch,
  productionCentsFor,
  visitValueCentsFor,
  windowDaysFor,
  type BookingRecord,
  type TouchRecord,
  type TouchStatus,
} from "@/lib/attribution";

const PATIENT = "patient-1";
const OTHER_PATIENT = "patient-2";

const booking: BookingRecord = {
  id: "booking-1",
  patientId: PATIENT,
  bookedAt: new Date("2026-07-08T16:20:00Z"),
};

function touch(over: Partial<TouchRecord> = {}): TouchRecord {
  return {
    id: "touch-1",
    patientId: PATIENT,
    channel: "sms",
    status: "delivered",
    occurredAt: new Date("2026-06-30T14:00:00Z"),
    ...over,
  };
}

test("a booking with a delivered touch 8 days earlier is attributed", () => {
  const match = pickQualifyingTouch(booking, [touch()], 30);
  assert.ok(match);
  assert.equal(match.touch.id, "touch-1");
  assert.equal(match.daysBefore, 8);
});

test("a booking with NO touch at all creates no attribution", () => {
  assert.equal(pickQualifyingTouch(booking, [], 30), null);
});

test("a booking whose only touch is outside the window creates no attribution", () => {
  const old = touch({ occurredAt: new Date("2026-06-01T14:00:00Z") }); // 37 days
  assert.equal(pickQualifyingTouch(booking, [old], 30), null);
});

test("the window is inclusive at exactly N days and exclusive one second past", () => {
  const exactly30 = touch({ occurredAt: new Date("2026-06-08T16:20:00Z") });
  assert.ok(pickQualifyingTouch(booking, [exactly30], 30));
  const justOver = touch({ occurredAt: new Date("2026-06-08T16:19:59Z") });
  assert.equal(pickQualifyingTouch(booking, [justOver], 30), null);
});

test("a touch after the booking never counts", () => {
  const after = touch({ occurredAt: new Date("2026-07-09T09:00:00Z") });
  assert.equal(pickQualifyingTouch(booking, [after], 30), null);
});

test("another patient's touch never counts", () => {
  const theirs = touch({ patientId: OTHER_PATIENT });
  assert.equal(pickQualifyingTouch(booking, [theirs], 30), null);
});

test("only touches that actually went out qualify", () => {
  const qualifying: TouchStatus[] = ["sent", "delivered", "answered", "left_message"];
  const blocked: TouchStatus[] = ["queued", "bounced", "failed", "opted_out"];
  for (const status of qualifying) {
    assert.ok(pickQualifyingTouch(booking, [touch({ status })], 30), status);
  }
  for (const status of blocked) {
    assert.equal(pickQualifyingTouch(booking, [touch({ status })], 30), null, status);
  }
});

test("a bounced email and nothing else means no attribution", () => {
  // The realistic case this protects: a campaign 'sent' 400 emails, 40 bounced,
  // and one of those patients happened to walk in. That is not recovered revenue.
  const bounced = touch({ channel: "email", status: "bounced" });
  assert.equal(pickQualifyingTouch(booking, [bounced], 30), null);
});

test("the most recent qualifying touch is credited", () => {
  const early = touch({ id: "email-day-0", channel: "email", occurredAt: new Date("2026-06-20T13:00:00Z") });
  const late = touch({ id: "sms-day-14", channel: "sms", occurredAt: new Date("2026-07-04T13:00:00Z") });
  const match = pickQualifyingTouch(booking, [early, late], 30);
  assert.equal(match?.touch.id, "sms-day-14");
  assert.equal(match?.daysBefore, 4);
});

test("a front-desk call outcome is outreach and can be credited", () => {
  const call = touch({ id: "call-1", channel: "call", status: "left_message", occurredAt: new Date("2026-07-07T15:30:00Z") });
  const match = pickQualifyingTouch(booking, [call], 30);
  assert.equal(match?.touch.id, "call-1");
  assert.equal(match?.touch.channel, "call");
});

test("a shorter practice window excludes what a 30-day window would include", () => {
  const t = touch({ occurredAt: new Date("2026-06-30T14:00:00Z") }); // 8 days
  assert.ok(pickQualifyingTouch(booking, [t], 30));
  assert.equal(pickQualifyingTouch(booking, [t], 7), null);
});

test("production is the practice's visit value, in whole cents", () => {
  assert.equal(productionCentsFor(30_000), 30_000);
  assert.equal(productionCentsFor(31_050), 31_050);
  // No floats anywhere: a half-cent rounds once, here.
  assert.equal(productionCentsFor(30_000.4), 30_000);
  assert.equal(productionCentsFor(-5), 0);
});

test("practice settings fall back to the documented defaults", () => {
  assert.equal(windowDaysFor(null), 30);
  assert.equal(windowDaysFor({}), 30);
  assert.equal(windowDaysFor({ attributionWindowDays: 14 }), 14);
  assert.equal(windowDaysFor({ attributionWindowDays: 0 }), 30);
  assert.equal(windowDaysFor({ attributionWindowDays: 9999 }), 30);

  assert.equal(visitValueCentsFor(null), 30_000);
  assert.equal(visitValueCentsFor({ visitValueCents: 31_000 }), 31_000);
  assert.equal(visitValueCentsFor({ visitValueCents: 0 }), 30_000);
});
