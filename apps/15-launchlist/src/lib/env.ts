/**
 * Environment access.
 *
 * Every value is read through a getter so `next build` — which imports these
 * modules with no secrets present — never crashes. Only the code path that
 * actually needs a secret throws when it is missing.
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
  get redisUrl() {
    return required("REDIS_URL");
  },
  get authSecret() {
    return required("AUTH_SECRET");
  },
  /** Salt for IP hashing. Falls back to AUTH_SECRET so it is never unsalted. */
  get ipHashSalt() {
    return optional("IP_HASH_SALT") || required("AUTH_SECRET");
  },
  get appUrl() {
    return optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  },
  /**
   * Apex domain hosted pages live under, e.g. `launchlist.app` so a list is
   * reachable at `{slug}.launchlist.app`. Locally there are no wildcard
   * subdomains, so pages are also always served at `{appUrl}/l/{slug}`.
   */
  get pagesDomain() {
    return optional("NEXT_PUBLIC_PAGES_DOMAIN", "launchlist.app");
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
      growth: optional("STRIPE_PRICE_GROWTH"),
      pro: optional("STRIPE_PRICE_PRO"),
    };
  },

  // --- Resend ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "LaunchList <hello@launchlist.app>");
  },

  // --- Cron ---
  get cronSecret() {
    return optional("CRON_SECRET");
  },
} as const;

/** True when a var is present, without throwing — for feature gating in the UI. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}
