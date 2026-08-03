/**
 * src/lib/compliance.ts
 *
 * THE product: the deterministic compliance engine.
 *
 * `evaluate()` is a pure function of (requirement template, parsed coverages,
 * certificate holder, today). It returns a verdict and a list of deficiencies,
 * **each one a full sentence** that the UI renders verbatim and the deficiency
 * letter quotes without rewriting. The sentence is the product: a coordinator
 * forwards it to an agent and the agent knows exactly what to fix.
 *
 * This module imports nothing but types and formatters — no database, no env — so
 * a client component can render a verdict without pulling `postgres` into the
 * browser bundle. Everything that touches the database lives in lib/verdicts.ts.
 *
 * Two deliberate limits, stated rather than hidden:
 *
 *  - **Umbrella limits do not stack onto underlying lines.** A $4M umbrella does
 *    not make a $500k GL each-occurrence meet a $1M requirement here. Whether it
 *    does in a given contract is a legal reading, and guessing it would produce
 *    a confident wrong "compliant".
 *  - **Primary-and-non-contributory is recorded but not evaluated.** An ACORD 25
 *    has no checkbox for it; evidencing it needs the endorsement page, which is
 *    the M3 feature. The template editor says so where the flag is set.
 */

import { daysBetween, earliest, formatDate, isIsoDate, relativeDays } from "@/lib/dates";
import { COVERAGE_LABELS, formatCents } from "@/lib/format";
import type {
  CoverageKind,
  Deficiency,
  RequirementFlags,
  RequirementLine,
  VerdictStatus,
} from "@/db/schema";

/** How close to expiry a compliant certificate is called "expiring". */
export const EXPIRING_WINDOW_DAYS = 30;

/** The coverage facts the engine needs. A subset of the `coverages` row. */
export interface CoverageFacts {
  kind: CoverageKind;
  label?: string | null;
  limitCents: number | null;
  effectiveOn: string | null;
  expiresOn: string | null;
  additionalInsured: boolean | null;
  waiverOfSubrogation: boolean | null;
}

export interface HolderFacts {
  /** What the certificate says. */
  found: string | null;
  /** Whether it matches the org's required holder wording. */
  ok: boolean | null;
  /** What the org's contracts require it to say. */
  expected: string | null;
}

export interface TemplateFacts {
  lines: RequirementLine[];
  flags: RequirementFlags;
}

export interface EvaluateInput {
  template: TemplateFacts;
  /** Null when no certificate has cleared parsing for this vendor. */
  coverages: CoverageFacts[] | null;
  holder?: HolderFacts;
  /** Today as a calendar date, `YYYY-MM-DD`, in the org's time zone. */
  today: string;
  expiringWithinDays?: number;
}

export interface Verdict {
  status: VerdictStatus;
  deficiencies: Deficiency[];
  /** Soonest expiry across the required lines — the chase ladder's cycle key. */
  soonestExpiry: string | null;
  /** Whole days to `soonestExpiry`; negative once lapsed. */
  daysToExpiry: number | null;
}

const lineLabel = (line: RequirementLine): string =>
  line.label?.trim() || COVERAGE_LABELS[line.coverage] || COVERAGE_LABELS.other;

/**
 * Which coverage row evidences a required line. An ACORD can carry more than one
 * row of the same kind (a renewed policy listed beside the expiring one); the one
 * that expires latest is the one the vendor is relying on, and ties go to the
 * higher limit.
 */
function bestMatch(coverages: CoverageFacts[], kind: CoverageKind): CoverageFacts | null {
  const matches = coverages.filter((c) => c.kind === kind);
  if (!matches.length) return null;
  return matches.reduce((best, c) => {
    const a = c.expiresOn ?? "";
    const b = best.expiresOn ?? "";
    if (a !== b) return a > b ? c : best;
    return (c.limitCents ?? -1) > (best.limitCents ?? -1) ? c : best;
  });
}

/**
 * Where the AI / WOS flags are checked.
 *
 * On an ACORD 25 the additional-insured box lives on the policy row, and the row
 * the endorsement attaches to is general liability. So AI is checked on the GL
 * each-occurrence line when the template requires it, and otherwise on the first
 * required line — a template that requires only auto still gets its flag checked
 * rather than silently ignored. Waiver of subrogation is checked on GL and on
 * workers' compensation, the two lines contracts actually name.
 */
function flagTargets(lines: RequirementLine[]): {
  additionalInsured: RequirementLine[];
  waiverOfSubrogation: RequirementLine[];
} {
  const byKind = (kind: CoverageKind) => lines.filter((l) => l.coverage === kind);
  const gl = byKind("gl_each_occurrence");
  const wc = byKind("wc_each_accident");
  const first = lines.length ? [lines[0]] : [];
  return {
    additionalInsured: gl.length ? gl : first,
    waiverOfSubrogation: gl.length || wc.length ? [...gl, ...wc] : first,
  };
}

