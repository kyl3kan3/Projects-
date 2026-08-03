/**
 * src/lib/env.ts
 *
 * Environment access. Every value is read through a getter so that `next build`
 * — which imports these modules with no secrets present — never throws. Only the
 * code path that actually needs a secret at runtime fails if it is absent.
 *
 * Two secrets are load-bearing and have no default on purpose: `AUTH_SECRET`
 * (signs session cookies) and `SHARE_TOKEN_SECRET` (signs read-only report share
 * links). A fallback here would make every shared contract report world-readable
 * to anyone holding the source.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/** The pinned model. Upgrades go through `npm run eval` before this changes. */
export const DEFAULT_MODEL = "claude-sonnet-5";

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get authSecret() {
    return required("AUTH_SECRET");
  },
  /** HMAC key for report share tokens. */
  get shareTokenSecret() {
    return required("SHARE_TOKEN_SECRET");
  },
  get appUrl() {
    return optional("APP_URL", "http://localhost:3046").replace(/\/$/, "");
  },
  get cronSecret() {
    return optional("CRON_SECRET");
  },

  // --- Claude ---
  get anthropicApiKey() {
    return optional("ANTHROPIC_API_KEY");
  },
  get anthropicModel() {
    return optional("ANTHROPIC_MODEL", DEFAULT_MODEL);
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
      freelancer: optional("STRIPE_PRICE_FREELANCER"),
      studio: optional("STRIPE_PRICE_STUDIO"),
      perContract: optional("STRIPE_PRICE_PER_CONTRACT"),
      overage: optional("STRIPE_PRICE_OVERAGE"),
    };
  },

  // --- Email ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "ClauseCompass <reports@mail.clausecompass.com>");
  },

  /** DRY_RUN=1 logs outbound email instead of sending it. */
  get dryRun() {
    return optional("DRY_RUN", "0") === "1";
  },
} as const;

/**
 * Is a real Claude key configured?
 *
 * When it is not, the pipeline runs its deterministic local analyser instead of
 * calling the API (see `src/lib/claude.ts`). That substitution is surfaced on the
 * report — provenance is `local-rules-v1`, not a model id — because a report that
 * claims a model read it when none did would be the worst kind of lie for this
 * particular product.
 */
export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) && optional("DRY_RUN", "0") !== "1";
}

/**
 * Dev-only credit grants. The $19 checkout is the only way to buy a review in
 * production; with no Stripe key configured and NODE_ENV !== production, the
 * billing screen offers a clearly-labelled simulated purchase so the pipeline can
 * be exercised locally. Both conditions must hold — an unconfigured production
 * deploy must not hand out free reviews.
 */
export function devCreditsAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && !stripeConfigured();
}
