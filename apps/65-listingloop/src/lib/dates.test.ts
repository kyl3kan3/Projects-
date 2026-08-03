/**
 * The date engine's test suite. This is the product, so it is tested like it.
 *
 * Cases chosen because each one has been a real earnest-money story somewhere:
 * a Friday contract, back-to-back holidays, a month boundary, a leap day, a
 * deadline counted back from closing, and an anchor that isn't set yet.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  AT_RISK_DAYS,
  addDays,
  computeAll,
  computeDate,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  diffDates,
  displayStatus,
  formatLong,
  formatMonth,
  formatShort,
  fromDayNumber,
  isIsoDate,
  isLeapYear,
  monthOf,
  relativeDays,
  ruleSentence,
  toDayNumber,
  todayInZone,
  weekdayName,
  type DateRule,
  type DatedTask,
} from "@/lib/dates";
import { allHolidayRows, federalHolidays, observedDate, stateHolidays, toHolidayMap } from "@/lib/holidays";

const cal2026 = toHolidayMap(federalHolidays(2026));
const cal = toHolidayMap([
  ...federalHolidays(2025),
  ...federalHolidays(2026),
  ...federalHolidays(2027),
  ...federalHolidays(2028),
]);
const noHolidays = new Map<string, string>();

function rule(over: Partial<DateRule> = {}): DateRule {
  return { anchor: "contract_date", offsetDays: 10, businessDays: true, observeHolidays: true, ...over };
}

function due(r: DateRule, anchors: Record<string, string>, holidays = cal): string {
  const result = computeDate(r, anchors, holidays);
  assert.equal(result.ok, true, `expected a computable date, got ${JSON.stringify(result)}`);
  if (!result.ok) throw new Error("unreachable");
  return result.value.dueOn;
}

/* --------------------------------------------------------- day arithmetic */

test("day numbers round-trip across eras, leap days and month ends", () => {
  for (const iso of [
    "1970-01-01",
    "1999-12-31",
    "2000-02-29",
    "2024-02-29",
    "2026-03-01",
    "2100-03-01",
    "2400-02-29",
  ]) {
    assert.equal(fromDayNumber(toDayNumber(iso)), iso, iso);
  }
  assert.equal(toDayNumber("1970-01-01"), 0);
  assert.equal(dayOfWeek(0), 4, "1970-01-01 was a Thursday");
  assert.equal(weekdayName("2026-03-03"), "Tuesday");
});

test("leap-year and month-length rules", () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2025), false);
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2000), true);
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2025, 2), 28);
  assert.equal(daysInMonth(2025, 11), 30);
});

test("ISO validation rejects impossible calendar dates", () => {
  assert.equal(isIsoDate("2026-02-29"), false, "2026 is not a leap year");
  assert.equal(isIsoDate("2024-02-29"), true);
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("2026-04-31"), false);
  assert.equal(isIsoDate("2026-1-1"), false);
  assert.equal(isIsoDate(""), false);
  assert.equal(isIsoDate(null), false);
});

test("addDays crosses month, year and leap boundaries", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2025-02-28", 1), "2025-03-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(daysBetween("2026-03-01", "2026-03-11"), 10);
  assert.equal(daysBetween("2026-03-11", "2026-03-01"), -10);
});

/* ------------------------------------------------------- federal calendar */

test("federal holidays land on their observed dates", () => {
  const rows = federalHolidays(2027);
  const byLabel = new Map(rows.map((r) => [r.label, r.date]));
  // 2027-07-04 is a Sunday -> observed Monday the 5th.
  assert.equal(byLabel.get("Independence Day"), "2027-07-05");
  // 2027-12-25 is a Saturday -> observed Friday the 24th.
  assert.equal(byLabel.get("Christmas Day"), "2027-12-24");
  // Floating ones: third Monday in January, last Monday in May.
  assert.equal(byLabel.get("Martin Luther King Jr. Day"), "2027-01-18");
  assert.equal(byLabel.get("Memorial Day"), "2027-05-31");
  assert.equal(byLabel.get("Thanksgiving Day"), "2027-11-25");
  assert.equal(rows.length, 11, "eleven federal holidays");
});

test("observance shifts only weekend dates", () => {
  assert.equal(observedDate("2027-07-04"), "2027-07-05"); // Sunday
  assert.equal(observedDate("2026-07-04"), "2026-07-03"); // Saturday
  assert.equal(observedDate("2026-06-19"), "2026-06-19"); // Friday, unmoved
});

