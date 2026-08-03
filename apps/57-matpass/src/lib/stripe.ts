/**
 * Stripe, behind one narrow interface with two implementations.
 *
 * There are two Stripe surfaces in this product and they must never be confused:
 *
 * 1. **Tuition** runs on the *school's own* connected account (Connect Standard).
 *    Every call that moves a family's money passes `stripeAccount` so the charge,
 *    the customer and the subscription all live on the school's account and its
 *    balance. Nothing in this file creates a platform charge for tuition, takes an
 *    application fee, or sets a destination — tuition never touches MatPass's
 *    balance sheet, which is the promise in README's monetization section.
 * 2. **MatPass's own subscription** runs on the platform account, plainly.
 *
 * With no `STRIPE_SECRET_KEY` present the gateway is a deterministic simulator.
 * It is not a stub: it returns stable ids and routes hosted flows to an in-app
 * page that is explicitly labelled as a development simulation, so the whole
 * billing journey — plan, subscribe, collect, fail, dun, escalate, pause — is
 * exercisable end to end. What that cannot prove is the live Stripe API's own
 * behaviour; that is called out in the build report.
 */

import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { env, stripeConfigured } from "@/lib/env";

export interface HostedLink {
  url: string;
  simulated: boolean;
}

export interface BillingGateway {
  readonly live: boolean;
  /** Connect Standard onboarding link for a school. */
  connectAccountLink(input: { schoolId: string; schoolName: string; existingAccountId: string | null }): Promise<{ accountId: string; url: string; simulated: boolean }>;
  /** Mirror a membership plan as a price on the connected account. */
  createPrice(input: {
    accountId: string | null;
    productName: string;
    amountCents: number;
    interval: "month" | "year";
  }): Promise<{ priceId: string }>;
  /** A customer on the connected account for a household. */
  createCustomer(input: {
    accountId: string | null;
    email: string | null;
    name: string;
  }): Promise<{ customerId: string }>;
  /**
   * A Stripe-hosted flow the parent completes on their own phone. Card details
   * never pass through a MatPass screen.
   */
  subscriptionCheckout(input: {
    accountId: string | null;
    customerId: string;
    priceId: string;
    quantity: number;
    subscriptionRef: string;
    successUrl: string;
  }): Promise<HostedLink & { subscriptionId: string }>;
  /** A hosted link for a parent to fix a failed card. */
  paymentUpdateLink(input: {
    accountId: string | null;
    customerId: string;
    subscriptionRef: string;
    returnUrl: string;
  }): Promise<HostedLink>;
  /** MatPass's own checkout, on the platform account. */
  platformCheckout(input: {
    schoolId: string;
    priceId: string;
    customerId: string | null;
    email: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<HostedLink & { customerId: string; subscriptionId: string }>;
  /** MatPass's own customer portal. */
  platformPortal(input: { customerId: string; returnUrl: string }): Promise<HostedLink>;
  pauseSubscription(input: { accountId: string | null; subscriptionId: string; resume: boolean }): Promise<void>;
  cancelSubscription(input: { accountId: string | null; subscriptionId: string }): Promise<void>;
}

function stableId(prefix: string, ...parts: string[]): string {
  const digest = createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 20);
  return `${prefix}_sim${digest}`;
}

/**
 * The simulator. Hosted flows point at `/hosted/[kind]/[ref]`, a real page in
 * this app that says in plain words that it stands in for Stripe's hosted page
 * while no key is configured.
 */
class SimulatedGateway implements BillingGateway {
  readonly live = false;

  async connectAccountLink(input: { schoolId: string; schoolName: string; existingAccountId: string | null }) {
    const accountId = input.existingAccountId ?? stableId("acct", input.schoolId);
    return {
      accountId,
      url: `${env.appUrl}/hosted/connect/${encodeURIComponent(input.schoolId)}`,
      simulated: true,
    };
  }

  async createPrice(input: { accountId: string | null; productName: string; amountCents: number; interval: "month" | "year" }) {
    return {
      priceId: stableId("price", input.accountId ?? "platform", input.productName, String(input.amountCents), input.interval),
    };
  }

  async createCustomer(input: { accountId: string | null; email: string | null; name: string }) {
    return { customerId: stableId("cus", input.accountId ?? "platform", input.email ?? input.name) };
  }

  async subscriptionCheckout(input: {
    accountId: string | null;
    customerId: string;
    priceId: string;
    quantity: number;
    subscriptionRef: string;
    successUrl: string;
  }) {
    return {
      url: `${env.appUrl}/hosted/collect/${encodeURIComponent(input.subscriptionRef)}`,
      simulated: true,
      subscriptionId: stableId("sub", input.customerId, input.priceId, input.subscriptionRef),
    };
  }

  async paymentUpdateLink(input: { subscriptionRef: string }) {
    return {
      url: `${env.appUrl}/hosted/update/${encodeURIComponent(input.subscriptionRef)}`,
      simulated: true,
    };
  }

