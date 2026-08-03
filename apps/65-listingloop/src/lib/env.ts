/**
 * src/lib/env.ts
 *
 * Typed, lazy access to every variable in `.env.example`.
 *
 * Values are read through getters so `next build` — which imports these modules
 * with no secrets present — never crashes. Only the code path that actually
 * needs a secret at runtime throws when it is absent.
 *
 * Two are load-bearing and have no safe default: `SESSION_SECRET` (signs the
 * console session cookie) and `LINK_TOKEN_SECRET` (signs the party portal
 * tokens, which are bearer credentials for reading a stranger's transaction and
 * putting documents into it). A fallback would make either forgeable from the
 * source, so both are required rather than defaulted.
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
    return optional("APP_URL", "http://localhost:3065").replace(/\/$/, "");
  },

  // --- Auth ---
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  /** Signs `/p/[token]` party links. */
  get linkTokenSecret() {
    return required("LINK_TOKEN_SECRET");
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
      desk: optional("STRIPE_PRICE_DESK"),
      office: optional("STRIPE_PRICE_OFFICE"),
    };
  },

  // --- Documents (R2 / S3) ---
  get r2AccountId() {
    return optional("R2_ACCOUNT_ID");
  },
  get r2AccessKeyId() {
    return optional("R2_ACCESS_KEY_ID");
  },
  get r2SecretAccessKey() {
    return optional("R2_SECRET_ACCESS_KEY");
  },
  get r2Bucket() {
    return optional("R2_BUCKET");
  },

  // --- Email (Resend) ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "ListingLoop <files@mail.listingloop.app>");
  },

  // --- Scheduled work ---
  get cronSecret() {
    return optional("CRON_SECRET");
  },

  /** DRY_RUN=1 records reminders in the ledger and logs them instead of sending. */
  get dryRun(): boolean {
    return optional("DRY_RUN", "0") === "1";
  },
} as const;

/** Is object storage configured? Without it, uploads are stored in Postgres. */
export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

/** Is Stripe configured? The billing screen degrades to a plan list if not. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Is a real email provider configured (and not dry-run)? */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) && optional("DRY_RUN", "0") !== "1";
}
