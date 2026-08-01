import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  MoneyParseError,
  agoStamp,
  coveragePct,
  daysUntil,
  dueStamp,
  fileSize,
  initials,
  money,
  moneyShort,
  parseMoneyToCents,
} from "./format";
import {
  DEFAULT_REMINDER_DAYS,
  derivedStatus,
  dueReminderRung,
  normalizeReminderDays,
  reminderDedupeKey,
} from "./schedule";
import {
  canAddSeat,
  canCreateProject,
  canStore,
  hasLevelingExports,
  pausedProjectIds,
} from "./plans";

/* ------------------------------------------------------------------ money --- */

test("parseMoneyToCents handles what a sub actually types", () => {
  assert.equal(parseMoneyToCents("184200"), 18_420_000);
  assert.equal(parseMoneyToCents("$184,200"), 18_420_000);
  assert.equal(parseMoneyToCents("184,200.50"), 18_420_050);
  assert.equal(parseMoneyToCents("184200.5"), 18_420_050);
  assert.equal(parseMoneyToCents("  1 200  "), 120_000);
  assert.equal(parseMoneyToCents(".75"), 75);
  assert.equal(parseMoneyToCents("0"), 0);
  assert.equal(parseMoneyToCents(""), null);
  assert.equal(parseMoneyToCents("   "), null);
  assert.equal(parseMoneyToCents(null), null);
  // Deducts, written the way an estimator writes them.
  assert.equal(parseMoneyToCents("-2,400"), -240_000);
  assert.equal(parseMoneyToCents("(2,400)"), -240_000);
});

test("parseMoneyToCents refuses to guess", () => {
  for (const bad of ["TBD", "call me", "1,2.3.4", "12abc", "$", "-", "1.2.3"]) {
    assert.throws(() => parseMoneyToCents(bad), MoneyParseError, `should reject ${bad}`);
  }
});

test("a third decimal place rounds once, at the edge", () => {
  assert.equal(parseMoneyToCents("10.005"), 1001); // half-up, once
  assert.equal(parseMoneyToCents("10.004"), 1000);
  assert.equal(parseMoneyToCents("1.235"), 124);
});

test("money formatting is exact and tabular", () => {
  assert.equal(money(18_420_000), "$184,200.00");
  assert.equal(money(0), "$0.00");
  assert.equal(money(-240_000), "-$2,400.00");
  assert.equal(money(5), "$0.05");
  assert.equal(moneyShort(18_420_000), "$184,200");
  assert.equal(moneyShort(18_420_050), "$184,200.50");
});

test("cents survive a round trip through the display layer", () => {
  for (const cents of [0, 1, 99, 100, 12_345, 18_420_050, 999_999_999]) {
    assert.equal(parseMoneyToCents(money(cents)), cents);
  }
});

/* ------------------------------------------------------------------ dates --- */

test("daysUntil counts calendar days, not 24h blocks", () => {
  // 11pm on the 20th to 1am on the 21st is one calendar day, not zero.
  assert.equal(
    daysUntil(new Date("2026-03-21T01:00:00Z"), new Date("2026-03-20T23:00:00Z")),
    1,
  );
  assert.equal(daysUntil(new Date("2026-03-21T23:00:00Z"), new Date("2026-03-21T01:00:00Z")), 0);
  assert.equal(daysUntil(new Date("2026-03-15T12:00:00Z"), new Date("2026-03-21T12:00:00Z")), -6);
  // Across a month boundary and a leap day.
  assert.equal(daysUntil(new Date("2024-03-01T00:00:00Z"), new Date("2024-02-28T00:00:00Z")), 2);
});

