/**
 * src/lib/commissions.ts
 *
 * Per-deal commission math, rendered as lines rather than summarised: rate ×
 * price, each split named, the referral fee, the TC fee, and what is left. A
 * coordinator has to be able to check the arithmetic against a settlement
 * statement, so every step is a row.
 *
 * Money is integer cents throughout and every rate is basis points. There is no
 * float anywhere in this file — 2.5% of $438,000 in floating point is
 * $10,950.000000000002, and a settlement statement that disagrees with a
 * spreadsheet by a cent costs an afternoon. Rounding happens once per line, at
 * the point the line is produced.
 */

import { z } from "zod";

export interface CommissionSplit {
  label: string;
  bps: number;
}

export interface CommissionBasis {
  /** Gross commission rate on the sale price, in basis points (250 = 2.5%). */
  rateBps: number;
  /** How the gross is divided. Each share is bps OF THE GROSS, not of the price. */
  split: CommissionSplit[];
  /** Flat referral fee off the top, in cents. */
  referralFeeCents: number;
  /** The coordinator's flat fee, in cents. */
  tcFeeCents: number;
}

export const EMPTY_BASIS: CommissionBasis = {
  rateBps: 0,
  split: [],
  referralFeeCents: 0,
  tcFeeCents: 0,
};

const splitSchema = z.object({
  label: z.string().min(1).max(60),
  bps: z.number().int().min(0).max(10_000),
});

export const commissionSchema = z.object({
  rateBps: z.number().int().min(0).max(2_000),
  split: z.array(splitSchema).max(8).default([]),
  referralFeeCents: z.number().int().min(0).max(100_000_000).default(0),
  tcFeeCents: z.number().int().min(0).max(100_000_000).default(0),
});

/** Read a `deals.commission` jsonb column without trusting it. */
export function parseCommission(value: unknown): CommissionBasis {
  const parsed = commissionSchema.safeParse(value);
  if (!parsed.success) return EMPTY_BASIS;
  return parsed.data;
}

/* ------------------------------------------------------------------- lines */

export type LineKind = "gross" | "deduction" | "share" | "net" | "note";

export interface CommissionLine {
  label: string;
  detail: string;
  amountCents: number;
  kind: LineKind;
}

/** Round half-up on a non-negative product of cents × bps. */
function applyBps(cents: number, bps: number): number {
  return Math.round((cents * bps) / 10_000);
}

