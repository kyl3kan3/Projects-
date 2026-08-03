/**
 * src/lib/templates.ts
 *
 * Checklist templates: the tasks a contract type carries, their owners, whether
 * a document has to land, and the date rule that computes the deadline.
 *
 * The three starter templates are written against a generic residential resale
 * contract of the kind used in Texas and Colorado — the deadlines every file has
 * — with offsets a TC would recognise. They are a starting point a coordinator
 * edits to match their state form, not a legal document, and the templates
 * screen says exactly that.
 */

import { z } from "zod";
import type { ContractType, PartyRole } from "@/db/schema";
import { ANCHOR_KEYS, ruleSentence, type DateRule, type DatedTask } from "@/lib/dates";

export const TASK_OWNER_ROLES: readonly PartyRole[] = [
  "tc",
  "buyer",
  "seller",
  "buyer_agent",
  "listing_agent",
  "lender",
  "title",
  "hoa",
  "other",
] as const;

export const PARTY_ROLE_LABELS: Record<PartyRole, string> = {
  buyer: "Buyer",
  seller: "Seller",
  buyer_agent: "Buyer's agent",
  listing_agent: "Listing agent",
  lender: "Lender",
  title: "Title / escrow",
  hoa: "HOA",
  tc: "Coordinator",
  other: "Other",
};

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  listing: "Listing side",
  buyer: "Buyer side",
  dual: "Dual / in-house",
  lease: "Lease",
};

export interface TemplateTask {
  key: string;
  label: string;
  ownerRole: PartyRole;
  docRequired: boolean;
  /** Absent = a task with no deadline of its own (a checkbox, not a date). */
  dateRule?: DateRule;
}

/* ------------------------------------------------------------- validation */

const dateRuleSchema = z.object({
  anchor: z.enum(["contract_date", "acceptance_date", "closing_date"]),
  offsetDays: z.number().int().min(-365).max(365),
  businessDays: z.boolean(),
  observeHolidays: z.boolean(),
});

const taskSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, "Keys are lower-case letters, numbers and underscores"),
  label: z.string().min(1).max(120),
  ownerRole: z.enum([
    "buyer",
    "seller",
    "buyer_agent",
    "listing_agent",
    "lender",
    "title",
    "hoa",
    "tc",
    "other",
  ]),
  docRequired: z.boolean(),
  dateRule: dateRuleSchema.optional(),
});

export const templateTasksSchema = z.array(taskSchema).max(60);

/**
 * Read tasks off a `checklist_templates.tasks` jsonb column. Anything malformed
 * is dropped rather than crashing the deal file — a template edited by hand
 * should not be able to take a coordinator's whole pipeline down.
 */
export function parseTemplateTasks(value: unknown): TemplateTask[] {
  const parsed = templateTasksSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  if (!Array.isArray(value)) return [];
  const kept: TemplateTask[] = [];
  for (const item of value) {
    const one = taskSchema.safeParse(item);
    if (one.success) kept.push(one.data);
  }
  return kept;
}

/** The dated subset, in the shape the engine takes. */
export function datedTasks(tasks: readonly TemplateTask[]): DatedTask[] {
  return tasks
    .filter((t): t is TemplateTask & { dateRule: DateRule } => Boolean(t.dateRule))
    .map((t) => ({ key: t.key, label: t.label, rule: t.dateRule }));
}

/** The rule, read back as a sentence the TC can check. */
export function ruleReadback(rule: DateRule): string {
  const base = ruleSentence(rule);
  const observance = rule.observeHolidays
    ? rule.businessDays
      ? ", skipping weekends and observed holidays"
      : ", rolled off weekends and observed holidays"
    : rule.businessDays
      ? ", skipping weekends only"
      : ", calendar days exactly as written";
  return `${base}${observance}.`;
}

export const ANCHOR_OPTIONS = ANCHOR_KEYS;

/* ------------------------------------------------------- starter templates */

export interface StarterTemplate {
  name: string;
  contractType: ContractType;
  tasks: TemplateTask[];
}

