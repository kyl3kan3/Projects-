/**
 * src/lib/compliance.ts
 *
 * THE product: the deterministic compliance engine. Pure function —
 * newest reviewed certificate's coverages vs. the engagement's
 * requirement template:
 *   - each required line present?
 *   - limit >= minimum?
 *   - within effective window (today inside [effective, expires))?
 *   - AI / WOS satisfied where the template requires them?
 *   - certificate holder correct?
 * Verdict: compliant | deficient | expiring (inside 30d) | expired |
 * missing — with `deficiencies` as full sentences the UI renders
 * verbatim ("GL each-occurrence $500,000 is below the required
 * $1,000,000"). The sentence IS the product; test every one.
 *
 * TODO:
 * - [ ] evaluate(template, coverages, holderOk, today): pure.
 * - [ ] persistEvaluation(engagementId): fetch inputs, run, insert
 *       evaluations row; return verdict transitions for chase logic.
 * - [ ] blastRadius(templateId, draftLines): which engagements would
 *       flip verdicts if this edit saves (the preview).
 */

export interface Deficiency {
  line: string;
  reason: string;
}

export interface Verdict {
  status: "compliant" | "deficient" | "expiring" | "expired" | "missing";
  deficiencies: Deficiency[];
}

export function evaluate(
  template: { lines: Array<{ coverage: string; label: string; minCents: number }>; flags: Record<string, boolean> },
  coverages: Array<{
    kind: string;
    limitCents: number | null;
    effectiveOn: string | null;
    expiresOn: string | null;
    additionalInsured: boolean | null;
    waiverOfSubrogation: boolean | null;
  }>,
  holderOk: boolean | null,
  today: Date,
): Verdict {
  throw new Error("Not implemented");
}

export async function persistEvaluation(engagementId: string): Promise<Verdict> {
  throw new Error("Not implemented");
}
