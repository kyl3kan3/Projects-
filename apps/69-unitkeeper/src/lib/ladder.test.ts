import assert from "node:assert/strict";
import { test } from "node:test";
import { dueRungs, lienEligibleDay, nextRung, normalizeLadder, type LadderStep } from "@/lib/ladder";

const LADDER: LadderStep[] = [
  { day: 3, action: "retry" },
  { day: 6, action: "late_fee", feeCents: 2000 },
  { day: 11, action: "overlock" },
  { day: 30, action: "lien_eligible" },
];

test("nothing fires before its day", () => {
  assert.deepEqual(dueRungs(LADDER, 0, []), []);
  assert.deepEqual(dueRungs(LADDER, 2, []), []);
  assert.deepEqual(
    dueRungs(LADDER, 3, []).map((s) => s.action),
    ["retry"],
  );
});

test("a tick that missed a week fires every rung it crossed, in order", () => {
  // This is the failure mode the brief calls out: picking the loosest crossed
  // threshold means the day-3 retry fires and nothing ever happens again.
  assert.deepEqual(
    dueRungs(LADDER, 12, []).map((s) => s.action),
    ["retry", "late_fee", "overlock"],
  );
});

test("a rung already fired never fires again", () => {
  const fired = [
    { day: 3, action: "retry" as const },
    { day: 6, action: "late_fee" as const },
  ];
  assert.deepEqual(
    dueRungs(LADDER, 40, fired).map((s) => s.action),
    ["overlock", "lien_eligible"],
  );
  assert.deepEqual(
    dueRungs(LADDER, 400, [...fired, { day: 11, action: "overlock" as const }, { day: 30, action: "lien_eligible" as const }]),
    [],
    "400 days delinquent is still four rungs, not 400 emails",
  );
});

test("the next rung is the tightest one not yet reached", () => {
  assert.equal(nextRung(LADDER, 0)?.day, 3);
  assert.equal(nextRung(LADDER, 3)?.day, 6);
  assert.equal(nextRung(LADDER, 11)?.day, 30);
  assert.equal(nextRung(LADDER, 30), null);
});

test("normalizeLadder survives whatever jsonb hands back", () => {
  const messy = [
    { day: 6, action: "late_fee", feeCents: 2000 },
    { day: 3, action: "retry" },
    { day: 6, action: "late_fee", feeCents: 9999 },
    { day: -1, action: "overlock" },
    { day: 5, action: "nonsense" },
    "not an object",
    null,
    { day: 1.5, action: "retry" },
  ];
  const clean = normalizeLadder(messy);
  assert.deepEqual(
    clean.map((s) => [s.day, s.action]),
    [
      [3, "retry"],
      [6, "late_fee"],
    ],
  );
  assert.equal(clean[1].feeCents, 2000, "the first definition of a duplicate rung wins");
  assert.deepEqual(normalizeLadder(undefined), []);
  assert.deepEqual(normalizeLadder({ day: 3 }), []);
});

test("a late fee with no amount is normalised to zero rather than NaN", () => {
  const clean = normalizeLadder([{ day: 6, action: "late_fee" }]);
  assert.equal(clean[0].feeCents, 0);
});

test("lienEligibleDay reports the configured rung, or null", () => {
  assert.equal(lienEligibleDay(LADDER), 30);
  assert.equal(lienEligibleDay(LADDER.slice(0, 3)), null);
});
