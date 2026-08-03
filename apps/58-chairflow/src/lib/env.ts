/**
 * src/lib/env.ts
 *
 * Typed, lazy access to every variable in `.env.example`.
 *
 * Values are read through getters so `next build` — which imports these modules
 * with no secrets present — never crashes. Only the code path that actually needs
 * a secret at runtime throws, and it names the variable when it does.
 *
 * Two have no safe default. `AUTH_SECRET` signs the stylist session cookie.
 * `LINK_TOKEN_SECRET` signs the client-facing links — manage-appointment,
 * nudge-booking, waitlist-claim — which are bearer credentials into one
 * appointment. A fallback would make either forgeable from the source.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },
  get appUrl(): string {
    return (
      optional("APP_URL") || optional("NEXT_PUBLIC_APP_URL", "http://localhost:3058")
    ).replace(/\/$/, "");
  },

  // --- Secrets (no safe default) ---
  get authSecret(): string {
    return required("AUTH_SECRET");
  },
  get linkTokenSecret(): string {
    return required("LINK_TOKEN_SECRET");
  },

  // --- Stripe: Connect Express (stylist money) + Billing (ours) ---
  get stripeSecretKey(): string {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret(): string {
    return optional("STRIPE_WEBHOOK_SECRET");
  },
  get stripeConnectWebhookSecret(): string {
    return optional("STRIPE_CONNECT_WEBHOOK_SECRET");
  },
  get stripePublishableKey(): string {
    return optional("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  },
  get stripePrices(): Record<"chair" | "book" | "shop", string> {
    return {
      chair: optional("STRIPE_PRICE_CHAIR"),
      book: optional("STRIPE_PRICE_BOOK"),
      shop: optional("STRIPE_PRICE_SHOP"),
    };
  },

  // --- SMS (Twilio) ---
  get twilio(): { accountSid: string; authToken: string; fromNumber: string } {
    return {
      accountSid: optional("TWILIO_ACCOUNT_SID"),
      authToken: optional("TWILIO_AUTH_TOKEN"),
      fromNumber: optional("TWILIO_FROM_NUMBER"),
    };
  },

  // --- Email (Resend) ---
  get resendApiKey(): string {
    return optional("RESEND_API_KEY");
  },
  get emailFrom(): string {
    return optional("EMAIL_FROM", "ChairFlow <bookings@mail.chairflow.io>");
  },

  // --- Scheduled work ---
  get cronSecret(): string {
    return optional("CRON_SECRET");
  },

  /** DRY_RUN=1 records comms and charges without calling any provider. */
  get dryRun(): boolean {
    return optional("DRY_RUN", "0") === "1";
  },
} as const;

/**
 * Is Stripe configured for real calls? When it is not, the payment gateway falls
 * back to the recorded stand-in (see `server/payments.ts`) and every screen that
 * touches money says so rather than pretending a card was charged.
 */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY) && !env.dryRun;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) && !env.dryRun;
}

export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER &&
      !env.dryRun,
  );
}
