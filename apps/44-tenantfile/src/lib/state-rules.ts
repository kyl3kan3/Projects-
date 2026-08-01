/**
 * Late-fee guardrails by state — information, not legal advice.
 *
 * README.md's differentiator 5 is "compliance guardrails, not legal advice", and
 * that distinction is load-bearing here. What this file does: hold the commonly
 * cited statutory limit for a handful of states, with the citation and the date
 * it was written down, and warn a landlord whose rule looks like it exceeds it.
 * What this file must never do: decide anything, or present itself as current.
 *
 * Every entry carries `reviewedOn` and a citation, every screen that reads this
 * file shows both, and states with no entry say so plainly instead of implying
 * "no cap". README.md budgets an annual legal-content review; this table is the
 * thing that review updates.
 *
 * >>> This table was compiled by the build as illustrative seed content and has
 * >>> NOT been verified by a lawyer. Treat every row as unconfirmed until the
 * >>> legal review in ROADMAP Phase 2 has passed over it.
 */

export type CapKind =
  | "percent_of_rent"
  | "lesser_of_flat_or_percent"
  | "greater_of_flat_or_percent"
  | "percent_per_period"
  | "tiered_per_day"
  | "reasonable_only"
  | "none_on_file";

export interface StateLateFeeRule {
  state: string;
  name: string;
  capKind: CapKind;
  /** Percent as basis points (500 = 5%), when the rule has a percentage. */
  percentBps?: number;
  /** Flat component in cents, when the rule has one. */
  flatCents?: number;
  /** Days rent must be late before any fee may be charged, where set by statute. */
  minGraceDays?: number;
  citation: string;
  summary: string;
  reviewedOn: string;
}

const REVIEWED = "2026-07-01";

export const STATE_LATE_FEE_RULES: Record<string, StateLateFeeRule> = {
  CA: {
    state: "CA",
    name: "California",
    capKind: "reasonable_only",
    citation: "No statutory cap; California treats a late fee as liquidated damages, which must approximate the landlord's actual cost.",
    summary: "No fixed cap. A fee has to be a reasonable estimate of what the late payment actually costs you — keep a note of how you arrived at it.",
    reviewedOn: REVIEWED,
  },
  CO: {
    state: "CO",
    name: "Colorado",
    capKind: "greater_of_flat_or_percent",
    flatCents: 5_000,
    percentBps: 500,
    minGraceDays: 7,
    citation: "C.R.S. § 38-12-105",
    summary: "Commonly cited as the greater of $50 or 5% of the past-due rent, and not before rent is 7 days late.",
    reviewedOn: REVIEWED,
  },
  DE: {
    state: "DE",
    name: "Delaware",
    capKind: "percent_of_rent",
    percentBps: 500,
    minGraceDays: 5,
    citation: "25 Del. C. § 5501",
    summary: "Commonly cited as 5% of the monthly rent, chargeable only after a 5-day grace period.",
    reviewedOn: REVIEWED,
  },
  IA: {
    state: "IA",
    name: "Iowa",
    capKind: "tiered_per_day",
    citation: "Iowa Code § 562A.9",
    summary: "Commonly cited as a daily cap that steps with the rent: $12/day (max $60/month) where rent is $700 or less, $20/day (max $100/month) above that.",
    reviewedOn: REVIEWED,
  },
  MA: {
    state: "MA",
    name: "Massachusetts",
    capKind: "reasonable_only",
    minGraceDays: 30,
    citation: "M.G.L. c. 186, § 15B",
    summary: "Commonly cited as no late fee at all until rent is 30 days overdue.",
    reviewedOn: REVIEWED,
  },
  MD: {
    state: "MD",
    name: "Maryland",
    capKind: "percent_of_rent",
    percentBps: 500,
    citation: "Md. Code, Real Prop. § 8-208",
    summary: "Commonly cited as a hard 5% of the monthly rent.",
    reviewedOn: REVIEWED,
  },
  ME: {
    state: "ME",
    name: "Maine",
    capKind: "percent_of_rent",
    percentBps: 400,
    minGraceDays: 15,
    citation: "14 M.R.S. § 6028",
    summary: "Commonly cited as 4% of the monthly rent, after a 15-day grace period, and the tenant must have been told in writing.",
    reviewedOn: REVIEWED,
  },
  NC: {
    state: "NC",
    name: "North Carolina",
    capKind: "greater_of_flat_or_percent",
    flatCents: 1_500,
    percentBps: 500,
    citation: "N.C. Gen. Stat. § 42-46",
    summary: "Commonly cited as the greater of $15 or 5% of the monthly rent, once per late payment.",
    reviewedOn: REVIEWED,
  },
  NJ: {
    state: "NJ",
    name: "New Jersey",
    capKind: "reasonable_only",
    citation: "No statutory cap for private housing; a fee must be stated in the lease and be reasonable.",
    summary: "No fixed cap for private landlords. Put the fee in the lease and keep it defensible.",
    reviewedOn: REVIEWED,
  },
  NY: {
    state: "NY",
    name: "New York",
    capKind: "lesser_of_flat_or_percent",
    flatCents: 5_000,
    percentBps: 500,
    minGraceDays: 5,
    citation: "N.Y. Real Prop. Law § 238-a",
    summary: "Commonly cited as the lesser of $50 or 5% of the monthly rent, and not before rent is 5 days late.",
    reviewedOn: REVIEWED,
  },
  OR: {
    state: "OR",
    name: "Oregon",
    capKind: "percent_per_period",
    percentBps: 500,
    minGraceDays: 4,
    citation: "ORS 90.260 (Residential Landlord and Tenant Act)",
    summary: "Commonly cited as either a reasonable flat fee or 5% of the periodic rent per five-day period, chargeable once rent is 4 days late.",
    reviewedOn: REVIEWED,
  },
  TX: {
    state: "TX",
    name: "Texas",
    capKind: "percent_of_rent",
    percentBps: 1_200,
    citation: "Tex. Prop. Code § 92.019",
    summary: "Commonly cited as a fee that must be reasonable, with 12% of the monthly rent presumed reasonable for a building of four units or fewer (10% above that).",
    reviewedOn: REVIEWED,
  },
};

