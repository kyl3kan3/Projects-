/**
 * src/lib/plans.ts
 *
 * README's three plans and the gates that follow from them. Pure — no database, no
 * Stripe — so the gate is testable and the pricing table can be rendered by a client
 * component.
 *
 * The rule that matters most here is the one nobody writes down: **a subscription
 * that ended has to actually end access.** A gate that only asks "which plan is
 * this?" keeps a cancelled stylist on the Book tier forever, because `plan` is just
 * a label that Stripe stopped paying for. Every gate below therefore asks
 * `entitlement()` first, which reads the subscription's status and the trial's
 * expiry, and only then asks what the plan includes.
 */

export type Plan = "chair" | "book" | "shop_member";
export type BillablePlan = "chair" | "book" | "shop";

export const TRIAL_DAYS = 14;

export interface PlanSpec {
  id: BillablePlan;
  name: string;
  priceCents: number;
  tagline: string;
  features: string[];
}

export const PLAN_SPECS: Record<BillablePlan, PlanSpec> = {
  chair: {
    id: "chair",
    name: "Chair",
    priceCents: 1_900,
    tagline: "The booking page, the policy, and the protection ledger.",
    features: [
      "Personal booking page at chairflow.app/b/yourname",
      "Services with durations, prices and deposit rules",
      "Card on file, held with Stripe on your own account",
      "The no-show and late-cancel fee policy engine",
      "Appointment confirmations and 48h / 2h reminders",
      "The protection ledger: fees, deposits kept, waives",
    ],
  },
  book: {
    id: "book",
    name: "Book",
    priceCents: 2_900,
    tagline: "Adds the cadence engine, client notes, and the waitlist.",
    features: [
      "Everything in Chair",
      "Cadence-based rebooking nudges on each client's own rhythm",
      "Client notes, visit history and no-show record",
      "Waitlist offers on freed slots, first tap wins",
      "CSV import to seed cadences from your old app",
    ],
  },
  shop: {
    id: "shop",
    name: "Shop",
    priceCents: 4_900,
    tagline: "The chair-rent ledger both sides can see. Up to 12 chairs.",
    features: [
      "Chair-rent split ledger: weekly rent, paid / unpaid, history",
      "Owner dashboard across every chair in the shop",
      "Payment links to the owner's own Stripe account",
      "Each renter keeps their own Chair or Book plan",
    ],
  },
};

export function planSpec(plan: BillablePlan): PlanSpec {
  return PLAN_SPECS[plan];
}

export function planName(plan: Plan): string {
  return plan === "shop_member" ? "Chair (shop)" : PLAN_SPECS[plan].name;
}

/**
 * Stripe subscription statuses that still mean "this account is paid for".
 *
 * `past_due` is deliberately here: a failed card is a card problem, and a stylist's
 * booking page going dark in public over one is a brand injury we inflict on them.
 * `unpaid` and `canceled` are not — at that point Stripe has given up too.
 */
const LIVE_SUBSCRIPTION = new Set(["active", "trialing", "past_due"]);

export function subscriptionLive(status: string | null | undefined): boolean {
  return Boolean(status && LIVE_SUBSCRIPTION.has(status));
}

export function trialActive(trialEndsAt: Date | null, now: Date = new Date()): boolean {
  return Boolean(trialEndsAt && trialEndsAt.getTime() > now.getTime());
}

export function trialDaysLeft(trialEndsAt: Date | null, now: Date = new Date()): number {
  if (!trialEndsAt) return 0;
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86_400_000));
}

/** The minimum a gate needs to know about who is asking. */
export interface Billable {
  plan: Plan;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
}

export type Entitlement =
  | { state: "trial"; daysLeft: number }
  | { state: "subscribed"; status: string }
  | { state: "past_due"; status: string }
  | { state: "lapsed"; reason: string };

/**
 * Is this account entitled to anything at all, and on what basis?
 *
 * Order matters. A live subscription beats the trial (a stylist who subscribed on
 * day 3 is subscribed, not trialing). A subscription that ended beats a trial date
 * still sitting in the column — otherwise cancelling inside the first fortnight
 * would silently restore the trial.
 */
