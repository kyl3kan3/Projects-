/**
 * Environment access.
 *
 * Values are read lazily through getters so `next build` — which imports
 * modules without real secrets — never crashes on a missing var. Only the code
 * path that actually needs a secret at runtime throws if it is absent.
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
  /**
   * HMAC secret for QR/sign-link tokens and kiosk session tokens. Falls back to
   * AUTH_SECRET so a minimal local setup works, but they are separate knobs in
   * production: rotating sign tokens should not log every member of staff out.
   */
  get signTokenSecret() {
    return process.env.SIGN_TOKEN_SECRET || required("AUTH_SECRET");
  },
  get appUrl() {
    return optional("APP_URL", "http://localhost:3050").replace(/\/$/, "");
  },
  get cronSecret() {
    return optional("CRON_SECRET");
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
      counter: optional("STRIPE_PRICE_COUNTER"),
      front_desk: optional("STRIPE_PRICE_FRONT_DESK"),
      operator: optional("STRIPE_PRICE_OPERATOR"),
    };
  },

  // --- Email (Resend) ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "WaiverWing <waivers@mail.waiverwing.com>");
  },
  /** DRY_RUN=1 logs emails instead of sending them. */
  get dryRun() {
    return optional("DRY_RUN", "0") === "1";
  },

  // --- S3 (optional: PDFs render on demand when it is not configured) ---
  get s3Bucket() {
    return optional("S3_BUCKET");
  },
  get awsRegion() {
    return optional("AWS_REGION", "us-east-1");
  },
} as const;

/** True when a var is present without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

/** Is object storage configured? When false, PDFs are rendered per request. */
export function s3Configured(): boolean {
  return Boolean(process.env.S3_BUCKET && process.env.AWS_ACCESS_KEY_ID);
}

/** Is Stripe configured? Billing screens degrade to a plain plan list if not. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
