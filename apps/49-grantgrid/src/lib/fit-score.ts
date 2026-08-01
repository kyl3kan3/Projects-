/**
 * Fit scoring: an org profile × a funder record → 0-100, with every point
 * accounted for.
 *
 * Two honesty rules are baked into the shape of this module, not bolted on:
 *
 * 1. **There is no score without reasons.** `scoreFunder` cannot return a number
 *    on its own — the factors come back with it, each carrying the sentence the
 *    UI renders verbatim. A bare number would imply a judgement the app has not
 *    earned.
 * 2. **This scores public, observable facts only.** Where a funder gives, what
 *    sizes they give in, whether they say they accept unsolicited requests, and
 *    how often a recent grantee was new to them. It does not know a program
 *    officer's priorities, this year's unpublished strategy, or who they had
 *    lunch with. Factor sentences are written to say what was compared, and the
 *    caller renders the record's freshness date beside them.
 *
 * Unknown is a first-class outcome. A missing field scores zero points and says
 * "not published", never "no" — the difference matters when a small org is
 * deciding where to spend the ten hours it has.
 *
 * Pure functions, no I/O: fully testable, and safe to import into a client
 * component.
 */

/* ------------------------------------------------------------- vocabulary --- */

/**
 * Cause vocabulary. Deliberately short and plain-English: a small nonprofit
 * should recognise itself in one pass, and every code here maps to something an
 * NTEE-coded 990 can support.
 */
export const CAUSE_AREAS = [
  { code: "youth", label: "Youth development" },
  { code: "education", label: "Education & literacy" },
  { code: "food", label: "Food security" },
  { code: "housing", label: "Housing & homelessness" },
  { code: "health", label: "Health & mental health" },
  { code: "arts", label: "Arts & culture" },
  { code: "environment", label: "Environment & conservation" },
  { code: "workforce", label: "Workforce & economic mobility" },
  { code: "seniors", label: "Older adults" },
  { code: "animals", label: "Animal welfare" },
  { code: "civic", label: "Civic engagement" },
  { code: "capacity", label: "Nonprofit capacity building" },
] as const;

export type CauseCode = (typeof CAUSE_AREAS)[number]["code"];

export function causeLabel(code: string): string {
  return CAUSE_AREAS.find((c) => c.code === code)?.label ?? code;
}

export const BUDGET_BANDS = [
  { code: "under_100k", label: "Under $100k" },
  { code: "100k_500k", label: "$100k – $500k" },
  { code: "500k_1m", label: "$500k – $1M" },
  { code: "1m_3m", label: "$1M – $3M" },
  { code: "over_3m", label: "Over $3M" },
] as const;

export function budgetBandLabel(code: string): string {
  return BUDGET_BANDS.find((b) => b.code === code)?.label ?? code;
}

/* ----------------------------------------------------------------- inputs --- */

export interface ScoringProfile {
  mission: string;
  serviceStates: string[];
  causeCodes: string[];
  typicalAskCents: number | null;
  budgetBand: string;
}

export interface ScoringFunder {
  name: string;
  statesFunded: string[];
  causeCodes: string[];
  grantSizeMinCents: number | null;
  grantSizeMaxCents: number | null;
  acceptsUnsolicited: boolean | null;
  newGranteeShare: number | null;
}

export interface FitFactor {
  key: "geography" | "cause" | "size" | "new_grantees" | "unsolicited";
  label: string;
  /** Maximum points this factor can contribute. */
  weight: number;
  /** Points actually contributed, 0..weight. */
  earned: number;
  /** "yes" / "no" / "unknown" — drives the check, cross, or dash glyph. */
  verdict: "match" | "miss" | "unknown";
  /** Rendered verbatim in the UI. Says what was compared, not what is felt. */
  reason: string;
}

export interface FitScore {
  total: number;
  /** Below this, the UI labels it a long shot rather than dressing it up. */
  longShot: boolean;
  factors: FitFactor[];
  /** Cache key — bump either version and the score is recomputed. */
  cacheKey: string;
}

/**
 * Weights sum to 100. Geography and cause dominate because they are the two
 * things that actually disqualify an application, and they are the two facts a
 * 990 supports most reliably.
 */
export const WEIGHTS = {
  geography: 30,
  cause: 30,
  size: 20,
  new_grantees: 12,
  unsolicited: 8,
} as const;

/** "National" in `statesFunded` means the funder is not geographically bounded. */
export const NATIONAL = "US";

/* --------------------------------------------------------- thinness guard --- */

export interface ProfileCompleteness {
  scorable: boolean;
  missing: string[];
}

/**
 * A profile with no states and no causes cannot be scored against anything; a
 * number produced from it would be a guess wearing a uniform. The guard requires
 * the two disqualifying facts (where you work, what you do) plus a typical ask,
 * and reports exactly what is missing so the UI can ask for it by name.
 */
