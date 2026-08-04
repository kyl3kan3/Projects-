/**
 * src/lib/claims-core.ts
 *
 * Damage claim arithmetic, with no database and no Stripe in it.
 *
 * Two rules the whole damage flow rests on:
 *
 *  1. **Stripe allows exactly one capture per PaymentIntent.** So the yard does
 *     not capture per claim — it settles the order once, for the sum of the
 *     claims it decided to charge, and Stripe releases the remainder of the
 *     authorisation automatically. A design that captured per claim would work
 *     for the first claim and fail for the second, in production, on a Monday.
 *  2. **A capture can never exceed the authorised amount.** If the claims add up
 *     to more than the hold, the hold is captured in full and the shortfall is
 *     reported as something to invoice separately. Silently capturing less than
 *     the claim total, or pretending the whole claim was collected, are both
 *     lies the customer eventually finds.
 */

export interface ClaimLike {
  id: string;
  amountCents: number;
  status: "draft" | "charged" | "waived" | "disputed";
}

export interface Settlement {
  /** Claim ids that will be charged in this settlement. */
  chargeIds: string[];
  /** What the claims add up to. */
  claimedCents: number;
  /** What will actually be captured — never more than the hold. */
  captureCents: number;
  /** Claimed minus captured: real money the yard has to invoice for. */
  shortfallCents: number;
  /** The hold amount released back to the customer. */
  releasedCents: number;
  /** True when there is nothing to capture and the hold should simply be cancelled. */
  releaseOnly: boolean;
}

/**
 * Work out one settlement from the claims on an order and the size of the hold.
 * Only `draft` claims settle: `waived` ones were forgiven, `charged` ones already
 * went through, `disputed` ones are waiting on a human.
 */
export function planSettlement(
  claims: readonly ClaimLike[],
  depositCents: number,
): Settlement {
  const chargeable = claims.filter((c) => c.status === "draft" && c.amountCents > 0);
  const claimedCents = chargeable.reduce((sum, c) => sum + Math.trunc(c.amountCents), 0);
  const hold = Math.max(0, Math.trunc(depositCents));
  const captureCents = Math.min(claimedCents, hold);
  return {
    chargeIds: chargeable.map((c) => c.id),
    claimedCents,
    captureCents,
    shortfallCents: Math.max(0, claimedCents - hold),
    releasedCents: Math.max(0, hold - captureCents),
    releaseOnly: captureCents === 0,
  };
}

export interface DamageFeeOption {
  label: string;
  amountCents: number;
}

/**
 * The fee schedule offered when drafting a claim on a line: the item's own
 * schedule, then the account defaults it does not already cover, then
 * replacement cost, which is always available because a missing item has no
 * other price.
 */
export function feeOptions(
  itemFees: readonly DamageFeeOption[],
  accountDefaults: readonly DamageFeeOption[],
  replacementCents: number | null,
): DamageFeeOption[] {
  const out: DamageFeeOption[] = [];
  const seen = new Set<string>();
  for (const fee of [...itemFees, ...accountDefaults]) {
    const key = fee.label.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ label: fee.label.trim(), amountCents: Math.max(0, Math.trunc(fee.amountCents)) });
  }
  if (replacementCents && replacementCents > 0 && !seen.has("replacement")) {
    out.push({ label: "Replacement", amountCents: Math.trunc(replacementCents) });
  }
  return out;
}

/**
 * What a check-in implies before anybody types a price: missing units are billed
 * at replacement cost, damaged units get the schedule's first entry as a starting
 * point, and both are drafts a person confirms. Nothing here charges anything.
 */
export function draftsFromCheck(
  check: { quantityDamaged: number; quantityMissing: number },
  item: { name: string; replacementCents: number | null; damageFees: readonly DamageFeeOption[] },
): Array<{ kind: "damage" | "missing"; description: string; amountCents: number }> {
  const drafts: Array<{ kind: "damage" | "missing"; description: string; amountCents: number }> = [];

  if (check.quantityMissing > 0) {
    const unit = item.replacementCents ?? 0;
    drafts.push({
      kind: "missing",
      description: `${check.quantityMissing} × ${item.name} did not come back — billed at replacement cost.`,
      amountCents: unit * check.quantityMissing,
    });
  }

  if (check.quantityDamaged > 0) {
    const fee = item.damageFees[0];
    const unit = fee ? fee.amountCents : (item.replacementCents ?? 0);
    drafts.push({
      kind: "damage",
      description: fee
        ? `${check.quantityDamaged} × ${item.name} — ${fee.label}.`
        : `${check.quantityDamaged} × ${item.name} came back damaged.`,
      amountCents: unit * check.quantityDamaged,
    });
  }

  return drafts;
}

/** The claim total on an order, by status — for the order header and the customer's history. */
export function claimTotals(claims: readonly ClaimLike[]): {
  draftCents: number;
  chargedCents: number;
  waivedCents: number;
  disputedCents: number;
} {
  const sum = (status: ClaimLike["status"]) =>
    claims.filter((c) => c.status === status).reduce((t, c) => t + Math.trunc(c.amountCents), 0);
  return {
    draftCents: sum("draft"),
    chargedCents: sum("charged"),
    waivedCents: sum("waived"),
    disputedCents: sum("disputed"),
  };
}
