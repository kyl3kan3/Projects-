/**
 * src/lib/deposit-gateway.ts
 *
 * The card gateway behind a narrow interface, with two implementations.
 *
 * A security deposit is an **authorization hold** — a manual-capture
 * PaymentIntent on the *operator's own* Stripe Connect account. Customer money
 * never touches RigRent, and in the ordinary case it never moves at all: the
 * hold is cancelled on a clean return and the customer's statement shows a
 * pending line that disappears.
 *
 * There is no Stripe key in this environment, so the implementation that runs
 * here is `SimulatedGateway`. That is not a stub standing in for untested code —
 * it is how every path *around* the network call gets exercised: order state
 * transitions, the capture split across claims, the release on a clean return,
 * the re-authorisation of a long rental, and what the UI says when a hold fails.
 * The live Stripe call itself is the one thing that stays unexercised, and the
 * README says so.
 *
 * `StripeGateway` uses hosted Checkout rather than Elements, because the manifest
 * carries no client-side Stripe SDK and a card field you cannot mount is worse
 * than a redirect you can. Checkout supports `capture_method: "manual"`, which is
 * exactly the hold this product needs.
 */

import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";

/** Stripe authorisations expire; card networks give roughly seven days. */
export const HOLD_LIFETIME_DAYS = 7;
/** Re-authorise this many days before expiry, so a failure has room to be fixed. */
export const REAUTH_LEAD_DAYS = 2;

export interface HoldRequest {
  orderId: string;
  orderNumber: number;
  amountCents: number;
  currency: string;
  customerEmail: string | null;
  /** The signed contract's sha256, carried into Stripe metadata as evidence. */
  docHash: string | null;
  /** The operator's Connect account. Null means the platform account (dev only). */
  connectAccountId: string | null;
  returnUrl: string;
  cancelUrl: string;
}

export interface HoldResult {
  /** Where to send the customer to authorise, or null when nothing is needed. */
  redirectUrl: string | null;
  /** Present as soon as the authorisation exists. */
  paymentIntentId: string | null;
  /** True when the hold is already in place (simulated mode, or a re-auth). */
  held: boolean;
}

export interface CaptureResult {
  captureId: string;
  capturedCents: number;
}

export interface DepositGateway {
  readonly kind: "stripe" | "simulated";
  /** Start an authorisation hold. */
  createHold(request: HoldRequest): Promise<HoldResult>;
  /** Capture part or all of an existing authorisation. Remainder auto-releases. */
  capture(
    paymentIntentId: string,
    amountCents: number,
    connectAccountId: string | null,
    metadata: Record<string, string>,
  ): Promise<CaptureResult>;
  /** Cancel the authorisation. Money never moved. */
  cancel(paymentIntentId: string, connectAccountId: string | null): Promise<void>;
  /** Confirm a hold placed through a hosted redirect actually landed. */
  confirmFromRedirect(
    sessionId: string,
    connectAccountId: string | null,
  ): Promise<{ paymentIntentId: string | null; held: boolean; amountCents: number | null }>;
}

/* ------------------------------------------------------------- simulated --- */

class SimulatedGateway implements DepositGateway {
  readonly kind = "simulated" as const;

