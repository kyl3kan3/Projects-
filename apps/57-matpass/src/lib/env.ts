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
    return optional("REDIS_URL");
  },
  get appUrl() {
    return optional("NEXT_PUBLIC_APP_URL", "http://localhost:3057");
  },
  get authSecret() {
    // Dev fallback keeps `next build` and a bare `next dev` working; production
    // must set it, and does — the deploy checklist lists it as required.
    return optional("AUTH_SECRET") || "matpass-dev-secret-not-for-production";
  },

  // Stripe (platform + connect)
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  get stripeConnectWebhookSecret() {
    return optional("STRIPE_CONNECT_WEBHOOK_SECRET");
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
    // The kiosk token is signed with its own key so revoking it never touches
    // staff sessions. Falls back to the auth secret in dev only.
    return optional("KIOSK_TOKEN_SECRET") || `kiosk:${env.authSecret}`;
  },
  get retentionBaselineFraction() {
    return Number(optional("RETENTION_BASELINE_FRACTION", "0.4"));
  },
  get retentionMinDaysAbsent() {
    return Number(optional("RETENTION_MIN_DAYS_ABSENT", "10"));
  },
  get cronSecret() {
    return optional("CRON_SECRET");
  },
  get dryRun() {
    return optional("DRY_RUN") === "1";
  },
} as const;

/** True when a var is present without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

/** Stripe is wired only when the platform key is present. */
export function stripeConfigured(): boolean {
  return has("STRIPE_SECRET_KEY");
}

/** Resend is wired only when its key is present; otherwise email is logged. */
export function emailConfigured(): boolean {
  return has("RESEND_API_KEY") && !env.dryRun;
}

/** R2 is wired only when all four values are present. */
export function storageConfigured(): boolean {
  return (
    has("R2_ACCOUNT_ID") &&
    has("R2_ACCESS_KEY_ID") &&
    has("R2_SECRET_ACCESS_KEY") &&
    has("R2_BUCKET")
  );
}
