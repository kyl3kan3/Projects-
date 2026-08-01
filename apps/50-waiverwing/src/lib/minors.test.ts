/**
 * The minor/guardian rules. This is the headline differentiation and the
 * sloppiest corner of both paper binders and generic e-sign, so it gets the most
 * tests: age determination at signing time, who may sign, and the one nobody
 * else handles — what happens when a minor turns 18 mid-season.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkGuardianSession,
  coverageEndsAt,
  isMinor,
  resignReason,
  signatureValidAt,
  signForLabel,
  type GuardianSession,
} from "@/lib/minors";
import { ageOn, birthdayInstant } from "@/lib/time";
import { DEFAULT_MINOR_RULE, type MinorRule, type Signature } from "@/db/schema";

const SIGNED_AT = new Date("2026-03-02T16:41:00Z"); // 09:41 Denver
const TZ = "America/Denver";

const rule: MinorRule = DEFAULT_MINOR_RULE;

function session(overrides: Partial<GuardianSession> = {}): GuardianSession {
  return {
    guardian: { firstName: "Dana", lastName: "Torres", dob: "1988-06-14" },
    minors: [
      { firstName: "Maya", lastName: "Torres", dob: "2012-04-09", relationship: "Parent" },
      { firstName: "Leo", lastName: "Torres", dob: "2015-11-30", relationship: "Parent" },
    ],
    rule,
    signedAt: SIGNED_AT,
    timeZone: TZ,
    ...overrides,
  };
}

/** A signature row, only the fields the coverage rules read. */
function sig(overrides: Partial<Signature> = {}): Signature {
  return {
    signedAt: SIGNED_AT,
    expiresAt: new Date("2027-03-02T16:41:00Z"),
    minorAtSigning: true,
    resignAtMajority: true,
    ageOfMajorityAtSigning: 18,
    ...overrides,
  } as Signature;
}

describe("age determination at signing time", () => {
  it("counts whole years, birthday-aware", () => {
    assert.equal(ageOn("2008-03-02", SIGNED_AT, TZ), 18); // birthday is today
    assert.equal(ageOn("2008-03-03", SIGNED_AT, TZ), 17); // birthday tomorrow
    assert.equal(ageOn("2008-03-01", SIGNED_AT, TZ), 18);
  });

  it("reads the date in the venue's timezone, not the server's", () => {
    // 00:30Z on 3 March is still 2 March, 17:30 in Denver.
    const justPastUtcMidnight = new Date("2026-03-03T00:30:00Z");
    assert.equal(ageOn("2008-03-03", justPastUtcMidnight, "UTC"), 18);
    assert.equal(ageOn("2008-03-03", justPastUtcMidnight, TZ), 17);
  });

  it("treats a Feb-29 birthday as Mar 1 in non-leap years — never early", () => {
    const feb28 = new Date("2026-02-28T18:00:00Z");
    const mar1 = new Date("2026-03-01T18:00:00Z");
    assert.equal(ageOn("2008-02-29", feb28, TZ), 17);
    assert.equal(ageOn("2008-02-29", mar1, TZ), 18);
    assert.equal(birthdayInstant("2008-02-29", 18, TZ)?.toISOString(), "2026-03-01T07:00:00.000Z");
  });

  it("uses the waiver's own age of majority", () => {
    assert.equal(isMinor("2008-06-01", { ageOfMajority: 18 }, SIGNED_AT, TZ), true);
    assert.equal(isMinor("2008-06-01", { ageOfMajority: 21 }, SIGNED_AT, TZ), true);
    assert.equal(isMinor("2004-06-01", { ageOfMajority: 18 }, SIGNED_AT, TZ), false);
    // 19 on this date: an adult on an 18 waiver, still a minor on a 21 waiver.
    assert.equal(isMinor("2006-06-01", { ageOfMajority: 18 }, SIGNED_AT, TZ), false);
    assert.equal(isMinor("2006-06-01", { ageOfMajority: 21 }, SIGNED_AT, TZ), true);
    // Exactly at the age of majority is never a minor.
    assert.equal(isMinor("2005-03-02", { ageOfMajority: 21 }, SIGNED_AT, TZ), false);
  });

  it("rejects a malformed date of birth rather than guessing", () => {
    assert.throws(() => isMinor("09/04/2012", { ageOfMajority: 18 }, SIGNED_AT, TZ));
    assert.throws(() => isMinor("2026-02-30", { ageOfMajority: 18 }, SIGNED_AT, TZ));
  });
});

