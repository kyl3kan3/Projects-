/**
 * The fit-score fixture test (ROADMAP Phase 1 acceptance criterion): a defined
 * profile and a defined notice produce a documented factor breakdown and total.
 *
 * If the weights in lib/scoring.ts change, this file is the place the change has
 * to be argued for — the numbers below are written out longhand on purpose.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HOT_DAYS,
  HOT_SCORE,
  WEIGHTS,
  assertHasReasons,
  findPhrase,
  scoreOpportunity,
  sectionBefore,
  topReasons,
  type ScoringOpportunity,
  type ScoringProfile,
} from "@/lib/scoring";

const NOW = new Date("2026-03-01T12:00:00Z");

/** "Managed IT — VA/MD", the profile a 20-person IT services firm would build. */
const PROFILE: ScoringProfile = {
  naicsCodes: ["541512"],
  pscCodes: ["D310"],
  keywords: ["managed detection", "endpoint detection", "security operations"],
  negativeKeywords: ["staffing", "janitorial"],
  states: ["VA", "MD", "US"],
  agencies: ["Department of the Army"],
  valueBand: { minCents: 25_000_000, maxCents: 500_000_000 },
};

const ARMY_MDR: ScoringOpportunity = {
  title: "Managed Detection and Response Services for Army Enterprise Networks",
  agency: "Department of the Army, Army Contracting Command",
  state: null,
  naicsCodes: ["541512", "541519"],
  pscCodes: ["D310"],
  description:
    "§3.1 Scope. The contractor shall provide 24x7x365 security operations centre monitoring.\n\n" +
    "§3.2 Scope. Managed detection and response shall include endpoint telemetry collection.",
  responsesDueAt: new Date("2026-03-22T17:00:00Z"),
  estValueBand: { minCents: 250_000_000, maxCents: 1_000_000_000 },
};

test("the documented breakdown: 89 for the Army MDR notice", () => {
  const result = scoreOpportunity(PROFILE, ARMY_MDR, { threshold: 45, now: NOW });

  // Three keywords share 35 points, 11.666… each.
  //   "managed detection"   found in the title            -> 11.666
  //   "endpoint detection"  absent                        ->  0
  //   "security operations" found in scope §3.1           -> 11.666
  // NAICS 541512 exact                                    -> 25
  // PSC D310 exact                                        -> 10
  // Federal scope, on the list                            -> 15
  // Agency matches "Department of the Army"               -> 10
  // $2.5M-$10M overlaps the $250k-$5M band                -> 15
  //   earned 98.333 of a possible 110  =>  round(89.39) = 89
  assert.equal(result.score, 89);
  assert.equal(result.suppressed, false);
  assert.equal(result.vetoed, false);

  const byKey = new Map(result.factors.map((f) => [f.key, f]));
  assert.equal(byKey.get('keyword:managed detection')?.reason, '"managed detection" found in the title.');
  assert.equal(
    byKey.get("keyword:security operations")?.reason,
    '"security operations" found in scope §3.1.',
  );
  assert.equal(
    byKey.get("keyword:endpoint detection")?.reason,
    '"endpoint detection" does not appear in this notice.',
  );
  assert.equal(byKey.get("keyword:endpoint detection")?.matched, false);
  assert.equal(byKey.get("naics")?.reason, "NAICS 541512 exact match.");
  assert.equal(byKey.get("psc")?.reason, "PSC D310 exact match.");
  assert.equal(byKey.get("geography")?.reason, "Federal scope, which is on your list.");
  assert.equal(
    byKey.get("agency")?.reason,
    'Department of the Army, Army Contracting Command matches "Department of the Army" in your agencies of interest.',
  );
  assert.equal(
    byKey.get("value_band")?.reason,
    "Estimated $2.5M–$10M sits inside your $250k–$5M band.",
  );
});

test("every score carries reasons — the invariant, not a convention", () => {
  const cases: ScoringOpportunity[] = [
    ARMY_MDR,
    { ...ARMY_MDR, title: "Janitorial Services", description: "janitorial only" },
    { ...ARMY_MDR, naicsCodes: [], pscCodes: [], description: "", title: "Unrelated notice" },
  ];
  for (const opportunity of cases) {
    const result = scoreOpportunity(PROFILE, opportunity, { now: NOW });
    assert.ok(result.factors.length > 0, "a score must never ship without factors");
    assert.doesNotThrow(() => assertHasReasons(result.score, result.factors));
  }
  // And the guard actually guards.
  assert.throws(() => assertHasReasons(87, []), /no factors/);
  assert.throws(
    () => assertHasReasons(87, [{ key: "k", weight: 1, matched: true, reason: "  " }]),
    /empty reason/,
  );
});

