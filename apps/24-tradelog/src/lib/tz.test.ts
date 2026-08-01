import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDaysToKey,
  formatDateKey,
  formatHold,
  formatMinutesOfDay,
  isValidTimeZone,
  minutesOfDay,
  weekStartKey,
  zonedClock,
  zonedDateKey,
  zonedParts,
  zonedTimeToUtc,
} from "@/lib/tz";

const NY = "America/New_York";

describe("zonedParts", () => {
  it("reads the local wall clock, not UTC", () => {
    const parts = zonedParts(new Date("2026-01-13T14:31:00Z"), NY);
    assert.deepEqual(parts, { year: 2026, month: 1, day: 13, hour: 9, minute: 31, weekday: 2 });
  });

  it("rolls the local date back across midnight UTC", () => {
    // 02:00Z on the 14th is 21:00 on the 13th in New York.
    assert.equal(zonedDateKey(new Date("2026-01-14T02:00:00Z"), NY), "2026-01-13");
    assert.equal(zonedDateKey(new Date("2026-01-14T02:00:00Z"), "UTC"), "2026-01-14");
  });

  it("applies daylight saving", () => {
    // January: EST, UTC−5. July: EDT, UTC−4.
    assert.equal(zonedClock(new Date("2026-01-13T14:30:00Z"), NY), "09:30");
    assert.equal(zonedClock(new Date("2026-07-13T14:30:00Z"), NY), "10:30");
    assert.equal(minutesOfDay(new Date("2026-07-13T14:30:00Z"), NY), 10 * 60 + 30);
  });
});

describe("zonedTimeToUtc", () => {
  it("converts a broker's local timestamp to the instant it names", () => {
    // ThinkorSwim writes "11/4/25 09:31:12" and means Eastern time.
    assert.equal(
      zonedTimeToUtc({ year: 2025, month: 11, day: 4, hour: 9, minute: 31, second: 12 }, NY).toISOString(),
      "2025-11-04T14:31:12.000Z",
    );
    // The same wall clock in July is an hour earlier in UTC.
    assert.equal(
      zonedTimeToUtc({ year: 2025, month: 7, day: 8, hour: 9, minute: 31, second: 12 }, NY).toISOString(),
      "2025-07-08T13:31:12.000Z",
    );
  });

  it("is exact on both sides of a DST transition", () => {
    // US DST ended 02:00 local on 2 Nov 2025.
    assert.equal(
      zonedTimeToUtc({ year: 2025, month: 11, day: 1, hour: 12, minute: 0 }, NY).toISOString(),
      "2025-11-01T16:00:00.000Z", // EDT, UTC−4
    );
    assert.equal(
      zonedTimeToUtc({ year: 2025, month: 11, day: 3, hour: 12, minute: 0 }, NY).toISOString(),
      "2025-11-03T17:00:00.000Z", // EST, UTC−5
    );
  });

  it("round-trips against zonedParts for a year of dates", () => {
    for (let day = 0; day < 365; day += 7) {
      const base = new Date(Date.UTC(2026, 0, 1) + day * 86_400_000);
      const p = zonedParts(base, NY);
      const back = zonedTimeToUtc({ ...p, second: 0 }, NY);
      assert.equal(
        back.getTime(),
        base.getTime() - base.getUTCSeconds() * 1000 - base.getUTCMilliseconds(),
        `round trip failed for ${base.toISOString()}`,
      );
    }
  });

  it("handles a zone ahead of UTC", () => {
    assert.equal(
      zonedTimeToUtc({ year: 2026, month: 1, day: 13, hour: 9, minute: 0 }, "Asia/Tokyo").toISOString(),
      "2026-01-13T00:00:00.000Z",
    );
  });
});

describe("week keys", () => {
  it("anchors the week on the local Monday", () => {
    // 2026-01-13 is a Tuesday; its week starts Monday the 12th.
    assert.equal(weekStartKey(new Date("2026-01-13T15:00:00Z"), NY), "2026-01-12");
    // A Monday is its own week start.
    assert.equal(weekStartKey(new Date("2026-01-12T15:00:00Z"), NY), "2026-01-12");
    // A Sunday belongs to the week that began six days earlier.
    assert.equal(weekStartKey(new Date("2026-01-18T15:00:00Z"), NY), "2026-01-12");
    // 03:00Z Monday is still Sunday evening in New York — the previous week.
    assert.equal(weekStartKey(new Date("2026-01-19T03:00:00Z"), NY), "2026-01-12");
  });

  it("steps date keys across month boundaries", () => {
    assert.equal(addDaysToKey("2026-01-30", 3), "2026-02-02");
    assert.equal(addDaysToKey("2026-03-01", -1), "2026-02-28");
    assert.equal(addDaysToKey("2026-01-12", 6), "2026-01-18");
  });

  it("formats a date key without touching timezones", () => {
    assert.equal(formatDateKey("2026-01-13"), "13 Jan 2026");
    assert.equal(formatDateKey("2026-01-13", { year: false }), "13 Jan");
  });
});

describe("small formatters", () => {
  it("formats minutes past midnight", () => {
    assert.equal(formatMinutesOfDay(0), "00:00");
    assert.equal(formatMinutesOfDay(690), "11:30");
    assert.equal(formatMinutesOfDay(1439), "23:59");
  });

  it("formats hold times to two units", () => {
    assert.equal(formatHold(null), "open");
    assert.equal(formatHold(45), "45s");
    assert.equal(formatHold(252), "4m 12s");
    assert.equal(formatHold(7_560), "2h 06m");
    assert.equal(formatHold(273_600), "3d 04h");
  });

  it("validates timezone names", () => {
    assert.equal(isValidTimeZone(NY), true);
    assert.equal(isValidTimeZone("Mars/Olympus_Mons"), false);
  });
});
