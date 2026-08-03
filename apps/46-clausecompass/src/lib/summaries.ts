/**
 * src/lib/summaries.ts
 *
 * One-line summaries of a clause, built from its extracted fields — the `text-3` line
 * under a clause row in the map.
 *
 * Pure and dependency-free so client components can call it. Every string here is
 * descriptive: it says what the clause does, never what to do about it.
 */

import type { ClauseType } from "@/db/schema";

function n(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function clauseSummary(clauseType: ClauseType, fields: Record<string, unknown>): string {
  switch (clauseType) {
    case "payment_terms": {
      const days = n(fields.payment_days);
      const deposit = n(fields.deposit_pct);
      const parts = [days === null ? "No stated due date" : `Net-${days} from invoice`];
      if (deposit !== null) parts.push(`${deposit}% deposit`);
      if (fields.milestone_based === true) parts.push("milestone billing");
      return parts.join(" · ");
    }
    case "ip_assignment": {
      const on = String(fields.assigns_on ?? "unclear");
      const label =
        on === "payment"
          ? "Rights transfer on payment"
          : on === "creation"
            ? "Rights transfer on creation"
            : on === "delivery"
              ? "Rights transfer on delivery"
              : on === "execution"
                ? "Rights transfer on signature"
                : "Transfer point not stated";
      const extra: string[] = [];
      if (fields.work_for_hire === true) extra.push("work made for hire");
      if (fields.portfolio_rights === true) extra.push("portfolio use kept");
      if (fields.moral_rights_waived === true) extra.push("moral rights waived");
      return [label, ...extra].join(" · ");
    }
    case "indemnity":
      return [
        fields.mutual === true ? "Mutual" : "One-way, from you",
        fields.capped === true ? "capped" : "no cap referenced",
      ].join(" · ");
    case "non_compete": {
      const months = n(fields.months);
      const geo = typeof fields.geography === "string" ? fields.geography : null;
      return [months === null ? "Restriction present" : `${months} months after the job`, geo]
        .filter(Boolean)
        .join(" · ");
    }
    case "auto_renewal": {
      const notice = n(fields.notice_days);
      const term = n(fields.renewal_term_months);
      return [
        term === null ? "Renews automatically" : `Renews for ${term} months`,
        notice === null ? "notice window not stated" : `${notice}-day notice window`,
      ].join(" · ");
    }
    case "termination": {
      const notice = n(fields.notice_days);
      const who = fields.for_convenience === true ? "Either side can end early" : "Client-side exit only";
      return [who, notice === null ? null : `${notice} days' notice`].filter(Boolean).join(" · ");
    }
    case "liability_cap": {
      const basis = String(fields.cap_basis ?? "none");
      const cents = n(fields.cap_amount_cents);
      const label =
        basis === "fees"
          ? "Capped at fees paid"
          : basis === "amount" && cents !== null
            ? `Capped at $${(cents / 100).toLocaleString("en-US")}`
            : basis === "multiple"
              ? `Capped at ${n(fields.cap_multiple) ?? "a multiple of"}× fees`
              : "No monetary cap stated";
      return [label, fields.excludes_consequential === true ? "excludes indirect loss" : null]
        .filter(Boolean)
        .join(" · ");
    }
    case "confidentiality": {
      const years = n(fields.years);
      return [
        fields.mutual === true ? "Mutual" : "One-way, from you",
        fields.perpetual === true ? "perpetual" : years === null ? null : `${years} years`,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "warranties":
      return fields.disclaimed === true
        ? "Warranties disclaimed"
        : fields.performance_warranty === true
          ? "You warrant the work"
          : "Warranty terms stated";
    case "governing_law": {
      const j = typeof fields.jurisdiction === "string" ? fields.jurisdiction : null;
      return [j ? `${j} law` : "Jurisdiction stated", fields.arbitration === true ? "arbitration" : null]
        .filter(Boolean)
        .join(" · ");
    }
    case "late_fees": {
      const rate = n(fields.rate_pct_monthly);
      return rate === null ? "Late payment addressed" : `${rate}% per month on overdue amounts`;
    }
    case "scope_revisions": {
      const rounds = n(fields.rounds);
      return fields.unlimited === true
        ? "Revisions until the client accepts"
        : rounds === null
          ? "Revision process stated"
          : `${rounds} rounds included`;
    }
    case "boilerplate":
      return "General provisions";
    default:
      return "Clause recorded";
  }
}

/** The disposition label used by the coverage list. */
export const DISPOSITION_LABELS: Record<string, string> = {
  clause: "Analyzed",
  boilerplate: "Boilerplate",
  not_analyzed: "Not analyzed",
};
