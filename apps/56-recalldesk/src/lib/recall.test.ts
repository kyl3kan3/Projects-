import test from "node:test";
import assert from "node:assert/strict";
import {
  bucketFor,
  computeNextDue,
  inferRecallInterval,
  monthsOverdue,
  type VisitLike,
} from "@/lib/recall";
import { fromDayString, toDayString } from "@/lib/dates";

const day = (s: string): Date => {
  const d = fromDayString(s);
  assert.ok(d, `bad test date ${s}`);
  return d;
};

const hyg = (s: string): VisitLike => ({ visitedOn: day(s), kind: "hygiene" });
const other = (s: string): VisitLike => ({ visitedOn: day(s), kind: "other" });

const TODAY = day("2026-08-03");

test("next due is last hygiene visit plus the recall interval", () => {
  const r = computeNextDue([hyg("2024-11-14")], 6, TODAY);
  assert.equal(toDayString(r.nextDueOn!), "2025-05-14");
  assert.equal(toDayString(r.lastVisitOn!), "2024-11-14");
  assert.equal(r.basis, "hygiene");
});

test("a per-patient 3-month interval is honoured", () => {
  const r = computeNextDue([hyg("2026-04-30")], 3, TODAY);
  assert.equal(toDayString(r.nextDueOn!), "2026-07-30");
});

test("month-end due dates clamp instead of skipping a month", () => {
  // 31 Aug + 6 months is 28 Feb, not 3 March.
  const r = computeNextDue([hyg("2025-08-31")], 6, TODAY);
  assert.equal(toDayString(r.nextDueOn!), "2026-02-28");
});

test("multiple visits on the same day collapse to one", () => {
  const r = computeNextDue(
    [hyg("2025-02-10"), hyg("2025-02-10"), other("2025-02-10")],
    6,
    TODAY,
  );
  assert.equal(toDayString(r.lastVisitOn!), "2025-02-10");
  assert.equal(toDayString(r.nextDueOn!), "2025-08-10");
});

test("no hygiene history falls back to the last visit of any kind, flagged", () => {
  const r = computeNextDue([other("2024-06-03")], 6, TODAY);
  assert.equal(r.basis, "other_visit");
  assert.equal(toDayString(r.nextDueOn!), "2024-12-03");
});

test("no visit history at all is not overdue and says so", () => {
  const r = computeNextDue([], 6, TODAY);
  assert.equal(r.basis, "no_history");
  assert.equal(r.nextDueOn, null);
  assert.equal(bucketFor(r.nextDueOn, TODAY), "current");
  assert.equal(monthsOverdue(r.nextDueOn, TODAY), 0);
});

test("a future appointment in the export means booked, not overdue", () => {
  // Last seen 2 years ago but has an appointment next week: the export knows
  // something the recall math would otherwise miss.
  const r = computeNextDue([hyg("2024-05-02"), hyg("2026-08-11")], 6, TODAY);
  assert.equal(r.scheduled, true);
  assert.equal(r.basis, "scheduled");
  assert.equal(toDayString(r.nextDueOn!), "2027-02-11");
  assert.equal(bucketFor(r.nextDueOn, TODAY), "current");
  // The last completed visit is still reported honestly.
  assert.equal(toDayString(r.lastVisitOn!), "2024-05-02");
});

test("buckets are derived from the due date as of today", () => {
  assert.equal(bucketFor(day("2026-09-01"), TODAY), "current"); // not yet due
  assert.equal(bucketFor(day("2026-06-01"), TODAY), "current"); // 2 months
  assert.equal(bucketFor(day("2026-05-01"), TODAY), "m3_6"); // 3 months
  assert.equal(bucketFor(day("2026-02-04"), TODAY), "m3_6"); // 5 months
  assert.equal(bucketFor(day("2026-02-03"), TODAY), "m6_12"); // exactly 6
  assert.equal(bucketFor(day("2025-09-01"), TODAY), "m6_12"); // 11 months
  assert.equal(bucketFor(day("2025-08-03"), TODAY), "m12_24"); // exactly 12
  assert.equal(bucketFor(day("2024-09-01"), TODAY), "m12_24"); // 23 months
  assert.equal(bucketFor(day("2024-08-03"), TODAY), "m24_plus"); // exactly 24
  assert.equal(bucketFor(day("2019-01-01"), TODAY), "m24_plus");
});

test("the same patient moves buckets as time passes, without a recompute", () => {
  const due = day("2026-05-01");
  assert.equal(bucketFor(due, day("2026-07-31")), "current");
  assert.equal(bucketFor(due, day("2026-08-01")), "m3_6");
  assert.equal(bucketFor(due, day("2026-11-01")), "m6_12");
});

test("a consistent 4-month cycle is inferred from history", () => {
  const visits = [
    hyg("2024-01-10"),
    hyg("2024-05-12"),
    hyg("2024-09-09"),
    hyg("2025-01-08"),
  ];
  assert.equal(inferRecallInterval(visits, TODAY), 4);
});

test("two visits are not enough to infer an interval", () => {
  assert.equal(inferRecallInterval([hyg("2024-01-10"), hyg("2024-07-10")], TODAY), null);
});

test("an irregular history infers nothing rather than guessing", () => {
  const visits = [
    hyg("2020-01-10"),
    hyg("2021-08-02"),
    hyg("2022-01-19"),
    hyg("2024-11-30"),
  ];
  assert.equal(inferRecallInterval(visits, TODAY), null);
});

test("inference ignores future appointments", () => {
  const visits = [
    hyg("2025-01-06"),
    hyg("2025-07-07"),
    hyg("2026-01-05"),
    hyg("2026-09-02"), // scheduled, not yet kept
  ];
  assert.equal(inferRecallInterval(visits, TODAY), 6);
});
