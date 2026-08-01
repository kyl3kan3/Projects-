/**
 * The reminder ladder.
 *
 * Two named failure modes from the brief get their own tests here, because both
 * pass a build and only show up as a support ticket weeks later:
 *
 *  - a nudge that never stops, because "not completed" stays true forever;
 *  - a ladder that goes quiet, because only the loosest rung ever matched.
 *
 * The design that avoids both is materialising the rungs once, at fixed distances
 * from the send, so the tests assert exactly that: three rungs, at 48h/5d/10d,
 * and nothing after the last one no matter how long the packet sits unfinished.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isQuiet, planReminders, shiftOutOfQuietHours } from "@/lib/ladder";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const settings = {
  timeZone: "America/New_York",
  quietStart: "21:00",
  quietEnd: "08:00",
  reminderHours: [48, 120, 240],
};

const sentAt = new Date("2026-07-01T15:00:00Z"); // 11:00 in New York
const expiresAt = new Date("2026-07-31T15:00:00Z");

describe("quiet hours", () => {
  it("knows an overnight window wraps midnight", () => {
    assert.equal(isQuiet(22 * 60, "21:00", "08:00"), true);
    assert.equal(isQuiet(2 * 60, "21:00", "08:00"), true);
    assert.equal(isQuiet(8 * 60, "21:00", "08:00"), false);
    assert.equal(isQuiet(20 * 60 + 59, "21:00", "08:00"), false);
  });

  it("handles a daytime window without wrapping", () => {
    assert.equal(isQuiet(13 * 60, "12:00", "14:00"), true);
    assert.equal(isQuiet(15 * 60, "12:00", "14:00"), false);
  });

  it("treats an empty window as never quiet", () => {
    assert.equal(isQuiet(3 * 60, "08:00", "08:00"), false);
  });

  it("shifts a 02:00 local send to 08:00 the same morning", () => {
    // 06:30Z on 2 July is 02:30 in New York — inside quiet hours.
    const shifted = shiftOutOfQuietHours(new Date("2026-07-02T06:30:00Z"), settings);
    assert.equal(shifted.toISOString(), "2026-07-02T12:00:00.000Z"); // 08:00 EDT
  });

  it("shifts a 22:00 local send to 08:00 the next morning", () => {
    // 02:00Z on 3 July is 22:00 on 2 July in New York.
    const shifted = shiftOutOfQuietHours(new Date("2026-07-03T02:00:00Z"), settings);
    assert.equal(shifted.toISOString(), "2026-07-03T12:00:00.000Z");
  });

  it("leaves a mid-afternoon time alone", () => {
    const at = new Date("2026-07-02T18:00:00Z"); // 14:00 EDT
    assert.equal(shiftOutOfQuietHours(at, settings).toISOString(), at.toISOString());
  });

  it("converges on a time outside the window whatever it is handed", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const at = new Date(Date.UTC(2026, 6, 2, hour, 17));
      const shifted = shiftOutOfQuietHours(at, settings);
      const localHour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: settings.timeZone,
          hour: "2-digit",
          hourCycle: "h23",
        }).format(shifted),
      );
      assert.ok(localHour >= 8 && localHour < 21, `hour ${hour} landed at local ${localHour}`);
    }
  });
});

describe("planReminders", () => {
  it("builds one email rung per configured distance, in order", () => {
    const plans = planReminders({ sentAt, expiresAt, settings, email: true, sms: false });
    assert.deepEqual(plans.map((p) => p.step), [0, 1, 2]);
    assert.ok(plans.every((p) => p.channel === "email"));
    const gaps = plans.map((p) => (p.scheduledFor.getTime() - sentAt.getTime()) / 3_600_000);
    // 48h/120h/240h, possibly nudged forward out of quiet hours.
    assert.ok(gaps[0] >= 48 && gaps[0] < 48 + 11, `first rung at +${gaps[0]}h`);
    assert.ok(gaps[1] >= 120 && gaps[1] < 120 + 11);
    assert.ok(gaps[2] >= 240 && gaps[2] < 240 + 11);
  });

  it("stops after the last rung — the ladder has an end", () => {
    const plans = planReminders({ sentAt, expiresAt, settings, email: true, sms: true });
    const maxHours = Math.max(
      ...plans.map((p) => (p.scheduledFor.getTime() - sentAt.getTime()) / 3_600_000),
    );
    assert.ok(maxHours < 252, `nothing is scheduled past the last rung, got +${maxHours}h`);
    assert.equal(plans.filter((p) => p.channel === "email").length, 3);
  });

  it("rides SMS on the second rung only — one text, not three", () => {
    const plans = planReminders({ sentAt, expiresAt, settings, email: true, sms: true });
    const sms = plans.filter((p) => p.channel === "sms");
    assert.equal(sms.length, 1);
    assert.equal(sms[0].step, 1);
  });

  it("never schedules past the link's own expiry", () => {
    const shortLink = new Date(sentAt.getTime() + 3 * 86_400_000); // 3 days
    const plans = planReminders({ sentAt, expiresAt: shortLink, settings, email: true, sms: true });
    assert.equal(plans.filter((p) => p.channel === "email").length, 1);
    assert.ok(plans.every((p) => p.scheduledFor < shortLink));
  });

  it("schedules nothing when both channels are off", () => {
    assert.deepEqual(planReminders({ sentAt, expiresAt, settings, email: false, sms: false }), []);
  });

  it("gives every rung a distinct (channel, step) pair — the dedupe key", () => {
    const plans = planReminders({ sentAt, expiresAt, settings, email: true, sms: true });
    const keys = plans.map((p) => `${p.channel}:${p.step}`);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("respects a practice that has turned the ladder down to one rung", () => {
    const plans = planReminders({
      sentAt,
      expiresAt,
      settings: { ...settings, reminderHours: [72] },
      email: true,
      sms: true,
    });
    // With a single rung, SMS rides it rather than disappearing.
    assert.equal(plans.length, 2);
    assert.deepEqual(plans.map((p) => p.step), [0, 0]);
  });

  it("uses the shipped defaults of 48h, 5d and 10d", () => {
    assert.deepEqual(DEFAULT_SETTINGS.reminderHours, [48, 120, 240]);
  });
});
