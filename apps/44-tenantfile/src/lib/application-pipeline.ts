/**
 * The application pipeline, as pure logic: which transitions are legal, what the
 * income ratio is, and the adverse-action letter template.
 *
 * ## The boundary this file draws
 *
 * TenantFile does not decide anything about an applicant. It computes one
 * arithmetic fact — stated monthly income divided by rent — and displays it,
 * because that is the number the landlord asked for on their own form. It does
 * not score, rank, recommend, or flag. There is no "risk" anywhere in this
 * codebase, and adding one would put the product inside FCRA's definition of a
 * consumer reporting agency, which is a different company with different
 * obligations.
 *
 * The adverse-action letter is a *template the landlord fills in and sends*. It
 * exists because the FCRA requires specific disclosures when a decision is based
 * in any part on a consumer report, and a DIY landlord will not know that. The
 * landlord supplies the reason and the reporting agency's details; TenantFile
 * supplies the paperwork and the timestamp.
 */

import type { ApplicationStatus } from "@/db/schema";
import { formatMoney } from "@/lib/money";

const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  new: ["invited_to_screen", "approved", "declined"],
  invited_to_screen: ["screened", "approved", "declined"],
  screened: ["approved", "declined"],
  // Terminal. Reopening an application would rewrite history; make a new one.
  approved: [],
  declined: [],
};

export function nextStates(from: ApplicationStatus): ApplicationStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return nextStates(from).includes(to);
}

export function assertTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`An application cannot go from ${statusLabel(from)} to ${statusLabel(to)}`);
  }
}

export function statusLabel(status: ApplicationStatus): string {
  switch (status) {
    case "new":
      return "New";
    case "invited_to_screen":
      return "Invited to screen";
    case "screened":
      return "Screening on file";
    case "approved":
      return "Approved";
    case "declined":
      return "Declined";
  }
}

/**
 * Whether declining this applicant needs an adverse-action letter.
 *
 * The FCRA duty attaches when the decision rests even partly on a consumer
 * report. TenantFile cannot know what was in the landlord's head, so it uses the
 * only honest proxy: if a screening record exists for this application, the
 * letter step is required. False positives here cost the landlord two minutes;
 * false negatives cost them a statutory claim.
 */
export function requiresAdverseAction(status: ApplicationStatus, hasScreeningRecord: boolean): boolean {
  return hasScreeningRecord || status === "invited_to_screen" || status === "screened";
}

/**
 * Stated monthly income as a multiple of the rent, to one decimal. Returns null
 * rather than Infinity when the rent is zero, and rounds *down* — a 2.99×
 * applicant should not read as "3.0× RENT" on a card someone skims.
 */
export function incomeRatio(monthlyIncomeCents: number, rentCents: number): number | null {
  if (rentCents <= 0 || monthlyIncomeCents <= 0) return null;
  return Math.floor((monthlyIncomeCents / rentCents) * 10) / 10;
}

export function incomeRatioLabel(monthlyIncomeCents: number, rentCents: number): string {
  const ratio = incomeRatio(monthlyIncomeCents, rentCents);
  return ratio == null ? "INCOME NOT STATED" : `${ratio.toFixed(1)}× RENT`;
}

/** Does the stated income clear the bar the landlord published on the listing? */
export function meetsIncomeRequirement(
  monthlyIncomeCents: number,
  rentCents: number,
  minMultiple: number,
): boolean | null {
  const ratio = incomeRatio(monthlyIncomeCents, rentCents);
  if (ratio == null || minMultiple <= 0) return null;
  return ratio >= minMultiple;
}

/* -------------------------------------------------- adverse-action letter --- */

export interface AdverseActionInput {
  applicantName: string;
  propertyLine: string;
  landlordName: string;
  landlordContact: string;
  /** The landlord's own words. TenantFile never supplies a reason. */
  reason: string;
  /** Only if a consumer report was used. */
  agencyName?: string;
  agencyAddress?: string;
  agencyPhone?: string;
  /** True when the landlord says the report contributed to the decision. */
  reportUsed: boolean;
  dateLine: string;
}

/**
 * The letter, as text the landlord reads, edits and sends. The four disclosures
 * that the FCRA requires when a consumer report contributed are present when
 * `reportUsed` is true: the adverse action, who furnished the report, that the
 * agency did not make the decision, and the right to a free copy and to dispute.
 *
 * This is a template, not legal advice, and the UI says so above it.
 */
export function adverseActionLetter(input: AdverseActionInput): string {
  const lines: string[] = [];
  lines.push(input.dateLine);
  lines.push("");
  lines.push(`Dear ${input.applicantName},`);
  lines.push("");
  lines.push(
    `Thank you for applying for ${input.propertyLine}. I am writing to let you know that I am not able to offer you the tenancy.`,
  );
  lines.push("");
  if (input.reason.trim()) {
    lines.push(`Reason: ${input.reason.trim()}`);
    lines.push("");
  }

  if (input.reportUsed) {
    const agency = input.agencyName?.trim() || "[name of the screening company you used]";
    const address = input.agencyAddress?.trim() || "[their address]";
    const phone = input.agencyPhone?.trim() || "[their phone number]";
    lines.push(
      `This decision was based in whole or in part on information in a consumer report supplied by ${agency}, ${address}, ${phone}.`,
    );
    lines.push("");
    lines.push(
      `${agency} did not make this decision and cannot explain why it was made. You have the right to obtain a free copy of your report from them if you ask within 60 days of this notice, and the right to dispute with them the accuracy or completeness of anything in it.`,
    );
    lines.push("");
    lines.push(
      "You also have rights under the Fair Credit Reporting Act, which are described in the Summary of Consumer Rights the screening company can provide.",
    );
    lines.push("");
  }

  lines.push("I wish you well in your search.");
  lines.push("");
  lines.push(input.landlordName);
  if (input.landlordContact.trim()) lines.push(input.landlordContact.trim());
  return lines.join("\n");
}

/**
 * Questions a rental application must not ask, kept here so the intake form and
 * any future custom-question feature check against one list. Fair-housing law
 * protects these characteristics federally; states and cities add more.
 */
export const PROTECTED_TOPICS = [
  "race",
  "colour or skin tone",
  "religion",
  "national origin or citizenship status",
  "sex or gender",
  "sexual orientation or gender identity",
  "familial status, children, or pregnancy",
  "disability, medical conditions, or medications",
  "age",
  "marital status",
  "source of income where locally protected (housing vouchers)",
] as const;

export const FAIR_HOUSING_NOTE =
  "This form asks nothing about race, religion, national origin, sex, family status, disability, age or marital status. Those questions are unlawful to ask or use in a tenancy decision, so TenantFile does not provide a place to put them.";

/** A one-line summary for a pipeline card, without editorialising. */
export function applicationSummary(monthlyIncomeCents: number, rentCents: number, occupants: number): string {
  const ratio = incomeRatioLabel(monthlyIncomeCents, rentCents);
  const income = monthlyIncomeCents > 0 ? formatMoney(monthlyIncomeCents) : "not stated";
  return `${income}/mo stated · ${ratio} · ${occupants} occupant${occupants === 1 ? "" : "s"}`;
}