  async createHold(request: HoldRequest): Promise<HoldResult> {
    if (request.amountCents <= 0) {
      return { redirectUrl: null, paymentIntentId: null, held: false };
    }
    return {
      redirectUrl: null,
      paymentIntentId: `pi_sim_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
      held: true,
    };
  }

  async capture(
    paymentIntentId: string,
    amountCents: number,
  ): Promise<CaptureResult> {
    return {
      captureId: `ch_sim_${paymentIntentId.slice(-10)}_${Math.max(0, Math.trunc(amountCents))}`,
      capturedCents: Math.max(0, Math.trunc(amountCents)),
    };
  }

  async cancel(): Promise<void> {
    /* Nothing to cancel: no money was ever authorised. */
  }

  async confirmFromRedirect(): Promise<{
    paymentIntentId: string | null;
    held: boolean;
    amountCents: number | null;
  }> {
    return { paymentIntentId: null, held: false, amountCents: null };
  }
}

/* ---------------------------------------------------------------- stripe --- */

class StripeGateway implements DepositGateway {
  readonly kind = "stripe" as const;

  private async client() {
    const { default: Stripe } = await import("stripe");
    return new Stripe(env.stripeSecretKey);
  }

  private opts(connectAccountId: string | null) {
    return connectAccountId ? { stripeAccount: connectAccountId } : undefined;
  }

  async createHold(request: HoldRequest): Promise<HoldResult> {
    if (request.amountCents <= 0) {
      return { redirectUrl: null, paymentIntentId: null, held: false };
    }
    const stripe = await this.client();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        // The hold, not a charge. Stripe reports it as amount_capturable_updated.
        payment_intent_data: {
          capture_method: "manual",
          description: `Security deposit hold — order #${request.orderNumber}`,
          metadata: {
            rigrentOrderId: request.orderId,
            rigrentDocHash: request.docHash ?? "",
          },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: request.currency,
              unit_amount: request.amountCents,
              product_data: {
                name: `Security deposit hold — order #${request.orderNumber}`,
                description:
                  "An authorisation hold, not a charge. Released automatically on a clean return.",
              },
            },
          },
        ],
        customer_email: request.customerEmail ?? undefined,
        metadata: { rigrentOrderId: request.orderId },
        success_url: request.returnUrl,
        cancel_url: request.cancelUrl,
      },
      this.opts(request.connectAccountId),
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return {
      redirectUrl: session.url,
      paymentIntentId:
        typeof session.payment_intent === "string" ? session.payment_intent : null,
      held: false,
    };
  }

  async capture(
    paymentIntentId: string,
    amountCents: number,
    connectAccountId: string | null,
    metadata: Record<string, string>,
  ): Promise<CaptureResult> {
    const stripe = await this.client();
    const intent = await stripe.paymentIntents.capture(
      paymentIntentId,
      { amount_to_capture: amountCents, metadata },
      this.opts(connectAccountId),
    );
    const charge = intent.latest_charge;
    return {
      captureId: typeof charge === "string" ? charge : (charge?.id ?? intent.id),
      capturedCents: intent.amount_received ?? amountCents,
    };
  }

  async cancel(paymentIntentId: string, connectAccountId: string | null): Promise<void> {
    const stripe = await this.client();
    await stripe.paymentIntents.cancel(paymentIntentId, {}, this.opts(connectAccountId));
  }

  async confirmFromRedirect(
    sessionId: string,
    connectAccountId: string | null,
  ): Promise<{ paymentIntentId: string | null; held: boolean; amountCents: number | null }> {
    const stripe = await this.client();
    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      { expand: ["payment_intent"] },
      this.opts(connectAccountId),
    );
    const intent = session.payment_intent;
    if (!intent || typeof intent === "string") {
      return { paymentIntentId: typeof intent === "string" ? intent : null, held: false, amountCents: null };
    }
    return {
      paymentIntentId: intent.id,
      held: intent.status === "requires_capture",
      amountCents: intent.amount_capturable ?? null,
    };
  }
}

let _gateway: DepositGateway | null = null;

/**
 * The live gateway when a Stripe key is configured and DRY_RUN is off; the
 * simulator otherwise. Nothing above this line branches on which it got, other
 * than the UI, which labels a simulated hold as simulated — a fake hold
 * presented as a real one would be the single most dishonest thing this app
 * could do.
 */
export function depositGateway(): DepositGateway {
  if (!_gateway) {
    _gateway =
      process.env.STRIPE_SECRET_KEY && !env.dryRun ? new StripeGateway() : new SimulatedGateway();
  }
  return _gateway;
}

export function depositsAreSimulated(): boolean {
  return depositGateway().kind === "simulated";
}
