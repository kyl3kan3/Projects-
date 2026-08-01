import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_LADDER,
  decideNextRung,
  ladderStatusLine,
  nextRungDate,
  normalizeLadder,
  offsetLabel,
  urgencyScore,
  type LadderContext,
  type LadderRunState,
} from "@/lib/ladder";
import { addDays } from "@/lib/dates";
import type { SequenceStep } from "@/db/schema";

const DUE = "2026-07-10";

function run(overrides: Partial<LadderRunState> = {}): LadderRunState {
  return {
    highestStepSent: -1,
    pausedByReply: false,
    hasOpenPromise: false,
    escalateAfterBrokenPromise: false,
    stopped: false,
    ...overrides,
  };
}

function ctx(overrides: Partial<LadderContext> = {}): LadderContext {
  return {
    ladder: DEFAULT_LADDER,
    invoice: { dueAt: DUE, balanceCents: 1_240_000, status: "open" },
    run: run(),
    clientVip: false,
    firmPaused: false,
    asOf: DUE,
    ...overrides,
  };
}

/** `n` days from the due date. */
const day = (n: number) => addDays(DUE, n);

describe("normalizeLadder", () => {
  it("keeps the default ladder as written", () => {
    assert.deepEqual(
      normalizeLadder(DEFAULT_LADDER).map((s) => s.offsetDaysFromDue),
      [-3, 3, 10, 21],
    );
  });

  it("sorts an out-of-order ladder rather than stranding a rung", () => {
    const messy: SequenceStep[] = [
      { offsetDaysFromDue: 21, escalationLevel: 4 },
      { offsetDaysFromDue: 3, escalationLevel: 2 },
      { offsetDaysFromDue: 10, escalationLevel: 3 },
    ];
    assert.deepEqual(
      normalizeLadder(messy).map((s) => s.offsetDaysFromDue),
      [3, 10, 21],
    );
  });

  it("forces distinct days so two rungs cannot collapse into one", () => {
    const same: SequenceStep[] = [
      { offsetDaysFromDue: 5, escalationLevel: 2 },
      { offsetDaysFromDue: 5, escalationLevel: 3 },
      { offsetDaysFromDue: 5, escalationLevel: 4 },
    ];
    assert.deepEqual(
      normalizeLadder(same).map((s) => s.offsetDaysFromDue),
      [5, 6, 7],
    );
  });

  it("never lets escalation go backwards", () => {
    const backwards: SequenceStep[] = [
      { offsetDaysFromDue: 3, escalationLevel: 3 },
      { offsetDaysFromDue: 10, escalationLevel: 1 },
    ];
    assert.deepEqual(
      normalizeLadder(backwards).map((s) => s.escalationLevel),
      [3, 3],
    );
  });

  it("falls back to the default rather than leaving a firm with no ladder", () => {
    assert.deepEqual(normalizeLadder([]), DEFAULT_LADDER);
  });

  it("caps the ladder length", () => {
    const long: SequenceStep[] = Array.from({ length: 12 }, (_, i) => ({
      offsetDaysFromDue: i * 3,
      escalationLevel: 2 as const,
    }));
    assert.equal(normalizeLadder(long).length, 6);
  });
});

