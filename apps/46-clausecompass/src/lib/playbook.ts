/**
 * src/lib/playbook.ts
 *
 * Playbook scoring — deterministic, pure TypeScript, no model. Same contract + same
 * playbook version = the same flags, every time. That determinism is the product's
 * trust story, so this file stays boring on purpose.
 *
 * Two things here are worth knowing before editing:
 *
 *  - **Ladders.** `payment_terms_over_30` and `payment_terms_over_60` are rungs of
 *    one ladder. Firing every crossed rung double-flags a clause; firing the
 *    *loosest* crossed rung is worse, because a net-90 contract would then be
 *    reported as a mild caution. `score()` fires the tightest crossed rung only.
 *  - **Absence is type-aware.** A rule with op `absent` fires only when its clause
 *    type is on the contract type's checklist (see `taxonomy.ts`), so an NDA is never
 *    flagged for having no payment terms.
 */

import type { ClauseType, ContractType, RuleComparator, Severity } from "@/db/schema";
import { CLAUSE_LABELS, isRequired } from "@/lib/taxonomy";

/** A rule as stored in `playbook_rules`, minus the database bookkeeping. */
export interface RuleSpec {
  clauseType: ClauseType;
  ruleKey: string;
  title: string;
  comparator: RuleComparator;
  severityOnFail: Severity;
  firedTemplate: string;
  explanationTemplate: string;
  forYouTemplate: string;
  marketNote: string;
  redlineTemplate: string;
  /** Numeric thresholds are editable by Studio accounts; booleans are not. */
  threshold: number | null;
  sortOrder: number;
}

export const DEFAULT_PLAYBOOK_NAME = "Freelancer & SMB default";
export const DEFAULT_PLAYBOOK_VERSION = 1;

/**
 * The default playbook. Every rule states the reader's position plainly and never
 * tells anyone what to do — the copy here is the product's UPL posture in practice,
 * and `explain.test.ts` scans all of it for advice phrasing.
 */
