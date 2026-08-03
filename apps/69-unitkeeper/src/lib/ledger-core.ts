/**
 * The ledger, as pure arithmetic. No database, no clock of its own.
 *
 * The ledger is append-only: a correction is a new `adjustment` row, never an
 * edit, because the lien packet prints these rows verbatim and a sale file that
 * has been tidied up is a sale file a lawyer can take apart.
 *
 * Sign convention, once, here: **charges are positive, money received is
 * negative.** Balance is the sum. A positive balance is what the tenant owes; a
 * negative balance is a credit the facility is holding.
 *
 * Two things this module gets right that a naive ledger gets wrong:
 *
 *  - A payment **cascades over the open charges oldest-first**. Paying $95
 *    against a $20 late fee from June and $75 of July rent clears both; it does
 *    not sit in a lump that leaves the tenant looking delinquent.
 *  - Delinquency is **derived from the allocation**, never from a stored status
 *    column. "How late is this tenant" is a question about today, and a column
 *    written by last night's cron answers a question about last night.
 */

import { compareDates, daysBetween, type IsoDate, type Period } from "@/lib/money";

export type EntryKind =
  | "rent"
  | "late_fee"
  | "lien_fee"
  | "payment"
  | "credit"
  | "refund"
  | "adjustment";

/** The subset of a ledger row the arithmetic needs. */
export interface CoreEntry {
  id: string;
  kind: EntryKind;
  amountCents: number;
  occurredOn: IsoDate;
  description: string;
  period?: string | null;
  /** Tie-break inside a single day, so the running balance is deterministic. */
  sequence?: number;
}

/**
 * Charges and money-received, separated by sign rather than by kind — an
 * `adjustment` can be either, and a `credit` written as a negative amount is
 * money the facility owes back.
 */
export function isCharge(entry: CoreEntry): boolean {
  return entry.amountCents > 0;
}

/**
 * Ledger order: by the day it happened, then by the order it was written. Never
 * by amount or kind — a ledger's job is to be a chronology.
 */
export function compareEntries(a: CoreEntry, b: CoreEntry): number {
  const byDate = compareDates(a.occurredOn, b.occurredOn);
  if (byDate !== 0) return byDate;
  const sa = a.sequence ?? 0;
  const sb = b.sequence ?? 0;
  if (sa !== sb) return sa - sb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortEntries(entries: readonly CoreEntry[]): CoreEntry[] {
  return [...entries].sort(compareEntries);
}

/** The balance after every entry, in ledger order. */
export function balanceOf(entries: readonly CoreEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amountCents, 0);
}

export interface RunningRow {
  entry: CoreEntry;
  balanceAfterCents: number;
}

export function withRunningBalance(entries: readonly CoreEntry[]): RunningRow[] {
  let balance = 0;
  return sortEntries(entries).map((entry) => {
    balance += entry.amountCents;
    return { entry, balanceAfterCents: balance };
  });
}

/* ------------------------------------------------------------ allocation --- */

export interface OpenCharge {
  entry: CoreEntry;
  chargedCents: number;
  paidCents: number;
  outstandingCents: number;
}

export interface Allocation {
  /** Every charge, oldest first, with how much of it is still open. */
  charges: OpenCharge[];
  /** Money received that no charge needed, i.e. what the facility is holding. */
  creditCents: number;
  /** The sum of everything still open. */
  outstandingCents: number;
}

/**
 * Walk the ledger in order, applying each receipt to the oldest charge that is
 * still open. Anything left over is credit, and credit is applied to later
 * charges as they arrive — which is what stops an overpaying tenant from
 * appearing delinquent the following month.
 */
