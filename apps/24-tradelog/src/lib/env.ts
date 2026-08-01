/**
 * Environment access.
 *
 * Read lazily through getters so `next build` — which imports every module
 * without real secrets — never crashes on a missing variable. Only the code path
 * that actually needs a secret throws, and only when it is absent at runtime.
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
    return optional("NEXT_PUBLIC_APP_URL", "http://localhost:3024");
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
      traderMonthly: optional("STRIPE_PRICE_TRADER_MONTHLY"),
      traderYearly: optional("STRIPE_PRICE_TRADER_YEARLY"),
      proMonthly: optional("STRIPE_PRICE_PRO_MONTHLY"),
      proYearly: optional("STRIPE_PRICE_PRO_YEARLY"),
    };
  },

  /** 32-byte hex key that encrypts stored broker-sync credentials. */
  get syncCredsKey() {
    return required("SYNC_CREDS_ENCRYPTION_KEY");
  },

  /**
   * Cron authorisation. A cron route with no secret set refuses to run rather
   * than defaulting to open — it does the most expensive thing in the app.
   */
  get cronSecret() {
    return optional("CRON_SECRET");
  },
} as const;

/** True when a variable is present, without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}
