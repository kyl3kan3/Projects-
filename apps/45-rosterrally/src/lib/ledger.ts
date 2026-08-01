/**
 * Registration money, derived. Pure, integer cents, no database.
 *
 * Nothing about who has paid what is stored as a status column. It is computed
 * from `payment_allocations` every time it is read, because the alternative — a
 * cron that reconciles a stored flag — is how a registrar ends up looking at
 * "Unpaid" next to a family who paid in June.
 *
 * The rule that matters most: **a payment cascades across a household's open
 * registrations, oldest first.** A parent pays $370 for two children in one
 * checkout, or sends $185 with no note about which child it is for. Applying it
 * to one registration and parking the rest as "credit" is arithmetically
 * defensible and practically useless — the family still shows a balance, still
 * gets chased, and phones the volunteer registrar about it. Cascading is the
 * whole difference between books that reconcile and books that argue.
 */

import type { RegistrationStatus } from "@/db/schema";

/** What a registration looks like to the ledger. */
export interface LedgerRegistration {
  id: string;
  status: RegistrationStatus;
  /** The agreed price after discounts. */
  amountCents: number;
  /** Sum of signed allocations from settled payments (refunds are negative). */
  allocatedCents: number;
  createdAt: Date;
  /** True when the family is on a deposit + installments plan. */
  onPlan?: boolean;
}

/**
 * What this registration is actually asking for.
 *
 * Waitlisted children are never charged — a waitlist that takes money is a
 * waitlist nobody joins. Canceled registrations owe nothing, which is what makes
 * a refund (a negative allocation) settle to zero instead of re-opening a debt.
 */
export function owedCents(reg: Pick<LedgerRegistration, "status" | "amountCents">): number {
  if (reg.status === "waitlisted" || reg.status === "canceled") return 0;
  return Math.max(0, reg.amountCents);
}

/** Still to pay on this registration. Never negative — an overpayment is credit. */
export function balanceCents(reg: LedgerRegistration): number {
  return Math.max(0, owedCents(reg) - reg.allocatedCents);
}

/** Applied beyond what was owed — money that belongs back with the family. */
export function overpaidCents(reg: LedgerRegistration): number {
  return Math.max(0, reg.allocatedCents - owedCents(reg));
}

export type PaymentState =
  | "waitlisted"
  | "canceled"
  | "paid"
  | "plan"
  | "partial"
  | "unpaid";

/**
 * The single state a registration row shows, derived as-of-now.
 *
 * Precedence is deliberate: lifecycle first (a canceled registration is not
 * "unpaid"), then settled-in-full, then a live installment plan, then part-paid.
 */
export function deriveState(reg: LedgerRegistration): PaymentState {
  if (reg.status === "waitlisted") return "waitlisted";
  if (reg.status === "canceled") return "canceled";
  if (balanceCents(reg) === 0) return "paid";
  if (reg.onPlan) return "plan";
  return reg.allocatedCents > 0 ? "partial" : "unpaid";
}

export function stateLabel(state: PaymentState): string {
  switch (state) {
    case "waitlisted":
      return "WAITLIST";
    case "canceled":
      return "CANCELED";
    case "paid":
      return "PAID";
    case "plan":
      return "ON PLAN";
    case "partial":
      return "PART PAID";
    case "unpaid":
      return "UNPAID";
  }
}

/* ------------------------------------------------------------- cascading --- */

export interface CascadeTarget {
  registrationId: string;
  balanceCents: number;
}

export interface CascadeAllocation {
  registrationId: string;
  amountCents: number;
}

export interface CascadeResult {
  allocations: CascadeAllocation[];
  appliedCents: number;
  /** Anything left after every balance is cleared: the household's credit. */
  creditCents: number;
}

/**
 * Order a household's registrations the way money should be applied to them:
 * oldest first, ties broken by id so the result is stable across runs.
 */