export const DEFAULT_RULES: RuleSpec[] = [
  {
    clauseType: "payment_terms",
    ruleKey: "payment_terms_over_30",
    title: "Payment slower than net-30",
    comparator: { field: "payment_days", op: "gt", threshold: 30, ladder: "payment_days" },
    severityOnFail: "caution",
    firedTemplate: "Payment is due in {{value}} days. Your playbook allows {{threshold}}.",
    explanationTemplate:
      "The client has {{value}} days to pay each invoice after they get it. The clock starts when they receive the invoice, not when you finish the work.",
    forYouTemplate:
      "You fund the work for {{value}} days. On a $6,000 project that is $6,000 of your money parked with the client for two months.",
    marketNote:
      "Net-15 to net-30 is normal for small service work. Net-45 and beyond is a cash-flow term, not a payment term.",
    redlineTemplate:
      "Client shall pay each undisputed invoice within thirty (30) days of the invoice date.",
    threshold: 30,
    sortOrder: 10,
  },
  {
    clauseType: "payment_terms",
    ruleKey: "payment_terms_over_60",
    title: "Payment slower than net-60",
    comparator: { field: "payment_days", op: "gt", threshold: 60, ladder: "payment_days" },
    severityOnFail: "high",
    firedTemplate: "Payment is due in {{value}} days. Your playbook allows {{threshold}}.",
    explanationTemplate:
      "The client has {{value}} days to pay each invoice. That is more than two months after the invoice lands.",
    forYouTemplate:
      "You carry the cost of the work for {{value}} days. If the client pays late on top of that, you are a long way from the money and the contract gives you little to push with.",
    marketNote:
      "Net-15 to net-30 is normal for small service work. Terms past net-60 usually belong to large buyers who set them because they can.",
    redlineTemplate:
      "Client shall pay each undisputed invoice within thirty (30) days of the invoice date.",
    threshold: 60,
    sortOrder: 11,
  },
  {
    clauseType: "payment_terms",
    ruleKey: "payment_terms_missing",
    title: "No payment terms",
    comparator: { field: null, op: "absent" },
    severityOnFail: "high",
    firedTemplate: "No clause sets when payment is due.",
    explanationTemplate:
      "Nothing in this contract says when the client has to pay. There is no due date and no invoice schedule.",
    forYouTemplate:
      "With no due date, an invoice is never technically late, so you have nothing to point at when it goes unpaid.",
    marketNote: "Every services contract names a due date. Its absence is unusual, not standard.",
    redlineTemplate:
      "Client shall pay each undisputed invoice within thirty (30) days of the invoice date. Amounts past due accrue interest at 1.5% per month.",
    threshold: null,
    sortOrder: 12,
  },
  {
    clauseType: "ip_assignment",
    ruleKey: "ip_assigns_before_payment",
    title: "IP transfers before you are paid",
    comparator: { field: "assigns_on", op: "ne", threshold: "payment" },
    severityOnFail: "high",
    firedTemplate: "Ownership passes on {{value}}, not on payment.",
    explanationTemplate:
      "The client owns the work as soon as it exists. Payment is not part of the transfer.",
    forYouTemplate:
      "If the client stops paying, they still own everything you made. Your only route is a claim for the money, and you have no work to hold back.",
    marketNote:
      "The usual freelance term is that rights transfer when the invoice is paid in full. Assignment on creation or delivery is a client-side term.",
    redlineTemplate:
      "Upon Contractor's receipt of payment in full for the applicable deliverable, Contractor assigns to Client all right, title and interest in that deliverable. Until payment in full, Contractor retains all rights and grants Client no licence to use the deliverable.",
    threshold: null,
    sortOrder: 20,
  },
  {
    clauseType: "ip_assignment",
    ruleKey: "ip_assignment_missing",
    title: "No IP clause",
    comparator: { field: null, op: "absent" },
    severityOnFail: "caution",
    firedTemplate: "No clause says who owns the finished work.",
    explanationTemplate:
      "This contract does not say who owns the work you deliver. Copyright law and the facts of the job would decide it later.",
    forYouTemplate:
      "Both sides can walk away believing they own the files. That argument usually arrives when the work becomes valuable.",
    marketNote: "Services contracts normally state ownership one way or the other.",
    redlineTemplate:
      "Upon Contractor's receipt of payment in full, Contractor assigns to Client all right, title and interest in the accepted deliverables. Contractor retains ownership of its own tools, templates and know-how.",
    threshold: null,
    sortOrder: 21,
  },
  {
    clauseType: "indemnity",
    ruleKey: "indemnity_not_mutual",
    title: "Indemnity runs one way",
    comparator: { field: "mutual", op: "is_false" },
    severityOnFail: "high",
    firedTemplate: "Only one side gives an indemnity, and it is not the client.",
    explanationTemplate:
      "You promise to cover the client's costs, including their legal fees, for claims that come out of your work. The client makes no matching promise to you.",
    forYouTemplate:
      "A claim brought by someone else can land on you even when the client caused it. You pay their lawyers as well as your own.",
    marketNote:
      "Mutual indemnities are standard between businesses of any size: each side covers claims caused by its own acts.",
    redlineTemplate:
      "Each Party shall defend, indemnify and hold harmless the other Party from third-party claims arising from that Party's own negligence, willful misconduct or breach of this Agreement, subject to the limitation of liability in this Agreement.",
    threshold: null,
    sortOrder: 30,
  },
  {
    clauseType: "indemnity",
    ruleKey: "indemnity_uncapped",
    title: "Indemnity has no cap",
    comparator: { field: "capped", op: "is_false" },
    severityOnFail: "high",
    firedTemplate: "The indemnity is not tied to any liability cap.",
    explanationTemplate:
      "There is no ceiling on what you could owe under this indemnity. The amount is whatever the claim turns out to be.",
    forYouTemplate:
      "A $4,000 project can carry a bill far larger than the fee. Nothing in the contract limits it.",
    marketNote:
      "An indemnity is normally made subject to the contract's liability cap, with narrow carve-outs such as fraud.",
    redlineTemplate:
      "The indemnity obligations in this Section are subject to the limitation of liability set out in this Agreement, except for fraud or willful misconduct.",
    threshold: null,
    sortOrder: 31,
  },
  {
    clauseType: "non_compete",
    ruleKey: "non_compete_present",
    title: "Non-compete on a contractor",
    comparator: { field: "present", op: "is_true" },
    severityOnFail: "high",
    firedTemplate: "A non-compete restricts your other work for {{months}} months after this job ends.",
    explanationTemplate:
      "After the work ends, this clause blocks you from similar work for other clients in the same field for a set period.",
    forYouTemplate:
      "Your next few clients may be off limits. For an independent business, that can be the difference between a pipeline and a gap.",
    marketNote:
      "Client-side non-competes on independent contractors are unusual and, in several states, unenforceable. A non-solicitation of the client's own staff is the common middle ground.",
    redlineTemplate:
      "Contractor shall not, during the term of this Agreement, perform services for a direct competitor of Client using Client's Confidential Information. Contractor is otherwise free to provide services to any other client.",
    threshold: null,
    sortOrder: 40,
  },
  {
    clauseType: "auto_renewal",
    ruleKey: "auto_renewal_short_notice",
    title: "Auto-renewal with a short window",
    comparator: { field: "notice_days", op: "lt", threshold: 30, ladder: "renewal_notice" },
    severityOnFail: "caution",
    firedTemplate:
      "The contract renews itself unless you give notice {{value}} days ahead. Your playbook wants at least {{threshold}}.",
    explanationTemplate:
      "This contract renews on its own for another full term. To stop it, you have to give notice inside a {{value}}-day window before the end date.",
    forYouTemplate:
      "Miss the window and you are committed for another term on the same terms. The date is easy to lose track of.",
    marketNote: "Thirty to sixty days' notice is the normal window, and a calendar reminder is the normal defence.",
    redlineTemplate:
      "This Agreement renews for successive twelve (12) month terms unless either Party gives written notice of non-renewal at least thirty (30) days before the end of the then-current term.",
    threshold: 30,
    sortOrder: 50,
  },
  {
    clauseType: "liability_cap",
    ruleKey: "liability_cap_missing",
    title: "No cap on your liability",
    comparator: { field: null, op: "absent" },
    severityOnFail: "high",
    firedTemplate: "No clause limits what either side can owe the other.",
    explanationTemplate:
      "This contract sets no ceiling on damages. If something goes wrong, the amount at stake is open-ended.",
    forYouTemplate:
      "The fee on this job is not the limit of your exposure. A claim can run past what the whole project pays.",
    marketNote:
      "A cap at the fees paid under the contract, often with carve-outs for fraud and confidentiality breaches, is standard on both sides.",
    redlineTemplate:
      "Except for fraud, willful misconduct or breach of confidentiality obligations, each Party's total aggregate liability arising out of this Agreement shall not exceed the total fees paid or payable to Contractor under this Agreement.",
    threshold: null,
    sortOrder: 60,
  },
  {
    clauseType: "liability_cap",
    ruleKey: "liability_cap_one_sided",
    title: "The cap protects one side",
    comparator: { field: "mutual", op: "is_false" },
    severityOnFail: "caution",
    firedTemplate: "The liability cap is written for one party only.",
    explanationTemplate:
      "The ceiling on damages applies to the client's exposure. Yours is left open.",
    forYouTemplate:
      "You carry unlimited risk while the other side carries a known amount. The imbalance is in the wording, not the work.",
    marketNote: "Caps are normally mutual, with the same carve-outs on each side.",
    redlineTemplate:
      "Each Party's total aggregate liability arising out of this Agreement shall not exceed the total fees paid or payable under this Agreement, except for fraud, willful misconduct or breach of confidentiality obligations.",
    threshold: null,
    sortOrder: 61,
  },
  {
    clauseType: "termination",
    ruleKey: "termination_one_sided",
    title: "Only the client can walk away",
    comparator: { field: "for_convenience", op: "is_false" },
    severityOnFail: "caution",
    firedTemplate: "You have no right to end this contract early without alleging fault.",
    explanationTemplate:
      "The contract lets the client stop the work early. You can only get out by claiming the client broke the agreement.",
    forYouTemplate:
      "You are committed while the client is not. Booked time can vanish at short notice, and you cannot do the same in return.",
    marketNote:
      "Termination for convenience is usually mutual, with the same notice period on both sides and payment for work already done.",
    redlineTemplate:
      "Either Party may terminate this Agreement for any reason upon thirty (30) days' written notice. Client shall pay for all Services performed through the effective date of termination.",
    threshold: null,
    sortOrder: 70,
  },
  {
    clauseType: "termination",
    ruleKey: "termination_missing",
    title: "No termination clause",
    comparator: { field: null, op: "absent" },
    severityOnFail: "caution",
    firedTemplate: "No clause says how either side ends this contract.",
    explanationTemplate:
      "This contract never says how it ends. There is no notice period and no process.",
    forYouTemplate:
      "Leaving early becomes a negotiation instead of a right, and the other side sets the tone of it.",
    marketNote: "Contracts normally state a term, a notice period and what happens on termination.",
    redlineTemplate:
      "Either Party may terminate this Agreement for any reason upon thirty (30) days' written notice. Client shall pay for all Services performed through the effective date of termination.",
    threshold: null,
    sortOrder: 71,
  },
  {
    clauseType: "scope_revisions",
    ruleKey: "revisions_unlimited",
    title: "Revisions are unlimited",
    comparator: { field: "unlimited", op: "is_true" },
    severityOnFail: "caution",
    firedTemplate: "Revisions continue until the client accepts the work, with no limit.",
    explanationTemplate:
      "You keep revising each deliverable until the client is happy with it. The contract sets no number of rounds and no extra charge.",
    forYouTemplate:
      "The fee is fixed and the work is not. A project priced at three days can run three weeks and still be inside the contract.",
    marketNote:
      "Two or three rounds included, then hourly work under a written change order, is the common structure.",
    redlineTemplate:
      "The fee includes two (2) rounds of revisions per deliverable. Further revisions are billed at Contractor's standard hourly rate under a written change order signed by both Parties.",
    threshold: null,
    sortOrder: 80,
  },
  {
    clauseType: "late_fees",
    ruleKey: "late_fees_missing",
    title: "No late fee",
    comparator: { field: null, op: "absent" },
    severityOnFail: "caution",
    firedTemplate: "No clause charges anything for paying late.",
    explanationTemplate:
      "Nothing in this contract costs the client money for paying after the due date.",
    forYouTemplate:
      "Late payment is free for the client, so your invoice sits behind everyone who does charge for it.",
    marketNote: "1% to 1.5% per month on overdue amounts is the usual term in small-business paper.",
    redlineTemplate:
      "Amounts not paid when due accrue interest at 1.5% per month, and Contractor may suspend Services on ten (10) days' written notice while any invoice remains overdue.",
    threshold: null,
    sortOrder: 90,
  },
  {
    clauseType: "confidentiality",
    ruleKey: "confidentiality_not_mutual",
    title: "Confidentiality runs one way",
    comparator: { field: "mutual", op: "is_false" },
    severityOnFail: "caution",
    firedTemplate: "Only you are bound to keep information confidential.",
    explanationTemplate:
      "You have to protect the client's information. The client takes on no matching duty for yours.",
    forYouTemplate:
      "Your rates, methods and client list are not covered. Anything you share sits outside the clause.",
    marketNote: "Mutual confidentiality is the norm, and usually costs nothing to ask for.",
    redlineTemplate:
      "Each Party shall hold the other Party's Confidential Information in confidence and use it only to perform this Agreement.",
    threshold: null,
    sortOrder: 100,
  },
  {
    clauseType: "confidentiality",
    ruleKey: "confidentiality_missing",
    title: "No confidentiality clause",
    comparator: { field: null, op: "absent" },
    severityOnFail: "caution",
    firedTemplate: "No clause covers confidential information.",
    explanationTemplate:
      "Neither side has promised to keep the other's information private under this contract.",
    forYouTemplate:
      "What you learn on the job, and what you share to do it, are both unprotected by this paper.",
    marketNote: "A short mutual confidentiality clause is standard in services work.",
    redlineTemplate:
      "Each Party shall hold the other Party's Confidential Information in confidence, use it only to perform this Agreement, and return or destroy it on request.",
    threshold: null,
    sortOrder: 101,
  },
  {
    clauseType: "governing_law",
    ruleKey: "governing_law_missing",
    title: "No governing law",
    comparator: { field: null, op: "absent" },
    severityOnFail: "caution",
    firedTemplate: "No clause names the law or the courts that apply.",
    explanationTemplate:
      "This contract does not say whose law governs it or where a dispute would be heard.",
    forYouTemplate:
      "A disagreement starts with an argument about where to argue, which costs money before anything else does.",
    marketNote: "Naming a state and a venue is standard, and is often the cheapest clause to agree.",
    redlineTemplate:
      "This Agreement is governed by the laws of [your state], and the Parties consent to the exclusive jurisdiction of the courts located in [your county and state].",
    threshold: null,
    sortOrder: 110,
  },
];

