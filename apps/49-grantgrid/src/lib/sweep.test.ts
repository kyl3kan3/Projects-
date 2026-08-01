import assert from "node:assert/strict";
import { test } from "node:test";
import { previewLadder } from "./sweep";
import { DEFAULT_OFFSETS, OVERDUE_OFFSET } from "./reminders";

const DEADLINE = {
  kind: "application" as const,
  dueOn: "2026-09-15",
  completedAt: null,
};

test("the preview shows the whole ladder when the deadline is still far off", () => {
  assert.deepEqual(
    previewLadder(DEADLINE, DEFAULT_OFFSETS, "2026-08-01").map((r) => [r.on, r.offsetDays]),
    [
      ["2026-09-01", 14],
      ["2026-09-08", 7],
      ["2026-09-14", 1],
      ["2026-09-16", OVERDUE_OFFSET],
    ],
  );
});

test("a rung already behind us is shown firing on the next sweep, not in the past", () => {
  // Nine days out: the 14-day rung's nominal date was 1 September, which is gone.
  // It fires tonight — and the screen must say tonight, not last week, or someone
  // will go looking for an email that was never sent.
  const preview = previewLadder(DEADLINE, DEFAULT_OFFSETS, "2026-09-06");
  assert.deepEqual(
    preview.map((r) => [r.on, r.offsetDays]),
    [
      ["2026-09-06", 14],
      ["2026-09-08", 7],
      ["2026-09-14", 1],
      ["2026-09-16", OVERDUE_OFFSET],
    ],
  );
});

test("rungs already sent drop out of the preview", () => {
  const preview = previewLadder(DEADLINE, DEFAULT_OFFSETS, "2026-09-02", [14]);
  assert.deepEqual(
    preview.map((r) => [r.on, r.offsetDays]),
    [
      ["2026-09-08", 7],
      ["2026-09-14", 1],
      ["2026-09-16", OVERDUE_OFFSET],
    ],
  );
});

test("an overdue deadline has exactly one notice left, and then none", () => {
  assert.deepEqual(
    previewLadder(DEADLINE, DEFAULT_OFFSETS, "2026-09-20", [14, 7, 1]).map(
      (r) => r.offsetDays,
    ),
    [OVERDUE_OFFSET],
  );
  assert.deepEqual(
    previewLadder(DEADLINE, DEFAULT_OFFSETS, "2026-09-20", [14, 7, 1, OVERDUE_OFFSET]),
    [],
  );
});

test("a completed deadline has nothing coming", () => {
  assert.deepEqual(
    previewLadder(
      { ...DEADLINE, completedAt: new Date("2026-09-02T00:00:00Z") },
      DEFAULT_OFFSETS,
      "2026-09-02",
    ),
    [],
  );
});

test("report deadlines mark their escalating rungs", () => {
  const preview = previewLadder(
    { ...DEADLINE, kind: "report" },
    DEFAULT_OFFSETS,
    "2026-08-01",
  );
  assert.deepEqual(
    preview.map((r) => r.escalate),
    [false, false, true, true],
  );
});