test("a negative keyword vetoes, and names the word that did it", () => {
  const result = scoreOpportunity(PROFILE, {
    ...ARMY_MDR,
    title: "Temporary Clinical Staffing Augmentation",
    description: "Contractor shall supply credentialed personnel. Staffing agency experience required.",
  }, { now: NOW });

  assert.equal(result.score, 0);
  assert.equal(result.vetoed, true);
  assert.equal(result.suppressed, true);
  assert.match(result.factors[0].reason, /^Excluded: "staffing" appears in the title/);
});

test("below threshold is suppressed, and the reasons say why", () => {
  const vegetation: ScoringOpportunity = {
    title: "Roadside Vegetation Management, Salem District",
    agency: "Virginia Department of Transportation",
    state: "VA",
    naicsCodes: ["561730"],
    pscCodes: ["F999"],
    description: "Section 1. VDOT requires roadside mowing on approximately 2,300 lane miles.",
    responsesDueAt: new Date("2026-03-14T17:00:00Z"),
    estValueBand: { minCents: 90_000_000, maxCents: 140_000_000 },
  };
  const result = scoreOpportunity(PROFILE, vegetation, { threshold: 45, now: NOW });
  assert.equal(result.suppressed, true);
  assert.ok(result.score > 0 && result.score < 45, `expected a low but non-zero score, got ${result.score}`);
  // Suppressed is a state, not a deletion: this is the row a firm reads when it
  // asks what was filtered out and why, so every reason is still spelled out.
  const reasons = result.factors.map((f) => f.reason).join(" ");
  assert.match(reasons, /"managed detection" does not appear in this notice\./);
  assert.match(reasons, /NAICS 561730 is outside your codes \(541512\)\./);
  assert.match(reasons, /Virginia is on your list of states\./);
});

test("the threshold is the firm's, not a constant", () => {
  const high = scoreOpportunity(PROFILE, ARMY_MDR, { threshold: 95, now: NOW });
  assert.equal(high.score, 89);
  assert.equal(high.suppressed, true, "89 is below a threshold of 95");
});

test("hot only when the score is high AND the notice is closing", () => {
  const perfect: ScoringOpportunity = {
    ...ARMY_MDR,
    description: `${ARMY_MDR.description}\n\nEndpoint detection is in scope.`,
  };
  assert.equal(scoreOpportunity(PROFILE, perfect, { now: NOW }).score, 100);

  const closing = scoreOpportunity(
    PROFILE,
    { ...perfect, responsesDueAt: new Date(NOW.getTime() + 10 * 86_400_000) },
    { now: NOW },
  );
  assert.equal(closing.hot, true, `100 closing in 10 days should be hot (>= ${HOT_SCORE})`);

  const far = scoreOpportunity(
    PROFILE,
    { ...perfect, responsesDueAt: new Date(NOW.getTime() + (HOT_DAYS + 5) * 86_400_000) },
    { now: NOW },
  );
  assert.equal(far.score, 100);
  assert.equal(far.hot, false, "a 100 closing in 19 days can wait for the 6am scan");

  const good = scoreOpportunity(PROFILE, ARMY_MDR, {
    now: new Date("2026-03-15T12:00:00Z"),
  });
  assert.ok(good.score < HOT_SCORE);
  assert.equal(good.hot, false, "89 is not hot however close it is — the bar is 90");

  const closed = scoreOpportunity(
    PROFILE,
    { ...perfect, responsesDueAt: new Date(NOW.getTime() - 86_400_000) },
    { now: NOW },
  );
  assert.equal(closed.hot, false, "a notice already closed is never a hot alert");
});

test("a factor the profile never configured stays out of the denominator", () => {
  const noAgencies: ScoringProfile = { ...PROFILE, agencies: [], pscCodes: [] };
  const result = scoreOpportunity(noAgencies, ARMY_MDR, { now: NOW });
  const keys = result.factors.map((f) => f.key);
  assert.ok(!keys.includes("agency"), "an unconfigured agency list must not appear as a factor");
  assert.ok(!keys.includes("psc"));
  // earned 23.333 + 25 + 15 + 15 = 78.333 of 75+... recompute: keywords 23.333/35,
  // naics 25/25, geography 15/15, value 15/15 => 78.333/90 = 87.
  assert.equal(result.score, 87);
});