export function entitlement(account: Billable, now: Date = new Date()): Entitlement {
  if (account.stripeSubscriptionId) {
    const status = account.subscriptionStatus ?? "active";
    if (status === "past_due") return { state: "past_due", status };
    if (subscriptionLive(status)) return { state: "subscribed", status };
    return {
      state: "lapsed",
      reason:
        status === "canceled"
          ? "This subscription was cancelled."
          : `Stripe reports this subscription as ${status}.`,
    };
  }
  if (trialActive(account.trialEndsAt, now)) {
    return { state: "trial", daysLeft: trialDaysLeft(account.trialEndsAt, now) };
  }
  return { state: "lapsed", reason: "The 14-day trial has ended." };
}

export function entitled(account: Billable, now: Date = new Date()): boolean {
  return entitlement(account, now).state !== "lapsed";
}

export type Feature =
  | "booking_page"
  | "fees"
  | "reminders"
  | "cadence_nudges"
  | "client_notes"
  | "waitlist"
  | "csv_import"
  | "rent_ledger";

/** Which features each plan includes, before entitlement is considered. */
const PLAN_FEATURES: Record<Plan, Feature[]> = {
  chair: ["booking_page", "fees", "reminders"],
  shop_member: ["booking_page", "fees", "reminders"],
  book: [
    "booking_page",
    "fees",
    "reminders",
    "cadence_nudges",
    "client_notes",
    "waitlist",
    "csv_import",
  ],
};

export type Denial =
  | { ok: true }
  | { ok: false; reason: string; upgradeTo: BillablePlan | null };

const ALLOW: Denial = { ok: true };

const FEATURE_LABEL: Record<Feature, string> = {
  booking_page: "The booking page",
  fees: "Policy fees",
  reminders: "Reminders",
  cadence_nudges: "Rebooking nudges",
  client_notes: "Client notes and history",
  waitlist: "The waitlist",
  csv_import: "CSV import",
  rent_ledger: "The rent ledger",
};

/**
 * Can this account use this feature right now?
 *
 * A lapsed account is denied everything that *acts* — sending, charging, offering.
 * Reading is never gated: the client book, the ledger and the history stay open,
 * because holding a stylist's own client list hostage over a card failure is not a
 * growth tactic this product runs.
 */
export function featureAllowed(
  account: Billable,
  feature: Feature,
  now: Date = new Date(),
): Denial {
  const ent = entitlement(account, now);
  if (ent.state === "lapsed") {
    return {
      ok: false,
      reason: `${FEATURE_LABEL[feature]} is paused. ${ent.reason} Your clients, history and ledger stay readable.`,
      upgradeTo: feature === "rent_ledger" ? "shop" : account.plan === "book" ? "book" : "chair",
    };
  }
  // The rent ledger belongs to a shop's own subscription, not a renter's plan.
  if (feature === "rent_ledger") return ALLOW;
  if (PLAN_FEATURES[account.plan].includes(feature)) return ALLOW;
  return {
    ok: false,
    reason: `${FEATURE_LABEL[feature]} is part of Book, at $29/mo.`,
    upgradeTo: "book",
  };
}

/**
 * Is the public booking page taking bookings?
 *
 * When it is not, the page shows "fully booked" rather than an error or a payment
 * wall: a client who arrives from an Instagram bio must never see that the stylist's
 * card was declined. ARCHITECTURE flow 6 — the stylist's brand is never the hostage.
 */
export function bookingPageLive(account: Billable, now: Date = new Date()): boolean {
  return entitled(account, now);
}

/** Monthly price for a plan, in cents. Annual is two months free. */
export function monthlyCents(plan: BillablePlan): number {
  return PLAN_SPECS[plan].priceCents;
}

export function annualCents(plan: BillablePlan): number {
  return PLAN_SPECS[plan].priceCents * 10;
}
