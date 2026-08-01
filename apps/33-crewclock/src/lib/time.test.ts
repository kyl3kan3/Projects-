import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDaysToDateKey,
  autoBreakSeconds,
  centihoursToDecimal,
  dayOfWeekForKey,
  effectiveBreakSeconds,
  formatDuration,
  formatMoneyCents,
  fromZonedWallTime,
  laborCostCents,
  localDateKey,
  localRangeUtc,
  payPeriodFor,
  toCentihours,
  weekDateKeys,
  weekStartKey,
  weekStartKeyForDate,
  workedSeconds,
  zoneOffsetMs,
} from "@/lib/time";

const CHICAGO = "America/Chicago";
const DENVER = "America/Denver";

/** A local wall-clock time in a zone, as the UTC instant it really is. */
function at(zone: string, key: string, hour: number, minute = 0, second = 0): Date {
  const [year, month, day] = key.split("-").map(Number);
  return fromZonedWallTime({ year, month, day, hour, minute, second }, zone);
}

describe("the rounding policy", () => {
  it("never rounds a payroll figure up", () => {
    // 8 hours exactly.
    assert.equal(toCentihours(8 * 3600), 800);
    // One second short of 8 hours must not become 8.00.
    assert.equal(toCentihours(8 * 3600 - 1), 799);
    assert.equal(centihoursToDecimal(toCentihours(8 * 3600 - 1)), "7.99");
    // A hundredth of an hour is 36 seconds; 35 of them are not claimed.
    assert.equal(toCentihours(35), 0);
    assert.equal(toCentihours(36), 1);
    assert.equal(toCentihours(71), 1);
    assert.equal(toCentihours(72), 2);
  });

  it("truncates the displayed duration too, so the two agree", () => {
    assert.equal(formatDuration(7 * 3600 + 42 * 60 + 59), "7h 42m");
    assert.equal(formatDuration(59), "0m");
    assert.equal(formatDuration(0), "0m");
    assert.equal(formatDuration(3600), "1h 00m");
  });

  it("formats centihours as the decimal payroll files carry", () => {
    assert.equal(centihoursToDecimal(0), "0.00");
    assert.equal(centihoursToDecimal(5), "0.05");
    assert.equal(centihoursToDecimal(100), "1.00");
    assert.equal(centihoursToDecimal(4025), "40.25");
  });

  it("clamps rather than paying negative time", () => {
    const shift = {
      clockInAt: new Date("2026-02-24T15:00:00Z"),
      clockOutAt: new Date("2026-02-24T14:00:00Z"),
      breakSeconds: 0,
    };
    assert.equal(workedSeconds(shift), 0);
  });
});

describe("worked seconds", () => {
  it("is exact elapsed time minus the break", () => {
    const shift = {
      clockInAt: new Date("2026-02-24T13:03:41Z"),
      clockOutAt: new Date("2026-02-24T21:36:12Z"),
      breakSeconds: 30 * 60,
    };
    assert.equal(workedSeconds(shift), 8 * 3600 + 32 * 60 + 31 - 1800);
  });

  it("measures an open shift against now", () => {
    const now = new Date("2026-02-24T19:15:00Z");
    const shift = {
      clockInAt: new Date("2026-02-24T13:03:00Z"),
      clockOutAt: null,
      breakSeconds: 0,
    };
    assert.equal(workedSeconds(shift, now), 6 * 3600 + 12 * 60);
    assert.equal(formatDuration(workedSeconds(shift, now)), "6h 12m");
  });

  it("survives a shift that crosses midnight", () => {
    const shift = {
      clockInAt: at(CHICAGO, "2026-02-24", 22, 0),
      clockOutAt: at(CHICAGO, "2026-02-25", 2, 30),
      breakSeconds: 0,
    };
    assert.equal(workedSeconds(shift), 4.5 * 3600);
    // …and belongs to the day it started on.
    assert.equal(localDateKey(shift.clockInAt, CHICAGO), "2026-02-24");
  });
});

describe("DST", () => {
  it("pays 5 hours for a 00:30–06:30 shift on spring-forward day", () => {
    // 8 March 2026, America/Denver: 02:00 MST becomes 03:00 MDT.
    const shift = {
      clockInAt: at(DENVER, "2026-03-08", 0, 30),
      clockOutAt: at(DENVER, "2026-03-08", 6, 30),
      breakSeconds: 0,
    };
    // Naive wall-clock subtraction would say 6 hours. The clock lost an hour.
    assert.equal(workedSeconds(shift), 5 * 3600);
    assert.equal(toCentihours(workedSeconds(shift)), 500);
  });

  it("pays 7 hours for the same clock faces on fall-back day", () => {
    // 1 November 2026, America/Denver: 02:00 MDT becomes 01:00 MST.
    const shift = {
      clockInAt: at(DENVER, "2026-11-01", 0, 30),
      clockOutAt: at(DENVER, "2026-11-01", 6, 30),
      breakSeconds: 0,
    };
    assert.equal(workedSeconds(shift), 7 * 3600);
  });

  it("knows the offset on each side of a transition", () => {
    assert.equal(zoneOffsetMs(at(DENVER, "2026-03-08", 0, 30), DENVER), -7 * 3600_000);
    assert.equal(zoneOffsetMs(at(DENVER, "2026-03-08", 6, 30), DENVER), -6 * 3600_000);
  });

  it("resolves a wall time that never happened to the instant the clock jumped to", () => {
    // 02:30 on spring-forward day does not exist in Denver.
    const resolved = at(DENVER, "2026-03-08", 2, 30);
    assert.equal(localDateKey(resolved, DENVER), "2026-03-08");
    // It lands at 03:30 MDT — the next real second, not an hour in the past.
    assert.equal(resolved.toISOString(), "2026-03-08T09:30:00.000Z");
  });

  it("keeps a local day 23 or 25 hours long as the zone requires", () => {
    const spring = localRangeUtc("2026-03-08", "2026-03-08", DENVER);
    assert.equal((spring.end.getTime() - spring.start.getTime()) / 3600_000, 23);
    const fall = localRangeUtc("2026-11-01", "2026-11-01", DENVER);
    assert.equal((fall.end.getTime() - fall.start.getTime()) / 3600_000, 25);
  });
});

