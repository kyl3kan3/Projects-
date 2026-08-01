/**
 * Registration pricing. Pure, integer cents, no database.
 *
 * A family registering three children on a phone gets one fee summary, and every
 * line of it has to be checkable by hand. So the order of operations is fixed and
 * documented rather than emergent:
 *
 *   1. The division's fee at this moment (never re-priced later).
 *   2. Early bird, if the registration lands on or before the window's last day.
 *   3. Sibling discount, on the 2nd and each subsequent child in the cart. The
 *      cart is ordered by fee descending first, so the discount always lands on
 *      the cheaper children and the family's total is the same regardless of the
 *      order the parent happened to type the names in. (Determinism matters more
 *      than which child is nominally "first" — a total that changes when you go
 *      back and edit a name is a support ticket.)
 *   4. A scholarship code, on what is left.
 *
 * Each step is capped at the running subtotal, so no combination of generous
 * settings can produce a negative fee. Our own $1.50 rides only on registrations
 * that actually cost money, on per-registration-plan clubs, and never on a
 * scholarship — stated in README's pricing table, enforced here.
 */

import type { AppliedDiscount, EarlyBird, ScholarshipCode, SeasonSettings, Plan } from "@/db/schema";
import { basisPoints } from "@/lib/money";
import type { IsoDate } from "@/lib/time";

export interface PriceInput {
  feeCents: number;
  earlyBird: EarlyBird | null;
  siblingDiscountBps: number;
  siblingDiscountFlatCents: number;
  /** 0 for the first child in the cart, 1 for the second, and so on. */
  siblingIndex: number;
  scholarship: ScholarshipCode | null;
  asOf: IsoDate;
  plan: Plan;
  applicationFeeCents: number;
}

export interface PricedRegistration {
  feeCents: number;
  discounts: AppliedDiscount[];
  amountCents: number;
  platformFeeCents: number;
}

function take(subtotal: number, amount: number): number {
  return Math.max(0, Math.min(subtotal, amount));
}

export function priceRegistration(input: PriceInput): PricedRegistration {
  const fee = Math.max(0, Math.round(input.feeCents));
  let subtotal = fee;
  const discounts: AppliedDiscount[] = [];

  const eb = input.earlyBird;
  if (eb && (eb.percentBps > 0 || eb.flatCents > 0) && (!eb.endsOn || input.asOf <= eb.endsOn)) {
    const amount = take(subtotal, basisPoints(subtotal, eb.percentBps) + eb.flatCents);
    if (amount > 0) {
      discounts.push({
        kind: "early_bird",
        label: eb.endsOn ? `Early bird (through ${eb.endsOn})` : "Early bird",
        amountCents: amount,
      });
      subtotal -= amount;
    }
  }

  if (input.siblingIndex > 0) {
    const amount = take(
      subtotal,
      basisPoints(subtotal, input.siblingDiscountBps) + input.siblingDiscountFlatCents,
    );
    if (amount > 0) {
      discounts.push({
        kind: "sibling",
        label: `Sibling discount (child ${input.siblingIndex + 1})`,
        amountCents: amount,
      });
      subtotal -= amount;
    }
  }

  let scholarshipApplied = false;
  const code = input.scholarship;
  if (code && (code.percentBps > 0 || code.flatCents > 0)) {
    const amount = take(subtotal, basisPoints(subtotal, code.percentBps) + code.flatCents);
    if (amount > 0) {
      discounts.push({
        kind: "scholarship",
        label: code.label || `Scholarship ${code.code}`,
        amountCents: amount,
        code: code.code,
      });
      subtotal -= amount;
      scholarshipApplied = true;
    }
  }

  const amountCents = subtotal;
  const platformFeeCents =
    input.plan === "flat" || scholarshipApplied || amountCents === 0
      ? 0
      : Math.max(0, input.applicationFeeCents);

  return { feeCents: fee, discounts, amountCents, platformFeeCents };
}

export interface CartItem {
  /** Whatever the caller uses to identify the child; passed straight back. */
  ref: string;
  divisionId: string;
  divisionName: string;
  playerName: string;
  feeCents: number;
  earlyBird: EarlyBird | null;
  /** True when this child goes on the waitlist: priced at zero, charged nothing. */
  waitlisted: boolean;
}

export interface CartLine extends PricedRegistration {
  ref: string;
  divisionId: string;
  divisionName: string;
  playerName: string;
  waitlisted: boolean;
  /**
   * What the card is charged for this child now. Zero for a waitlisted child —
   * a waitlist that takes money is a waitlist nobody joins — while
   * `amountCents` still holds the price the family will owe if a spot opens, so
   * promotion never has to re-price a season-old registration.
   */
  chargeableCents: number;
}

