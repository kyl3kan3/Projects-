/**
 * The return-reminder ladder — the two failure modes in one file.
 *
 * `rungFor` must select the **tightest** crossed rung (otherwise day 1 fires and
 * nothing ever fires again), and the ladder must **end** (otherwise a daily sweep
 * mails the same person for eternity). Both are asserted here; the once-only
 * guarantee itself is the unique index on `(order_id, rung)`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays } from "@/lib/dates";
import {
  LADDER_RUNGS,
  LAST_RUNG,
  noticeFor,
  reminderWindow,
  rungFor,
  type NoticeInput,
} from "@/lib/reminders";

const DUE = "2026-08-09";

test("nothing fires two days before due-back", () => {
  assert.equal(rungFor(DUE, addDays(DUE, -2)), null);
});

test("the day before due-back gets the reminder", () => {
  assert.equal(rungFor(DUE, addDays(DUE, -1)), "due_tomorrow");
});

test("on the due date itself, still the day-before rung — nothing is late yet", () => {
  assert.equal(rungFor(DUE, DUE), "due_tomorrow");
});

test("one day late is overdue_1", () => {
  assert.equal(rungFor(DUE, addDays(DUE, 1)), "overdue_1");
});

test("two days late is still overdue_1 — rungs are fixed distances, not a daily nag", () => {
  assert.equal(rungFor(DUE, addDays(DUE, 2)), "overdue_1");
});

test("three days late selects the TIGHTEST crossed rung, not the loosest", () => {
  // The bug this guards: returning overdue_1 here would mean the day-3, day-7 and
  // day-14 notices never fire at all, because day 1 was already sent.
  assert.equal(rungFor(DUE, addDays(DUE, 3)), "overdue_3");
  assert.equal(rungFor(DUE, addDays(DUE, 6)), "overdue_3");
  assert.equal(rungFor(DUE, addDays(DUE, 7)), "overdue_7");
  assert.equal(rungFor(DUE, addDays(DUE, 13)), "overdue_7");
  assert.equal(rungFor(DUE, addDays(DUE, 14)), "overdue_14");
});

test("past the last rung it stays on the last rung, and the unique index stops the re-send", () => {
  assert.equal(rungFor(DUE, addDays(DUE, 40)), LAST_RUNG);
  assert.equal(rungFor(DUE, addDays(DUE, 400)), LAST_RUNG);
});

test("every rung on the ladder is reachable", () => {
  const reached = new Set<string>();
  for (let day = -3; day <= 30; day++) {
    const rung = rungFor(DUE, addDays(DUE, day));
    if (rung) reached.add(rung);
  }
  assert.deepEqual([...reached].sort(), [...LADDER_RUNGS].sort());
});

test("the sweep window is bounded — it does not rescan every order ever returned", () => {
  const window = reminderWindow("2026-08-30");
  // Fifteen days back covers the last rung plus one; two days forward covers the
  // day-before nudge.
  assert.equal(window.dueFrom, "2026-08-15");
  assert.equal(window.dueTo, "2026-09-01");
  // An order due back in January is outside it, for ever.
  assert.ok("2026-01-05" < window.dueFrom);
});

const input: NoticeInput = {
  orderNumber: 1045,
  customerName: "Hays County Parks",
  yardName: "Whitcomb Party Rentals",
  dueBackOn: DUE,
  daysLate: 3,
  lateFeeCents: 42_000,
  itemSummary: "16 × 6ft banquet table, 80 × White folding chair",
};

test("every rung renders a subject and a body naming the order", () => {
  for (const rung of LADDER_RUNGS) {
    const notice = noticeFor(rung, input);
    assert.match(notice.subject, /1045/, `${rung} subject names the order`);
    assert.match(notice.text, /Hays County Parks/, `${rung} body names the customer`);
    assert.ok(notice.text.length > 80, `${rung} body says something`);
  }
});

test("the overdue notices quote the late charge; the day-before one does not", () => {
  assert.doesNotMatch(noticeFor("due_tomorrow", input).text, /\$420\.00/);
  assert.match(noticeFor("overdue_3", input).text, /\$420\.00/);
});

test("the last rung says it is the last one", () => {
  assert.match(noticeFor(LAST_RUNG, input).text, /last automatic notice/);
});

test("an unknown rung throws rather than sending a blank email", () => {
  assert.throws(() => noticeFor("overdue_99" as never, input));
});
