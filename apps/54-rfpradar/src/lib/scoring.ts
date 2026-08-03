/**
 * src/lib/scoring.ts
 *
 * Relevance scoring: profile x opportunity -> 0-100 WITH factors.
 *
 * The product rule is "reasons or nothing". Every score ships with a factors
 * array of human sentences the UI renders verbatim ("NAICS 541512 exact
 * match", "\"managed detection\" found in scope §3.2"). A score without factors
 * is a bug, and `scoreOpportunity` cannot produce one — it always returns at
 * least one factor.
 *
 * This module is deliberately pure: no database, no environment, no clock
 * beyond what the caller passes. That is what makes the documented fixture
 * test in scoring.test.ts possible, and it keeps `postgres` out of any client
 * bundle that renders a score.
 *
 * ## The weights (the whole model, in one place)
 *
 * | Factor      | Weight | Credit                                          |
 * |-------------|--------|-------------------------------------------------|
 * | keywords    | 35     | split evenly across the profile's keywords       |
 * | NAICS       | 25     | 1.0 exact · 0.6 shares the 4-digit industry     |
 * | PSC         | 10     | 1.0 exact · 0.6 shares the 2-char group         |
 * | geography   | 15     | 1.0 the state (or federal scope) is on the list |
 * | agency      | 10     | 1.0 the buying agency is on the list            |
 * | value band  | 15     | 1.0 overlaps · 0.5 within 25% of the band       |
 *
 * A factor the profile did not configure is not applicable and leaves the
 * denominator entirely — otherwise a firm that lists no agencies of interest
 * could never score above 90 for a reason it never asked about. Informational
 * factors carry weight 0: they explain themselves without moving the number.
 *
 * A negative keyword is a veto, not a penalty: the score is 0, the reason names
 * the word that did it, and the match is suppressed (stored, queryable, never
 * deleted).
 */

export interface ScoreFactor {
  key: string;
  weight: number;
  matched: boolean;
  /** Human sentence rendered verbatim in the UI. */
  reason: string;
}

export interface ScoreResult {
  score: number;
  factors: ScoreFactor[];
  suppressed: boolean;
  hot: boolean;
  /** True when a negative keyword vetoed the notice. */
  vetoed: boolean;
}

/** The scoring input shape — plain data, no Drizzle row required. */
export interface ScoringProfile {
  naicsCodes: string[];
  pscCodes: string[];
  keywords: string[];
  negativeKeywords: string[];
  states: string[];
  agencies: string[];
  valueBand: { minCents?: number | null; maxCents?: number | null } | null;
}

export interface ScoringOpportunity {
  title: string;
  agency: string;
  state: string | null;
  naicsCodes: string[];
  pscCodes: string[];
  description: string;
  responsesDueAt: Date | null;
  estValueBand: { minCents?: number | null; maxCents?: number | null } | null;
}

export const WEIGHTS = {
  keywords: 35,
  naics: 25,
  psc: 10,
  geography: 15,
  agency: 10,
  valueBand: 15,
} as const;

/** At or above this score, closing within HOT_DAYS -> alert now, not at 6am. */
export const HOT_SCORE = 90;
export const HOT_DAYS = 14;

/* ----------------------------------------------------------------- helpers */

/** Full state names by USPS code, so reasons read like English. */
const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  US: "federal",
};

export function stateName(code: string | null): string {
  if (!code) return "federal";
  return STATE_NAMES[code.toUpperCase()] ?? code;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Word-boundary, case-insensitive phrase search; returns the index of the hit
 * or -1. `\b` alone breaks on phrases that end in punctuation, so the boundary
 * is asserted with lookarounds over word characters.
 */
export function findPhrase(haystack: string, phrase: string): number {
  const trimmed = phrase.trim();
  if (!trimmed) return -1;
  const re = new RegExp(`(?<![A-Za-z0-9])${escapeRegex(trimmed)}(?![A-Za-z0-9])`, "i");
  const m = re.exec(haystack);
  return m ? m.index : -1;
}

const SECTION_RE = /(?:§\s*|[Ss]ection\s+)(\d+(?:\.\d+)*)/g;

/**
 * The nearest section marker at or before `index`, so a reason can say where in
 * the notice the phrase was found ("found in scope §3.2"). Null when the notice
 * isn't sectioned — most state RSS summaries aren't.
 */
export function sectionBefore(text: string, index: number): string | null {
  SECTION_RE.lastIndex = 0;
  let best: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = SECTION_RE.exec(text)) !== null) {
    if (match.index > index) break;
    best = index - match.index <= 1_200 ? match[1] : null;
  }
  return best;
}

