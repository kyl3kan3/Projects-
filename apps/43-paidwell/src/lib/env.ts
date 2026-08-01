/**
 * Environment access.
 *
 * Every value is read through a getter so `next build` — which imports modules
 * with no real secrets present — never crashes on a missing var. Only the code
 * path that actually needs a secret throws, and it says which one.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
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
  get appUrl() {
    return optional("APP_URL", optional("NEXT_PUBLIC_APP_URL", "http://localhost:3043"));
  },

  // --- accounting ---
  get qbo() {
    return {
      clientId: optional("QBO_CLIENT_ID"),
      clientSecret: optional("QBO_CLIENT_SECRET"),
      webhookVerifier: optional("QBO_WEBHOOK_VERIFIER"),
    };
  },
  get xero() {
    return {
      clientId: optional("XERO_CLIENT_ID"),
      clientSecret: optional("XERO_CLIENT_SECRET"),
      webhookKey: optional("XERO_WEBHOOK_KEY"),
    };
  },

  // --- Stripe ---
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  get stripePrices() {
    return {
      studio: optional("STRIPE_PRICE_STUDIO"),
      firm: optional("STRIPE_PRICE_FIRM"),
      practice: optional("STRIPE_PRICE_PRACTICE"),
    };
  },

  // --- email ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "PaidWell <notifications@paidwell.app>");
  },

  // --- app secrets ---
  get portalTokenSecret() {
    // Falls back to AUTH_SECRET so a single-secret deploy still signs links.
    return optional("PORTAL_TOKEN_SECRET") || required("AUTH_SECRET");
  },
  get cronSecret() {
    return optional("CRON_SECRET");
  },

  /** DRY_RUN=1 logs outbound email instead of sending it. */
  get dryRun() {
    return optional("DRY_RUN") === "1";
  },
} as const;

/** True when a var is present, without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}