test("every generated holiday row is a real weekday", () => {
  for (const row of allHolidayRows(2025, 2030)) {
    const dow = dayOfWeek(toDayNumber(row.date));
    assert.ok(dow !== 0 && dow !== 6, `${row.label} ${row.date} fell on a weekend`);
    assert.equal(row.date.slice(0, 4), String(row.year));
  }
});

test("state scope is additive and does not overwrite a federal label", () => {
  const tx = stateHolidays(2026, "TX");
  assert.deepEqual(
    tx.map((r) => r.label),
    ["Texas Independence Day", "San Jacinto Day"],
  );
  assert.equal(stateHolidays(2026, "NV").length, 0, "no rules for NV yet");
  const merged = toHolidayMap([...federalHolidays(2026), ...stateHolidays(2026, "TX")]);
  assert.equal(merged.get("2026-03-02"), "Texas Independence Day");
  assert.equal(merged.get("2026-01-19"), "Martin Luther King Jr. Day");
});

/* -------------------------------------------------- business-day stepping */

test("a Friday contract + 3 business days skips the weekend", () => {
  // 2026-03-06 is a Friday. Mon 9, Tue 10, Wed 11.
  assert.equal(due(rule({ offsetDays: 3 }), { contract_date: "2026-03-06" }), "2026-03-11");
  const result = computeDate(rule({ offsetDays: 3 }), { contract_date: "2026-03-06" }, cal);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.value.weekendDaysSkipped, 2);
    assert.match(result.value.sentence, /2 weekend days skipped/);
    assert.match(result.value.sentence, /lands Wednesday, Mar 11/);
  }
});

test("the hero case: contract + 10 business days, holidays observed", () => {
  // Contract Fri 2026-05-22. Memorial Day Mon 2026-05-25 is skipped, so the
  // count is 26,27,28,29 (4), Jun 1,2,3,4,5 (9), Jun 8 (10) — three weekends.
  assert.equal(due(rule({ offsetDays: 10 }), { contract_date: "2026-05-22" }), "2026-06-08");
  const result = computeDate(rule({ offsetDays: 10 }), { contract_date: "2026-05-22" }, cal);
  assert.ok(result.ok);
  if (result.ok) {
    assert.deepEqual(result.value.holidaysObserved, ["Memorial Day"]);
    assert.equal(result.value.weekendDaysSkipped, 6);
    assert.equal(result.value.adjustment, "6 weekend days skipped, Memorial Day observed");
    assert.equal(
      result.value.sentence,
      "Contract date (May 22) + 10 business days — 6 weekend days skipped, Memorial Day observed — lands Monday, Jun 8.",
    );
  }
});

test("ignoring holidays gives the shorter, wrong-in-practice answer", () => {
  const observed = due(rule({ offsetDays: 10, observeHolidays: true }), {
    contract_date: "2026-05-22",
  });
  const ignored = due(rule({ offsetDays: 10, observeHolidays: false }), {
    contract_date: "2026-05-22",
  });
  assert.equal(ignored, "2026-06-05");
  assert.equal(observed, "2026-06-08");
  // Skipping Memorial Day pushes the tenth business day past a weekend, so the
  // one closed office costs three calendar days — the arithmetic nobody does
  // in their head correctly.
  assert.equal(daysBetween(ignored, observed), 3);
});

test("back-to-back closures: Christmas Eve observed plus New Year's Day", () => {
  // 2027-12-24 is the observed Christmas (Sat the 25th) and 2028-01-01 is a
  // Saturday, so New Year's is observed Fri 2027-12-31.
  const rows = toHolidayMap([...federalHolidays(2027), ...federalHolidays(2028)]);
  assert.equal(rows.get("2027-12-24"), "Christmas Day");
  assert.equal(rows.get("2027-12-31"), "New Year's Day");
  // Contract Wed 2027-12-22 + 5 business days: 23, (24 holiday), 27, 28, 29, 30.
  assert.equal(
    due(rule({ offsetDays: 5 }), { contract_date: "2027-12-22" }, rows),
    "2027-12-30",
  );
  // + 6 business days has to jump the second holiday and the weekend: Mon Jan 3.
  assert.equal(
    due(rule({ offsetDays: 6 }), { contract_date: "2027-12-22" }, rows),
    "2028-01-03",
  );
});