describe("decideNextRung — the pinned rungs", () => {
  it("says nothing before the first rung's date", () => {
    const d = decideNextRung(ctx({ asOf: day(-10) }));
    assert.deepEqual(d, { action: "hold", reason: "before_first_rung" });
  });

  it("sends the heads-up exactly 3 days before due", () => {
    const d = decideNextRung(ctx({ asOf: day(-3) }));
    assert.equal(d.action, "send");
    if (d.action !== "send") return;
    assert.equal(d.stepIndex, 0);
    assert.equal(d.step.escalationLevel, 1);
    assert.equal(d.isFinalRung, false);
  });

  it("holds the day after a rung has been sent — this is the not-every-day rule", () => {
    for (const n of [-2, -1, 0, 1, 2]) {
      const d = decideNextRung(ctx({ asOf: day(n), run: run({ highestStepSent: 0 }) }));
      assert.deepEqual(
        d,
        { action: "hold", reason: "waiting_for_next_rung" },
        `day ${n} should be quiet`,
      );
    }
  });

  it("advances to the gentle rung on day +3, not before", () => {
    assert.equal(
      decideNextRung(ctx({ asOf: day(2), run: run({ highestStepSent: 0 }) })).action,
      "hold",
    );
    const d = decideNextRung(ctx({ asOf: day(3), run: run({ highestStepSent: 0 }) }));
    assert.equal(d.action, "send");
    if (d.action === "send") assert.equal(d.stepIndex, 1);
  });

  it("goes quiet for good once the final rung is behind us", () => {
    for (const n of [21, 22, 40, 200, 900]) {
      assert.deepEqual(decideNextRung(ctx({ asOf: day(n), run: run({ highestStepSent: 3 }) })), {
        action: "hold",
        reason: "ladder_complete",
      });
    }
  });

  it("selects the TIGHTEST crossed rung when the sweep has been down", () => {
    // 15 days late with nothing sent: the firm notice is the honest send, not a
    // heads-up about a date that passed a fortnight ago.
    const d = decideNextRung(ctx({ asOf: day(15) }));
    assert.equal(d.action, "send");
    if (d.action !== "send") return;
    assert.equal(d.stepIndex, 2);
    assert.equal(d.step.escalationLevel, 3);
  });

  it("jumps straight to the final rung on a very old invoice", () => {
    const d = decideNextRung(ctx({ asOf: day(212) }));
    assert.equal(d.action, "send");
    if (d.action !== "send") return;
    assert.equal(d.stepIndex, 3);
    assert.equal(d.isFinalRung, true);
  });
});

describe("decideNextRung — aging one invoice through the whole ladder", () => {
  /**
   * The test that catches both failure modes at once: sweep every day for a
   * year, feeding each send back in the way the database would. A ladder that
   * stalls sends fewer than four; a ladder that never stops sends hundreds.
   */
  it("sends exactly four notices over 365 daily sweeps, on the pinned days", () => {
    let state = run();
    const sentOn: number[] = [];
    for (let n = -30; n <= 335; n++) {
      const decision = decideNextRung(ctx({ asOf: day(n), run: state }));
      if (decision.action === "send") {
        sentOn.push(n);
        state = { ...state, highestStepSent: decision.stepIndex };
      }
    }
    assert.deepEqual(sentOn, [-3, 3, 10, 21]);
  });

  it("stops the moment the invoice is paid, mid-ladder", () => {
    let state = run();
    const sentOn: number[] = [];
    for (let n = -30; n <= 120; n++) {
      const paid = n >= 6;
      const decision = decideNextRung(
        ctx({
          asOf: day(n),
          run: state,
          invoice: {
            dueAt: DUE,
            balanceCents: paid ? 0 : 1_240_000,
            status: paid ? "paid" : "open",
          },
        }),
      );
      if (decision.action === "send") {
        sentOn.push(n);
        state = { ...state, highestStepSent: decision.stepIndex };
      }
    }
    assert.deepEqual(sentOn, [-3, 3]);
  });

  it("keeps chasing a partial payment", () => {
    const d = decideNextRung(
      ctx({
        asOf: day(10),
        run: run({ highestStepSent: 1 }),
        invoice: { dueAt: DUE, balanceCents: 400_000, status: "partial" },
      }),
    );
    assert.equal(d.action, "send");
  });

  it("a custom ladder is walked the same way", () => {
    const custom: SequenceStep[] = [
      { offsetDaysFromDue: 1, escalationLevel: 2 },
      { offsetDaysFromDue: 14, escalationLevel: 4 },
    ];
    let state = run();
    const sentOn: number[] = [];
    for (let n = -10; n <= 200; n++) {
      const decision = decideNextRung(ctx({ asOf: day(n), run: state, ladder: custom }));
      if (decision.action === "send") {
        sentOn.push(n);
        state = { ...state, highestStepSent: decision.stepIndex };
      }
    }
    assert.deepEqual(sentOn, [1, 14]);
  });
});