export function cascadeOrder(regs: readonly LedgerRegistration[]): CascadeTarget[] {
  return [...regs]
    .filter((r) => balanceCents(r) > 0)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
    .map((r) => ({ registrationId: r.id, balanceCents: balanceCents(r) }));
}

export function cascade(targets: readonly CascadeTarget[], amountCents: number): CascadeResult {
  let remaining = Math.max(0, amountCents);
  const allocations: CascadeAllocation[] = [];
  for (const target of targets) {
    if (remaining <= 0) break;
    const applied = Math.min(remaining, Math.max(0, target.balanceCents));
    if (applied <= 0) continue;
    allocations.push({ registrationId: target.registrationId, amountCents: applied });
    remaining -= applied;
  }
  return {
    allocations,
    appliedCents: allocations.reduce((s, a) => s + a.amountCents, 0),
    creditCents: remaining,
  };
}

/* --------------------------------------------------------------- refunds --- */

/**
 * Which allocations to reverse when refunding `amountCents` on a registration.
 * Newest money comes back first: the family's most recent card charge is the one
 * their bank statement will show the credit against.
 */
export function refundPlan(
  allocations: readonly { id: string; paymentId: string; amountCents: number; at: Date }[],
  amountCents: number,
): { paymentId: string; amountCents: number }[] {
  let remaining = Math.max(0, amountCents);
  const out: { paymentId: string; amountCents: number }[] = [];
  const newestFirst = [...allocations]
    .filter((a) => a.amountCents > 0)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  for (const alloc of newestFirst) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, alloc.amountCents);
    out.push({ paymentId: alloc.paymentId, amountCents: take });
    remaining -= take;
  }
  return out;
}

/* ------------------------------------------------------------- household --- */

export interface HouseholdMoney {
  /** Sum of open balances across the household's registrations. */
  balanceCents: number;
  /** Cash received and not yet applied to anything. */
  creditCents: number;
  /** Balance after that credit is applied — what the family actually owes. */
  netDueCents: number;
  paidCents: number;
  refundedCents: number;
}

/**
 * A household's position.
 *
 * `netDueCents` is the number every parent-facing and registrar-facing surface
 * shows, because a family with $185 sitting in credit and a $185 balance is
 * square, and telling them otherwise is the exact bug the brief warns about.
 * `creditCents` is still surfaced separately so the treasurer can see the money
 * has arrived but not yet landed.
 */
export function householdMoney(
  regs: readonly LedgerRegistration[],
  payments: readonly { kind: "payment" | "refund"; status: string; amountCents: number }[],
  allocatedNetCents: number,
): HouseholdMoney {
  const balance = regs.reduce((s, r) => s + balanceCents(r), 0);
  const settled = payments.filter((p) => p.status === "settled");
  const paid = settled.filter((p) => p.kind === "payment").reduce((s, p) => s + p.amountCents, 0);
  const refunded = settled.filter((p) => p.kind === "refund").reduce((s, p) => s + p.amountCents, 0);
  const credit = Math.max(0, paid - refunded - allocatedNetCents);
  return {
    balanceCents: balance,
    creditCents: credit,
    netDueCents: Math.max(0, balance - credit),
    paidCents: paid,
    refundedCents: refunded,
  };
}

/* ----------------------------------------------------------- season roll-up --- */

export interface SeasonMoney {
  expectedCents: number;
  collectedCents: number;
  outstandingCents: number;
  platformFeeCents: number;
}

export function seasonMoney(
  regs: readonly (LedgerRegistration & { platformFeeCents: number })[],
): SeasonMoney {
  let expected = 0;
  let collected = 0;
  let fees = 0;
  for (const r of regs) {
    expected += owedCents(r);
    collected += Math.min(Math.max(0, r.allocatedCents), owedCents(r));
    if (balanceCents(r) === 0 && owedCents(r) > 0) fees += r.platformFeeCents;
  }
  return {
    expectedCents: expected,
    collectedCents: collected,
    outstandingCents: Math.max(0, expected - collected),
    platformFeeCents: fees,
  };
}