test("business-day stepping crosses a month boundary correctly", () => {
  // 2026-06-29 is a Monday. +5 business days: 30 Jun, 1,2,3 Jul, then Jul 4
  // observed Fri Jul 3... Independence Day 2026-07-04 is Saturday -> observed
  // Friday Jul 3. So: 30(1), 1(2), 2(3), 6(4), 7(5).
  assert.equal(due(rule({ offsetDays: 5 }), { contract_date: "2026-06-29" }), "2026-07-07");
  assert.equal(cal2026.get("2026-07-03"), "Independence Day");
});

test("stepping over a leap day counts it as a business day", () => {
  // 2024-02-27 Tue + 3 business days: 28, 29 (leap), Mar 1 is Friday.
  assert.equal(
    due(rule({ offsetDays: 3, observeHolidays: false }), { contract_date: "2024-02-27" }, noHolidays),
    "2024-03-01",
  );
});

test("a large offset stays a whole number of weeks off the anchor weekday", () => {
  // 30 business days with no holidays is exactly six weeks.
  const from = "2026-03-02"; // Monday
  assert.equal(
    due(rule({ offsetDays: 30, observeHolidays: false }), { contract_date: from }, noHolidays),
    addDays(from, 42),
  );
});

/* ------------------------------------------------------- calendar-day rules */

test("a calendar rule that does not observe holidays lands raw", () => {
  const r = rule({ offsetDays: 21, businessDays: false, observeHolidays: false });
  assert.equal(due(r, { contract_date: "2026-05-22" }), "2026-06-12");
});

test("a calendar rule that observes holidays rolls forward off a weekend", () => {
  // 2026-03-06 + 21 calendar days = Fri 2026-03-27 — no roll needed.
  assert.equal(
    due(rule({ offsetDays: 21, businessDays: false }), { contract_date: "2026-03-06" }),
    "2026-03-27",
  );
  // 2026-03-08 + 21 = Sun 2026-03-29 -> rolls to Mon the 30th.
  const result = computeDate(
    rule({ offsetDays: 21, businessDays: false }),
    { contract_date: "2026-03-08" },
    cal,
  );
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.value.dueOn, "2026-03-30");
    assert.equal(result.value.rolled, true);
    assert.equal(result.value.adjustment, "rolled forward to the next business day");
  }
});

test("a calendar rule rolls off an observed holiday too", () => {
  // 2026-06-12 + 21 calendar days = Fri 2026-07-03, which is the observed
  // Independence Day -> rolls to Mon 2026-07-06.
  const result = computeDate(
    rule({ offsetDays: 21, businessDays: false }),
    { contract_date: "2026-06-12" },
    cal,
  );
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.value.dueOn, "2026-07-06");
    assert.deepEqual(result.value.holidaysObserved, ["Independence Day"]);
    assert.match(result.value.adjustment, /Independence Day observed/);
  }
});

/* -------------------------------------------- dates counted back from closing */

test("closing − 1 business day rolls backward, never past closing", () => {
  // Closing Mon 2026-06-15 -> walkthrough Fri 2026-06-12.
  assert.equal(
    due(rule({ anchor: "closing_date", offsetDays: -1 }), { closing_date: "2026-06-15" }),
    "2026-06-12",
  );
  // Closing Mon 2026-05-26 (day after Memorial Day) -> back over the holiday
  // and the weekend to Fri 2026-05-22.
  assert.equal(
    due(rule({ anchor: "closing_date", offsetDays: -1 }), { closing_date: "2026-05-26" }),
    "2026-05-22",
  );
});

test("a negative calendar rule that observes holidays rolls back, not forward", () => {
  // Closing Wed 2026-07-08 − 5 calendar days = Fri Jul 3 (observed holiday)
  // -> rolls BACK to Thu Jul 2, which is still before closing.
  const result = computeDate(
    rule({ anchor: "closing_date", offsetDays: -5, businessDays: false }),
    { closing_date: "2026-07-08" },
    cal,
  );
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.value.dueOn, "2026-07-02");
    assert.equal(daysBetween(result.value.dueOn, "2026-07-08") > 0, true);
  }
});