/** 541512 -> "5415", the NAICS industry group. */
function naicsGroup(code: string): string {
  return code.replace(/\D/g, "").slice(0, 4);
}

/** "D399" -> "D3", the PSC group. */
function pscGroup(code: string): string {
  return code.trim().toUpperCase().slice(0, 2);
}

interface Band {
  minCents?: number | null;
  maxCents?: number | null;
}

function bandOverlaps(a: Band, b: Band): boolean {
  const aMin = a.minCents ?? 0;
  const aMax = a.maxCents ?? Number.MAX_SAFE_INTEGER;
  const bMin = b.minCents ?? 0;
  const bMax = b.maxCents ?? Number.MAX_SAFE_INTEGER;
  return aMin <= bMax && bMin <= aMax;
}

/** Within 25% of the profile's band on either side — worth a look, not a fit. */
function bandAdjacent(profile: Band, opp: Band): boolean {
  const min = profile.minCents ?? 0;
  const max = profile.maxCents ?? Number.MAX_SAFE_INTEGER;
  const low = Math.round(min * 0.75);
  const high = max === Number.MAX_SAFE_INTEGER ? max : Math.round(max * 1.25);
  return bandOverlaps({ minCents: low, maxCents: high }, opp);
}

function compactCents(cents: number): string {
  const dollars = Math.round(cents / 100);
  if (dollars >= 1_000_000) {
    const m = Math.round((dollars / 1_000_000) * 10) / 10;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (dollars >= 1_000) {
    const k = Math.round((dollars / 1_000) * 10) / 10;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `$${dollars.toLocaleString("en-US")}`;
}

function bandText(band: Band | null): string {
  if (!band) return "unpublished";
  const min = typeof band.minCents === "number" ? band.minCents : null;
  const max = typeof band.maxCents === "number" ? band.maxCents : null;
  if (min !== null && max !== null) return `${compactCents(min)}–${compactCents(max)}`;
  if (min !== null) return `over ${compactCents(min)}`;
  if (max !== null) return `up to ${compactCents(max)}`;
  return "unpublished";
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/* ------------------------------------------------------------- the scorer */

export interface ScoreOptions {
  /** Matches below this land in the `suppressed` state. Default 45. */
  threshold?: number;
  /** Injected clock, so the hot-match rule is testable. */
  now?: Date;
}

export function scoreOpportunity(
  profile: ScoringProfile,
  opportunity: ScoringOpportunity,
  options: ScoreOptions = {},
): ScoreResult {
  const threshold = options.threshold ?? 45;
  const now = options.now ?? new Date();
  const factors: ScoreFactor[] = [];
  const haystack = `${opportunity.title}\n${opportunity.description}`;

  /* -- veto: negative keywords ------------------------------------------- */
  let vetoed = false;
  for (const negative of profile.negativeKeywords) {
    const at = findPhrase(haystack, negative);
    if (at >= 0) {
      vetoed = true;
      factors.push({
        key: `negative:${negative}`,
        weight: 0,
        matched: false,
        reason: `Excluded: "${negative}" appears ${at < opportunity.title.length ? "in the title" : "in the notice text"} and is one of your negative keywords.`,
      });
    }
  }
  if (vetoed) {
    return { score: 0, factors, suppressed: true, hot: false, vetoed: true };
  }

  let earned = 0;
  let possible = 0;

  /* -- keywords ---------------------------------------------------------- */
  const keywords = profile.keywords.filter((k) => k.trim().length > 0);
  if (keywords.length > 0) {
    const each = WEIGHTS.keywords / keywords.length;
    for (const keyword of keywords) {
      possible += each;
      const at = findPhrase(haystack, keyword);
      if (at < 0) {
        factors.push({
          key: `keyword:${keyword}`,
          weight: round1(each),
          matched: false,
          reason: `"${keyword}" does not appear in this notice.`,
        });
        continue;
      }
      earned += each;
      let where: string;
      if (at < opportunity.title.length) {
        where = "in the title";
      } else {
        const section = sectionBefore(
          opportunity.description,
          at - opportunity.title.length - 1,
        );
        where = section ? `in scope §${section}` : "in the notice description";
      }
      factors.push({
        key: `keyword:${keyword}`,
        weight: round1(each),
        matched: true,
        reason: `"${keyword}" found ${where}.`,
      });
    }
  }

  /* -- NAICS ------------------------------------------------------------- */
  if (profile.naicsCodes.length > 0) {
    possible += WEIGHTS.naics;
    const exact = opportunity.naicsCodes.find((code) => profile.naicsCodes.includes(code));
    if (exact) {
      earned += WEIGHTS.naics;
      factors.push({
        key: "naics",
        weight: WEIGHTS.naics,
        matched: true,
        reason: `NAICS ${exact} exact match.`,
      });
    } else {
      const groups = new Set(profile.naicsCodes.map(naicsGroup).filter(Boolean));
      const near = opportunity.naicsCodes.find((code) => groups.has(naicsGroup(code)));
      if (near) {
        earned += WEIGHTS.naics * 0.6;
        factors.push({
          key: "naics",
          weight: WEIGHTS.naics,
          matched: true,
          reason: `NAICS ${near} shares industry group ${naicsGroup(near)} with your codes.`,
        });
      } else {
        factors.push({
          key: "naics",
          weight: WEIGHTS.naics,
          matched: false,
          reason: opportunity.naicsCodes.length
            ? `NAICS ${opportunity.naicsCodes.join(", ")} is outside your codes (${profile.naicsCodes.join(", ")}).`
            : "This notice publishes no NAICS code.",
        });
      }
    }
  }

  /* -- PSC --------------------------------------------------------------- */
  if (profile.pscCodes.length > 0) {
    possible += WEIGHTS.psc;
    const exact = opportunity.pscCodes.find((code) => profile.pscCodes.includes(code));
    if (exact) {
      earned += WEIGHTS.psc;
      factors.push({
        key: "psc",
        weight: WEIGHTS.psc,
        matched: true,
        reason: `PSC ${exact} exact match.`,
      });
    } else {
      const groups = new Set(profile.pscCodes.map(pscGroup));
      const near = opportunity.pscCodes.find((code) => groups.has(pscGroup(code)));
      if (near) {
        earned += WEIGHTS.psc * 0.6;
        factors.push({
          key: "psc",
          weight: WEIGHTS.psc,
          matched: true,
          reason: `PSC ${near} sits in group ${pscGroup(near)}, alongside your codes.`,
        });
      } else {
        factors.push({
          key: "psc",
          weight: WEIGHTS.psc,
          matched: false,
          reason: opportunity.pscCodes.length
            ? `PSC ${opportunity.pscCodes.join(", ")} is outside your codes.`
            : "This notice publishes no PSC code.",
        });
      }
    }
  }

  /* -- geography --------------------------------------------------------- */
  if (profile.states.length > 0) {
    possible += WEIGHTS.geography;
    const wanted = profile.states.map((s) => s.toUpperCase());
    const oppState = opportunity.state?.toUpperCase() ?? null;
    const isFederal = oppState === null;
    const hit = isFederal ? wanted.includes("US") : wanted.includes(oppState);
    if (hit) {
      earned += WEIGHTS.geography;
      factors.push({
        key: "geography",
        weight: WEIGHTS.geography,
        matched: true,
        reason: isFederal
          ? "Federal scope, which is on your list."
          : `${stateName(oppState)} is on your list of states.`,
      });
    } else {
      factors.push({
        key: "geography",
        weight: WEIGHTS.geography,
        matched: false,
        reason: `${isFederal ? "Federal scope" : stateName(oppState)} is outside your states (${wanted.map(stateName).join(", ")}).`,
      });
    }
  }

  /* -- agency ------------------------------------------------------------ */
  if (profile.agencies.length > 0) {
    possible += WEIGHTS.agency;
    const agencyLower = opportunity.agency.toLowerCase();
    const hit = profile.agencies.find(
      (a) => a.trim() && agencyLower.includes(a.trim().toLowerCase()),
    );
    if (hit) {
      earned += WEIGHTS.agency;
      factors.push({
        key: "agency",
        weight: WEIGHTS.agency,
        matched: true,
        reason: `${opportunity.agency} matches "${hit}" in your agencies of interest.`,
      });
    } else {
      factors.push({
        key: "agency",
        weight: WEIGHTS.agency,
        matched: false,
        reason: `${opportunity.agency} is not one of your agencies of interest.`,
      });
    }
  }

  /* -- value band -------------------------------------------------------- */
  const profileBand = profile.valueBand;
  const hasProfileBand =
    profileBand != null &&
    (typeof profileBand.minCents === "number" || typeof profileBand.maxCents === "number");
  if (hasProfileBand) {
    const oppBand = opportunity.estValueBand;
    const hasOppBand =
      oppBand != null &&
      (typeof oppBand.minCents === "number" || typeof oppBand.maxCents === "number");
    if (!hasOppBand) {
      // Informational (weight 0): it belongs in the reasons, but a notice that
      // publishes no value must not drag the score down.
      factors.push({
        key: "value_band",
        weight: 0,
        matched: false,
        reason: `No value published on this notice, so your ${bandText(profileBand)} band was not scored.`,
      });
    } else {
      possible += WEIGHTS.valueBand;
      if (bandOverlaps(profileBand, oppBand)) {
        earned += WEIGHTS.valueBand;
        factors.push({
          key: "value_band",
          weight: WEIGHTS.valueBand,
          matched: true,
          reason: `Estimated ${bandText(oppBand)} sits inside your ${bandText(profileBand)} band.`,
        });
      } else if (bandAdjacent(profileBand, oppBand)) {
        earned += WEIGHTS.valueBand * 0.5;
        factors.push({
          key: "value_band",
          weight: WEIGHTS.valueBand,
          matched: true,
          reason: `Estimated ${bandText(oppBand)} is within 25% of your ${bandText(profileBand)} band.`,
        });
      } else {
        factors.push({
          key: "value_band",
          weight: WEIGHTS.valueBand,
          matched: false,
          reason: `Estimated ${bandText(oppBand)} is outside your ${bandText(profileBand)} band.`,
        });
      }
    }
  }

  /* -- the number -------------------------------------------------------- */
  if (possible === 0) {
    // An empty profile matches nothing, and says so — never a silent zero.
    factors.push({
      key: "empty_profile",
      weight: 0,
      matched: false,
      reason: "This profile has no keywords, codes, states, agencies, or value band set yet.",
    });
    return { score: 0, factors, suppressed: true, hot: false, vetoed: false };
  }

  const score = Math.round((earned / possible) * 100);
  const daysToClose =
    opportunity.responsesDueAt === null
      ? null
      : Math.ceil((opportunity.responsesDueAt.getTime() - now.getTime()) / 86_400_000);
  const hot =
    score >= HOT_SCORE && daysToClose !== null && daysToClose >= 0 && daysToClose <= HOT_DAYS;

  return { score, factors, suppressed: score < threshold, hot, vetoed: false };
}

/**
 * The invariant, in code: a rendered score must carry at least one factor with
 * a non-empty reason. The UI calls this; the tests assert it.
 */
export function assertHasReasons(score: number, factors: ScoreFactor[]): ScoreFactor[] {
  if (!Array.isArray(factors) || factors.length === 0) {
    throw new Error(
      `Refusing to render score ${score} with no factors — "no score without reasons" (DESIGN.md).`,
    );
  }
  if (factors.some((f) => !f.reason || !f.reason.trim())) {
    throw new Error(`Refusing to render score ${score}: a factor has an empty reason.`);
  }
  return factors;
}

/** The reasons a match card shows before "+N more" — matched first, heaviest first. */
export function topReasons(factors: ScoreFactor[], count = 2): ScoreFactor[] {
  const ordered = [...factors].sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    return b.weight - a.weight;
  });
  return ordered.slice(0, count);
}