export function allocate(entries: readonly CoreEntry[]): Allocation {
  const charges: OpenCharge[] = [];
  let credit = 0;

  for (const entry of sortEntries(entries)) {
    if (entry.amountCents > 0) {
      let remaining = entry.amountCents;
      // Credit on hand pays the new charge before the tenant is asked again.
      const fromCredit = Math.min(credit, remaining);
      credit -= fromCredit;
      remaining -= fromCredit;
      charges.push({
        entry,
        chargedCents: entry.amountCents,
        paidCents: fromCredit,
        outstandingCents: remaining,
      });
      continue;
    }

    let received = -entry.amountCents;
    for (const charge of charges) {
      if (received === 0) break;
      if (charge.outstandingCents === 0) continue;
      const applied = Math.min(charge.outstandingCents, received);
      charge.outstandingCents -= applied;
      charge.paidCents += applied;
      received -= applied;
    }
    credit += received;
  }

  return {
    charges,
    creditCents: credit,
    outstandingCents: charges.reduce((s, c) => s + c.outstandingCents, 0),
  };
}

/* ----------------------------------------------------------- delinquency --- */

export interface Delinquency {
  /** What is owed right now (never negative; a credit reports as zero owed). */
  outstandingCents: number;
  creditCents: number;
  /** The day the oldest still-open charge fell due, or null when square. */
  since: IsoDate | null;
  /** Whole days from `since` to `asOf`. 0 when square. */
  daysLate: number;
  /** The billing period of the oldest open charge — the ladder's cycle key. */
  cycleKey: Period | null;
}

/**
 * How late is this tenant, as of today. Derived, every time it is asked.
 *
 * `since` is the due date of the oldest charge with anything still open, so a
 * tenant who pays June and skips July is late from July's due date — not from
 * June's, and not from "the day the cron noticed".
 */
export function delinquency(entries: readonly CoreEntry[], asOf: IsoDate): Delinquency {
  const { charges, creditCents, outstandingCents } = allocate(entries);
  const oldestOpen = charges.find((c) => c.outstandingCents > 0 && c.entry.occurredOn <= asOf);
  if (!oldestOpen) {
    return {
      outstandingCents: Math.max(0, outstandingCents),
      creditCents,
      since: null,
      daysLate: 0,
      cycleKey: null,
    };
  }
  return {
    outstandingCents,
    creditCents,
    since: oldestOpen.entry.occurredOn,
    daysLate: Math.max(0, daysBetween(oldestOpen.entry.occurredOn, asOf)),
    cycleKey: oldestOpen.entry.period ?? oldestOpen.entry.occurredOn.slice(0, 7),
  };
}

/* ------------------------------------------------------------- statements --- */

export interface StatementRow {
  occurredOn: IsoDate;
  description: string;
  chargeCents: number | null;
  receiptCents: number | null;
  balanceAfterCents: number;
}

export interface Statement {
  from: IsoDate;
  to: IsoDate;
  openingBalanceCents: number;
  rows: StatementRow[];
  closingBalanceCents: number;
}

/**
 * A balance-forward statement: everything before `from` collapses into one
 * opening balance, then each row in the window with the balance after it. This is
 * the shape the PDF prints and the shape the lien packet appends.
 */
export function statement(
  entries: readonly CoreEntry[],
  from: IsoDate,
  to: IsoDate,
): Statement {
  const ordered = withRunningBalance(entries);
  let opening = 0;
  const rows: StatementRow[] = [];
  for (const { entry, balanceAfterCents } of ordered) {
    if (entry.occurredOn < from) {
      opening = balanceAfterCents;
      continue;
    }
    if (entry.occurredOn > to) break;
    rows.push({
      occurredOn: entry.occurredOn,
      description: entry.description,
      chargeCents: entry.amountCents > 0 ? entry.amountCents : null,
      receiptCents: entry.amountCents < 0 ? -entry.amountCents : null,
      balanceAfterCents,
    });
  }
  return {
    from,
    to,
    openingBalanceCents: opening,
    rows,
    closingBalanceCents: rows.length ? rows[rows.length - 1].balanceAfterCents : opening,
  };
}

/** Human label for a ledger kind — used in the UI and in every PDF. */
export function kindLabel(kind: EntryKind): string {
  switch (kind) {
    case "rent":
      return "Rent";
    case "late_fee":
      return "Late fee";
    case "lien_fee":
      return "Lien fee";
    case "payment":
      return "Payment";
    case "credit":
      return "Credit";
    case "refund":
      return "Refund";
    case "adjustment":
      return "Adjustment";
  }
}
