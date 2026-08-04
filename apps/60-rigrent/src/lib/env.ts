/**
 * src/lib/env.ts
 *
 * Typed, lazy access to every environment variable in `.env.example`.
 *
 * Every value sits behind a getter so `next build` — which imports these
 * modules with no secrets present — never throws. Only the code path that
 * actually needs a secret at runtime complains when it is absent.
 *
 * Three variables are enough to boot: DATABASE_URL, SESSION_SECRET and
 * LINK_TOKEN_SECRET. Everything else degrades honestly and the UI says so:
 * with no Stripe key deposit holds are simulated and labelled as simulated;
 * with no R2 credentials condition photos go to the local filesystem; with no
 * Resend key mail is logged instead of sent.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/** True when a variable is present, without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

export const env = {
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },
  /** Optional. Set it and `npm run worker` drains BullMQ; unset, /api/cron/tick does the work. */
  get redisUrl(): string {
    return required("REDIS_URL");
  },
  get appUrl(): string {
    return optional("APP_URL", "http://localhost:3060");
  },
  get sessionSecret(): string {
    return required("SESSION_SECRET");
  },
  /**
   * Signs the customer quote links. Deliberately separate from the session
   * secret: rotating the link secret must not sign every yard hand out.
   */
  get linkTokenSecret(): string {
    return required("LINK_TOKEN_SECRET");
  },

  // --- Stripe: Billing for RigRent's own plans, Connect for deposit holds ---
  get stripeSecretKey(): string {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret(): string {
    return optional("STRIPE_WEBHOOK_SECRET");
  },
  get stripeConnectWebhookSecret(): string {
    return optional("STRIPE_CONNECT_WEBHOOK_SECRET");
  },
  get stripePrices(): { yard: string; fleet: string; pro: string } {
    return {
      yard: optional("STRIPE_PRICE_YARD"),
      fleet: optional("STRIPE_PRICE_FLEET"),
      pro: optional("STRIPE_PRICE_PRO"),
    };
  },

  // --- Condition photos and documents ---
  /** "local" or "s3". Defaults to s3 as soon as R2_ACCESS_KEY_ID is present. */
  get storageDriver(): string {
    const explicit = optional("STORAGE_DRIVER");
    if (explicit) return explicit;
    return has("R2_ACCESS_KEY_ID") ? "s3" : "local";
  },
  get localStorageDir(): string {
    return optional("LOCAL_STORAGE_DIR", ".data/photos");
  },
  get r2(): { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string } {
    return {
      accountId: required("R2_ACCOUNT_ID"),
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      bucket: optional("R2_BUCKET", "rigrent-photos"),
    };
  },

  // --- Email ---
  get resendApiKey(): string {
    return optional("RESEND_API_KEY");
  },
  get emailFrom(): string {
    return optional("EMAIL_FROM", "RigRent <yard@mail.rigrent.app>");
  },

  /**
   * DRY_RUN logs email and simulates card holds instead of calling Stripe. It
   * defaults ON whenever STRIPE_SECRET_KEY is unset, so a local run can never
   * place a hold on a real customer's card.
   */
  get dryRun(): boolean {
    const raw = process.env.DRY_RUN;
    if (raw === undefined || raw === "") return !has("STRIPE_SECRET_KEY");
    return raw === "1" || raw.toLowerCase() === "true";
  },
} as const;
