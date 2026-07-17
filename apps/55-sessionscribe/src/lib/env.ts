/**
 * src/lib/env.ts
 *
 * Environment access. Values are read lazily through getters so that
 * `next build` (which imports modules without real secrets) never crashes
 * on a missing var — only the code path that actually needs a secret at
 * runtime throws if it's absent.
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
  get appUrl() {
    return optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  },
  get authSecret() {
    return required("AUTH_SECRET");
  },

  // Transcription (BAA'd)
  get deepgramApiKey() {
    return required("DEEPGRAM_API_KEY");
  },

  // Drafting LLM (BAA'd, zero retention)
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY");
  },
  get draftModel() {
    return optional("DRAFT_MODEL", "claude-sonnet-5");
  },

  // R2 / S3
  get r2() {
    return {
      accountId: required("R2_ACCOUNT_ID"),
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      bucket: required("R2_BUCKET"),
    };
  },

  // Stripe
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  get stripePrices() {
    return {
      solo: optional("STRIPE_PRICE_SOLO"),
      caseload: optional("STRIPE_PRICE_CASELOAD"),
      group: optional("STRIPE_PRICE_GROUP"),
    };
  },

  // Email (no PHI, ever)
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "SessionScribe <mail@sessionscribe.app>");
  },

  // Policy
  get noteHashSecret() {
    return required("NOTE_HASH_SECRET");
  },
  get retentionDefaultDays() {
    return Number(optional("RETENTION_DEFAULT_DAYS", "30"));
  },
  get dryRun() {
    return optional("DRY_RUN") === "1";
  },
} as const;

/** True when a var is present without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}
