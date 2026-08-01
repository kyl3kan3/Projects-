/**
 * Environment access through lazy getters, so `next build` — which imports every
 * module without real secrets — never crashes on a missing variable. Only the
 * code path that actually needs a secret throws when it is absent.
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
    return optional("NEXT_PUBLIC_APP_URL", optional("APP_URL", "http://localhost:3000"));
  },
  /** Unset means the cron route refuses to run rather than defaulting to open. */
  get cronSecret() {
    return optional("CRON_SECRET");
  },
  get icsTokenSecret() {
    // Falls back to the session secret so a fresh clone has working feeds; the
    // .env.example still asks for a dedicated value.
    return optional("ICS_TOKEN_SECRET") || required("AUTH_SECRET");
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
      seed: optional("STRIPE_PRICE_SEED"),
      grow: optional("STRIPE_PRICE_GROW"),
      field: optional("STRIPE_PRICE_FIELD"),
    };
  },

  // --- Resend ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "GrantGrid <reminders@mail.grantgrid.org>");
  },
  /** "1" suppresses outbound email and logs the message instead. */
  get dryRun() {
    return optional("DRY_RUN") === "1";
  },

  // --- Funder data ---
  get irs990IndexUrl() {
    return optional("IRS_990_INDEX_URL", "https://apps.irs.gov/pub/epostcard/990/xml");
  },
} as const;

/** True when a var is present, without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}
