/**
 * Environment access.
 *
 * Values are read lazily through getters, so `next build` — which imports every
 * module without real secrets — never crashes on a missing var. Only the code
 * path that actually needs a secret throws, and only at runtime.
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
    return optional("APP_URL", optional("NEXT_PUBLIC_APP_URL", "http://localhost:3032"));
  },

  // --- Stripe ---
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  /** Recurring price ids, per plan and interval. Display copy lives in lib/plans. */
  get stripePrices() {
    return {
      crew: { month: optional("STRIPE_PRICE_CREW_MONTHLY"), year: optional("STRIPE_PRICE_CREW_ANNUAL") },
      company: {
        month: optional("STRIPE_PRICE_COMPANY_MONTHLY"),
        year: optional("STRIPE_PRICE_COMPANY_ANNUAL"),
      },
      regional: {
        month: optional("STRIPE_PRICE_REGIONAL_MONTHLY"),
        year: optional("STRIPE_PRICE_REGIONAL_ANNUAL"),
      },
    } as const;
  },

  // --- Resend ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "PermitPath <alerts@permitpath.com>");
  },

  // --- Crawler ---
  get crawlerUserAgent() {
    return optional(
      "CRAWLER_USER_AGENT",
      "PermitPathBot/1.0 (+https://permitpath.com/bot)",
    );
  },
  /** Simultaneous fetches across all sources. Per-host concurrency is always 1. */
  get crawlConcurrency() {
    const n = Number(optional("CRAWL_CONCURRENCY", "2"));
    return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 8) : 2;
  },
} as const;

/** True when a var is present, without throwing — for honest feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

/** Billing is only offered when Stripe is actually configured. */
export function billingConfigured(): boolean {
  return has("STRIPE_SECRET_KEY");
}

/** With no Resend key, alert email is logged rather than sent. */
export function emailConfigured(): boolean {
  return has("RESEND_API_KEY");
}