test("offset 0 on a business-day rule rolls a weekend closing to a business day", () => {
  // A closing keyed to the day itself: Sat 2026-06-13 -> Mon 2026-06-15.
  assert.equal(
    due(rule({ anchor: "closing_date", offsetDays: 0 }), { closing_date: "2026-06-13" }),
    "2026-06-15",
  );
  // A weekday closing is untouched.
  assert.equal(
    due(rule({ anchor: "closing_date", offsetDays: 0 }), { closing_date: "2026-06-15" }),
    "2026-06-15",
  );
  assert.equal(
    ruleSentence(rule({ anchor: "closing_date", offsetDays: 0 }), "2026-06-15"),
    "Closing date (Jun 15), the day itself",
  );
});

/* ------------------------------------------------------- unresolvable rules */

test("a missing anchor never guesses a date", () => {
  const result = computeDate(rule({ anchor: "closing_date" }), { contract_date: "2026-03-03" }, cal);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "needs the closing date");
    assert.match(result.sentence, /waiting on the closing date/);
  }
});

test("a malformed anchor is treated as missing, not parsed loosely", () => {
  for (const bad of ["", "not-a-date", "03/03/2026", "2026-02-30"]) {
    const result = computeDate(rule(), { contract_date: bad }, cal);
    assert.equal(result.ok, false, bad);
  }
});

/* -------------------------------------------------------- instantiation set */

const buyerTasks: DatedTask[] = [
  { key: "emd", label: "Earnest money delivered", rule: rule({ offsetDays: 3 }) },
  { key: "inspection_objection", label: "Inspection objection", rule: rule({ offsetDays: 10 }) },
  {
    key: "appraisal",
    label: "Appraisal received",
    rule: rule({ offsetDays: 21, businessDays: false }),
  },
  {
    key: "walkthrough",
    label: "Final walkthrough",
    rule: rule({ anchor: "closing_date", offsetDays: -1 }),
  },
];

test("computeAll resolves what it can and flags what it cannot", () => {
  const dates = computeAll(buyerTasks, { contract_date: "2026-05-22" }, cal);
  assert.equal(dates.length, 4);
  assert.equal(dates.filter((d) => d.dueOn !== null).length, 3);
  const walkthrough = dates.find((d) => d.key === "walkthrough");
  assert.equal(walkthrough?.dueOn, null);
  assert.equal(walkthrough?.unresolved, "needs the closing date");
  assert.equal(walkthrough?.computedFrom.anchorValue, null);
  const objection = dates.find((d) => d.key === "inspection_objection");
  assert.equal(objection?.dueOn, "2026-06-08");
  assert.equal(objection?.computedFrom.anchorValue, "2026-05-22");
});

test("every computed date carries a sentence that names its anchor and offset", () => {
  for (const d of computeAll(buyerTasks, { contract_date: "2026-05-22", closing_date: "2026-06-30" }, cal)) {
    assert.ok(d.sentence.length > 20, d.key);
    assert.match(d.sentence, /(Contract date|Closing date)/, d.key);
    assert.match(d.sentence, /lands [A-Z][a-z]+day/, d.key);
  }
});

/* ---------------------------------------------------------------- the diff */

test("the recompute diff lists only what moved, with its reason", () => {
  const before = computeAll(buyerTasks, { contract_date: "2026-05-18", closing_date: "2026-06-30" }, cal);
  const after = computeAll(buyerTasks, { contract_date: "2026-05-22", closing_date: "2026-06-30" }, cal);
  const rows = diffDates(before, after);
  const keys = rows.map((r) => r.key).sort();
  assert.deepEqual(keys, ["appraisal", "emd", "inspection_objection"]);
  // The walkthrough is keyed to closing and must NOT appear.
  assert.equal(rows.some((r) => r.key === "walkthrough"), false);
  const objection = rows.find((r) => r.key === "inspection_objection");
  // Contract Mon May 18 + 10 business days lands Tue Jun 2 (Memorial Day skipped).
  assert.equal(objection?.oldDue, "2026-06-02");
  assert.equal(objection?.newDue, "2026-06-08");
  assert.equal(objection?.shiftDays, 6);
  assert.match(objection?.reason ?? "", /Memorial Day observed/);
  assert.match(objection?.summary ?? "", /^Inspection objection moved Jun 2 → Jun 8 — /);
});