export function profileCompleteness(profile: ScoringProfile): ProfileCompleteness {
  const missing: string[] = [];
  if (!profile.serviceStates?.length) missing.push("the states you serve");
  if (!profile.causeCodes?.length) missing.push("your cause areas");
  if (!profile.typicalAskCents) missing.push("your typical ask");
  return { scorable: missing.length === 0, missing };
}

/* ---------------------------------------------------------------- scoring --- */

function dollars(cents: number): string {
  const n = cents / 100;
  if (n >= 1000 && n % 1000 === 0) return `$${(n / 1000).toLocaleString("en-US")}k`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function sizeBand(min: number | null, max: number | null): string | null {
  if (min && max) return `${dollars(min)}–${dollars(max)}`;
  if (max) return `up to ${dollars(max)}`;
  if (min) return `${dollars(min)} and up`;
  return null;
}

function geographyFactor(profile: ScoringProfile, funder: ScoringFunder): FitFactor {
  const weight = WEIGHTS.geography;
  const funded = funder.statesFunded ?? [];
  const mine = profile.serviceStates ?? [];

  if (!funded.length) {
    return {
      key: "geography",
      label: "Geography",
      weight,
      earned: 0,
      verdict: "unknown",
      reason: "No funding geography published for this funder, so it could not be checked.",
    };
  }
  if (funded.includes(NATIONAL)) {
    return {
      key: "geography",
      label: "Geography",
      weight,
      earned: Math.round(weight * 0.8),
      verdict: "match",
      reason: `Gives nationally, so ${mine.join("/")} is in scope — but national funders draw far more applicants than local ones.`,
    };
  }
  const overlap = mine.filter((s) => funded.includes(s));
  if (overlap.length) {
    return {
      key: "geography",
      label: "Geography",
      weight,
      earned: weight,
      verdict: "match",
      reason: `Recent giving includes ${overlap.join(", ")}, where you work.`,
    };
  }
  return {
    key: "geography",
    label: "Geography",
    weight,
    earned: 0,
    verdict: "miss",
    reason: `Recent giving is in ${funded.slice(0, 4).join(", ")}${funded.length > 4 ? "…" : ""}, not ${mine.join("/")}.`,
  };
}

function causeFactor(profile: ScoringProfile, funder: ScoringFunder): FitFactor {
  const weight = WEIGHTS.cause;
  const theirs = funder.causeCodes ?? [];
  const mine = profile.causeCodes ?? [];

  if (!theirs.length) {
    return {
      key: "cause",
      label: "Cause areas",
      weight,
      earned: 0,
      verdict: "unknown",
      reason: "No cause areas recorded for this funder yet, so alignment is unproven.",
    };
  }
  const overlap = mine.filter((c) => theirs.includes(c));
  if (!overlap.length) {
    return {
      key: "cause",
      label: "Cause areas",
      weight,
      earned: 0,
      verdict: "miss",
      reason: `Funds ${theirs.slice(0, 3).map(causeLabel).join(", ").toLowerCase()}; your work is ${mine.map(causeLabel).join(", ").toLowerCase()}.`,
    };
  }
  // Partial credit is proportional to how much of *your* work they fund: an org
  // doing four things that matches on one is a weaker fit than one that matches
  // on all four, even though both "match".
  const share = overlap.length / mine.length;
  const earned = Math.round(weight * (0.6 + 0.4 * share));
  return {
    key: "cause",
    label: "Cause areas",
    weight,
    earned,
    verdict: "match",
    reason: `Funds ${overlap.map(causeLabel).join(" and ").toLowerCase()} — ${overlap.length} of your ${mine.length} cause ${mine.length === 1 ? "area" : "areas"}.`,
  };
}

function sizeFactor(profile: ScoringProfile, funder: ScoringFunder): FitFactor {
  const weight = WEIGHTS.size;
  const ask = profile.typicalAskCents;
  const band = sizeBand(funder.grantSizeMinCents ?? null, funder.grantSizeMaxCents ?? null);

  if (!band || !ask) {
    return {
      key: "size",
      label: "Grant size",
      weight,
      earned: 0,
      verdict: "unknown",
      reason: band
        ? `Typical grants ${band}; add your typical ask to compare.`
        : "No typical grant size published, so your ask could not be compared.",
    };
  }

  const min = funder.grantSizeMinCents ?? 0;
  const max = funder.grantSizeMaxCents ?? Number.MAX_SAFE_INTEGER;

  if (ask >= min && ask <= max) {
    return {
      key: "size",
      label: "Grant size",
      weight,
      earned: weight,
      verdict: "match",
      reason: `Typical grants ${band}, and your ${dollars(ask)} ask sits inside that range.`,
    };
  }
  if (ask < min) {
    // Asking under a funder's floor is usually a fixable mistake, not a wall.
    return {
      key: "size",
      label: "Grant size",
      weight,
      earned: Math.round(weight * 0.5),
      verdict: "miss",
      reason: `Typical grants ${band}, above your ${dollars(ask)} ask — consider asking for more, or a larger project.`,
    };
  }
  return {
    key: "size",
    label: "Grant size",
    weight,
    earned: 0,
    verdict: "miss",
    reason: `Typical grants ${band}; your ${dollars(ask)} ask is larger than they have recently given.`,
  };
}

function newGranteeFactor(funder: ScoringFunder): FitFactor {
  const weight = WEIGHTS.new_grantees;
  const share = funder.newGranteeShare;
  if (share === null || share === undefined) {
    return {
      key: "new_grantees",
      label: "New grantees",
      weight,
      earned: 0,
      verdict: "unknown",
      reason: "Not enough filing history to tell how often they fund a first-time grantee.",
    };
  }
  const pct = Math.round(share * 100);
  if (share >= 0.25) {
    return {
      key: "new_grantees",
      label: "New grantees",
      weight,
      earned: weight,
      verdict: "match",
      reason: `${pct}% of recent grantees had not been funded before — they do take new relationships.`,
    };
  }
  if (share >= 0.1) {
    return {
      key: "new_grantees",
      label: "New grantees",
      weight,
      earned: Math.round(weight * 0.5),
      verdict: "match",
      reason: `${pct}% of recent grantees were new — possible, but most of their giving renews existing grantees.`,
    };
  }
  return {
    key: "new_grantees",
    label: "New grantees",
    weight,
    earned: 0,
    verdict: "miss",
    reason: `Only ${pct}% of recent grantees were new; this looks like a closed circle of longstanding grantees.`,
  };
}

function unsolicitedFactor(funder: ScoringFunder): FitFactor {
  const weight = WEIGHTS.unsolicited;
  if (funder.acceptsUnsolicited === true) {
    return {
      key: "unsolicited",
      label: "Unsolicited requests",
      weight,
      earned: weight,
      verdict: "match",
      reason: "States that they accept unsolicited applications or LOIs.",
    };
  }
  if (funder.acceptsUnsolicited === false) {
    return {
      key: "unsolicited",
      label: "Unsolicited requests",
      weight,
      earned: 0,
      verdict: "miss",
      reason: "States that they do not accept unsolicited requests — you would need an introduction.",
    };
  }
  return {
    key: "unsolicited",
    label: "Unsolicited requests",
    weight,
    earned: 0,
    verdict: "unknown",
    reason: "Does not say whether unsolicited requests are accepted; worth one phone call before you write.",
  };
}

export function fitCacheKey(profileVersion: number, funderVersion: number): string {
  return `p${profileVersion}:f${funderVersion}`;
}

/**
 * The score. Returns `null` — not zero, not a guess — when the profile is too
 * thin to compare anything, because "we don't know" and "bad fit" are different
 * answers and only one of them is honest.
 */
export function scoreFunder(
  profile: ScoringProfile,
  funder: ScoringFunder,
  versions: { profileVersion: number; funderVersion: number } = {
    profileVersion: 1,
    funderVersion: 1,
  },
): FitScore | null {
  if (!profileCompleteness(profile).scorable) return null;

  const factors: FitFactor[] = [
    geographyFactor(profile, funder),
    causeFactor(profile, funder),
    sizeFactor(profile, funder),
    newGranteeFactor(funder),
    unsolicitedFactor(funder),
  ];

  const summed = Math.min(
    100,
    Math.max(0, factors.reduce((sum, f) => sum + f.earned, 0)),
  );

  /**
   * One hard gate, and it is a gate rather than a weight because it is not a
   * matter of degree: a funder that states it does not accept unsolicited
   * requests is not an opportunity for an org with no introduction, however well
   * it matches on paper. Capping it into long-shot territory is the honest
   * answer — a 90 beside "you would need an introduction" would send someone to
   * spend a week writing to a closed door.
   */
  const total = funder.acceptsUnsolicited === false ? Math.min(summed, 39) : summed;

  return {
    total,
    longShot: total < 40,
    factors,
    cacheKey: fitCacheKey(versions.profileVersion, versions.funderVersion),
  };
}

/**
 * The one-line verdict beside the arc. Plain words, and it never claims to know
 * what the funder wants — only what the comparison showed.
 */
export function fitVerdict(score: FitScore): string {
  if (score.total >= 75) return "Strong match on the facts we can check";
  if (score.total >= 55) return "Worth a look";
  if (score.total >= 40) return "Partial match — read the guidelines first";
  return "Long shot on published criteria";
}

/** How many of the five factors could not be checked at all. */
export function unknownCount(score: FitScore): number {
  return score.factors.filter((f) => f.verdict === "unknown").length;
}
