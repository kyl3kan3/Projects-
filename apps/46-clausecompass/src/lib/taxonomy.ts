/**
 * src/lib/taxonomy.ts
 *
 * The clause taxonomy: labels, display order, the per-contract-type checklist that
 * missing-clause detection reads, and the keyword sets the deterministic analyser
 * classifies with.
 *
 * Pure data and pure functions — a client component can import this without
 * dragging the database client into the browser bundle.
 */

import type { ClauseType, ContractType } from "@/db/schema";

export const CLAUSE_LABELS: Record<ClauseType, string> = {
  payment_terms: "Payment Terms",
  ip_assignment: "IP Assignment",
  indemnity: "Indemnity",
  non_compete: "Non-Compete",
  auto_renewal: "Auto-Renewal",
  termination: "Termination",
  liability_cap: "Liability Cap",
  confidentiality: "Confidentiality",
  warranties: "Warranties",
  governing_law: "Governing Law",
  late_fees: "Late Fees",
  scope_revisions: "Revisions & Scope",
  boilerplate: "Boilerplate",
  other: "Other",
};

/** HIGH-risk-first is the report's order; this is the tiebreak within a severity. */
export const CLAUSE_ORDER: ClauseType[] = [
  "payment_terms",
  "ip_assignment",
  "indemnity",
  "liability_cap",
  "non_compete",
  "auto_renewal",
  "termination",
  "scope_revisions",
  "late_fees",
  "confidentiality",
  "warranties",
  "governing_law",
  "other",
  "boilerplate",
];

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  msa: "Master Services Agreement",
  sow: "Statement of Work",
  nda: "NDA",
  vendor: "Vendor Agreement",
  lease: "Commercial Lease",
  other: "Agreement",
};

/**
 * What a contract of each type should contain. Missing-clause detection is the
 * difference between these lists and what extraction actually found — and a rule
 * with op `absent` only fires for a clause type on this checklist, so an NDA is
 * never flagged for having no payment terms.
 */
export const REQUIRED_CLAUSES: Record<ContractType, ClauseType[]> = {
  msa: [
    "payment_terms",
    "ip_assignment",
    "liability_cap",
    "termination",
    "confidentiality",
    "indemnity",
    "late_fees",
  ],
  sow: ["payment_terms", "scope_revisions", "termination", "late_fees"],
  nda: ["confidentiality", "termination", "governing_law"],
  vendor: ["payment_terms", "liability_cap", "termination", "indemnity"],
  lease: ["payment_terms", "termination", "liability_cap", "late_fees"],
  other: ["payment_terms", "termination", "liability_cap"],
};

export function isRequired(type: ContractType, clause: ClauseType): boolean {
  return REQUIRED_CLAUSES[type].includes(clause);
}

/**
 * Keyword sets for classification. Weighted: a phrase that only ever appears in one
 * kind of clause ("work product", "hold harmless") outweighs a common word.
 */
export const CLAUSE_KEYWORDS: Record<ClauseType, Array<[string, number]>> = {
  payment_terms: [
    ["net 30", 6],
    ["net-30", 6],
    ["net 60", 6],
    ["invoice", 3],
    ["payment terms", 6],
    ["shall pay", 3],
    ["payable within", 5],
    ["fees", 2],
    ["compensation", 3],
    ["deposit", 2],
  ],
  ip_assignment: [
    ["work product", 6],
    ["intellectual property", 5],
    ["assigns", 3],
    ["assignment of", 3],
    ["work made for hire", 6],
    ["moral rights", 4],
    ["copyright", 3],
    ["ownership", 3],
  ],
  indemnity: [
    ["indemnif", 7],
    ["hold harmless", 7],
    ["defend", 3],
    ["third party claim", 4],
  ],
  non_compete: [
    ["non-compete", 8],
    ["noncompete", 8],
    ["not compete", 7],
    ["shall not, directly or indirectly", 5],
    ["non-solicit", 4],
    ["competing business", 5],
  ],
  auto_renewal: [
    ["automatically renew", 8],
    ["auto-renew", 8],
    ["successive", 4],
    ["renewal term", 6],
    ["unless either party provides", 3],
  ],
  termination: [
    ["terminat", 5],
    ["for convenience", 6],
    ["written notice", 2],
    ["cure period", 3],
    ["material breach", 3],
  ],
  liability_cap: [
    ["limitation of liability", 8],
    ["aggregate liability", 7],
    ["shall not exceed", 6],
    ["consequential damages", 4],
    ["in no event", 3],
  ],
  confidentiality: [
    ["confidential information", 7],
    ["non-disclosure", 5],
    ["confidentiality", 5],
    ["trade secret", 3],
  ],
  warranties: [
    ["warrant", 6],
    ["as is", 3],
    ["representations and warranties", 7],
    ["merchantability", 4],
  ],
  governing_law: [
    ["governing law", 8],
    ["governed by the laws", 8],
    ["exclusive jurisdiction", 5],
    ["venue", 4],
    ["arbitration", 4],
  ],
  late_fees: [
    ["late fee", 8],
    ["late payment", 6],
    ["interest at", 5],
    ["per month on", 3],
    ["past due", 5],
  ],
  scope_revisions: [
    ["revision", 7],
    ["change order", 6],
    ["scope of work", 5],
    ["additional rounds", 5],
    ["as necessary to satisfy", 4],
  ],
  // "Boilerplate" means accounted for and not scored by any playbook rule — the
  // preamble, the insurance section, the general provisions. Without these the
  // coverage strip called four ordinary sections "not analyzed", which reads as a
  // gap in the review rather than as a section with nothing to score.
  boilerplate: [
    ["entire agreement", 6],
    ["severability", 6],
    ["counterparts", 6],
    ["notices", 4],
    ["force majeure", 5],
    ["assignment of this agreement", 3],
    ["waiver", 4],
    ["headings", 4],
    ["entered into as of", 6],
    ["by and between", 4],
    ["independent contractor", 6],
    ["insurance", 5],
    ["additional insured", 4],
    ["relationship of the parties", 5],
    ["no employment", 4],
    ["taxes on amounts paid", 5],
  ],
  other: [],
};

/** Contract-type detection: cheap, honest, and always user-confirmable. */
export function detectContractType(text: string): ContractType {
  const t = text.toLowerCase();
  const head = t.slice(0, 4000);
  if (/non-?disclosure agreement|mutual nda|\bnda\b/.test(head)) return "nda";
  if (/master (services|service) agreement|\bmsa\b/.test(head)) return "msa";
  if (/statement of work|\bsow\b|work order/.test(head)) return "sow";
  if (/\blease\b|landlord|tenant|premises/.test(head)) return "lease";
  if (/vendor agreement|supplier agreement|reseller/.test(head)) return "vendor";
  if (/services agreement|consulting agreement|independent contractor/.test(head)) return "msa";
  return "other";
}
