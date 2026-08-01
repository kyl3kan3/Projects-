/**
 * Environment access.
 *
 * Every value is read through a getter so `next build` — which imports modules
 * without real secrets — never crashes on a missing var. Only the code path that
 * actually needs a secret throws, and it throws naming the variable.
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
  get appUrl() {
    return optional("APP_URL", "http://localhost:3045").replace(/\/$/, "");
  },
  get authSecret() {
    return required("AUTH_SECRET");
  },
  /**
   * Separate secret from the session cookie: a family's link lives in an inbox
   * for a whole season, and it opens a page about children.
   */
  get linkTokenSecret() {
    return required("LINK_TOKEN_SECRET");
  },
  /** AES-256-GCM key for medical notes and emergency contacts, base64. */
  get medicalFieldKey() {
    return required("MEDICAL_FIELD_KEY");
  },

  // --- Stripe ---
  get stripeSecretKey() {
    return optional("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return optional("STRIPE_WEBHOOK_SECRET");
  },
  /** Our per-registration application fee. $1.50 by default. */
  get applicationFeeCents() {
    const raw = Number(optional("APPLICATION_FEE_CENTS", "150"));
    return Number.isInteger(raw) && raw >= 0 ? raw : 150;
  },
  get stripeFlatPriceId() {
    return optional("STRIPE_PRICE_FLAT");
  },

  // --- Email / SMS ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "RosterRally <notifications@rosterrally.com>");
  },
  get twilio() {
    return {
      accountSid: optional("TWILIO_ACCOUNT_SID"),
      authToken: optional("TWILIO_AUTH_TOKEN"),
      from: optional("TWILIO_FROM_NUMBER"),
    };
  },

  /**
   * DRY_RUN logs outbound email/SMS instead of sending, and defaults to ON. A
   * dev database seeded from a real club's export contains 200 real parents'
   * addresses; a stray fan-out is unrecoverable.
   */
  get dryRun() {
    return optional("DRY_RUN", "1") !== "0";
  },
} as const;