/* --------------------------------------------------------------- scoring */

/** The subset of a clause the scorer needs. Keeps the function pure. */
export interface ScorableClause {
  id: string;
  clauseType: ClauseType;
  fields: Record<string, unknown>;
}

/** A rule as the scorer sees it (database row or `RuleSpec` both fit). */
export interface ScorableRule {
  id?: string;
  clauseType: ClauseType;
  ruleKey: string;
  title: string;
  comparator: RuleComparator;
  severityOnFail: Severity;
  threshold: number | null;
  enabled?: boolean;
  sortOrder: number;
  firedTemplate: string;
}

export interface FiredRule {
  ruleId: string | null;
  ruleKey: string;
  clauseId: string | null;
  clauseType: ClauseType;
  severity: Severity;
  title: string;
  firedBecause: string;
  /** The value that tripped the rule, for the explanation pass to quote. */
  value: unknown;
}

const SEVERITY_RANK: Record<Severity, number> = { ok: 0, caution: 1, high: 2 };

export function severityRank(s: Severity): number {
  return SEVERITY_RANK[s];
}

export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const v = vars[key];
    if (v === null || v === undefined) return "—";
    return String(v);
  });
}

function effectiveThreshold(rule: ScorableRule): number | string | boolean | null {
  // A Studio account edits `threshold`; the comparator keeps the shipped default so
  // a bad edit can be reverted without a deploy.
  if (rule.threshold !== null && typeof rule.comparator.threshold === "number") {
    return rule.threshold;
  }
  return rule.comparator.threshold ?? null;
}

