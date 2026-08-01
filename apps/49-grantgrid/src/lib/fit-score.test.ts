import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WEIGHTS,
  fitCacheKey,
  fitVerdict,
  profileCompleteness,
  scoreFunder,
  unknownCount,
  type ScoringFunder,
  type ScoringProfile,
} from "./fit-score";

/**
 * The documented fixture the ROADMAP acceptance criterion asks for: one org
 * profile, one funder record, one asserted breakdown. If a weight or a rule
 * changes, this test is the thing that has to be argued with.
 */
const RIVERSIDE: ScoringProfile = {
  mission:
    "Riverside Youth Collective runs after-school tutoring and a summer literacy camp for 240 students in Cuyahoga County.",
  serviceStates: ["OH"],
  causeCodes: ["youth", "education"],
  typicalAskCents: 1_000_000, // $10,000
  budgetBand: "100k_500k",
};

const GUND: ScoringFunder = {
  name: "Sample Community Foundation of the Cuyahoga",
  statesFunded: ["OH", "MI"],
  causeCodes: ["youth", "education", "arts"],
  grantSizeMinCents: 500_000, // $5,000
  grantSizeMaxCents: 2_500_000, // $25,000
  acceptsUnsolicited: true,
  newGranteeShare: 0.38,
};

test("the documented fixture produces the documented breakdown", () => {
  const score = scoreFunder(RIVERSIDE, GUND, { profileVersion: 3, funderVersion: 2 });
  assert.ok(score);
  assert.deepEqual(
    score.factors.map((f) => [f.key, f.earned, f.weight, f.verdict]),
    [
      // Gives in OH, where the org works: full marks.
      ["geography", 30, 30, "match"],
      // Funds both of the org's two cause areas: 30 * (0.6 + 0.4) = 30.
      ["cause", 30, 30, "match"],
      // $10k ask sits inside $5k–$25k: full marks.
      ["size", 20, 20, "match"],
      // 38% new grantees, above the 25% bar: full marks.
      ["new_grantees", 12, 12, "match"],
      // Says it accepts unsolicited requests: full marks.
      ["unsolicited", 8, 8, "match"],
    ],
  );
  assert.equal(score.total, 100);
  assert.equal(score.longShot, false);
  assert.equal(score.cacheKey, fitCacheKey(3, 2));
  assert.equal(unknownCount(score), 0);
});

test("every factor carries a sentence, and no factor can be silent", () => {
  const score = scoreFunder(RIVERSIDE, GUND);
  assert.ok(score);
  assert.equal(score.factors.length, 5);
  for (const f of score.factors) {
    assert.ok(f.reason.length > 20, `${f.key} reason too short: ${f.reason}`);
    assert.ok(f.reason.trim().endsWith(".") || f.reason.includes("—"), f.reason);
    assert.ok(f.earned <= f.weight);
    assert.ok(f.earned >= 0);
  }
});

test("weights sum to 100 so the total is a real percentage", () => {
  const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(sum, 100);
});

test("a thin profile scores nothing at all, and says what is missing", () => {
  const thin: ScoringProfile = {
    mission: "We help kids.",
    serviceStates: [],
    causeCodes: [],
    typicalAskCents: null,
    budgetBand: "",
  };
  assert.equal(scoreFunder(thin, GUND), null);
  const completeness = profileCompleteness(thin);
  assert.equal(completeness.scorable, false);
  assert.deepEqual(completeness.missing, [
    "the states you serve",
    "your cause areas",
    "your typical ask",
  ]);

  // One field short is still not scorable — no partial guessing.
  assert.equal(
    scoreFunder({ ...RIVERSIDE, typicalAskCents: null }, GUND),
    null,
  );
  assert.equal(scoreFunder({ ...RIVERSIDE, causeCodes: [] }, GUND), null);
});

test("a wrong-state, wrong-cause funder is labelled a long shot, not dressed up", () => {
  const mismatch: ScoringFunder = {
    name: "Sample Desert Arts Trust",
    statesFunded: ["AZ", "NM"],
    causeCodes: ["arts"],
    grantSizeMinCents: 5_000_000,
    grantSizeMaxCents: 25_000_000,
    acceptsUnsolicited: false,
    newGranteeShare: 0.04,
  };
  const score = scoreFunder(RIVERSIDE, mismatch);
  assert.ok(score);
  // 10 of 100: only the half-credit for "your ask is under their floor", which
  // is coaching rather than a match. Everything that could disqualify does.
  assert.equal(score.total, 10);
  assert.equal(score.longShot, true);
  assert.equal(fitVerdict(score), "Long shot on published criteria");
  assert.deepEqual(
    score.factors.map((f) => f.verdict),
    ["miss", "miss", "miss", "miss", "miss"],
  );
});

