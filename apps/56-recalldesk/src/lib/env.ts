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

  // R2 / S3
  get r2() {
    return {
      accountId: required("R2_ACCOUNT_ID"),
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      bucket: required("R2_BUCKET"),
    };
  },

  // Email
  get resendApiKey() {
    return required("RESEND_API_KEY");
  },
  get resendWebhookSecret() {
    return required("RESEND_WEBHOOK_SECRET");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "RecallDesk <mail@recalldesk.app>");
  },

  // SMS
  get twilio() {
    return {
      accountSid: required("TWILIO_ACCOUNT_SID"),
      authToken: required("TWILIO_AUTH_TOKEN"),
      fromNumber: required("TWILIO_FROM_NUMBER"),
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
      chairside: optional("STRIPE_PRICE_CHAIRSIDE"),
      recallEngine: optional("STRIPE_PRICE_RECALL_ENGINE"),
      group: optional("STRIPE_PRICE_GROUP"),
    };
  },

  // Policy
  get bookingTokenSecret() {
    return required("BOOKING_TOKEN_SECRET");
  },
  get attributionWindowDays() {
    return Number(optional("ATTRIBUTION_WINDOW_DAYS", "30"));
  },
  get defaultVisitValueCents() {
    return Number(optional("DEFAULT_VISIT_VALUE_CENTS", "30000"));
  },
  get dryRun() {
    return optional("DRY_RUN") === "1";
  },
} as const;

/** True when a var is present without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}
