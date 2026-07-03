/**
 * Environment access.
 *
 * Values are read lazily through getters so that `next build` (which imports
 * modules without real secrets) never crashes on a missing var — only the code
 * path that actually needs a secret at runtime will throw if it's absent.
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
  get redisUrl() {
    return required("REDIS_URL");
  },
  get authSecret() {
    return required("AUTH_SECRET");
  },
  get appUrl() {
    return optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  },

  // Anthropic
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY");
  },
  get selectionModel() {
    return optional("CLIPFORGE_MODEL", "claude-sonnet-5");
  },

  // OpenAI (Whisper)
  get openaiApiKey() {
    return required("OPENAI_API_KEY");
  },

  // R2 / S3
  get r2() {
    return {
      endpoint: required("R2_ENDPOINT"),
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      bucket: required("R2_BUCKET"),
      publicBaseUrl: optional("R2_PUBLIC_BASE_URL"),
    };
  },

  // Stripe
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  get stripePrices() {
    return {
      starter: optional("STRIPE_PRICE_STARTER"),
      pro: optional("STRIPE_PRICE_PRO"),
      team: optional("STRIPE_PRICE_TEAM"),
      overage: optional("STRIPE_PRICE_OVERAGE"),
    };
  },

  // Resend
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "ClipForge <noreply@clipforge.app>");
  },
} as const;

/** True when a var is present without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}
