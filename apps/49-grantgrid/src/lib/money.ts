/**
 * Money is integer cents everywhere, rounded once, here, at the edge.
 *
 * Grant amounts are large and round — a $25,000 ask, a $7,500 award — and they
 * are read in mono tabular figures beside dates. Nothing in this app needs
 * sub-dollar precision, but everything needs the two numbers in a board report to
 * add up, which floats cannot promise.
 */

/** "$25,000" — the pipeline row and card format. Whole dollars. */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}

/** "$25,000.00" — used only where cents could exist (billing). */
export function formatCentsExact(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "$25k" / "$1.2M" — compact, for summary labels where space is tight. */
export function formatCentsCompact(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  const dollars = cents / 100;
  if (dollars >= 1_000_000) {
    const m = dollars / 1_000_000;
    return `$${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  if (dollars >= 1_000) {
    const k = dollars / 1_000;
    return `$${k % 1 === 0 ? k : k.toFixed(1)}k`;
  }
  return `$${Math.round(dollars).toLocaleString("en-US")}`;
}

/**
 * Parse a typed dollar amount into cents. Accepts "25,000", "$25,000", "25000",
 * "25k", "1.5m" — a hurried ED types all of these. Returns null for anything it
 * cannot read, so the caller can say "that isn't a number" instead of silently
 * storing zero.
 */
export function parseDollarsToCents(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!raw) return null;

  const suffix = /^(\d+(?:\.\d+)?)(k|m)$/.exec(raw);
  if (suffix) {
    const scale = suffix[2] === "k" ? 1_000 : 1_000_000;
    return Math.round(Number(suffix[1]) * scale * 100);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Sum a column of nullable cents without letting a null become a NaN. */
export function sumCents(values: (number | null | undefined)[]): number {
  return values.reduce<number>((total, v) => total + (v ?? 0), 0);
}
