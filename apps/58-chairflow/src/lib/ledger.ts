/**
 * src/lib/ledger.ts
 *
 * The protection ledger's arithmetic and its sentences, pure.
 *
 * The running "paid for itself" number is the one figure a stylist will check against
 * their bank, so the accounting is stated rather than implied. Each `charges` row
 * means exactly one thing:
 *
 *   `deposit`, status `charged`   — money taken at booking, going towards the service.
 *                                  Not protection: it bought a haircut.
 *   `deposit`, status `captured`  — the appointment did not happen and the deposit was
 *                                  kept under the policy. Protection.
 *   `no_show_fee` / `late_cancel_fee`, status `charged` — `amountCents` is the cash
 *                                  charged to the card on file, which is the fee
 *                                  *minus* whatever the deposit already covered.
 *                                  `depositAppliedCents` records that part, so the
 *                                  full fee is reconstructable without being counted
 *                                  twice.
 *   ...status `captured`          — the deposit covered the whole fee; no new cash.
 *   ...status `waived`            — the stylist chose grace. Shown, never hidden.
 *   ...status `failed`            — the card refused. Never counted as income.
 *   `refund`                      — deposit money beyond the fee, owed back and
 *                                  returned. Subtracted.
 *
 * So: **protected = fees charged + deposits kept − refunds**, and a $10 deposit on a
 * $22.50 no-show shows as one $10 deposit kept plus $12.50 charged, not $32.50.
 */

import { formatDayShort } from "@/lib/dates";
import { money, moneySigned } from "@/lib/format";

export type ChargeKind = "deposit" | "no_show_fee" | "late_cancel_fee" | "refund";
export type ChargeStatus =
  | "held"
  | "captured"
  | "charged"
  | "waived"
  | "refunded"
  | "failed"
  | "disputed";

export interface LedgerRow {
  id: string;
  kind: ChargeKind;
  status: ChargeStatus;
  /** Cash that moved on this row. For a fee, what the card was charged. */
  amountCents: number;
  /** For a fee row, how much of the fee the deposit already covered. */
  depositAppliedCents: number;
  policyVersion: number;
  /** The calendar day the policy was agreed, for the row's "per policy" clause. */
  policyAgreedOn: string;
  occurredOn: string;
  clientName: string;
  serviceName: string;
  failureReason: string | null;
  simulated: boolean;
}

export function isFee(kind: ChargeKind): boolean {
  return kind === "no_show_fee" || kind === "late_cancel_fee";
}

/** The full fee the policy named, whoever's money paid it. */
export function feeTotalCents(row: LedgerRow): number {
  return isFee(row.kind) ? row.amountCents + row.depositAppliedCents : row.amountCents;
}

export interface LedgerSummary {
  feesCollectedCents: number;
  depositsKeptCents: number;
  waivedCents: number;
  failedCents: number;
  refundedCents: number;
  protectedCents: number;
  feeCount: number;
  depositCount: number;
  waivedCount: number;
  failedCount: number;
}

const EMPTY: LedgerSummary = {
  feesCollectedCents: 0,
  depositsKeptCents: 0,
  waivedCents: 0,
  failedCents: 0,
  refundedCents: 0,
  protectedCents: 0,
  feeCount: 0,
  depositCount: 0,
  waivedCount: 0,
  failedCount: 0,
};

export function summarizeLedger(rows: LedgerRow[]): LedgerSummary {
  const out: LedgerSummary = { ...EMPTY };
  for (const row of rows) {
    if (isFee(row.kind)) {
      if (row.status === "charged" || row.status === "captured") {
        out.feesCollectedCents += row.amountCents;
        out.feeCount += 1;
      } else if (row.status === "waived") {
        out.waivedCents += feeTotalCents(row);
        out.waivedCount += 1;
      } else if (row.status === "failed" || row.status === "disputed") {
        out.failedCents += row.amountCents;
        out.failedCount += 1;
      }
    } else if (row.kind === "deposit" && row.status === "captured") {
      out.depositsKeptCents += row.amountCents;
      out.depositCount += 1;
    } else if (row.kind === "refund") {
      out.refundedCents += row.amountCents;
    }
  }
  out.protectedCents =
    out.feesCollectedCents + out.depositsKeptCents - out.refundedCents;
  return out;
}

export function ledgerKindLabel(kind: ChargeKind): string {
  switch (kind) {
    case "no_show_fee":
      return "no-show fee";
    case "late_cancel_fee":
      return "late-cancel fee";
    case "deposit":
      return "deposit kept";
    case "refund":
      return "deposit refund";
  }
}

/**
 * The product's most important sentence, typeset like a receipt:
 *
 *   "no-show fee · per policy agreed Jun 12 · +$22.50"
 *
 * When a deposit covered part of the fee the clause says so, because the alternative
 * is a stylist reading "+$12.50" against a 50% policy on a $45 cut and concluding the
 * arithmetic is broken.
 *
 * A waived row keeps its amount — struck through in the UI — and appends "waived", so
 * the record of what was forgiven survives. That is what makes the grace real rather
 * than a deletion.
 */
export function ledgerLine(row: LedgerRow): string {
  const parts = [ledgerKindLabel(row.kind), `per policy agreed ${formatDayShort(row.policyAgreedOn)}`];
  if (isFee(row.kind) && row.depositAppliedCents > 0) {
    parts.splice(1, 0, `deposit kept ${money(row.depositAppliedCents)}`);
  }
  if (row.status === "waived") {
    return `${parts.join(" · ")} · ${money(feeTotalCents(row))} waived`;
  }
  if (row.status === "failed" || row.status === "disputed") {
    return `${parts.join(" · ")} · ${money(row.amountCents)} declined`;
  }
  if (row.kind === "refund") {
    return `${parts.join(" · ")} · ${moneySigned(-row.amountCents)}`;
  }
  return `${parts.join(" · ")} · ${moneySigned(row.amountCents)}`;
}

/** "3 fees · 2 deposits kept · 1 waived" under the hero stat. */
export function summarySentence(summary: LedgerSummary): string {
  const parts: string[] = [];
  if (summary.feeCount > 0) {
    parts.push(`${summary.feeCount} ${summary.feeCount === 1 ? "fee" : "fees"}`);
  }
  if (summary.depositCount > 0) {
    parts.push(
      `${summary.depositCount} ${summary.depositCount === 1 ? "deposit" : "deposits"} kept`,
    );
  }
  if (summary.waivedCount > 0) parts.push(`${summary.waivedCount} waived`);
  if (summary.failedCount > 0) parts.push(`${summary.failedCount} declined`);
  if (parts.length === 0) return "Nothing to protect against yet this month.";
  return parts.join(" · ");
}

export type LedgerFilter = "all" | "fees" | "deposits" | "waived" | "failed";

export const LEDGER_FILTERS: Array<{ id: LedgerFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "fees", label: "Fees" },
  { id: "deposits", label: "Deposits" },
  { id: "waived", label: "Waived" },
  { id: "failed", label: "Failed" },
];

export function matchesFilter(row: LedgerRow, filter: LedgerFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "fees":
      return isFee(row.kind) && (row.status === "charged" || row.status === "captured");
    case "deposits":
      return row.kind === "deposit" || row.kind === "refund";
    case "waived":
      return row.status === "waived";
    case "failed":
      return row.status === "failed" || row.status === "disputed";
  }
}