test("a notice with no published value does not lose points for it", () => {
  const noValue = scoreOpportunity(PROFILE, { ...ARMY_MDR, estValueBand: null }, { now: NOW });
  const factor = noValue.factors.find((f) => f.key === "value_band");
  assert.ok(factor, "the missing value is still explained");
  assert.equal(factor.weight, 0, "an informational factor carries no weight");
  assert.match(factor.reason, /No value published/);
  // 98.333 - 15 = 83.333 of 110 - 15 = 95  =>  round(87.7) = 88
  assert.equal(noValue.score, 88);
});

test("an empty profile scores zero and says so", () => {
  const empty: ScoringProfile = {
    naicsCodes: [],
    pscCodes: [],
    keywords: [],
    negativeKeywords: [],
    states: [],
    agencies: [],
    valueBand: null,
  };
  const result = scoreOpportunity(empty, ARMY_MDR, { now: NOW });
  assert.equal(result.score, 0);
  assert.equal(result.factors.length, 1);
  assert.match(result.factors[0].reason, /no keywords, codes, states, agencies, or value band/);
});

test("NAICS credit is graded: exact beats the industry group", () => {
  const groupOnly = scoreOpportunity(
    { ...PROFILE, keywords: [], agencies: [], pscCodes: [], valueBand: null, states: [] },
    { ...ARMY_MDR, naicsCodes: ["541519"] },
    { now: NOW },
  );
  assert.equal(groupOnly.score, 60, "0.6 credit on the only applicable factor");
  assert.equal(
    groupOnly.factors[0].reason,
    "NAICS 541519 shares industry group 5415 with your codes.",
  );
});

test("value bands adjacent to the profile's earn half credit", () => {
  const onlyBand: ScoringProfile = {
    naicsCodes: [],
    pscCodes: [],
    keywords: [],
    negativeKeywords: [],
    states: [],
    agencies: [],
    valueBand: { minCents: 25_000_000, maxCents: 100_000_000 },
  };
  const adjacent = scoreOpportunity(
    onlyBand,
    { ...ARMY_MDR, estValueBand: { minCents: 110_000_000, maxCents: 120_000_000 } },
    { now: NOW },
  );
  assert.equal(adjacent.score, 50);
  assert.match(adjacent.factors[0].reason, /within 25% of your \$250k–\$1M band/);

  const outside = scoreOpportunity(
    onlyBand,
    { ...ARMY_MDR, estValueBand: { minCents: 500_000_000 } },
    { now: NOW },
  );
  assert.equal(outside.score, 0);
  assert.match(outside.factors[0].reason, /outside your \$250k–\$1M band/);
});

test("phrase search respects word boundaries", () => {
  assert.ok(findPhrase("Managed Detection and Response", "managed detection") >= 0);
  assert.equal(findPhrase("unmanaged detections", "managed detection"), -1);
  assert.ok(findPhrase("The scope (managed detection).", "managed detection") >= 0);
  assert.equal(findPhrase("anything", "   "), -1);
});

test("section markers are found before the hit, not after", () => {
  const text = "§1. Intro.\n§3.2 Scope. Managed detection here.\n§4. Evaluation.";
  const at = text.indexOf("Managed detection");
  assert.equal(sectionBefore(text, at), "3.2");
  assert.equal(sectionBefore("no markers at all", 5), null);
  assert.equal(
    sectionBefore("hit here, then Section 7 begins", 0),
    null,
    "a marker after the hit does not count",
  );
  assert.equal(
    sectionBefore(`§1. Intro.${" ".repeat(1_400)}the hit`, 1_420),
    null,
    "a marker 1,400 characters back is not where this phrase was found",
  );
});

test("top reasons put matched factors first, heaviest first", () => {
  const result = scoreOpportunity(PROFILE, ARMY_MDR, { now: NOW });
  const top = topReasons(result.factors, 2);
  assert.equal(top.length, 2);
  assert.ok(top.every((f) => f.matched));
  assert.equal(top[0].weight, WEIGHTS.naics);
});