describe("decideNextRung — the reasons to stay quiet", () => {
  it("never chases a settled invoice, even if the status column is stale", () => {
    assert.deepEqual(
      decideNextRung(
        ctx({ asOf: day(30), invoice: { dueAt: DUE, balanceCents: 0, status: "open" } }),
      ),
      { action: "hold", reason: "settled" },
    );
  });

  it("never chases written-off or disputed invoices", () => {
    assert.equal(
      decideNextRung(
        ctx({ asOf: day(30), invoice: { dueAt: DUE, balanceCents: 500, status: "written_off" } }),
      ).action,
      "hold",
    );
    assert.deepEqual(
      decideNextRung(
        ctx({ asOf: day(30), invoice: { dueAt: DUE, balanceCents: 500, status: "disputed" } }),
      ),
      { action: "hold", reason: "disputed" },
    );
  });

  it("never chases a VIP client automatically", () => {
    assert.deepEqual(decideNextRung(ctx({ asOf: day(30), clientVip: true })), {
      action: "hold",
      reason: "vip",
    });
  });

  it("obeys the firm-wide kill switch", () => {
    assert.deepEqual(decideNextRung(ctx({ asOf: day(30), firmPaused: true })), {
      action: "hold",
      reason: "firm_paused",
    });
  });

  it("holds while a reply is waiting for a human", () => {
    assert.deepEqual(
      decideNextRung(ctx({ asOf: day(30), run: run({ pausedByReply: true }) })),
      { action: "hold", reason: "paused_reply" },
    );
  });

  it("holds while a promise to pay is open", () => {
    assert.deepEqual(
      decideNextRung(ctx({ asOf: day(30), run: run({ hasOpenPromise: true }) })),
      { action: "hold", reason: "open_promise" },
    );
  });

  it("puts money before every other check", () => {
    // Paid AND VIP AND paused: the answer is still "settled", so a paid invoice
    // can never be reported as merely "paused".
    assert.deepEqual(
      decideNextRung(
        ctx({
          asOf: day(30),
          clientVip: true,
          firmPaused: true,
          run: run({ pausedByReply: true, hasOpenPromise: true }),
          invoice: { dueAt: DUE, balanceCents: 0, status: "paid" },
        }),
      ),
      { action: "hold", reason: "settled" },
    );
  });
});

describe("decideNextRung — broken promises", () => {
  it("resumes one rung up, immediately, with promise-aware copy", () => {
    // Rung 2 (index 1) went out on day +3; the client promised day +8 and
    // missed it. Day +9 is not day +10, so without the broken-promise flag
    // nothing would go out.
    assert.deepEqual(decideNextRung(ctx({ asOf: day(9), run: run({ highestStepSent: 1 }) })), {
      action: "hold",
      reason: "waiting_for_next_rung",
    });

    const d = decideNextRung(
      ctx({
        asOf: day(9),
        run: run({ highestStepSent: 1, escalateAfterBrokenPromise: true }),
      }),
    );
    assert.equal(d.action, "send");
    if (d.action !== "send") return;
    assert.equal(d.stepIndex, 2);
    assert.equal(d.promiseAware, true);
  });

  it("a broken promise cannot restart a finished ladder", () => {
    assert.deepEqual(
      decideNextRung(
        ctx({
          asOf: day(60),
          run: run({ highestStepSent: 3, escalateAfterBrokenPromise: true }),
        }),
      ),
      { action: "hold", reason: "ladder_complete" },
    );
  });

  it("a broken promise buys one step, not an unlimited licence", () => {
    // The flag stays set until the send commits; the run then records the new
    // highest rung, so the next sweep holds again.
    let state = run({ highestStepSent: 1, escalateAfterBrokenPromise: true });
    const first = decideNextRung(ctx({ asOf: day(9), run: state }));
    assert.equal(first.action, "send");
    if (first.action === "send") {
      state = { ...state, highestStepSent: first.stepIndex, escalateAfterBrokenPromise: false };
    }
    assert.deepEqual(decideNextRung(ctx({ asOf: day(9), run: state })), {
      action: "hold",
      reason: "waiting_for_next_rung",
    });
  });

  it("still names the broken promise when the rung's own date had arrived anyway", () => {
    // Day +10 has arrived, so this rung was due regardless — but the client gave
    // us a date and missed it, and the copy must acknowledge that rather than
    // reading like a first-time nudge.
    const d = decideNextRung(
      ctx({ asOf: day(10), run: run({ highestStepSent: 1, escalateAfterBrokenPromise: true }) }),
    );
    assert.equal(d.action, "send");
    if (d.action === "send") {
      assert.equal(d.stepIndex, 2);
      assert.equal(d.promiseAware, true);
    }
  });
});

