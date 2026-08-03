/**
 * Environment access.
 *
 * Every value is read through a getter so `next build` — which imports modules
 * with no real secrets present — never crashes on a missing var. Only the code
 * path that actually needs a secret throws, and it names the var.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
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
    return optional("APP_URL", optional("NEXT_PUBLIC_APP_URL", "http://localhost:3031"));
  },
  /** Signs the /p/[token] proposal links. One secret deploys fine. */
  get proposalTokenSecret() {
    return optional("PROPOSAL_TOKEN_SECRET") || required("AUTH_SECRET");
  },
  get cronSecret() {
    return optional("CRON_SECRET");
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
      solo: optional("STRIPE_PRICE_SOLO"),
      crew: optional("STRIPE_PRICE_CREW"),
      fleet: optional("STRIPE_PRICE_FLEET"),
    };
  },

  // --- object storage (Cloudflare R2, S3 API) ---
  get r2() {
    return {
      accountId: optional("R2_ACCOUNT_ID"),
      accessKeyId: optional("R2_ACCESS_KEY_ID"),
      secretAccessKey: optional("R2_SECRET_ACCESS_KEY"),
      bucket: optional("R2_BUCKET", "quotefox-media"),
    };
  },
  get localMediaDir() {
    return optional("LOCAL_MEDIA_DIR", ".uploads");
  },

  // --- AI ---
  get openaiApiKey() {
    return optional("OPENAI_API_KEY");
  },
  get transcribeModel() {
    return optional("OPENAI_TRANSCRIBE_MODEL", "whisper-1");
  },
  get draftModel() {
    return optional("OPENAI_DRAFT_MODEL", "gpt-4o");
  },

  // --- email ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "QuoteFox <quotes@quotefox.app>");
  },

  /** DRY_RUN=1 logs outbound email instead of sending it. */
  get dryRun() {
    return optional("DRY_RUN") === "1";
  },
} as const;

/** True when a var is present, without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

/** True on Vercel (or any single-region serverless host). */
export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}
