/**
 * src/lib/env.ts — typed, lazy access to every variable in .env.example.
 *
 * Every value sits behind a getter, so importing a module during `next build`
 * (which has no secrets) neither throws nor opens a socket. Only the request
 * path that genuinely needs a secret fails when it is missing, and it fails
 * with the variable's name in the message.
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
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },
  /** Empty string means "this deployment has no queue" — see lib/runtime.ts. */
  get redisUrl(): string {
    return optional("REDIS_URL");
  },
  get appUrl(): string {
    return optional("APP_URL", "http://localhost:3069").replace(/\/$/, "");
  },
  get sessionSecret(): string {
    return required("SESSION_SECRET");
  },
  /**
   * Separate from SESSION_SECRET on purpose. Tenant links travel through SMS and
   * email and get forwarded; rotating them must not log every owner out.
   */
  get linkTokenSecret(): string {
    return optional("LINK_TOKEN_SECRET") || required("SESSION_SECRET");
  },

  // --- Stripe: Connect (Standard) for rent, Billing for UnitKeeper itself ---
  get stripeSecretKey(): string {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret(): string {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  get stripeConnectWebhookSecret(): string {
    return optional("STRIPE_CONNECT_WEBHOOK_SECRET");
  },
  get stripePrices(): { keeper: string; yard: string; depot: string } {
    return {
      keeper: optional("STRIPE_PRICE_KEEPER"),
      yard: optional("STRIPE_PRICE_YARD"),
      depot: optional("STRIPE_PRICE_DEPOT"),
    };
  },

  // --- Documents: R2 (S3 API) in production, local filesystem otherwise ---
  /** "local" or "s3". Defaults to s3 once R2 credentials are present. */
  get storageDriver(): string {
    const explicit = process.env.STORAGE_DRIVER;
    if (explicit) return explicit;
    return process.env.R2_ACCESS_KEY_ID ? "s3" : "local";
  },
  get localStorageDir(): string {
    return optional("LOCAL_STORAGE_DIR", ".data/documents");
  },
  get r2(): {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  } {
    return {
      accountId: required("R2_ACCOUNT_ID"),
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      bucket: required("R2_BUCKET"),
    };
  },

  // --- Email ---
  get resendApiKey(): string {
    return optional("RESEND_API_KEY");
  },
  get emailFrom(): string {
    return optional("EMAIL_FROM", "UnitKeeper <office@mail.unitkeeper.app>");
  },

  /**
   * DRY_RUN=1 logs outbound email and rent charges instead of performing them.
   * It defaults ON whenever no Stripe key is configured, so a local run can
   * never charge a real card or mail a real tenant.
   */
  get dryRun(): boolean {
    const explicit = process.env.DRY_RUN;
    if (explicit != null) return explicit === "1" || explicit === "true";
    return !process.env.STRIPE_SECRET_KEY;
  },
} as const;

/** True when a var is present, without throwing — for feature gating in the UI. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}
