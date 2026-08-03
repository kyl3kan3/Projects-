/**
 * Rent collection, behind a narrow interface with two implementations.
 *
 * Rent rides **the owner's own Stripe Connect (Standard) account** — UnitKeeper
 * never touches the money. Autopay is an off-session PaymentIntent against the
 * card or bank account the tenant vaulted at move-in, charged on the owner's
 * account with `stripeAccount`.
 *
 * There is no Stripe key in this environment, so a live charge cannot be part of
 * verification. Rather than leave autopay unbuilt, the call sits behind
 * `RentPayments` with two implementations:
 *
 *  - `StripeRentPayments` — the real one, selected when STRIPE_SECRET_KEY is set.
 *  - `FakeRentPayments`  — deterministic, selected automatically otherwise. The
 *    payment-method id decides the outcome, so the late ladder, the retry rung and
 *    the reversal-on-payment path are all exercisable end to end without a
 *    network. It is labelled everywhere it surfaces in the UI.
 *
 * Everything interesting is around the call, and that is where this file puts the
 * care: idempotency keys derived from (tenancy, period) so a retried tick cannot
 * double-charge, decline codes mapped to sentences a tenant can act on, and a
 * failure that never reads as a success.
 */

import { env } from "@/lib/env";
import type { Period } from "@/lib/money";

export type DeclineCode =
  | "card_declined"
  | "insufficient_funds"
  | "expired_card"
  | "no_payment_method"
  | "processing_error";

export type ChargeOutcome =
  | { ok: true; paymentIntentId: string; simulated: boolean }
  | { ok: false; code: DeclineCode; message: string; simulated: boolean };

export interface ChargeInput {
  /** The owner's Connect account the charge is made on. */
  stripeAccountId: string | null;
  customerId: string | null;
  paymentMethodId: string | null;
  amountCents: number;
  description: string;
  /** Derived from (tenancy, period) — the same charge twice is one charge. */
  idempotencyKey: string;
}

export interface RentPayments {
  readonly driver: "stripe" | "fake";
  charge(input: ChargeInput): Promise<ChargeOutcome>;
}

/** The idempotency key for a monthly rent run. Stable across retries. */
export function autopayIdempotencyKey(tenancyId: string, period: Period): string {
  return `autopay:${tenancyId}:${period}`;
}

export function declineSentence(code: DeclineCode): string {
  switch (code) {
    case "card_declined":
      return "The card was declined. Ask the tenant to update the card on file.";
    case "insufficient_funds":
      return "Insufficient funds. The retry rung will try again on schedule.";
    case "expired_card":
      return "The card has expired. The tenant needs to save a new one.";
    case "no_payment_method":
      return "No payment method on file, so autopay cannot run.";
    case "processing_error":
      return "The processor errored. This will be retried, not counted as a decline.";
  }
}

/* ------------------------------------------------------------------- fake --- */

/**
 * The deterministic implementation. It reads the outcome off the payment-method
 * id, which is what makes a ladder walk reproducible:
 *
 *   pm_test_ok        → succeeds
 *   pm_test_decline   → card_declined
 *   pm_test_nsf       → insufficient_funds
 *   pm_test_expired   → expired_card
 *   pm_test_error     → processing_error
 *   (missing)         → no_payment_method
 */
export class FakeRentPayments implements RentPayments {
  readonly driver = "fake" as const;

  async charge(input: ChargeInput): Promise<ChargeOutcome> {
    if (!input.paymentMethodId) {
      return {
        ok: false,
        code: "no_payment_method",
        message: declineSentence("no_payment_method"),
        simulated: true,
      };
    }
    if (input.amountCents <= 0) {
      return {
        ok: false,
        code: "processing_error",
        message: "Nothing to charge.",
        simulated: true,
      };
    }
    const method = input.paymentMethodId;
    const code = method.includes("decline")
      ? "card_declined"
      : method.includes("nsf")
        ? "insufficient_funds"
        : method.includes("expired")
          ? "expired_card"
          : method.includes("error")
            ? "processing_error"
            : null;
    if (code) {
      return { ok: false, code, message: declineSentence(code), simulated: true };
    }
    // Derived from the idempotency key, so the same run reports the same id.
    return {
      ok: true,
      paymentIntentId: `pi_sim_${hash(input.idempotencyKey)}`,
      simulated: true,
    };
  }
}

function hash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).padStart(7, "0");
}

/* ----------------------------------------------------------------- stripe --- */

export class StripeRentPayments implements RentPayments {
  readonly driver = "stripe" as const;

  async charge(input: ChargeInput): Promise<ChargeOutcome> {
    if (!input.stripeAccountId) {
      return {
        ok: false,
        code: "processing_error",
        message: "This facility has not connected a Stripe account yet.",
        simulated: false,
      };
    }
    if (!input.customerId || !input.paymentMethodId) {
      return {
        ok: false,
        code: "no_payment_method",
        message: declineSentence("no_payment_method"),
        simulated: false,
      };
    }
    try {
      const { default: Stripe } = await import("stripe");
      const stripe = new Stripe(env.stripeSecretKey);
      const intent = await stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: "usd",
          customer: input.customerId,
          payment_method: input.paymentMethodId,
          off_session: true,
          confirm: true,
          description: input.description,
        },
        { idempotencyKey: input.idempotencyKey, stripeAccount: input.stripeAccountId },
      );
      if (intent.status === "succeeded" || intent.status === "processing") {
        return { ok: true, paymentIntentId: intent.id, simulated: false };
      }
      return {
        ok: false,
        code: "card_declined",
        message: `Stripe returned status "${intent.status}".`,
        simulated: false,
      };
    } catch (err) {
      const code = mapStripeError(err);
      return { ok: false, code, message: declineSentence(code), simulated: false };
    }
  }
}

function mapStripeError(err: unknown): DeclineCode {
  const declineCode =
    err && typeof err === "object" && "decline_code" in err
      ? String((err as { decline_code?: unknown }).decline_code ?? "")
      : "";
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  if (declineCode === "insufficient_funds") return "insufficient_funds";
  if (code === "expired_card") return "expired_card";
  if (code === "card_declined") return "card_declined";
  return "processing_error";
}

let _payments: RentPayments | null = null;

export function rentPayments(): RentPayments {
  if (!_payments) {
    _payments = process.env.STRIPE_SECRET_KEY
      ? new StripeRentPayments()
      : new FakeRentPayments();
  }
  return _payments;
}

/** True when rent is being simulated — the UI must say so, not imply a charge. */
export function paymentsAreSimulated(): boolean {
  return !process.env.STRIPE_SECRET_KEY;
}

/**
 * The saved-method options the tenant page offers when payments are simulated.
 * Labelled as simulation in the UI; a real deployment shows Stripe Elements here.
 */
export const SIMULATED_METHODS = [
  { id: "pm_test_ok", label: "Test card that pays", detail: "Visa ending 4242" },
  {
    id: "pm_test_nsf",
    label: "Test card that fails for insufficient funds",
    detail: "Walks the late ladder",
  },
] as const;
