/**
 * Per-state lien rule packs — statutes as data, versioned, cited, and dated.
 *
 * **This is content, not law.** Each pack carries the date it was reviewed and
 * the sections it was read from; UnitKeeper renders the citation next to every
 * computed date so an owner (or their lawyer) can check the arithmetic against
 * the statute itself. A state with no reviewed pack gets **manual mode** — the
 * engine says so plainly and refuses to invent a schedule, because a guessed
 * waiting period is worse than no waiting period at all.
 *
 * Packs are versioned and a lien case freezes the version it opened under. When
 * a legislature moves a deadline, cases already running keep counting under the
 * rules they started with, which is what a court would expect.
 */

export type StepOrigin = "delinquency" | "prior_step";

export type StepRequirement =
  | "certified_mail"
  | "publication"
  | "inventory"
  | "post_at_facility";

export interface RuleStep {
  key: string;
  label: string;
  citation: string;
  /** Days after the origin. */
  offsetDays: number;
  from: StepOrigin;
  requires: StepRequirement[];
  /** What the owner has to physically do, in one sentence. */
  instruction: string;
}

export interface RulePack {
  state: string;
  version: number;
  reviewedOn: string;
  notes: string;
  steps: RuleStep[];
  /** Days of notice an existing tenant is owed before a rate increase. */
  rateChangeNoticeDays: number;
}

const TX: RulePack = {
  state: "TX",
  version: 1,
  reviewedOn: "2026-01-15",
  notes:
    "Read from Tex. Prop. Code ch. 59 (self-service storage facility liens), " +
    "§§ 59.041–59.045. Reviewed 2026-01-15. Verify against the current statute " +
    "before a sale; UnitKeeper computes dates and prints documents, it does not " +
    "give legal advice.",
  rateChangeNoticeDays: 30,
  steps: [
    {
      key: "default_notice",
      label: "Written notice of default and claim of lien",
      citation: "Tex. Prop. Code § 59.042",
      offsetDays: 0,
      from: "delinquency",
      requires: ["certified_mail", "inventory"],
      instruction:
        "Mail the notice of claim to the tenant's last known address by certified mail, return receipt requested. Keep the receipt.",
    },
    {
      key: "waiting_period",
      label: "Statutory waiting period ends",
      citation: "Tex. Prop. Code § 59.043",
      offsetDays: 14,
      from: "prior_step",
      requires: [],
      instruction:
        "Nothing to do — the clock runs. The waiting period counts from the day the notice was actually sent, not the day it was due.",
    },
    {
      key: "published_notice",
      label: "Publish notice of sale",
      citation: "Tex. Prop. Code § 59.044",
      offsetDays: 7,
      from: "prior_step",
      requires: ["publication"],
      instruction:
        "Publish the notice of sale in a newspaper of general circulation in the county, or post it as the statute permits. Keep the affidavit of publication.",
    },
    {
      key: "sale",
      label: "Earliest permitted sale date",
      citation: "Tex. Prop. Code § 59.044",
      offsetDays: 7,
      from: "prior_step",
      requires: [],
      instruction:
        "The sale may be held on or after this date at the facility or the nearest suitable place. Record the proceeds on the tenant's ledger.",
    },
  ],
};

const FL: RulePack = {
  state: "FL",
  version: 1,
  reviewedOn: "2026-01-15",
  notes:
    "Read from Fla. Stat. ch. 83 pt. IV (Self-Storage Facility Act), " +
    "§§ 83.801–83.809. Reviewed 2026-01-15. Florida requires advertisement once a " +
    "week for two consecutive weeks before sale; the pack models the first " +
    "publication as its own step so the affidavit dates line up.",
  rateChangeNoticeDays: 30,
  steps: [
    {
      key: "default_notice",
      label: "Notice of default and lien claim",
      citation: "Fla. Stat. § 83.806(2)",
      offsetDays: 0,
      from: "delinquency",
      requires: ["certified_mail", "inventory"],
      instruction:
        "Send the notice to the tenant's last known address by certified mail or verified mail, stating the amount due and the date the unit may be sold.",
    },
    {
      key: "waiting_period",
      label: "14-day waiting period ends",
      citation: "Fla. Stat. § 83.806(2)",
      offsetDays: 14,
      from: "prior_step",
      requires: [],
      instruction: "The clock runs from the day the notice was sent. Do not advertise before this date.",
    },
    {
      key: "first_publication",
      label: "First advertisement of sale",
      citation: "Fla. Stat. § 83.806(3)",
      offsetDays: 0,
      from: "prior_step",
      requires: ["publication"],
      instruction:
        "Advertise the sale once a week for two consecutive weeks in a newspaper of general circulation in the county. This step records the first insertion.",
    },
    {
      key: "sale",
      label: "Earliest permitted sale date",
      citation: "Fla. Stat. § 83.806(3)",
      offsetDays: 15,
      from: "prior_step",
      requires: [],
      instruction:
        "The sale may be held on or after this date, and no earlier than 15 days after the first advertisement.",
    },
  ],
};