function crossed(rule: ScorableRule, fields: Record<string, unknown>): { hit: boolean; value: unknown } {
  const { comparator } = rule;
  const threshold = effectiveThreshold(rule);
  const value = comparator.field ? fields[comparator.field] : null;

  switch (comparator.op) {
    case "gt":
      return { hit: typeof value === "number" && typeof threshold === "number" && value > threshold, value };
    case "gte":
      return { hit: typeof value === "number" && typeof threshold === "number" && value >= threshold, value };
    case "lt":
      return { hit: typeof value === "number" && typeof threshold === "number" && value < threshold, value };
    case "lte":
      return { hit: typeof value === "number" && typeof threshold === "number" && value <= threshold, value };
    case "eq":
      return { hit: value === threshold, value };
    case "ne":
      // An unknown value is not evidence of a problem: `assigns_on: "unclear"` is
      // reported by its own rule, not as a confident "assigns before payment".
      return { hit: value !== undefined && value !== null && value !== "unclear" && value !== threshold, value };
    case "is_true":
      return { hit: value === true, value };
    case "is_false":
      return { hit: value === false, value };
    case "present":
      return { hit: true, value };
    case "absent":
      return { hit: false, value }; // handled separately: there is no clause to read
    default:
      return { hit: false, value };
  }
}

