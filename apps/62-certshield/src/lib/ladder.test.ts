/**
 * The chasing ladder, simulated day by day across a full renewal cycle.
 *
 * These are the two bugs the brief warns about, asserted directly: a rung that
 * fires forever, and a ladder that fires once and goes silent.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, daysBetween } from "./dates";
import { CHASE_OFFSETS, crossedThreshold, ledgerKey, nextChase, normaliseOffsets } from "./ladder";
import { evaluate } from "./compliance";
import type { RequirementLine } from "@/db/schema";

const GL: RequirementLine = {
  coverage: "gl_each_occurrence",
  label: "GL each occurrence",
  minCents: 100_000_000,
};

/** Walk a calendar, running the ladder once per day, honouring the ledger. */
function simulate(
  from: string,
  days: number,
  verdictOn: (today: string) => Parameters<typeof nextChase>[0]["status"] extends never
    ? never
    : { status: ReturnType<typeof evaluate>["status"]; soonestExpiry: string | null; daysToExpiry: number | null },
): Array<{ day: string; kind: string; cycle: string }> {
  const sent = new Set<string>();
  const fired: Array<{ day: string; kind: string; cycle: string }> = [];
  for (let i = 0; i < days; i++) {
    const today = addDays(from, i);
    const v = verdictOn(today);
    const due = nextChase({ ...v, today, sent });
    if (due) {
      sent.add(ledgerKey(due.kind, due.expiryCycle));
      fired.push({ day: today, kind: due.kind, cycle: due.expiryCycle });
    }
  }
  return fired;
}

/* ---------------------------------------------------------------- threshold */

test("the tightest crossed threshold is selected, not the loosest", () => {
  const offsets = [...CHASE_OFFSETS];
  assert.equal(crossedThreshold(45, offsets), null);
  assert.equal(crossedThreshold(30, offsets), 30);
  // 29 days out, 14 is not yet crossed — 30 is still the tightest crossed rung,
  // and it has already been sent, so nothing new fires.
  assert.equal(crossedThreshold(29, offsets), 30);
  assert.equal(crossedThreshold(15, offsets), 30);
  assert.equal(crossedThreshold(14, offsets), 14);
  assert.equal(crossedThreshold(12, offsets), 14);
  assert.equal(crossedThreshold(7, offsets), 7);
  assert.equal(crossedThreshold(3, offsets), 7);
  assert.equal(crossedThreshold(1, offsets), 1);
  assert.equal(crossedThreshold(0, offsets), 1);
  assert.equal(crossedThreshold(-1, offsets), null);
});

test("configured offsets are sorted loosest-first and bad values dropped", () => {
  assert.deepEqual(normaliseOffsets([7, 30, 14]), [30, 14, 7]);
  assert.deepEqual(normaliseOffsets([]), [30, 14, 7, 1]);
  assert.deepEqual(normaliseOffsets([0, -3, 999, 45]), [30, 14, 7, 1]);
  assert.deepEqual(normaliseOffsets([14, 14, 7]), [14, 7]);
});

/* ------------------------------------------------------------- a full cycle */

test("a compliant policy walks the whole ladder, each rung exactly once", () => {
  const expiry = "2026-10-01";
  const fired = simulate("2026-08-20", 60, (today) => {
    const v = evaluate({
      template: { lines: [GL], flags: {} },
      coverages: [
        {
          kind: "gl_each_occurrence",
          limitCents: 100_000_000,
          effectiveOn: "2025-10-01",
          expiresOn: expiry,
          additionalInsured: true,
          waiverOfSubrogation: true,
        },
      ],
      today,
    });
    return { status: v.status, soonestExpiry: v.soonestExpiry, daysToExpiry: v.daysToExpiry };
  });

  assert.deepEqual(
    fired.map((f) => `${f.day} ${f.kind}`),
    [
      "2026-09-01 renewal_t30",
      "2026-09-17 renewal_t14",
      "2026-09-24 renewal_t7",
      "2026-09-30 renewal_t1",
      "2026-10-02 lapsed",
    ],
  );
  // Every rung is on the one cycle key, and no rung repeats.
  assert.ok(fired.every((f) => f.cycle === expiry));
  assert.equal(new Set(fired.map((f) => f.kind)).size, fired.length);
});

test("the lapse notice fires once and then never again — not daily forever", () => {
  const expiry = "2026-08-01";
  const fired = simulate("2026-08-02", 120, (today) => ({
    status: "expired",
    soonestExpiry: expiry,
    daysToExpiry: daysBetween(today, expiry),
  }));
  assert.deepEqual(fired.map((f) => f.kind), ["lapsed"]);
  assert.equal(fired[0].day, "2026-08-02");
});

