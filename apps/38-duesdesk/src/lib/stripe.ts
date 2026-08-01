/**
 * All Stripe access, in one module so the API version pin, the idempotency
 * keys, and the never-touch-association-funds rule live in one place.
 *
 * **Why direct charges and not destination charges.** ARCHITECTURE.md's stated
 * invariant is the one that matters: association money must never touch our
 * balance sheet (README risk #2; ROADMAP's "no flow touches a platform
 * balance"). A destination charge is created on the *platform* account and then
 * transferred, so the funds do momentarily sit in our balance. A **direct
 * charge** — created on the connected account by passing `stripeAccount` — never
 * does. Standard Connect accounts support direct charges, and the association
 * keeps its own dispute and payout relationship with Stripe. So dues checkout,
 * setup sessions and autopay PaymentIntents are all created *on the association's
 * account*, and DuesDesk's own subscription is the only thing on ours.
 *
 * The consequence to remember when reading the webhook route: Connect events
 * arrive with `event.account` set, and the objects they carry only exist on that
 * account.
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  associations,
  autopayEnrollments,
  households,
  members,
  type Association,
  type AutopayEnrollment,
  type Invoice,
} from "@/db/schema";
import { env } from "@/lib/env";
import { plan, PLAN_ORDER, planForPrice, type Plan as PlanRow } from "@/lib/plans";
import type { Plan as PlanId } from "@/db/schema";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, {
      appInfo: { name: "DuesDesk", url: "https://duesdesk.com" },
    });
  }
  return _stripe;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/* ------------------------------------------------------- Connect onboarding --- */

/**
 * Create (or reuse) the association's Standard Connect account and return the
 * onboarding link. Standard means the association owns the relationship: their
 * dashboard, their payouts, their disputes.
 */
export async function createConnectAccountLink(
  association: Association,
  email: string,
): Promise<string> {
  const db = getDb();
  let accountId = association.stripeAccountId;

  if (!accountId) {
    const account = await stripe().accounts.create({
      type: "standard",
      email,
      business_profile: { name: association.name },
      metadata: { associationId: association.id },
    });
    accountId = account.id;
    await db
      .update(associations)
      .set({ stripeAccountId: accountId })
      .where(eq(associations.id, association.id));
  }

  const link = await stripe().accountLinks.create({
    account: accountId,
    refresh_url: `${env.appUrl}/settings/payments?refresh=1`,
    return_url: `${env.appUrl}/settings/payments?connected=1`,
    type: "account_onboarding",
  });
  return link.url;
}

/** Re-check whether the connected account can actually accept charges. */
export async function syncConnectStatus(associationId: string): Promise<boolean> {
  const db = getDb();
  const [association] = await db
    .select()
    .from(associations)
    .where(eq(associations.id, associationId));
  if (!association?.stripeAccountId) return false;
  const account = await stripe().accounts.retrieve(association.stripeAccountId);
  const ready = Boolean(account.charges_enabled);
  await db
    .update(associations)
    .set({ stripeAccountReady: ready })
    .where(eq(associations.id, associationId));
  return ready;
}

/* ------------------------------------------------------------ dues checkout --- */

export interface DuesCheckoutInput {
  association: Association;
  invoice: Invoice;
  amountCents: number;
  unitLabel: string;
  portalToken: string;
  memberEmail: string | null;
}

/**
 * Hosted checkout for one invoice, created **on the association's account**.
 * ACH is listed first: it is the nudge that makes the economics work
 * (~$0.80 capped vs ~2.9% on a card), and the order of this array is the order
 * the member sees.
 */
export async function createDuesCheckout(input: DuesCheckoutInput): Promise<string> {
  const accountId = input.association.stripeAccountId;
  if (!accountId) throw new Error("Connect Stripe before collecting dues online");

  const session = await stripe().checkout.sessions.create(
    {
      mode: "payment",
      payment_method_types: ["us_bank_account", "card"],
      customer_email: input.memberEmail ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: input.amountCents,
            product_data: {
              name: `${input.association.name} — ${input.invoice.periodLabel} dues`,
              description: `Unit ${input.unitLabel}`,
            },
          },
        },
      ],
      payment_intent_data: {
        metadata: {
          invoiceId: input.invoice.id,
          householdId: input.invoice.householdId,
          associationId: input.association.id,
        },
      },
      metadata: { invoiceId: input.invoice.id },
      success_url: `${env.appUrl}/pay/${input.portalToken}?paid=1`,
      cancel_url: `${env.appUrl}/pay/${input.portalToken}`,
    },
    { stripeAccount: accountId },
  );
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}