export function formatBps(bps: number): string {
  // 250 -> "2.5%", 300 -> "3%", 275 -> "2.75%"
  const pct = bps / 100;
  const text = pct.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${text}%`;
}

export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  const grouped = dollars.toLocaleString("en-US");
  return `${negative ? "−" : ""}$${grouped}.${rest}`;
}

/** Whole dollars, for headline sums. */
export function formatDollars(cents: number): string {
  const negative = cents < 0;
  const dollars = Math.round(Math.abs(cents) / 100);
  return `${negative ? "−" : ""}$${dollars.toLocaleString("en-US")}`;
}

/**
 * The per-deal lines. Order matters: gross, then what comes off the top, then
 * each named share of what remains, then the net to the house.
 */
export function commissionLines(
  priceCents: number | null,
  basis: CommissionBasis,
): CommissionLine[] {
  if (!priceCents || priceCents <= 0 || basis.rateBps <= 0) {
    return [
      {
        label: "Not enough to compute",
        detail: !priceCents
          ? "Add a sale price to see the commission math."
          : "Add a commission rate to see the math.",
        amountCents: 0,
        kind: "note",
      },
    ];
  }

  const gross = applyBps(priceCents, basis.rateBps);
  const lines: CommissionLine[] = [
    {
      label: "Gross commission",
      detail: `${formatBps(basis.rateBps)} of ${formatDollars(priceCents)}`,
      amountCents: gross,
      kind: "gross",
    },
  ];

  let remaining = gross;
  if (basis.referralFeeCents > 0) {
    const fee = Math.min(basis.referralFeeCents, remaining);
    lines.push({
      label: "Referral fee",
      detail: "Off the top, before splits",
      amountCents: -fee,
      kind: "deduction",
    });
    remaining -= fee;
  }
  if (basis.tcFeeCents > 0) {
    const fee = Math.min(basis.tcFeeCents, remaining);
    lines.push({
      label: "Transaction coordination fee",
      detail: "Off the top, before splits",
      amountCents: -fee,
      kind: "deduction",
    });
    remaining -= fee;
  }

  const afterDeductions = remaining;
  let allocated = 0;
  for (const share of basis.split) {
    const amount = applyBps(afterDeductions, share.bps);
    allocated += amount;
    lines.push({
      label: share.label,
      detail: `${formatBps(share.bps)} of ${formatDollars(afterDeductions)} after fees`,
      amountCents: amount,
      kind: "share",
    });
  }

  lines.push({
    label: basis.split.length > 0 ? "Remainder to the house" : "Net after fees",
    detail:
      basis.split.length > 0
        ? `${formatDollars(afterDeductions)} less every named share`
        : "Nothing split out yet",
    amountCents: afterDeductions - allocated,
    kind: "net",
  });

  return lines;
}

/** The single number the pipeline sums: gross less the off-the-top fees. */
export function netCommissionCents(
  priceCents: number | null,
  basis: CommissionBasis,
): number {
  if (!priceCents || priceCents <= 0 || basis.rateBps <= 0) return 0;
  const gross = applyBps(priceCents, basis.rateBps);
  return Math.max(0, gross - basis.referralFeeCents - basis.tcFeeCents);
}

export function grossCommissionCents(
  priceCents: number | null,
  basis: CommissionBasis,
): number {
  if (!priceCents || priceCents <= 0 || basis.rateBps <= 0) return 0;
  return applyBps(priceCents, basis.rateBps);
}

/** The sum of the named shares — what actually leaves for agents. */
export function splitTotalCents(priceCents: number | null, basis: CommissionBasis): number {
  const lines = commissionLines(priceCents, basis);
  return lines.filter((l) => l.kind === "share").reduce((sum, l) => sum + l.amountCents, 0);
}

/* ------------------------------------------------------- pipeline by month */

export interface PipelineDeal {
  id: string;
  address: string;
  status: string;
  closingDate: string | null;
  priceCents: number | null;
  commission: unknown;
}

export interface PipelineMonth {
  month: string;
  dealCount: number
  volumeCents: number;
  grossCents: number;
  netCents: number;
}

/**
 * Expected commission by month of expected close. Terminated files are dropped;
 * closed ones are kept, because "what did June actually pay" is the question a
 * coordinator asks on the 1st of July.
 */
export function pipelineByMonth(deals: readonly PipelineDeal[]): PipelineMonth[] {
  const byMonth = new Map<string, PipelineMonth>();
  for (const deal of deals) {
    if (deal.status === "terminated") continue;
    if (!deal.closingDate) continue;
    const month = deal.closingDate.slice(0, 7);
    const basis = parseCommission(deal.commission);
    const entry =
      byMonth.get(month) ??
      { month, dealCount: 0, volumeCents: 0, grossCents: 0, netCents: 0 };
    entry.dealCount += 1;
    entry.volumeCents += deal.priceCents ?? 0;
    entry.grossCents += grossCommissionCents(deal.priceCents, basis);
    entry.netCents += netCommissionCents(deal.priceCents, basis);
    byMonth.set(month, entry);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** Parse "438,000" / "$438,000.50" / "438000" into cents. Null when unusable. */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Parse "2.5" / "2.5%" into basis points. Null when unusable. */
export function parseRateToBps(input: string): number | null {
  const cleaned = input.replace(/[%\s]/g, "");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const bps = Math.round(Number(cleaned) * 100);
  return bps >= 0 && bps <= 2000 ? bps : null;
}
