import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agingBucket,
  assessForHousehold,
  daysPastDue,
  graceEndsOn,
  isPastGrace,
  periodAt,
  periodContaining,
  periodLabel,
  periodsThrough,
  periodsToGenerate,
  type ScheduleShape,
} from "@/lib/dues";
import { DEFAULT_LATE_FEE, NO_LATE_FEE } from "@/lib/dues";
import { addDays, daysInclusive } from "@/lib/dates";

/** The worked example from ARCHITECTURE.md: quarterly $180, due the 1st. */
const quarterly: ScheduleShape = {
  name: "2026 Quarterly Dues",
  cadence: "quarterly",
  amountCents: 18000,
  dueDay: 1,
  startsOn: "2026-01-01",
  endsOn: null,
  prorate: true,
};

const monthly: ScheduleShape = {
  name: "Monthly Dues",
  cadence: "monthly",
  amountCents: 6000,
  dueDay: 5,
  startsOn: "2026-01-01",
  endsOn: null,
  prorate: true,
};

const annual: ScheduleShape = {
  name: "2026 Annual Dues",
  cadence: "annual",
  amountCents: 72000,
  dueDay: 15,
  startsOn: "2026-07-01",
  endsOn: null,
  prorate: true,
};

const special: ScheduleShape = {
  name: "Roof Special Assessment",
  cadence: "one_time",
  amountCents: 45000,
  dueDay: 1,
  startsOn: "2026-05-01",
  endsOn: "2026-05-31",
  prorate: false,
};

describe("billing periods", () => {
  it("cuts quarters that end the day before the next begins", () => {
    assert.deepEqual(periodAt(quarterly, 0), {
      label: "Q1 2026",
      start: "2026-01-01",
      end: "2026-03-31",
      dueOn: "2026-01-01",
    });
    assert.deepEqual(periodAt(quarterly, 1), {
      label: "Q2 2026",
      start: "2026-04-01",
      end: "2026-06-30",
      dueOn: "2026-04-01",
    });
    assert.deepEqual(periodAt(quarterly, 4), {
      label: "Q1 2027",
      start: "2027-01-01",
      end: "2027-03-31",
      dueOn: "2027-01-01",
    });
  });

  it("puts the due date on the configured day of the opening month", () => {
    assert.equal(periodAt(monthly, 5)?.dueOn, "2026-06-05");
    assert.equal(periodAt(monthly, 5)?.start, "2026-06-01");
    assert.equal(periodAt(monthly, 5)?.end, "2026-06-30");
  });

  it("never dates a due day before the period opens", () => {
    // Quarterly schedule opening on the 20th with a due day of 1: the 1st has
    // already passed when the period starts, so the due date is the start.
    const midMonth: ScheduleShape = { ...quarterly, startsOn: "2026-01-20", dueDay: 1 };
    assert.equal(periodAt(midMonth, 0)?.dueOn, "2026-01-20");
  });

  it("names a non-January fiscal year for both years", () => {
    assert.equal(periodLabel("annual", "2026-07-01", "x"), "FY 2026-27");
    assert.equal(periodLabel("annual", "2026-01-01", "x"), "2026 Annual");
    assert.equal(periodAt(annual, 0)?.label, "FY 2026-27");
    assert.equal(periodAt(annual, 0)?.end, "2027-06-30");
  });

  it("treats a one-time special assessment as a single period", () => {
    assert.deepEqual(periodAt(special, 0), {
      label: "Roof Special Assessment",
      start: "2026-05-01",
      end: "2026-05-31",
      dueOn: "2026-05-01",
    });
    assert.equal(periodAt(special, 1), null);
  });

  it("stops at the schedule's end date", () => {
    const bounded: ScheduleShape = { ...quarterly, endsOn: "2026-06-30" };
    assert.equal(periodsThrough(bounded, "2027-12-31").length, 2);
    assert.equal(periodAt(bounded, 2), null);
  });

  it("finds the period containing a day", () => {
    assert.equal(periodContaining(quarterly, "2026-05-12")?.label, "Q2 2026");
    assert.equal(periodContaining(quarterly, "2026-01-01")?.label, "Q1 2026");
    assert.equal(periodContaining(quarterly, "2025-12-31"), null);
  });
});

describe("periodsToGenerate", () => {
  it("only generates periods that opened inside the lookback window", () => {
    // Nine months into the year, only Q3 (opened Jul 1) is inside 31 days of
    // Jul 20 — Q1 and Q2 are the treasurer's explicit call, not the cron's.
    const due = periodsToGenerate(quarterly, "2026-07-20");
    assert.deepEqual(due.map((p) => p.label), ["Q3 2026"]);
  });

  it("generates nothing before the schedule starts", () => {
    assert.deepEqual(periodsToGenerate(quarterly, "2025-12-31"), []);
  });

  it("is stable when run twice on the same day (the caller dedupes on write)", () => {
    const a = periodsToGenerate(quarterly, "2026-04-01");
    const b = periodsToGenerate(quarterly, "2026-04-01");
    assert.deepEqual(a, b);
    assert.deepEqual(a.map((p) => p.label), ["Q2 2026"]);
  });
});

