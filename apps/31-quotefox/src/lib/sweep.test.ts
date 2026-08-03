import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dueRung, nudgeSummary, NUDGE_WINDOW_DAYS } from "@/lib/sweep";

const SENT = new Date("2026-07-01T17:00:00Z");
const days = (n: number) => new Date(SENT.getTime() + n * 86_400_000);

describe("follow-up rungs", () => {
  it("sends nothing before day 2", () => {
    assert.equal(dueRung(SENT, days(0.5)), null);
    assert.equal(dueRung(SENT, days(1.9)), null);
  });

  it("sends the day-2 rung on day 2", () => {
    assert.deepEqual(dueRung(SENT, days(2)), { rung: 2, skipped: [] });
    assert.deepEqual(dueRung(SENT, days(3)), { rung: 2, skipped: [] });
  });

  it("picks the tightest crossed rung, not the loosest", () => {
    // A sweep that had not run for a week must send the day-5 note, not the
    // day-2 one — selecting the loosest rung is how a ladder goes silent.
    assert.deepEqual(dueRung(SENT, days(6)), { rung: 5, skipped: [2] });
  });

  it("stops sending once the window has passed", () => {
    // The mirror failure: a state that stays true forever, so the note arrives
    // three weeks late. Everything crossed is written off instead.
    const late = dueRung(SENT, days(5 + NUDGE_WINDOW_DAYS + 1));
    assert.deepEqual(late, { rung: null, skipped: [2, 5] });
    assert.deepEqual(dueRung(SENT, days(60)), { rung: null, skipped: [2, 5] });
  });

  it("leaves no silent gap between the rungs", () => {
    // The day-2 window (day 2 → day 5) closes exactly as the day-5 rung opens, so
    // a proposal is never in a state where a sweep has nothing to say about it.
    assert.deepEqual(dueRung(SENT, days(4.9)), { rung: 2, skipped: [] });
    assert.deepEqual(dueRung(SENT, days(5)), { rung: 5, skipped: [2] });
    assert.equal(NUDGE_WINDOW_DAYS, 3);
  });
});

describe("nudge summary", () => {
  it("says what is scheduled when nothing has happened", () => {
    assert.match(nudgeSummary([]), /day 2 and day 5/i);
  });

  it("reports sends and skips", () => {
    const line = nudgeSummary([
      { rung: 2, sentAt: null, skippedReason: "superseded by a later rung" },
      { rung: 5, sentAt: new Date(), skippedReason: null },
    ]);
    assert.match(line, /Day 2 skipped/);
    assert.match(line, /Day 5 nudge sent/);
  });
});