test("dueStamp reads the way an estimator says it out loud", () => {
  const now = new Date("2026-03-15T12:00:00Z");
  assert.equal(dueStamp(new Date("2026-03-21T17:00:00Z"), now), "DUE MAR 21 · 6 DAYS");
  assert.equal(dueStamp(new Date("2026-03-16T17:00:00Z"), now), "DUE MAR 16 · TOMORROW");
  assert.equal(dueStamp(new Date("2026-03-15T17:00:00Z"), now), "DUE TODAY");
  assert.equal(dueStamp(new Date("2026-03-14T17:00:00Z"), now), "1 DAY OVERDUE");
  assert.equal(dueStamp(new Date("2026-03-11T17:00:00Z"), now), "4 DAYS OVERDUE");
});

test("agoStamp never claims something is fresher than it is", () => {
  const now = new Date("2026-03-15T12:00:00Z");
  assert.equal(agoStamp(null, now), "NEVER");
  assert.equal(agoStamp(new Date("2026-03-15T11:59:30Z"), now), "JUST NOW");
  assert.equal(agoStamp(new Date("2026-03-15T11:00:00Z"), now), "1H AGO");
  assert.equal(agoStamp(new Date("2026-03-13T13:00:00Z"), now), "1D AGO"); // 47h, not 2 days
});

/* -------------------------------------------------------------- reminders --- */

test("the reminder ladder picks the tightest crossed rung", () => {
  const due = new Date("2026-03-21T17:00:00Z");
  const at = (iso: string) => dueReminderRung(due, new Date(iso));

  assert.equal(at("2026-03-10T09:00:00Z"), null); // 11 days out: nothing yet
  assert.equal(at("2026-03-14T09:00:00Z"), 7); //     7 days out: T-7
  assert.equal(at("2026-03-16T09:00:00Z"), 7); //     5 days out: still T-7's window
  assert.equal(at("2026-03-18T09:00:00Z"), 3); //     3 days out: T-3
  assert.equal(at("2026-03-19T09:00:00Z"), 3); //     2 days out: still T-3
  assert.equal(at("2026-03-20T09:00:00Z"), 1); //     1 day out:  T-1
  assert.equal(at("2026-03-21T09:00:00Z"), 1); //     due today:  T-1 (already deduped)
});

test("reminders stop dead once the date passes", () => {
  const due = new Date("2026-03-21T17:00:00Z");
  for (const day of ["2026-03-22", "2026-03-25", "2026-04-30", "2027-01-01"]) {
    assert.equal(
      dueReminderRung(due, new Date(`${day}T09:00:00Z`)),
      null,
      `${day} must not produce a reminder`,
    );
  }
});

test("a sub invited late never gets a back-dated rung", () => {
  // Invited four days before the date: T-7 is gone forever, T-3 and T-1 still fire.
  const due = new Date("2026-03-21T17:00:00Z");
  assert.equal(dueReminderRung(due, new Date("2026-03-17T09:00:00Z")), 7);
  assert.equal(dueReminderRung(due, new Date("2026-03-18T09:00:00Z")), 3);
  // Dedupe keys are per rung, so the T-7 key simply never gets claimed.
  assert.equal(reminderDedupeKey("inv-1", 7), "reminder:inv-1:t7");
  assert.notEqual(reminderDedupeKey("inv-1", 7), reminderDedupeKey("inv-1", 3));
});

test("a custom schedule is honoured and sanitised", () => {
  assert.deepEqual(normalizeReminderDays([1, 3, 3, 14, -2, 0, 99]), [14, 3, 1]);
  assert.deepEqual(normalizeReminderDays([]), []);
  const due = new Date("2026-03-21T17:00:00Z");
  assert.equal(dueReminderRung(due, new Date("2026-03-08T09:00:00Z"), [14, 3]), 14);
  assert.equal(dueReminderRung(due, new Date("2026-03-08T09:00:00Z"), []), null);
  assert.equal(DEFAULT_REMINDER_DAYS.join(","), "7,3,1");
});

/* ------------------------------------------------------- derived status ---- */