describe("proration", () => {
  const q2 = periodAt(quarterly, 1)!; // 2026-04-01 .. 2026-06-30

  it("has 91 days in Q2 2026 (hand-checked: 30 + 31 + 30)", () => {
    assert.equal(daysInclusive(q2.start, q2.end), 91);
  });

  it("charges the full amount for a household that owned the whole period", () => {
    const a = assessForHousehold(quarterly, q2, { joinedOn: "2020-03-01", leftOn: null })!;
    assert.equal(a.amountCents, 18000);
    assert.equal(a.prorationNote, null);
    assert.equal(a.daysCovered, 91);
  });

  it("prorates a mid-period joiner by inclusive days owned", () => {
    // Joined May 12: May 12-31 is 20 days, plus June's 30 = 50 of 91.
    // 18000 * 50 / 91 = 9890.109... -> $98.90
    const a = assessForHousehold(quarterly, q2, { joinedOn: "2026-05-12", leftOn: null })!;
    assert.equal(a.daysCovered, 50);
    assert.equal(a.daysInPeriod, 91);
    assert.equal(a.amountCents, 9890);
    assert.equal(a.prorationNote, "Prorated — joined May 12. 50 of 91 days.");
  });

  it("prorates a seller for the days they held the unit", () => {
    // Left May 11: Apr 1-30 is 30 days, plus May 1-11 = 11 -> 41 of 91.
    // 18000 * 41 / 91 = 8109.89... -> $81.10
    const a = assessForHousehold(quarterly, q2, { joinedOn: "2019-01-01", leftOn: "2026-05-11" })!;
    assert.equal(a.daysCovered, 41);
    assert.equal(a.amountCents, 8110);
    assert.equal(a.prorationNote, "Prorated — left May 11. 41 of 91 days.");
  });

  it("buyer and seller together pay the period exactly once, ±1 cent", () => {
    // The pair of fixtures above: 8110 + 9890 = 18000.
    const seller = assessForHousehold(quarterly, q2, {
      joinedOn: "2019-01-01",
      leftOn: "2026-05-11",
    })!;
    const buyer = assessForHousehold(quarterly, q2, { joinedOn: "2026-05-12", leftOn: null })!;
    assert.equal(seller.daysCovered + buyer.daysCovered, 91);
    assert.equal(seller.amountCents + buyer.amountCents, 18000);
  });

  it("does not invoice a household that did not hold the unit at all", () => {
    // Sold before the period opened.
    assert.equal(
      assessForHousehold(quarterly, q2, { joinedOn: "2019-01-01", leftOn: "2026-03-31" }),
      null,
    );
    // Bought after the period closed.
    assert.equal(
      assessForHousehold(quarterly, q2, { joinedOn: "2026-07-01", leftOn: null }),
      null,
    );
  });

  it("charges the day the keys change hands to the buyer", () => {
    // Joined on the last day of the period: one day, not zero.
    const a = assessForHousehold(quarterly, q2, { joinedOn: "2026-06-30", leftOn: null })!;
    assert.equal(a.daysCovered, 1);
    assert.equal(a.amountCents, 198); // 18000 / 91 = 197.8 -> 198
  });

  it("charges the full period when proration is switched off, and says so", () => {
    const noProrate: ScheduleShape = { ...quarterly, prorate: false };
    const a = assessForHousehold(noProrate, q2, { joinedOn: "2026-05-12", leftOn: null })!;
    assert.equal(a.amountCents, 18000);
    assert.match(a.prorationNote!, /proration is off/);
  });

  it("prorates a February period without tripping over the short month", () => {
    const feb: ScheduleShape = { ...monthly, startsOn: "2026-02-01", amountCents: 6000 };
    const p = periodAt(feb, 0)!;
    assert.equal(p.end, "2026-02-28");
    // Joined Feb 15: Feb 15-28 = 14 of 28 days -> exactly half.
    const a = assessForHousehold(feb, p, { joinedOn: "2026-02-15", leftOn: null })!;
    assert.equal(a.daysCovered, 14);
    assert.equal(a.amountCents, 3000);
  });
});

describe("grace and aging", () => {
  it("counts grace through the last grace day inclusive", () => {
    assert.equal(graceEndsOn("2026-04-01", DEFAULT_LATE_FEE), "2026-04-11");
    assert.equal(isPastGrace("2026-04-01", DEFAULT_LATE_FEE, "2026-04-11"), false);
    assert.equal(isPastGrace("2026-04-01", DEFAULT_LATE_FEE, "2026-04-12"), true);
  });

  it("treats a zero-grace policy as due-date-strict", () => {
    const strict = { ...NO_LATE_FEE, graceDays: 0 };
    assert.equal(isPastGrace("2026-04-01", strict, "2026-04-01"), false);
    assert.equal(isPastGrace("2026-04-01", strict, "2026-04-02"), true);
  });

  it("buckets by days past due", () => {
    const due = "2026-04-01";
    assert.equal(agingBucket(due, "2026-03-20"), "current");
    assert.equal(agingBucket(due, due), "current");
    assert.equal(agingBucket(due, addDays(due, 1)), "30");
    assert.equal(agingBucket(due, addDays(due, 30)), "30");
    assert.equal(agingBucket(due, addDays(due, 31)), "60");
    assert.equal(agingBucket(due, addDays(due, 60)), "60");
    assert.equal(agingBucket(due, addDays(due, 61)), "90");
    assert.equal(agingBucket(due, addDays(due, 400)), "90");
  });

  it("reports days past due with the sign a treasurer expects", () => {
    assert.equal(daysPastDue("2026-04-01", "2026-05-05"), 34);
    assert.equal(daysPastDue("2026-04-01", "2026-03-30"), -2);
  });
});