describe("checkGuardianSession", () => {
  it("accepts one adult signing for two minors", () => {
    const check = checkGuardianSession(session());
    assert.deepEqual(check.problems, []);
    assert.equal(check.guardianAge, 37);
    assert.deepEqual(check.minorAges, [13, 10]);
  });

  it("hard-rejects a minor as the signer — the ROADMAP criterion", () => {
    const check = checkGuardianSession(
      session({ guardian: { firstName: "Maya", lastName: "Torres", dob: "2012-04-09" } }),
    );
    assert.match(check.problems.join(" "), /under 18 cannot sign a waiver/);
    assert.match(check.problems.join(" "), /for themselves or for anyone else/);
  });

  it("rejects a 17-year-old signing for a younger sibling", () => {
    const check = checkGuardianSession(
      session({
        guardian: { firstName: "Ada", lastName: "Torres", dob: "2008-09-01" },
        minors: [{ firstName: "Leo", lastName: "Torres", dob: "2015-11-30", relationship: "Adult sibling" }],
      }),
    );
    assert.match(check.problems.join(" "), /under 18 cannot sign/);
  });

  it("accepts a guardian who turned 18 yesterday and rejects one turning 18 tomorrow", () => {
    const yesterday = checkGuardianSession(
      session({ guardian: { firstName: "Sam", lastName: "Nguyen", dob: "2008-03-01" } }),
    );
    assert.deepEqual(yesterday.problems, []);

    const tomorrow = checkGuardianSession(
      session({ guardian: { firstName: "Sam", lastName: "Nguyen", dob: "2008-03-03" } }),
    );
    assert.match(tomorrow.problems.join(" "), /under 18 cannot sign/);
  });

  it("sends an adult participant to the adult flow instead of the guardian flow", () => {
    const check = checkGuardianSession(
      session({
        minors: [{ firstName: "Ada", lastName: "Torres", dob: "2004-01-02", relationship: "Parent" }],
      }),
    );
    assert.match(check.problems.join(" "), /they sign for themselves/);
  });

  it("requires a relationship from the accepted list for every minor", () => {
    const missing = checkGuardianSession(
      session({
        minors: [{ firstName: "Maya", lastName: "Torres", dob: "2012-04-09", relationship: "" }],
      }),
    );
    assert.match(missing.problems.join(" "), /how you are related to Maya/);

    const bogus = checkGuardianSession(
      session({
        minors: [{ firstName: "Maya", lastName: "Torres", dob: "2012-04-09", relationship: "Coach" }],
      }),
    );
    assert.match(bogus.problems.join(" "), /not a relationship this waiver accepts/);
  });

  it("reports every problem at once, not one at a time", () => {
    const check = checkGuardianSession(
      session({
        guardian: { firstName: "", lastName: "", dob: "" },
        minors: [{ firstName: "Maya", lastName: "", dob: "", relationship: "" }],
      }),
    );
    assert.ok(check.problems.length >= 4, `expected several problems, got ${check.problems.length}`);
  });

  it("catches the same child entered twice", () => {
    const check = checkGuardianSession(
      session({
        minors: [
          { firstName: "Maya", lastName: "Torres", dob: "2012-04-09", relationship: "Parent" },
          { firstName: "Maya", lastName: "Torres", dob: "2012-04-09", relationship: "Parent" },
        ],
      }),
    );
    assert.match(check.problems.join(" "), /listed twice/);
  });

  it("rejects a future date of birth", () => {
    const check = checkGuardianSession(
      session({
        minors: [{ firstName: "Nia", lastName: "Torres", dob: "2027-01-01", relationship: "Parent" }],
      }),
    );
    assert.match(check.problems.join(" "), /in the future/);
  });

  it("names the minors on the sign button rather than counting them", () => {
    assert.equal(signForLabel(["Maya"]), "Sign for Maya");
    assert.equal(signForLabel(["Maya", "Leo"]), "Sign for Maya and Leo");
    assert.equal(signForLabel(["Maya", "Leo", "Nia"]), "Sign for Maya, Leo and Nia");
    assert.equal(signForLabel([]), "Sign");
  });
});