export interface CartQuote {
  lines: CartLine[];
  /** What the family owes now, before our fee. */
  subtotalCents: number;
  /** Our fee across the cart — shown as its own honest line, never buried. */
  platformFeeCents: number;
  /** What the card is charged. Equals subtotal when the club absorbs our fee. */
  totalCents: number;
  discountTotalCents: number;
}

/**
 * Price a whole cart, applying the sibling discount to the 2nd and subsequent
 * paying children. Waitlisted children are priced (so a promotion months later
 * charges the price agreed at registration) but charged nothing now.
 */
export function quoteCart(
  items: readonly CartItem[],
  settings: Pick<
    SeasonSettings,
    "siblingDiscountBps" | "siblingDiscountFlatCents" | "absorbPlatformFee"
  >,
  options: {
    scholarship: ScholarshipCode | null;
    asOf: IsoDate;
    plan: Plan;
    applicationFeeCents: number;
  },
): CartQuote {
  // Deterministic: most expensive child first, ties broken by name then ref.
  const order = [...items].sort(
    (a, b) =>
      b.feeCents - a.feeCents ||
      a.playerName.localeCompare(b.playerName) ||
      a.ref.localeCompare(b.ref),
  );

  const priced = new Map<string, CartLine>();
  let payingIndex = 0;

  for (const item of order) {
    const line = priceRegistration({
      feeCents: item.feeCents,
      earlyBird: item.earlyBird,
      siblingDiscountBps: settings.siblingDiscountBps,
      siblingDiscountFlatCents: settings.siblingDiscountFlatCents,
      siblingIndex: payingIndex,
      scholarship: options.scholarship,
      asOf: options.asOf,
      plan: options.plan,
      applicationFeeCents: options.applicationFeeCents,
    });
    // A waitlisted child does not consume a sibling position: a family must not
    // lose the discount on the child who got in because an earlier one is waiting.
    if (!item.waitlisted) payingIndex += 1;
    priced.set(item.ref, {
      ...line,
      platformFeeCents: item.waitlisted ? 0 : line.platformFeeCents,
      chargeableCents: item.waitlisted ? 0 : line.amountCents,
      ref: item.ref,
      divisionId: item.divisionId,
      divisionName: item.divisionName,
      playerName: item.playerName,
      waitlisted: item.waitlisted,
    });
  }

  // Return the lines in the order the parent entered them; price them in fee order.
  const lines = items.map((i) => priced.get(i.ref)!);
  const subtotalCents = lines.reduce((s, l) => s + l.chargeableCents, 0);
  const platformFeeCents = lines.reduce((s, l) => s + l.platformFeeCents, 0);
  const discountTotalCents = lines.reduce(
    (s, l) => (l.waitlisted ? s : s + l.discounts.reduce((d, x) => d + x.amountCents, 0)),
    0,
  );
  return {
    lines,
    subtotalCents,
    platformFeeCents,
    totalCents: settings.absorbPlatformFee ? subtotalCents : subtotalCents + platformFeeCents,
    discountTotalCents,
  };
}

/** Look a code up case-insensitively, respecting its use limit. */
export function findScholarshipCode(
  codes: readonly ScholarshipCode[],
  input: string | null | undefined,
): { code: ScholarshipCode | null; error: string | null } {
  const typed = (input ?? "").trim();
  if (!typed) return { code: null, error: null };
  const match = codes.find((c) => c.code.toLowerCase() === typed.toLowerCase());
  if (!match) return { code: null, error: `We don't recognise the code "${typed}"` };
  if (match.maxUses > 0 && match.uses >= match.maxUses) {
    return { code: null, error: `The code "${typed}" has been fully claimed` };
  }
  return { code: match, error: null };
}

/**
 * Deposit + monthly installments that sum to exactly the amount owed.
 * Returns an empty plan when the amount cannot support one.
 */
export function buildInstallmentPlan(
  amountCents: number,
  depositCents: number,
  count: number,
  firstDueOn: IsoDate,
  addMonths: (iso: IsoDate, n: number) => IsoDate,
  split: (total: number, parts: number) => number[],
): { depositCents: number; installments: { dueOn: IsoDate; amountCents: number }[] } | null {
  if (count < 1 || amountCents <= 0) return null;
  const deposit = Math.min(Math.max(0, depositCents), amountCents);
  const remainder = amountCents - deposit;
  if (remainder <= 0) return null;
  const amounts = split(remainder, count);
  return {
    depositCents: deposit,
    installments: amounts.map((amount, i) => ({
      dueOn: addMonths(firstDueOn, i + 1),
      amountCents: amount,
    })),
  };
}