test("status is derived as of now, never read off the stored column", () => {
  const due = new Date("2026-03-21T17:00:00Z");
  const base = {
    storedStatus: "opened" as const,
    hasSubmittedBid: false,
    declinedAt: null,
    openedAt: new Date("2026-03-15T10:00:00Z"),
    bidDueAt: due,
  };

  assert.equal(derivedStatus(base, new Date("2026-03-16T10:00:00Z")), "opened");
  // The stored column still says "opened" three weeks later. The board must not.
  assert.equal(derivedStatus(base, new Date("2026-04-10T10:00:00Z")), "no_response");
  assert.equal(
    derivedStatus({ ...base, hasSubmittedBid: true }, new Date("2026-04-10T10:00:00Z")),
    "submitted",
  );
  assert.equal(
    derivedStatus({ ...base, declinedAt: new Date("2026-03-16T10:00:00Z") }, new Date("2026-04-10T10:00:00Z")),
    "declined",
  );
  assert.equal(
    derivedStatus({ ...base, storedStatus: "will_bid" }, new Date("2026-03-16T10:00:00Z")),
    "will_bid",
  );
  assert.equal(
    derivedStatus({ ...base, openedAt: null, storedStatus: "sent" }, new Date("2026-03-16T10:00:00Z")),
    "sent",
  );
  // A submitted bid outranks everything, including a past due date.
  assert.equal(
    derivedStatus({ ...base, hasSubmittedBid: true, storedStatus: "sent" }, new Date("2026-03-16T10:00:00Z")),
    "submitted",
  );
});

/* ------------------------------------------------------------------ plans --- */

test("plan gates block with a reason and an upgrade target", () => {
  assert.equal(canCreateProject("crew", 2).allowed, true);
  const blockedProject = canCreateProject("crew", 3);
  assert.equal(blockedProject.allowed, false);
  assert.equal(blockedProject.upgradeTo, "builder");
  assert.match(blockedProject.reason!, /3 active projects/);
  assert.match(blockedProject.reason!, /Builder/);

  assert.equal(canCreateProject("precon", 400).allowed, true); // unlimited

  assert.equal(canAddSeat("crew", 1).allowed, true);
  assert.equal(canAddSeat("crew", 2).allowed, false);
  assert.equal(canAddSeat("builder", 5).upgradeTo, "precon");
  assert.equal(canAddSeat("precon", 12).upgradeTo, null); // nothing above it

  const gb = 1024 ** 3;
  assert.equal(canStore("crew", 20 * gb, 4 * gb).allowed, true);
  assert.equal(canStore("crew", 24 * gb, 2 * gb).allowed, false);

  assert.equal(hasLevelingExports("crew"), false);
  assert.equal(hasLevelingExports("builder"), true);
});

test("a downgrade pauses the projects due furthest out, and deletes nothing", () => {
  const projects = [
    { id: "p-april", bidDueAt: new Date("2026-04-01T00:00:00Z") },
    { id: "p-march", bidDueAt: new Date("2026-03-01T00:00:00Z") },
    { id: "p-may", bidDueAt: new Date("2026-05-01T00:00:00Z") },
    { id: "p-june", bidDueAt: new Date("2026-06-01T00:00:00Z") },
  ];
  assert.deepEqual(pausedProjectIds("crew", projects), ["p-june"]);
  assert.deepEqual(pausedProjectIds("builder", projects), []);
  assert.deepEqual(pausedProjectIds("precon", projects), []);
});

/* ------------------------------------------------------------------ misc --- */

test("small formatters", () => {
  assert.equal(fileSize(512), "512 B");
  assert.equal(fileSize(1024 * 142), "142 KB");
  assert.equal(fileSize(1024 * 1024 * 2.4), "2.4 MB");
  assert.equal(initials("Meridian Electric"), "ME");
  assert.equal(initials("Brightline"), "BR");
  assert.equal(coveragePct(14, 22), 64);
  assert.equal(coveragePct(0, 0), 0);
});
