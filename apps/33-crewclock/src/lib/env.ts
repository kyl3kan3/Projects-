/**
 * Environment access.
 *
 * Read lazily through getters so `next build` — which imports every module
 * without real secrets — never crashes on a missing var. Only the code path
 * that actually needs a secret at runtime throws if it is absent.
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
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get authSecret() {
    return required("AUTH_SECRET");
  },
  /** HMAC key for crew invite codes / QR join tokens. */
  get inviteSecret() {
    return optional("INVITE_CODE_SIGNING_SECRET", optional("AUTH_SECRET"));
  },
  get appUrl() {
    return optional("NEXT_PUBLIC_APP_URL", "http://localhost:3033");
  },

  // --- Stripe (our own per-seat billing) ---
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  get stripePrices() {
    return {
      crew: optional("STRIPE_PRICE_CREW_MONTHLY"),
      company: optional("STRIPE_PRICE_COMPANY_MONTHLY"),
    };
  },

  // --- Alerts ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "CrewClock <alerts@crewclock.app>");
  },
  get twilio() {
    return {
      accountSid: optional("TWILIO_ACCOUNT_SID"),
      authToken: optional("TWILIO_AUTH_TOKEN"),
      fromNumber: optional("TWILIO_FROM_NUMBER"),
    };
  },
  /** Never send real email/SMS from a dev box pointed at real crew data. */
  get dryRun() {
    return process.env.DRY_RUN === "1" || process.env.NODE_ENV === "test";
  },

  get mapboxToken() {
    return optional("NEXT_PUBLIC_MAPBOX_TOKEN");
  },
} as const;

export function has(name: string): boolean {
  return Boolean(process.env[name]);
}
