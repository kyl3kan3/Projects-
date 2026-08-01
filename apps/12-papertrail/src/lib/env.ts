/**
 * Environment access.
 *
 * Read lazily through getters so `next build` — which imports every module
 * without real secrets — never crashes on a missing var. Only the code path
 * that actually needs a secret throws, and only at runtime.
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
  get appUrl() {
    return optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
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
      solo: optional("STRIPE_PRICE_SOLO"),
      studio: optional("STRIPE_PRICE_STUDIO"),
    };
  },

  // --- Resend ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "PaperTrail <docs@papertrail.app>");
  },

  // --- Cron ---
  get cronSecret() {
    return optional("CRON_SECRET");
  },
} as const;

/** True when a var is present, without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}
