/**
 * Environment access.
 *
 * Read lazily through getters so `next build` — which imports every module
 * without real secrets — never crashes on a missing variable. Only the code
 * path that actually needs a secret throws, and only when it runs.
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
  /** Public origin. QR codes and printed table tents encode this, so it must be real. */
  get appUrl() {
    return optional("APP_URL", optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000")).replace(
      /\/+$/,
      "",
    );
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
      menu: optional("STRIPE_PRICE_MENU"),
      kitchen: optional("STRIPE_PRICE_KITCHEN"),
      margin: optional("STRIPE_PRICE_MARGIN"),
    };
  },

  // --- Photo storage (Cloudflare R2, S3-compatible) ---
  get r2() {
    return {
      accountId: optional("R2_ACCOUNT_ID"),
      accessKeyId: optional("R2_ACCESS_KEY_ID"),
      secretAccessKey: optional("R2_SECRET_ACCESS_KEY"),
      bucket: optional("R2_BUCKET"),
      publicBase: optional("R2_PUBLIC_BASE").replace(/\/+$/, ""),
    };
  },

  // --- Photo enhancement ---
  get replicateApiToken() {
    return optional("REPLICATE_API_TOKEN");
  },
  /** Pinned model version for the relight pass. Never "latest". */
  get replicateModel() {
    return optional("REPLICATE_RELIGHT_MODEL", "");
  },

  // --- Email ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "MenuLift <reports@menulift.app>");
  },

  /** Cron protection. A missing secret means the cron route refuses to run. */
  get cronSecret() {
    return optional("CRON_SECRET");
  },

  /** "1" disables outbound email and enhancement API calls. */
  get dryRun() {
    return optional("DRY_RUN") === "1";
  },
} as const;

export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

/** True when running on Vercel (or any single-region serverless host). */
export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}