const bus = (offsetDays: number, anchor: DateRule["anchor"] = "contract_date"): DateRule => ({
  anchor,
  offsetDays,
  businessDays: true,
  observeHolidays: true,
});

const cal = (offsetDays: number, anchor: DateRule["anchor"] = "contract_date"): DateRule => ({
  anchor,
  offsetDays,
  businessDays: false,
  observeHolidays: true,
});

/**
 * The buyer-side file: eleven computed dates, which is what a residential
 * purchase actually carries once you write them all down.
 */
const BUYER_TASKS: TemplateTask[] = [
  {
    key: "emd_delivered",
    label: "Earnest money delivered",
    ownerRole: "buyer",
    docRequired: true,
    dateRule: bus(3),
  },
  {
    key: "sellers_disclosure",
    label: "Seller's disclosure received",
    ownerRole: "listing_agent",
    docRequired: true,
    dateRule: bus(5),
  },
  {
    key: "loan_application",
    label: "Loan application submitted",
    ownerRole: "buyer",
    docRequired: false,
    dateRule: bus(5),
  },
  {
    key: "inspection_complete",
    label: "Inspection completed",
    ownerRole: "buyer_agent",
    docRequired: true,
    dateRule: bus(7),
  },
  {
    key: "inspection_objection",
    label: "Inspection objection deadline",
    ownerRole: "buyer_agent",
    docRequired: false,
    dateRule: bus(10),
  },
  {
    key: "hoa_docs",
    label: "HOA documents delivered",
    ownerRole: "hoa",
    docRequired: true,
    dateRule: cal(10),
  },
  {
    key: "title_commitment",
    label: "Title commitment delivered",
    ownerRole: "title",
    docRequired: true,
    dateRule: cal(20),
  },
  {
    key: "appraisal_received",
    label: "Appraisal received",
    ownerRole: "lender",
    docRequired: true,
    dateRule: cal(21),
  },
  {
    key: "loan_commitment",
    label: "Loan commitment issued",
    ownerRole: "lender",
    docRequired: true,
    dateRule: cal(30),
  },
  {
    key: "final_walkthrough",
    label: "Final walkthrough",
    ownerRole: "buyer_agent",
    docRequired: false,
    dateRule: bus(-1, "closing_date"),
  },
  {
    key: "closing_funding",
    label: "Closing and funding",
    ownerRole: "title",
    docRequired: true,
    dateRule: bus(0, "closing_date"),
  },
  // Undated: things that must happen, but on nobody's clock.
  { key: "survey_delivered", label: "Survey delivered", ownerRole: "seller", docRequired: true },
  {
    key: "insurance_binder",
    label: "Homeowner's insurance binder",
    ownerRole: "buyer",
    docRequired: true,
  },
  { key: "utilities_transfer", label: "Utilities transferred", ownerRole: "buyer", docRequired: false },
];

const LISTING_TASKS: TemplateTask[] = [
  {
    key: "listing_agreement",
    label: "Listing agreement signed",
    ownerRole: "seller",
    docRequired: true,
    dateRule: bus(0),
  },
  {
    key: "sellers_disclosure_prepared",
    label: "Seller's disclosure prepared",
    ownerRole: "seller",
    docRequired: true,
    dateRule: bus(3),
  },
  {
    key: "mls_live",
    label: "MLS listing live with photos",
    ownerRole: "listing_agent",
    docRequired: false,
    dateRule: bus(2),
  },
  {
    key: "emd_receipted",
    label: "Earnest money receipted by title",
    ownerRole: "title",
    docRequired: true,
    dateRule: bus(3, "acceptance_date"),
  },
  {
    key: "buyer_inspection_window",
    label: "Buyer inspection window closes",
    ownerRole: "buyer_agent",
    docRequired: false,
    dateRule: bus(7, "acceptance_date"),
  },
  {
    key: "repair_negotiation",
    label: "Repair negotiation resolved",
    ownerRole: "listing_agent",
    docRequired: true,
    dateRule: bus(12, "acceptance_date"),
  },
  {
    key: "appraisal_access",
    label: "Appraisal access arranged",
    ownerRole: "listing_agent",
    docRequired: false,
    dateRule: cal(14, "acceptance_date"),
  },
  {
    key: "payoff_ordered",
    label: "Mortgage payoff ordered",
    ownerRole: "title",
    docRequired: true,
    dateRule: cal(-14, "closing_date"),
  },
  {
    key: "seller_cd_reviewed",
    label: "Seller settlement statement reviewed",
    ownerRole: "tc",
    docRequired: true,
    dateRule: bus(-2, "closing_date"),
  },
  {
    key: "closing_seller",
    label: "Closing and disbursement",
    ownerRole: "title",
    docRequired: true,
    dateRule: bus(0, "closing_date"),
  },
  { key: "lockbox_removed", label: "Lockbox and sign removed", ownerRole: "listing_agent", docRequired: false },
];