describe("nextRungDate", () => {
  it("pins each rung to a fixed calendar date", () => {
    assert.equal(nextRungDate(DEFAULT_LADDER, DUE, -1), "2026-07-07");
    assert.equal(nextRungDate(DEFAULT_LADDER, DUE, 0), "2026-07-13");
    assert.equal(nextRungDate(DEFAULT_LADDER, DUE, 1), "2026-07-20");
    assert.equal(nextRungDate(DEFAULT_LADDER, DUE, 2), "2026-07-31");
    assert.equal(nextRungDate(DEFAULT_LADDER, DUE, 3), null);
  });
});

describe("ladderStatusLine", () => {
  it("counts the steps sent and names the next date", () => {
    const line = ladderStatusLine(ctx({ asOf: day(5), run: run({ highestStepSent: 1 }) }));
    assert.equal(line.stepsSent, 2);
    assert.equal(line.totalSteps, 4);
    assert.equal(line.nextOn, "2026-07-20");
    assert.match(line.label, /step 2\/4 · next 20 JUL/);
  });

  it("says a settled invoice is settled, not 'overdue'", () => {
    const line = ladderStatusLine(
      ctx({ asOf: day(212), invoice: { dueAt: DUE, balanceCents: 0, status: "paid" } }),
    );
    assert.equal(line.hold, "settled");
    assert.match(line.label, /settled/);
  });

  it("says when the ladder is exhausted and a human is needed", () => {
    const line = ladderStatusLine(ctx({ asOf: day(60), run: run({ highestStepSent: 3 }) }));
    assert.equal(line.hold, "ladder_complete");
    assert.match(line.label, /needs a human/);
  });

  it("keeps the row line short enough for a 390px row", () => {
    for (const n of [-10, -3, 0, 5, 15, 40, 300]) {
      for (const sent of [-1, 0, 1, 2, 3]) {
        const line = ladderStatusLine(ctx({ asOf: day(n), run: run({ highestStepSent: sent }) }));
        assert.ok(line.label.length <= 32, `"${line.label}" is ${line.label.length} chars`);
      }
    }
  });

  it("never promises a nudge the engine would refuse to send", () => {
    const line = ladderStatusLine(ctx({ asOf: day(30), clientVip: true }));
    assert.equal(line.hold, "vip");
    assert.doesNotMatch(line.label, /next/);
  });
});

describe("offsetLabel", () => {
  it("reads like the step card in DESIGN.md", () => {
    assert.equal(offsetLabel(-3), "DUE −3D");
    assert.equal(offsetLabel(10), "DUE +10D");
    assert.equal(offsetLabel(0), "ON DUE DATE");
  });
});

describe("urgencyScore", () => {
  it("puts a stalled ladder above a merely late invoice", () => {
    const stalled = urgencyScore({
      daysLate: 30,
      stepsSent: 4,
      hold: "ladder_complete",
      balanceCents: 100_000,
    });
    const late = urgencyScore({ daysLate: 90, stepsSent: 1, hold: null, balanceCents: 900_000 });
    assert.ok(stalled > late);
  });
});
