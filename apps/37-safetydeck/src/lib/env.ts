/**
 * Environment access.
 *
 * Values are read lazily through getters so `next build` — which imports every
 * module without real secrets — never crashes on a missing var. Only the code
 * path that actually needs a secret at runtime throws if it is absent.
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
  /** Public base URL. Crew links are built from this, so it must be reachable. */
  get appUrl() {
    return optional("APP_URL", optional("NEXT_PUBLIC_APP_URL", "http://localhost:3037"));
  },
  /**
   * Signing key for crew links. Kept separate from AUTH_SECRET on purpose: a
   * crew token travels by SMS to a phone that is not ours, and rotating it must
   * not sign every office user out.
   */
  get crewTokenSecret() {
    return optional("CREW_TOKEN_SECRET") || required("AUTH_SECRET");
  },
  get cronSecret() {
    return optional("CRON_SECRET");
  },

  // --- object storage (Cloudflare R2, S3 API) ---
  get r2() {
    return {
      accountId: optional("R2_ACCOUNT_ID"),
      accessKeyId: optional("R2_ACCESS_KEY_ID"),
      secretAccessKey: optional("R2_SECRET_ACCESS_KEY"),
      bucket: optional("R2_BUCKET"),
    };
  },

  // --- messaging ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "SafetyDeck <alerts@safetydeck.co>");
  },
  get twilio() {
    return {
      accountSid: optional("TWILIO_ACCOUNT_SID"),
      authToken: optional("TWILIO_AUTH_TOKEN"),
      fromNumber: optional("TWILIO_FROM_NUMBER"),
    };
  },
  /**
   * Log outbound SMS/email instead of sending. Defaults to ON when no provider
   * credential is configured — a dev environment must never be one typo away
   * from texting a real foreman.
   */
  get dryRun() {
    const explicit = process.env.DRY_RUN;
    if (explicit === "0" || explicit === "false") return false;
    if (explicit) return true;
    return !process.env.RESEND_API_KEY && !process.env.TWILIO_ACCOUNT_SID;
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
      crew: optional("STRIPE_PRICE_CREW"),
      company: optional("STRIPE_PRICE_COMPANY"),
      fleet: optional("STRIPE_PRICE_FLEET"),
    };
  },
} as const;

/** True when a var is present, without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}
