/**
 * Environment access.
 *
 * Values are read lazily through getters so `next build` — which imports every
 * module without real secrets — never crashes on a missing var. Only the code
 * path that actually needs a secret at runtime throws if it is absent.
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
  /** Session + API-token signing secret. */
  get jwtSecret() {
    return required("JWT_SECRET");
  },
  get appUrl() {
    return optional("APP_URL", "http://localhost:3042").replace(/\/$/, "");
  },
  /** Where the CLI points by default. Same origin as the dashboard on Vercel. */
  get apiUrl() {
    return optional("API_URL", optional("APP_URL", "http://localhost:3042")).replace(/\/$/, "");
  },

  // --- Slack ---
  /** Incoming-webhook URL used as the org default when no per-API URL is set. */
  get slackWebhookUrl() {
    return optional("SLACK_WEBHOOK_URL");
  },

  // --- GitHub ---
  get githubToken() {
    return optional("GITHUB_TOKEN");
  },
  get githubWebhookSecret() {
    return optional("GITHUB_WEBHOOK_SECRET");
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
      solo: optional("STRIPE_PRICE_SOLO_MONTHLY"),
      team: optional("STRIPE_PRICE_TEAM_MONTHLY"),
      platform: optional("STRIPE_PRICE_PLATFORM_MONTHLY"),
    };
  },

  // --- Email ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "SchemaSentry <notify@schemasentry.dev>");
  },

  // --- Cron ---
  get cronSecret() {
    return optional("CRON_SECRET");
  },
} as const;

/** True when a var is present, without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}
