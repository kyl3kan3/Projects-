/**
 * The rent ledger, as pure arithmetic.
 *
 * This file has no database, no clock, and no I/O: it takes charges and
 * payments in and returns allocations, statuses and a running balance. That is
 * deliberate — a landlord audits this against a bank statement, so every number
 * it produces has to be reproducible from the rows alone and testable with
 * hand-checked fixtures (see ledger-core.test.ts).
 *
 * Rules, in the order they matter:
 *
 * 1. Money is integer cents. No floats cross a function boundary.
 * 2. Only `succeeded` payments move the balance. ACH sits in `processing` for
 *    days; reporting it as paid would tell a landlord they have money they
 *    don't. It is surfaced separately, as in-flight.
 * 3. A payment attached to a charge pays that charge first. Anything left over
 *    spills into the general pool rather than disappearing.
 * 4. The pool pays the oldest debt first (deposit, then rent, then anything
 *    else, then late fees, on a given day) — the convention that keeps a
 *    tenant's oldest arrears from being outlived by a new late fee.
 * 5. A waived charge takes no allocation, and drops out of the balance.
 * 6. The statement's final running balance always equals
 *    `charged − paid`, which is `balanceCents − creditCents`. The test asserts
 *    it on every fixture; if that identity ever breaks, the ledger is wrong.
 */

import type { ChargeKind, ChargeStatus, PaymentMethod, PaymentStatus } from "@/db/schema";
import { compareDates, isoDateOf, type IsoDate, type Period } from "@/lib/money";

export interface LedgerCharge {
  id: string;
  kind: ChargeKind;
  amountCents: number;
  dueOn: IsoDate;
  period: Period | null;
  waived: boolean;
  memo?: string;
  prorated?: boolean;
  sourceChargeId?: string | null;
}

export interface LedgerPayment {
  id: string;
  chargeId: string | null;
  amountCents: number;
  method: PaymentMethod;
  status: PaymentStatus;
  /** Instant the money moved; only its calendar day is used for ordering. */
  paidAt: Date;
  reference?: string;
  feeCents?: number;
}

export interface ChargeState {
  charge: LedgerCharge;
  allocatedCents: number;
  outstandingCents: number;
  status: ChargeStatus;
}

export type LedgerLineKind = "charge" | "payment";

export interface LedgerLine {
  kind: LedgerLineKind;
  id: string;
  date: IsoDate;
  label: string;
  /** Positive for a charge, negative for a payment. */
  deltaCents: number;
  /** Balance owed after this line. */
  balanceCents: number;
  detail: string;
}

export interface Ledger {
  charges: ChargeState[];
  lines: LedgerLine[];
  /** Charged, excluding waived charges. */
  chargedCents: number;
  /** Payments that have actually settled. */
  paidCents: number;
  /** Owed right now (never negative). */
  balanceCents: number;
  /** Overpayment sitting unapplied (never negative). */
  creditCents: number;
  /** ACH authorised but not settled. Informational, not part of the balance. */
  processingCents: number;
  /** Oldest unpaid non-waived charge that is due, if any. */
  oldestDue: ChargeState | null;
}

/** Same-day ordering: the oldest obligation is paid before a fee accrued on it. */
const KIND_RANK: Record<ChargeKind, number> = {
  deposit: 0,
  rent: 1,
  other: 2,
  late_fee: 3,
};