test("a ladder started late fires the rung it is actually on, then continues", () => {
  // The cron did not run for three weeks; today is 12 days out with nothing sent.
  const expiry = "2026-10-01";
  const fired = simulate("2026-09-19", 20, (today) => ({
    status: "compliant",
    soonestExpiry: expiry,
    daysToExpiry: daysBetween(today, expiry),
  }));
  assert.deepEqual(
    fired.map((f) => `${f.day} ${f.kind}`),
    ["2026-09-19 renewal_t14", "2026-09-24 renewal_t7", "2026-09-30 renewal_t1", "2026-10-02 lapsed"],
  );
});

test("a compliant certificate more than 30 days out is left alone", () => {
  const fired = simulate("2026-08-03", 40, () => ({
    status: "compliant",
    soonestExpiry: "2027-06-01",
    daysToExpiry: 302,
  }));
  assert.deepEqual(fired, []);
});

/* --------------------------------------------------- stop on a replacement */

test("a compliant replacement stops the ladder mid-cycle", () => {
  const oldExpiry = "2026-10-01";
  const newExpiry = "2027-10-01";
  const renewedOn = "2026-09-20";
  const fired = simulate("2026-08-25", 60, (today) => {
    const expiry = today >= renewedOn ? newExpiry : oldExpiry;
    return {
      status: "compliant",
      soonestExpiry: expiry,
      daysToExpiry: daysBetween(today, expiry),
    };
  });
  // T-30 and T-14 fired on the old cycle; the replacement lands and nothing else
  // is owed, because the new cycle's T-30 is a year away.
  assert.deepEqual(
    fired.map((f) => `${f.kind}@${f.cycle}`),
    [`renewal_t30@${oldExpiry}`, `renewal_t14@${oldExpiry}`],
  );
});

test("a replacement that is itself deficient gets a letter, not silence", () => {
  const fired = simulate("2026-08-03", 5, () => ({
    status: "deficient",
    soonestExpiry: "2027-05-01",
    daysToExpiry: 271,
  }));
  assert.deepEqual(fired.map((f) => f.kind), ["deficiency"]);
  assert.equal(fired[0].cycle, "2027-05-01");
});

/* -------------------------------------------------------- deficient + close */

test("deficient and expiring: the letter first, then the renewal rungs resume", () => {
  const expiry = "2026-09-02"; // 30 days out on 2026-08-03
  const fired = simulate("2026-08-03", 35, (today) => ({
    status: "deficient",
    soonestExpiry: expiry,
    daysToExpiry: daysBetween(today, expiry),
  }));
  assert.deepEqual(
    fired.map((f) => `${f.day} ${f.kind}`),
    [
      "2026-08-03 deficiency",
      "2026-08-04 renewal_t30",
      "2026-08-19 renewal_t14",
      "2026-08-26 renewal_t7",
      "2026-09-01 renewal_t1",
      "2026-09-03 lapsed",
    ],
  );
});

/* -------------------------------------------------- no certificate on file */

test("a vendor with no certificate is chased monthly, never daily", () => {
  const fired = simulate("2026-08-03", 120, () => ({
    status: "missing",
    soonestExpiry: null,
    daysToExpiry: null,
  }));
  assert.deepEqual(
    fired.map((f) => `${f.day} ${f.cycle}`),
    ["2026-08-03 2026-08-01", "2026-09-01 2026-09-01", "2026-10-01 2026-10-01", "2026-11-01 2026-11-01"],
  );
  assert.ok(fired.every((f) => f.kind === "deficiency"));
});

test("a certificate with no readable expiry is also chased monthly, not daily", () => {
  const fired = simulate("2026-08-03", 70, () => ({
    status: "deficient",
    soonestExpiry: null,
    daysToExpiry: null,
  }));
  assert.equal(fired.length, 3);
  assert.deepEqual(fired.map((f) => f.cycle), ["2026-08-01", "2026-09-01", "2026-10-01"]);
});

/* -------------------------------------------------------------- idempotence */

test("running the ladder twice in one day sends nothing the second time", () => {
  const sent = new Set<string>();
  const input = {
    status: "expired" as const,
    soonestExpiry: "2026-08-01",
    daysToExpiry: -2,
    today: "2026-08-03",
    sent,
  };
  const first = nextChase(input);
  assert.deepEqual(first, { kind: "lapsed", expiryCycle: "2026-08-01" });
  sent.add(ledgerKey(first!.kind, first!.expiryCycle));
  assert.equal(nextChase(input), null);
});
