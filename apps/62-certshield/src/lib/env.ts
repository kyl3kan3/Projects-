/**
 * src/lib/env.ts
 *
 * Typed, lazy access to every variable in `.env.example`.
 *
 * Values are read through getters so `next build` — which imports these modules
 * with no secrets present — never crashes. Only the code path that actually needs
 * a secret at runtime throws when it is absent.
 *
 * Two are load-bearing and have no safe default: `SESSION_SECRET` (signs the
 * office session cookie) and `LINK_TOKEN_SECRET` (HMACs the vendor upload-link
 * tokens, which are bearer credentials for putting evidence into a compliance
 * file). A fallback would make either forgeable from the source.
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
    return optional("APP_URL", "http://localhost:3062").replace(/\/$/, "");
  },

  // --- Auth ---
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  /** HMAC key for `/v/[token]` upload links. */
  get linkTokenSecret() {
    return required("LINK_TOKEN_SECRET");
  },

  // --- Parsing (Claude) ---
  get anthropicApiKey() {
    return optional("ANTHROPIC_API_KEY");
  },
  get parseModel() {
    return optional("PARSE_MODEL", "claude-sonnet-5");
  },
  /**
   * Per-field confidence floor. Any field below it sends the certificate to
   * `needs_review` instead of into compliance.
   */
  get reviewThreshold(): number {
    const n = Number(optional("PARSE_REVIEW_THRESHOLD", "80"));
    return Number.isFinite(n) && n > 0 && n <= 100 ? n : 80;
  },

  // --- Certificates (R2 / S3) ---
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

  // --- Stripe ---
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  get stripePrices() {
    return {
      ledger: optional("STRIPE_PRICE_LEDGER"),
      portfolio: optional("STRIPE_PRICE_PORTFOLIO"),
      enterprise: optional("STRIPE_PRICE_ENTERPRISE"),
    };
  },

  // --- Email (Resend) ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "CertShield <compliance@mail.certshield.app>");
  },
  /** Shared secret on the inbound-certificate webhook. */
  get inboundParseSecret() {
    return optional("INBOUND_PARSE_SECRET");
  },

  // --- Scheduled work ---
  get cronSecret() {
    return optional("CRON_SECRET");
  },

  /** DRY_RUN=1 logs outbound email instead of sending it. */
  get dryRun(): boolean {
    return optional("DRY_RUN", "0") === "1";
  },
} as const;

export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

/**
 * Is object storage configured? When it is not, certificate PDFs are stored as
 * bytes in Postgres (`certificate_blobs`) — the file has to land somewhere
 * durable even in a bare deployment, because a bounced upload is the exact
 * failure this product exists to remove.
 */
export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

/** Is a live model available for ACORD extraction? */
export function modelConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Is Stripe configured? The billing screen degrades to a plan list if not. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Is a real email provider configured (and not dry-run)? */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) && optional("DRY_RUN", "0") !== "1";
}
