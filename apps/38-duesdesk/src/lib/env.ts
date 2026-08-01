/**
 * Environment access.
 *
 * Every value is read through a getter so `next build` — which imports modules
 * without real secrets — never crashes on a missing var. Only the code path
 * that actually needs a secret throws, and it throws with the var's name.
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
  get appUrl() {
    return optional("APP_URL", "http://localhost:3038").replace(/\/$/, "");
  },
  get authSecret() {
    return required("AUTH_SECRET");
  },
  /** Separate secret from the session cookie: portal links live in inboxes. */
  get portalTokenSecret() {
    return required("PORTAL_TOKEN_SECRET");
  },

  // --- Stripe ---
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return optional("STRIPE_WEBHOOK_SECRET");
  },
  get stripeConnectWebhookSecret() {
    return optional("STRIPE_CONNECT_WEBHOOK_SECRET");
  },
  get stripePrices() {
    return {
      block: optional("STRIPE_PRICE_BLOCK"),
      neighborhood: optional("STRIPE_PRICE_NEIGHBORHOOD"),
      community: optional("STRIPE_PRICE_COMMUNITY"),
    };
  },

  // --- Object storage ---
  get r2() {
    return {
      accountId: optional("R2_ACCOUNT_ID"),
      accessKeyId: optional("R2_ACCESS_KEY_ID"),
      secretAccessKey: optional("R2_SECRET_ACCESS_KEY"),
      bucket: optional("R2_BUCKET"),
    };
  },
  /** Where the local storage adapter writes when R2 is not configured. */
  get localStorageDir() {
    return optional("LOCAL_STORAGE_DIR", ".data/uploads");
  },

  // --- Email / SMS ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "DuesDesk <mail@duesdesk.com>");
  },
  get twilio() {
    return {
      accountSid: optional("TWILIO_ACCOUNT_SID"),
      authToken: optional("TWILIO_AUTH_TOKEN"),
      from: optional("TWILIO_FROM_NUMBER"),
    };
  },

  /**
   * DRY_RUN logs outbound email/SMS and refuses real Stripe charges. Defaults
   * to ON: an association's real member contacts are frequently imported into a
   * dev database, and a stray send to 63 neighbours is unrecoverable.
   */
  get dryRun() {
    return optional("DRY_RUN", "1") !== "0";
  },
} as const;

export function has(name: string): boolean {
  return Boolean(process.env[name]);
}
