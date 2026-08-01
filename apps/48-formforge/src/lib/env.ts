/**
 * src/lib/env.ts
 *
 * Environment access. Values are read lazily through getters so `next build` —
 * which imports modules without real secrets — never crashes on a missing var.
 * Only the code path that actually needs a secret at runtime throws if it is
 * absent.
 *
 * Two of these are load-bearing for PHI and have no safe default, on purpose:
 * `FIELD_ENCRYPTION_MASTER_KEY` (wraps every practice's data key) and
 * `INTAKE_TOKEN_SECRET` (HMACs patient link tokens and the patient blind index).
 * A fallback would silently make ciphertext readable by anyone with the source.
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
  /** Wraps each practice's AES-256 data key. 64 hex chars. */
  get masterKey() {
    return required("FIELD_ENCRYPTION_MASTER_KEY");
  },
  /** HMAC key for intake link tokens and the patient name blind index. */
  get intakeTokenSecret() {
    return required("INTAKE_TOKEN_SECRET");
  },
  get appUrl() {
    return optional("APP_URL", "http://localhost:3048").replace(/\/$/, "");
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
      solo: optional("STRIPE_PRICE_SOLO"),
      group: optional("STRIPE_PRICE_GROUP"),
      clinic: optional("STRIPE_PRICE_CLINIC"),
    };
  },

  // --- Email (Resend) ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "FormForge <intake@mail.formforge.health>");
  },

  // --- SMS (Twilio) ---
  get twilioAccountSid() {
    return optional("TWILIO_ACCOUNT_SID");
  },
  get twilioAuthToken() {
    return optional("TWILIO_AUTH_TOKEN");
  },
  get twilioFrom() {
    return optional("TWILIO_FROM_NUMBER");
  },

  // --- Object storage (optional; uploads stay encrypted in Postgres if unset) ---
  get s3Bucket() {
    return optional("S3_BUCKET");
  },
  get awsRegion() {
    return optional("AWS_REGION", "us-east-1");
  },

  /** DRY_RUN=1 logs outbound email/SMS instead of sending it. */
  get dryRun() {
    return optional("DRY_RUN", "0") === "1";
  },
} as const;

export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

/** Is object storage configured? When false, uploads live encrypted in Postgres. */
export function s3Configured(): boolean {
  return Boolean(process.env.S3_BUCKET && process.env.AWS_ACCESS_KEY_ID);
}

/** Is Stripe configured? The billing screen degrades to a plan list if not. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Is a real email provider configured (and not dry-run)? */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) && optional("DRY_RUN", "0") !== "1";
}

/** Is SMS configured (and not dry-run)? */
export function smsConfigured(): boolean {
  return (
    Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) &&
    optional("DRY_RUN", "0") !== "1"
  );
}
