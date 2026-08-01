/**
 * Environment access.
 *
 * Values are read lazily through getters so `next build` (which imports modules
 * without real secrets) never crashes on a missing var — only the code path that
 * actually needs a secret at runtime throws if it is absent.
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
   * Portal links are signed with their own key: rotating it revokes every
   * outstanding bid link without touching estimator sessions. Falls back to
   * AUTH_SECRET so a single-secret deployment still works.
   */
  get portalTokenSecret() {
    return process.env.PORTAL_TOKEN_SECRET || required("AUTH_SECRET");
  },
  get appUrl() {
    return optional("APP_URL", "http://localhost:3036").replace(/\/+$/, "");
  },

  /* --- plans and attachments ---------------------------------------------- */
  /**
   * ARCHITECTURE.md calls for R2 with signed PUT/GET. The adapter interface is
   * the same either way (src/lib/storage.ts); "db" keeps blobs in Postgres and
   * is the driver that runs with no cloud credentials — including on Vercel,
   * whose filesystem is read-only.
   */
  get storageDriver(): "db" | "r2" {
    return optional("STORAGE_DRIVER", "db") === "r2" ? "r2" : "db";
  },
  get r2() {
    return {
      accountId: optional("R2_ACCOUNT_ID"),
      accessKeyId: optional("R2_ACCESS_KEY_ID"),
      secretAccessKey: optional("R2_SECRET_ACCESS_KEY"),
      bucket: optional("R2_BUCKET"),
    };
  },
  /** Per-upload ceiling. Plan sets are large; the db driver is not for 200 MB. */
  get maxUploadBytes() {
    const n = Number(optional("MAX_UPLOAD_BYTES", ""));
    return Number.isFinite(n) && n > 0 ? n : 12 * 1024 * 1024;
  },

  /* --- email --------------------------------------------------------------- */
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "BidBoard <invites@bidboard.build>");
  },
  get resendWebhookSecret() {
    return optional("RESEND_WEBHOOK_SECRET");
  },
  /** "1" logs outbound mail instead of sending it — the default in dev. */
  get dryRun() {
    return optional("DRY_RUN", "") === "1";
  },

  /* --- Stripe -------------------------------------------------------------- */
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  get stripePrices() {
    return {
      crew: optional("STRIPE_PRICE_CREW"),
      builder: optional("STRIPE_PRICE_BUILDER"),
      precon: optional("STRIPE_PRICE_PRECON"),
    };
  },

  /* --- scheduled work ------------------------------------------------------ */
  get cronSecret() {
    return optional("CRON_SECRET");
  },
} as const;

/** True when a var is present, without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}
