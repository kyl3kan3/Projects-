import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { durationLabel, elapsed, jobPill, proposalPill, proposalState } from "@/lib/display";
import { computeDepositCents, depositWarning, describeDeposit } from "@/lib/deposits";

const NOW = new Date("2026-08-03T15:00:00Z");

describe("proposal state is derived, not read", () => {
  it("calls a lapsed proposal expired even when the column says sent", () => {
    // The column is moved by a daily sweep, so it can be a day stale. A screen
    // that renders it raw shows "awaiting response" on a dead bid.
    const state = proposalState(
      { status: "sent", expiresAt: new Date("2026-07-20T00:00:00Z") },
      NOW,
    );
    assert.equal(state, "expired");
    assert.equal(proposalPill(state).label, "Expired");
  });

  it("leaves a live proposal alone", () => {
    assert.equal(
      proposalState({ status: "viewed", expiresAt: new Date("2026-08-20T00:00:00Z") }, NOW),
      "viewed",
    );
  });

  it("never expires something already accepted or paid", () => {
    for (const status of ["accepted", "deposit_paid"] as const) {
      assert.equal(
        proposalState({ status, expiresAt: new Date("2026-01-01T00:00:00Z") }, NOW),
        status,
      );
    }
  });

  it("marks accepted and paid as the emphatic states", () => {
    assert.equal(proposalPill("accepted").emphatic, true);
    assert.equal(proposalPill("deposit_paid").emphatic, true);
    assert.equal(proposalPill("sent").emphatic, undefined);
  });
});

describe("the job row's pill", () => {
  it("prefers the proposal's derived state", () => {
    const pill = jobPill(
      {
        jobStatus: "quoted",
        proposalStatus: "sent",
        proposalExpiresAt: new Date("2026-07-01T00:00:00Z"),
      },
      NOW,
    );
    assert.equal(pill.label, "Expired");
  });

  it("counts unpriced rows before it says draft", () => {
    const pill = jobPill({ jobStatus: "open", estimateStatus: "draft", needsPricing: 2 }, NOW);
    assert.equal(pill.label, "2 need pricing");
    assert.equal(pill.tone, "waiting");
  });

  it("shows the pipeline while it runs", () => {
    assert.equal(
      jobPill({ jobStatus: "open", walkthroughStatus: "transcribing" }, NOW).label,
      "Transcribing",
    );
  });

  it("says so when a capture failed and nothing was drafted", () => {
    assert.equal(
      jobPill({ jobStatus: "open", walkthroughStatus: "failed" }, NOW).label,
      "Capture failed",
    );
  });

  it("falls back to the honest empty state", () => {
    assert.equal(jobPill({ jobStatus: "open" }, NOW).label, "No walkthrough yet");
  });
});

describe("time labels", () => {
  it("writes the time-to-send figure", () => {
    assert.equal(durationLabel(161), "2h 41m");
    assert.equal(durationLabel(45), "45m");
    assert.equal(durationLabel(1_500), "1d 1h");
    assert.equal(durationLabel(null), "—");
  });

  it("writes the recording timer", () => {
    assert.equal(elapsed(0), "0:00");
    assert.equal(elapsed(65), "1:05");
    assert.equal(elapsed(247), "4:07");
  });
});

describe("deposit wording", () => {
  it("describes what the homeowner will be asked for", () => {
    assert.equal(describeDeposit("percent", 10, 1_000_000), "10% ($1,000.00)");
    assert.equal(describeDeposit("fixed", 50_000, 1_000_000), "$500.00 fixed");
    assert.equal(describeDeposit("none", 0, 1_000_000), "No deposit");
  });

  it("warns on a state cap and suggests the legal number", () => {
    const warning = depositWarning(computeDepositCents(2_000_000, "percent", 10), 2_000_000, "CA");
    assert.ok(warning);
    // California: 10% or $1,000, whichever is less.
    assert.equal(warning.suggestedCents, 100_000);
    assert.match(warning.message, /California/);
  });

  it("stays quiet where there is no cap", () => {
    assert.equal(depositWarning(200_000, 2_000_000, "TX"), null);
    assert.equal(depositWarning(200_000, 2_000_000, null), null);
  });

  it("stays quiet when the deposit is under the cap", () => {
    assert.equal(depositWarning(50_000, 900_000, "CA"), null);
  });
});
