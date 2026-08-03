/**
 * Environment access.
 *
 * Read lazily through getters so `next build` — which imports every module without
 * real secrets — never crashes on a missing var. Only the code path that actually
 * needs a secret at runtime throws when it is absent.
 *
 * Two things degrade honestly rather than breaking: with no `ANTHROPIC_API_KEY`
 * extraction falls back to the deterministic reader (see lib/extraction.ts) and
 * says so in the UI, and with no `R2_*` vars original bills are stored as bytes in
 * Postgres instead of object storage. Neither is a stub — both are real drivers.
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
    return optional("APP_URL", "http://localhost:3039").replace(/\/$/, "");
  },

  // --- object storage (optional: Cloudflare R2) ---
  get r2() {
    return {
      accountId: optional("R2_ACCOUNT_ID"),
      accessKeyId: optional("R2_ACCESS_KEY_ID"),
      secretAccessKey: optional("R2_SECRET_ACCESS_KEY"),
      bucket: optional("R2_BUCKET"),
    };
  },

  // --- extraction (optional: Anthropic) ---
  get anthropicApiKey() {
    return optional("ANTHROPIC_API_KEY");
  },
  get extractionModel() {
    return optional("EXTRACTION_MODEL", "claude-haiku-4-5-20251001");
  },
  get extractionEscalationModel() {
    return optional("EXTRACTION_ESCALATION_MODEL", "claude-sonnet-5");
  },

  // --- Stripe (optional: billing) ---
  get stripeSecretKey() {
    return optional("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return optional("STRIPE_WEBHOOK_SECRET");
  },
  get stripePrices() {
    return {
      starter_month: optional("STRIPE_PRICE_STARTER_MONTHLY"),
      starter_year: optional("STRIPE_PRICE_STARTER_ANNUAL"),
      standard_month: optional("STRIPE_PRICE_STANDARD_MONTHLY"),
      standard_year: optional("STRIPE_PRICE_STANDARD_ANNUAL"),
      supplier_plus_month: optional("STRIPE_PRICE_SUPPLIER_PLUS_MONTHLY"),
      supplier_plus_year: optional("STRIPE_PRICE_SUPPLIER_PLUS_ANNUAL"),
    };
  },

  /** Signs the short-lived document and report-render URLs. */
  get signingSecret() {
    return optional("SIGNING_SECRET") || required("AUTH_SECRET");
  },

  /** Protects /api/cron/tick. The route refuses to run when this is unset. */
  get cronSecret() {
    return optional("CRON_SECRET");
  },

  /** Milliseconds the long-lived worker sleeps between polls. */
  get workerIntervalMs() {
    return Number(optional("WORKER_INTERVAL_MS", "3000"));
  },
} as const;

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