const CA: RulePack = {
  state: "CA",
  version: 1,
  reviewedOn: "2026-01-15",
  notes:
    "Read from Cal. Bus. & Prof. Code §§ 21700–21716 (Self-Service Storage " +
    "Facility Act). Reviewed 2026-01-15. California runs two notices: the " +
    "preliminary lien notice and then the notice of lien sale, each with its own " +
    "waiting period.",
  rateChangeNoticeDays: 30,
  steps: [
    {
      key: "preliminary_lien_notice",
      label: "Preliminary lien notice",
      citation: "Cal. Bus. & Prof. Code § 21703",
      offsetDays: 14,
      from: "delinquency",
      requires: ["certified_mail", "inventory"],
      instruction:
        "Mail the preliminary lien notice to the tenant's last known address, and to any alternate contact on the lease.",
    },
    {
      key: "lien_sale_notice",
      label: "Notice of lien sale",
      citation: "Cal. Bus. & Prof. Code § 21705",
      offsetDays: 14,
      from: "prior_step",
      requires: ["certified_mail"],
      instruction:
        "Mail the notice of lien sale by certified mail. It must state the time and place of the sale.",
    },
    {
      key: "publication",
      label: "First advertisement of sale",
      citation: "Cal. Bus. & Prof. Code § 21707",
      offsetDays: 14,
      from: "prior_step",
      requires: ["publication"],
      instruction:
        "Advertise the sale once a week for two consecutive weeks in a newspaper of general circulation in the county where the sale will be held.",
    },
    {
      key: "sale",
      label: "Earliest permitted sale date",
      citation: "Cal. Bus. & Prof. Code § 21707",
      offsetDays: 14,
      from: "prior_step",
      requires: [],
      instruction:
        "The sale may be held on or after this date. Surplus proceeds must be held for the tenant.",
    },
  ],
};

export const RULE_PACKS: readonly RulePack[] = [TX, FL, CA];

/** States with a reviewed pack, for the UI's honest list. */
export const REVIEWED_STATES: readonly string[] = RULE_PACKS.map((p) => p.state);

/** All 50 plus DC, so a facility can be created anywhere and say so plainly. */
export const US_STATES: readonly string[] = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

export function packFor(state: string): RulePack | null {
  const upper = state.trim().toUpperCase();
  return RULE_PACKS.find((p) => p.state === upper) ?? null;
}

/**
 * The sentence shown wherever a facility's state has no reviewed pack. It names
 * the state and the alternative rather than hiding the feature.
 */
export function manualModeSentence(state: string): string {
  return (
    `${state.toUpperCase()} has no reviewed rule pack in this build, so UnitKeeper will not compute a lien schedule for it. ` +
    `Reviewed states: ${REVIEWED_STATES.join(", ")}. Run the manual checklist and record each step's date by hand.`
  );
}

/** Notice days a rate increase needs; 30 where no pack exists (the common floor). */
export function rateChangeNoticeDays(state: string): number {
  return packFor(state)?.rateChangeNoticeDays ?? 30;
}

export function requirementLabel(requirement: StepRequirement): string {
  switch (requirement) {
    case "certified_mail":
      return "Certified mail";
    case "publication":
      return "Newspaper publication";
    case "inventory":
      return "Inventory of contents";
    case "post_at_facility":
      return "Posted at the facility";
  }
}