  async platformCheckout(input: { schoolId: string; priceId: string; customerId: string | null; email: string }) {
    return {
      url: `${env.appUrl}/hosted/plan/${encodeURIComponent(input.schoolId)}`,
      simulated: true,
      customerId: input.customerId ?? stableId("cus", input.email),
      subscriptionId: stableId("sub", input.schoolId, input.priceId),
    };
  }

  async platformPortal(input: { returnUrl: string }) {
    return { url: input.returnUrl, simulated: true };
  }

  async pauseSubscription(): Promise<void> {}
  async cancelSubscription(): Promise<void> {}
}

class StripeGateway implements BillingGateway {
  readonly live = true;
  constructor(private readonly stripe: Stripe) {}

  async connectAccountLink(input: { schoolId: string; schoolName: string; existingAccountId: string | null }) {
    let accountId = input.existingAccountId;
    if (!accountId) {
      const account = await this.stripe.accounts.create({
        type: "standard",
        business_profile: { name: input.schoolName },
        metadata: { schoolId: input.schoolId },
      });
      accountId = account.id;
    }
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${env.appUrl}/billing?connect=retry`,
      return_url: `${env.appUrl}/billing?connect=done`,
    });
    return { accountId, url: link.url, simulated: false };
  }

  async createPrice(input: { accountId: string | null; productName: string; amountCents: number; interval: "month" | "year" }) {
    const price = await this.stripe.prices.create(
      {
        currency: "usd",
        unit_amount: input.amountCents,
        recurring: { interval: input.interval },
        product_data: { name: input.productName },
      },
      input.accountId ? { stripeAccount: input.accountId } : undefined,
    );
    return { priceId: price.id };
  }

  async createCustomer(input: { accountId: string | null; email: string | null; name: string }) {
    const customer = await this.stripe.customers.create(
      { email: input.email ?? undefined, name: input.name },
      input.accountId ? { stripeAccount: input.accountId } : undefined,
    );
    return { customerId: customer.id };
  }

  async subscriptionCheckout(input: {
    accountId: string | null;
    customerId: string;
    priceId: string;
    quantity: number;
    subscriptionRef: string;
    successUrl: string;
  }) {
    // Direct charges on the connected account: no application_fee, no transfer
    // destination. The money is the school's from the moment it lands.
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: input.customerId,
        line_items: [{ price: input.priceId, quantity: input.quantity }],
        success_url: input.successUrl,
        cancel_url: input.successUrl,
        metadata: { subscriptionRef: input.subscriptionRef },
      },
      input.accountId ? { stripeAccount: input.accountId } : undefined,
    );
    return {
      url: session.url ?? input.successUrl,
      simulated: false,
      subscriptionId: typeof session.subscription === "string" ? session.subscription : "",
    };
  }

  async paymentUpdateLink(input: { accountId: string | null; customerId: string; returnUrl: string }) {
    const session = await this.stripe.billingPortal.sessions.create(
      { customer: input.customerId, return_url: input.returnUrl },
      input.accountId ? { stripeAccount: input.accountId } : undefined,
    );
    return { url: session.url, simulated: false };
  }

  async platformCheckout(input: {
    schoolId: string;
    priceId: string;
    customerId: string | null;
    email: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: input.customerId ?? undefined,
      customer_email: input.customerId ? undefined : input.email,
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: { schoolId: input.schoolId },
      subscription_data: { metadata: { schoolId: input.schoolId } },
    });
    return {
      url: session.url ?? input.cancelUrl,
      simulated: false,
      customerId: typeof session.customer === "string" ? session.customer : (input.customerId ?? ""),
      subscriptionId: typeof session.subscription === "string" ? session.subscription : "",
    };
  }

  async platformPortal(input: { customerId: string; returnUrl: string }) {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return { url: session.url, simulated: false };
  }

  async pauseSubscription(input: { accountId: string | null; subscriptionId: string; resume: boolean }) {
    await this.stripe.subscriptions.update(
      input.subscriptionId,
      input.resume ? { pause_collection: null } : { pause_collection: { behavior: "void" } },
      input.accountId ? { stripeAccount: input.accountId } : undefined,
    );
  }

  async cancelSubscription(input: { accountId: string | null; subscriptionId: string }) {
    await this.stripe.subscriptions.cancel(
      input.subscriptionId,
      undefined,
      input.accountId ? { stripeAccount: input.accountId } : undefined,
    );
  }
}

let _gateway: BillingGateway | null = null;
let _stripe: Stripe | null = null;

/** The Stripe SDK instance — also used for webhook signature verification. */
export async function stripeClient(): Promise<Stripe> {
  if (!_stripe) {
    const { default: Stripe } = await import("stripe");
    // Verification needs no credential; a placeholder keeps the constructor
    // happy when only the webhook secret is configured.
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder");
  }
  return _stripe;
}

export async function gateway(): Promise<BillingGateway> {
  if (!_gateway) {
    _gateway = stripeConfigured() ? new StripeGateway(await stripeClient()) : new SimulatedGateway();
  }
  return _gateway;
}

/** Reset between tests. */
export function resetGateway(): void {
  _gateway = null;
  _stripe = null;
}
