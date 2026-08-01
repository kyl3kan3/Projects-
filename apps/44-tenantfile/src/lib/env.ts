/**
 * Environment access.
 *
 * Every value is behind a getter so importing a module during `next build`
 * (which has no secrets) never throws. Only the code path that genuinely needs
 * a secret at request time fails when it is missing.
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
   * Signs the tokens in tenant pay-page, applicant, and lease-signing links.
   * Deliberately separate from AUTH_SECRET: rotating link tokens (which travel
   * through SMS and email, and get forwarded) must not log every landlord out.
   */
  get linkTokenSecret() {
    return optional("LINK_TOKEN_SECRET") || required("AUTH_SECRET");
  },
  get appUrl() {
    return optional("APP_URL", "http://localhost:3044").replace(/\/$/, "");
  },

  // --- storage ---
  /** "local" (filesystem, the only adapter implemented) or "s3". */
  get storageDriver() {
    return optional("STORAGE_DRIVER", "local");
  },
  get localStorageDir() {
    return optional("LOCAL_STORAGE_DIR", ".data/uploads");
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
      keys: optional("STRIPE_PRICE_KEYS"),
      building: optional("STRIPE_PRICE_BUILDING"),
      portfolio: optional("STRIPE_PRICE_PORTFOLIO"),
    };
  },

  // --- notifications ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "TenantFile <notifications@tenantfile.app>");
  },
  get twilio() {
    return {
      accountSid: optional("TWILIO_ACCOUNT_SID"),
      authToken: optional("TWILIO_AUTH_TOKEN"),
      from: optional("TWILIO_FROM_NUMBER"),
    };
  },
  /**
   * DRY_RUN=1 logs outbound email/SMS instead of sending. On by default when no
   * provider key is configured, so a local run can never text a real tenant.
   */
  get dryRun() {
    const explicit = process.env.DRY_RUN;
    if (explicit != null) return explicit === "1" || explicit === "true";
    return !process.env.RESEND_API_KEY;
  },
} as const;

/** True when a var is present, without throwing — for feature gating in the UI. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}