export interface ScoreInput {
  contractType: ContractType;
  clauses: ScorableClause[];
  rules: ScorableRule[];
}

/**
 * Run the playbook. Pure: no database, no clock, no model — the same inputs always
 * produce the same flags in the same order.
 */
export function score({ contractType, clauses, rules }: ScoreInput): FiredRule[] {
  const active = rules.filter((r) => r.enabled !== false);
  const byType = new Map<ClauseType, ScorableClause[]>();
  for (const c of clauses) {
    const list = byType.get(c.clauseType) ?? [];
    list.push(c);
    byType.set(c.clauseType, list);
  }

  const fired: FiredRule[] = [];

  /* --- missing-clause detection: absence rules, gated by the checklist --- */
  for (const rule of active) {
    if (rule.comparator.op !== "absent") continue;
    if (byType.has(rule.clauseType)) continue;
    if (!isRequired(contractType, rule.clauseType)) continue;
    fired.push({
      ruleId: rule.id ?? null,
      ruleKey: rule.ruleKey,
      clauseId: null,
      clauseType: rule.clauseType,
      severity: rule.severityOnFail,
      title: rule.title,
      firedBecause: renderTemplate(rule.firedTemplate, {
        clause: CLAUSE_LABELS[rule.clauseType],
      }),
      value: null,
    });
  }

  /* --- clause rules, one ladder rung at most --- */
  for (const [clauseType, list] of byType) {
    for (const clause of list) {
      const candidates: Array<{ rule: ScorableRule; value: unknown }> = [];
      for (const rule of active) {
        if (rule.clauseType !== clauseType) continue;
        if (rule.comparator.op === "absent") continue;
        const { hit, value } = crossed(rule, clause.fields);
        if (hit) candidates.push({ rule, value });
      }

      const ladders = new Map<string, { rule: ScorableRule; value: unknown }>();
      const plain: Array<{ rule: ScorableRule; value: unknown }> = [];
      for (const candidate of candidates) {
        const key = candidate.rule.comparator.ladder;
        if (!key) {
          plain.push(candidate);
          continue;
        }
        const held = ladders.get(key);
        if (!held || tighter(candidate.rule, held.rule)) ladders.set(key, candidate);
      }

      for (const candidate of [...plain, ...ladders.values()]) {
        const { rule, value } = candidate;
        fired.push({
          ruleId: rule.id ?? null,
          ruleKey: rule.ruleKey,
          clauseId: clause.id,
          clauseType,
          severity: rule.severityOnFail,
          title: rule.title,
          firedBecause: renderTemplate(rule.firedTemplate, {
            value: value ?? "—",
            threshold: effectiveThreshold(rule) ?? "—",
            months: clause.fields.months ?? "—",
            clause: CLAUSE_LABELS[clauseType],
          }),
          value,
        });
      }
    }
  }

  // Deterministic order: severity, then the rule's own sort order, then key.
  fired.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      sortOrderOf(a.ruleKey, active) - sortOrderOf(b.ruleKey, active) ||
      a.ruleKey.localeCompare(b.ruleKey),
  );
  return fired;
}