function chargeOrder(a: LedgerCharge, b: LedgerCharge): number {
  const byDate = compareDates(a.dueOn, b.dueOn);
  if (byDate !== 0) return byDate;
  const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (byKind !== 0) return byKind;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function chargeLabel(charge: LedgerCharge): string {
  if (charge.memo) return charge.memo;
  switch (charge.kind) {
    case "rent":
      return charge.prorated ? "Rent (prorated)" : "Rent";
    case "late_fee":
      return "Late fee";
    case "deposit":
      return "Security deposit";
    default:
      return "Charge";
  }
}

export function methodLabel(method: PaymentMethod): string {
  switch (method) {
    case "ach":
      return "bank transfer";
    case "card":
      return "card";
    case "manual_zelle":
      return "Zelle";
    case "manual_cash":
      return "cash";
    case "manual_check":
      return "check";
  }
}

/**
 * Build the whole ledger for one tenancy.
 *
 * `asOf` decides only whether an unpaid charge reads as "due" or "upcoming" —
 * it never changes an amount.
 */
export function computeLedger(
  charges: readonly LedgerCharge[],
  payments: readonly LedgerPayment[],
  asOf: IsoDate = isoDateOf(new Date()),
): Ledger {
  const ordered = [...charges].sort(chargeOrder);

  const allocated = new Map<string, number>();
  for (const c of ordered) allocated.set(c.id, 0);

  const settled = payments.filter((p) => p.status === "succeeded");
  const processingCents = payments
    .filter((p) => p.status === "processing")
    .reduce((sum, p) => sum + p.amountCents, 0);

  const byId = new Map(ordered.map((c) => [c.id, c]));
  const capacity = (c: LedgerCharge) =>
    c.waived ? 0 : Math.max(0, c.amountCents - (allocated.get(c.id) ?? 0));

  // Pass 1 — targeted payments settle their own charge. Overpayment spills.
  let pool = 0;
  const paymentOrder = [...settled].sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
  for (const p of paymentOrder) {
    let remaining = p.amountCents;
    if (p.chargeId) {
      const target = byId.get(p.chargeId);
      if (target) {
        const take = Math.min(remaining, capacity(target));
        allocated.set(target.id, (allocated.get(target.id) ?? 0) + take);
        remaining -= take;
      }
    }
    pool += remaining;
  }

  // Pass 2 — the pool pays down the oldest open charge first.
  for (const c of ordered) {
    if (pool <= 0) break;
    const take = Math.min(pool, capacity(c));
    if (take > 0) {
      allocated.set(c.id, (allocated.get(c.id) ?? 0) + take);
      pool -= take;
    }
  }

  const states: ChargeState[] = ordered.map((charge) => {
    const alloc = allocated.get(charge.id) ?? 0;
    const outstanding = charge.waived ? 0 : Math.max(0, charge.amountCents - alloc);
    return { charge, allocatedCents: alloc, outstandingCents: outstanding, status: statusOf(charge, alloc, asOf) };
  });

  const chargedCents = ordered.reduce((s, c) => (c.waived ? s : s + c.amountCents), 0);
  const paidCents = settled.reduce((s, p) => s + p.amountCents, 0);
  const net = chargedCents - paidCents;

  const oldestDue =
    states.find((s) => s.outstandingCents > 0 && compareDates(s.charge.dueOn, asOf) <= 0) ?? null;

  return {
    charges: states,
    lines: statement(ordered, settled),
    chargedCents,
    paidCents,
    balanceCents: Math.max(0, net),
    creditCents: Math.max(0, -net),
    processingCents,
    oldestDue,
  };
}

function statusOf(charge: LedgerCharge, allocatedCents: number, asOf: IsoDate): ChargeStatus {
  if (charge.waived) return "waived";
  if (allocatedCents >= charge.amountCents) return "paid";
  if (allocatedCents > 0) return "partial";
  return compareDates(charge.dueOn, asOf) <= 0 ? "due" : "upcoming";
}

/**
 * The statement a landlord reconciles against their bank: every charge and every
 * settled payment, in date order, with a running balance. Waived charges appear
 * at zero so the record shows the waiver rather than hiding it.
 */
function statement(charges: readonly LedgerCharge[], settled: readonly LedgerPayment[]): LedgerLine[] {
  type Entry = { date: IsoDate; rank: number; line: Omit<LedgerLine, "balanceCents"> };
  const entries: Entry[] = [];

  for (const c of charges) {
    entries.push({
      date: c.dueOn,
      rank: 0,
      line: {
        kind: "charge",
        id: c.id,
        date: c.dueOn,
        label: chargeLabel(c),
        deltaCents: c.waived ? 0 : c.amountCents,
        detail: c.waived ? `waived · ${formatCentsPlain(c.amountCents)}` : c.period ?? "",
      },
    });
  }

  for (const p of settled) {
    const date = isoDateOf(p.paidAt);
    entries.push({
      date,
      rank: 1,
      line: {
        kind: "payment",
        id: p.id,
        date,
        label: `Payment · ${methodLabel(p.method)}`,
        deltaCents: -p.amountCents,
        detail: p.reference ?? "",
      },
    });
  }

  entries.sort((a, b) => {
    const byDate = compareDates(a.date, b.date);
    if (byDate !== 0) return byDate;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.line.id < b.line.id ? -1 : 1;
  });

  let balance = 0;
  return entries.map((e) => {
    balance += e.line.deltaCents;
    return { ...e.line, balanceCents: balance };
  });
}

function formatCentsPlain(cents: number): string {
  return `${(cents / 100).toFixed(2)}`;
}

/* ------------------------------------------------------------- late fees --- */

export interface LateFeeRuleInput {
  graceDays: number;
  kind: "flat" | "percent";
  /** flat: cents. percent: basis points (500 = 5%). */
  amount: number;
  maxPerMonthCents: number | null;
  enabled: boolean;
}

/**
 * The fee for a rent charge that is still unpaid after its grace period.
 *
 * A percentage is taken on what is *still owed*, not on the full rent: a tenant
 * who paid all but $50 owes a fee on $50. Flat fees are flat. The rule's monthly
 * cap always wins, and the answer is never negative.
 */
export function lateFeeAmount(rule: LateFeeRuleInput, outstandingCents: number): number {
  if (outstandingCents <= 0) return 0;
  const raw =
    rule.kind === "flat"
      ? Math.trunc(rule.amount)
      : Math.round((outstandingCents * Math.trunc(rule.amount)) / 10_000);
  const capped = rule.maxPerMonthCents == null ? raw : Math.min(raw, rule.maxPerMonthCents);
  return Math.max(0, capped);
}

/** The first day a fee may be charged: the day after grace runs out. */
export function lateFeeEarliestDate(dueOn: IsoDate, graceDays: number): IsoDate {
  const d = new Date(`${dueOn}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.trunc(graceDays)) + 1);
  return isoDateOf(d);
}

export interface LateFeeAssessment {
  sourceChargeId: string;
  amountCents: number;
  dueOn: IsoDate;
  memo: string;
}

/**
 * Should a late fee be charged against this rent charge today? Returns null
 * whenever the answer is no, which includes: the rule is off, the charge is not
 * rent, it is paid or waived, grace has not expired, or the computed fee is
 * zero. Assessing twice is prevented by a unique index on the fee's source
 * charge, not by this function.
 */
export function assessLateFee(
  rule: LateFeeRuleInput,
  state: ChargeState,
  asOf: IsoDate,
): LateFeeAssessment | null {
  if (!rule.enabled) return null;
  if (state.charge.kind !== "rent") return null;
  if (state.charge.waived) return null;
  if (state.outstandingCents <= 0) return null;
  const earliest = lateFeeEarliestDate(state.charge.dueOn, rule.graceDays);
  if (compareDates(asOf, earliest) < 0) return null;
  const amountCents = lateFeeAmount(rule, state.outstandingCents);
  if (amountCents <= 0) return null;
  return {
    sourceChargeId: state.charge.id,
    amountCents,
    dueOn: asOf,
    memo: `Late fee · ${state.charge.period ?? state.charge.dueOn}`,
  };
}

export function describeLateFeeRule(rule: LateFeeRuleInput): string {
  if (!rule.enabled) return "No late fee";
  const base =
    rule.kind === "flat"
      ? `$${(rule.amount / 100).toFixed(2)} flat`
      : `${(rule.amount / 100).toFixed(2)}% of the unpaid rent`;
  const cap = rule.maxPerMonthCents ? `, capped at $${(rule.maxPerMonthCents / 100).toFixed(2)}` : "";
  return `${base} after ${rule.graceDays} grace day${rule.graceDays === 1 ? "" : "s"}${cap}`;
}

/* ----------------------------------------------------------- ledger strip --- */

export type StripStatus = ChargeStatus | "none";

export interface StripCell {
  period: Period;
  month: number;
  status: StripStatus;
  amountCents: number;
  outstandingCents: number;
  lateDays: number;
}

/**
 * The 12-cell year strip from DESIGN.md. One cell per calendar month, built
 * from that month's rent charge (late fees ride along in the balance, not in the
 * strip — the strip answers "was the rent paid?").
 */
export function ledgerStrip(ledger: Ledger, year: number, asOf: IsoDate): StripCell[] {
  const cells: StripCell[] = [];
  for (let month = 1; month <= 12; month++) {
    const period = `${year}-${String(month).padStart(2, "0")}`;
    const state = ledger.charges.find(
      (s) => s.charge.kind === "rent" && s.charge.period === period,
    );
    if (!state) {
      cells.push({ period, month, status: "none", amountCents: 0, outstandingCents: 0, lateDays: 0 });
      continue;
    }
    const lateDays =
      state.outstandingCents > 0 && compareDates(state.charge.dueOn, asOf) < 0
        ? Math.round(
            (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${state.charge.dueOn}T00:00:00Z`)) /
              86_400_000,
          )
        : 0;
    cells.push({
      period,
      month,
      status: state.status,
      amountCents: state.charge.amountCents,
      outstandingCents: state.outstandingCents,
      lateDays,
    });
  }
  return cells;
}

/** Collected this period across a portfolio: the hero stat on the home screen. */
export function collectedForPeriod(
  ledgers: readonly Ledger[],
  period: Period,
): { collectedCents: number; billedCents: number } {
  let collectedCents = 0;
  let billedCents = 0;
  for (const ledger of ledgers) {
    for (const s of ledger.charges) {
      if (s.charge.period !== period) continue;
      if (s.charge.waived) continue;
      billedCents += s.charge.amountCents;
      collectedCents += s.allocatedCents;
    }
  }
  return { collectedCents, billedCents };
}