describe("a minor turning 18 mid-season", () => {
  // Maya was 13 when her mother signed a 365-day waiver on 2 March 2026.
  // She turns 18 on 9 April 2030 — well after that waiver would have expired.
  // The interesting case is a "forever" waiver, and a minor close to majority.
  const nearlyEighteen = "2008-06-14"; // turns 18 on 14 June 2026

  it("ends guardian-signed coverage on the majority birthday, not the waiver's expiry", () => {
    const s = sig({
      expiresAt: new Date("2027-03-02T16:41:00Z"),
      signedAt: SIGNED_AT,
    });
    const { endsAt, reason } = coverageEndsAt(s, nearlyEighteen, TZ);
    assert.equal(reason, "reached_majority");
    assert.equal(endsAt?.toISOString(), "2026-06-14T06:00:00.000Z"); // midnight MDT
  });

  it("ends a 'forever' guardian-signed waiver at majority too", () => {
    const s = sig({ expiresAt: null });
    const { endsAt, reason } = coverageEndsAt(s, nearlyEighteen, TZ);
    assert.equal(reason, "reached_majority");
    assert.ok(endsAt);
  });

  it("still honours the waiver's expiry when that comes first", () => {
    const s = sig({ expiresAt: new Date("2026-03-03T07:00:00Z") }); // single visit
    const { endsAt, reason } = coverageEndsAt(s, nearlyEighteen, TZ);
    assert.equal(reason, "expiry_rule");
    assert.equal(endsAt?.toISOString(), "2026-03-03T07:00:00.000Z");
  });

  it("covers the minor right up to the birthday and not past it", () => {
    const s = sig({ expiresAt: null });
    assert.equal(signatureValidAt(s, nearlyEighteen, new Date("2026-06-13T23:00:00Z"), TZ), true);
    assert.equal(signatureValidAt(s, nearlyEighteen, new Date("2026-06-14T12:00:00Z"), TZ), false);
  });

  it("explains why, in words a member of staff can read aloud", () => {
    const s = sig({ expiresAt: null });
    const reason = resignReason(s, nearlyEighteen, new Date("2026-07-01T12:00:00Z"), TZ);
    assert.match(reason ?? "", /Signed by a guardian before they turned 18/);
    assert.match(reason ?? "", /now sign for themselves/);
  });

  it("leaves adults alone — an adult waiver is governed by its expiry only", () => {
    const adult = sig({ minorAtSigning: false, expiresAt: null });
    const { endsAt, reason } = coverageEndsAt(adult, "1988-06-14", TZ);
    assert.equal(endsAt, null);
    assert.equal(reason, "never");
    assert.equal(signatureValidAt(adult, "1988-06-14", new Date("2040-01-01T00:00:00Z"), TZ), true);
  });

  it("respects an operator who switched the rule off on their waiver", () => {
    const s = sig({ expiresAt: null, resignAtMajority: false });
    const { endsAt, reason } = coverageEndsAt(s, nearlyEighteen, TZ);
    assert.equal(endsAt, null);
    assert.equal(reason, "never");
  });

  it("uses the age of majority recorded at signing, not today's setting", () => {
    // The waiver was signed when majority was 21; raising or lowering the
    // waiver's setting later must not move this participant's cutoff.
    const s = sig({ expiresAt: null, ageOfMajorityAtSigning: 21 });
    const { endsAt } = coverageEndsAt(s, nearlyEighteen, TZ);
    assert.equal(endsAt?.toISOString(), "2029-06-14T06:00:00.000Z");
  });

  it("falls back to the expiry rule when no date of birth was captured", () => {
    const s = sig({ expiresAt: null });
    const { endsAt, reason } = coverageEndsAt(s, null, TZ);
    assert.equal(endsAt, null);
    assert.equal(reason, "never");
  });

  it("never treats a signature as valid before it was signed", () => {
    const s = sig({ expiresAt: null, minorAtSigning: false });
    assert.equal(signatureValidAt(s, "1988-06-14", new Date("2026-03-01T00:00:00Z"), TZ), false);
  });
});
