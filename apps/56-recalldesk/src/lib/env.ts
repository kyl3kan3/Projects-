/**
 * src/lib/env.ts
 *
 * Typed, lazy access to every variable in `.env.example`.
 *
 * Values are read through getters so `next build` — which imports these modules
 * with no secrets present — never crashes. Only the code path that actually needs
 * a secret at runtime throws when it is absent.
 *
 * Two have no safe default: `SESSION_SECRET` (signs the staff session cookie) and
 * `BOOKING_TOKEN_SECRET` (signs the per-patient booking links, which are bearer
 * credentials into a patient's own record). A fallback would make either
 * forgeable from the source.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function positiveInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get appUrl() {
    return (
      optional("APP_URL") ||
      optional("NEXT_PUBLIC_APP_URL", "http://localhost:3056")
    ).replace(/\/$/, "");
  },

  // --- Auth ---
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  /** HMAC key for `/book/[token]` and `/stop/[token]` patient links. */
  get bookingTokenSecret() {
    return required("BOOKING_TOKEN_SECRET");
  },

  // --- Object storage (Cloudflare R2, S3 API) ---
  get r2() {
    return {
      accountId: optional("R2_ACCOUNT_ID"),
      accessKeyId: optional("R2_ACCESS_KEY_ID"),
      secretAccessKey: optional("R2_SECRET_ACCESS_KEY"),
      bucket: optional("R2_BUCKET"),
    };
  },

  // --- Email (Resend) ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get resendWebhookSecret() {
    return optional("RESEND_WEBHOOK_SECRET");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "RecallDesk <mail@recalldesk.app>");
  },

  // --- SMS (Twilio) ---
  get twilio() {
    return {
      accountSid: optional("TWILIO_ACCOUNT_SID"),
      authToken: optional("TWILIO_AUTH_TOKEN"),
      fromNumber: optional("TWILIO_FROM_NUMBER"),
    };
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
      chairside: optional("STRIPE_PRICE_CHAIRSIDE"),
      recall_engine: optional("STRIPE_PRICE_RECALL_ENGINE"),
      group: optional("STRIPE_PRICE_GROUP"),
    };
  },

  // --- Scheduled work ---
  get cronSecret() {
    return optional("CRON_SECRET");
  },

  // --- Policy defaults (per-practice settings override these) ---
  get attributionWindowDays() {
    return positiveInt("ATTRIBUTION_WINDOW_DAYS", 30);
  },
  get defaultVisitValueCents() {
    return positiveInt("DEFAULT_VISIT_VALUE_CENTS", 30_000);
  },

  /** DRY_RUN=1 logs outbound email/SMS instead of sending it. */
  get dryRun(): boolean {
    return optional("DRY_RUN", "0") === "1";
  },
} as const;

export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

/** Is object storage configured? If not, CSV bytes live in Postgres. */
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

/** Is a real email sender configured (and not dry-run)? */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) && !env.dryRun;
}

/** Is a real SMS sender configured (and not dry-run)? */
export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      !env.dryRun,
  );
}