describe("breaks", () => {
  const org = { autoBreakMinutes: 30, autoBreakAfterHours: 6 };

  it("does not auto-deduct on a short shift", () => {
    assert.equal(autoBreakSeconds(5 * 3600, org), 0);
    assert.equal(autoBreakSeconds(6 * 3600, org), 0);
  });

  it("auto-deducts once the shift passes the threshold", () => {
    assert.equal(autoBreakSeconds(6 * 3600 + 1, org), 1800);
  });

  it("is disabled by a zero policy", () => {
    assert.equal(autoBreakSeconds(12 * 3600, { autoBreakMinutes: 0, autoBreakAfterHours: 6 }), 0);
  });

  it("keeps a longer logged break rather than shrinking it to policy", () => {
    assert.equal(effectiveBreakSeconds(9 * 3600, 45 * 60, org), 45 * 60);
    assert.equal(effectiveBreakSeconds(9 * 3600, 10 * 60, org), 30 * 60);
    assert.equal(effectiveBreakSeconds(9 * 3600, -5, org), 30 * 60);
  });
});

describe("payroll weeks", () => {
  it("draws the week in the site's zone, not UTC", () => {
    // 22:30 Saturday in Chicago is already Sunday in UTC.
    const saturdayNight = at(CHICAGO, "2026-02-28", 22, 30);
    assert.equal(saturdayNight.toISOString().slice(0, 10), "2026-03-01");
    assert.equal(weekStartKey(saturdayNight, CHICAGO, 0), "2026-02-22");
  });

  it("respects the org's first day of the week", () => {
    assert.equal(weekStartKeyForDate("2026-02-25", 0), "2026-02-22"); // Sunday
    assert.equal(weekStartKeyForDate("2026-02-25", 1), "2026-02-23"); // Monday
    assert.equal(weekStartKeyForDate("2026-02-25", 3), "2026-02-25"); // Wednesday itself
  });

  it("enumerates the week in order", () => {
    assert.deepEqual(weekDateKeys("2026-02-22"), [
      "2026-02-22",
      "2026-02-23",
      "2026-02-24",
      "2026-02-25",
      "2026-02-26",
      "2026-02-27",
      "2026-02-28",
    ]);
  });

  it("does date maths across a month and a leap year", () => {
    assert.equal(addDaysToDateKey("2026-02-28", 1), "2026-03-01");
    assert.equal(addDaysToDateKey("2024-02-28", 1), "2024-02-29");
    assert.equal(addDaysToDateKey("2026-01-01", -1), "2025-12-31");
    assert.equal(dayOfWeekForKey("2026-02-22"), 0);
  });
});

describe("pay periods", () => {
  const weekly = { payPeriod: "weekly" as const, weekStartsOn: 0 };
  const biweekly = { payPeriod: "biweekly" as const, weekStartsOn: 0 };
  const semi = { payPeriod: "semimonthly" as const, weekStartsOn: 0 };

  it("weekly is the payroll week", () => {
    assert.deepEqual(payPeriodFor("2026-02-25", weekly), {
      start: "2026-02-22",
      end: "2026-02-28",
    });
  });

  it("biweekly is stable — two dates in one period resolve identically", () => {
    const a = payPeriodFor("2026-02-25", biweekly);
    const b = payPeriodFor(addDaysToDateKey(a.start, 9), biweekly);
    assert.deepEqual(a, b);
    assert.equal(a.end, addDaysToDateKey(a.start, 13));
  });

  it("semimonthly splits at the 15th", () => {
    assert.deepEqual(payPeriodFor("2026-02-09", semi), {
      start: "2026-02-01",
      end: "2026-02-15",
    });
    assert.deepEqual(payPeriodFor("2026-02-16", semi), {
      start: "2026-02-16",
      end: "2026-02-28",
    });
    assert.deepEqual(payPeriodFor("2024-02-20", semi), {
      start: "2024-02-16",
      end: "2024-02-29",
    });
  });
});

describe("money", () => {
  it("prices seconds at a cents-per-hour rate", () => {
    assert.equal(laborCostCents(3600, 2800), 2800);
    assert.equal(laborCostCents(1800, 2800), 1400);
    // 7h 42m at $28.00/h = $215.60
    assert.equal(laborCostCents(7 * 3600 + 42 * 60, 2800), 21560);
    assert.equal(laborCostCents(0, 2800), 0);
  });

  it("formats integer cents without inventing precision", () => {
    assert.equal(formatMoneyCents(841000), "$8,410");
    assert.equal(formatMoneyCents(841055, { cents: true }), "$8,410.55");
    assert.equal(formatMoneyCents(-170000), "-$1,700");
  });
});
