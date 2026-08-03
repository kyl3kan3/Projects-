/**
 * Environment access.
 *
 * Read lazily through getters so `next build` — which imports every module
 * without real secrets — never crashes on a missing var. Only the code path that
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
  get appUrl() {
    return optional("APP_URL", optional("NEXT_PUBLIC_APP_URL", "http://localhost:3035"));
  },

  // --- object storage ---
  get r2() {
    return {
      accountId: optional("R2_ACCOUNT_ID"),
      accessKeyId: optional("R2_ACCESS_KEY_ID"),
      secretAccessKey: optional("R2_SECRET_ACCESS_KEY"),
      bucket: optional("R2_BUCKET"),
    };
  },
  /** Where the filesystem storage driver keeps objects when R2 is not configured. */
  get localStorageDir() {
    return optional("LOCAL_STORAGE_DIR", ".data/objects");
  },

  // --- extraction ---
  get anthropicApiKey() {
    return optional("ANTHROPIC_API_KEY");
  },
  get extractionModel() {
    return optional("EXTRACTION_MODEL", "claude-haiku-4-5-20251001");
  },
  get extractionEscalationModel() {
    return optional("EXTRACTION_ESCALATION_MODEL", "claude-sonnet-5");
  },

  // --- email ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get resendWebhookSecret() {
    return optional("RESEND_WEBHOOK_SECRET");
  },
  get inboundEmailDomain() {
    return optional("INBOUND_EMAIL_DOMAIN", "in.ledgerlens.app");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "LedgerLens <mail@ledgerlens.app>");
  },

  // --- Stripe ---
  get stripeSecretKey() {
    return optional("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return optional("STRIPE_WEBHOOK_SECRET");
  },
  get stripePrices() {
    return {
      solo: optional("STRIPE_PRICE_SOLO"),
      operator: optional("STRIPE_PRICE_OPERATOR"),
      pro: optional("STRIPE_PRICE_PRO"),
    };
  },

  // --- signed links ---
  /**
   * Signs accountant share tokens *and* the short-lived document URLs. Falls back
   * to AUTH_SECRET so a local checkout works from one generated secret, but the
   * two are separate vars in production because share links outlive sessions.
   */
  get shareTokenSecret() {
    return optional("SHARE_TOKEN_SECRET") || required("AUTH_SECRET");
  },

  get cronSecret() {
    return optional("CRON_SECRET");
  },

  /** Log instead of sending email / reporting usage to Stripe. */
  get dryRun() {
    return optional("DRY_RUN") === "1";
  },
} as const;

export function has(name: string): boolean {
  return Boolean(process.env[name]);
}
