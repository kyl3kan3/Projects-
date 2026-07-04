import type Stripe from "stripe";
import StripeClient from "stripe";
import { serverEnv } from "./env";

export type DeclineClass = "hard" | "soft";

export interface ConnectedAccountContext {
  stripeAccountId: string;
  livemode: boolean;
}

const STRIPE_API_VERSION = "2025-03-31.basil";

let platformStripe: Stripe | null = null;

export function getPlatformStripe(): Stripe {
  if (!serverEnv.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is required for live Stripe operations.");
  }

  if (!platformStripe) {
    platformStripe = new StripeClient(serverEnv.stripeSecretKey, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
      appInfo: {
        name: "Dunly",
        version: "0.1.0",
        url: "https://github.com/kyl3kan3/Projects-",
      },
    });
  }

  return platformStripe;
}

export function buildConnectAuthorizeUrl(state: string): string {
  if (!serverEnv.stripeConnectClientId) {
    const params = new URLSearchParams({ state });
    return `${serverEnv.appUrl}/api/demo/backfill?${params.toString()}`;
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: serverEnv.stripeConnectClientId,
    scope: "read_write",
    state,
    redirect_uri: `${serverEnv.appUrl}/api/connect/callback`,
  });

  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForAccount(code: string): Promise<ConnectedAccountContext> {
  const stripe = getPlatformStripe();
  const response = await stripe.oauth.token({
    grant_type: "authorization_code",
    code,
  });

  return {
    stripeAccountId: response.stripe_user_id ?? "acct_unknown",
    livemode: response.livemode ?? false,
  };
}

export async function retryInvoice(
  stripeAccountId: string,
  invoiceId: string,
  recoveryAttemptId: string,
): Promise<{ status: "succeeded" | "failed"; paymentIntentId?: string; declineCode?: string }> {
  const stripe = getPlatformStripe();

  try {
    const invoice = await stripe.invoices.pay(
      invoiceId,
      {},
      {
        stripeAccount: stripeAccountId,
        idempotencyKey: `dunly_retry_${recoveryAttemptId}`,
      },
    );
    const paidInvoice = invoice as Stripe.Invoice & {
      payment_intent?: string | { id: string } | null;
    };
    const paymentIntent =
      typeof paidInvoice.payment_intent === "string" ? paidInvoice.payment_intent : paidInvoice.payment_intent?.id;

    return { status: "succeeded", paymentIntentId: paymentIntent };
  } catch (error) {
    const stripeError = error as Stripe.errors.StripeCardError;
    return {
      status: "failed",
      declineCode: stripeError.decline_code ?? stripeError.code ?? "unknown",
    };
  }
}

export function isStripeSmartRetryActive(invoice: Pick<Stripe.Invoice, "next_payment_attempt">): boolean {
  return typeof invoice.next_payment_attempt === "number" && invoice.next_payment_attempt > Math.floor(Date.now() / 1000);
}

export async function createCardUpdateSetupIntent(
  stripeAccountId: string,
  customerId: string,
): Promise<Stripe.SetupIntent> {
  return getPlatformStripe().setupIntents.create(
    {
      customer: customerId,
      usage: "off_session",
      payment_method_types: ["card"],
    },
    { stripeAccount: stripeAccountId },
  );
}

export function classifyDeclineCode(code: string): DeclineClass {
  const hardDeclines = new Set([
    "lost_card",
    "stolen_card",
    "pickup_card",
    "fraudulent",
    "incorrect_number",
    "invalid_number",
    "do_not_honor",
  ]);
  return hardDeclines.has(code) ? "hard" : "soft";
}

export async function backfillAccount(
  stripeAccountId: string,
): Promise<{ failedInvoices: number; atRiskCents: number; previewRecoveredCents: number }> {
  if (!serverEnv.stripeSecretKey) {
    return { failedInvoices: 31, atRiskCents: 682_400, previewRecoveredCents: 191_200 };
  }

  const stripe = getPlatformStripe();
  const since = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
  let failedInvoices = 0;
  let atRiskCents = 0;

  for await (const invoice of stripe.invoices.list(
    { created: { gte: since }, limit: 100 },
    { stripeAccount: stripeAccountId },
  )) {
    if (invoice.status === "open" && invoice.attempt_count > 0 && invoice.amount_due > 0) {
      failedInvoices += 1;
      atRiskCents += invoice.amount_due;
    }
  }

  return {
    failedInvoices,
    atRiskCents,
    previewRecoveredCents: Math.round(atRiskCents * 0.32),
  };
}
