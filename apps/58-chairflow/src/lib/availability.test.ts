import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  DEFAULT_WORKING_HOURS,
  overlaps,
  parseDayPreference,
  parseWorkingHours,
  preferenceMatches,
  slotsForDay,
  type WorkingHours,
} from "@/lib/availability";
import { formatClock, zonedTimeToUtc } from "@/lib/dates";

const TZ = "America/New_York";

const HOURS: WorkingHours = {
  ...DEFAULT_WORKING_HOURS,
  // Thursday 10:00-13:00, a short day for readable assertions.
  "4": { open: "10:00", close: "13:00", off: false },
};

/** 2026-08-06 is a Thursday. */
const THURSDAY = "2026-08-06";
const clocks = (slots: Array<{ startsAt: Date }>): string[] =>
  slots.map((s) => formatClock(TZ, s.startsAt));

test("slots step the grid and never run past closing", () => {
  const slots = slotsForDay({
    timezone: TZ,
    day: THURSDAY,
    hours: HOURS,
    durationMinutes: 45,
    busy: [],
    now: new Date("2026-08-01T12:00:00.000Z"),
  });
  assert.deepEqual(clocks(slots), [
    "10:00",
    "10:15",
    "10:30",
    "10:45",
    "11:00",
    "11:15",
    "11:30",
    "11:45",
    "12:00",
    "12:15",
  ]);
  // 12:15 + 45 = 13:00 exactly; 12:30 would finish at 13:15, past closing.
  assert.equal(
    formatClock(TZ, slots[slots.length - 1].endsAt),
    "1:00",
    "the last slot ends exactly at closing",
  );
});

test("a day marked off yields nothing", () => {
  const slots = slotsForDay({
    timezone: TZ,
    day: "2026-08-03", // Monday, off by default
    hours: HOURS,
    durationMinutes: 30,
    busy: [],
    now: new Date("2026-08-01T12:00:00.000Z"),
  });
  assert.deepEqual(slots, []);
});

test("an existing appointment removes exactly the slots it covers", () => {
  const busyStart = zonedTimeToUtc(TZ, 2026, 8, 6, 11, 0);
  const slots = slotsForDay({
    timezone: TZ,
    day: THURSDAY,
    hours: HOURS,
    durationMinutes: 30,
    busy: [{ startsAt: busyStart, endsAt: new Date(busyStart.getTime() + 60 * 60_000) }],
    now: new Date("2026-08-01T12:00:00.000Z"),
  });
  const times = clocks(slots);
  // A 30-minute service cannot start at 10:45 (it would run into 11:00).
  assert.deepEqual(times, [
    "10:00",
    "10:15",
    "10:30",
    "12:00",
    "12:15",
    "12:30",
  ]);
});

test("back-to-back is bookable: an appointment ending at 11:00 leaves 11:00 open", () => {
  const busyStart = zonedTimeToUtc(TZ, 2026, 8, 6, 10, 0);
  const slots = slotsForDay({
    timezone: TZ,
    day: THURSDAY,
    hours: HOURS,
    durationMinutes: 60,
    busy: [{ startsAt: busyStart, endsAt: new Date(busyStart.getTime() + 60 * 60_000) }],
    now: new Date("2026-08-01T12:00:00.000Z"),
  });
  assert.equal(clocks(slots)[0], "11:00");
});

test("minimum notice hides slots too close to now", () => {
  // 10:30 New York on the day itself; two hours' notice means 12:30 onwards.
  const now = zonedTimeToUtc(TZ, 2026, 8, 6, 10, 30);
  const slots = slotsForDay({
    timezone: TZ,
    day: THURSDAY,
    hours: HOURS,
    durationMinutes: 30,
    busy: [],
    now,
    minNoticeMinutes: 120,
  });
  assert.deepEqual(clocks(slots), ["12:30"]);
});

test("a zero or negative duration cannot generate slots", () => {
  for (const durationMinutes of [0, -30]) {
    assert.deepEqual(
      slotsForDay({
        timezone: TZ,
        day: THURSDAY,
        hours: HOURS,
        durationMinutes,
        busy: [],
        now: new Date("2026-08-01T12:00:00.000Z"),
      }),
      [],
    );
  }
});

test("closing before opening yields nothing rather than a negative loop", () => {
  const broken: WorkingHours = { ...HOURS, "4": { open: "18:00", close: "09:00", off: false } };
  assert.deepEqual(
    slotsForDay({
      timezone: TZ,
      day: THURSDAY,
      hours: broken,
      durationMinutes: 30,
      busy: [],
      now: new Date("2026-08-01T12:00:00.000Z"),
    }),
    [],
  );
});

test("slots are wall-clock stable across a DST boundary", () => {
  // US DST ends 2026-11-01. The Thursdays either side must both open at 10:00
  // local even though the UTC offset changes between them.
  const before = slotsForDay({
    timezone: TZ,
    day: "2026-10-29",
    hours: HOURS,
    durationMinutes: 60,
    busy: [],
    now: new Date("2026-10-01T12:00:00.000Z"),
  });
  const after = slotsForDay({
    timezone: TZ,
    day: "2026-11-05",
    hours: HOURS,
    durationMinutes: 60,
    busy: [],
    now: new Date("2026-10-01T12:00:00.000Z"),
  });
  assert.equal(formatClock(TZ, before[0].startsAt), "10:00");
  assert.equal(formatClock(TZ, after[0].startsAt), "10:00");
  assert.equal(
    before[0].startsAt.getUTCHours(),
    14,
    "EDT is UTC-4, so 10:00 local is 14:00Z",
  );
  assert.equal(
    after[0].startsAt.getUTCHours(),
    15,
    "EST is UTC-5, so the same wall clock is a different instant",
  );
});

test("overlap is half-open", () => {
  const a = {
    startsAt: new Date("2026-08-06T14:00:00.000Z"),
    endsAt: new Date("2026-08-06T15:00:00.000Z"),
  };
  const touching = {
    startsAt: new Date("2026-08-06T15:00:00.000Z"),
    endsAt: new Date("2026-08-06T16:00:00.000Z"),
  };
  const straddling = {
    startsAt: new Date("2026-08-06T14:30:00.000Z"),
    endsAt: new Date("2026-08-06T15:30:00.000Z"),
  };
  assert.equal(overlaps(a, touching), false);
  assert.equal(overlaps(a, straddling), true);
  assert.equal(overlaps(straddling, a), true);
});

test("working hours parsing keeps defaults for anything missing or malformed", () => {
  const parsed = parseWorkingHours({ "4": { open: "08:00" }, "9": { open: "01:00" }, junk: 1 });
  assert.equal(parsed["4"].open, "08:00");
  assert.equal(parsed["4"].close, DEFAULT_WORKING_HOURS["4"].close);
  assert.equal(parsed["2"].open, DEFAULT_WORKING_HOURS["2"].open);
  assert.equal(Object.keys(parsed).length, 7);
});

test("waitlist preferences filter by weekday and part of day", () => {
  const pref = parseDayPreference({ weekdays: [4, 5], partOfDay: "evening" });
  assert.deepEqual(pref, { weekdays: [4, 5], partOfDay: "evening" });
  assert.equal(preferenceMatches(pref, { weekday: 4, hour: 18 }), true);
  assert.equal(preferenceMatches(pref, { weekday: 4, hour: 11 }), false);
  assert.equal(preferenceMatches(pref, { weekday: 2, hour: 18 }), false);
  // An empty preference matches anything: "any slot you have".
  assert.equal(preferenceMatches({ weekdays: [] }, { weekday: 0, hour: 8 }), true);
});