export function stateRule(state: string | null | undefined): StateLateFeeRule | null {
  if (!state) return null;
  return STATE_LATE_FEE_RULES[state.trim().toUpperCase()] ?? null;
}

/** The dollar ceiling a state's rule implies for this rent, when one is computable. */
export function impliedCapCents(rule: StateLateFeeRule, rentCents: number): number | null {
  const pct = rule.percentBps != null ? Math.round((rentCents * rule.percentBps) / 10_000) : null;
  switch (rule.capKind) {
    case "percent_of_rent":
    case "percent_per_period":
      return pct;
    case "lesser_of_flat_or_percent":
      return pct != null && rule.flatCents != null ? Math.min(pct, rule.flatCents) : null;
    case "greater_of_flat_or_percent":
      return pct != null && rule.flatCents != null ? Math.max(pct, rule.flatCents) : null;
    default:
      return null;
  }
}

export interface RuleWarning {
  level: "warn" | "info";
  text: string;
}

/**
 * Everything worth telling a landlord about the rule they just typed in. Returns
 * warnings; it never blocks and never rewrites their rule. They acknowledge and
 * proceed — the acknowledgement is stored on the rule so the File can show that
 * they were told.
 */
export function checkLateFeeRule(
  state: string | null | undefined,
  input: { kind: "flat" | "percent"; amount: number; graceDays: number; maxPerMonthCents: number | null },
  rentCents: number,
): { rule: StateLateFeeRule | null; warnings: RuleWarning[] } {
  const rule = stateRule(state);
  const warnings: RuleWarning[] = [];

  const worstCaseFee =
    input.kind === "flat"
      ? Math.max(0, Math.trunc(input.amount))
      : Math.round((rentCents * Math.max(0, Math.trunc(input.amount))) / 10_000);
  const effective = input.maxPerMonthCents != null ? Math.min(worstCaseFee, input.maxPerMonthCents) : worstCaseFee;

  if (!rule) {
    warnings.push({
      level: "info",
      text: state
        ? `No late-fee limit on file for ${state.toUpperCase()}. Check your state statute before you rely on this fee.`
        : "Add the property's state to see the late-fee limit commonly cited there.",
    });
    return { rule: null, warnings };
  }

  const cap = impliedCapCents(rule, rentCents);
  if (cap != null && effective > cap) {
    warnings.push({
      level: "warn",
      text: `${rule.name} is commonly cited at a maximum of ${dollars(cap)} on rent of ${dollars(rentCents)}. Your rule can charge ${dollars(effective)}.`,
    });
  }
  if (rule.minGraceDays != null && input.graceDays < rule.minGraceDays) {
    warnings.push({
      level: "warn",
      text: `${rule.name} is commonly cited as requiring rent to be at least ${rule.minGraceDays} days late before any fee. You have ${input.graceDays}.`,
    });
  }
  if (cap == null) {
    warnings.push({ level: "info", text: rule.summary });
  }
  warnings.push({
    level: "info",
    text: `${rule.citation} · noted ${rule.reviewedOn}. Information, not legal advice — confirm against the current statute.`,
  });

  return { rule, warnings };
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export const LEGAL_DISCLAIMER =
  "TenantFile surfaces commonly cited state limits so you can spot an obvious problem. It is information, not legal advice, and it is not guaranteed current. Confirm anything that matters against your state's statute or a lawyer.";