/* ----------------------------------------------------------------- autopay --- */

/**
 * A Stripe customer on the *association's* account for one household, so the
 * saved payment method belongs to the association's relationship, not ours.
 */
async function ensureHouseholdCustomer(
  association: Association,
  householdId: string,
  unitLabel: string,
  email: string | null,
): Promise<string> {
  const accountId = association.stripeAccountId;
  if (!accountId) throw new Error("Connect Stripe before enrolling autopay");

  const db = getDb();
  const [existing] = await db
    .select()
    .from(autopayEnrollments)
    .where(eq(autopayEnrollments.householdId, householdId));
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const customer = await stripe().customers.create(
    {
      name: `Unit ${unitLabel}`,
      email: email ?? undefined,
      metadata: { householdId, associationId: association.id },
    },
    { stripeAccount: accountId },
  );
  return customer.id;
}

/**
 * The hosted Checkout session that saves a payment method for autopay.
 *
 * Deliberately Checkout in `setup` mode rather than Elements: the card or bank
 * details are entered on Stripe's own page, so they never touch a DuesDesk
 * origin, there is no client secret in a browser, and there is no Stripe.js on
 * the critical path of a page a grandparent opens on a phone.
 *
 * Callers must have verified the emailed magic-link step-up first. This function
 * is not the gate — `/pay/[token]/autopay` is, and it re-verifies the step-up
 * token server-side before calling here.
 */
export async function createAutopaySetupSession(input: {
  association: Association;
  householdId: string;
  unitLabel: string;
  email: string | null;
  memberId: string;
  portalToken: string;
}): Promise<string> {
  const accountId = input.association.stripeAccountId;
  if (!accountId) throw new Error("Connect Stripe before enrolling autopay");

  const customerId = await ensureHouseholdCustomer(
    input.association,
    input.householdId,
    input.unitLabel,
    input.email,
  );

  const session = await stripe().checkout.sessions.create(
    {
      mode: "setup",
      customer: customerId,
      // ACH first: the order of this array is the order the member sees.
      payment_method_types: ["us_bank_account", "card"],
      setup_intent_data: {
        metadata: {
          householdId: input.householdId,
          associationId: input.association.id,
          memberId: input.memberId,
        },
      },
      metadata: {
        householdId: input.householdId,
        associationId: input.association.id,
        memberId: input.memberId,
        autopay: "1",
      },
      success_url: `${env.appUrl}/pay/${input.portalToken}?autopay=pending`,
      cancel_url: `${env.appUrl}/pay/${input.portalToken}`,
    },
    { stripeAccount: accountId },
  );
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}

/**
 * Resolve a completed setup Checkout session into the saved payment method.
 * Called by the Connect webhook, which is the only authority on whether the
 * member actually finished.
 */
export async function resolveAutopaySetup(
  accountId: string,
  session: Stripe.Checkout.Session,
): Promise<{
  householdId: string;
  memberId: string | null;
  customerId: string;
  paymentMethodId: string;
  method: "card" | "ach";
} | null> {
  const setupIntentId =
    typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id;
  if (!setupIntentId) return null;

  const intent = await stripe().setupIntents.retrieve(
    setupIntentId,
    { expand: ["payment_method"] },
    { stripeAccount: accountId },
  );
  if (intent.status !== "succeeded") return null;

  const paymentMethod = intent.payment_method;
  const paymentMethodId =
    typeof paymentMethod === "string" ? paymentMethod : paymentMethod?.id ?? null;
  if (!paymentMethodId) return null;

  const type =
    typeof paymentMethod === "string" ? undefined : paymentMethod?.type;
  const customerId =
    typeof intent.customer === "string" ? intent.customer : intent.customer?.id ?? null;
  const householdId = intent.metadata?.householdId ?? session.metadata?.householdId ?? null;
  if (!customerId || !householdId) return null;

  return {
    householdId,
    memberId: intent.metadata?.memberId ?? session.metadata?.memberId ?? null,
    customerId,
    paymentMethodId,
    method: type === "us_bank_account" ? "ach" : "card",
  };
}

export interface ChargeOutcome {
  status: "succeeded" | "processing" | "failed";
  paymentIntentId: string | null;
  method: "card" | "ach";
  error: string | null;
  simulated: boolean;
}