test("a closed door is a long shot however well it matches on paper", () => {
  // Perfect on geography, cause and size — but they do not accept unsolicited
  // requests, so the score is capped rather than sending someone to spend a week
  // writing to a door that is shut.
  const closed: ScoringFunder = { ...GUND, acceptsUnsolicited: false };
  const score = scoreFunder(RIVERSIDE, closed)!;
  assert.equal(score.total, 39);
  assert.equal(score.longShot, true);
  assert.match(
    score.factors.find((f) => f.key === "unsolicited")!.reason,
    /would need an introduction/,
  );
  // "Unknown" must not be capped: not saying is not the same as saying no.
  const unknown = scoreFunder(RIVERSIDE, { ...GUND, acceptsUnsolicited: null })!;
  assert.equal(unknown.total, 92);
  assert.equal(unknown.longShot, false);
});

test("unknown is not the same as no", () => {
  const sparse: ScoringFunder = {
    name: "Sample Family Foundation",
    statesFunded: [],
    causeCodes: [],
    grantSizeMinCents: null,
    grantSizeMaxCents: null,
    acceptsUnsolicited: null,
    newGranteeShare: null,
  };
  const score = scoreFunder(RIVERSIDE, sparse);
  assert.ok(score);
  assert.equal(score.total, 0);
  assert.equal(unknownCount(score), 5);
  for (const f of score.factors) {
    assert.equal(f.verdict, "unknown");
    // The wording must never assert a negative it cannot support.
    assert.ok(!/does not fund|not eligible/i.test(f.reason), f.reason);
  }
  // An unknown-everything record and a known-bad record both score 0 but read
  // differently — that distinction is the whole point of the verdict field.
  assert.match(score.factors[0].reason, /could not be checked/);
});

test("a national funder scores lower than a local one on the same match", () => {
  const national: ScoringFunder = { ...GUND, statesFunded: ["US"] };
  const localScore = scoreFunder(RIVERSIDE, GUND)!;
  const nationalScore = scoreFunder(RIVERSIDE, national)!;
  assert.ok(nationalScore.total < localScore.total);
  assert.match(nationalScore.factors[0].reason, /far more applicants/);
});

test("partial cause overlap earns partial credit", () => {
  const broad: ScoringProfile = {
    ...RIVERSIDE,
    causeCodes: ["youth", "education", "food", "housing"],
  };
  const score = scoreFunder(broad, GUND)!;
  const cause = score.factors.find((f) => f.key === "cause")!;
  // 2 of 4 cause areas funded: 30 * (0.6 + 0.4 * 0.5) = 24.
  assert.equal(cause.earned, 24);
  assert.match(cause.reason, /2 of your 4 cause areas/);
});

test("an ask below the funder's floor is coached, not failed outright", () => {
  const bigOnly: ScoringFunder = {
    ...GUND,
    grantSizeMinCents: 5_000_000,
    grantSizeMaxCents: 20_000_000,
  };
  const score = scoreFunder(RIVERSIDE, bigOnly)!;
  const size = score.factors.find((f) => f.key === "size")!;
  assert.equal(size.earned, 10);
  assert.match(size.reason, /consider asking for more/);

  const smallOnly: ScoringFunder = {
    ...GUND,
    grantSizeMinCents: 100_000,
    grantSizeMaxCents: 500_000,
  };
  const over = scoreFunder(RIVERSIDE, smallOnly)!;
  const overSize = over.factors.find((f) => f.key === "size")!;
  assert.equal(overSize.earned, 0);
  assert.match(overSize.reason, /larger than they have recently given/);
});

test("dollar ranges in reasons are readable, not raw cents", () => {
  const score = scoreFunder(RIVERSIDE, GUND)!;
  const size = score.factors.find((f) => f.key === "size")!;
  assert.match(size.reason, /\$5k–\$25k/);
  assert.match(size.reason, /\$10k ask/);
  assert.ok(!size.reason.includes("000000"));
});

test("the cache key changes when either side changes", () => {
  assert.notEqual(fitCacheKey(1, 1), fitCacheKey(2, 1));
  assert.notEqual(fitCacheKey(1, 1), fitCacheKey(1, 2));
  assert.equal(fitCacheKey(4, 9), "p4:f9");
});

test("verdict language never claims to know a funder's private preferences", () => {
  const banned = /\b(wants|prefers|loves|will fund you|guaranteed|perfect)\b/i;
  for (const total of [100, 80, 60, 45, 20]) {
    const fake = { total, longShot: total < 40, factors: [], cacheKey: "" };
    assert.ok(!banned.test(fitVerdict(fake)), fitVerdict(fake));
  }
  const score = scoreFunder(RIVERSIDE, GUND)!;
  for (const f of score.factors) {
    assert.ok(!banned.test(f.reason), f.reason);
  }
});
