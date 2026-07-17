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

  // Stripe (platform + connect)
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  get stripeConnectWebhookSecret() {
    return required("STRIPE_CONNECT_WEBHOOK_SECRET");
  },
  get stripePrices() {
    return {
      dojo: optional("STRIPE_PRICE_DOJO"),
      academy: optional("STRIPE_PRICE_ACADEMY"),
      federation: optional("STRIPE_PRICE_FEDERATION"),
    };
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
    return optional("RESEND_WEBHOOK_SECRET");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "MatPass <mail@matpass.app>");
  },

  // Kiosk + retention policy
  get kioskTokenSecret() {
    return required("KIOSK_TOKEN_SECRET");
  },
  get retentionBaselineFraction() {
    return Number(optional("RETENTION_BASELINE_FRACTION", "0.4"));
  },
  get retentionMinDaysAbsent() {
    return Number(optional("RETENTION_MIN_DAYS_ABSENT", "10"));
  },
  get dryRun() {
    return optional("DRY_RUN") === "1";
  },
} as const;

/** True when a var is present without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}