/**
 * Charge one invoice off-session against a saved payment method.
 *
 * The idempotency key is `invoice:{id}:{attemptNo}` and it is passed to Stripe
 * as well as being the unique key of our own `autopay_attempts` row. Two
 * guarantees, belt and braces: our insert fails before we call Stripe, and if we
 * crashed between the insert and the call, Stripe itself refuses the duplicate.
 *
 * Under DRY_RUN nothing is charged. A deterministic simulated intent id is
 * returned instead, derived from the idempotency key, so the whole run —
 * attempts, payments, invoice status, the retry ladder — can be exercised
 * against a real database without moving anybody's money. Simulated payments are
 * recorded with an explicit `pi_dryrun_` prefix; they are never mistaken for
 * real ones.
 */
export async function chargeAutopay(
  association: Association,
  enrollment: AutopayEnrollment,
  invoice: Invoice,
  amountCents: number,
  idempotencyKey: string,
): Promise<ChargeOutcome> {
  if (env.dryRun) {
    return {
      status: "succeeded",
      paymentIntentId: `pi_dryrun_${Buffer.from(idempotencyKey).toString("hex").slice(0, 24)}`,
      method: enrollment.method,
      error: null,
      simulated: true,
    };
  }

  const accountId = association.stripeAccountId;
  if (!accountId) {
    return {
      status: "failed",
      paymentIntentId: null,
      method: enrollment.method,
      error: "The association's Stripe account is not connected",
      simulated: false,
    };
  }

  try {
    const intent = await stripe().paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        customer: enrollment.stripeCustomerId,
        payment_method: enrollment.stripePaymentMethodId,
        payment_method_types: [enrollment.method === "ach" ? "us_bank_account" : "card"],
        off_session: true,
        confirm: true,
        description: `${association.name} — ${invoice.periodLabel} dues (autopay)`,
        metadata: {
          invoiceId: invoice.id,
          householdId: invoice.householdId,
          associationId: association.id,
          autopay: "1",
        },
      },
      { stripeAccount: accountId, idempotencyKey },
    );

    // ACH sits in `processing` for days. That is not a failure and not a payment.
    const status: ChargeOutcome["status"] =
      intent.status === "succeeded"
        ? "succeeded"
        : intent.status === "processing"
          ? "processing"
          : "failed";
    return {
      status,
      paymentIntentId: intent.id,
      method: enrollment.method,
      error: status === "failed" ? (intent.last_payment_error?.message ?? intent.status) : null,
      simulated: false,
    };
  } catch (err) {
    const stripeErr = err as Stripe.errors.StripeError;
    return {
      status: "failed",
      paymentIntentId: stripeErr.payment_intent?.id ?? null,
      method: enrollment.method,
      error: stripeErr.message ?? "Charge failed",
      simulated: false,
    };
  }
}

/* ------------------------------------------------------- DuesDesk's billing --- */

function priceFor(planId: PlanId): string {
  const id = env.stripePrices[planId];
  if (!id) throw new Error(`No Stripe price configured for the ${planId} plan`);
  return id;
}

async function ensureBillingCustomer(association: Association, email: string): Promise<string> {
  if (association.stripeCustomerId) return association.stripeCustomerId;
  const customer = await stripe().customers.create({
    email,
    name: association.name,
    metadata: { associationId: association.id },
  });
  await getDb()
    .update(associations)
    .set({ stripeCustomerId: customer.id })
    .where(eq(associations.id, association.id));
  return customer.id;
}

export async function createSubscriptionCheckout(
  association: Association,
  email: string,
  planId: PlanId,
): Promise<string> {
  const customerId = await ensureBillingCustomer(association, email);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceFor(planId), quantity: 1 }],
    success_url: `${env.appUrl}/settings/billing?upgraded=${planId}`,
    cancel_url: `${env.appUrl}/settings/billing`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { associationId: association.id } },
    metadata: { associationId: association.id, plan: planId },
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}

export async function createBillingPortal(
  association: Association,
  email: string,
): Promise<string> {
  const customerId = await ensureBillingCustomer(association, email);
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}

export { plan, PLAN_ORDER, planForPrice };
export type { PlanRow };

/** Household + primary member, for the labels Stripe objects carry. */
export async function householdLabel(householdId: string) {
  const db = getDb();
  const [row] = await db
    .select({ household: households, member: members })
    .from(households)
    .leftJoin(members, eq(members.householdId, households.id))
    .where(eq(households.id, householdId));
  return row ?? null;
}
