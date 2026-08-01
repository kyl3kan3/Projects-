/**
 * Money. Integer cents, always.
 *
 * The two properties this file exists to guarantee:
 *
 *  - **Nothing is ever a float dollar.** Amounts arrive from CSV or an
 *    accounting API as text, are rounded once here at the edge, and stay
 *    integers from then on.
 *  - **A payment cascades across a client's open invoices, oldest first.**
 *    Applying one $12,400 wire to a single invoice and parking the rest as
 *    "credit" is arithmetically fine and practically ruinous: the client still
 *    shows three overdue invoices and keeps getting chased for money they have
 *    already sent. `cascade` is the fix, and it is a pure function so it can be
 *    tested without a database.
 */

/* -------------------------------------------------------------- rounding --- */

/**
 * Round to whole cents, halves away from zero (what an accountant means by
 * "round half up"), with a relative epsilon so binary noise like
 * 14.499999999999998 — which is really 14.5 — does not round down.
 */
export function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const nudged = abs + Math.max(abs, 1) * Number.EPSILON * 4;
  return sign * Math.floor(nudged + 0.5);
}

/**
 * Parse a human or CSV amount ("1,200.50", "$4,800", "(120.00)", "12 400")
 * into cents. Returns null for anything that is not a number — a silent zero in
 * an aging report is a bug that mis-states a firm's cash position.
 */
export function parseAmountToCents(input: string | number | null | undefined): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? roundCents(input * 100) : null;
  }
  let text = String(input ?? "").trim();
  if (!text) return null;
  let sign = 1;
  // Accounting parentheses mean negative.
  if (/^\(.*\)$/.test(text)) {
    sign = -1;
    text = text.slice(1, -1);
  }
  const cleaned = text.replace(/[\s,]/g, "").replace(/^[^\d.\-+]+/, "");
  if (!/^[-+]?\d*\.?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return sign * roundCents(value * 100);
}

/* ------------------------------------------------------------ formatting --- */

/** "$12,400.00" — the canonical money string. */
export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number(cents) || 0) / 100);
}

/** "$61,240" — hero figures drop a zero cents tail, keep a real one. */
export function formatMoneyShort(cents: number, currency = "USD"): string {
  const value = (Number(cents) || 0) / 100;
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/* --------------------------------------------------------------- cascade --- */

export interface CascadeTarget {
  invoiceId: string;
  balanceCents: number;
}

export interface CascadeAllocation {
  invoiceId: string;
  appliedCents: number;
}

export interface CascadeResult {
  allocations: CascadeAllocation[];
  appliedCents: number;
  /** Whatever the open invoices could not absorb — parks as client credit. */
  creditCents: number;
}

/**
 * Spread one payment across a client's open invoices in the order given (callers
 * pass them oldest due date first). Anything left over after every balance is
 * cleared becomes credit rather than a negative balance.
 */
export function cascade(
  targets: readonly CascadeTarget[],
  amountCents: number,
): CascadeResult {
  let remaining = Math.max(0, Math.round(amountCents) || 0);
  const allocations: CascadeAllocation[] = [];
  for (const target of targets) {
    if (remaining <= 0) break;
    const balance = Math.max(0, Math.round(target.balanceCents) || 0);
    const applied = Math.min(remaining, balance);
    if (applied <= 0) continue;
    allocations.push({ invoiceId: target.invoiceId, appliedCents: applied });
    remaining -= applied;
  }
  return {
    allocations,
    appliedCents: allocations.reduce((sum, a) => sum + a.appliedCents, 0),
    creditCents: remaining,
  };
}

/** Split `total` into `parts` whole-cent pieces that sum back exactly. */
export function splitCents(total: number, parts: number): number[] {
  const n = Math.max(1, Math.round(parts) || 1);
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** What is still owed. Never negative — an overpayment is credit, not a debt. */
export function balanceOf(amountCents: number, paidCents: number): number {
  return Math.max(0, (Number(amountCents) || 0) - (Number(paidCents) || 0));
}

/**
 * Clamp a portal payment amount to something payable: at least the firm's
 * partial floor (or the whole balance if that is smaller), at most the balance.
 * Returns null when the amount is unusable, so the portal can say why.
 */
export function clampPartialPayment(
  requestedCents: number,
  balanceCents: number,
  floorCents: number,
): { cents: number } | { error: string } {
  const balance = Math.max(0, Math.round(balanceCents) || 0);
  if (balance <= 0) return { error: "This invoice is already settled." };
  const requested = Math.round(requestedCents) || 0;
  if (requested <= 0) return { error: "Enter an amount to pay." };
  if (requested > balance) {
    return { error: `The most that can be paid on this invoice is ${formatMoney(balance)}.` };
  }
  const floor = Math.min(Math.max(0, Math.round(floorCents) || 0), balance);
  if (requested < floor) {
    return { error: `Part payments start at ${formatMoney(floor)}.` };
  }
  return { cents: requested };
}