const DUAL_TASKS: TemplateTask[] = [
  {
    key: "intermediary_notice",
    label: "Intermediary notice signed by both sides",
    ownerRole: "tc",
    docRequired: true,
    dateRule: bus(1),
  },
  {
    key: "emd_delivered",
    label: "Earnest money delivered",
    ownerRole: "buyer",
    docRequired: true,
    dateRule: bus(3),
  },
  {
    key: "sellers_disclosure",
    label: "Seller's disclosure delivered",
    ownerRole: "seller",
    docRequired: true,
    dateRule: bus(5),
  },
  {
    key: "inspection_objection",
    label: "Inspection objection deadline",
    ownerRole: "buyer",
    docRequired: false,
    dateRule: bus(10),
  },
  {
    key: "appraisal_received",
    label: "Appraisal received",
    ownerRole: "lender",
    docRequired: true,
    dateRule: cal(21),
  },
  {
    key: "loan_commitment",
    label: "Loan commitment issued",
    ownerRole: "lender",
    docRequired: true,
    dateRule: cal(30),
  },
  {
    key: "both_sides_cd",
    label: "Both settlement statements reconciled",
    ownerRole: "tc",
    docRequired: true,
    dateRule: bus(-2, "closing_date"),
  },
  {
    key: "closing_dual",
    label: "Closing and funding",
    ownerRole: "title",
    docRequired: true,
    dateRule: bus(0, "closing_date"),
  },
];

const LEASE_TASKS: TemplateTask[] = [
  {
    key: "application_fee",
    label: "Application and screening fee received",
    ownerRole: "buyer",
    docRequired: true,
    dateRule: bus(1),
  },
  {
    key: "screening_complete",
    label: "Screening report complete",
    ownerRole: "tc",
    docRequired: true,
    dateRule: bus(3),
  },
  {
    key: "lease_signed",
    label: "Lease signed by all parties",
    ownerRole: "seller",
    docRequired: true,
    dateRule: bus(5),
  },
  {
    key: "deposit_received",
    label: "Security deposit received",
    ownerRole: "buyer",
    docRequired: true,
    dateRule: bus(-3, "closing_date"),
  },
  {
    key: "move_in_inspection",
    label: "Move-in condition report",
    ownerRole: "tc",
    docRequired: true,
    dateRule: bus(0, "closing_date"),
  },
  { key: "keys_delivered", label: "Keys and access delivered", ownerRole: "seller", docRequired: false },
];

export const STARTER_TEMPLATES: StarterTemplate[] = [
  { name: "Buyer side — residential resale", contractType: "buyer", tasks: BUYER_TASKS },
  { name: "Listing side — residential resale", contractType: "listing", tasks: LISTING_TASKS },
  { name: "Dual / in-house", contractType: "dual", tasks: DUAL_TASKS },
  { name: "Residential lease", contractType: "lease", tasks: LEASE_TASKS },
];

export function starterFor(contractType: ContractType): StarterTemplate {
  return (
    STARTER_TEMPLATES.find((t) => t.contractType === contractType) ?? STARTER_TEMPLATES[0]
  );
}
