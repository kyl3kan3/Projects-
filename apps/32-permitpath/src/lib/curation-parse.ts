/**
 * Parsing the curation console's textareas.
 *
 * A curator types fees and submittals as lines, because that is faster than a
 * dozen inputs when you have a fee schedule open in the other tab. Pure module —
 * it lives outside the "use server" file so it can be unit tested and so it is not
 * mistaken for an endpoint.
 */

import type { FeeLine, SubmittalRequirement } from "@/db/schema";

/** `Mechanical permit fee | 96.50` per line. Dollars in, integer cents stored. */
export function parseFeeLines(raw: string): { fees: FeeLine[]; error: string | null } {
  const fees: FeeLine[] = [];
  for (const line of raw.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [label, amount, notes] = line.split("|").map((p) => p.trim());
    if (!label || !amount) return { fees, error: `Could not read fee line: "${line}"` };
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars < 0) {
      return { fees, error: `"${amount}" is not an amount in dollars` };
    }
    fees.push({
      label,
      amountCents: Math.round(dollars * 100),
      ...(notes ? { notes } : {}),
    });
  }
  return { fees, error: null };
}

/** `Manual J load calculation | Required above 5 tons | conditional` per line. */
export function parseSubmittals(raw: string): {
  submittals: SubmittalRequirement[];
  error: string | null;
} {
  const submittals: SubmittalRequirement[] = [];
  for (const line of raw.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [title, detail, flag] = line.split("|").map((p) => p.trim());
    if (!title || !detail) return { submittals, error: `Could not read submittal line: "${line}"` };
    submittals.push({ title, detail, required: (flag ?? "required").toLowerCase() !== "conditional" });
  }
  return { submittals, error: null };
}