function sortOrderOf(ruleKey: string, rules: ScorableRule[]): number {
  return rules.find((r) => r.ruleKey === ruleKey)?.sortOrder ?? 999;
}

/**
 * Is `a` the tighter rung than `b`? Severity first; then the threshold that is
 * harder to satisfy. Picking the loosest crossed rung is the classic bug: a net-90
 * contract would report "slower than net-30" as a caution and never mention that it
 * is also past net-60.
 */
function tighter(a: ScorableRule, b: ScorableRule): boolean {
  const rankDelta = SEVERITY_RANK[a.severityOnFail] - SEVERITY_RANK[b.severityOnFail];
  if (rankDelta !== 0) return rankDelta > 0;
  const at = effectiveThreshold(a);
  const bt = effectiveThreshold(b);
  if (typeof at !== "number" || typeof bt !== "number") return false;
  // For "greater than" rules a larger threshold is the tighter rung; for "less
  // than" rules a smaller one is.
  return a.comparator.op === "gt" || a.comparator.op === "gte" ? at > bt : at < bt;
}

/* ------------------------------------------------------- describing a rule */

const FIELD_LABELS: Record<string, string> = {
  payment_days: "payment is due more than {t} days after the invoice",
  notice_days: "the notice window is under {t} days",
  assigns_on: "ownership transfers on anything other than payment",
  mutual: "the clause runs one way instead of both",
  capped: "no cap applies to it",
  present: "the contract contains one at all",
  for_convenience: "no one but the client can end the contract early",
  unlimited: "revisions have no limit",
  client_only: "only the client can end the contract early",
};

/**
 * A rule's condition, in words, for the playbook screen.
 *
 * The alternative was rendering `firedTemplate` with its `{{value}}` placeholder still
 * in it, which is exactly what the screen showed before a screenshot caught it: internal
 * template markers in front of a customer.
 */
export function describeRule(rule: {
  comparator: RuleComparator;
  threshold: number | null;
  clauseType: ClauseType;
}): string {
  const clause = CLAUSE_LABELS[rule.clauseType].toLowerCase();
  const threshold = rule.threshold ?? rule.comparator.threshold ?? null;
  if (rule.comparator.op === "absent") {
    return `Fires when the contract has no ${clause} clause and one is expected for its type.`;
  }
  const field = rule.comparator.field;
  const phrase = field ? FIELD_LABELS[field] : null;
  if (!phrase) {
    return `Fires on the ${clause} clause when the playbook's condition is met.`;
  }
  return `Fires when ${phrase.replace("{t}", String(threshold ?? "—"))}.`;
}

/** The worst severity across a set of flags — how a clause row is chipped. */
export function worstSeverity(severities: Severity[]): Severity {
  return severities.reduce<Severity>(
    (worst, s) => (SEVERITY_RANK[s] > SEVERITY_RANK[worst] ? s : worst),
    "ok",
  );
}
