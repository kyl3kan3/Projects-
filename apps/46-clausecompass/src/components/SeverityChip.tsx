/**
 * The severity chip: a 6px dot and a word, 28px tall. Never a filled banner, never a
 * siren, never an emoji — DESIGN.md is explicit that severity is a chip and a word.
 *
 * A server component with no state, so it can be used inside either tree.
 */

import type { Severity } from "@/db/schema";

const LABELS: Record<string, string> = {
  high: "High",
  caution: "Caution",
  ok: "OK",
  missing: "Missing",
};

export function SeverityChip({
  severity,
  missing = false,
}: {
  severity: Severity;
  /** A missing clause is chipped by its severity but labelled "Missing". */
  missing?: boolean;
}) {
  const key = missing ? "missing" : severity;
  return (
    <span className="chip" data-severity={missing ? "missing" : severity}>
      <span className="chip-dot" />
      {LABELS[key]}
    </span>
  );
}

/** The mono flag summary: `2 HIGH · 5 CAUTION · 19 OK`. */
export function FlagSummary({
  summary,
}: {
  summary: { high: number; caution: number; ok: number };
}) {
  return (
    <p className="t-data" style={{ color: "var(--color-text-2)" }}>
      <span style={{ color: summary.high > 0 ? "var(--color-oxblood)" : undefined }}>
        {summary.high} HIGH
      </span>
      {" · "}
      <span style={{ color: summary.caution > 0 ? "var(--color-amber-text)" : undefined }}>
        {summary.caution} CAUTION
      </span>
      {" · "}
      <span style={{ color: summary.ok > 0 ? "var(--color-sage)" : undefined }}>
        {summary.ok} OK
      </span>
    </p>
  );
}
