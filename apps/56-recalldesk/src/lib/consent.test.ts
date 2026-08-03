/**
 * Every block condition in the consent chokepoint has a test here. ROADMAP's
 * Phase 1 acceptance criteria requires exactly that: "opt-out, bounce flags,
 * do-not-contact, quiet hours, and touch caps each have a test that proves the
 * block."
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  decideTouch,
  nextSendableAt,
  withinQuietHours,
  type TouchFacts,
} from "@/lib/consent";
import { hourInTimezone } from "@/lib/dates";

/** 2026-08-03 15:00 UTC = 10:00 in Chicago (CDT). Inside the window. */
const NOON_CHICAGO = new Date("2026-08-03T15:00:00Z");

const location = {
  timezone: "America/Chicago",
  quietStartHour: 9,
  quietEndHour: 19,
  hourlySendCap: 120,
};

const PATIENT: TouchFacts["patient"] = {
  doNotContact: false,
  status: "active",
  email: "r.mbeki@example.com",
  phone: "+15125550147",
  emailConsent: true,
  smsConsent: true,
  emailOptedOutAt: null,
  smsOptedOutAt: null,
  emailBouncedAt: null,
  phoneFailedAt: null,
};

type Over = Omit<Partial<TouchFacts>, "patient" | "location"> & {
  patient?: Partial<TouchFacts["patient"]>;
  location?: Partial<TouchFacts["location"]>;
};

function facts(over: Over = {}): TouchFacts {
  const { patient, location: loc, ...rest } = over;
  return {
    channel: "email",
    touchesInCampaign: 0,
    maxTouchesPerPatient: 3,
    sentThisHour: 0,
    now: NOON_CHICAGO,
    ...rest,
    patient: { ...PATIENT, ...patient },
    location: { ...location, ...loc },
  };
}

test("a consenting patient inside the window passes", () => {
  assert.deepEqual(decideTouch(facts()), { ok: true });
  assert.deepEqual(decideTouch(facts({ channel: "sms" })), { ok: true });
});

test("do-not-contact blocks every channel and beats everything else", () => {
  for (const channel of ["email", "sms"] as const) {
    const d = decideTouch(facts({ channel, patient: { doNotContact: true } } }));
    assert.equal(d.ok, false);
    assert.equal(d.ok === false && d.reason, "do_not_contact");
    assert.equal(d.ok === false && d.retryable, false);
  }
});

test("STOP blocks SMS permanently, and does not block email", () => {
  const stopped = { smsOptedOutAt: new Date("2026-07-01T12:00:00Z"), smsConsent: false } as never;
  const sms = decideTouch(facts({ channel: "sms", patient: stopped }));
  assert.equal(sms.ok === false && sms.reason, "opted_out");
  // Opt-out is per channel: STOP is not an email unsubscribe.
  assert.deepEqual(decideTouch(facts({ channel: "email", patient: stopped })), { ok: true });
});

test("STOP wins even if a later import re-asserts sms_consent", () => {
  // The realistic failure: the office re-exports the roster, the consent column
  // still says Y, and the opt-out is silently undone. The timestamp is checked
  // before the flag for exactly this reason.
  const d = decideTouch(
    facts({
      channel: "sms",
      patient: { smsConsent: true, smsOptedOutAt: new Date("2026-07-01T12:00:00Z") },
    }),
  );
  assert.equal(d.ok === false && d.reason, "opted_out");
});

test("an email unsubscribe blocks email permanently", () => {
  const d = decideTouch(
    facts({ patient: { emailOptedOutAt: new Date("2026-06-14T09:00:00Z") } }),
  );
  assert.equal(d.ok === false && d.reason, "opted_out");
});

test("missing consent flags block, per channel", () => {
  const noEmail = decideTouch(facts({ patient: { emailConsent: false } } }));
  assert.equal(noEmail.ok === false && noEmail.reason, "no_consent");
  const noSms = decideTouch(facts({ channel: "sms", patient: { smsConsent: false } } }));
  assert.equal(noSms.ok === false && noSms.reason, "no_consent");
});

test("a missing address or number blocks", () => {
  const d1 = decideTouch(facts({ patient: { email: null } } }));
  assert.equal(d1.ok === false && d1.reason, "no_consent");
  const d2 = decideTouch(facts({ channel: "sms", patient: { phone: null } } }));
  assert.equal(d2.ok === false && d2.reason, "no_consent");
});

test("a bounced address and a failed number are suppressed", () => {
  const bounced = decideTouch(
    facts({ patient: { emailBouncedAt: new Date("2026-05-02T00:00:00Z") } }),
  );
  assert.equal(bounced.ok === false && bounced.reason, "bounced");
  const failed = decideTouch(
    facts({ channel: "sms", patient: { phoneFailedAt: new Date("2026-05-02T00:00:00Z") } }),
  );
  assert.equal(failed.ok === false && failed.reason, "bounced");
});

test("an inactive patient record is never touched", () => {
  const d = decideTouch(facts({ patient: { status: "inactive" } } }));
  assert.equal(d.ok === false && d.reason, "no_consent");
});

test("the campaign touch cap blocks, and is not retryable", () => {
  const d = decideTouch(facts({ touchesInCampaign: 3, maxTouchesPerPatient: 3 }));
  assert.equal(d.ok === false && d.reason, "touch_cap");
  assert.equal(d.ok === false && d.retryable, false);
  // One under the cap still sends.
  assert.deepEqual(decideTouch(facts({ touchesInCampaign: 2, maxTouchesPerPatient: 3 })), {
    ok: true,
  });
});

test("quiet hours block in the location's timezone, and are retryable", () => {
  // 2026-08-03T05:00Z is midnight in Chicago.
  const d = decideTouch(facts({ now: new Date("2026-08-03T05:00:00Z") }));
  assert.equal(d.ok === false && d.reason, "quiet_hours");
  assert.equal(d.ok === false && d.retryable, true);
});

test("the same instant is quiet in one timezone and open in another", () => {
  // 13:00 UTC = 08:00 Chicago (blocked) and 06:00 Los Angeles (blocked),
  // 15:00 UTC = 10:00 Chicago (open) but 08:00 Los Angeles (still blocked).
  const at15 = new Date("2026-08-03T15:00:00Z");
  assert.equal(withinQuietHours({ ...location }, at15), true);
  assert.equal(
    withinQuietHours({ ...location, timezone: "America/Los_Angeles" }, at15),
    false,
  );
});

test("the hourly send cap blocks, and is retryable", () => {
  const d = decideTouch(facts({ sentThisHour: 120 }));
  assert.equal(d.ok === false && d.reason, "send_cap");
  assert.equal(d.ok === false && d.retryable, true);
});

test("nextSendableAt returns now inside the window and the morning outside it", () => {
  const inside = new Date("2026-08-03T15:00:00Z");
  assert.equal(nextSendableAt(location, inside).getTime(), inside.getTime());

  const midnight = new Date("2026-08-03T05:00:00Z"); // 00:00 Chicago
  const next = nextSendableAt(location, midnight);
  assert.ok(next.getTime() > midnight.getTime());
  assert.equal(hourInTimezone(location.timezone, next), 9);
  // And it is inside the window by construction.
  assert.equal(withinQuietHours(location, next), true);
});

test("nextSendableAt crosses to the following morning after the window closes", () => {
  const evening = new Date("2026-08-04T01:30:00Z"); // 20:30 Chicago, past 19:00
  const next = nextSendableAt(location, evening);
  assert.equal(hourInTimezone(location.timezone, next), 9);
  assert.ok(next.getTime() - evening.getTime() < 24 * 3_600_000);
});
