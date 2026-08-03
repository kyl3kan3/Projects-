import { strict as assert } from "node:assert";
import { test } from "node:test";
import { daysLate, displayRentStatus, rentTotals, weeksToOpen } from "@/lib/rent";

test("a due week reads late from three days after its Monday", () => {
  const week = { status: "due" as const, weekStartOn: "2026-08-03" };
  assert.equal(displayRentStatus(week, "2026-08-03"), "due");
  assert.equal(displayRentStatus(week, "2026-08-06"), "due", "day three is still due");
  assert.equal(displayRentStatus(week, "2026-08-07"), "late");
  assert.equal(displayRentStatus(week, "2026-10-01"), "late");
});

test("paid and waived weeks never become late, however old", () => {
  assert.equal(
    displayRentStatus({ status: "paid", weekStartOn: "2026-01-05" }, "2026-08-03"),
    "paid",
  );
  assert.equal(
    displayRentStatus({ status: "waived", weekStartOn: "2026-01-05" }, "2026-08-03"),
    "waived",
  );
});

test("days late counts from the grace boundary, not the Monday", () => {
  assert.equal(daysLate("2026-08-03", "2026-08-06"), 0);
  assert.equal(daysLate("2026-08-03", "2026-08-10"), 4);
});

test("a shop with no history opens only the current week", () => {
  assert.deepEqual(weeksToOpen({ today: "2026-08-05", lastOpenedWeek: null }), ["2026-08-03"]);
});

test("a missed Monday is caught up rather than skipped", () => {
  assert.deepEqual(weeksToOpen({ today: "2026-08-19", lastOpenedWeek: "2026-07-27" }), [
    "2026-08-03",
    "2026-08-10",
    "2026-08-17",
  ]);
});

test("the current week is not re-opened", () => {
  assert.deepEqual(weeksToOpen({ today: "2026-08-05", lastOpenedWeek: "2026-08-03" }), []);
});

test("a year of silence does not invent fifty-two weeks of rent", () => {
  const weeks = weeksToOpen({ today: "2026-08-05", lastOpenedWeek: "2025-08-04" });
  assert.equal(weeks.length, 8, "bounded to the catch-up cap");
  assert.equal(
    weeks[weeks.length - 1],
    "2026-08-03",
    "and it ends on the current week, not eight weeks after the gap started",
  );
  assert.equal(weeks[0], "2026-06-15");
});

test("totals bucket by the derived status, so late money is not counted as due", () => {
  const totals = rentTotals(
    [
      { status: "due", weekStartOn: "2026-08-03", amountCents: 25_000 },
      { status: "due", weekStartOn: "2026-07-20", amountCents: 25_000 },
      { status: "paid", weekStartOn: "2026-07-13", amountCents: 25_000 },
      { status: "waived", weekStartOn: "2026-07-06", amountCents: 25_000 },
    ],
    "2026-08-05",
  );
  assert.deepEqual(totals, {
    dueCents: 25_000,
    lateCents: 25_000,
    paidCents: 25_000,
    waivedCents: 25_000,
  });
});