export function evaluate(input: EvaluateInput): Verdict {
  const { template, coverages, holder, today } = input;
  const window = input.expiringWithinDays ?? EXPIRING_WINDOW_DAYS;
  const deficiencies: Deficiency[] = [];

  if (coverages === null) {
    return {
      status: "missing",
      deficiencies: [
        {
          line: "Certificate",
          reason: "No certificate of insurance is on file for this engagement.",
        },
      ],
      soonestExpiry: null,
      daysToExpiry: null,
    };
  }

  const lines = template.lines ?? [];
  if (!lines.length) {
    // A template with no lines cannot fail anything. Say so rather than
    // pretending a vendor with no requirements is certified compliant.
    return {
      status: "deficient",
      deficiencies: [
        {
          line: "Requirements",
          reason:
            "This engagement's requirement template lists no coverage lines, so nothing can be checked. Add the required lines and minimum limits.",
        },
      ],
      soonestExpiry: null,
      daysToExpiry: null,
    };
  }

  let soonestExpiry: string | null = null;
  let anyExpired = false;

  for (const line of lines) {
    const label = lineLabel(line);
    const match = bestMatch(coverages, line.coverage);

    if (!match) {
      deficiencies.push({
        line: label,
        reason: `${label} is not evidenced on this certificate.`,
      });
      continue;
    }

    // --- limit ---
    if (match.limitCents == null) {
      deficiencies.push({
        line: label,
        reason: `${label} carries no limit on this certificate; ${formatCents(
          line.minCents,
        )} is required.`,
      });
    } else if (match.limitCents < line.minCents) {
      deficiencies.push({
        line: label,
        reason: `${label} ${formatCents(match.limitCents)} is below the required ${formatCents(
          line.minCents,
        )}.`,
      });
    }

    // --- window ---
    if (match.effectiveOn && isIsoDate(match.effectiveOn) && match.effectiveOn > today) {
      deficiencies.push({
        line: label,
        reason: `${label} does not take effect until ${formatDate(match.effectiveOn)}.`,
      });
    }

    if (!match.expiresOn || !isIsoDate(match.expiresOn)) {
      deficiencies.push({
        line: label,
        reason: `${label} carries no expiry date on this certificate.`,
      });
    } else {
      soonestExpiry = earliest(soonestExpiry, match.expiresOn);
      const days = daysBetween(today, match.expiresOn);
      if (days < 0) {
        anyExpired = true;
        deficiencies.push({
          line: label,
          reason: `${label} expired on ${formatDate(match.expiresOn)}, ${relativeDays(days)}.`,
        });
      }
    }
  }

  // --- flags ---
  const targets = flagTargets(lines);

  if (template.flags?.additionalInsured) {
    for (const line of targets.additionalInsured) {
      const label = lineLabel(line);
      const match = bestMatch(coverages, line.coverage);
      if (!match) continue; // already reported as not evidenced
      if (match.additionalInsured === null) {
        deficiencies.push({
          line: label,
          reason: `Additional-insured status is required and is not evidenced on the ${label} line.`,
        });
      } else if (match.additionalInsured === false) {
        deficiencies.push({
          line: label,
          reason: `${label} does not grant additional-insured status, which this engagement requires.`,
        });
      }
    }
  }

  if (template.flags?.waiverOfSubrogation) {
    for (const line of targets.waiverOfSubrogation) {
      const label = lineLabel(line);
      const match = bestMatch(coverages, line.coverage);
      if (!match) continue;
      if (match.waiverOfSubrogation === null) {
        deficiencies.push({
          line: label,
          reason: `A waiver of subrogation is required and is not evidenced on the ${label} line.`,
        });
      } else if (match.waiverOfSubrogation === false) {
        deficiencies.push({
          line: label,
          reason: `${label} does not include a waiver of subrogation, which this engagement requires.`,
        });
      }
    }
  }

  // --- holder ---
  if (holder) {
    if (holder.ok === false) {
      deficiencies.push({
        line: "Certificate holder",
        reason: holder.found
          ? `The certificate holder reads "${holder.found}", not ${
              holder.expected ?? "the entity named in the contract"
            }.`
          : `The certificate names no holder; it must name ${
              holder.expected ?? "the entity named in the contract"
            }.`,
      });
    } else if (holder.ok === null) {
      deficiencies.push({
        line: "Certificate holder",
        reason: "The certificate holder could not be read from the form and has not been confirmed.",
      });
    }
  }

  const daysToExpiry = soonestExpiry ? daysBetween(today, soonestExpiry) : null;

  let status: VerdictStatus;
  if (anyExpired) status = "expired";
  else if (deficiencies.length) status = "deficient";
  else if (daysToExpiry != null && daysToExpiry <= window) status = "expiring";
  else status = "compliant";

  return { status, deficiencies, soonestExpiry, daysToExpiry };
}

/* ------------------------------------------------------------- presentation */

export const STATUS_LABEL: Record<VerdictStatus, string> = {
  compliant: "Compliant",
  deficient: "Deficient",
  expiring: "Expiring",
  expired: "Expired",
  missing: "No certificate",
};

/**
 * Which palette role a verdict speaks in. `claim` red-brown for failed
 * compliance, `pending` brass for expiring, `seal` gold only for compliant —
 * DESIGN.md's colour law.
 */
export const STATUS_TONE: Record<VerdictStatus, "seal" | "claim" | "pending" | "dim"> = {
  compliant: "seal",
  deficient: "claim",
  expiring: "pending",
  expired: "claim",
  missing: "dim",
};

/** Does this verdict block a work order? The hold-harmless flag. */
export function blocksWork(status: VerdictStatus): boolean {
  return status === "deficient" || status === "expired" || status === "missing";
}

/** One line summarising a verdict, for a row that has no room for sentences. */
export function verdictSummary(v: Verdict): string {
  if (v.status === "compliant") {
    return v.soonestExpiry ? `Compliant through ${formatDate(v.soonestExpiry)}` : "Compliant";
  }
  if (v.status === "expiring") {
    return `Expires ${relativeDays(v.daysToExpiry ?? 0)} on ${formatDate(v.soonestExpiry)}`;
  }
  if (v.status === "missing") return "No certificate on file";
  const first = v.deficiencies[0]?.reason;
  const extra = v.deficiencies.length - 1;
  if (!first) return STATUS_LABEL[v.status];
  return extra > 0 ? `${first} (+${extra} more)` : first;
}