test("the recompute receipt names the holiday that moved the date", () => {
  const appraisal: DatedTask[] = [
    { key: "appraisal", label: "Appraisal", rule: rule({ offsetDays: 21, businessDays: false }) },
  ];
  const before = computeAll(appraisal, { contract_date: "2026-04-11" }, cal);
  const after = computeAll(appraisal, { contract_date: "2026-06-12" }, cal);
  const [row] = diffDates(before, after);
  // Apr 11 + 21 = Sat May 2, rolled to Mon May 4. Jun 12 + 21 = Fri Jul 3, the
  // observed Independence Day, rolled over the weekend to Mon Jul 6.
  assert.equal(row.oldDue, "2026-05-04");
  assert.equal(row.newDue, "2026-07-06");
  assert.equal(
    row.summary,
    "Appraisal moved May 4 → Jul 6 — Independence Day observed, rolled forward to the next business day",
  );
});

test("a business-day rule spanning two closures names both", () => {
  // Dec 2027: Christmas observed Fri 12/24, New Year's observed Fri 12/31.
  const r = rule({ offsetDays: 10 });
  const result = computeDate(r, { contract_date: "2027-12-20" }, cal);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.value.dueOn, "2028-01-05");
    assert.deepEqual(result.value.holidaysObserved, ["Christmas Day", "New Year's Day"]);
    assert.match(result.value.adjustment, /Christmas Day and New Year's Day observed/);
  }
});

test("a diff row appears when a date becomes unresolvable", () => {
  const before = computeAll(buyerTasks, { contract_date: "2026-05-22", closing_date: "2026-06-30" }, cal);
  const after = computeAll(buyerTasks, { contract_date: "2026-05-22", closing_date: null }, cal);
  const rows = diffDates(before, after);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, "walkthrough");
  assert.equal(rows[0].newDue, null);
  assert.match(rows[0].summary, /needs a date/);
});

test("an identical recompute produces an empty diff", () => {
  const anchors = { contract_date: "2026-05-22", closing_date: "2026-06-30" };
  assert.deepEqual(diffDates(computeAll(buyerTasks, anchors, cal), computeAll(buyerTasks, anchors, cal)), []);
});

/* ------------------------------------------------------- status as of today */

test("status is derived as of today, not read from the column", () => {
  const today = "2026-06-08";
  assert.equal(displayStatus({ dueOn: "2026-05-01", status: "upcoming" }, today), "missed");
  assert.equal(displayStatus({ dueOn: "2026-06-08", status: "upcoming" }, today), "at_risk");
  assert.equal(
    displayStatus({ dueOn: addDays(today, AT_RISK_DAYS), status: "upcoming" }, today),
    "at_risk",
  );
  assert.equal(
    displayStatus({ dueOn: addDays(today, AT_RISK_DAYS + 1), status: "upcoming" }, today),
    "upcoming",
  );
  // A stored terminal state always wins over the calendar.
  assert.equal(displayStatus({ dueOn: "2026-05-01", status: "met" }, today), "met");
  assert.equal(displayStatus({ dueOn: "2026-05-01", status: "waived" }, today), "waived");
  assert.equal(displayStatus({ dueOn: null, status: "upcoming" }, today), "unset");
});

/* --------------------------------------------------------------- formatting */

test("formatting never re-parses through a local Date", () => {
  assert.equal(formatShort("2026-05-06"), "May 6");
  assert.equal(formatLong("2026-05-06"), "May 6, 2026");
  assert.equal(formatMonth("2026-05"), "May 2026");
  assert.equal(monthOf("2026-05-06"), "2026-05");
  assert.equal(formatShort("2026-01-01"), "Jan 1");
  assert.equal(formatShort("garbage"), "garbage");
});

test("relative phrasing reads like a person wrote it", () => {
  assert.equal(relativeDays("2026-06-08", "2026-06-08"), "today");
  assert.equal(relativeDays("2026-06-08", "2026-06-09"), "tomorrow");
  assert.equal(relativeDays("2026-06-08", "2026-06-07"), "yesterday");
  assert.equal(relativeDays("2026-06-08", "2026-06-15"), "in 7 days");
  assert.equal(relativeDays("2026-06-08", "2026-05-29"), "10 days ago");
});

test("today is resolved in the account's timezone, not the server's", () => {
  // 2026-06-09T03:30Z is still Jun 8 in Chicago and already Jun 9 in London.
  const at = new Date("2026-06-09T03:30:00Z");
  assert.equal(todayInZone("America/Chicago", at), "2026-06-08");
  assert.equal(todayInZone("Europe/London", at), "2026-06-09");
  assert.equal(todayInZone("Pacific/Auckland", at), "2026-06-09");
  // An unknown zone degrades to UTC rather than throwing mid-render.
  assert.equal(todayInZone("Mars/Olympus", at), "2026-06-09");
});
