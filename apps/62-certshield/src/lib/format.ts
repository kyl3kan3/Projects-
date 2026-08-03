/**
 * src/lib/format.ts
 *
 * Money and label formatting.
 *
 * Every limit in this product is **integer cents**. Coverage limits are large
 * round numbers ($1,000,000) that a float would render as $999,999.99 often
 * enough to matter, and a deficiency sentence that misquotes a limit by a cent is
 * a sentence an insurance agent will use to dismiss the whole tool. Rounding
 * happens once, at the edge — here.
 */

import type { CoverageKind } from "@/db/schema";

/** 100000000 → "$1,000,000". Cents shown only when they are not zero. */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  const negative = cents < 0;
  const abs = Math.round(Math.abs(cents));
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  const body = dollars.toLocaleString("en-US");
  const tail = rest === 0 ? "" : `.${String(rest).padStart(2, "0")}`;
  return `${negative ? "-" : ""}$${body}${tail}`;
}

/**
 * Parse a limit as a human types it on a requirement line or an ACORD form:
 * "1,000,000", "$1M", "2m", "500k", "1000000.00". Returns integer cents, or null
 * when the string carries no number at all.
 */
export function parseLimitToCents(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const text = String(raw).trim().toLowerCase();
  if (!text) return null;
  const m = /^\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(k|m|mm)?$/.exec(text);
  if (!m) return null;
  const digits = m[1].replace(/,/g, "");
  let value = Number(digits);
  if (!Number.isFinite(value)) return null;
  const suffix = m[2];
  if (suffix === "k") value *= 1_000;
  else if (suffix === "m" || suffix === "mm") value *= 1_000_000;
  return Math.round(value * 100);
}

/** The canonical label for a coverage kind, used when a template omits one. */
export const COVERAGE_LABELS: Record<CoverageKind, string> = {
  gl_each_occurrence: "General liability — each occurrence",
  gl_aggregate: "General liability — general aggregate",
  auto_combined: "Automobile liability — combined single limit",
  umbrella_each: "Umbrella / excess liability — each occurrence",
  wc_each_accident: "Workers' compensation — each accident",
  other: "Other coverage",
};

/** The short form, for table headers and placards. */
export const COVERAGE_SHORT: Record<CoverageKind, string> = {
  gl_each_occurrence: "GL each occurrence",
  gl_aggregate: "GL aggregate",
  auto_combined: "Auto combined",
  umbrella_each: "Umbrella each",
  wc_each_accident: "WC each accident",
  other: "Other",
};

export const COVERAGE_KINDS: CoverageKind[] = [
  "gl_each_occurrence",
  "gl_aggregate",
  "auto_combined",
  "umbrella_each",
  "wc_each_accident",
  "other",
];

export function coverageLabel(kind: CoverageKind, fallback?: string | null): string {
  return fallback?.trim() || COVERAGE_LABELS[kind] || COVERAGE_LABELS.other;
}

/** Truncate for a single-line cell without cutting mid-word when avoidable. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}

/** Sentence-case a plan or status id for display. */
export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
