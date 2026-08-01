/**
 * Coverage derivation — the one answer the counter cares about, and the single
 * source of truth behind the search row, the participant detail, the check-in
 * tap and the incident linker. If these disagree, staff stop trusting the pill.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveCoverage, COVERAGE_LABEL } from "@/lib/search";
import { daysUntil, shouldSendResignNotice } from "@/lib/coverage";
import type { Signature } from "@/db/schema";

const TZ = "America/Denver";
const NOW = new Date("2026-07-04T18:00:00Z");

function sig(overrides: Partial<Signature> = {}): Signature {
  return {
    id: overrides.id ?? "sig-1",
    signedAt: new Date("2026-03-02T16:41:00Z"),
    expiresAt: new Date("2027-03-02T16:41:00Z"),
    expiryRule: "days_365",
    minorAtSigning: false,
    resignAtMajority: true,
    ageOfMajorityAtSigning: 18,
    ...overrides,
  } as Signature;
}

describe("deriveCoverage", () => {
  it("reports NONE with no signatures at all", () => {
    const state = deriveCoverage([], "1988-06-14", NOW, TZ);
    assert.equal(state.coverage, "none");
    assert.equal(state.provingSignature, null);
    assert.match(state.reason ?? "", /No waiver on file/);
  });

  it("reports ON FILE for a current annual waiver and names the proving row", () => {
    const state = deriveCoverage([sig()], "1988-06-14", NOW, TZ);
    assert.equal(state.coverage, "on_file");
    assert.equal(state.provingSignature?.id, "sig-1");
    assert.equal(state.reason, null);
  });

  it("reports VISITOR for a valid single-visit waiver, not ON FILE", () => {
    const today = deriveCoverage(
      [
        sig({
          signedAt: new Date("2026-07-04T15:00:00Z"),
          expiresAt: new Date("2026-07-05T06:00:00Z"),
          expiryRule: "visit",
        }),
      ],
      "1988-06-14",
      NOW,
      TZ,
    );
    assert.equal(today.coverage, "visitor");
    assert.ok(today.provingSignature);
  });

  it("reports EXPIRED once a waiver's term has run out", () => {
    const state = deriveCoverage(
      [sig({ expiresAt: new Date("2026-06-01T00:00:00Z") })],
      "1988-06-14",
      NOW,
      TZ,
    );
    assert.equal(state.coverage, "expired");
    assert.equal(state.provingSignature, null);
    assert.match(state.reason ?? "", /expired/i);
  });

  it("prefers the newest valid signature when someone has re-signed", () => {
    const old = sig({ id: "old", signedAt: new Date("2025-01-01T00:00:00Z"), expiresAt: new Date("2026-01-01T00:00:00Z") });
    const fresh = sig({ id: "fresh", signedAt: new Date("2026-06-30T00:00:00Z") });
    const state = deriveCoverage([old, fresh], "1988-06-14", NOW, TZ);
    assert.equal(state.coverage, "on_file");
    assert.equal(state.provingSignature?.id, "fresh");
  });

  it("finds a still-valid older waiver even when a newer one has lapsed", () => {
    // A single-visit waiver signed last week plus a 'forever' one from 2024:
    // the standing record is what proves coverage today.
    const forever = sig({ id: "forever", signedAt: new Date("2024-05-01T00:00:00Z"), expiresAt: null, expiryRule: "forever" });
    const visit = sig({
      id: "visit",
      signedAt: new Date("2026-06-20T15:00:00Z"),
      expiresAt: new Date("2026-06-21T06:00:00Z"),
      expiryRule: "visit",
    });
    const state = deriveCoverage([visit, forever], "1988-06-14", NOW, TZ);
    assert.equal(state.coverage, "on_file");
    assert.equal(state.provingSignature?.id, "forever");
  });

  it("shows a minor who has since turned 18 as EXPIRED, with the reason", () => {
    // Signed by a guardian on 2 March 2026 with no expiry; the participant
    // turned 18 on 14 June 2026, before today.
    const state = deriveCoverage(
      [sig({ minorAtSigning: true, expiresAt: null, expiryRule: "forever" })],
      "2008-06-14",
      NOW,
      TZ,
    );
    assert.equal(state.coverage, "expired");
    assert.match(state.reason ?? "", /before they turned 18/);
    assert.equal(state.endsAt?.toISOString(), "2026-06-14T06:00:00.000Z");
  });

  it("still covers a minor who has not reached majority yet", () => {
    const state = deriveCoverage(
      [sig({ minorAtSigning: true, expiresAt: null, expiryRule: "forever" })],
      "2012-04-09",
      NOW,
      TZ,
    );
    assert.equal(state.coverage, "on_file");
  });

  it("uses DESIGN.md's pill labels", () => {
    assert.equal(COVERAGE_LABEL.on_file, "ON FILE");
    assert.equal(COVERAGE_LABEL.visitor, "VISITOR");
    assert.equal(COVERAGE_LABEL.expired, "EXPIRED");
    assert.equal(COVERAGE_LABEL.none, "NONE");
  });
});

describe("re-sign notice schedule", () => {
  const now = new Date("2026-07-04T18:00:00Z");
  const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000 + 3600_000);

  it("sends on the scheduled distances and stays quiet in between", () => {
    const sends = [] as number[];
    for (let d = -10; d <= 45; d++) {
      if (shouldSendResignNotice(inDays(d), now)) sends.push(d);
    }
    assert.deepEqual(sends, [-1, 0, 1, 7, 14, 30]);
  });

  it("never nags a customer daily forever after their waiver lapses", () => {
    // The failure this exists to prevent: a daily cron emailing the same person
    // every day because "expired" stays true.
    for (const d of [-2, -5, -30, -400]) {
      assert.equal(shouldSendResignNotice(inDays(d), now), false, `${d} days should be silent`);
    }
  });

  it("says nothing about coverage that never expires", () => {
    assert.equal(shouldSendResignNotice(null, now), false);
  });

  it("counts whole days from now", () => {
    assert.equal(daysUntil(new Date(now.getTime() + 7 * 86_400_000 + 1000), now), 7);
    assert.equal(daysUntil(new Date(now.getTime() - 1000), now), -1);
  });
});
